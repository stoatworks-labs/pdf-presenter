/**
 * The wire between the control window and the Output window, in the browser.
 *
 * Electron has a main process in the middle: the control renderer sends over
 * IPC, main forwards to the Output window, and main holds the last state so an
 * Output that finishes loading after a push still gets it. There is no such
 * middle here, so the two windows talk directly over a BroadcastChannel and the
 * control window keeps that last-state copy itself.
 *
 * BroadcastChannel does not echo to the posting context, so both windows can
 * share one channel without hearing themselves.
 */

import type { OutputState, LaserPosition } from '../shared/output'
import type { ControlKeyAction } from '../shared/keys'

export const CHANNEL_NAME = 'pdf-presenter-lite'

/** Query string that makes the shared bundle mount Output instead of App. */
export const OUTPUT_MODE_QUERY = 'mode=output'

export type ChannelMessage =
  /** control -> output: what to show. */
  | { kind: 'state'; state: OutputState }
  /** control -> output: where the laser dot is, or null to hide it. */
  | { kind: 'laser'; position: LaserPosition | null }
  /**
   * output -> control: "I'm up, send me the current state." Replaces Electron's
   * `output:get-state` pull, which a browser popup cannot do synchronously.
   */
  | { kind: 'request-state' }
  /** output -> control: a transport key was pressed while Output had focus. */
  | { kind: 'key'; action: ControlKeyAction }
  /** output -> control: this window is going away. */
  | { kind: 'output-closed' }

export function openChannel(): BroadcastChannel {
  return new BroadcastChannel(CHANNEL_NAME)
}

/** True when this window is the fullscreen Output rather than the control UI. */
export function isOutputWindow(): boolean {
  return new URLSearchParams(window.location.search).get('mode') === 'output'
}
