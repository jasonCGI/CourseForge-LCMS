// Shared Callout overlay styling + HTML builder (JS side).
//
// A callout is a free-floating annotation OVERLAY over the frame's content area:
// a rounded box (center-aligned text, 20px padding, auto-width) plus a connector
// LINE from the box to a target point. box/target are normalized 0-100 (% of the
// content area). box.{x,y} is the CONNECTION POINT — the center of the box edge
// that faces the target — NOT the box center. The box is positioned so its chosen
// edge-center lands exactly on (box.x, box.y) and extends AWAY from the target; the
// `anchor` field ('auto'|'top'|'bottom'|'left'|'right') picks which edge connects.
//
// This builder is the SINGLE source of overlay markup on the JS side — called from
// BOTH FramePreview.renderBlockToHTML (string path) AND PreviewCallout (React, via
// dangerouslySetInnerHTML) so the two render IDENTICALLY. It is the JS twin of
// scorm12._callout_overlay_html (server). Keep the markup/CSS in lock-step.
//
// The connector line is drawn from the connection point (box.x, box.y) straight to
// the target inside a 0-100 viewBox SVG (preserveAspectRatio="none") — pure numeric
// coords, no box-size math (so it matches the server byte-for-byte). The OPAQUE box
// is drawn on top so any incidental overlap is covered. The target CIRCLE is an
// editor-only affordance and is NEVER part of this overlay.

export const CALLOUT_STYLE = {
  boxBg:       '#ffffff',
  boxText:     '#1a2a3a',
  boxBorder:   '#A8572B',
  line:        '#A8572B',
  shadow:      '0 0 10px rgba(0,0,0,0.85)',
  radius:      '8px',
  lineWidth:   '4',      // connector stroke px (non-scaling)
  borderWidth: '4px',    // box ("label") border px
}

// Escape text for safe insertion into HTML. Mirrors the server's esc() — which is
// markupsafe.escape — BYTE-FOR-BYTE: " -> &#34; and ' -> &#39; (NOT &quot;/&apos;)
// so the JS overlay equals the Python overlay exactly even when the callout text
// contains quotes.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&#34;').replace(/'/g, '&#39;')
}

// Clamp a coordinate to 0..100 and round to one decimal (parity with the editor's
// stored precision and the server's float formatting).
function pc(n) {
  let v = Number(n)
  if (!isFinite(v)) v = 0
  v = Math.max(0, Math.min(100, v))
  return Math.round(v * 10) / 10
}

// Resolve a callout's connecting edge to one of 'top'|'bottom'|'left'|'right'. An
// explicit anchor passes through; 'auto' (or anything unknown) picks the edge that
// FACES the target given the connection point (bx,by) and target (tx,ty):
//   dx = tx - bx, dy = ty - by
//   abs(dx) >= abs(dy)  -> horizontal: dx >= 0 ? 'right' : 'left'
//   else                -> vertical:   dy >= 0 ? 'bottom' : 'top'
// Python twin: scorm12._resolve_callout_anchor. Keep in lock-step.
export function resolveCalloutAnchor(anchor, bx, by, tx, ty) {
  if (anchor === 'top' || anchor === 'bottom' || anchor === 'left' || anchor === 'right') return anchor
  const dx = tx - bx, dy = ty - by
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

// CSS transform that positions the box so the chosen edge-center lands on the
// connection point and the box extends AWAY from the target. Python twin:
// scorm12._callout_anchor_transform.
//   top    -> translate(-50%, 0%)     (box extends DOWN)
//   bottom -> translate(-50%, -100%)  (box extends UP)
//   left   -> translate(0%, -50%)     (box extends RIGHT)
//   right  -> translate(-100%, -50%)  (box extends LEFT)
export function calloutAnchorTransform(side) {
  switch (side) {
    case 'top':    return 'translate(-50%, 0%)'
    case 'bottom': return 'translate(-50%, -100%)'
    case 'left':   return 'translate(0%, -50%)'
    case 'right':  return 'translate(-100%, -50%)'
    default:       return 'translate(-50%, -50%)'
  }
}

// The box-side endpoint of the connector, nudged INSET viewBox units PAST the
// connection point INTO the box (along the line, away from the target) so the
// OPAQUE box covers the stroke cap and the line reads flush with the box edge —
// no sliver/gap from the angled 4px cap. Measurement-free. Python twin:
// scorm12._callout_line_box_end (keep the formula identical for byte parity).
export function calloutLineBoxEnd(bx, by, tx, ty) {
  const dx = bx - tx, dy = by - ty
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const INSET = 2.5
  return [pc(bx + (dx / len) * INSET), pc(by + (dy / len) * INSET)]
}

// Build the callout overlay HTML (box + connector line, NO target circle). Returns
// an absolutely-positioned layer (inset:0; pointer-events:none) intended to sit
// OVER a position:relative content container. JS twin of the server builder.
export function buildCalloutOverlayHTML(data) {
  const d = data || {}
  const box = d.box || { x: 55, y: 60 }
  const target = d.target || { x: 32, y: 32 }
  const padding = (d.padding == null ? 10 : Number(d.padding)) || 0
  const text = d.text == null ? 'Callout' : d.text
  const anchor = d.anchor == null ? 'auto' : d.anchor
  const S = CALLOUT_STYLE

  const bx = pc(box.x), by = pc(box.y)
  const tx = pc(target.x), ty = pc(target.y)
  const side = resolveCalloutAnchor(anchor, bx, by, tx, ty)
  const tf = calloutAnchorTransform(side)
  const [ex, ey] = calloutLineBoxEnd(bx, by, tx, ty)

  const svg =
    `<svg viewBox="0 0 100 100" preserveAspectRatio="none" `
    + `style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;filter:drop-shadow(0 0 10px rgba(0,0,0,0.85))">`
    + `<line x1="${ex}" y1="${ey}" x2="${tx}" y2="${ty}" `
    + `stroke="${S.line}" stroke-width="${S.lineWidth}" vector-effect="non-scaling-stroke" stroke-linecap="round" /></svg>`

  const boxHTML =
    `<div style="position:absolute;left:${bx}%;top:${by}%;`
    + `transform:${tf};max-width:46%;box-sizing:border-box;`
    + `padding:${padding}px;border-radius:${S.radius};background:${S.boxBg};`
    + `color:${S.boxText};border:${S.borderWidth} solid ${S.boxBorder};box-shadow:${S.shadow};`
    + `font:700 18px/1.35 'Inter',system-ui,sans-serif;text-align:center">`
    + `${esc(text)}</div>`

  return `<div class="cf-callout-overlay" style="position:absolute;inset:0;`
    + `pointer-events:none;z-index:5">${svg}${boxHTML}</div>`
}
