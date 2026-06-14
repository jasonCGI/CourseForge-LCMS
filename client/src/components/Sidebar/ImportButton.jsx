import React, { useRef, useState } from 'react'
import useProjectStore from '../../store/projectStore'

export default function ImportButton() {
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

  return (
    <div style={{ padding: '12px 8px', borderBottom: '1px solid #333' }}>
      <button
        onClick={() => fileRef.current.click()}
        disabled={loading}
        style={{
          width: '100%',
          padding: '8px 0',
          background: '#1565C0',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {loading ? 'Importing...' : '⬆ Import JSON'}
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
        <p style={{ color: '#FF9800', fontSize: 12, marginTop: 6 }}>
          Imported with {result.warnings.length} warning(s).
        </p>
      )}
    </div>
  )
}
