import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/**
 * The shared Stoatworks footer, and with it the "report a bug" button. Injected
 * here rather than written into index.html because this config is the hosted
 * target and the Electron build is not: the desktop app has its own About window
 * and should not grow a web footer. Same arrangement as atem-scopes and simpleVIS.
 */
function supportFooter(): Plugin {
  return {
    name: 'stoatworks-support-footer',
    transformIndexHtml: {
      order: 'post',
      handler() {
        return [
          {
            tag: 'script',
            injectTo: 'body',
            attrs: {
              src: '/support-footer.js',
              defer: true,
              'data-app': 'PDF Presenter',
              'data-repo': 'https://github.com/stoatworks-labs/pdf-presenter',
              'data-version': `v${pkg.version}`,
              'data-note':
                'It runs entirely in your browser — no PDF you open is uploaded.'
            }
          }
        ]
      }
    }
  }
}

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
  plugins: [react(), supportFooter()]
})
