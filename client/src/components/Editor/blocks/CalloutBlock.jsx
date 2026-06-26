import React, { useRef, useState, useEffect } from 'react'
import useEditorStore from '../../../store/editorStore'
import { BlockHeader } from './TextBlock'
import { blockWrap, fieldLabel, inputStyle, helpText } from './blockStyles'
import { CALLOUT_STYLE } from '../../../utils/calloutOverlay'

// Callout editor — the WYSIWYG canvas for a free-floating annotation overlay.
// Mirrors HotspotBlock's pattern: a 16:9 canvas, normalized 0-100 coords, mouse
// drag handlers (relPos / onMove / onUp), commit via updateBlock.
//
// The author drags TWO things:
//   • the rounded BOX (its CENTER is box.x/y — width changes never shift it), and
//   • a small target CIRCLE (target.x/y) marking where the connector line points.
// A connector LINE runs from the box center to the target; the opaque box covers
// the part of the line beneath it, so the line visually emerges from the box edge
// (the SAME deterministic geometry the published overlay uses — see calloutOverlay).
//
// The target CIRCLE is an EDITING AFFORDANCE ONLY: it is drawn here and NOWHERE in
// any preview / published output (FramePreview + scorm12 render box + line only).

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const r1 = n => Math.round(n * 10) / 10   // one-decimal precision for stored coords

export default function CalloutBlock({ block }) {
  const updateBlock = useEditorStore(s => s.updateBlock)
  const removeBlock = useEditorStore(s => s.removeBlock)
  const moveBlock   = useEditorStore(s => s.moveBlock)

  const canvasRef = useRef(null)
  const boxRef    = useRef(null)
  const drag      = useRef(null)               // { mode: 'box'|'target', dx, dy }
  const [live, setLive] = useState(null)       // { box:{x,y}, target:{x,y} } while dragging

  const data    = block.data || {}
  const box     = (live && live.box)    || data.box    || { x: 55, y: 60 }
  const target  = (live && live.target) || data.target || { x: 32, y: 32 }
  const text    = data.text != null ? data.text : 'Callout'
  const padding = data.padding != null ? data.padding : 20

  // Keep the contentEditable box in sync when the text changes from the panel
  // <input> (not while the user is actively typing in the box itself).
  useEffect(() => {
    if (boxRef.current && document.activeElement !== boxRef.current
        && boxRef.current.textContent !== text) {
      boxRef.current.textContent = text
    }
  }, [text])

  const relPos = e => {
    const r = canvasRef.current.getBoundingClientRect()
    return {
      x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100),
      y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100),
    }
  }

  const startDrag = (mode, anchor) => e => {
    e.stopPropagation()
    e.preventDefault()
    const p = relPos(e)
    drag.current = { mode, dx: p.x - anchor.x, dy: p.y - anchor.y }
    setLive({ box: { ...box }, target: { ...target } })
  }

  const onMove = e => {
    const d = drag.current
    if (!d) return
    const p = relPos(e)
    const nx = r1(clamp(p.x - d.dx, 0, 100))
    const ny = r1(clamp(p.y - d.dy, 0, 100))
    setLive(prev => {
      const base = prev || { box: { ...box }, target: { ...target } }
      return d.mode === 'box'
        ? { ...base, box: { x: nx, y: ny } }
        : { ...base, target: { x: nx, y: ny } }
    })
  }

  const onUp = () => {
    const d = drag.current
    if (d && live) {
      updateBlock(block.id, d.mode === 'box' ? { box: live.box } : { target: live.target })
    }
    drag.current = null
    setLive(null)
  }

  // Inline-edit commit from the contentEditable box.
  const commitBoxText = () => {
    const t = (boxRef.current?.textContent || '').replace(/\s+/g, ' ').trim()
    if (t !== text) updateBlock(block.id, { text: t })
  }

  return (
    <div style={blockWrap}>
      <BlockHeader label="Callout" color="#A8572B" blockId={block.id} onRemove={removeBlock} onMove={moveBlock} />
      <div style={{ padding: 16 }}>

        {/* Text fallback field (panel input) */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabel}>Callout text</label>
          <input
            value={text}
            onChange={e => updateBlock(block.id, { text: e.target.value })}
            placeholder="Callout"
            style={inputStyle}
          />
          <p style={helpText}>Edit here, or type directly in the box on the canvas (the width reflows live as you type). Drag the box and the round target handle to position the annotation.</p>
        </div>

        {/* Canvas — 16:9, normalized 0-100 coords */}
        <div
          ref={canvasRef}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          style={{
            position: 'relative', width: '100%', paddingBottom: '56.25%',
            background: '#0a1628',
            border: '2px dashed #A8572B',
            borderRadius: 6, userSelect: 'none', marginBottom: 6, overflow: 'hidden',
          }}
        >
          {/* Connector line: box center -> target. The opaque box (below) covers the
              portion under it, so the line emerges from the box edge. Same geometry
              the published overlay uses (calloutOverlay buildCalloutOverlayHTML). */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            <line x1={box.x} y1={box.y} x2={target.x} y2={target.y}
              stroke={CALLOUT_STYLE.line} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          </svg>

          {/* Target CIRCLE — EDITING AFFORDANCE ONLY (never rendered in preview /
              published output). Drag it to set target.x/y. */}
          <div
            onMouseDown={startDrag('target', target)}
            title="Target — drag to aim the connector line"
            style={{
              position: 'absolute', left: `${target.x}%`, top: `${target.y}%`,
              width: 16, height: 16, marginLeft: -8, marginTop: -8,
              borderRadius: '50%', background: CALLOUT_STYLE.line,
              border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
              cursor: 'move', zIndex: 3,
            }}
          />

          {/* Rounded BOX — drag to move (box.x/y = CENTER). Inline-editable text
              with LIVE width reflow (inline-block auto-width honoring 20px padding). */}
          <div
            onMouseDown={startDrag('box', box)}
            style={{
              position: 'absolute', left: `${box.x}%`, top: `${box.y}%`,
              transform: 'translate(-50%, -50%)',
              maxWidth: '70%', cursor: 'move', zIndex: 4,
            }}
          >
            <div
              ref={boxRef}
              contentEditable
              suppressContentEditableWarning
              onMouseDown={e => e.stopPropagation()}   /* let the caret land; don't start a drag */
              onInput={() => {}}                        /* width reflows automatically via inline-block */
              onBlur={commitBoxText}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); boxRef.current.blur() }
              }}
              style={{
                display: 'inline-block', boxSizing: 'border-box',
                padding, borderRadius: CALLOUT_STYLE.radius,
                background: CALLOUT_STYLE.boxBg, color: CALLOUT_STYLE.boxText,
                border: `1px solid ${CALLOUT_STYLE.boxBorder}`,
                boxShadow: CALLOUT_STYLE.shadow,
                font: `600 14px/1.35 'Inter', system-ui, sans-serif`,
                textAlign: 'center', whiteSpace: 'nowrap', cursor: 'text',
                outline: 'none', minWidth: 24,
              }}
            >{text}</div>
          </div>
        </div>
        <p style={helpText}>The round target handle is an editing guide — only the box and connector line appear in previews and the published course.</p>
      </div>
    </div>
  )
}
