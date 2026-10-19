import { useCallback as utiliserRappel, useEffect as utiliserEffet, useMemo as utiliserMemoire, useState as utiliserEtat } from 'react'
import type {
  ColonneDestination,
  ConfigurationConnexion,
  ConnexionEtablie,
  CorrespondanceColonne,
  DescriptionTable,
  EtatConnexion,
  InspectionSource,
  ModeDestination,
  PlanImportation,
  ProblemeImportation,
  ProgressionTravail,
  ResultatImportation,
  ResultatValidation,
  TableDestination,
  TypeCreation
} from '../partage/modeles'
import { libelles } from './libelles'

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
  emplacement: 'local', hote: 'localhost', port: 5432, base: '', utilisateur: 'postgres', motDePasse: '', delaiSecondes: 10, ssl: 'desactive'
}

function normaliserNom(nom: string): string {
  return nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'colonne'
}

function tailleLisible(octets: number): string {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`
}

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur)
}

function Pastille({ etat }: { etat: EtatConnexion }) {
  return <span className={`pastille pastille--${etat}`}><i />{libelles[etat === 'deconnecte' ? 'nonConnecte' : etat]}</span>
}

export function Application() {
  const [inspection, definirInspection] = utiliserEtat<InspectionSource | null>(null)
  const [chargementSource, definirChargementSource] = utiliserEtat(false)
  const [erreurSource, definirErreurSource] = utiliserEtat('')
  const [colonnesSelectionnees, definirColonnesSelectionnees] = utiliserEtat<Set<string>>(new Set())
  const [configuration, definirConfiguration] = utiliserEtat(configurationInitiale)
  const [motDePasseVisible, definirMotDePasseVisible] = utiliserEtat(false)
  const [optionsConnexion, definirOptionsConnexion] = utiliserEtat(false)
  const [etatConnexion, definirEtatConnexion] = utiliserEtat<EtatConnexion>('deconnecte')
  const [connexion, definirConnexion] = utiliserEtat<ConnexionEtablie | null>(null)
  const [erreurConnexion, definirErreurConnexion] = utiliserEtat('')
  const [modeDestination, definirModeDestination] = utiliserEtat<ModeDestination>('existante')
  const [schema, definirSchema] = utiliserEtat('')
  const [tables, definirTables] = utiliserEtat<TableDestination[]>([])
  const [table, definirTable] = utiliserEtat('')
  const [rechercheTable, definirRechercheTable] = utiliserEtat('')
  const [description, definirDescription] = utiliserEtat<DescriptionTable | null>(null)
  const [correspondances, definirCorrespondances] = utiliserEtat<Record<string, CorrespondanceColonne>>({})
  const [modeDoublon, definirModeDoublon] = utiliserEtat<'ligne_exacte' | 'cles'>('ligne_exacte')
  const [clesDoublon, definirClesDoublon] = utiliserEtat<Set<string>>(new Set())
  const [apercuOuvert, definirApercuOuvert] = utiliserEtat(true)
  const [apercuPrepare, definirApercuPrepare] = utiliserEtat(false)
  const [validation, definirValidation] = utiliserEtat<ResultatValidation | null>(null)
  const [validationActive, definirValidationActive] = utiliserEtat(false)
  const [filtreProbleme, definirFiltreProbleme] = utiliserEtat<'tous' | 'erreur' | 'avertissement' | 'information'>('tous')
  const [progression, definirProgression] = utiliserEtat<ProgressionTravail | null>(null)
  const [idTravail, definirIdTravail] = utiliserEtat<string | null>(null)
  const [resultat, definirResultat] = utiliserEtat<ResultatImportation | null>(null)

  const invalider = utiliserRappel(() => {
    definirValidation(null)
    definirResultat(null)
    definirApercuPrepare(false)
  }, [])

  const appliquerInspection = utiliserRappel((nouvelle: InspectionSource) => {
    definirInspection(nouvelle)
    definirColonnesSelectionnees((precedentes) => {
      if (inspection?.identite.id === nouvelle.identite.id) {
        const encoreValides = new Set(nouvelle.colonnes.filter((colonne) => precedentes.has(colonne.id)).map((colonne) => colonne.id))
        return encoreValides.size ? encoreValides : new Set(nouvelle.colonnes.map((colonne) => colonne.id))
      }
      return new Set(nouvelle.colonnes.map((colonne) => colonne.id))
    })
    definirErreurSource('')
    invalider()
  }, [inspection?.identite.id, invalider])

  const choisirSource = async () => {
    definirChargementSource(true)
    try {
      const nouvelle = await window.importateur.choisirSource()
      if (nouvelle) appliquerInspection(nouvelle)
    } catch (erreur) { definirErreurSource(messageErreur(erreur)) }
    finally { definirChargementSource(false) }
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
        separateur: inspection.format.separateur as ',' | ';' | '\t' | '|' | undefined,
        encodage: inspection.format.encodage as 'utf8' | 'windows-1252' | 'latin1' | undefined,
        ...changements
      })
      appliquerInspection(nouvelle)
    } catch (erreur) { definirErreurSource(messageErreur(erreur)) }
    finally { definirChargementSource(false) }
  }

  const deposer = async (fichier: File) => {
    definirChargementSource(true)
    try {
      const nouvelle = await window.importateur.inspecterSource({ cheminDepose: window.importateur.cheminFichier(fichier) })
      appliquerInspection(nouvelle)
    } catch (erreur) { definirErreurSource(messageErreur(erreur)) }
    finally { definirChargementSource(false) }
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
      const schemaInitial = nouvelle.schemas.includes('public') ? 'public' : nouvelle.schemas[0] ?? ''
      definirSchema(schemaInitial)
      definirTable('')
      definirDescription(null)
      invalider()
    } catch (erreur) {
      definirConnexion(null)
      definirEtatConnexion('echec')
      definirErreurConnexion(messageErreur(erreur))
    }
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
    } catch (erreur) { definirErreurConnexion(messageErreur(erreur)) }
  }, [connexion, schema, etatConnexion, modeDestination])

  utiliserEffet(() => { void chargerTables() }, [chargerTables])

  utiliserEffet(() => {
    if (!connexion || !schema || !table || modeDestination !== 'existante') { definirDescription(null); return }
    void window.importateur.decrireTable(connexion.id, schema, table).then((nouvelle) => {
      definirDescription(nouvelle)
      invalider()
    }).catch((erreur) => definirErreurConnexion(messageErreur(erreur)))
  }, [connexion, schema, table, modeDestination, invalider])

  utiliserEffet(() => {
    if (!inspection) return
    definirCorrespondances((precedentes) => {
      const suivantes: Record<string, CorrespondanceColonne> = {}
      const destinations = description?.colonnes.filter((colonne) => !colonne.generee && !colonne.identite) ?? []
      const dejaPrises = new Set<string>()
      for (const colonne of inspection.colonnes) {
        const precedente = precedentes[colonne.id]
        if (precedente && (modeDestination === 'nouvelle' || destinations.some((destination) => destination.nom === precedente.destination))) {
          suivantes[colonne.id] = { ...precedente, incluse: colonnesSelectionnees.has(colonne.id) }
          dejaPrises.add(precedente.destination)
          continue
        }
        if (modeDestination === 'existante') {
          const cible = destinations.find((destination) => normaliserNom(destination.nom) === normaliserNom(colonne.nom) && !dejaPrises.has(destination.nom))
          suivantes[colonne.id] = { idSource: colonne.id, incluse: colonnesSelectionnees.has(colonne.id), destination: cible?.nom ?? '', typeCible: cible?.type ?? '', regles: { blancs: 'nul' } }
          if (cible) dejaPrises.add(cible.nom)
        } else {
          const base = normaliserNom(colonne.nom)
          let nom = base
          let suffixe = 2
          while (dejaPrises.has(nom)) nom = `${base}_${suffixe++}`
          dejaPrises.add(nom)
          const type = typesCreation.find((candidate) => candidate.valeur === colonne.typeSuggere)!
          suivantes[colonne.id] = { idSource: colonne.id, incluse: colonnesSelectionnees.has(colonne.id), destination: nom, typeCible: type.sql, regles: { blancs: 'nul' } }
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
    })
    return () => { retirerProgression(); retirerResultat() }
  }, [idTravail])

  const plan = utiliserMemoire<PlanImportation | null>(() => {
    if (!inspection || !connexion || !schema || !table || etatConnexion !== 'connecte') return null
    const actives = inspection.colonnes
      .filter((colonne) => colonnesSelectionnees.has(colonne.id))
      .map((colonne) => correspondances[colonne.id])
      .filter((correspondance): correspondance is CorrespondanceColonne => Boolean(correspondance?.incluse))
    if (!actives.length || actives.some((correspondance) => !correspondance.destination || !correspondance.typeCible)) return null
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
      correspondances: actives,
      doublons: { mode: modeDoublon, colonnesCles: [...clesDoublon] }
    }
  }, [inspection, connexion, schema, table, etatConnexion, colonnesSelectionnees, correspondances, modeDestination, description, modeDoublon, clesDoublon])

  const valider = async () => {
    if (!plan) return
    definirValidationActive(true)
    definirResultat(null)
    try { definirValidation(await window.importateur.valider(plan)) }
    catch (erreur) { definirValidation({ empreintePlan: '', peutImporter: false, compteurs: { total: 0, valides: 0, inseres: 0, doublonsIgnores: 0, conflitsIgnores: 0, lignesVidesIgnorees: 0 }, apercuPrepare: [], problemes: [{ code: 'VALIDATION_INTERROMPUE', gravite: 'erreur', message: messageErreur(erreur) }] }) }
    finally { definirValidationActive(false) }
  }

  const importer = async () => {
    if (!plan || !validation?.peutImporter) return
    definirResultat(null)
    definirProgression(null)
    const demarrage = await window.importateur.importer(plan)
    definirIdTravail(demarrage.idTravail)
  }

  const modifierCorrespondance = (id: string, changement: Partial<CorrespondanceColonne>) => {
    definirCorrespondances((actuelles) => ({ ...actuelles, [id]: { ...actuelles[id], ...changement } }))
    invalider()
  }

  const changerSelection = (id: string, selectionnee: boolean) => {
    definirColonnesSelectionnees((actuelles) => {
      const nouvelles = new Set(actuelles)
      if (selectionnee) nouvelles.add(id); else nouvelles.delete(id)
      return nouvelles
    })
    invalider()
  }

  const lignesApercu = apercuPrepare && validation ? validation.apercuPrepare : inspection?.apercu ?? []
  const colonnesApercu = apercuPrepare && validation
    ? [...new Set(validation.apercuPrepare.flatMap((ligne) => Object.keys(ligne.valeurs)))]
    : inspection?.colonnes.filter((colonne) => colonnesSelectionnees.has(colonne.id)).map((colonne) => colonne.id) ?? []
  const nomColonneApercu = (id: string) => apercuPrepare ? id : inspection?.colonnes.find((colonne) => colonne.id === id)?.nom ?? id
  const problemes = (resultat?.problemes ?? validation?.problemes ?? []).filter((probleme) => filtreProbleme === 'tous' || probleme.gravite === filtreProbleme)
  const modificationInterdite = Boolean(idTravail)

  return <div className="application">
    <header className="barre-haute">
      <div><h1>{libelles.application}</h1><span>{libelles.sousTitre}</span></div>
      <Pastille etat={etatConnexion} />
    </header>

    <main className="contenu">
      <section className="grille-principale">
        <article className="panneau">
          <div className="titre-panneau"><div><span className="numero">1</span><h2>{libelles.source}</h2></div>{chargementSource && <span className="chargement">Lecture…</span>}</div>
          {!inspection ? <div className="depot" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) void deposer(e.dataTransfer.files[0]) }}>
            <div className="icone-fichier">⇧</div><strong>{libelles.deposer}</strong><span>CSV, TXT, XLSX ou XLS</span><button onClick={() => void choisirSource()} disabled={chargementSource}>{libelles.parcourir}</button>
          </div> : <>
            <div className="fichier-selectionne" title={inspection.identite.chemin}>
              <div><strong>{inspection.identite.nom}</strong><span>{inspection.identite.extension.toUpperCase()} · {tailleLisible(inspection.identite.taille)}</span></div>
              <button className="secondaire" onClick={() => void choisirSource()} disabled={modificationInterdite}>{libelles.changer}</button>
            </div>
            {inspection.identite.extension !== 'csv' && inspection.identite.extension !== 'txt' && <label>Feuille<select value={inspection.feuille} onChange={(e) => void reInspecter({ feuille: e.target.value })} disabled={modificationInterdite}>{inspection.identite.feuilles.map((feuille) => <option key={feuille.nom} value={feuille.nom}>{feuille.nom}{feuille.vide ? ' (vide)' : ''}</option>)}</select></label>}
            {(inspection.identite.extension === 'csv' || inspection.identite.extension === 'txt') && <details className="details"><summary>Paramètres de format</summary><div className="rangee">
              <label>Séparateur<select value={inspection.format.separateur} onChange={(e) => void reInspecter({ separateur: e.target.value })}><option value=",">Virgule</option><option value=";">Point-virgule</option><option value="\t">Tabulation</option><option value="|">Barre verticale |</option></select></label>
              <label>Encodage<select value={inspection.format.encodage} onChange={(e) => void reInspecter({ encodage: e.target.value })}><option value="utf8">UTF-8</option><option value="windows-1252">Windows-1252</option><option value="latin1">Latin-1</option></select></label>
            </div></details>}
            <fieldset className="entete"><legend>En-tête</legend><div className="segments">
              {(['automatique', 'ligne', 'sans_entete'] as const).map((mode) => <button key={mode} className={inspection.modeEntete === mode ? 'actif' : ''} onClick={() => void reInspecter({ modeEntete: mode })}>{mode === 'automatique' ? 'Auto' : mode === 'ligne' ? 'Ligne' : 'Sans en-tête'}</button>)}
            </div>{inspection.modeEntete !== 'sans_entete' && <label className="ligne-entete">Ligne sélectionnée<input type="number" min="1" value={inspection.ligneEntete ?? 1} onChange={(e) => void reInspecter({ modeEntete: 'ligne', ligneEntete: Number(e.target.value) })} /></label>}</fieldset>
            {inspection.lignesExclues > 0 && <p className="note">{inspection.lignesExclues} ligne(s) de titre exclue(s).</p>}
            <div className="entete-liste"><strong>Colonnes ({colonnesSelectionnees.size}/{inspection.colonnes.length})</strong><span><button className="lien" onClick={() => { definirColonnesSelectionnees(new Set(inspection.colonnes.map((c) => c.id))); invalider() }}>Tout sélectionner</button><button className="lien" onClick={() => { definirColonnesSelectionnees(new Set()); invalider() }}>Effacer</button></span></div>
            <div className="liste-colonnes">{inspection.colonnes.map((colonne) => <label key={colonne.id} className="case"><input type="checkbox" checked={colonnesSelectionnees.has(colonne.id)} onChange={(e) => changerSelection(colonne.id, e.target.checked)} /> <span>{colonne.nom}</span><small>{colonne.exemples[0] ?? 'Valeurs vides'}</small></label>)}</div>
            <div className="resume-source"><span>{inspection.totalLignes} enregistrements</span><span>{inspection.lignesVides} lignes vides ignorées</span><button className="secondaire" onClick={() => definirApercuOuvert(true)}>Voir l’aperçu</button></div>
          </>}
          {erreurSource && <p className="message erreur">{erreurSource}</p>}
          {inspection?.avertissements.map((avertissement) => <p className="message avertissement" key={avertissement}>{avertissement}</p>)}
        </article>

        <article className="panneau">
          <div className="titre-panneau"><div><span className="numero">2</span><h2>{libelles.destination}</h2></div><Pastille etat={etatConnexion} /></div>
          <div className="segments pleine"><button className={configuration.emplacement === 'local' ? 'actif' : ''} onClick={() => { modifierConfiguration('emplacement', 'local'); modifierConfiguration('hote', 'localhost') }}>Locale</button><button className={configuration.emplacement === 'distant' ? 'actif' : ''} onClick={() => { modifierConfiguration('emplacement', 'distant'); modifierConfiguration('hote', '') }}>Distante</button></div>
          <div className="rangee hote-port"><label>Hôte<input value={configuration.hote} placeholder={configuration.emplacement === 'local' ? 'localhost' : 'db.exemple.fr'} onChange={(e) => modifierConfiguration('hote', e.target.value)} /></label><label>Port<input type="number" value={configuration.port} onChange={(e) => modifierConfiguration('port', Number(e.target.value))} /></label></div>
          <div className="rangee"><label>Base de données<input value={configuration.base} onChange={(e) => modifierConfiguration('base', e.target.value)} /></label><label>Utilisateur<input value={configuration.utilisateur} onChange={(e) => modifierConfiguration('utilisateur', e.target.value)} /></label></div>
          <label>Mot de passe<div className="mot-passe"><input type={motDePasseVisible ? 'text' : 'password'} value={configuration.motDePasse} onChange={(e) => modifierConfiguration('motDePasse', e.target.value)} /><button className="lien" onClick={() => definirMotDePasseVisible(!motDePasseVisible)}>{motDePasseVisible ? 'Masquer' : 'Afficher'}</button></div></label>
          <details className="details" open={optionsConnexion} onToggle={(e) => definirOptionsConnexion(e.currentTarget.open)}><summary>Options de connexion</summary><div className="rangee"><label>TLS<select value={configuration.ssl} onChange={(e) => modifierConfiguration('ssl', e.target.value as 'desactive' | 'verifie')}><option value="desactive">Désactivé</option><option value="verifie">Certificat vérifié</option></select></label><label>Délai (secondes)<input type="number" min="1" max="120" value={configuration.delaiSecondes} onChange={(e) => modifierConfiguration('delaiSecondes', Number(e.target.value))} /></label></div>{configuration.ssl === 'verifie' && <label>Autorité de certification personnalisée (PEM)<textarea rows={3} value={configuration.certificatAutorite ?? ''} onChange={(e) => modifierConfiguration('certificatAutorite', e.target.value)} /></label>}</details>
          <button className="bouton-large" disabled={etatConnexion === 'connexion' || !configuration.hote || !configuration.base || !configuration.utilisateur} onClick={() => void connecter()}>{etatConnexion === 'connexion' ? 'Connexion en cours…' : libelles.connecter}</button>
          {connexion && etatConnexion === 'connecte' && <p className="message succes">Connecté à {connexion.hote} / {connexion.base}</p>}
          {erreurConnexion && <p className="message erreur">{erreurConnexion}</p>}
          <hr />
          <div className="segments pleine"><button className={modeDestination === 'existante' ? 'actif' : ''} onClick={() => { definirModeDestination('existante'); definirTable(''); invalider() }}>{libelles.tableExistante}</button><button className={modeDestination === 'nouvelle' ? 'actif' : ''} onClick={() => { definirModeDestination('nouvelle'); definirTable(''); invalider() }}>{libelles.nouvelleTable}</button></div>
          <div className="rangee destination-choix"><label>Schéma<select disabled={!connexion || etatConnexion !== 'connecte'} value={schema} onChange={(e) => { definirSchema(e.target.value); definirTable(''); invalider() }}><option value="">Choisir…</option>{connexion?.schemas.map((nom) => <option key={nom}>{nom}</option>)}</select></label>
          {modeDestination === 'existante' ? <label>Table<input placeholder="Rechercher…" value={rechercheTable} onChange={(e) => definirRechercheTable(e.target.value)} /><select disabled={!schema} value={table} onChange={(e) => { definirTable(e.target.value); invalider() }}><option value="">Choisir une table…</option>{tables.filter((candidate) => candidate.nom.toLowerCase().includes(rechercheTable.toLowerCase())).map((candidate) => <option key={candidate.nom}>{candidate.nom}</option>)}</select></label> : <label>Nom de la nouvelle table<input value={table} placeholder="nouvelle_table" onChange={(e) => { definirTable(e.target.value); invalider() }} /></label>}</div>
          {description && <div className="resume-table"><strong>{description.schema}.{description.nom}</strong><span>{description.colonnes.length} colonnes · {description.colonnes.filter((c) => c.primaire || c.unique).length} clé(s) unique(s)</span><button className="lien" onClick={() => void chargerTables()}>Actualiser</button></div>}
        </article>
      </section>

      <section className="panneau panneau-large">
        <div className="titre-panneau"><div><span className="numero">3</span><h2>{libelles.colonnes}</h2></div><span className="note">Les types de la base restent inchangés.</span></div>
        {!inspection ? <div className="etat-vide">Sélectionnez un fichier pour préparer les colonnes.</div> : colonnesSelectionnees.size === 0 ? <div className="message erreur">Sélectionnez au moins une colonne source.</div> : <>{Object.values(correspondances).some((correspondance) => correspondance.incluse && (!correspondance.destination || !correspondance.typeCible)) && <div className="message erreur">Chaque colonne incluse doit être mappée. Choisissez un champ destination ou décochez « Inclure » pour les colonnes gérées automatiquement par PostgreSQL.</div>}<div className="table-defilement"><table className="table-correspondance"><thead><tr><th>Inclure</th><th>Champ source</th><th>Exemples</th><th>Champ destination</th><th>Type cible</th><th>Règles</th>{modeDoublon === 'cles' && <th>Clé</th>}</tr></thead><tbody>
          {inspection.colonnes.filter((colonne) => colonnesSelectionnees.has(colonne.id)).map((colonne) => {
            const correspondance = correspondances[colonne.id]
            if (!correspondance) return null
            const destinations = description?.colonnes.filter((candidate) => !candidate.generee && !candidate.identite) ?? []
            const estDate = /date|timestamp/i.test(correspondance.typeCible)
            const estNombre = /int|numeric|decimal|real|double|money/i.test(correspondance.typeCible)
            return <tr key={colonne.id}><td><input type="checkbox" checked={correspondance.incluse} onChange={(e) => modifierCorrespondance(colonne.id, { incluse: e.target.checked })} /></td><td><strong>{colonne.nom}</strong><small>Colonne {colonne.index + 1}</small></td><td><span className="exemple">{colonne.exemples.join(' · ') || '(vide)'}</span></td><td>{modeDestination === 'existante' ? <select value={correspondance.destination} onChange={(e) => { const cible = destinations.find((d) => d.nom === e.target.value); modifierCorrespondance(colonne.id, { destination: e.target.value, typeCible: cible?.type ?? '' }) }}><option value="">Non mappé</option>{destinations.map((destination) => <option key={destination.nom} value={destination.nom}>{destination.nom}</option>)}</select> : <input value={correspondance.destination} onChange={(e) => modifierCorrespondance(colonne.id, { destination: normaliserNom(e.target.value) })} />}</td><td>{modeDestination === 'existante' ? <code>{correspondance.typeCible || '—'}</code> : <select value={correspondance.typeCible} onChange={(e) => modifierCorrespondance(colonne.id, { typeCible: e.target.value })}>{typesCreation.map((type) => <option key={type.valeur} value={type.sql}>{type.libelle}</option>)}</select>}</td><td><div className="regles">{estDate && <select title="Ordre des dates" value={correspondance.regles.ordreDate ?? ''} onChange={(e) => modifierCorrespondance(colonne.id, { regles: { ...correspondance.regles, ordreDate: e.target.value ? e.target.value as 'jour_mois_annee' | 'mois_jour_annee' : undefined } })}><option value="">Ordre auto</option><option value="jour_mois_annee">Jour/mois/année</option><option value="mois_jour_annee">Mois/jour/année</option></select>}{estNombre && <select title="Séparateur décimal" value={correspondance.regles.separateurDecimal ?? ''} onChange={(e) => modifierCorrespondance(colonne.id, { regles: { ...correspondance.regles, separateurDecimal: e.target.value ? e.target.value as 'point' | 'virgule' : undefined } })}><option value="">Décimal auto</option><option value="point">Point</option><option value="virgule">Virgule</option></select>}<select title="Valeurs vides" value={correspondance.regles.blancs ?? 'nul'} onChange={(e) => modifierCorrespondance(colonne.id, { regles: { ...correspondance.regles, blancs: e.target.value as 'nul' | 'chaine_vide' } })}><option value="nul">Vide → NULL</option><option value="chaine_vide">Garder vide</option></select></div></td>{modeDoublon === 'cles' && <td><input type="checkbox" checked={clesDoublon.has(correspondance.destination)} disabled={!correspondance.destination} onChange={(e) => { definirClesDoublon((actuelles) => { const nouvelles = new Set(actuelles); if (e.target.checked) nouvelles.add(correspondance.destination); else nouvelles.delete(correspondance.destination); return nouvelles }); invalider() }} /></td>}</tr>
          })}
        </tbody></table></div></>}
        <div className="politique-doublons"><strong>Ignorer les doublons selon :</strong><label><input type="radio" checked={modeDoublon === 'ligne_exacte'} onChange={() => { definirModeDoublon('ligne_exacte'); invalider() }} /> Ligne importée exacte</label><label><input type="radio" checked={modeDoublon === 'cles'} onChange={() => { definirModeDoublon('cles'); invalider() }} /> Colonnes clés sélectionnées</label><span>La comparaison exacte ne détermine pas si deux lignes différentes représentent la même personne.</span></div>
      </section>

      <section className="panneau panneau-large apercu"><button className="titre-repliable" onClick={() => definirApercuOuvert(!apercuOuvert)}><span><span className="numero">4</span><strong>{libelles.apercu}</strong><small>Échantillon de 50 lignes maximum ; Valider contrôle tout le fichier.</small></span><b>{apercuOuvert ? '−' : '+'}</b></button>{apercuOuvert && <div className="corps-apercu"><div className="segments petit"><button className={!apercuPrepare ? 'actif' : ''} onClick={() => definirApercuPrepare(false)}>Source</button><button disabled={!validation} className={apercuPrepare ? 'actif' : ''} onClick={() => definirApercuPrepare(true)}>Préparé</button></div><div className="table-defilement"><table><thead><tr><th>N° d’origine</th>{colonnesApercu.map((id) => <th key={id}>{nomColonneApercu(id)}</th>)}</tr></thead><tbody>{lignesApercu.map((ligne) => <tr key={ligne.numero}><td>{ligne.numero}</td>{colonnesApercu.map((id) => <td key={id}>{ligne.valeurs[id] === null ? <em>NULL</em> : String(ligne.valeurs[id] ?? '')}</td>)}</tr>)}</tbody></table>{!lignesApercu.length && <div className="etat-vide">Aucune ligne à afficher.</div>}</div></div>}</section>

      {(validation || resultat) && <section className="panneau panneau-large resultats">
        <div className="titre-panneau"><div><span className="numero">5</span><h2>{resultat ? (resultat.reussi ? 'Importation terminée' : 'Importation échouée') : validation?.peutImporter ? 'Prêt à importer' : 'Points à corriger'}</h2></div>{problemes.length > 0 && <button className="secondaire" onClick={() => void window.importateur.exporterProblemes(resultat?.problemes ?? validation?.problemes ?? [])}>Exporter le rapport</button>}</div>
        {resultat?.reussi && <p className="message succes">{resultat.compteurs.inseres ? `${resultat.compteurs.inseres} nouvelles lignes ont été importées.` : 'Aucun nouvel enregistrement à importer.'}</p>}
        {validation && <div className="compteurs"><span><b>{validation.compteurs.total}</b> lignes lues</span><span><b>{validation.compteurs.valides}</b> valides</span><span><b>{validation.compteurs.doublonsIgnores}</b> doublons</span><span><b>{validation.compteurs.conflitsIgnores}</b> conflits</span></div>}
        {(resultat?.problemes.length || validation?.problemes.length) ? <><div className="filtre"><label>Afficher<select value={filtreProbleme} onChange={(e) => definirFiltreProbleme(e.target.value as typeof filtreProbleme)}><option value="tous">Tous</option><option value="erreur">Erreurs</option><option value="avertissement">Avertissements</option><option value="information">Informations</option></select></label></div><div className="table-defilement"><table><thead><tr><th>Gravité</th><th>Enregistrement</th><th>Colonne</th><th>Valeur originale</th><th>Problème</th><th>Action suggérée</th></tr></thead><tbody>{problemes.map((probleme, index) => <tr key={`${probleme.code}-${index}`}><td><span className={`gravite gravite--${probleme.gravite}`}>{probleme.gravite}</span></td><td>{probleme.enregistrement ?? '—'}</td><td>{probleme.colonne ?? '—'}</td><td className="valeur-originale">{probleme.valeurOriginale ?? '—'}</td><td>{probleme.message}{probleme.detailTechnique && <details><summary>Détail technique</summary><code>{probleme.detailTechnique}</code></details>}</td><td>{probleme.actionSuggeree ?? '—'}</td></tr>)}</tbody></table></div></> : <p className="message succes">Aucun problème détecté dans le fichier complet.</p>}
      </section>}
    </main>

    <footer className="barre-actions"><div>{idTravail && progression ? <><strong>Importation : {progression.lignesTraitees}/{progression.totalLignes ?? '…'}</strong><progress value={progression.lignesTraitees} max={progression.totalLignes ?? 1} /></> : <><strong>{inspection ? `${inspection.totalLignes} lignes · ${colonnesSelectionnees.size} colonnes` : 'Ajoutez une source pour commencer'}</strong><span>{validation?.peutImporter ? 'Validation réussie, prête à importer' : 'Validez avant l’importation'}</span></>}</div><div className="actions">{idTravail ? <button className="danger" onClick={() => void window.importateur.annuler(idTravail)}>{libelles.annuler}</button> : <><button className="secondaire" disabled={!plan || validationActive} onClick={() => void valider()}>{validationActive ? 'Validation…' : libelles.valider}</button><button disabled={!plan || !validation?.peutImporter} onClick={() => void importer()}>{libelles.importer}</button></>}</div></footer>
  </div>
}
