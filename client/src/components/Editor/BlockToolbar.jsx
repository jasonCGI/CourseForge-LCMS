import React from 'react'
import useEditorStore, { PRIMARY_TYPES, MEDIA_TYPES, resolveExclusivity } from '../../store/editorStore'
import { BLOCK_ICONS } from '../icons'

// `Icon` is the Iconoir (iconoir-react) component for each block type; see
// client/src/components/icons.jsx for the curated mapping.
export const BLOCK_TYPES = [
  { type: 'text',    label: 'Text',    Icon: BLOCK_ICONS.text,    color: '#185FA5', available: true  },
  { type: 'media',   label: 'Media',   Icon: BLOCK_ICONS.media,   color: '#3B6D11', available: true  },
  { type: 'quiz',    label: 'Quiz',    Icon: BLOCK_ICONS.quiz,    color: '#854F0B', available: true  },
  { type: 'hotspot', label: 'Hotspot', Icon: BLOCK_ICONS.hotspot, color: '#533AB7', available: true  },
  { type: 'branch',  label: 'Branch',  Icon: BLOCK_ICONS.branch,  color: '#3C3489', available: true  },
  { type: 'wcn',     label: 'WCN',     Icon: BLOCK_ICONS.wcn,     color: '#C0392B', available: true  },
  { type: 'oam',     label: 'OAM',     Icon: BLOCK_ICONS.oam,     color: '#533AB7', available: true  },
  { type: 'ivideo',  label: 'iVideo',  Icon: BLOCK_ICONS.ivideo,  color: '#7A3A9A', available: true  },
  { type: 'model3d', label: '3D Model', Icon: BLOCK_ICONS.model3d, color: '#2A5A8A', available: true  },
  // GUI shells are applied at the PROJECT level (header ▣ Shell button), not per frame.
]

export default function BlockToolbar() {
  const addBlock     = useEditorStore(s => s.addBlock)
  const activeFrame  = useEditorStore(s => s.activeFrame)

  if (!activeFrame) return null

  // Layout-aware content-type exclusivity. The frame's content.layout caps how
  // many zone-fillers fit: 'full' = ONE total (any zone-filler blocks both groups),
  // split layouts = one PRIMARY (text/quiz) + one MEDIA (media/model3d/oam/ivideo).
  // Auxiliary types (wcn/hotspot/branch/audio) stay always-addable. Mirrors the
  // store guard in addBlock (resolveExclusivity / isBlockTypeBlocked).
  const ex = resolveExclusivity(activeFrame)
  const primaryReason = ex.reason || ex.primaryReason
  const mediaReason   = ex.reason || ex.mediaReason

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
      {BLOCK_TYPES.map(({ type, label, Icon, color, available }) => {
        // Disable the PRIMARY group (text/quiz) or MEDIA group (media/model3d/oam/
        // ivideo) per the layout-resolved exclusivity. Auxiliary types are never
        // blocked here.
        const isPrimary = PRIMARY_TYPES.includes(type)
        const isMedia   = MEDIA_TYPES.includes(type)
        const exclusivityBlocked =
          (isPrimary && ex.primaryBlocked) || (isMedia && ex.mediaBlocked)
        const enabled = available && !exclusivityBlocked
        const title = exclusivityBlocked
          ? (isPrimary ? primaryReason : mediaReason)
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
            {Icon && <Icon width={15} height={15} />}
            <span>{label}</span>
            {!available && <span style={{ fontSize: 9, opacity: 0.7 }}>S4</span>}
          </button>
        )
      })}
    </div>
  )
}
