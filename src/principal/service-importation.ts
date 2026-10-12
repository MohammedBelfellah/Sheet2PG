import { createHash as creerHachage, randomUUID as creerIdentifiant } from 'node:crypto'
import type { PoolClient as ClientBase } from 'pg'
import type {
  CompteursImportation,
  LigneApercu,
  PlanImportation,
  ProblemeImportation,
  ProgressionTravail,
  ResultatImportation,
  ResultatValidation,
  ValeurCellule
} from '../partage/modeles.js'
import { citerIdentifiant, decrireTable, obtenirConnexion, problemeBase } from './service-base.js'
import { convertirValeur } from './service-conversion.js'
import { obtenirSource, verifierEmpreinteSource } from './service-fichiers.js'

interface LignePreparee {
  numero: number
  valeurs: Record<string, string | number | boolean | null>
  bloquee: boolean
}

interface Preparation {
  lignes: LignePreparee[]
  problemes: ProblemeImportation[]
  compteurs: CompteursImportation
  apercu: LigneApercu[]
}

interface EtatTravail {
  annule: boolean
}

const travaux = new Map<string, EtatTravail>()

function compteursVides(total: number, lignesVides: number): CompteursImportation {
  return { total, valides: 0, inseres: 0, doublonsIgnores: 0, conflitsIgnores: 0, lignesVidesIgnorees: lignesVides }
}

function empreintePlan(plan: PlanImportation): string {
  return creerHachage('sha256').update(JSON.stringify(plan)).digest('hex')
}

function serialiserValeurs(valeurs: unknown[]): string {
  return JSON.stringify(valeurs.map((valeur) => valeur === null ? ['nul'] : [typeof valeur, String(valeur)]))
}

function preparer(plan: PlanImportation): Preparation {
  const source = obtenirSource(plan.idSource)
  const inspection = source.inspection!
  const problemes: ProblemeImportation[] = []
  const compteurs = compteursVides(source.donnees!.length, inspection.lignesVides)
  const correspondances = plan.correspondances.filter((correspondance) => correspondance.incluse && correspondance.destination)
  const colonnesIncluses = new Set(correspondances.map((correspondance) => correspondance.idSource))
  for (const formule of source.formulesSansResultat ?? []) {
    const idColonne = `col_${formule.colonne}`
    if (formule.feuille === plan.feuille && formule.numero > (plan.ligneEntete ?? 0) && colonnesIncluses.has(idColonne)) {
      problemes.push({
        code: 'FORMULE_SANS_RESULTAT',
        gravite: 'erreur',
        message: 'Cette formule ne contient aucun résultat enregistré.',
        enregistrement: formule.numero,
        colonne: inspection.colonnes.find((colonne) => colonne.id === idColonne)?.nom,
        actionSuggeree: 'Ouvrez le classeur, recalculez les formules, enregistrez-le puis rechargez-le.'
      })
    }
  }
  const destinations = new Set<string>()
  for (const correspondance of correspondances) {
    if (destinations.has(correspondance.destination)) {
      problemes.push({ code: 'DESTINATION_DOUBLE', gravite: 'erreur', message: `La colonne « ${correspondance.destination} » reçoit plusieurs colonnes source.`, colonne: correspondance.destination, actionSuggeree: 'Choisissez une seule source pour cette colonne.' })
    }
    destinations.add(correspondance.destination)
  }
  const lignes: LignePreparee[] = source.donnees!.map((ligne) => {
    const valeurs: Record<string, string | number | boolean | null> = {}
    let bloquee = false
    for (const correspondance of correspondances) {
      const originale = ligne.valeurs[correspondance.idSource]
      const conversion = convertirValeur(originale, correspondance.typeCible, correspondance.regles)
      if (conversion.probleme) {
        bloquee = true
        problemes.push({
          ...conversion.probleme,
          enregistrement: ligne.numero,
          colonne: inspection.colonnes.find((colonne) => colonne.id === correspondance.idSource)?.nom,
          valeurOriginale: originale === null ? '(vide)' : String(originale).slice(0, 300)
        })
      } else valeurs[correspondance.destination] = conversion.valeur
    }
    return { numero: ligne.numero, valeurs, bloquee }
  })
  const apercu: LigneApercu[] = lignes.slice(0, 50).map((ligne) => ({ numero: ligne.numero, valeurs: ligne.valeurs as Record<string, ValeurCellule> }))
  compteurs.valides = lignes.filter((ligne) => !ligne.bloquee).length
  return { lignes, problemes, compteurs, apercu }
}

function appliquerDoublonsInternes(plan: PlanImportation, preparation: Preparation): void {
  const correspondances = plan.correspondances.filter((correspondance) => correspondance.incluse && correspondance.destination)
  const colonnesCharge = correspondances.map((correspondance) => correspondance.destination)
  const colonnesCle = plan.doublons.mode === 'ligne_exacte' ? colonnesCharge : plan.doublons.colonnesCles
  if (plan.doublons.mode === 'cles' && !colonnesCle.length) {
    preparation.problemes.push({ code: 'CLE_ABSENTE', gravite: 'erreur', message: 'Sélectionnez au moins une colonne clé pour ignorer les doublons.', actionSuggeree: 'Cochez une ou plusieurs clés dans la zone de correspondance.' })
    return
  }
  const groupes = new Map<string, LignePreparee[]>()
  for (const ligne of preparation.lignes.filter((candidate) => !candidate.bloquee)) {
    const valeursCle = colonnesCle.map((colonne) => ligne.valeurs[colonne])
    if (plan.doublons.mode === 'cles' && valeursCle.some((valeur) => valeur === null || valeur === undefined || valeur === '')) {
      ligne.bloquee = true
      preparation.problemes.push({ code: 'CLE_VIDE', gravite: 'erreur', message: 'Une clé de doublon est vide.', enregistrement: ligne.numero, actionSuggeree: 'Renseignez toutes les colonnes clés ou choisissez une autre règle.' })
      continue
    }
    const cle = serialiserValeurs(valeursCle)
    const groupe = groupes.get(cle) ?? []
    groupe.push(ligne)
    groupes.set(cle, groupe)
  }
  for (const groupe of groupes.values()) {
    if (groupe.length < 2) continue
    const charges = new Set(groupe.map((ligne) => serialiserValeurs(colonnesCharge.map((colonne) => ligne.valeurs[colonne]))))
    if (charges.size > 1 && plan.doublons.mode === 'cles') {
      for (const ligne of groupe) ligne.bloquee = true
      preparation.compteurs.conflitsIgnores += groupe.length
      preparation.problemes.push({ code: 'CONFLIT_CLE_SOURCE', gravite: 'avertissement', message: `${groupe.length} lignes partagent la même clé mais contiennent des valeurs différentes ; elles seront toutes ignorées.`, enregistrement: groupe[0].numero, actionSuggeree: 'Corrigez les lignes en conflit dans le fichier source.' })
    } else {
      for (const ligne of groupe.slice(1)) {
        ligne.bloquee = true
        preparation.compteurs.doublonsIgnores += 1
      }
    }
  }
}

async function verifierDoublonsBase(client: ClientBase, plan: PlanImportation, preparation: Preparation): Promise<void> {
  if (plan.modeDestination === 'nouvelle') return
  const correspondances = plan.correspondances.filter((correspondance) => correspondance.incluse && correspondance.destination)
  const colonnesCharge = correspondances.map((correspondance) => correspondance.destination)
  const colonnesCle = plan.doublons.mode === 'ligne_exacte' ? colonnesCharge : plan.doublons.colonnesCles
  const table = `${citerIdentifiant(plan.schema)}.${citerIdentifiant(plan.table)}`
  for (const ligne of preparation.lignes.filter((candidate) => !candidate.bloquee)) {
    const predicats = colonnesCle.map((colonne, index) => `${citerIdentifiant(colonne)} IS NOT DISTINCT FROM $${index + 1}`)
    const parametres = colonnesCle.map((colonne) => ligne.valeurs[colonne])
    const selection = colonnesCharge.map(citerIdentifiant).join(', ')
    const resultat = await client.query<Record<string, unknown>>(`SELECT ${selection} FROM ${table} WHERE ${predicats.join(' AND ')} LIMIT 2`, parametres)
    if (!resultat.rowCount) continue
    const chargeSource = serialiserValeurs(colonnesCharge.map((colonne) => ligne.valeurs[colonne]))
    const identique = resultat.rows.some((existante) => serialiserValeurs(colonnesCharge.map((colonne) => existante[colonne])) === chargeSource)
    ligne.bloquee = true
    if (identique || plan.doublons.mode === 'ligne_exacte') preparation.compteurs.doublonsIgnores += 1
    else {
      preparation.compteurs.conflitsIgnores += 1
      preparation.problemes.push({ code: 'CONFLIT_CLE_BASE', gravite: 'avertissement', message: 'Cette clé existe déjà avec des valeurs différentes ; la ligne sera ignorée sans modifier la table.', enregistrement: ligne.numero, actionSuggeree: 'Vérifiez la ligne existante ou choisissez une autre clé.' })
    }
  }
}

async function verifierStructure(plan: PlanImportation, problemes: ProblemeImportation[]): Promise<void> {
  const connexion = obtenirConnexion(plan.idConnexion)
  if (plan.modeDestination === 'nouvelle') {
    const resultat = await connexion.groupe.query<{ existe: boolean; creation_autorisee: boolean }>(`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2
        ) AS existe,
        has_schema_privilege(current_user, $1, 'CREATE') AS creation_autorisee
    `, [plan.schema, plan.table])
    if (resultat.rows[0]?.existe) problemes.push({ code: 'COLLISION_TABLE', gravite: 'erreur', message: `La table « ${plan.schema}.${plan.table} » existe déjà.`, actionSuggeree: 'Choisissez un autre nom ; aucune table existante ne sera remplacée.' })
    if (!resultat.rows[0]?.creation_autorisee) problemes.push({ code: 'CREATION_INTERDITE', gravite: 'erreur', message: `Ce compte ne peut pas créer de table dans le schéma « ${plan.schema} ».`, actionSuggeree: 'Choisissez un schéma autorisé ou demandez le privilège CREATE.' })
    return
  }
  const description = await decrireTable(plan.idConnexion, plan.schema, plan.table)
  if (plan.empreinteTable && description.empreinte !== plan.empreinteTable) {
    problemes.push({ code: 'SCHEMA_MODIFIE', gravite: 'erreur', message: 'La structure de la table a changé depuis sa sélection.', actionSuggeree: 'Actualisez la table et vérifiez de nouveau les correspondances.' })
  }
  const mappees = new Set(plan.correspondances.filter((correspondance) => correspondance.incluse).map((correspondance) => correspondance.destination))
  for (const colonne of description.colonnes) {
    if (!colonne.nullable && !colonne.valeurParDefaut && !colonne.generee && !colonne.identite && !mappees.has(colonne.nom)) {
      problemes.push({ code: 'COLONNE_REQUISE', gravite: 'erreur', message: `La colonne obligatoire « ${colonne.nom} » n’est pas alimentée.`, colonne: colonne.nom, actionSuggeree: 'Mappez une colonne source vers ce champ.' })
    }
  }
  const privilege = await connexion.groupe.query<{ autorise: boolean }>(`
    SELECT has_table_privilege(current_user, c.oid, 'INSERT') AS autorise
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1 AND c.relname = $2
  `, [plan.schema, plan.table])
  if (!privilege.rows[0]?.autorise) problemes.push({ code: 'INSERTION_INTERDITE', gravite: 'erreur', message: `Ce compte ne peut pas insérer dans « ${plan.schema}.${plan.table} ».`, actionSuggeree: 'Utilisez un compte disposant du privilège INSERT.' })
}

export async function validerPlan(plan: PlanImportation): Promise<ResultatValidation> {
  const empreinteValide = await verifierEmpreinteSource(plan.idSource, plan.empreinteSource)
  const preparation = preparer(plan)
  if (!empreinteValide) preparation.problemes.unshift({ code: 'SOURCE_MODIFIEE', gravite: 'erreur', message: 'Le fichier source a changé depuis son ouverture.', actionSuggeree: 'Rechargez le fichier avant de continuer.' })
  await verifierStructure(plan, preparation.problemes)
  appliquerDoublonsInternes(plan, preparation)
  if (!preparation.problemes.some((probleme) => probleme.gravite === 'erreur')) {
    const connexion = obtenirConnexion(plan.idConnexion)
    const client = await connexion.groupe.connect()
    try {
      await verifierDoublonsBase(client, plan, preparation)
    } finally {
      client.release()
    }
  }
  return {
    empreintePlan: empreintePlan(plan),
    peutImporter: !preparation.problemes.some((probleme) => probleme.gravite === 'erreur'),
    problemes: preparation.problemes,
    compteurs: preparation.compteurs,
    apercuPrepare: preparation.apercu
  }
}

function instructionCreation(plan: PlanImportation): string {
  const typesAutorises = new Set(['text', 'integer', 'bigint', 'numeric', 'boolean', 'date', 'timestamp without time zone'])
  const colonnes = plan.correspondances
    .filter((correspondance) => correspondance.incluse && correspondance.destination)
    .map((correspondance) => {
      if (!typesAutorises.has(correspondance.typeCible)) throw new Error('TYPE_CREATION_INTERDIT')
      return `${citerIdentifiant(correspondance.destination)} ${correspondance.typeCible}`
    })
  if (!colonnes.length) throw new Error('Aucune colonne n’est définie pour la nouvelle table.')
  return `CREATE TABLE ${citerIdentifiant(plan.schema)}.${citerIdentifiant(plan.table)} (${colonnes.join(', ')})`
}

export function annulerTravail(idTravail: string): boolean {
  const etat = travaux.get(idTravail)
  if (!etat) return false
  etat.annule = true
  return true
}

export function demarrerImportation(
  plan: PlanImportation,
  emettreProgression: (progression: ProgressionTravail) => void,
  terminer: (idTravail: string, resultat: ResultatImportation) => void
): string {
  const idTravail = creerIdentifiant()
  const etat: EtatTravail = { annule: false }
  travaux.set(idTravail, etat)
  void (async () => {
    const compteurs = compteursVides(0, 0)
    const connexion = obtenirConnexion(plan.idConnexion)
    const client = await connexion.groupe.connect()
    let validationCommit = false
    let commitEnCours = false
    try {
      const valide = await validerPlan(plan)
      Object.assign(compteurs, valide.compteurs)
      if (!valide.peutImporter) {
        terminer(idTravail, { reussi: false, problemes: valide.problemes, compteurs })
        return
      }
      if (etat.annule) throw new Error('IMPORTATION_ANNULEE')
      await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query("SET LOCAL statement_timeout = '60s'")
      if (plan.modeDestination === 'nouvelle') {
        const collision = await client.query(`
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2
        `, [plan.schema, plan.table])
        if (collision.rowCount) throw new Error('COLLISION_TABLE')
        await client.query(instructionCreation(plan))
      } else {
        const description = await decrireTable(plan.idConnexion, plan.schema, plan.table)
        if (plan.empreinteTable && description.empreinte !== plan.empreinteTable) throw new Error('SCHEMA_MODIFIE')
        await client.query(`LOCK TABLE ${citerIdentifiant(plan.schema)}.${citerIdentifiant(plan.table)} IN SHARE ROW EXCLUSIVE MODE`)
      }
      const preparation = preparer(plan)
      appliquerDoublonsInternes(plan, preparation)
      await verifierDoublonsBase(client, plan, preparation)
      const lignes = preparation.lignes.filter((ligne) => !ligne.bloquee)
      compteurs.doublonsIgnores = preparation.compteurs.doublonsIgnores
      compteurs.conflitsIgnores = preparation.compteurs.conflitsIgnores
      const colonnes = plan.correspondances.filter((correspondance) => correspondance.incluse && correspondance.destination).map((correspondance) => correspondance.destination)
      const table = `${citerIdentifiant(plan.schema)}.${citerIdentifiant(plan.table)}`
      for (let index = 0; index < lignes.length; index += 1) {
        if (etat.annule) throw new Error('IMPORTATION_ANNULEE')
        const ligne = lignes[index]
        const parametres = colonnes.map((colonne) => ligne.valeurs[colonne])
        const marqueurs = colonnes.map((_, position) => `$${position + 1}`).join(', ')
        await client.query(`INSERT INTO ${table} (${colonnes.map(citerIdentifiant).join(', ')}) VALUES (${marqueurs})`, parametres)
        compteurs.inseres += 1
        if (index % 25 === 0 || index === lignes.length - 1) emettreProgression({ idTravail, phase: 'insertion', lignesTraitees: index + 1, totalLignes: lignes.length, compteurs: { ...compteurs } })
      }
      commitEnCours = true
      await client.query('COMMIT')
      validationCommit = true
      commitEnCours = false
      emettreProgression({ idTravail, phase: 'termine', lignesTraitees: lignes.length, totalLignes: lignes.length, compteurs: { ...compteurs } })
      terminer(idTravail, { reussi: true, problemes: preparation.problemes, compteurs })
    } catch (erreur) {
      if (!validationCommit) await client.query('ROLLBACK').catch(() => undefined)
      let probleme: ProblemeImportation
      const message = erreur instanceof Error ? erreur.message : String(erreur)
      const codeBase = (erreur as { code?: string }).code ?? ''
      if (message === 'IMPORTATION_ANNULEE') probleme = { code: 'IMPORTATION_ANNULEE', gravite: 'information', message: 'L’importation a été annulée. Aucune donnée n’a été ajoutée.' }
      else if (message === 'COLLISION_TABLE') probleme = { code: 'COLLISION_TABLE', gravite: 'erreur', message: 'Une table de ce nom existe déjà. Aucune table n’a été remplacée.', actionSuggeree: 'Choisissez un autre nom et validez de nouveau.' }
      else if (message === 'SCHEMA_MODIFIE') probleme = { code: 'SCHEMA_MODIFIE', gravite: 'erreur', message: 'La structure de la table a changé avant l’importation.', actionSuggeree: 'Actualisez la destination et validez de nouveau.' }
      else if (message === 'TYPE_CREATION_INTERDIT') probleme = { code: 'TYPE_CREATION_INTERDIT', gravite: 'erreur', message: 'Un type proposé pour la nouvelle table n’est pas autorisé.', actionSuggeree: 'Choisissez un type proposé par l’application et validez de nouveau.' }
      else if (commitEnCours && codeBase.startsWith('08')) probleme = { code: 'RESULTAT_INDETERMINE', gravite: 'erreur', message: 'Connexion perdue ; le résultat de l’importation n’a pas pu être confirmé.', actionSuggeree: 'Reconnectez-vous et contrôlez la table avant toute nouvelle tentative. L’application ne réessaiera pas automatiquement.' }
      else probleme = problemeBase(erreur, 'L’importation a échoué. Aucune ligne de cette transaction n’a été conservée.')
      emettreProgression({ idTravail, phase: message === 'IMPORTATION_ANNULEE' ? 'annule' : 'termine', lignesTraitees: compteurs.inseres, totalLignes: compteurs.total, compteurs: { ...compteurs, inseres: 0 } })
      terminer(idTravail, { reussi: false, problemes: [probleme], compteurs: { ...compteurs, inseres: 0 } })
    } finally {
      travaux.delete(idTravail)
      client.release()
    }
  })()
  return idTravail
}
