/**
 * The `window.api` contract, shared by every backend.
 *
 * Two implement it: the Electron preload bridge (src/preload/index.ts) and the
 * browser backend (src/web/browserApi.ts) used by the hosted, install-free
 * build. The React UI is identical across both and talks only to this surface —
 * it must never sniff for Electron.
 *
 * Where a backend cannot do something, it still implements the method (as an
 * inert stub) so the UI's effects need no guards, and reports the gap through
 * {@link BackendCapabilities} so the UI can hide the control instead of offering
 * one that quietly does nothing.
 */

import type { OutputState, LaserPosition } from './output'
import type { ControlKeyAction } from './keys'
import type { OscArg, OscAction, OscConfig } from './osc'
import type { FileControlConfig } from './files'

export interface OpenPdfResult {
  filePath: string
  /** Base64-encoded PDF bytes. */
  data: string
}

export interface SetDefaultPdfResult {
  status: 'success' | 'manual' | 'error'
  message: string
}

export interface DisplayInfo {
  id: number
  label: string
  width: number
  height: number
  internal: boolean
  primary: boolean
}

/** Cancels a subscription. */
export type Unsubscribe = () => void

/**
 * What the backend behind `window.api` can actually do.
 *
 * All true under Electron. In a browser tab most of these are false, and for
 * one reason each time: a web page has no UDP socket, no path-addressable
 * filesystem, and no say over the desktop it is running on.
 */
export interface BackendCapabilities {
  /** The OSC control server. Needs a UDP socket, so browser-side it is false. */
  osc: boolean
  /** The watch-folder file list that OSC opens decks from. */
  fileControl: boolean
  /** Setting the desktop wallpaper, and registering as the default PDF app. */
  desktopIntegration: boolean
  /** Collecting a support bundle from the log folder. */
  diagnostics: boolean
  /**
   * Whether the backend itself puts the Output window on a chosen display and
   * makes it fullscreen. True in Electron, which enumerates the real monitors
   * and owns the window.
   *
   * False in a browser: the Output window is an ordinary popup, so there is no
   * display list to pick from and the operator drags it to the projector and
   * clicks to go fullscreen. Both the display picker and the fullscreen prompt
   * key off this.
   */
  managedOutputWindow: boolean
}

export interface PresenterApi {
  /**
   * What this build calls itself, for anywhere the UI names the product.
   *
   * The two backends carry different names: the desktop app is **PDF
   * Presenter**, and the hosted, install-free build is **PDF Presenter Lite** —
   * "lite" being exactly the sub-capability set {@link BackendCapabilities}
   * already describes. It comes from the backend for the same reason
   * everything else here does: the React UI is shared and must never sniff for
   * Electron to work out which one it is running in.
   */
  productName: string

  capabilities: BackendCapabilities

  pdf: {
    /** Prompt for a PDF and return its bytes, or null if cancelled. */
    open: () => Promise<OpenPdfResult | null>
  }

  output: {
    listDisplays: () => Promise<DisplayInfo[]>
    open: (displayId?: number) => Promise<void>
    close: () => Promise<void>
    isOpen: () => Promise<boolean>
    /** The last state pushed, for an Output that loaded after the push. */
    getState: () => Promise<OutputState | null>
    pushState: (state: OutputState) => Promise<void>
    onOpenChanged: (callback: (open: boolean) => void) => Unsubscribe
    onDisplaysChanged: (callback: (displays: DisplayInfo[]) => void) => Unsubscribe
    onState: (callback: (state: OutputState) => void) => Unsubscribe
    pushLaserPosition: (position: LaserPosition | null) => Promise<void>
    onLaserPosition: (callback: (position: LaserPosition | null) => void) => Unsubscribe
  }

  control: {
    /**
     * Transport keypresses that landed on the Output window instead of the
     * control window, relayed so a focused Output (or a clicker aimed at it)
     * still drives the show.
     */
    onKeyAction: (callback: (action: ControlKeyAction) => void) => Unsubscribe
  }

  osc: {
    start: () => Promise<void>
    stop: () => Promise<void>
    isRunning: () => Promise<boolean>
    getConfig: () => Promise<OscConfig>
    setConfig: (next: Partial<OscConfig>) => Promise<OscConfig>
    send: (address: string, args: OscArg[]) => Promise<void>
    onAction: (callback: (action: OscAction) => void) => Unsubscribe
    onStatusChanged: (callback: (running: boolean) => void) => Unsubscribe
  }

  files: {
    getConfig: () => Promise<FileControlConfig>
    setEnabled: (enabled: boolean) => Promise<FileControlConfig>
    setFolderRelative: (relativePath: string) => Promise<FileControlConfig>
    chooseFolder: () => Promise<FileControlConfig>
    list: () => Promise<string[]>
    open: (filename: string) => Promise<OpenPdfResult | null>
  }

  wallpaper: {
    set: (base64Png: string) => Promise<void>
  }

  defaultPdfApp: {
    set: () => Promise<SetDefaultPdfResult>
  }

  diag: {
    /** Write one JSON file describing the app's state and return its path. */
    collect: () => Promise<string>
    /** Reveal the log folder in the OS file manager. */
    openLogFolder: () => Promise<string>
  }
}
