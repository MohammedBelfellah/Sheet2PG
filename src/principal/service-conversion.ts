import type { ProblemeImportation, ReglesConversion, TypeCreation, ValeurCellule } from '../partage/modeles.js'

export interface ConversionValeur {
  valeur: string | number | boolean | null
  probleme?: ProblemeImportation
  convertie: boolean
}

const typesTexte = /^(text|character varying(?:\(\d+\))?|character(?:\(\d+\))?|varchar(?:\(\d+\))?|char(?:\(\d+\))?|name)$/i
const typesEntier = /^(smallint|integer|bigint|int2|int4|int8)$/i
const typesDecimal = /^(numeric(?:\(\d+(?:,\d+)?\))?|decimal(?:\(\d+(?:,\d+)?\))?|real|double precision|float4|float8|money)$/i
const typesBooleen = /^(boolean|bool)$/i
const typesDate = /^date$/i
const typesHorodatage = /^(timestamp(?:\(\d+\))? without time zone|timestamp(?:\(\d+\))?|timestamp)$/i
const typesFuseau = /^(timestamp(?:\(\d+\))? with time zone|timestamptz)$/i
const typesJson = /^(json|jsonb)$/i
const typesUuid = /^uuid$/i

function probleme(code: string, message: string, actionSuggeree: string): ProblemeImportation {
  return { code, gravite: 'erreur', message, actionSuggeree }
}

function convertirDate(texte: string, regles: ReglesConversion): ConversionValeur {
  if (/^\d{4}-\d{2}-\d{2}$/.test(texte)) {
    const date = new Date(`${texte}T00:00:00Z`)
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === texte) return { valeur: texte, convertie: false }
  }
  const correspondance = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texte)
  if (!correspondance) return { valeur: null, convertie: false, probleme: probleme('DATE_INVALIDE', 'Cette valeur n’est pas une date reconnue.', 'Corrigez la valeur dans le fichier source.') }
  const premier = Number(correspondance[1])
  const second = Number(correspondance[2])
  const annee = Number(correspondance[3])
  let jour: number
  let mois: number
  if (premier > 12) {
    jour = premier
    mois = second
  } else if (second > 12) {
    mois = premier
    jour = second
  } else if (regles.ordreDate === 'jour_mois_annee') {
    jour = premier
    mois = second
  } else if (regles.ordreDate === 'mois_jour_annee') {
    mois = premier
    jour = second
  } else {
    return { valeur: null, convertie: false, probleme: probleme('DATE_AMBIGUE', 'Cette date peut être interprétée de plusieurs façons.', 'Choisissez l’ordre jour/mois/année ou mois/jour/année pour cette colonne.') }
  }
  const date = new Date(Date.UTC(annee, mois - 1, jour))
  if (date.getUTCFullYear() !== annee || date.getUTCMonth() !== mois - 1 || date.getUTCDate() !== jour) {
    return { valeur: null, convertie: false, probleme: probleme('DATE_INVALIDE', 'Cette date n’existe pas.', 'Corrigez la date dans le fichier source.') }
  }
  return { valeur: `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`, convertie: true }
}

function normaliserNombre(texte: string, regles: ReglesConversion): ConversionValeur {
  const contientPoint = texte.includes('.')
  const contientVirgule = texte.includes(',')
  if ((contientPoint && contientVirgule) || (/^[-+]?\d{1,3}[.,]\d{3}$/.test(texte) && !regles.separateurDecimal)) {
    return { valeur: null, convertie: false, probleme: probleme('NOMBRE_AMBIGU', 'Le séparateur décimal ou de milliers est ambigu.', 'Choisissez le séparateur décimal pour cette colonne.') }
  }
  let normalise = texte
  if (regles.separateurDecimal === 'virgule') normalise = normalise.replaceAll('.', '').replace(',', '.')
  else if (regles.separateurDecimal === 'point') normalise = normalise.replaceAll(',', '')
  else if (contientVirgule) normalise = normalise.replace(',', '.')
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(normalise)) {
    return { valeur: null, convertie: false, probleme: probleme('NOMBRE_INVALIDE', 'Cette valeur n’est pas un nombre reconnu.', 'Corrigez la valeur ou choisissez le séparateur décimal approprié.') }
  }
  return { valeur: normalise, convertie: normalise !== texte }
}

export function convertirValeur(valeur: ValeurCellule, typeCible: string, regles: ReglesConversion): ConversionValeur {
  if (valeur === null || valeur === '') {
    if (valeur === '' && regles.blancs === 'chaine_vide' && typesTexte.test(typeCible)) return { valeur: '', convertie: false }
    return { valeur: null, convertie: valeur === '' }
  }
  const texte = String(valeur)
  if (typesTexte.test(typeCible)) {
    const limite = /\((\d+)\)/.exec(typeCible)?.[1]
    if (limite && [...texte].length > Number(limite)) {
      return { valeur: null, convertie: false, probleme: probleme('TEXTE_TROP_LONG', `Le texte dépasse la limite de ${limite} caractères.`, 'Raccourcissez la valeur ou élargissez la colonne dans PostgreSQL.') }
    }
    return { valeur: texte, convertie: typeof valeur !== 'string' }
  }
  if (typesEntier.test(typeCible)) {
    if (/^0\d+/.test(texte)) return { valeur: null, convertie: false, probleme: probleme('ZERO_SIGNIFICATIF', 'La conversion numérique supprimerait un zéro initial significatif.', 'Utilisez une colonne texte ou corrigez explicitement la source.') }
    if (!/^[-+]?\d+$/.test(texte)) return { valeur: null, convertie: false, probleme: probleme('ENTIER_INVALIDE', 'Cette colonne exige un nombre entier.', 'Corrigez la valeur dans le fichier source.') }
    const nombre = BigInt(texte)
    const limites: Record<string, [bigint, bigint]> = {
      smallint: [-32768n, 32767n], int2: [-32768n, 32767n],
      integer: [-2147483648n, 2147483647n], int4: [-2147483648n, 2147483647n],
      bigint: [-9223372036854775808n, 9223372036854775807n], int8: [-9223372036854775808n, 9223372036854775807n]
    }
    const limite = limites[typeCible.toLowerCase()]
    if (limite && (nombre < limite[0] || nombre > limite[1])) return { valeur: null, convertie: false, probleme: probleme('ENTIER_HORS_LIMITES', 'Le nombre dépasse les limites du type PostgreSQL.', 'Choisissez un type plus large ou corrigez la valeur.') }
    return { valeur: texte, convertie: typeof valeur !== 'number' }
  }
  if (typesDecimal.test(typeCible)) return normaliserNombre(texte, regles)
  if (typesBooleen.test(typeCible)) {
    const vrai = /^(true|vrai|oui|1)$/i.test(texte)
    const faux = /^(false|faux|non|0)$/i.test(texte)
    if (!vrai && !faux) return { valeur: null, convertie: false, probleme: probleme('BOOLEEN_INVALIDE', 'Cette valeur n’est pas un booléen reconnu.', 'Utilisez vrai/faux, oui/non, true/false ou 1/0.') }
    return { valeur: vrai, convertie: typeof valeur !== 'boolean' }
  }
  if (typesDate.test(typeCible)) return convertirDate(texte, regles)
  if (typesHorodatage.test(typeCible)) {
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(texte)) return { valeur: null, convertie: false, probleme: probleme('HORODATAGE_INVALIDE', 'Cet horodatage sans fuseau n’est pas reconnu.', 'Utilisez le format AAAA-MM-JJ HH:MM:SS.') }
    return { valeur: texte.replace('T', ' '), convertie: texte.includes('T') }
  }
  if (typesFuseau.test(typeCible)) {
    if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(texte)) return { valeur: texte, convertie: false }
    if (!regles.fuseauSource) return { valeur: null, convertie: false, probleme: probleme('FUSEAU_MANQUANT', 'Un fuseau source est requis pour cet horodatage.', 'Indiquez UTC ou un décalage tel que +01:00 dans les règles de conversion.') }
    if (!/^(UTC|[+-]\d{2}:\d{2})$/i.test(regles.fuseauSource)) return { valeur: null, convertie: false, probleme: probleme('FUSEAU_INVALIDE', 'Le fuseau source n’est pas reconnu.', 'Indiquez UTC ou un décalage tel que +01:00.') }
    return { valeur: `${texte}${regles.fuseauSource.toUpperCase() === 'UTC' ? 'Z' : regles.fuseauSource}`, convertie: true }
  }
  if (typesUuid.test(typeCible)) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(texte)) return { valeur: null, convertie: false, probleme: probleme('UUID_INVALIDE', 'Cette valeur n’est pas un UUID valide.', 'Corrigez l’identifiant dans la source.') }
    return { valeur: texte, convertie: false }
  }
  if (typesJson.test(typeCible)) {
    try {
      JSON.parse(texte)
      return { valeur: texte, convertie: false }
    } catch {
      return { valeur: null, convertie: false, probleme: probleme('JSON_INVALIDE', 'Cette valeur n’est pas un document JSON valide.', 'Corrigez le JSON dans la source.') }
    }
  }
  return { valeur: null, convertie: false, probleme: probleme('TYPE_NON_PRIS_EN_CHARGE', `Le type PostgreSQL « ${typeCible} » n’est pas pris en charge automatiquement.`, 'Omettez cette colonne ou utilisez un type pris en charge.') }
}

export function typeSqlCreation(type: TypeCreation): string {
  const types: Record<TypeCreation, string> = {
    texte: 'text',
    entier: 'integer',
    grand_entier: 'bigint',
    decimal: 'numeric',
    booleen: 'boolean',
    date: 'date',
    horodatage: 'timestamp without time zone'
  }
  return types[type]
}
