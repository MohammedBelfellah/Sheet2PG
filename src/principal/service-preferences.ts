import { mkdir as creerDossier, readFile as lireFichier, writeFile as ecrireFichier } from 'node:fs/promises'
import { dirname as dossierParent } from 'node:path'

interface PreferencesApplication {
  dernierDossierSource?: string
}

export async function lireDernierDossierSource(cheminPreferences: string): Promise<string | undefined> {
  try {
    const contenu = await lireFichier(cheminPreferences, 'utf8')
    const preferences = JSON.parse(contenu) as PreferencesApplication
    return typeof preferences.dernierDossierSource === 'string' && preferences.dernierDossierSource.trim()
      ? preferences.dernierDossierSource
      : undefined
  } catch {
    return undefined
  }
}

export async function memoriserDernierDossierSource(cheminPreferences: string, cheminFichier: string): Promise<void> {
  const preferences: PreferencesApplication = { dernierDossierSource: dossierParent(cheminFichier) }
  await creerDossier(dossierParent(cheminPreferences), { recursive: true })
  await ecrireFichier(cheminPreferences, JSON.stringify(preferences, null, 2), 'utf8')
}
