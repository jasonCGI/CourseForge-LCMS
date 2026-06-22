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
          // FIXED light value — the bar background is a fixed navy in every mode,
          // so a mode-reactive token (--color-text-primary) flips dark and the
          // name becomes invisible. #EAF1F8 = 12.37:1 on #042C53 (AA pass).
          color: '#EAF1F8',
          fontFamily: 'var(--font-sans)',
        }}
      />

      {/* Optional toggle — excluded from completion count */}
      <label title="Optional frames are excluded from the completion count"
        style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          fontSize: 11, color: activeFrame.optional ? 'var(--forge-amber)' : '#9FB4C9',
          cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
        <input type="checkbox" checked={!!activeFrame.optional}
          onChange={e => setOptional(e.target.checked)} aria-label="Mark frame optional" />
        Optional
      </label>

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

      {/* Preview button — opens the real frame render directly. */}
      <button
        onClick={() => window.open(`/api/frames/${activeFrame.id}/preview-html`, '_blank', 'noopener')}
        title="Open the live frame render in a new tab"
        style={{
          padding: '5px 12px',
          background: 'transparent',
          // Fixed light text/border — the bar is fixed navy in all modes.
          // #C8D8E8 text = 9.69:1; #758BA0 border = 4.00:1 (UI ≥3:1 pass).
          color: '#C8D8E8',
          border: '1px solid #758BA0',
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
