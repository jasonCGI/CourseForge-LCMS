import React, { useState, useEffect, useRef } from 'react'
import { searchFrames } from '../../api/client'

const BLOCK_TYPES = [
  ['', 'All types'], ['text', 'Text'], ['media', 'Media'], ['quiz', 'Quiz'],
  ['hotspot', 'Hotspot'], ['branch', 'Branch'], ['wcn', 'WCN'], ['oam', 'OAM'],
  ['ivideo', 'Interactive Video'], ['model3d', '3D Model'], ['gui', 'GUI Shell'],
]
const BT_COLOR = { text: '#185FA5', media: '#1A7A5E', quiz: '#854F0B', hotspot: '#533AB7',
  branch: '#3C3489', wcn: '#C0392B', oam: '#533AB7', ivideo: '#7A3A9A', model3d: '#2A5A8A', gui: '#3A5A8A' }

export default function FrameSearch({ projectId, open, onClose, onNavigate }) {
  const [query, setQuery]       = useState('')
  const [blockType, setBlockType] = useState('')
  const [hasNotes, setHasNotes] = useState(false)
  const [results, setResults]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef(null)
  const timer = useRef(null)

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50); setQuery(''); setResults([]); setSearched(false); setBlockType(''); setHasNotes(false) }
  }, [open])

  const run = (q, bt, hn) => {
    if (!projectId) return
    if (!q.trim() && !bt && !hn) { setResults([]); setSearched(false); return }
    setLoading(true)
    const params = {}
    if (q.trim()) params.q = q.trim()
    if (bt) params.type = bt
    if (hn) params.has_notes = '1'
    searchFrames(projectId, params).then(r => { setResults(r.data); setSearched(true) })
      .catch(() => {}).finally(() => setLoading(false))
  }
  const onQuery = (v) => { setQuery(v); clearTimeout(timer.current); timer.current = setTimeout(() => run(v, blockType, hasNotes), 300) }

  if (!open) return null
  return (
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- click-to-dismiss backdrop; Escape closes (input handler) and the ✕ button provides a keyboard-accessible close */
    <div role="dialog" aria-modal="true" aria-label="Search frames"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(4,44,83,0.75)', zIndex: 2000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 24px 24px' }}>
      <div style={{ background: 'var(--cf-block-bg, #0d1017)', border: '1px solid var(--cf-border-secondary, #3a3a5a)',
        borderRadius: 10, width: 600, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--cf-border-tertiary)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 16, color: 'var(--cf-text-tertiary)' }}>🔍</span>
          <input ref={inputRef} value={query} onChange={e => onQuery(e.target.value)}
            placeholder="Search frame names, text, quiz questions, WCN content…" aria-label="Search frames"
            onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter') run(query, blockType, hasNotes) }}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14,
              color: 'var(--cf-text-primary)', fontFamily: 'var(--cf-font)' }} />
          {loading && <span style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)' }}>searching…</span>}
          <button onClick={onClose} aria-label="Close search" style={{ background: 'none', border: 'none',
            color: 'var(--cf-text-tertiary)', fontSize: 16, cursor: 'pointer', padding: '2px 4px' }}>✕</button>
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--cf-border-tertiary)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <select value={blockType} onChange={e => { setBlockType(e.target.value); run(query, e.target.value, hasNotes) }}
            aria-label="Filter by block type" style={{ background: 'var(--cf-input-bg)', border: '1px solid var(--cf-border-secondary)',
              borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--cf-text-secondary)', fontFamily: 'var(--cf-font)', cursor: 'pointer' }}>
            {BLOCK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--cf-text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={hasNotes} onChange={e => { setHasNotes(e.target.checked); run(query, blockType, e.target.checked) }}
              aria-label="Only frames with author notes" /> Has notes
          </label>
          {searched && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)' }}>
            {results.length} result{results.length !== 1 ? 's' : ''}</span>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {!searched && !loading && (
            <div style={{ textAlign: 'center', color: 'var(--cf-text-tertiary)', fontSize: 11, padding: 32, fontFamily: 'var(--forge-font)' }}>
              type to search · filter by block type · find frames with notes</div>
          )}
          {searched && results.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--cf-text-tertiary)', fontSize: 12, padding: 32 }}>No frames match your search</div>
          )}
          {results.map(r => (
            <button key={r.frame_id} onClick={() => { onNavigate(r.frame_id, r.lesson_id); onClose() }}
              style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none',
                textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid var(--cf-border-tertiary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--cf-input-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <div style={{ fontSize: 9, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)', marginBottom: 4 }}>{r.breadcrumb}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cf-text-primary)', flex: 1 }}>{r.frame_name}</span>
                {r.has_notes && <span style={{ fontSize: 10, color: 'var(--forge-amber)' }}>✎</span>}
                <span style={{ fontFamily: 'var(--forge-font)', fontSize: 8, fontWeight: 600, padding: '1px 5px',
                  borderRadius: 3, background: 'var(--cf-input-bg)', color: 'var(--cf-text-tertiary)',
                  textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.frame_type}</span>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {r.block_types.filter(Boolean).map(bt => (
                  <span key={bt} style={{ fontFamily: 'var(--forge-font)', fontSize: 8, fontWeight: 600, padding: '1px 6px',
                    borderRadius: 3, background: `${BT_COLOR[bt] || '#333'}22`, color: BT_COLOR[bt] || '#888',
                    textTransform: 'uppercase', letterSpacing: '0.06em' }}>{bt}</span>
                ))}
                {r.notes_preview && <span style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', marginLeft: 4,
                  fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{r.notes_preview}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
