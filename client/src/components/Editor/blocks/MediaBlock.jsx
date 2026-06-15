import React, { useCallback } from 'react'
import useEditorStore from '../../../store/editorStore'
import { BlockHeader } from './TextBlock'

const MEDIA_KINDS = ['image', 'video', 'audio', 'oam']

const KIND_ICON = {
  image: '🖼',
  video: '🎬',
  audio: '🎙',
  oam:   '⚙',
}

const KIND_COLOR = {
  image: '#185FA5',
  video: '#3B6D11',
  audio: '#854F0B',
  oam:   '#533AB7',
}

export default function MediaBlock({ block }) {
  const updateBlock = useEditorStore(s => s.updateBlock)
  const removeBlock = useEditorStore(s => s.removeBlock)
  const moveBlock   = useEditorStore(s => s.moveBlock)

  const update = useCallback((field, value) => {
    updateBlock(block.id, { [field]: value })
  }, [block.id, updateBlock])

  const kind = block.data.kind || 'image'

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '1px solid var(--color-border-tertiary)',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      <BlockHeader
        label={`Media — ${kind}`}
        color={KIND_COLOR[kind]}
        blockId={block.id}
        onRemove={removeBlock}
        onMove={moveBlock}
      />

      <div style={{ padding: '16px' }}>
        {/* Kind selector */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabel}>Media type</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {MEDIA_KINDS.map(k => (
              <button
                key={k}
                onClick={() => update('kind', k)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 4,
                  border: `1px solid ${kind === k ? KIND_COLOR[k] : 'var(--color-border-tertiary)'}`,
                  background: kind === k ? KIND_COLOR[k] : 'transparent',
                  color: kind === k ? '#fff' : 'var(--color-text-secondary)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {KIND_ICON[k]} {k.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Placeholder label */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabel}>Placeholder label</label>
          <input
            value={block.data.placeholder_label || ''}
            onChange={e => update('placeholder_label', e.target.value)}
            placeholder="e.g. nose_section_photo"
            style={inputStyle}
          />
          <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
            Used to identify this slot when media is uploaded later
          </p>
        </div>

        {/* Caption */}
        <div>
          <label style={fieldLabel}>Caption</label>
          <input
            value={block.data.caption || ''}
            onChange={e => update('caption', e.target.value)}
            placeholder="Optional caption shown below media"
            style={inputStyle}
          />
        </div>

        {/* Placeholder preview */}
        <div style={{
          marginTop: 16,
          border: `2px dashed ${KIND_COLOR[kind]}`,
          borderRadius: 6,
          padding: '24px 16px',
          textAlign: 'center',
          background: 'var(--color-background-secondary)',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{KIND_ICON[kind]}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {block.data.placeholder_label
              ? `[${kind}: ${block.data.placeholder_label}]`
              : `[${kind} placeholder — no label set]`}
          </div>
          {block.data.asset_id && (
            <div style={{ fontSize: 11, color: '#3B6D11', marginTop: 4 }}>
              ✓ Asset linked: {block.data.asset_id}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const fieldLabel = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 6,
}

const inputStyle = {
  width: '100%',
  background: 'var(--color-background-secondary)',
  border: '1px solid var(--color-border-tertiary)',
  borderRadius: 4,
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box',
}
