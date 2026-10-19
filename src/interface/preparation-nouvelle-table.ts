import type { ColonneSource, CorrespondanceColonne, TypeCreation } from '../partage/modeles'

export const typesCreation: { valeur: TypeCreation; sql: string; libelle: string }[] = [
  { valeur: 'texte', sql: 'text', libelle: 'Texte' },
  { valeur: 'entier', sql: 'integer', libelle: 'Entier' },
  { valeur: 'grand_entier', sql: 'bigint', libelle: 'Grand entier' },
  { valeur: 'decimal', sql: 'numeric', libelle: 'Décimal exact' },
  { valeur: 'booleen', sql: 'boolean', libelle: 'Booléen' },
  { valeur: 'date', sql: 'date', libelle: 'Date' },
  { valeur: 'horodatage', sql: 'timestamp without time zone', libelle: 'Horodatage' }
]

export function normaliserNomPostgreSQL(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'colonne'
}

export function preparerCorrespondancesNouvelleTable(
  colonnes: ColonneSource[],
  colonnesSelectionnees: Set<string>
): Record<string, CorrespondanceColonne> {
  const correspondances: Record<string, CorrespondanceColonne> = {}
  const nomsUtilises = new Set<string>()

  for (const colonne of colonnes) {
    const base = normaliserNomPostgreSQL(colonne.nom)
    let destination = base
    let suffixe = 2
    while (nomsUtilises.has(destination)) destination = `${base}_${suffixe++}`
    nomsUtilises.add(destination)

    const type = typesCreation.find((candidat) => candidat.valeur === colonne.typeSuggere) ?? typesCreation[0]
    correspondances[colonne.id] = {
      idSource: colonne.id,
      incluse: colonnesSelectionnees.has(colonne.id),
      destination,
      typeCible: type.sql,
      regles: { blancs: 'nul' }
    }
  }

  return correspondances
}
