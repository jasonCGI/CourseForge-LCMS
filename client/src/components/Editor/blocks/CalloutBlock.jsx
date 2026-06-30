import React from 'react'
import useEditorStore from '../../../store/editorStore'
import { BlockHeader } from './BlockHeader'
import { blockWrap, fieldLabel, inputStyle, helpText } from './blockStyles'

// Callout block editor — CONTENT + SHAPE only.
//
// A callout is a free-floating annotation overlay (rounded box + connector line to
// a target point) over the frame's content area. This panel defines WHAT the
// callout says and HOW it looks (text + uniform padding). POSITIONING and TARGETING
// happen directly in the live preview: drag the box to move it, drag the round
// target handle (shown when selected) to aim the connector line, and edit the text
// inline. (See FramePreview's InteractiveCallout.)
//
// Padding is UNIFORM on all four sides (CSS `padding:Npx` shorthand). The box is
// THIN for a single line and grows in HEIGHT for multi-line by the same rule — no
// fixed height. The same per-block `padding` value drives the live preview and the
// published SCO (calloutOverlay.js + scorm12._callout_overlay_html).

const clampPad = v => Math.max(0, Math.min(40, v))

const ANCHOR_OPTIONS = [
  { value: 'auto',   label: 'Auto' },
  { value: 'top',    label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left',   label: 'Left' },
  { value: 'right',  label: 'Right' },
]

export default function CalloutBlock({ block }) {
  const updateBlock = useEditorStore(s => s.updateBlock)
  const removeBlock = useEditorStore(s => s.removeBlock)
  const moveBlock   = useEditorStore(s => s.moveBlock)

  const data    = block.data || {}
  const text    = data.text != null ? data.text : 'Callout'
  const padding = data.padding != null ? Number(data.padding) : 10
  const anchor  = data.anchor != null ? data.anchor : 'auto'

  return (
    <div style={blockWrap}>
      <BlockHeader label="Callout" color="#A8572B" blockId={block.id} onRemove={removeBlock} onMove={moveBlock} />
      <div style={{ padding: 16 }}>

        {/* Text */}
        <div style={{ marginBottom: 14 }}>
          <label htmlFor={`callout-text-${block.id}`} style={fieldLabel}>Callout text</label>
          <input
            id={`callout-text-${block.id}`}
            value={text}
            onChange={e => updateBlock(block.id, { text: e.target.value })}
            placeholder="Callout"
            style={inputStyle}
          />
        </div>

        {/* Padding — uniform on all four sides */}
        <div style={{ marginBottom: 6 }}>
          <span style={fieldLabel}>Padding (px)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range" min={0} max={40} step={1} value={padding}
              onChange={e => updateBlock(block.id, { padding: clampPad(Number(e.target.value)) })}
              style={{ flex: 1, accentColor: '#A8572B' }}
            />
            <input
              type="number" min={0} max={40} step={1} value={padding}
              onChange={e => updateBlock(block.id, { padding: clampPad(Number(e.target.value)) })}
              style={{ ...inputStyle, width: 64, flex: 'none' }}
            />
          </div>
          <p style={helpText}>Uniform on all sides. The box stays thin for one line and grows in height as text wraps.</p>
        </div>

        {/* Anchor — which box edge the connector line attaches to (its center).
            Auto picks the edge facing the target. */}
        <div style={{ marginBottom: 6 }}>
          <span style={fieldLabel}>Connector anchor</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {ANCHOR_OPTIONS.map(opt => {
              const sel = anchor === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateBlock(block.id, { anchor: opt.value })}
                  style={{
                    flex: 1, padding: '6px 4px', fontSize: 12, fontWeight: 600,
                    borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${sel ? '#A8572B' : '#cdd5df'}`,
                    background: sel ? '#A8572B' : '#fff',
                    color: sel ? '#fff' : '#3a4756',
                  }}
                >{opt.label}</button>
              )
            })}
          </div>
          <p style={helpText}>The line connects to the center of this box edge. Auto picks the edge facing the target.</p>
        </div>

        <p style={helpText}>
          Position it in the live preview: drag the box to move it, drag the round target
          handle to aim the connector line, and edit the text right on the frame.
        </p>
      </div>
    </div>
  )
}
