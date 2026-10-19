export type ExtensionSource = 'csv' | 'txt' | 'xlsx' | 'xls'
export type SeparateurSource = ',' | ';' | '\t' | '|'
export type ModeEntete = 'automatique' | 'ligne' | 'sans_entete'
export type ModeDestination = 'existante' | 'nouvelle'
export type ModeDoublon = 'ligne_exacte' | 'cles'
export type Gravite = 'erreur' | 'avertissement' | 'information'
export type EtatConnexion = 'deconnecte' | 'connexion' | 'connecte' | 'echec' | 'perime'

export interface IdentiteSource {
  id: string
  nom: string
  extension: ExtensionSource
  taille: number
  chemin: string
  empreinte: string
  feuilles: { nom: string; vide: boolean }[]
}

export interface ColonneSource {
  id: string
  index: number
  nom: string
  exemples: string[]
  selectionnee: boolean
  avertissement?: string
  typeSuggere: TypeCreation
}

export interface LigneApercu {
  numero: number
  valeurs: Record<string, ValeurCellule>
}

export type ValeurCellule = string | number | boolean | null

export interface InspectionSource {
  identite: IdentiteSource
  feuille: string
  ligneEntete: number | null
  modeEntete: ModeEntete
  lignesExclues: number
  lignesVides: number
  totalLignes: number
  colonnes: ColonneSource[]
  apercu: LigneApercu[]
  format: { separateur?: string; encodage?: string }
  avertissements: string[]
}

export interface OptionsInspection {
  idSource?: string
  cheminDepose?: string
  feuille?: string
  modeEntete?: ModeEntete
  ligneEntete?: number
  separateur?: SeparateurSource
  encodage?: 'utf8' | 'windows-1252' | 'latin1'
}

export interface ConfigurationConnexion {
  emplacement: 'local' | 'distant'
  hote: string
  port: number
  base: string
  utilisateur: string
  motDePasse: string
  delaiSecondes: number
  ssl: 'desactive' | 'verifie'
  certificatAutorite?: string
}

export interface ConnexionEtablie {
  id: string
  hote: string
  base: string
  schemas: string[]
  version: string
}

export interface TableDestination {
  schema: string
  nom: string
}

export interface ColonneDestination {
  nom: string
  type: string
  nullable: boolean
  valeurParDefaut: boolean
  generee: boolean
  identite: boolean
  primaire: boolean
  unique: boolean
}

export interface DescriptionTable {
  schema: string
  nom: string
  colonnes: ColonneDestination[]
  empreinte: string
}

export type TypeCreation = 'texte' | 'entier' | 'grand_entier' | 'decimal' | 'booleen' | 'date' | 'horodatage'

export interface ReglesConversion {
  ordreDate?: 'jour_mois_annee' | 'mois_jour_annee' | 'annee_mois_jour'
  separateurDecimal?: 'point' | 'virgule'
  blancs?: 'nul' | 'chaine_vide'
  fuseauSource?: string
}

export interface CorrespondanceColonne {
  idSource: string
  incluse: boolean
  destination: string
  typeCible: string
  regles: ReglesConversion
}

export interface PolitiqueDoublon {
  mode: ModeDoublon
  colonnesCles: string[]
}

export interface PlanImportation {
  idSource: string
  empreinteSource: string
  feuille: string
  modeEntete: ModeEntete
  ligneEntete: number | null
  colonnesSource: string[]
  idConnexion: string
  modeDestination: ModeDestination
  schema: string
  table: string
  empreinteTable?: string
  correspondances: CorrespondanceColonne[]
  doublons: PolitiqueDoublon
}

export interface ProblemeImportation {
  code: string
  gravite: Gravite
  message: string
  enregistrement?: number
  colonne?: string
  valeurOriginale?: string
  actionSuggeree?: string
  detailTechnique?: string
}

export interface CompteursImportation {
  total: number
  valides: number
  inseres: number
  doublonsIgnores: number
  conflitsIgnores: number
  lignesVidesIgnorees: number
}

export interface ResultatValidation {
  empreintePlan: string
  peutImporter: boolean
  problemes: ProblemeImportation[]
  compteurs: CompteursImportation
  apercuPrepare: LigneApercu[]
}

export interface ProgressionTravail {
  idTravail: string
  phase: 'lecture' | 'conversion' | 'doublons' | 'insertion' | 'validation' | 'termine' | 'annule'
  lignesTraitees: number
  totalLignes?: number
  compteurs: CompteursImportation
}

export interface ResultatImportation {
  reussi: boolean
  problemes: ProblemeImportation[]
  compteurs: CompteursImportation
}

export interface DemarrageImportation {
  idTravail: string
}

export interface PontApplication {
  choisirSource(): Promise<InspectionSource | null>
  inspecterSource(options: OptionsInspection): Promise<InspectionSource>
  oublierSource(idSource: string): Promise<boolean>
  cheminFichier(fichier: File): string
  connecter(configuration: ConfigurationConnexion): Promise<ConnexionEtablie>
  deconnecter(idConnexion: string): Promise<void>
  listerTables(idConnexion: string, schema: string): Promise<TableDestination[]>
  decrireTable(idConnexion: string, schema: string, table: string): Promise<DescriptionTable>
  valider(plan: PlanImportation): Promise<ResultatValidation>
  importer(plan: PlanImportation): Promise<DemarrageImportation>
  annuler(idTravail: string): Promise<boolean>
  exporterProblemes(problemes: ProblemeImportation[]): Promise<boolean>
  ecouterProgression(rappel: (progression: ProgressionTravail) => void): () => void
  ecouterResultat(rappel: (resultat: { idTravail: string; resultat: ResultatImportation }) => void): () => void
}
