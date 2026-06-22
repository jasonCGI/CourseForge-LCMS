import React, { useState } from 'react'
import useEditorStore from '../../store/editorStore'
import FrameEditor from './FrameEditor'
import TabbedFrameEditor from './TabbedFrameEditor'

/**
 * InspectorPane — wraps the bottom authoring pane with a Stack/Tabs toggle.
 *
 * 'stack' is the existing FrameEditor (all blocks in a scroll list). 'tabs' is
 * the prototype TabbedFrameEditor (one tab per block + a Frame tab, drag to
 * reorder). The toggle is persisted so a creator's choice sticks. Kept behind
 * the toggle so the current editor stays fully intact.
 */
export default function InspectorPane() {
  const activeFrame = useEditorStore(s => s.activeFrame)
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('cf-inspector-mode') || 'stack' } catch { return 'stack' }
  })
  const choose = (m) => { setMode(m); try { localStorage.setItem('cf-inspector-mode', m) } catch {} }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {activeFrame && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
          borderBottom: '1px solid var(--cf-border-primary)', background: 'var(--cf-header-bg, #042C53)',
          flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--forge-font)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--cf-text-secondary, #7A90A8)' }}>Inspector</span>
          <div style={{ flex: 1 }} />
          <div role="group" aria-label="Inspector layout" style={{ display: 'flex', gap: 2 }}>
            <SegBtn active={mode === 'stack'} onClick={() => choose('stack')} title="All blocks in a list">≡ Stack</SegBtn>
            <SegBtn active={mode === 'tabs'} onClick={() => choose('tabs')} title="One tab per block (prototype)">⊞ Tabs</SegBtn>
          </div>
        </div>
      )}
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
        border: `1px solid ${active ? 'var(--forge-amber)' : 'rgba(255,255,255,0.32)'}`,
        background: active ? 'color-mix(in srgb, var(--forge-amber) 18%, transparent)' : 'transparent',
        color: active ? 'var(--forge-amber)' : 'var(--cf-text-secondary, #C8D8E8)' }}>
      {children}
    </button>
  )
}
