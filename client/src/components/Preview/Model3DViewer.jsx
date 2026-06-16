import React, { useEffect, useRef, useState, useCallback } from 'react'

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
const GLTF_CDN  = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'

const scriptCache = {}
function loadScript(src) {
  if (scriptCache[src]) return scriptCache[src]
  scriptCache[src] = new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src; s.onload = resolve; s.onerror = reject
    document.head.appendChild(s)
  })
  return scriptCache[src]
}

const REDUCE_MOTION = typeof window !== 'undefined' &&
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Model3DViewer({ modelUrl, caption, bgColor = '#0d1017', height = 400, onLoad }) {
  const canvasRef   = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef   = useRef(null)
  const frameRef    = useRef(null)
  const orbitRef    = useRef({
    dragging: false, lastX: 0, lastY: 0,
    theta: 0, phi: Math.PI / 4, radius: 3,
    minRadius: 0.5, maxRadius: 20, minPhi: 0.1, maxPhi: Math.PI - 0.1,
  })
  const touchStartRef = useRef(null)

  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [threeReady, setThreeReady] = useState(false)
  const [hint, setHint]             = useState(true)

  const updateCamera = (camera, orbit) => {
    const THREE = window.THREE
    if (!camera || !THREE) return
    const { theta, phi, radius } = orbit
    camera.position.set(
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta),
    )
    camera.lookAt(0, 0, 0)
  }

  useEffect(() => {
    Promise.all([loadScript(THREE_CDN), loadScript(GLTF_CDN)])
      .then(() => setThreeReady(true))
      .catch(() => { setError('Could not load Three.js from CDN.'); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!threeReady || !canvasRef.current || !modelUrl) return
    const THREE  = window.THREE
    const canvas = canvasRef.current
    const w = canvas.clientWidth || 800

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(w, height); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputEncoding = THREE.sRGBEncoding
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(bgColor)

    const camera = new THREE.PerspectiveCamera(45, w / height, 0.01, 1000)
    cameraRef.current = camera

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(5, 8, 5); scene.add(key)
    const fill = new THREE.DirectionalLight(0x8AAAC8, 0.4); fill.position.set(-5, 2, -5); scene.add(fill)
    const rim = new THREE.DirectionalLight(0xF59E0B, 0.2); rim.position.set(0, -3, -8); scene.add(rim)

    setLoading(true); setError(null)
    new THREE.GLTFLoader().load(modelUrl, (gltf) => {
      const model = gltf.scene
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const scale = 2.0 / Math.max(size.x, size.y, size.z)
      model.scale.setScalar(scale)
      model.position.sub(center.multiplyScalar(scale))
      scene.add(model)
      orbitRef.current.radius = 3
      updateCamera(camera, orbitRef.current)
      setLoading(false)
      onLoad?.()
    }, undefined, () => { setError('Failed to load 3D model. Check that the .glb file is valid.'); setLoading(false) })

    const animate = () => { frameRef.current = requestAnimationFrame(animate); renderer.render(scene, camera) }
    animate()

    const ro = new ResizeObserver(() => {
      const w2 = canvas.clientWidth || w
      renderer.setSize(w2, height); camera.aspect = w2 / height; camera.updateProjectionMatrix()
    })
    ro.observe(canvas)

    return () => { cancelAnimationFrame(frameRef.current); ro.disconnect(); renderer.dispose() }
  }, [threeReady, modelUrl, bgColor, height])

  const onPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return
    orbitRef.current.dragging = true
    orbitRef.current.lastX = e.clientX; orbitRef.current.lastY = e.clientY
    setHint(false)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [])
  const onPointerMove = useCallback((e) => {
    const orbit = orbitRef.current
    if (!orbit.dragging) return
    orbit.theta -= (e.clientX - orbit.lastX) * 0.01
    orbit.phi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.phi + (e.clientY - orbit.lastY) * 0.01))
    orbit.lastX = e.clientX; orbit.lastY = e.clientY
    updateCamera(cameraRef.current, orbit)
  }, [])
  const onPointerUp = useCallback((e) => {
    orbitRef.current.dragging = false
    e.currentTarget?.releasePointerCapture?.(e.pointerId)
  }, [])
  const onWheel = useCallback((e) => {
    e.preventDefault()
    const orbit = orbitRef.current
    orbit.radius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.radius + e.deltaY * 0.01))
    updateCamera(cameraRef.current, orbit)
  }, [])
  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      touchStartRef.current = Math.hypot(dx, dy)
    }
  }, [])
  const onTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && touchStartRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const orbit = orbitRef.current
      orbit.radius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.radius - (dist - touchStartRef.current) * 0.01))
      touchStartRef.current = dist
      updateCamera(cameraRef.current, orbit)
    }
  }, [])
  const onKeyDown = useCallback((e) => {
    const orbit = orbitRef.current
    const step = 0.05
    switch (e.key) {
      case 'ArrowLeft':  orbit.theta -= step; break
      case 'ArrowRight': orbit.theta += step; break
      case 'ArrowUp':    orbit.phi = Math.max(orbit.minPhi, orbit.phi - step); break
      case 'ArrowDown':  orbit.phi = Math.min(orbit.maxPhi, orbit.phi + step); break
      case '+': case '=': orbit.radius = Math.max(orbit.minRadius, orbit.radius - 0.2); break
      case '-':           orbit.radius = Math.min(orbit.maxRadius, orbit.radius + 0.2); break
      case 'r': case 'R': orbit.theta = 0; orbit.phi = Math.PI / 4; orbit.radius = 3; break
      default: return
    }
    e.preventDefault(); setHint(false)
    updateCamera(cameraRef.current, orbit)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', marginBottom: 12 }}>
      <canvas ref={canvasRef} width={800} height={height}
        style={{ width: '100%', height, display: 'block', borderRadius: 8, cursor: 'grab', outline: 'none', touchAction: 'none' }}
        tabIndex={0} role="img"
        aria-label={caption || '3D model viewer — use arrow keys to rotate, +/- to zoom, R to reset'}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onKeyDown={onKeyDown} />

      {loading && !error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: bgColor, borderRadius: 8, gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #1c2a3a',
            borderTopColor: 'var(--forge-amber)', animation: REDUCE_MOTION ? 'none' : 'spin3d 0.8s linear infinite' }} />
          <span style={{ fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', fontSize: 11, color: '#3A5A7A', letterSpacing: '0.08em' }}>Loading model…</span>
          <style>{`@keyframes spin3d { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: bgColor, borderRadius: 8, gap: 8, padding: 24, textAlign: 'center' }}>
          <span style={{ fontSize: 28 }}>⚠</span>
          <span style={{ fontSize: 13, color: '#E87070' }}>{error}</span>
        </div>
      )}

      {hint && !loading && !error && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(4,44,83,0.75)', color: '#B5D4F4', fontSize: 10,
          fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', padding: '4px 10px',
          borderRadius: 20, letterSpacing: '0.06em', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          drag to rotate · scroll to zoom · R to reset
        </div>
      )}

      {!loading && !error && (
        <div aria-hidden="true" style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)',
          color: '#3A5A7A', fontSize: 9, fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
          padding: '3px 8px', borderRadius: 4, letterSpacing: '0.06em' }}>
          ↑↓←→ orbit · +/- zoom · R reset
        </div>
      )}

      {caption && (
        <p style={{ fontSize: 12, color: 'var(--cf-text-tertiary)', marginTop: 6, fontFamily: 'var(--cf-font)' }}>{caption}</p>
      )}
    </div>
  )
}
