import React, { useState } from 'react'
import { publishProject, validateScormCloud } from '../../api/client'
import useProjectStore from '../../store/projectStore'
import AuditPanel from './AuditPanel'

const FORMATS = [
  { id: 'scorm12',   label: 'SCORM 1.2',          desc: 'Compatible with all LMS platforms including ADLS and legacy systems', icon: '📦' },
  { id: 'scorm2004', label: 'SCORM 2004 (3rd Ed)', desc: 'Modern LMS platforms — sequencing, flow control, richer tracking', icon: '📦' },
  { id: 'web',       label: 'Web Bundle',          desc: 'Standalone HTML — no LMS required, host anywhere', icon: '🌐' },
]

export default function PublishModal({ onClose }) {
  const activeProject = useProjectStore(s => s.activeProject)
  const [format,      setFormat]   = useState('scorm12')
  const [publishing,  setPublishing] = useState(false)
  const [error,       setError]    = useState(null)
  const [done,        setDone]     = useState(false)
  const [step,        setStep]     = useState('audit')   // 'audit' | 'publish'
  const [validating,  setValidating] = useState(false)
  const [validation,  setValidation] = useState(null)

  const handleValidate = async () => {
    if (!activeProject) return
    setValidating(true); setValidation(null); setError(null)
    try {
      const res = await validateScormCloud(activeProject.id, format)
      setValidation(res.data)
    } catch (e) {
      if (e.response?.status === 503) {
        setValidation({ notConfigured: true, error: e.response?.data?.error })
      } else {
        setError(e.response?.data?.error || e.message || 'Validation failed')
      }
    } finally {
      setValidating(false)
    }
  }

  const handlePublish = async () => {
    if (!activeProject) return
    setPublishing(true)
    setError(null)
    try {
      const res  = await publishProject(activeProject.id, format)
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }))
      const a    = document.createElement('a')
      const ext  = format === 'web' ? 'web' : format
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
          {step === 'audit' ? (
            <AuditPanel onProceed={() => setStep('publish')} onCancel={onClose} />
          ) : (
          <>
          {/* Back to audit */}
          <button onClick={() => setStep('audit')} style={{
            background: 'none', border: 'none', color: 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: 12, marginBottom: 12, padding: 0,
            fontFamily: 'var(--font-sans)',
          }}>← Back to Audit</button>

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
                onClick={() => { setFormat(f.id); setValidation(null); setDone(false) }}
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

          {/* SCORM Cloud validation result */}
          {validation && (
            <div style={{
              padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16,
              background: validation.notConfigured ? '#FFF3E0'
                : validation.ok && (validation.warnings?.length || 0) === 0 ? '#EAF6EC'
                : validation.status === 'ERROR' ? '#FDECEA' : '#FFF3E0',
              border: `1px solid ${validation.notConfigured ? 'var(--forge-brand)'
                : validation.ok && (validation.warnings?.length || 0) === 0 ? '#3B8A4A'
                : validation.status === 'ERROR' ? '#C0392B' : 'var(--forge-brand)'}`,
              color: validation.notConfigured ? '#8A4A00'
                : validation.ok && (validation.warnings?.length || 0) === 0 ? '#1E7E34'
                : validation.status === 'ERROR' ? '#C0392B' : '#8A4A00',
            }}>
              {validation.notConfigured ? (
                <span>⚠ SCORM Cloud isn't configured on the server (RUSTICI_APP_ID / RUSTICI_SECRET_KEY).</span>
              ) : validation.status === 'ERROR' ? (
                <span>✕ SCORM Cloud import failed: {validation.message || 'unknown error'}</span>
              ) : (validation.warnings?.length || 0) === 0 ? (
                <span>✓ Imported clean on SCORM Cloud — 0 parser warnings.</span>
              ) : (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    ⚠ Imported with {validation.warnings.length} parser warning{validation.warnings.length === 1 ? '' : 's'}:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 140, overflowY: 'auto' }}>
                    {validation.warnings.map((w, i) => (
                      <li key={i} style={{ marginBottom: 3 }}>{typeof w === 'string' ? w : JSON.stringify(w)}</li>
                    ))}
                  </ul>
                </div>
              )}
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
            {format !== 'web' && (
              <button
                onClick={handleValidate}
                disabled={validating || publishing || !activeProject}
                title="Upload to SCORM Cloud and check for import/parser errors"
                style={{
                  padding: '8px 16px', background: 'transparent',
                  border: '1px solid #185FA5',
                  borderRadius: 4, color: 'var(--color-text-primary)',
                  cursor: validating ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {validating ? 'Validating…' : '☁ Validate'}
              </button>
            )}
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
          </>
          )}
        </div>
      </div>
    </div>
  )
}
