import React, { useEffect } from 'react'
import FramePreview from './FramePreview'
import useEditorStore from '../../store/editorStore'

export default function PreviewModal({ onClose }) {
  const activeFrame = useEditorStore(s => s.activeFrame)

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 10,
          width: '100%',
          maxWidth: 860,
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Modal header */}
        <div style={{
          padding: '12px 20px',
          background: '#042C53',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, color: '#B5D4F4', fontWeight: 500, flex: 1 }}>
            Preview — {activeFrame?.name}
          </span>
          <span style={{
            fontSize: 11,
            color: '#378ADD',
            fontFamily: 'SF Mono, Consolas, monospace',
            marginRight: 8,
          }}>
            ESC to close
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              color: '#B5D4F4', fontSize: 18,
              cursor: 'pointer', lineHeight: 1, padding: 4,
            }}
          >✕</button>
        </div>

        {/* Preview content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <FramePreview frame={activeFrame} />
        </div>
      </div>
    </div>
  )
}
