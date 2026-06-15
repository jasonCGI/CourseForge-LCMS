import React, { useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import ContentTree from './components/Sidebar/ContentTree'
import ImportButton from './components/Sidebar/ImportButton'
import FrameEditor from './components/Editor/FrameEditor'
import PublishModal from './components/Publish/PublishModal'
import useProjectStore from './store/projectStore'

// Testing convenience: auto-load a project (or seed a demo) on startup.
// Set to false to return to the blank-start behavior.
const DEMO_AUTOLOAD = true

export default function App() {
  const { projects, fetchProjects, fetchProject, autoloadDemo, loading } = useProjectStore()
  const [showPublish, setShowPublish] = useState(false)

  useEffect(() => { DEMO_AUTOLOAD ? autoloadDemo() : fetchProjects() }, [])

  // Inject blink keyframe once
  if (typeof document !== 'undefined' && !document.getElementById('cf-blink-style')) {
    const style = document.createElement('style')
    style.id = 'cf-blink-style'
    style.textContent = `
      @keyframes cf-blink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0; }
      }
    `
    document.head.appendChild(style)
  }

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

      {/* ── App header ── */}
      <div style={{
        height: 52,
        background: '#060d18',
        borderBottom: '1px solid #0e2240',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 0,
        flexShrink: 0,
      }}>
        {/* Fire core mark */}
        <svg width="28" height="28" viewBox="-16 -16 32 32" style={{ flexShrink: 0, marginRight: 12 }}>
          <path d="M0,-16 L3.5,-3.5 L16,0 L3.5,3.5 L0,16 L-3.5,3.5 L-16,0 L-3.5,-3.5 Z" fill="#031E3A"/>
          <path d="M0,-14 L3,-3 L14,0 L3,3 L0,14 L-3,3 L-14,0 L-3,-3 Z" fill="#185FA5"/>
          <path d="M0,-14 L3,-3 L0,0 Z"   fill="#0C3A6E" opacity="0.6"/>
          <path d="M14,0 L3,3 L0,0 Z"     fill="#0C3A6E" opacity="0.6"/>
          <path d="M0,14 L-3,3 L0,0 Z"    fill="#0C3A6E" opacity="0.6"/>
          <path d="M-14,0 L-3,-3 L0,0 Z"  fill="#0C3A6E" opacity="0.6"/>
          <g transform="rotate(22.5)">
            <path d="M0,-7 L1.6,-1.6 L7,0 L1.6,1.6 L0,7 L-1.6,1.6 L-7,0 L-1.6,-1.6 Z" fill="#EF9F27"/>
          </g>
          <circle cx="0" cy="0" r="2.5" fill="#FAC775"/>
          <circle cx="0" cy="0" r="1.1" fill="white" opacity="0.88"/>
        </svg>

        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
          {/* Prompt */}
          <span style={{
            fontFamily: "'SF Mono', Consolas, monospace",
            fontSize: 14,
            fontWeight: 700,
            color: '#EF9F27',
            marginRight: 8,
          }}>❯</span>

          {/* Course */}
          <span style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 22,
            fontWeight: 100,
            color: '#7EB8F0',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}>Course</span>

          {/* Slash */}
          <span style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 22,
            fontWeight: 100,
            color: '#EF9F27',
            lineHeight: 1,
          }}>/</span>

          {/* Forge */}
          <span style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 22,
            fontWeight: 200,
            color: '#ffffff',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}>Forge</span>

          {/* Underscore cursor */}
          <span style={{
            display: 'inline-block',
            width: 13,
            height: 2,
            background: '#EF9F27',
            marginLeft: 4,
            marginBottom: 2,
            borderRadius: 1,
            alignSelf: 'flex-end',
            animation: 'cf-blink 1.05s step-end infinite',
          }}/>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }}/>

        {/* Right side — project status indicator */}
        {loading && (
          <span style={{
            fontFamily: "'SF Mono', Consolas, monospace",
            fontSize: 10,
            color: '#1E4A7A',
            letterSpacing: '0.08em',
          }}>loading…</span>
        )}

        {/* Publish */}
        <button
          onClick={() => setShowPublish(true)}
          style={{
            marginLeft: 12,
            padding: '5px 14px',
            background: '#EF9F27',
            color: '#042C53',
            border: 'none',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: "'SF Mono', Consolas, monospace",
            letterSpacing: '0.04em',
          }}
        >
          ⬇ Publish
        </button>
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

      {showPublish && <PublishModal onClose={() => setShowPublish(false)} />}
    </div>
  )
}
