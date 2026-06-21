import { useState, useEffect } from 'react'
import useProjectStore from '../store/projectStore'

// Content-area { width, height } (px) from the project's GUI shell config —
// the box per-block bounds are positioned/sized within. Falls back to a sane
// default when the project has no shell yet.
export default function useContentArea() {
  const shellId = useProjectStore(s => s.activeProject?.gui_shell_id) || null
  const [dims, setDims] = useState(null)
  useEffect(() => {
    if (!shellId) { setDims({ width: 600, height: 500 }); return }
    let live = true
    fetch(`/api/gui-shells/${shellId}/shell.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(cfg => {
        if (!live) return
        const ca = cfg?.content_area || cfg?.contentArea || {}
        setDims({ width: Math.round(ca.width || 600), height: Math.round(ca.height || 500) })
      })
      .catch(() => { if (live) setDims({ width: 600, height: 500 }) })
    return () => { live = false }
  }, [shellId])
  return dims
}
