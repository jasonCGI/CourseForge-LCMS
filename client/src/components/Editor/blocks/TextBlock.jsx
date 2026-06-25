import React, { useCallback, useMemo, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import useEditorStore from '../../../store/editorStore'
import useProjectStore from '../../../store/projectStore'
import { countWords, formatTime } from '../../../utils/wordCount'

// Inline frame-link: a Link mark that ALSO carries data-cf-frame="<frameId>" so an
// author can branch to another frame from inside body text. The publisher rewrites
// these anchors into real in-course navigation (the branch block's frame_id→href
// resolver); here we just need the attribute to round-trip through the editor HTML.
const FrameLink = Link.extend({
  name: 'link',
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-cf-frame': {
        default: null,
        parseHTML: el => el.getAttribute('data-cf-frame'),
        renderHTML: attrs => (attrs['data-cf-frame']
          ? { 'data-cf-frame': attrs['data-cf-frame'] } : {}),
      },
    }
  },
}).configure({ openOnClick: false, autolink: false })

// Flatten the active project tree to a frame-picker list (id + readable path).
// Mirrors BranchBlock's picker so authors never hand-type a frame UUID.
function useProjectFrames() {
  const activeProject = useProjectStore(s => s.activeProject)
  return useMemo(() => {
    const out = []
    for (const course of activeProject?.courses || [])
      for (const mod of course.modules || [])
        for (const lesson of mod.lessons || [])
          for (const frame of lesson.frames || [])
            out.push({ id: frame.id, label: `${course.name} › ${mod.name} › ${lesson.name} › ${frame.name}` })
    return out
  }, [activeProject])
}

export default function TextBlock({ block }) {
  const updateBlock = useEditorStore(s => s.updateBlock)
  const removeBlock = useEditorStore(s => s.removeBlock)
  const moveBlock   = useEditorStore(s => s.moveBlock)
  const frames      = useProjectFrames()
  const [pickerOpen, setPickerOpen] = useState(false)

  const editor = useEditor({
    extensions: [
      // StarterKit ships a Link mark; disable it so our FrameLink (with the
      // data-cf-frame attribute) is the single link mark — no duplicate-name clash.
      StarterKit.configure({ link: false }),
      Placeholder.configure({ placeholder: 'Write content here…' }),
      FrameLink,
    ],
    content: block.data.body || '',
    onUpdate: ({ editor }) => {
      updateBlock(block.id, { body: editor.getHTML() })
    },
  })

  // Insert / wrap a frame-link. With a text selection → wrap it; with no selection
  // → insert the picked frame's path label as the link text. data-cf-frame carries
  // the target; href is a harmless placeholder (the publisher sets the real href).
  const insertFrameLink = useCallback((frameId, fallbackLabel) => {
    if (!editor || !frameId) return
    const { from, to } = editor.state.selection
    const chain = editor.chain().focus()
    if (from === to) {
      const label = fallbackLabel || 'Go to frame'
      chain.insertContent({
        type: 'text',
        text: label,
        marks: [{ type: 'link', attrs: { href: '#', 'data-cf-frame': frameId } }],
      }).run()
    } else {
      chain.setLink({ href: '#', 'data-cf-frame': frameId }).run()
    }
    setPickerOpen(false)
  }, [editor])

  const hasSelection = editor && editor.state.selection.from !== editor.state.selection.to

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '1px solid var(--color-border-tertiary)',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      {/* Block header */}
      <BlockHeader
        label="Text"
        color="#185FA5"
        blockId={block.id}
        onRemove={removeBlock}
        onMove={moveBlock}
      />

      {/* Mini toolbar — currently just the frame-link inserter (reuses the branch
          frame picker so the author never hand-types a UUID). */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px',
        borderBottom: '1px solid var(--color-border-tertiary)',
        background: 'var(--color-background-secondary)',
      }}>
        <button
          type="button"
          onClick={() => setPickerOpen(o => !o)}
          title="Insert a link that navigates to another frame"
          style={toolbarBtn}
        >
          🔗 Frame link
        </button>
        {editor && editor.isActive('link', {}) && editor.getAttributes('link')['data-cf-frame'] && (
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetLink().run()}
            title="Remove the frame link on the current selection"
            style={{ ...toolbarBtn, color: '#E24B4A' }}
          >
            ✕ Unlink
          </button>
        )}
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary, #7a7a90)' }}>
          {hasSelection ? 'wraps the selected text' : 'inserts a labeled link'}
        </span>
      </div>

      {/* Frame picker dropdown */}
      {pickerOpen && (
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-border-tertiary)',
          background: 'var(--color-background-secondary)',
        }}>
          {frames.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
              No frames in this project yet.
            </p>
          ) : (
            <FramePickerSelect frames={frames} onPick={insertFrameLink} />
          )}
        </div>
      )}

      {/* TipTap editor */}
      <div style={{ padding: '12px 16px', minHeight: 80 }}>
        <EditorContent editor={editor} />
      </div>

      {/* Body word count (narration script field removed — narration lives on
          audio/video blocks, not text). */}
      <div style={{
        borderTop: '1px solid var(--color-border-tertiary)',
        padding: '8px 16px',
        background: 'var(--color-background-secondary)',
      }}>
        <WordCount body={block.data.body} />
      </div>
    </div>
  )
}

// Frame picker: a select of every frame in the project. Picking inserts/wraps the
// frame-link immediately (the readable path is the default link text).
function FramePickerSelect({ frames, onPick }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select
        defaultValue=""
        onChange={e => {
          const f = frames.find(fr => fr.id === e.target.value)
          if (f) onPick(f.id, (f.label.split('›').pop() || '').trim())
        }}
        style={{
          flex: 1, fontSize: 12, padding: '6px 8px',
          border: '1px solid var(--color-border-tertiary)', borderRadius: 5,
          background: 'var(--color-background-primary)', color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <option value="" disabled>— pick a target frame —</option>
        {frames.map(f => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
      </select>
    </div>
  )
}

function WordCount({ body, script }) {
  const b = useMemo(() => countWords(body), [body])
  const s = useMemo(() => countWords(script), [script])
  if (!b.words && !s.words) return null
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap',
      fontFamily: 'var(--forge-font, monospace)', fontSize: 9,
      color: 'var(--cf-text-tertiary, #7a7a90)', letterSpacing: '0.04em' }}>
      {b.words > 0 && <span title="On-screen text — estimated read time">📄 {b.words}w · ~{formatTime(b.readSeconds)} read</span>}
      {s.words > 0 && <span title="Narrator script — estimated narration time">🎙 {s.words}w · ~{formatTime(s.narrateSeconds)} narrate</span>}
    </div>
  )
}

// Shared block header component — used by all block types
export function BlockHeader({ label, color, blockId, onRemove, onMove }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'var(--color-background-secondary)',
      borderBottom: '1px solid var(--color-border-tertiary)',
    }}>
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: color || '#185FA5',
        flex: 1,
      }}>
        {label}
      </span>
      <button onClick={() => onMove(blockId, 'up')}   aria-label="Move block up"   title="Move up"   style={btnStyle}>↑</button>
      <button onClick={() => onMove(blockId, 'down')} aria-label="Move block down" title="Move down" style={btnStyle}>↓</button>
      <button onClick={() => onRemove(blockId)}       aria-label="Remove block"    title="Remove"    style={{ ...btnStyle, color: '#E24B4A' }}>✕</button>
    </div>
  )
}

const btnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  color: 'var(--color-text-secondary)',
  padding: '2px 6px',
  borderRadius: 3,
  fontFamily: 'var(--font-sans)',
}

const toolbarBtn = {
  background: 'var(--color-background-primary)',
  border: '1px solid var(--color-border-tertiary)',
  borderRadius: 5,
  cursor: 'pointer',
  fontSize: 12,
  color: 'var(--color-text-primary)',
  padding: '4px 10px',
  fontFamily: 'var(--font-sans)',
  fontWeight: 600,
}
