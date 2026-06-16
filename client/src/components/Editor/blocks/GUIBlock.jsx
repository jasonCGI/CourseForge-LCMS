import React, { useState, useCallback } from 'react'
import useEditorStore  from '../../../store/editorStore'
import useProjectStore from '../../../store/projectStore'
import { uploadGUI } from '../../../api/client'

export default function GUIBlock({ block }) {
  const updateBlock   = useEditorStore(s => s.updateBlock)
  const removeBlock   = useEditorStore(s => s.removeBlock)
  const moveBlock     = useEditorStore(s => s.moveBlock)
  const activeProject = useProjectStore(s => s.activeProject)

  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState(null)

  const hasShell = !!block.data.gui_asset_id

  const handleUpload = useCallback(async (file) => {
    if (!activeProject?.id) { setError('No project selected.'); return }
    setUploading(true)
    setError(null)
    try {
      const { data } = await uploadGUI(file, activeProject.id)
      updateBlock(block.id, {
        gui_asset_id:   data.id,
        shell_name:     data.shell_name,
        stage_width:    data.stage_width,
        stage_height:   data.stage_height,
        button_count:   data.button_count,
        zone_count:     data.zone_count,
        html_serve_url: data.html_serve_url,
        json_serve_url: data.json_serve_url,
      })
    } catch (e) {
      setError(e.response?.data?.error || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }, [activeProject, block.id, updateBlock])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }, [handleUpload])

  return (
    <div style={{
      background:   'var(--cf-block-bg)',
      border:       '1px solid var(--cf-block-border)',
      borderLeft:   '4px solid #3A5A8A',
      borderRadius: 8,
      overflow:     'hidden',
      marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{
        background:   'rgba(58,90,138,0.12)',
        padding:      '8px 14px',
        display:      'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid var(--cf-block-border)',
      }}>
        <span style={{
          fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
          fontSize: 9, fontWeight: 600,
          padding: '2px 7px', borderRadius: 3,
          background: '#3A5A8A', color: '#fff',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>GUI Shell</span>
        <span style={{ flex: 1, fontSize: 11, color: 'var(--cf-text-tertiary)' }}>
          {hasShell
            ? `${block.data.shell_name} · ${block.data.stage_width}×${block.data.stage_height}px`
            : 'ForgeGUI shell block'}
        </span>
        <button onClick={() => moveBlock(block.id, 'up')}
          aria-label="Move block up" style={iconBtn}>↑</button>
        <button onClick={() => moveBlock(block.id, 'down')}
          aria-label="Move block down" style={iconBtn}>↓</button>
        <button onClick={() => removeBlock(block.id)}
          aria-label="Remove block"
          style={{ ...iconBtn, color: '#E87070' }}>✕</button>
      </div>

      <div style={{ padding: 16 }}>

        {/* Upload zone */}
        {!hasShell ? (
          <>
            <div
              onDrop={onDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() =>
                document.getElementById(`gui-input-${block.id}`).click()}
              role="button" tabIndex={0}
              aria-label="Upload ForgeGUI ZIP"
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ')
                  document.getElementById(`gui-input-${block.id}`).click()
              }}
              style={{
                border:       '2px dashed #3A5A8A',
                borderRadius: 8,
                padding:      '32px 20px',
                textAlign:    'center',
                cursor:       'pointer',
                background:   'rgba(58,90,138,0.04)',
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.5 }}>▣</div>
              <div style={{
                fontSize: 13, fontWeight: 500,
                color: 'var(--cf-text-secondary)', marginBottom: 4,
              }}>
                {uploading
                  ? 'Uploading…'
                  : 'Drop ForgeGUI_xxx.zip or click to browse'}
              </div>
              <div style={{
                fontSize: 11, color: 'var(--cf-text-tertiary)',
                fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
              }}>
                Export from ForgeGUI → drop ZIP here
              </div>
              {error && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#E87070' }}>
                  {error}
                </div>
              )}
            </div>
            <input type="file" id={`gui-input-${block.id}`}
              accept=".zip" style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files[0]; if (f) handleUpload(f)
              }}/>
          </>
        ) : (
          /* Shell info card */
          <div style={{
            background:   'var(--cf-input-bg)',
            border:       '1px solid var(--cf-border-secondary)',
            borderRadius: 6, padding: '12px 14px',
            marginBottom: 14,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              gap: 10, marginBottom: 10,
            }}>
              <span style={{ fontSize: 20 }}>▣</span>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: 'var(--cf-text-primary)',
                }}>
                  {block.data.shell_name}
                </div>
                <div style={{
                  fontSize: 10, color: 'var(--cf-text-tertiary)',
                  fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
                  marginTop: 2,
                }}>
                  {block.data.stage_width} × {block.data.stage_height}px
                  · {block.data.button_count} button{block.data.button_count !== 1 ? 's' : ''}
                  · {block.data.zone_count} zone{block.data.zone_count !== 1 ? 's' : ''}
                </div>
              </div>
              <button
                onClick={() => updateBlock(block.id, {
                  gui_asset_id: null, shell_name: null,
                  stage_width: null, stage_height: null,
                  button_count: 0, zone_count: 0,
                  html_serve_url: null, json_serve_url: null,
                })}
                aria-label="Remove GUI shell"
                style={{
                  background: 'none', border: 'none',
                  color: '#E87070', cursor: 'pointer',
                  fontSize: 14, padding: 4,
                }}>✕</button>
            </div>

            {/* Shell info grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 6,
            }}>
              {[
                ['Stage',   `${block.data.stage_width} × ${block.data.stage_height}px`],
                ['Buttons', block.data.button_count],
                ['Zones',   block.data.zone_count],
                ['Mode',    'Direct injection'],
              ].map(([label, val]) => (
                <div key={label} style={{
                  padding: '6px 8px',
                  background: 'var(--cf-block-bg)',
                  borderRadius: 4,
                  border: '1px solid var(--cf-border-tertiary)',
                }}>
                  <div style={{
                    fontSize: 9, fontWeight: 600,
                    color: 'var(--cf-text-tertiary)',
                    fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginBottom: 2,
                  }}>{label}</div>
                  <div style={{
                    fontSize: 12, color: 'var(--cf-text-primary)',
                  }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GUI block notes */}
        {hasShell && (
          <>
            {/* Navigation mode info */}
            <div style={{
              padding: '8px 12px',
              background: 'color-mix(in srgb, var(--forge-amber) 6%, transparent)',
              border: '1px solid color-mix(in srgb, var(--forge-amber) 20%, transparent)',
              borderRadius: 6,
              marginBottom: 12,
              fontSize: 11,
              color: 'var(--cf-text-secondary)',
              fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
              lineHeight: 1.6,
            }}>
              // Shell-only navigation mode<br/>
              // NEXT/PREV in GUI shell drives frame progression<br/>
              // CourseForge chrome hidden in published output<br/>
              // Content injected into shell content area<br/>
              // Full shell renders in SCORM 1.2 + preview
            </div>

            {/* ForgeGUI link */}
            <div style={{
              paddingTop: 10,
              borderTop: '1px solid var(--cf-border-tertiary)',
              fontSize: 10,
              color: 'var(--cf-text-tertiary)',
              fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
            }}>
              To update the shell skin, re-export from ForgeGUI
              and re-upload the ZIP here.{' '}
              <a
                href={import.meta.env.VITE_FORGEGUI_URL || '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--cf-accent)', textDecoration: 'none' }}
              >
                Open ForgeGUI ↗
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const iconBtn = {
  background: 'none', border: 'none',
  color: 'var(--cf-text-tertiary)', cursor: 'pointer',
  fontSize: 12, padding: '2px 6px',
}
