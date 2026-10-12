import { defineConfig as definirConfiguration } from 'vitest/config'

export default definirConfiguration({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'dist-electron/**', 'node_modules/**']
  }
})
