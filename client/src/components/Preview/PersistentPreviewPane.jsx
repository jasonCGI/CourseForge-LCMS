import React from 'react'
import FramePreview, { renderBlockToHTML } from './FramePreview'
import GUIShellRenderer from './GUIShellRenderer'
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

  if (!activeFrame) return null

  const shellId = activeProject?.gui_shell_id || null
  const order   = flatFrameOrder(activeProject)
  const idx     = order.indexOf(activeFrame.id)
  const total   = order.length || 1
  const human   = idx >= 0 ? idx + 1 : 1

  return (
    <div className="cf-preview-pane">
      <PreviewHeader human={human} total={total} shell={!!shellId} />
      <div style={{ flex: 1, overflow: 'hidden', background: shellId ? '#000' : '#fff', overflowY: shellId ? 'hidden' : 'auto' }}>
        {shellId ? (
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
            onAction={(a) => {
              if (a === 'NEXT' || a === 'PREVIOUS') navigateFrame(a)
            }}
            height={520}
          />
        ) : (
          <FramePreview frame={activeFrame} />
        )}
      </div>
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
