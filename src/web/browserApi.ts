/**
 * Browser implementation of {@link PresenterApi} — the hosted, install-free build.
 *
 * The page is the whole application. pdf.js already renders in the tab, so the
 * presenter view, the Output window, the thumbnail strip and the transport are
 * the real thing; the PDF is read through a file picker and never uploaded.
 *
 * What a tab cannot do, it says so rather than pretending:
 *
 *   - **OSC** needs a UDP socket. Not available, at any privilege level.
 *   - **The watch folder** needs to list a directory by path.
 *   - **Wallpaper / default-PDF-app** are the desktop's business, not a page's.
 *   - **Diagnostics** collects from a log folder that does not exist here.
 *
 * Those four are implemented as inert stubs so the shared React effects can
 * subscribe unconditionally, and `capabilities` reports them false so the UI
 * hides the controls. The one remaining difference is the Output window: it is
 * an ordinary popup, so the operator places it and clicks to go fullscreen.
 */

import type {
  DisplayInfo,
  OpenPdfResult,
  PresenterApi,
  SetDefaultPdfResult,
  Unsubscribe
} from '../shared/api'
import type { OutputState, LaserPosition } from '../shared/output'
import type { OscConfig } from '../shared/osc'
import type { FileControlConfig } from '../shared/files'
import { openChannel, OUTPUT_MODE_QUERY, type ChannelMessage } from './outputChannel'

/* -------------------------------------------------------------- PDF loading */

/**
 * Base64 in fixed-size chunks.
 *
 * `String.fromCharCode(...bytes)` on a whole deck overflows the argument limit
 * and throws — a 20 MB PDF is 20 million arguments.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function pickPdf(): Promise<OpenPdfResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,application/pdf'
    input.onchange = async (): Promise<void> => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const bytes = new Uint8Array(await file.arrayBuffer())
      resolve({ filePath: file.name, data: toBase64(bytes) })
    }
    // A cancelled dialog fires no event, leaving this pending — harmless for a
    // one-shot action the operator can simply repeat.
    input.click()
  })
}

/* ------------------------------------------------------------ Output window */

const channel = openChannel()

/** Subscribers, kept as sets so several components can listen independently. */
const stateListeners = new Set<(state: OutputState) => void>()
const laserListeners = new Set<(position: LaserPosition | null) => void>()
const keyListeners = new Set<(action: Extract<ChannelMessage, { kind: 'key' }>['action']) => void>()
const openListeners = new Set<(open: boolean) => void>()

/**
 * The last state the control window pushed.
 *
 * Only ever set in the control window, which is what makes it the one that
 * answers `request-state` — the Output window has nothing to replay.
 */
let latestState: OutputState | null = null

let outputWindow: Window | null = null
let closeWatch: number | null = null

function notifyOpen(open: boolean): void {
  openListeners.forEach((l) => l(open))
}

/**
 * Poll for the popup being closed from its own title bar.
 *
 * `window.open` gives no close event to the opener, and the popup's own
 * `pagehide` broadcast is best-effort — a killed tab sends nothing. Polling
 * `closed` is the only reliable signal.
 */
function watchForClose(): void {
  if (closeWatch !== null) return
  closeWatch = window.setInterval(() => {
    if (outputWindow && outputWindow.closed) {
      outputWindow = null
      window.clearInterval(closeWatch!)
      closeWatch = null
      notifyOpen(false)
    }
  }, 500)
}

channel.onmessage = (event: MessageEvent<ChannelMessage>): void => {
  const message = event.data
  switch (message.kind) {
    case 'state':
      stateListeners.forEach((l) => l(message.state))
      break
    case 'laser':
      laserListeners.forEach((l) => l(message.position))
      break
    case 'key':
      keyListeners.forEach((l) => l(message.action))
      break
    case 'request-state':
      if (latestState) channel.postMessage({ kind: 'state', state: latestState })
      break
    case 'output-closed':
      outputWindow = null
      notifyOpen(false)
      break
  }
}

/**
 * Put the popup on a second screen when the browser will say where one is.
 *
 * The Window Management API is Chromium-only and prompts for permission, so it
 * is asked for here — inside the click that opens the Output — rather than on
 * load, and a refusal just means a default-placed popup.
 */
async function secondScreenFeatures(): Promise<string> {
  const fallback = 'width=1280,height=720'
  if (!('getScreenDetails' in window)) return fallback
  try {
    const details = await (
      window as unknown as {
        getScreenDetails: () => Promise<{
          screens: {
            left: number
            top: number
            width: number
            height: number
            isPrimary: boolean
          }[]
        }>
      }
    ).getScreenDetails()
    const target = details.screens.find((s) => !s.isPrimary)
    if (!target) return fallback
    return `left=${target.left},top=${target.top},width=${target.width},height=${target.height}`
  } catch {
    // Permission refused or dismissed — an ordinary popup still works.
    return fallback
  }
}

/* ---------------------------------------------------------------- Stub data */

const DISABLED_FILES: FileControlConfig = {
  folderPath: null,
  relativeToHome: null,
  enabled: false
}

const INERT_OSC: OscConfig = {
  localPort: 0,
  remoteHost: '',
  remotePort: 0,
  autoStart: false
}

const noop = (): Unsubscribe => (): void => {}

/* ----------------------------------------------------------------- The API */

export const browserApi: PresenterApi = {
  // "Lite" is the hosted build: same presenter, minus everything below.
  productName: 'PDF Presenter Lite',

  capabilities: {
    osc: false,
    fileControl: false,
    desktopIntegration: false,
    diagnostics: false,
    managedOutputWindow: false
  },

  pdf: {
    open: pickPdf
  },

  output: {
    /**
     * One entry, always.
     *
     * A browser will not enumerate monitors without a permission prompt, and
     * OutputControl only renders its picker for more than one display — so this
     * keeps the picker hidden while still letting the Start Output button
     * enable (it requires a selectable display).
     */
    listDisplays: async (): Promise<DisplayInfo[]> => [
      { id: 0, label: 'Browser window', width: 0, height: 0, internal: false, primary: true }
    ],

    open: async (): Promise<void> => {
      if (outputWindow && !outputWindow.closed) {
        outputWindow.focus()
        return
      }
      const features = await secondScreenFeatures()
      const url = `${window.location.pathname}?${OUTPUT_MODE_QUERY}`
      // Must stay inside the click that triggered this, or a popup blocker eats
      // it. Awaiting the screen lookup above keeps the gesture in Chromium; if a
      // browser ever disagrees, `opened` is null and we say so.
      const opened = window.open(url, 'pdf-presenter-output', features)
      if (!opened) {
        throw new Error(
          'The Output window was blocked. Allow pop-ups for this site, then press Start Output again.'
        )
      }
      outputWindow = opened
      watchForClose()
      notifyOpen(true)
    },

    close: async (): Promise<void> => {
      outputWindow?.close()
      outputWindow = null
      notifyOpen(false)
    },

    isOpen: async (): Promise<boolean> => outputWindow !== null && !outputWindow.closed,

    /**
     * Ask the control window to resend.
     *
     * Called by the Output window as it mounts. Resolves null and lets the
     * `onState` subscription deliver the answer, rather than racing a reply.
     */
    getState: async (): Promise<OutputState | null> => {
      channel.postMessage({ kind: 'request-state' } satisfies ChannelMessage)
      return null
    },

    pushState: async (state: OutputState): Promise<void> => {
      latestState = state
      channel.postMessage({ kind: 'state', state } satisfies ChannelMessage)
    },

    pushLaserPosition: async (position: LaserPosition | null): Promise<void> => {
      channel.postMessage({ kind: 'laser', position } satisfies ChannelMessage)
    },

    onOpenChanged: (callback: (open: boolean) => void): Unsubscribe => {
      openListeners.add(callback)
      return () => openListeners.delete(callback)
    },

    // Nothing to report: the display list never changes here.
    onDisplaysChanged: noop,

    onState: (callback: (state: OutputState) => void): Unsubscribe => {
      stateListeners.add(callback)
      return () => stateListeners.delete(callback)
    },

    onLaserPosition: (callback: (position: LaserPosition | null) => void): Unsubscribe => {
      laserListeners.add(callback)
      return () => laserListeners.delete(callback)
    }
  },

  control: {
    onKeyAction: (callback): Unsubscribe => {
      keyListeners.add(callback)
      return () => keyListeners.delete(callback)
    }
  },

  // --- Inert below: subscribed by the shared UI, reported false in capabilities.

  osc: {
    start: async () => {},
    stop: async () => {},
    isRunning: async () => false,
    getConfig: async () => INERT_OSC,
    setConfig: async () => INERT_OSC,
    send: async () => {},
    onAction: noop,
    onStatusChanged: noop
  },

  files: {
    getConfig: async () => DISABLED_FILES,
    setEnabled: async () => DISABLED_FILES,
    setFolderRelative: async () => DISABLED_FILES,
    chooseFolder: async () => DISABLED_FILES,
    list: async () => [],
    open: async () => null
  },

  wallpaper: {
    set: async () => {}
  },

  defaultPdfApp: {
    set: async (): Promise<SetDefaultPdfResult> => ({
      status: 'manual',
      message: 'A web page cannot register itself as your default PDF application.'
    })
  },

  diag: {
    collect: async () => {
      throw new Error(
        'Diagnostics bundles are collected from a log folder, which this build has no'
      )
    },
    openLogFolder: async () => {
      throw new Error('There is no log folder in a browser build.')
    }
  }
}

/**
 * Wire up the Output window's side of the channel.
 *
 * Called only from the Output entry: relays transport keys back to the control
 * window (Electron does this from the main process) and tells it when this
 * window is closing.
 */
export function installOutputBridge(onKey: (event: KeyboardEvent) => void): void {
  window.addEventListener('keydown', onKey)
  window.addEventListener('pagehide', () => {
    channel.postMessage({ kind: 'output-closed' } satisfies ChannelMessage)
  })
}

/** Send a transport action from the Output window to the control window. */
export function sendKeyAction(action: Extract<ChannelMessage, { kind: 'key' }>['action']): void {
  channel.postMessage({ kind: 'key', action } satisfies ChannelMessage)
}
