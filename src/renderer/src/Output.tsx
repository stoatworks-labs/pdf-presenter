import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { OutputState, LaserPosition } from '../../shared/output'
import { DEFAULT_TRANSITION } from '../../shared/transitions'
import { loadPdf, renderPageContain } from './pdf'
import { transitionToSlide } from './transitions'

function Output(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [state, setState] = useState<OutputState | null>(null)
  const [laserPosition, setLaserPosition] = useState<LaserPosition | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const lastDataRef = useRef<string | null>(null)
  // A freshly opened deck cuts rather than transitioning: swapping documents
  // is a reset, not a slide change, and dissolving from someone else's last
  // slide into a new deck's first one reads as a mistake.
  const deckChangedRef = useRef(true)

  /**
   * Only the browser build needs this. Electron opens the Output fullscreen on
   * a display the presenter chose; a browser popup is an ordinary window, and
   * only a gesture inside it can make it fullscreen — so it has to ask.
   */
  const needsFullscreenPrompt = !window.api.capabilities.managedOutputWindow && !isFullscreen

  useEffect(() => {
    const sync = (): void => setIsFullscreen(document.fullscreenElement !== null)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  useEffect(() => {
    const applyState = (next: OutputState): void => {
      setState(next)
      if (next.data && next.data !== lastDataRef.current) {
        lastDataRef.current = next.data
        deckChangedRef.current = true
        loadPdf(next.data).then(setDoc)
      }
    }
    // Pull whatever the presenter last pushed before this window's own
    // listener existed to register — a push sent while this window was
    // still loading is otherwise silently dropped (confirmed live).
    window.api.output.getState().then((current) => {
      if (current) applyState(current)
    })
    return window.api.output.onState(applyState)
  }, [])

  useEffect(() => {
    return window.api.output.onLaserPosition(setLaserPosition)
  }, [])

  // What's currently drawn, so a state push that changed something unrelated
  // (a laser toggle, or the transition settings themselves) doesn't re-render
  // — and, worse, doesn't play a transition from a slide to itself.
  const lastRenderRef = useRef<{
    canvas: HTMLCanvasElement
    doc: PDFDocumentProxy
    page: number
  } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const frame = frameRef.current
    if (!doc || !canvas || !frame || !state || state.screenBlank !== 'none') return
    // Nothing useful can be rendered into a window with no size (not yet laid
    // out, or hidden). Bail *before* recording it as rendered, so the next
    // state push tries again — otherwise the slide would never appear.
    if (window.innerWidth < 1 || window.innerHeight < 1) return

    const last = lastRenderRef.current
    if (last && last.canvas === canvas && last.doc === doc && last.page === state.currentPage)
      return

    const page = state.currentPage
    lastRenderRef.current = { canvas, doc, page }

    const render = (): Promise<void> =>
      renderPageContain(doc, page, canvas, window.innerWidth, window.innerHeight)

    // The canvas is remounted from scratch coming back from a blank, so
    // there's nothing on it to transition from either.
    const cut = deckChangedRef.current || last?.canvas !== canvas
    deckChangedRef.current = false

    const settings = cut ? { ...DEFAULT_TRANSITION, effect: 'cut' as const } : state.transition

    transitionToSlide(frame, canvas, settings ?? DEFAULT_TRANSITION, render).catch((err) =>
      console.error('Failed to render output page', err)
    )
  }, [doc, state])

  const blank = state?.screenBlank ?? 'none'
  const showLaser = state?.laserPointerEnabled && blank === 'none' && laserPosition

  return (
    <div
      className={`output-shell${state?.hideCursor ? ' output-shell--no-cursor' : ''}`}
      style={
        blank === 'black'
          ? { background: '#000' }
          : blank === 'white'
            ? { background: '#fff' }
            : undefined
      }
    >
      {needsFullscreenPrompt && (
        /* Two separate things, and the window usually gets the first one right
           on its own: placement is done by the opener (which can put this on the
           second screen when the browser allows it), but going fullscreen needs
           a gesture inside this window and nothing else will do. So the click is
           the headline and moving the window is the footnote. */
        <button
          className="output-fullscreen-prompt"
          onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
        >
          <strong>Click for fullscreen</strong>
          <span>If this window isn&rsquo;t on your output display, drag it there first.</span>
        </button>
      )}

      {blank === 'none' &&
        (doc && state ? (
          <div className="output-canvas-frame" ref={frameRef}>
            <canvas ref={canvasRef} />
            {showLaser && (
              <div
                className="laser-dot"
                style={{ left: `${laserPosition.xPct}%`, top: `${laserPosition.yPct}%` }}
              />
            )}
          </div>
        ) : (
          <div className="output-empty">No signal</div>
        ))}
    </div>
  )
}

export default Output
