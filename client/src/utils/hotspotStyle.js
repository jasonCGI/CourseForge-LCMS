// Shared hotspot styling — mirrors the HS model in server/assets/forge-oam.js:
// `strokeColor` is the single source of truth; the border uses it directly and
// the fill is a translucent tint of it. Used by the CourseForge Hotspot block
// and the ForgeClip / iVideo hotspots so authored hotspots match how they
// render in-engine (and so a 508 custom-color override behaves consistently).
//
// In-engine the stroke defaults to the project's GUI hotspot color; in the
// authoring tools we fall back to the forge-oam.js amber when nothing is set.
export const HOTSPOT_AMBER = '#F59E0B'   // forge-oam.js HS default strokeColor

function parseColor(c) {
  if (!c) return null
  c = String(c).trim()
  let m = c.match(/^#([0-9a-f]{3})$/i)
  if (m) { const h = m[1]; return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) } }
  m = c.match(/^#([0-9a-f]{6})$/i)
  if (m) { const h = m[1]; return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) } }
  m = c.match(/^rgba?\(([^)]+)\)$/i)
  if (m) { const p = m[1].split(',').map(s => parseFloat(s)); return { r: p[0], g: p[1], b: p[2] } }
  return null
}

// Translucent tint of a color (falls back to the raw value if unparseable).
export function rgba(c, a) {
  const p = parseColor(c)
  return p ? `rgba(${p.r | 0},${p.g | 0},${p.b | 0},${a})` : c
}

// strokeColor -> { stroke, border, fill } (border = strokeColor, fill = tint).
export function hotspotStyle(stroke) {
  const s = stroke || HOTSPOT_AMBER
  return { stroke: s, border: s, fill: rgba(s, 0.15) }
}

// Unified shape vocabulary: square | rounded | round. Accepts the legacy
// 'rect'/'circle' values too. Returns a CSS border-radius.
export function shapeRadius(shape) {
  if (shape === 'circle' || shape === 'round') return '50%'
  if (shape === 'rounded') return '14%'
  return '2px'   // square / rect
}
