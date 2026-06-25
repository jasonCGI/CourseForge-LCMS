import React from 'react'
import useEditorStore from '../../store/editorStore'

/**
 * FrameLayout — per-frame layout preset that drives how the live preview (and the
 * published SCO) reflows the frame's flow blocks. Lives in the Frame section next
 * to the prompt/notes. Writes to content.layout via the store so the preview
 * reflows as you change it, riding the existing content autosave (no schema change).
 *
 *   full        single column. Media fills edge-to-edge; text gets 40px padding.
 *   text-left   50/50 split — text on the left, media on the right (both 40px pad).
 *   text-right  50/50 split — text on the right, media on the left (both 40px pad).
 *
 * Keep the values in sync with FramePreview.jsx and scorm12._render_blocks.
 */
export const FRAME_LAYOUTS = [
  { value: 'full',       label: 'Full screen — media fills, text padded' },
  { value: 'text-left',  label: 'Half — text left, media right' },
  { value: 'text-right', label: 'Half — text right, media left' },
]
export const DEFAULT_FRAME_LAYOUT = 'text-left'

export default function FrameLayout({ frame }) {
  const setFrameLayout = useEditorStore(s => s.setFrameLayout)
  const value = frame?.content?.layout || DEFAULT_FRAME_LAYOUT

  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor="cf-frame-layout" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5,
        fontSize: 10, fontFamily: 'var(--forge-font)', letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--cf-text-secondary, #7A90A8)' }}>
        <span>▸</span><span>Frame Layout</span>
      </label>
      <select
        id="cf-frame-layout"
        value={value}
        onChange={e => setFrameLayout(e.target.value)}
        aria-label="Frame layout preset"
        style={{ width: '100%', background: 'var(--cf-input-bg)', border: '1px solid var(--cf-border-secondary)',
          borderRadius: 4, padding: '8px 10px', fontSize: 13, color: 'var(--cf-text-primary, #E0E8F0)',
          fontFamily: 'var(--cf-font)', boxSizing: 'border-box' }}>
        {FRAME_LAYOUTS.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
      <div style={{ fontSize: 9, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)',
        marginTop: 4, letterSpacing: '0.06em' }}>// reflows the live preview · full-bleed media vs 50/50 split</div>
    </div>
  )
}
