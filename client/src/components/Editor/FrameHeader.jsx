import React from 'react'
import useEditorStore from '../../store/editorStore'

/**
 * FrameHeader — the persistent inspector action bar.
 *
 * Slimmed to just the high-frequency essentials: the frame-name input (which now
 * gets the room it needs), the save-status text, and the Save button. The view/
 * dock controls moved to the stable ⚙ View popover in the sidebar (they used to
 * live here and chased the inspector when you re-docked it); the Optional toggle
 * moved into the Frame settings section; and the popup Preview button was
 * replaced by the in-pane Edit ⇄ Published toggle in the preview header.
 */
export default function FrameHeader() {
  const { activeFrame, isDirty, isSaving, lastSaved, save, updateFrameName } = useEditorStore()

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
          // FIXED light value — the bar background is a fixed navy in every mode,
          // so a mode-reactive token (--color-text-primary) flips dark and the
          // name becomes invisible. #EAF1F8 = 12.37:1 on #042C53 (AA pass).
          color: '#EAF1F8',
          fontFamily: 'var(--font-sans)',
        }}
      />

      {/* Save status */}
      <span style={{
        fontSize: 11,
        color: isDirty ? 'var(--forge-amber)' : '#9FB4C9',
        flexShrink: 0,
        minWidth: 96,
        textAlign: 'right',
      }}>
        {savedLabel}
      </span>

      {/* Manual save button */}
      <button
        onClick={save}
        aria-label={isSaving ? 'Saving frame' : isDirty ? 'Save frame' : 'Frame saved'}
        disabled={!isDirty || isSaving}
        style={{
          padding: '5px 14px',
          background: isDirty ? '#185FA5' : 'transparent',
          // Fixed light text/border (bar is fixed navy). #fff on #185FA5 = 6.51:1;
          // idle #C8D8E8 on navy = 9.69:1; #758BA0 border = 4.00:1.
          color: isDirty ? '#fff' : '#C8D8E8',
          border: '1px solid #758BA0',
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
