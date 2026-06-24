import React, { useState, useEffect, useRef } from 'react'
import IVideoRuntime from '../Editor/blocks/IVideoRuntime'
import Model3DViewer from './Model3DViewer'
import GUIShellRenderer from './GUIShellRenderer'
import useEditorStore from '../../store/editorStore'
import useProjectStore from '../../store/projectStore'
import { flatFrameOrder } from './PersistentPreviewPane'
import { hotspotStyle, shapeRadius, rgba } from '../../utils/hotspotStyle'
import { clampBounds } from '../Editor/blocks/BoundsControl'

const FRAME_BG = '#ffffff'

export default function FramePreview({ frame, activeBlockId = null, onBlockSelect = null, ignoreGui = false, hideTitle = false, contentArea = null }) {
  const updateBlock = useEditorStore(s => s.updateBlock)   // for drag/resize of bounded blocks
  if (!frame) return null

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
          framePrompt={frame.content?.prompt} frameId={frame.id} />
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
  const flow    = (contentArea ? blocks.filter(b => !b.data?.bounds) : blocks).filter(b => !isDockedAudio(b))
  const textBlocks  = flow.filter(b => b.type === 'text')
  const otherBlocks = flow.filter(b => b.type !== 'text')
  const renderBlock = (block) => (
    <SelectableBlock key={block.id} block={block}
      active={block.id === activeBlockId} onSelect={onBlockSelect} />
  )

  return (
    <div style={{
      background: FRAME_BG,
      color: '#1a1a1a',
      fontFamily: 'Inter, system-ui, sans-serif',
      minHeight: '100%',
      padding: dockedAudio.length ? '28px 0 88px' : '28px 0 40px',
      boxSizing: 'border-box',
      position: 'relative',   // anchor for docked audio bars
    }}>
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

      {/* Basic two-zone layout: text on the left half, media/image/3D on the right
          half — each 50%, 25px padding. A layout-preset dropdown (text-left/
          image-right, image-left/text-right, …) will replace this default later. */}
      {flow.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 0', minWidth: 0, boxSizing: 'border-box', padding: 25 }}>
            {textBlocks.map(renderBlock)}
          </div>
          <div style={{ flex: '1 1 0', minWidth: 0, boxSizing: 'border-box', padding: 25 }}>
            {otherBlocks.map(renderBlock)}
          </div>
        </div>
      )}
      {/* Custom-bounds blocks: absolute boxes in content-area pixels (anchor to the
          scaled shell overlay). */}
      {bounded.map(b => (
        <BoundsBox key={b.id} block={b} contentArea={contentArea} updateBlock={updateBlock}
          active={b.id === activeBlockId} onSelect={onBlockSelect}>
          <PreviewBlock block={b} />
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
    </div>
  )
}

// Wraps a preview block so clicking it selects that block in the inspector
// (preview → tab), and so the active block outlines + scrolls into view when
// selected from the inspector (tab → preview). No-ops to a plain block when no
// onSelect handler is provided (e.g. read-only previews).
function SelectableBlock({ block, active, onSelect }) {
  const ref = useRef(null)
  useEffect(() => {
    if (active && ref.current) ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])
  if (!onSelect) return <PreviewBlock block={block} />
  return (
    <div ref={ref} onClick={() => onSelect(block.id)}
      style={{
        position: 'relative', cursor: 'pointer', borderRadius: 6,
        outline: active ? '2px solid var(--forge-amber)' : '2px solid transparent',
        outlineOffset: 3, transition: 'outline-color 0.15s',
      }}>
      <PreviewBlock block={block} />
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

function PreviewGUI({ guiBlock, contentBlocks, frameName, framePrompt, frameId }) {
  const [action, setAction] = useState(null)

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

  const frameHtml = (contentBlocks || []).map(renderBlockToHTML).join('')

  return (
    <div style={{ marginBottom: 16 }}>
      <GUIShellRenderer
        shellUrl={guiBlock.data.html_serve_url}
        frameHtml={frameHtml}
        frameData={{
          frameIndex: human, totalFrames: total,
          lessonTitle: 'Preview', sectionTitle: 'Preview',
          frameTitle: frameName || 'Frame Preview',
          prompt: framePrompt || frameName || '',
          isFirst: human <= 1, isLast: human >= total,
        }}
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
    + `justify-content:center;font-size:14px;line-height:1;padding:0">&#9654;</button>`
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
    const ico = (p) => { play.innerHTML = p ? '&#10074;&#10074;' : '&#9654;'; play.setAttribute('aria-label', p ? 'Pause' : 'Play') }
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
    + 'function ico(p){play.innerHTML=p?"&#10074;&#10074;":"&#9654;";play.setAttribute("aria-label",p?"Pause":"Play");}'
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
export function renderBlockToHTML(block) {
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
      const b = d.bounds
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
        if (videoIsCover && d.caption)
          return `<div style="position:relative;${b ? 'width:100%;height:100%' : 'display:block;margin:8px 0;line-height:0'}">`
            + `<video src="${src}" controls muted loop autoplay playsinline ${d.poster_url ? `poster="${d.poster_url}"` : ''} `
            + `style="width:100%;height:${b ? '100%' : 'auto'};object-fit:cover;display:block"></video>`
            + `<div style="position:absolute;left:0;right:0;top:0;padding:12px 16px 28px;`
            + `color:#fff;font-size:13px;line-height:1.45;`
            + `text-shadow:0 1px 3px rgba(0,0,0,.85);background:linear-gradient(to bottom,rgba(0,0,0,.85),rgba(0,0,0,.45) 50%,transparent)">${d.caption}</div></div>`
        if (videoIsCover)
          return `<video src="${src}" controls muted loop autoplay playsinline ${d.poster_url ? `poster="${d.poster_url}"` : ''} `
            + `style="width:100%;height:${b ? '100%' : 'auto'};object-fit:cover;display:block;margin:${b ? '0' : '8px 0'}"></video>`
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
    default:
      return injectedNote(`${block.type} block`)
  }
}

function PreviewBlock({ block }) {
  switch (block.type) {
    case 'text':    return <PreviewText    block={block} />
    case 'media':   return <PreviewMedia   block={block} />
    case 'quiz':    return <PreviewQuiz    block={block} />
    case 'hotspot': return <PreviewHotspot block={block} />
    case 'branch':  return <PreviewBranch  block={block} />
    case 'wcn':     return <PreviewWCN     block={block} />
    case 'ivideo':  return <PreviewIVideo  block={block} />
    case 'model3d': return <PreviewModel3D block={block} />
    case 'oam':     return <PreviewOAM     block={block} />
    default:        return (
      <div style={previewBlockWrap}>
        <p style={{ color: '#888', fontSize: 13 }}>
          [{block.type} block — preview not yet implemented]
        </p>
      </div>
    )
  }
}

function PreviewText({ block }) {
  return (
    <div style={previewBlockWrap}>
      {block.data.body && (
        <div
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
        {playing ? '❚❚' : '▶'}
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

function PreviewMedia({ block }) {
  const icons = { image: '🖼', video: '🎬', audio: '🎙', oam: '⚙' }
  const kind = block.data.kind
  const d = block.data

  // Live video: a real uploaded asset can't render in an <img> — use <video>.
  if (kind === 'video' && d.asset_id) {
    const cf = d.asset_meta?.companion_files
    const poster = d.asset_meta?.has_poster && cf?.poster_asset_id
      ? `/api/media/serve/${cf.poster_asset_id}` : undefined
    const b = d.bounds
    return (
      <div style={b ? { width: '100%', height: '100%' } : { ...previewBlockWrap, textAlign: 'center' }}>
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
    const b = d.bounds
    const coverWrap = b
      ? { width: '100%', aspectRatio: `${b.width || 16} / ${b.height || 9}`, maxHeight: '70vh' }
      : null
    return (
      <div style={{ position: 'relative', overflow: 'hidden',
        ...(coverWrap || { width: '100%', display: 'block', lineHeight: 0 }) }}>
        <video controls muted loop autoPlay playsInline src={`/api/media/serve/${d.asset_id}`} poster={poster}
          style={b ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
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
    const b = d.bounds
    const poster = d.poster_url || d.serve_url
    const coverWrap = b
      ? { width: '100%', aspectRatio: `${b.width || 16} / ${b.height || 9}`, maxHeight: '70vh' }
      : null
    return (
      <div style={{ position: 'relative', overflow: 'hidden',
        ...(coverWrap || { width: '100%', display: 'block', lineHeight: 0 }) }}>
        <video controls muted loop playsInline poster={poster} src={d.serve_url}
          style={b ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
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
    const b = d.bounds
    const isCover = d.fit === 'cover'
    const caption = block.data.caption
    // A bounded cover image sized purely with height:100% collapses to nothing
    // when it isn't inside a height-providing parent (the no-GUI flow column has
    // no fixed height) — that degenerate layout is what pushed the title/caption
    // off-screen. Drive the wrapper height from the bounds aspect ratio instead,
    // and cap it to the viewport (70vh) so the frame + caption always stay above
    // the fold. Inside a sized BoundsBox the wrapper still fills width and the box
    // clips, so this is safe in both contexts.
    const coverWrap = b
      ? { width: '100%', aspectRatio: `${b.width || 16} / ${b.height || 9}`, maxHeight: '70vh' }
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

function PreviewHotspot({ block }) {
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
            onClick={() => setActive(active === r.id ? null : r.id)}
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

function PreviewBranch({ block }) {
  const [chosen, setChosen] = useState(null)
  return (
    <div style={{ ...previewBlockWrap, background: '#F8F8FF', border: '1px solid #CECBF6', borderRadius: 8, padding: 20 }}>
      {block.data.condition && (
        <p style={{ fontSize: 15, fontWeight: 600, color: '#042C53', marginBottom: 16 }}>
          {block.data.condition}
        </p>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => setChosen('true')}
          style={{
            flex: 1, padding: '12px 16px',
            background: chosen === 'true' ? '#3B8A4A' : '#fff',
            color: chosen === 'true' ? '#fff' : '#3B8A4A',
            border: '2px solid #3B8A4A',
            borderRadius: 6, fontSize: 14, fontWeight: 600,
            cursor: 'default', fontFamily: 'inherit',
          }}
        >
          ✓ {block.data.true_label || 'Yes'}
        </button>
        <button
          onClick={() => setChosen('false')}
          style={{
            flex: 1, padding: '12px 16px',
            background: chosen === 'false' ? '#C0392B' : '#fff',
            color: chosen === 'false' ? '#fff' : '#C0392B',
            border: '2px solid #C0392B',
            borderRadius: 6, fontSize: 14, fontWeight: 600,
            cursor: 'default', fontFamily: 'inherit',
          }}
        >
          ✕ {block.data.false_label || 'No'}
        </button>
      </div>
      {chosen && (
        <p style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
          → Would navigate to:{' '}
          <strong>
            {chosen === 'true'
              ? (block.data.true_frame_id  || 'no frame set')
              : (block.data.false_frame_id || 'no frame set')}
          </strong>
        </p>
      )}
    </div>
  )
}

function PreviewWCN({ block }) {
  const [acknowledged, setAcknowledged] = React.useState(false)
  const [modalOpen,    setModalOpen]    = React.useState(false)
  const triggerRef  = React.useRef(null)
  const modalRef    = React.useRef(null)

  const type = block.data.wcn_type || 'note'
  const cfg  = {
    warning: { tag:'WARNING', tagBg:'#C0392B', border:'#C0392B', bg:'rgba(192,57,43,0.07)', titleColor:'#8B1A0E', textColor:'#6B3030', headerBg:'#1a0800' },
    caution: { tag:'CAUTION', tagBg:'#B87A1A', border:'#B87A1A', bg:'rgba(184,122,26,0.07)', titleColor:'#7A4800', textColor:'#5A3800', headerBg:'#1a1000' },
    note:    { tag:'NOTE',    tagBg:'#185FA5', border:'#185FA5', bg:'rgba(24,95,165,0.07)',  titleColor:'#0E3A6A', textColor:'#1A3C5A', headerBg:'#06080f' },
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

  // ── Inline mode ──────────────────────────────────────────────
  if (!block.data.modal) {
    return (
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

      {modalOpen && (
        <div role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
          style={{ position:'fixed', inset:0, background:'rgba(4,44,83,0.75)',
                   zIndex:2000, display:'flex', alignItems:'center',
                   justifyContent:'center', padding:24 }}>
          <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby={modalId}
            style={{ background:'#fff', borderRadius:8, maxWidth:480, width:'100%',
                     overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ background:cfg.headerBg, padding:'14px 18px', display:'flex',
                          alignItems:'center', gap:12, borderBottom:`3px solid ${cfg.border}` }}>
              <span style={{ fontSize:28 }} aria-hidden="true">
                {type === 'warning' ? '⚠' : type === 'caution' ? '◆' : 'ℹ'}
              </span>
              <div>
                <div style={{ fontFamily:'monospace', fontSize:9, fontWeight:700,
                               color:cfg.tagBg, letterSpacing:'0.12em', marginBottom:3 }}>{cfg.tag}</div>
                <div id={modalId} style={{ fontSize:15, fontWeight:700, color:cfg.tagBg }}>
                  {block.data.title || cfg.tag}
                </div>
              </div>
              <button onClick={closeModal} aria-label="Close"
                style={{ marginLeft:'auto', background:'none', border:'none',
                         color:cfg.tagBg, fontSize:20, cursor:'default', padding:4, lineHeight:1 }}>✕</button>
            </div>
            <div style={{ padding:'16px 18px', fontSize:13, lineHeight:1.65, color:'#1a1a1a' }}>
              {block.data.text}
            </div>
            <div style={{ padding:'12px 18px', borderTop:'1px solid #eee',
                          display:'flex', justifyContent:'flex-end', background:'#f8f8f8' }}>
              <button onClick={acknowledge} aria-label={`${ackLabel} — closes dialog`}
                style={{ padding:'8px 20px', background:cfg.tagBg, color:'#fff',
                         border:'none', borderRadius:4, fontSize:13, fontWeight:600,
                         cursor:'default', fontFamily:'inherit' }}>
                ✓ {ackLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewIVideo({ block }) {
  const [clipData, setClipData] = React.useState(null)
  const videoId = block.data.video_asset_id
  const clipId  = block.data.clip_asset_id

  React.useEffect(() => {
    if (!clipId) { setClipData(null); return }
    fetch(`/api/media/clip/${clipId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setClipData)
      .catch(() => {})
  }, [clipId])

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
  const b = block.data.bounds
  return (
    <div style={b ? { width: '100%', height: '100%' } : previewBlockWrap}>
      <IVideoRuntime
        videoSrc={block.data.video_serve_url || `/api/media/serve/${videoId}`}
        clipData={clipData}
        onComplete={() => {}}
      />
    </div>
  )
}

function PreviewModel3D({ block }) {
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
  const bounded = !!block.data.bounds
  return (
    <div style={bounded ? { width: '100%', height: '100%' } : previewBlockWrap}>
      <Model3DViewer
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
      />
    </div>
  )
}

function PreviewOAM({ block }) {
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
  // Full layout: the OAM embed fills the entire content area — no caption/label
  // text, no media bar. Mirrors the cover image/video "fill" treatment as closely
  // as an iframe allows (100% of the zone, square corners, object-fit-style fill).
  const src = `/api/media/oam/${d.oam_asset_id}/files/${d.entry_point || 'index.html'}`
  const b = d.bounds
  return (
    <div style={b
      ? { width: '100%', height: '100%' }
      : { width: '100%', aspectRatio: `${d.width || 16} / ${d.height || 9}`, maxHeight: '70vh' }}>
      <iframe src={src} title="Adobe Animate animation" scrolling="no"
        sandbox="allow-scripts allow-same-origin"
        style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#0d1017' }} />
    </div>
  )
}

// Shared styles
const previewBlockWrap = { marginBottom: 20 }
