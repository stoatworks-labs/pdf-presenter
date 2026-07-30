import { useState } from 'react'

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
function SetDefaultPdfAppControl(): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="default-pdf-app-control">
      <button
        className="default-pdf-app-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        Default PDF App
      </button>
      {expanded && (
        <div className="default-pdf-app-body">
          <p className="default-pdf-app-hint">
            Make PDF Presenter Lite the app that opens when you double-click a PDF. Windows and
            macOS both require you to confirm this yourself — this button gets you as close to done
            as an app is allowed to.
          </p>
          <button onClick={setDefault} disabled={busy}>
            {busy ? 'Setting…' : 'Set as Default PDF App'}
          </button>
          {status && <p className="default-pdf-app-status">{status}</p>}
        </div>
      )}
    </div>
  )
}

export default SetDefaultPdfAppControl
