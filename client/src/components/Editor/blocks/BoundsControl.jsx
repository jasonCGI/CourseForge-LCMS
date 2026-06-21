import React from 'react'

// Per-block bounds: position + size a size-agnostic media block inside the GUI
// shell's content area, in content-area pixels (origin = content-area top-left).
// null = inherit (fill width / stacked, the default). Always clamped so the box
// stays fully inside the content area.

const MIN = 40   // px floor so a box can't collapse

export function clampBounds(b, ca) {
  if (!b || !ca) return b || null
  const W = Math.max(MIN, ca.width || 0), H = Math.max(MIN, ca.height || 0)
  const w = Math.max(MIN, Math.min(Math.round(b.width ?? W), W))
  const h = Math.max(MIN, Math.min(Math.round(b.height ?? H), H))
  const x = Math.max(0, Math.min(Math.round(b.x ?? 0), W - w))
  const y = Math.max(0, Math.min(Math.round(b.y ?? 0), H - h))
  return { x, y, width: w, height: h }
}

// The box "Custom bounds" seeds to when first enabled: ~2/3 of the content area,
// centered, so there's immediately room to drag/position it. (A full-size box
// would clamp x/y to 0, making them look stuck.)
export function defaultBounds(ca) {
  const W = Math.round(ca?.width || 600), H = Math.round(ca?.height || 500)
  const w = Math.round(W * 0.66), h = Math.round(H * 0.66)
  return clampBounds({ x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), width: w, height: h }, ca)
}

export default function BoundsControl({ bounds, contentArea, onChange, fit, onFitChange, labelStyle, inputStyle }) {
  const ca = contentArea || { width: 600, height: 500 }
  const on = !!bounds
  const b = bounds || defaultBounds(ca)
  const lbl = labelStyle || { display: 'block', fontSize: 11, color: 'var(--cf-text-secondary)', marginBottom: 4 }
  const inp = inputStyle || { width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 4, border: '1px solid var(--cf-border-tertiary)', background: 'var(--cf-bg)', color: 'var(--cf-text)' }

  const set = (field, raw) => {
    const val = parseInt(raw, 10)
    onChange(clampBounds({ ...b, [field]: Number.isFinite(val) ? val : (b[field] || 0) }, ca))
  }
  const field = (key, label, max) => (
    <div>
      <label style={lbl}>{label}</label>
      <input type="number" min="0" max={max} value={b[key]} aria-label={`Bounds ${label}`}
        onChange={e => set(key, e.target.value)} style={inp} />
    </div>
  )

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: on ? 10 : 0 }}>
        <input type="checkbox" checked={on} style={{ marginTop: 2 }}
          onChange={e => onChange(e.target.checked ? defaultBounds(ca) : null)} aria-label="Custom bounds" />
        <span style={{ fontSize: 12, color: 'var(--cf-text-secondary)', lineHeight: 1.4 }}>
          Custom bounds — position &amp; size this block inside the content area (otherwise it fills the width)
        </span>
      </label>
      {on && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {field('x', 'X (px)', ca.width)}
          {field('y', 'Y (px)', ca.height)}
          {field('width', 'Width (px)', ca.width)}
          {field('height', 'Height (px)', ca.height)}
          {onFitChange && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Fit</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['contain', 'Contain (fit, no crop)'], ['cover', 'Cover (fill, crops)']].map(([f, label]) => (
                  <button key={f} type="button" onClick={() => onFitChange(f)} aria-pressed={(fit || 'contain') === f}
                    style={{ flex: 1, padding: '6px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                      border: '1px solid var(--cf-border-tertiary)',
                      background: (fit || 'contain') === f ? 'var(--forge-amber, #D4820A)' : 'transparent',
                      color: (fit || 'contain') === f ? '#042C53' : 'var(--cf-text-secondary)' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 11, color: 'var(--cf-text-tertiary)' }}>
            Content area: {ca.width} × {ca.height}px. The box is clamped to stay inside it.
          </p>
        </div>
      )}
    </div>
  )
}
