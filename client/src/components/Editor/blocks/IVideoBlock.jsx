import React, { useState, useEffect, useCallback } from 'react'
import useEditorStore  from '../../../store/editorStore'
import useProjectStore from '../../../store/projectStore'
import MediaUploader   from './MediaUploader'
import { uploadMedia, uploadClip, getMediaAsset } from '../../../api/client'

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
          <label style={sectionLabel}>Step 1 — Video file (.mp4)</label>
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
          <label style={sectionLabel}>Step 2 — ForgeClip file (.clip.json)</label>
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

        {/* Caption */}
        <div>
          <label style={sectionLabel}>Caption (optional)</label>
          <input value={block.data.caption || ''} onChange={e => update('caption', e.target.value)}
            placeholder="Optional caption shown below the player"
            aria-label="Interactive video caption" style={inputStyle} />
        </div>

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
