import React, { useEffect, useRef, useState } from 'react'
import { wireAudioBars, wireMenuNav } from './FramePreview'

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
    let obs = null
    try {
      // Shell TITLE + PROMPT zones: authors size these boxes to the cap-height, so a
      // fixed border-box height + overflow:hidden clips glyph descenders (g,y,p,j).
      // Inject a one-time override targeting the data-zone-type text zones so the
      // in-canvas preview matches the published render (scorm12._patch_shell). Built
      // OR uploaded shells both carry data-zone-type, so this reaches both.
      try {
        const doc = win.document
        if (doc && !doc.getElementById('cf-zone-descender-fix')) {
          const st = doc.createElement('style')
          st.id = 'cf-zone-descender-fix'
          st.textContent = '[data-zone-type="frame_title"],[data-zone-type="lesson_title"],'
            + '[data-zone-type="section_title"],[data-zone-type="prompt"],'
            + '[data-zone-type="frame_counter"]'
            + '{overflow:visible!important;line-height:1.35!important;transform:translateY(-5px)!important}'
          ;(doc.head || doc.documentElement).appendChild(st)
        }
      } catch (e) { /* cross-origin / torn down */ }
      win.fgui.injectContent(frameHtml || '')
      win.fgui.setFrameData(frameData || {})
      // Shells built before the setFrameData key-map fix read state.currentFrame,
      // which their old setFrameData ignored (it merged the 'frameIndex' key
      // verbatim) — leaving the counter stuck at "1 / total". Also drive the
      // postMessage bridge those shells map correctly. Idempotent on fixed shells.
      win.postMessage({ type: 'fgui_frame_data', ...(frameData || {}) }, '*')
      // Version-INDEPENDENT counter (mirrors scorm12._patch_shell.paintCounter):
      // the two calls above both depend on the stored shell's baked runtime (its
      // setFrameData key-map and/or its async fgui_frame_data handler). When the
      // shell was baked by an older shell_builder, the counter stuck at "1 / 1" or
      // showed an empty total. Every shell_builder version tags the counter zone
      // with data-zone-type="frame_counter", so write its text ourselves. Re-assert
      // on a tick to win against the async postMessage handler's updateZones().
      const fd = frameData || {}
      const desiredCounter = `${fd.frameIndex} / ${fd.totalFrames}`
      const paintCounter = () => {
        try {
          const nodes = win.document.querySelectorAll('[data-zone-type="frame_counter"]')
          for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].textContent !== desiredCounter) nodes[i].textContent = desiredCounter
          }
        } catch (e) { /* iframe torn down */ }
      }
      paintCounter()
      win.requestAnimationFrame ? win.requestAnimationFrame(paintCounter) : setTimeout(paintCounter, 0)
      setTimeout(paintCounter, 50)
      setTimeout(paintCounter, 200)
      // The shell's own async updateZones() can rewrite the counter AFTER our
      // timeouts, dropping the total ("18 / "). Observe the counter zones and
      // re-assert whenever anything rewrites them, so our "idx / total" always wins.
      // The !== guard makes the re-assert idempotent (no observer feedback loop).
      try {
        obs = new win.MutationObserver(paintCounter)
        win.document.querySelectorAll('[data-zone-type="frame_counter"]').forEach(n =>
          obs.observe(n, { childList: true, characterData: true, subtree: true }))
      } catch (e) { /* no MutationObserver in this context */ }
      // injectContent uses innerHTML, so the bar's inline <script> never runs —
      // wire the branded audio bars directly in the iframe document instead.
      wireAudioBars(win.document)
      // Same for menu-frame nav buttons: wire each [data-cf-nav-target] to post an
      // fgui_nav message the host turns into loadFrame(targetId).
      wireMenuNav(win)
    } catch (e) {
      console.warn('[GUIShellRenderer] inject error:', e)
    }
    // Tear down THIS run's observer so stale observers (with stale desiredCounter
    // values) can't pile up and fight the current one across frame navigation.
    return () => { try { obs && obs.disconnect() } catch {} }
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
