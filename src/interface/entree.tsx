import { StrictMode as ModeStrict } from 'react'
import { createRoot as creerRacine } from 'react-dom/client'
import { ApplicationRefondue } from './application-refondue'
import './styles.css'
import './styles-refonte.css'

creerRacine(document.getElementById('racine')!).render(
  <ModeStrict>
    <ApplicationRefondue />
  </ModeStrict>
)
