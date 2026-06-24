import React, { useCallback, useState, lazy, Suspense } from 'react'
import useEditorStore from '../../../store/editorStore'
import useProjectStore from '../../../store/projectStore'
import { BlockHeader } from './TextBlock'
import MediaUploader from './MediaUploader'
import { uploadMedia } from '../../../api/client'
import BoundsControl from './BoundsControl'
import useContentArea from '../../../hooks/useContentArea'

// video.js is the single biggest dependency — only load it when a video block
// actually renders a player.
const VideoPlayer = lazy(() => import('./VideoPlayer'))

const MEDIA_KINDS = ['image', 'video', 'audio', 'oam']

const KIND_ICON = {
  image: '🖼',
  video: '🎬',
  audio: '🎙',
  oam:   '⚙',
}

const KIND_COLOR = {
  image: '#185FA5',
  video: '#3B6D11',
  audio: '#854F0B',
  oam:   '#533AB7',
}

export default function MediaBlock({ block }) {
  const updateBlock = useEditorStore(s => s.updateBlock)
  const removeBlock = useEditorStore(s => s.removeBlock)
  const moveBlock   = useEditorStore(s => s.moveBlock)

  const update = useCallback((field, value) => {
    updateBlock(block.id, { [field]: value })
  }, [block.id, updateBlock])

  const kind = block.data.kind || 'image'
  const caDims = useContentArea()

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [useVideoJs, setUseVideoJs] = useState(block.data.use_videojs !== false)
  const activeProject = useProjectStore(s => s.activeProject)

  const handleUpload = async (file) => {
    if (!activeProject?.id) { setUploadError('No project selected.'); return }
    setUploading(true)
    setUploadError(null)
    try {
      const { data } = await uploadMedia(file, activeProject.id, kind)
      update('asset_id', data.id)
      update('serve_url', data.serve_url)
      update('original_name', data.original_name)
      update('asset_meta', data)
    } catch (e) {
      setUploadError(e.response?.data?.error || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '1px solid var(--color-border-tertiary)',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      <BlockHeader
        label={`Media — ${kind}`}
        color={KIND_COLOR[kind]}
        blockId={block.id}
        onRemove={removeBlock}
        onMove={moveBlock}
      />

      <div style={{ padding: '16px' }}>
        {/* Kind selector */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabel}>Media type</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {MEDIA_KINDS.map(k => (
              <button
                key={k}
                onClick={() => update('kind', k)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 4,
                  border: `1px solid ${kind === k ? KIND_COLOR[k] : 'var(--color-border-tertiary)'}`,
                  background: kind === k ? KIND_COLOR[k] : 'transparent',
                  color: kind === k ? '#fff' : 'var(--color-text-secondary)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {KIND_ICON[k]} {k.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Placeholder label */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabel}>Placeholder label</label>
          <input
            value={block.data.placeholder_label || ''}
            onChange={e => update('placeholder_label', e.target.value)}
            placeholder="e.g. nose_section_photo"
            style={inputStyle}
          />
          <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
            Used to identify this slot when media is uploaded later
          </p>
        </div>

        {/* Caption */}
        <div>
          <label style={fieldLabel}>Caption</label>
          <input
            value={block.data.caption || ''}
            onChange={e => update('caption', e.target.value)}
            placeholder="Optional caption shown below media"
            style={inputStyle}
          />
        </div>

        {/* Placement (audio only) — inline in the content flow, or docked as a
            persistent slim bar pinned to the bottom of the content area. */}
        {kind === 'audio' && (
          <div style={{ marginTop: 12 }}>
            <label style={fieldLabel}>Placement</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['inline', 'Inline'], ['bottom', 'Docked (bottom)']].map(([val, lbl]) => {
                const active = (block.data.dock || 'inline') === val
                return (
                  <button
                    key={val}
                    onClick={() => update('dock', val)}
                    aria-pressed={active}
                    style={{
                      padding: '6px 14px', borderRadius: 4,
                      border: `1px solid ${active ? KIND_COLOR.audio : 'var(--color-border-tertiary)'}`,
                      background: active ? KIND_COLOR.audio : 'transparent',
                      color: active ? '#fff' : 'var(--color-text-secondary)',
                      fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {lbl}
                  </button>
                )
              })}
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
              Docked pins the player to the bottom of the content area so narration stays reachable.
            </p>
          </div>
        )}

        {/* Alt text (508) — text alternative for screen readers. Images require it;
            video uses it as an accessible description. */}
        {(kind === 'image' || kind === 'video') && (
          <div style={{ marginTop: 12 }}>
            <label style={fieldLabel}>
              Alt text{kind === 'image' && <span style={{ color: 'var(--cf-amber, #D4820A)', fontWeight: 600 }}> · required for 508</span>}
            </label>
            <input
              value={block.data.alt_text || ''}
              onChange={e => update('alt_text', e.target.value)}
              placeholder={kind === 'image'
                ? 'Describe the image for screen readers'
                : 'Describe the video for screen readers'}
              style={inputStyle}
            />
          </div>
        )}

        {(kind === 'image' || kind === 'video') && (
          <div style={{ marginTop: 12 }}>
            <BoundsControl bounds={block.data.bounds} contentArea={caDims}
              onChange={b => update('bounds', b)} fit={block.data.fit} onFitChange={v => update('fit', v)}
              labelStyle={fieldLabel} inputStyle={inputStyle} />
          </div>
        )}

        {/* Upload / linked asset */}
        <div style={{ marginTop: 16 }}>
          {!block.data.asset_id ? (
            <>
              {/* Placeholder preview — shown until a real asset is uploaded.
                  Demo blocks seed an SVG data-URI in serve_url; render it so the
                  block reads as "here's what goes here" rather than an empty box. */}
              {block.data.serve_url && (kind === 'image' || kind === 'video') && (
                <img
                  src={block.data.serve_url}
                  alt={block.data.alt_text || block.data.placeholder_label || `${kind} placeholder`}
                  // As-is: no engine rounding/border so the source image is shown unmodified.
                  style={{ width: '100%', display: 'block', marginBottom: 12 }}
                />
              )}
              <MediaUploader
                accept={kind === 'image'
                  ? { 'image/*': ['.png','.jpg','.jpeg','.gif','.webp'] }
                  : kind === 'video'
                    ? { 'video/*': ['.mp4','.mov','.webm'] }
                    : { 'audio/*': ['.mp3','.wav','.ogg','.m4a'] }
                }
                label={`Drop ${kind} file here`}
                onUpload={handleUpload}
                uploading={uploading}
                error={uploadError}
              />
            </>
          ) : (
            <div style={{
              padding: '16px', border: '1px solid var(--cf-border-secondary)',
              borderRadius: 6, background: 'var(--cf-input-bg)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 20 }}>{KIND_ICON[kind]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--cf-text-primary)', fontWeight: 500 }}>
                  {block.data.original_name || block.data.placeholder_label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--cf-text-tertiary)' }}>
                  {block.data.asset_id}
                </div>
              </div>
              <button
                onClick={() => { update('asset_id', null); update('serve_url', null); update('asset_meta', null) }}
                aria-label="Remove media asset"
                style={{ background:'none', border:'none', color:'#E24B4A', cursor:'pointer', fontSize:14 }}
              >✕</button>
            </div>
          )}
        </div>

        {/* Video.js player + companions — video kind only */}
        {kind === 'video' && block.data.asset_id && (
          <div style={{ marginTop: 14 }}>

            {/* Video.js toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px',
              background: 'var(--cf-input-bg)',
              border: '1px solid var(--cf-border-secondary)',
              borderRadius: 6, marginBottom: 12,
            }}>
              <input
                type="checkbox"
                id={`vjs-toggle-${block.id}`}
                checked={block.data.use_videojs !== false}
                onChange={e => { update('use_videojs', e.target.checked); setUseVideoJs(e.target.checked) }}
              />
              <label htmlFor={`vjs-toggle-${block.id}`} style={{ fontSize: 12, color: 'var(--cf-text-secondary)', flex: 1 }}>
                Use Video.js player (controls, captions, playback speed)
              </label>
            </div>

            {/* Companion file indicators */}
            {block.data.asset_meta && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <CompanionBadge label="WebM fallback" present={block.data.asset_meta.has_webm} tip="Browser fallback format" />
                <CompanionBadge label="Captions (VTT)" present={block.data.asset_meta.has_captions} tip="Required for 508 compliance if video has speech" />
                <CompanionBadge label="Poster image" present={block.data.asset_meta.has_poster} tip="Thumbnail shown before playback" />
              </div>
            )}

            {/* Live preview */}
            {block.data.use_videojs !== false ? (
              <Suspense fallback={<div style={{ fontSize: 11, color: 'var(--cf-text-tertiary)', padding: 12 }}>Loading player…</div>}>
                <VideoPlayer
                  mp4Url={`/api/media/serve/${block.data.asset_id}`}
                  webmUrl={block.data.asset_meta?.has_webm
                    ? `/api/media/serve/${block.data.asset_meta.companion_files?.webm_asset_id}` : null}
                  vttUrl={block.data.asset_meta?.has_captions
                    ? `/api/media/serve/${block.data.asset_meta.companion_files?.vtt_asset_id}` : null}
                  posterUrl={block.data.asset_meta?.has_poster
                    ? `/api/media/serve/${block.data.asset_meta.companion_files?.poster_asset_id}` : null}
                  title={block.data.original_name || 'Video'}
                  controls={true}
                />
              </Suspense>
            ) : (
              <video
                src={`/api/media/serve/${block.data.asset_id}`}
                controls
                style={{ width: '100%', borderRadius: 4 }}
                aria-label={block.data.original_name || 'Video'}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CompanionBadge({ label, present, tip }) {
  return (
    <span
      title={tip}
      style={{
        fontSize: 10, fontWeight: 600, padding: '2px 8px',
        borderRadius: 3, letterSpacing: '0.04em',
        background: present ? 'rgba(59,138,74,0.15)' : 'rgba(194,57,52,0.1)',
        color:      present ? '#4CAF50' : '#E87070',
        border:     `1px solid ${present ? 'rgba(59,138,74,0.3)' : 'rgba(194,57,52,0.3)'}`,
      }}
    >
      {present ? '✓' : '!'} {label}
    </span>
  )
}

const fieldLabel = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 6,
}

const inputStyle = {
  width: '100%',
  background: 'var(--color-background-secondary)',
  border: '1px solid var(--color-border-tertiary)',
  borderRadius: 4,
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box',
}
