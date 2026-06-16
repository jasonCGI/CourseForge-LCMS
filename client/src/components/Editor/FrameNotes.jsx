import React, { useState, useEffect, useRef } from 'react'
import { updateFrame } from '../../api/client'

const amberBorder = 'color-mix(in srgb, var(--forge-amber) 30%, transparent)'
const amberBg = 'color-mix(in srgb, var(--forge-amber) 8%, transparent)'

export default function FrameNotes({ frame }) {
  const [notes, setNotes]   = useState(frame?.notes || '')
  const [saving, setSaving] = useState(false)
  const [open, setOpen]     = useState(false)
  const timer = useRef(null)

  useEffect(() => { setNotes(frame?.notes || '') }, [frame?.id])

  const onChange = (val) => {
    setNotes(val)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      if (!frame?.id) return
      setSaving(true)
      try { await updateFrame(frame.id, { notes: val }) } catch (e) {} finally { setSaving(false) }
    }, 800)
  }

  const has = notes.trim().length > 0

  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
          background: open ? amberBg : 'transparent',
          border: `1px solid ${open || has ? amberBorder : 'var(--cf-border-tertiary)'}`,
          borderRadius: 4, color: has ? 'var(--forge-amber)' : 'var(--cf-text-tertiary)',
          fontSize: 10, cursor: 'pointer', fontFamily: 'var(--forge-font)', letterSpacing: '0.06em' }}>
        <span>✎</span><span>Author notes{has ? ' ●' : ''}</span>
        {saving && <span style={{ opacity: 0.5 }}>saving…</span>}
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          <textarea value={notes} onChange={e => onChange(e.target.value)} rows={4}
            aria-label="Frame author notes (not published)"
            placeholder="Internal notes for this frame — not published to SCORM output. Revision notes, SME feedback, pending items…"
            style={{ width: '100%', background: 'var(--cf-input-bg)', border: '1px solid var(--cf-border-secondary)',
              borderRadius: 4, padding: '8px 10px', fontSize: 12, color: 'var(--cf-text-secondary)',
              fontFamily: 'var(--cf-font)', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }} />
          <div style={{ fontSize: 9, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)',
            marginTop: 4, letterSpacing: '0.06em' }}>// not published · editor only · autosaved</div>
        </div>
      )}
    </div>
  )
}
