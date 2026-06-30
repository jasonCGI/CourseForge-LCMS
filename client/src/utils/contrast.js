// ─────────────────────────────────────────────────────────────────────────────
// Shared WCAG contrast math + a frame-audit DOM walk.
//
// The color math is the proven implementation from the standalone 508 Contrast
// Checker (cardona-ct-lab/static/contrast-audit) — sRGB relative luminance, ratio
// (L1+0.05)/(L2+0.05), floored to 2 decimals so a borderline value never reads as
// a false pass. ContrastChecker.jsx and the in-preview audit badge both import
// from here so their results can never drift.
// ─────────────────────────────────────────────────────────────────────────────

// ---------- color math ----------
export function normHex(s) {
  if (typeof s !== 'string') return null
  s = s.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map(c => c + c).join('')
  if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s.toUpperCase()
  return null
}
export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
export function rgbToHex(r, g, b) {
  const p = n => ('0' + Math.round(n).toString(16)).slice(-2)
  return '#' + (p(r) + p(g) + p(b)).toUpperCase()
}
export function relLum(rgb) {
  const c = rgb.map(v => {
    v = v / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
export function contrast(hexA, hexB) {
  const l1 = relLum(hexToRgb(hexA)), l2 = relLum(hexToRgb(hexB))
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}
// round DOWN to 2 decimals so a borderline value never reads as a false pass
export function floor2(n) { return Math.floor(n * 100) / 100 }

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h, s, l = (max + min) / 2
  if (max === min) { h = s = 0 }
  else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h /= 6
  }
  return [h, s, l]
}
export function hslToRgb(h, s, l) {
  let r, g, b
  if (s === 0) { r = g = b = l }
  else {
    const hue = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
    r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3)
  }
  return [r * 255, g * 255, b * 255]
}

export const TESTS = [
  { key: 'aa-normal',  label: 'AA normal text',         min: 4.5, req: 'needs 4.5 : 1' },
  { key: 'aa-large',   label: 'AA large text',          min: 3,   req: 'needs 3 : 1' },
  { key: 'aaa-normal', label: 'AAA normal text',        min: 7,   req: 'needs 7 : 1' },
  { key: 'aaa-large',  label: 'AAA large text',         min: 4.5, req: 'needs 4.5 : 1' },
  { key: 'nontext',    label: 'Non-text / UI (1.4.11)', min: 3,   req: 'needs 3 : 1' },
]

// nudge: darken (light bg) or lighten (dark bg) the fg lightness until AA clears
export function nudgeToPass(fg, bg, TARGET = 4.5) {
  if (floor2(contrast(fg, bg)) >= TARGET) return { already: true }
  const hsl = rgbToHsl(...hexToRgb(fg))
  const h = hsl[0], s = hsl[1]
  const bgLum = relLum(hexToRgb(bg))
  const goDark = bgLum > 0.5
  let best = null, bestRatio = 0
  for (let i = 0; i <= 100; i++) {
    const l = goDark ? Math.max(0, hsl[2] - i / 100) : Math.min(1, hsl[2] + i / 100)
    const rgb = hslToRgb(h, s, l)
    const hex = rgbToHex(rgb[0], rgb[1], rgb[2])
    const c = floor2(contrast(hex, bg))
    if (c > bestRatio) bestRatio = c
    if (c >= TARGET) { best = { hex, ratio: c }; break }
    if ((goDark && l <= 0) || (!goDark && l >= 1)) break
  }
  return best ? { best } : { failed: true, bestRatio }
}

// ---------- DOM color parsing + frame audit ----------

// Parse a CSS color string (computed `rgb()`/`rgba()`, a hex, or 'transparent')
// into { hex, a }. Returns null for unparseable / keyword colors we can't resolve.
export function parseCssColor(str) {
  if (!str) return null
  str = String(str).trim()
  if (str === 'transparent') return { hex: null, a: 0 }
  const m = str.match(/^rgba?\(([^)]+)\)/i)
  if (m) {
    const p = m[1].split(/[,/]/).map(x => parseFloat(x.trim()))
    if (p.length < 3 || p.some((v, i) => i < 3 && Number.isNaN(v))) return null
    const a = p.length >= 4 && !Number.isNaN(p[3]) ? p[3] : 1
    return { hex: rgbToHex(p[0], p[1], p[2]), a }
  }
  const nh = normHex(str)
  return nh ? { hex: nh, a: 1 } : null
}

// Walk ancestors for the first FULLY-OPAQUE background color, STOPPING at the
// audited content root (`boundary`). Returns { hex } if found, or null when the
// text sits over an image/gradient/transparent stack within the content (→ the
// caller's fallback bg, else "manual"). Bounding at the root matters in the GUI
// shell: #fgui-content is transparent over the shell's art layer, and without the
// bound the walk would climb into the black letterbox stage and false-fail every
// line as "text on black".
function effectiveBg(el, win, boundary) {
  let node = el
  while (node && node.nodeType === 1) {
    const cs = win.getComputedStyle(node)
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
    const c = parseCssColor(cs.backgroundColor)
    if (c && c.hex && c.a >= 0.999) return { hex: c.hex }
    if (node === boundary) break
    node = node.parentElement
  }
  return null
}

function roleLabel(el) {
  const tag = el.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) return 'Heading'
  if (tag === 'button' || el.getAttribute('role') === 'button') return 'Button'
  if (tag === 'a') return 'Link'
  if (tag === 'li') return 'List item'
  if (el.closest('figcaption')) return 'Caption'
  return 'Text'
}

// Audit every text-bearing element under `root` for WCAG contrast. Returns
// { fails, manual, passCount }. Each finding carries the live element (for Locate),
// a text snippet, a role label, fg/bg hexes, the computed ratio + the threshold it
// missed. `aaa` raises the bar to AAA (7 normal / 4.5 large). `fallbackBg` (a hex)
// is the known visual backdrop for text whose own DOM bg is unresolvable within
// `root` — e.g. the GUI shell's content-area color, since the shell paints its
// backdrop as a layer behind #fgui-content rather than a CSS bg on the text's
// ancestors. With no fallback, an unresolved bg is reported as "manual".
export function auditRoot(root, { aaa = false, fallbackBg = null } = {}) {
  const fb = fallbackBg ? normHex(fallbackBg) : null
  const out = { fails: [], manual: [], passCount: 0 }
  if (!root) return out
  const doc = root.ownerDocument || (root.nodeType === 9 ? root : document)
  const win = doc.defaultView || window
  const scope = root.nodeType === 9 ? doc.body : root
  if (!scope || typeof doc.createTreeWalker !== 'function') return out

  const walker = doc.createTreeWalker(scope, win.NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.nodeValue && node.nodeValue.trim()
      if (!text) return win.NodeFilter.FILTER_REJECT
      const el = node.parentElement
      if (!el) return win.NodeFilter.FILTER_REJECT
      const tag = el.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return win.NodeFilter.FILTER_REJECT
      if (el.closest('[aria-hidden="true"]')) return win.NodeFilter.FILTER_REJECT
      return win.NodeFilter.FILTER_ACCEPT
    },
  })

  const seen = new Set()
  let n
  while ((n = walker.nextNode())) {
    const el = n.parentElement
    if (!el || seen.has(el)) continue
    seen.add(el)
    const cs = win.getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue
    const fg = parseCssColor(cs.color)
    if (!fg || !fg.hex) continue

    const snippet = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    const fontSize = parseFloat(cs.fontSize) || 16
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700
    const isLarge = fontSize >= 24 || (bold && fontSize >= 18.66)
    const threshold = aaa ? (isLarge ? 4.5 : 7) : (isLarge ? 3 : 4.5)
    const label = roleLabel(el)

    const bg = effectiveBg(el, win, scope)
    const bgHex = bg ? bg.hex : fb
    if (!bgHex) {
      out.manual.push({ el, snippet, label, fg: fg.hex, reason: 'text over image / gradient / transparent' })
      continue
    }
    const ratio = floor2(contrast(fg.hex, bgHex))
    if (ratio >= threshold) out.passCount++
    else out.fails.push({ el, snippet, label, fg: fg.hex, bg: bgHex, ratio, threshold, isLarge })
  }
  return out
}
