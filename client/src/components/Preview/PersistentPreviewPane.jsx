import React, { useEffect, useState } from 'react'
import FramePreview, { renderBlockToHTML } from './FramePreview'
import GUIShellRenderer from './GUIShellRenderer'
import PreviewErrorBoundary from './PreviewErrorBoundary'
import useEditorStore from '../../store/editorStore'
import useProjectStore from '../../store/projectStore'

/**
 * PersistentPreviewPane
 *
 * Always-visible WYSIWYG preview of the active frame, shown at the top of the
 * right authoring panel (above the block-config editor). Two modes:
 *   - Project has a GUI shell → render the frame inside the shell iframe
 *     (matches published SCO: shell is the page, blocks injected via window.fgui).
 *     Shell NEXT/PREVIOUS actions advance the active frame in the tree.
 *   - No shell → render FramePreview directly (full WYSIWYG for every block type).
 */
export default function PersistentPreviewPane() {
  const activeFrame  = useEditorStore(s => s.activeFrame)
  const navigateFrame = useEditorStore(s => s.navigateFrame)
  const activeProject = useProjectStore(s => s.activeProject)

  const shellId = activeProject?.gui_shell_id || null

  // Fetch the shell's stage dimensions so the preview can show the ENTIRE GUI
  // at its true aspect ratio (the shell scales its stage to fit the iframe).
  const [stage, setStage] = useState(null)
  useEffect(() => {
    if (!shellId) { setStage(null); return }
    let live = true
    fetch(`/api/gui-shells/${shellId}/shell.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(cfg => { if (live) { const s = cfg?.stage || {}; setStage({ w: s.width || 1024, h: s.height || 768 }) } })
      .catch(() => { if (live) setStage({ w: 1024, h: 768 }) })
    return () => { live = false }
  }, [shellId])

  if (!activeFrame) return null

  const order = flatFrameOrder(activeProject)
  const idx   = order.indexOf(activeFrame.id)
  const total = order.length || 1
  const human = idx >= 0 ? idx + 1 : 1
  const ar    = stage ? `${stage.w} / ${stage.h}` : '16 / 9'
  const maxW  = stage ? `${stage.w}px` : '100%'

  return (
    <div className="cf-preview-pane">
      <PreviewHeader human={human} total={total} shell={!!shellId} />
      {shellId ? (
        // Center + fit the whole shell to the pane width at its real aspect
        // ratio; scrolls if the pane is shorter than the fitted height.
        <div style={{ flex: 1, overflow: 'auto', background: '#000', padding: 10, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          <div style={{ width: '100%', maxWidth: `min(100%, ${maxW})`, aspectRatio: ar, flexShrink: 0 }}>
            <GUIShellRenderer
              key={shellId}
              shellUrl={`/api/gui-shells/${shellId}/shell.html`}
              frameHtml={(activeFrame.content?.blocks || []).map(renderBlockToHTML).join('')}
              frameData={{
                frameIndex: human, totalFrames: total,
                lessonTitle: '', sectionTitle: '',
                frameTitle: activeFrame.name || '',
                prompt: activeFrame.name || '',
                isFirst: idx <= 0, isLast: idx === total - 1,
              }}
              onAction={(a) => { if (a === 'NEXT' || a === 'PREVIOUS') navigateFrame(a) }}
              height="100%"
            />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
          <PreviewErrorBoundary resetKey={activeFrame.id}>
            <FramePreview frame={activeFrame} />
          </PreviewErrorBoundary>
        </div>
      )}
    </div>
  )
}

function PreviewHeader({ human, total, shell }) {
  return (
    <div style={{
      background: 'var(--cf-navy, #042C53)',
      color: 'var(--forge-amber, #D4820A)',
      fontFamily: 'var(--forge-font, "IBM Plex Mono", monospace)',
      fontSize: 10, letterSpacing: '0.08em',
      padding: '5px 12px', flexShrink: 0,
      borderBottom: '1px solid color-mix(in srgb, var(--forge-amber) 30%, transparent)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span>⚙ LIVE PREVIEW</span>
      <span style={{ opacity: 0.35 }}>│</span>
      <span style={{ color: '#C8D8E8', opacity: 0.75 }}>Frame {human} of {total}</span>
      <span style={{ opacity: 0.35 }}>│</span>
      <span style={{ color: '#C8D8E8', opacity: 0.6 }}>
        {shell ? 'GUI shell · SCORM API stubbed' : 'SCORM API stubbed'}
      </span>
    </div>
  )
}

// Flat in-order frame-id list across the whole project (project→course→…→frame).
export function flatFrameOrder(project) {
  const ids = []
  if (!project) return ids
  for (const c of [...(project.courses || [])].sort(byOrder))
    for (const m of [...(c.modules || [])].sort(byOrder))
      for (const l of [...(m.lessons || [])].sort(byOrder))
        for (const f of [...(l.frames || [])].sort(byOrder))
          ids.push(f.id)
  return ids
}
const byOrder = (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
