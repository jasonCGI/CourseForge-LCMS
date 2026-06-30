import React, { useEffect, useRef, useState } from 'react'
import useEditorStore, { PRIMARY_TYPES, MEDIA_TYPES, resolveExclusivity } from '../../store/editorStore'
import { BLOCK_ICONS } from '../icons'

// `Icon` is the Iconoir (iconoir-react) component for each block type; see
// client/src/components/icons.jsx for the curated mapping.
export const BLOCK_TYPES = [
  { type: 'text',    label: 'Text',    Icon: BLOCK_ICONS.text,    color: '#185FA5', available: true  },
  { type: 'media',   label: 'Media',   Icon: BLOCK_ICONS.media,   color: '#3B6D11', available: true  },
  { type: 'audio',   label: 'Audio',   Icon: BLOCK_ICONS.audio,   color: '#1A7A5E', available: true  },
  { type: 'quiz',    label: 'Quiz',    Icon: BLOCK_ICONS.quiz,    color: '#854F0B', available: true  },
  { type: 'hotspot', label: 'Hotspot', Icon: BLOCK_ICONS.hotspot, color: '#533AB7', available: true  },
  { type: 'branch',  label: 'Branch',  Icon: BLOCK_ICONS.branch,  color: '#3C3489', available: true  },
  { type: 'wcn',     label: 'WCN',     Icon: BLOCK_ICONS.wcn,     color: '#C0392B', available: true  },
  { type: 'oam',     label: 'OAM',     Icon: BLOCK_ICONS.oam,     color: '#533AB7', available: true  },
  { type: 'ivideo',  label: 'iVideo',  Icon: BLOCK_ICONS.ivideo,  color: '#7A3A9A', available: true  },
  { type: 'model3d', label: '3D Model', Icon: BLOCK_ICONS.model3d, color: '#2A5A8A', available: true  },
  { type: 'callout', label: 'Callout', Icon: BLOCK_ICONS.callout, color: '#A8572B', available: true  },
  // GUI shells are applied at the PROJECT level (header ▣ Shell button), not per frame.
]

// Grouping for the Add-block popover. A flat 11-icon grid was cluttered, the icons
// weren't all self-evident, and disabled types read as broken; categories give the
// list hierarchy and the type-to-filter box doubles as a mini command palette.
const CATEGORIES = [
  { name: 'Content',     types: ['text', 'media', 'audio'] },
  { name: 'Assessment',  types: ['quiz', 'hotspot', 'branch'] },
  { name: 'Interactive', types: ['model3d', 'ivideo', 'oam', 'callout'] },
  { name: 'Safety',      types: ['wcn'] },
]
const BY_TYPE = Object.fromEntries(BLOCK_TYPES.map(b => [b.type, b]))

export default function BlockToolbar() {
  const addBlock    = useEditorStore(s => s.addBlock)
  const activeFrame = useEditorStore(s => s.activeFrame)

  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const rootRef  = useRef(null)
  const inputRef = useRef(null)

  // Focus the filter on open; dismiss on Esc + click-outside.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    const onKey  = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  if (!activeFrame) return null

  // Layout-aware content-type exclusivity. The frame's content.layout caps how
  // many zone-fillers fit: 'full' = ONE total (any zone-filler blocks both groups),
  // split layouts = one PRIMARY (text/quiz) + one MEDIA (media/model3d/oam/ivideo).
  // Auxiliary types (wcn/hotspot/branch/audio) stay always-addable. Mirrors the
  // store guard in addBlock (resolveExclusivity / isBlockTypeBlocked).
  const ex = resolveExclusivity(activeFrame)
  const primaryReason = ex.reason || ex.primaryReason
  const mediaReason   = ex.reason || ex.mediaReason

  const stateOf = (type) => {
    const b = BY_TYPE[type]
    if (!b) return null
    const isPrimary = PRIMARY_TYPES.includes(type)
    const isMedia   = MEDIA_TYPES.includes(type)
    const blocked   = (isPrimary && ex.primaryBlocked) || (isMedia && ex.mediaBlocked)
    const enabled   = b.available && !blocked
    const reason    = !b.available ? 'Available in Sprint 4'
      : blocked ? (isPrimary ? primaryReason : mediaReason) : null
    return { ...b, enabled, reason }
  }

  const q = query.trim().toLowerCase()
  const cats = CATEGORIES
    .map(c => ({
      name: c.name,
      items: c.types.map(stateOf).filter(it => it && (!q || it.label.toLowerCase().includes(q))),
    }))
    .filter(c => c.items.length)
  const firstEnabled = cats.flatMap(c => c.items).find(it => it.enabled)

  const pick = (it) => {
    if (!it.enabled) return
    addBlock(it.type)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} style={{
      position: 'relative',
      padding: '10px 20px',
      borderTop: '1px solid var(--color-border-tertiary)',
      background: 'var(--color-background-secondary)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <span style={{
        fontSize: 11,
        color: 'var(--color-text-secondary)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        Add block
      </span>

      <button
        className="cf-btn cf-btn--primary cf-btn--sm"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Add a block to this frame"
      >
        + Add block
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Add a block"
          style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: 20, width: 300, zIndex: 600,
            display: 'flex', flexDirection: 'column', maxHeight: '62vh',
            background: 'var(--cf-block-bg, #0d1017)',
            border: '1px solid var(--cf-border-secondary, #3a3a5a)',
            borderRadius: 10, boxShadow: '0 -8px 28px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--cf-border-tertiary, rgba(255,255,255,0.1))' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && firstEnabled) { e.preventDefault(); pick(firstEnabled) } }}
              placeholder="🔎 type to filter…"
              aria-label="Filter block types"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--cf-input-bg, #060810)',
                border: '1px solid var(--cf-border-secondary, #3a3a5a)',
                borderRadius: 6, padding: '7px 10px',
                color: 'var(--cf-text-primary, #E0E8F0)',
                fontFamily: 'var(--forge-font)', fontSize: 12,
              }}
            />
          </div>

          <div style={{ overflowY: 'auto', padding: '6px 8px 10px' }}>
            {cats.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--cf-text-tertiary)', padding: '10px 6px' }}>
                No block types match “{query}”.
              </div>
            )}
            {cats.map(c => (
              <div key={c.name} style={{ marginBottom: 4 }}>
                <div style={{
                  fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)',
                  padding: '8px 6px 4px',
                }}>
                  {c.name}
                </div>
                {c.items.map(it => (
                  <button
                    key={it.type}
                    className="cf-btn cf-btn--ghost cf-btn--sm"
                    disabled={!it.enabled}
                    onClick={() => pick(it)}
                    aria-label={`Add ${it.label} block`}
                    title={it.enabled ? `Add ${it.label} block` : it.reason || ''}
                    style={{ width: '100%', justifyContent: 'flex-start', gap: 8, borderRadius: 6, marginBottom: 1 }}
                  >
                    {it.Icon && (
                      <span aria-hidden="true" style={{ color: it.color, display: 'inline-flex', flexShrink: 0 }}>
                        <it.Icon width={15} height={15} />
                      </span>
                    )}
                    <span style={{ color: it.enabled ? 'var(--cf-text-primary, #E0E8F0)' : 'inherit' }}>{it.label}</span>
                    {!it.enabled && it.reason && (
                      <span style={{
                        marginLeft: 'auto', fontSize: 9, color: 'var(--cf-text-tertiary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150,
                      }}>
                        {it.reason}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
