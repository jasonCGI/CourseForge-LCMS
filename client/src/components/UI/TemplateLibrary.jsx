import React, { useState, useEffect } from 'react'
import { getTemplates, saveTemplate, deleteTemplate } from '../../api/client'

const TAGS = ['all', 'content', 'assessment', 'safety', 'advanced', 'blank']
const amberBg = 'color-mix(in srgb, var(--forge-amber) 12%, transparent)'

export default function TemplateLibrary({ open, onClose, onSelect, currentFrameBlocks, currentFrameType }) {
  const [templates, setTemplates] = useState([])
  const [activeTag, setActiveTag] = useState('all')
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saveName,  setSaveName]  = useState('')
  const [saveDesc,  setSaveDesc]  = useState('')
  const [showSave,  setShowSave]  = useState(false)

  const refresh = () => {
    setLoading(true)
    getTemplates(activeTag === 'all' ? null : activeTag)
      .then(r => setTemplates(r.data)).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { if (open) refresh() }, [open, activeTag])

  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    try {
      await saveTemplate({
        name: saveName.trim(), description: saveDesc.trim(),
        frame_type: currentFrameType || 'content',
        content: { blocks: currentFrameBlocks || [] }, icon: '📄', tags: [],
      })
      setShowSave(false); setSaveName(''); setSaveDesc(''); refresh()
    } catch (e) { alert('Save failed.') } finally { setSaving(false) }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Delete this template?')) return
    await deleteTemplate(id)
    setTemplates(t => t.filter(x => x.id !== id))
  }

  if (!open) return null

  return (
    <div role="dialog" aria-modal="true" aria-label="Frame template library"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(4,44,83,0.75)', zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        background: 'var(--cf-block-bg, #0d1017)', border: '1px solid var(--cf-border-secondary, #3a3a5a)',
        borderRadius: 10, width: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--cf-border-tertiary)',
          display: 'flex', alignItems: 'center', gap: 12, background: 'var(--cf-input-bg, #060810)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--forge-font)', fontSize: 12, fontWeight: 600,
            color: 'var(--cf-text-primary)', letterSpacing: '0.04em', flex: 1 }}>Frame templates</span>
          {currentFrameBlocks?.length > 0 && (
            <button onClick={() => setShowSave(s => !s)} style={{
              padding: '4px 12px', background: showSave ? amberBg : 'transparent',
              border: `1px solid ${showSave ? 'var(--forge-amber)' : 'var(--cf-border-secondary)'}`,
              borderRadius: 4, color: showSave ? 'var(--forge-amber)' : 'var(--cf-text-secondary)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'var(--cf-font)' }}>
              {showSave ? '✕ Cancel' : '+ Save current frame'}
            </button>
          )}
          <button onClick={onClose} aria-label="Close template library" style={{
            background: 'none', border: 'none', color: 'var(--cf-text-tertiary)', fontSize: 16,
            cursor: 'pointer', padding: '2px 4px' }}>✕</button>
        </div>

        {/* Save form */}
        {showSave && (
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--cf-border-tertiary)', background: amberBg }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Template name *" autoFocus
                style={{ flex: 1, background: 'var(--cf-input-bg)', border: '1px solid var(--cf-input-border, #3a3a5a)',
                  borderRadius: 4, padding: '7px 10px', fontSize: 13, color: 'var(--cf-input-text, #e6e6ea)', fontFamily: 'var(--cf-font)' }}
                aria-label="Template name" />
              <button onClick={handleSave} disabled={!saveName.trim() || saving} style={{
                padding: '7px 16px', background: saveName.trim() ? 'var(--forge-amber)' : '#888',
                color: saveName.trim() ? '#042C53' : '#ccc', border: 'none', borderRadius: 4,
                fontSize: 12, fontWeight: 600, cursor: saveName.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--cf-font)' }}>
                {saving ? 'Saving…' : '✓ Save'}
              </button>
            </div>
            <input value={saveDesc} onChange={e => setSaveDesc(e.target.value)} placeholder="Description (optional)"
              style={{ width: '100%', background: 'var(--cf-input-bg)', border: '1px solid var(--cf-input-border, #3a3a5a)',
                borderRadius: 4, padding: '6px 10px', fontSize: 12, color: 'var(--cf-input-text, #e6e6ea)', fontFamily: 'var(--cf-font)' }}
              aria-label="Template description" />
          </div>
        )}

        {/* Tag filter */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 18px', borderBottom: '1px solid var(--cf-border-tertiary)',
          flexShrink: 0, overflowX: 'auto' }}>
          {TAGS.map(tag => (
            <button key={tag} onClick={() => setActiveTag(tag)} style={{
              padding: '3px 10px', background: activeTag === tag ? amberBg : 'transparent',
              border: `1px solid ${activeTag === tag ? 'var(--forge-amber)' : 'var(--cf-border-secondary)'}`,
              borderRadius: 20, color: activeTag === tag ? 'var(--forge-amber)' : 'var(--cf-text-tertiary)',
              fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--forge-font)',
              letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>{tag}</button>
          ))}
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, alignContent: 'start' }}>
          {loading ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--cf-text-tertiary)', fontSize: 12, padding: 32 }}>Loading…</div>
          ) : templates.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--cf-text-tertiary)', fontSize: 12, padding: 32 }}>No templates found</div>
          ) : templates.map(t => (
            <div key={t.id} onClick={() => { onSelect(t); onClose() }} role="button" tabIndex={0}
              aria-label={`Use template: ${t.name}`}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(t); onClose() } }}
              style={{ padding: '14px 14px 12px', background: 'var(--cf-input-bg, #060810)',
                border: '1px solid var(--cf-border-secondary)', borderRadius: 8, cursor: 'pointer',
                transition: 'border-color 0.12s, background 0.12s', position: 'relative' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--forge-amber)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cf-border-secondary)' }}>
              {!t.is_builtin && (
                <button onClick={(e) => handleDelete(t.id, e)} aria-label={`Delete template ${t.name}`}
                  style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none',
                    color: '#E87070', fontSize: 11, cursor: 'pointer', padding: '2px 4px', opacity: 0.6 }}>✕</button>
              )}
              <div style={{ fontSize: 28, marginBottom: 8, lineHeight: 1 }}>{t.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cf-text-primary)', marginBottom: 4 }}>{t.name}</div>
              <div style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', lineHeight: 1.4, marginBottom: 8 }}>{t.description}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--forge-font)', fontSize: 8, fontWeight: 600, padding: '1px 6px',
                  borderRadius: 3, background: 'var(--cf-block-bg)', color: 'var(--cf-text-tertiary)',
                  textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.frame_type}</span>
                <span style={{ fontFamily: 'var(--forge-font)', fontSize: 8, color: 'var(--cf-text-tertiary)', padding: '1px 4px' }}>
                  {t.content?.blocks?.length || 0} block{(t.content?.blocks?.length || 0) !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
