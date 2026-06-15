import React, { useState } from 'react'
import { publishProject } from '../../api/client'
import useProjectStore from '../../store/projectStore'

const FORMATS = [
  { id: 'scorm12', label: 'SCORM 1.2', desc: 'Compatible with all LMS platforms including ADLS', icon: '📦' },
  { id: 'web',     label: 'Web Bundle', desc: 'Standalone HTML — no LMS required, host anywhere', icon: '🌐' },
]

export default function PublishModal({ onClose }) {
  const activeProject = useProjectStore(s => s.activeProject)
  const [format,      setFormat]   = useState('scorm12')
  const [publishing,  setPublishing] = useState(false)
  const [error,       setError]    = useState(null)
  const [done,        setDone]     = useState(false)

  const handlePublish = async () => {
    if (!activeProject) return
    setPublishing(true)
    setError(null)
    try {
      const res  = await publishProject(activeProject.id, format)
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }))
      const a    = document.createElement('a')
      const ext  = format === 'scorm12' ? 'scorm12' : 'web'
      a.href     = url
      a.download = `${activeProject.name.replace(/\s+/g,'_')}_${ext}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setDone(true)
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-background-primary)',
          borderRadius: 10,
          width: '100%', maxWidth: 480,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          background: '#042C53',
          display: 'flex', alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, color: '#B5D4F4', fontWeight: 500, flex: 1 }}>
            Publish — {activeProject?.name}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#B5D4F4',
            fontSize: 18, cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Format selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 600,
              color: 'var(--color-text-secondary)', letterSpacing: '0.08em',
              textTransform: 'uppercase', marginBottom: 10,
            }}>Output format</label>
            {FORMATS.map(f => (
              <div
                key={f.id}
                onClick={() => setFormat(f.id)}
                style={{
                  padding: '14px 16px',
                  border: `2px solid ${format === f.id ? '#185FA5' : 'var(--color-border-tertiary)'}`,
                  borderRadius: 6,
                  background: format === f.id ? 'rgba(24,95,165,0.08)' : 'transparent',
                  cursor: 'pointer',
                  marginBottom: 8,
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>
                    {f.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {f.desc}
                  </div>
                </div>
                {format === f.id && (
                  <span style={{ marginLeft: 'auto', color: '#185FA5', fontSize: 16 }}>✓</span>
                )}
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '10px 14px', background: '#FDECEA',
              border: '1px solid #C0392B', borderRadius: 6,
              color: '#C0392B', fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {/* Success */}
          {done && (
            <div style={{
              padding: '10px 14px', background: '#EAF6EC',
              border: '1px solid #3B8A4A', borderRadius: 6,
              color: '#1E7E34', fontSize: 13, marginBottom: 16,
            }}>
              ✓ Package downloaded successfully.
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{
              padding: '8px 16px', background: 'transparent',
              border: '1px solid var(--color-border-secondary)',
              borderRadius: 4, color: 'var(--color-text-secondary)',
              cursor: 'pointer', fontSize: 13,
              fontFamily: 'var(--font-sans)',
            }}>
              Cancel
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || !activeProject}
              style={{
                padding: '8px 20px',
                background: publishing ? '#0C447C' : '#185FA5',
                color: '#fff', border: 'none',
                borderRadius: 4, fontSize: 13, fontWeight: 600,
                cursor: publishing ? 'wait' : 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {publishing ? 'Building package…' : `⬇ Publish ${FORMATS.find(f=>f.id===format)?.label}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
