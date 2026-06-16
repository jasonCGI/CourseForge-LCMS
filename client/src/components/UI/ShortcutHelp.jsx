import React from 'react'

const SHORTCUTS = [
  { keys: ['Ctrl', 'S'], desc: 'Save now' },
  { keys: ['Ctrl', 'P'], desc: 'Preview current frame' },
  { keys: ['Ctrl', 'D'], desc: 'Duplicate selected block' },
  { keys: ['Ctrl', 'Z'], desc: 'Undo last block change' },
  { keys: ['Ctrl', '↑'], desc: 'Move selected block up' },
  { keys: ['Ctrl', '↓'], desc: 'Move selected block down' },
  { keys: ['Esc'],        desc: 'Close modal / cancel' },
  { keys: ['?'],          desc: 'Show this help' },
]

export default function ShortcutHelp({ open, onClose }) {
  if (!open) return null
  return (
    <div
      role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(4,44,83,0.75)',
        zIndex: 3000, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24,
      }}
    >
      <div style={{
        background: 'var(--cf-block-bg, #0d1017)',
        border: '1px solid var(--cf-border-secondary, #3a3a5a)',
        borderRadius: 10, width: 420, overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--cf-border-tertiary, rgba(255,255,255,0.06))',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--cf-input-bg, #060810)',
        }}>
          <span style={{
            fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
            fontSize: 12, fontWeight: 600, color: 'var(--cf-text-primary, #E0E8F0)',
            letterSpacing: '0.04em', flex: 1,
          }}>Keyboard shortcuts</span>
          <button onClick={onClose} aria-label="Close shortcuts help" style={{
            background: 'none', border: 'none', color: 'var(--cf-text-tertiary, #3A5A7A)',
            fontSize: 16, cursor: 'pointer', padding: '2px 4px',
          }}>✕</button>
        </div>

        <div style={{ padding: '12px 18px' }}>
          {SHORTCUTS.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 0',
              borderBottom: i < SHORTCUTS.length - 1
                ? '1px solid var(--cf-border-tertiary, rgba(255,255,255,0.06))' : 'none',
            }}>
              <span style={{ fontSize: 12, color: 'var(--cf-text-secondary, #7A90A8)' }}>{s.desc}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {s.keys.map((k, ki) => (
                  <React.Fragment key={ki}>
                    <kbd style={{
                      fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
                      fontSize: 10, fontWeight: 600, padding: '2px 7px',
                      background: 'var(--cf-input-bg, #060810)',
                      border: '1px solid var(--cf-border-secondary, #3a3a5a)',
                      borderRadius: 4, color: 'var(--forge-amber)', letterSpacing: '0.04em',
                    }}>{k}</kbd>
                    {ki < s.keys.length - 1 && (
                      <span style={{ fontSize: 10, color: 'var(--cf-text-tertiary, #3A5A7A)', alignSelf: 'center' }}>+</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: '10px 18px',
          borderTop: '1px solid var(--cf-border-tertiary, rgba(255,255,255,0.06))',
          fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
          fontSize: 9, color: 'var(--cf-text-tertiary, #3A5A7A)', letterSpacing: '0.06em',
        }}>
          // Ctrl = Cmd on Mac · shortcuts inactive while typing in fields
        </div>
      </div>
    </div>
  )
}
