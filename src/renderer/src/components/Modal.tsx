import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { modalOpened, modalClosed } from './modalState'

/**
 * A centred popup for the titlebar's occasional-use panels.
 *
 * Those panels used to expand *in place*, inside a 40px-high flex row that
 * was never built to hold a paragraph of text — so opening one shoved the
 * whole titlebar out of shape and the only visible way out was to quit the
 * app (#10). Rendering into a portal at the document root means the panel's
 * own size can never feed back into the page's layout, and there are three
 * obvious ways to dismiss it: the close button, Escape, or the backdrop.
 */

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
}

function Modal({ title, onClose, children }: Props): React.JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)

  // Lets the presenter-view key handler tell that a dialog owns the keyboard.
  useEffect(() => {
    modalOpened()
    return modalClosed
  }, [])

  // Focus moves into the dialog so Escape and Tab land somewhere sensible,
  // and so a stray Space doesn't advance the slide behind it.
  useEffect(() => {
    cardRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // Capture phase: this dialog gets first refusal on Escape, ahead of the
    // window-level listeners the rest of the app installs.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={cardRef}
        // The backdrop closes on click; clicks *inside* the dialog must not
        // bubble out to it and close the thing the user is using.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}

export default Modal
