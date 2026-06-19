import React, { useState, useCallback } from 'react'
import useEditorStore  from '../../../store/editorStore'
import useProjectStore from '../../../store/projectStore'
import Model3DViewer   from '../../Preview/Model3DViewer'
import { uploadModel } from '../../../api/client'

const DOT_COLOR = '#F59E0B'  // concrete forge amber — stored + used in SCORM

export default function Model3DBlock({ block }) {
  const updateBlock   = useEditorStore(s => s.updateBlock)
  const removeBlock   = useEditorStore(s => s.removeBlock)
  const moveBlock     = useEditorStore(s => s.moveBlock)
  const activeProject = useProjectStore(s => s.activeProject)

  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState(null)
  const [preview, setPreview]     = useState(false)
  const [pinMode, setPinMode]     = useState(false)
  const [pendingPin, setPendingPin] = useState(null)
  const [newLabel, setNewLabel]   = useState('')
  const [newDesc, setNewDesc]     = useState('')
  const [editingId, setEditingId] = useState(null)

  const update      = (field, val) => updateBlock(block.id, { [field]: val })
  const annotations = block.data.annotations || []
  const hasModel    = !!block.data.model_asset_id

  const handleUpload = useCallback(async (file) => {
    if (!activeProject?.id) return
    setUploading(true); setError(null)
    try {
      const { data } = await uploadModel(file, activeProject.id)
      updateBlock(block.id, {
        model_asset_id: data.id, model_filename: data.original_name,
        model_serve_url: data.serve_url, file_size_mb: data.file_size_mb, annotations: [],
      })
    } catch (e) {
      setError(e.response?.data?.error || 'Upload failed.')
    } finally { setUploading(false) }
  }, [activeProject, block.id, updateBlock])

  const onDrop = useCallback((e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f) }, [handleUpload])

  const handlePinPlaced = useCallback((position3D) => {
    setPendingPin(position3D); setPinMode(false); setNewLabel(''); setNewDesc('')
  }, [])

  const confirmPin = () => {
    if (!pendingPin || !newLabel.trim()) return
    update('annotations', [...annotations, {
      id: crypto.randomUUID(), label: newLabel.trim(), description: newDesc.trim(),
      position: pendingPin, color: DOT_COLOR,
    }])
    setPendingPin(null); setNewLabel(''); setNewDesc('')
  }
  const cancelPin = () => { setPendingPin(null); setNewLabel(''); setNewDesc('') }

  const saveEdit = (id, label, desc) => {
    update('annotations', annotations.map(a => a.id === id ? { ...a, label: label.trim(), description: desc.trim() } : a))
    setEditingId(null)
  }
  const deleteAnnotation = (id) => {
    update('annotations', annotations.filter(a => a.id !== id))
    if (editingId === id) setEditingId(null)
  }
  const reorderAnnotation = (id, dir) => {
    const idx = annotations.findIndex(a => a.id === id)
    if (idx < 0) return
    const next = [...annotations]; const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    update('annotations', next)
  }

  return (
    <div style={{ background: 'var(--cf-block-bg)', border: '1px solid var(--cf-block-border)',
      borderLeft: '4px solid #2A5A8A', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>

      <div style={{ background: 'rgba(42,90,138,0.12)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--cf-block-border)' }}>
        <span style={{ fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 3, background: '#2A5A8A', color: '#fff', letterSpacing: '0.1em', textTransform: 'uppercase' }}>3D Model</span>
        <span style={{ flex: 1, fontSize: 11, color: 'var(--cf-text-tertiary)' }}>
          {hasModel ? `${block.data.model_filename} · ${annotations.length} annotation${annotations.length !== 1 ? 's' : ''}` : 'GLB · Three.js viewer'}
        </span>
        {hasModel && (
          <button onClick={() => { setPreview(p => !p); setPinMode(false) }} aria-pressed={preview}
            style={{ padding: '3px 10px', background: preview ? 'color-mix(in srgb, var(--forge-amber) 15%, transparent)' : 'transparent',
              border: `1px solid ${preview ? 'var(--forge-amber)' : 'var(--cf-border-tertiary)'}`, borderRadius: 4,
              color: preview ? 'var(--forge-amber)' : 'var(--cf-text-tertiary)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--cf-font)' }}>
            {preview ? '▼ Hide' : '▶ Preview'}
          </button>
        )}
        <button onClick={() => moveBlock(block.id, 'up')} aria-label="Move block up" style={iconBtn}>↑</button>
        <button onClick={() => moveBlock(block.id, 'down')} aria-label="Move block down" style={iconBtn}>↓</button>
        <button onClick={() => removeBlock(block.id)} aria-label="Remove block" style={{ ...iconBtn, color: '#E87070' }}>✕</button>
      </div>

      <div style={{ padding: 16 }}>
        {!hasModel ? (
          <>
            <div onDrop={onDrop} onDragOver={e => e.preventDefault()}
              onClick={() => document.getElementById(`model-input-${block.id}`).click()}
              role="button" tabIndex={0} aria-label="Upload GLB model file"
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') document.getElementById(`model-input-${block.id}`).click() }}
              style={{ border: '2px dashed #2A5A8A', borderRadius: 8, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: 'rgba(42,90,138,0.04)', marginBottom: 12 }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.5 }}>⬡</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cf-text-secondary)', marginBottom: 4 }}>
                {uploading ? 'Uploading…' : 'Drop .glb file or click to browse'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)' }}>.glb · .gltf · exported from Blender or 3ds Max</div>
              {error && <div style={{ marginTop: 10, fontSize: 12, color: '#E87070' }}>{error}</div>}
            </div>
            <input type="file" id={`model-input-${block.id}`} accept=".glb,.gltf" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files[0]; if (f) handleUpload(f) }} />
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 12, background: 'var(--cf-input-bg)', border: '1px solid var(--cf-border-secondary)', borderRadius: 6 }}>
            <span style={{ fontSize: 20 }}>⬡</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cf-text-primary)' }}>{block.data.model_filename}</div>
              <div style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', marginTop: 2 }}>{block.data.file_size_mb ? `${block.data.file_size_mb} MB` : 'GLB model'} · Three.js r128</div>
            </div>
            <button onClick={() => { updateBlock(block.id, { model_asset_id: null, model_filename: null, model_serve_url: null, annotations: [] }); setPreview(false); setPinMode(false) }}
              aria-label="Remove model" style={{ background: 'none', border: 'none', color: '#E87070', cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>
          </div>
        )}

        {preview && hasModel && (
          <div style={{ marginBottom: 14 }}>
            <Model3DViewer modelUrl={block.data.model_serve_url} caption={block.data.caption}
              height={block.data.viewer_height || 400} bgColor={block.data.bg_color || '#0d1017'}
              environment={block.data.environment || 'studio'} envIntensity={block.data.env_intensity ?? 1}
              decorative={block.data.decorative} autoRotate={block.data.auto_rotate}
              annotations={annotations} pinMode={pinMode} onPinPlaced={handlePinPlaced} />
          </div>
        )}

        {pendingPin && (
          <div style={{ background: 'color-mix(in srgb, var(--forge-amber) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--forge-amber) 30%, transparent)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', fontSize: 9, fontWeight: 600, color: 'var(--forge-amber)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              New annotation — {pendingPin.x.toFixed(2)}, {pendingPin.y.toFixed(2)}, {pendingPin.z.toFixed(2)}
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={labelStyle}>Label *</label>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Fuel injector" autoFocus aria-label="Annotation label"
                onKeyDown={e => { if (e.key === 'Enter') confirmPin(); if (e.key === 'Escape') cancelPin() }} style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Description (optional)</label>
              <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Explain what this component is or does…" rows={2}
                aria-label="Annotation description" style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmPin} disabled={!newLabel.trim()}
                style={{ padding: '6px 14px', background: newLabel.trim() ? 'var(--forge-amber)' : 'color-mix(in srgb, var(--forge-amber) 30%, transparent)',
                  color: newLabel.trim() ? '#042C53' : '#888', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600,
                  cursor: newLabel.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--cf-font)' }}>✓ Add annotation</button>
              <button onClick={cancelPin} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--cf-border-tertiary)', borderRadius: 4, color: 'var(--cf-text-tertiary)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--cf-font)' }}>Cancel</button>
            </div>
          </div>
        )}

        {hasModel && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Viewer height (px)</label>
                <input type="number" min="200" max="800" step="50" value={block.data.viewer_height || 400}
                  onChange={e => update('viewer_height', parseInt(e.target.value, 10))} aria-label="Viewer height in pixels" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Background</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="color" value={block.data.bg_color || '#0d1017'} onChange={e => update('bg_color', e.target.value)} aria-label="Viewer background color" style={{ width: 36, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 2 }} />
                  <input type="text" value={block.data.bg_color || '#0d1017'} onChange={e => update('bg_color', e.target.value)} aria-label="Background color hex" style={{ ...inputStyle, flex: 1 }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Environment (reflections)</label>
                <select value={block.data.environment || 'studio'} onChange={e => update('environment', e.target.value)}
                  aria-label="Viewer environment" style={{ ...inputStyle, width: '100%' }}>
                  <option value="studio">Studio — procedural</option>
                  <option value="day">Day — outdoor HDRI</option>
                  <option value="night">Night — HDRI</option>
                  <option value="none">None — flat lighting</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Reflection intensity</label>
                <input type="range" min="0" max="2" step="0.1" value={block.data.env_intensity ?? 1}
                  onChange={e => update('env_intensity', parseFloat(e.target.value))}
                  disabled={(block.data.environment || 'studio') === 'none'}
                  aria-label="Reflection intensity" style={{ width: '100%' }} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Caption (optional)</label>
              <input value={block.data.caption || ''} onChange={e => update('caption', e.target.value)} placeholder="Describe the model for learners and screen readers" aria-label="3D model caption" style={{ ...inputStyle, width: '100%' }} />
            </div>

            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <input type="checkbox" id={`m3d-autorotate-${block.id}`} checked={!!block.data.auto_rotate}
                onChange={e => update('auto_rotate', e.target.checked)} style={{ marginTop: 2 }} />
              <label htmlFor={`m3d-autorotate-${block.id}`} style={{ fontSize: 12, color: 'var(--cf-text-secondary)', lineHeight: 1.4 }}>
                Auto-rotate — slowly orbit the model
                <span style={{ display: 'block', fontSize: 10, color: 'var(--cf-text-tertiary)', marginTop: 2 }}>
                  Pauses while the learner drags. Honors “reduce motion”.
                </span>
              </label>
            </div>

            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <input type="checkbox" id={`m3d-decorative-${block.id}`} checked={!!block.data.decorative}
                onChange={e => update('decorative', e.target.checked)} style={{ marginTop: 2 }} />
              <label htmlFor={`m3d-decorative-${block.id}`} style={{ fontSize: 12, color: 'var(--cf-text-secondary)', lineHeight: 1.4 }}>
                Decorative — hide from screen readers (no text alternative needed)
                <span style={{ display: 'block', fontSize: 10, color: 'var(--cf-text-tertiary)', marginTop: 2 }}>
                  Tick only if the model is purely visual. Otherwise the caption above is the 508/WCAG text alternative.
                </span>
              </label>
            </div>

            <div style={{ borderTop: '1px solid var(--cf-border-tertiary)', paddingTop: 14, marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ ...labelStyle, marginBottom: 0, flex: 1 }}>Annotations ({annotations.length})</span>
                {preview && !pendingPin && (
                  <button onClick={() => setPinMode(p => !p)} aria-pressed={pinMode}
                    style={{ padding: '5px 12px', background: pinMode ? 'color-mix(in srgb, var(--forge-amber) 15%, transparent)' : 'transparent',
                      border: `1px solid ${pinMode ? 'var(--forge-amber)' : 'var(--cf-border-tertiary)'}`, borderRadius: 4,
                      color: pinMode ? 'var(--forge-amber)' : 'var(--cf-text-tertiary)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--cf-font)', fontWeight: 600 }}>
                    {pinMode ? '✕ Cancel placement' : '✦ Place pin'}
                  </button>
                )}
                {!preview && !pendingPin && (
                  <span style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', fontStyle: 'italic' }}>enable preview to place pins</span>
                )}
              </div>

              {annotations.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)' }}>
                  // no annotations yet · enable preview then click ✦ Place pin
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {annotations.map((ann, idx) => (
                    <AnnotationRow key={ann.id} ann={ann} idx={idx} total={annotations.length}
                      isEditing={editingId === ann.id} onEdit={() => setEditingId(editingId === ann.id ? null : ann.id)}
                      onSave={(label, desc) => saveEdit(ann.id, label, desc)} onDelete={() => deleteAnnotation(ann.id)}
                      onReorder={(dir) => reorderAnnotation(ann.id, dir)} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--cf-border-tertiary)', fontSize: 10, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', lineHeight: 1.6 }}>
          // 3ds Max: File → Export → glTF 2.0 · Reset XForm before export · embed textures · Y-up axis
        </div>
      </div>
    </div>
  )
}

function AnnotationRow({ ann, idx, total, isEditing, onEdit, onSave, onDelete, onReorder }) {
  const [label, setLabel] = React.useState(ann.label)
  const [desc, setDesc]   = React.useState(ann.description)
  React.useEffect(() => { setLabel(ann.label); setDesc(ann.description) }, [ann.label, ann.description, isEditing])

  return (
    <div style={{ border: `1px solid ${isEditing ? 'color-mix(in srgb, var(--forge-amber) 30%, transparent)' : 'var(--cf-border-tertiary)'}`,
      borderLeft: `3px solid ${ann.color || '#F59E0B'}`, borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: isEditing ? 'color-mix(in srgb, var(--forge-amber) 5%, transparent)' : 'var(--cf-input-bg)' }}>
        <span style={{ fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', fontSize: 9, fontWeight: 600, color: ann.color || '#F59E0B', width: 16, textAlign: 'center', flexShrink: 0 }}>●</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--cf-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ann.label}</span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={() => onReorder(-1)} disabled={idx === 0} aria-label="Move annotation up" style={smBtn}>↑</button>
          <button onClick={() => onReorder(1)} disabled={idx === total - 1} aria-label="Move annotation down" style={smBtn}>↓</button>
          <button onClick={onEdit} aria-label={isEditing ? 'Cancel edit' : 'Edit annotation'} style={{ ...smBtn, color: isEditing ? 'var(--forge-amber)' : 'var(--cf-text-tertiary)' }}>{isEditing ? '✕' : '✎'}</button>
          <button onClick={onDelete} aria-label="Delete annotation" style={{ ...smBtn, color: '#E87070' }}>🗑</button>
        </div>
      </div>
      {isEditing && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--cf-border-tertiary)' }}>
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Label</label>
            <input value={label} onChange={e => setLabel(e.target.value)} autoFocus aria-label="Edit annotation label" style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} aria-label="Edit annotation description" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', marginBottom: 8 }}>
            // position: {ann.position.x.toFixed(3)}, {ann.position.y.toFixed(3)}, {ann.position.z.toFixed(3)}
          </div>
          <button onClick={() => onSave(label, desc)} disabled={!label.trim()}
            style={{ padding: '5px 12px', background: 'var(--forge-amber)', color: '#042C53', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--cf-font)' }}>✓ Save</button>
        </div>
      )}
    </div>
  )
}

const iconBtn = { background: 'none', border: 'none', color: 'var(--cf-text-tertiary)', cursor: 'pointer', fontSize: 12, padding: '2px 6px' }
const smBtn = { background: 'none', border: 'none', color: 'var(--cf-text-tertiary)', cursor: 'pointer', fontSize: 11, padding: '1px 4px' }
const labelStyle = { display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--cf-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }
const inputStyle = { background: 'var(--cf-input-bg)', border: '1px solid var(--cf-input-border)', borderRadius: 4, padding: '6px 8px', fontSize: 12, color: 'var(--cf-input-text)', fontFamily: 'var(--cf-font)' }
