# Slide-out lesson menu (nav drawer)

Status: in progress. Foundation (icon + CSS) shipped; runtime + per-surface wiring
to follow.

## Locked design (confirmed with author)

- **Trigger:** hamburger (Iconoir `Menu`, our vector set) pinned **top-right** of the
  content area.
- **Motion:** drawer slides in from the **left edge, L→R**, bounded to the **content
  area only** (never overlaps the shell chrome).
- **Scope:** the **current lesson's frames** (flat jump list), not the whole course.
- **Behavior:** **overlay + scrim** (content stays put, scrim dims it, click-scrim or
  Esc closes).
- **Gating:** **respect completion/lock** — frames show, but ungated/locked ones can't
  be jumped to (honors the optional/required + frame-complete model).
- Glossary popout (later) reuses this same primitive.

## Markup contract

A self-contained block injected into the content area:

```html
<div class="cf-lmenu-root">                                  <!-- absolute inset:0 in content area -->
  <button class="cf-lmenu-btn" aria-label="Lesson menu" aria-expanded="false">…hamburger…</button>
  <div class="cf-lmenu-scrim"></div>
  <aside class="cf-lmenu" aria-hidden="true">
    <div class="cf-lmenu-title">{lesson name}</div>
    <nav class="cf-lmenu-list">
      <a class="cf-lmenu-item is-current" href="{frameHref}" aria-current="page">Frame title <span class="cf-lmenu-mark">✓</span></a>
      <button class="cf-lmenu-item is-locked" aria-disabled="true">Locked frame</button>
      <a class="cf-lmenu-item" data-cf-lmenu-target="{frameId}">Frame title</a>
    </nav>
  </aside>
</div>
```

Open state = `.cf-lmenu-root.is-open` (runtime toggles it + `aria-expanded` /
`aria-hidden`). Published items navigate via `href` (frameMap url); the editor
preview intercepts `data-cf-lmenu-target` → `loadFrame(id)`.

## CSS

In **`server/services/shell_css.py:SHELL_CONTENT_CSS`** (the single source) — so all
three shelled surfaces (published SCO, `/preview-html`, GUI-ON edit preview) get it
from one place. `position:absolute;inset:0` binds the drawer to the content area's
nearest positioned ancestor; reduced-motion drops the transition.

## Build checklist (the "quad")

- [x] Icon: `cf_icons.py` `MENU_SVG`/`MENU_SVG_JS` + `icons.jsx` `Menu`.
- [x] CSS: drawer rules in `SHELL_CONTENT_CSS`.
- [ ] **Published runtime** (`sco_shell.html` + `sco_shell_2004.html`): inject the
      drawer markup from the lesson frame list, wire open/close (button, scrim, Esc,
      focus trap), navigate via frameMap, mark current + completed + locked.
- [ ] **Build-time data**: `scorm12.py` must pass each frame's LESSON frame list
      (id, title, href, optional, complete) into the runtime (it currently ships only
      current-frame data) — read/write completion from the existing sessionStorage
      progress store (same one MenuBackPill uses).
- [ ] **GUI-ON edit preview**: drawer markup injected by `GUIShellRenderer`/
      `buildShelledLayoutHTML`; clicking an item → `loadFrame` (postMessage bridge,
      like the menu-frame nav).
- [ ] **React FramePreview** (GUI-off live preview): optional — render the same
      drawer for parity (lower priority; it's the raw-content author view).
- [ ] Parity test: extend `tests/playwright/shell-parity.mjs` to assert the drawer
      opens, lists the lesson's frames, and gates locked items.

## Gating source

Completion in published is tracked in `sessionStorage` (the existing progress store
behind MenuBackPill). The drawer reads it to mark complete (✓) and to decide which
frames are jumpable; optional/required + sequential rules mirror the content tree.
