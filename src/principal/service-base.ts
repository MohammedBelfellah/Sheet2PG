import { createHash as creerHachage, randomUUID as creerIdentifiant } from 'node:crypto'
import pg from 'pg'
import type { Pool as GroupeConnexions, PoolClient as ClientBase } from 'pg'
import type {
  ConfigurationConnexion,
  ConnexionEtablie,
  DescriptionTable,
  ProblemeImportation,
  TableDestination
} from '../partage/modeles.js'

const { Pool: FabriqueGroupe } = pg

interface ConnexionMemoire {
  id: string
  groupe: GroupeConnexions
  hote: string
  base: string
}

const connexions = new Map<string, ConnexionMemoire>()

export function citerIdentifiant(nom: string): string {
  return `"${nom.replaceAll('"', '""')}"`
}

export function problemeBase(erreur: unknown, contexte = 'L’opération PostgreSQL a échoué.'): ProblemeImportation {
  const information = erreur as { code?: string; message?: string; detail?: string; constraint?: string }
  const code = information.code ?? 'BASE_INCONNUE'
  let message = contexte
  let actionSuggeree = 'Vérifiez la configuration et réessayez.'
  if (code === '28P01') {
    message = 'Authentification refusée par PostgreSQL.'
    actionSuggeree = 'Vérifiez le nom d’utilisateur et le mot de passe.'
  } else if (code === '3D000') {
    message = 'La base de données indiquée n’existe pas.'
    actionSuggeree = 'Vérifiez le nom de la base.'
  } else if (code === '42501') {
    message = 'Permission refusée pour cette opération.'
    actionSuggeree = 'Utilisez un compte autorisé à lire le schéma et à insérer dans la table.'
  } else if (code === '23505') {
    message = 'Une contrainte d’unicité non couverte par la règle de doublons a refusé une ligne.'
    actionSuggeree = 'Choisissez la clé unique concernée comme règle de doublons ou corrigez la source.'
  } else if (code === '23502') {
    message = 'Une colonne obligatoire n’a pas reçu de valeur.'
    actionSuggeree = 'Mappez la colonne obligatoire ou définissez une valeur par défaut dans PostgreSQL.'
  } else if (code.startsWith('08')) {
    message = 'La connexion à PostgreSQL a été interrompue.'
    actionSuggeree = 'Vérifiez le réseau et l’état du serveur avant de réessayer.'
  }
  return {
    code: `PG_${code}`,
    gravite: 'erreur',
    message,
    actionSuggeree,
    detailTechnique: [information.message, information.detail, information.constraint].filter(Boolean).join(' — ').slice(0, 1000)
  }
}

export async function connecterBase(configuration: ConfigurationConnexion): Promise<ConnexionEtablie> {
  const id = creerIdentifiant()
  const groupe = new FabriqueGroupe({
    host: configuration.hote,
    port: configuration.port,
    database: configuration.base,
    user: configuration.utilisateur,
    password: configuration.motDePasse,
    connectionTimeoutMillis: Math.max(1, configuration.delaiSecondes) * 1000,
    max: 4,
    idleTimeoutMillis: 30_000,
    ssl: configuration.ssl === 'verifie'
      ? { rejectUnauthorized: true, ...(configuration.certificatAutorite ? { ca: configuration.certificatAutorite } : {}) }
      : undefined
  })
  try {
    const client = await groupe.connect()
    const resultat = await client.query<{ version: string; base: string }>('SELECT version() AS version, current_database() AS base')
    client.release()
    const schemas = await listerSchemasAvecGroupe(groupe)
    connexions.set(id, { id, groupe, hote: configuration.hote, base: resultat.rows[0].base })
    return { id, hote: configuration.hote, base: resultat.rows[0].base, schemas, version: resultat.rows[0].version }
  } catch (erreur) {
    await groupe.end().catch(() => undefined)
    throw new Error(problemeBase(erreur, 'Connexion impossible.').message + ' ' + (problemeBase(erreur).detailTechnique ?? ''))
  }
}

async function listerSchemasAvecGroupe(groupe: GroupeConnexions): Promise<string[]> {
  const resultat = await groupe.query<{ nom: string }>(`
    SELECT schema_name AS nom
    FROM information_schema.schemata
    WHERE schema_name NOT LIKE 'pg_%' AND schema_name <> 'information_schema'
    ORDER BY CASE WHEN schema_name = 'public' THEN 0 ELSE 1 END, schema_name
  `)
  return resultat.rows.map((ligne) => ligne.nom)
}

export async function deconnecterBase(id: string): Promise<void> {
  const connexion = connexions.get(id)
  if (!connexion) return
  connexions.delete(id)
  await connexion.groupe.end()
}

export function obtenirConnexion(id: string): ConnexionMemoire {
  const connexion = connexions.get(id)
  if (!connexion) throw new Error('La connexion n’est plus active. Reconnectez-vous à PostgreSQL.')
  return connexion
}

export async function avecClient<T>(id: string, operation: (client: ClientBase) => Promise<T>): Promise<T> {
  const connexion = obtenirConnexion(id)
  const client = await connexion.groupe.connect()
  try {
    return await operation(client)
  } finally {
    client.release()
  }
}

export async function listerTables(id: string, schema: string): Promise<TableDestination[]> {
  const connexion = obtenirConnexion(id)
  const resultat = await connexion.groupe.query<{ schema: string; nom: string }>(`
    SELECT table_schema AS schema, table_name AS nom
    FROM information_schema.tables
    WHERE table_schema = $1 AND table_type IN ('BASE TABLE', 'FOREIGN')
    ORDER BY table_name
  `, [schema])
  return resultat.rows
}

export async function decrireTable(id: string, schema: string, table: string): Promise<DescriptionTable> {
  const connexion = obtenirConnexion(id)
  const resultat = await connexion.groupe.query<{
    nom: string
    type: string
    nullable: boolean
    valeur_defaut: boolean
    generee: boolean
    identite: boolean
    primaire: boolean
    unique_colonne: boolean
  }>(`
    SELECT
      a.attname AS nom,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
      NOT a.attnotnull AS nullable,
      (ad.adbin IS NOT NULL) AS valeur_defaut,
      (a.attgenerated <> '') AS generee,
      (a.attidentity <> '') AS identite,
      EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = cls.oid AND c.contype = 'p' AND a.attnum = ANY(c.conkey)
      ) AS primaire,
      EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = cls.oid AND c.contype IN ('p', 'u')
          AND array_length(c.conkey, 1) = 1 AND a.attnum = ANY(c.conkey)
      ) AS unique_colonne
    FROM pg_attribute a
    JOIN pg_class cls ON cls.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE n.nspname = $1 AND cls.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum
  `, [schema, table])
  if (!resultat.rowCount) throw new Error(`La table ${schema}.${table} n’existe pas ou n’est pas accessible.`)
  const colonnes = resultat.rows.map((ligne) => ({
    nom: ligne.nom,
    type: ligne.type,
    nullable: ligne.nullable,
    valeurParDefaut: ligne.valeur_defaut,
    generee: ligne.generee,
    identite: ligne.identite,
    primaire: ligne.primaire,
    unique: ligne.unique_colonne
  }))
  const empreinte = creerHachage('sha256').update(JSON.stringify(colonnes)).digest('hex')
  return { schema, nom: table, colonnes, empreinte }
}

export async function fermerToutesConnexions(): Promise<void> {
  await Promise.allSettled([...connexions.values()].map((connexion) => connexion.groupe.end()))
  connexions.clear()
}
