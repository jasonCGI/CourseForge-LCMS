import { create } from 'zustand'
import { getProjects, getProject, importJson, importJsonBody } from '../api/client'
import demoProject from '../demoProject'
import { isSchemaSupported, SCHEMA_VERSION } from '../version'

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

  // Testing convenience: load the most recent project on startup, or seed the
  // bundled demo project if the DB is empty, so the app never opens blank.
  autoloadDemo: async () => {
    set({ loading: true, error: null })
    try {
      const { data: list } = await getProjects()
      if (list && list.length > 0) {
        set({ projects: list })
        const { data: full } = await getProject(list[0].id)
        set({ activeProject: full, loading: false })
        return
      }
      // Empty DB — seed the demo once
      const { data: imp } = await importJsonBody(demoProject)
      set({ projects: [imp.project], activeProject: imp.project, loading: false })
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
      // Client-side schema pre-flight, mirroring the server's import gate
      // (server/version.py is_schema_supported). The file is still validated
      // server-side; this just fails fast with a clear message before upload.
      // Best-effort: if the file can't be read/parsed here, defer to the server.
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        const stamped = parsed?.schema_version
        if (stamped !== undefined && !isSchemaSupported(stamped)) {
          const msg = `Unsupported schema version "${stamped}". This build of ` +
            `CourseForge supports schema ${SCHEMA_VERSION} (same major line).`
          set({ error: msg, loading: false })
          return { success: false, error: msg }
        }
      } catch (preflightErr) {
        // Unreadable/non-JSON file — let the server produce the canonical error.
      }
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

  // Immutably patch one frame in the active-project tree so views that read
  // activeProject (the content tree's OPT chip + completion dots) reflect an edit
  // 1:1 without a refetch. No-op if the frame isn't found.
  patchFrame: (frameId, patch) => set(state => {
    const ap = state.activeProject
    if (!ap) return {}
    return {
      activeProject: {
        ...ap,
        courses: (ap.courses || []).map(c => ({
          ...c,
          modules: (c.modules || []).map(m => ({
            ...m,
            lessons: (m.lessons || []).map(l => ({
              ...l,
              frames: (l.frames || []).map(f => f.id === frameId ? { ...f, ...patch } : f),
            })),
          })),
        })),
      },
    }
  }),

  // Clear error
  clearError: () => set({ error: null }),
}))

export default useProjectStore
