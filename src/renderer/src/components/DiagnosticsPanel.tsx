import { useState } from 'react'
import Modal from './Modal'

/**
 * "Something went wrong, send me the details" — as one button.
 *
 * The bundle is a single JSON file holding the logs, the build identity, the
 * settings (with anything password-shaped removed) and any recent crash
 * report. Behind a popup: this is a support tool, not something anyone needs
 * during a show, and it must not disturb the presenter view to open it.
 *
 * The path is copied to the clipboard as well as shown, because nobody retypes
 * a path out of a dialog, and revealed in the file manager because on macOS it
 * lives under ~/Library/Logs, which is hidden in Finder by default.
 */
function DiagnosticsPanel(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The bundle is collected from a log folder on disk, which a browser build
  // does not have.
  const supported = window.api.capabilities.diagnostics

  const collect = async (): Promise<void> => {
    setBusy(true)
    setStatus(null)
    try {
      const path = await window.api.diag.collect()
      try {
        await navigator.clipboard.writeText(path)
        setStatus(`Written to ${path} — path copied to your clipboard.`)
      } catch {
        // Clipboard access can be refused; the path is still on screen.
        setStatus(`Written to ${path}`)
      }
    } catch (err) {
      setStatus(`Could not collect diagnostics: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const openFolder = async (): Promise<void> => {
    try {
      await window.api.diag.openLogFolder()
    } catch (err) {
      setStatus(`Could not open the log folder: ${(err as Error).message}`)
    }
  }

  if (!supported) return null

  return (
    <>
      <button className="transport-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Diagnostics
      </button>
      {open && (
        <Modal title="Diagnostics" onClose={() => setOpen(false)}>
          <p className="modal-hint">
            If something goes wrong, collect diagnostics and attach the file to your bug report. It
            holds the logs, the app version, your settings with any passwords removed, and details
            of any recent crash.
          </p>
          <div className="modal-actions">
            <button className="transport-btn" onClick={collect} disabled={busy}>
              {busy ? 'Collecting…' : 'Collect Diagnostics'}
            </button>
            <button className="transport-btn" onClick={openFolder}>
              Open Log Folder
            </button>
          </div>
          {status && <p className="modal-status">{status}</p>}
        </Modal>
      )}
    </>
  )
}

export default DiagnosticsPanel
