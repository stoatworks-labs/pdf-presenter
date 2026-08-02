import { readFileSync } from 'node:fs'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // Shared with the hosted build (vite.static.config.ts) so the About dialog's
    // vendored files live in exactly one place.
    publicDir: resolve('public'),
    define: {
      // The version the build produced. See public/about.js.
      __APP_VERSION__: JSON.stringify(`v${pkg.version}`)
    },
    // Pinned away from Vite's default 5173 — this machine sometimes runs
    // another Electron project's dev server concurrently, and both would
    // otherwise silently race for the same port (confirmed live: this app's
    // Electron process ended up loading the OTHER project's page content).
    server: {
      port: 5183,
      strictPort: true
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
