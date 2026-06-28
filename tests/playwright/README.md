# Shell render-parity test

`shell-parity.mjs` guards the Edit-vs-Published render-drift bug class (media
overflow, heading color/font shift) that came from the shelled CSS being
duplicated across two renderers. It is the safety net for the single-source-of-truth
CSS (`server/services/shell_css.py` + `GET /api/shell-content.css`).

It does **not** pixel-diff (the Edit pane and the Published iframe render at
different scales). Instead it asserts **computed-style + geometry invariants** on
the server-rendered Published view — the source of truth the client now fetches:

- `/api/shell-content.css` reachable and carries the key rules.
- Per media frame (`preview-html?embed=1`): `#fgui-content` uses IBM Plex Mono and
  clips; headings are amber (`rgb(245,158,11)`); **no media element overflows
  `#fgui-content`** (the containment invariant today's bugs violated).

## Run

```bash
# one-time
npm i -D playwright && npx playwright install chromium

# against prod (default) or any deploy / local server
node tests/playwright/shell-parity.mjs
node tests/playwright/shell-parity.mjs http://localhost:5000
```

Exit code 0 = all pass, 1 = any failure (CI-friendly). The demo project resets
change frame ids, so the script discovers frames live via `/api/projects`.

## Follow-ups

- Drive the GUI-ON **edit** preview too (currently relies on it fetching the same
  `/api/shell-content.css`, so parity is structural). Needs SPA test hooks.
- Wire into CI once the app has a Node test runner (none today; the Python suite
  is pytest under `tests/`).
