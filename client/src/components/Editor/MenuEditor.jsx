import React, { useMemo } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useEditorStore from '../../store/editorStore'
import useProjectStore from '../../store/projectStore'

/**
 * MenuEditor — the authoring UI for a Menu Frame (frame_type 'menu').
 *
 * Shown by FrameEditor instead of the block palette when the active frame is a
 * menu frame. The author sets an optional title and a reorderable list of items;
 * each item has a label and a target picker that chooses a FRAME or a
 * LESSON/MODULE (topic) from the project tree. A topic target resolves at render
 * time to that section's first frame (see server/services/menu_frame.py).
 *
 * Writes to content.menu via the editor store (rides the existing content
 * autosave — no schema change).
 */
export default function MenuEditor() {
  const activeFrame       = useEditorStore(s => s.activeFrame)
  const setMenuTitle      = useEditorStore(s => s.setMenuTitle)
  const addMenuItem       = useEditorStore(s => s.addMenuItem)
  const updateMenuItem    = useEditorStore(s => s.updateMenuItem)
  const removeMenuItem    = useEditorStore(s => s.removeMenuItem)
  const reorderMenuItems  = useEditorStore(s => s.reorderMenuItems)
  const activeProject     = useProjectStore(s => s.activeProject)

  // Pointer drag to reorder, plus the dnd-kit keyboard sensor so a focused grab
  // handle can be operated with Space + arrow keys (508 / keyboard parity with
  // the content tree and block list).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Build the grouped target picker options from the project tree: frames,
  // plus lesson/module "topic" targets (resolve to the section's first frame).
  const targets = useMemo(() => {
    const frames = [], lessons = [], modules = []
    for (const course of activeProject?.courses || []) {
      for (const mod of course.modules || []) {
        modules.push({ id: mod.id, label: `${course.name} › ${mod.name}` })
        for (const lesson of mod.lessons || []) {
          lessons.push({ id: lesson.id, label: `${course.name} › ${mod.name} › ${lesson.name}` })
          for (const frame of lesson.frames || []) {
            if (frame.id === activeFrame?.id) continue   // a menu can't point at itself
            frames.push({ id: frame.id, label: `${lesson.name} › ${frame.name}` })
          }
        }
      }
    }
    return { frames, lessons, modules }
  }, [activeProject, activeFrame?.id])

  const menu  = activeFrame?.content?.menu || {}
  const items = Array.isArray(menu.items) ? menu.items : []

  // Encode kind+id into one <select> value so the picker can span three groups.
  const onTargetChange = (itemId, value) => {
    if (!value) { updateMenuItem(itemId, { target_kind: 'frame', target_id: '' }); return }
    const [kind, id] = value.split(':')
    updateMenuItem(itemId, { target_kind: kind, target_id: id })
  }

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIdx = items.findIndex(it => it.id === active.id)
    const newIdx = items.findIndex(it => it.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    reorderMenuItems(arrayMove(items, oldIdx, newIdx))
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ marginBottom: 18 }}>
          <div style={badge}>MENU FRAME</div>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '8px 0 0' }}>
            Navigation frame. Each item is a button that jumps to a frame or a topic
            (a topic opens that lesson/module's first frame). Nested menus = a menu
            item that points at another menu frame.
          </p>
        </div>

        <label htmlFor="menu-title" style={fieldLabel}>Menu title (optional)</label>
        <input
          id="menu-title"
          value={menu.title || ''}
          onChange={e => setMenuTitle(e.target.value)}
          placeholder="e.g. Course Menu"
          style={{ ...inputStyle, marginBottom: 20 }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.length === 0 && (
            <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--color-text-secondary)', fontSize: 13 }}>
              No menu items yet — add one below.
            </div>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(it => it.id)} strategy={verticalListSortingStrategy}>
              {items.map(it => (
                <SortableMenuItem
                  key={it.id}
                  it={it}
                  targets={targets}
                  updateMenuItem={updateMenuItem}
                  removeMenuItem={removeMenuItem}
                  onTargetChange={onTargetChange}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <div style={{ padding: 14, borderTop: '1px solid var(--cf-border-tertiary)', background: 'var(--cf-input-bg, #060810)' }}>
        <button onClick={addMenuItem} style={addBtn}>+ Add menu item</button>
      </div>
    </div>
  )
}

// One reorderable menu-item row. The grab handle carries the dnd-kit sortable
// listeners/attributes (pointer drag + Space/arrow keyboard reorder); the form
// fields stay fully interactive (handle is the only drag origin).
function SortableMenuItem({ it, targets, updateMenuItem, removeMenuItem, onTargetChange }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: it.id })
  const value = it.target_id ? `${it.target_kind || 'frame'}:${it.target_id}` : ''
  const style = {
    ...itemCard,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : 'auto',
  }
  return (
    <div ref={setNodeRef} style={style}>
      <button
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${it.label || 'menu item'} (or press Space, then use arrow keys)`}
        title="Drag to reorder"
        style={dragHandle(isDragging)}
      >⠿</button>
      <div style={{ flex: 1, display: 'grid', gap: 8 }}>
        <div>
          <label htmlFor={`menu-item-label-${it.id}`} style={fieldLabel}>Label</label>
          <input
            id={`menu-item-label-${it.id}`}
            value={it.label || ''}
            onChange={e => updateMenuItem(it.id, { label: e.target.value })}
            placeholder="Button label"
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor={`menu-item-target-${it.id}`} style={fieldLabel}>Target</label>
          <select id={`menu-item-target-${it.id}`} value={value} onChange={e => onTargetChange(it.id, e.target.value)} style={selectStyle}>
            <option value="">— select target —</option>
            <optgroup label="Frames">
              {targets.frames.map(f => <option key={f.id} value={`frame:${f.id}`}>{f.label}</option>)}
            </optgroup>
            <optgroup label="Lessons (topic → first frame)">
              {targets.lessons.map(l => <option key={l.id} value={`lesson:${l.id}`}>{l.label}</option>)}
            </optgroup>
            <optgroup label="Modules (topic → first frame)">
              {targets.modules.map(m => <option key={m.id} value={`module:${m.id}`}>{m.label}</option>)}
            </optgroup>
          </select>
        </div>
      </div>
      <button onClick={() => removeMenuItem(it.id)} aria-label="Remove item"
        style={{ ...iconBtn(false), color: '#E87070', alignSelf: 'flex-start' }}>✕</button>
    </div>
  )
}

const dragHandle = (isDragging) => ({
  alignSelf: 'flex-start', marginTop: 2,
  background: 'none', border: '1px solid var(--cf-border-secondary, #3a3a5a)', borderRadius: 4,
  color: 'var(--cf-text-secondary, #9aa7b6)', fontSize: 14, lineHeight: 1,
  cursor: isDragging ? 'grabbing' : 'grab', padding: '4px 6px', userSelect: 'none', touchAction: 'none',
})

const badge = {
  display: 'inline-block', fontFamily: 'var(--forge-font)', fontSize: 9, fontWeight: 600,
  letterSpacing: '0.08em', color: 'var(--forge-amber)', padding: '2px 8px', borderRadius: 3,
  background: 'color-mix(in srgb, var(--forge-amber) 14%, transparent)',
  border: '1px solid color-mix(in srgb, var(--forge-amber) 30%, transparent)',
}
const fieldLabel = {
  display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--color-text-secondary)', marginBottom: 4,
  fontFamily: 'var(--forge-font)',
}
const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13,
  background: 'var(--cf-input-bg, #060810)', border: '1px solid var(--cf-input-border, #3a3a5a)',
  borderRadius: 5, color: 'var(--cf-input-text, #e6e6ea)', fontFamily: 'var(--cf-font)',
}
const selectStyle = { ...inputStyle, cursor: 'pointer' }
const itemCard = {
  display: 'flex', gap: 10, padding: 12, borderRadius: 8,
  background: 'var(--cf-block-bg, #0d1017)', border: '1px solid var(--cf-border-secondary, #3a3a5a)',
}
const iconBtn = (disabled) => ({
  background: 'none', border: '1px solid var(--cf-border-secondary, #3a3a5a)', borderRadius: 4,
  color: disabled ? 'var(--cf-text-tertiary)' : 'var(--cf-text-secondary)', fontSize: 9,
  cursor: disabled ? 'not-allowed' : 'pointer', padding: '3px 5px', opacity: disabled ? 0.4 : 1, lineHeight: 1,
})
const addBtn = {
  width: '100%', padding: '9px 16px', background: 'var(--forge-amber)', color: '#042C53',
  border: 'none', borderRadius: 5, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--cf-font)',
}
