import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/index.css'
import App from './App.tsx'
import { recordCrashFromLastVisit } from './lib/vlm/browser/models'

// Before anything loads a model: notice if the last visit was killed for running out of memory.
recordCrashFromLastVisit()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
