const { contextBridge: pontContexte, ipcRenderer: communication, webUtils: outilsWeb } = require('electron') as typeof import('electron')
import type { PontApplication, ProblemeImportation, ProgressionTravail, ResultatImportation } from '../partage/modeles.js'

const pont: PontApplication = {
  choisirSource: () => communication.invoke('source:choisir'),
  inspecterSource: (options) => communication.invoke('source:inspecter', options),
  oublierSource: (idSource) => communication.invoke('source:oublier', idSource),
  cheminFichier: (fichier) => outilsWeb.getPathForFile(fichier),
  connecter: (configuration) => communication.invoke('base:connecter', configuration),
  deconnecter: (idConnexion) => communication.invoke('base:deconnecter', idConnexion),
  listerTables: (idConnexion, schema) => communication.invoke('base:tables', idConnexion, schema),
  decrireTable: (idConnexion, schema, table) => communication.invoke('base:decrire', idConnexion, schema, table),
  valider: (plan) => communication.invoke('importation:valider', plan),
  importer: (plan) => communication.invoke('importation:demarrer', plan),
  annuler: (idTravail) => communication.invoke('importation:annuler', idTravail),
  exporterProblemes: (problemes: ProblemeImportation[]) => communication.invoke('rapport:exporter', problemes),
  ecouterProgression: (rappel: (progression: ProgressionTravail) => void) => {
    const ecoute = (_evenement: Electron.IpcRendererEvent, progression: ProgressionTravail) => rappel(progression)
    communication.on('travail:progression', ecoute)
    return () => communication.removeListener('travail:progression', ecoute)
  },
  ecouterResultat: (rappel: (resultat: { idTravail: string; resultat: ResultatImportation }) => void) => {
    const ecoute = (_evenement: Electron.IpcRendererEvent, resultat: { idTravail: string; resultat: ResultatImportation }) => rappel(resultat)
    communication.on('travail:resultat', ecoute)
    return () => communication.removeListener('travail:resultat', ecoute)
  }
}

pontContexte.exposeInMainWorld('importateur', pont)
