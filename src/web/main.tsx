import '../renderer/src/App.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../renderer/src/App'
import Output from '../renderer/src/Output'
import { controlKeyAction } from '../shared/keys'
import { browserApi, installOutputBridge, sendKeyAction } from './browserApi'
import { isOutputWindow } from './outputChannel'

// The About dialog's data file ships a version baked at sync time; this is the
// one the build actually produced. Spread, not assign: about-data.js may not
// have run yet, and it merges rather than overwriting. See public/about.js.
window.STOATWORKS_ABOUT = { ...window.STOATWORKS_ABOUT, version: __APP_VERSION__ }

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
} else {
  // The support footer, presenter UI only. It is appended from here rather than
  // written as a tag in index.html because the Output window loads that same
  // document, and a funding footer belongs nowhere near a projected show.
  //
  // A dynamically inserted CLASSIC script still sets document.currentScript
  // while it runs, which is where the footer reads this config from — precisely
  // what a module script cannot do. No `defer`: that is ignored on an inserted
  // script, and the footer already waits for readyState itself.
  //
  // data-hosted unlocks the viewport for the footer; base.css keeps the desktop
  // renderer locked because the Electron build never sets it.
  document.documentElement.dataset.hosted = ''
  const footer = document.createElement('script')
  footer.src = '/support-footer.js'
  footer.dataset.app = 'PDF Presenter Lite'
  footer.dataset.repo = 'https://github.com/stoatworks-labs/pdf-presenter'
  footer.dataset.note =
    'It runs entirely in your browser — the PDF you open is never uploaded.'
  document.body.appendChild(footer)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOutput ? <Output /> : <App />}</StrictMode>
)
