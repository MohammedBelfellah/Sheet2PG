import { mkdtemp as creerDossierTemporaire, rm as supprimerDossier } from 'node:fs/promises'
import { tmpdir as dossierTemporaire } from 'node:os'
import { join as joindreChemin } from 'node:path'
import { afterEach as apresChaque, describe as decrire, expect as attendre, it as tester } from 'vitest'
import { lireDernierDossierSource, memoriserDernierDossierSource } from './service-preferences.js'

const dossiersCrees: string[] = []

apresChaque(async () => {
  await Promise.all(dossiersCrees.splice(0).map((dossier) => supprimerDossier(dossier, { recursive: true, force: true })))
})

decrire('préférences locales', () => {
  tester('mémorise uniquement le dernier dossier du fichier source', async () => {
    const dossier = await creerDossierTemporaire(joindreChemin(dossierTemporaire(), 'feuille-postgresql-preferences-'))
    dossiersCrees.push(dossier)
    const cheminPreferences = joindreChemin(dossier, 'configuration', 'preferences.json')
    const cheminSource = joindreChemin(dossier, 'donnees', 'clients.txt')

    attendre(await lireDernierDossierSource(cheminPreferences)).toBeUndefined()
    await memoriserDernierDossierSource(cheminPreferences, cheminSource)
    attendre(await lireDernierDossierSource(cheminPreferences)).toBe(joindreChemin(dossier, 'donnees'))
  })
})
