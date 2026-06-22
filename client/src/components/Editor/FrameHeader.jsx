import React from 'react'
import useEditorStore from '../../store/editorStore'

/**
 * FrameHeader — the persistent inspector action bar.
 *
 * Frame name, Optional toggle, save status, Preview, and Save live here so they
 * stay reachable no matter which block tab is open (in Tabs mode they used to be
 * buried inside the Frame tab). Rendered once at the top of InspectorPane; the
 * `right` slot holds the Stack/Tabs layout toggle. The Frame tab/section is now
 * reserved for notes + layout/CSS.
 */
export default function FrameHeader({ right = null }) {
  const { activeFrame, isDirty, isSaving, lastSaved, save, updateFrameName, setOptional } = useEditorStore()

  if (!activeFrame) return null

  const savedLabel = isSaving
    ? 'Saving…'
    : isDirty
      ? 'Unsaved changes'
      : lastSaved
        ? `Saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : ''

  return (
    <div style={{
      padding: '7px 12px',
      borderBottom: '1px solid var(--cf-border-primary)',
      background: 'var(--cf-header-bg, #042C53)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
    }}>
      {/* Frame name — inline editable */}
      <input
        value={activeFrame.name}
        onChange={e => updateFrameName(e.target.value)}
        aria-label="Frame name"
        style={{
          flex: 1,
          minWidth: 80,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-sans)',
        }}
      />

      {/* Optional toggle — excluded from completion count */}
      <label title="Optional frames are excluded from the completion count"
        style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          fontSize: 11, color: activeFrame.optional ? 'var(--forge-amber)' : 'var(--cf-text-secondary, #7A90A8)',
          cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
        <input type="checkbox" checked={!!activeFrame.optional}
          onChange={e => setOptional(e.target.checked)} aria-label="Mark frame optional" />
        Optional
      </label>

      {/* Save status */}
      <span style={{
        fontSize: 11,
        color: isDirty ? 'var(--forge-amber)' : 'var(--cf-text-secondary, #7A90A8)',
        flexShrink: 0,
        minWidth: 96,
        textAlign: 'right',
      }}>
        {savedLabel}
      </span>

      {/* Preview button — opens the real frame render directly. */}
      <button
        onClick={() => window.open(`/api/frames/${activeFrame.id}/preview-html`, '_blank', 'noopener')}
        title="Open the live frame render in a new tab"
        style={{
          padding: '5px 12px',
          background: 'transparent',
          color: 'var(--cf-text-secondary, #C8D8E8)',
          border: '1px solid var(--color-border-secondary)',
          borderRadius: 4,
          fontSize: 12,
          cursor: 'pointer',
          flexShrink: 0,
          fontFamily: 'var(--font-sans)',
        }}
      >
        ▶ Preview
      </button>

      {/* Manual save button */}
      <button
        onClick={save}
        aria-label={isSaving ? 'Saving frame' : isDirty ? 'Save frame' : 'Frame saved'}
        disabled={!isDirty || isSaving}
        style={{
          padding: '5px 14px',
          background: isDirty ? '#185FA5' : 'transparent',
          color: isDirty ? '#fff' : 'var(--cf-text-secondary, #C8D8E8)',
          border: '1px solid var(--color-border-secondary)',
          borderRadius: 4,
          fontSize: 12,
          cursor: isDirty ? 'pointer' : 'default',
          flexShrink: 0,
          fontFamily: 'var(--font-sans)',
        }}
      >
        Save
      </button>

      {/* Right slot — the Stack/Tabs layout toggle */}
      {right && (
        <>
          <span style={{ width: 1, height: 18, background: 'var(--cf-border-primary)', flexShrink: 0 }} />
          {right}
        </>
      )}
    </div>
  )
}
