import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { OutputState, LaserPosition } from '../shared/output'
import type { ControlKeyAction } from '../shared/keys'
import type { OscArg, OscAction, OscConfig } from '../shared/osc'
import type { FileControlConfig } from '../shared/files'
import type {
  DisplayInfo,
  OpenPdfResult,
  PresenterApi,
  SetDefaultPdfResult,
  Unsubscribe
} from '../shared/api'

const api: PresenterApi = {
  // The desktop app is the full-capability backend: it owns a UDP socket, the
  // filesystem, and the desktop itself.
  capabilities: {
    osc: true,
    fileControl: true,
    desktopIntegration: true,
    diagnostics: true,
    managedOutputWindow: true
  },

  pdf: {
    open: (): Promise<OpenPdfResult | null> => ipcRenderer.invoke('pdf:open')
  },
  output: {
    listDisplays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke('output:list-displays'),
    open: (displayId?: number): Promise<void> => ipcRenderer.invoke('output:open', displayId),
    close: (): Promise<void> => ipcRenderer.invoke('output:close'),
    isOpen: (): Promise<boolean> => ipcRenderer.invoke('output:is-open'),
    getState: (): Promise<OutputState | null> => ipcRenderer.invoke('output:get-state'),
    pushState: (state: OutputState): Promise<void> =>
      ipcRenderer.invoke('output:push-state', state),
    onOpenChanged: (callback: (open: boolean) => void): Unsubscribe => {
      const listener = (_e: Electron.IpcRendererEvent, open: boolean): void => callback(open)
      ipcRenderer.on('output:open-changed', listener)
      return (): void => {
        ipcRenderer.removeListener('output:open-changed', listener)
      }
    },
    onDisplaysChanged: (callback: (displays: DisplayInfo[]) => void): Unsubscribe => {
      const listener = (_e: Electron.IpcRendererEvent, displays: DisplayInfo[]): void =>
        callback(displays)
      ipcRenderer.on('output:displays-changed', listener)
      return (): void => {
        ipcRenderer.removeListener('output:displays-changed', listener)
      }
    },
    onState: (callback: (state: OutputState) => void): Unsubscribe => {
      const listener = (_e: Electron.IpcRendererEvent, state: OutputState): void => callback(state)
      ipcRenderer.on('output:state', listener)
      return (): void => {
        ipcRenderer.removeListener('output:state', listener)
      }
    },
    pushLaserPosition: (position: LaserPosition | null): Promise<void> =>
      ipcRenderer.invoke('output:push-laser-position', position),
    onLaserPosition: (callback: (position: LaserPosition | null) => void): Unsubscribe => {
      const listener = (_e: Electron.IpcRendererEvent, position: LaserPosition | null): void =>
        callback(position)
      ipcRenderer.on('output:laser-position', listener)
      return (): void => {
        ipcRenderer.removeListener('output:laser-position', listener)
      }
    }
  },
  control: {
    /** Transport keypresses that landed on the Output window instead of the
     *  control window, relayed by the main process so a focused Output (or a
     *  clicker aimed at it) still drives the show. */
    onKeyAction: (callback: (action: ControlKeyAction) => void): Unsubscribe => {
      const listener = (_e: Electron.IpcRendererEvent, action: ControlKeyAction): void =>
        callback(action)
      ipcRenderer.on('control:key-action', listener)
      return (): void => {
        ipcRenderer.removeListener('control:key-action', listener)
      }
    }
  },
  osc: {
    start: (): Promise<void> => ipcRenderer.invoke('osc:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('osc:stop'),
    isRunning: (): Promise<boolean> => ipcRenderer.invoke('osc:is-running'),
    getConfig: (): Promise<OscConfig> => ipcRenderer.invoke('osc:get-config'),
    setConfig: (next: Partial<OscConfig>): Promise<OscConfig> =>
      ipcRenderer.invoke('osc:set-config', next),
    send: (address: string, args: OscArg[]): Promise<void> =>
      ipcRenderer.invoke('osc:send', address, args),
    onAction: (callback: (action: OscAction) => void): Unsubscribe => {
      const listener = (_e: Electron.IpcRendererEvent, action: OscAction): void => callback(action)
      ipcRenderer.on('osc:action', listener)
      return (): void => {
        ipcRenderer.removeListener('osc:action', listener)
      }
    },
    onStatusChanged: (callback: (running: boolean) => void): Unsubscribe => {
      const listener = (_e: Electron.IpcRendererEvent, running: boolean): void => callback(running)
      ipcRenderer.on('osc:status-changed', listener)
      return (): void => {
        ipcRenderer.removeListener('osc:status-changed', listener)
      }
    }
  },
  files: {
    getConfig: (): Promise<FileControlConfig> => ipcRenderer.invoke('files:get-config'),
    setEnabled: (enabled: boolean): Promise<FileControlConfig> =>
      ipcRenderer.invoke('files:set-enabled', enabled),
    setFolderRelative: (relativePath: string): Promise<FileControlConfig> =>
      ipcRenderer.invoke('files:set-folder-relative', relativePath),
    chooseFolder: (): Promise<FileControlConfig> => ipcRenderer.invoke('files:choose-folder'),
    list: (): Promise<string[]> => ipcRenderer.invoke('files:list'),
    open: (filename: string): Promise<OpenPdfResult | null> =>
      ipcRenderer.invoke('files:open', filename)
  },
  wallpaper: {
    set: (base64Png: string): Promise<void> => ipcRenderer.invoke('wallpaper:set', base64Png)
  },
  defaultPdfApp: {
    set: (): Promise<SetDefaultPdfResult> => ipcRenderer.invoke('defaultPdfApp:set')
  },
  diag: {
    /** Write one JSON file describing the app's state and return its path. */
    collect: (): Promise<string> => ipcRenderer.invoke('diag:collect'),
    /** Reveal the log folder in the OS file manager. */
    openLogFolder: (): Promise<string> => ipcRenderer.invoke('diag:openLogFolder')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

export type Api = PresenterApi
