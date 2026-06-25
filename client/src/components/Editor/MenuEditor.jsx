import React, { useMemo } from 'react'
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
  const activeFrame    = useEditorStore(s => s.activeFrame)
  const setMenuTitle   = useEditorStore(s => s.setMenuTitle)
  const addMenuItem    = useEditorStore(s => s.addMenuItem)
  const updateMenuItem = useEditorStore(s => s.updateMenuItem)
  const removeMenuItem = useEditorStore(s => s.removeMenuItem)
  const moveMenuItem   = useEditorStore(s => s.moveMenuItem)
  const activeProject  = useProjectStore(s => s.activeProject)

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

        <label style={fieldLabel}>Menu title (optional)</label>
        <input
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
          {items.map((it, i) => {
            const value = it.target_id ? `${it.target_kind || 'frame'}:${it.target_id}` : ''
            return (
              <div key={it.id} style={itemCard}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 2 }}>
                  <button onClick={() => moveMenuItem(it.id, 'up')}   disabled={i === 0}
                    aria-label="Move item up" style={iconBtn(i === 0)}>▲</button>
                  <button onClick={() => moveMenuItem(it.id, 'down')} disabled={i === items.length - 1}
                    aria-label="Move item down" style={iconBtn(i === items.length - 1)}>▼</button>
                </div>
                <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                  <div>
                    <label style={fieldLabel}>Label</label>
                    <input
                      value={it.label || ''}
                      onChange={e => updateMenuItem(it.id, { label: e.target.value })}
                      placeholder="Button label"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={fieldLabel}>Target</label>
                    <select value={value} onChange={e => onTargetChange(it.id, e.target.value)} style={selectStyle}>
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
          })}
        </div>
      </div>

      <div style={{ padding: 14, borderTop: '1px solid var(--cf-border-tertiary)', background: 'var(--cf-input-bg, #060810)' }}>
        <button onClick={addMenuItem} style={addBtn}>+ Add menu item</button>
      </div>
    </div>
  )
}

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
