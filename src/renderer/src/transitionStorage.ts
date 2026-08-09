import {
  DEFAULT_TRANSITION,
  clampTransitionMs,
  isTransitionDirection,
  isTransitionEffect,
  type TransitionSettings
} from '../../shared/transitions'

/**
 * The transition is a show setting, not a document one — an operator picks a
 * look once and expects it still to be there after a restart, five minutes
 * before doors. localStorage rather than an Electron config file because both
 * builds are web pages and this then needs no backend capability at all.
 */
const STORAGE_KEY = 'pdf-presenter.transition'

export function loadTransitionSettings(): TransitionSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_TRANSITION
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return DEFAULT_TRANSITION
    const { effect, direction, durationMs } = parsed as Record<string, unknown>
    return {
      effect:
        typeof effect === 'string' && isTransitionEffect(effect)
          ? effect
          : DEFAULT_TRANSITION.effect,
      direction:
        typeof direction === 'string' && isTransitionDirection(direction)
          ? direction
          : DEFAULT_TRANSITION.direction,
      durationMs:
        typeof durationMs === 'number'
          ? clampTransitionMs(durationMs)
          : DEFAULT_TRANSITION.durationMs
    }
  } catch {
    // Private-mode storage, a corrupt value, anything — a presenter losing
    // their transition choice is not worth failing a launch over.
    return DEFAULT_TRANSITION
  }
}

export function saveTransitionSettings(settings: TransitionSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // As above — best effort.
  }
}
