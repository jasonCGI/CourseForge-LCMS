import React from 'react'
import useEditorStore, { isAuxAudio } from '../../store/editorStore'

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
  const setOptional = useEditorStore(s => s.setOptional)
  const deleteFrame = useEditorStore(s => s.deleteFrame)
  const value = frame?.content?.layout || DEFAULT_FRAME_LAYOUT

  const onDelete = () => {
    if (!frame?.id) return
    if (!window.confirm(`Delete frame “${frame.name || 'Untitled'}”? This can't be undone.`)) return
    deleteFrame(frame.id)
  }

  // A split layout (text-left/right) needs a MEDIA zone-filler to fill the other
  // half. Docked audio + callouts are auxiliary (not zone-fillers), so a text-only /
  // aux-only frame can't split — it renders full-width regardless. Disable the split
  // options there so the no-op is obvious instead of confusing. Separately, a
  // full-bleed COVER media gets cropped into the half column on a split — that DOES
  // apply, so it's a soft heads-up, not a block.
  const blocks = frame?.content?.blocks || []
  // A "media zone-filler" matches the RENDERER's split logic (FramePreview
  // buildShelledLayoutHTML): a non-text block that isn't auxiliary. Bar/mini audio
  // (companion players — resolved via isAuxAudio, covering both new
  // placement:'bar'|'mini' and legacy dock:'bottom'), callouts and GUI blocks are
  // aux; an INLINE audio player IS a zone-filler (fills the media half) — which is
  // why the demo Audio Block, set to inline, splits text-left while a bar/mini-audio
  // frame collapses to full. (Note: editorStore.isZoneMedia is stricter — it excludes
  // ALL audio — so don't use it here.)
  const isAuxBlock = (b) => isAuxAudio(b)
    || b.type === 'callout' || b.type === 'gui'
  const hasMediaZone = blocks.some(b => b.type !== 'text' && !isAuxBlock(b))
  const coverMedia = blocks.some(b => b.type !== 'text' && !isAuxBlock(b) && b.data?.fit === 'cover')
  const isSplit = value === 'text-left' || value === 'text-right'
  // Show 'full' as selected when a split can't apply (matches what actually renders).
  const displayValue = hasMediaZone ? value : 'full'

  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor="cf-frame-layout" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5,
        fontSize: 10, fontFamily: 'var(--forge-font)', letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--cf-text-secondary, #7A90A8)' }}>
        <span>▸</span><span>Frame Layout</span>
      </label>
      <select
        id="cf-frame-layout"
        value={displayValue}
        onChange={e => setFrameLayout(e.target.value)}
        aria-label="Frame layout preset"
        style={{ width: '100%', background: 'var(--cf-input-bg)', border: '1px solid var(--cf-border-secondary)',
          borderRadius: 4, padding: '8px 10px', fontSize: 13, color: 'var(--cf-text-primary, #E0E8F0)',
          fontFamily: 'var(--cf-font)', boxSizing: 'border-box' }}>
        {FRAME_LAYOUTS.map(o => (
          <option key={o.value} value={o.value} disabled={o.value !== 'full' && !hasMediaZone}>{o.label}</option>
        ))}
      </select>
      {!hasMediaZone ? (
        <div style={{ fontSize: 9, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)',
          marginTop: 4, letterSpacing: '0.06em' }}>// add a media block (image / video / 3D) to use a split layout — text-only frames render full width</div>
      ) : (coverMedia && isSplit) ? (
        <div style={{ fontSize: 9, color: 'var(--forge-amber)', fontFamily: 'var(--forge-font)',
          marginTop: 4, letterSpacing: '0.06em', lineHeight: 1.5 }}>// heads up: full-screen (cover) media crops into the half column — set its fit to “contain” for a clean fit</div>
      ) : (
        <div style={{ fontSize: 9, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)',
          marginTop: 4, letterSpacing: '0.06em' }}>// reflows the live preview · full-bleed media vs 50/50 split</div>
      )}

      {/* Optional frame — relocated here from the inspector action bar. Wired to
          the same store state (activeFrame.optional / setOptional). */}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={!!frame?.optional}
          onChange={e => setOptional(e.target.checked)}
          aria-label="Mark frame optional"
          style={{ marginTop: 2, flexShrink: 0 }}
        />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, color: frame?.optional ? 'var(--forge-amber)' : 'var(--cf-text-primary, #E0E8F0)',
            fontFamily: 'var(--cf-font)', fontWeight: 500 }}>Optional frame</span>
          <span style={{ fontSize: 9, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)',
            letterSpacing: '0.06em' }}>// excluded from the completion count</span>
        </span>
      </label>

      {/* Delete this frame — quick access from the Frame section (also on the
          left tree's right-click menu). Confirms first; can't be undone. */}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete this frame"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14,
          padding: '7px 12px', background: 'transparent', border: '1px solid #C0392B',
          color: '#E24B4A', borderRadius: 4, cursor: 'pointer', fontSize: 12,
          fontFamily: 'var(--cf-font)', fontWeight: 500 }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(226,75,74,0.12)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <span aria-hidden="true">🗑</span> Delete frame
      </button>
    </div>
  )
}
