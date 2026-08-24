# Notes

Working notes for this repo: status, decisions, and the traps that have actually bitten.
Migrated out of Claude Code's memory on 2026-08-24, so they are written in the first
person and dated by when each thing was learned — that date is usually the useful part.

Cross-cutting notes that are not specific to this repo live in
[fleet-notes](https://github.com/stoatworks-labs/fleet-notes).

*PDF Presenter — Electron PDF presenter (presenter view + fullscreen output, OSC); its hosted browser build is separately named PDF Presenter Lite*

**PDF Presenter** — minimal presenter tool at `~/Projects/pdf-presenter`, PUBLIC, v1.3.1. Open a PDF → presenter view (Now/Next + thumbnail strip) on one screen, chrome-free fullscreen Output on another. pdf.js rendering, OSC control (+ its own Companion module), watched folder, laser pointer, wallpaper export, auto-advance. **Field proven on real events.** Stripped-down sibling of presentation-commander-client, from which `pdf.ts` is copied verbatim (see [shared discovery bugs](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_shared_discovery_bugs.md) on why "copied verbatim" is a debt marker).

**Renamed 2026-08-01** from *PDF Presenter Lite*. The two builds now carry different names on purpose: the desktop app is **PDF Presenter**, and the hosted browser build is **PDF Presenter Lite** — "lite" being exactly the capability gap, nothing else. What moved: repo `stoatworks-labs/pdf-presenter`, local dir, npm name, appId `com.allansargeant.pdf-presenter`, executable/artifact slug, Windows ProgID, diag app id (so logs are now `pdf-presenter/`), `RE_NAME`/`RE_SLUG`. **What deliberately did NOT move, because each would break something live:** the Worker + `pdf-presenter-lite.stoatworks-labs.com`, the web build's BroadcastChannel name, and the `companion-module-pdf-presenter-lite` repo *and module id* (a module id is what an installed Companion config points at). The website slug moved to `/software/pdf-presenter` with an Astro redirect from the old path. **v1.3.1 installers still carry the old name** — existing installs won't upgrade in place, since the OS sees a different appId.

**Slide transitions (2026-08-09)** — cut/fade/dip-black/dip-white/push/wipe/cover/uncover/zoom,
8 directions, one global duration, in **both** this repo and `presentation-commander-client`.
The four transition files join `pdf.ts` on the copied-between-repos debt list. Output/Program
only; the presenter view always cuts; Commander gates them to `kind: 'pdf'` because the
app-backed sources bring their own. The engine snapshots the outgoing slide off the live canvas
and animates the copy, so it never re-renders through pdf.js to hold the old slide — and it
**depends on** the issue-#28 double-buffering to put the incoming layer in its start state
before awaiting the render. See [browser pane verification traps](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_browser_pane_verification_traps.md) for how it was
verified.

Key structure: one `PresenterApi` interface in `src/shared/api.ts`, implemented by `src/preload/index.ts` (IPC) and `src/web/browserApi.ts`. The unavailable sub-APIs are **inert stubs** rather than omissions, so the shared React effects subscribe unconditionally — visibility is driven by `capabilities`. **Never sniff for Electron in a component** — and for the same reason the product name is served as `PresenterApi.productName`, never hardcoded in `src/renderer/src/`.

The Output window is `window.open('?mode=output')` + a **BroadcastChannel**, which replaces everything the Electron main process does between the two windows: state + laser forwarding, relaying transport keys pressed while Output has focus, and holding last-state so an Output that loads *after* a push can pull it. BroadcastChannel doesn't echo to the sender, so one channel serves both roles.

Verified in Chromium against a real multi-page PDF **and on a dual-display setup** (2026-08-01, by the user — Output places and goes fullscreen on the second screen). Still **not run on a real event**. Note the in-app preview browser turns `window.open` into a same-tab navigation, so cross-window testing needs two real tabs.
