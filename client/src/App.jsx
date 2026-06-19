import React, { useEffect, useState, lazy, Suspense } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import ContentTree from './components/Sidebar/ContentTree'
import ImportButton from './components/Sidebar/ImportButton'
import InspectorPane from './components/Editor/InspectorPane'
import CourseConfigPanel from './components/Editor/CourseConfigPanel'
import PersistentPreviewPane, { flatFrameOrder } from './components/Preview/PersistentPreviewPane'
import { ThemeProvider } from './theme/ThemeContext'
import ModeToggle from './components/UI/ModeToggle'
import EcosystemTray from './components/UI/EcosystemTray'
import useProjectStore from './store/projectStore'
import useEditorStore from './store/editorStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import SaveIndicator from './components/UI/SaveIndicator'

// Modals are interaction-gated — lazy-load so their code (+ unique deps) stays
// out of the initial bundle until the user opens them.
const PublishModal      = lazy(() => import('./components/Publish/PublishModal'))
const ThemeEditorModal  = lazy(() => import('./components/ThemeEditor/ThemeEditorModal'))
const ShortcutHelp      = lazy(() => import('./components/UI/ShortcutHelp'))
const CourseShellModal  = lazy(() => import('./components/UI/CourseShellModal'))
const PublishHistory    = lazy(() => import('./components/Publish/PublishHistory'))
const FrameSearch       = lazy(() => import('./components/UI/FrameSearch'))
import { VERSION } from './version'

// Testing convenience: auto-load a project (or seed a demo) on startup.
// Set to false to return to the blank-start behavior.
const DEMO_AUTOLOAD = true

export default function App() {
  // Individual selectors (not a full-store destructure) so App — the root —
  // only re-renders when these specific fields change, not on every store write.
  const projects      = useProjectStore(s => s.projects)
  const fetchProjects = useProjectStore(s => s.fetchProjects)
  const fetchProject  = useProjectStore(s => s.fetchProject)
  const autoloadDemo  = useProjectStore(s => s.autoloadDemo)
  const loading       = useProjectStore(s => s.loading)
  const activeProject = useProjectStore(s => s.activeProject)
  const [showPublish, setShowPublish] = useState(false)
  const [showThemeEditor, setShowThemeEditor] = useState(false)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showShortcutHelp, setShowShortcutHelp] = useState(false)
  const [showShell, setShowShell] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  useKeyboardShortcuts({
    onSave:    () => useEditorStore.getState().flushSave(),
    onPreview: () => { const f = useEditorStore.getState().activeFrame; if (f) window.open(`/api/frames/${f.id}/preview-html`, '_blank', 'noopener') },
    onCloseModal: () => {
      setShowPublish(false)
      setShowThemeEditor(false)
      setShowShortcutHelp(false)
      setShowShell(false)
      setShowHistory(false)
      setShowSearch(false)
      useEditorStore.getState().setPreviewOpen(false)
    },
    onShowHelp: () => setShowShortcutHelp(true),
    onOpenSearch: () => { if (activeProject) setShowSearch(true) },
  })

  useEffect(() => { DEMO_AUTOLOAD ? autoloadDemo() : fetchProjects() }, [])

  // Give the editor store a way to resolve frame order (for preview NEXT/PREV)
  // without a circular import on the project store.
  const selectedNode = useEditorStore(s => s.selectedNode)
  const activeFrame = useEditorStore(s => s.activeFrame)
  useEffect(() => {
    useEditorStore.getState().setProjectFrameOrder(
      () => flatFrameOrder(useProjectStore.getState().activeProject)
    )
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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

  const sidebarInner = (
    <div style={{ height: '100%', background: 'var(--cf-sidebar-bg)', borderRight: '1px solid var(--cf-border-primary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {projects.length > 0 && (
        <div style={{ padding: 8, borderBottom: '1px solid var(--cf-border-primary)' }}>
          <select onChange={e => fetchProject(e.target.value)} defaultValue="" aria-label="Select a project"
            style={{ width: '100%', background: 'var(--cf-input-bg)', color: 'var(--cf-input-text)', border: '1px solid var(--cf-input-border)', borderRadius: 4, padding: '6px 8px', fontSize: 13, fontFamily: 'var(--cf-font)' }}>
            <option value="" disabled>Select a project…</option>
            {projects.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        </div>
      )}
      <ImportButton />
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}><ContentTree /></div>
    </div>
  )
  // Right panel is context-sensitive: project root node → CourseConfigPanel;
  // a frame → persistent WYSIWYG preview (desktop) above the block editor.
  const rightPanelInner = selectedNode?.type === 'project' ? (
    <CourseConfigPanel />
  ) : (!isMobile && activeFrame) ? (
    // Resizable vertical split: live preview on top, block editor below.
    <PanelGroup direction="vertical" autoSaveId="cf-frame-vsplit" style={{ height: '100%' }}>
      <Panel defaultSize={60} minSize={20} style={{ overflow: 'hidden' }}>
        <PersistentPreviewPane />
      </Panel>
      <PanelResizeHandle className="cf-vsplit-handle" />
      <Panel minSize={25} style={{ overflow: 'hidden' }}>
        <div className="cf-block-config-pane" style={{ height: '100%' }}>
          <InspectorPane />
        </div>
      </Panel>
    </PanelGroup>
  ) : (
    <div className="cf-block-config-pane" style={{ height: '100%' }}>
      <InspectorPane />
    </div>
  )
  const editorInner = (
    <div style={{ height: '100%', background: 'var(--cf-editor-bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {rightPanelInner}
    </div>
  )

  return (
    <ThemeProvider>
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--cf-app-bg)',
        color: 'var(--cf-text-primary)',
        fontFamily: 'var(--cf-font)',
        overflow: 'hidden',
      }}>

        {/* ── App header ── */}
        <div className="cf-app-header" style={{
          height: 48,
          boxSizing: 'border-box',   /* 48 total incl. border — matches the other tools (no double-count) */
          background: 'var(--cf-header-bg)',
          borderBottom: '2px solid var(--cf-header-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 0,
          flexShrink: 0,
        }}>
          {/* Hamburger — mobile only */}
          {isMobile && (
            <button onClick={() => setSidebarOpen(o => !o)}
              aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              style={{ width: 32, height: 32, marginRight: 10, display: 'flex', alignItems: 'center',
                justifyContent: 'center', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4, color: 'var(--cf-text-secondary)', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>☰</button>
          )}

          {/* Fire core mark */}
          <svg width="28" height="28" viewBox="-16 -16 32 32" style={{ flexShrink: 0, marginRight: 12 }}>
            <path d="M0,-16 L3.5,-3.5 L16,0 L3.5,3.5 L0,16 L-3.5,3.5 L-16,0 L-3.5,-3.5 Z" fill="#031E3A"/>
            <path d="M0,-14 L3,-3 L14,0 L3,3 L0,14 L-3,3 L-14,0 L-3,-3 Z" fill="#185FA5"/>
            <path d="M0,-14 L3,-3 L0,0 Z"   fill="#0C3A6E" opacity="0.6"/>
            <path d="M14,0 L3,3 L0,0 Z"     fill="#0C3A6E" opacity="0.6"/>
            <path d="M0,14 L-3,3 L0,0 Z"    fill="#0C3A6E" opacity="0.6"/>
            <path d="M-14,0 L-3,-3 L0,0 Z"  fill="#0C3A6E" opacity="0.6"/>
            <g transform="rotate(22.5)">
              <path d="M0,-7 L1.6,-1.6 L7,0 L1.6,1.6 L0,7 L-1.6,1.6 L-7,0 L-1.6,-1.6 Z" fill="var(--forge-amber)"/>
            </g>
            <circle cx="0" cy="0" r="2.5" fill="#FAC775"/>
            <circle cx="0" cy="0" r="1.1" fill="white" opacity="0.88"/>
          </svg>

          {/* Wordmark — Forge path mark (legible, not recessive). Flagship keeps
              "Course/Forge"; Course via __mid so it stays readable on the bar. */}
          {/* Full "Course/Forge_" identity is kept on mobile too — collapsing it
              to just "Forge" reads as a sub-tool, not the flagship. */}
          <span className="forge-path forge-path--md forge-path--bar">
            <span className="forge-path__mid">Course</span>
            <span className="forge-path__slash">/</span>
            <span className="forge-path__tool">Forge</span>
            <span className="forge-path__cursor">_</span>
          </span>

          {/* Version */}
          <span className="cf-hide-mobile" style={{
            fontFamily: "var(--forge-font)",
            fontSize: 9,
            color: 'var(--cf-text-tertiary)',
            letterSpacing: '0.06em',
            marginLeft: 10,
            opacity: 0.6,
            alignSelf: 'center',
          }}>
            v{VERSION}
          </span>

          {/* Autosave status */}
          <SaveIndicator />

          {/* Spacer */}
          <div style={{ flex: 1 }}/>

          {/* Status indicator */}
          {loading && (
            <span style={{
              fontFamily: "var(--forge-font)",
              fontSize: 10,
              color: 'var(--cf-text-tertiary)',
              letterSpacing: '0.08em',
              marginRight: 12,
            }}>loading…</span>
          )}

          {/* Ecosystem tools */}
          <EcosystemTray />

          {/* Mode toggle */}
          <ModeToggle />

          {/* Theme editor — header trigger hidden for now (feature kept; see ThemeEditorModal) */}

          {/* Search frames (Ctrl/Cmd+F) */}
          <button
            onClick={() => activeProject && setShowSearch(true)}
            disabled={!activeProject}
            aria-label="Search frames"
            title="Search frames (Ctrl+F)"
            style={{ marginLeft: 10, padding: '5px 10px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
              color: 'var(--cf-text-secondary)', fontSize: 11, cursor: activeProject ? 'pointer' : 'not-allowed',
              opacity: activeProject ? 1 : 0.5, fontFamily: 'var(--forge-font)' }}>🔍<span className="cf-hide-mobile"> Search</span></button>

          {/* Publish history */}
          <button
            onClick={() => activeProject && setShowHistory(true)}
            disabled={!activeProject}
            aria-label="Publish history"
            title="Publish history"
            style={{ marginLeft: 8, padding: '5px 10px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
              color: 'var(--cf-text-secondary)', fontSize: 11, cursor: activeProject ? 'pointer' : 'not-allowed',
              opacity: activeProject ? 1 : 0.5, fontFamily: 'var(--forge-font)' }}>⟳<span className="cf-hide-mobile"> History</span></button>

          {/* Course shell (per-project GUI skin) */}
          <button
            onClick={() => setShowShell(true)}
            disabled={!activeProject}
            aria-label="Course shell"
            title="Course shell — apply a ForgeGUI skin to the whole project"
            style={{
              marginLeft: 10, padding: '5px 12px', background: 'transparent',
              border: `1px solid ${activeProject?.gui_shell_id ? 'var(--forge-amber)' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: 4, color: activeProject?.gui_shell_id ? 'var(--forge-amber)' : 'var(--cf-text-secondary)',
              fontSize: 12, cursor: activeProject ? 'pointer' : 'not-allowed', opacity: activeProject ? 1 : 0.5,
              fontFamily: 'var(--forge-font)', letterSpacing: '0.04em',
            }}
          >▣<span className="cf-hide-mobile"> Shell</span></button>

          {/* Full-course preview — walk the whole course like a learner */}
          <button
            onClick={() => activeProject && window.open(`/api/projects/${activeProject.id}/preview-course`, '_blank', 'noopener')}
            disabled={!activeProject}
            aria-label="Preview course"
            title="Preview the whole course — walk it with Prev/Next or arrow keys"
            style={{
              marginLeft: 10, padding: '5px 12px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
              color: 'var(--cf-text-secondary)', fontSize: 12,
              cursor: activeProject ? 'pointer' : 'not-allowed', opacity: activeProject ? 1 : 0.5,
              fontFamily: 'var(--forge-font)', letterSpacing: '0.04em',
            }}
          >▶<span className="cf-hide-mobile"> Course</span></button>

          {/* Publish */}
          <button
            onClick={() => setShowPublish(true)}
            style={{
              marginLeft: 12,
              padding: '5px 14px',
              background: 'var(--cf-accent)',
              color: '#042C53',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "var(--forge-font)",
              letterSpacing: '0.04em',
            }}
          >
            ⬇ <span className="cf-hide-mobile">Publish</span>
          </button>
        </div>

        {/* Main split pane */}
        <div id="main-content" style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative' }}>
          {isMobile ? (
            <>
              <div style={{ flex: 1, overflow: 'hidden' }}>{editorInner}</div>
              {sidebarOpen && (
                <div onClick={() => setSidebarOpen(false)} aria-hidden="true"
                  style={{ position: 'fixed', top: 48, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199 }} />
              )}
              <div style={{ position: 'fixed', top: 48, left: 0, bottom: 0, width: 280, zIndex: 200,
                transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.2s ease',
                boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.4)' : 'none' }}>
                {sidebarInner}
              </div>
            </>
          ) : (
            <PanelGroup direction="horizontal" style={{ flex: 1, overflow: 'hidden' }}>
              <Panel defaultSize={28} minSize={24} maxSize={55}>{sidebarInner}</Panel>
              <PanelResizeHandle style={{ width: 4, background: 'var(--cf-border-primary)', cursor: 'col-resize', transition: 'background 0.15s' }} />
              <Panel minSize={40}>{editorInner}</Panel>
            </PanelGroup>
          )}
        </div>

        <Suspense fallback={null}>
          {showPublish && <PublishModal onClose={() => setShowPublish(false)} />}
          {showThemeEditor && <ThemeEditorModal onClose={() => setShowThemeEditor(false)} />}
          {showShortcutHelp && <ShortcutHelp open onClose={() => setShowShortcutHelp(false)} />}
          {showShell && (
            <CourseShellModal
              open
              onClose={() => setShowShell(false)}
              projectId={activeProject?.id}
              currentShellId={activeProject?.gui_shell_id}
              onChanged={() => { if (activeProject) fetchProject(activeProject.id) }}
            />
          )}
          {showHistory && <PublishHistory open onClose={() => setShowHistory(false)} projectId={activeProject?.id} />}
          {showSearch && (
            <FrameSearch
              open
              onClose={() => setShowSearch(false)}
              projectId={activeProject?.id}
              onNavigate={(frameId) => useEditorStore.getState().loadFrame(frameId)}
            />
          )}
        </Suspense>
      </div>
    </ThemeProvider>
  )
}
