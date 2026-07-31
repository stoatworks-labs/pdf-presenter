import '../renderer/src/App.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../renderer/src/App'
import Output from '../renderer/src/Output'
import { controlKeyAction } from '../shared/keys'
import { browserApi, installOutputBridge, sendKeyAction } from './browserApi'
import { isOutputWindow } from './outputChannel'

/**
 * Entry point for the hosted build.
 *
 * Mirrors the Electron renderer entry: same components, same `?mode=output`
 * switch between the presenter UI and the fullscreen Output. The difference is
 * what backs `window.api` (see browserApi.ts) and that the Output window has to
 * relay its own keypresses — Electron's main process does that job there.
 */

// Install the bridge before the app mounts, so the shared components find the
// same `window.api` they use under Electron.
;(window as unknown as { api: typeof browserApi }).api = browserApi

const isOutput = isOutputWindow()

if (isOutput) {
  // A clicker aimed at the Output window is a keyboard pointed at the wrong
  // window; forward what it sends so the show still advances.
  installOutputBridge((event) => {
    const action = controlKeyAction(event.key)
    if (!action) return
    event.preventDefault()
    sendKeyAction(action)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOutput ? <Output /> : <App />}</StrictMode>
)
