import React, { useEffect, useRef, useState } from 'react'
import MediaBar from './MediaBar'

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
export default function OamMediaBar({ src, width = 800, height = 500, caption, hotspotConfig }) {
  const iframeRef = useRef(null)
  const stageRef  = useRef(null)
  const wrapRef   = useRef(null)
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
    // Push the project hotspot style before playback so hotspots adopt it.
    if (hotspotConfig && Object.keys(hotspotConfig).length) {
      send({ type: 'forge:config', config: { hotspot: hotspotConfig } })
    }
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

  const togglePlay = () => {
    if (mode === 'protocol') send({ type: playing ? 'oam:pause' : 'oam:play' })
    else if (mode === 'ticker') tickerToggle()
  }

  const canControl = mode === 'protocol' || mode === 'ticker'
  const toggleFullscreen = () => {
    if (document.fullscreenElement) { document.exitFullscreen?.(); return }
    wrapRef.current?.requestFullscreen?.()
  }

  return (
    <div ref={wrapRef} style={{ marginBottom: 20, background: '#0d1017' }}>
      <div ref={stageRef} style={{ position: 'relative', width: '100%', height: stageH,
        overflow: 'hidden', background: '#0d1017' }}>
        <iframe ref={iframeRef} src={src} width={SW} height={SH} onLoad={onLoad}
          title="Adobe Animate animation" scrolling="no" sandbox="allow-scripts allow-same-origin"
          style={{ position: 'absolute', top: 0, left: 0, border: 0, transformOrigin: 'top left',
            display: 'block', background: '#0d1017' }} />
      </div>

      <MediaBar
        playing={playing}
        t={mode === 'protocol' ? t : 0}
        duration={mode === 'protocol' ? dur : 0}
        stops={stops}
        onPlayPause={togglePlay}
        onSeek={(sec) => send({ type: 'oam:seek', t: sec })}
        onNextStop={() => send({ type: 'oam:nextStop' })}
        disabled={!canControl}
        seekable={mode === 'protocol'}
        onFullscreen={toggleFullscreen}
      />

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
