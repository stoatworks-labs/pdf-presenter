import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Hosted build: the same React UI as the Electron renderer, backed by
// src/web/browserApi.ts instead of the preload IPC bridge, so it can be
// published as static assets on a Cloudflare Worker (see wrangler.toml).
//
// pdf.js does all the rendering in the tab either way — the desktop app was
// never doing that part natively — so the presenter view, the Output window and
// the transport are the real application here. Only OSC, the watch folder and
// the desktop integrations are missing, and the UI hides them.
export default defineConfig({
  root: 'src/web',
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
