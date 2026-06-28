import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import IVideoRuntime from '../Editor/blocks/IVideoRuntime'
import IVideoEditor from '../Editor/blocks/IVideoEditor'
import OamMediaBar from './OamMediaBar'
import Model3DViewer from './Model3DViewer'
import GUIShellRenderer from './GUIShellRenderer'
import useEditorStore from '../../store/editorStore'
import useProjectStore from '../../store/projectStore'
import { flatFrameOrder } from './PersistentPreviewPane'
import { hotspotStyle, shapeRadius, rgba, HOTSPOT_AMBER } from '../../utils/hotspotStyle'
import { buildCalloutOverlayHTML, CALLOUT_STYLE, resolveCalloutAnchor, calloutAnchorTransform, calloutLineBoxEnd } from '../../utils/calloutOverlay'
import { clampBounds } from '../Editor/blocks/BoundsControl'
import { Play, Pause } from '../icons'

const FRAME_BG = '#ffffff'

// Raw Iconoir (MIT) Play/Pause SVG strings for the VANILLA audio bar (the GUI
// shell injects HTML; there is no React there). Mirrors the React <Play>/<Pause>
// above and the server's cf_icons.PLAY_SVG / PAUSE_SVG so all renderers match.
const CF_PLAY_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="1.5" '
  + 'color="currentColor" aria-hidden="true" focusable="false">'
  + '<path d="M6.90588 4.53682C6.50592 4.2998 6 4.58808 6 5.05299V18.947C6 19.4119 '
  + '6.50592 19.7002 6.90588 19.4632L18.629 12.5162C19.0211 12.2838 19.0211 11.7162 '
  + '18.629 11.4838L6.90588 4.53682Z" fill="currentColor" stroke="currentColor" '
  + 'stroke-linecap="round" stroke-linejoin="round"/></svg>'
const CF_PAUSE_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="1.5" '
  + 'color="currentColor" aria-hidden="true" focusable="false">'
  + '<path d="M6 18.4V5.6C6 5.26863 6.26863 5 6.6 5H9.4C9.73137 5 10 5.26863 10 5.6V18.4C10 '
  + '18.7314 9.73137 19 9.4 19H6.6C6.26863 19 6 18.7314 6 18.4Z" fill="currentColor" '
  + 'stroke="currentColor"/><path d="M14 18.4V5.6C14 5.26863 14.2686 5 14.6 5H17.4C17.7314 5 '
  + '18 5.26863 18 5.6V18.4C18 18.7314 17.7314 19 17.4 19H14.6C14.2686 19 14 18.7314 14 '
  + '18.4Z" fill="currentColor" stroke="currentColor"/></svg>'

export default function FramePreview({ frame, activeBlockId = null, onBlockSelect = null, ignoreGui = false, hideTitle = false, contentArea = null }) {
  const updateBlock = useEditorStore(s => s.updateBlock)   // for drag/resize of bounded blocks
  if (!frame) return null

  // Menu frame: render the nav-button list (mirrors server render_menu_html).
  if (frame.frame_type === 'menu') {
    return <MenuFramePreview frame={frame} hideTitle={hideTitle} />
  }

  const allBlocks = frame.content?.blocks || []
  const blocks = ignoreGui ? allBlocks.filter(b => b.type !== 'gui') : allBlocks

  // GUI-shell frame: the shell is the whole canvas; all other blocks are
  // injected into its content area. Render it instead of the normal stack.
  // ignoreGui = the live preview's GUI toggle is OFF → show the clean block stack.
  const guiBlock = ignoreGui ? null : blocks.find(b => b.type === 'gui')
  if (guiBlock) {
    const contentBlocks = blocks.filter(b => b.type !== 'gui')
    return (
      <div style={{
        background: FRAME_BG, color: '#1a1a1a',
        fontFamily: 'Inter, system-ui, sans-serif',
        minHeight: '100%', padding: '32px 40px', boxSizing: 'border-box',
      }}>
        <h1 style={{
          fontSize: 22, fontWeight: 600, color: '#042C53',
          marginBottom: 24, paddingBottom: 12,
          borderBottom: '2px solid var(--forge-amber)',
        }}>{frame.name}</h1>
        <PreviewGUI guiBlock={guiBlock} contentBlocks={contentBlocks} frameName={frame.name}
          framePrompt={frame.content?.prompt} frameId={frame.id}
          frameLayout={frame.content?.layout} />
      </div>
    )
  }

  // In the GUI-shell overlay (contentArea present), blocks with custom bounds
  // break out of the stack and render as absolute boxes positioned in content-area
  // pixels; the rest keep flowing. Without a contentArea, bounds are ignored.
  const bounded = contentArea ? blocks.filter(b => b.data?.bounds) : []
  // Docked audio bars pin to the bottom of the frame container — pull them out of
  // the normal flow so they don't anchor to a per-block wrapper.
  const isDockedAudio = b => b.type === 'media' && b.data?.kind === 'audio' && b.data?.dock === 'bottom'
  const dockedAudio = blocks.filter(isDockedAudio)
  // Callouts are AUXILIARY overlays over the content area — pulled out of the flow
  // (like docked audio) so they never consume a layout zone; rendered as absolute
  // overlay layers anchored to the outer position:relative container below. Parity
  // with scorm12._render_blocks (callout -> kind_tag 'aux', rendered outside zones).
  const callouts = blocks.filter(b => b.type === 'callout')
  const flow    = (contentArea ? blocks.filter(b => !b.data?.bounds) : blocks)
    .filter(b => !isDockedAudio(b) && b.type !== 'callout')
  const textBlocks  = flow.filter(b => b.type === 'text')
  const otherBlocks = flow.filter(b => b.type !== 'text')
  // Frame layout preset (content.layout): 'full' = single column (media full-bleed,
  // text 40px padding), 'text-left'/'text-right' = 50/50 split. Mirrors
  // scorm12._render_blocks so the live preview and the SCO reflow identically.
  const layout = frame?.content?.layout || 'text-left'
  // fill = render this block to fill its zone (full height, no flow gap) — used in
  // overlay mode so media/3D/image/video fill their layout zone.
  const renderBlock = (block, fill = false) => (
    <SelectableBlock key={block.id} block={block} fill={fill}
      active={block.id === activeBlockId} onSelect={onBlockSelect} updateBlock={updateBlock} />
  )

  // Overlay mode = rendered as a scaled React overlay over the shell's content
  // area (PersistentPreviewPane passes contentArea). The zones must then FILL the
  // content-area height so the media/3D zone gets full height (no dead space) — the
  // in-canvas mirror of scorm12._render_blocks' absolute % zones. fullFill = a
  // 'full' frame with a single element (only text OR only media) fills 100%.
  const overlayFill = !!contentArea
  const hasText = textBlocks.length > 0, hasMedia = otherBlocks.length > 0
  const fullSingle = layout === 'full' && !(hasText && hasMedia)
  return (
    <div style={{
      background: FRAME_BG,
      color: '#1a1a1a',
      fontFamily: 'Inter, system-ui, sans-serif',
      minHeight: '100%',
      height: overlayFill ? '100%' : undefined,
      padding: overlayFill ? 0 : (dockedAudio.length ? '28px 0 88px' : '28px 0 40px'),
      boxSizing: 'border-box',
      position: 'relative',   // anchor for docked audio bars + the menu back-pill
    }}>
      {/* Menu back-pill: shown when this frame was reached via a menu (React
          parity with the SCO sessionStorage runtime). Top-left of the content area. */}
      <MenuBackPill currentFrameId={frame.id} />
      {/* Frame title (hidden when the shell already shows it in its chrome) */}
      {!hideTitle && (
        <h1 style={{
          fontSize: 22,
          fontWeight: 600,
          color: '#042C53',
          margin: '0 25px 24px',
          paddingBottom: 12,
          borderBottom: '2px solid var(--forge-amber)',
        }}>
          {frame.name}
        </h1>
      )}

      {blocks.length === 0 && (
        <p style={{ color: '#888', fontStyle: 'italic', padding: '0 25px' }}>No content blocks in this frame.</p>
      )}

      {/* Layout preset (frame.content.layout). 'full' = single column with
          full-bleed media and 40px-padded text; 'text-left'/'text-right' = two
          50% zones (text + media), 40px padding each, ordered by the preset. In
          overlay mode each zone fills the content-area height (media/3D fill). */}
      {flow.length > 0 && layout === 'full' && (
        <div style={overlayFill && fullSingle ? { height: '100%' } : undefined}>
          {flow.map(b => (
            <div key={b.id} style={{
              padding: b.type === 'text' ? 40 : 0,
              height: overlayFill && fullSingle ? '100%' : undefined,
              boxSizing: 'border-box',
            }}>
              {renderBlock(b, overlayFill && fullSingle && b.type !== 'text')}
            </div>
          ))}
        </div>
      )}
      {flow.length > 0 && layout !== 'full' && (
        <div style={{ display: 'flex', flexWrap: 'wrap',
          alignItems: overlayFill ? 'stretch' : 'flex-start',
          height: overlayFill ? '100%' : undefined }}>
          {(() => {
            const zone = (blocks2, isMedia) => (
              <div style={{ flex: '1 1 0', minWidth: 0, boxSizing: 'border-box',
                padding: isMedia && overlayFill ? 0 : 40,
                height: overlayFill ? '100%' : undefined,
                overflow: overlayFill ? 'hidden' : undefined }}>
                {blocks2.map(b => renderBlock(b, isMedia && overlayFill))}
              </div>
            )
            const textZone = zone(textBlocks, false)
            // No media to fill the other half (e.g. only an auxiliary docked audio
            // bar) — render the text full-width instead of a half-empty split.
            if (otherBlocks.length === 0) return textZone
            const mediaZone = zone(otherBlocks, true)
            return layout === 'text-right'
              ? <>{mediaZone}{textZone}</>
              : <>{textZone}{mediaZone}</>
          })()}
        </div>
      )}
      {/* Custom-bounds blocks: absolute boxes in content-area pixels (anchor to the
          scaled shell overlay). */}
      {bounded.map(b => (
        <BoundsBox key={b.id} block={b} contentArea={contentArea} updateBlock={updateBlock}
          active={b.id === activeBlockId} onSelect={onBlockSelect}>
          {/* fill: the BoundsBox is a sized (height-providing) container, so a
              cover image should crop-to-fill it, not aspect-lock to its bounds. */}
          <PreviewBlock block={b} fill />
        </BoundsBox>
      ))}
      {/* Docked audio bars — pinned to the bottom of the frame container. Derived
          purely from the CURRENT block state above, and keyed by id+dock so a
          dock toggle ('bottom'→'inline') unmounts this bar entirely (its <audio>
          stops + cleans up) instead of leaving a duplicate playing alongside the
          new inline bar. */}
      {dockedAudio.map(b => {
        const src = b.data.serve_url || (b.data.asset_id ? `/api/media/serve/${b.data.asset_id}` : null)
        return src ? <AudioBar key={`${b.id}-bottom`} src={src} caption={b.data.caption} dock="bottom" /> : null
      })}
      {/* Callout overlays — free-floating annotation boxes + connector lines over
          the content area. Auxiliary (never a zone-filler); the target circle is an
          editor-only affordance and is NOT rendered here. The overlay layer is
          absolute/inset:0 and anchors to this outer position:relative container,
          mirroring scorm12's aux callout overlay. */}
      {callouts.map(b => (
        <PreviewCallout key={b.id} block={b}
          interactive={!!onBlockSelect} active={b.id === activeBlockId}
          onSelect={onBlockSelect} updateBlock={updateBlock} />
      ))}
      {/* WCN recall bar — persistent re-open icons, lower-left of the content area. */}
      <WCNRecallBar wcnBlocks={blocks.filter(b => b.type === 'wcn')} />
    </div>
  )
}

// Resolve a menu item to the id of the frame it should navigate to, from the
// live project tree. The client mirror of server menu_frame.resolve_target_frame_id:
// a topic target (lesson/module) resolves to that section's first frame (lowest
// order_index); a 'frame' target resolves to itself if present. Returns null when
// the target can't be resolved. Shared by MenuFramePreview (React click-nav) and
// the shell-injection path (buildMenuHTML / PersistentPreviewPane postMessage nav).
export function resolveMenuTargetFrameId(item, project) {
  if (!item?.target_id) return null
  const kind = item.target_kind || 'frame'
  const firstFrameOfLesson = (lesson) => {
    const fs = [...(lesson?.frames || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    return fs[0] || null
  }
  for (const course of project?.courses || []) {
    for (const mod of course.modules || []) {
      if (kind === 'module' && mod.id === item.target_id) {
        for (const l of [...(mod.lessons || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))) {
          const f = firstFrameOfLesson(l); if (f) return f.id
        }
        return null
      }
      for (const lesson of mod.lessons || []) {
        if (kind === 'lesson' && lesson.id === item.target_id) {
          const f = firstFrameOfLesson(lesson); return f ? f.id : null
        }
        for (const fr of lesson.frames || []) {
          if (kind === 'frame' && fr.id === item.target_id) return fr.id
        }
      }
    }
  }
  return null
}

// Menu frame in-canvas preview — the React mirror of server render_menu_html.
// Buttons navigate by loading the resolved target frame in the editor preview
// (reuses the store's loadFrame, matching how the live preview swaps frames). A
// topic target (lesson/module) resolves client-side to that section's first frame.
function MenuFramePreview({ frame, hideTitle = false }) {
  const loadFrame        = useEditorStore(s => s.loadFrame)
  const setLastMenuFrame = useEditorStore(s => s.setLastMenuFrame)
  const activeProject    = useProjectStore(s => s.activeProject)

  const menu  = frame.content?.menu || {}
  const items = Array.isArray(menu.items) ? menu.items : []

  // We are ON a menu frame → it gets no pill. Clear any stale source so the menu
  // itself never shows a back-pill (parity with the SCO `href === here` check).
  useEffect(() => { setLastMenuFrame(null) }, [frame.id, setLastMenuFrame])

  const resolveTargetFrameId = (item) => resolveMenuTargetFrameId(item, activeProject)

  // Record THIS menu (its own frame id + title) as the source before navigating,
  // so the destination frame's preview can show a "← {title}" back-pill.
  const goTo = (targetId) => {
    if (!targetId) return
    setLastMenuFrame(frame.id, menu.title || '')
    loadFrame(targetId)
  }

  return (
    <div style={{
      background: FRAME_BG, color: '#1a1a1a', fontFamily: 'Inter, system-ui, sans-serif',
      minHeight: '100%', padding: '32px 24px', boxSizing: 'border-box',
    }}>
      {!hideTitle && (menu.title ? (
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#042C53', margin: '0 0 20px',
          paddingBottom: 10, borderBottom: '2px solid #F59E0B', maxWidth: 640, marginInline: 'auto' }}>
          {menu.title}
        </h2>
      ) : null)}
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.length === 0 && (
          <p style={{ color: '#6a7686', fontStyle: 'italic' }}>No menu items yet.</p>
        )}
        {items.map(it => {
          const targetId = resolveTargetFrameId(it)
          const disabled = !targetId
          return (
            <button
              key={it.id}
              onClick={() => goTo(targetId)}
              disabled={disabled}
              title={disabled ? 'No target set' : 'Go to target'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderRadius: 8, fontSize: 16, fontWeight: 600,
                fontFamily: 'inherit', textAlign: 'left',
                background: disabled ? '#9aa7b6' : '#042C53',
                color: '#fff', border: `1px solid ${disabled ? '#9aa7b6' : '#042C53'}`,
                cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.7 : 1,
              }}
            >
              <span>{it.label || 'Untitled'}</span>
              <span style={{ color: '#F59E0B', fontSize: 22, marginLeft: 16 }} aria-hidden="true">›</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Menu back-pill — the React mirror of the SCO/preview sessionStorage runtime.
// Shows a small branded "← {menu title}" pill at the top-left of the content area
// when the learner reached THIS frame via a menu (lastMenuFrame is set and points
// at a DIFFERENT frame). Clicking returns to that menu via loadFrame. Renders
// nothing when no source menu is recorded, or when the recorded menu IS this frame
// (a menu frame shows no pill). Doubles as a lightweight breadcrumb.
function MenuBackPill({ currentFrameId }) {
  const lastMenuFrame = useEditorStore(s => s.lastMenuFrame)
  const loadFrame     = useEditorStore(s => s.loadFrame)
  if (!lastMenuFrame || !lastMenuFrame.frameId) return null
  if (lastMenuFrame.frameId === currentFrameId) return null   // on the menu itself → no pill
  const title = lastMenuFrame.title || 'Menu'
  return (
    <button
      type="button"
      onClick={() => loadFrame(lastMenuFrame.frameId)}
      aria-label={`Back to ${title}`}
      title={`Back to ${title}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        position: 'absolute', top: 12, left: 12, zIndex: 30,
        maxWidth: 240, padding: '5px 12px', borderRadius: 14,
        background: '#042C53', color: '#fff', border: '1px solid #F59E0B',
        cursor: 'pointer', fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: 12, fontWeight: 600, lineHeight: 1.2,
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
      }}
    >
      <span aria-hidden="true" style={{ color: '#F59E0B', flex: 'none' }}>←</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
    </button>
  )
}

// Wraps a preview block so clicking it selects that block in the inspector
// (preview → tab), and so the active block outlines + scrolls into view when
// selected from the inspector (tab → preview). No-ops to a plain block when no
// onSelect handler is provided (e.g. read-only previews).
function SelectableBlock({ block, active, onSelect, updateBlock = null, fill = false }) {
  const ref = useRef(null)
  useEffect(() => {
    if (active && ref.current) ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])
  if (!onSelect) return <PreviewBlock block={block} fill={fill} />
  return (
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- editor-canvas selection wrapper around arbitrary block content (whose own controls are keyboard-reachable); a role=button here would invalidly nest interactive descendants */
    <div ref={ref} onClick={() => onSelect(block.id)}
      style={{
        position: 'relative', cursor: 'pointer', borderRadius: 6,
        height: fill ? '100%' : undefined,
        outline: active ? '2px solid var(--forge-amber)' : '2px solid transparent',
        outlineOffset: 3, transition: 'outline-color 0.15s',
      }}>
      <PreviewBlock block={block} fill={fill}
        interactive active={active} onSelect={onSelect} updateBlock={updateBlock} />
    </div>
  )
}

// A custom-bounds block in the live preview: an absolute box you can drag (the
// grip) and resize (corner handles). Deltas are divided by the ShellFit scale
// (measured from the box's own rendered rect) so 1 screen px maps to the right
// number of content-area px. Persists clamped bounds back to the block.
function BoundsBox({ block, contentArea, updateBlock, active, onSelect, children }) {
  const ref = useRef(null)
  const b = block.data.bounds
  const AC = '#6366F1'

  const startDrag = (mode, handle) => (e) => {
    e.preventDefault(); e.stopPropagation()
    const rect = ref.current.getBoundingClientRect()
    const scale = (b.width ? rect.width / b.width : 1) || 1
    const base = { ...b }, sx = e.clientX, sy = e.clientY
    const move = (ev) => {
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale
      let { x, y, width, height } = base
      if (mode === 'move') { x += dx; y += dy }
      else {
        if (handle.indexOf('e') >= 0) width += dx
        if (handle.indexOf('s') >= 0) height += dy
        if (handle.indexOf('w') >= 0) { x += dx; width -= dx }
        if (handle.indexOf('n') >= 0) { y += dy; height -= dy }
      }
      updateBlock(block.id, { bounds: clampBounds({ x, y, width, height }, contentArea) })
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    if (onSelect) onSelect(block.id)
  }

  const corners = {
    nw: { left: -6, top: -6, cursor: 'nwse-resize' }, ne: { right: -6, top: -6, cursor: 'nesw-resize' },
    sw: { left: -6, bottom: -6, cursor: 'nesw-resize' }, se: { right: -6, bottom: -6, cursor: 'nwse-resize' },
  }

  return (
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- editor-canvas selection/bounds wrapper around arbitrary block content (whose own controls are keyboard-reachable); a role=button here would invalidly nest interactive descendants */
    <div ref={ref} onClick={() => onSelect && onSelect(block.id)}
      style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, zIndex: 2,
        boxShadow: active ? `0 0 0 2px ${AC}` : `0 0 0 1px ${AC}99` }}>
      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>{children}</div>
      <div onPointerDown={startDrag('move')} title="Drag to move" aria-hidden="true"
        style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', width: 38, height: 16,
          background: AC, borderRadius: 8, cursor: 'move', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 11, lineHeight: 1, zIndex: 4, userSelect: 'none' }}>✥</div>
      {Object.keys(corners).map(h => (
        <div key={h} onPointerDown={startDrag('resize', h)} title="Drag to resize" aria-hidden="true"
          style={{ position: 'absolute', width: 11, height: 11, background: '#fff', border: `2px solid ${AC}`,
            borderRadius: 2, zIndex: 4, ...corners[h] }} />
      ))}
    </div>
  )
}

function PreviewGUI({ guiBlock, contentBlocks, frameName, framePrompt, frameId, frameLayout }) {
  const [action, setAction] = useState(null)

  // content-area bg -> luminance-aware injected body text (mirrors the server's
  // _patch_shell / _resolve_content_bg). An explicit opaque shell-config bg wins;
  // when it's null/transparent, derive the solid #fgui-content bg from the stored
  // shell HTML so the luminance pick runs (light area -> dark text). Image/
  // gradient/transparent shells stay null -> the #C8D8E8 + halo fallback.
  const configBg = guiBlock.data.content_bg_color
  const [derivedBg, setDerivedBg] = useState(null)
  const shellHtmlUrl = guiBlock.data.html_serve_url
  useEffect(() => {
    setDerivedBg(null)
    // Skip the fetch when config already gives an opaque color (it wins anyway).
    if (parseOpaqueRgb(configBg) !== null || !shellHtmlUrl) return
    let live = true
    fetch(shellHtmlUrl)
      .then(r => (r.ok ? r.text() : null))
      .then(html => { if (live && html) setDerivedBg(parseFguiContentBg(html)) })
      .catch(() => { if (live) setDerivedBg(null) })
    return () => { live = false }
  }, [configBg, shellHtmlUrl])
  const contentBg = resolveContentBg(configBg, null) ?? derivedBg

  // Resolve this frame's real 1-based position / total within the project's
  // ordered frame list so the shell pager reads "N / total" instead of "1 / 1".
  // Copies PersistentPreviewPane's proven computation EXACTLY: the same source
  // list (flatFrameOrder of the live activeProject) matched on the same id field
  // (frame.id), rather than the editor store's _projectFrameOrder() — which was
  // resolving the index to -1 here (always falling back to "1"). Matching the
  // persistent pane / NEXT-PREV path keeps the current position correct.
  const activeProject = useProjectStore(s => s.activeProject)
  const order = flatFrameOrder(activeProject)
  const total = order.length || 1
  const pos = frameId ? order.indexOf(frameId) : -1
  // Guard: a failed lookup must be obviously wrong (0), never silently stuck at 1.
  const human = pos >= 0 ? pos + 1 : 0

  if (!guiBlock.data.gui_asset_id) {
    return (
      <div style={{
        padding: 32, textAlign: 'center',
        border: '2px dashed #3A5A8A', borderRadius: 8, color: '#3A5A8A',
        background: 'rgba(58,90,138,0.05)', marginBottom: 16,
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>▣</div>
        <div style={{ fontSize: 13 }}>GUI Shell — upload a ForgeGUI ZIP to preview</div>
      </div>
    )
  }

  // Mirror scorm12._render_blocks (shelled path): position the text + media boxes
  // by the frame's layout (content.layout) so each element owns its own space (no
  // overlap, no floating). frameLayout() builds the same .cf-layout-zones structure
  // the server emits, with inline styles (the live shell iframe runs the stored
  // shell's CSS, not the server's _patch_shell rules).
  // Two-level text cascade (mirror of the server): per-shell text_mode (if the
  // per-frame GUI block carries one) wins; else the project text_mode; else the
  // contentBg luminance pick. activeProject.text_mode is the project tier.
  const shellTextMode   = guiBlock.data.text_mode || 'auto'
  const projectTextMode = activeProject?.text_mode || 'auto'
  const frameHtml = buildShelledLayoutHTML(contentBlocks || [], frameLayout, contentBg,
                                           shellTextMode, projectTextMode)

  // Memoize frameData (mirrors PersistentPreviewPane): a fresh inline object every
  // render would re-trigger GUIShellRenderer's injection effect on every parent
  // render, re-injecting content and (pre-fix) leaking observers each time.
  const frameData = useMemo(() => ({
    frameIndex: human, totalFrames: total,
    lessonTitle: 'Preview', sectionTitle: 'Preview',
    frameTitle: frameName || 'Frame Preview',
    prompt: framePrompt || frameName || '',
    isFirst: human <= 1, isLast: human >= total,
  }), [human, total, frameName, framePrompt])

  return (
    <div style={{ marginBottom: 16 }}>
      <GUIShellRenderer
        shellUrl={guiBlock.data.html_serve_url}
        frameHtml={frameHtml}
        frameData={frameData}
        onAction={(a) => setAction(a)}
        height={Math.round((guiBlock.data.stage_height || 768) * 0.6)}
      />
      <div style={{
        marginTop: 8, fontSize: 11, color: '#888',
        fontFamily: 'IBM Plex Mono, monospace',
      }}>
        {action
          ? `// shell action: ${action} (navigation handled by CourseForge in published output)`
          : '// preview — click shell buttons to test actions'}
      </div>
    </div>
  )
}

// A clean "interactive in the published course" note for block types that can't
// be represented as static injected HTML in the preview (3D, iVideo, OAM…).
function injectedNote(label) {
  return `<div style="padding:14px;border:1px dashed #9aa4b2;border-radius:6px;`
       + `color:#6a7686;font-family:'IBM Plex Mono',monospace;font-size:11px;`
       + `margin:8px 0;text-align:center">${label} — interactive in the published course</div>`
}

// Branded slim audio bar as an HTML string + a guarded, self-contained vanilla
// controller (the GUI shell injects HTML; there is no React there). Mirrors the
// React <AudioBar> and the server's _cf_audio_bar so all three renderers match.
function audioBarHTML(src, caption = '', dock = 'inline') {
  const NAVY = '#042C53', AMBER = '#F59E0B'
  const rates = [0.5, 0.75, 1, 1.25, 1.5, 2].join(',')
  const docked = dock === 'bottom'
  const cap = caption && !docked
    ? `<div style="font-size:12px;color:#888;margin-top:6px">${caption}</div>` : ''
  const wrapStyle = docked
    ? 'position:absolute;left:0;right:0;bottom:0;z-index:40;padding:8px 12px;box-sizing:border-box;background:rgba(4,44,83,0.96);box-shadow:0 -2px 12px rgba(0,0,0,0.18)'
    : 'margin:8px 0'
  const dockAttr = docked ? ' data-cf-dock="bottom"' : ''
  const bar = `<div class="cf-audio" data-cf-audio data-rates="${rates}" `
    + `style="display:flex;align-items:center;gap:12px;height:48px;padding:0 12px;`
    + `box-sizing:border-box;background:${NAVY};color:#E8EEF6;`
    + `font-family:'IBM Plex Mono',ui-monospace,monospace">`
    + `<audio data-cf-src preload="metadata" src="${src}"></audio>`
    + `<button type="button" data-cf-play aria-label="Play" `
    + `style="flex:0 0 auto;width:32px;height:32px;border:none;border-radius:50%;`
    + `background:${AMBER};color:${NAVY};cursor:pointer;display:flex;align-items:center;`
    + `justify-content:center;font-size:14px;line-height:1;padding:0">${CF_PLAY_SVG}</button>`
    + `<span data-cf-cur style="flex:0 0 auto;font-size:12px;letter-spacing:.02em">0:00</span>`
    + `<input data-cf-seek type="range" min="0" max="1000" value="0" step="1" aria-label="Seek" `
    + `style="flex:1 1 auto;height:4px;accent-color:${AMBER};cursor:pointer;min-width:60px">`
    + `<span data-cf-dur style="flex:0 0 auto;font-size:12px;letter-spacing:.02em;color:#9FB4CC">0:00</span>`
    + `<button type="button" data-cf-rate aria-label="Playback speed" `
    + `style="flex:0 0 auto;min-width:42px;height:26px;border:1px solid rgba(245,158,11,.5);`
    + `border-radius:6px;background:transparent;color:${AMBER};cursor:pointer;`
    + `font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12px;padding:0 6px">1x</button>`
    + `</div>`
  return `<div${dockAttr} style="${wrapStyle}">${bar}${cap}</div>${audioBarScriptHTML()}`
}

// Wire every [data-cf-audio] bar in a given document (used by the GUI shell
// iframe, where injectContent uses innerHTML and inline <script> won't run).
// Idempotent per bar.
export function wireAudioBars(doc) {
  if (!doc) return
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0
    const m = Math.floor(s / 60), x = Math.floor(s % 60)
    return `${m}:${x < 10 ? '0' : ''}${x}`
  }
  doc.querySelectorAll('[data-cf-audio]').forEach((bar) => {
    if (bar.__cfWired) return
    bar.__cfWired = true
    const a = bar.querySelector('[data-cf-src]')
    const play = bar.querySelector('[data-cf-play]')
    const seek = bar.querySelector('[data-cf-seek]')
    const cur = bar.querySelector('[data-cf-cur]')
    const dur = bar.querySelector('[data-cf-dur]')
    const rateBtn = bar.querySelector('[data-cf-rate]')
    const rates = (bar.getAttribute('data-rates') || '1').split(',').map(parseFloat)
    let ri = rates.indexOf(1); if (ri < 0) ri = 0
    let seeking = false
    const ico = (p) => { play.innerHTML = p ? CF_PAUSE_SVG : CF_PLAY_SVG; play.setAttribute('aria-label', p ? 'Pause' : 'Play') }
    play.addEventListener('click', () => { a.paused ? a.play() : a.pause() })
    a.addEventListener('play', () => ico(true))
    a.addEventListener('pause', () => ico(false))
    a.addEventListener('loadedmetadata', () => { dur.textContent = fmt(a.duration) })
    a.addEventListener('timeupdate', () => {
      cur.textContent = fmt(a.currentTime)
      if (!seeking && a.duration) seek.value = String(Math.round(a.currentTime / a.duration * 1000))
    })
    a.addEventListener('ended', () => { ico(false); seek.value = '0'; cur.textContent = '0:00' })
    seek.addEventListener('input', () => { seeking = true; if (a.duration) cur.textContent = fmt(seek.value / 1000 * a.duration) })
    seek.addEventListener('change', () => { if (a.duration) a.currentTime = seek.value / 1000 * a.duration; seeking = false })
    rateBtn.addEventListener('click', () => { ri = (ri + 1) % rates.length; a.playbackRate = rates[ri]; rateBtn.textContent = rates[ri] + 'x' })
  })
}

function audioBarScriptHTML() {
  return '<script>(function(){'
    + 'if(window.__cfAudioWired)return;window.__cfAudioWired=true;'
    + 'function fmt(s){if(!isFinite(s)||s<0)s=0;var m=Math.floor(s/60),x=Math.floor(s%60);return m+":"+(x<10?"0":"")+x;}'
    + 'function wire(bar){if(bar.__cfWired)return;bar.__cfWired=true;'
    + 'var a=bar.querySelector("[data-cf-src]"),play=bar.querySelector("[data-cf-play]"),'
    + 'seek=bar.querySelector("[data-cf-seek]"),cur=bar.querySelector("[data-cf-cur]"),'
    + 'dur=bar.querySelector("[data-cf-dur]"),rateBtn=bar.querySelector("[data-cf-rate]");'
    + 'var rates=(bar.getAttribute("data-rates")||"1").split(",").map(parseFloat),ri=rates.indexOf(1);if(ri<0)ri=0;var seeking=false;'
    + 'function ico(p){play.innerHTML=p?"' + CF_PAUSE_SVG.replace(/"/g, '\\"') + '":"' + CF_PLAY_SVG.replace(/"/g, '\\"') + '";play.setAttribute("aria-label",p?"Pause":"Play");}'
    + 'play.addEventListener("click",function(){a.paused?a.play():a.pause();});'
    + 'a.addEventListener("play",function(){ico(true);});a.addEventListener("pause",function(){ico(false);});'
    + 'a.addEventListener("loadedmetadata",function(){dur.textContent=fmt(a.duration);});'
    + 'a.addEventListener("timeupdate",function(){cur.textContent=fmt(a.currentTime);'
    + 'if(!seeking&&a.duration)seek.value=String(Math.round(a.currentTime/a.duration*1000));});'
    + 'a.addEventListener("ended",function(){ico(false);seek.value="0";cur.textContent="0:00";});'
    + 'seek.addEventListener("input",function(){seeking=true;if(a.duration)cur.textContent=fmt(seek.value/1000*a.duration);});'
    + 'seek.addEventListener("change",function(){if(a.duration)a.currentTime=seek.value/1000*a.duration;seeking=false;});'
    + 'rateBtn.addEventListener("click",function(){ri=(ri+1)%rates.length;a.playbackRate=rates[ri];rateBtn.textContent=rates[ri]+"x";});}'
    + 'function scan(){var bars=document.querySelectorAll("[data-cf-audio]");for(var i=0;i<bars.length;i++)wire(bars[i]);}'
    + 'if(document.readyState!=="loading")scan();else document.addEventListener("DOMContentLoaded",scan);'
    + '})();' + '</scr' + 'ipt>'
}

// Block-to-HTML renderer for injecting into the GUI shell preview. Renders the
// real media/quiz/WCN/hotspot so demo content actually appears in the shell
// content area (instead of "[type block]" stubs that read as "covered up").
// fill=true → this block is rendered inside a layout-derived zone (a .cf-zone-media
// half/full box). Media/3D/image/video then fill their box (width/height 100%),
// exactly as an explicit `bounds` would, mirroring scorm12._render_blocks' shelled
// zone path. Without it (normal injected flow) media keeps its height:auto sizing.
export function renderBlockToHTML(block, { fill = false } = {}) {
  const d = block.data || {}
  switch (block.type) {
    case 'text':
      return `<div class="cf-injected-text" style="font-size:26px;line-height:1.6">${d.body || ''}</div>`
    case 'media': {
      const k = d.kind
      // Resolve a playable source: prefer serve_url, else fall back to the
      // uploaded asset's serve route. (Image content failed to appear in the
      // shell preview whenever only asset_id was populated — e.g. a fresh upload
      // whose serve_url hadn't been mirrored — leaving the GUI chrome with no
      // image inside.) The image fills its content box (cover) and comes in
      // as-is: no engine-imposed rounding or crop.
      const src = d.serve_url || (d.asset_id ? `/api/media/serve/${d.asset_id}` : null)
      const b = d.bounds || fill
      const isCover = d.fit !== 'contain'
      if (k === 'image' && src) {
        // Cover image WITH a caption: overlay the caption on the image over a
        // bottom-up gradient scrim (white text) instead of below it.
        if (isCover && d.caption)
          return `<div style="position:relative;${b ? 'width:100%;height:100%' : 'display:block;margin:8px 0;line-height:0'}">`
            + `<img src="${src}" alt="${d.alt_text || ''}" `
            + `style="width:100%;height:${b ? '100%' : 'auto'};object-fit:cover;display:block">`
            + `<div style="position:absolute;left:0;right:0;bottom:0;padding:28px 16px 12px;`
            + `color:#fff;font-size:13px;line-height:1.45;`
            + `text-shadow:0 1px 3px rgba(0,0,0,.85);background:linear-gradient(to top,rgba(0,0,0,.9),rgba(0,0,0,.5) 50%,rgba(0,0,0,0))">${d.caption}</div></div>`
        return b
          ? `<img src="${src}" alt="${d.alt_text || ''}" `
            + `style="width:100%;height:100%;object-fit:${d.fit === 'contain' ? 'contain' : 'cover'};display:block">`
          : `<img src="${src}" alt="${d.alt_text || ''}" `
            + `style="max-width:100%;height:auto;display:block;margin:8px 0">`
      }
      if (k === 'video' && src) {
        // Cover video (fit:cover explicitly): fill the content box (object-fit:
        // cover, no rounding/letterbox), play seamlessly (muted/loop/autoplay/
        // playsinline) WITH native controls so it's a usable content video. The
        // control bar sits at the bottom, so a caption rides on a TOP-down
        // gradient scrim (white text) and never overlaps the controls. Mirrors the
        // cover image branch.
        const videoIsCover = d.fit === 'cover'
        // dock='bottom' fills the content box (height:100%) so the native playbar
        // snaps flush to the content-area bottom; 'inline' (default) keeps the
        // height:auto + 8px gap flow. Bounded blocks already fill regardless.
        const vDocked = videoIsCover && (d.dock || 'inline') === 'bottom'
        const fillH = b || vDocked
        if (videoIsCover && d.caption)
          return `<div style="position:relative;${fillH ? 'width:100%;height:100%' : 'display:block;margin:8px 0;line-height:0'}">`
            + `<video src="${src}" controls muted autoplay playsinline ${d.poster_url ? `poster="${d.poster_url}"` : ''} `
            + `style="width:100%;height:${fillH ? '100%' : 'auto'};object-fit:cover;display:block"></video>`
            + `<div style="position:absolute;left:0;right:0;top:0;padding:12px 16px 28px;`
            + `color:#fff;font-size:13px;line-height:1.45;`
            + `text-shadow:0 1px 3px rgba(0,0,0,.85);background:linear-gradient(to bottom,rgba(0,0,0,.85),rgba(0,0,0,.45) 50%,transparent)">${d.caption}</div></div>`
        if (videoIsCover)
          return `<video src="${src}" controls muted autoplay playsinline ${d.poster_url ? `poster="${d.poster_url}"` : ''} `
            + `style="width:100%;height:${fillH ? '100%' : 'auto'};object-fit:cover;display:block;margin:${fillH ? '0' : '8px 0'}"></video>`
        return `<video src="${src}" controls playsinline ${d.poster_url ? `poster="${d.poster_url}"` : ''} `
             + `style="max-width:100%;height:auto;display:block;margin:8px 0;background:#000"></video>`
      }
      if (k === 'audio' && (src || d.asset_id)) {
        const asrc = src || `/api/media/serve/${d.asset_id}`
        return audioBarHTML(asrc, d.caption || '', d.dock || 'inline')
      }
      return injectedNote(`${k || 'media'} block`)
    }
    case 'quiz': {
      const choices = (d.choices || []).map(c => `<li style="margin:3px 0">${c}</li>`).join('')
      return `<div style="margin:8px 0">`
           + `<p style="font-weight:600;margin-bottom:6px">${d.question || 'Knowledge check'}</p>`
           + `<ol style="margin:0 0 0 20px;padding:0">${choices}</ol></div>`
    }
    case 'wcn': {
      const c = { warning: '#D23B3B', caution: '#E6A100', note: '#2B6CB0' }[d.wcn_type] || '#2B6CB0'
      return `<div style="margin:8px 0;padding:10px 14px;border-left:4px solid ${c};background:rgba(0,0,0,0.03);border-radius:4px">`
           + `<p style="font-weight:700;color:${c};margin:0 0 4px;font-size:12px;letter-spacing:.04em">`
           + `${(d.wcn_type || 'note').toUpperCase()}${d.title ? ' — ' + d.title : ''}</p>`
           + `<p style="margin:0">${d.text || ''}</p></div>`
    }
    case 'hotspot': {
      if (!d.background_url) return injectedNote('hotspot block')
      const esc = s => String(s || '').replace(/"/g, '&quot;')
      const regions = (d.regions || []).map(r => {
        const st = hotspotStyle(r.color)
        return `<div style="position:absolute;left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;`
        + `box-sizing:border-box;border:2px solid ${st.border};`
        + `background:${st.fill};border-radius:${shapeRadius(r.shape)}" title="${esc(r.label)}">`
        + `<span style="position:absolute;left:0;top:-17px;font:600 10px 'IBM Plex Mono',monospace;`
        + `color:#fff;background:rgba(0,0,0,0.6);padding:1px 5px;border-radius:3px;white-space:nowrap">`
        + `${r.label || ''}</span></div>`
      }).join('')
      return `<div style="position:relative;margin:8px 0">`
        + `<img src="${d.background_url}" alt="${d.alt_text || 'Hotspot image'}" style="max-width:100%;display:block">`
        + regions + `</div>`
    }
    case 'branch': {
      const opt = lbl => `<span style="display:inline-block;margin:4px 6px 0 0;padding:5px 12px;`
        + `border:1px solid #3A5A8A;border-radius:6px;font-size:12px;color:#1a2a3a">${lbl}</span>`
      return `<div style="margin:8px 0"><p style="margin-bottom:6px">${d.condition || 'Decision point'}</p>`
        + `${opt(d.true_label || 'Yes')}${opt(d.false_label || 'No')}</div>`
    }
    case 'callout':
      // Free-floating annotation overlay (box + connector line, NO target circle).
      // The shared builder produces the SAME markup the server emits. The overlay
      // is absolute/inset:0 and anchors to the nearest position:relative ancestor.
      return buildCalloutOverlayHTML(d)
    default:
      return injectedNote(`${block.type} block`)
  }
}

// Luminance-aware shelled body text — the JS mirror of scorm12.shell_text_style.
// When the shell sets a KNOWN OPAQUE content-area bg_color, pick the brand text
// color (navy / light blue) with the BEST WCAG contrast against that bg, dropping
// the halo only when that contrast reaches AA (>=4.5:1) for crisp solid text; for
// mid-gray backgrounds where neither solid color hits AA, the halo is KEPT so the
// dark outline carries legibility. Transparent / unset / unparseable / alpha<1 ->
// light blue + the dark halo (the universal fallback; the common transparent-over-
// art shell). Guarded so a malformed bg_color always falls back to the halo path.
const SHELL_TEXT_LIGHT = '#C8D8E8'   // light glyphs for a DARK bg (default)
const SHELL_TEXT_DARK  = '#042C53'   // brand navy for a LIGHT bg
const SHELL_HALO = 'text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 2px rgba(0,0,0,0.7);'

export function parseOpaqueRgb(bgColor) {
  // Returns [r,g,b] only for a known OPAQUE color; null otherwise. Never throws.
  try {
    if (!bgColor) return null
    const s = String(bgColor).trim().toLowerCase()
    if (!s || s === 'transparent') return null
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s)
    if (m) {
      let h = m[1]
      if (h.length === 3) h = h.split('').map(c => c + c).join('')
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
    }
    m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([01]?(?:\.\d+)?|\.\d+)\s*)?\)$/.exec(s)
    if (m) {
      if (m[4] !== undefined && parseFloat(m[4]) < 1.0) return null   // alpha<1 -> transparent
      const r = +m[1], g = +m[2], b = +m[3]
      // \d{1,3} permits 256-999; reject out-of-range channels.
      if (r > 255 || g > 255 || b > 255) return null
      return [r, g, b]
    }
    return null
  } catch (e) { return null }
}

// Parse a SOLID OPAQUE `#fgui-content` background color out of a stored shell's
// HTML/CSS — the in-canvas mirror of scorm12.derive_fgui_content_bg. Used as the
// content_bg luminance input when the shell config did NOT set
// content_area.bg_color. Returns the color STRING only when `#fgui-content`'s
// background is a solid opaque color; null for transparent/image/gradient/alpha<1/
// missing (those keep the #C8D8E8 + halo fallback). Never throws.
const FGUI_CONTENT_RULE_RE = /#fgui-content\s*\{([^}]*)\}/i
const FGUI_BG_RE = /background(?:-color)?\s*:\s*([^;}]+)/gi
export function parseFguiContentBg(shellHtml) {
  try {
    if (!shellHtml) return null
    const m = FGUI_CONTENT_RULE_RE.exec(String(shellHtml))
    if (!m) return null
    // Last background declaration wins (cascade within one rule).
    let val = null, bm
    FGUI_BG_RE.lastIndex = 0
    while ((bm = FGUI_BG_RE.exec(m[1])) !== null) val = bm[1].trim()
    if (!val) return null
    // Keep only a solid opaque color (rejects transparent, url() images,
    // gradients, alpha<1) — the exact halo-fallback boundary the server uses.
    return parseOpaqueRgb(val) !== null ? val : null
  } catch (e) { return null }
}

// content_bg precedence (mirror of scorm12._resolve_content_bg): an explicit opaque
// shell-config bg wins; otherwise derive the solid #fgui-content bg from shell HTML.
export function resolveContentBg(configBg, shellHtml) {
  if (parseOpaqueRgb(configBg) !== null) return configBg
  return parseFguiContentBg(shellHtml)
}

// Brand text colors as RGB, for the WCAG-contrast pick below.
const SHELL_TEXT_DARK_RGB = [4, 44, 83], SHELL_TEXT_LIGHT_RGB = [200, 216, 232]

function relLum(rgb) {
  // WCAG relative luminance of an [r,g,b] in 0..255.
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
}
function contrastRatio(a, b) {
  const l1 = relLum(a), l2 = relLum(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

// -> { textColor, halo }. Pick the brand color with the best WCAG contrast against
// an opaque bg; KEEP the halo when even the best is < 4.5:1 (mid-gray backgrounds)
// so the dark outline carries legibility. Transparent/unknown -> light + halo.
function shellTextStyle(bgColor) {
  const rgb = parseOpaqueRgb(bgColor)
  if (!rgb) return { textColor: SHELL_TEXT_LIGHT, halo: true }
  const cDark = contrastRatio(rgb, SHELL_TEXT_DARK_RGB)
  const cLight = contrastRatio(rgb, SHELL_TEXT_LIGHT_RGB)
  const dark = cDark >= cLight
  return { textColor: dark ? SHELL_TEXT_DARK : SHELL_TEXT_LIGHT, halo: (dark ? cDark : cLight) < 4.5 }
}

// Coerce a stored text_mode to 'auto'|'light'|'dark' ('auto' default). Mirror of
// scorm12._norm_text_mode.
function normTextMode(mode) {
  const m = mode == null ? 'auto' : String(mode).trim().toLowerCase()
  return (m === 'light' || m === 'dark') ? m : 'auto'
}

// Two-level cascade -> { textColor, halo }. Mirror of scorm12.resolve_shell_text_style:
//   1. per-shell text_mode explicit -> wins
//   2. else project text_mode explicit -> wins
//   3. else 'auto' at both -> shellTextStyle(bgColor) luminance pick.
// Explicit 'dark' => #042C53, no halo; explicit 'light' => #C8D8E8 + halo.
export function resolveShellTextStyle(shellTextMode, projectTextMode, bgColor) {
  let mode = normTextMode(shellTextMode)
  if (mode === 'auto') mode = normTextMode(projectTextMode)
  if (mode === 'dark')  return { textColor: SHELL_TEXT_DARK,  halo: false }
  if (mode === 'light') return { textColor: SHELL_TEXT_LIGHT, halo: true }
  return shellTextStyle(bgColor)
}

// A <style> rule that colors the injected body text inside #fgui-content per the
// two-level text cascade (per-shell mode, else project mode, else the bg's
// luminance). The stored shell HTML sets no #fgui-content color of its own, so
// this is what makes the in-canvas preview match the published SCO's _patch_shell.
function shellTextCSS(bgColor, shellTextMode = 'auto', projectTextMode = 'auto') {
  const { textColor, halo } = resolveShellTextStyle(shellTextMode, projectTextMode, bgColor)
  return '<style>#fgui-content{color:' + textColor + ';'
    + (halo ? SHELL_HALO : '') + '}</style>'
}

// List CSS for shell-injected rich text. The stored shell's `#fgui-content ul`
// rule (margin-left, no padding) outranks a plain class, so target
// `#fgui-content .cf-injected-text` to win specificity and give bullets/numbers a
// clean hanging indent (padding-left, markers in the padding) in the in-canvas preview.
const CF_INJ_LIST_CSS =
  '<style>#fgui-content .cf-injected-text ul,#fgui-content .cf-injected-text ol' +
  '{margin:10px 0 12px;padding-left:1.5em;list-style-position:outside}' +
  '#fgui-content .cf-injected-text li{margin:5px 0}</style>'

// Build the shelled content HTML for the GUI-shell preview, positioning the text
// and media blocks into layout-derived zones — the in-preview mirror of
// scorm12._render_blocks' shelled path. Uses INLINE styles (the live shell iframe
// runs the stored shell's CSS, not the server's _patch_shell rules); the
// .cf-layout-zones layer fills #fgui-content edge-to-edge (0/0/100%/100%). Each
// element owns its own, non-overlapping space; media/3D/image/video fill their zone.
export function buildShelledLayoutHTML(contentBlocks, layout, bgColor = null,
                                       shellTextMode = 'auto', projectTextMode = 'auto') {
  const blocks = (contentBlocks || []).filter(b => b.type !== 'gui')
  if (blocks.length === 0) return ''
  // Body-text color/halo per the two-level cascade (per-shell mode, else project
  // mode, else the content-area bg's luminance), mirroring the server's
  // _patch_shell. Prepended to every return so the injected text gets the right
  // color in the iframe (the stored shell sets no #fgui-content color).
  const TXT = shellTextCSS(bgColor, shellTextMode, projectTextMode)
  const lay = ['full', 'text-left', 'text-right'].includes(layout) ? layout : 'text-left'
  const textBlocks  = blocks.filter(b => b.type === 'text')
  const otherBlocks = blocks.filter(b => b.type !== 'text')
  const hasText = textBlocks.length > 0, hasMedia = otherBlocks.length > 0

  // full WITH both a text AND a media block = two elements → stack them (text
  // 40px-padded at top, media full-bleed beneath), no overlap. Mirrors the server.
  if (lay === 'full' && hasText && hasMedia) {
    return TXT + CF_INJ_LIST_CSS + `<div class="cf-layout-full">` + blocks.map(b =>
      `<div style="padding:${b.type === 'text' ? '40px' : '0'}">${renderBlockToHTML(b)}</div>`
    ).join('\n') + `</div>`
  }

  // Text-only content (no media zone-filler): a split layout is meaningless with
  // nothing in the other half, so collapse to ONE full-width box that fills the
  // content area top:0/height:100% and applies the 40px-all-sides padding rule.
  // The in-canvas iframe runs the STORED shell CSS (no .cf-shelled-text-top rule),
  // so carry the absolute/full-area geometry as INLINE styles — this also makes
  // the box immune to a stored shell that flex-centers #fgui-content (the
  // position:absolute box escapes that centering and stays TOP-aligned). Mirrors
  // the server's .cf-shelled-text-top text-only path for parity.
  if (hasText && !hasMedia) {
    const inner = textBlocks.map(b => renderBlockToHTML(b)).join('\n')
    return TXT + CF_INJ_LIST_CSS + `<div class="cf-shelled-text-top" style="position:absolute;`
      + `top:0;left:0;width:100%;height:100%;box-sizing:border-box;padding:40px;`
      + `overflow:auto">${inner}</div>`
  }

  // Zone geometry as % of the content area (y=0, height=100%).
  let tLeft, tW, mLeft, mW
  if (lay === 'text-left')       { tLeft = '0';   tW = '50%';  mLeft = '50%'; mW = '50%' }
  else if (lay === 'text-right') { tLeft = '50%'; tW = '50%';  mLeft = '0';   mW = '50%' }
  else                           { tLeft = '0';   tW = '100%'; mLeft = '0';   mW = '100%' }  // full single

  const zones = []
  if (hasText) {
    const inner = textBlocks.map(b => renderBlockToHTML(b)).join('\n')
    zones.push(`<div class="cf-zone-text" style="position:absolute;top:0;left:${tLeft};`
      + `width:${tW};height:100%;box-sizing:border-box;padding:40px;overflow:auto">${inner}</div>`)
  }
  if (hasMedia) {
    // fill=true so each media/3D/image/video block fills its zone (full height).
    const inner = otherBlocks.map(b => renderBlockToHTML(b, { fill: true })).join('\n')
    zones.push(`<div class="cf-zone-media" style="position:absolute;top:0;left:${mLeft};`
      + `width:${mW};height:100%;box-sizing:border-box;overflow:hidden">${inner}</div>`)
  }
  return TXT + CF_INJ_LIST_CSS + `<div class="cf-layout-zones" style="position:absolute;top:0;left:0;`
    + `width:100%;height:100%;overflow:hidden">${zones.join('\n')}</div>`
}

// Build the menu-frame nav HTML for injection into the GUI shell iframe — the
// HTML-string mirror of <MenuFramePreview> and the server's render_menu_html. A
// menu frame has no content.blocks (its data is content.menu), so the shell path
// can't use buildShelledLayoutHTML; this renders one branded button per item.
//
// `resolve(item) -> targetFrameId | null` resolves each item's target the same way
// MenuFramePreview does (topic → first frame). Resolvable buttons carry
// data-cf-nav-target="<frameId>"; unresolvable ones render disabled (no target).
// Clicks are wired by wireMenuNav() in the host (the iframe has no React), which
// reads the attribute and posts an fgui_nav message the host turns into loadFrame.
// Uses INLINE styles (the live shell iframe runs the stored shell's CSS, not the
// server's _MENU_CSS) so it matches MenuFramePreview without depending on shell CSS.
export function buildMenuHTML(menu, resolve) {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const m = menu || {}
  const items = Array.isArray(m.items) ? m.items : []
  const title = m.title || ''

  const titleHTML = title
    ? `<h2 style="font-size:22px;font-weight:700;color:#042C53;margin:0 0 20px;`
      + `padding-bottom:10px;border-bottom:2px solid #F59E0B;max-width:640px;`
      + `margin-left:auto;margin-right:auto;font-family:Inter,system-ui,sans-serif">${esc(title)}</h2>`
    : ''

  const btnBase = 'display:flex;align-items:center;justify-content:space-between;'
    + 'padding:16px 20px;border-radius:8px;font-size:16px;font-weight:600;'
    + 'font-family:Inter,system-ui,sans-serif;text-align:left;color:#fff;width:100%;'
    + 'box-sizing:border-box;text-decoration:none'
  const arrow = '<span style="color:#F59E0B;font-size:22px;margin-left:16px;flex:none" aria-hidden="true">&#8250;</span>'

  let btns
  if (items.length === 0) {
    btns = '<p style="color:#6a7686;font-style:italic">No menu items yet.</p>'
  } else {
    btns = items.map((it) => {
      const label = esc((it && it.label) || 'Untitled')
      const targetId = resolve ? resolve(it) : null
      if (targetId) {
        return `<button type="button" data-cf-nav-target="${esc(targetId)}" title="Go to target" `
          + `style="${btnBase};background:#042C53;border:1px solid #042C53;cursor:pointer">`
          + `<span>${label}</span>${arrow}</button>`
      }
      return `<span role="link" aria-disabled="true" title="No target set" `
        + `style="${btnBase};background:#9aa7b6;border:1px solid #9aa7b6;cursor:not-allowed;opacity:.7">`
        + `<span>${label}</span>${arrow}</span>`
    }).join('')
  }

  return `<div style="background:#fff;color:#1a1a1a;font-family:Inter,system-ui,sans-serif;`
    + `min-height:100%;padding:32px 24px;box-sizing:border-box">`
    + titleHTML
    + `<div style="max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:12px">`
    + btns
    + `</div></div>`
}

// Wire every [data-cf-nav-target] menu button in a given iframe document so a click
// posts an fgui_nav message (with the resolved target frame id) up to the host,
// which calls loadFrame(targetId). The iframe has no React, mirroring how the audio
// bars are wired by hand. Idempotent per button. `win` is the iframe contentWindow.
export function wireMenuNav(win) {
  if (!win || !win.document) return
  win.document.querySelectorAll('[data-cf-nav-target]').forEach((btn) => {
    if (btn.__cfNavWired) return
    btn.__cfNavWired = true
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-cf-nav-target')
      if (target) {
        try { (win.parent || window).postMessage({ type: 'fgui_nav', frameId: target }, '*') }
        catch (e) { /* iframe torn down */ }
      }
    })
  })
  // Inline text frame-links inside the shell (<a data-cf-frame="<id>">) — same
  // mechanism: intercept the click and post fgui_nav so the host loads the target
  // (no raw <a href> nav in the editor preview). The host validates the id against
  // the project tree, so an unknown id is simply ignored. Skip the inert/dead
  // variant. Guarded so a bad anchor never throws.
  win.document.querySelectorAll('a[data-cf-frame]').forEach((a) => {
    if (a.__cfFrameLinkWired) return
    a.__cfFrameLinkWired = true
    a.addEventListener('click', (ev) => {
      try {
        if (a.classList && a.classList.contains('cf-frame-link--dead')) { ev.preventDefault(); return }
        const target = a.getAttribute('data-cf-frame')
        ev.preventDefault()
        if (target) (win.parent || window).postMessage({ type: 'fgui_nav', frameId: target }, '*')
      } catch (e) { /* iframe torn down */ }
    })
  })
  // The injected content runs the STORED shell CSS, not our React styles, so
  // inline frame-links and image-swap triggers render unstyled — inject a small
  // stylesheet so they're identifiable as interactive terms in the shell preview.
  try {
    if (!win.document.getElementById('cf-inline-link-style')) {
      const st = win.document.createElement('style')
      st.id = 'cf-inline-link-style'
      st.textContent =
        'a[data-cf-frame],a.cf-frame-link{color:#D4820A;text-decoration:underline;' +
        'text-decoration-thickness:2px;text-underline-offset:2px;cursor:pointer;font-weight:600}' +
        'a[data-cf-swap],a.cf-swap-link{color:#D4820A;text-decoration:underline;' +
        'text-decoration-style:dotted;text-decoration-thickness:2px;text-underline-offset:2px;' +
        'cursor:pointer;font-weight:600}' +
        'a[data-cf-swap].cf-swap-active,a.cf-swap-link.cf-swap-active{text-decoration-style:solid;' +
        'background:rgba(245,158,11,.18);border-radius:3px}'
      ;(win.document.head || win.document.documentElement).appendChild(st)
    }
  } catch (e) { /* iframe torn down */ }
  // Image-swap triggers (<a data-cf-swap>) inside the shell. The authored anchor
  // still carries TipTap's target="_blank" href="#", so WITHOUT this an unhandled
  // click opens a blank window (the "popup"). Always preventDefault; swap the
  // cf-swap-target img in place when a resolved src is present (data-cf-swap-src),
  // toggling the active highlight. Idempotent per anchor.
  //
  // A11y (kept in lock-step with the published sco_shell.html runtime): each
  // operable trigger gets button semantics (role="button" + tabindex + aria-pressed
  // reflecting which variant is showing) and is keyboard-operable (Enter / Space,
  // Space preventDefault'd to stop page scroll). One visually-hidden aria-live
  // region per document announces the current view ("Showing <term>" / "Showing
  // default image"), and the target img's alt is updated so the swap is meaningful
  // without sight/color. The dead (unresolved) variant stays inert/aria-disabled.
  try {
    const doc = win.document
    // One polite live-region per document, reused for every announcement.
    const ensureSwapStatus = () => {
      let s = doc.getElementById('cf-swap-status')
      if (!s) {
        s = doc.createElement('div')
        s.id = 'cf-swap-status'
        s.setAttribute('role', 'status')
        s.setAttribute('aria-live', 'polite')
        s.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;'
          + 'border:0;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;white-space:nowrap'
        ;(doc.body || doc.documentElement).appendChild(s)
      }
      return s
    }
    doc.querySelectorAll('a[data-cf-swap]').forEach((a) => {
      if (a.__cfSwapWired) return
      a.__cfSwapWired = true
      // Prefer a server-stamped data-cf-swap-src; otherwise resolve the asset id
      // directly to its serve URL (mirrors the non-shell PreviewText swapImage path)
      // so the swap also works in the GUI-shell preview — the injected shell
      // frameHtml carries only data-cf-swap=<assetId>, never the resolved src.
      const cfId = a.getAttribute('data-cf-swap')
      const src = a.getAttribute('data-cf-swap-src')
        || (cfId && /^[\w-]+$/.test(cfId) ? '/api/media/serve/' + cfId : '')
      if (!src) {
        // Inert (truly unresolvable) trigger — never navigates, never operable.
        a.setAttribute('aria-disabled', 'true')
        a.addEventListener('click', (ev) => { try { ev.preventDefault() } catch (e) { /* torn down */ } })
        return
      }
      a.setAttribute('role', 'button')
      a.setAttribute('tabindex', '0')
      if (!a.hasAttribute('aria-pressed')) a.setAttribute('aria-pressed', 'false')
      const activate = () => {
        try {
          const img = doc.querySelector('img.cf-swap-target')
          const wasActive = a.classList && a.classList.contains('cf-swap-active')
          // Reset every trigger's visual + pressed state, then re-assert the live one.
          doc.querySelectorAll('a[data-cf-swap]').forEach((t) => {
            if (t.classList) t.classList.remove('cf-swap-active')
            if (t.getAttribute('data-cf-swap-src')) t.setAttribute('aria-pressed', 'false')
          })
          const status = ensureSwapStatus()
          if (img) {
            if (!img.__cfDefaultSrc) img.__cfDefaultSrc = img.getAttribute('src')
            if (img.__cfDefaultAlt == null) img.__cfDefaultAlt = img.getAttribute('alt') || ''
            const term = (a.textContent || '').trim()
            if (wasActive) {
              img.setAttribute('src', img.__cfDefaultSrc)
              img.setAttribute('alt', img.__cfDefaultAlt)
              status.textContent = 'Showing default image'
            } else {
              img.setAttribute('src', src)
              img.setAttribute('alt', term ? ('Showing ' + term) : (img.__cfDefaultAlt || ''))
              if (a.classList) a.classList.add('cf-swap-active')
              a.setAttribute('aria-pressed', 'true')
              status.textContent = term ? ('Showing ' + term) : 'Showing image'
            }
          }
        } catch (e) { /* iframe torn down */ }
      }
      a.addEventListener('click', (ev) => { try { ev.preventDefault() } catch (e) { /* torn down */ } ; activate() })
      a.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
          try { ev.preventDefault() } catch (e) { /* torn down */ }
          activate()
        }
      })
    })
  } catch (e) { /* iframe torn down */ }
}

function PreviewBlock({ block, fill = false, interactive = false, active = false, onSelect = null, updateBlock = null }) {
  switch (block.type) {
    case 'text':    return <PreviewText    block={block} />
    case 'media':   return <PreviewMedia   block={block} fill={fill} />
    case 'quiz':    return <PreviewQuiz    block={block} />
    case 'hotspot': return <PreviewHotspot block={block}
                      interactive={interactive} active={active} onSelect={onSelect} updateBlock={updateBlock} />
    case 'callout': return <PreviewCallout block={block} />
    case 'branch':  return <PreviewBranch  block={block} />
    case 'wcn':     return <PreviewWCN     block={block} />
    case 'ivideo':  return <PreviewIVideo  block={block} fill={fill}
                      interactive={interactive} active={active} onSelect={onSelect} updateBlock={updateBlock} />
    case 'model3d': return <PreviewModel3D block={block} fill={fill} />
    case 'oam':     return <PreviewOAM     block={block} fill={fill} />
    default:        return (
      <div style={previewBlockWrap}>
        <p style={{ color: '#888', fontSize: 13 }}>
          [{block.type} block — preview not yet implemented]
        </p>
      </div>
    )
  }
}

// True if `id` is a real frame in the active project tree. Shared by PreviewText
// (inline frame-links) and PreviewBranch — the client mirror of the server
// resolvers' "unknown id -> no navigation" guard.
export function frameExistsInProject(project, id) {
  if (!id) return false
  for (const course of project?.courses || [])
    for (const mod of course.modules || [])
      for (const lesson of mod.lessons || [])
        for (const fr of lesson.frames || [])
          if (fr.id === id) return true
  return false
}

// Amber-underline styling for inline frame-links inside text bodies (mirrors the
// server's _CF_FRAME_LINK_CSS). Injected once so the in-canvas render matches the
// published SCO / live-preview look. The dead variant is muted + not-allowed.
const CF_FRAME_LINK_STYLE_ID = 'cf-frame-link-style'
function ensureFrameLinkStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(CF_FRAME_LINK_STYLE_ID)) return
  const el = document.createElement('style')
  el.id = CF_FRAME_LINK_STYLE_ID
  el.textContent =
    '.cf-frame-link{color:#B45309;text-decoration:underline;text-decoration-color:#F59E0B;' +
    'text-decoration-thickness:2px;text-underline-offset:2px;cursor:pointer;font-weight:600}' +
    '.cf-frame-link:hover{color:#92400E;text-decoration-color:#B45309}' +
    '.cf-frame-link--dead{color:#9aa4b2;text-decoration-style:dotted;cursor:not-allowed;font-weight:400}'
  document.head.appendChild(el)
}

// Amber dotted-underline styling for inline image-swap triggers (mirrors the
// server's _CF_SWAP_LINK_CSS). Injected once so the in-canvas render matches the
// published SCO / live-preview look. The active variant (set on click) is a solid
// amber underline; the dead variant is muted + not-allowed.
const CF_SWAP_LINK_STYLE_ID = 'cf-swap-link-style'
function ensureSwapLinkStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(CF_SWAP_LINK_STYLE_ID)) return
  const el = document.createElement('style')
  el.id = CF_SWAP_LINK_STYLE_ID
  // Target both .cf-swap-link (server-resolved markup) and a[data-cf-swap] (the
  // raw author HTML the in-canvas React render shows before any server pass), so
  // the trigger reads as interactive in every context.
  el.textContent =
    '.cf-swap-link,.cf-preview-richtext a[data-cf-swap]{color:#B45309;text-decoration:underline;' +
    'text-decoration-style:dotted;text-decoration-color:#F59E0B;text-decoration-thickness:2px;' +
    'text-underline-offset:2px;cursor:pointer;font-weight:600}' +
    '.cf-swap-link:hover,.cf-preview-richtext a[data-cf-swap]:hover{color:#92400E;text-decoration-color:#B45309}' +
    '.cf-swap-active{text-decoration-style:solid !important;background:rgba(245,158,11,.16);border-radius:3px}' +
    '.cf-swap-link--dead{color:#9aa4b2;text-decoration-style:dotted;cursor:not-allowed;font-weight:400}'
  document.head.appendChild(el)
}

function PreviewText({ block }) {
  const loadFrame     = useEditorStore(s => s.loadFrame)
  const activeProject = useProjectStore(s => s.activeProject)

  useEffect(() => { ensureFrameLinkStyle(); ensureSwapLinkStyle() }, [])

  // Image-swap: change the frame's media image (the first img.cf-swap-target) to
  // the trigger's asset. Mirrors the SCO runtime (sco_shell*): resolve the asset id
  // to '/api/media/serve/<id>', capture the image's default src once, and toggle a
  // .cf-swap-active highlight on the live trigger; clicking the active trigger
  // reverts to default. The swap target lives in a SIBLING image block, so we walk
  // up from the anchor to the nearest ancestor that contains an img.cf-swap-target.
  // Fully guarded — no target / bad id / thrown DOM op silently no-ops.
  const swapImage = (a) => {
    try {
      const id = a.getAttribute('data-cf-swap')
      if (!id || !/^[\w-]+$/.test(id)) return            // inert / hostile id -> no-op
      // Find the swap-target img within the current frame (walk up a bounded number
      // of ancestors, then fall back to document — one frame renders at a time).
      let img = null, node = a
      for (let i = 0; i < 8 && node; i++) {
        if (node.querySelector) { const found = node.querySelector('img.cf-swap-target'); if (found) { img = found; break } }
        node = node.parentElement
      }
      if (!img && typeof document !== 'undefined') img = document.querySelector('img.cf-swap-target')
      if (!img) return                                   // no surface -> no-op
      const src = `/api/media/serve/${id}`
      if (img.dataset.cfDefaultSrc == null) img.dataset.cfDefaultSrc = img.getAttribute('src') || ''
      const wasActive = a.classList.contains('cf-swap-active')
      // Clear active on every swap trigger in the frame (find them from the anchor's
      // root the same way we found the image), then set the new state.
      const root = node || document
      try { (root.querySelectorAll ? root : document).querySelectorAll('a.cf-swap-link, a[data-cf-swap]').forEach(t => t.classList.remove('cf-swap-active')) } catch { /* noop */ }
      if (wasActive) {
        if (img.dataset.cfDefaultSrc) img.setAttribute('src', img.dataset.cfDefaultSrc)
        return                                           // toggle-off -> revert to default
      }
      img.setAttribute('src', src)
      try { a.classList.add('cf-swap-active') } catch { /* noop */ }
    } catch { /* never let a swap click abort the render */ }
  }

  // Intercept clicks on inline frame-links (<a data-cf-frame="<id>">) AND inline
  // image-swap triggers (<a data-cf-swap="<assetId>">). Frame-links navigate via
  // the store's loadFrame (no raw <a href> nav in the editor preview); swap
  // triggers change the frame's media image in place. Both fully guarded so a
  // bad/missing id never throws (and never aborts the render).
  const onBodyClick = (e) => {
    try {
      // Frame-link first (a term can't be both — data-cf-frame wins if somehow both).
      const fa = e.target && e.target.closest && e.target.closest('a[data-cf-frame]')
      if (fa) {
        e.preventDefault(); e.stopPropagation()
        const id = fa.getAttribute('data-cf-frame')
        if (frameExistsInProject(activeProject, id)) loadFrame(id)
        return
      }
      const sa = e.target && e.target.closest && e.target.closest('a[data-cf-swap]')
      if (!sa) return
      e.preventDefault(); e.stopPropagation()
      swapImage(sa)
    } catch { /* never let a stray click handler abort the render */ }
  }

  return (
    <div style={previewBlockWrap}>
      {block.data.body && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegated click on rendered rich text (image-swap affordance); editor-only convenience, primary controls live in the block panel
        <div
          className="cf-preview-richtext"
          onClick={onBodyClick}
          style={{ fontSize: 'var(--cf-preview-body, 18px)', lineHeight: 1.7, color: '#1a1a1a', marginBottom: 12 }}
          dangerouslySetInnerHTML={{ __html: block.data.body }}
        />
      )}
      {block.data.narrator_script && (
        <div style={{
          padding: '10px 14px',
          background: '#F0F6FF',
          borderLeft: '3px solid #185FA5',
          borderRadius: '0 4px 4px 0',
          fontSize: 13,
          color: '#185FA5',
          fontStyle: 'italic',
        }}>
          🎙 {block.data.narrator_script}
        </div>
      )}
    </div>
  )
}

// Branded slim audio player — navy surface, amber accent, IBM Plex Mono time,
// video-matched playback rates. dock='bottom' pins it full-width to the bottom
// of the nearest positioned ancestor (the content area); 'inline' flows.
const CF_AUDIO_NAVY  = '#042C53'
const CF_AUDIO_AMBER = '#F59E0B'
const CF_AUDIO_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60), x = Math.floor(s % 60)
  return `${m}:${x < 10 ? '0' : ''}${x}`
}

function AudioBar({ src, caption = '', dock = 'inline' }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [rateIdx, setRateIdx] = useState(CF_AUDIO_RATES.indexOf(1))
  const docked = dock === 'bottom'

  // Stop + release the underlying <audio> when this bar unmounts (e.g. an
  // inline⇄docked toggle swaps which bar renders). Without this, a playing
  // docked bar would keep its audio going after React swaps it out, producing a
  // phantom "duplicate" that plays alongside the new bar.
  useEffect(() => () => {
    const a = audioRef.current
    if (a) { try { a.pause() } catch (e) { /* noop */ } a.removeAttribute('src'); a.load() }
  }, [])

  const toggle = () => {
    const a = audioRef.current; if (!a) return
    if (a.paused) a.play(); else a.pause()
  }
  const seek = (e) => {
    const a = audioRef.current; if (!a || !dur) return
    a.currentTime = (Number(e.target.value) / 1000) * dur
  }
  const cycleRate = () => {
    const next = (rateIdx + 1) % CF_AUDIO_RATES.length
    setRateIdx(next)
    if (audioRef.current) audioRef.current.playbackRate = CF_AUDIO_RATES[next]
  }

  const bar = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, height: 48,
      padding: '0 12px', boxSizing: 'border-box',
      background: docked ? 'rgba(4,44,83,0.96)' : CF_AUDIO_NAVY, color: '#E8EEF6',
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    }}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- audio narration element; a captions <track> is not applicable, transcript/caption text is surfaced separately */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0) }}
        onLoadedMetadata={e => setDur(e.target.duration || 0)}
        onTimeUpdate={e => setCur(e.target.currentTime || 0)}
      />
      <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}
        style={{
          flex: '0 0 auto', width: 32, height: 32, border: 'none', borderRadius: '50%',
          background: CF_AUDIO_AMBER, color: CF_AUDIO_NAVY, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, lineHeight: 1, padding: 0,
        }}>
        {playing
          ? <Pause width={18} height={18} color={CF_AUDIO_NAVY} />
          : <Play width={18} height={18} color={CF_AUDIO_NAVY} />}
      </button>
      <span style={{ flex: '0 0 auto', fontSize: 12, letterSpacing: '.02em' }}>{fmtTime(cur)}</span>
      <input type="range" min={0} max={1000} step={1} aria-label="Seek"
        value={dur ? Math.round((cur / dur) * 1000) : 0}
        onChange={seek}
        style={{ flex: '1 1 auto', height: 4, accentColor: CF_AUDIO_AMBER, cursor: 'pointer', minWidth: 60 }} />
      <span style={{ flex: '0 0 auto', fontSize: 12, letterSpacing: '.02em', color: '#9FB4CC' }}>{fmtTime(dur)}</span>
      <button type="button" onClick={cycleRate} aria-label="Playback speed"
        style={{
          flex: '0 0 auto', minWidth: 42, height: 26,
          border: '1px solid rgba(245,158,11,.5)', borderRadius: 6,
          background: 'transparent', color: CF_AUDIO_AMBER, cursor: 'pointer',
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, padding: '0 6px',
        }}>
        {CF_AUDIO_RATES[rateIdx]}x
      </button>
    </div>
  )

  if (docked) {
    return (
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40,
        padding: '8px 12px', boxSizing: 'border-box',
        background: 'rgba(4,44,83,0.96)', boxShadow: '0 -2px 12px rgba(0,0,0,0.18)',
      }}>{bar}</div>
    )
  }
  return (
    <div style={{ margin: '8px 0' }}>
      {bar}
      {caption && <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{caption}</div>}
    </div>
  )
}

function PreviewMedia({ block, fill = false }) {
  const icons = { image: '🖼', video: '🎬', audio: '🎙', oam: '⚙' }
  const kind = block.data.kind
  const d = block.data
  // In a layout zone (overlay fill) media fills its box exactly like explicit
  // bounds do — coalesce the two so every `b` branch below picks up fill.
  const _fillBounds = d.bounds || (fill ? { width: 16, height: 9 } : null)

  // Live video: a real uploaded asset can't render in an <img> — use <video>.
  if (kind === 'video' && d.asset_id) {
    const cf = d.asset_meta?.companion_files
    const poster = d.asset_meta?.has_poster && cf?.poster_asset_id
      ? `/api/media/serve/${cf.poster_asset_id}` : undefined
    const b = _fillBounds
    return (
      <div style={b ? { width: '100%', height: '100%' } : { ...previewBlockWrap, textAlign: 'center' }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions <track> rendered conditionally below when a VTT companion exists */}
        <video controls src={`/api/media/serve/${d.asset_id}`} poster={poster}
          style={b ? { width: '100%', height: '100%', objectFit: d.fit || 'contain' } : { maxWidth: '100%' }} aria-label={d.original_name || 'Video'}>
          {d.asset_meta?.has_captions && cf?.vtt_asset_id &&
            <track kind="captions" src={`/api/media/serve/${cf.vtt_asset_id}`} srcLang="en" label="English" default />}
        </video>
        {!b && d.caption && <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{d.caption}</div>}
      </div>
    )
  }

  // Live audio: branded slim bar (real asset, or a seeded placeholder serve_url —
  // e.g. the demo audio block). Respects d.dock ('inline' | 'bottom').
  if (kind === 'audio' && (d.asset_id || d.serve_url)) {
    const src = d.serve_url || `/api/media/serve/${d.asset_id}`
    return <AudioBar src={src} caption={d.caption} dock={d.dock || 'inline'} />
  }

  // Live cover video: a real uploaded asset that fills its content area. Plays
  // seamlessly (muted/loop/autoplay/playsinline) AND exposes native controls so
  // it's a usable content video. Because the native control bar sits at the
  // bottom, the caption rides on a TOP-down gradient scrim (white text) so it
  // never overlaps the controls. Mirrors the cover image branch.
  if (kind === 'video' && d.asset_id && d.fit === 'cover') {
    const cf = d.asset_meta?.companion_files
    const poster = d.asset_meta?.has_poster && cf?.poster_asset_id
      ? `/api/media/serve/${cf.poster_asset_id}` : undefined
    const b = _fillBounds
    // dock='bottom' fills the content box so the native playbar snaps flush to
    // the content-area bottom (no gap underneath); 'inline' (default) flows with
    // height:auto as before. Mirrors the audio block's dock toggle. Only the
    // unbounded layout:'full' flow needs the fill — bounded blocks already fill.
    const docked = (d.dock || 'inline') === 'bottom'
    const coverWrap = b
      ? { width: '100%', aspectRatio: `${b.width || 16} / ${b.height || 9}`, maxHeight: '70vh' }
      : docked
        ? { width: '100%', aspectRatio: '16 / 9', maxHeight: '70vh' }
        : null
    const fillH = b || docked
    return (
      <div style={{ position: 'relative', overflow: 'hidden',
        ...(coverWrap || { width: '100%', display: 'block', lineHeight: 0 }) }}>
        <video controls muted autoPlay playsInline src={`/api/media/serve/${d.asset_id}`} poster={poster}
          style={fillH ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
                   : { width: '100%', height: 'auto', objectFit: 'cover', display: 'block' }}
          aria-label={d.original_name || 'Video'}>
          {d.asset_meta?.has_captions && cf?.vtt_asset_id &&
            <track kind="captions" src={`/api/media/serve/${cf.vtt_asset_id}`} srcLang="en" label="English" default />}
        </video>
        {d.caption && (
          <div style={{
            position: 'absolute', left: 0, right: 0, top: 0,
            padding: '12px 16px 28px', color: '#fff', fontSize: 13, lineHeight: 1.45,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0.45) 50%, transparent)', textShadow: '0 1px 3px rgba(0,0,0,0.85)',
          }}>{d.caption}</div>
        )}
      </div>
    )
  }

  // Placeholder/seeded video (serve_url only, no uploaded asset — e.g. the demo
  // Video Block). A <video> can't render an SVG as its source, so the SVG rides
  // as the poster and the player shows it: a visible <video controls poster=...>
  // that fills the content area. Mirrors the cover image+caption scrim treatment.
  if (kind === 'video' && d.serve_url) {
    const b = _fillBounds
    const poster = d.poster_url || d.serve_url
    // dock='bottom' fills the content box so the native playbar snaps flush to the
    // content-area bottom (no gap underneath); 'inline' (default) flows as before.
    const docked = (d.dock || 'inline') === 'bottom'
    const coverWrap = b
      ? { width: '100%', aspectRatio: `${b.width || 16} / ${b.height || 9}`, maxHeight: '70vh' }
      : docked
        ? { width: '100%', aspectRatio: '16 / 9', maxHeight: '70vh' }
        : null
    const fillH = b || docked
    return (
      <div style={{ position: 'relative', overflow: 'hidden',
        ...(coverWrap || { width: '100%', display: 'block', lineHeight: 0 }) }}>
        <video controls muted playsInline poster={poster} src={d.serve_url}
          style={fillH ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
                   : { width: '100%', height: 'auto', objectFit: 'cover', display: 'block' }}
          aria-label={d.original_name || 'Video'} />
        {d.caption && (
          <div style={{
            position: 'absolute', left: 0, right: 0, top: 0,
            padding: '12px 16px 28px', color: '#fff', fontSize: 13, lineHeight: 1.45,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0.45) 50%, transparent)', textShadow: '0 1px 3px rgba(0,0,0,0.85)',
          }}>{d.caption}</div>
        )}
      </div>
    )
  }

  // If a placeholder/asset image is available (demo blocks seed an SVG data-URI
  // in serve_url), render it so the preview shows the intended media slot.
  if (block.data.serve_url && (kind === 'image' || kind === 'video')) {
    const b = _fillBounds
    const isCover = d.fit === 'cover'
    const caption = block.data.caption
    // A bounded cover image sized purely with height:100% collapses to nothing
    // when it isn't inside a height-providing parent (the no-GUI flow column has
    // no fixed height) — that degenerate layout is what pushed the title/caption
    // off-screen. Drive the wrapper height from the bounds aspect ratio instead,
    // and cap it to the viewport (70vh) so the frame + caption always stay above
    // the fold. Inside a sized BoundsBox the wrapper still fills width and the box
    // clips, so this is safe in both contexts.
    // Inside a height-providing parent (a BoundsBox or a layout zone — fill=true)
    // fill it outright so a cover image crops to fill. The aspectRatio + 70vh cap
    // is ONLY for the flow column, which has no height to fill (there height:100%
    // would collapse to nothing).
    const coverWrap = b
      ? (fill
          ? { width: '100%', height: '100%' }
          : { width: '100%', aspectRatio: `${b.width || 16} / ${b.height || 9}`, maxHeight: '70vh' })
      : null
    // Cover image WITH a caption: overlay the caption on the image over a
    // bottom-up gradient scrim (white text, WCAG AA) so it stays readable over
    // any image and never pushes content below the fold. The relative wrapper
    // anchors the caption pinned to the bottom.
    if (isCover && caption) {
      return (
        <div style={{ position: 'relative', overflow: 'hidden',
          ...(coverWrap || { width: '100%', display: 'inline-block', lineHeight: 0 }) }}>
          <img
            className={kind === 'image' ? 'cf-swap-target' : undefined}
            src={block.data.serve_url}
            alt={block.data.alt_text || block.data.placeholder_label || `${kind} placeholder`}
            style={b ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } : { width: '100%', height: 'auto', objectFit: 'cover', display: 'block' }}
          />
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '28px 16px 12px', color: '#fff', fontSize: 13, lineHeight: 1.45,
            background: 'linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.5) 50%, rgba(0,0,0,0))', textShadow: '0 1px 3px rgba(0,0,0,0.85)',
          }}>{caption}</div>
        </div>
      )
    }
    return (
      <div style={coverWrap ? { ...coverWrap, overflow: 'hidden' } : { ...previewBlockWrap, textAlign: 'center' }}>
        <img
          className={kind === 'image' ? 'cf-swap-target' : undefined}
          src={block.data.serve_url}
          alt={block.data.alt_text || block.data.placeholder_label || `${kind} placeholder`}
          // Image comes in as-is — no engine-imposed rounding/border/crop. When
          // bounded with cover fit it fills the frame; otherwise natural size.
          style={b ? { width: '100%', height: '100%', objectFit: d.fit || 'cover', display: 'block' } : { maxWidth: '100%', display: 'block' }}
        />
        {!b && block.data.caption && (
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{block.data.caption}</div>
        )}
      </div>
    )
  }

  return (
    <div style={{ ...previewBlockWrap, textAlign: 'center' }}>
      <div style={{
        padding: '32px 20px',
        border: '2px dashed #B5D4F4',
        borderRadius: 6,
        background: '#F8FBFF',
        color: '#185FA5',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{icons[kind] || '📎'}</div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          [{kind}: {block.data.placeholder_label || 'no label'}]
        </div>
        {block.data.caption && (
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{block.data.caption}</div>
        )}
      </div>
    </div>
  )
}

function PreviewQuiz({ block }) {
  const [selected, setSelected]   = useState(null)
  const [submitted, setSubmitted] = useState(false)

  const choices = block.data.choices || []
  const correct = block.data.correct_index ?? 0
  const isRight = selected === correct

  return (
    <div style={{ ...previewBlockWrap, background: '#FAFAFA', border: '1px solid #E0E0E0', borderRadius: 8, padding: 20 }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#042C53', marginBottom: 16 }}>
        {block.data.question || 'Question not set'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {choices.map((choice, idx) => {
          let bg = '#fff', border = '#ddd', color = '#1a1a1a'
          if (submitted) {
            if (idx === correct) { bg = '#EAF6EC'; border = '#3B8A4A'; color = '#1E7E34' }
            else if (idx === selected) { bg = '#FDECEA'; border = '#C0392B'; color = '#C0392B' }
          } else if (idx === selected) {
            border = '#185FA5'; bg = '#F0F6FF'
          }
          return (
            <button
              key={idx}
              onClick={() => !submitted && setSelected(idx)}
              style={{
                padding: '10px 14px',
                border: `2px solid ${border}`,
                borderRadius: 6,
                background: bg,
                color,
                fontSize: 14,
                textAlign: 'left',
                cursor: 'default',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {choice}
            </button>
          )
        })}
      </div>

      {!submitted && selected !== null && (
        <button
          onClick={() => setSubmitted(true)}
          style={{
            padding: '8px 20px',
            background: '#185FA5',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'default',
            fontFamily: 'inherit',
          }}
        >
          Submit
        </button>
      )}

      {submitted && (
        <div style={{
          padding: '10px 14px',
          background: isRight ? '#EAF6EC' : '#FDECEA',
          border: `1px solid ${isRight ? '#3B8A4A' : '#C0392B'}`,
          borderRadius: 6,
          fontSize: 13,
          color: isRight ? '#1E7E34' : '#C0392B',
          fontWeight: 500,
        }}>
          {isRight
            ? block.data.feedback_correct || 'Correct!'
            : block.data.feedback_incorrect || 'Incorrect — please review.'}
        </div>
      )}
    </div>
  )
}

// In-canvas callout overlay.
//
// Two modes, gated by `interactive` (true ONLY in the editor's live preview, i.e.
// when FramePreview was handed an onBlockSelect handler):
//
//   • interactive=false → STATIC render. Emits the EXACT overlay HTML the string
//     path (renderBlockToHTML) and the server (scorm12._callout_overlay_html) emit,
//     via dangerouslySetInnerHTML, so read-only previews / shelled string renders /
//     the published SCO all match byte-for-byte (box + connector line only, NO
//     target handle, NO drag, NO contentEditable).
//
//   • interactive=true → EDITABLE overlay. The box is draggable (box.x/y = CENTER),
//     clicking it selects the block; when selected, a small round TARGET handle (an
//     editor-only affordance, never published) aims the connector line and the box
//     text is contentEditable with live width reflow honoring the padding. Geometry
//     is identical to the static overlay (line box-center→target, opaque box covers
//     the segment beneath it) and the box style is CALLOUT_STYLE, so what you edit
//     matches what publishes.
//
// The overlay layer is absolute/inset:0 and anchors to the outer FramePreview
// position:relative container (which also anchors WCN/audio).
function PreviewCallout({ block, interactive = false, active = false, onSelect = null, updateBlock = null }) {
  if (!interactive) {
    return <div dangerouslySetInnerHTML={{ __html: buildCalloutOverlayHTML(block.data || {}) }} />
  }
  return <InteractiveCallout block={block} active={active} onSelect={onSelect} updateBlock={updateBlock} />
}

const _clampPc = v => Math.max(0, Math.min(100, v))
const _r1 = n => Math.round(n * 10) / 10

// Inject the editor-only "marching ants" keyframes/class ONCE. Animated gradient
// dashes auto-size to the box and only render when a callout is active (selected/
// editing). Editor-only — never part of the published overlay.
let _cfCalloutAntsInjected = false
function _ensureCalloutAntsCSS() {
  if (_cfCalloutAntsInjected || typeof document === 'undefined') return
  _cfCalloutAntsInjected = true
  const style = document.createElement('style')
  style.setAttribute('data-cf-callout-ants', '')
  style.textContent =
    '@keyframes cfCalloutAnts{to{background-position:14px 0,-14px 100%,0 -14px,100% 14px}}'
    + '.cf-callout-ants{background-image:linear-gradient(90deg,var(--forge-amber) 50%,transparent 50%),'
    + 'linear-gradient(90deg,var(--forge-amber) 50%,transparent 50%),'
    + 'linear-gradient(0deg,var(--forge-amber) 50%,transparent 50%),'
    + 'linear-gradient(0deg,var(--forge-amber) 50%,transparent 50%);'
    + 'background-repeat:repeat-x,repeat-x,repeat-y,repeat-y;'
    + 'background-size:14px 2px,14px 2px,2px 14px,2px 14px;'
    + 'background-position:0 0,0 100%,0 0,100% 0;'
    + 'animation:cfCalloutAnts .55s linear infinite}'
  document.head.appendChild(style)
}

// Editor-only interactive callout overlay (see PreviewCallout). Drag the box to
// move (box CENTER), drag the round target handle to aim the line, edit the text
// inline. Coordinates are normalized 0-100 of the overlay layer (the content area).
function InteractiveCallout({ block, active, onSelect, updateBlock }) {
  const layerRef = useRef(null)
  const boxRef   = useRef(null)
  const drag     = useRef(null)            // { mode:'box'|'target', dx, dy }
  const [live, setLive] = useState(null)   // { box:{x,y}, target:{x,y} } while dragging
  const [hover, setHover] = useState(false)

  const data    = block.data || {}
  const box     = (live && live.box)    || data.box    || { x: 55, y: 60 }
  const target  = (live && live.target) || data.target || { x: 32, y: 32 }
  const text    = data.text != null ? data.text : 'Callout'
  const padding = data.padding != null ? Number(data.padding) : 10
  const anchorField = data.anchor != null ? data.anchor : 'auto'
  const S = CALLOUT_STYLE

  // Keep the contentEditable box in sync with external text changes (panel input),
  // but never clobber the caret while the author is typing in the box itself.
  useLayoutEffect(() => {
    if (boxRef.current && document.activeElement !== boxRef.current
        && boxRef.current.textContent !== text) {
      boxRef.current.textContent = text
    }
  }, [text])

  const relPos = e => {
    const r = layerRef.current.getBoundingClientRect()
    return {
      x: _clampPc(((e.clientX - r.left) / r.width) * 100),
      y: _clampPc(((e.clientY - r.top) / r.height) * 100),
    }
  }

  const startDrag = (mode, anchor) => e => {
    e.stopPropagation(); e.preventDefault()
    if (onSelect) onSelect(block.id)
    const p = relPos(e)
    drag.current = { mode, dx: p.x - anchor.x, dy: p.y - anchor.y }
    // FREEZE the resolved side for the duration of a BOX drag (compute it once at
    // drag start) so an 'auto' callout doesn't flip sides as the box crosses the
    // target mid-drag. Re-resolved when idle / after drop (and on target drag).
    if (mode === 'box') {
      drag.current.side = resolveCalloutAnchor(
        anchorField, _r1(_clampPc(box.x)), _r1(_clampPc(box.y)),
        _r1(_clampPc(target.x)), _r1(_clampPc(target.y)))
    }
    setLive({ box: { ...box }, target: { ...target } })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onMove = e => {
    const d = drag.current
    if (!d) return
    const p = relPos(e)
    const nx = _r1(_clampPc(p.x - d.dx))
    const ny = _r1(_clampPc(p.y - d.dy))
    setLive(prev => {
      const base = prev || { box: { ...box }, target: { ...target } }
      return d.mode === 'box'
        ? { ...base, box: { x: nx, y: ny } }
        : { ...base, target: { x: nx, y: ny } }
    })
  }

  // Read the freshest live value off the setter (avoids a stale `live` closure).
  const onUp = () => {
    const d = drag.current
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    if (d) {
      setLive(cur => {
        if (cur && updateBlock) {
          updateBlock(block.id, d.mode === 'box' ? { box: cur.box } : { target: cur.target })
        }
        return null
      })
    }
    drag.current = null
  }

  const commitBoxText = () => {
    const t = (boxRef.current?.textContent || '').replace(/\s+/g, ' ').trim()
    if (t !== text && updateBlock) updateBlock(block.id, { text: t })
  }

  const bx = _r1(_clampPc(box.x)), by = _r1(_clampPc(box.y))
  const tx = _r1(_clampPc(target.x)), ty = _r1(_clampPc(target.y))
  // Resolved connecting edge. During an active BOX drag, use the side frozen at
  // drag start (so 'auto' won't flip mid-drag); otherwise resolve live from the
  // current geometry. Parity with calloutOverlay.js / scorm12.
  const side = (drag.current && drag.current.mode === 'box' && drag.current.side)
    ? drag.current.side
    : resolveCalloutAnchor(anchorField, bx, by, tx, ty)
  const boxTransform = calloutAnchorTransform(side)
  // Box-side line endpoint tucked into the box (parity with the static overlay).
  const lineEnd = calloutLineBoxEnd(bx, by, tx, ty)
  _ensureCalloutAntsCSS()

  return (
    <div ref={layerRef} className="cf-callout-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, userSelect: 'none' }}>
      {/* Connector line: connection point (box.x,box.y) → target, straight. The box
          is positioned so its facing edge-center sits on that point and extends away
          from the target — same geometry as the static overlay. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.85))' }}>
        <line x1={lineEnd[0]} y1={lineEnd[1]} x2={tx} y2={ty}
          stroke={S.line} strokeWidth={S.lineWidth} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </svg>

      {/* Target handle — EDITOR-ONLY affordance (never published). Shown on the
          selected callout; drag to aim the connector line. */}
      {active && (
        /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- editor-only pointer-drag handle to aim the connector; no keyboard-drag equivalent, target is also set via block fields */
        <div
          onMouseDown={startDrag('target', target)}
          title="Target — drag to aim the connector line"
          style={{
            position: 'absolute', left: `${tx}%`, top: `${ty}%`,
            width: 24, height: 24, marginLeft: -12, marginTop: -12,
            borderRadius: '50%', background: S.line,
            border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
            cursor: 'move', pointerEvents: 'auto', zIndex: 7,
          }}
        />
      )}

      {/* Box — drag to move (box.x/y = CONNECTION POINT, the facing edge-center),
          click to select. Inline-editable when selected, with LIVE width reflow
          (inline-block auto-width honoring the per-block padding). Visual style ===
          CALLOUT_STYLE so it matches what publishes. The per-anchor transform places
          the chosen edge-center on (bx,by) so the box extends away from the target. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- editor-only pointer affordance to select/drag the callout box; the block is also selectable via its SelectableBlock wrapper */}
      <div
        onMouseDown={e => { e.stopPropagation(); onSelect && onSelect(block.id) }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title="Drag the grip to move · click the text to edit"
        style={{
          position: 'absolute', left: `${bx}%`, top: `${by}%`,
          transform: boxTransform,
          maxWidth: '46%', cursor: 'default', pointerEvents: 'auto', zIndex: 6,
          outline: active
            ? 'none'
            : `2px dashed color-mix(in srgb, var(--forge-amber) ${hover ? 85 : 45}%, transparent)`,
          outlineOffset: 3, borderRadius: S.radius,
        }}>
        {/* Marching-ants active outline — animated dashed border that auto-sizes to
            the box. Editor-only; shown only when the callout is the active block and
            replaces the solid amber outline. Never part of the published overlay. */}
        {active && (
          <div aria-hidden="true" className="cf-callout-ants" style={{
            position: 'absolute', inset: -5, pointerEvents: 'none', zIndex: 7,
          }} />
        )}
        {/* Move grip — the DEDICATED drag handle. Drag it to reposition the box
            (startDrag also selects). Editor-only, shown on hover or when selected;
            never part of the published overlay. */}
        {(hover || active) && (
          <div aria-hidden="true"
            onMouseDown={startDrag('box', box)}
            title="Drag to reposition"
            style={{
            position: 'absolute', top: -16, left: -16, width: 32, height: 32,
            borderRadius: '50%', background: 'var(--forge-amber)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)', pointerEvents: 'auto', cursor: 'move', zIndex: 8,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff"
              strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
            </svg>
          </div>
        )}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- contentEditable inline text editor; native editing semantics are exposed to assistive tech and Enter is handled in onKeyDown */}
        <div
          ref={boxRef}
          contentEditable={active}
          suppressContentEditableWarning
          onMouseDown={e => { if (active) e.stopPropagation() }}  /* let the caret land; don't drag */
          onInput={() => { if (updateBlock) updateBlock(block.id, { text: boxRef.current.textContent }) }}
          onBlur={commitBoxText}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); boxRef.current.blur() } }}
          style={{
            display: 'inline-block', boxSizing: 'border-box',
            padding: `${padding}px`, borderRadius: S.radius,
            background: S.boxBg, color: S.boxText,
            border: `${S.borderWidth} solid ${S.boxBorder}`, boxShadow: S.shadow,
            font: `700 27px/1.35 'Inter', system-ui, sans-serif`,
            textAlign: 'center', whiteSpace: 'normal',
            cursor: active ? 'text' : 'move', outline: 'none', minWidth: 24,
          }}
        ></div>
      </div>
    </div>
  )
}

// Hotspot preview. Two modes, gated like PreviewCallout:
//   • interactive=false → the STATIC learner render (regions over the background,
//     click a region to reveal its label). This is what read-only previews use and
//     is byte-parity with renderBlockToHTML's `case 'hotspot'` string path and the
//     server SCO (scorm12) — nothing here changes the published output.
//   • interactive=true (editor preview, onBlockSelect present) → an EDITABLE overlay
//     where regions are DRAGGABLE boxes with corner RESIZE handles, committing
//     geometry via updateBlock. Editor-only affordance; never published.
function PreviewHotspot({ block, interactive = false, active = false, onSelect = null, updateBlock = null }) {
  if (interactive) {
    return <InteractiveHotspot block={block} active={active} onSelect={onSelect} updateBlock={updateBlock} />
  }
  return <StaticHotspot block={block} />
}

// Editor-only interactive hotspot overlay (see PreviewHotspot). Mirrors
// HotspotBlock's draw/move/resize math: regions are normalized 0-100 (% of the
// image), clamped 0..100 and rounded on commit. relPos is taken relative to the
// image/region container so drag + resize stay accurate at any preview scale.
// Drag a region body to move; drag a corner handle to resize (opposite edge(s)
// anchored). Drag empty image area to draw a new region.
function InteractiveHotspot({ block, active, onSelect, updateBlock }) {
  const canvasRef = useRef(null)
  const drag = useRef(null)                       // { mode, id, handle, ox, oy, base }
  const [draft, setDraft] = useState(null)        // { x, y, w, h } while drawing
  const [live, setLive]   = useState(null)        // { id, x, y, w, h } while moving/resizing
  const [sel, setSel]     = useState(null)        // selected region id (shows handles)

  const regions = block.data.regions || []
  const hasImg  = !!(block.data.image_id || block.data.background_url)
  const commit  = next => updateBlock && updateBlock(block.id, { regions: next })

  useEffect(() => { _ensureCalloutAntsCSS() }, [])
  // Mirror the selected region into the store so the inspector's region list can
  // highlight the row you're editing here in the preview (cleared on unmount).
  const setActiveRegion = useEditorStore(s => s.setActiveRegion)
  useEffect(() => { setActiveRegion(sel) }, [sel, setActiveRegion])
  useEffect(() => () => setActiveRegion(null), [setActiveRegion])
  const selRegion = regions.find(r => r.id === sel) || null
  // Scale the selected region uniformly about its center — a way to size it without
  // dragging each corner handle. Clamped into the canvas.
  const scaleSel = factor => {
    if (!selRegion) return
    const r = selRegion, cx = r.x + r.w / 2, cy = r.y + r.h / 2
    const w = Math.max(3, Math.min(100, r.w * factor)), h = Math.max(3, Math.min(100, r.h * factor))
    const x = Math.max(0, Math.min(100 - w, cx - w / 2)), y = Math.max(0, Math.min(100 - h, cy - h / 2))
    commit(regions.map(rr => (rr.id === r.id ? { ...rr, ...roundGeom({ x, y, w, h }) } : rr)))
  }
  // Reset the selected region to a true VISUAL square (a real circle for circle
  // shapes), using the live canvas aspect so a 16:9 image doesn't render it as an
  // ellipse. Squares to the smaller visual side, kept centered + on-canvas.
  const resetAspectSel = () => {
    const rect = canvasRef.current && canvasRef.current.getBoundingClientRect()
    if (!rect || !selRegion) return
    const r = selRegion
    const spx = Math.min((r.w / 100) * rect.width, (r.h / 100) * rect.height)
    const w = (spx / rect.width) * 100, h = (spx / rect.height) * 100
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2
    const x = Math.max(0, Math.min(100 - w, cx - w / 2)), y = Math.max(0, Math.min(100 - h, cy - h / 2))
    commit(regions.map(rr => (rr.id === r.id ? { ...rr, ...roundGeom({ x, y, w, h }) } : rr)))
  }

  const relPos = e => {
    const r = canvasRef.current.getBoundingClientRect()
    return {
      x: _clampPc(((e.clientX - r.left) / r.width) * 100),
      y: _clampPc(((e.clientY - r.top) / r.height) * 100),
    }
  }

  const onCanvasDown = e => {
    if (!hasImg || drag.current) return
    if (onSelect) onSelect(block.id)
    setSel(null)
    const p = relPos(e)
    drag.current = { mode: 'draw', ox: p.x, oy: p.y }
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const startMove = (e, r) => {
    e.stopPropagation()
    if (onSelect) onSelect(block.id)
    setSel(r.id)
    const p = relPos(e)
    drag.current = { mode: 'move', id: r.id, ox: p.x, oy: p.y, base: { ...r } }
    setLive({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const startResize = (e, r, handle) => {
    e.stopPropagation()
    if (onSelect) onSelect(block.id)
    setSel(r.id)
    const p = relPos(e)
    drag.current = { mode: 'resize', id: r.id, handle, ox: p.x, oy: p.y, base: { ...r } }
    setLive({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onMove = e => {
    const d = drag.current
    if (!d) return
    const p = relPos(e)
    if (d.mode === 'draw') {
      setDraft({ x: Math.min(d.ox, p.x), y: Math.min(d.oy, p.y), w: Math.abs(p.x - d.ox), h: Math.abs(p.y - d.oy) })
      return
    }
    const b = d.base
    if (d.mode === 'move') {
      setLive({ id: d.id, w: b.w, h: b.h,
        x: _clampPc2(b.x + (p.x - d.ox), 0, 100 - b.w),
        y: _clampPc2(b.y + (p.y - d.oy), 0, 100 - b.h) })
    } else { // resize — anchor the opposite edge(s)
      let { x, y, w, h } = b
      const right = b.x + b.w, bottom = b.y + b.h
      if (d.handle.includes('e')) w = _clampPc2(p.x, b.x + 3, 100) - x
      if (d.handle.includes('s')) h = _clampPc2(p.y, b.y + 3, 100) - y
      if (d.handle.includes('w')) { x = _clampPc2(p.x, 0, right - 3); w = right - x }
      if (d.handle.includes('n')) { y = _clampPc2(p.y, 0, bottom - 3); h = bottom - y }
      setLive({ id: d.id, x, y, w, h })
    }
  }

  const onUp = () => {
    const d = drag.current
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    if (d?.mode === 'draw') {
      setDraft(cur => {
        if (cur && cur.w >= 2 && cur.h >= 2) {
          const nr = { ...roundGeom(cur), shape: 'rect', label: `Region ${regions.length + 1}`, description: '', color: HOTSPOT_AMBER, id: crypto.randomUUID() }
          commit([...regions, nr])
          setSel(nr.id)
        }
        return null
      })
    } else if (d?.mode === 'move' || d?.mode === 'resize') {
      setLive(cur => {
        if (cur) commit(regions.map(r => (r.id === cur.id ? { ...r, ...roundGeom(cur) } : r)))
        return null
      })
    }
    drag.current = null
  }

  const geomOf = r => (live && live.id === r.id ? live : r)

  return (
    <div style={previewBlockWrap}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- editor-only pointer-drag drawing surface; regions are also keyboard-editable via the block panel */}
      <div
        ref={canvasRef}
        onMouseDown={onCanvasDown}
        style={{
          position: 'relative', width: '100%', paddingBottom: '56.25%',
          background: '#E8F0F8', border: '1px solid #B5D4F4',
          overflow: 'hidden', userSelect: 'none',
          cursor: hasImg ? 'crosshair' : 'default',
        }}>
        {block.data.background_url && (
          <img src={block.data.background_url} alt={block.data.alt_text || 'Hotspot background'}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
        )}

        {!hasImg && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>
            [Hotspot image — no asset linked]
          </div>
        )}

        {regions.map(r => {
          const g = geomOf(r)
          const st = hotspotStyle(r.color)
          const isSel = sel === r.id
          return (
            /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- editor-only pointer-drag move affordance; region geometry is also keyboard-editable via the block panel */
            <div key={r.id}
              onMouseDown={e => startMove(e, r)}
              title="Drag to move · drag a corner to resize"
              style={{
                position: 'absolute', left: `${g.x}%`, top: `${g.y}%`, width: `${g.w}%`, height: `${g.h}%`,
                border: `2px solid ${st.border}`,
                background: isSel ? rgba(st.stroke, 0.3) : st.fill,
                borderRadius: shapeRadius(r.shape),
                boxSizing: 'border-box', cursor: 'move',
              }}>
              {/* Marching ants on the selected region (overlay so it doesn't fight
                  the region's fill) — makes the one you're editing obvious. */}
              {isSel && (
                <div className="cf-callout-ants" aria-hidden="true"
                  style={{ position: 'absolute', inset: 0, borderRadius: shapeRadius(r.shape), pointerEvents: 'none' }} />
              )}
              <span style={{ position: 'absolute', top: 2, left: 6, fontSize: 10, color: st.stroke, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{r.label}</span>
              {isSel && Object.entries(HOTSPOT_HANDLES).map(([h, pos]) => (
                /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- editor-only pointer-drag resize handle; no keyboard-drag equivalent */
                <div key={h} onMouseDown={e => startResize(e, r, h)}
                  style={{ position: 'absolute', width: 10, height: 10, background: 'var(--forge-amber)',
                    border: '1px solid #042C53', borderRadius: 2, cursor: pos.cursor, ...pos }} />
              ))}
            </div>
          )
        })}

        {draft && (
          <div style={{
            position: 'absolute', left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%`,
            border: '2px dashed var(--forge-amber)', background: 'color-mix(in srgb, var(--forge-amber) 10%, transparent)',
            pointerEvents: 'none',
          }} />
        )}
      </div>
      {selRegion ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, flexWrap: 'wrap' }}>
          <span style={{ color: '#444', fontWeight: 700 }}>Editing: {selRegion.label}</span>
          <span style={{ color: '#ccc' }}>│</span>
          <span style={{ color: '#888' }}>Scale</span>
          <button type="button" onClick={() => scaleSel(0.9)} title="Scale down 10%" style={HS_CTRL_BTN}>−</button>
          <button type="button" onClick={() => scaleSel(1.1)} title="Scale up 10%" style={HS_CTRL_BTN}>+</button>
          <span style={{ color: '#ccc' }}>│</span>
          <button type="button" onClick={resetAspectSel} title="Square it up — reset to a true circle/square aspect" style={{ ...HS_CTRL_BTN, width: 'auto', padding: '0 9px' }}>⊙ Reset aspect</button>
        </div>
      ) : regions.length > 0 ? (
        <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
          Drag a region to move it; drag a corner to resize, or select one for scale + reset-aspect controls. Draw on empty image area to add a region.
        </p>
      ) : null}
    </div>
  )
}

const HS_CTRL_BTN = {
  height: 22, minWidth: 22, padding: 0, fontSize: 13, fontWeight: 700, lineHeight: 1,
  cursor: 'pointer', borderRadius: 5, border: '1px solid #B5D4F4',
  background: '#fff', color: '#042C53', fontFamily: 'var(--font-sans)',
}

const _clampPc2 = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const roundGeom = g => ({ x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.w), h: Math.round(g.h) })
const HOTSPOT_HANDLES = {
  nw: { left: -5, top: -5, cursor: 'nwse-resize' },
  ne: { right: -5, top: -5, cursor: 'nesw-resize' },
  sw: { left: -5, bottom: -5, cursor: 'nesw-resize' },
  se: { right: -5, bottom: -5, cursor: 'nwse-resize' },
}

// Static learner render — regions over the background, click a region to reveal
// its label. Byte-parity with the published SCO / renderBlockToHTML string path.
function StaticHotspot({ block }) {
  const [active, setActive] = useState(null)
  const regions = block.data.regions || []

  return (
    <div style={previewBlockWrap}>
      <div style={{
        position: 'relative',
        width: '100%',
        paddingBottom: '56.25%',
        background: '#E8F0F8',
        border: '1px solid #B5D4F4',
        overflow: 'hidden',
      }}>
        {block.data.background_url && (
          <img
            src={block.data.background_url}
            alt={block.data.alt_text || 'Hotspot background'}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}

        {!block.data.image_id && !block.data.background_url && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#888', fontSize: 13,
          }}>
            [Hotspot image — no asset linked]
          </div>
        )}

        {regions.map(r => {
          const st = hotspotStyle(r.color)
          return (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            aria-pressed={active === r.id}
            aria-label={r.label}
            onClick={() => setActive(active === r.id ? null : r.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(active === r.id ? null : r.id) } }}
            style={{
              position: 'absolute',
              left: `${r.x}%`, top: `${r.y}%`,
              width: `${r.w}%`, height: `${r.h}%`,
              border: `2px solid ${st.border}`,
              background: active === r.id ? rgba(st.stroke, 0.3) : st.fill,
              borderRadius: shapeRadius(r.shape),
              cursor: 'default',
              boxSizing: 'border-box',
              transition: 'all 0.15s',
            }}
          >
            {active === r.id && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0,
                background: '#042C53', color: '#fff',
                fontSize: 11, padding: '6px 9px', lineHeight: 1.4,
                borderRadius: '4px 4px 0 0', width: 'max-content', maxWidth: 240,
              }}>
                <strong>{r.label}</strong>
                {r.description ? <div style={{ marginTop: 2, opacity: 0.85 }}>{r.description}</div> : null}
              </div>
            )}
          </div>
          )
        })}
      </div>
      {regions.length > 0 && (
        <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
          Click hotspot regions to reveal labels.
        </p>
      )}
    </div>
  )
}

// In-canvas branch preview. Clicking a choice navigates to the target frame via
// the store's loadFrame — the same mechanism MenuFramePreview uses — so branch
// nav behaves in-canvas exactly as it does in the published SCO / live preview.
// A target id that isn't an actual frame in the project renders disabled (no
// dead navigation), matching the menu's unresolved-target handling.
function PreviewBranch({ block }) {
  const loadFrame     = useEditorStore(s => s.loadFrame)
  const activeProject = useProjectStore(s => s.activeProject)

  // Accept current (*_frame_id) and legacy (*_frame) keys, mirroring the packager.
  const trueId  = block.data.true_frame_id  || block.data.true_frame  || ''
  const falseId = block.data.false_frame_id || block.data.false_frame || ''

  const trueOk  = frameExistsInProject(activeProject, trueId)
  const falseOk = frameExistsInProject(activeProject, falseId)

  const btnStyle = (ok, color) => ({
    flex: 1, padding: '12px 16px',
    background: '#fff', color,
    border: `2px solid ${color}`,
    borderRadius: 6, fontSize: 14, fontWeight: 600,
    cursor: ok ? 'pointer' : 'not-allowed',
    opacity: ok ? 1 : 0.5, fontFamily: 'inherit',
  })

  return (
    <div style={{ ...previewBlockWrap, background: '#F8F8FF', border: '1px solid #CECBF6', borderRadius: 8, padding: 20 }}>
      {block.data.condition && (
        <p style={{ fontSize: 15, fontWeight: 600, color: '#042C53', marginBottom: 16 }}>
          {block.data.condition}
        </p>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => trueOk && loadFrame(trueId)}
          disabled={!trueOk}
          title={trueOk ? 'Go to target frame' : 'No target frame set'}
          style={btnStyle(trueOk, '#3B8A4A')}
        >
          ✓ {block.data.true_label || 'Yes'}
        </button>
        <button
          onClick={() => falseOk && loadFrame(falseId)}
          disabled={!falseOk}
          title={falseOk ? 'Go to target frame' : 'No target frame set'}
          style={btnStyle(falseOk, '#C0392B')}
        >
          ✕ {block.data.false_label || 'No'}
        </button>
      </div>
    </div>
  )
}

function PreviewWCN({ block }) {
  const [acknowledged, setAcknowledged] = React.useState(false)
  const [modalOpen,    setModalOpen]    = React.useState(false)
  const triggerRef  = React.useRef(null)
  const modalRef    = React.useRef(null)

  const type = block.data.wcn_type || 'note'
  // theme    -- brand hex (stripes / chip border / card border)
  // chipText -- AA-legible chip LABEL on white: theme for warning/note; caution
  //             yellow (#eed202) fails on white (1.52:1) so its chip wears
  //             near-black text while the yellow still drives the stripes/border.
  const cfg  = {
    warning: { tag:'WARNING', tagBg:'#C0392B', border:'#C0392B', bg:'rgba(192,57,43,0.07)', titleColor:'#8B1A0E', textColor:'#6B3030', headerBg:'#1a0800', theme:'#D0342C', chipText:'#D0342C' },
    caution: { tag:'CAUTION', tagBg:'#B87A1A', border:'#B87A1A', bg:'rgba(184,122,26,0.07)', titleColor:'#7A4800', textColor:'#5A3800', headerBg:'#1a1000', theme:'#eed202', chipText:'#141414' },
    note:    { tag:'NOTE',    tagBg:'#185FA5', border:'#185FA5', bg:'rgba(24,95,165,0.07)',  titleColor:'#0E3A6A', textColor:'#1A3C5A', headerBg:'#06080f', theme:'#2E62D8', chipText:'#2E62D8' },
  }[type]

  const ackLabel = block.data.ack_label || 'I understand — proceed'
  const modalId  = `wcn-modal-title-${block.id}`

  React.useEffect(() => {
    if (!modalOpen) return
    const modal = modalRef.current
    if (!modal) return
    const focusable = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last  = focusable[focusable.length - 1]
    first?.focus()

    const handleKeyDown = (e) => {
      // Capture phase + stopPropagation so the surrounding PreviewModal's own
      // Escape-to-close doesn't also fire (would close the whole preview and
      // lose focus return). Harmless in published SCORM (no outer modal).
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); return }
      if (e.key !== 'Tab') return
      if (focusable.length === 0) { e.preventDefault(); return }
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [modalOpen])

  const openModal  = () => setModalOpen(true)
  const closeModal = () => { setModalOpen(false); triggerRef.current?.focus() }
  const acknowledge = () => { setAcknowledged(true); closeModal() }

  // The frame-level WCN recall bar re-opens a block's modal by dispatching a
  // 'cf-wcn-recall' CustomEvent keyed by block id. Listen for ours and re-open
  // the SAME modal (modal mode) / re-show modal (inline mode) — no second modal.
  React.useEffect(() => {
    const onRecall = (e) => { if (e.detail === block.id) setModalOpen(true) }
    window.addEventListener('cf-wcn-recall', onRecall)
    return () => window.removeEventListener('cf-wcn-recall', onRecall)
  }, [block.id])

  // Shared hazard-stripe modal markup so both modal mode and inline-recall
  // re-show the SAME UI. Visual parity with scorm12._wcn_modal_html (the
  // published SCO / preview-html modal) — keep the two in sync.
  const modalMarkup = modalOpen && (
    <div role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
               zIndex:2000, display:'flex', alignItems:'center',
               justifyContent:'center', padding:24 }}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- onClick only stops backdrop-dismiss bubbling; not an interactive control */}
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby={modalId}
        onClick={(e) => e.stopPropagation()}
        style={{ background:'#fff', border:`4px solid ${cfg.theme}`, borderRadius:8,
                 width:'fit-content', maxWidth:'60%', minWidth:320,
                 boxShadow:'0 10px 30px rgba(0,0,0,0.25)' }}>
        <div style={{ position:'relative', borderRadius:'4px 4px 0 0', height:64, display:'flex',
                      alignItems:'center', justifyContent:'center',
                      background:`repeating-linear-gradient(-45deg, ${cfg.theme} 0 14px, #000 14px 28px)` }}>
          <span style={{ background:'#fff', border:'2px solid #000', borderRadius:6,
                         padding:'10px 20px', fontWeight:800, fontSize:30, lineHeight:1,
                         color:cfg.chipText }}>{cfg.tag}</span>
          <button onClick={closeModal} aria-label="Close dialog"
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.95)' }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
            style={{ position:'absolute', top:8, right:8,
                     width:30, height:30, borderRadius:'50%', background:'#fff',
                     border:'2px solid #000', cursor:'pointer', padding:0,
                     display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ position:'relative', width:15, height:15, display:'block' }}>
              <span style={{ position:'absolute', top:'50%', left:0, width:'100%', height:3,
                             background:'#000', transform:'translateY(-50%) rotate(45deg)' }} />
              <span style={{ position:'absolute', top:'50%', left:0, width:'100%', height:3,
                             background:'#000', transform:'translateY(-50%) rotate(-45deg)' }} />
            </span>
          </button>
        </div>
        <div style={{ padding:20, textAlign:'center', color:'#1a1a1a' }}>
          <div id={modalId} style={{ fontSize:22, fontWeight:700, marginBottom:8 }}>
            {block.data.title || cfg.tag}
          </div>
          <div style={{ fontSize:20, lineHeight:1.65 }}>{block.data.text}</div>
          <button onClick={block.data.modal ? acknowledge : closeModal}
            aria-label={block.data.modal ? `${ackLabel} — closes dialog` : 'Close dialog'}
            style={{ marginTop:16, padding:'8px 20px', background:cfg.theme,
                     color:type === 'caution' ? cfg.chipText : '#fff',
                     border:'none', borderRadius:4, fontSize:20, fontWeight:700,
                     cursor:'pointer', fontFamily:'inherit' }}>
            {block.data.modal ? `✓ ${ackLabel}` : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── Inline mode ──────────────────────────────────────────────
  if (!block.data.modal) {
    return (
      <>
      <div role="note"
        aria-label={`${cfg.tag}${block.data.title ? ': ' + block.data.title : ''}`}
        style={{ display:'flex', border:`1px solid ${cfg.border}`, borderLeft:`4px solid ${cfg.border}`,
                 borderRadius:6, padding:'12px 14px', gap:12, alignItems:'flex-start',
                 background:cfg.bg, marginBottom:16 }}>
        <div style={{ fontSize:24, flexShrink:0 }} aria-hidden="true">
          {type === 'warning' ? '⚠' : type === 'caution' ? '◆' : 'ℹ'}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <span style={{ background:cfg.tagBg, color:'#fff', fontFamily:'monospace',
                           fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:3,
                           letterSpacing:'0.1em' }}>{cfg.tag}</span>
            {block.data.title && (
              <span style={{ fontSize:13, fontWeight:600, color:cfg.titleColor }}>{block.data.title}</span>
            )}
          </div>
          <div style={{ fontSize:13, color:cfg.textColor, lineHeight:1.65 }}>{block.data.text}</div>
          {!acknowledged ? (
            <button onClick={() => setAcknowledged(true)}
              style={{ marginTop:8, padding:'5px 14px', borderRadius:4,
                       border:`1px solid ${cfg.border}`, background:cfg.bg,
                       color:cfg.titleColor, cursor:'default', fontSize:11,
                       fontWeight:600, fontFamily:'inherit' }}>
              ✓ {ackLabel}
            </button>
          ) : (
            <span style={{ fontSize:11, color:'#4CAF50', marginTop:6, display:'block' }}>✓ Acknowledged</span>
          )}
        </div>
      </div>
      {modalMarkup}
      </>
    )
  }

  // ── Modal mode ───────────────────────────────────────────────
  return (
    <div style={{ marginBottom:16 }}>
      <button ref={triggerRef} onClick={openModal}
        aria-haspopup="dialog" aria-expanded={modalOpen}
        style={{ padding:'8px 16px', borderRadius:4, border:`1px solid ${cfg.border}`,
                 background:cfg.bg, color:cfg.titleColor, cursor:'default',
                 fontSize:13, fontWeight:600, fontFamily:'inherit',
                 display:'flex', alignItems:'center', gap:8 }}>
        <span aria-hidden="true">{type === 'warning' ? '⚠' : type === 'caution' ? '◆' : 'ℹ'}</span>
        {cfg.tag}{block.data.title ? ': ' + block.data.title : ''}
      </button>

      {acknowledged && (
        <span style={{ fontSize:11, color:'#4CAF50', marginLeft:10 }}>✓ Acknowledged</span>
      )}

      {modalMarkup}
    </div>
  )
}

// WCN recall bar — the in-canvas mirror of scorm12._wcn_recall_bar. One small
// color-coded icon button per WCN block on the frame (in block order), pinned to
// the content area's lower-left. Clicking dispatches 'cf-wcn-recall' with the
// block id; the matching PreviewWCN re-opens its modal (no second modal).
const WCN_RECALL = {
  warning: { color:'#D0342C', shape:<polygon points="12,2 23,22 1,22" fill="#D0342C" /> },
  caution: { color:'#eed202', shape:<polygon points="12,1 23,12 12,23 1,12" fill="#eed202" /> },
  note:    { color:'#2E62D8', shape:<><circle cx="12" cy="12" r="11" fill="#2E62D8" /><text x="12" y="17" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="14" fill="#fff">i</text></> },
}
const WCN_RECALL_ORDER = { warning: 0, caution: 1, note: 2 }
function WCNRecallBar({ wcnBlocks }) {
  if (!wcnBlocks.length) return null
  // Canonical order regardless of authoring order: warning -> caution -> note
  // (stable within a type). Mirrors scorm12._render_blocks' wcn_recall sort.
  const ordered = wcnBlocks.slice().sort(
    (a, b) => (WCN_RECALL_ORDER[a.data?.wcn_type] ?? 99) - (WCN_RECALL_ORDER[b.data?.wcn_type] ?? 99))
  return (
    <div role="group" aria-label="Re-open warnings, cautions and notes"
      style={{ position:'absolute', left:16, bottom:64, zIndex:40,
               display:'flex', flexWrap:'wrap', gap:8 }}>
      {ordered.map(b => {
        const t = b.data.wcn_type === 'warning' || b.data.wcn_type === 'caution' ? b.data.wcn_type : 'note'
        const cfg = WCN_RECALL[t]
        const tag = t.toUpperCase()
        const label = `Re-open ${tag}${b.data.title ? ': ' + b.data.title : ''}`
        return (
          <button key={b.id} type="button" title={label} aria-label={label}
            aria-haspopup="dialog"
            onClick={() => window.dispatchEvent(new CustomEvent('cf-wcn-recall', { detail: b.id }))}
            style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                     gap:5, padding:'4px 9px', borderRadius:5, border:`1px solid ${cfg.color}`,
                     background:'#fff', color:'#1a1a1a', cursor:'pointer', fontFamily:'inherit',
                     fontSize:10, fontWeight:700, letterSpacing:'0.04em', lineHeight:1,
                     boxShadow:'0 1px 3px rgba(0,0,0,0.18)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">{cfg.shape}</svg>
            <span>{tag}</span>
          </button>
        )
      })}
    </div>
  )
}

function PreviewIVideo({ block, fill = false, interactive = false, active = false, onSelect = null, updateBlock = null }) {
  const [clipData, setClipData] = React.useState(null)
  const activeInteractionId  = useEditorStore(s => s.activeInteractionId)
  const setActiveInteraction = useEditorStore(s => s.setActiveInteraction)
  const videoId = block.data.video_asset_id
  const clipId  = block.data.clip_asset_id
  const editable = interactive && active && !!updateBlock

  React.useEffect(() => {
    // Prefer interactions edited inline in the block (data.clip); fall back to the
    // imported .clip.json asset for un-edited blocks.
    if (block.data.clip) { setClipData(block.data.clip); return }
    if (!clipId) { setClipData(null); return }
    fetch(`/api/media/clip/${clipId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setClipData)
      .catch(() => {})
  }, [clipId, block.data.clip])

  if (!videoId) {
    return (
      <div style={{
        ...previewBlockWrap, padding: 32, textAlign: 'center',
        border: '2px dashed #7A3A9A', borderRadius: 8, color: '#7A3A9A',
        background: 'rgba(122,58,154,0.05)',
      }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>▶⊕</div>
        <div style={{ fontSize: 13 }}>Interactive Video — upload video + .clip.json to preview</div>
      </div>
    )
  }

  // Full layout: the interactive video fills the content area — no caption text.
  // In the fill case the runtime fills its box and overlays the controller on the
  // media bottom (no scrollbar); inline it docks the controller below in flow.
  const b = block.data.bounds || fill
  const videoSrc = block.data.video_serve_url || `/api/media/serve/${videoId}`
  // Active iVideo block in the editor → live WYSIWYG editing of the interactions
  // directly on the player (drag/resize), committing native-px coords to data.clip.
  if (editable) {
    return (
      <div style={b ? { width: '100%', height: '100%' } : previewBlockWrap}>
        <IVideoEditor
          videoSrc={videoSrc}
          clip={block.data.clip || clipData}
          onClipChange={c => updateBlock(block.id, { clip: c })}
          selectedId={activeInteractionId}
          onSelect={setActiveInteraction}
          fill={!!b}
        />
      </div>
    )
  }
  return (
    <div style={b ? { width: '100%', height: '100%' } : previewBlockWrap}>
      <IVideoRuntime
        videoSrc={videoSrc}
        clipData={clipData}
        onComplete={() => {}}
        fill={!!b}
      />
    </div>
  )
}

function PreviewModel3D({ block, fill = false }) {
  const updateBlock = useEditorStore(s => s.updateBlock)
  const [selPart, setSelPart] = useState(null)
  // Label parts inline, right in the live preview — persists to block.data.parts.
  const setPartLabel = (key, label) => {
    const ps = block.data.parts || {}
    updateBlock(block.id, { parts: { ...ps, [key]: { ...(ps[key] || {}), label } } })
  }
  if (!block.data.model_serve_url) {
    return (
      <div style={{
        ...previewBlockWrap, padding: 32, textAlign: 'center',
        border: '2px dashed #2A5A8A', borderRadius: 8, color: '#2A5A8A',
        background: 'rgba(42,90,138,0.05)',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⬡</div>
        <div style={{ fontSize: 13 }}>3D Model — upload a .glb file to preview</div>
      </div>
    )
  }
  // bounded OR fill (layout zone) → the viewer fills its box (full zone height).
  const bounded = !!block.data.bounds || fill
  return (
    <div style={bounded ? { width: '100%', height: '100%' } : previewBlockWrap}>
      <Model3DViewer
        fill={bounded}
        modelUrl={block.data.model_serve_url}
        caption={block.data.caption}
        attribution={block.data.attribution}
        height={block.data.bounds?.height || block.data.viewer_height || 400}
        bgColor={block.data.bg_color || '#0d1017'}
        environment={block.data.environment || 'studio'}
        envIntensity={block.data.env_intensity ?? 1}
        decorative={block.data.decorative}
        annotations={block.data.annotations || []}
        autoRotate={block.data.auto_rotate}
        partHighlight={!!block.data.part_highlight}
        parts={block.data.parts || {}}
        selectedPartKey={selPart}
        onPartSelect={setSelPart}
        onPartLabel={setPartLabel}
        section={block.data.section}
      />
    </div>
  )
}

function PreviewOAM({ block, fill = false }) {
  const d = block.data
  if (!d.oam_asset_id) {
    return (
      <div style={{
        ...previewBlockWrap, padding: 32, textAlign: 'center',
        border: '2px dashed #533AB7', borderRadius: 8, color: '#533AB7',
        background: 'rgba(83,58,183,0.05)',
      }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⚙</div>
        <div style={{ fontSize: 13 }}>Adobe Animate (.oam) — upload to preview</div>
      </div>
    )
  }
  // Full layout: the OAM embed fills the content area AND carries the forge-oam
  // media bar (play/pause/scrub/next-stop), in parity with the server-rendered
  // _OAM_PLAYER_TPL. The bar is part of the OamMediaBar component, which scales the
  // animation to fit and reserves the bar below it.
  const src = `/api/media/oam/${d.oam_asset_id}/files/${d.entry_point || 'index.html'}`
  return (
    <div style={{ width: '100%' }}>
      <OamMediaBar
        src={src}
        width={d.width || 800}
        height={d.height || 600}
        hotspotConfig={d.hotspot}
      />
    </div>
  )
}

// Shared styles
const previewBlockWrap = { marginBottom: 20 }
