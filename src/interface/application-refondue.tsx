import {
  useCallback as utiliserRappel,
  useEffect as utiliserEffet,
  useMemo as utiliserMemoire,
  useState as utiliserEtat
} from 'react'
import type { ReactNode as NoeudReact } from 'react'
import type {
  ConfigurationConnexion,
  ConnexionEtablie,
  CorrespondanceColonne,
  DescriptionTable,
  EtatConnexion,
  InspectionSource,
  ModeDestination,
  PlanImportation,
  ProgressionTravail,
  ResultatImportation,
  ResultatValidation,
  TableDestination,
  TypeCreation
} from '../partage/modeles'

type Onglet = 'correspondances' | 'apercu' | 'resultats'
type Notification = { message: string; variante: 'succes' | 'erreur' }

const typesCreation: { valeur: TypeCreation; sql: string; libelle: string }[] = [
  { valeur: 'texte', sql: 'text', libelle: 'Texte' },
  { valeur: 'entier', sql: 'integer', libelle: 'Entier' },
  { valeur: 'grand_entier', sql: 'bigint', libelle: 'Grand entier' },
  { valeur: 'decimal', sql: 'numeric', libelle: 'Décimal exact' },
  { valeur: 'booleen', sql: 'boolean', libelle: 'Booléen' },
  { valeur: 'date', sql: 'date', libelle: 'Date' },
  { valeur: 'horodatage', sql: 'timestamp without time zone', libelle: 'Horodatage' }
]

const configurationInitiale: ConfigurationConnexion = {
  emplacement: 'local',
  hote: 'localhost',
  port: 5432,
  base: '',
  utilisateur: 'postgres',
  motDePasse: '',
  delaiSecondes: 10,
  ssl: 'desactive'
}

function normaliserNom(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'colonne'
}

function tailleLisible(octets: number): string {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`
}

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur)
}

function nomType(type: string): string {
  return type.replace('character varying', 'varchar').replace('timestamp without time zone', 'timestamp')
}

function Puce({ enfants, variante = 'neutre' }: { enfants: NoeudReact; variante?: 'neutre' | 'succes' | 'bleu' | 'alerte' }) {
  return <span className={`puce puce--${variante}`}>{enfants}</span>
}

function FenetreModale({ titre, fermer, children: enfants, pied }: { titre: string; fermer(): void; children: NoeudReact; pied: NoeudReact }) {
  return <div className="voile-modal" role="presentation" onMouseDown={(evenement) => { if (evenement.target === evenement.currentTarget) fermer() }}>
    <section className="fenetre-modal" role="dialog" aria-modal="true" aria-label={titre}>
      <header><h2>{titre}</h2><button className="bouton-icone" type="button" aria-label="Fermer" onClick={fermer}>×</button></header>
      <div className="contenu-modal">{enfants}</div>
      <footer>{pied}</footer>
    </section>
  </div>
}

export function ApplicationRefondue() {
  const [inspection, definirInspection] = utiliserEtat<InspectionSource | null>(null)
  const [chargementSource, definirChargementSource] = utiliserEtat(false)
  const [erreurSource, definirErreurSource] = utiliserEtat('')
  const [colonnesSelectionnees, definirColonnesSelectionnees] = utiliserEtat<Set<string>>(new Set())
  const [sourceOuverte, definirSourceOuverte] = utiliserEtat(false)

  const [configuration, definirConfiguration] = utiliserEtat(configurationInitiale)
  const [motDePasseVisible, definirMotDePasseVisible] = utiliserEtat(false)
  const [optionsConnexion, definirOptionsConnexion] = utiliserEtat(false)
  const [etatConnexion, definirEtatConnexion] = utiliserEtat<EtatConnexion>('deconnecte')
  const [connexion, definirConnexion] = utiliserEtat<ConnexionEtablie | null>(null)
  const [erreurConnexion, definirErreurConnexion] = utiliserEtat('')
  const [destinationOuverte, definirDestinationOuverte] = utiliserEtat(false)
  const [modeDestination, definirModeDestination] = utiliserEtat<ModeDestination>('existante')
  const [schema, definirSchema] = utiliserEtat('')
  const [tables, definirTables] = utiliserEtat<TableDestination[]>([])
  const [table, definirTable] = utiliserEtat('')
  const [description, definirDescription] = utiliserEtat<DescriptionTable | null>(null)

  const [correspondances, definirCorrespondances] = utiliserEtat<Record<string, CorrespondanceColonne>>({})
  const [modeDoublon, definirModeDoublon] = utiliserEtat<'ligne_exacte' | 'cles'>('ligne_exacte')
  const [clesDoublon, definirClesDoublon] = utiliserEtat<Set<string>>(new Set())
  const [colonneRegles, definirColonneRegles] = utiliserEtat<string | null>(null)
  const [pageCorrespondances, definirPageCorrespondances] = utiliserEtat(1)

  const [onglet, definirOnglet] = utiliserEtat<Onglet>('correspondances')
  const [apercuPrepare, definirApercuPrepare] = utiliserEtat(false)
  const [pageApercu, definirPageApercu] = utiliserEtat(1)
  const [validation, definirValidation] = utiliserEtat<ResultatValidation | null>(null)
  const [validationActive, definirValidationActive] = utiliserEtat(false)
  const [progression, definirProgression] = utiliserEtat<ProgressionTravail | null>(null)
  const [idTravail, definirIdTravail] = utiliserEtat<string | null>(null)
  const [resultat, definirResultat] = utiliserEtat<ResultatImportation | null>(null)
  const [notification, definirNotification] = utiliserEtat<Notification | null>(null)

  const invalider = utiliserRappel(() => {
    definirValidation(null)
    definirResultat(null)
    definirApercuPrepare(false)
  }, [])

  const appliquerInspection = utiliserRappel((nouvelle: InspectionSource) => {
    definirInspection(nouvelle)
    definirColonnesSelectionnees((precedentes) => {
      if (inspection?.identite.id === nouvelle.identite.id) {
        const presentes = new Set(nouvelle.colonnes.filter((colonne) => precedentes.has(colonne.id)).map((colonne) => colonne.id))
        return presentes.size ? presentes : new Set(nouvelle.colonnes.map((colonne) => colonne.id))
      }
      return new Set(nouvelle.colonnes.map((colonne) => colonne.id))
    })
    definirErreurSource('')
    definirPageCorrespondances(1)
    definirPageApercu(1)
    invalider()
  }, [inspection?.identite.id, invalider])

  const choisirSource = async () => {
    definirChargementSource(true)
    try {
      const nouvelle = await window.importateur.choisirSource()
      if (nouvelle) {
        appliquerInspection(nouvelle)
        definirSourceOuverte(true)
      }
    } catch (erreur) {
      definirErreurSource(messageErreur(erreur))
    } finally {
      definirChargementSource(false)
    }
  }

  const reInspecter = async (changements: Record<string, unknown>) => {
    if (!inspection) return
    definirChargementSource(true)
    try {
      const nouvelle = await window.importateur.inspecterSource({
        idSource: inspection.identite.id,
        feuille: inspection.feuille,
        modeEntete: inspection.modeEntete,
        ligneEntete: inspection.ligneEntete ?? undefined,
        separateur: inspection.format.separateur as ',' | ';' | '\t' | undefined,
        encodage: inspection.format.encodage as 'utf8' | 'windows-1252' | 'latin1' | undefined,
        ...changements
      })
      appliquerInspection(nouvelle)
    } catch (erreur) {
      definirErreurSource(messageErreur(erreur))
    } finally {
      definirChargementSource(false)
    }
  }

  const modifierConfiguration = <C extends keyof ConfigurationConnexion>(champ: C, valeur: ConfigurationConnexion[C]) => {
    definirConfiguration((actuelle) => ({ ...actuelle, [champ]: valeur }))
    if (connexion) definirEtatConnexion('perime')
    invalider()
  }

  const connecter = async () => {
    definirEtatConnexion('connexion')
    definirErreurConnexion('')
    try {
      if (connexion) await window.importateur.deconnecter(connexion.id).catch(() => undefined)
      const nouvelle = await window.importateur.connecter(configuration)
      definirConnexion(nouvelle)
      definirEtatConnexion('connecte')
      definirSchema(nouvelle.schemas.includes('public') ? 'public' : nouvelle.schemas[0] ?? '')
      definirTable('')
      definirDescription(null)
      invalider()
    } catch (erreur) {
      definirConnexion(null)
      definirEtatConnexion('echec')
      definirErreurConnexion(messageErreur(erreur))
    }
  }

  const deconnecter = async () => {
    if (connexion) await window.importateur.deconnecter(connexion.id).catch(() => undefined)
    definirConnexion(null)
    definirEtatConnexion('deconnecte')
    definirTables([])
    definirTable('')
    definirDescription(null)
    invalider()
  }

  const chargerTables = utiliserRappel(async () => {
    if (!connexion || !schema || etatConnexion !== 'connecte') return
    try {
      const liste = await window.importateur.listerTables(connexion.id, schema)
      definirTables(liste)
      if (modeDestination === 'existante') definirTable((actuelle) => {
        if (liste.some((candidate) => candidate.nom === actuelle)) return actuelle
        definirDescription(null)
        return ''
      })
    } catch (erreur) {
      definirErreurConnexion(messageErreur(erreur))
    }
  }, [connexion, schema, etatConnexion, modeDestination])

  utiliserEffet(() => { void chargerTables() }, [chargerTables])

  utiliserEffet(() => {
    if (!connexion || !schema || !table || modeDestination !== 'existante') {
      definirDescription(null)
      return
    }
    void window.importateur.decrireTable(connexion.id, schema, table)
      .then((nouvelle) => { definirDescription(nouvelle); invalider() })
      .catch((erreur) => definirErreurConnexion(messageErreur(erreur)))
  }, [connexion, schema, table, modeDestination, invalider])

  const chargerStructureDestination = async (): Promise<boolean> => {
    if (modeDestination === 'nouvelle') {
      definirDescription(null)
      return true
    }
    if (!connexion || etatConnexion !== 'connecte' || !schema || !table) return false
    try {
      const nouvelle = await window.importateur.decrireTable(connexion.id, schema, table)
      definirDescription(nouvelle)
      definirErreurConnexion('')
      invalider()
      return true
    } catch (erreur) {
      definirDescription(null)
      definirErreurConnexion(messageErreur(erreur))
      definirDestinationOuverte(true)
      return false
    }
  }

  const appliquerDestination = async () => {
    const chargee = await chargerStructureDestination()
    if (chargee) definirDestinationOuverte(false)
  }

  utiliserEffet(() => {
    if (!inspection) return
    definirCorrespondances((precedentes) => {
      const suivantes: Record<string, CorrespondanceColonne> = {}
      const destinations = description?.colonnes.filter((colonne) => !colonne.generee && !colonne.identite) ?? []
      const dejaPrises = new Set<string>()
      for (const colonne of inspection.colonnes) {
        const precedente = precedentes[colonne.id]
        if (precedente && (modeDestination === 'nouvelle' || destinations.some((destination) => destination.nom === precedente.destination))) {
          suivantes[colonne.id] = { ...precedente, incluse: colonnesSelectionnees.has(colonne.id) && precedente.incluse }
          if (precedente.destination) dejaPrises.add(precedente.destination)
          continue
        }
        if (modeDestination === 'existante') {
          const cible = destinations.find((destination) => normaliserNom(destination.nom) === normaliserNom(colonne.nom) && !dejaPrises.has(destination.nom))
          suivantes[colonne.id] = {
            idSource: colonne.id,
            incluse: colonnesSelectionnees.has(colonne.id),
            destination: cible?.nom ?? '',
            typeCible: cible?.type ?? '',
            regles: { blancs: 'nul' }
          }
          if (cible) dejaPrises.add(cible.nom)
        } else {
          const base = normaliserNom(colonne.nom)
          let nom = base
          let suffixe = 2
          while (dejaPrises.has(nom)) nom = `${base}_${suffixe++}`
          dejaPrises.add(nom)
          const type = typesCreation.find((candidate) => candidate.valeur === colonne.typeSuggere)!
          suivantes[colonne.id] = {
            idSource: colonne.id,
            incluse: colonnesSelectionnees.has(colonne.id),
            destination: nom,
            typeCible: type.sql,
            regles: { blancs: 'nul' }
          }
        }
      }
      return suivantes
    })
  }, [inspection, description, modeDestination, colonnesSelectionnees])

  utiliserEffet(() => {
    const retirerProgression = window.importateur.ecouterProgression((nouvelle) => definirProgression(nouvelle))
    const retirerResultat = window.importateur.ecouterResultat(({ idTravail: id, resultat: nouveau }) => {
      if (idTravail && id !== idTravail) return
      definirResultat(nouveau)
      definirIdTravail(null)
      if (nouveau.reussi) {
        definirNotification({
          variante: 'succes',
          message: nouveau.compteurs.inseres > 0
            ? `Importation terminée : ${nouveau.compteurs.inseres} nouvelle${nouveau.compteurs.inseres > 1 ? 's' : ''} ligne${nouveau.compteurs.inseres > 1 ? 's' : ''} ajoutée${nouveau.compteurs.inseres > 1 ? 's' : ''}.`
            : 'Importation terminée : aucun nouvel enregistrement à ajouter.'
        })
        definirOnglet('correspondances')
      } else {
        definirNotification({ variante: 'erreur', message: 'L’importation a échoué. Consultez le rapport pour corriger le problème.' })
        definirOnglet('resultats')
      }
    })
    return () => { retirerProgression(); retirerResultat() }
  }, [idTravail])

  utiliserEffet(() => {
    if (!notification) return
    const minuterie = window.setTimeout(() => definirNotification(null), 6000)
    return () => window.clearTimeout(minuterie)
  }, [notification])

  const modifierCorrespondance = (id: string, changement: Partial<CorrespondanceColonne>) => {
    definirCorrespondances((actuelles) => ({ ...actuelles, [id]: { ...actuelles[id], ...changement } }))
    invalider()
  }

  const correspondancesActives = utiliserMemoire(() => inspection?.colonnes
    .filter((colonne) => colonnesSelectionnees.has(colonne.id))
    .map((colonne) => correspondances[colonne.id])
    .filter((correspondance): correspondance is CorrespondanceColonne => Boolean(correspondance?.incluse)) ?? [], [inspection, colonnesSelectionnees, correspondances])

  const plan = utiliserMemoire<PlanImportation | null>(() => {
    if (!inspection || !connexion || !schema || !table || etatConnexion !== 'connecte') return null
    if (modeDestination === 'existante' && !description) return null
    if (!correspondancesActives.length || correspondancesActives.some((correspondance) => !correspondance.destination || !correspondance.typeCible)) return null
    return {
      idSource: inspection.identite.id,
      empreinteSource: inspection.identite.empreinte,
      feuille: inspection.feuille,
      modeEntete: inspection.modeEntete,
      ligneEntete: inspection.ligneEntete,
      colonnesSource: [...colonnesSelectionnees],
      idConnexion: connexion.id,
      modeDestination,
      schema,
      table,
      empreinteTable: modeDestination === 'existante' ? description?.empreinte : undefined,
      correspondances: correspondancesActives,
      doublons: { mode: modeDoublon, colonnesCles: [...clesDoublon] }
    }
  }, [inspection, connexion, schema, table, etatConnexion, modeDestination, description, correspondancesActives, colonnesSelectionnees, modeDoublon, clesDoublon])

  const raisonBlocage = utiliserMemoire(() => {
    if (!inspection) return 'Sélectionnez un fichier source.'
    if (!connexion || etatConnexion !== 'connecte') return 'Connectez une base PostgreSQL.'
    if (!schema) return 'Choisissez un schéma PostgreSQL.'
    if (!table) return modeDestination === 'existante' ? 'Choisissez une table existante.' : 'Saisissez le nom de la nouvelle table.'
    if (modeDestination === 'existante' && !description) return 'Chargez la structure de la table PostgreSQL.'
    if (!correspondancesActives.length) return 'Incluez au moins une colonne.'
    const nonMappees = correspondancesActives.filter((correspondance) => !correspondance.destination || !correspondance.typeCible).length
    if (nonMappees) return `${nonMappees} colonne${nonMappees > 1 ? 's incluses ne sont' : ' incluse n’est'} pas mappée${nonMappees > 1 ? 's' : ''}.`
    return 'Configuration prête à être validée.'
  }, [inspection, connexion, etatConnexion, schema, table, modeDestination, correspondancesActives])

  const valider = async () => {
    if (!plan) return
    definirValidationActive(true)
    definirResultat(null)
    try {
      const nouvelle = await window.importateur.valider(plan)
      definirValidation(nouvelle)
      if (!nouvelle.peutImporter) definirOnglet('resultats')
    } catch (erreur) {
      definirValidation({
        empreintePlan: '',
        peutImporter: false,
        compteurs: { total: 0, valides: 0, inseres: 0, doublonsIgnores: 0, conflitsIgnores: 0, lignesVidesIgnorees: 0 },
        apercuPrepare: [],
        problemes: [{ code: 'VALIDATION_INTERROMPUE', gravite: 'erreur', message: messageErreur(erreur) }]
      })
      definirOnglet('resultats')
    } finally {
      definirValidationActive(false)
    }
  }

  const importer = async () => {
    if (!plan || !validation?.peutImporter) return
    definirResultat(null)
    definirProgression(null)
    const demarrage = await window.importateur.importer(plan)
    definirIdTravail(demarrage.idTravail)
  }

  const colonnesAffichees = inspection?.colonnes.filter((colonne) => colonnesSelectionnees.has(colonne.id)) ?? []
  const parPageCorrespondances = 5
  const totalPagesCorrespondances = Math.max(1, Math.ceil(colonnesAffichees.length / parPageCorrespondances))
  const pageCorrespondancesBornee = Math.min(pageCorrespondances, totalPagesCorrespondances)
  const colonnesPage = colonnesAffichees.slice((pageCorrespondancesBornee - 1) * parPageCorrespondances, pageCorrespondancesBornee * parPageCorrespondances)

  const lignesApercu = apercuPrepare && validation ? validation.apercuPrepare : inspection?.apercu ?? []
  const colonnesApercu = apercuPrepare && validation
    ? [...new Set(validation.apercuPrepare.flatMap((ligne) => Object.keys(ligne.valeurs)))]
    : colonnesAffichees.map((colonne) => colonne.id)
  const parPageApercu = 6
  const totalPagesApercu = Math.max(1, Math.ceil(lignesApercu.length / parPageApercu))
  const pageApercuBornee = Math.min(pageApercu, totalPagesApercu)
  const lignesPageApercu = lignesApercu.slice((pageApercuBornee - 1) * parPageApercu, pageApercuBornee * parPageApercu)
  const nomColonneApercu = (id: string) => apercuPrepare ? id : inspection?.colonnes.find((colonne) => colonne.id === id)?.nom ?? id

  const nombrePret = validation ? Math.max(0, validation.compteurs.valides - validation.compteurs.doublonsIgnores - validation.compteurs.conflitsIgnores) : inspection?.totalLignes ?? 0
  const problemes = resultat?.problemes ?? validation?.problemes ?? []
  const correspondanceRegles = colonneRegles ? correspondances[colonneRegles] : undefined
  const sourceRegles = inspection?.colonnes.find((colonne) => colonne.id === colonneRegles)

  return <div className="application-refondue">
    {notification && <div className={`notification-operation notification-operation--${notification.variante}`} role="status" aria-live="polite"><span>{notification.variante === 'succes' ? '✓' : '!'}</span><strong>{notification.message}</strong><button className="bouton-icone" aria-label="Fermer la notification" onClick={() => definirNotification(null)}>×</button></div>}
    <header className="entete-application">
      <div className="marque"><span className="logo-base">▤</span><strong>Feuille vers PostgreSQL</strong><span>Import sécurisé Excel et CSV</span></div>
      <div className="etat-entete">
        <span className={`etat-connexion etat-connexion--${etatConnexion}`}><i />{connexion ? `Connecté (${connexion.hote}:${configuration.port})` : etatConnexion === 'connexion' ? 'Connexion…' : 'Non connecté'}</span>
        {connexion && <button className="bouton-texte" type="button" onClick={() => void deconnecter()}>Déconnecter</button>}
      </div>
    </header>

    <main className="espace-travail">
      <section className={`banniere-etat ${resultat?.reussi || validation?.peutImporter ? 'banniere-etat--succes' : validation ? 'banniere-etat--erreur' : ''}`}>
        <span className="icone-etat">{resultat?.reussi || validation?.peutImporter ? '✓' : validation ? '!' : '→'}</span>
        <div>
          <strong>{resultat?.reussi
            ? `Importation terminée : ${resultat.compteurs.inseres} ligne${resultat.compteurs.inseres > 1 ? 's' : ''} ajoutée${resultat.compteurs.inseres > 1 ? 's' : ''}.`
            : validation?.peutImporter
              ? `Validation réussie : ${nombrePret} ligne${nombrePret > 1 ? 's' : ''} prête${nombrePret > 1 ? 's' : ''} à être importée${nombrePret > 1 ? 's' : ''} dans ${schema}.${table}.`
              : validation
                ? `${validation.problemes.filter((probleme) => probleme.gravite === 'erreur').length} problème(s) bloquent l’importation.`
                : raisonBlocage}</strong>
          <small>{validation?.peutImporter ? 'Valider vérifie le fichier. Importer applique les écritures dans la base de données.' : 'La base existante ne sera jamais modifiée ou vidée automatiquement.'}</small>
        </div>
        <div className="actions-banniere">
          {validation && <button className="bouton-secondaire" type="button" onClick={() => definirOnglet('resultats')}>Voir le rapport</button>}
          {validation && <button className="bouton-secondaire" type="button" disabled={!plan || validationActive} onClick={() => void valider()}>Réessayer</button>}
        </div>
      </section>

      <section className="cartes-configuration">
        <article className="carte-resume">
          <span className="icone-carte">▧</span>
          {inspection ? <div><strong>{inspection.identite.nom}</strong><Puce enfants={`Feuille : ${inspection.feuille}`} /><small>{inspection.totalLignes} enregistrements · {inspection.colonnes.length} colonnes détectées</small></div> : <div><strong>Aucun fichier sélectionné</strong><small>CSV, XLSX ou XLS</small></div>}
          <button className="bouton-secondaire" type="button" onClick={() => inspection ? definirSourceOuverte(true) : void choisirSource()}>{inspection ? 'Modifier la source' : 'Parcourir les fichiers'}</button>
        </article>
        <article className="carte-resume">
          <span className="icone-carte">⌁</span>
          {connexion ? <div><strong>{connexion.hote}:{configuration.port} / {connexion.base}</strong>{schema && table && <Puce variante="succes" enfants={`${schema}.${table}`} />}<small>{modeDestination === 'existante' ? 'Table existante' : 'Nouvelle table'}{description?.colonnes.find((colonne) => colonne.primaire) ? ` · Clé primaire : ${description.colonnes.find((colonne) => colonne.primaire)?.nom}` : ''}</small></div> : <div><strong>Destination non configurée</strong><small>PostgreSQL local ou distant</small></div>}
          <button className="bouton-secondaire" type="button" onClick={() => definirDestinationOuverte(true)}>Configurer la destination</button>
        </article>
      </section>

      <nav className="onglets" aria-label="Espace de travail">
        <button className={onglet === 'correspondances' ? 'actif' : ''} onClick={() => definirOnglet('correspondances')}>Colonnes et correspondances ({correspondancesActives.length}/{colonnesAffichees.length})</button>
        <button className={onglet === 'apercu' ? 'actif' : ''} onClick={() => definirOnglet('apercu')}>Aperçu des données ({inspection?.totalLignes ?? 0} lignes)</button>
        <button className={onglet === 'resultats' ? 'actif' : ''} onClick={() => definirOnglet('resultats')}>Résultats et rapport{problemes.length ? ` (${problemes.length})` : ''}</button>
        <span className="pret-execution"><i />{validation?.peutImporter ? 'Prêt pour exécution' : plan ? 'Prêt à valider' : 'Configuration incomplète'}</span>
      </nav>

      <section className="zone-onglet">
        {onglet === 'correspondances' && <>
          {!inspection ? <div className="etat-vide-refonte"><strong>Commencez par choisir un fichier.</strong><button onClick={() => void choisirSource()}>Parcourir les fichiers</button></div> : <>
            {modeDestination === 'existante' && table && !description ? <div className="alerte-correspondance alerte-correspondance--action"><span>La structure de la table n’est pas chargée. Les champs PostgreSQL ne peuvent pas encore être proposés.</span><button className="bouton-secondaire" onClick={() => void chargerStructureDestination()}>Recharger la table</button></div> : correspondancesActives.some((correspondance) => !correspondance.destination || !correspondance.typeCible) && <div className="alerte-correspondance">Chaque colonne incluse doit avoir une destination. Choisissez un champ PostgreSQL ou décochez la ligne.</div>}
            <div className="table-refonte"><table><thead><tr><th><input aria-label="Tout inclure" type="checkbox" checked={correspondancesActives.length === colonnesAffichees.length && colonnesAffichees.length > 0} onChange={(evenement) => { definirCorrespondances((actuelles) => Object.fromEntries(Object.entries(actuelles).map(([id, correspondance]) => [id, { ...correspondance, incluse: evenement.target.checked }]))); invalider() }} /></th><th>Colonne source</th><th>Champ PostgreSQL</th><th>Type cible</th><th>Règles de conversion</th><th>Action</th>{modeDoublon === 'cles' && <th>Clé</th>}</tr></thead><tbody>
              {colonnesPage.map((colonne) => {
                const correspondance = correspondances[colonne.id]
                if (!correspondance) return null
                const destinations = description?.colonnes.filter((candidate) => !candidate.generee && !candidate.identite) ?? []
                return <tr key={colonne.id} className={correspondance.incluse && !correspondance.destination ? 'ligne-incomplete' : ''}>
                  <td><input type="checkbox" aria-label={`Inclure ${colonne.nom}`} checked={correspondance.incluse} onChange={(evenement) => modifierCorrespondance(colonne.id, { incluse: evenement.target.checked })} /></td>
                  <td><strong>{colonne.nom}</strong><small>Col. {colonne.index + 1} · Ex. : {colonne.exemples.slice(0, 2).join(', ') || 'valeurs vides'}</small></td>
                  <td>{modeDestination === 'existante' ? <select value={correspondance.destination} disabled={!correspondance.incluse || !description} onChange={(evenement) => { const cible = destinations.find((destination) => destination.nom === evenement.target.value); modifierCorrespondance(colonne.id, { destination: evenement.target.value, typeCible: cible?.type ?? '' }) }}><option value="">{description ? 'Non mappé' : 'Table non chargée'}</option>{destinations.map((destination) => <option key={destination.nom} value={destination.nom}>{destination.nom}</option>)}</select> : <input value={correspondance.destination} disabled={!correspondance.incluse} onChange={(evenement) => modifierCorrespondance(colonne.id, { destination: normaliserNom(evenement.target.value) })} />}</td>
                  <td>{modeDestination === 'existante' ? <code>{nomType(correspondance.typeCible) || '—'}</code> : <select value={correspondance.typeCible} disabled={!correspondance.incluse} onChange={(evenement) => modifierCorrespondance(colonne.id, { typeCible: evenement.target.value })}>{typesCreation.map((type) => <option key={type.valeur} value={type.sql}>{type.libelle}</option>)}</select>}</td>
                  <td><div className="liste-puces"><Puce enfants={correspondance.regles.blancs === 'chaine_vide' ? 'Conserver les vides' : 'Vide → NULL'} />{correspondance.regles.ordreDate && <Puce enfants={correspondance.regles.ordreDate === 'jour_mois_annee' ? 'Jour/mois/année' : 'Mois/jour/année'} />}{correspondance.regles.separateurDecimal && <Puce enfants={`Décimal : ${correspondance.regles.separateurDecimal}`} />}</div></td>
                  <td><button className="bouton-lien" type="button" disabled={!correspondance.incluse} onClick={() => definirColonneRegles(colonne.id)}>Règles…</button></td>
                  {modeDoublon === 'cles' && <td><input type="checkbox" aria-label={`Utiliser ${correspondance.destination} comme clé`} disabled={!correspondance.destination || !correspondance.incluse} checked={clesDoublon.has(correspondance.destination)} onChange={(evenement) => { definirClesDoublon((actuelles) => { const nouvelles = new Set(actuelles); if (evenement.target.checked) nouvelles.add(correspondance.destination); else nouvelles.delete(correspondance.destination); return nouvelles }); invalider() }} /></td>}
                </tr>
              })}
            </tbody></table></div>
            <div className="pied-tableau"><span>Affichage {colonnesAffichees.length ? (pageCorrespondancesBornee - 1) * parPageCorrespondances + 1 : 0} à {Math.min(pageCorrespondancesBornee * parPageCorrespondances, colonnesAffichees.length)} sur {colonnesAffichees.length} colonnes</span><Puce variante={correspondancesActives.every((correspondance) => correspondance.destination && correspondance.typeCible) ? 'succes' : 'alerte'} enfants={`${correspondancesActives.filter((correspondance) => correspondance.destination && correspondance.typeCible).length} correspondances valides`} /><div className="pagination"><button disabled={pageCorrespondancesBornee === 1} onClick={() => definirPageCorrespondances((page) => Math.max(1, page - 1))}>Précédent</button>{Array.from({ length: totalPagesCorrespondances }, (_, index) => <button key={index} className={pageCorrespondancesBornee === index + 1 ? 'actif' : ''} onClick={() => definirPageCorrespondances(index + 1)}>{index + 1}</button>)}<button disabled={pageCorrespondancesBornee === totalPagesCorrespondances} onClick={() => definirPageCorrespondances((page) => Math.min(totalPagesCorrespondances, page + 1))}>Suivant</button></div></div>
            <div className="options-doublons"><strong>Doublons :</strong><label><input type="radio" checked={modeDoublon === 'ligne_exacte'} onChange={() => { definirModeDoublon('ligne_exacte'); invalider() }} /> Ligne importée exacte</label><label><input type="radio" checked={modeDoublon === 'cles'} onChange={() => { definirModeDoublon('cles'); invalider() }} /> Colonnes clés sélectionnées</label></div>
          </>}
        </>}

        {onglet === 'apercu' && <>
          <div className="barre-apercu"><div><span>Mode d’affichage :</span><div className="segments-refonte"><button className={!apercuPrepare ? 'actif' : ''} onClick={() => { definirApercuPrepare(false); definirPageApercu(1) }}>Données brutes</button><button disabled={!validation} className={apercuPrepare ? 'actif' : ''} onClick={() => { definirApercuPrepare(true); definirPageApercu(1) }}>Données préparées</button></div></div><small>Aperçu de 50 lignes maximum · La validation contrôle tout le fichier</small></div>
          <div className="table-refonte table-apercu"><table><thead><tr><th>#</th>{colonnesApercu.map((id) => <th key={id}>{nomColonneApercu(id)}</th>)}</tr></thead><tbody>{lignesPageApercu.map((ligne) => <tr key={ligne.numero}><td>{ligne.numero}</td>{colonnesApercu.map((id) => <td key={id}>{ligne.valeurs[id] === null ? <em>NULL</em> : String(ligne.valeurs[id] ?? '')}</td>)}</tr>)}</tbody></table>{!lignesPageApercu.length && <div className="etat-vide-refonte">Aucune donnée à afficher.</div>}</div>
          <div className="pied-tableau"><span>Échantillon représentatif · Page {pageApercuBornee} sur {totalPagesApercu}</span><div className="pagination"><button disabled={pageApercuBornee === 1} onClick={() => definirPageApercu((page) => Math.max(1, page - 1))}>Précédent</button><button disabled={pageApercuBornee === totalPagesApercu} onClick={() => definirPageApercu((page) => Math.min(totalPagesApercu, page + 1))}>Suivant</button></div></div>
        </>}

        {onglet === 'resultats' && <>
          <div className="titre-resultats"><strong>Bilan de la dernière opération</strong><small>{validation || resultat ? `État actuel · ${schema}.${table}` : 'Aucune validation effectuée'}</small></div>
          <div className="cartes-compteurs">
            <div><b>{resultat?.compteurs.total ?? validation?.compteurs.total ?? 0}</b><span>Lignes lues</span></div>
            <div className="accent"><b>{resultat?.compteurs.valides ?? validation?.compteurs.valides ?? 0}</b><span>Lignes valides</span></div>
            <div><b>{resultat?.compteurs.doublonsIgnores ?? validation?.compteurs.doublonsIgnores ?? 0}</b><span>Doublons</span></div>
            <div><b>{resultat?.compteurs.conflitsIgnores ?? validation?.compteurs.conflitsIgnores ?? 0}</b><span>Conflits d’intégrité</span></div>
          </div>
          {problemes.length ? <div className="table-refonte table-problemes"><table><thead><tr><th>Gravité</th><th>Enregistrement</th><th>Colonne</th><th>Valeur originale</th><th>Problème</th><th>Action suggérée</th></tr></thead><tbody>{problemes.map((probleme, index) => <tr key={`${probleme.code}-${index}`}><td><Puce variante={probleme.gravite === 'erreur' ? 'alerte' : 'neutre'} enfants={probleme.gravite} /></td><td>{probleme.enregistrement ?? '—'}</td><td>{probleme.colonne ?? '—'}</td><td>{probleme.valeurOriginale ?? '—'}</td><td>{probleme.message}</td><td>{probleme.actionSuggeree ?? '—'}</td></tr>)}</tbody></table></div> : <div className="journal-resultat"><span>[Contrôle]</span> {validation?.peutImporter ? 'Contrôle d’intégrité réussi. Aucune erreur bloquante détectée.' : 'Validez le fichier pour afficher le rapport détaillé.'}</div>}
          <div className="actions-resultats"><button className="bouton-secondaire" disabled={!problemes.length} onClick={() => void window.importateur.exporterProblemes(problemes)}>Exporter le rapport d’exécution (CSV)</button></div>
        </>}
      </section>
    </main>

    <footer className="barre-actions-refondue">
      <div><span className="cadenas">♙</span><span>Transaction atomique : aucune table modifiée en cas d’erreur. Mots de passe non conservés.</span>{idTravail && progression && <progress value={progression.lignesTraitees} max={progression.totalLignes ?? 1} />}</div>
      <div>{idTravail ? <button className="bouton-danger" onClick={() => void window.importateur.annuler(idTravail)}>Annuler l’importation</button> : <><button className="bouton-secondaire" disabled={!plan || validationActive} title={!plan ? raisonBlocage : ''} onClick={() => void valider()}>{validationActive ? 'Validation…' : 'Valider le fichier'}</button><button className="bouton-principal" disabled={!plan || !validation?.peutImporter} title={!validation?.peutImporter ? 'Validez le fichier sans erreur avant d’importer.' : ''} onClick={() => void importer()}>↥ Importer les {nombrePret} lignes</button></>}</div>
    </footer>

    {sourceOuverte && <FenetreModale titre="Source : configuration du classeur" fermer={() => definirSourceOuverte(false)} pied={<><button className="bouton-secondaire" onClick={() => definirSourceOuverte(false)}>Annuler</button><button className="bouton-principal" disabled={!inspection} onClick={() => definirSourceOuverte(false)}>Appliquer</button></>}>
      <label>Fichier sélectionné<div className="champ-action"><input readOnly value={inspection?.identite.nom ?? ''} placeholder="Aucun fichier" /><button className="bouton-secondaire" onClick={() => void choisirSource()}>{chargementSource ? 'Lecture en cours…' : 'Parcourir les fichiers'}</button></div></label>
      {inspection && <>
        <div className="grille-modal">
          {inspection.identite.extension !== 'csv' && <label>Feuille de calcul<select value={inspection.feuille} onChange={(evenement) => void reInspecter({ feuille: evenement.target.value })}>{inspection.identite.feuilles.map((feuille) => <option key={feuille.nom} value={feuille.nom}>{feuille.nom}{feuille.vide ? ' (vide)' : ''}</option>)}</select></label>}
          {inspection.identite.extension === 'csv' && <><label>Encodage des caractères<select value={inspection.format.encodage} onChange={(evenement) => void reInspecter({ encodage: evenement.target.value })}><option value="utf8">UTF-8</option><option value="windows-1252">Windows-1252</option><option value="latin1">Latin-1</option></select></label><label>Séparateur<select value={inspection.format.separateur} onChange={(evenement) => void reInspecter({ separateur: evenement.target.value })}><option value=",">Virgule</option><option value=";">Point-virgule</option><option value="\t">Tabulation</option></select></label></>}
        </div>
        <fieldset className="choix-entete"><legend>Détection de la ligne d’en-tête</legend><label className={inspection.modeEntete === 'automatique' ? 'actif' : ''}><input type="radio" checked={inspection.modeEntete === 'automatique'} onChange={() => void reInspecter({ modeEntete: 'automatique' })} /> Ligne {inspection.ligneEntete ?? 1} (Auto)</label><label className={inspection.modeEntete === 'ligne' ? 'actif' : ''}><input type="radio" checked={inspection.modeEntete === 'ligne'} onChange={() => void reInspecter({ modeEntete: 'ligne' })} /> Ligne choisie</label><label className={inspection.modeEntete === 'sans_entete' ? 'actif' : ''}><input type="radio" checked={inspection.modeEntete === 'sans_entete'} onChange={() => void reInspecter({ modeEntete: 'sans_entete' })} /> Sans en-tête</label></fieldset>
        {inspection.modeEntete === 'ligne' && <label>Ligne sélectionnée<input type="number" min="1" value={inspection.ligneEntete ?? 1} onChange={(evenement) => void reInspecter({ ligneEntete: Number(evenement.target.value) })} /></label>}
        <p className="information-modal">{inspection.totalLignes} enregistrements · {inspection.colonnes.length} colonnes · {tailleLisible(inspection.identite.taille)}</p>
      </>}
      {erreurSource && <p className="erreur-modal">{erreurSource}</p>}
    </FenetreModale>}

      {destinationOuverte && <FenetreModale titre="Paramètres de destination PostgreSQL" fermer={() => definirDestinationOuverte(false)} pied={<><button className="bouton-lien pied-gauche" disabled={etatConnexion === 'connexion'} onClick={() => void connecter()}>Tester la connexion</button><button className="bouton-secondaire" onClick={() => definirDestinationOuverte(false)}>Fermer</button><button className="bouton-principal" disabled={!connexion || etatConnexion !== 'connecte' || !schema || !table} onClick={() => void appliquerDestination()}>Appliquer</button></>}>
      <div className="grille-hote"><label>Hôte du serveur<input value={configuration.hote} onChange={(evenement) => modifierConfiguration('hote', evenement.target.value)} /></label><label>Port<input type="number" value={configuration.port} onChange={(evenement) => modifierConfiguration('port', Number(evenement.target.value))} /></label></div>
      <div className="grille-modal"><label>Base de données<input value={configuration.base} onChange={(evenement) => modifierConfiguration('base', evenement.target.value)} /></label><label>Utilisateur<input value={configuration.utilisateur} onChange={(evenement) => modifierConfiguration('utilisateur', evenement.target.value)} /></label></div>
      <label>Mot de passe<div className="champ-mot-passe"><input type={motDePasseVisible ? 'text' : 'password'} value={configuration.motDePasse} onChange={(evenement) => modifierConfiguration('motDePasse', evenement.target.value)} /><button className="bouton-lien" onClick={() => definirMotDePasseVisible((visible) => !visible)}>{motDePasseVisible ? 'Masquer' : 'Afficher'}</button></div><small>Le mot de passe réside en mémoire volatile et n’est jamais sauvegardé sur le disque.</small></label>
      <details className="options-avancees" open={optionsConnexion} onToggle={(evenement) => definirOptionsConnexion(evenement.currentTarget.open)}><summary>Options sécurisées</summary><div className="grille-modal"><label>TLS<select value={configuration.ssl} onChange={(evenement) => modifierConfiguration('ssl', evenement.target.value as 'desactive' | 'verifie')}><option value="desactive">Désactivé</option><option value="verifie">Certificat vérifié</option></select></label><label>Délai de connexion<input type="number" min="1" max="120" value={configuration.delaiSecondes} onChange={(evenement) => modifierConfiguration('delaiSecondes', Number(evenement.target.value))} /></label></div>{configuration.ssl === 'verifie' && <label>Autorité de certification (PEM)<textarea rows={3} value={configuration.certificatAutorite ?? ''} onChange={(evenement) => modifierConfiguration('certificatAutorite', evenement.target.value)} /></label>}</details>
      <div className="separateur-modal" />
      <fieldset className="cible-ecriture"><legend>Cible d’écriture</legend><label><input type="radio" checked={modeDestination === 'existante'} onChange={() => { definirModeDestination('existante'); definirTable(''); invalider() }} /> Table existante</label><label><input type="radio" checked={modeDestination === 'nouvelle'} onChange={() => { definirModeDestination('nouvelle'); definirTable(''); invalider() }} /> Créer une nouvelle table</label></fieldset>
      {connexion && etatConnexion === 'connecte' && <div className="grille-modal"><label>Schéma<select value={schema} onChange={(evenement) => { definirSchema(evenement.target.value); definirTable(''); invalider() }}><option value="">Choisir…</option>{connexion.schemas.map((nom) => <option key={nom}>{nom}</option>)}</select></label>{modeDestination === 'existante' ? <label>Table<select value={table} onChange={(evenement) => { definirTable(evenement.target.value); invalider() }}><option value="">Choisir…</option>{tables.map((candidate) => <option key={candidate.nom}>{candidate.nom}</option>)}</select></label> : <label>Nom de la nouvelle table<input value={table} onChange={(evenement) => { definirTable(evenement.target.value); invalider() }} placeholder="nouvelle_table" /></label>}</div>}
      {etatConnexion === 'connecte' && connexion && <p className="succes-modal">Connecté à {connexion.hote} / {connexion.base}</p>}
      {erreurConnexion && <p className="erreur-modal">{erreurConnexion}</p>}
    </FenetreModale>}

    {colonneRegles && correspondanceRegles && <FenetreModale titre={`Règles de conversion : ${sourceRegles?.nom ?? ''}`} fermer={() => definirColonneRegles(null)} pied={<><button className="bouton-secondaire" onClick={() => definirColonneRegles(null)}>Fermer</button><button className="bouton-principal" onClick={() => definirColonneRegles(null)}>Appliquer</button></>}>
      <label>Valeurs vides<select value={correspondanceRegles.regles.blancs ?? 'nul'} onChange={(evenement) => modifierCorrespondance(colonneRegles, { regles: { ...correspondanceRegles.regles, blancs: evenement.target.value as 'nul' | 'chaine_vide' } })}><option value="nul">Convertir en NULL</option><option value="chaine_vide">Conserver la chaîne vide pour le texte</option></select></label>
      {/date|timestamp/i.test(correspondanceRegles.typeCible) && <label>Ordre des dates<select value={correspondanceRegles.regles.ordreDate ?? ''} onChange={(evenement) => modifierCorrespondance(colonneRegles, { regles: { ...correspondanceRegles.regles, ordreDate: evenement.target.value ? evenement.target.value as 'jour_mois_annee' | 'mois_jour_annee' : undefined } })}><option value="">Détection automatique si non ambiguë</option><option value="jour_mois_annee">Jour / mois / année</option><option value="mois_jour_annee">Mois / jour / année</option></select></label>}
      {/int|numeric|decimal|real|double|money/i.test(correspondanceRegles.typeCible) && <label>Séparateur décimal<select value={correspondanceRegles.regles.separateurDecimal ?? ''} onChange={(evenement) => modifierCorrespondance(colonneRegles, { regles: { ...correspondanceRegles.regles, separateurDecimal: evenement.target.value ? evenement.target.value as 'point' | 'virgule' : undefined } })}><option value="">Détection automatique si non ambiguë</option><option value="point">Point</option><option value="virgule">Virgule</option></select></label>}
      {/with time zone|timestamptz/i.test(correspondanceRegles.typeCible) && <label>Fuseau source<input value={correspondanceRegles.regles.fuseauSource ?? ''} placeholder="UTC ou +01:00" onChange={(evenement) => modifierCorrespondance(colonneRegles, { regles: { ...correspondanceRegles.regles, fuseauSource: evenement.target.value } })} /></label>}
      <p className="information-modal">Les transformations sont déterministes et appliquées à toute la colonne. Aucune valeur n’est tronquée, arrondie ou remplacée silencieusement par zéro.</p>
    </FenetreModale>}
  </div>
}
