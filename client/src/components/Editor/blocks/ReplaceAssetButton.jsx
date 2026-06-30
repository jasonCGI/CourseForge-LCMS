import React, { useRef } from 'react'

// Shared in-place "Replace" affordance for asset blocks (3D model, OAM, GUI shell,
// iVideo video/clip, …). Opens a kind-scoped file picker and hands the file to the
// block's EXISTING upload handler — which only rewrites the asset fields, so the
// block's other settings (caption, bounds, annotations, viewer options, etc.)
// survive. Avoids the Remove-then-re-add dance. Mirrors the MediaBlock chip button.
export default function ReplaceAssetButton({ accept, onPick, uploading = false, label = 'Replace', title }) {
  const ref = useRef(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files && e.target.files[0]; if (f) onPick(f); e.target.value = '' }}
      />
      <button
        type="button"
        onClick={() => ref.current && ref.current.click()}
        disabled={uploading}
        aria-label={title || 'Replace the file in place — keeps the block’s other settings'}
        title={title || 'Replace the file in place — keeps the block’s other settings'}
        style={{
          background: 'none', border: '1px solid var(--cf-border-secondary)',
          color: 'var(--cf-text-secondary)', cursor: uploading ? 'wait' : 'pointer',
          fontSize: 12, padding: '4px 10px', borderRadius: 4,
          fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
        }}
      >
        ⤢ {uploading ? 'Replacing…' : label}
      </button>
    </>
  )
}
