import React from 'react'
import useEditorStore from '../../store/editorStore'

const BLOCK_TYPES = [
  { type: 'text',    label: 'Text',    icon: '¶',  color: '#185FA5', available: true  },
  { type: 'media',   label: 'Media',   icon: '🖼',  color: '#3B6D11', available: true  },
  { type: 'quiz',    label: 'Quiz',    icon: '?',   color: '#854F0B', available: true  },
  { type: 'hotspot', label: 'Hotspot', icon: '⊕',  color: '#533AB7', available: true  },
  { type: 'branch',  label: 'Branch',  icon: '⋔',  color: '#3C3489', available: true  },
  { type: 'wcn',     label: 'WCN',     icon: '⚠',  color: '#C0392B', available: true  },
  { type: 'oam',     label: 'OAM',     icon: '⚙',  color: '#533AB7', available: true  },
  { type: 'ivideo',  label: 'iVideo',  icon: '▶⊕', color: '#7A3A9A', available: true  },
  { type: 'model3d', label: '3D Model', icon: '⬡', color: '#2A5A8A', available: true  },
  { type: 'gui',     label: 'GUI Shell', icon: '▣', color: '#3A5A8A', available: true  },
]

export default function BlockToolbar() {
  const addBlock     = useEditorStore(s => s.addBlock)
  const activeFrame  = useEditorStore(s => s.activeFrame)

  if (!activeFrame) return null

  // Only one GUI shell per frame — it becomes the SCO page on publish.
  const hasGui = (activeFrame.content?.blocks || []).some(b => b.type === 'gui')

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
      {BLOCK_TYPES.map(({ type, label, icon, color, available }) => {
        // GUI shell is limited to one per frame.
        const guiBlocked = type === 'gui' && hasGui
        const enabled    = available && !guiBlocked
        const title = guiBlocked
          ? 'Frame already has a GUI shell'
          : available ? `Add ${label} block` : `${label} — available in Sprint 4`
        return (
          <button
            key={type}
            onClick={() => enabled && addBlock(type)}
            disabled={!enabled}
            aria-label={`Add ${label} block`}
            title={title}
            style={{
              padding: '5px 12px',
              borderRadius: 4,
              border: `1px solid ${enabled ? color : 'var(--color-border-tertiary)'}`,
              background: 'transparent',
              color: enabled ? color : 'var(--color-text-secondary)',
              fontSize: 12,
              cursor: enabled ? 'pointer' : 'not-allowed',
              opacity: enabled ? 1 : 0.4,
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
        )
      })}
    </div>
  )
}
