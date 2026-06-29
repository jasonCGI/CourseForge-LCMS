# In-preview Contrast / 508 audit — spec

Status: proposed. A live WCAG/508 contrast audit of the **current frame** in the
CourseForge preview, surfaced as a glanceable traffic-light badge by the zoom
controls. Reuses the standalone [508 Contrast Checker] (cardonalab) math + UX.

## Why
CourseForge's pitch is 508/WCAG-compliant courseware, but contrast failures
(e.g. the amber heading on the light content area, 1.69:1) only surfaced by hand
with an eyedropper. Auditing the rendered frame *in the authoring flow* catches
them before publish — and demonstrates the compliance story live.

## Placement + glanceable status (the key ask)
A small pill **top-right of the preview, adjacent to the Fit/25/50/75/100 zoom
controls**. It shows pass/fail **before you expand it** — green light / red light,
like the portfolio audit:

- 🟢 **508 ✓** — every text/UI pair on the frame passes its threshold.
- 🔴 **508 ✕ N** — N failing elements (the count is the at-a-glance signal).
- 🟡 **508 ? N** — N pairs couldn't be auto-judged (text over an image/gradient/
  transparent bg) → "manual check," mirroring the portfolio tool's halo fallback.

Auto-runs on frame render + content edits (debounced ~300ms) so the light tracks
the live frame as you author. Respects the current Day/Night/HC theme if relevant.

## Expanded panel
Click the pill → a panel (same corner, like the existing zoom/scale readout’s
neighbor) listing each finding:
- the element (text snippet or a "Heading"/"Button"/"Caption" label) + a **Locate**
  control that scrolls-to + outlines it in the preview,
- foreground + background **swatches + hex**, the computed **ratio**, and which
  check it fails (AA 4.5 / AA large 3.0 / AAA 7.0 / non-text 1.4.11 = 3.0),
- a **"nudge to pass"** suggestion (darken/lighten the fg to the nearest passing
  value) — port from the portfolio tool — shown read-only here (authors fix the
  source color in the block/theme).
- Copy report / Print (optional, parity with the portfolio tool).

## Mechanism
Runs against the rendered preview (the GUI-on shell iframe — same-origin, walkable
— and the GUI-off React preview). For each text-bearing element under the content
area:
1. **fg** = computed `color`.
2. **bg** = effective background: walk ancestors for the first opaque
   `background-color`; if none (transparent over an image/gradient) → 🟡 manual.
3. **threshold** = AA 4.5 normal, or AA-large 3.0 when font ≥ 24px (or ≥ 18.66px
   bold) — read computed `font-size`/`font-weight`. AAA optional toggle.
4. **ratio** = WCAG relative-luminance contrast (reuse the 508 tool's exact
   function). Classify pass/fail; collect fails + manual-checks.
5. Non-text (1.4.11 — icon/control/focus boundaries) → v2 (harder to enumerate).

Shared core: extract the luminance/ratio/threshold logic into
`client/src/utils/contrast.js` (one source for the badge + any future tooling),
matching the portfolio implementation so results agree.

## Scope / edge cases
- Text over images/gradients/transparent → 🟡 manual (don't false-fail).
- Decorative/aria-hidden text → skip.
- The audit reads the rendered DOM, so it reflects exactly what learners get
  (including the luminance-aware heading colors we just shipped).

## LOE
~1–1.5 days: the ratio math + thresholds are done (port from the portfolio tool);
the work is the DOM walk + effective-bg resolution, the traffic-light pill by the
zoom controls, the expandable findings panel, and the Locate/highlight. Pairs with
`tests/playwright/shell-parity.mjs` (same "inspect the rendered frame" muscle) and
the [508 Contrast Checker] memory.

## Build order
1. `utils/contrast.js` (ported math) + unit cases.
2. Audit pass over the preview frame → {fails, manual, pass} model.
3. Traffic-light pill by the zoom controls (auto-run, debounced).
4. Expandable panel: findings list + Locate + swatches/ratio + nudge suggestion.
5. Wire for both GUI-on (shell iframe) and GUI-off (React preview).
