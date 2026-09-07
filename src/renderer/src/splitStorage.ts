/**
 * Where the presenter has dragged the divider between Now and Next, as Now's
 * share of the preview row's width.
 *
 * A show setting, not a document one — an operator who wants a big Now and a
 * glance-sized Next expects that balance still to be there after a restart, so
 * it persists exactly like the transition does: localStorage, which both
 * builds have without any backend capability.
 */
const STORAGE_KEY = 'pdf-presenter.nowNextSplit'

/** Half each — the fixed layout this replaced. */
export const DEFAULT_NOW_NEXT_SPLIT = 0.5

/**
 * Neither preview can be dragged away entirely. Below this share a slot is too
 * narrow to read anything from, and a divider shoved flat against the edge is
 * awkward to find again.
 */
const MIN_NOW_NEXT_SPLIT = 0.15
const MAX_NOW_NEXT_SPLIT = 0.85

export function clampNowNextSplit(split: number): number {
  if (!Number.isFinite(split)) return DEFAULT_NOW_NEXT_SPLIT
  return Math.min(Math.max(split, MIN_NOW_NEXT_SPLIT), MAX_NOW_NEXT_SPLIT)
}

export function loadNowNextSplit(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_NOW_NEXT_SPLIT
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? clampNowNextSplit(parsed) : DEFAULT_NOW_NEXT_SPLIT
  } catch {
    // Private-mode storage, a corrupt value, anything — losing a pane balance
    // is not worth failing a launch over.
    return DEFAULT_NOW_NEXT_SPLIT
  }
}

export function saveNowNextSplit(split: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(clampNowNextSplit(split)))
  } catch {
    // As above — best effort.
  }
}
