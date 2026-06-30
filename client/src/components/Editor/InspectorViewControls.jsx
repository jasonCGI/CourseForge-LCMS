import React, { useEffect, useRef, useState } from 'react'
import useEditorStore from '../../store/editorStore'

// Where the inspector panel sits, drawn as a half-filled square so the control
// shows its CURRENT state at a glance (you can read + predict it without opening).
const DOCK_GLYPH = { left: '◧', right: '◨', top: '⬒', bottom: '⬓' }

/**
 * InspectorViewControls — the ⚙ "View" popover.
 *
 * Holds the inspector display mode (Stack / Tabs) and dock position
 * (Left / Right / Top / Bottom). These used to live INSIDE the inspector's
 * action bar (FrameHeader's `right` slot) — but that bar moves with the dock,
 * so changing the dock chased the control out from under the pointer.
 *
 * Mounted in a FIXED location (the sidebar / ContentTree header), it stays put
 * no matter where the inspector docks. The mode + dock prefs are still persisted
 * in the store (localStorage), so nothing about the existing behavior changes —
 * the controls just relocated.
 */
export default function InspectorViewControls() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  const mode = useEditorStore(s => s.inspectorMode)
  const setMode = useEditorStore(s => s.setInspectorMode)

  const activeFrame = useEditorStore(s => s.activeFrame)
  const dockDefault = useEditorStore(s => s.inspectorDockDefault)
  const dockByFrame = useEditorStore(s => s.inspectorDockByFrame)
  const setInspectorDock = useEditorStore(s => s.setInspectorDock)
  const dock = (activeFrame && dockByFrame[activeFrame.id]) || dockDefault

  // Dismiss on Esc + click-outside.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown) }
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Inspector view options"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Inspector panel — layout & where it docks (currently: ${dock})`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 20, cursor: 'pointer',
          fontSize: 10, fontFamily: 'var(--forge-font)', letterSpacing: '0.06em',
          textTransform: 'uppercase',
          background: open ? 'color-mix(in srgb, var(--forge-amber) 18%, transparent)' : 'transparent',
          border: `1px solid ${open ? 'var(--forge-amber)' : 'var(--cf-border-tertiary)'}`,
          color: open ? 'var(--forge-amber)' : 'var(--cf-text-tertiary)',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>{DOCK_GLYPH[dock] || '▥'}</span><span>Panel</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Inspector view options"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 600,
            minWidth: 188, padding: 12,
            background: 'var(--cf-block-bg, #0d1017)',
            border: '1px solid var(--cf-border-secondary, #3a3a5a)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}
        >
          <Section label="Inspector layout">
            <div role="group" aria-label="Inspector layout" style={{ display: 'flex', gap: 4 }}>
              <SegBtn active={mode === 'stack'} onClick={() => setMode('stack')} title="All blocks in a list">≡ Stack</SegBtn>
              <SegBtn active={mode === 'tabs'} onClick={() => setMode('tabs')} title="One tab per block (prototype)">⊞ Tabs</SegBtn>
            </div>
          </Section>

          <Section label="Dock position">
            <div role="group" aria-label="Inspector dock position" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <SegBtn active={dock === 'left'} onClick={() => setInspectorDock('left')}
                title="Dock the block editor to the left of the preview">{DOCK_GLYPH.left} Left</SegBtn>
              <SegBtn active={dock === 'right'} onClick={() => setInspectorDock('right')}
                title="Dock the block editor to the right of the preview">{DOCK_GLYPH.right} Right</SegBtn>
              <SegBtn active={dock === 'top'} onClick={() => setInspectorDock('top')}
                title="Dock the block editor above the preview">{DOCK_GLYPH.top} Top</SegBtn>
              <SegBtn active={dock === 'bottom'} onClick={() => setInspectorDock('bottom')}
                title="Dock the block editor below the preview">{DOCK_GLYPH.bottom} Bottom</SegBtn>
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 9, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)',
        letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </div>
  )
}

function SegBtn({ active, onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={active}
      style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
        fontFamily: 'var(--forge-font)', letterSpacing: '0.04em',
        border: `1px solid ${active ? 'var(--forge-amber)' : 'var(--cf-border-tertiary)'}`,
        background: active ? 'color-mix(in srgb, var(--forge-amber) 18%, transparent)' : 'transparent',
        color: active ? 'var(--forge-amber)' : 'var(--cf-text-secondary)' }}>
      {children}
    </button>
  )
}
