import React, { useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import ContentTree from './components/Sidebar/ContentTree'
import ImportButton from './components/Sidebar/ImportButton'
import FrameEditor from './components/Editor/FrameEditor'
import useProjectStore from './store/projectStore'

// Testing convenience: auto-load a project (or seed a demo) on startup.
// Set to false to return to the blank-start behavior.
const DEMO_AUTOLOAD = true

export default function App() {
  const { projects, fetchProjects, fetchProject, autoloadDemo, loading } = useProjectStore()

  useEffect(() => { DEMO_AUTOLOAD ? autoloadDemo() : fetchProjects() }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#121212',
      color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-sans)',
      overflow: 'hidden',
    }}>

      {/* App header */}
      <div style={{
        height: 44,
        background: '#0a0a1a',
        borderBottom: '1px solid #1e1e3a',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        flexShrink: 0,
      }}>
        <span style={{
          fontWeight: 600,
          fontSize: 15,
          letterSpacing: '0.01em',
          color: '#85B7EB',
        }}>
          Course
        </span>
        <span style={{
          fontWeight: 300,
          fontSize: 15,
          color: '#5F5E5A',
        }}>
          /
        </span>
        <span style={{
          fontWeight: 700,
          fontSize: 15,
          color: '#EF9F27',
        }}>
          Forge
        </span>
      </div>

      {/* Main split pane */}
      <PanelGroup direction="horizontal" style={{ flex: 1, overflow: 'hidden' }}>

        {/* Sidebar panel */}
        <Panel defaultSize={22} minSize={16} maxSize={35}>
          <div style={{
            height: '100%',
            background: '#1a1a2e',
            borderRight: '1px solid #2a2a4a',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Project selector */}
            {projects.length > 0 && (
              <div style={{ padding: 8, borderBottom: '1px solid #2a2a4a' }}>
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
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <option value="" disabled>Select a project…</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <ImportButton />

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <ContentTree height={window.innerHeight - 160} />
            </div>
          </div>
        </Panel>

        {/* Drag handle */}
        <PanelResizeHandle style={{
          width: 4,
          background: '#2a2a4a',
          cursor: 'col-resize',
          transition: 'background 0.15s',
        }}
          onDragging={(isDragging) => {}}
        />

        {/* Editor panel */}
        <Panel minSize={40}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <FrameEditor />
          </div>
        </Panel>

      </PanelGroup>
    </div>
  )
}
