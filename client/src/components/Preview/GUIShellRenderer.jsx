import React, { useEffect, useRef, useState } from 'react'
import { wireAudioBars } from './FramePreview'

/**
 * GUIShellRenderer
 *
 * Loads gui_shell.html into an iframe for preview, then injects the current
 * frame's content via the shell's window.fgui API. Listens for fgui_action
 * postMessages so shell button clicks bubble up to CourseForge.
 *
 * In SCORM output, injection happens via a vanilla-JS runtime baked into the
 * SCO page (see scorm12._build_gui_frame) — this component is preview-only.
 */
export default function GUIShellRenderer({
  shellUrl,
  frameHtml,
  frameData,
  onAction,
  height = 600,
}) {
  const iframeRef = useRef(null)
  const [loaded, setLoaded] = useState(false)

  // Inject content when the iframe loads or the frame content changes.
  useEffect(() => {
    if (!loaded || !iframeRef.current) return
    const win = iframeRef.current.contentWindow
    if (!win || !win.fgui) return
    try {
      win.fgui.injectContent(frameHtml || '')
      win.fgui.setFrameData(frameData || {})
      // injectContent uses innerHTML, so the bar's inline <script> never runs —
      // wire the branded audio bars directly in the iframe document instead.
      wireAudioBars(win.document)
    } catch (e) {
      console.warn('[GUIShellRenderer] inject error:', e)
    }
  }, [loaded, frameHtml, frameData])

  // Listen for shell button actions.
  useEffect(() => {
    const handler = (e) => {
      if (!e.data || e.data.type !== 'fgui_action') return
      onAction?.(e.data.action)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onAction])

  return (
    <div style={{
      width: '100%', height, position: 'relative', overflow: 'hidden',
      borderRadius: 0, border: '1px solid var(--cf-block-border, #1c2a3a)',
    }}>
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#060810', color: '#3A5A7A',
          fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, letterSpacing: '0.08em',
        }}>
          Loading shell…
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={shellUrl}
        title="GUI shell preview"
        style={{ width: '100%', height: '100%', border: 'none', display: loaded ? 'block' : 'none' }}
        onLoad={() => setLoaded(true)}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  )
}
