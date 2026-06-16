import { useEffect } from 'react'
import useEditorStore from '../store/editorStore'
import useClipboardStore from '../store/clipboardStore'

/**
 * Global keyboard shortcuts. Mount once in App.jsx.
 *
 *   Ctrl/Cmd + S   → flush autosave
 *   Ctrl/Cmd + P   → open preview
 *   Ctrl/Cmd + D   → duplicate active block
 *   Ctrl/Cmd + Z   → undo last block change
 *   Ctrl/Cmd + ↑/↓ → move active block up/down
 *   Escape         → close modal
 *   ?              → shortcut help
 *
 * Block ops read straight from the editor store (active block + actions);
 * the host passes callbacks for the modal/help/preview/save side.
 */
export function useKeyboardShortcuts({ onSave, onPreview, onCloseModal, onShowHelp }) {
  useEffect(() => {
    const handler = (e) => {
      const mod = e.ctrlKey || e.metaKey
      const tag = document.activeElement?.tagName?.toLowerCase()
      const isTyping = tag === 'input' || tag === 'textarea' ||
        document.activeElement?.isContentEditable

      if (e.key === 'Escape') {
        onCloseModal?.()
        return
      }

      if (e.key === '?' && !isTyping && !mod) {
        e.preventDefault()
        onShowHelp?.()
        return
      }

      if (!mod) return

      const st = useEditorStore.getState()
      const activeId = st.activeBlockId

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault()
          onSave?.()
          break
        case 'p':
          if (!isTyping) { e.preventDefault(); onPreview?.() }
          break
        case 'd':
          if (!isTyping && activeId) { e.preventDefault(); st.duplicateBlock(activeId) }
          break
        case 'z':
          if (!isTyping) { e.preventDefault(); st.undo() }
          break
        case 'v': {
          const cb = useClipboardStore.getState().copiedBlock
          if (!isTyping && cb) { e.preventDefault(); st.pasteBlock(cb) }
          break
        }
        case 'arrowup':
          if (!isTyping && activeId) { e.preventDefault(); st.moveBlock(activeId, 'up') }
          break
        case 'arrowdown':
          if (!isTyping && activeId) { e.preventDefault(); st.moveBlock(activeId, 'down') }
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSave, onPreview, onCloseModal, onShowHelp])
}
