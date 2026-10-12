import { defineConfig as definirConfiguration } from 'vite'
import react from '@vitejs/plugin-react'

export default definirConfiguration({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' }
})
