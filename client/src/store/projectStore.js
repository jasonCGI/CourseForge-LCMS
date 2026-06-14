import { create } from 'zustand'
import { getProjects, getProject, importJson } from '../api/client'

const useProjectStore = create((set, get) => ({
  // State
  projects: [],
  activeProject: null,
  activeFrameId: null,
  loading: false,
  error: null,

  // Load project list
  fetchProjects: async () => {
    set({ loading: true, error: null })
    try {
      const { data } = await getProjects()
      set({ projects: data, loading: false })
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },

  // Load full project hierarchy
  fetchProject: async (id) => {
    set({ loading: true, error: null })
    try {
      const { data } = await getProject(id)
      set({ activeProject: data, loading: false })
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },

  // Import JSON file
  importProject: async (file) => {
    set({ loading: true, error: null })
    try {
      const { data } = await importJson(file)
      const project = data.project
      set(state => ({
        projects: [project, ...state.projects],
        activeProject: project,
        loading: false
      }))
      return { success: true, project, warnings: data.warnings }
    } catch (e) {
      const msg = e.response?.data?.error || e.message
      set({ error: msg, loading: false })
      return { success: false, error: msg }
    }
  },

  // Set active frame (for editor)
  setActiveFrameId: (id) => set({ activeFrameId: id }),

  // Clear error
  clearError: () => set({ error: null }),
}))

export default useProjectStore
