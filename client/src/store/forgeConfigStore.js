import { create } from 'zustand'
import { getForgeConfig, setForgeConfig } from '../api/client'

// Runtime hotspot defaults (mirror server/assets/forge-oam.js HS) — also the
// "brand default" shown until a project customizes the style.
export const DEFAULT_HS = {
  strokeColor: '#F59E0B', outColor: '#F59E0B', focusOutline: '#F59E0B',
  overColor: '#FFC04D', fill: 'rgba(245,158,11,0.12)', shadow: '0 0 0 3px rgba(245,158,11,0.25)',
  strokeWidth: 3, radius: 6, pulse: true,
}

// Project-level ForgeJS hotspot style. Hoisted into a single store (not per
// OamBlock component) so that multiple OAM blocks on one project share ONE
// source of truth — otherwise each block's debounced save would clobber the
// others from its own stale copy. The debounce timer lives here too, so it's
// inherently shared/cancelable across blocks.
let saveTimer = null

const useForgeConfigStore = create((set, get) => ({
  projectId: null,
  loadedFor: null,   // project id we've already fetched (dedupes concurrent blocks)
  hotspot: null,     // null = use brand defaults
  saved: null,       // 'saving' | 'saved' | null

  // Fetch once per project. Concurrent OAM blocks all call this; only the first
  // for a given project actually hits the API.
  load: async (projectId) => {
    if (!projectId) { set({ projectId: null, loadedFor: null, hotspot: null, saved: null }); return }
    if (get().loadedFor === projectId) { set({ projectId }); return }
    set({ projectId, loadedFor: projectId, hotspot: null, saved: null })
    try {
      const r = await getForgeConfig(projectId)
      if (get().projectId !== projectId) return   // project switched mid-flight
      const hs = r.data?.hotspot
      set({ hotspot: hs && Object.keys(hs).length ? { ...DEFAULT_HS, ...hs } : null })
    } catch { /* leave at defaults */ }
  },

  _save: (projectId, hotspot) => {
    set({ saved: 'saving' })
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      setForgeConfig(projectId, hotspot ? { hotspot } : {})
        .then(() => { if (get().projectId === projectId) set({ saved: 'saved' }) })
        .catch(() => { if (get().projectId === projectId) set({ saved: null }) })
    }, 500)
  },

  patch: (patch) => {
    const { projectId, hotspot } = get()
    if (!projectId) return
    const next = { ...(hotspot || DEFAULT_HS), ...patch }
    set({ hotspot: next })
    get()._save(projectId, next)
  },

  reset: () => {
    const { projectId } = get()
    if (!projectId) return
    set({ hotspot: null })
    get()._save(projectId, null)
  },
}))

export default useForgeConfigStore
