import React, { useEffect } from 'react'
import ContentTree from './components/Sidebar/ContentTree'
import ImportButton from './components/Sidebar/ImportButton'
import useProjectStore from './store/projectStore'

const SIDEBAR_WIDTH = 280

export default function App() {
  const { projects, activeProject, fetchProjects, fetchProject, loading } = useProjectStore()

  useEffect(() => {
    fetchProjects()
  }, [])

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#121212',
      color: '#e0e0e0',
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
    }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside style={{
        width: SIDEBAR_WIDTH,
        minWidth: SIDEBAR_WIDTH,
        background: '#1a1a2e',
        borderRight: '1px solid #2a2a4a',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 12px',
          borderBottom: '1px solid #2a2a4a',
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: '0.02em',
          color: '#90CAF9',
        }}>
          CourseForge
        </div>

        {/* Project selector */}
        {projects.length > 0 && (
          <div style={{ padding: '8px', borderBottom: '1px solid #2a2a4a' }}>
            <select
              onChange={e => fetchProject(e.target.value)}
              defaultValue=""
              style={{
                width: '100%',
                background: '#16213e',
                color: '#e0e0e0',
                border: '1px solid #2a2a4a',
                borderRadius: 4,
                padding: '6px 8px',
                fontSize: 13,
              }}
            >
              <option value="" disabled>Select a project…</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Import button */}
        <ImportButton />

        {/* Content tree */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ContentTree height={window.innerHeight - 180} />
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
        color: '#555',
      }}>
        {loading && <p>Loading…</p>}
        {!loading && !activeProject && (
          <>
            <p style={{ fontSize: 18 }}>No project selected</p>
            <p style={{ fontSize: 13 }}>Import a JSON file or select a project from the sidebar.</p>
          </>
        )}
        {activeProject && (
          <p style={{ fontSize: 14 }}>
            Select a frame from the sidebar to open the editor.
          </p>
        )}
      </main>

    </div>
  )
}
