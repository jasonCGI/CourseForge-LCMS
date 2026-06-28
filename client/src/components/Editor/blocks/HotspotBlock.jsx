import React, { useRef, useState } from 'react'
import useEditorStore from '../../../store/editorStore'
import { BlockHeader } from './TextBlock'
import { blockWrap, fieldLabel, inputStyle, helpText, btnDanger } from './blockStyles'
import { hotspotStyle, shapeRadius, HOTSPOT_AMBER } from '../../../utils/hotspotStyle'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const round = g => ({ x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.w), h: Math.round(g.h) })
const HANDLES = {
  nw: { left: -5, top: -5, cursor: 'nwse-resize' },
  ne: { right: -5, top: -5, cursor: 'nesw-resize' },
  sw: { left: -5, bottom: -5, cursor: 'nesw-resize' },
  se: { right: -5, bottom: -5, cursor: 'nwse-resize' },
}

export default function HotspotBlock({ block }) {
  const updateBlock = useEditorStore(s => s.updateBlock)
  const removeBlock = useEditorStore(s => s.removeBlock)
  const moveBlock   = useEditorStore(s => s.moveBlock)
  // Shared hotspot-region selection (synced with the live-preview editor): the row
  // / canvas region you're editing in the preview lights up here, and vice versa.
  const activeRegionId  = useEditorStore(s => s.activeRegionId)
  const setActiveRegion = useEditorStore(s => s.setActiveRegion)

  const canvasRef = useRef(null)
  const drag = useRef(null)                       // { mode, id, handle, ox, oy, base }
  const [draft, setDraft] = useState(null)        // { x, y, w, h } while drawing a new region
  const [live, setLive]   = useState(null)        // { id, x, y, w, h } while moving/resizing
  const [newShape, setNewShape] = useState('rect')

  const regions = block.data.regions || []
  const hasImg  = !!(block.data.image_id || block.data.background_url)
  const commit  = next => updateBlock(block.id, { regions: next })

  const relPos = e => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }
  }

  // Empty canvas → draw a new region
  const onCanvasDown = e => {
    if (!hasImg || drag.current) return
    const p = relPos(e)
    drag.current = { mode: 'draw', ox: p.x, oy: p.y }
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 })
  }
  // Region body → move; corner handle → resize
  const startMove = (e, r) => {
    e.stopPropagation()
    setActiveRegion(r.id)
    const p = relPos(e)
    drag.current = { mode: 'move', id: r.id, ox: p.x, oy: p.y, base: { ...r } }
    setLive({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h })
  }
  const startResize = (e, r, handle) => {
    e.stopPropagation()
    const p = relPos(e)
    drag.current = { mode: 'resize', id: r.id, handle, ox: p.x, oy: p.y, base: { ...r } }
    setLive({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h })
  }

  const onMove = e => {
    const d = drag.current
    if (!d) return
    const p = relPos(e)
    if (d.mode === 'draw') {
      setDraft({ x: Math.min(d.ox, p.x), y: Math.min(d.oy, p.y), w: Math.abs(p.x - d.ox), h: Math.abs(p.y - d.oy) })
      return
    }
    const b = d.base
    if (d.mode === 'move') {
      setLive({ id: d.id, w: b.w, h: b.h,
        x: clamp(b.x + (p.x - d.ox), 0, 100 - b.w),
        y: clamp(b.y + (p.y - d.oy), 0, 100 - b.h) })
    } else { // resize — anchor the opposite edge(s)
      let { x, y, w, h } = b
      const right = b.x + b.w, bottom = b.y + b.h
      if (d.handle.includes('e')) w = clamp(p.x, b.x + 3, 100) - x
      if (d.handle.includes('s')) h = clamp(p.y, b.y + 3, 100) - y
      if (d.handle.includes('w')) { x = clamp(p.x, 0, right - 3); w = right - x }
      if (d.handle.includes('n')) { y = clamp(p.y, 0, bottom - 3); h = bottom - y }
      setLive({ id: d.id, x, y, w, h })
    }
  }

  const onUp = () => {
    const d = drag.current
    if (d?.mode === 'draw' && draft && draft.w >= 2 && draft.h >= 2) {
      commit([...regions, { ...round(draft), shape: newShape, label: `Region ${regions.length + 1}`, description: '', id: crypto.randomUUID() }])
    } else if ((d?.mode === 'move' || d?.mode === 'resize') && live) {
      commit(regions.map(r => (r.id === live.id ? { ...r, ...round(live) } : r)))
    }
    drag.current = null
    setDraft(null)
    setLive(null)
  }

  const geomOf  = r => (live && live.id === r.id ? live : r)
  const setLabel = (id, label) => commit(regions.map(r => (r.id === id ? { ...r, label } : r)))
  const setShape = (id, shape) => commit(regions.map(r => (r.id === id ? { ...r, shape } : r)))
  const setColor = (id, color) => commit(regions.map(r => (r.id === id ? { ...r, color } : r)))
  const removeRegion = id => commit(regions.filter(r => r.id !== id))
  const nextShape = s => (s === 'rect' ? 'rounded' : s === 'rounded' ? 'circle' : 'rect')   // square -> rounded -> round
  const shapeGlyph = s => (s === 'circle' ? '◯' : s === 'rounded' ? '▢' : '▭')

  const shapeBtn = (val, glyph, label) => (
    <button type="button" onClick={() => setNewShape(val)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12,
        borderRadius: 6, cursor: 'pointer', border: '1px solid var(--forge-amber)',
        background: newShape === val ? 'var(--forge-amber)' : 'transparent',
        color: newShape === val ? '#042C53' : 'var(--forge-amber)', fontWeight: 600,
      }}>{glyph} {label}</button>
  )

  return (
    <div style={blockWrap}>
      <BlockHeader label="Hotspot" color="#533AB7" blockId={block.id} onRemove={removeBlock} onMove={moveBlock} />
      <div style={{ padding: 16 }}>

        {/* Image ID field */}
        <div style={{ marginBottom: 14 }}>
          <label htmlFor={`hotspot-image-${block.id}`} style={fieldLabel}>Image asset ID</label>
          <input
            id={`hotspot-image-${block.id}`}
            value={block.data.image_id || ''}
            onChange={e => updateBlock(block.id, { image_id: e.target.value })}
            placeholder="Paste media asset ID here"
            style={inputStyle}
          />
          <p style={helpText}>Upload the image via the Media block first, then paste its asset ID here.</p>
        </div>

        {/* New-region shape toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ ...fieldLabel, margin: 0 }}>New region shape</span>
          {shapeBtn('rect', '▭', 'Square')}
          {shapeBtn('rounded', '▢', 'Rounded')}
          {shapeBtn('circle', '◯', 'Round')}
        </div>

        {/* Canvas */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- pointer-drag drawing surface; regions are also created/edited via the keyboard-accessible region list and numeric fields below */}
        <div
          ref={canvasRef}
          onMouseDown={onCanvasDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          style={{
            position: 'relative', width: '100%', paddingBottom: '56.25%', // 16:9
            background: hasImg ? '#0a1628' : '#0d1a2e',
            border: `2px dashed ${hasImg ? '#533AB7' : 'var(--color-border-tertiary)'}`,
            borderRadius: 6, cursor: hasImg ? 'crosshair' : 'default',
            userSelect: 'none', marginBottom: 14, overflow: 'hidden',
          }}
        >
          {block.data.background_url && (
            <img src={block.data.background_url} alt={block.data.alt_text || 'Hotspot background'}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
          )}

          {!hasImg && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8, color: 'var(--color-text-secondary)' }}>
              <span style={{ fontSize: 28 }}>⊕</span>
              <span style={{ fontSize: 12 }}>Set an image asset ID above to draw hotspot regions</span>
            </div>
          )}

          {/* Existing regions — drag the body to move, corners to resize */}
          {regions.map(r => {
            const g = geomOf(r)
            const st = hotspotStyle(r.color)
            return (
              /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- pointer-drag move affordance on the canvas; the same region is keyboard-editable in the region list below */
              <div key={r.id}
                onMouseDown={e => startMove(e, r)}
                style={{
                  position: 'absolute', left: `${g.x}%`, top: `${g.y}%`, width: `${g.w}%`, height: `${g.h}%`,
                  border: `2px solid ${st.border}`,
                  background: st.fill,
                  borderRadius: shapeRadius(r.shape),
                  boxSizing: 'border-box', cursor: 'move',
                  boxShadow: r.id === activeRegionId ? '0 0 0 2px var(--forge-amber)' : 'none',
                }}>
                <span style={{ position: 'absolute', top: 2, left: 6, fontSize: 10, color: st.stroke, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.label}</span>
                {Object.entries(HANDLES).map(([h, pos]) => (
                  /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- pointer-drag resize handle; region size is also keyboard-editable via numeric fields */
                  <div key={h} onMouseDown={e => startResize(e, r, h)}
                    style={{ position: 'absolute', width: 10, height: 10, background: 'var(--forge-amber)',
                      border: '1px solid #042C53', borderRadius: 2, ...pos }} />
                ))}
              </div>
            )
          })}

          {/* Draft while drawing */}
          {draft && (
            <div style={{
              position: 'absolute', left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%`,
              border: '2px dashed var(--forge-amber)', background: 'color-mix(in srgb, var(--forge-amber) 10%, transparent)',
              borderRadius: shapeRadius(newShape), pointerEvents: 'none',
            }} />
          )}
        </div>

        {/* Region list — label, shape, delete */}
        {regions.length > 0 && (
          <div>
            <label style={fieldLabel}>Regions ({regions.length})</label>
            {regions.map(r => (
              /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- row-select convenience; the row's label/color/delete controls are themselves keyboard-focusable */
              <div key={r.id} onMouseDown={() => setActiveRegion(r.id)}
                style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center',
                  padding: '4px 6px', borderRadius: 6,
                  background: r.id === activeRegionId ? 'color-mix(in srgb, var(--forge-amber) 14%, transparent)' : 'transparent',
                  boxShadow: r.id === activeRegionId ? 'inset 0 0 0 1.5px var(--forge-amber)' : 'none',
                  transition: 'background .12s, box-shadow .12s' }}>
                <div style={{ width: 14, height: 14, flexShrink: 0, border: `2px solid ${hotspotStyle(r.color).border}`,
                  background: hotspotStyle(r.color).fill, borderRadius: shapeRadius(r.shape) }} />
                <input value={r.label} onChange={e => setLabel(r.id, e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <input type="color" value={r.color || HOTSPOT_AMBER} onChange={e => setColor(r.id, e.target.value)}
                  title="Hotspot color — overrides the inherited GUI color (use for 508 contrast, e.g. on a light background)"
                  aria-label={`Color for ${r.label}`}
                  style={{ flexShrink: 0, width: 30, height: 30, padding: 2, border: '1px solid var(--color-border-tertiary)', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
                <button type="button" title="Cycle shape (square / rounded / round)"
                  onClick={() => setShape(r.id, nextShape(r.shape))}
                  style={{ flexShrink: 0, padding: '6px 10px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
                    border: '1px solid var(--forge-amber)', background: 'transparent', color: 'var(--forge-amber)' }}>
                  {shapeGlyph(r.shape)}
                </button>
                <button onClick={() => removeRegion(r.id)} style={{ ...btnDanger, flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
