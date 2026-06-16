import React from 'react'
import useEditorStore from '../../store/editorStore'

/** Persistent autosave status dot in the header. */
export default function SaveIndicator() {
  const saveStatus = useEditorStore(s => s.saveStatus)
  const cfg = {
    idle:   { color: '#3A5A7A', label: '',           dot: false },
    saving: { color: '#F59E0B', label: 'saving…',    dot: true  },
    saved:  { color: '#4CAF50', label: 'saved',      dot: true  },
    error:  { color: '#E87070', label: 'save error', dot: true  },
  }[saveStatus || 'idle']

  if (!cfg.dot) return null

  return (
    <div aria-live="polite" aria-label={`Autosave: ${cfg.label}`}
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
        borderRadius: 20, background: `${cfg.color}22`, border: `1px solid ${cfg.color}66`,
        flexShrink: 0, marginLeft: 10 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0,
        animation: saveStatus === 'saving' ? 'pulse-save 1s ease-in-out infinite' : 'none' }} />
      <span style={{ fontFamily: 'var(--forge-font)', fontSize: 9, fontWeight: 600,
        color: cfg.color, letterSpacing: '0.06em' }}>{cfg.label}</span>
    </div>
  )
}
