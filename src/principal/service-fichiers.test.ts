import { mkdtemp as creerDossier, rm as supprimerDossier, writeFile as ecrireFichier } from 'node:fs/promises'
import { tmpdir as dossierTemporaire } from 'node:os'
import { join as joindreChemin } from 'node:path'
import { afterEach as apresChaque, describe as decrire, expect as attendre, it as tester } from 'vitest'
import { utils as outilsClasseur, write as ecrireClasseur } from 'xlsx'
import { inspecterFichier, obtenirSource, oublierSource } from './service-fichiers.js'

const dossiersCrees: string[] = []

async function dossierEssai(): Promise<string> {
  const dossier = await creerDossier(joindreChemin(dossierTemporaire(), 'feuille-postgresql-'))
  dossiersCrees.push(dossier)
  return dossier
}

apresChaque(async () => {
  await Promise.all(dossiersCrees.splice(0).map((dossier) => supprimerDossier(dossier, { recursive: true, force: true })))
})

decrire('lecture des formats sources', () => {
  tester('ouvre un fichier CSV et détecte son séparateur', async () => {
    const dossier = await dossierEssai()
    const chemin = joindreChemin(dossier, 'clients.csv')
    await ecrireFichier(chemin, 'code;nom\r\n00123;Amal\r\n00456;Youssef', 'utf8')
    const inspection = await inspecterFichier(chemin, {})
    attendre(inspection.identite.extension).toBe('csv')
    attendre(inspection.format.separateur).toBe(';')
    attendre(inspection.totalLignes).toBe(2)
    attendre(inspection.apercu[0].valeurs.col_0).toBe('00123')
  })

  tester('ouvre un fichier TXT délimité et permet de changer son séparateur', async () => {
    const dossier = await dossierEssai()
    const chemin = joindreChemin(dossier, 'clients.txt')
    await ecrireFichier(chemin, 'identifiant;nom|ville\r\n1;Amal|Rabat', 'utf8')

    const detection = await inspecterFichier(chemin, {})
    attendre(detection.identite.extension).toBe('txt')
    attendre(detection.format.separateur).toBe(';')
    attendre(detection.colonnes.map((element) => element.nom)).toEqual(['identifiant', 'nom|ville'])

    const modification = await inspecterFichier(undefined, { idSource: detection.identite.id, separateur: '|' })
    attendre(modification.format.separateur).toBe('|')
    attendre(modification.colonnes.map((element) => element.nom)).toEqual(['identifiant;nom', 'ville'])
  })

  tester.each([
    ['xlsx', 'xlsx'],
    ['xls', 'biff8']
  ] as const)('ouvre un fichier %s et conserve les feuilles', async (extension, typeClasseur) => {
    const dossier = await dossierEssai()
    const chemin = joindreChemin(dossier, `donnees.${extension}`)
    const classeur = outilsClasseur.book_new()
    outilsClasseur.book_append_sheet(classeur, outilsClasseur.aoa_to_sheet([['identifiant', 'date'], ['00123', new Date(2026, 11, 25)]]), 'Données')
    const contenu = ecrireClasseur(classeur, { type: 'buffer', bookType: typeClasseur, cellDates: true })
    await ecrireFichier(chemin, contenu)
    const inspection = await inspecterFichier(chemin, {})
    attendre(inspection.identite.extension).toBe(extension)
    attendre(inspection.feuille).toBe('Données')
    attendre(inspection.totalLignes).toBe(1)
    attendre(inspection.apercu[0].valeurs.col_0).toBe('00123')
  })

  tester('suggère les types PostgreSQL à partir des valeurs du fichier', async () => {
    const dossier = await dossierEssai()
    const chemin = joindreChemin(dossier, 'commandes.csv')
    await ecrireFichier(
      chemin,
      'code,date_creation,actif,total,date_livraison\r\n00123,2026-10-12 14:30:00,true,12.50,2026-10-13',
      'utf8'
    )
    const inspection = await inspecterFichier(chemin, {})

    attendre(inspection.colonnes.map((element) => element.typeSuggere)).toEqual([
      'texte',
      'horodatage',
      'booleen',
      'decimal',
      'date'
    ])
  })

  tester('retire la source de la mémoire après une importation réussie', async () => {
    const dossier = await dossierEssai()
    const chemin = joindreChemin(dossier, 'terminee.csv')
    await ecrireFichier(chemin, 'identifiant,nom\r\n1,Amal', 'utf8')
    const inspection = await inspecterFichier(chemin, {})

    attendre(oublierSource(inspection.identite.id)).toBe(true)
    attendre(() => obtenirSource(inspection.identite.id)).toThrow('La source n’est plus disponible.')
  })
})
