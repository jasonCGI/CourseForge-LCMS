import React, { useState, useEffect } from 'react'
import { getPublishHistory, deletePublish, getPublishDownloadUrl } from '../../api/client'

const FORMAT = {
  scorm12:   { bg: '#0C3060', color: '#90C0F0', label: 'SCORM 1.2'  },
  scorm2004: { bg: '#1A3A00', color: '#90D060', label: 'SCORM 2004' },
  web:       { bg: '#3A2000', color: '#F0B840', label: 'Web Bundle' },
}
const STATUS = { complete: '#4CAF50', running: '#F59E0B', failed: '#E87070', pending: '#3A5A7A' }

const bytes = (b) => !b ? '—' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB'
const when = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function PublishHistory({ projectId, open, onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !projectId) return
    setLoading(true)
    getPublishHistory(projectId).then(r => setHistory(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [open, projectId])

  const remove = async (id) => {
    if (!confirm('Remove this publish record?')) return
    await deletePublish(id)
    setHistory(h => h.filter(j => j.id !== id))
  }

  if (!open) return null
  return (
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- click-to-dismiss backdrop; the header ✕ button provides a keyboard-accessible close */
    <div role="dialog" aria-modal="true" aria-label="Publish history"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(4,44,83,0.75)', zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--cf-block-bg, #0d1017)', border: '1px solid var(--cf-border-secondary, #3a3a5a)',
        borderRadius: 10, width: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--cf-border-tertiary)',
          display: 'flex', alignItems: 'center', gap: 12, background: 'var(--cf-input-bg, #060810)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--forge-font)', fontSize: 12, fontWeight: 600,
            color: 'var(--cf-text-primary)', flex: 1 }}>Publish history</span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none',
            color: 'var(--cf-text-tertiary)', fontSize: 16, cursor: 'pointer', padding: '2px 4px' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--cf-text-tertiary)', fontSize: 12, padding: 32 }}>Loading…</div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--cf-text-tertiary)', fontSize: 12, padding: 32,
              fontFamily: 'var(--forge-font)' }}>// no publishes yet</div>
          ) : history.map(job => {
            const fc = FORMAT[job.format] || FORMAT.scorm12
            return (
              <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                background: 'var(--cf-input-bg, #060810)', border: '1px solid var(--cf-border-tertiary)',
                borderRadius: 6, marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--forge-font)', fontSize: 8, fontWeight: 600, padding: '2px 7px',
                  borderRadius: 3, background: fc.bg, color: fc.color, letterSpacing: '0.06em',
                  textTransform: 'uppercase', flexShrink: 0 }}>{fc.label}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--cf-text-primary)', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.publish_name || fc.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)',
                    display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                    <span>{when(job.created_at)}</span>
                    {job.frame_count != null && <span>{job.frame_count} frames</span>}
                    {job.file_size != null && <span>{bytes(job.file_size)}</span>}
                    {job.cf_version && <span>v{job.cf_version}</span>}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: STATUS[job.status] || '#888',
                  fontFamily: 'var(--forge-font)', flexShrink: 0 }}>{job.status}</span>
                {job.can_download && (
                  <a href={getPublishDownloadUrl(job.id)} aria-label="Download package"
                    style={{ padding: '5px 12px', background: 'var(--cf-block-bg)', border: '1px solid var(--cf-border-secondary)',
                      borderRadius: 4, color: 'var(--cf-text-secondary)', fontSize: 11, textDecoration: 'none',
                      fontFamily: 'var(--cf-font)', flexShrink: 0 }}>⬇ Download</a>
                )}
                <button onClick={() => remove(job.id)} aria-label="Remove record"
                  style={{ background: 'none', border: 'none', color: '#E87070', cursor: 'pointer',
                    fontSize: 12, padding: '2px 4px', flexShrink: 0, opacity: 0.6 }}>✕</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
