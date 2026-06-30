import React from 'react'

// Block card header: label + move-up / move-down / remove controls. Lives in its
// OWN module (not TextBlock.jsx) so the many non-text blocks that use it don't drag
// TextBlock's @tiptap editor dependency into the eager bundle — that let the 396KB
// editor chunk load on first paint. Keep this file dependency-light.
export function BlockHeader({ label, color, blockId, onRemove, onMove }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'var(--color-background-secondary)',
      borderBottom: '1px solid var(--color-border-tertiary)',
    }}>
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: color || '#185FA5',
        flex: 1,
      }}>
        {label}
      </span>
      <button onClick={() => onMove(blockId, 'up')}   aria-label="Move block up"   title="Move up"   style={btnStyle}>↑</button>
      <button onClick={() => onMove(blockId, 'down')} aria-label="Move block down" title="Move down" style={btnStyle}>↓</button>
      <button onClick={() => onRemove(blockId)}       aria-label="Remove block"    title="Remove"    style={{ ...btnStyle, color: '#E24B4A' }}>✕</button>
    </div>
  )
}

const btnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  color: 'var(--color-text-secondary)',
  padding: '2px 6px',
  borderRadius: 3,
  fontFamily: 'var(--font-sans)',
}
