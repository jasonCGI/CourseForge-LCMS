import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'

export default function MediaUploader({
  accept,           // e.g. { 'application/vnd.adobe.oam+zip': ['.oam'] }
  label,            // e.g. "Drop .oam file here"
  onUpload,         // async (file) => void — called with selected file
  uploading,        // bool
  error,            // string | null
  successLabel,     // string shown after upload
}) {
  const onDrop = useCallback(async (accepted) => {
    if (accepted.length === 0) return
    await onUpload(accepted[0])
  }, [onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
    disabled: uploading,
  })

  return (
    <div>
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${isDragActive ? 'var(--cf-accent)' : 'var(--cf-border-primary)'}`,
          borderRadius: 6,
          padding: '24px 16px',
          textAlign: 'center',
          background: isDragActive ? 'var(--cf-accent-dim)' : 'var(--cf-input-bg)',
          cursor: uploading ? 'not-allowed' : 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        role="button"
        aria-label={label}
        tabIndex={0}
      >
        <input {...getInputProps()} aria-hidden="true"/>
        <div style={{ fontSize: 24, marginBottom: 8 }}>
          {uploading ? '⏳' : isDragActive ? '📂' : '⬆'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--cf-text-secondary)' }}>
          {uploading
            ? 'Uploading…'
            : successLabel
              ? successLabel
              : isDragActive
                ? 'Drop to upload'
                : label}
        </div>
        {!uploading && !successLabel && (
          <div style={{ fontSize: 11, color: 'var(--cf-text-tertiary)', marginTop: 4 }}>
            or click to browse
          </div>
        )}
      </div>

      {error && (
        <div style={{
          marginTop: 8, padding: '6px 10px',
          background: 'rgba(194,57,52,0.1)',
          border: '1px solid rgba(194,57,52,0.4)',
          borderRadius: 4, fontSize: 12,
          color: '#E87070',
        }} role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
