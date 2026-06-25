import React, { useRef, useState } from 'react'
import useProjectStore from '../../store/projectStore'
import { Upload } from '../icons'

export default function ImportButton({ inline = false }) {
  const fileRef = useRef()
  const importProject = useProjectStore(s => s.importProject)
  const loading = useProjectStore(s => s.loading)
  const [result, setResult] = useState(null)

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const res = await importProject(file)
    setResult(res)
    e.target.value = ''  // reset input
  }

  // inline: sit to the right of the project selector, sized to content width with
  // 20px of horizontal padding each side (so the button is only as wide as it
  // needs to be). Standalone (no project yet): full-width block as before.
  const wrapStyle = inline
    ? { flex: '0 0 auto' }
    : { padding: '12px 8px', borderBottom: '1px solid #333' }
  const buttonStyle = inline
    ? {
        width: 'auto',
        whiteSpace: 'nowrap',
        padding: '8px 20px',
        background: '#1565C0',
        color: '#fff',
        border: 'none',
        borderRadius: 4,
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: 13,
        fontWeight: 600,
      }
    : {
        width: '100%',
        padding: '8px 0',
        background: '#1565C0',
        color: '#fff',
        border: 'none',
        borderRadius: 4,
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: 13,
        fontWeight: 600,
      }

  return (
    <div style={wrapStyle}>
      <button
        onClick={() => fileRef.current.click()}
        disabled={loading}
        style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        {loading ? 'Importing…' : (<><Upload width={14} height={14} strokeWidth={2} aria-hidden="true" /> Import JSON</>)}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      {result && !result.success && (
        <p style={{ color: '#f44336', fontSize: 12, marginTop: 6 }}>
          {result.error}
        </p>
      )}
      {result && result.success && result.warnings?.length > 0 && (
        <div style={{ color: '#FF9800', fontSize: 12, marginTop: 6 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>
            Imported with {result.warnings.length} warning(s):
          </p>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {result.warnings.map((w, i) => (
              <li key={i} style={{ marginTop: 2 }}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
