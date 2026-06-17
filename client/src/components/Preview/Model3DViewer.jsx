import React, { useEffect, useRef, useState, useCallback, useId } from 'react'

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

export default function Model3DViewer({
  modelUrl, caption, bgColor = '#0d1017', height = 400,
  annotations = [], pinMode = false, onPinPlaced = null, onLoad = null,
}) {
  const canvasRef   = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef   = useRef(null)
  const sceneRef    = useRef(null)
  const frameRef    = useRef(null)
  const annsRef     = useRef(annotations)
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
  const [screenPins, setScreenPins] = useState([])
  const [activePin, setActivePin]   = useState(null)
  const viewerId = useId()

  useEffect(() => { annsRef.current = annotations }, [annotations])

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

  const projectAnnotations = useCallback((camera, renderer) => {
    const anns = annsRef.current
    if (!camera || !renderer || !anns?.length) { setScreenPins(prev => prev.length ? [] : prev); return }
    const THREE = window.THREE
    const canvas = renderer.domElement
    const w = canvas.clientWidth, h = canvas.clientHeight
    const pins = anns.map(ann => {
      const ndc = new THREE.Vector3(ann.position.x, ann.position.y, ann.position.z).project(camera)
      return { id: ann.id, x: (ndc.x * 0.5 + 0.5) * w, y: (-ndc.y * 0.5 + 0.5) * h, visible: ndc.z < 1.0 }
    })
    setScreenPins(pins)
  }, [])

  useEffect(() => {
    // Sequential, NOT Promise.all: the legacy global GLTFLoader references
    // window.THREE at execution time, so THREE must finish loading first —
    // parallel loading races and throws "THREE is not defined" (uncaught → blank).
    loadScript(THREE_CDN)
      .then(() => loadScript(GLTF_CDN))
      .then(() => setThreeReady(true))
      .catch(() => { setError('Could not load Three.js from CDN.'); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!threeReady || !canvasRef.current || !modelUrl) return
    const THREE = window.THREE
    const canvas = canvasRef.current
    const w = canvas.clientWidth || 800

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(w, height); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping
    rendererRef.current = renderer

    const scene = new THREE.Scene(); scene.background = new THREE.Color(bgColor)
    sceneRef.current = scene
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
      model.scale.setScalar(scale); model.position.sub(center.multiplyScalar(scale))
      scene.add(model)
      orbitRef.current.radius = 3; updateCamera(camera, orbitRef.current)
      setLoading(false); onLoad?.()
    }, undefined, () => { setError('Failed to load 3D model.'); setLoading(false) })

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)
      renderer.render(scene, camera)
      projectAnnotations(camera, renderer)
    }
    animate()

    const ro = new ResizeObserver(() => {
      const w2 = canvas.clientWidth || w
      renderer.setSize(w2, height); camera.aspect = w2 / height; camera.updateProjectionMatrix()
    })
    ro.observe(canvas)

    return () => { cancelAnimationFrame(frameRef.current); ro.disconnect(); renderer.dispose() }
  }, [threeReady, modelUrl, bgColor, height, projectAnnotations])

  const handleCanvasClick = useCallback((e) => {
    if (!pinMode || !onPinPlaced) return
    const THREE = window.THREE
    const canvas = canvasRef.current, camera = cameraRef.current, scene = sceneRef.current
    if (!THREE || !canvas || !camera || !scene) return
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    const ray = new THREE.Raycaster(); ray.setFromCamera({ x, y }, camera)
    const hits = ray.intersectObjects(scene.children, true)
    if (hits.length > 0) {
      onPinPlaced({
        x: parseFloat(hits[0].point.x.toFixed(4)),
        y: parseFloat(hits[0].point.y.toFixed(4)),
        z: parseFloat(hits[0].point.z.toFixed(4)),
      })
    }
  }, [pinMode, onPinPlaced])

  const onPointerDown = useCallback((e) => {
    if (pinMode) return
    if (e.button !== undefined && e.button !== 0) return
    orbitRef.current.dragging = true
    orbitRef.current.lastX = e.clientX; orbitRef.current.lastY = e.clientY
    setHint(false); e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [pinMode])
  const onPointerMove = useCallback((e) => {
    const orbit = orbitRef.current
    if (!orbit.dragging) return
    orbit.theta -= (e.clientX - orbit.lastX) * 0.01
    orbit.phi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.phi + (e.clientY - orbit.lastY) * 0.01))
    orbit.lastX = e.clientX; orbit.lastY = e.clientY
    updateCamera(cameraRef.current, orbit)
  }, [])
  const onPointerUp = useCallback((e) => { orbitRef.current.dragging = false; e.currentTarget?.releasePointerCapture?.(e.pointerId) }, [])
  const onWheel = useCallback((e) => {
    e.preventDefault()
    const orbit = orbitRef.current
    orbit.radius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.radius + e.deltaY * 0.01))
    updateCamera(cameraRef.current, orbit)
  }, [])
  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) touchStartRef.current = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
  }, [])
  const onTouchMove = useCallback((e) => {
    if (e.touches.length !== 2 || !touchStartRef.current) return
    const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
    const orbit = orbitRef.current
    orbit.radius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.radius - (dist - touchStartRef.current) * 0.01))
    touchStartRef.current = dist
    updateCamera(cameraRef.current, orbit)
  }, [])
  const onKeyDown = useCallback((e) => {
    if (e.key === 'Tab') return
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
      case 'Escape':      setActivePin(null); return
      default: return
    }
    e.preventDefault(); setHint(false); updateCamera(cameraRef.current, orbit)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', marginBottom: 12, userSelect: 'none' }}>
      <canvas ref={canvasRef} width={800} height={height}
        style={{ width: '100%', height, display: 'block', borderRadius: 8,
                 cursor: pinMode ? 'crosshair' : 'grab', outline: 'none', touchAction: 'none' }}
        tabIndex={0} role="img"
        aria-label={caption || '3D model viewer — arrow keys orbit, +/- zoom, R reset, Tab to navigate annotations'}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onKeyDown={onKeyDown} onClick={handleCanvasClick} />

      {pinMode && !loading && (
        <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          background: 'color-mix(in srgb, var(--forge-amber) 15%, transparent)', border: '1px solid var(--forge-amber)',
          borderRadius: 20, padding: '4px 14px', fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
          fontSize: 10, fontWeight: 600, color: 'var(--forge-amber)', letterSpacing: '0.06em', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          ✦ click model surface to place annotation
        </div>
      )}

      {screenPins.map(pin => {
        if (!pin.visible) return null
        const ann = annotations.find(a => a.id === pin.id)
        if (!ann) return null
        const isActive = activePin === pin.id
        const color = ann.color || '#F59E0B'
        return (
          <div key={pin.id} role="button" tabIndex={0}
            aria-label={`${ann.label} — click for details`} aria-expanded={isActive} aria-haspopup="true"
            onClick={(e) => { e.stopPropagation(); setActivePin(isActive ? null : pin.id) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setActivePin(isActive ? null : pin.id) }
              if (e.key === 'Escape') setActivePin(null)
            }}
            style={{ position: 'absolute', left: pin.x, top: pin.y, transform: 'translate(-50%, -50%)', zIndex: isActive ? 30 : 20, cursor: 'pointer' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: color,
              border: '2px solid rgba(255,255,255,0.9)', boxShadow: `0 0 0 3px ${color}33, 0 2px 8px rgba(0,0,0,0.4)`,
              transition: REDUCE_MOTION ? 'none' : 'transform 0.15s', transform: isActive ? 'scale(1.35)' : 'scale(1)' }} />
            {!isActive && (
              <div className="dot-label" style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(4,44,83,0.9)', color: '#B5D4F4', fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
                fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 3, whiteSpace: 'nowrap',
                border: '1px solid rgba(24,95,165,0.4)', pointerEvents: 'none' }}>{ann.label}</div>
            )}
            {isActive && (
              <div role="tooltip" style={{ position: 'absolute', left: 18, top: -8, background: '#0d1017',
                border: '1px solid #1c2a3a', borderLeft: `3px solid ${color}`, borderRadius: 6, padding: '10px 14px',
                minWidth: 200, maxWidth: 280, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                animation: REDUCE_MOTION ? 'none' : 'fadeInPop 0.15s ease', zIndex: 40 }}>
                <div style={{ fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', fontSize: 9, fontWeight: 600,
                  color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{ann.label}</div>
                {ann.description && <div style={{ fontSize: 12, color: '#8AAAC0', lineHeight: 1.55 }}>{ann.description}</div>}
                <button onClick={(e) => { e.stopPropagation(); setActivePin(null) }} aria-label="Close annotation"
                  style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', color: '#3A5A7A', fontSize: 12, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>✕</button>
              </div>
            )}
          </div>
        )
      })}

      {loading && !error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: bgColor, borderRadius: 8, gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #1c2a3a', borderTopColor: 'var(--forge-amber)', animation: REDUCE_MOTION ? 'none' : 'spin3d 0.8s linear infinite' }} />
          <span style={{ fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', fontSize: 11, color: '#3A5A7A', letterSpacing: '0.08em' }}>Loading model…</span>
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: bgColor, borderRadius: 8, gap: 8, padding: 24, textAlign: 'center' }}>
          <span style={{ fontSize: 28 }}>⚠</span><span style={{ fontSize: 13, color: '#E87070' }}>{error}</span>
        </div>
      )}
      {hint && !loading && !error && !pinMode && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(4,44,83,0.75)', color: '#B5D4F4', fontSize: 10, fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', padding: '4px 10px', borderRadius: 20, letterSpacing: '0.06em', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          drag to rotate · scroll to zoom · R to reset
        </div>
      )}
      {!loading && !error && (
        <div aria-hidden="true" style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: '#3A5A7A', fontSize: 9, fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', padding: '3px 8px', borderRadius: 4, letterSpacing: '0.06em' }}>
          ↑↓←→ orbit · +/- zoom · R reset
        </div>
      )}
      {caption && <p style={{ fontSize: 12, color: 'var(--cf-text-tertiary)', marginTop: 6, fontFamily: 'var(--cf-font)' }}>{caption}</p>}

      <style>{`
        @keyframes spin3d { to { transform: rotate(360deg); } }
        @keyframes fadeInPop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .dot-label { opacity: 0; transition: opacity 0.15s; }
        [role="button"]:hover .dot-label { opacity: 1; }
        [role="button"]:focus-visible { outline: 2px solid var(--forge-amber); outline-offset: 3px; border-radius: 50%; }
        @media (prefers-reduced-motion: reduce) { .dot-label { transition: none; } }
      `}</style>
    </div>
  )
}
