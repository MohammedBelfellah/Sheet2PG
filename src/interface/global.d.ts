import type { PontApplication } from '../partage/modeles'

declare global {
  interface Window {
    importateur: PontApplication
  }
}

export {}
