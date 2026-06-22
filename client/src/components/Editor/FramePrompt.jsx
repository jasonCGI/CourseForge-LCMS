import React from 'react'
import useEditorStore from '../../store/editorStore'

/**
 * FramePrompt — the per-frame prompt that drives the GUI shell's prompt zone
 * (the line along the footer bar). Lives in the Frame section. Empty = inherit
 * the frame title, so the placeholder shows what the learner would see by
 * default. Writes to content.prompt via the store so the live preview updates
 * as you type and it rides the existing content autosave.
 */
export default function FramePrompt({ frame }) {
  const setFramePrompt = useEditorStore(s => s.setFramePrompt)
  const value = frame?.content?.prompt || ''
  const inherited = frame?.name || ''

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5,
        fontSize: 10, fontFamily: 'var(--forge-font)', letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--cf-text-secondary, #7A90A8)' }}>
        <span>▸</span><span>Prompt</span>
        {!value && inherited && (
          <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--cf-text-tertiary)',
            fontSize: 10 }}>· inheriting frame title</span>
        )}
      </label>
      <input
        value={value}
        onChange={e => setFramePrompt(e.target.value)}
        aria-label="Frame prompt (shown in the GUI shell prompt zone)"
        placeholder={inherited ? `${inherited}  (frame title)` : 'Prompt shown in the shell footer…'}
        style={{ width: '100%', background: 'var(--cf-input-bg)', border: '1px solid var(--cf-border-secondary)',
          borderRadius: 4, padding: '8px 10px', fontSize: 13, color: 'var(--cf-text-primary, #E0E8F0)',
          fontFamily: 'var(--cf-font)', boxSizing: 'border-box' }} />
      <div style={{ fontSize: 9, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)',
        marginTop: 4, letterSpacing: '0.06em' }}>// drives the shell prompt zone · leave empty to use the frame title</div>
    </div>
  )
}
