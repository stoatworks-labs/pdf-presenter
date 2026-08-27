# AGENTS.md — bringing an LLM up to speed on PDF Presenter

Orientation for an AI assistant (or a new human) picking this project up cold. There is no
`CLAUDE.md` here; this is the entry point.

---

## 1. What this is

A **minimal PDF-only presenter**: a Now/Next presenter view with clickable slide thumbnails
on one screen, and a fullscreen output window on another. No slide authoring, no media, no
show format — you open a PDF and present it.

Public repo, **v1.6.1**, and **field proven** — it has been run on real events.

It ships as **two builds from one codebase**: an Electron desktop app, and a hosted
browser build with no backend at all.

**The two builds have different names, deliberately.** The desktop app is **PDF
Presenter**; the hosted build is **PDF Presenter Lite**, "lite" meaning exactly the
capabilities a web page cannot have (§ the `BackendCapabilities` table). The repo, the
npm package and the desktop app id are `pdf-presenter`; the Worker and its domain stay
`pdf-presenter-lite`, as does the `companion-module-pdf-presenter-lite` repo — renaming
either would break a live URL or an installed Companion config.

The name is served from the backend as `PresenterApi.productName`, alongside
`capabilities`, for the same reason everything else is: **a component must never sniff
for Electron**. Never hardcode either name in `src/renderer/src/`.

## 2. The architectural rule

Two renderer views load from the same bundle, selected by a `mode` query param:

- `App.tsx` — the presenter view. Loads the PDF, owns `currentPage`/`totalPages`, renders
  Now/Next plus thumbnails, and pushes `{ data, currentPage }` to the Output window.
- `Output.tsx` — the fullscreen window.

Both talk to **one interface, `PresenterApi`** in [`src/shared/api.ts`](src/shared/api.ts),
and two backends implement it:

| Backend | File | How the two windows talk |
|---|---|---|
| Electron | `src/preload/index.ts` | IPC through the main process |
| Browser | `src/web/browserApi.ts` | `window.open` pop-up + `BroadcastChannel` |

**Each backend declares what it can do through `capabilities`, and components branch on
that — never on "is this Electron".** This is the rule that keeps the two builds from
drifting into two codebases. If you find yourself testing for Electron in a component, add
a capability instead.

## 3. Two races that are already fixed — don't reintroduce them

- **Output pulls state on mount.** `Output.tsx` calls `output:get-state` once its own
  listener is mounted rather than relying only on a live push. A push sent while the window
  is still loading is silently dropped, which showed up as an Output window stuck on page 1.
  The browser backend reproduces this by holding the last state for a late-joining Output.
- **The render queue in `pdf.ts` is per-canvas and serialized.** Concurrent renders onto one
  canvas corrupt the transform. `pdf.ts` is **copied verbatim from
  `presentation-commander-client`** — that is a debt marker, not a coincidence. Fix a
  rendering bug here and check whether the other repo needs the same fix.

  The same now goes for the transition code: `shared/transitions.ts`,
  `renderer/src/transitions.ts`, `renderer/src/transitionStorage.ts` and
  `components/TransitionControl.tsx` are shared with that repo by copy, differing only in a
  doc comment, the localStorage key, and the fact that Commander gates transitions to PDF
  sources. Change one, change both.

  `transitions.ts` depends on `pdf.ts`'s double-buffering: the incoming layer is put into
  its start state *before* the render is awaited, which is only safe because the visible
  canvas keeps showing the old page until the render finishes.

## 4. The fullscreen click cannot be removed

In the browser build the Output window opens as a normal pop-up, not fullscreen, and shows a
"Click for fullscreen" prompt. **Fullscreen can only be entered by a gesture inside the
window that is going fullscreen**, so nothing the opener does can stand in for it. This is a
platform rule, not a missing feature — people will keep filing it as a bug.

On Chromium the window puts itself on the second display via the Window Management
permission; refuse the permission and it opens wherever the browser likes and the user moves
it. Either way the click is the same.

## 5. Layout

```
src/main/          Electron main: services/ (OSC control server, watched folder,
                   default-PDF-app registration, wallpaper export) and diag/
src/preload/       The Electron PresenterApi backend
src/renderer/src/  App.tsx, Output.tsx, components/, pdf.ts
src/web/           The browser PresenterApi backend (BroadcastChannel)
src/shared/api.ts  The interface both backends implement
scripts/           release-local.sh, release-electron.sh, release-lib.sh
```

## 6. Commands

```bash
npm run dev              # Electron, with HMR
npm run build            # typecheck + electron-vite build
npm run typecheck        # node + web projects, both
npm run lint
npm run preview:static   # the browser build, port 5185
npm run static:build     # the browser build, as static assets
```

## 7. Status — state it precisely

**The desktop app is field proven** — run on real events. **The browser build is newer and
has never been run on an event**, though it is verified on a real dual-display setup: deck
loads and renders, state and laser position reach a separate Output window, transport keys
pressed in the Output drive the control window, a late-loading Output pulls current state,
and the Output opens on the second display by itself.

Keep that distinction in the README. "Verified on a dual-display setup" is not "proven on a
show", and the two builds are not equally proven.

Browser build exclusions are all one limitation — a web page has no UDP socket, no
path-addressable filesystem and no authority over the desktop: **no OSC, no watched folder,
no default-app registration, no diagnostics bundle.** The UI hides those controls rather
than showing buttons that cannot work. If the show is driven from a Stream Deck, that is the
desktop app.

## 8. Conventions

- Public repo. "Commit" means commit **and** push.
- Releases are cut locally with `scripts/release-local.sh` — not CI. The README's
  `## Download` block is generated; don't hand-edit it.
- Builds are unsigned; [docs/UNSIGNED.md](docs/UNSIGNED.md) is the user-facing explanation
  and is linked from the README.
- `app*.log` in the repo root is local debris and is gitignored.

## 9. Related

- **`companion-module-pdf-presenter-lite`** — the Bitfocus Companion module driving the OSC
  control server in `src/main/services/oscControlServer.ts`. Change the OSC surface and that
  module needs the same change.
- **`presentation-commander-client`** — origin of `pdf.ts`; see §3.

## Diagnostics

Log through the vendored `diag` module in `src/main/diag/`, never `console`. Anything written
to stdout corrupts the diagnostics bundle, whose stdout is a path.
See [docs/diagnostics.md](docs/diagnostics.md).

## Notes

`docs/NOTES.md` carries this repo's working notes — current status, decisions
already made, and the traps that have actually bitten. Read it before changing
anything non-obvious. Cross-cutting fleet knowledge lives in
[fleet-notes](https://github.com/stoatworks-labs/fleet-notes).
