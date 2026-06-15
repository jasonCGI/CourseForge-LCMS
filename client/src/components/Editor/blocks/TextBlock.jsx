import React, { useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import useEditorStore from '../../../store/editorStore'

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

  const handleNarration = useCallback(e => {
    updateBlock(block.id, { narrator_script: e.target.value })
  }, [block.id, updateBlock])

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

      {/* Narration script field */}
      <div style={{
        borderTop: '1px solid var(--color-border-tertiary)',
        padding: '10px 16px',
        background: 'var(--color-background-secondary)',
      }}>
        <label style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          letterSpacing: '0.08em',
          marginBottom: 6,
          textTransform: 'uppercase',
        }}>
          Narration script
        </label>
        <textarea
          value={block.data.narrator_script || ''}
          onChange={handleNarration}
          rows={3}
          placeholder="Narrator reads this aloud…"
          style={{
            width: '100%',
            background: 'var(--color-background-primary)',
            border: '1px solid var(--color-border-tertiary)',
            borderRadius: 4,
            padding: '8px 10px',
            fontSize: 13,
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-sans)',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>
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
