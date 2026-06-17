# Forge3D — Master Bootstrap (condensed)

**Version:** 2.0.0 · **Repo:** `courseforge` monorepo → `/forge-3d/`
**Identity:** CourseForge ecosystem · ForgeBlueprint · ForgePack · ForgeClip · **Forge3D**

Standalone Electron desktop app: FBX → GLB via a Blender headless pipeline,
with a pre-conversion compatibility scan and an in-app Three.js GLB preview.
Future path: a Flask web front-end (`/forge-3d/web/`) wrapping the same
`convert.py`, integrated into the CourseForge LCMS.

## Structure
```
forge-3d/
├── electron/                ← desktop app (Sprint 1, this scaffold)
│   ├── main.js preload.js package.json .gitignore
│   ├── src/  (index.html renderer.js forge-tokens.css forge3d.css three-preview.js)
│   ├── scripts/ (preflight.js convert.py)
│   └── assets/icons/ (forge3d-icon.png/.ico)
└── web/                     ← Flask front-end (future Sprint 10)
```

## Tech stack
Electron 30+ · vanilla HTML/CSS/JS · contextBridge IPC · Node fs/child_process ·
Three.js r165 (GLTFLoader + OrbitControls) · `blender --background --python convert.py` ·
electron-builder (NSIS/DMG) · Forge design tokens (amber, IBM Plex Mono) ·
WCAG 2.1 AA (night/day) / AAA (HC) / Section 508.

## Sprint roadmap
| Sprint | Scope |
|---|---|
| **1** | ✅ Scaffold, core pipeline, 508, themes |
| 2 | Deep preflight (Blender-side mesh/material analysis) |
| 3 | Batch conversion queue |
| 4 | Preview polish (wireframe, material inspector, poly HUD) |
| 5 | Draco compression level slider |
| 6 | Texture path remapping |
| 7 | FBX → glTF separate-output option |
| 8 | Auto-updater (electron-updater) |
| 9 | Portfolio installer host + cardonalab.dev landing |
| 10 | Flask web front-end (`/forge-3d/web/`) |
| 11 | CourseForge LCMS integration |

## Sprint 1 — Done When (scaffold)
Core: launch window · drag/browse FBX · preflight pass/warn/fail with icon+color ·
Convert→Blender subprocess · live stdout log · GLB output · Three.js preview ·
user-configurable Blender path (settings modal + first-run prompt) · `build:win` installer.
Theme: `data-theme` pre-paint (no flash) · Night/Day/HC switcher w/ `aria-pressed` ·
`localStorage` `forge3d_theme` · OS `prefers-color-scheme` default · AA/AAA contrast.
508: skip nav · keyboard-operable · drop zone Enter/Space · focus-trapped modal w/ Esc +
focus restore · ARIA tablist · `role=log`/`status` live regions · `aria-busy` on convert ·
`prefers-reduced-motion` · 508 downstream advisory in preflight · no color-only info.

## Notes on this scaffold (deviations from the verbatim bootstrap)
- **CSP fix:** `index.html` `script-src`/`connect-src` now allow `https://cdn.jsdelivr.net`
  (+ `img-src 'self' data: blob:`) so `three-preview.js`'s dynamic Three.js import loads.
  The original `script-src 'self'` would have blocked the GLB preview.
- **Icon:** generated `forge3d-icon.png` + `.ico` (Windows). A macOS `.icns` is still
  needed for `build:mac` (referenced in package.json but not generated here).
- Runtime (Electron window + an actual FBX→GLB) requires a desktop with Blender
  installed — not verifiable in the headless CI/sandbox where this was scaffolded.
