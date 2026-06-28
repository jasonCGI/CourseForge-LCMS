import React, { useEffect, useState, useMemo, useRef } from 'react'
import FramePreview, { buildShelledLayoutHTML, buildMenuHTML, resolveMenuTargetFrameId, frameExistsInProject, parseFguiContentBg, parseOpaqueRgb } from './FramePreview'
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
 *     Shell NEXT/PREVIOUS are inert here — the preview is a single-frame WYSIWYG,
 *     not a navigable runtime, so the buttons don't drive the frame tree.
 *   - No shell → render FramePreview directly (full WYSIWYG for every block type).
 */
export default function PersistentPreviewPane() {
  const activeFrame  = useEditorStore(s => s.activeFrame)
  const activeBlockId = useEditorStore(s => s.activeBlockId)
  const setActiveBlock = useEditorStore(s => s.setActiveBlock)
  const loadFrame    = useEditorStore(s => s.loadFrame)
  const setLastMenuFrame = useEditorStore(s => s.setLastMenuFrame)
  const activeProject = useProjectStore(s => s.activeProject)

  // A menu frame stores its nav items in content.menu (no content.blocks), so the
  // shell-injection path can't use buildShelledLayoutHTML (which renders blocks and
  // would leave the content area blank). Detected here so the shell branch injects
  // the menu nav buttons instead.
  const isMenuFrame = activeFrame?.frame_type === 'menu'

  const shellId = activeProject?.gui_shell_id || null
  // Live-preview GUI toggle: ON = render inside the shell (learner view),
  // OFF = clean block stack (author/content view). Only meaningful with a shell.
  const [guiOn, setGuiOn] = useState(true)

  // Preview source toggle: 'edit' = the interactive React FramePreview (default,
  // unchanged); 'published' = the server-rendered truth in an iframe (the same
  // /preview-html the old popup Preview button opened, now shown in-pane).
  const [source, setSource] = useState('edit')

  // Preview zoom for the GUI-shell view: 'fit' contain-fits the whole stage in the
  // pane; a number renders the stage at that exact scale (pane scrolls if it
  // overflows). Default 1 = true 1:1, so the 1080p stage previews pixel-for-pixel
  // on a 1440p+ display. Fit + 25/50/75/100 buttons live in the preview corner.
  const [zoom, setZoom] = useState(1)

  // Fetch the shell's stage dimensions so the preview can show the ENTIRE GUI
  // at its true aspect ratio (the shell scales its stage to fit the iframe).
  const [stage, setStage] = useState(null)
  // content_area rect (stage coords) so rich-media (3D/iVideo/OAM) React
  // components can be overlaid exactly over the shell's #fgui-content.
  const [contentArea, setContentArea] = useState(null)
  // content-area bg_color -> luminance-aware injected body-text color/halo
  // (mirrors the server's _patch_shell). Default null = transparent/halo fallback.
  const [contentBg, setContentBg] = useState(null)
  // Per-shell text_mode ('auto'|'light'|'dark') — top tier of the text cascade.
  const [shellTextMode, setShellTextMode] = useState('auto')
  useEffect(() => {
    if (!shellId) { setStage(null); setContentArea(null); setContentBg(null); setShellTextMode('auto'); return }
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
        setShellTextMode(ca.text_mode || 'auto')
        const configBg = ca.bg_color ?? null
        if (parseOpaqueRgb(configBg) !== null) { setContentBg(configBg); return }
        // Config left bg_color unset/transparent: derive the solid #fgui-content
        // bg from the stored shell HTML so the luminance pick runs (light area ->
        // dark text). Mirrors the server's _resolve_content_bg. Image/gradient/
        // transparent shells stay null -> the #C8D8E8 + halo fallback.
        setContentBg(null)
        fetch(`/api/gui-shells/${shellId}/shell.html`)
          .then(r => (r.ok ? r.text() : null))
          .then(html => { if (live && html) setContentBg(parseFguiContentBg(html)) })
          .catch(() => {})
      })
      .catch(() => { if (live) { setStage({ w: 1024, h: 768 }); setContentArea({ x: 0, y: 0, width: 1024, height: 768 }); setContentBg(null) } })
    return () => { live = false }
  }, [shellId])

  // Memoized so a non-content re-render (e.g. the shell.json fetch resolving)
  // doesn't recompute the tree walk or hand GUIShellRenderer fresh prop
  // references — which would re-inject into the iframe needlessly.
  const order = useMemo(() => flatFrameOrder(activeProject), [activeProject])
  const idx   = activeFrame ? order.indexOf(activeFrame.id) : -1
  const total = order.length || 1
  const human = idx >= 0 ? idx + 1 : 1

  // Interactive / runtime blocks (3D, iVideo, OAM, hotspot, quiz, branch, WCN,
  // callout) must render as live React rather than static injected HTML — so the
  // shell preview is actually clickable and matches the learner/editor experience.
  // (Callout: so its box + target are draggable and its text editable WITH the GUI
  // shell on, identical to the shell-off preview — same InteractiveCallout overlay.)
  // When a frame has any, render the whole block stack as a scaled React overlay
  // over the content area. Static-only frames (text/image/video/audio) keep HTML
  // injection.
  const needsOverlay = useMemo(
    () => (activeFrame?.content?.blocks || []).some(
      b => ['model3d', 'ivideo', 'oam', 'hotspot', 'quiz', 'branch', 'wcn', 'callout'].includes(b.type)),
    [activeFrame?.content?.blocks],
  )
  const frameHtml = useMemo(
    () => {
      if (needsOverlay) return ''
      // Menu frame: inject the branded nav buttons (resolving each target the same
      // way MenuFramePreview does) instead of the empty block layout.
      if (isMenuFrame) {
        return buildMenuHTML(activeFrame?.content?.menu, (it) => resolveMenuTargetFrameId(it, activeProject))
      }
      // Two-level text cascade (mirror of the server): per-shell text_mode wins;
      // else project text_mode (activeProject.text_mode); else the contentBg
      // luminance pick.
      return buildShelledLayoutHTML(activeFrame?.content?.blocks || [], activeFrame?.content?.layout,
                                    contentBg, shellTextMode, activeProject?.text_mode || 'auto')
    },
    [needsOverlay, isMenuFrame, activeFrame?.content?.menu, activeFrame?.content?.blocks, activeFrame?.content?.layout, activeProject, contentBg, shellTextMode],
  )

  // Shell-injected menu buttons (no React in the iframe) post an fgui_nav message
  // on click; turn it into a real frame load in the editor preview — the shell-path
  // equivalent of MenuFramePreview's onClick={loadFrame(targetId)}.
  useEffect(() => {
    const handler = (e) => {
      if (!e.data || e.data.type !== 'fgui_nav' || !e.data.frameId) return
      // Ignore an unknown target (a stale inline frame-link / deleted frame) so a
      // bad id never drives a dead navigation — mirrors the server resolver guard.
      if (!frameExistsInProject(activeProject, e.data.frameId)) return
      // Shell-injected menu click: record the SOURCE menu (the frame we're ON now,
      // which IS the menu) before navigating, so the destination shows a back-pill.
      // React parity with MenuFramePreview.goTo and the SCO sessionStorage runtime.
      if (activeFrame?.frame_type === 'menu') {
        setLastMenuFrame(activeFrame.id, activeFrame?.content?.menu?.title || '')
      }
      loadFrame(e.data.frameId)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [loadFrame, setLastMenuFrame, activeFrame, activeProject])
  // Lesson/course names for the lesson_title / section_title shell zones (mirrors
  // the publish side: lessonTitle=lesson.name, sectionTitle=course.name).
  const ctx = useMemo(() => frameContext(activeProject, activeFrame?.id), [activeProject, activeFrame?.id])
  const frameData = useMemo(() => ({
    frameIndex: human, totalFrames: total,
    lessonTitle: ctx.lessonName, sectionTitle: ctx.courseName,
    frameTitle: activeFrame?.name || '',
    // Prompt zone: per-frame prompt (set in the Frame section), else inherit the
    // frame title. Stored in content so it rides the content autosave.
    prompt: activeFrame?.content?.prompt || activeFrame?.name || '',
    // Single-frame live preview: disable NEXT/PREV (isFirst && isLast). Real
    // navigation is exercised in the full-course preview, not here.
    isFirst: true, isLast: true,
  }), [human, total, activeFrame?.name, activeFrame?.content?.prompt, ctx])

  if (!activeFrame) return null

  return (
    <div className="cf-preview-pane">
      <PreviewHeader human={human} total={total} shell={!!shellId}
        guiOn={guiOn} onToggleGui={shellId ? () => setGuiOn(v => !v) : null}
        source={source} onSource={setSource} />
      {source === 'published' ? (
        // Server-rendered truth: the same /preview-html the old popup opened,
        // now filling the pane. Replaces the removed FrameHeader Preview button.
        <div style={{ flex: 1, overflow: 'hidden', background: '#fff' }}>
          <iframe
            key={activeFrame.id}
            src={`/api/frames/${activeFrame.id}/preview-html?embed=1`}
            title="Published frame preview"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        </div>
      ) : shellId && guiOn ? (
        // Always show the WHOLE GUI: contain-fit the stage within the pane (both
        // width AND height), scaled down (or up) so nothing is clipped and there's
        // no scroll. The shell scales its own stage to fill this sized wrapper.
        <ShellFit
          stage={stage}
          zoom={zoom} onZoom={setZoom}
          contentArea={needsOverlay ? contentArea : null}
          overlay={needsOverlay ? (
            <PreviewErrorBoundary resetKey={activeFrame.id}>
              <FramePreview frame={activeFrame} ignoreGui hideTitle contentArea={contentArea}
                activeBlockId={activeBlockId} onBlockSelect={setActiveBlock} />
            </PreviewErrorBoundary>
          ) : null}
        >
          <GUIShellRenderer
            key={shellId}
            shellUrl={`/api/gui-shells/${shellId}/shell.html`}
            frameHtml={frameHtml}
            frameData={frameData}
            onAction={null}
            height="100%"
          />
        </ShellFit>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', background: '#fff' }}>
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
function ShellFit({ stage, children, contentArea, overlay, zoom = 1, onZoom }) {
  const ref = useRef(null)
  const [fitBox, setFitBox] = useState(null)
  const sw = stage?.w || 1024, sh = stage?.h || 768
  const fitMode = zoom === 'fit'
  // Contain-fit measurement only runs in Fit mode; fixed zooms are a direct multiply.
  useEffect(() => {
    if (!fitMode) return
    const el = ref.current
    if (!el) return
    const PAD = 20
    const compute = () => {
      const w = el.clientWidth - PAD, h = el.clientHeight - PAD
      if (w <= 0 || h <= 0) return
      const s = Math.min(w / sw, h / sh)
      setFitBox({ w: Math.round(sw * s), h: Math.round(sh * s) })
    }
    const ro = new ResizeObserver(compute)
    ro.observe(el); compute()
    return () => ro.disconnect()
  }, [sw, sh, fitMode])
  const box = fitMode ? fitBox : { w: Math.round(sw * zoom), h: Math.round(sh * zoom) }
  const scale = box ? box.w / sw : 1
  // Fixed zoom: pane scrolls if the stage overflows; `safe center` keeps it centered
  // when it fits but aligns to the start (so all corners stay reachable) when it
  // doesn't. Fit: contain, no scroll.
  const ZOOMS = [['fit', 'Fit'], [0.25, '25'], [0.5, '50'], [0.75, '75'], [1, '100']]
  return (
    <div ref={ref} style={{ flex: 1, overflow: fitMode ? 'hidden' : 'auto', background: '#000', position: 'relative',
      display: 'flex', justifyContent: 'safe center', alignItems: 'safe center' }}>
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
            // No-scroll rule: the preview content area clips rather than scrolls
            // (image fills the area; oversized callouts clip at the edge). Long
            // shelled text still scrolls WITHIN #fgui-content, not the pane.
            overflow: 'hidden',
            background: '#fff',
            zIndex: 5,
            // larger body text inside the shell (clean shell-off view stays 18px)
            '--cf-preview-body': '26px',
          }}>
            {overlay}
          </div>
        )}
      </div>
      {/* Zoom controls (top-left): Fit + fixed scales; default 100% = 1:1. */}
      {onZoom && (
        <div style={{ position: 'absolute', top: 6, left: 8, zIndex: 50, display: 'flex',
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}>
          {ZOOMS.map(([val, label], i) => {
            const active = zoom === val
            return (
              <button key={label} type="button" onClick={() => onZoom(val)} aria-pressed={active}
                title={val === 'fit' ? 'Fit the whole frame in the pane' : `${label}% scale (100% = pixel-for-pixel)`}
                style={{ cursor: 'pointer', padding: '2px 7px', fontFamily: 'inherit', fontSize: 10, fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.18)', borderLeftWidth: i === 0 ? 1 : 0,
                  borderRadius: i === 0 ? '4px 0 0 4px' : (i === ZOOMS.length - 1 ? '0 4px 4px 0' : 0),
                  background: active ? '#7CFFB0' : 'rgba(0,0,0,0.6)',
                  color: active ? '#042C53' : '#C8D8E8' }}>
                {label}
              </button>
            )
          })}
        </div>
      )}
      {/* Scale readout: shows the preview's current scale vs the shell's native
          size, so 100% = pixel-for-pixel (any fringing/softness below 100% is just
          scaling, not a real artifact). Green at 1:1. */}
      {box && (
        <div aria-hidden="true"
          title="Preview scale vs the shell's native size — 100% is pixel-for-pixel"
          style={{ position: 'absolute', top: 6, right: 8, zIndex: 50, pointerEvents: 'none',
            background: 'rgba(0,0,0,0.6)', color: scale >= 0.999 ? '#7CFFB0' : '#C8D8E8',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: '0.04em',
            padding: '2px 7px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.18)' }}>
          {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  )
}

function PreviewHeader({ human, total, shell, guiOn, onToggleGui, source, onSource }) {
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
      <span style={{ color: '#C8D8E8', opacity: 0.75 }}>Frame {human} of {total}</span>
      <span style={{ opacity: 0.35 }}>│</span>
      <span style={{ color: '#C8D8E8', opacity: 0.6 }}>
        {shell ? 'GUI shell · SCORM API stubbed' : 'SCORM API stubbed'}
      </span>

      {/* Edit ⇄ Published — Edit = interactive React preview; Published = the
          server-rendered /preview-html truth in an iframe. Replaces the old
          popup Preview button that lived in the inspector action bar. */}
      <div role="group" aria-label="Preview source" style={{ marginLeft: 'auto', display: 'flex', gap: 0, flexShrink: 0 }}>
        <SourceBtn active={source === 'edit'} onClick={() => onSource('edit')} side="left"
          title="Edit — the interactive in-editor preview">Edit</SourceBtn>
        <SourceBtn active={source === 'published'} onClick={() => onSource('published')} side="right"
          title="Published — the server-rendered frame (the real SCO output)">Published</SourceBtn>
      </div>

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

// One half of the Edit ⇄ Published segmented toggle.
function SourceBtn({ active, onClick, side, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      style={{
        flexShrink: 0,
        fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.06em', fontWeight: 600,
        cursor: 'pointer', padding: '3px 9px',
        borderRadius: side === 'left' ? '5px 0 0 5px' : '0 5px 5px 0',
        border: '1px solid color-mix(in srgb, var(--forge-amber) 45%, transparent)',
        borderRightWidth: side === 'left' ? 0 : 1,
        background: active ? 'var(--forge-amber, #D4820A)' : 'transparent',
        color: active ? '#042C53' : 'var(--forge-amber, #D4820A)',
      }}
    >
      {children}
    </button>
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
