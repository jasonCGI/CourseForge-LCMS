import React, { useEffect, useState, useMemo, useRef } from 'react'
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
  const activeBlockId = useEditorStore(s => s.activeBlockId)
  const setActiveBlock = useEditorStore(s => s.setActiveBlock)
  const activeProject = useProjectStore(s => s.activeProject)

  const shellId = activeProject?.gui_shell_id || null
  // Live-preview GUI toggle: ON = render inside the shell (learner view),
  // OFF = clean block stack (author/content view). Only meaningful with a shell.
  const [guiOn, setGuiOn] = useState(true)

  // Fetch the shell's stage dimensions so the preview can show the ENTIRE GUI
  // at its true aspect ratio (the shell scales its stage to fit the iframe).
  const [stage, setStage] = useState(null)
  // content_area rect (stage coords) so rich-media (3D/iVideo/OAM) React
  // components can be overlaid exactly over the shell's #fgui-content.
  const [contentArea, setContentArea] = useState(null)
  useEffect(() => {
    if (!shellId) { setStage(null); setContentArea(null); return }
    let live = true
    fetch(`/api/gui-shells/${shellId}/shell.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(cfg => {
        if (!live) return
        const s = cfg?.stage || {}
        const sw = s.width || 1024, sh = s.height || 768
        setStage({ w: sw, h: sh })
        const ca = cfg?.content_area || cfg?.contentArea || {}
        setContentArea({ x: ca.x ?? 0, y: ca.y ?? 0, width: ca.width ?? sw, height: ca.height ?? sh })
      })
      .catch(() => { if (live) { setStage({ w: 1024, h: 768 }); setContentArea({ x: 0, y: 0, width: 1024, height: 768 }) } })
    return () => { live = false }
  }, [shellId])

  // Memoized so a non-content re-render (e.g. the shell.json fetch resolving)
  // doesn't recompute the tree walk or hand GUIShellRenderer fresh prop
  // references — which would re-inject into the iframe needlessly.
  const order = useMemo(() => flatFrameOrder(activeProject), [activeProject])
  const idx   = activeFrame ? order.indexOf(activeFrame.id) : -1
  const total = order.length || 1
  const human = idx >= 0 ? idx + 1 : 1

  // Rich-media blocks (3D / iVideo / OAM) are WebGL/runtime React components that
  // can't be injected as static HTML — when a frame has any, render the whole
  // block stack as a scaled React overlay over the content area instead of injecting.
  const hasRich = useMemo(
    () => (activeFrame?.content?.blocks || []).some(b => ['model3d', 'ivideo', 'oam'].includes(b.type)),
    [activeFrame?.content?.blocks],
  )
  const frameHtml = useMemo(
    () => (hasRich ? '' : (activeFrame?.content?.blocks || []).map(renderBlockToHTML).join('')),
    [hasRich, activeFrame?.content?.blocks],
  )
  // Lesson/course names for the lesson_title / section_title shell zones (mirrors
  // the publish side: lessonTitle=lesson.name, sectionTitle=course.name).
  const ctx = useMemo(() => frameContext(activeProject, activeFrame?.id), [activeProject, activeFrame?.id])
  const frameData = useMemo(() => ({
    frameIndex: human, totalFrames: total,
    lessonTitle: ctx.lessonName, sectionTitle: ctx.courseName,
    frameTitle: activeFrame?.name || '',
    prompt: activeFrame?.name || '',
    // Single-frame live preview: disable NEXT/PREV (isFirst && isLast). Real
    // navigation is exercised in the full-course preview, not here.
    isFirst: true, isLast: true,
  }), [human, total, activeFrame?.name, ctx])

  if (!activeFrame) return null

  return (
    <div className="cf-preview-pane">
      <PreviewHeader human={human} total={total} shell={!!shellId}
        guiOn={guiOn} onToggleGui={shellId ? () => setGuiOn(v => !v) : null} />
      {shellId && guiOn ? (
        // Always show the WHOLE GUI: contain-fit the stage within the pane (both
        // width AND height), scaled down (or up) so nothing is clipped and there's
        // no scroll. The shell scales its own stage to fill this sized wrapper.
        <ShellFit
          stage={stage}
          contentArea={hasRich ? contentArea : null}
          overlay={hasRich ? (
            <PreviewErrorBoundary resetKey={activeFrame.id}>
              <FramePreview frame={activeFrame} ignoreGui hideTitle
                activeBlockId={activeBlockId} onBlockSelect={setActiveBlock} />
            </PreviewErrorBoundary>
          ) : null}
        >
          <GUIShellRenderer
            key={shellId}
            shellUrl={`/api/gui-shells/${shellId}/shell.html`}
            frameHtml={frameHtml}
            frameData={frameData}
            onAction={(a) => { if (a === 'NEXT' || a === 'PREVIOUS') navigateFrame(a) }}
            height="100%"
          />
        </ShellFit>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
          <PreviewErrorBoundary resetKey={activeFrame.id}>
            <FramePreview frame={activeFrame} ignoreGui={!!shellId}
              activeBlockId={activeBlockId} onBlockSelect={setActiveBlock} />
          </PreviewErrorBoundary>
        </div>
      )}
    </div>
  )
}

// Sizes its child to the largest box with the stage's aspect ratio that fits
// entirely inside the pane (contain). Measured via ResizeObserver because pure
// CSS can't contain-fit an aspect-ratio box against both dimensions at once.
function ShellFit({ stage, children, contentArea, overlay }) {
  const ref = useRef(null)
  const [box, setBox] = useState(null)
  const sw = stage?.w || 1024, sh = stage?.h || 768
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const PAD = 20
    const compute = () => {
      const w = el.clientWidth - PAD, h = el.clientHeight - PAD
      if (w <= 0 || h <= 0) return
      const s = Math.min(w / sw, h / sh)
      setBox({ w: Math.round(sw * s), h: Math.round(sh * s) })
    }
    const ro = new ResizeObserver(compute)
    ro.observe(el); compute()
    return () => ro.disconnect()
  }, [sw, sh])
  const scale = box ? box.w / sw : 1
  return (
    <div ref={ref} style={{ flex: 1, overflow: 'hidden', background: '#000',
      display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: box ? box.w : '100%', height: box ? box.h : '100%', flexShrink: 0 }}>
        {children}
        {overlay && box && contentArea && (
          // Rich-media React stack, rendered at the content area's NATIVE size then
          // scaled with the shell so it overlays #fgui-content pixel-for-pixel.
          <div style={{
            position: 'absolute',
            left: Math.round(contentArea.x * scale),
            top: Math.round(contentArea.y * scale),
            width: contentArea.width,
            height: contentArea.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            overflow: 'auto',
            background: '#fff',
            zIndex: 5,
          }}>
            {overlay}
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewHeader({ human, total, shell, guiOn, onToggleGui }) {
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
      {onToggleGui && (
        <button
          type="button"
          onClick={onToggleGui}
          aria-pressed={guiOn}
          title={guiOn ? 'GUI shell ON — showing the learner view. Click for the clean content view.'
                       : 'GUI shell OFF — showing the clean content view. Click to wrap in the shell.'}
          style={{
            marginLeft: 'auto', flexShrink: 0,
            fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.06em', fontWeight: 600,
            cursor: 'pointer', padding: '3px 9px', borderRadius: 5,
            border: '1px solid color-mix(in srgb, var(--forge-amber) 45%, transparent)',
            background: guiOn ? 'var(--forge-amber, #D4820A)' : 'transparent',
            color: guiOn ? '#042C53' : 'var(--forge-amber, #D4820A)',
          }}
        >
          GUI {guiOn ? 'ON' : 'OFF'}
        </button>
      )}
    </div>
  )
}

// The lesson + course a frame belongs to (for the lesson_title/section_title
// shell zones). Mirrors the publish hierarchy: lesson.name / course.name.
export function frameContext(project, frameId) {
  if (!project || !frameId) return { lessonName: '', courseName: '' }
  for (const c of project.courses || [])
    for (const m of c.modules || [])
      for (const l of m.lessons || [])
        for (const f of l.frames || [])
          if (f.id === frameId) return { lessonName: l.name || '', courseName: c.name || '' }
  return { lessonName: '', courseName: '' }
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
