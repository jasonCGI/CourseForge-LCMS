import { create } from 'zustand'
import { getFrame, updateFrame } from '../api/client'

let autosaveTimer = null
let saveStatusTimer = null
const AUTOSAVE_DELAY = 1200

// Inspector dock orientation — global default persisted in localStorage
// (mirrors the cf-inspector-mode pattern in InspectorPane). 'bottom' = vertical
// split (preview top / inspector below); 'right' = horizontal (preview left /
// inspector right). Per-frame overrides live in-memory in the store.
const DOCK_KEY = 'cf-inspector-dock'
// Four dock positions: 'left'/'right' = horizontal split, 'top'/'bottom' = vertical.
const _DOCKS = ['left', 'right', 'top', 'bottom']
function _readDockDefault() {
  try {
    const v = localStorage.getItem(DOCK_KEY)
    return _DOCKS.includes(v) ? v : 'bottom'
  } catch { return 'bottom' }
}

const useEditorStore = create((set, get) => ({
  // State
  activeFrame: null,
  originalFrame: null,
  isDirty: false,
  isSaving: false,
  lastSaved: null,
  saveError: null,
  activeBlockId: null,        // last-focused/clicked block (for keyboard shortcuts)
  previewOpen: false,         // preview modal flag (so global shortcuts can open it)
  _undoStack: [],             // snapshots of blocks arrays (most recent first)
  saveStatus: 'idle',         // 'idle' | 'saving' | 'saved' | 'error' (header indicator)
  selectedNode: null,         // {type:'project'|'frame', id} — drives the context-sensitive right panel

  // ── Inspector dock orientation ──────────────────────────────────────────
  inspectorDockDefault: _readDockDefault(),  // global carry-over default
  inspectorDockByFrame: {},                  // per-frame overrides, keyed by frame id

  // Resolve the orientation for a frame: explicit per-frame override wins,
  // else the global default. Pass a frame id (defaults to the active frame).
  resolveDock: (frameId) => {
    const id = frameId ?? get().activeFrame?.id
    const override = id != null ? get().inspectorDockByFrame[id] : undefined
    return override || get().inspectorDockDefault
  },

  // Set the CURRENT frame's orientation AND update the global default so the
  // choice carries over to subsequent un-overridden frames. Frames with an
  // explicit override keep it even when the global later changes.
  setInspectorDock: (orientation) => {
    const o = _DOCKS.includes(orientation) ? orientation : 'bottom'
    const id = get().activeFrame?.id
    set(s => ({
      inspectorDockDefault: o,
      inspectorDockByFrame: id != null
        ? { ...s.inspectorDockByFrame, [id]: o }
        : s.inspectorDockByFrame,
    }))
    try { localStorage.setItem(DOCK_KEY, o) } catch {}
  },

  // Load a frame by ID
  loadFrame: async (frameId) => {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    set({ activeFrame: null, isDirty: false, saveError: null, selectedNode: { type: 'frame', id: frameId } })
    try {
      const { data } = await getFrame(frameId)
      set({ activeFrame: data, originalFrame: data, isDirty: false })
    } catch (e) {
      set({ saveError: e.message })
    }
  },

  // Select a non-frame config node (e.g. the project root → CourseConfigPanel).
  selectConfigNode: (type, id) => set({ selectedNode: { type, id } }),

  // Advance to the next/prev frame across the whole active project (used by the
  // persistent preview pane's shell NEXT/PREVIOUS actions).
  navigateFrame: (dir) => {
    const order = get()._projectFrameOrder?.() || []
    const curId = get().activeFrame?.id
    const i = order.indexOf(curId)
    if (i === -1) return
    const j = dir === 'PREVIOUS' ? i - 1 : i + 1
    if (j < 0 || j >= order.length) return
    get().loadFrame(order[j])
  },
  // Injected by App so the store can resolve frame order without importing the
  // project store (avoids a circular import).
  _projectFrameOrder: null,
  setProjectFrameOrder: (fn) => set({ _projectFrameOrder: fn }),

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
    get()._pushUndo()

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
    get()._pushUndo()
    ;[blocks[idx], blocks[swapIdx]] = [blocks[swapIdx], blocks[idx]]
    set({
      activeFrame: { ...activeFrame, content: { ...activeFrame.content, blocks } },
      isDirty: true
    })
    get()._scheduleAutosave()
  },

  // ── Sprint A: selection, undo, duplicate, reorder, flush ──────────────
  setActiveBlock: (id) => set({ activeBlockId: id }),
  setPreviewOpen: (v) => set({ previewOpen: v }),

  _pushUndo: () => {
    const { activeFrame, _undoStack } = get()
    if (!activeFrame) return
    const snap = JSON.parse(JSON.stringify(activeFrame.content?.blocks || []))
    set({ _undoStack: [snap, ..._undoStack].slice(0, 20) })
  },

  undo: () => {
    const { activeFrame, _undoStack } = get()
    if (!activeFrame || !_undoStack.length) return
    const [prev, ...rest] = _undoStack
    set({
      activeFrame: { ...activeFrame, content: { ...activeFrame.content, blocks: prev } },
      _undoStack: rest, isDirty: true,
    })
    get()._scheduleAutosave()
  },

  duplicateBlock: (blockId) => {
    const { activeFrame } = get()
    if (!activeFrame) return
    const blocks = activeFrame.content?.blocks || []
    const idx = blocks.findIndex(b => b.id === blockId)
    if (idx < 0) return
    get()._pushUndo()
    const copy = { ...JSON.parse(JSON.stringify(blocks[idx])), id: crypto.randomUUID() }
    const next = [...blocks]
    next.splice(idx + 1, 0, copy)
    set({
      activeFrame: { ...activeFrame, content: { ...activeFrame.content, blocks: next } },
      isDirty: true, activeBlockId: copy.id,
    })
    get()._scheduleAutosave()
  },

  reorderBlocks: (newBlocks) => {
    const { activeFrame } = get()
    if (!activeFrame) return
    get()._pushUndo()
    set({
      activeFrame: { ...activeFrame, content: { ...activeFrame.content, blocks: newBlocks } },
      isDirty: true,
    })
    get()._scheduleAutosave()
  },

  // Paste a copied block ({type, data}) to the end of the active frame
  pasteBlock: (payload) => {
    const { activeFrame } = get()
    if (!activeFrame || !payload) return
    get()._pushUndo()
    const blk = {
      id: crypto.randomUUID(), type: payload.type,
      data: JSON.parse(JSON.stringify(payload.data || {})),
    }
    const next = [...(activeFrame.content?.blocks || []), blk]
    set({
      activeFrame: { ...activeFrame, content: { ...activeFrame.content, blocks: next } },
      isDirty: true, activeBlockId: blk.id,
    })
    get()._scheduleAutosave()
  },

  // Force an immediate save (Ctrl/Cmd+S)
  flushSave: async () => {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    await get()._doSave()
  },

  // Toggle "optional" (excluded from completion count) — persisted separately
  // from the content autosave.
  setOptional: (val) => {
    const { activeFrame } = get()
    if (!activeFrame) return
    set({ activeFrame: { ...activeFrame, optional: val } })
    updateFrame(activeFrame.id, { optional: val }).catch(() => {})
  },

  // Update frame name
  updateFrameName: (name) => {
    const { activeFrame } = get()
    if (!activeFrame) return
    set({ activeFrame: { ...activeFrame, name }, isDirty: true })
    get()._scheduleAutosave()
  },

  // Per-frame prompt — drives the GUI shell's prompt zone. Stored inside content
  // so it persists via the existing content autosave (no schema change). Empty
  // means "inherit the frame title" at render time.
  setFramePrompt: (val) => {
    const { activeFrame } = get()
    if (!activeFrame) return
    set({ activeFrame: { ...activeFrame, content: { ...activeFrame.content, prompt: val } }, isDirty: true })
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
    set({ saveStatus: 'saving' })
    autosaveTimer = setTimeout(() => get()._doSave(), AUTOSAVE_DELAY)
  },

  // Internal: perform save
  _doSave: async () => {
    const { activeFrame } = get()
    if (!activeFrame) return
    set({ isSaving: true, saveError: null, saveStatus: 'saving' })
    try {
      await updateFrame(activeFrame.id, {
        name: activeFrame.name,
        content: activeFrame.content
      })
      set({ isDirty: false, isSaving: false, lastSaved: new Date(), saveStatus: 'saved' })
      clearTimeout(saveStatusTimer)
      saveStatusTimer = setTimeout(() => set({ saveStatus: 'idle' }), 2000)
    } catch (e) {
      set({ isSaving: false, saveError: e.message, saveStatus: 'error' })
      clearTimeout(saveStatusTimer)
      saveStatusTimer = setTimeout(() => set({ saveStatus: 'idle' }), 4000)
    }
  },
}))

// Block factory
function _makeBlock(type) {
  const id = crypto.randomUUID()
  const defaults = {
    text:  { body: '', narrator_script: '' },
    media: { kind: 'image', placeholder_label: '', asset_id: null, caption: '', bounds: null },
    quiz:  { question: '', choices: ['', '', '', ''], correct_index: 0, feedback_correct: '', feedback_incorrect: '' },
    hotspot: { image_id: null, regions: [] },
    branch:  { condition: '', true_frame_id: null, false_frame_id: null, true_label: 'Yes', false_label: 'No' },
    oam:   { oam_asset_id: null, width: 800, height: 600, responsive: false, scorm_bridge_enabled: false, caption: '', bounds: null },
    wcn:   { wcn_type: 'note', title: '', text: '', modal: false, ack_label: 'I understand — proceed' },
    ivideo: { video_asset_id: null, clip_asset_id: null, video_filename: null, video_serve_url: null, interaction_count: null, video_duration: null, caption: '', bounds: null },
    model3d: { model_asset_id: null, model_filename: null, model_serve_url: null, file_size_mb: null, viewer_height: 400, bg_color: null, bounds: null, caption: '', annotations: [] },
    gui:     { gui_asset_id: null, shell_name: null, stage_width: 1024, stage_height: 768, button_count: 0, zone_count: 0, html_serve_url: null, json_serve_url: null },
  }
  return { id, type, data: defaults[type] || {} }
}

export default useEditorStore
