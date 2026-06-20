import React, { useCallback, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import useEditorStore from '../../../store/editorStore'
import { countWords, formatTime } from '../../../utils/wordCount'

export default function TextBlock({ block }) {
  const updateBlock = useEditorStore(s => s.updateBlock)
  const removeBlock = useEditorStore(s => s.removeBlock)
  const moveBlock   = useEditorStore(s => s.moveBlock)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write content here…' }),
    ],
    content: block.data.body || '',
    onUpdate: ({ editor }) => {
      updateBlock(block.id, { body: editor.getHTML() })
    },
  })

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
