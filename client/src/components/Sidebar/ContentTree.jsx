import React, { useState, useCallback } from 'react'
import useProjectStore from '../../store/projectStore'
import useEditorStore  from '../../store/editorStore'

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

// Frame badge styles using CSS vars
const BADGE_STYLE = {
  content: {
    background: cssVar('--cf-badge-ctn-bg'),
    color:      cssVar('--cf-badge-ctn-text'),
    border:     cssVar('--cf-badge-border'),
    borderColor:cssVar('--cf-badge-ctn-text'),
  },
  assessment: {
    background: cssVar('--cf-badge-kc-bg'),
    color:      cssVar('--cf-badge-kc-text'),
    border:     cssVar('--cf-badge-border'),
    borderColor:cssVar('--cf-badge-kc-text'),
  },
  branch: {
    background: cssVar('--cf-badge-br-bg'),
    color:      cssVar('--cf-badge-br-text'),
    border:     cssVar('--cf-badge-border'),
    borderColor:cssVar('--cf-badge-br-text'),
  },
}

// ── Tree row component ────────────────────────────────────────────

function TreeRow({
  level, depth, label, count, isOpen, isActive, isCurrent,
  frameType, onClick, children
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
    : { background: isFrame ? cssVar('--cf-level-frame-bg') : lv?.bg }

  const textColor = isCurrent
    ? cssVar('--cf-level-frame-active-text')
    : isFrame ? cssVar('--cf-level-frame-text') : lv?.text

  const fontWeight = isCurrent
    ? cssVar('--cf-level-frame-active-fw')
    : isFrame ? cssVar('--cf-level-frame-fw') : lv?.fw

  const badge = frameType && BADGE_STYLE[frameType]
  const badgeLabel = { content: 'ctn', assessment: 'kc', branch: 'br' }

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={!isFrame ? isOpen : undefined}
        aria-current={isCurrent ? 'true' : undefined}
        aria-label={`${level}: ${label}${count ? `, ${count}` : ''}${isCurrent ? ', currently selected' : ''}${!isFrame && !isOpen ? ', collapsed' : ''}`}
        tabIndex={0}
        onClick={onClick}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}
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
          <span style={{
            fontSize: 12, color: textColor, fontWeight,
            flex: 1, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
            fontFamily: 'var(--cf-font, Inter, system-ui, sans-serif)',
          }}>
            {label}
          </span>

          {/* Count meta */}
          {count && !isFrame && (
            <span style={{
              fontSize: 10, color: lv?.tab, flexShrink: 0,
              fontFamily: 'var(--cf-mono, SF Mono, Consolas, monospace)',
              opacity: 0.8,
            }}>
              {count}
            </span>
          )}

          {/* Frame type badge */}
          {badge && (
            <span
              aria-label={`${frameType} frame`}
              style={{
                fontSize: 9, fontWeight: 600,
                padding: '2px 5px', borderRadius: 3,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                flexShrink: 0, ...badge,
              }}
            >
              {badgeLabel[frameType]}
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
  const loadFrame     = useEditorStore(s => s.loadFrame)
  const activeFrameId = useEditorStore(s => s.activeFrame?.id)

  const [openCourses,  setOpenCourses]  = useState({})
  const [openModules,  setOpenModules]  = useState({})
  const [openLessons,  setOpenLessons]  = useState({})

  const toggle = (setter, id) =>
    setter(prev => ({ ...prev, [id]: !prev[id] }))

  if (!activeProject) {
    return (
      <div style={{
        padding: 16,
        color: 'var(--cf-text-tertiary)',
        fontSize: 12,
        fontFamily: 'var(--cf-mono, SF Mono, Consolas, monospace)',
        lineHeight: 1.6,
      }}>
        No project loaded.<br/>
        Import a JSON file or select a project.
      </div>
    )
  }

  const courses = [...(activeProject.courses || [])].sort((a, b) => a.order_index - b.order_index)

  return (
    <div role="tree" aria-label={`Project: ${activeProject.name}`} style={{ outline: 'none' }}>

      {/* Project root */}
      <TreeRow
        level="project"
        depth={0}
        label={activeProject.name}
        isOpen={true}
        onClick={() => {}}
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
                    onClick={() => toggle(setOpenModules, mod.id)}
                  >
                    {lessons.map(lesson => {
                      const lessonOpen = openLessons[lesson.id] !== false
                      const frames = [...(lesson.frames || [])].sort((a, b) => a.order_index - b.order_index)

                      return (
                        <TreeRow
                          key={lesson.id}
                          level="lesson"
                          depth={3}
                          label={lesson.name}
                          count={`${frames.length}f`}
                          isOpen={lessonOpen}
                          onClick={() => toggle(setOpenLessons, lesson.id)}
                        >
                          {frames.map(frame => (
                            <TreeRow
                              key={frame.id}
                              level="frame"
                              depth={4}
                              label={frame.name}
                              frameType={frame.frame_type || 'content'}
                              isFrame={true}
                              isCurrent={frame.id === activeFrameId}
                              onClick={() => loadFrame(frame.id)}
                            />
                          ))}
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
    </div>
  )
}
