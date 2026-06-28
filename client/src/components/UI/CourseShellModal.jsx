import React, { useState, useEffect } from 'react'
import { getGuiShells, uploadGuiShell, deleteGuiShell, updateGuiShell, updateProject, getProject } from '../../api/client'

const amberBg = 'color-mix(in srgb, var(--forge-amber) 14%, transparent)'

/**
 * Course Shell manager — the GUI shell library + per-project selection.
 * The chosen shell skins every frame of the project at publish time.
 */
export default function CourseShellModal({ open, onClose, projectId, currentShellId, onChanged }) {
  const [shells, setShells]   = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState(null)
  // Project-level shelled body-text override ('auto'|'light'|'dark') — middle
  // tier of the cascade. Fetched on open so the footer control reflects it.
  const [projectTextMode, setProjectTextMode] = useState('auto')

  const refresh = () => {
    setLoading(true)
    getGuiShells().then(r => setShells(r.data)).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => {
    if (!open) return
    refresh(); setError(null)
    if (projectId) getProject(projectId).then(r => setProjectTextMode(r.data?.text_mode || 'auto')).catch(() => {})
  }, [open, projectId])

  const setProjectMode = async (mode) => {
    if (!projectId || mode === projectTextMode) return
    setBusy(true)
    try { await updateProject(projectId, { text_mode: mode }); setProjectTextMode(mode); onChanged?.(currentShellId) }
    catch (e) { setError('Could not set body-text mode.') }
    finally { setBusy(false) }
  }

  const setShellMode = async (shellId, mode, e) => {
    e.stopPropagation()
    setBusy(true)
    try {
      await updateGuiShell(shellId, { text_mode: mode })
      setShells(list => list.map(x => x.id === shellId ? { ...x, text_mode: mode } : x))
      onChanged?.(currentShellId)   // re-resolve the preview text color
    } catch (err) { setError('Could not set shell body-text mode.') }
    finally { setBusy(false) }
  }

  const onUpload = async (file) => {
    if (!file) return
    setBusy(true); setError(null)
    try { await uploadGuiShell(file); refresh() }
    catch (e) { setError(e.response?.data?.error || 'Upload failed.') }
    finally { setBusy(false) }
  }

  const select = async (shellId) => {
    if (!projectId) return
    setBusy(true)
    try { await updateProject(projectId, { gui_shell_id: shellId }); onChanged?.(shellId) }
    catch (e) { setError('Could not set shell.') }
    finally { setBusy(false) }
  }

  const remove = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Delete this shell from the library? Projects using it will revert to no shell.')) return
    await deleteGuiShell(id)
    if (id === currentShellId) onChanged?.(null)
    setShells(s => s.filter(x => x.id !== id))
  }

  if (!open) return null
  return (
    <div role="dialog" aria-modal="true" aria-label="Course shell"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(4,44,83,0.75)', zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--cf-block-bg, #0d1017)', border: '1px solid var(--cf-border-secondary, #3a3a5a)',
        borderRadius: 10, width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--cf-border-tertiary)',
          display: 'flex', alignItems: 'center', gap: 12, background: 'var(--cf-input-bg, #060810)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--forge-font)', fontSize: 12, fontWeight: 600,
            color: 'var(--cf-text-primary)', letterSpacing: '0.04em', flex: 1 }}>Course shell</span>
          <label style={{ padding: '4px 12px', background: 'transparent',
            border: '1px solid var(--cf-border-secondary)', borderRadius: 4, color: 'var(--cf-text-secondary)',
            fontSize: 11, cursor: 'pointer', fontFamily: 'var(--cf-font)' }}>
            {busy ? '…' : '+ Upload shell'}
            <input type="file" accept=".zip,application/zip" style={{ display: 'none' }}
              onChange={e => onUpload(e.target.files[0])} />
          </label>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none',
            color: 'var(--cf-text-tertiary)', fontSize: 16, cursor: 'pointer', padding: '2px 4px' }}>✕</button>
        </div>

        <div style={{ padding: '8px 18px', fontFamily: 'var(--forge-font)', fontSize: 10,
          color: 'var(--cf-text-tertiary)', borderBottom: '1px solid var(--cf-border-tertiary)', lineHeight: 1.6 }}>
          // the selected shell skins EVERY frame of this project at publish (SCORM 1.2)<br/>
          // per-frame GUI Shell blocks still override for individual frames
        </div>

        {error && <div style={{ padding: '8px 18px', color: '#E87070', fontSize: 12 }}>{error}</div>}

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* No shell option */}
          <button onClick={() => select(null)} style={shellRow(!currentShellId)}>
            <span style={{ fontSize: 18 }}>∅</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cf-text-primary)' }}>No shell</div>
              <div style={{ fontSize: 10, color: 'var(--cf-text-tertiary)' }}>Standard CourseForge frames</div>
            </div>
            {!currentShellId && <span style={{ color: 'var(--forge-amber)', fontSize: 12 }}>● selected</span>}
          </button>

          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--cf-text-tertiary)', fontSize: 12, padding: 20 }}>Loading…</div>
          ) : shells.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--cf-text-tertiary)', fontSize: 12, padding: 20 }}>
              No shells in the library — upload a ForgeGUI ZIP.
            </div>
          ) : shells.map(s => {
            const sel = s.id === currentShellId
            return (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => select(s.id)} style={shellRow(sel)}>
                  <span style={{ fontSize: 18 }}>▣</span>
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cf-text-primary)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)' }}>
                      {s.stage_width}×{s.stage_height}px · {s.button_count} btn · {s.zone_count} zone
                    </div>
                  </div>
                  {sel && <span style={{ color: 'var(--forge-amber)', fontSize: 12 }}>● selected</span>}
                  <span role="button" tabIndex={0} aria-label={`Delete shell ${s.name}`}
                    onClick={(e) => remove(s.id, e)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); remove(s.id, e) } }}
                    style={{ color: '#E87070', fontSize: 12, cursor: 'pointer', padding: '2px 4px', opacity: 0.6 }}>✕</span>
                </button>
                {sel && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 2px' }}>
                    <span style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)' }}>
                      this shell's body text
                    </span>
                    <TextModeButtons value={s.text_mode || 'auto'} disabled={busy}
                      onPick={(m, e) => setShellMode(s.id, m, e)} ariaLabel={`Body text color for ${s.name}`} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--cf-border-tertiary)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)', flex: 1 }}>
            // project body text — auto reads the content bg; light/dark force it
          </span>
          <TextModeButtons value={projectTextMode} disabled={busy}
            onPick={(m, e) => { e.stopPropagation(); setProjectMode(m) }} ariaLabel="Project body text color" />
        </div>
      </div>
    </div>
  )
}

// Auto / Light / Dark segmented control for a shelled body-text override.
function TextModeButtons({ value, onPick, disabled, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'flex', gap: 4 }}>
      {['auto', 'light', 'dark'].map(mode => {
        const on = value === mode
        return (
          <button key={mode} type="button" role="radio" aria-checked={on} disabled={disabled}
            onClick={(e) => onPick(mode, e)}
            style={{
              padding: '3px 10px', fontSize: 10, textTransform: 'capitalize', cursor: 'pointer',
              borderRadius: 4, fontFamily: 'var(--cf-font)',
              border: `1px solid ${on ? 'var(--forge-amber)' : 'var(--cf-border-secondary)'}`,
              background: on ? 'var(--forge-amber)' : 'transparent',
              color: on ? '#0d1117' : 'var(--cf-text-secondary)', fontWeight: on ? 600 : 400,
            }}>{mode}</button>
        )
      })}
    </div>
  )
}

function shellRow(selected) {
  return {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
    background: selected ? amberBg : 'var(--cf-input-bg, #060810)',
    border: `1px solid ${selected ? 'var(--forge-amber)' : 'var(--cf-border-secondary)'}`,
    borderRadius: 6, cursor: 'pointer', width: '100%', fontFamily: 'var(--cf-font)',
  }
}
