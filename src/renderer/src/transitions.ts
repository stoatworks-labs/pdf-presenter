import {
  clampTransitionMs,
  directionVector,
  type TransitionSettings
} from '../../shared/transitions'

/**
 * Plays a transition between the slide currently on `canvas` and the one
 * `render` is about to draw there.
 *
 * The trick that makes this cheap: the *outgoing* slide is a plain pixel copy
 * of the canvas, taken before the render starts and laid over the top. Only
 * the copy and the live canvas ever move, so nothing here knows or cares that
 * the content came from pdf.js, and no second PDF render is needed to hold the
 * old slide on screen.
 *
 * It also composes with the double-buffering in pdf.ts (issue #28): the live
 * canvas keeps showing the old page until its render finishes, so the incoming
 * layer is put into its start state *before* the render is awaited and there is
 * never a frame where a half-drawn or blank page is visible.
 */

const MOVE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

interface ActiveTransition {
  finish: () => void
}

// One transition at a time per output frame. An operator holding Next down
// generates page changes far faster than a 500 ms transition can play, and
// stacked overlays would leave dead slides on screen.
const activeTransitions = new WeakMap<HTMLElement, ActiveTransition>()

/** A copy of what's on the canvas right now, or null if it has never been
 * drawn to (first slide of a session — nothing to transition *from*). */
function snapshotOf(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  if (canvas.width < 1 || canvas.height < 1) return null
  const copy = document.createElement('canvas')
  copy.width = canvas.width
  copy.height = canvas.height
  const context = copy.getContext('2d')
  if (!context) return null
  context.drawImage(canvas, 0, 0)
  return copy
}

function waitFor(animations: Animation[]): Promise<void> {
  // A cancelled animation rejects; that only happens when we cancel it
  // ourselves during teardown, where the rejection is the expected outcome.
  return Promise.all(animations.map((a) => a.finished.catch(() => {}))).then(() => {})
}

/**
 * Inset percentages for a wipe: the incoming slide is revealed by shrinking
 * the inset on the edge it comes from. Diagonals shrink two edges at once.
 */
function wipeClip(v: { x: number; y: number }, progress: number): string {
  const remaining = (1 - progress) * 100
  const top = v.y < 0 ? remaining : 0
  const right = v.x > 0 ? remaining : 0
  const bottom = v.y > 0 ? remaining : 0
  const left = v.x < 0 ? remaining : 0
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`
}

export async function transitionToSlide(
  frame: HTMLElement,
  canvas: HTMLCanvasElement,
  settings: TransitionSettings,
  render: () => Promise<void>
): Promise<void> {
  activeTransitions.get(frame)?.finish()

  const box = canvas.getBoundingClientRect()
  const outgoing = settings.effect === 'cut' ? null : snapshotOf(canvas)
  // Nothing to transition from, or nothing laid out to transition within.
  if (!outgoing || box.width < 1 || box.height < 1) {
    await render()
    return
  }

  const durationMs = clampTransitionMs(settings.durationMs)
  const v = directionVector(settings.direction)
  const dx = v.x * box.width
  const dy = v.y * box.height

  outgoing.className = 'slide-transition-outgoing'
  outgoing.style.width = `${box.width}px`
  outgoing.style.height = `${box.height}px`
  frame.appendChild(outgoing)

  // Full-viewport rather than slide-sized: a dip to white has to take the
  // letterbox with it, the same way the W blank does, or it reads as a white
  // rectangle on a black surround.
  const isDip = settings.effect === 'dip-black' || settings.effect === 'dip-white'
  const dip = isDip ? document.createElement('div') : null
  if (dip) {
    dip.className = 'slide-transition-dip'
    dip.style.background = settings.effect === 'dip-white' ? '#fff' : '#000'
    frame.ownerDocument.body.appendChild(dip)
  }

  // The incoming layer is the live canvas itself. z-index needs a position,
  // and `relative` leaves the layout exactly as it was.
  canvas.style.position = 'relative'

  const entry: ActiveTransition = { finish: () => {} }
  activeTransitions.set(frame, entry)

  const animations: Animation[] = []
  let settled = false
  const cleanup = (): void => {
    if (settled) return
    settled = true
    if (activeTransitions.get(frame) === entry) activeTransitions.delete(frame)
    // The movement keyframes fill forwards so the outgoing layer can't snap
    // back into view for a frame between finishing and being removed; that
    // fill has to be released here or it would outlive the transition and
    // override any inline style set later.
    for (const animation of animations) animation.cancel()
    outgoing.remove()
    dip?.remove()
    canvas.style.removeProperty('position')
    canvas.style.removeProperty('z-index')
    canvas.style.removeProperty('opacity')
    canvas.style.removeProperty('transform')
    canvas.style.removeProperty('clip-path')
  }
  entry.finish = () => {
    // finish() rather than cancel() so the slide lands where it was going —
    // an interrupted transition must never leave the output part-way through
    // a move. The awaiting continuation below then bails on `settled`.
    for (const animation of animations) animation.finish()
    cleanup()
  }

  try {
    if (dip) {
      // Phase one covers the render, which is exactly what a dip is for: the
      // swap happens while the screen is already at full black or white.
      const fadeIn = dip.animate(
        { opacity: [0, 1] },
        { duration: durationMs / 2, easing: 'linear', fill: 'forwards' }
      )
      animations.push(fadeIn)
      await Promise.all([waitFor([fadeIn]), render()])
      if (settled) return

      outgoing.remove()
      const fadeOut = dip.animate(
        { opacity: [1, 0] },
        { duration: durationMs / 2, easing: 'linear', fill: 'forwards' }
      )
      animations.push(fadeOut)
      await waitFor([fadeOut])
      cleanup()
      return
    }

    // Everything else: put the incoming layer into its start state first, so
    // the render happens behind a layer that is already hiding it.
    switch (settings.effect) {
      case 'fade':
        outgoing.style.zIndex = '2'
        break
      case 'push':
        canvas.style.zIndex = '2'
        canvas.style.transform = `translate(${-dx}px, ${-dy}px)`
        break
      case 'cover':
        canvas.style.zIndex = '2'
        canvas.style.transform = `translate(${-dx}px, ${-dy}px)`
        break
      case 'uncover':
        outgoing.style.zIndex = '2'
        break
      case 'wipe':
        canvas.style.zIndex = '2'
        canvas.style.clipPath = wipeClip(v, 0)
        break
      case 'zoom':
        canvas.style.zIndex = '2'
        canvas.style.opacity = '0'
        canvas.style.transform = 'scale(0.94)'
        break
    }

    await render()
    if (settled) return

    switch (settings.effect) {
      case 'fade':
        animations.push(
          outgoing.animate(
            { opacity: [1, 0] },
            { duration: durationMs, easing: 'linear', fill: 'forwards' }
          )
        )
        break
      case 'push':
        animations.push(
          outgoing.animate(
            { transform: ['translate(0px, 0px)', `translate(${dx}px, ${dy}px)`] },
            { duration: durationMs, easing: MOVE_EASING, fill: 'forwards' }
          ),
          canvas.animate(
            { transform: [`translate(${-dx}px, ${-dy}px)`, 'translate(0px, 0px)'] },
            { duration: durationMs, easing: MOVE_EASING, fill: 'forwards' }
          )
        )
        break
      case 'cover':
        animations.push(
          canvas.animate(
            { transform: [`translate(${-dx}px, ${-dy}px)`, 'translate(0px, 0px)'] },
            { duration: durationMs, easing: MOVE_EASING, fill: 'forwards' }
          )
        )
        break
      case 'uncover':
        animations.push(
          outgoing.animate(
            { transform: ['translate(0px, 0px)', `translate(${dx}px, ${dy}px)`] },
            { duration: durationMs, easing: MOVE_EASING, fill: 'forwards' }
          )
        )
        break
      case 'wipe':
        animations.push(
          canvas.animate(
            { clipPath: [wipeClip(v, 0), wipeClip(v, 1)] },
            { duration: durationMs, easing: MOVE_EASING, fill: 'forwards' }
          )
        )
        break
      case 'zoom':
        animations.push(
          canvas.animate(
            { opacity: [0, 1], transform: ['scale(0.94)', 'scale(1)'] },
            { duration: durationMs, easing: MOVE_EASING, fill: 'forwards' }
          )
        )
        break
    }

    await waitFor(animations)
    cleanup()
  } catch (err) {
    cleanup()
    throw err
  }
}
