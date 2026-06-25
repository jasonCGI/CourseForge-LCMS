import React, { useMemo } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useEditorStore from '../../store/editorStore'
import useClipboardStore from '../../store/clipboardStore'
import { countWords, formatTime } from '../../utils/wordCount'
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
import PreviewModal from '../Preview/PreviewModal'

const BLOCK_COMPONENTS = {
  text:    TextBlock,
  media:   MediaBlock,
  quiz:    QuizBlock,
  hotspot: HotspotBlock,
  branch:  BranchBlock,
  oam:     OamBlock,
  wcn:     WCNBlock,
  ivideo:  IVideoBlock,
  model3d: Model3DBlock,
  gui:     GUIBlock,
}

function SortableBlock({ block }) {
  const setActiveBlock = useEditorStore(s => s.setActiveBlock)
  const activeBlockId  = useEditorStore(s => s.activeBlockId)
  const activeFrameId  = useEditorStore(s => s.activeFrame?.id)
  const copyBlock      = useClipboardStore(s => s.copyBlock)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id })

  const Block = BLOCK_COMPONENTS[block.type]
  const isActive = activeBlockId === block.id

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : 'auto',
    paddingLeft: 18,
    borderLeft: `2px solid ${isActive ? 'var(--forge-amber)' : 'transparent'}`,
    borderRadius: 4,
  }

  if (!Block) {
    return (
      <div style={{
        padding: '12px 16px', border: '1px dashed var(--color-border-tertiary)',
        borderRadius: 6, marginBottom: 12, fontSize: 12, color: 'var(--color-text-secondary)',
      }}>Block type <strong>{block.type}</strong> — no editor</div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-block-wrapper
      onPointerDownCapture={() => setActiveBlock(block.id)}
      onFocusCapture={() => setActiveBlock(block.id)}
    >
      {/* Drag handle — visible on hover (see index.css .drag-handle) */}
      <div
        {...attributes}
        {...listeners}
        className="drag-handle"
        aria-label="Drag to reorder block"
        style={{
          position: 'absolute', left: -2, top: 14,
          cursor: isDragging ? 'grabbing' : 'grab',
          color: 'var(--cf-text-tertiary, #3A5A7A)', fontSize: 15,
          padding: 2, userSelect: 'none', lineHeight: 1,
        }}
      >⠿</div>
      {/* Copy block — visible on hover (same .drag-handle reveal) */}
      <button
        className="drag-handle"
        aria-label="Copy block to clipboard"
        title="Copy block (paste in any frame)"
        onClick={() => copyBlock(block, activeFrameId)}
        style={{
          position: 'absolute', left: -3, top: 36,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--cf-text-tertiary, #3A5A7A)', fontSize: 13, padding: 2, lineHeight: 1,
        }}
      >⧉</button>
      <Block block={block} />
    </div>
  )
}

function FrameTotals({ blocks }) {
  const { body, script } = useMemo(() => {
    const texts = (blocks || []).filter(b => b.type === 'text')
    return {
      body:   texts.reduce((a, b) => a + countWords(b.data?.body || '').words, 0),
      script: texts.reduce((a, b) => a + countWords(b.data?.narrator_script || '').words, 0),
    }
  }, [blocks])
  if (!body && !script) return null
  return (
    <div style={{ marginTop: 16, padding: '8px 12px', background: 'var(--cf-input-bg, #060810)',
      border: '1px solid var(--cf-border-tertiary)', borderRadius: 6, display: 'flex', gap: 16,
      flexWrap: 'wrap', fontFamily: 'var(--forge-font, monospace)', fontSize: 9,
      color: 'var(--cf-text-tertiary)', letterSpacing: '0.04em' }}>
      <span style={{ fontWeight: 600, color: 'var(--cf-text-secondary)' }}>Frame totals</span>
      {body > 0 && <span>📄 {body} words · ~{formatTime(Math.round((body / 230) * 60))} read</span>}
      {script > 0 && <span>🎙 {script} words · ~{formatTime(Math.round((script / 150) * 60))} narrate</span>}
    </div>
  )
}

export default function FrameEditor() {
  const activeFrame   = useEditorStore(s => s.activeFrame)
  const previewOpen   = useEditorStore(s => s.previewOpen)
  const setPreviewOpen = useEditorStore(s => s.setPreviewOpen)
  const reorderBlocks = useEditorStore(s => s.reorderBlocks)
  const pasteBlock    = useEditorStore(s => s.pasteBlock)
  const copiedBlock   = useClipboardStore(s => s.copiedBlock)
  const clearClipboard = useClipboardStore(s => s.clearClipboard)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (!activeFrame) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 10, color: 'var(--color-text-secondary)',
      }}>
        <div style={{ fontSize: 32, opacity: 0.3 }}>🎞</div>
        <p style={{ fontSize: 14, margin: 0 }}>Select a frame from the sidebar</p>
        <p style={{ fontSize: 12, margin: 0, opacity: 0.6 }}>Or import a JSON project to get started</p>
      </div>
    )
  }

  const blocks = activeFrame.content?.blocks || []

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIdx = blocks.findIndex(b => b.id === active.id)
    const newIdx = blocks.findIndex(b => b.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    reorderBlocks(arrayMove(blocks, oldIdx, newIdx))
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <FrameLayout frame={activeFrame} />
        <FramePrompt frame={activeFrame} />
        <FrameNotes frame={activeFrame} />
        {copiedBlock && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px',
            background: 'color-mix(in srgb, var(--forge-amber) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--forge-amber) 25%, transparent)',
            borderRadius: 6, marginBottom: 12, fontSize: 11,
          }}>
            <span style={{ fontFamily: 'var(--forge-font)', fontSize: 9, fontWeight: 600,
              color: 'var(--forge-amber)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>clipboard</span>
            <span style={{ flex: 1, color: 'var(--cf-text-secondary)', fontSize: 11 }}>{copiedBlock.label}</span>
            <button onClick={() => pasteBlock(copiedBlock)} aria-label="Paste copied block"
              style={{ padding: '4px 12px', background: 'var(--forge-amber)', color: '#042C53',
                border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--cf-font)' }}>⧉ Paste</button>
            <button onClick={clearClipboard} aria-label="Clear clipboard"
              style={{ background: 'none', border: 'none', color: 'var(--cf-text-tertiary)', fontSize: 12, cursor: 'pointer', padding: '2px 4px' }}>✕</button>
          </div>
        )}
        {blocks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--color-text-secondary)', fontSize: 13 }}>
            No blocks yet — use the toolbar below to add content.
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            {blocks.map(block => <SortableBlock key={block.id} block={block} />)}
          </SortableContext>
        </DndContext>

        <FrameTotals blocks={blocks} />
      </div>

      <BlockToolbar />

      {previewOpen && <PreviewModal onClose={() => setPreviewOpen(false)} />}
    </div>
  )
}
