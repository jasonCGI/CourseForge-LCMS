import React, { useState, useEffect, useCallback } from 'react'
import useEditorStore  from '../../../store/editorStore'
import useProjectStore from '../../../store/projectStore'
import MediaUploader   from './MediaUploader'
import { uploadMedia, uploadClip, getMediaAsset, uploadIVideoPackage } from '../../../api/client'
import BoundsControl from './BoundsControl'
import useContentArea from '../../../hooks/useContentArea'
import { hotspotStyle } from '../../../utils/hotspotStyle'

const VIDEO_ACCEPT = {
  'video/mp4':       ['.mp4'],
  'video/webm':      ['.webm'],
  'video/quicktime': ['.mov'],
}
const CLIP_ACCEPT = { 'application/json': ['.json'] }
const ZIP_ACCEPT  = { 'application/zip': ['.zip'], 'application/x-zip-compressed': ['.zip'], 'application/octet-stream': ['.zip'] }

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
  const [uploadingPkg,   setUploadingPkg]   = useState(false)
  const [pkgError,       setPkgError]       = useState(null)

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

  // One-drop path: a ForgeClip .zip (Bake & Export / Package) fills BOTH the video
  // and the .clip.json. The live-preview editor then seeds block.data.clip.
  const handlePackageUpload = useCallback(async (file) => {
    if (!activeProject?.id) return
    setUploadingPkg(true); setPkgError(null)
    try {
      const { data } = await uploadIVideoPackage(file, activeProject.id)
      const v = data.video || {}, c = data.clip || {}
      setVideoMeta(v)
      updateBlock(block.id, {
        video_asset_id:    v.id,
        video_filename:    v.original_name,
        video_serve_url:   v.serve_url,
        clip_asset_id:     c.id,
        interaction_count: c.interaction_count,
        video_duration:    c.video_duration,
      })
    } catch (e) {
      setPkgError(e.response?.data?.error || 'Package upload failed.')
    } finally { setUploadingPkg(false) }
  }, [activeProject, block.id, updateBlock])

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
        {/* Quick start — one ForgeClip .zip fills both the video and interactions */}
        {!videoId && (
          <div style={{ marginBottom: 14 }}>
            <span style={sectionLabel}>Quick start — ForgeClip package (.zip)</span>
            <MediaUploader
              accept={ZIP_ACCEPT}
              label="Drop a ForgeClip .zip (Bake & Export or Package) — fills video + interactions"
              onUpload={handlePackageUpload}
              uploading={uploadingPkg}
              error={pkgError}
            />
            <p style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', margin: '6px 2px 0', fontFamily: 'var(--forge-font, monospace)' }}>
              // or set the video + .clip.json individually below
            </p>
          </div>
        )}

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

        {/* Interactions — visual drag/resize happens on the LIVE PREVIEW (select this
            block); here you fine-tune coordinates, sizes, timecodes, and labels. */}
        {videoId && (block.data.clip || clipId) && (
          <div style={{ marginBottom: 14 }}>
            <InteractionList block={block} updateBlock={updateBlock} />
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

// Text-only interaction list: per-interaction timecode / label + numeric coordinate
// & dimension (px) fields. The VISUAL drag/resize lives on the live preview
// (IVideoEditor); selection is shared via the editor store (activeInteractionId), so
// picking a row here highlights + seeks to it on the player, and vice-versa. Reads/
// writes block.data.clip (seeded by the live-preview editor on load).
function InteractionList({ block, updateBlock }) {
  const activeInteractionId  = useEditorStore(s => s.activeInteractionId)
  const setActiveInteraction = useEditorStore(s => s.setActiveInteraction)
  const ivideoEditBlockId    = useEditorStore(s => s.ivideoEditBlockId)
  const setIvideoEditBlock   = useEditorStore(s => s.setIvideoEditBlock)
  const editing = ivideoEditBlockId === block.id
  const clip = block.data.clip
  const ints = (clip && clip.interactions) || []
  const nW = (clip && clip.video && clip.video.width)  || 1920
  const nH = (clip && clip.video && clip.video.height) || 1080

  const commit    = next => updateBlock(block.id, { clip: { ...clip, interactions: next } })
  const patchData = (id, dataPatch) => commit(ints.map(it => it.id === id ? { ...it, data: { ...it.data, ...dataPatch } } : it))
  const patchTop  = (id, topPatch)  => commit(ints.map(it => it.id === id ? { ...it, ...topPatch } : it))
  const del = id => { commit(ints.filter(it => it.id !== id)); if (activeInteractionId === id) setActiveInteraction(null) }
  const add = (type) => {
    if (!clip) return
    const it = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'i' + Date.now(),
      type, timecode: 0, pause_on_reach: type !== 'annotation',
      data: type === 'hotspot'
        ? { x: Math.round(nW / 2), y: Math.round(nH / 2), w: Math.round(0.22 * nW), h: Math.round(0.22 * nH), shape: 'round', color: null, label: 'New Hotspot', description: '' }
        : { x: Math.round(nW / 2), y: Math.round(0.30 * nH), text: 'Label', style: 'label' },
    }
    commit([...ints, it]); setActiveInteraction(it.id)
  }

  const editToggle = (
    <button onClick={() => setIvideoEditBlock(editing ? null : block.id)}
      aria-pressed={editing}
      style={{ ...addBtnStyle, display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'center',
        gap: 6, marginBottom: 8, fontWeight: 600,
        border: `1px solid ${editing ? 'var(--forge-amber)' : '#7A3A9A'}`,
        color: editing ? '#042C53' : '#B07AD0', background: editing ? 'var(--forge-amber)' : 'transparent' }}>
      {editing ? '✓ Editing on preview — click to finish' : '✎ Edit hotspots on the preview'}
    </button>
  )
  const editHint = editing ? (
    <p style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', margin: '0 0 8px', fontFamily: 'var(--forge-font, monospace)' }}>
      // drag to move · drag a corner to resize · marching ants = editable
    </p>
  ) : null

  if (!clip) {
    return (
      <div>
        <span style={sectionLabel}>Interactions</span>
        {editToggle}
        {editHint}
        <p style={{ fontSize: 11, color: 'var(--cf-text-tertiary)', margin: 0 }}>
          {editing
            ? 'Loading the player… interactions appear here once it initializes.'
            : 'Click "Edit hotspots" (or upload a .clip.json) to add and place interactions.'}
        </p>
      </div>
    )
  }

  const numPx = (val, onCh, max) => (
    <input type="number" min={0} max={max} value={Math.round(val ?? 0)}
      onChange={e => onCh(Math.round(Number(e.target.value) || 0))}
      style={{ ...inputStyle, width: 60, padding: '4px 6px', fontSize: 12 }} />
  )

  return (
    <div>
      <span style={sectionLabel}>Interactions ({ints.length})</span>
      {editToggle}
      {editHint}
      {ints.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--cf-text-tertiary)', margin: '0 0 8px' }}>No interactions yet — add one below.</p>
      )}
      {ints.slice().sort((a, b) => (a.timecode || 0) - (b.timecode || 0)).map(it => {
        const sel = it.id === activeInteractionId
        const d = it.data || {}
        return (
          /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- row-select convenience; every control inside is keyboard-focusable */
          <div key={it.id} onMouseDown={() => setActiveInteraction(it.id)}
            style={{ padding: '6px 8px', borderRadius: 6, marginBottom: 6, cursor: 'pointer',
              background: sel ? 'color-mix(in srgb, var(--forge-amber) 12%, transparent)' : 'var(--cf-input-bg)',
              border: sel ? '1.5px solid var(--forge-amber)' : '1px solid var(--cf-border-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {it.type === 'hotspot' && (
                <span style={{ width: 12, height: 12, flexShrink: 0, borderRadius: 3,
                  border: `2px solid ${hotspotStyle(d.color).border}`, background: hotspotStyle(d.color).fill }} />
              )}
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, letterSpacing: '0.06em',
                background: it.type === 'hotspot' ? '#7A3A9A' : '#185FA5', color: '#fff', textTransform: 'uppercase', flexShrink: 0 }}>{it.type}</span>
              <input value={d.label ?? d.text ?? ''} placeholder={it.type === 'hotspot' ? 'Label' : 'Text'}
                onChange={e => patchData(it.id, it.type === 'hotspot' ? { label: e.target.value } : { text: e.target.value })}
                aria-label="Interaction label" style={{ ...inputStyle, flex: 1, padding: '4px 6px', fontSize: 12 }} />
              <button onClick={e => { e.stopPropagation(); del(it.id) }} aria-label="Delete interaction"
                style={{ ...iconBtnStyle, color: '#E87070' }}>✕</button>
            </div>
            {sel && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6, alignItems: 'center' }}>
                <label style={fieldTag}>t(s)
                  <input type="number" step="0.1" min={0} value={it.timecode ?? 0}
                    onChange={e => patchTop(it.id, { timecode: Number(e.target.value) || 0 })}
                    aria-label="Timecode (seconds)" style={{ ...inputStyle, width: 60, padding: '4px 6px', fontSize: 12 }} />
                </label>
                <label style={fieldTag}>X {numPx(d.x, v => patchData(it.id, { x: v }), nW)}</label>
                <label style={fieldTag}>Y {numPx(d.y, v => patchData(it.id, { y: v }), nH)}</label>
                {it.type === 'hotspot' && <label style={fieldTag}>W {numPx(d.w, v => patchData(it.id, { w: v }), nW)}</label>}
                {it.type === 'hotspot' && <label style={fieldTag}>H {numPx(d.h, v => patchData(it.id, { h: v }), nH)}</label>}
              </div>
            )}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
        <button onClick={() => add('hotspot')} style={addBtnStyle}>⊕ Hotspot</button>
        <button onClick={() => add('annotation')} style={addBtnStyle}>✎ Annotation</button>
        <span style={{ fontSize: 10, color: 'var(--cf-text-tertiary)' }}>px @ {nW}×{nH}</span>
      </div>
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
const fieldTag = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10,
  color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font, monospace)',
}
const addBtnStyle = {
  background: 'none', border: '1px solid #7A3A9A', color: '#B07AD0',
  cursor: 'pointer', fontSize: 12, padding: '4px 10px', borderRadius: 4,
}
