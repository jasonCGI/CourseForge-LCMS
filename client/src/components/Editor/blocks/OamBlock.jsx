import React, { useCallback, useState, useEffect } from 'react'
import useEditorStore  from '../../../store/editorStore'
import useProjectStore from '../../../store/projectStore'
import { BlockHeader }  from './TextBlock'
import MediaUploader    from './MediaUploader'
import { uploadOam, getOamAsset } from '../../../api/client'
import OamMediaBar from '../../Preview/OamMediaBar'

const OAM_ACCEPT = {
  'application/vnd.adobe.oam+zip': ['.oam'],
  'application/zip':               ['.oam'],
}

export default function OamBlock({ block }) {
  const updateBlock   = useEditorStore(s => s.updateBlock)
  const removeBlock   = useEditorStore(s => s.removeBlock)
  const moveBlock     = useEditorStore(s => s.moveBlock)
  const activeProject = useProjectStore(s => s.activeProject)

  const [uploading,  setUploading]  = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [oamMeta,    setOamMeta]    = useState(null)
  const [showPreview, setShowPreview] = useState(false)

  const assetId = block.data.oam_asset_id

  // Load metadata if asset already linked
  useEffect(() => {
    if (!assetId) return
    getOamAsset(assetId)
      .then(r => setOamMeta(r.data))
      .catch(() => setOamMeta(null))
  }, [assetId])

  const handleUpload = useCallback(async (file) => {
    if (!activeProject?.id) {
      setUploadError('No project selected.')
      return
    }
    setUploading(true)
    setUploadError(null)
    try {
      const { data } = await uploadOam(file, activeProject.id)
      setOamMeta(data)
      updateBlock(block.id, {
        oam_asset_id:          data.id,
        width:                 data.width,
        height:                data.height,
        responsive:            data.responsive,
        scorm_bridge_enabled:  data.has_scorm_calls,
        entry_point:           data.entry_point,
      })
    } catch (e) {
      setUploadError(e.response?.data?.error || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }, [activeProject, block.id, updateBlock])

  const update = (field, val) => updateBlock(block.id, { [field]: val })

  return (
    <div style={{
      background: 'var(--cf-block-bg)',
      border: '1px solid var(--cf-block-border)',
      borderRadius: 8, overflow: 'hidden', marginBottom: 12,
    }}>
      <BlockHeader
        label="OAM — Adobe Animate Canvas"
        color="#533AB7"
        blockId={block.id}
        onRemove={removeBlock}
        onMove={moveBlock}
      />

      <div style={{ padding: 16 }}>

        {/* Authoring kit — runtime + snippets + local test harness for Animate authors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
          padding: '8px 10px', background: 'var(--cf-input-bg)', borderRadius: 6,
          border: '1px solid var(--cf-border-secondary)' }}>
          <span style={{ fontSize: 16 }}>🧰</span>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--cf-text-secondary)' }}>
            Authoring this in Adobe Animate? Grab the ForgeJS kit (runtime, frame-script
            snippets, and a local test harness).
          </span>
          <a href="/api/forgejs/authoring-kit.zip" download
            style={{ fontSize: 12, fontWeight: 600, color: '#533AB7', textDecoration: 'none',
              border: '1px solid #533AB7', borderRadius: 4, padding: '5px 10px', whiteSpace: 'nowrap' }}>
            ⬇ Authoring kit
          </a>
        </div>

        {/* Upload zone — shown until asset is linked */}
        {!assetId && (
          <div style={{ marginBottom: 16 }}>
            <MediaUploader
              accept={OAM_ACCEPT}
              label="Drop .oam file here"
              onUpload={handleUpload}
              uploading={uploading}
              error={uploadError}
            />
          </div>
        )}

        {/* Metadata card — shown after upload */}
        {oamMeta && (
          <div style={{
            background: 'var(--cf-input-bg)',
            border: '1px solid var(--cf-border-secondary)',
            borderRadius: 6, padding: 12, marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ fontSize: 28, flexShrink: 0 }}>⚙</div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500,
                  color: 'var(--cf-text-primary)', marginBottom: 6,
                }}>
                  {oamMeta.original_name}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <MetaBadge label={oamMeta.responsive ? 'Responsive' : `${oamMeta.width}×${oamMeta.height}`} color="#533AB7"/>
                  {oamMeta.has_audio      && <MetaBadge label="Audio" color="#854F0B"/>}
                  {oamMeta.has_scorm_calls && <MetaBadge label="SCORM bridge" color="#185FA5"/>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => setShowPreview(true)}
                  aria-label="Preview OAM content"
                  style={previewBtnStyle}
                >
                  ▶ Preview
                </button>
                <button
                  onClick={() => {
                    updateBlock(block.id, { oam_asset_id: null })
                    setOamMeta(null)
                  }}
                  aria-label="Remove OAM asset"
                  style={removeBtnStyle}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Inline WYSIWYG preview — shows the actual animation + media bar */}
        {oamMeta && oamMeta.iframe_src && (
          <div style={{ marginBottom: 14 }}>
            <div style={fieldLabel}>Live preview</div>
            <OamMediaBar
              src={oamMeta.iframe_src}
              width={block.data.responsive ? '100%' : (block.data.width || 800)}
              height={block.data.height || 600}
            />
          </div>
        )}

        {/* Settings — shown when asset is linked */}
        {assetId && (
          <>
            {/* Override dimensions */}
            {!block.data.responsive && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={fieldLabel}>Width (px)</label>
                  <input
                    type="number"
                    value={block.data.width || 800}
                    onChange={e => update('width', parseInt(e.target.value))}
                    aria-label="OAM width in pixels"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Height (px)</label>
                  <input
                    type="number"
                    value={block.data.height || 600}
                    onChange={e => update('height', parseInt(e.target.value))}
                    aria-label="OAM height in pixels"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {/* Responsive toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <input
                type="checkbox"
                id={`oam-responsive-${block.id}`}
                checked={block.data.responsive || false}
                onChange={e => update('responsive', e.target.checked)}
              />
              <label htmlFor={`oam-responsive-${block.id}`} style={{ fontSize: 12, color: 'var(--cf-text-secondary)' }}>
                Responsive (fills container width)
              </label>
            </div>

            {/* SCORM bridge toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <input
                type="checkbox"
                id={`oam-bridge-${block.id}`}
                checked={block.data.scorm_bridge_enabled || false}
                onChange={e => update('scorm_bridge_enabled', e.target.checked)}
              />
              <label htmlFor={`oam-bridge-${block.id}`} style={{ fontSize: 12, color: 'var(--cf-text-secondary)' }}>
                Enable SCORM bridge (required if OAM makes LMS API calls)
              </label>
            </div>

            {/* Caption */}
            <div>
              <label style={fieldLabel}>Caption</label>
              <input
                value={block.data.caption || ''}
                onChange={e => update('caption', e.target.value)}
                placeholder="Optional caption shown below animation"
                aria-label="OAM caption"
                style={inputStyle}
              />
            </div>

            {/* Stop prompts — shown in the shell prompt zone at each stop, in
                order (line 1 → stop 1). A blank line keeps the previous prompt. */}
            <div style={{ marginTop: 14 }}>
              <label style={fieldLabel}>Stop prompts (one per line, in stop order)</label>
              <textarea
                value={(block.data.prompts || []).join('\n')}
                onChange={e => update('prompts', e.target.value.split('\n'))}
                placeholder={'Examine the valve\nNow open it\n…'}
                aria-label="OAM stop prompts"
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--cf-font)' }}
              />
              <div style={{ fontSize: 10, color: 'var(--cf-text-tertiary, #7a7a90)', marginTop: 4 }}>
                Outside a GUI shell these log to the console; the final frame shows the end prompt.
              </div>
            </div>

            {/* End prompt — final-frame fallback */}
            <div style={{ marginTop: 14 }}>
              <label style={fieldLabel}>End prompt (final frame)</label>
              <input
                value={block.data.end_prompt || ''}
                onChange={e => update('end_prompt', e.target.value)}
                placeholder="Press NEXT to continue."
                aria-label="OAM end prompt"
                style={inputStyle}
              />
            </div>

            {/* Gate progression until the animation completes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <input
                type="checkbox"
                id={`oam-gate-${block.id}`}
                checked={block.data.gate_next || false}
                onChange={e => update('gate_next', e.target.checked)}
              />
              <label htmlFor={`oam-gate-${block.id}`} style={{ fontSize: 12, color: 'var(--cf-text-secondary)' }}>
                Disable NEXT until the animation finishes (stream-complete gate)
              </label>
            </div>
          </>
        )}
      </div>

      {/* Preview modal */}
      {showPreview && oamMeta && (
        <div
          onClick={() => setShowPreview(false)}
          role="dialog"
          aria-modal="true"
          aria-label="OAM preview"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 1000, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: 32,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 8,
            overflow: 'hidden', maxWidth: '90vw', maxHeight: '85vh',
          }}>
            <div style={{
              padding: '10px 16px', background: '#042C53',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 13, color: '#B5D4F4', flex: 1 }}>
                Preview — {oamMeta.original_name}
              </span>
              <button
                onClick={() => setShowPreview(false)}
                aria-label="Close preview"
                style={{ background: 'none', border: 'none', color: '#B5D4F4', fontSize: 18, cursor: 'pointer' }}
              >✕</button>
            </div>
            <iframe
              src={oamMeta.iframe_src}
              width={block.data.responsive ? 800 : (block.data.width || 800)}
              height={block.data.height || 600}
              style={{ border: 'none', display: 'block' }}
              title={oamMeta.original_name}
              sandbox="allow-scripts allow-same-origin"
            />
            {block.data.caption && (
              <div style={{ padding: '8px 16px', fontSize: 12, color: '#666' }}>
                {block.data.caption}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MetaBadge({ label, color }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px',
      borderRadius: 3, background: `${color}22`,
      color, border: `1px solid ${color}44`,
      letterSpacing: '0.04em',
    }}>
      {label}
    </span>
  )
}

const fieldLabel = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--cf-text-secondary)', letterSpacing: '0.08em',
  textTransform: 'uppercase', marginBottom: 6,
}

const inputStyle = {
  width: '100%', background: 'var(--cf-input-bg)',
  border: '1px solid var(--cf-input-border)',
  borderRadius: 4, padding: '7px 10px',
  fontSize: 13, color: 'var(--cf-input-text)',
  fontFamily: 'var(--cf-font)', boxSizing: 'border-box',
}

const previewBtnStyle = {
  padding: '5px 12px', background: '#185FA5', color: '#fff',
  border: 'none', borderRadius: 4, fontSize: 12,
  cursor: 'pointer', fontFamily: 'var(--cf-font)',
}

const removeBtnStyle = {
  padding: '5px 10px', background: 'transparent',
  color: '#E24B4A', border: '1px solid rgba(226,75,74,0.3)',
  borderRadius: 4, fontSize: 12, cursor: 'pointer',
  fontFamily: 'var(--cf-font)',
}
