import { describe as decrire, expect as attendre, it as tester } from 'vitest'
import type { ColonneSource } from '../partage/modeles'
import { normaliserNomPostgreSQL, preparerCorrespondancesNouvelleTable } from './preparation-nouvelle-table'

function colonne(id: string, nom: string, typeSuggere: ColonneSource['typeSuggere']): ColonneSource {
  return { id, index: Number(id.replace('col_', '')), nom, exemples: [], selectionnee: true, typeSuggere }
}

decrire('préparation d’une nouvelle table', () => {
  tester('normalise les noms pour PostgreSQL', () => {
    attendre(normaliserNomPostgreSQL('Montant réglé (€)')).toBe('montant_regle')
  })

  tester('propose les noms, les types et distingue les doublons', () => {
    const colonnes = [
      colonne('col_0', 'Identifiant client', 'grand_entier'),
      colonne('col_1', 'Date création', 'horodatage'),
      colonne('col_2', 'Date-création', 'texte')
    ]
    const resultat = preparerCorrespondancesNouvelleTable(colonnes, new Set(['col_0', 'col_1', 'col_2']))

    attendre(resultat.col_0.destination).toBe('identifiant_client')
    attendre(resultat.col_0.typeCible).toBe('bigint')
    attendre(resultat.col_1.destination).toBe('date_creation')
    attendre(resultat.col_1.typeCible).toBe('timestamp without time zone')
    attendre(resultat.col_2.destination).toBe('date_creation_2')
    attendre(resultat.col_2.typeCible).toBe('text')
  })
})
