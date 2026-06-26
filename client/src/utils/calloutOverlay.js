// Shared Callout overlay styling + HTML builder (JS side).
//
// A callout is a free-floating annotation OVERLAY over the frame's content area:
// a rounded box (center-aligned text, 20px padding, auto-width) plus a connector
// LINE from the box to a target point. box/target are normalized 0-100 (% of the
// content area); box is the box CENTER (transform:translate(-50%,-50%) so width
// changes never shift it).
//
// This builder is the SINGLE source of overlay markup on the JS side — called from
// BOTH FramePreview.renderBlockToHTML (string path) AND PreviewCallout (React, via
// dangerouslySetInnerHTML) so the two render IDENTICALLY. It is the JS twin of
// scorm12._callout_overlay_html (server). Keep the markup/CSS in lock-step.
//
// The connector line is drawn from box CENTER to target inside a 0-100 viewBox SVG
// (preserveAspectRatio="none"). The OPAQUE box is drawn on top and covers the part
// of the line beneath it, so the line visually emerges from the box's nearest edge
// — deterministic geometry that needs no box-size math (and so matches the server
// byte-for-byte). The target CIRCLE is an editor-only affordance and is NEVER part
// of this overlay.

export const CALLOUT_STYLE = {
  boxBg:     '#ffffff',
  boxText:   '#1a2a3a',
  boxBorder: '#A8572B',
  line:      '#A8572B',
  shadow:    '0 2px 10px rgba(0,0,0,0.22)',
  radius:    '8px',
}

// Escape text for safe insertion into HTML (mirrors the server's esc()).
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Clamp a coordinate to 0..100 and round to one decimal (parity with the editor's
// stored precision and the server's float formatting).
function pc(n) {
  let v = Number(n)
  if (!isFinite(v)) v = 0
  v = Math.max(0, Math.min(100, v))
  return Math.round(v * 10) / 10
}

// Build the callout overlay HTML (box + connector line, NO target circle). Returns
// an absolutely-positioned layer (inset:0; pointer-events:none) intended to sit
// OVER a position:relative content container. JS twin of the server builder.
export function buildCalloutOverlayHTML(data) {
  const d = data || {}
  const box = d.box || { x: 55, y: 60 }
  const target = d.target || { x: 32, y: 32 }
  const padding = (d.padding == null ? 20 : Number(d.padding)) || 0
  const text = d.text == null ? 'Callout' : d.text
  const S = CALLOUT_STYLE

  const bx = pc(box.x), by = pc(box.y)
  const tx = pc(target.x), ty = pc(target.y)

  const svg =
    `<svg viewBox="0 0 100 100" preserveAspectRatio="none" `
    + `style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible">`
    + `<line x1="${bx}" y1="${by}" x2="${tx}" y2="${ty}" `
    + `stroke="${S.line}" stroke-width="0.5" vector-effect="non-scaling-stroke" /></svg>`

  const boxHTML =
    `<div style="position:absolute;left:${bx}%;top:${by}%;`
    + `transform:translate(-50%,-50%);max-width:46%;box-sizing:border-box;`
    + `padding:${padding}px;border-radius:${S.radius};background:${S.boxBg};`
    + `color:${S.boxText};border:1px solid ${S.boxBorder};box-shadow:${S.shadow};`
    + `font:600 14px/1.35 'Inter',system-ui,sans-serif;text-align:center">`
    + `${esc(text)}</div>`

  return `<div class="cf-callout-overlay" style="position:absolute;inset:0;`
    + `pointer-events:none;z-index:5">${svg}${boxHTML}</div>`
}
