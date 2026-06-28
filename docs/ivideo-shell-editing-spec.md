# Spec: iVideo interaction editing inside a loaded GUI shell

**Status:** proposed (not built). **Date:** 2026-06-28.
**Context:** The live-preview iVideo editor (`IVideoEditor.jsx`, shipped 6e6a7d7) lets
you drag/resize hotspots + annotations directly on the player and commits native-px
coords to `block.data.clip`. It renders in the **React** preview layer.

## The problem

When a **GUI shell is loaded** (the "GUI ON" toggle), the frame content — including
the iVideo block — is injected into a **sandboxed `<iframe>`** by
`GUIShellRenderer.jsx` (`win.fgui.injectContent(frameHtml)`). The React app can't
draw overlay handles *inside* that iframe, and the iframe's DOM is a different
document/coordinate space. So today's editor only works with **GUI OFF** (the React
preview). The interim UX: toggle GUI off to edit, back on to verify — zero plumbing,
already works.

This spec covers making editing work **with the shell on**, seamlessly.

## Recommended approach: postMessage bridge (mirror the existing fgui_* pattern)

`GUIShellRenderer` already injects runtime JS into the iframe (`wireMenuNav`,
`wireAudioBars`) and bridges shell button clicks to the host via `postMessage`
(`fgui_action`, `fgui_nav`). Reuse that pattern for an **editing channel**.

### Iframe side — an injected editor runtime (`wireIVideoEdit(win, opts)`)
Injected by `GUIShellRenderer` after `injectContent`, only when `opts.editable`:
1. Find the iVideo container in the iframe (`#ivideo-<blockId>` → its `<video>` +
   `.ivideo-overlay`).
2. Compute the **rendered video rect** inside the iframe (letterbox-aware — same math
   as `IVideoEditor.measure()`): `ar = nW/nH`; contain-fit into the container; center.
   Keep it fresh with a `ResizeObserver` on the container (inside the iframe).
3. Draw drag-to-move / corner-resize handles for hotspots and drag for annotations,
   absolutely positioned over that rect (px → % of the rect). **Identical coordinate
   math** to `clipCoords` / `IVideoEditor` (center anchor, native px, MIN=16,
   clamp to [0,nW]×[0,nH]).
4. Suppress the iframe runtime's pause-gating while editing (don't let `iVideoInit`'s
   blocker fire — pass an `edit` flag into `iVideoInit`, or skip wiring it in edit mode).
5. On pointer-up (commit) → `win.parent.postMessage({ type: 'fgui_ivideo_edit',
   blockId, interactions }, '*')`.
6. Listen for host messages:
   - `{ type: 'fgui_ivideo_select', id }` → highlight + `video.currentTime = timecode`.
   - `{ type: 'fgui_ivideo_clip', clip }` → re-render handles from the new clip
     (after an external edit, e.g. the sidebar numeric fields).

### Host side — `GUIShellRenderer`
1. Accept new props: `editable`, `clip`, `selectedId`, `onClipChange`, `onSelect`
   (forwarded from `PreviewIVideo` exactly like the non-shell `IVideoEditor`).
2. After `injectContent`, when `editable`, call `win.fgui ? inject wireIVideoEdit` with
   `{ editable:true, clip, selectedId, blockId }` (pass `clip`+`nW/nH` so the iframe
   runtime has coords without a fetch).
3. `window.addEventListener('message')` handler (extend the existing one):
   - `fgui_ivideo_edit` → `onClipChange({ ...clip, interactions: e.data.interactions })`.
   - `fgui_ivideo_select` → `onSelect(e.data.id)`.
4. On `selectedId` / `clip` prop change → `postMessage` `fgui_ivideo_select` /
   `fgui_ivideo_clip` into the iframe so host↔iframe stay in sync (the sidebar numeric
   list still edits via the store; push those through).
5. Re-inject/re-wire on frame change (the inject effect already re-runs on
   `frameHtml`/`frameData`); tear down the iframe-side ResizeObserver on cleanup
   (mirror the counter-observer teardown already there).

### PreviewIVideo wiring
`PreviewIVideo` currently chooses `IVideoEditor` (React) vs `IVideoRuntime`. Add a
third arm: when **editable AND a shell is active**, render `GUIShellRenderer` with the
edit props instead of `IVideoEditor`. (Whether a shell is active is already known to
the preview pane / PersistentPreviewPane — thread that flag down, or detect via the
same path that decides shell vs non-shell rendering today.)

## Shared coordinate contract (must stay identical everywhere)
Reuse `client/src/utils/clipCoords.js` math verbatim. The iframe runtime can't import
ES modules easily, so **inline the same helpers** in the injected script (as the
published `sco_shell` already does with `ivPctX/ivPctY/ivPctW/ivPctH`) — OR pass a
pre-serialized helper string. Keep one source of truth; any change to px↔% or the
rendered-rect math must update: `clipCoords.js`, `IVideoEditor`, `sco_shell*.html`,
and this injected runtime.

## Security
- The iframe is `sandbox="allow-scripts allow-same-origin"` (already set) — injected
  scripts run; `postMessage` works. Validate `e.data.type` and shape on the host;
  the existing handler already filters by `type`.
- `blockId` in messages must be matched against the active block before applying
  `onClipChange` (don't trust a stale/foreign id).
- No new network surface; coords are plain numbers.

## Effort / sequencing
- **S–M:** `wireIVideoEdit` iframe runtime (the bulk; port `IVideoEditor`'s pointer
  logic to vanilla, reading the iframe DOM).
- **S:** `GUIShellRenderer` props + message handlers + inject call.
- **S:** `PreviewIVideo` third arm + a "shell active" flag.
- **XS:** edit-mode flag through `iVideoInit` to suppress pause-gating.

## Decision
Until this lands, the **GUI-OFF-to-edit** flow (current) is the supported path and is
called out in the editor UX. Build the bridge when in-shell editing becomes a real
friction (e.g. shell-specific layouts that change where the video sits).
