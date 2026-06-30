import React, { useState, useCallback, useEffect } from 'react'
import useEditorStore  from '../../../store/editorStore'
import useProjectStore from '../../../store/projectStore'
import Model3DViewer   from '../../Preview/Model3DViewer'
import BoundsControl    from './BoundsControl'
import { uploadModel } from '../../../api/client'

const DOT_COLOR = '#F59E0B'  // concrete forge amber — stored + used in SCORM

export default function Model3DBlock({ block }) {
  const updateBlock   = useEditorStore(s => s.updateBlock)
  const removeBlock   = useEditorStore(s => s.removeBlock)
  const moveBlock     = useEditorStore(s => s.moveBlock)
  const activeProject = useProjectStore(s => s.activeProject)

  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState(null)
  const [placing, setPlacing]     = useState(false)   // false = clean still; true = live "place a pin" workflow
  const [pinMode, setPinMode]     = useState(false)
  const [pendingPin, setPendingPin] = useState(null)
  const [newLabel, setNewLabel]   = useState('')
  const [newDesc, setNewDesc]     = useState('')
  const [editingId, setEditingId] = useState(null)

  const [detectedParts, setDetectedParts] = useState([])   // [{key}] from the loaded GLB
  const [selPart, setSelPart] = useState(null)             // selected part key (bidirectional w/ viewer)

  const update      = (field, val) => updateBlock(block.id, { [field]: val })

  // The 3D viewer background defaults to the project's GUI content-area color so
  // the model blends into the shell. Resolve it from the shell config, then seed
  // a not-yet-set bg_color once (existing blocks keep their explicit color).
  const [caBg, setCaBg] = useState(null)
  const [caDims, setCaDims] = useState(null)   // content-area {width,height} for per-block bounds
  const shellId = activeProject?.gui_shell_id || null
  useEffect(() => {
    if (!shellId) { setCaBg('#0d1017'); setCaDims({ width: 600, height: 500 }); return }   // no shell -> defaults
    let live = true
    fetch(`/api/gui-shells/${shellId}/shell.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(cfg => {
        if (!live) return
        const ca = cfg?.content_area || cfg?.contentArea || {}
        setCaBg(ca.bg_color && ca.bg_color !== 'transparent' ? ca.bg_color : '#0d1017')   // only real colors inherit
        setCaDims({ width: Math.round(ca.width || 600), height: Math.round(ca.height || 500) })
      })
      .catch(() => { if (live) { setCaBg('#0d1017'); setCaDims({ width: 600, height: 500 }) } })
    return () => { live = false }
  }, [shellId])
  useEffect(() => {
    if (block.data.bg_color == null && caBg) update('bg_color', caBg)   // seed once
  }, [block.data.bg_color, caBg])   // eslint-disable-line react-hooks/exhaustive-deps
  const bg = block.data.bg_color || caBg || '#0d1017'

  const annotations = block.data.annotations || []
  const hasModel    = !!block.data.model_asset_id
  const partsCfg    = block.data.parts || {}
  const updatePart  = (key, field, val) =>
    update('parts', { ...partsCfg, [key]: { ...(partsCfg[key] || {}), [field]: val } })

  // Cross-section ("X-ray") clip — split the model along an axis and keep one half.
  const section = { enabled: false, axis: 'x', position: 0.5, flip: false, ...(block.data.section || {}) }
  const updateSection = (field, val) => update('section', { ...section, [field]: val })

  const viewerHeight = block.data.bounds?.height || block.data.viewer_height || 400

  // The resting editor shows a clean STILL thumbnail of the model; the live
  // interactive viewer only mounts in "live mode": while actively placing a pin,
  // or when part-highlight / X-ray editing force it (as before).
  const liveMode = placing || !!block.data.part_highlight || section.enabled

  // Signature of everything that changes how the still looks. When it drifts from
  // the stored thumb_sig the thumbnail is stale → recapture (mount a hidden viewer).
  const thumbSig = hasModel ? JSON.stringify({
    m: block.data.model_serve_url, env: block.data.environment || 'studio',
    ei: block.data.env_intensity ?? 1, bg, sec: section, h: viewerHeight,
  }) : null
  const thumbReady = !!block.data.thumb_url && block.data.thumb_sig === thumbSig

  // Persist a freshly captured still onto the block (model only — pins/overlays
  // are DOM, never on the WebGL canvas, so the capture is automatically clean).
  const handleCapture = useCallback((dataUrl) => {
    if (!dataUrl) return
    updateBlock(block.id, { thumb_url: dataUrl, thumb_sig: thumbSig })
  }, [block.id, updateBlock, thumbSig])

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

  // "✦ Place pin" — the primary action: open the live viewer ALREADY in
  // pin-placement mode (crosshair + "click the model" prompt), no extra step.
  const startPlacing = () => { setPlacing(true); setPinMode(true); cancelPin() }
  // "Done" — leave the live viewer and return to the calm still. The still
  // recaptures itself from the session capture (model unchanged → no flash).
  const stopPlacing = () => { setPlacing(false); setPinMode(false); cancelPin() }

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
    if (placing) setPinMode(true)   // stay armed to place another
  }
  const cancelPin = () => {
    setPendingPin(null); setNewLabel(''); setNewDesc('')
    if (placing) setPinMode(true)   // back to placement-ready
  }

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
          placing ? (
            <button onClick={stopPlacing}
              style={{ padding: '3px 10px', background: 'color-mix(in srgb, var(--forge-amber) 15%, transparent)',
                border: '1px solid var(--forge-amber)', borderRadius: 4,
                color: 'var(--forge-amber)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--cf-font)' }}>
              ✓ Done
            </button>
          ) : (
            <button onClick={startPlacing}
              style={{ padding: '3px 10px', background: 'transparent',
                border: '1px solid var(--cf-border-tertiary)', borderRadius: 4,
                color: 'var(--cf-text-tertiary)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--cf-font)' }}>
              ✦ Place pin
            </button>
          )
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
              <div style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', marginTop: 2 }}>{block.data.file_size_mb ? `${block.data.file_size_mb} MB` : 'GLB model'} · Three.js r136</div>
            </div>
            <button onClick={() => { updateBlock(block.id, { model_asset_id: null, model_filename: null, model_serve_url: null, annotations: [], thumb_url: null, thumb_sig: null }); setPlacing(false); setPinMode(false) }}
              aria-label="Remove model" style={{ background: 'none', border: 'none', color: '#E87070', cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>
          </div>
        )}

        {hasModel && liveMode && (
          <div style={{ marginBottom: 14 }}>
            {placing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 8,
                background: 'color-mix(in srgb, var(--forge-amber) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--forge-amber) 30%, transparent)', borderRadius: 6 }}>
                <span style={{ flex: 1, fontSize: 11, color: 'var(--cf-text-secondary)', fontFamily: 'var(--cf-font)' }}>
                  {pendingPin ? 'Fill in the label below, then ✓ Add annotation.'
                    : (<><strong style={{ color: 'var(--forge-amber)' }}>Click the model</strong> to place a pin · drag to rotate · scroll to zoom</>)}
                </span>
                <button onClick={stopPlacing}
                  style={{ padding: '4px 12px', background: 'var(--forge-amber)', color: '#042C53', border: 'none',
                    borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--cf-font)' }}>✓ Done</button>
              </div>
            )}
            <Model3DViewer modelUrl={block.data.model_serve_url} caption={block.data.caption}
              attribution={placing ? '' : block.data.attribution}
              hideHints={placing}
              height={viewerHeight} bgColor={bg}
              environment={block.data.environment || 'studio'} envIntensity={block.data.env_intensity ?? 1}
              decorative={block.data.decorative} autoRotate={placing ? false : block.data.auto_rotate}
              partHighlight={!!block.data.part_highlight} parts={partsCfg}
              selectedPartKey={selPart} onPartSelect={setSelPart} onPartsDetected={setDetectedParts}
              onPartLabel={(key, label) => updatePart(key, 'label', label)}
              section={section} onCapture={handleCapture}
              annotations={annotations} pinMode={pinMode} onPinPlaced={handlePinPlaced} />
          </div>
        )}

        {/* Resting state: clean still thumbnail (model only — no pins, no control bars). */}
        {hasModel && !liveMode && thumbReady && (
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <img src={block.data.thumb_url} alt={block.data.caption || 'Loaded 3D model preview'}
              style={{ display: 'block', width: '100%', height: viewerHeight, objectFit: 'contain',
                background: bg, borderRadius: 6, border: '1px solid var(--cf-border-secondary)' }} />
            <button onClick={() => update('thumb_url', null)} aria-label="Re-capture still preview"
              style={{ position: 'absolute', top: 8, right: 8, padding: '3px 9px', background: 'rgba(4,44,83,0.7)',
                border: '1px solid var(--cf-border-tertiary)', borderRadius: 4, color: '#B5D4F4', fontSize: 10,
                cursor: 'pointer', fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)' }}>↻ Re-capture</button>
            <button onClick={startPlacing}
              style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                padding: '7px 18px', background: 'var(--forge-amber)',
                border: 'none', borderRadius: 20, color: '#042C53', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'var(--cf-font)', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
              ✦ Place pin
            </button>
          </div>
        )}

        {/* No valid still yet: mount the viewer offscreen just long enough to capture one. */}
        {hasModel && !liveMode && !thumbReady && (
          <>
            <div style={{ marginBottom: 14, height: viewerHeight, borderRadius: 6, background: bg,
              border: '1px solid var(--cf-border-secondary)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #1c2a3a',
                borderTopColor: 'var(--forge-amber)', animation: 'spin3d 0.8s linear infinite' }} />
              <span style={{ fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', fontSize: 10,
                color: 'var(--cf-text-tertiary)', letterSpacing: '0.08em' }}>rendering preview…</span>
            </div>
            <div aria-hidden="true" style={{ position: 'absolute', left: -10000, top: 0, width: 600, height: viewerHeight, pointerEvents: 'none' }}>
              <Model3DViewer key={`cap-${thumbSig}`} modelUrl={block.data.model_serve_url}
                height={viewerHeight} bgColor={bg}
                environment={block.data.environment || 'studio'} envIntensity={block.data.env_intensity ?? 1}
                decorative section={section} onCapture={handleCapture} />
            </div>
            <style>{`@keyframes spin3d { to { transform: rotate(360deg); } }`}</style>
          </>
        )}

        {pendingPin && (
          <div style={{ background: 'color-mix(in srgb, var(--forge-amber) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--forge-amber) 30%, transparent)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', fontSize: 9, fontWeight: 600, color: 'var(--forge-amber)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              New annotation — {pendingPin.x.toFixed(2)}, {pendingPin.y.toFixed(2)}, {pendingPin.z.toFixed(2)}
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={labelStyle}>Label *</span>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- annotation popover opened on demand; focusing the label field is expected */}
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Fuel injector" autoFocus aria-label="Annotation label"
                onKeyDown={e => { if (e.key === 'Enter') confirmPin(); if (e.key === 'Escape') cancelPin() }} style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>Description (optional)</span>
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
                <span style={labelStyle}>Viewer height (px)</span>
                <input type="number" min="200" max="800" step="50" value={block.data.viewer_height || 400}
                  onChange={e => update('viewer_height', parseInt(e.target.value, 10))} aria-label="Viewer height in pixels" style={inputStyle} />
              </div>
              <div>
                <span style={labelStyle}>Background</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="color" value={bg} onChange={e => update('bg_color', e.target.value)} aria-label="Viewer background color" style={{ width: 36, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 2 }} />
                  <input type="text" value={bg} onChange={e => update('bg_color', e.target.value)} aria-label="Background color hex" style={{ ...inputStyle, flex: 1 }} />
                </div>
              </div>
            </div>

            <BoundsControl bounds={block.data.bounds} contentArea={caDims}
              onChange={b => update('bounds', b)} labelStyle={labelStyle} inputStyle={inputStyle} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <span style={labelStyle}>Environment (reflections)</span>
                <select value={block.data.environment || 'studio'} onChange={e => update('environment', e.target.value)}
                  aria-label="Viewer environment" style={{ ...inputStyle, width: '100%' }}>
                  <option value="studio">Studio — procedural</option>
                  <option value="day">Day — outdoor HDRI</option>
                  <option value="night">Night — HDRI</option>
                  <option value="none">None — flat lighting</option>
                </select>
              </div>
              <div>
                <span style={labelStyle}>Reflection intensity</span>
                <input type="range" min="0" max="2" step="0.1" value={block.data.env_intensity ?? 1}
                  onChange={e => update('env_intensity', parseFloat(e.target.value))}
                  disabled={(block.data.environment || 'studio') === 'none'}
                  aria-label="Reflection intensity" style={{ width: '100%' }} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={labelStyle}>Caption (optional)</span>
              <input value={block.data.caption || ''} onChange={e => update('caption', e.target.value)} placeholder="Describe the model for learners and screen readers" aria-label="3D model caption" style={{ ...inputStyle, width: '100%' }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={labelStyle}>Attribution / credit (optional)</span>
              <input value={block.data.attribution || ''} onChange={e => update('attribution', e.target.value)} placeholder="e.g. “Model” by Author (CC BY) — shown as a small overlay; leave empty to hide" aria-label="3D model attribution" style={{ ...inputStyle, width: '100%' }} />
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
              <input type="checkbox" id={`m3d-parthl-${block.id}`} checked={!!block.data.part_highlight}
                onChange={e => update('part_highlight', e.target.checked)} style={{ marginTop: 2 }} />
              <label htmlFor={`m3d-parthl-${block.id}`} style={{ fontSize: 12, color: 'var(--cf-text-secondary)', lineHeight: 1.4 }}>
                Part highlighting — hover/click model parts to highlight + label
                <span style={{ display: 'block', fontSize: 10, color: 'var(--cf-text-tertiary)', marginTop: 2 }}>
                  Needs a model with separate, named meshes (e.g. cup, saucer).
                </span>
              </label>
            </div>

            {block.data.part_highlight && (
              <div style={{ marginBottom: 14, border: '1px solid var(--cf-border-tertiary)', borderRadius: 6, padding: '10px 12px', background: 'var(--cf-input-bg, #060810)' }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--forge-font)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cf-text-tertiary)', marginBottom: 8 }}>
                  Parts {detectedParts.length ? `(${detectedParts.length})` : '— load a model to detect'}
                </div>
                {detectedParts.map(p => {
                  const cfg = partsCfg[p.key] || {}
                  const isSel = selPart === p.key
                  return (
                    <div key={p.key} style={{ marginBottom: 8, padding: 8, borderRadius: 5,
                      border: `1px solid ${isSel ? 'var(--forge-amber)' : 'transparent'}`,
                      background: isSel ? 'color-mix(in srgb, var(--forge-amber) 10%, transparent)' : 'transparent' }}>
                      <button onClick={() => setSelPart(isSel ? null : p.key)}
                        aria-pressed={isSel}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                          color: isSel ? 'var(--forge-amber)' : 'var(--cf-text-secondary)', cursor: 'pointer',
                          fontSize: 11, fontFamily: 'var(--forge-font)', marginBottom: 6, padding: 0 }}>
                        ◷ {cfg.label || p.key}
                      </button>
                      <input value={cfg.label || ''} onChange={e => updatePart(p.key, 'label', e.target.value)}
                        placeholder={`Label (mesh: ${p.key})`} aria-label={`Label for ${p.key}`}
                        style={{ ...inputStyle, width: '100%', marginBottom: 5 }} />
                      <input value={cfg.description || ''} onChange={e => updatePart(p.key, 'description', e.target.value)}
                        placeholder="Description (optional)" aria-label={`Description for ${p.key}`}
                        style={{ ...inputStyle, width: '100%' }} />
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <input type="checkbox" id={`m3d-section-${block.id}`} checked={section.enabled}
                onChange={e => updateSection('enabled', e.target.checked)} style={{ marginTop: 2 }} />
              <label htmlFor={`m3d-section-${block.id}`} style={{ fontSize: 12, color: 'var(--cf-text-secondary)', lineHeight: 1.4 }}>
                Cross-section (X-ray) — slice the model along an axis to reveal the interior
                <span style={{ display: 'block', fontSize: 10, color: 'var(--cf-text-tertiary)', marginTop: 2 }}>
                  Pick an axis and where to cut; flip keeps the other half.
                </span>
              </label>
            </div>

            {section.enabled && (
              <div style={{ marginBottom: 14, border: '1px solid var(--cf-border-tertiary)', borderRadius: 6, padding: '10px 12px', background: 'var(--cf-input-bg, #060810)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <span style={labelStyle}>Cut axis</span>
                    <select value={section.axis} onChange={e => updateSection('axis', e.target.value)}
                      aria-label="Cross-section axis" style={{ ...inputStyle, width: '100%' }}>
                      <option value="x">X — left / right</option>
                      <option value="y">Y — top / bottom</option>
                      <option value="z">Z — front / back</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                    <input type="checkbox" id={`m3d-section-flip-${block.id}`} checked={!!section.flip}
                      onChange={e => updateSection('flip', e.target.checked)} style={{ marginBottom: 8 }} />
                    <label htmlFor={`m3d-section-flip-${block.id}`} style={{ fontSize: 12, color: 'var(--cf-text-secondary)', paddingBottom: 6 }}>Flip — keep the other half</label>
                  </div>
                </div>
                <label style={labelStyle}>Cut position ({Math.round((section.position ?? 0.5) * 100)}%)</label>
                <input type="range" min="0" max="1" step="0.01" value={section.position ?? 0.5}
                  onChange={e => updateSection('position', parseFloat(e.target.value))}
                  aria-label="Cross-section position" style={{ width: '100%' }} />
              </div>
            )}

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
                {!pendingPin && (
                  <button onClick={placing ? stopPlacing : startPlacing} aria-pressed={placing}
                    style={{ padding: '5px 12px', background: placing ? 'color-mix(in srgb, var(--forge-amber) 15%, transparent)' : 'var(--forge-amber)',
                      border: `1px solid ${placing ? 'var(--forge-amber)' : 'transparent'}`, borderRadius: 4,
                      color: placing ? 'var(--forge-amber)' : '#042C53', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--cf-font)', fontWeight: 700 }}>
                    {placing ? '✓ Done placing' : '✦ Place pin'}
                  </button>
                )}
              </div>

              {annotations.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)' }}>
                  // no annotations yet · click ✦ Place pin, then click the model
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
            <span style={labelStyle}>Label</span>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- inline annotation editor opened on demand; focusing the label field is expected */}
            <input value={label} onChange={e => setLabel(e.target.value)} autoFocus aria-label="Edit annotation label" style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <span style={labelStyle}>Description</span>
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
