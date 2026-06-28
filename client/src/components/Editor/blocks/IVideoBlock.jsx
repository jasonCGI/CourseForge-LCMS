import React, { useState, useEffect, useCallback } from 'react'
import useEditorStore  from '../../../store/editorStore'
import useProjectStore from '../../../store/projectStore'
import MediaUploader   from './MediaUploader'
import { uploadMedia, uploadClip, getMediaAsset } from '../../../api/client'
import BoundsControl from './BoundsControl'
import useContentArea from '../../../hooks/useContentArea'
import { hotspotStyle, shapeRadius } from '../../../utils/hotspotStyle'
import { normalizeClipToPx } from '../../../utils/clipCoords'

const VIDEO_ACCEPT = {
  'video/mp4':       ['.mp4'],
  'video/webm':      ['.webm'],
  'video/quicktime': ['.mov'],
}
const CLIP_ACCEPT = { 'application/json': ['.json'] }

export default function IVideoBlock({ block }) {
  const updateBlock   = useEditorStore(s => s.updateBlock)
  const removeBlock   = useEditorStore(s => s.removeBlock)
  const moveBlock     = useEditorStore(s => s.moveBlock)
  const activeProject = useProjectStore(s => s.activeProject)

  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [uploadingClip,  setUploadingClip]  = useState(false)
  const [videoError,     setVideoError]     = useState(null)
  const [clipError,      setClipError]      = useState(null)
  const [videoMeta,      setVideoMeta]      = useState(null)

  const videoId = block.data.video_asset_id
  const clipId  = block.data.clip_asset_id

  useEffect(() => {
    if (videoId) getMediaAsset(videoId).then(r => setVideoMeta(r.data)).catch(() => {})
  }, [videoId])

  const handleVideoUpload = useCallback(async (file) => {
    if (!activeProject?.id) return
    setUploadingVideo(true); setVideoError(null)
    try {
      const { data } = await uploadMedia(file, activeProject.id, 'video')
      setVideoMeta(data)
      updateBlock(block.id, {
        video_asset_id:  data.id,
        video_filename:  data.original_name,
        video_serve_url: data.serve_url,
      })
      if (data.clip_asset_id) updateBlock(block.id, { clip_asset_id: data.clip_asset_id })
    } catch (e) {
      setVideoError(e.response?.data?.error || 'Video upload failed.')
    } finally { setUploadingVideo(false) }
  }, [activeProject, block.id, updateBlock])

  const handleClipUpload = useCallback(async (file) => {
    if (!activeProject?.id) return
    setUploadingClip(true); setClipError(null)
    try {
      const { data } = await uploadClip(file, activeProject.id, videoId)
      updateBlock(block.id, {
        clip_asset_id:     data.id,
        interaction_count: data.interaction_count,
        video_duration:    data.video_duration,
      })
    } catch (e) {
      setClipError(e.response?.data?.error || 'Clip upload failed.')
    } finally { setUploadingClip(false) }
  }, [activeProject, block.id, updateBlock, videoId])

  const update = (field, val) => updateBlock(block.id, { [field]: val })
  const caDims = useContentArea()

  return (
    <div style={{
      background: 'var(--cf-block-bg)',
      border: '1px solid var(--cf-block-border)',
      borderLeft: '4px solid #7A3A9A',
      borderRadius: 8, overflow: 'hidden', marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(122,58,154,0.12)', padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid var(--cf-block-border)',
      }}>
        <span style={{
          fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
          fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 3,
          background: '#7A3A9A', color: '#fff',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>Interactive Video</span>
        <span style={{ flex: 1, fontSize: 11, color: 'var(--cf-text-tertiary)' }}>
          ivideo block · ForgeClip
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => moveBlock(block.id, 'up')} aria-label="Move block up" style={iconBtnStyle}>↑</button>
          <button onClick={() => moveBlock(block.id, 'down')} aria-label="Move block down" style={iconBtnStyle}>↓</button>
          <button onClick={() => removeBlock(block.id)} aria-label="Remove block" style={{ ...iconBtnStyle, color: '#E87070' }}>✕</button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* Step 1 — Video */}
        <div style={{ marginBottom: 14 }}>
          <span style={sectionLabel}>Step 1 — Video file (.mp4)</span>
          {!videoId ? (
            <MediaUploader
              accept={VIDEO_ACCEPT}
              label="Drop processed video file (.mp4 or .webm)"
              onUpload={handleVideoUpload}
              uploading={uploadingVideo}
              error={videoError}
            />
          ) : (
            <AssetCard icon="🎬" name={block.data.video_filename || 'Video file'}
              meta={block.data.video_serve_url ? '✓ Uploaded' : ''}
              onRemove={() => { updateBlock(block.id, { video_asset_id: null, video_filename: null }); setVideoMeta(null) }} />
          )}
          {videoId && videoMeta?.has_clip && !clipId && (
            <div style={{
              marginTop: 8, padding: '6px 10px',
              background: 'color-mix(in srgb, var(--forge-amber) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--forge-amber) 30%, transparent)',
              borderRadius: 4, fontSize: 11, color: 'var(--forge-amber)',
            }}>
              ✓ Matching .clip.json detected — upload it below to auto-link
            </div>
          )}
        </div>

        {/* Step 2 — Clip */}
        <div style={{ marginBottom: 14 }}>
          <span style={sectionLabel}>Step 2 — ForgeClip file (.clip.json)</span>
          {!clipId ? (
            <MediaUploader
              accept={CLIP_ACCEPT}
              label="Drop .clip.json exported from ForgeClip"
              onUpload={handleClipUpload}
              uploading={uploadingClip}
              error={clipError}
            />
          ) : (
            <AssetCard icon="⚙"
              name={block.data.video_filename
                ? block.data.video_filename.replace(/\.(mp4|webm|mov)$/i, '.clip.json')
                : '.clip.json'}
              meta={block.data.interaction_count != null
                ? `${block.data.interaction_count} interactions · ${(block.data.video_duration || 0).toFixed(1)}s`
                : '✓ Linked'}
              onRemove={() => updateBlock(block.id, { clip_asset_id: null, interaction_count: null })} />
          )}
        </div>

        {/* Summary */}
        {videoId && clipId && (
          <div style={{
            padding: '10px 12px',
            background: 'rgba(59,138,74,0.08)',
            border: '1px solid rgba(59,138,74,0.25)',
            borderRadius: 6, fontSize: 12, color: '#4CAF50', marginBottom: 14,
          }}>
            ✓ Interactive video ready — {block.data.interaction_count || 0} interactions
            over {(block.data.video_duration || 0).toFixed(1)}s
          </div>
        )}

        {/* Inline interaction editor — drag/resize hotspots live on the video,
            persisted to block.data.clip (preferred over the imported .clip.json). */}
        {videoId && (block.data.clip || clipId) && (
          <div style={{ marginBottom: 14 }}>
            <IVideoInteractionEditor block={block} updateBlock={updateBlock}
              videoSrc={block.data.video_serve_url || `/api/media/serve/${videoId}`} />
          </div>
        )}

        {/* Caption */}
        <div>
          <span style={sectionLabel}>Caption (optional)</span>
          <input value={block.data.caption || ''} onChange={e => update('caption', e.target.value)}
            placeholder="Optional caption shown below the player"
            aria-label="Interactive video caption" style={inputStyle} />
        </div>

        {videoId && (
          <div style={{ marginTop: 14 }}>
            <BoundsControl bounds={block.data.bounds} contentArea={caDims}
              onChange={b => update('bounds', b)} labelStyle={sectionLabel} inputStyle={inputStyle} />
          </div>
        )}

        {/* ForgeClip link */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--cf-border-tertiary)' }}>
          <a href={import.meta.env.VITE_FORGECLIP_URL || '#'} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: 'var(--cf-text-tertiary)', textDecoration: 'none',
                     fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
                     display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Open ForgeClip ↗
          </a>
          <span style={{ fontSize: 11, color: 'var(--cf-text-tertiary)', marginLeft: 12 }}>
            · Author interactions in ForgeClip, export .clip.json, upload here
          </span>
        </div>
      </div>
    </div>
  )
}

// Inline WYSIWYG interaction editor: render the video + overlay each hotspot as a
// drag-to-move / corner-resize box in NATIVE PIXELS (center anchor), committing to
// block.data.clip.interactions. Mirrors HotspotBlock's editor in px-space. The clip
// is seeded once from the imported .clip.json (normalized to px) on first load.
function IVideoInteractionEditor({ block, updateBlock, videoSrc }) {
  const videoRef   = React.useRef(null)
  const overlayRef = React.useRef(null)
  const drag       = React.useRef(null)
  const [nW, setNW]       = React.useState(0)
  const [nH, setNH]       = React.useState(0)
  const [selId, setSelId] = React.useState(null)
  const [live, setLive]   = React.useState(null)     // {id,x,y,w,h} px during a drag
  const [pending, setPending] = React.useState(null) // imported clip awaiting native-res seed
  const [curTime, setCurTime] = React.useState(0)

  const clip   = block.data.clip
  const clipId = block.data.clip_asset_id

  // Fetch the imported .clip.json once to seed block.data.clip (if not yet inlined).
  React.useEffect(() => {
    if (clip || !clipId) return
    fetch(`/api/media/clip/${clipId}`).then(r => r.ok ? r.json() : null)
      .then(c => { if (c) setPending(c) }).catch(() => {})
  }, [clip, clipId])

  const onMeta = () => {
    const v = videoRef.current; if (!v) return
    const w = v.videoWidth || 0, h = v.videoHeight || 0
    if (!clip && pending) {
      const seed = { ...pending, video: {
        ...(pending.video || {}),
        width:  (pending.video && pending.video.width)  || w || 1920,
        height: (pending.video && pending.video.height) || h || 1080,
      } }
      normalizeClipToPx(seed)              // legacy % -> px (idempotent for px clips)
      updateBlock(block.id, { clip: seed })
      setPending(null); setNW(seed.video.width); setNH(seed.video.height)
      return
    }
    const cv = (clip && clip.video) || {}
    setNW(cv.width || w || 1920); setNH(cv.height || h || 1080)
  }

  // No inline clip yet — mount a hidden probe to fetch native res + seed it.
  if (!clip) {
    return (
      <div style={{ fontSize: 11, color: 'var(--cf-text-tertiary)' }}>
        <video ref={videoRef} src={videoSrc} onLoadedMetadata={onMeta} muted preload="metadata" style={{ display: 'none' }} />
        Preparing interaction editor…
      </div>
    )
  }

  const ints = clip.interactions || []
  const W = nW || (clip.video && clip.video.width)  || 1920
  const H = nH || (clip.video && clip.video.height) || 1080
  const commit = next => updateBlock(block.id, { clip: { ...clip, interactions: next } })
  const geom = it => (live && live.id === it.id
    ? live
    : { id: it.id, x: it.data.x, y: it.data.y, w: it.data.w ?? Math.round(0.22 * W), h: it.data.h ?? Math.round(0.22 * H) })

  const relPx = e => {
    const r = overlayRef.current.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }
  }
  const startMove = (e, it) => {
    e.stopPropagation(); setSelId(it.id)
    const p = relPx(e), d = it.data
    const base = { x: d.x, y: d.y, w: d.w ?? Math.round(0.22 * W), h: d.h ?? Math.round(0.22 * H) }
    drag.current = { mode: 'move', id: it.id, ox: p.x, oy: p.y, base }
    setLive({ id: it.id, ...base })
  }
  const startResize = (e, it, corner) => {
    e.stopPropagation(); setSelId(it.id)
    const d = it.data
    const base = { x: d.x, y: d.y, w: d.w ?? Math.round(0.22 * W), h: d.h ?? Math.round(0.22 * H) }
    drag.current = { mode: 'resize', id: it.id, corner, base }
    setLive({ id: it.id, ...base })
  }
  const onMove = e => {
    const dd = drag.current; if (!dd) return
    const p = relPx(e), b = dd.base
    if (dd.mode === 'move') {
      const x = Math.max(b.w / 2, Math.min(W - b.w / 2, p.x))
      const y = Math.max(b.h / 2, Math.min(H - b.h / 2, p.y))
      setLive({ id: dd.id, x: Math.round(x), y: Math.round(y), w: b.w, h: b.h })
    } else {
      let l = b.x - b.w / 2, t = b.y - b.h / 2, r = b.x + b.w / 2, btm = b.y + b.h / 2
      const MIN = 16
      const px = Math.max(0, Math.min(W, p.x)), py = Math.max(0, Math.min(H, p.y))
      if (dd.corner === 'nw') { l = Math.min(px, r - MIN); t = Math.min(py, btm - MIN) }
      if (dd.corner === 'ne') { r = Math.max(px, l + MIN); t = Math.min(py, btm - MIN) }
      if (dd.corner === 'sw') { l = Math.min(px, r - MIN); btm = Math.max(py, t + MIN) }
      if (dd.corner === 'se') { r = Math.max(px, l + MIN); btm = Math.max(py, t + MIN) }
      setLive({ id: dd.id, x: Math.round((l + r) / 2), y: Math.round((t + btm) / 2), w: Math.round(r - l), h: Math.round(btm - t) })
    }
  }
  const onUp = () => {
    const dd = drag.current
    if (dd && live) commit(ints.map(it => it.id === live.id
      ? { ...it, data: { ...it.data, x: live.x, y: live.y, w: live.w, h: live.h } } : it))
    drag.current = null; setLive(null)
  }
  const addHotspot = () => {
    const t = videoRef.current ? videoRef.current.currentTime : 0
    const it = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'h' + Date.now(),
      type: 'hotspot', timecode: Math.round(t * 100) / 100, pause_on_reach: true,
      data: { x: Math.round(W / 2), y: Math.round(H / 2), w: Math.round(0.22 * W), h: Math.round(0.22 * H),
              shape: 'round', color: null, label: 'New Hotspot', description: '' },
    }
    commit([...ints, it]); setSelId(it.id)
  }
  const removeInt = id => { commit(ints.filter(it => it.id !== id)); if (selId === id) setSelId(null) }

  const arPct = (W && H) ? (H / W * 100) : 56.25
  return (
    <div>
      <span style={sectionLabel}>Interactions — drag to move · drag a corner to resize</span>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- editor-only pointer-drag canvas; each interaction's position is also stored numerically in the clip and editable in ForgeClip */}
      <div ref={overlayRef} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        style={{ position: 'relative', width: '100%', paddingBottom: arPct + '%', background: '#000',
                 borderRadius: 6, overflow: 'hidden', userSelect: 'none' }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- editor authoring preview; captions are handled on the published player */}
        <video ref={videoRef} src={videoSrc} onLoadedMetadata={onMeta}
          onTimeUpdate={e => setCurTime(e.target.currentTime)} controls muted
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        {ints.filter(it => it.type === 'hotspot' && it.data && it.data.x != null).map(it => {
          const g = geom(it), st = hotspotStyle(it.data.color), sel = it.id === selId
          return (
            /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- editor-only pointer-drag move affordance; position is stored numerically and editable in ForgeClip */
            <div key={it.id} onMouseDown={e => startMove(e, it)} title={it.data.label || 'Hotspot'}
              style={{ position: 'absolute', left: g.x / W * 100 + '%', top: g.y / H * 100 + '%',
                width: g.w / W * 100 + '%', height: g.h / H * 100 + '%', transform: 'translate(-50%,-50%)',
                border: `2px solid ${st.border}`, background: st.fill, borderRadius: shapeRadius(it.data.shape),
                boxSizing: 'border-box', cursor: 'move', boxShadow: sel ? '0 0 0 2px var(--forge-amber)' : 'none' }}>
              {sel && ['nw', 'ne', 'sw', 'se'].map(c => (
                /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- editor-only pointer-drag resize handle; size is stored numerically */
                <div key={c} onMouseDown={e => startResize(e, it, c)} aria-hidden="true"
                  style={{ position: 'absolute', width: 12, height: 12, background: '#fff', border: '2px solid #2563EB',
                    borderRadius: 2, boxSizing: 'border-box', left: c[1] === 'w' ? 0 : '100%', top: c[0] === 'n' ? 0 : '100%',
                    transform: 'translate(-50%,-50%)', cursor: (c === 'nw' || c === 'se') ? 'nwse-resize' : 'nesw-resize' }} />
              ))}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <button onClick={addHotspot}
          style={{ ...iconBtnStyle, border: '1px solid #7A3A9A', color: '#B07AD0', padding: '4px 10px', borderRadius: 4 }}>
          ⊕ Hotspot at {curTime.toFixed(1)}s
        </button>
        <span style={{ fontSize: 10, color: 'var(--cf-text-tertiary)' }}>
          {ints.filter(it => it.type === 'hotspot').length} hotspot(s) · px @ {W}×{H}
        </span>
      </div>
      {ints.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {ints.map(it => (
            /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- row-select convenience; the delete control is keyboard-focusable */
            <div key={it.id} onMouseDown={() => setSelId(it.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', borderRadius: 4, cursor: 'pointer',
                background: it.id === selId ? 'color-mix(in srgb, var(--forge-amber) 14%, transparent)' : 'transparent' }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--forge-font, monospace)', color: 'var(--cf-text-tertiary)', width: 48 }}>
                {(it.timecode || 0).toFixed(1)}s
              </span>
              <span style={{ fontSize: 11, flex: 1, color: 'var(--cf-text-primary)' }}>{it.data?.label || it.data?.text || it.type}</span>
              <button onClick={e => { e.stopPropagation(); removeInt(it.id) }} aria-label="Delete interaction"
                style={{ ...iconBtnStyle, color: '#E87070' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AssetCard({ icon, name, meta, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      background: 'var(--cf-input-bg)', border: '1px solid var(--cf-border-secondary)', borderRadius: 6,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cf-text-primary)' }}>{name}</div>
        {meta && <div style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', marginTop: 2 }}>{meta}</div>}
      </div>
      <button onClick={onRemove} aria-label="Remove asset"
        style={{ background: 'none', border: 'none', color: '#E87070', cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>
    </div>
  )
}

const sectionLabel = {
  display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--cf-text-tertiary)',
  letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8,
}
const iconBtnStyle = {
  background: 'none', border: 'none', color: 'var(--cf-text-tertiary)',
  cursor: 'pointer', fontSize: 12, padding: '2px 6px',
}
const inputStyle = {
  width: '100%', background: 'var(--cf-input-bg)', border: '1px solid var(--cf-input-border)',
  borderRadius: 4, padding: '7px 10px', fontSize: 13, color: 'var(--cf-input-text)',
  fontFamily: 'var(--cf-font)', boxSizing: 'border-box',
}
