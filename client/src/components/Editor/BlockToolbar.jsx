import React from 'react'
import useEditorStore from '../../store/editorStore'

const BLOCK_TYPES = [
  { type: 'text',    label: 'Text',    icon: '¶',  color: '#185FA5', available: true  },
  { type: 'media',   label: 'Media',   icon: '🖼',  color: '#3B6D11', available: true  },
  { type: 'quiz',    label: 'Quiz',    icon: '?',   color: '#854F0B', available: true  },
  { type: 'hotspot', label: 'Hotspot', icon: '⊕',  color: '#533AB7', available: true  },
  { type: 'branch',  label: 'Branch',  icon: '⋔',  color: '#3C3489', available: true  },
  { type: 'oam',     label: 'OAM',     icon: '⚙',  color: '#533AB7', available: false },
]

export default function BlockToolbar() {
  const addBlock     = useEditorStore(s => s.addBlock)
  const activeFrame  = useEditorStore(s => s.activeFrame)

  if (!activeFrame) return null

  return (
    <div style={{
      padding: '10px 20px',
      borderTop: '1px solid var(--color-border-tertiary)',
      background: 'var(--color-background-secondary)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 11,
        color: 'var(--color-text-secondary)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginRight: 4,
      }}>
        Add block
      </span>
      {BLOCK_TYPES.map(({ type, label, icon, color, available }) => (
        <button
          key={type}
          onClick={() => available && addBlock(type)}
          aria-label={`Add ${label} block`}
          title={available ? `Add ${label} block` : `${label} — available in Sprint 4`}
          style={{
            padding: '5px 12px',
            borderRadius: 4,
            border: `1px solid ${available ? color : 'var(--color-border-tertiary)'}`,
            background: 'transparent',
            color: available ? color : 'var(--color-text-secondary)',
            fontSize: 12,
            cursor: available ? 'pointer' : 'not-allowed',
            opacity: available ? 1 : 0.4,
            fontFamily: 'var(--font-sans)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span>{icon}</span>
          <span>{label}</span>
          {!available && <span style={{ fontSize: 9, opacity: 0.7 }}>S4</span>}
        </button>
      ))}
    </div>
  )
}
