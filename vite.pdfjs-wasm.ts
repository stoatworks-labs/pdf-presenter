import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, join } from 'node:path'
import type { Plugin } from 'vite'

/**
 * pdf.js keeps its JPEG 2000 (OpenJPEG), JBIG2 and ICC (qcms) decoders as
 * WebAssembly fetched at runtime from the `wasmUrl` API option — they are not
 * bundled into pdf.worker. Leave `wasmUrl` unset and pdf.js resolves the literal
 * path `nullopenjpeg.wasm`, every decode of that format fails, and pages render
 * their text with no images at all. It fails as a console warning rather than a
 * rejected render promise, so the app has no idea anything went wrong.
 *
 * That is not an exotic case: decks exported through Chromium (Google Slides,
 * Canva, and anything that has been through the 3-Heights optimiser many event
 * organisers run submissions through) routinely store every single image as
 * JPEG 2000. For those files this is the difference between a deck that
 * presents and a deck of empty text frames.
 *
 * The whole directory is copied rather than an allowlist of the decoders we
 * think we need. pdf.js fetches these lazily — only once a page actually
 * contains an image in that format — so an unused decoder costs build output
 * size and nothing else, while a hand-maintained list is one pdfjs-dist upgrade
 * away from silently missing a new one and reintroducing exactly this bug.
 */

const require = createRequire(import.meta.url)

/** Where the decoders are served and emitted, relative to index.html. */
export const PDFJS_WASM_PATH = 'pdfjs-wasm'

const CONTENT_TYPES: Record<string, string> = {
  '.wasm': 'application/wasm',
  '.js': 'text/javascript'
}

function wasmSourceDir(): string {
  // Resolved through the package rather than a hardcoded node_modules path so
  // it still works when npm hoists or dedupes pdfjs-dist somewhere else.
  return join(require.resolve('pdfjs-dist/package.json'), '..', 'wasm')
}

export function pdfjsWasm(): Plugin {
  return {
    name: 'pdfjs-wasm',

    // The dev server has no build output to serve these from, and pdf.js fetches
    // them at runtime, so they need their own route.
    configureServer(server) {
      const dir = wasmSourceDir()
      const prefix = `/${PDFJS_WASM_PATH}/`

      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0]
        if (!path?.startsWith(prefix)) return next()

        // pdf.js only ever asks for a flat filename from this directory, so
        // anything carrying a separator is a traversal attempt. Decoded first:
        // an encoded "%2e%2e%2f" would otherwise slip past this check and only
        // fail later because no such literal filename exists on disk.
        let name: string
        try {
          name = decodeURIComponent(path.slice(prefix.length))
        } catch {
          return next()
        }
        if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
          return next()
        }

        let body: Buffer
        try {
          body = readFileSync(join(dir, name))
        } catch {
          return next()
        }
        res.setHeader('Content-Type', CONTENT_TYPES[extname(name)] ?? 'application/octet-stream')
        res.end(body)
      })
    },

    // Emitted with an explicit `fileName` so the paths stay unhashed: pdf.js
    // builds them by concatenating a bare filename onto `wasmUrl`, so a
    // content-hashed asset name would never be requested.
    generateBundle() {
      const dir = wasmSourceDir()
      for (const name of readdirSync(dir)) {
        this.emitFile({
          type: 'asset',
          fileName: `${PDFJS_WASM_PATH}/${name}`,
          source: readFileSync(join(dir, name))
        })
      }
    }
  }
}
