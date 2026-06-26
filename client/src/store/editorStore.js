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

// Inspector display mode — 'stack' (all blocks in a scroll list) or 'tabs' (one
// tab per block). Hoisted into the store (from InspectorPane local state) so the
// stable ⚙ View popover in the sidebar can drive it without it moving with the
// inspector dock. Persisted to the same 'cf-inspector-mode' key as before.
const MODE_KEY = 'cf-inspector-mode'
const _MODES = ['stack', 'tabs']
function _readMode() {
  try {
    const v = localStorage.getItem(MODE_KEY)
    return _MODES.includes(v) ? v : 'stack'
  } catch { return 'stack' }
}

// ── Layout-aware content-type exclusivity ────────────────────────────────
// A frame's content.layout decides how many zone-fillers fit:
//   'full'                  → ONE zone-filler total (text/quiz OR media share it)
//   'text-left'/'text-right'→ one PRIMARY (text/quiz) + one MEDIA, side by side
// PRIMARY  = text-zone fillers, mutually exclusive: text, quiz
// MEDIA    = media-zone fillers, mutually exclusive: media(image/video), model3d, oam, ivideo
// AUXILIARY (never blocked): wcn, hotspot, branch, audio (media w/ kind==='audio'),
//   gui, callout, and anything else.
// Audio is a `media` block with data.kind==='audio' that docks as a bar (not a
// zone filler), so an existing audio media must NOT count as a MEDIA zone-filler.
// A callout is a free-floating annotation OVERLAY over the content area — never a
// zone-filler — so it is auxiliary too (and renders OUTSIDE the layout zones).
export const PRIMARY_TYPES = ['text', 'quiz']
export const MEDIA_TYPES   = ['media', 'model3d', 'oam', 'ivideo']
// Explicit auxiliary set (overlays / docked / non-zone-fillers). Anything not in
// PRIMARY_TYPES / MEDIA_TYPES is already never blocked by isBlockTypeBlocked, but
// naming callout here documents intent and guards against it ever being misread as
// a zone-filler.
export const AUXILIARY_TYPES = ['wcn', 'hotspot', 'branch', 'audio', 'gui', 'callout']

// Is THIS existing block a zone-filling media? (audio-kind media docks as a bar,
// so it doesn't occupy the media zone and is treated as auxiliary.)
export function isZoneMedia(block) {
  if (!block) return false
  if (block.type === 'media') return (block.data?.kind || 'image') !== 'audio'
  return MEDIA_TYPES.includes(block.type)
}

// Resolve which add-block category, if any, a frame can no longer accept. Returns
// { primaryBlocked, mediaBlocked, reason } given the frame's blocks + layout. The
// palette uses this to disable buttons (with `reason` as the tooltip) and the store
// mirrors it as a defense-in-depth guard.
export function resolveExclusivity(frame) {
  const blocks = frame?.content?.blocks || []
  // Default 'text-left' matches the renderer default (FramePreview/scorm12).
  const layout = frame?.content?.layout || 'text-left'
  const hasPrimary = blocks.some(b => PRIMARY_TYPES.includes(b.type))
  const hasMedia   = blocks.some(b => isZoneMedia(b))

  if (layout === 'full') {
    // One zone-filler total: any existing zone-filler blocks BOTH groups.
    const taken = hasPrimary || hasMedia
    return {
      primaryBlocked: taken,
      mediaBlocked: taken,
      reason: 'One content element per Full-layout frame',
    }
  }
  // Split layouts: one PRIMARY + one MEDIA, each half independent.
  return {
    primaryBlocked: hasPrimary,
    mediaBlocked: hasMedia,
    primaryReason: 'Only one text/quiz block per frame',
    mediaReason: 'One media block per frame',
  }
}

// Would adding `type` violate the active frame's exclusivity? Used as the store-
// level guard. AUXILIARY types are always allowed. A new `media` add from the
// palette is always a zone-filler (defaults to kind:'image'), so it's MEDIA here.
export function isBlockTypeBlocked(frame, type) {
  const ex = resolveExclusivity(frame)
  if (PRIMARY_TYPES.includes(type)) return ex.primaryBlocked
  if (MEDIA_TYPES.includes(type))   return ex.mediaBlocked
  return false
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
  activeRegionId: null,       // selected hotspot region — syncs the live-preview
                              // editor with the inspector region list (highlight)
  previewOpen: false,         // preview modal flag (so global shortcuts can open it)
  _undoStack: [],             // snapshots of blocks arrays (most recent first)
  saveStatus: 'idle',         // 'idle' | 'saving' | 'saved' | 'error' (header indicator)
  selectedNode: null,         // {type:'project'|'frame', id} — drives the context-sensitive right panel

  // Menu back-pill (in-canvas React parity with the SCO sessionStorage runtime):
  // when a learner clicks a menu item in the in-canvas preview, record the SOURCE
  // menu (its OWN frame id + title) here. A frame preview shows a "← {title}" pill
  // when lastMenuFrame is set and isn't the current frame; clicking calls
  // loadFrame(lastMenuFrame.frameId). Set null again when a menu frame is shown
  // (the menu itself gets no pill). {frameId, title} | null.
  lastMenuFrame: null,
  setLastMenuFrame: (frameId, title) =>
    set({ lastMenuFrame: frameId ? { frameId, title: title || '' } : null }),

  // ── Inspector display mode (stack / tabs) ───────────────────────────────
  inspectorMode: _readMode(),
  setInspectorMode: (mode) => {
    const m = _MODES.includes(mode) ? mode : 'stack'
    set({ inspectorMode: m })
    try { localStorage.setItem(MODE_KEY, m) } catch {}
  },

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

    // Layout-aware content-type exclusivity (generalizes the old single-text rule):
    // PRIMARY (text/quiz) and MEDIA (media/model3d/oam/ivideo) zone-fillers are
    // capped by the frame's content.layout. The toolbar disables the relevant
    // buttons, but guard here too so no other code path (or stale UI) can exceed it.
    // Auxiliary types (wcn/hotspot/branch/audio/gui) are never blocked.
    if (isBlockTypeBlocked(activeFrame, type)) return

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
  setActiveRegion: (id) => set({ activeRegionId: id }),
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

  // Per-frame layout preset — 'full' | 'text-left' | 'text-right'. Drives how the
  // live preview / SCO reflows flow blocks (see FramePreview + scorm12._render_blocks).
  // Stored inside content so it rides the existing content autosave (no schema change).
  setFrameLayout: (val) => {
    const { activeFrame } = get()
    if (!activeFrame) return
    set({ activeFrame: { ...activeFrame, content: { ...activeFrame.content, layout: val } }, isDirty: true })
    get()._scheduleAutosave()
  },

  // ── Menu Frame (frame_type 'menu') ────────────────────────────────────
  // Items live in content.menu = { title, items: [{id,label,target_kind,target_id}] }
  // and ride the existing content autosave (no schema change). _setMenu is the
  // single writer; the helpers below produce the next menu object.
  _setMenu: (nextMenu) => {
    const { activeFrame } = get()
    if (!activeFrame) return
    set({ activeFrame: { ...activeFrame, content: { ...activeFrame.content, menu: nextMenu } }, isDirty: true })
    get()._scheduleAutosave()
  },
  _menu: () => {
    const m = get().activeFrame?.content?.menu
    return { title: m?.title || '', items: Array.isArray(m?.items) ? m.items : [] }
  },
  setMenuTitle: (title) => {
    const m = get()._menu()
    get()._setMenu({ ...m, title })
  },
  addMenuItem: () => {
    const m = get()._menu()
    const item = { id: crypto.randomUUID(), label: 'New item', target_kind: 'frame', target_id: '' }
    get()._setMenu({ ...m, items: [...m.items, item] })
  },
  updateMenuItem: (itemId, patch) => {
    const m = get()._menu()
    get()._setMenu({ ...m, items: m.items.map(it => it.id === itemId ? { ...it, ...patch } : it) })
  },
  removeMenuItem: (itemId) => {
    const m = get()._menu()
    get()._setMenu({ ...m, items: m.items.filter(it => it.id !== itemId) })
  },
  moveMenuItem: (itemId, dir) => {
    const m = get()._menu()
    const items = [...m.items]
    const i = items.findIndex(it => it.id === itemId)
    if (i < 0) return
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= items.length) return
    ;[items[i], items[j]] = [items[j], items[i]]
    get()._setMenu({ ...m, items })
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
  // The Audio palette button adds a media block pre-set to the docked audio bar
  // (kind 'audio'). Audio is auxiliary (it docks, not a zone filler), so it's exempt
  // from media exclusivity — see isZoneMedia / MEDIA_TYPES.
  if (type === 'audio') {
    return { id, type: 'media', data: { kind: 'audio', placeholder_label: '', asset_id: null, caption: '', dock: 'inline', bounds: null } }
  }
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
    // Callout = a free-floating annotation overlay over the frame's CONTENT AREA
    // (typically over a still image). box/target are normalized 0-100 (% of the
    // content area). box is the CONNECTION POINT — the center of the box edge that
    // faces the target; `anchor` ('auto'|'top'|'bottom'|'left'|'right') picks that
    // edge ('auto' = the edge facing the target). AUXILIARY (an overlay, never a
    // zone-filler) — see AUXILIARY_TYPES below.
    callout: { text: 'Callout', box: { x: 55, y: 60 }, target: { x: 32, y: 32 }, padding: 10, anchor: 'auto' },
  }
  return { id, type, data: defaults[type] || {} }
}

export default useEditorStore
