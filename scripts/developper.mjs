import { spawn as lancerProcessus } from 'node:child_process'
import { existsSync as fichierExiste } from 'node:fs'
import { join as joindreChemin } from 'node:path'

const racine = process.cwd()
const processus = []

const entrees = {
  vite: joindreChemin(racine, 'node_modules', 'vite', 'bin', 'vite.js'),
  typescript: joindreChemin(racine, 'node_modules', 'typescript', 'bin', 'tsc'),
  electron: joindreChemin(racine, 'node_modules', 'electron', 'cli.js')
}

function lancer(entree, argumentsCommande, environnement = {}) {
  const processusLance = lancerProcessus(process.execPath, [entree, ...argumentsCommande], {
    cwd: racine,
    stdio: 'inherit',
    env: { ...process.env, ...environnement },
    shell: false
  })
  processus.push(processusLance)
  processusLance.on('exit', (code) => {
    if (code && code !== 0) arreter(code)
  })
  return processusLance
}

function arreter(code = 0) {
  for (const processusLance of processus) {
    if (!processusLance.killed) processusLance.kill()
  }
  process.exit(code)
}

async function attendreCompilation() {
  for (let tentative = 0; tentative < 120; tentative += 1) {
    const interfaceDisponible = await fetch('http://localhost:5173').then((reponse) => reponse.ok).catch(() => false)
    if (interfaceDisponible && fichierExiste(joindreChemin(racine, 'dist-electron', 'principal', 'principal.js'))) return
    await new Promise((resoudre) => setTimeout(resoudre, 250))
  }
  throw new Error('Le serveur de développement ou la compilation Electron ne répond pas.')
}

process.on('SIGINT', () => arreter())
process.on('SIGTERM', () => arreter())

lancer(entrees.vite, [])
lancer(entrees.typescript, ['-p', 'tsconfig.electron.json', '--watch', '--preserveWatchOutput'])

try {
  await attendreCompilation()
  const electron = lancer(entrees.electron, ['.'], { ADRESSE_DEVELOPPEMENT: 'http://localhost:5173' })
  electron.on('exit', () => arreter())
} catch (erreur) {
  console.error(erreur instanceof Error ? erreur.message : erreur)
  arreter(1)
}
