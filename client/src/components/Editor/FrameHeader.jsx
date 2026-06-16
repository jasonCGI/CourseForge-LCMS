import React from 'react'
import useEditorStore from '../../store/editorStore'
import useProjectStore from '../../store/projectStore'

const FRAME_TYPE_COLOR = {
  content:    { bg: '#0C447C', text: '#B5D4F4' },
  assessment: { bg: '#633806', text: '#FAC775' },
  branch:     { bg: '#3C3489', text: '#CECBF6' },
}

export default function FrameHeader({ onPreview }) {
  const { activeFrame, isDirty, isSaving, lastSaved, save, updateFrameName } = useEditorStore()
  const activeProject = useProjectStore(s => s.activeProject)

  if (!activeFrame) return null

  const tc = FRAME_TYPE_COLOR[activeFrame.frame_type] || FRAME_TYPE_COLOR.content

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

      {/* Frame type badge */}
      <span style={{
        padding: '3px 10px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.08em',
        background: tc.bg,
        color: tc.text,
        textTransform: 'uppercase',
        flexShrink: 0,
      }}>
        {activeFrame.frame_type}
      </span>

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

      {/* Preview button */}
      <button
        onClick={onPreview}
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
