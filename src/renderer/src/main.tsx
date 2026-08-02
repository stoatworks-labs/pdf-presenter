import './App.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Output from './Output'

// The About dialog's data file ships a version baked at sync time; this is the
// one the build actually produced. Spread, not assign: about-data.js may not
// have run yet, and it merges rather than overwriting. See public/about.js.
window.STOATWORKS_ABOUT = { ...window.STOATWORKS_ABOUT, version: __APP_VERSION__ }

const isOutput = new URLSearchParams(window.location.search).get('mode') === 'output'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOutput ? <Output /> : <App />}</StrictMode>
)
