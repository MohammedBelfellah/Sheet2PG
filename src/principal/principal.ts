import { app as application, BrowserWindow as Fenetre, dialog as dialogue, ipcMain as communication, session as sessionElectron } from 'electron'
import { writeFile as ecrireFichier } from 'node:fs/promises'
import { join as joindreChemin } from 'node:path'
import { z as validation } from 'zod'
import type { PlanImportation, ProblemeImportation } from '../partage/modeles.js'
import { connecterBase, deconnecterBase, decrireTable, fermerToutesConnexions, listerTables } from './service-base.js'
import { inspecterFichier } from './service-fichiers.js'
import { annulerTravail, demarrerImportation, validerPlan } from './service-importation.js'

const estDeveloppement = Boolean(process.env.ADRESSE_DEVELOPPEMENT)
let fenetrePrincipale: InstanceType<typeof Fenetre> | null = null

const schemaOptionsInspection = validation.object({
  idSource: validation.string().uuid().optional(),
  cheminDepose: validation.string().max(4096).optional(),
  feuille: validation.string().max(255).optional(),
  modeEntete: validation.enum(['automatique', 'ligne', 'sans_entete']).optional(),
  ligneEntete: validation.number().int().min(1).max(1_048_576).optional(),
  separateur: validation.enum([',', ';', '\t']).optional(),
  encodage: validation.enum(['utf8', 'windows-1252', 'latin1']).optional()
})

const schemaConnexion = validation.object({
  emplacement: validation.enum(['local', 'distant']),
  hote: validation.string().min(1).max(255),
  port: validation.number().int().min(1).max(65535),
  base: validation.string().min(1).max(255),
  utilisateur: validation.string().min(1).max(255),
  motDePasse: validation.string().max(4096),
  delaiSecondes: validation.number().int().min(1).max(120),
  ssl: validation.enum(['desactive', 'verifie']),
  certificatAutorite: validation.string().max(100_000).optional()
})

function verifierEmetteur(evenement: Electron.IpcMainInvokeEvent): void {
  const adresse = evenement.senderFrame?.url ?? ''
  const autorisee = estDeveloppement
    ? adresse.startsWith(process.env.ADRESSE_DEVELOPPEMENT!)
    : adresse.startsWith('file://')
  if (!autorisee || evenement.sender !== fenetrePrincipale?.webContents) throw new Error('Émetteur IPC non autorisé.')
}

function verifierPlan(valeur: unknown): PlanImportation {
  const schema = validation.object({
    idSource: validation.string().uuid(), empreinteSource: validation.string().length(64), feuille: validation.string().min(1),
    modeEntete: validation.enum(['automatique', 'ligne', 'sans_entete']), ligneEntete: validation.number().int().nullable(),
    colonnesSource: validation.array(validation.string()), idConnexion: validation.string().uuid(),
    modeDestination: validation.enum(['existante', 'nouvelle']), schema: validation.string().min(1).max(255), table: validation.string().min(1).max(255),
    empreinteTable: validation.string().length(64).optional(),
    correspondances: validation.array(validation.object({
      idSource: validation.string(), incluse: validation.boolean(), destination: validation.string().max(255), typeCible: validation.string().max(255),
      regles: validation.object({ ordreDate: validation.enum(['jour_mois_annee', 'mois_jour_annee', 'annee_mois_jour']).optional(), separateurDecimal: validation.enum(['point', 'virgule']).optional(), blancs: validation.enum(['nul', 'chaine_vide']).optional(), fuseauSource: validation.string().max(32).optional() })
    })).max(16_384),
    doublons: validation.object({ mode: validation.enum(['ligne_exacte', 'cles']), colonnesCles: validation.array(validation.string().max(255)) })
  })
  return schema.parse(valeur) as PlanImportation
}

function echapperCsv(valeur: unknown): string {
  let texte = String(valeur ?? '')
  if (/^[=+\-@]/.test(texte)) texte = `'${texte}`
  return `"${texte.replaceAll('"', '""')}"`
}

function installerCommunication(): void {
  communication.handle('source:choisir', async (evenement) => {
    verifierEmetteur(evenement)
    const choix = await dialogue.showOpenDialog(fenetrePrincipale!, { properties: ['openFile'], filters: [{ name: 'Feuilles de données', extensions: ['csv', 'xlsx', 'xls'] }] })
    if (choix.canceled || !choix.filePaths[0]) return null
    return inspecterFichier(choix.filePaths[0], {})
  })
  communication.handle('source:inspecter', async (evenement, donnees) => {
    verifierEmetteur(evenement)
    const options = schemaOptionsInspection.parse(donnees)
    return inspecterFichier(options.cheminDepose, options)
  })
  communication.handle('base:connecter', async (evenement, donnees) => {
    verifierEmetteur(evenement)
    return connecterBase(schemaConnexion.parse(donnees))
  })
  communication.handle('base:deconnecter', async (evenement, id) => { verifierEmetteur(evenement); await deconnecterBase(validation.string().uuid().parse(id)) })
  communication.handle('base:tables', async (evenement, id, schema) => { verifierEmetteur(evenement); return listerTables(validation.string().uuid().parse(id), validation.string().max(255).parse(schema)) })
  communication.handle('base:decrire', async (evenement, id, schema, table) => { verifierEmetteur(evenement); return decrireTable(validation.string().uuid().parse(id), validation.string().max(255).parse(schema), validation.string().max(255).parse(table)) })
  communication.handle('importation:valider', async (evenement, donnees) => { verifierEmetteur(evenement); return validerPlan(verifierPlan(donnees)) })
  communication.handle('importation:demarrer', async (evenement, donnees) => {
    verifierEmetteur(evenement)
    const plan = verifierPlan(donnees)
    const idTravail = demarrerImportation(
      plan,
      (progression) => fenetrePrincipale?.webContents.send('travail:progression', progression),
      (id, resultat) => fenetrePrincipale?.webContents.send('travail:resultat', { idTravail: id, resultat })
    )
    return { idTravail }
  })
  communication.handle('importation:annuler', async (evenement, id) => { verifierEmetteur(evenement); return annulerTravail(validation.string().uuid().parse(id)) })
  communication.handle('rapport:exporter', async (evenement, donnees) => {
    verifierEmetteur(evenement)
    const problemes = validation.array(validation.object({
      code: validation.string(), gravite: validation.enum(['erreur', 'avertissement', 'information']), message: validation.string(),
      enregistrement: validation.number().optional(), colonne: validation.string().optional(), valeurOriginale: validation.string().optional(),
      actionSuggeree: validation.string().optional(), detailTechnique: validation.string().optional()
    })).parse(donnees) as ProblemeImportation[]
    const choix = await dialogue.showSaveDialog(fenetrePrincipale!, { defaultPath: 'rapport-erreurs.csv', filters: [{ name: 'Rapport CSV', extensions: ['csv'] }] })
    if (choix.canceled || !choix.filePath) return false
    const entete = ['Gravité', 'Code', 'Enregistrement', 'Colonne', 'Valeur originale', 'Problème', 'Action suggérée', 'Détail technique']
    const lignes = problemes.map((p) => [p.gravite, p.code, p.enregistrement, p.colonne, p.valeurOriginale, p.message, p.actionSuggeree, p.detailTechnique].map(echapperCsv).join(','))
    await ecrireFichier(choix.filePath, `\uFEFF${entete.map(echapperCsv).join(',')}\r\n${lignes.join('\r\n')}`, 'utf8')
    return true
  })
}

async function creerFenetre(): Promise<void> {
  fenetrePrincipale = new Fenetre({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#f5f7fa',
    show: false,
    webPreferences: {
      preload: joindreChemin(application.getAppPath(), 'dist-electron/prechargement/pont.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  fenetrePrincipale.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  fenetrePrincipale.webContents.on('will-navigate', (evenement) => evenement.preventDefault())
  fenetrePrincipale.once('ready-to-show', () => fenetrePrincipale?.show())
  if (estDeveloppement) await fenetrePrincipale.loadURL(process.env.ADRESSE_DEVELOPPEMENT!)
  else await fenetrePrincipale.loadFile(joindreChemin(application.getAppPath(), 'dist/index.html'))
}

application.whenReady().then(async () => {
  sessionElectron.defaultSession.setPermissionRequestHandler((_contenu, _permission, rappel) => rappel(false))
  installerCommunication()
  await creerFenetre()
  application.on('activate', () => { if (Fenetre.getAllWindows().length === 0) void creerFenetre() })
})

application.on('window-all-closed', () => { if (process.platform !== 'darwin') application.quit() })
application.on('before-quit', () => { void fermerToutesConnexions() })
