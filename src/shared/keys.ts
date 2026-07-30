/** The transport actions a keypress can trigger.
 *
 * Presentation clickers are keyboards: they send PageUp/PageDown (and
 * sometimes the arrows or a blank-screen key), so anything that handles a
 * clicker handles a keyboard and vice versa. The mapping lives here, in
 * shared, because it is consumed from two processes at once — the control
 * window's own DOM handler, and the main process watching raw input on the
 * fullscreen Output window so a focused Output still drives the show. */
export type ControlKeyAction = 'next' | 'previous' | 'toggle-black' | 'toggle-white'

/** Maps a `KeyboardEvent.key` (Electron's `input.key` uses the same values)
 *  onto a transport action, or null if the key means nothing to us.
 *
 *  'Spacebar' is matched alongside ' ' because some input paths still report
 *  the space bar under its legacy name rather than as a literal space. */
export function controlKeyAction(key: string): ControlKeyAction | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
    case 'Spacebar':
      return 'next'
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      return 'previous'
    case 'b':
    case 'B':
      return 'toggle-black'
    case 'w':
    case 'W':
      return 'toggle-white'
    default:
      return null
  }
}
