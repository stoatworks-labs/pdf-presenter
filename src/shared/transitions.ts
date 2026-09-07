/**
 * Slide transitions for the Output window.
 *
 * Deliberately global rather than per-slide: a PDF carries no transition
 * metadata to attach anything to, and a presenter picks one look for a deck
 * and leaves it alone. One effect, one direction, one duration, applied to
 * every page change.
 *
 * The presenter view is *not* transitioned — the operator needs to see the
 * true current state with no lag, so Now/Next always cut.
 */

export type TransitionEffect =
  /** No transition — the page changes on the next frame. */
  | 'cut'
  /** Cross-fade: the new slide fades up over the old one. */
  | 'fade'
  /** Fade down to black, swap, fade back up. */
  | 'dip-black'
  /** Fade down to white, swap, fade back up. */
  | 'dip-white'
  /** Both slides travel: the new one shoves the old one off-screen. */
  | 'push'
  /** Both slides stay put; the new one is revealed under a moving edge. */
  | 'wipe'
  /** The old slide stays put; the new one slides in on top of it. */
  | 'cover'
  /** The new slide stays put; the old one slides away to reveal it. */
  | 'uncover'
  /** The new slide scales up from slightly small while fading in. */
  | 'zoom'

/**
 * The edge the transition is anchored to, named for where the *new* slide
 * comes from. Everything then travels away from that edge, which keeps the
 * direction of motion identical across all four directional effects:
 * `left` always means "movement to the right".
 *
 * For `uncover` the new slide doesn't move — so `left` is the old slide
 * exiting rightwards, which is the same motion the eye reads as "the new
 * one is over on the left".
 */
export type TransitionEdge =
  'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/**
 * What the operator picks: a fixed edge, or `dynamic`, which follows the way
 * the deck is moving — advancing comes from the left, stepping back comes
 * from the right, so going back visibly undoes the move that went forward.
 * Resolved to an edge per page change by `resolveDirection`.
 */
export type TransitionDirection = TransitionEdge | 'dynamic'

/** Which way a page change goes through the deck. A jump to an earlier
 * slide from a thumbnail counts as backward just as Previous does. */
export type SlideTravel = 'forward' | 'backward'

export interface TransitionSettings {
  effect: TransitionEffect
  /** Ignored by the non-directional effects, but kept set so switching back
   * to a directional one restores the direction you last chose. */
  direction: TransitionDirection
  /** Total time for the whole transition, in milliseconds. For the dips this
   * covers both halves — down and back up. */
  durationMs: number
}

export const TRANSITION_EFFECTS: readonly TransitionEffect[] = [
  'cut',
  'fade',
  'dip-black',
  'dip-white',
  'push',
  'wipe',
  'cover',
  'uncover',
  'zoom'
]

export const TRANSITION_DIRECTIONS: readonly TransitionDirection[] = [
  'left',
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'dynamic'
]

export const TRANSITION_EFFECT_LABELS: Record<TransitionEffect, string> = {
  cut: 'Cut',
  fade: 'Fade',
  'dip-black': 'Dip to black',
  'dip-white': 'Dip to white',
  push: 'Push',
  wipe: 'Wipe',
  cover: 'Cover',
  uncover: 'Uncover',
  zoom: 'Zoom'
}

export const TRANSITION_DIRECTION_LABELS: Record<TransitionDirection, string> = {
  left: 'From left',
  right: 'From right',
  top: 'From top',
  bottom: 'From bottom',
  'top-left': 'From top left',
  'top-right': 'From top right',
  'bottom-left': 'From bottom left',
  'bottom-right': 'From bottom right',
  dynamic: 'Dynamic (left forward, right back)'
}

/** Which effects actually read `direction` — the rest hide the picker. */
export function isDirectional(effect: TransitionEffect): boolean {
  return effect === 'push' || effect === 'wipe' || effect === 'cover' || effect === 'uncover'
}

/** Long enough to read as deliberate, short enough that nobody waits for it. */
export const DEFAULT_TRANSITION: TransitionSettings = {
  effect: 'cut',
  direction: 'left',
  durationMs: 500
}

/** Above this a transition stops being a transition and starts being a wait;
 * at 0 every effect degenerates to a cut, which `cut` already does. */
export const MIN_TRANSITION_MS = 50
export const MAX_TRANSITION_MS = 5000

export function clampTransitionMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_TRANSITION.durationMs
  return Math.min(Math.max(Math.round(ms), MIN_TRANSITION_MS), MAX_TRANSITION_MS)
}

export function isTransitionEffect(value: string): value is TransitionEffect {
  return (TRANSITION_EFFECTS as readonly string[]).includes(value)
}

export function isTransitionDirection(value: string): value is TransitionDirection {
  return (TRANSITION_DIRECTIONS as readonly string[]).includes(value)
}

/**
 * The edge a page change actually comes from. The fixed choices are their own
 * answer; `dynamic` reads the travel, so the same setting plays as "from left"
 * going forward and "from right" coming back.
 */
export function resolveDirection(
  direction: TransitionDirection,
  travel: SlideTravel
): TransitionEdge {
  if (direction !== 'dynamic') return direction
  return travel === 'backward' ? 'right' : 'left'
}

/**
 * Unit vector for the direction everything travels, in screen coordinates
 * (x right, y down) — i.e. pointing *away* from `direction`'s edge. The
 * diagonals are deliberately (±1, ±1) rather than normalised: a diagonal
 * push has to clear the full width *and* the full height, so each axis needs
 * its own full travel.
 */
export function directionVector(direction: TransitionEdge): { x: number; y: number } {
  switch (direction) {
    case 'left':
      return { x: 1, y: 0 }
    case 'right':
      return { x: -1, y: 0 }
    case 'top':
      return { x: 0, y: 1 }
    case 'bottom':
      return { x: 0, y: -1 }
    case 'top-left':
      return { x: 1, y: 1 }
    case 'top-right':
      return { x: -1, y: 1 }
    case 'bottom-left':
      return { x: 1, y: -1 }
    case 'bottom-right':
      return { x: -1, y: -1 }
  }
}
