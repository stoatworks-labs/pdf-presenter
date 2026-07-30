/** How many popup panels are currently open.
 *
 * Its own module rather than a second export from Modal.tsx, which would cost
 * that file its fast-refresh boundary. Module scope, not React context,
 * because the only consumer is a raw `keydown` listener on `window` — it just
 * needs to know whether a dialog owns the keyboard right now. */
let openCount = 0

export function modalOpened(): void {
  openCount += 1
}

export function modalClosed(): void {
  openCount -= 1
}

export function isModalOpen(): boolean {
  return openCount > 0
}
