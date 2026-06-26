import React from 'react'
import useEditorStore from '../../store/editorStore'
import FrameEditor from './FrameEditor'
import TabbedFrameEditor from './TabbedFrameEditor'
import FrameHeader from './FrameHeader'

/**
 * InspectorPane — wraps the bottom authoring pane in the selected display mode.
 *
 * 'stack' is the existing FrameEditor (all blocks in a scroll list). 'tabs' is
 * the prototype TabbedFrameEditor (one tab per block + a Frame tab, drag to
 * reorder). The mode lives in the store (persisted), driven by the stable ⚙ View
 * popover in the sidebar — relocated there from this (moving) bar so re-docking
 * the inspector no longer chases the control out from under the pointer.
 *
 * FrameHeader (frame name + save status + Save) is hoisted here as a persistent
 * action bar so those high-frequency controls stay reachable in both modes.
 */
export default function InspectorPane() {
  const mode = useEditorStore(s => s.inspectorMode)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <FrameHeader />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {mode === 'tabs' ? <TabbedFrameEditor /> : <FrameEditor />}
      </div>
    </div>
  )
}
