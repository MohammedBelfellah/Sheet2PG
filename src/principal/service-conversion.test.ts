import { describe as decrire, expect as attendre, it as tester } from 'vitest'
import { convertirValeur } from './service-conversion.js'

decrire('conversion déterministe des valeurs', () => {
  tester('conserve les zéros initiaux dans une destination texte', () => {
    attendre(convertirValeur('00123', 'text', {}).valeur).toBe('00123')
  })

  tester('refuse de perdre un zéro initial dans une destination numérique', () => {
    attendre(convertirValeur('00123', 'integer', {}).probleme?.code).toBe('ZERO_SIGNIFICATIF')
  })

  tester('demande une règle pour une date ambiguë', () => {
    attendre(convertirValeur('03/04/2026', 'date', {}).probleme?.code).toBe('DATE_AMBIGUE')
  })

  tester('convertit une date avec l’ordre explicite', () => {
    attendre(convertirValeur('03/04/2026', 'date', { ordreDate: 'jour_mois_annee' }).valeur).toBe('2026-04-03')
  })

  tester('préserve un grand entier sous forme de chaîne exacte', () => {
    attendre(convertirValeur('9007199254740993', 'bigint', {}).valeur).toBe('9007199254740993')
  })

  tester('demande un fuseau pour une destination avec fuseau', () => {
    attendre(convertirValeur('2026-12-25 10:30:00', 'timestamp with time zone', {}).probleme?.code).toBe('FUSEAU_MANQUANT')
  })

  tester('refuse de tronquer un texte trop long', () => {
    attendre(convertirValeur('abcdef', 'character varying(5)', {}).probleme?.code).toBe('TEXTE_TROP_LONG')
  })
})
