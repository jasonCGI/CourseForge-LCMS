import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import useEditorStore from '../../../store/editorStore'
import useProjectStore from '../../../store/projectStore'
import { countWords, formatTime } from '../../../utils/wordCount'
import { uploadMedia, listProjectMedia } from '../../../api/client'
import MediaUploader from './MediaUploader'

// Inline frame-link / image-swap: ONE Link mark carrying BOTH data-cf-frame
// (branch to another frame) AND data-cf-swap (swap the frame's media image to an
// asset). The publisher rewrites these anchors into real navigation / a resolved
// swap-src; here we just round-trip the attributes through the editor HTML. (A
// single mark named 'link' — TipTap allows only one mark of a given name, so both
// data attrs live on the same extension rather than two competing Link marks.)
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
      'data-cf-swap': {
        default: null,
        parseHTML: el => el.getAttribute('data-cf-swap'),
        renderHTML: attrs => (attrs['data-cf-swap']
          ? { 'data-cf-swap': attrs['data-cf-swap'] } : {}),
      },
    }
  },
  // Don't stamp target="_blank"/rel on these anchors — they're frame-nav / image-
  // swap triggers, not real outbound links, and target="_blank" makes an unhandled
  // click (in the shell/published iframe) open a blank window. href is a harmless
  // '#'; the renderers strip it.
}).configure({ openOnClick: false, autolink: false, HTMLAttributes: { target: null, rel: null } })

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
  const [pickerOpen, setPickerOpen]   = useState(false)
  const [swapOpen, setSwapOpen]       = useState(false)
  const activeProject = useProjectStore(s => s.activeProject)
  // TipTap calls scrollIntoView on selection; with the rounded overflow:hidden
  // block container that nudges the editor sideways and clips the leading glyph of
  // a wrapped line ("image" -> "mage"). Pin horizontal scroll to 0 to kill the nudge.
  const editorScrollRef = useRef(null)
  const pinScroll = () => { const el = editorScrollRef.current; if (el && el.scrollLeft) el.scrollLeft = 0 }

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

  // Insert / wrap an image-swap trigger. With a text selection → wrap it; with no
  // selection → insert the chosen image's label as the link text. data-cf-swap
  // carries the image ASSET id (the author never types it — they pick/upload an
  // image); href is a harmless placeholder (the publisher sets the real swap-src).
  const insertSwapLink = useCallback((assetId, fallbackLabel) => {
    if (!editor || !assetId) return
    const { from, to } = editor.state.selection
    const chain = editor.chain().focus()
    if (from === to) {
      const label = fallbackLabel || 'Show image'
      chain.insertContent({
        type: 'text',
        text: label,
        marks: [{ type: 'link', attrs: { href: '#', 'data-cf-swap': assetId } }],
      }).run()
    } else {
      chain.setLink({ href: '#', 'data-cf-swap': assetId }).run()
    }
    setSwapOpen(false)
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
          onClick={() => { setPickerOpen(o => !o); setSwapOpen(false) }}
          title="Insert a link that navigates to another frame"
          style={toolbarBtn}
        >
          🔗 Frame link
        </button>
        <button
          type="button"
          onClick={() => { setSwapOpen(o => !o); setPickerOpen(false) }}
          title="Mark a term that swaps the frame's image to a chosen image when clicked"
          style={toolbarBtn}
        >
          🖼 Swap image
        </button>
        {editor && editor.isActive('link', {}) &&
         (editor.getAttributes('link')['data-cf-frame'] || editor.getAttributes('link')['data-cf-swap']) && (
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetLink().run()}
            title="Remove the frame link / image-swap on the current selection"
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

      {/* Image-swap picker — choose an existing project image OR upload a new one;
          the chosen image's asset id becomes data-cf-swap (authors never type it). */}
      {swapOpen && (
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-border-tertiary)',
          background: 'var(--color-background-secondary)',
        }}>
          <SwapImagePicker projectId={activeProject?.id} onPick={insertSwapLink} />
        </div>
      )}

      {/* TipTap editor. overflowX:hidden + the onScroll pin keep a selection-driven
          scrollIntoView from shifting the text under the rounded container edge. */}
      <div ref={editorScrollRef} onScroll={pinScroll}
        style={{ padding: '12px 16px', minHeight: 80, overflowX: 'hidden' }}>
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

// Image-swap picker: pick an EXISTING project image (the swap image is then
// already bundled into any published SCO — the packager bundles every project
// image asset) or upload a NEW one. Either way the chosen image's asset id is
// handed to onPick as data-cf-swap; the author never sees or types the id.
function SwapImagePicker({ projectId, onPick }) {
  const [images, setImages]     = useState([])
  const [loading, setLoading]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError]       = useState(null)

  React.useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setLoading(true)
    listProjectMedia(projectId)
      .then(({ data }) => { if (!cancelled) setImages((data || []).filter(a => a.kind === 'image')) })
      .catch(() => { if (!cancelled) setError('Could not load project images.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId])

  const handleUpload = async (file) => {
    if (!projectId) { setError('No project selected.'); return }
    setUploading(true); setError(null)
    try {
      const { data } = await uploadMedia(file, projectId, 'image')
      setImages(imgs => [data, ...imgs])
      onPick(data.id, (data.original_name || 'image').replace(/\.[^.]+$/, ''))
    } catch (e) {
      setError(e.response?.data?.error || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>Loading images…</p>
      ) : images.length > 0 ? (
        <select
          defaultValue=""
          onChange={e => {
            const a = images.find(im => im.id === e.target.value)
            if (a) onPick(a.id, (a.original_name || 'image').replace(/\.[^.]+$/, ''))
          }}
          style={{
            fontSize: 12, padding: '6px 8px',
            border: '1px solid var(--color-border-tertiary)', borderRadius: 5,
            background: 'var(--color-background-primary)', color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <option value="" disabled>— pick a project image to show on click —</option>
          {images.map(a => (
            <option key={a.id} value={a.id}>{a.original_name || a.id}</option>
          ))}
        </select>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
          No project images yet — upload one below.
        </p>
      )}
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary, #7a7a90)' }}>or upload a new image:</div>
      <MediaUploader
        accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] }}
        label="Drop an image to use as the swap target"
        onUpload={handleUpload}
        uploading={uploading}
        error={error}
      />
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
