import React from 'react'
import useProjectStore from '../../store/projectStore'

// Export the active course as a JSON file. Paired next to ImportButton (the two are
// a symmetric round-trip, so they live together by the project selector rather than
// export being off in the top-bar action zone). Outline treatment so Import stays the
// primary blue and Export reads as its secondary partner.
export default function ExportButton() {
  const activeProject = useProjectStore(s => s.activeProject)
  const disabled = !activeProject

  const onClick = () => {
    if (!activeProject) return
    const a = document.createElement('a')
    a.href = `/api/projects/${activeProject.id}/export.json`
    a.download = ''
    document.body.appendChild(a); a.click(); a.remove()
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="Export course as JSON"
      title={disabled ? 'Open a project to export' : 'Export this course as a .json file (backup / inspect / move)'}
      style={{
        flex: '0 0 auto', whiteSpace: 'nowrap',
        padding: '8px 20px', borderRadius: 4, fontSize: 13, fontWeight: 600,
        background: 'transparent',
        color: disabled ? 'var(--cf-text-tertiary)' : '#1565C0',
        border: `1px solid ${disabled ? 'var(--cf-border-tertiary)' : '#1565C0'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}
    >
      <span aria-hidden="true">⭳</span> Export JSON
    </button>
  )
}
