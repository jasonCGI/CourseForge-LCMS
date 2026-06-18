import React, { useEffect, useRef, useState } from 'react'

/**
 * OamMediaBar — an OAM (Adobe Animate Canvas) player with a media bar.
 *
 * OAM isn't a standard controllable format, so control happens via a small
 * postMessage protocol the animation opts into:
 *   parent → iframe: {type:'oam:play'|'oam:pause'|'oam:nextStop'} , {type:'oam:seek', t}
 *   iframe → parent: {type:'oam:state', t, duration, stops:[...], playing}
 * (CourseForge's demo OAM implements it.) For non-conforming OAM we fall back to
 * play/pause via the CreateJS Ticker if reachable (same-origin), else show the
 * iframe with a "no timeline controls" note.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export default function OamMediaBar({ src, width = 800, height = 500, caption }) {
  const iframeRef = useRef(null)
  const stageRef  = useRef(null)
  const SW = Number(width)  || 800             // native stage dims (a legacy '100%' → fallback)
  const SH = Number(height) || 600
  const [stageH, setStageH] = useState(SH)
  const [st, setSt]   = useState(null)        // {t, duration, stops, playing}
  const [mode, setMode] = useState('pending') // 'pending' | 'protocol' | 'ticker' | 'none'

  // Scale-to-fit the fixed-size animation to the container width (preserve
  // aspect, never upscale past native), reserving the scaled height below it.
  useEffect(() => {
    const stage = stageRef.current, ifr = iframeRef.current
    if (!stage || !ifr || !SW || !SH) return
    let lastW = -1
    const fit = () => {
      const cw = stage.clientWidth || SW
      if (cw === lastW) return            // guard ResizeObserver against the height write
      lastW = cw
      let s = Math.min(cw / SW, 1)
      if (!(s > 0) || !isFinite(s)) s = 1
      ifr.style.transform = `scale(${s})`
      ifr.style.left = `${Math.max(0, (cw - SW * s) / 2)}px`
      setStageH(SH * s)
    }
    fit()
    const onResize = () => { lastW = -1; fit() }
    let ro
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(stage) }
    window.addEventListener('resize', onResize)
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', onResize) }
  }, [SW, SH, src])

  useEffect(() => {
    const onMsg = (e) => {
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return
      const d = e.data || {}
      if (d.type === 'oam:state') { setSt(d); setMode('protocol') }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const send = (msg) => { try { iframeRef.current?.contentWindow?.postMessage(msg, '*') } catch {} }

  const onLoad = () => {
    send({ type: 'oam:getState' })
    // If no protocol state arrives, probe for a controllable CreateJS Ticker.
    setTimeout(() => {
      setMode((m) => {
        if (m === 'protocol') return m
        try {
          const cj = iframeRef.current?.contentWindow?.createjs
          if (cj && cj.Ticker) return 'ticker'
        } catch {}
        return 'none'
      })
    }, 900)
  }

  // ── ticker fallback state ──
  const [tickerPlaying, setTickerPlaying] = useState(true)
  const tickerToggle = () => {
    try {
      const cj = iframeRef.current?.contentWindow?.createjs
      if (cj?.Ticker) { cj.Ticker.paused = tickerPlaying; setTickerPlaying(!tickerPlaying) }
    } catch {}
  }

  const dur = st?.duration || 0
  const t   = st?.t || 0
  const playing = mode === 'protocol' ? !!st?.playing : tickerPlaying
  const stops = st?.stops || []

  const seekClick = (e) => {
    if (mode !== 'protocol' || !dur) return
    const r = e.currentTarget.getBoundingClientRect()
    send({ type: 'oam:seek', t: clamp((e.clientX - r.left) / r.width, 0, 1) * dur })
  }
  const togglePlay = () => {
    if (mode === 'protocol') send({ type: playing ? 'oam:pause' : 'oam:play' })
    else if (mode === 'ticker') tickerToggle()
  }

  const canControl = mode === 'protocol' || mode === 'ticker'

  return (
    <div style={{ marginBottom: 20 }}>
      <div ref={stageRef} style={{ position: 'relative', width: '100%', height: stageH,
        overflow: 'hidden', background: '#0d1017', borderRadius: '6px 6px 0 0' }}>
        <iframe ref={iframeRef} src={src} width={SW} height={SH} onLoad={onLoad}
          title="Adobe Animate animation" scrolling="no" sandbox="allow-scripts allow-same-origin"
          style={{ position: 'absolute', top: 0, left: 0, border: 0, transformOrigin: 'top left',
            display: 'block', background: '#0d1017' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
        background: '#0d1017', border: '1px solid #1c2a3a', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
        <button onClick={togglePlay} disabled={!canControl} aria-label={playing ? 'Pause' : 'Play'}
          style={barBtn(canControl)}>{playing ? '⏸' : '▶'}</button>

        <div onClick={seekClick}
          style={{ flex: 1, position: 'relative', height: 8, background: '#1c2a3a', borderRadius: 4,
                   cursor: mode === 'protocol' ? 'pointer' : 'default', opacity: mode === 'protocol' ? 1 : 0.5 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0,
            width: (dur ? (t / dur * 100) : 0) + '%', background: 'var(--forge-amber, #F59E0B)', borderRadius: 4 }} />
          {stops.map((s, i) => (
            <div key={i} title={`Stop ${i + 1}`} style={{ position: 'absolute', left: (dur ? s / dur * 100 : 0) + '%',
              top: -4, width: 2, height: 16, background: '#7EB8F0', borderRadius: 1, transform: 'translateX(-50%)', pointerEvents: 'none' }} />
          ))}
        </div>

        <button onClick={() => send({ type: 'oam:nextStop' })} disabled={mode !== 'protocol'}
          aria-label="Skip to next stop" title="Next stop" style={barBtn(mode === 'protocol')}>⤓ Next stop</button>

        <span style={{ fontFamily: 'var(--forge-font, monospace)', fontSize: 10, color: '#7A90A8', minWidth: 60, textAlign: 'right' }}>
          {mode === 'protocol' ? `${t.toFixed(1)}/${dur.toFixed(0)}s` : ''}
        </span>
      </div>

      {mode === 'none' && (
        <div style={{ fontSize: 10, color: 'var(--cf-text-tertiary, #7a7a90)', marginTop: 4,
          fontFamily: 'var(--forge-font, monospace)' }}>
          This .oam doesn’t expose timeline controls (plays on its own).
        </div>
      )}
      {caption && <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{caption}</p>}
    </div>
  )
}

const barBtn = (enabled) => ({
  background: enabled ? 'var(--forge-amber, #F59E0B)' : '#2a2a35',
  color: enabled ? '#042C53' : '#666', border: 'none', borderRadius: 4,
  padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: enabled ? 'pointer' : 'not-allowed',
  fontFamily: 'var(--forge-font, monospace)', whiteSpace: 'nowrap',
})
