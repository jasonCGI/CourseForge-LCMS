import { create } from 'zustand'
import { getFrame, updateFrame } from '../api/client'

let autosaveTimer = null
const AUTOSAVE_DELAY = 1200

const useEditorStore = create((set, get) => ({
  // State
  activeFrame: null,
  originalFrame: null,
  isDirty: false,
  isSaving: false,
  lastSaved: null,
  saveError: null,

  // Load a frame by ID
  loadFrame: async (frameId) => {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    set({ activeFrame: null, isDirty: false, saveError: null })
    try {
      const { data } = await getFrame(frameId)
      set({ activeFrame: data, originalFrame: data, isDirty: false })
    } catch (e) {
      set({ saveError: e.message })
    }
  },

  // Update a single block inside the active frame content
  updateBlock: (blockId, newData) => {
    const { activeFrame } = get()
    if (!activeFrame) return

    const updatedBlocks = activeFrame.content.blocks.map(b =>
      b.id === blockId ? { ...b, data: { ...b.data, ...newData } } : b
    )
    const updatedFrame = {
      ...activeFrame,
      content: { ...activeFrame.content, blocks: updatedBlocks }
    }
    set({ activeFrame: updatedFrame, isDirty: true })
    get()._scheduleAutosave()
  },

  // Add a new block
  addBlock: (type) => {
    const { activeFrame } = get()
    if (!activeFrame) return

    const newBlock = _makeBlock(type)
    const updatedFrame = {
      ...activeFrame,
      content: {
        ...activeFrame.content,
        blocks: [...activeFrame.content.blocks, newBlock]
      }
    }
    set({ activeFrame: updatedFrame, isDirty: true })
    get()._scheduleAutosave()
  },

  // Remove a block
  removeBlock: (blockId) => {
    const { activeFrame } = get()
    if (!activeFrame) return

    const updatedFrame = {
      ...activeFrame,
      content: {
        ...activeFrame.content,
        blocks: activeFrame.content.blocks.filter(b => b.id !== blockId)
      }
    }
    set({ activeFrame: updatedFrame, isDirty: true })
    get()._scheduleAutosave()
  },

  // Move block up or down
  moveBlock: (blockId, direction) => {
    const { activeFrame } = get()
    if (!activeFrame) return
    const blocks = [...activeFrame.content.blocks]
    const idx = blocks.findIndex(b => b.id === blockId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= blocks.length) return
    ;[blocks[idx], blocks[swapIdx]] = [blocks[swapIdx], blocks[idx]]
    set({
      activeFrame: { ...activeFrame, content: { ...activeFrame.content, blocks } },
      isDirty: true
    })
    get()._scheduleAutosave()
  },

  // Update frame name
  updateFrameName: (name) => {
    const { activeFrame } = get()
    if (!activeFrame) return
    set({ activeFrame: { ...activeFrame, name }, isDirty: true })
    get()._scheduleAutosave()
  },

  // Manual save
  save: async () => {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    await get()._doSave()
  },

  // Internal: schedule autosave
  _scheduleAutosave: () => {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => get()._doSave(), AUTOSAVE_DELAY)
  },

  // Internal: perform save
  _doSave: async () => {
    const { activeFrame } = get()
    if (!activeFrame) return
    set({ isSaving: true, saveError: null })
    try {
      await updateFrame(activeFrame.id, {
        name: activeFrame.name,
        content: activeFrame.content
      })
      set({ isDirty: false, isSaving: false, lastSaved: new Date() })
    } catch (e) {
      set({ isSaving: false, saveError: e.message })
    }
  },
}))

// Block factory
function _makeBlock(type) {
  const id = crypto.randomUUID()
  const defaults = {
    text:  { body: '', narrator_script: '' },
    media: { kind: 'image', placeholder_label: '', asset_id: null, caption: '' },
    quiz:  { question: '', choices: ['', '', '', ''], correct_index: 0, feedback_correct: '', feedback_incorrect: '' },
    hotspot: { image_id: null, regions: [] },
    branch:  { condition: '', true_frame_id: null, false_frame_id: null, true_label: 'Yes', false_label: 'No' },
    oam:   { oam_asset_id: null, width: 800, height: 600, responsive: false, scorm_bridge_enabled: false, caption: '' },
    wcn:   { wcn_type: 'note', title: '', text: '', modal: false, ack_label: 'I understand — proceed' },
    ivideo: { video_asset_id: null, clip_asset_id: null, video_filename: null, video_serve_url: null, interaction_count: null, video_duration: null, caption: '' },
    model3d: { model_asset_id: null, model_filename: null, model_serve_url: null, file_size_mb: null, viewer_height: 400, bg_color: '#0d1017', caption: '', annotations: [] },
  }
  return { id, type, data: defaults[type] || {} }
}

export default useEditorStore
