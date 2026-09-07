import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { renderPageContain, getPageLinks } from '../pdf'
import type { PageLink } from '../pdf'
import {
  DEFAULT_NOW_NEXT_SPLIT,
  clampNowNextSplit,
  loadNowNextSplit,
  saveNowNextSplit
} from '../splitStorage'

const LASER_POINTER_THROTTLE_MS = 33 // ~30fps — plenty smooth for a UDP/IPC-forwarded dot

function SlideSlot({
  doc,
  pageNumber,
  label,
  grow,
  onNavigate,
  onAdvance,
  onPointerPosition
}: {
  doc: PDFDocumentProxy | null
  pageNumber: number | null
  label: string
  /** This slot's share of the row, as a flex-grow factor against the other
   * slot's — the divider between them is what sets it. */
  grow: number
  /** Only passed for the slot the presenter actually navigates from ("Now")
   * — when present, internal PDF links become clickable jump-to-page
   * shortcuts. Omitted for "Next", which is just a preview. */
  onNavigate?: (page: number) => void
  /** Only passed for "Next" — clicking anywhere on the preview advances to
   * it, since it's always exactly one page ahead of "Now". */
  onAdvance?: () => void
  /** Only passed for "Now", and only while the laser pointer is enabled —
   * mirrors the presenter's mouse position over this slide onto the Output
   * window. Position is normalized (0-100) against the frame's own box,
   * same convention as the link overlay above, so it lines up regardless
   * of how large this preview currently renders. null on pointer leave. */
  onPointerPosition?: (pos: { xPct: number; yPct: number } | null) => void
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)
  const [links, setLinks] = useState<PageLink[]>([])
  const [slotWidth, setSlotWidth] = useState(0)
  const [slotHeight, setSlotHeight] = useState(0)
  const lastPointerSendRef = useRef(0)

  const handlePointerMove = onPointerPosition
    ? (e: React.MouseEvent<HTMLDivElement>): void => {
        const now = performance.now()
        if (now - lastPointerSendRef.current < LASER_POINTER_THROTTLE_MS) return
        lastPointerSendRef.current = now
        const rect = e.currentTarget.getBoundingClientRect()
        onPointerPosition({
          xPct: ((e.clientX - rect.left) / rect.width) * 100,
          yPct: ((e.clientY - rect.top) / rect.height) * 100
        })
      }
    : undefined
  const handlePointerLeave = onPointerPosition ? () => onPointerPosition(null) : undefined

  // The slot is no longer a fixed half of the row — the divider resizes it at
  // will, and so does the window — so its size is tracked rather than read
  // once, and drives the render below.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Whole pixels: the box is fractional on a scaled display, and re-rendering
    // a PDF page over a third of a pixel is pure waste.
    const measure = (width: number, height: number): void => {
      setSlotWidth(Math.round(width))
      setSlotHeight(Math.round(height))
    }
    // Measured once here as well as observed. A ResizeObserver's very first
    // callback still only arrives with the next rendering step, and a hidden or
    // fully occluded window is not given one — so a presenter view whose PDF
    // was already open before the window was shown (the app opened by
    // double-clicking a PDF, or by the watched folder) would sit blank until it
    // appeared. Reading the box directly renders on mount as the fixed layout
    // used to; the observer's matching first callback then changes nothing.
    measure(container.clientWidth, container.clientHeight)
    const observer = new ResizeObserver(([entry]) => {
      measure(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Re-rendered at whatever size the slot currently has, not just when the page
  // changes: a canvas left at its old size is scaled by the browser, so a slot
  // dragged wider would show a soft, upscaled preview. The burst of sizes a
  // drag produces is safe because pdf.ts serializes renders per canvas and
  // drops any that a newer one has superseded before it touches the canvas.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!doc || !pageNumber || !canvas || slotWidth < 1 || slotHeight < 1) return
    renderPageContain(doc, pageNumber, canvas, slotWidth, slotHeight).catch((err) =>
      console.error('Failed to render slide', err)
    )
  }, [doc, pageNumber, slotWidth, slotHeight])

  // Percentages from getPageLinks line up with the canvas regardless of its
  // current render size, but only if the overlay sits over an element with
  // the exact same aspect ratio as the page — the surrounding
  // .slide-slot-canvas box can be a different ratio (it's just whatever
  // space is available), so a same-ratio .slide-slot-frame wrapper is what
  // the percentages are actually relative to.
  useEffect(() => {
    // Nothing to reset here on the null branch — the JSX below already only
    // renders the frame/overlay when pageNumber is truthy, so stale
    // aspectRatio/links from a previous page just go unused.
    if (!doc || !pageNumber) return
    let cancelled = false
    getPageLinks(doc, pageNumber).then((result) => {
      if (cancelled) return
      setAspectRatio(result.aspectRatio)
      setLinks(result.links)
    })
    return () => {
      cancelled = true
    }
  }, [doc, pageNumber])

  return (
    <div className="slide-slot" style={{ flexGrow: grow }}>
      <div className="slide-slot-label">{label}</div>
      <div
        className={`slide-slot-canvas${onAdvance ? ' slide-slot-canvas--clickable' : ''}`}
        ref={containerRef}
        onClick={onAdvance}
        title={onAdvance ? 'Go to this slide' : undefined}
      >
        {pageNumber ? (
          <div
            className="slide-slot-frame"
            style={aspectRatio ? { aspectRatio: `${aspectRatio}` } : undefined}
            onMouseMove={handlePointerMove}
            onMouseLeave={handlePointerLeave}
          >
            <canvas ref={canvasRef} />
            {onNavigate &&
              links.map((link, i) => (
                <button
                  key={i}
                  className="slide-link"
                  style={{
                    left: `${link.xPct}%`,
                    top: `${link.yPct}%`,
                    width: `${link.widthPct}%`,
                    height: `${link.heightPct}%`
                  }}
                  title={`Go to slide ${link.targetPage}`}
                  onClick={() => onNavigate(link.targetPage)}
                />
              ))}
          </div>
        ) : (
          <div className="slide-slot-empty">—</div>
        )}
      </div>
    </div>
  )
}

interface NowNextProps {
  doc: PDFDocumentProxy | null
  currentPage: number
  totalPages: number
  onNavigate: (page: number) => void
  /** Only meaningful while the laser pointer is enabled — see SlideSlot's
   * onPointerPosition doc comment. Omitted (not just false) when the
   * feature is off, so no mouse-tracking overhead exists at all. */
  onPointerPosition?: (pos: { xPct: number; yPct: number } | null) => void
}

function NowNext({
  doc,
  currentPage,
  totalPages,
  onNavigate,
  onPointerPosition
}: NowNextProps): React.JSX.Element {
  const nextPage = currentPage < totalPages ? currentPage + 1 : null
  const rowRef = useRef<HTMLDivElement>(null)
  const [split, setSplit] = useState(loadNowNextSplit)
  const [dragging, setDragging] = useState(false)

  const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    // Capturing means the drag survives the pointer leaving the 1px divider —
    // which it does immediately — and keeps going over the previews either
    // side of it, and past the window edge.
    e.currentTarget.setPointerCapture(e.pointerId)
    // Otherwise the drag starts a text selection across the two labels.
    e.preventDefault()
    setDragging(true)
  }

  const handleDividerPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    // Capture is set synchronously on pointerdown and released on pointerup,
    // so it — not React state — is the authority on whether this move is part
    // of a drag.
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const row = rowRef.current
    if (!row) return
    const rect = row.getBoundingClientRect()
    if (rect.width < 1) return
    // Straight from the pointer's position in the row rather than from an
    // accumulated delta, so the divider stays under the cursor even once the
    // clamp has stopped it moving.
    setSplit(clampNowNextSplit((e.clientX - rect.left) / rect.width))
  }

  const handleDividerPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDragging(false)
    // Once per drag, not once per pointermove.
    saveNowNextSplit(split)
  }

  const handleDividerDoubleClick = (): void => {
    setSplit(DEFAULT_NOW_NEXT_SPLIT)
    saveNowNextSplit(DEFAULT_NOW_NEXT_SPLIT)
  }

  return (
    <div ref={rowRef} className={`now-next${dragging ? ' now-next--resizing' : ''}`}>
      <SlideSlot
        doc={doc}
        pageNumber={doc ? currentPage : null}
        onPointerPosition={onPointerPosition}
        label="Now"
        grow={split}
        onNavigate={onNavigate}
      />
      {/* Deliberately not focusable, and with no arrow-key handling: the arrow
          keys are the transport, and a clicker is a keyboard. A separator that
          took focus would silently swallow the next/previous a presenter
          pressed mid-show. Dragging it is a mouse job, and double-clicking
          evens the two previews up again. */}
      <div
        className={`now-next-divider${dragging ? ' now-next-divider--dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the Now and Next previews"
        title="Drag to resize · double-click for an even split"
        onPointerDown={handleDividerPointerDown}
        onPointerMove={handleDividerPointerMove}
        onPointerUp={handleDividerPointerUp}
        onPointerCancel={handleDividerPointerUp}
        onDoubleClick={handleDividerDoubleClick}
      />
      <SlideSlot
        doc={doc}
        pageNumber={doc ? nextPage : null}
        label="Next"
        grow={1 - split}
        onAdvance={nextPage ? () => onNavigate(nextPage) : undefined}
      />
    </div>
  )
}

export default NowNext
