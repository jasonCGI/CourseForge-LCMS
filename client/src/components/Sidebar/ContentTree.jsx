import React, { useEffect, useRef } from 'react'
import { Tree } from 'react-arborist'
import useProjectStore from '../../store/projectStore'

// ── Build flat node list from project hierarchy ──────────────────────────────
function buildNodes(project) {
  if (!project) return []
  const nodes = []

  nodes.push({
    id: project.id,
    name: project.name,
    type: 'project',
    children: (project.courses || []).map(course => ({
      id: course.id,
      name: course.name,
      type: 'course',
      children: (course.modules || []).map(mod => ({
        id: mod.id,
        name: mod.name,
        type: 'module',
        children: (mod.lessons || []).map(lesson => ({
          id: lesson.id,
          name: lesson.name,
          type: 'lesson',
          children: (lesson.frames || []).map(frame => ({
            id: frame.id,
            name: frame.name,
            type: 'frame',
            frameType: frame.frame_type,
            children: [],
          }))
        }))
      }))
    }))
  })

  return nodes
}

// ── Node type icons ───────────────────────────────────────────────────────────
const TYPE_ICON = {
  project: '📁',
  course:  '📚',
  module:  '📂',
  lesson:  '📄',
  frame:   '🎞️',
}

const FRAME_TYPE_COLOR = {
  content:    '#4CAF50',
  assessment: '#FF9800',
  branch:     '#9C27B0',
}

// ── Single node renderer ──────────────────────────────────────────────────────
function Node({ node, style, dragHandle }) {
  const setActiveFrameId = useProjectStore(s => s.setActiveFrameId)
  const isFrame = node.data.type === 'frame'

  const handleClick = () => {
    node.toggle()
    if (isFrame) setActiveFrameId(node.data.id)
  }

  return (
    <div
      ref={dragHandle}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 4,
        cursor: 'pointer',
        background: node.isSelected ? 'var(--tree-selected)' : 'transparent',
        color: 'var(--tree-text)',
        fontSize: 13,
        userSelect: 'none',
      }}
      onClick={handleClick}
    >
      <span style={{ flexShrink: 0 }}>{TYPE_ICON[node.data.type] || '•'}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.data.name}
      </span>
      {isFrame && (
        <span style={{
          fontSize: 10,
          padding: '1px 5px',
          borderRadius: 3,
          background: FRAME_TYPE_COLOR[node.data.frameType] || '#999',
          color: '#fff',
          flexShrink: 0,
        }}>
          {node.data.frameType}
        </span>
      )}
    </div>
  )
}

// ── Main ContentTree component ────────────────────────────────────────────────
export default function ContentTree({ height = 600 }) {
  const activeProject  = useProjectStore(s => s.activeProject)
  const nodes = buildNodes(activeProject)

  if (!activeProject) {
    return (
      <div style={{ padding: 16, color: '#888', fontSize: 13 }}>
        No project loaded. Import a JSON file or create a new project.
      </div>
    )
  }

  return (
    <div style={{ '--tree-selected': '#1e3a5f', '--tree-text': '#e0e0e0' }}>
      <Tree
        data={nodes}
        openByDefault={true}
        width="100%"
        height={height}
        indent={16}
        rowHeight={28}
      >
        {Node}
      </Tree>
    </div>
  )
}
