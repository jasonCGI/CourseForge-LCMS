import React, { useMemo, useState, lazy, Suspense } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, useDraggable, useDroppable, MeasuringStrategy,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useEditorStore, { PRIMARY_TYPES, MEDIA_TYPES, resolveExclusivity } from '../../store/editorStore'
import useClipboardStore from '../../store/clipboardStore'
import { BLOCK_TYPES } from './BlockToolbar'
import { countWords, formatTime } from '../../utils/wordCount'
import FrameNotes from './FrameNotes'
import FramePrompt from './FramePrompt'
import FrameLayout from './FrameLayout'
import BlockToolbar from './BlockToolbar'
import MediaBlock from './blocks/MediaBlock'
import QuizBlock from './blocks/QuizBlock'
import HotspotBlock from './blocks/HotspotBlock'
import BranchBlock from './blocks/BranchBlock'
import WCNBlock from './blocks/WCNBlock'
// Heavy / less-common block editors, code-split so they don't weigh down first
// paint: TextBlock pulls @tiptap (the ~396KB editor chunk); 3D/iVideo/OAM/GUI are
// bulky and rarely the first frame opened. Rendered inside <Suspense> below.
const TextBlock    = lazy(() => import('./blocks/TextBlock'))
const OamBlock     = lazy(() => import('./blocks/OamBlock'))
const IVideoBlock  = lazy(() => import('./blocks/IVideoBlock'))
const Model3DBlock = lazy(() => import('./blocks/Model3DBlock'))
const GUIBlock     = lazy(() => import('./blocks/GUIBlock'))
import MenuEditor from './MenuEditor'
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
      <Suspense fallback={<div style={{ padding: '16px', fontSize: 12, color: 'var(--color-text-secondary)' }}>Loading block…</div>}>
        <Block block={block} />
      </Suspense>
    </div>
  )
}

// ── Drag-to-add quick-block ────────────────────────────────────────────────
// A draggable chip per block type (reuses BLOCK_TYPES icon/label/color). Dragging
// a chip onto a gap in the block list inserts that block at that position; a plain
// click appends (keyboard parity — native button Enter/Space). Blocked types
// (layout exclusivity) are greyed and non-draggable, mirroring the + Add block
// popover. Lives inside FrameEditor's DndContext so chips + gaps share it.
function BlockChip({ chip }) {
  const addBlock = useEditorStore(s => s.addBlock)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `chip-${chip.type}`,
    data: { kind: 'chip', type: chip.type },
    disabled: !chip.enabled,
  })
  // Keep pointer-drag listeners but route keyboard to a plain append (so a focused
  // chip is operable from the keyboard without fighting the dnd keyboard sensor;
  // the fully keyboard-accessible path remains the + Add block popover).
  const onKeyDown = (e) => {
    if (!chip.enabled) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addBlock(chip.type) }
  }
  const Icon = chip.Icon
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={() => chip.enabled && addBlock(chip.type)}
      disabled={!chip.enabled}
      aria-label={chip.enabled ? `Add ${chip.label} block (drag to position, or click to append)` : `${chip.label} — ${chip.reason}`}
      title={chip.enabled ? `Drag onto the frame to add a ${chip.label} block (click = append)` : chip.reason || ''}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
        fontFamily: 'var(--cf-font)', whiteSpace: 'nowrap',
        background: chip.enabled ? 'var(--cf-block-bg, #0d1017)' : 'transparent',
        border: `1px solid ${chip.enabled ? 'var(--cf-border-secondary, #3a3a5a)' : 'var(--cf-border-tertiary, rgba(255,255,255,0.08))'}`,
        color: chip.enabled ? 'var(--cf-text-primary, #E0E8F0)' : 'var(--cf-text-tertiary, #5a6a80)',
        cursor: chip.enabled ? (isDragging ? 'grabbing' : 'grab') : 'not-allowed',
        opacity: isDragging ? 0.4 : (chip.enabled ? 1 : 0.5),
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        userSelect: 'none', touchAction: 'none',
      }}
    >
      {Icon && (
        <span aria-hidden="true" style={{ color: chip.enabled ? chip.color : 'inherit', display: 'inline-flex', flexShrink: 0 }}>
          <Icon width={13} height={13} />
        </span>
      )}
      <span>{chip.label}</span>
    </button>
  )
}

// The horizontal "Drag to add" chip rail shown above the toolbar. Resolves each
// chip's enabled state from the frame's layout exclusivity (same rule the popover
// uses) so blocked types can't be dragged in.
function QuickAddRail({ frame }) {
  const ex = resolveExclusivity(frame)
  const chips = BLOCK_TYPES.map(b => {
    const isPrimary = PRIMARY_TYPES.includes(b.type)
    const isMedia   = MEDIA_TYPES.includes(b.type)
    const blocked   = (isPrimary && ex.primaryBlocked) || (isMedia && ex.mediaBlocked)
    const enabled   = b.available && !blocked
    const reason    = !b.available ? 'Available in Sprint 4'
      : blocked ? (ex.reason || (isPrimary ? ex.primaryReason : ex.mediaReason)) : null
    return { ...b, enabled, reason }
  })
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px',
      borderTop: '1px solid var(--color-border-tertiary)',
      background: 'var(--color-background-secondary)', overflowX: 'auto',
    }}>
      <span aria-hidden="true" style={{
        flexShrink: 0, fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--cf-text-tertiary)', fontFamily: 'var(--forge-font)',
      }}>⠿ Drag to add</span>
      {chips.map(c => <BlockChip key={c.type} chip={c} />)}
    </div>
  )
}

// A drop slot between blocks (insertion point) for the chip drag. Only rendered
// while a chip is being dragged; shows an amber insertion line when hovered.
function GapDrop({ index }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap-${index}`, data: { kind: 'gap', index } })
  return (
    <div ref={setNodeRef} style={{
      height: isOver ? 22 : 10, margin: '1px 0', borderRadius: 5,
      border: `2px dashed ${isOver ? 'var(--forge-amber)' : 'transparent'}`,
      background: isOver ? 'color-mix(in srgb, var(--forge-amber) 14%, transparent)' : 'transparent',
      transition: 'height 0.1s, background 0.1s',
    }} />
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
  const addBlock      = useEditorStore(s => s.addBlock)
  const pasteBlock    = useEditorStore(s => s.pasteBlock)
  const copiedBlock   = useClipboardStore(s => s.copiedBlock)
  const clearClipboard = useClipboardStore(s => s.clearClipboard)

  // Non-null while a quick-add chip is being dragged (holds the block type). Drives
  // the insertion-gap dropzones, which only exist during a chip drag so they never
  // interfere with block-reorder collision detection.
  const [draggingChip, setDraggingChip] = useState(null)

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

  // Menu frame: show the Menu editor (items + targets) instead of the block palette.
  if (activeFrame.frame_type === 'menu') {
    return <MenuEditor />
  }

  const blocks = activeFrame.content?.blocks || []

  const handleDragStart = ({ active }) => {
    if (active.data.current?.kind === 'chip') setDraggingChip(active.data.current.type)
  }

  const handleDragEnd = ({ active, over }) => {
    setDraggingChip(null)
    if (!over) return
    // Quick-add chip → insert a new block at the resolved position.
    if (active.data.current?.kind === 'chip') {
      const type = active.data.current.type
      let index
      if (over.data.current?.kind === 'gap') index = over.data.current.index
      else {
        const bi = blocks.findIndex(b => b.id === over.id)
        index = bi < 0 ? blocks.length : bi   // over a block → insert before it
      }
      addBlock(type, index)   // store re-checks exclusivity as a guard
      return
    }
    // Otherwise a block reorder.
    if (active.id === over.id) return
    const oldIdx = blocks.findIndex(b => b.id === active.id)
    const newIdx = blocks.findIndex(b => b.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    reorderBlocks(arrayMove(blocks, oldIdx, newIdx))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingChip(null)}
    >
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
          draggingChip ? (
            <GapDrop index={0} />
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--color-text-secondary)', fontSize: 13 }}>
              No blocks yet — use the toolbar below to add content, or drag a block from the rail.
            </div>
          )
        )}
        <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          {draggingChip && blocks.length > 0 && <GapDrop index={0} />}
          {blocks.map((block, i) => (
            <React.Fragment key={block.id}>
              <SortableBlock block={block} />
              {draggingChip && <GapDrop index={i + 1} />}
            </React.Fragment>
          ))}
        </SortableContext>

        <FrameTotals blocks={blocks} />
      </div>

      <QuickAddRail frame={activeFrame} />
      <BlockToolbar />

      {previewOpen && <PreviewModal onClose={() => setPreviewOpen(false)} />}
    </div>
    </DndContext>
  )
}
