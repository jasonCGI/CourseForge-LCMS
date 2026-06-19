import React from 'react'
import useEditorStore from '../../store/editorStore'
import useProjectStore from '../../store/projectStore'

export default function FrameHeader({ onPreview }) {
  const { activeFrame, isDirty, isSaving, lastSaved, save, updateFrameName, setOptional } = useEditorStore()
  const activeProject = useProjectStore(s => s.activeProject)

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
      padding: '12px 20px',
      borderBottom: '1px solid var(--color-border-tertiary)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: 'var(--color-background-secondary)',
    }}>
      {/* Frame name — inline editable */}
      <input
        value={activeFrame.name}
        onChange={e => updateFrameName(e.target.value)}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: 18,
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-sans)',
        }}
      />

      {/* Optional toggle — excluded from completion count */}
      <label title="Optional frames are excluded from the completion count"
        style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          fontSize: 11, color: activeFrame.optional ? 'var(--forge-amber)' : 'var(--color-text-secondary)',
          cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
        <input type="checkbox" checked={!!activeFrame.optional}
          onChange={e => setOptional(e.target.checked)} aria-label="Mark frame optional" />
        Optional
      </label>

      {/* Save status */}
      <span style={{
        fontSize: 12,
        color: isDirty ? 'var(--forge-amber)' : 'var(--color-text-secondary)',
        flexShrink: 0,
        minWidth: 120,
        textAlign: 'right',
      }}>
        {savedLabel}
      </span>

      {/* Preview button — opens the real frame render directly (the in-app live
          preview already shows the approximation, so no intermediate modal). */}
      <button
        onClick={() => window.open(`/api/frames/${activeFrame.id}/preview-html`, '_blank', 'noopener')}
        title="Open the live frame render in a new tab"
        style={{
          padding: '6px 14px',
          background: 'transparent',
          color: 'var(--color-text-secondary)',
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
          padding: '6px 14px',
          background: isDirty ? '#185FA5' : 'transparent',
          color: isDirty ? '#fff' : 'var(--color-text-secondary)',
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
    </div>
  )
}
