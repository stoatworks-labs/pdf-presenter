import { useState } from 'react'
import Modal from './Modal'

/**
 * "Make double-clicking a PDF just open here" — as one button.
 *
 * What actually happens differs by OS (neither Windows nor macOS let a
 * third-party app silently seize the default-app slot, by design): on
 * Windows this registers the app as a candidate then opens Settings for
 * the user to make the final pick; on macOS it registers with Launch
 * Services and sets the default directly if `duti` is installed, else
 * shows the real manual steps; on Linux it's fully automatic via
 * `xdg-mime`. The status message always reflects what actually happened —
 * never a fake "success" when the real answer is "you still need to pick
 * it yourself."
 */
function SetDefaultPdfAppControl(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // A web page has no say over which application owns .pdf on this machine.
  const supported = window.api.capabilities.desktopIntegration

  const setDefault = async (): Promise<void> => {
    setBusy(true)
    setStatus(null)
    try {
      const result = await window.api.defaultPdfApp.set()
      setStatus(result.message)
    } catch (err) {
      setStatus(`Could not set as default: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  if (!supported) return null

  return (
    <>
      <button className="transport-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Default PDF App
      </button>
      {open && (
        <Modal title="Default PDF App" onClose={() => setOpen(false)}>
          <p className="modal-hint">
            Make {window.api.productName} the app that opens when you double-click a PDF. Windows
            and macOS both require you to confirm this yourself — this button gets you as close to
            done as an app is allowed to.
          </p>
          <div className="modal-actions">
            <button className="transport-btn" onClick={setDefault} disabled={busy}>
              {busy ? 'Setting…' : 'Set as Default PDF App'}
            </button>
          </div>
          {status && <p className="modal-status">{status}</p>}
        </Modal>
      )}
    </>
  )
}

export default SetDefaultPdfAppControl
