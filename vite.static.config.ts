import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Hosted build: the same React UI as the Electron renderer, backed by
// src/web/browserApi.ts instead of the preload IPC bridge, so it can be
// published as static assets on a Cloudflare Worker (see wrangler.toml).
//
// pdf.js does all the rendering in the tab either way — the desktop app was
// never doing that part natively — so the presenter view, the Output window and
// the transport are the real application here. Only OSC, the watch folder and
// the desktop integrations are missing, and the UI hides them.
export default defineConfig({
  // The About dialog shows the version the build actually produced. about-data.js
  // carries one baked at sync time as a fallback, and it goes stale the moment a
  // release is tagged; this is the one that is always right.
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version}`) },
  root: 'src/web',
  // Shared with the Electron renderer build (electron.vite.config.ts) so the
  // About dialog's vendored files live in exactly one place.
  publicDir: resolve('public'),
  base: '/',
  resolve: {
    alias: { '@renderer': resolve('src/renderer/src') }
  },
  build: {
    outDir: resolve('out-static'),
    emptyOutDir: true
  },
  plugins: [react()]
})
