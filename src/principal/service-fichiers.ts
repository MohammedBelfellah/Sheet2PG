import { createHash as creerHachage, randomUUID as creerIdentifiant } from 'node:crypto'
import { readFile as lireFichier, stat as lireStatut } from 'node:fs/promises'
import { basename as nomBase, extname as extensionNom } from 'node:path'
import iconv from 'iconv-lite'
import { read as lireClasseur, utils as outilsClasseur, type WorkBook } from 'xlsx'
import type {
  ColonneSource,
  ExtensionSource,
  InspectionSource,
  LigneApercu,
  ModeEntete,
  OptionsInspection,
  TypeCreation,
  ValeurCellule
} from '../partage/modeles.js'

interface SourceMemoire {
  id: string
  chemin: string
  extension: ExtensionSource
  taille: number
  empreinte: string
  classeur: WorkBook
  format: { separateur?: string; encodage?: string }
  avertissements: string[]
  inspection?: InspectionSource
  donnees?: LigneApercu[]
  formulesSansResultat?: { feuille: string; numero: number; colonne: number }[]
}

const sources = new Map<string, SourceMemoire>()
const extensionsPermises = new Set(['.csv', '.xlsx', '.xls'])

function extensionValide(chemin: string): ExtensionSource {
  const extension = extensionNom(chemin).toLowerCase()
  if (!extensionsPermises.has(extension)) {
    throw new Error('Format non pris en charge. Choisissez un fichier CSV, XLSX ou XLS.')
  }
  return extension.slice(1) as ExtensionSource
}

function detecterEncodage(contenu: Buffer): 'utf8' | 'windows-1252' {
  if (contenu.length >= 3 && contenu[0] === 0xef && contenu[1] === 0xbb && contenu[2] === 0xbf) return 'utf8'
  const texte = contenu.toString('utf8')
  return texte.includes('\uFFFD') ? 'windows-1252' : 'utf8'
}

function detecterSeparateur(texte: string): ',' | ';' | '\t' {
  const lignes = texte.split(/\r?\n/).slice(0, 8).filter(Boolean)
  const candidats = [',', ';', '\t'] as const
  let meilleur: ',' | ';' | '\t' = ','
  let meilleurScore = -1
  for (const candidat of candidats) {
    const comptes = lignes.map((ligne) => ligne.split(candidat).length - 1)
    const score = comptes.length && comptes.every((nombre) => nombre === comptes[0]) ? comptes[0] : 0
    if (score > meilleurScore) {
      meilleur = candidat
      meilleurScore = score
    }
  }
  return meilleur
}

function valeurTexte(valeur: unknown): ValeurCellule {
  if (valeur === null || valeur === undefined) return null
  if (valeur instanceof Date) {
    const annee = valeur.getFullYear()
    const mois = String(valeur.getMonth() + 1).padStart(2, '0')
    const jour = String(valeur.getDate()).padStart(2, '0')
    const heure = valeur.getHours()
    const minute = valeur.getMinutes()
    const seconde = valeur.getSeconds()
    if (heure === 0 && minute === 0 && seconde === 0) return `${annee}-${mois}-${jour}`
    return `${annee}-${mois}-${jour} ${String(heure).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(seconde).padStart(2, '0')}`
  }
  if (typeof valeur === 'string' || typeof valeur === 'number' || typeof valeur === 'boolean') return valeur
  return String(valeur)
}

function ligneVide(ligne: unknown[]): boolean {
  return ligne.every((valeur) => valeur === null || valeur === undefined || valeur === '')
}

function suggererType(valeurs: ValeurCellule[]): TypeCreation {
  const presentes = valeurs.filter((valeur) => valeur !== null && valeur !== '')
  if (!presentes.length) return 'texte'
  const chaines = presentes.map(String)
  if (chaines.some((valeur) => /^0\d+/.test(valeur))) return 'texte'
  if (chaines.every((valeur) => /^[-+]?\d+$/.test(valeur))) {
    return chaines.some((valeur) => valeur.replace(/^[-+]/, '').length > 9) ? 'grand_entier' : 'entier'
  }
  if (chaines.every((valeur) => /^[-+]?\d+(?:[.,]\d+)?$/.test(valeur))) return 'decimal'
  if (chaines.every((valeur) => /^(true|false|vrai|faux|oui|non|0|1)$/i.test(valeur))) return 'booleen'
  if (chaines.every((valeur) => /^\d{4}-\d{2}-\d{2}$/.test(valeur) || /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(valeur))) return 'date'
  return 'texte'
}

function choisirEntete(lignes: unknown[][]): number {
  const limite = Math.min(lignes.length, 12)
  for (let index = 0; index < limite; index += 1) {
    const ligne = lignes[index] ?? []
    if (ligneVide(ligne)) continue
    const remplies = ligne.filter((valeur) => valeur !== null && valeur !== undefined && valeur !== '')
    const textes = remplies.filter((valeur) => typeof valeur === 'string')
    const suivante = lignes[index + 1] ?? []
    if (remplies.length >= 1 && textes.length / remplies.length >= 0.6 && !ligneVide(suivante)) return index + 1
  }
  return 1
}

function nomsColonnes(ligne: unknown[], largeur: number, sansEntete: boolean): { noms: string[]; avertissements: string[] } {
  const noms: string[] = []
  const avertissements: string[] = []
  const vus = new Map<string, number>()
  for (let index = 0; index < largeur; index += 1) {
    let nom = sansEntete ? `Colonne ${index + 1}` : String(ligne[index] ?? '').trim()
    if (!nom) {
      nom = `Colonne ${index + 1}`
      avertissements.push(`L'en-tête de la colonne ${index + 1} est vide ; un nom provisoire a été attribué.`)
    }
    const cle = nom.toLocaleLowerCase('fr')
    const nombre = (vus.get(cle) ?? 0) + 1
    vus.set(cle, nombre)
    if (nombre > 1) {
      avertissements.push(`L'en-tête « ${nom} » apparaît plusieurs fois ; chaque colonne conserve un identifiant distinct.`)
      nom = `${nom} (${nombre})`
    }
    noms.push(nom)
  }
  return { noms, avertissements }
}

async function chargerSource(chemin: string, options: OptionsInspection): Promise<SourceMemoire> {
  const extension = extensionValide(chemin)
  const [contenu, statut] = await Promise.all([lireFichier(chemin), lireStatut(chemin)])
  const empreinte = creerHachage('sha256').update(contenu).digest('hex')
  let classeur: WorkBook
  const avertissements: string[] = []
  const format: { separateur?: string; encodage?: string } = {}
  try {
    if (extension === 'csv') {
      const encodage = options.encodage ?? detecterEncodage(contenu)
      const texte = iconv.decode(contenu, encodage)
      const separateur = options.separateur ?? detecterSeparateur(texte)
      format.encodage = encodage
      format.separateur = separateur
      classeur = lireClasseur(texte, { type: 'string', FS: separateur, raw: true, cellDates: true })
    } else {
      classeur = lireClasseur(contenu, { type: 'buffer', raw: true, cellDates: true, cellFormula: true, bookVBA: false })
    }
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur)
    throw new Error(`Impossible de lire le fichier. Il est peut-être endommagé, protégé par mot de passe ou dans un format non pris en charge. ${message}`)
  }
  return {
    id: creerIdentifiant(),
    chemin,
    extension,
    taille: statut.size,
    empreinte,
    classeur,
    format,
    avertissements
  }
}

export async function inspecterFichier(chemin: string | undefined, options: OptionsInspection): Promise<InspectionSource> {
  let source: SourceMemoire | undefined
  if (options.idSource) source = sources.get(options.idSource)
  if (!source && chemin) {
    source = await chargerSource(chemin, options)
    sources.set(source.id, source)
  } else if (source && source.extension === 'csv' && (options.encodage || options.separateur)) {
    const rechargee = await chargerSource(source.chemin, options)
    sources.delete(source.id)
    rechargee.id = source.id
    sources.set(rechargee.id, rechargee)
    source = rechargee
  }
  if (!source) throw new Error('La source demandée n’est plus disponible. Sélectionnez de nouveau le fichier.')

  const feuilles = source.classeur.SheetNames.map((nom) => {
    const feuille = source!.classeur.Sheets[nom]
    const lignes = outilsClasseur.sheet_to_json<unknown[]>(feuille, { header: 1, raw: true, defval: null })
    return { nom, vide: !lignes.some((ligne) => !ligneVide(ligne)) }
  })
  const feuilleChoisie = options.feuille && source.classeur.Sheets[options.feuille]
    ? options.feuille
    : feuilles.find((feuille) => !feuille.vide)?.nom ?? feuilles[0]?.nom
  if (!feuilleChoisie) throw new Error('Le classeur ne contient aucune feuille lisible.')
  const feuille = source.classeur.Sheets[feuilleChoisie]
  source.formulesSansResultat = Object.entries(feuille)
    .filter(([adresse, cellule]) => !adresse.startsWith('!') && Boolean((cellule as { f?: string }).f) && (cellule as { v?: unknown }).v == null)
    .map(([adresse]) => {
      const cellule = outilsClasseur.decode_cell(adresse)
      return { feuille: feuilleChoisie, numero: cellule.r + 1, colonne: cellule.c }
    })
  const brutes = outilsClasseur.sheet_to_json<unknown[]>(feuille, { header: 1, raw: true, defval: null })
  const modeEntete: ModeEntete = options.modeEntete ?? 'automatique'
  const ligneEntete = modeEntete === 'sans_entete' ? null : (modeEntete === 'ligne' ? Math.max(1, options.ligneEntete ?? 1) : choisirEntete(brutes))
  const debutDonnees = ligneEntete ?? 0
  const largeur = brutes.reduce((maximum, ligne) => Math.max(maximum, ligne.length), 0)
  const ligneNoms = ligneEntete ? brutes[ligneEntete - 1] ?? [] : []
  const { noms, avertissements } = nomsColonnes(ligneNoms, largeur, modeEntete === 'sans_entete')
  const lignes: LigneApercu[] = []
  let lignesVides = 0
  for (let index = debutDonnees; index < brutes.length; index += 1) {
    const brute = brutes[index] ?? []
    if (ligneVide(brute)) {
      lignesVides += 1
      continue
    }
    const valeurs: Record<string, ValeurCellule> = {}
    for (let colonne = 0; colonne < largeur; colonne += 1) valeurs[`col_${colonne}`] = valeurTexte(brute[colonne])
    lignes.push({ numero: index + 1, valeurs })
  }
  const colonnes: ColonneSource[] = noms.map((nom, index) => {
    const valeurs = lignes.map((ligne) => ligne.valeurs[`col_${index}`]).filter((valeur) => valeur !== null).slice(0, 100)
    return {
      id: `col_${index}`,
      index,
      nom,
      exemples: valeurs.slice(0, 3).map(String),
      selectionnee: true,
      typeSuggere: suggererType(valeurs)
    }
  })
  const inspection: InspectionSource = {
    identite: {
      id: source.id,
      nom: nomBase(source.chemin),
      extension: source.extension,
      taille: source.taille,
      chemin: source.chemin,
      empreinte: source.empreinte,
      feuilles
    },
    feuille: feuilleChoisie,
    ligneEntete,
    modeEntete,
    lignesExclues: ligneEntete ? Math.max(0, ligneEntete - 1) : 0,
    lignesVides,
    totalLignes: lignes.length,
    colonnes,
    apercu: lignes.slice(0, 50),
    format: source.format,
    avertissements: [
      ...source.avertissements,
      ...avertissements,
      ...(source.formulesSansResultat.length ? [`${source.formulesSansResultat.length} formule(s) n’ont pas de résultat enregistré ; la validation indiquera les cellules concernées.`] : [])
    ]
  }
  source.inspection = inspection
  source.donnees = lignes
  return inspection
}

export function obtenirSource(idSource: string): SourceMemoire {
  const source = sources.get(idSource)
  if (!source || !source.inspection || !source.donnees) throw new Error('La source n’est plus disponible.')
  return source
}

export async function verifierEmpreinteSource(idSource: string, empreinteAttendue: string): Promise<boolean> {
  const source = obtenirSource(idSource)
  const contenu = await lireFichier(source.chemin)
  return creerHachage('sha256').update(contenu).digest('hex') === empreinteAttendue
}
