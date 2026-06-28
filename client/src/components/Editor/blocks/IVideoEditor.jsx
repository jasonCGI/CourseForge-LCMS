import React, { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { normalizeClipToPx } from '../../../utils/clipCoords'
import { hotspotStyle, shapeRadius } from '../../../utils/hotspotStyle'

/**
 * IVideoEditor — live-preview WYSIWYG editor for iVideo interactions.
 *
 * Renders the video player and lets you drag-to-move / corner-resize hotspots and
 * drag annotations directly on it, committing native-px coords to the clip. Unlike
 * the runtime it does NOT pause-gate on interactions, so editing is unobstructed.
 *
 * The overlay is positioned over the *rendered video rect* (letterbox-aware), so a
 * hotspot maps 1:1 onto the same pixels regardless of the container's aspect ratio
 * (the source of the preview-vs-published drift). Coords are native px relative to
 * clip.video.width/height; a legacy %-clip is normalized to px once on metadata.
 */
export default function IVideoEditor({ videoSrc, posterSrc, clip, onClipChange, selectedId, onSelect, fill = false }) {
  const wrapRef  = useRef(null)
  const videoRef = useRef(null)
  const drag     = useRef(null)
  const [nW, setNW]   = useState((clip && clip.video && clip.video.width)  || 0)
  const [nH, setNH]   = useState((clip && clip.video && clip.video.height) || 0)
  const [rect, setRect] = useState(null)   // rendered (letterboxed) video rect within the wrap, px
  const [live, setLive] = useState(null)   // geometry of the item being dragged

  const ints = (clip && clip.interactions) || []
  const W = nW || (clip && clip.video && clip.video.width)  || 1920
  const H = nH || (clip && clip.video && clip.video.height) || 1080

  // The actual on-screen rect of a contain-fitted video inside the wrap, so the
  // overlay tracks the video (not the box) and stays precise under letterboxing.
  const measure = () => {
    const wrap = wrapRef.current; if (!wrap) return
    const cw = wrap.clientWidth, ch = wrap.clientHeight
    if (!cw || !ch) return
    const ar = W / H
    let vw = cw, vh = cw / ar
    if (vh > ch) { vh = ch; vw = ch * ar }
    setRect({ left: (cw - vw) / 2, top: (ch - vh) / 2, width: vw, height: vh })
  }
  useLayoutEffect(() => { measure() }, [W, H, fill])           // eslint-disable-line
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure); ro.observe(wrap)
    return () => ro.disconnect()
  }, [W, H])                                                    // eslint-disable-line

  const onMeta = () => {
    const v = videoRef.current; if (!v) return
    const nw = (clip && clip.video && clip.video.width)  || v.videoWidth  || 1920
    const nh = (clip && clip.video && clip.video.height) || v.videoHeight || 1080
    setNW(nw); setNH(nh)
    // Seed: normalize a legacy %-clip to px against the real native resolution, once.
    if (clip && clip.coords !== 'px') {
      const seed = { ...clip, video: { ...(clip.video || {}), width: nw, height: nh } }
      normalizeClipToPx(seed)
      onClipChange && onClipChange(seed)
    }
  }

  // Selecting an interaction seeks the video to its frame so you position in context.
  useEffect(() => {
    if (!selectedId) return
    const it = ints.find(i => i.id === selectedId), v = videoRef.current
    if (it && v && typeof it.timecode === 'number') {
      try { v.pause(); v.currentTime = it.timecode } catch (e) { /* not ready */ }
    }
  }, [selectedId])                                             // eslint-disable-line

  const relPx = (e) => {
    if (!rect || !wrapRef.current) return { x: 0, y: 0 }
    const r = wrapRef.current.getBoundingClientRect()
    return {
      x: (e.clientX - r.left - rect.left) / rect.width  * W,
      y: (e.clientY - r.top  - rect.top)  / rect.height * H,
    }
  }
  const commit = (next) => onClipChange && onClipChange({ ...clip, interactions: next })
  const dw = (it) => (it.data.w != null ? it.data.w : Math.round(0.22 * W))
  const dh = (it) => (it.data.h != null ? it.data.h : Math.round(0.22 * H))

  const startMove = (e, it) => {
    e.stopPropagation(); onSelect && onSelect(it.id)
    drag.current = { mode: it.type === 'annotation' ? 'move-ann' : 'move', id: it.id,
      base: { x: it.data.x, y: it.data.y, w: dw(it), h: dh(it) } }
    setLive({ id: it.id, ...drag.current.base })
  }
  const startResize = (e, it, corner) => {
    e.stopPropagation(); onSelect && onSelect(it.id)
    drag.current = { mode: 'resize', id: it.id, corner, base: { x: it.data.x, y: it.data.y, w: dw(it), h: dh(it) } }
    setLive({ id: it.id, ...drag.current.base })
  }
  const onMove = (e) => {
    const d = drag.current; if (!d) return
    const p = relPx(e), b = d.base
    if (d.mode === 'move-ann') {
      setLive({ id: d.id, x: Math.round(Math.max(0, Math.min(W, p.x))), y: Math.round(Math.max(0, Math.min(H, p.y))) })
    } else if (d.mode === 'move') {
      setLive({ id: d.id, w: b.w, h: b.h,
        x: Math.round(Math.max(b.w / 2, Math.min(W - b.w / 2, p.x))),
        y: Math.round(Math.max(b.h / 2, Math.min(H - b.h / 2, p.y))) })
    } else {
      let l = b.x - b.w / 2, t = b.y - b.h / 2, r = b.x + b.w / 2, btm = b.y + b.h / 2
      const MIN = 16
      const px = Math.max(0, Math.min(W, p.x)), py = Math.max(0, Math.min(H, p.y))
      if (d.corner === 'nw') { l = Math.min(px, r - MIN); t = Math.min(py, btm - MIN) }
      if (d.corner === 'ne') { r = Math.max(px, l + MIN); t = Math.min(py, btm - MIN) }
      if (d.corner === 'sw') { l = Math.min(px, r - MIN); btm = Math.max(py, t + MIN) }
      if (d.corner === 'se') { r = Math.max(px, l + MIN); btm = Math.max(py, t + MIN) }
      setLive({ id: d.id, x: Math.round((l + r) / 2), y: Math.round((t + btm) / 2), w: Math.round(r - l), h: Math.round(btm - t) })
    }
  }
  const onUp = () => {
    const d = drag.current
    if (d && live) {
      commit(ints.map(it => {
        if (it.id !== live.id) return it
        if (d.mode === 'move-ann') return { ...it, data: { ...it.data, x: live.x, y: live.y } }
        return { ...it, data: { ...it.data, x: live.x, y: live.y, w: live.w, h: live.h } }
      }))
    }
    drag.current = null; setLive(null)
  }

  const geomOf = (it) => (live && live.id === it.id ? live : { x: it.data.x, y: it.data.y, w: dw(it), h: dh(it) })

  const wrapStyle = fill
    ? { position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }
    : { position: 'relative', width: '100%', paddingBottom: (H / W * 100) + '%', background: '#000', overflow: 'hidden' }

  return (
    <div style={fill ? { width: '100%', height: '100%' } : { width: '100%' }}>
      <div ref={wrapRef} style={wrapStyle}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- editor authoring surface; captions are on the published player */}
        <video ref={videoRef} src={videoSrc} poster={posterSrc} onLoadedMetadata={onMeta} controls muted
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />

        {/* Overlay tracks the rendered video rect so coords map 1:1 to the video. */}
        {rect && (
          /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- pointer-drag editing surface; the same coords are keyboard-editable via the block's numeric fields */
          <div onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            style={{ position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height, zIndex: 15 }}>
            {ints.map(it => {
              if (!it.data || it.data.x == null) return null
              const sel = it.id === selectedId
              if (it.type === 'hotspot') {
                const g = geomOf(it), st = hotspotStyle(it.data.color)
                return (
                  /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- pointer-drag move affordance; coords are also keyboard-editable in the block fields */
                  <div key={it.id} onMouseDown={e => startMove(e, it)} title={it.data.label || 'Hotspot'}
                    style={{ position: 'absolute', left: g.x / W * 100 + '%', top: g.y / H * 100 + '%',
                      width: g.w / W * 100 + '%', height: g.h / H * 100 + '%', transform: 'translate(-50%,-50%)',
                      border: `2px solid ${st.border}`, background: st.fill, borderRadius: shapeRadius(it.data.shape),
                      boxSizing: 'border-box', cursor: 'move', boxShadow: sel ? '0 0 0 2px var(--forge-amber)' : 'none' }}>
                    {sel && ['nw', 'ne', 'sw', 'se'].map(c => (
                      /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- pointer-drag resize handle */
                      <div key={c} onMouseDown={e => startResize(e, it, c)} aria-hidden="true"
                        style={{ position: 'absolute', width: 12, height: 12, background: '#fff', border: '2px solid #2563EB',
                          borderRadius: 2, boxSizing: 'border-box', left: c[1] === 'w' ? 0 : '100%', top: c[0] === 'n' ? 0 : '100%',
                          transform: 'translate(-50%,-50%)', cursor: (c === 'nw' || c === 'se') ? 'nwse-resize' : 'nesw-resize' }} />
                    ))}
                  </div>
                )
              }
              if (it.type === 'annotation') {
                const g = geomOf(it)
                return (
                  /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- pointer-drag move affordance; position is keyboard-editable in the block fields */
                  <div key={it.id} onMouseDown={e => startMove(e, it)} title="Annotation — drag to move"
                    style={{ position: 'absolute', left: g.x / W * 100 + '%', top: g.y / H * 100 + '%',
                      transform: 'translate(-50%,-50%)', cursor: 'move',
                      outline: sel ? '2px solid var(--forge-amber)' : 'none', outlineOffset: 2 }}>
                    <div style={{ background: 'rgba(4,44,83,0.85)', color: '#B5D4F4', fontSize: 11, padding: '3px 8px',
                      borderRadius: 3, border: '1px solid #185FA5', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                      {it.data.text || 'Annotation'}
                    </div>
                  </div>
                )
              }
              return null
            })}
          </div>
        )}
      </div>
    </div>
  )
}
