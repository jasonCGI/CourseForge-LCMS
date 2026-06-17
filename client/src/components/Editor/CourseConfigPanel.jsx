import React, { useEffect, useState } from 'react'
import { getGuiShells, uploadGuiShell, deleteGuiShell, updateProject } from '../../api/client'
import useProjectStore from '../../store/projectStore'

/**
 * CourseConfigPanel
 *
 * Project-level config shown in the right panel when the project root node is
 * selected. Hosts the GUI shell picker (gallery + upload). The shell is stored
 * on the project (project.gui_shell_id) and wraps every frame on publish.
 */
export default function CourseConfigPanel() {
  const activeProject = useProjectStore(s => s.activeProject)
  const fetchProject  = useProjectStore(s => s.fetchProject)
  const [shells, setShells]     = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError]       = useState(null)

  const activeShellId = activeProject?.gui_shell_id || null

  useEffect(() => { reload() }, [])
  async function reload() {
    try { const { data } = await getGuiShells(); setShells(data || []) }
    catch (e) { setError(e.message) }
  }

  async function selectShell(shellId) {
    if (!activeProject) return
    try {
      await updateProject(activeProject.id, { gui_shell_id: shellId })
      await fetchProject(activeProject.id)   // refresh → preview pane + tree pick it up
    } catch (e) { setError(e.message) }
  }

  async function removeShell(e, shell) {
    e.stopPropagation()
    if (!confirm(`Delete shell "${shell.name}"? Any project using it falls back to no shell.`)) return
    try {
      await deleteGuiShell(shell.id)
      await reload()
      if (activeProject) await fetchProject(activeProject.id)  // delete may have cleared our ref
    } catch (e) { setError(e.response?.data?.error || e.message) }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const { data } = await uploadGuiShell(file)
      await reload()
      if (data?.id) await selectShell(data.id)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setUploading(false)
      e.target.value = ''   // allow re-selecting the same file
    }
  }

  if (!activeProject) {
    return <div className="cf-course-config"><p className="cf-config-hint">No project loaded.</p></div>
  }

  return (
    <div className="cf-course-config">
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--cf-text-primary)', marginBottom: 4 }}>
        {activeProject.name}
      </h2>
      <p className="cf-config-hint">Project-level settings. Applies to every frame on publish.</p>

      <section className="cf-config-section">
        <h3 className="cf-config-label">GUI Shell</h3>
        <p className="cf-config-hint">
          The shell becomes the SCO page — your frame content is injected into it.
          Selecting one updates the live preview for every frame.
        </p>

        <div className="cf-shell-gallery">
          {/* No-shell option */}
          <div
            className={`cf-shell-thumb ${!activeShellId ? 'active' : ''}`}
            onClick={() => selectShell(null)}
            role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectShell(null) } }}
          >
            <div className="cf-shell-thumb-empty">No shell</div>
            <span>Plain frames</span>
          </div>

          {shells.map(shell => (
            <div
              key={shell.id}
              className={`cf-shell-thumb ${activeShellId === shell.id ? 'active' : ''}`}
              style={{ position: 'relative' }}
              onClick={() => selectShell(shell.id)}
              role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectShell(shell.id) } }}
              title={shell.name}
            >
              {shell.thumbnail_url
                ? <img src={shell.thumbnail_url} alt={shell.name}
                       onError={e => { e.currentTarget.style.display = 'none' }} />
                : <div className="cf-shell-thumb-empty">{shell.stage_width}×{shell.stage_height}</div>}
              <span>{shell.name}</span>
              <button
                className="cf-shell-del"
                onClick={e => removeShell(e, shell)}
                aria-label={`Delete shell ${shell.name}`}
                title="Delete shell"
              >✕</button>
            </div>
          ))}
        </div>

        <label className="cf-upload-shell-btn">
          {uploading ? 'Uploading…' : '+ Upload ForgeGUI shell (.zip)'}
          <input type="file" accept=".zip" style={{ display: 'none' }}
                 onChange={handleUpload} disabled={uploading} />
        </label>
        {error && <p style={{ color: '#C0392B', fontSize: 11, marginTop: 8 }}>{error}</p>}
      </section>

      <section className="cf-config-section">
        <h3 className="cf-config-label">Default Frame Layout</h3>
        <p className="cf-config-hint">Layout presets coming in a later sprint.</p>
      </section>
    </div>
  )
}
