import React, { useState, useCallback } from 'react'
import useEditorStore  from '../../../store/editorStore'
import useProjectStore from '../../../store/projectStore'
import Model3DViewer   from '../../Preview/Model3DViewer'
import { uploadModel } from '../../../api/client'

export default function Model3DBlock({ block }) {
  const updateBlock   = useEditorStore(s => s.updateBlock)
  const removeBlock   = useEditorStore(s => s.removeBlock)
  const moveBlock     = useEditorStore(s => s.moveBlock)
  const activeProject = useProjectStore(s => s.activeProject)

  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState(null)
  const [preview, setPreview]     = useState(false)

  const update = (field, val) => updateBlock(block.id, { [field]: val })

  const handleUpload = useCallback(async (file) => {
    if (!activeProject?.id) return
    setUploading(true); setError(null)
    try {
      const { data } = await uploadModel(file, activeProject.id)
      updateBlock(block.id, {
        model_asset_id: data.id, model_filename: data.original_name,
        model_serve_url: data.serve_url, file_size_mb: data.file_size_mb,
      })
    } catch (e) {
      setError(e.response?.data?.error || 'Upload failed.')
    } finally { setUploading(false) }
  }, [activeProject, block.id, updateBlock])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }, [handleUpload])

  const hasModel = !!block.data.model_asset_id

  return (
    <div style={{
      background: 'var(--cf-block-bg)', border: '1px solid var(--cf-block-border)',
      borderLeft: '4px solid #2A5A8A', borderRadius: 8, overflow: 'hidden', marginBottom: 12,
    }}>
      <div style={{
        background: 'rgba(42,90,138,0.12)', padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--cf-block-border)',
      }}>
        <span style={{
          fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', fontSize: 9, fontWeight: 600,
          padding: '2px 7px', borderRadius: 3, background: '#2A5A8A', color: '#fff',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>3D Model</span>
        <span style={{ flex: 1, fontSize: 11, color: 'var(--cf-text-tertiary)' }}>GLB · Three.js viewer</span>
        {hasModel && (
          <button onClick={() => setPreview(p => !p)} aria-pressed={preview}
            style={{
              padding: '3px 10px',
              background: preview ? 'color-mix(in srgb, var(--forge-amber) 15%, transparent)' : 'transparent',
              border: `1px solid ${preview ? 'var(--forge-amber)' : 'var(--cf-border-tertiary)'}`,
              borderRadius: 4, color: preview ? 'var(--forge-amber)' : 'var(--cf-text-tertiary)',
              fontSize: 10, cursor: 'pointer', fontFamily: 'var(--cf-font)',
            }}>
            {preview ? '▼ Hide preview' : '▶ Preview'}
          </button>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => moveBlock(block.id, 'up')} aria-label="Move block up" style={iconBtn}>↑</button>
          <button onClick={() => moveBlock(block.id, 'down')} aria-label="Move block down" style={iconBtn}>↓</button>
          <button onClick={() => removeBlock(block.id)} aria-label="Remove block" style={{ ...iconBtn, color: '#E87070' }}>✕</button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {!hasModel ? (
          <div onDrop={onDrop} onDragOver={e => e.preventDefault()}
            onClick={() => document.getElementById(`model-input-${block.id}`).click()}
            role="button" tabIndex={0} aria-label="Upload GLB model file"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') document.getElementById(`model-input-${block.id}`).click() }}
            style={{ border: '2px dashed #2A5A8A', borderRadius: 8, padding: '32px 20px', textAlign: 'center',
                     cursor: 'pointer', background: 'rgba(42,90,138,0.04)', marginBottom: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.5 }}>⬡</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cf-text-secondary)', marginBottom: 4 }}>
              {uploading ? 'Uploading…' : 'Drop .glb file here or click to browse'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)' }}>
              .glb · .gltf · exported from Blender, 3ds Max, or any GLTF exporter
            </div>
            {error && <div style={{ marginTop: 10, fontSize: 12, color: '#E87070' }}>{error}</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 12,
            background: 'var(--cf-input-bg)', border: '1px solid var(--cf-border-secondary)', borderRadius: 6 }}>
            <span style={{ fontSize: 20 }}>⬡</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cf-text-primary)' }}>{block.data.model_filename}</div>
              <div style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', marginTop: 2 }}>
                {block.data.file_size_mb ? `${block.data.file_size_mb} MB` : 'GLB model'} · Three.js r128
              </div>
            </div>
            <button onClick={() => updateBlock(block.id, { model_asset_id: null, model_filename: null, model_serve_url: null, file_size_mb: null })}
              aria-label="Remove model" style={{ background: 'none', border: 'none', color: '#E87070', cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>
          </div>
        )}

        <input type="file" id={`model-input-${block.id}`} accept=".glb,.gltf" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files[0]; if (f) handleUpload(f) }} />

        {preview && hasModel && (
          <div style={{ marginBottom: 12 }}>
            <Model3DViewer modelUrl={block.data.model_serve_url} caption={block.data.caption}
              height={block.data.viewer_height || 320} bgColor={block.data.bg_color || '#0d1017'} />
          </div>
        )}

        {hasModel && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Viewer height (px)</label>
              <input type="number" min="200" max="800" step="50" value={block.data.viewer_height || 400}
                onChange={e => update('viewer_height', parseInt(e.target.value, 10))}
                aria-label="Viewer height in pixels" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Background color</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="color" value={block.data.bg_color || '#0d1017'} onChange={e => update('bg_color', e.target.value)}
                  aria-label="Viewer background color" style={{ width: 36, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 2 }} />
                <input type="text" value={block.data.bg_color || '#0d1017'} onChange={e => update('bg_color', e.target.value)}
                  aria-label="Background color hex value" style={{ ...inputStyle, flex: 1 }} />
              </div>
            </div>
          </div>
        )}

        {hasModel && (
          <div>
            <label style={labelStyle}>Caption (optional)</label>
            <input value={block.data.caption || ''} onChange={e => update('caption', e.target.value)}
              placeholder="Describe the 3D model for learners and screen readers"
              aria-label="3D model caption" style={{ ...inputStyle, width: '100%' }} />
          </div>
        )}

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--cf-border-tertiary)',
          fontSize: 10, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', lineHeight: 1.6 }}>
          // 3ds Max: File → Export → .glb (GLTF Binary) · Blender: File → Export → glTF 2.0 · apply transforms before export
        </div>
      </div>
    </div>
  )
}

const iconBtn = { background: 'none', border: 'none', color: 'var(--cf-text-tertiary)', cursor: 'pointer', fontSize: 12, padding: '2px 6px' }
const labelStyle = { display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--cf-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }
const inputStyle = { background: 'var(--cf-input-bg)', border: '1px solid var(--cf-input-border)', borderRadius: 4, padding: '6px 8px', fontSize: 12, color: 'var(--cf-input-text)', fontFamily: 'var(--cf-font)', width: '100%' }
