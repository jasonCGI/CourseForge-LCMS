import React, { useState, useEffect } from 'react'
import TokenEditor from './TokenEditor'
import { getThemes, createTheme, updateTheme, deleteTheme, assignTheme } from '../../api/client'
import useProjectStore from '../../store/projectStore'

const DEFAULT_TOKENS = {
  primary_color:       '#185FA5',
  secondary_color:     '#042C53',
  accent_color:        '#D4820A',  /* forge brand (light) — concrete hex: persisted + baked into published output */
  text_color:          '#1a1a1a',
  bg_color:            '#ffffff',
  bg_secondary:        '#F0F4F8',
  font_family:         'Inter, system-ui, sans-serif',
  font_size_base:      '16px',
  frame_layout:        'top-nav',
  button_style:        'rounded',
  progress_indicator:  'bar',
  border_radius:       '6px',
  nav_bg:              '#042C53',
  nav_text:            '#B5D4F4',
}

export default function ThemeEditorModal({ onClose }) {
  const activeProject = useProjectStore(s => s.activeProject)
  const [themes,   setThemes]   = useState([])
  const [selected, setSelected] = useState(null)
  const [tokens,   setTokens]   = useState({})
  const [name,     setName]     = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)
  const [tab,      setTab]      = useState('library')

  useEffect(() => {
    getThemes().then(r => setThemes(r.data)).catch(() => {})
  }, [])

  const selectTheme = (theme) => {
    setSelected(theme)
    setTokens({ ...DEFAULT_TOKENS, ...theme.token_overrides })
    setName(theme.name)
    setTab('editor')
  }

  const handleNewTheme = () => {
    setSelected(null)
    setTokens({ ...DEFAULT_TOKENS })
    setName('New Theme')
    setTab('editor')
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (selected && !selected.is_global) {
        const { data } = await updateTheme(selected.id, { name, token_overrides: tokens })
        setThemes(prev => prev.map(t => t.id === data.id ? data : t))
        setSelected(data)
      } else {
        const { data } = await createTheme({ name, token_overrides: tokens })
        setThemes(prev => [...prev, data])
        setSelected(data)
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected || selected.is_global) return
    if (!window.confirm(`Delete theme "${selected.name}"?`)) return
    await deleteTheme(selected.id)
    setThemes(prev => prev.filter(t => t.id !== selected.id))
    setSelected(null)
    setTab('library')
  }

  const handleAssign = async (themeId) => {
    if (!activeProject) return
    await assignTheme(activeProject.id, { theme_id: themeId, theme_overrides: {} })
  }

  return (
    <div
      onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Theme editor"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--cf-panel-bg)',
          border: '1px solid var(--cf-border-primary)',
          borderRadius: 10, width: '100%', maxWidth: 780,
          maxHeight: '88vh', display: 'flex',
          flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 20px', background: 'var(--cf-header-bg)',
          borderBottom: '2px solid var(--cf-header-border)',
          display: 'flex', alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, color: 'var(--cf-logo-course)', fontWeight: 500, flex: 1 }}>
            Theme Editor
          </span>
          <button onClick={onClose} aria-label="Close theme editor" style={closeBtnStyle}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--cf-border-primary)',
          background: 'var(--cf-sidebar-bg)',
        }}>
          {[
            { id: 'library', label: 'Theme Library' },
            { id: 'editor',  label: 'Edit Theme' },
            { id: 'project', label: 'Project Assignment' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-selected={tab === t.id}
              style={{
                padding: '10px 20px', border: 'none',
                background: 'transparent',
                color: tab === t.id ? 'var(--cf-accent)' : 'var(--cf-text-secondary)',
                fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
                cursor: 'pointer', fontFamily: 'var(--cf-font)',
                borderBottom: tab === t.id ? '2px solid var(--cf-accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ── Library tab ── */}
          {tab === 'library' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                <button onClick={handleNewTheme} style={primaryBtnStyle}>
                  + New Theme
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {themes.map(theme => (
                  <div
                    key={theme.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px',
                      background: 'var(--cf-input-bg)',
                      border: '1px solid var(--cf-border-secondary)',
                      borderRadius: 6,
                    }}
                  >
                    {/* Color swatches */}
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      {['primary_color','accent_color','bg_color'].map(k => (
                        <div key={k} style={{
                          width: 14, height: 14, borderRadius: 3,
                          background: theme.token_overrides?.[k] || DEFAULT_TOKENS[k],
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}/>
                      ))}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cf-text-primary)' }}>
                        {theme.name}
                        {theme.is_global && (
                          <span style={{
                            marginLeft: 8, fontSize: 9, fontWeight: 700,
                            padding: '1px 6px', borderRadius: 3,
                            background: 'var(--cf-accent-dim)',
                            color: 'var(--cf-accent)',
                            textTransform: 'uppercase', letterSpacing: '0.08em',
                          }}>Global default</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      {!theme.is_global && (
                        <button onClick={() => selectTheme(theme)} style={secondaryBtnStyle}>
                          Edit
                        </button>
                      )}
                      {activeProject && (
                        <button onClick={() => handleAssign(theme.id)} style={primaryBtnStyle}>
                          Assign to project
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Editor tab ── */}
          {tab === 'editor' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Theme name"
                  aria-label="Theme name"
                  style={{ ...inputStyle, fontSize: 16, fontWeight: 500, flex: 1 }}
                />
                <button onClick={handleSave} disabled={saving} style={primaryBtnStyle}>
                  {saving ? 'Saving…' : 'Save Theme'}
                </button>
                {selected && !selected.is_global && (
                  <button onClick={handleDelete} style={dangerBtnStyle}>Delete</button>
                )}
              </div>

              {error && (
                <div style={{
                  padding: '8px 12px', background: 'rgba(194,57,52,0.1)',
                  border: '1px solid rgba(194,57,52,0.4)', borderRadius: 4,
                  fontSize: 12, color: '#E87070', marginBottom: 12,
                }} role="alert">{error}</div>
              )}

              <TokenEditor tokens={tokens} onChange={setTokens} />
            </div>
          )}

          {/* ── Project assignment tab ── */}
          {tab === 'project' && (
            <div>
              {!activeProject ? (
                <p style={{ color: 'var(--cf-text-secondary)', fontSize: 13 }}>
                  Select a project first to assign a theme.
                </p>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--cf-text-secondary)', marginBottom: 16 }}>
                    Assigning a theme to <strong style={{ color: 'var(--cf-text-primary)' }}>
                    {activeProject.name}</strong> overrides the global default for all published output from this project.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {themes.map(theme => (
                      <div key={theme.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px',
                        background: activeProject.theme_id === theme.id
                          ? 'var(--cf-accent-dim)'
                          : 'var(--cf-input-bg)',
                        border: `1px solid ${activeProject.theme_id === theme.id
                          ? 'var(--cf-accent)'
                          : 'var(--cf-border-secondary)'}`,
                        borderRadius: 6,
                      }}>
                        <div style={{ flex: 1, fontSize: 13, color: 'var(--cf-text-primary)' }}>
                          {theme.name}
                          {theme.is_global && (
                            <span style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', marginLeft: 8 }}>
                              (system default)
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleAssign(theme.id)}
                          style={activeProject.theme_id === theme.id ? activeBtnStyle : secondaryBtnStyle}
                        >
                          {activeProject.theme_id === theme.id ? '✓ Assigned' : 'Assign'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  background: 'var(--cf-input-bg)', border: '1px solid var(--cf-input-border)',
  borderRadius: 4, padding: '7px 10px', fontSize: 13,
  color: 'var(--cf-input-text)', fontFamily: 'var(--cf-font)', boxSizing: 'border-box',
}
const primaryBtnStyle = {
  padding: '7px 14px', background: 'var(--cf-level-project-tab, #185FA5)',
  color: '#fff', border: 'none', borderRadius: 4, fontSize: 12,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--cf-font)', flexShrink: 0,
}
const secondaryBtnStyle = {
  padding: '7px 14px', background: 'transparent',
  color: 'var(--cf-text-secondary)',
  border: '1px solid var(--cf-border-secondary)',
  borderRadius: 4, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--cf-font)',
}
const activeBtnStyle = {
  ...secondaryBtnStyle,
  color: 'var(--cf-accent)', borderColor: 'var(--cf-accent)',
}
const dangerBtnStyle = {
  padding: '7px 14px', background: 'transparent', color: '#E87070',
  border: '1px solid rgba(194,57,52,0.4)', borderRadius: 4,
  fontSize: 12, cursor: 'pointer', fontFamily: 'var(--cf-font)',
}
const closeBtnStyle = {
  background: 'none', border: 'none', color: 'var(--cf-text-secondary)',
  fontSize: 18, cursor: 'pointer', padding: 4,
}
