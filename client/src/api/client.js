import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ── Projects ────────────────────────────────────────────────────────────────
export const getProjects    = ()           => api.get('/projects')
export const getProject     = (id)         => api.get(`/projects/${id}`)
export const createProject  = (data)       => api.post('/projects', data)
export const updateProject  = (id, data)   => api.patch(`/projects/${id}`, data)
export const deleteProject  = (id)         => api.delete(`/projects/${id}`)

// ── Import ───────────────────────────────────────────────────────────────────
export const importJson = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// Import directly from a JS object (raw JSON body) — used for demo autoload.
export const importJsonBody = (data) => api.post('/import', data)

// ── Frames ───────────────────────────────────────────────────────────────────
export const getFrame    = (id)       => api.get(`/frames/${id}`)
export const updateFrame = (id, data) => api.patch(`/frames/${id}`, data)
export const createFrame = (lessonId, data) =>
  api.post(`/lessons/${lessonId}/frames`, data)
export const deleteFrame = (id) => api.delete(`/frames/${id}`)

// ── Reorder ──────────────────────────────────────────────────────────────────
export const reorder = (type, items) => api.post('/reorder', { type, items })

// ── Publish ──────────────────────────────────────────────────────────────────
export const publishProject = (projectId, format) =>
  api.post('/publish', { project_id: projectId, format }, { responseType: 'blob' })

export const getPublishJobs = (projectId) =>
  api.get(`/publish/jobs/${projectId}`)

export default api
