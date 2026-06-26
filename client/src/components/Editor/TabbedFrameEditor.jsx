import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  horizontalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useEditorStore from '../../store/editorStore'
import { BLOCK_TYPES } from './BlockToolbar'
import MenuEditor from './MenuEditor'
import FrameNotes from './FrameNotes'
import FramePrompt from './FramePrompt'
import FrameLayout from './FrameLayout'
import BlockToolbar from './BlockToolbar'
import TextBlock from './blocks/TextBlock'
import MediaBlock from './blocks/MediaBlock'
import QuizBlock from './blocks/QuizBlock'
import HotspotBlock from './blocks/HotspotBlock'
import BranchBlock from './blocks/BranchBlock'
import OamBlock from './blocks/OamBlock'
import WCNBlock from './blocks/WCNBlock'
import IVideoBlock from './blocks/IVideoBlock'
import Model3DBlock from './blocks/Model3DBlock'
import GUIBlock from './blocks/GUIBlock'
import CalloutBlock from './blocks/CalloutBlock'
import PreviewModal from '../Preview/PreviewModal'

const BLOCK_COMPONENTS = {
  text: TextBlock, media: MediaBlock, quiz: QuizBlock, hotspot: HotspotBlock,
  branch: BranchBlock, oam: OamBlock, wcn: WCNBlock, ivideo: IVideoBlock,
  model3d: Model3DBlock, gui: GUIBlock, callout: CalloutBlock,
}
const META = Object.fromEntries(BLOCK_TYPES.map(b => [b.type, b]))
const FRAME_TAB = '__frame__'

// A single draggable block tab. Click selects (dnd-kit's 8px activation
// constraint lets a click through without starting a drag); drag reorders.
function BlockTab({ block, idx, active, onSelect }) {
  const meta = META[block.type] || { Icon: null, label: block.type, color: '#888' }
  const TabIcon = meta.Icon
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id })
  const style = {
    transform: CSS.Transform.toString(transform), transition,
    opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 10 : 'auto',
  }
  return (
    <button
      ref={setNodeRef} style={{ ...tabStyle(active, meta.color), ...style }}
      onClick={() => onSelect(block.id)} {...attributes} {...listeners}
      title={`${meta.label} block (drag to reorder)`}
      aria-label={`${meta.label} block ${idx + 1}`} aria-pressed={active}
    >
      {TabIcon && <span style={{ opacity: 0.85, display: 'inline-flex' }}><TabIcon width={14} height={14} /></span>}
      <span>{meta.label}</span>
      <span style={{ fontSize: 9, opacity: 0.5, fontFamily: 'var(--forge-font)' }}>{idx + 1}</span>
    </button>
  )
}

export default function TabbedFrameEditor() {
  const activeFrame    = useEditorStore(s => s.activeFrame)
  const activeBlockId  = useEditorStore(s => s.activeBlockId)
  const setActiveBlock = useEditorStore(s => s.setActiveBlock)
  const reorderBlocks  = useEditorStore(s => s.reorderBlocks)
  const removeBlock    = useEditorStore(s => s.removeBlock)
  const previewOpen    = useEditorStore(s => s.previewOpen)
  const setPreviewOpen = useEditorStore(s => s.setPreviewOpen)

  const blocks = activeFrame?.content?.blocks || []
  const [tab, setTab] = useState(FRAME_TAB)
  const prevRef = useRef({ frameId: null, count: 0 })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Preview → tab: when a block is selected elsewhere (clicking it in the live
  // preview), surface its tab here.
  useEffect(() => {
    if (activeBlockId && blocks.some(b => b.id === activeBlockId)) setTab(activeBlockId)
  }, [activeBlockId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select a freshly added block (its tab), and reset to the Frame tab when
  // switching frames. Also recover if the current tab's block was removed.
  useEffect(() => {
    const p = prevRef.current
    const frameId = activeFrame?.id || null
    if (frameId !== p.frameId) {
      setTab(FRAME_TAB)
    } else if (blocks.length > p.count) {
      const last = blocks[blocks.length - 1]
      if (last) { setTab(last.id); setActiveBlock(last.id) }
    } else if (tab !== FRAME_TAB && !blocks.some(b => b.id === tab)) {
      setTab(FRAME_TAB)
    }
    prevRef.current = { frameId, count: blocks.length }
  }, [activeFrame?.id, blocks.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Menu frame has no blocks/tabs — show the Menu editor in both inspector modes.
  if (activeFrame && activeFrame.frame_type === 'menu') {
    return <MenuEditor />
  }

  if (!activeFrame) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 10, color: 'var(--color-text-secondary)' }}>
        <div style={{ fontSize: 32, opacity: 0.3 }}>🎞</div>
        <p style={{ fontSize: 14, margin: 0 }}>Select a frame from the sidebar</p>
      </div>
    )
  }

  const selectBlock = (id) => { setTab(id); setActiveBlock(id) }
  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIdx = blocks.findIndex(b => b.id === active.id)
    const newIdx = blocks.findIndex(b => b.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    reorderBlocks(arrayMove(blocks, oldIdx, newIdx))
  }

  const activeBlock = blocks.find(b => b.id === tab)
  const Block = activeBlock ? BLOCK_COMPONENTS[activeBlock.type] : null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab strip — Frame tab is pinned; block tabs are sortable */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
        borderBottom: '1px solid var(--cf-border-primary)', background: 'var(--color-background-secondary)',
        overflowX: 'auto', flexShrink: 0 }}>
        <button onClick={() => setTab(FRAME_TAB)} aria-pressed={tab === FRAME_TAB}
          title="Frame settings — name, notes, layout"
          style={tabStyle(tab === FRAME_TAB, 'var(--forge-amber)')}>
          <span>⚙</span><span>Frame</span>
        </button>
        <span style={{ width: 1, height: 18, background: 'var(--cf-border-primary)', margin: '0 2px', flexShrink: 0 }} />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map(b => b.id)} strategy={horizontalListSortingStrategy}>
            {blocks.map((b, i) => (
              <BlockTab key={b.id} block={b} idx={i} active={tab === b.id} onSelect={selectBlock} />
            ))}
          </SortableContext>
        </DndContext>
        {blocks.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontStyle: 'italic', marginLeft: 4 }}>
            no blocks — add one below
          </span>
        )}
      </div>

      {/* Active tab body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {tab === FRAME_TAB ? (
          <>
            <FrameLayout frame={activeFrame} />
            <FramePrompt frame={activeFrame} />
            <FrameNotes frame={activeFrame} />
          </>
        ) : activeBlock ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontFamily: 'var(--forge-font)', letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                {(META[activeBlock.type]?.label || activeBlock.type)} block
              </span>
              <div style={{ flex: 1 }} />
              <button onClick={() => { removeBlock(activeBlock.id); setTab(FRAME_TAB) }}
                aria-label="Remove this block"
                style={{ background: 'none', border: '1px solid color-mix(in srgb, #E87070 40%, transparent)',
                  color: '#E87070', borderRadius: 4, fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}>
                ✕ Remove
              </button>
            </div>
            {Block ? <Block block={activeBlock} />
              : <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  No editor for block type <strong>{activeBlock.type}</strong>.
                </div>}
          </div>
        ) : null}
      </div>

      <BlockToolbar />
      {previewOpen && <PreviewModal onClose={() => setPreviewOpen(false)} />}
    </div>
  )
}

function tabStyle(active, color) {
  return {
    display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
    padding: '5px 11px', borderRadius: 5, cursor: 'pointer',
    fontSize: 12, fontFamily: 'var(--cf-font)',
    border: `1px solid ${active ? color : 'var(--cf-border-tertiary)'}`,
    background: active ? `color-mix(in srgb, ${color} 14%, transparent)` : 'transparent',
    color: active ? color : 'var(--color-text-secondary)',
    fontWeight: active ? 600 : 400,
    transition: 'background 0.12s, border-color 0.12s',
  }
}
