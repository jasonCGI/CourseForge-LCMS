import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useProjectStore from '../../store/projectStore'
import useEditorStore  from '../../store/editorStore'
import { duplicateFrame, createFrame, reorder } from '../../api/client'
import TemplateLibrary from '../UI/TemplateLibrary'
import InspectorViewControls from '../Editor/InspectorViewControls'
import { getFrameCompletion, getFrameBaseStatus } from '../../utils/frameCompletion'

const byOrder = (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)

// Wraps a frame TreeRow so it can be pointer-dragged to reorder within its
// lesson. Listeners only (not dnd-kit's keyboard attributes) so the tree's
// existing roving-tabindex keyboard nav stays intact; clicks still select
// (PointerSensor activation distance lets a click through without a drag).
function SortableFrameRow({ id, children }) {
  const { setNodeRef, transform, transition, listeners, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
  }
  return (
    <div ref={setNodeRef} style={style} {...listeners}>
      {children}
    </div>
  )
}

const COMPLETION_DOT = {
  complete:   { color: '#4CAF50', title: 'All blocks complete' },
  incomplete: { color: 'var(--forge-amber)', title: 'Missing required assets or content' },
  empty:      { color: '#3A5A7A', title: 'No blocks in frame' },
  optional:   { color: '#5A7AA8', title: 'Optional — excluded from completion count' },
}

// ── SVG helpers ──────────────────────────────────────────────────

function FolderIcon({ f1, f2, open, size = 14 }) {
  if (open) return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5L6.5 3.5H11.5C12.33 3.5 13 4.17 13 5V11C13 11.83 12.33 12.5 11.5 12.5H2.5C1.67 12.5 1 11.83 1 11V3.5Z" fill={f1}/>
      <path d="M1 5.5H13V11C13 11.83 12.33 12.5 11.5 12.5H2.5C1.67 12.5 1 11.83 1 11V5.5Z" fill={f2}/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5L6.5 3.5H11.5C12.33 3.5 13 4.17 13 5V11C13 11.83 12.33 12.5 11.5 12.5H2.5C1.67 12.5 1 11.83 1 11V3.5Z" fill={f1} opacity="0.55"/>
    </svg>
  )
}

function PlayIcon({ color }) {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true" style={{ flexShrink: 0, margin: '0 3px' }}>
      <polygon points="1,1 8,4.5 1,8" fill={color}/>
    </svg>
  )
}

// ── Level config — reads from CSS custom properties set by ThemeContext ──────

function cssVar(name) {
  return `var(${name})`
}

const LEVELS = {
  project: {
    tab:  cssVar('--cf-level-project-tab'),
    bg:   cssVar('--cf-level-project-bg'),
    text: cssVar('--cf-level-project-text'),
    fw:   cssVar('--cf-level-project-fw'),
    f1:   cssVar('--cf-level-project-f1'),
    f2:   cssVar('--cf-level-project-f2'),
  },
  course: {
    tab:  cssVar('--cf-level-course-tab'),
    bg:   cssVar('--cf-level-course-bg'),
    text: cssVar('--cf-level-course-text'),
    fw:   cssVar('--cf-level-course-fw'),
    f1:   cssVar('--cf-level-course-f1'),
    f2:   cssVar('--cf-level-course-f2'),
  },
  module: {
    tab:  cssVar('--cf-level-module-tab'),
    bg:   cssVar('--cf-level-module-bg'),
    text: cssVar('--cf-level-module-text'),
    fw:   cssVar('--cf-level-module-fw'),
    f1:   cssVar('--cf-level-module-f1'),
    f2:   cssVar('--cf-level-module-f2'),
  },
  lesson: {
    tab:  cssVar('--cf-level-lesson-tab'),
    bg:   cssVar('--cf-level-lesson-bg'),
    text: cssVar('--cf-level-lesson-text'),
    fw:   cssVar('--cf-level-lesson-fw'),
    f1:   cssVar('--cf-level-lesson-f1'),
    f2:   cssVar('--cf-level-lesson-f2'),
  },
}

// Frame-type badges (CTN/KC/BR) were removed 2026-06-16 — to revisit with a
// clearer visual frame-type indicator later. frameType is still threaded
// through TreeRow for that future use.

// ── Tree row component ────────────────────────────────────────────

function TreeRow({
  level, depth, label, count, isOpen, isActive, isCurrent,
  frameType, note, optional, dotStatus, itemId, tabIndex, onKeyDown,
  onClick, onContextMenu, children, rowIndex = 0
}) {
  const lv = LEVELS[level]
  const isFrame = level === 'frame'

  const tabColor = isCurrent
    ? cssVar('--cf-level-frame-active-tab')
    : isFrame ? cssVar('--cf-level-frame-tab') : lv?.tab

  const bgStyle = isCurrent
    ? {
        background: cssVar('--cf-level-frame-active-bg'),
        outline: `1px solid ${cssVar('--cf-level-frame-active-outline')}`,
        outlineOffset: '-1px',
      }
    : {
        background: isFrame
          ? cssVar(rowIndex % 2 === 1 ? '--cf-level-frame-bg-alt' : '--cf-level-frame-bg')
          : lv?.bg,
      }

  const textColor = isCurrent
    ? cssVar('--cf-level-frame-active-text')
    : isFrame ? cssVar('--cf-level-frame-text') : lv?.text

  const fontWeight = isCurrent
    ? cssVar('--cf-level-frame-active-fw')
    : isFrame ? cssVar('--cf-level-frame-fw') : lv?.fw

  return (
    <div>
      <div
        id={itemId ? `tree-item-${itemId}` : undefined}
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={!isFrame ? isOpen : undefined}
        aria-selected={isFrame ? (isCurrent ? 'true' : 'false') : undefined}
        aria-current={isCurrent ? 'true' : undefined}
        aria-label={`${level}: ${label}${count ? `, ${count}` : ''}${optional ? ', optional' : ''}${isCurrent ? ', currently selected' : ''}${!isFrame && !isOpen ? ', collapsed' : ''}`}
        tabIndex={tabIndex != null ? tabIndex : 0}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown || (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } })}
        title={label}
        style={{ display: 'flex', alignItems: 'stretch', cursor: 'pointer', outline: 'none' }}
        className="cf-tree-row"
      >
        {/* Level tab */}
        <div style={{ width: 3, background: tabColor, flexShrink: 0 }} aria-hidden="true"/>

        {/* Indent lines */}
        {Array.from({ length: depth }).map((_, i) => (
          <div key={i} style={{
            width: 16, flexShrink: 0, alignSelf: 'stretch',
            borderRight: `1px solid ${cssVar('--cf-indent-line')}`,
          }} aria-hidden="true"/>
        ))}

        {/* Content */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center',
          gap: 6, padding: '6px 10px 6px 7px', overflow: 'hidden',
          ...bgStyle,
        }}>
          {/* Toggle arrow */}
          <span style={{
            fontSize: 8, width: 10, flexShrink: 0, textAlign: 'center',
            color: tabColor,
          }} aria-hidden="true">
            {isFrame ? '' : isOpen ? '▾' : '▸'}
          </span>

          {/* OPT chip — sits LEFT of the status dot. "optional" is an orthogonal
              axis from completion, so it gets its own channel and the dot below
              keeps showing the real authoring status. */}
          {isFrame && optional && (
            <span aria-hidden="true" title={COMPLETION_DOT.optional.title}
              style={{ flexShrink: 0, fontFamily: 'var(--cf-mono, ui-monospace, monospace)',
                fontSize: 8, fontWeight: 700, lineHeight: 1, letterSpacing: '0.04em',
                color: COMPLETION_DOT.optional.color,
                border: `1px solid ${COMPLETION_DOT.optional.color}`,
                borderRadius: 3, padding: '1.5px 3px', background: 'transparent' }}>OPT</span>
          )}

          {/* Completion dot (frames only) — always the real status, even when optional */}
          {isFrame && dotStatus && COMPLETION_DOT[dotStatus] && (
            <span title={COMPLETION_DOT[dotStatus].title} aria-hidden="true"
              style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                display: 'inline-block', boxSizing: 'border-box',
                background: COMPLETION_DOT[dotStatus].color }} />
          )}

          {/* Glyph — folder for hierarchy, play for frame */}
          {isFrame ? (
            <PlayIcon color={isCurrent
              ? cssVar('--cf-level-frame-active-text')
              : cssVar('--cf-level-frame-tab')}
            />
          ) : (
            <FolderIcon
              f1={lv?.f1}
              f2={lv?.f2}
              open={isOpen}
            />
          )}

          {/* Label */}
          <span title={label} style={{
            fontSize: 12, color: textColor, fontWeight,
            flex: 1, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
            fontFamily: 'var(--cf-font, Inter, system-ui, sans-serif)',
            minWidth: 0,
          }}>
            {label}
          </span>

          {/* Author-notes indicator */}
          {note && (
            <span title="Has author notes" aria-label="Has author notes"
              style={{ fontSize: 9, color: 'var(--forge-amber)', opacity: 0.7, flexShrink: 0 }}>✎</span>
          )}

          {/* Count meta */}
          {count && !isFrame && (
            <span style={{
              fontSize: 10, color: lv?.tab, flexShrink: 0,
              fontFamily: 'var(--forge-font)',
              opacity: 0.8,
            }}>
              {count}
            </span>
          )}
        </div>
      </div>

      {/* Children — shown when open */}
      {isOpen && !isFrame && children}
    </div>
  )
}

// ── Main ContentTree ──────────────────────────────────────────────

export default function ContentTree() {
  const activeProject = useProjectStore(s => s.activeProject)
  const fetchProjects = useProjectStore(s => s.fetchProjects)
  const fetchProject  = useProjectStore(s => s.fetchProject)
  const loadFrame        = useEditorStore(s => s.loadFrame)
  const selectConfigNode = useEditorStore(s => s.selectConfigNode)
  const activeFrameId    = useEditorStore(s => s.activeFrame?.id)
  const selectedNode     = useEditorStore(s => s.selectedNode)

  // Pointer-drag to reorder frames within a lesson. Distance constraint so a
  // plain click still selects the frame instead of starting a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const handleFrameDragEnd = async (event, lesson) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const all = [...(lesson.frames || [])].sort(byOrder)
    const oldIndex = all.findIndex(f => f.id === active.id)
    const newIndex = all.findIndex(f => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const items = arrayMove(all, oldIndex, newIndex).map((f, i) => ({ id: f.id, order_index: i }))
    try {
      await reorder('frames', items)
      if (activeProject) await fetchProject(activeProject.id)
    } catch (e) {
      alert('Could not reorder frames: ' + (e.message || 'Unknown error'))
    }
  }

  const loadDemo = async () => {
    try {
      await fetchProjects()
      const list = useProjectStore.getState().projects || []
      const demo = list.find(p => p.name === 'CourseForge Demo')
      if (demo) await fetchProject(demo.id)
      else alert('Demo project not found — the server seeds it on first launch.')
    } catch (e) {
      alert('Could not load demo: ' + (e.message || 'Unknown error'))
    }
  }

  const resetDemo = async () => {
    if (!confirm('Reset the demo course to defaults? Any edits to the demo project will be lost.')) return
    try {
      // POST (security review C3) + edit token (C2) when the owner has set it.
      const cfToken = (typeof localStorage !== 'undefined') && localStorage.getItem('cf_edit_token')
      const res = await fetch('/api/demo/reset', {
        method: 'POST',
        headers: cfToken ? { 'X-CF-Token': cfToken } : {},
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.status !== 'ok') {
        throw new Error(body.message || `HTTP ${res.status}`)
      }
      await fetchProjects()
      const list = useProjectStore.getState().projects || []
      const demo = list.find(p => p.name === 'CourseForge Demo')
      if (demo) await fetchProject(demo.id)
    } catch (e) {
      alert('Could not reset demo: ' + (e.message || 'Unknown error'))
    }
  }

  // Shared style for the subtle "reset demo" text link.
  const resetLinkStyle = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: 'var(--cf-text-tertiary)', fontSize: 10, fontFamily: 'var(--forge-font)',
    letterSpacing: '0.04em', textDecoration: 'underline', textUnderlineOffset: 2,
  }

  const [openCourses,  setOpenCourses]  = useState({})
  const [openModules,  setOpenModules]  = useState({})
  const [openLessons,  setOpenLessons]  = useState({})

  // Reveal the active frame whenever it changes (e.g. opened from search):
  // expand its course/module/lesson ancestors and scroll its row into view.
  useEffect(() => {
    if (!activeFrameId || !activeProject) return
    for (const c of activeProject.courses || [])
      for (const m of c.modules || [])
        for (const l of m.lessons || [])
          if ((l.frames || []).some(f => f.id === activeFrameId)) {
            setOpenCourses(s => ({ ...s, [c.id]: true }))
            setOpenModules(s => ({ ...s, [m.id]: true }))
            setOpenLessons(s => ({ ...s, [l.id]: true }))
          }
    const t = setTimeout(() => {
      document.getElementById(`tree-item-${activeFrameId}`)
        ?.scrollIntoView({ block: 'nearest' })
    }, 60)
    return () => clearTimeout(t)
  }, [activeFrameId])

  // ── Sprint A: frame context menu + copy-to-lesson ──────────────────
  const [contextMenu,        setContextMenu]        = useState(null) // {frameId, x, y}
  const [copyToLessonFrameId, setCopyToLessonFrameId] = useState(null)

  // ── Sprint B: template library for new frames ──────────────────────
  const [templateLibOpen,     setTemplateLibOpen]     = useState(false)
  const [templateTargetLesson, setTemplateTargetLesson] = useState(null)

  // ── Sprint D: completion filter + keyboard nav ─────────────────────
  const [completionFilter, setCompletionFilter] = useState('all') // all|complete|incomplete|empty|optional
  const [focusedId, setFocusedId] = useState(null)

  const refreshProject = () => activeProject && fetchProject(activeProject.id)

  const assignNewBlockIds = (content) => {
    const c = JSON.parse(JSON.stringify(content || { blocks: [] }))
    for (const b of (c.blocks || [])) b.id = crypto.randomUUID()
    // Preserve non-block content (e.g. a menu frame's content.menu) and give its
    // items fresh ids so duplicates don't collide.
    if (c.menu && Array.isArray(c.menu.items)) {
      c.menu.items = c.menu.items.map(it => ({ ...it, id: crypto.randomUUID() }))
    }
    return c
  }

  const handleTemplateSelect = async (template) => {
    if (!templateTargetLesson) return
    try {
      const { data: nf } = await createFrame(templateTargetLesson, {
        name: template.name === 'Blank Frame' ? 'New Frame' : template.name,
        frame_type: template.frame_type || 'content',
        content: assignNewBlockIds(template.content),
      })
      await refreshProject()
      if (nf?.id) loadFrame(nf.id)
    } catch (e) {
      alert('Could not create frame: ' + (e.response?.data?.error || e.message))
    } finally {
      setTemplateLibOpen(false); setTemplateTargetLesson(null)
    }
  }

  // Flatten all lessons (with module name) for the copy-to-lesson picker.
  // Memoized — only consumed by the (rarely-open) copy-to-lesson modal.
  const allLessons = useMemo(() => {
    const out = []
    for (const c of (activeProject?.courses || []))
      for (const m of (c.modules || []))
        for (const l of (m.lessons || []))
          out.push({ id: l.id, name: l.name, module_name: m.name })
    return out
  }, [activeProject])

  // Compute each frame's completion ONCE per project (was getFrameCompletion —
  // a full block scan — recomputed ~3× per frame on every tree render).
  const completionByFrame = useMemo(() => {
    const map = new Map()
    for (const c of (activeProject?.courses || []))
      for (const m of (c.modules || []))
        for (const l of (m.lessons || []))
          for (const f of (l.frames || []))
            map.set(f.id, getFrameCompletion(f))
    return map
  }, [activeProject])

  // Real authoring status for optional frames (complete/incomplete/empty), so the
  // status dot stays meaningful while the OPT chip carries the optional flag.
  // Only optional frames differ from completionByFrame, so store just those.
  const baseStatusByFrame = useMemo(() => {
    const map = new Map()
    for (const c of (activeProject?.courses || []))
      for (const m of (c.modules || []))
        for (const l of (m.lessons || []))
          for (const f of (l.frames || []))
            if (f.optional) map.set(f.id, getFrameBaseStatus(f))
    return map
  }, [activeProject])

  // Sorted top-level courses + the flat render-order navigation list. Memoized
  // so a re-render that didn't change the tree/open-state/filter (e.g. an editor
  // keystroke or hover) doesn't re-walk and re-sort the whole hierarchy.
  const courses = useMemo(
    () => [...(activeProject?.courses || [])].sort((a, b) => a.order_index - b.order_index),
    [activeProject],
  )
  const flatItems = useMemo(() => {
    if (!activeProject) return []
    const cOpen = (id) => openCourses[id] !== false
    const mOpen = (id) => openModules[id] !== false
    const lOpen = (id) => openLessons[id] !== false
    const visible = (fr) => completionFilter === 'all' || completionByFrame.get(fr.id) === completionFilter
    const items = [{ id: activeProject.id, type: 'project', parentId: null }]
    for (const co of courses) {
      items.push({ id: co.id, type: 'course', parentId: activeProject.id })
      if (!cOpen(co.id)) continue
      for (const mo of [...(co.modules || [])].sort((a, b) => a.order_index - b.order_index)) {
        items.push({ id: mo.id, type: 'module', parentId: co.id })
        if (!mOpen(mo.id)) continue
        for (const le of [...(mo.lessons || [])].sort((a, b) => a.order_index - b.order_index)) {
          items.push({ id: le.id, type: 'lesson', parentId: mo.id })
          if (!lOpen(le.id)) continue
          for (const fr of [...(le.frames || [])].sort((a, b) => a.order_index - b.order_index)) {
            if (visible(fr)) items.push({ id: fr.id, type: 'frame', parentId: le.id })
          }
        }
      }
    }
    return items
  }, [activeProject, courses, openCourses, openModules, openLessons, completionFilter, completionByFrame])

  const doDuplicate = async (frameId, targetLessonId = null) => {
    try {
      await duplicateFrame(frameId, targetLessonId)
      await refreshProject()
    } catch (e) {
      alert('Could not duplicate frame: ' + (e.response?.data?.error || e.message))
    }
  }

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true) }
  }, [contextMenu])

  const toggle = (setter, id) =>
    setter(prev => ({ ...prev, [id]: !prev[id] }))

  if (!activeProject) {
    return (
      <div style={{
        padding: 16,
        color: 'var(--cf-text-tertiary)',
        fontSize: 12,
        fontFamily: 'var(--forge-font)',
        lineHeight: 1.6,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div>
          No project loaded.<br/>
          Import a JSON file or select a project.
        </div>
        <button
          onClick={loadDemo}
          aria-label="Load built-in demo course"
          style={{
            padding: '7px 12px',
            background: 'var(--cf-accent-dim)',
            border: '1px solid var(--cf-accent)',
            borderRadius: 4,
            color: 'var(--cf-accent)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--cf-font)',
            letterSpacing: '0.04em',
            textAlign: 'center',
          }}
        >
          ▶ Load Demo Course
        </button>
        <button onClick={resetDemo} aria-label="Reset the demo course to defaults"
          style={{ ...resetLinkStyle, alignSelf: 'flex-start' }}>
          ↺ Reset demo to defaults
        </button>
      </div>
    )
  }

  // ── Sprint D: completion filter + keyboard navigation ──────────────
  // (courses + flatItems are memoized above; these helpers are still used by
  // the JSX render below.)
  const frameVisible = (frame) =>
    completionFilter === 'all' || completionByFrame.get(frame.id) === completionFilter

  const courseOpenOf = (id) => openCourses[id] !== false
  const moduleOpenOf = (id) => openModules[id] !== false
  const lessonOpenOf = (id) => openLessons[id] !== false

  const focusItem = (id) => { setFocusedId(id); setTimeout(() => document.getElementById(`tree-item-${id}`)?.focus(), 0) }
  const setOpen = (type, id, val) => {
    const setter = type === 'course' ? setOpenCourses : type === 'module' ? setOpenModules : setOpenLessons
    setter(prev => ({ ...prev, [id]: val }))
  }
  const isOpenOf = (type, id) => type === 'course' ? courseOpenOf(id) : type === 'module' ? moduleOpenOf(id) : lessonOpenOf(id)

  const handleTreeKeyDown = (e, item) => {
    const i = flatItems.findIndex(x => x.id === item.id)
    if (i < 0) return
    const container = item.type !== 'frame' && item.type !== 'project'
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (flatItems[i + 1]) focusItem(flatItems[i + 1].id); break
      case 'ArrowUp':   e.preventDefault(); if (flatItems[i - 1]) focusItem(flatItems[i - 1].id); break
      case 'ArrowRight':
        e.preventDefault()
        if (container && !isOpenOf(item.type, item.id)) setOpen(item.type, item.id, true)
        else if (flatItems[i + 1] && flatItems[i + 1].parentId === item.id) focusItem(flatItems[i + 1].id)
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (container && isOpenOf(item.type, item.id)) setOpen(item.type, item.id, false)
        else if (item.parentId) focusItem(item.parentId)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (item.type === 'frame') loadFrame(item.id)
        else if (container) setOpen(item.type, item.id, !isOpenOf(item.type, item.id))
        break
      case 'Home': e.preventDefault(); if (flatItems[0]) focusItem(flatItems[0].id); break
      case 'End':  e.preventDefault(); if (flatItems.length) focusItem(flatItems[flatItems.length - 1].id); break
      default: break
    }
  }
  const rovingTab = (id) => (focusedId ? (focusedId === id ? 0 : -1) : (id === flatItems[0]?.id ? 0 : -1))
  const FILTERS = ['all', 'complete', 'incomplete', 'optional', 'empty']

  return (
    <div>
    <div style={{ display: 'flex', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--cf-border-tertiary)',
      alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 9, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)',
        letterSpacing: '0.06em', textTransform: 'uppercase' }}>Filter</span>
      {FILTERS.map(f => {
        const on = completionFilter === f
        const col = (COMPLETION_DOT[f] && COMPLETION_DOT[f].color) || 'var(--cf-accent)'
        return (
          <button key={f} onClick={() => setCompletionFilter(f)}
            style={{ padding: '2px 7px', borderRadius: 20, fontSize: 9, cursor: 'pointer',
              fontFamily: 'var(--forge-font)', letterSpacing: '0.06em', textTransform: 'uppercase',
              background: on ? `color-mix(in srgb, ${col} 18%, transparent)` : 'transparent',
              border: `1px solid ${on ? col : 'var(--cf-border-tertiary)'}`,
              color: on ? col : 'var(--cf-text-tertiary)' }}>{f}</button>
        )
      })}
      {/* Stable home for the inspector view/dock controls. The sidebar never
          moves when the inspector re-docks, so this ⚙ View popover stays put. */}
      <InspectorViewControls />
    </div>
    <div role="tree" aria-label={`Project: ${activeProject.name}`} style={{ outline: 'none' }}>

      {/* Project root */}
      <TreeRow
        level="project"
        depth={0}
        label={activeProject.name}
        isOpen={true}
        itemId={activeProject.id}
        isCurrent={selectedNode?.type === 'project'}
        tabIndex={rovingTab(activeProject.id)}
        onKeyDown={e => handleTreeKeyDown(e, { id: activeProject.id, type: 'project', parentId: null })}
        onClick={() => selectConfigNode('project', activeProject.id)}
      >

        {courses.map(course => {
          const courseOpen = openCourses[course.id] !== false // default open
          const modules = [...(course.modules || [])].sort((a, b) => a.order_index - b.order_index)

          return (
            <TreeRow
              key={course.id}
              level="course"
              depth={1}
              label={course.name}
              count={`${modules.length}m`}
              isOpen={courseOpen}
              itemId={course.id}
              tabIndex={rovingTab(course.id)}
              onKeyDown={e => handleTreeKeyDown(e, { id: course.id, type: 'course', parentId: activeProject.id })}
              onClick={() => toggle(setOpenCourses, course.id)}
            >
              {modules.map(mod => {
                const modOpen = openModules[mod.id] !== false
                const lessons = [...(mod.lessons || [])].sort((a, b) => a.order_index - b.order_index)

                return (
                  <TreeRow
                    key={mod.id}
                    level="module"
                    depth={2}
                    label={mod.name}
                    count={`${lessons.length}l`}
                    isOpen={modOpen}
                    itemId={mod.id}
                    tabIndex={rovingTab(mod.id)}
                    onKeyDown={e => handleTreeKeyDown(e, { id: mod.id, type: 'module', parentId: course.id })}
                    onClick={() => toggle(setOpenModules, mod.id)}
                  >
                    {lessons.map(lesson => {
                      const lessonOpen = openLessons[lesson.id] !== false
                      const frames = [...(lesson.frames || [])]
                        .sort((a, b) => a.order_index - b.order_index)
                        .filter(frameVisible)

                      return (
                        <TreeRow
                          key={lesson.id}
                          level="lesson"
                          depth={3}
                          label={lesson.name}
                          count={`${frames.length}f`}
                          isOpen={lessonOpen}
                          itemId={lesson.id}
                          tabIndex={rovingTab(lesson.id)}
                          onKeyDown={e => handleTreeKeyDown(e, { id: lesson.id, type: 'lesson', parentId: mod.id })}
                          onClick={() => toggle(setOpenLessons, lesson.id)}
                        >
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(e) => handleFrameDragEnd(e, lesson)}
                          >
                            <SortableContext items={frames.map(f => f.id)} strategy={verticalListSortingStrategy}>
                              {frames.map((frame, fi) => (
                                <SortableFrameRow key={frame.id} id={frame.id}>
                                  <TreeRow
                                    level="frame"
                                    depth={4}
                                    rowIndex={fi}
                                    label={frame.name}
                                    frameType={frame.frame_type || 'content'}
                                    isFrame={true}
                                    isCurrent={frame.id === activeFrameId}
                                    note={!!(frame.notes && frame.notes.trim())}
                                    optional={completionByFrame.get(frame.id) === 'optional'}
                                    dotStatus={completionByFrame.get(frame.id) === 'optional'
                                      ? (baseStatusByFrame.get(frame.id) || 'empty')
                                      : completionByFrame.get(frame.id)}
                                    itemId={frame.id}
                                    tabIndex={rovingTab(frame.id)}
                                    onKeyDown={e => handleTreeKeyDown(e, { id: frame.id, type: 'frame', parentId: lesson.id })}
                                    onClick={() => loadFrame(frame.id)}
                                    onContextMenu={(e) => {
                                      e.preventDefault()
                                      setContextMenu({ frameId: frame.id, x: e.clientX, y: e.clientY })
                                    }}
                                  />
                                </SortableFrameRow>
                              ))}
                            </SortableContext>
                          </DndContext>
                          <button
                            onClick={() => { setTemplateTargetLesson(lesson.id); setTemplateLibOpen(true) }}
                            aria-label={`Add frame to ${lesson.name}`}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              padding: '5px 10px 5px 74px', background: 'none', border: 'none',
                              color: 'var(--cf-text-tertiary)', fontSize: 11, cursor: 'pointer',
                              fontFamily: 'var(--forge-font)', letterSpacing: '0.04em',
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--forge-amber)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--cf-text-tertiary)'}
                          >+ frame</button>
                        </TreeRow>
                      )
                    })}
                  </TreeRow>
                )
              })}
            </TreeRow>
          )
        })}

      </TreeRow>

      {activeProject.name === 'CourseForge Demo' && (
        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--cf-border-tertiary)', marginTop: 6 }}>
          <button onClick={resetDemo} aria-label="Reset the demo course to defaults" style={resetLinkStyle}>
            ↺ Reset demo to defaults
          </button>
        </div>
      )}

      {/* Frame context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', top: contextMenu.y, left: contextMenu.x,
            background: 'var(--cf-block-bg, #0d1017)',
            border: '1px solid var(--cf-border-secondary, #3a3a5a)',
            borderRadius: 6, zIndex: 500, minWidth: 170,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {[
            { label: '⧉ Duplicate frame', action: async () => { await doDuplicate(contextMenu.frameId); setContextMenu(null) } },
            { label: '→ Copy to lesson…',  action: () => { setCopyToLessonFrameId(contextMenu.frameId); setContextMenu(null) } },
          ].map((item, i) => (
            <button key={i} onClick={item.action}
              style={{
                display: 'block', width: '100%', padding: '9px 14px',
                background: 'none', border: 'none', textAlign: 'left',
                fontSize: 12, color: 'var(--cf-text-secondary)', cursor: 'pointer',
                fontFamily: 'var(--cf-font)',
                borderBottom: i < 1 ? '1px solid var(--cf-border-tertiary)' : 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--cf-input-bg)'; e.currentTarget.style.color = 'var(--cf-text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--cf-text-secondary)' }}
            >{item.label}</button>
          ))}
        </div>
      )}

      {/* Copy frame to lesson modal */}
      {copyToLessonFrameId && (
        <div role="dialog" aria-modal="true" aria-label="Copy frame to lesson"
          onClick={e => { if (e.target === e.currentTarget) setCopyToLessonFrameId(null) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(4,44,83,0.75)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
          <div style={{
            background: 'var(--cf-block-bg, #0d1017)',
            border: '1px solid var(--cf-border-secondary, #3a3a5a)',
            borderRadius: 10, width: 360, overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid var(--cf-border-tertiary)',
              fontFamily: 'var(--forge-font)', fontSize: 11, fontWeight: 600,
              color: 'var(--cf-text-primary)', letterSpacing: '0.04em',
            }}>Copy frame to lesson</div>
            <div style={{ padding: 12, maxHeight: 300, overflowY: 'auto' }}>
              {allLessons.map(lesson => (
                <button key={lesson.id}
                  onClick={async () => { await doDuplicate(copyToLessonFrameId, lesson.id); setCopyToLessonFrameId(null) }}
                  style={{
                    display: 'block', width: '100%', padding: '9px 12px',
                    background: 'none', border: 'none', textAlign: 'left', fontSize: 12,
                    color: 'var(--cf-text-secondary)', cursor: 'pointer', borderRadius: 4,
                    marginBottom: 4, fontFamily: 'var(--cf-font)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--cf-input-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <span style={{
                    fontSize: 9, color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)',
                    display: 'block', marginBottom: 2,
                  }}>{lesson.module_name}</span>
                  {lesson.name}
                </button>
              ))}
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--cf-border-tertiary)', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setCopyToLessonFrameId(null)}
                style={{
                  padding: '6px 14px', background: 'transparent',
                  border: '1px solid var(--cf-border-secondary)', borderRadius: 4,
                  fontSize: 12, color: 'var(--cf-text-secondary)', cursor: 'pointer', fontFamily: 'var(--cf-font)',
                }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <TemplateLibrary
        open={templateLibOpen}
        onClose={() => { setTemplateLibOpen(false); setTemplateTargetLesson(null) }}
        onSelect={handleTemplateSelect}
      />
    </div>
    </div>
  )
}
