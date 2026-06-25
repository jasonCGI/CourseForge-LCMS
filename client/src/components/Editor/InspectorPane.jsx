import React, { useState } from 'react'
import useEditorStore from '../../store/editorStore'
import FrameEditor from './FrameEditor'
import TabbedFrameEditor from './TabbedFrameEditor'
import FrameHeader from './FrameHeader'

/**
 * InspectorPane — wraps the bottom authoring pane with a Stack/Tabs toggle.
 *
 * 'stack' is the existing FrameEditor (all blocks in a scroll list). 'tabs' is
 * the prototype TabbedFrameEditor (one tab per block + a Frame tab, drag to
 * reorder). The toggle is persisted so a creator's choice sticks. Kept behind
 * the toggle so the current editor stays fully intact.
 *
 * FrameHeader (frame name + Optional + Preview + Save) is hoisted here as a
 * persistent action bar so those high-frequency controls stay reachable in both
 * modes — in Tabs mode they used to be buried inside the Frame tab.
 */
export default function InspectorPane() {
  const activeFrame = useEditorStore(s => s.activeFrame)
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('cf-inspector-mode') || 'stack' } catch { return 'stack' }
  })
  const choose = (m) => { setMode(m); try { localStorage.setItem('cf-inspector-mode', m) } catch {} }

  // Inspector dock orientation — resolved from the store (per-frame override
  // else global default). Toggling sets the current frame AND the global default.
  const dockDefault = useEditorStore(s => s.inspectorDockDefault)
  const dockByFrame = useEditorStore(s => s.inspectorDockByFrame)
  const setInspectorDock = useEditorStore(s => s.setInspectorDock)
  const dock = (activeFrame && dockByFrame[activeFrame.id]) || dockDefault

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <FrameHeader right={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div role="group" aria-label="Inspector layout" style={{ display: 'flex', gap: 2 }}>
            <SegBtn active={mode === 'stack'} onClick={() => choose('stack')} title="All blocks in a list">≡ Stack</SegBtn>
            <SegBtn active={mode === 'tabs'} onClick={() => choose('tabs')} title="One tab per block (prototype)">⊞ Tabs</SegBtn>
          </div>
          <div role="group" aria-label="Inspector dock position" style={{ display: 'flex', gap: 2 }}>
            <SegBtn active={dock === 'left'} onClick={() => setInspectorDock('left')}
              title="Dock the block editor to the left of the preview">▯ Left</SegBtn>
            <SegBtn active={dock === 'right'} onClick={() => setInspectorDock('right')}
              title="Dock the block editor to the right of the preview">▯ Right</SegBtn>
            <SegBtn active={dock === 'top'} onClick={() => setInspectorDock('top')}
              title="Dock the block editor above the preview">▭ Top</SegBtn>
            <SegBtn active={dock === 'bottom'} onClick={() => setInspectorDock('bottom')}
              title="Dock the block editor below the preview">▭ Bottom</SegBtn>
          </div>
        </div>
      } />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {mode === 'tabs' ? <TabbedFrameEditor /> : <FrameEditor />}
      </div>
    </div>
  )
}

function SegBtn({ active, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title} aria-pressed={active}
      style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
        fontFamily: 'var(--forge-font)', letterSpacing: '0.04em',
        border: `1px solid ${active ? 'var(--forge-amber)' : 'rgba(255,255,255,0.45)'}`,
        background: active ? 'color-mix(in srgb, var(--forge-amber) 18%, transparent)' : 'transparent',
        color: active ? 'var(--forge-amber)' : '#C8D8E8' }}>
      {children}
    </button>
  )
}
