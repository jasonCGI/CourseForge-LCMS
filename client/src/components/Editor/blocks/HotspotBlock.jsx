import React, { useRef, useState, useCallback } from 'react'
import useEditorStore from '../../../store/editorStore'
import { BlockHeader } from './TextBlock'
import { blockWrap, fieldLabel, inputStyle, helpText, btnDanger } from './blockStyles'

export default function HotspotBlock({ block }) {
  const updateBlock = useEditorStore(s => s.updateBlock)
  const removeBlock = useEditorStore(s => s.removeBlock)
  const moveBlock   = useEditorStore(s => s.moveBlock)

  const canvasRef  = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [startPt, setStartPt] = useState(null)
  const [draft, setDraft]     = useState(null)

  const regions = block.data.regions || []

  const getRelPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width)  * 100),
      y: Math.round(((e.clientY - rect.top)  / rect.height) * 100),
    }
  }

  const handleMouseDown = useCallback((e) => {
    if (!block.data.image_id) return
    const pos = getRelPos(e)
    setDrawing(true)
    setStartPt(pos)
    setDraft(null)
  }, [block.data.image_id])

  const handleMouseMove = useCallback((e) => {
    if (!drawing || !startPt) return
    const pos = getRelPos(e)
    setDraft({
      x: Math.min(startPt.x, pos.x),
      y: Math.min(startPt.y, pos.y),
      w: Math.abs(pos.x - startPt.x),
      h: Math.abs(pos.y - startPt.y),
    })
  }, [drawing, startPt])

  const handleMouseUp = useCallback(() => {
    if (!drawing || !draft || draft.w < 2 || draft.h < 2) {
      setDrawing(false)
      setDraft(null)
      return
    }
    const newRegion = { ...draft, label: `Region ${regions.length + 1}`, id: crypto.randomUUID() }
    updateBlock(block.id, { regions: [...regions, newRegion] })
    setDrawing(false)
    setDraft(null)
    setStartPt(null)
  }, [drawing, draft, regions, block.id, updateBlock])

  const updateRegionLabel = (regionId, label) => {
    updateBlock(block.id, {
      regions: regions.map(r => r.id === regionId ? { ...r, label } : r)
    })
  }

  const removeRegion = (regionId) => {
    updateBlock(block.id, { regions: regions.filter(r => r.id !== regionId) })
  }

  return (
    <div style={blockWrap}>
      <BlockHeader
        label="Hotspot"
        color="#533AB7"
        blockId={block.id}
        onRemove={removeBlock}
        onMove={moveBlock}
      />
      <div style={{ padding: 16 }}>

        {/* Image ID field */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabel}>Image asset ID</label>
          <input
            value={block.data.image_id || ''}
            onChange={e => updateBlock(block.id, { image_id: e.target.value })}
            placeholder="Paste media asset ID here"
            style={inputStyle}
          />
          <p style={helpText}>Upload the image via the Media block first, then paste its asset ID here.</p>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{
            position: 'relative',
            width: '100%',
            paddingBottom: '56.25%', // 16:9
            background: block.data.image_id ? '#0a1628' : '#0d1a2e',
            border: `2px dashed ${block.data.image_id ? '#533AB7' : 'var(--color-border-tertiary)'}`,
            borderRadius: 6,
            cursor: block.data.image_id ? 'crosshair' : 'default',
            userSelect: 'none',
            marginBottom: 14,
            overflow: 'hidden',
          }}
        >
          {!block.data.image_id && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8, color: 'var(--color-text-secondary)',
            }}>
              <span style={{ fontSize: 28 }}>⊕</span>
              <span style={{ fontSize: 12 }}>Set an image asset ID above to draw hotspot regions</span>
            </div>
          )}

          {/* Existing regions */}
          {regions.map(r => (
            <div key={r.id} style={{
              position: 'absolute',
              left: `${r.x}%`, top: `${r.y}%`,
              width: `${r.w}%`, height: `${r.h}%`,
              border: '2px solid #EF9F27',
              background: 'rgba(239,159,39,0.15)',
              borderRadius: 2,
              boxSizing: 'border-box',
            }}>
              <span style={{
                position: 'absolute', top: 2, left: 4,
                fontSize: 10, color: '#EF9F27', fontWeight: 600,
                whiteSpace: 'nowrap',
              }}>{r.label}</span>
            </div>
          ))}

          {/* Draft region while drawing */}
          {draft && (
            <div style={{
              position: 'absolute',
              left: `${draft.x}%`, top: `${draft.y}%`,
              width: `${draft.w}%`, height: `${draft.h}%`,
              border: '2px dashed #EF9F27',
              background: 'rgba(239,159,39,0.1)',
              borderRadius: 2,
              pointerEvents: 'none',
            }}/>
          )}
        </div>

        {/* Region list */}
        {regions.length > 0 && (
          <div>
            <label style={fieldLabel}>Regions ({regions.length})</label>
            {regions.map(r => (
              <div key={r.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <div style={{
                  width: 12, height: 12, borderRadius: 2,
                  border: '2px solid #EF9F27', flexShrink: 0,
                }}/>
                <input
                  value={r.label}
                  onChange={e => updateRegionLabel(r.id, e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => removeRegion(r.id)}
                  style={{ ...btnDanger, flexShrink: 0 }}
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
