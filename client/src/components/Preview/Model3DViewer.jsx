import React, { useEffect, useRef, useState, useCallback, useId } from 'react'

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
const GLTF_CDN  = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'
const DRACO_CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/DRACOLoader.js'
const RGBE_CDN  = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/RGBELoader.js'
const DRACO_DECODER = 'https://www.gstatic.com/draco/v1/decoders/'   // Draco WASM decoder (for compressed GLBs)

// Bundled equirectangular HDRIs (served from client/public/hdri). 'studio' is
// procedural (no file) — these are the real image-based presets.
const HDRI_URLS = { day: '/hdri/day.hdr', night: '/hdri/night.hdr' }

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

// Procedural studio environment (image-based lighting) — no HDR file, CSP/offline
// safe. Gives metallic/glossy PBR surfaces real reflections via scene.environment.
function buildStudioEnv(THREE, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = new THREE.Scene()
  env.add(new THREE.Mesh(
    new THREE.BoxGeometry(12, 12, 12),
    new THREE.MeshStandardMaterial({ side: THREE.BackSide, color: 0x767676, roughness: 1, metalness: 0 })
  ))
  const panel = (hex, x, y, z, sx, sy, sz, intensity) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(hex), emissiveIntensity: intensity }))
    m.position.set(x, y, z); env.add(m)
  }
  panel(0xffffff, 0, 5.5, 0, 8, 0.2, 8, 1.4)    // top key
  panel(0xbcd4ff, -5.5, 0, 1, 0.2, 7, 7, 0.7)   // cool left
  panel(0xffe2b0, 5.5, 0, -1, 0.2, 7, 7, 0.6)   // warm right
  const tex = pmrem.fromScene(env, 0.04).texture
  env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose() })
  pmrem.dispose()
  return tex
}

// Load an equirectangular .hdr and PMREM-process it into a scene.environment
// texture. Async (returns a Promise) — RGBELoader must already be loaded.
function buildHdriEnv(THREE, renderer, url) {
  return new Promise((resolve, reject) => {
    if (!THREE.RGBELoader) { reject(new Error('RGBELoader unavailable')); return }
    new THREE.RGBELoader().load(url, (hdr) => {
      try {
        const pmrem = new THREE.PMREMGenerator(renderer)
        const tex = pmrem.fromEquirectangular(hdr).texture
        hdr.dispose(); pmrem.dispose()
        resolve(tex)
      } catch (e) { reject(e) }
    }, undefined, reject)
  })
}

// Scale how strongly the env map reflects per material (envMapIntensity is a
// plain uniform — no needsUpdate/shader recompile needed).
function applyEnvIntensity(model, intensity) {
  if (!model) return
  model.traverse(o => {
    if (!o.material) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    mats.forEach(mat => { if ('envMapIntensity' in mat) mat.envMapIntensity = intensity })
  })
}

// Highlight a part by swapping each of its meshes to an emissive material clone
// — isolated so meshes that share a material (e.g. cup + saucer both on cup_Mat)
// highlight independently. level: 0 none · 1 hover · 2 selected.
function setEntryLevel(THREE, entry, level) {
  if (entry.level === level) return
  entry.level = level
  entry.meshes.forEach((mesh, i) => {
    const orig = entry.origMats[i]
    if (level === 0) {
      mesh.material = orig
      const cl = entry.clones[i]
      if (cl) { (Array.isArray(cl) ? cl : [cl]).forEach(m => m.dispose?.()); entry.clones[i] = null }
      return
    }
    if (!entry.clones[i]) entry.clones[i] = Array.isArray(orig) ? orig.map(m => m.clone()) : orig.clone()
    const intensity = level === 2 ? 0.6 : 0.28
    const cl = entry.clones[i]
    ;(Array.isArray(cl) ? cl : [cl]).forEach(m => {
      if ('emissive' in m) { m.emissive = new THREE.Color(0xF59E0B); m.emissiveIntensity = intensity; m.needsUpdate = true }
    })
    mesh.material = cl
  })
}

export default function Model3DViewer({
  modelUrl, caption, attribution = '', bgColor = '#0d1017', height = 400,
  annotations = [], pinMode = false, onPinPlaced = null, onLoad = null,
  environment = 'studio', envIntensity = 1, decorative = false, autoRotate = false,
  partHighlight = false, parts = {}, selectedPartKey = null,
  onPartSelect = null, onPartsDetected = null,
}) {
  const canvasRef   = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef   = useRef(null)
  const sceneRef    = useRef(null)
  const modelRef    = useRef(null)
  const raycasterRef = useRef(null)
  const envRef      = useRef(null)
  const frameRef    = useRef(null)
  const annsRef     = useRef(annotations)
  const lastPinsRef = useRef([])
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

  // Read autoRotate/pinMode in the animation loop without re-creating the scene.
  const autoRotateRef = useRef(autoRotate)
  useEffect(() => { autoRotateRef.current = autoRotate }, [autoRotate])
  const pinModeRef = useRef(pinMode)
  useEffect(() => { pinModeRef.current = pinMode }, [pinMode])

  // Part-highlighting: parts[] = {key, meshes[], origMats[], clones[], level, centroid}.
  const partsRef       = useRef([])
  const partHLRef      = useRef(partHighlight)
  const partsCfgRef    = useRef(parts)
  const selKeyRef      = useRef(selectedPartKey)
  const hoverKeyRef    = useRef(null)
  const downPosRef     = useRef(null)   // click-vs-drag discrimination
  const [partLabel, setPartLabel] = useState(null)   // {x,y,text,visible}
  useEffect(() => { partHLRef.current = partHighlight }, [partHighlight])
  useEffect(() => { partsCfgRef.current = parts }, [parts])

  // Repaint every part's highlight from the current selected/hover keys.
  const applyLevels = useCallback(() => {
    const THREE = window.THREE
    if (!THREE) return
    const sel = selKeyRef.current, hov = hoverKeyRef.current
    partsRef.current.forEach(e => setEntryLevel(THREE, e, e.key === sel ? 2 : (e.key === hov ? 1 : 0)))
  }, [])

  // Raycast a screen point to the part (entry) it hits, or null.
  const pickEntry = useCallback((clientX, clientY) => {
    const THREE = window.THREE, canvas = canvasRef.current, camera = cameraRef.current, model = modelRef.current
    if (!THREE || !canvas || !camera || !model) return null
    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    const y = -((clientY - rect.top) / rect.height) * 2 + 1
    const rc = raycasterRef.current || (raycasterRef.current = new THREE.Raycaster())
    rc.setFromCamera({ x, y }, camera)
    const hits = rc.intersectObject(model, true)
    if (!hits.length) return null
    return partsRef.current.find(e => e.meshes.includes(hits[0].object)) || null
  }, [])

  // Controlled selection: repaint when the parent changes selectedPartKey.
  useEffect(() => { selKeyRef.current = selectedPartKey; applyLevels() }, [selectedPartKey, applyLevels])

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
    if (!camera || !renderer || !anns?.length) {
      if (lastPinsRef.current.length) { lastPinsRef.current = []; setScreenPins([]) }
      return
    }
    const THREE = window.THREE
    const canvas = renderer.domElement
    const w = canvas.clientWidth, h = canvas.clientHeight
    const model = modelRef.current
    const rc = raycasterRef.current || (raycasterRef.current = new THREE.Raycaster())
    const pins = anns.map(ann => {
      const world = new THREE.Vector3(ann.position.x, ann.position.y, ann.position.z)
      const ndc = world.clone().project(camera)
      const x = (ndc.x * 0.5 + 0.5) * w, y = (-ndc.y * 0.5 + 0.5) * h
      // Occlusion: cast camera→pin and hide the pin if the mesh sits in front of
      // it (so pins on the far side don't show through the model). far=dist limits
      // the ray to between camera and pin; a small tolerance avoids the pin's own
      // surface flickering it off.
      let occluded = false
      if (model) {
        const dir = world.clone().sub(camera.position)
        const dist = dir.length()
        rc.set(camera.position, dir.normalize())
        rc.far = dist
        const hits = rc.intersectObject(model, true)
        occluded = hits.length > 0 && hits[0].distance < dist - Math.max(0.01, dist * 0.02)
      }
      // Hide a pin that's behind the camera (ndc.z>=1) OR projects OUTSIDE the
      // canvas (|ndc.x|>1 / |ndc.y|>1) — otherwise zooming in pushes pins past the
      // viewport edge where they'd overflow the frame. Non-finite NDC (degenerate
      // camera before first updateCamera) is also not-visible.
      const onScreen = ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1
      return { id: ann.id, x, y, visible: ndc.z < 1.0 && onScreen && !occluded && Number.isFinite(x) && Number.isFinite(y) }
    })
    // This runs every animation frame. Only re-render React when a pin actually
    // moved (>0.5px) or flipped visibility — otherwise a static model would
    // setState 60×/sec and re-render the whole viewer continuously.
    const prev = lastPinsRef.current
    let changed = pins.length !== prev.length
    if (!changed) {
      for (let i = 0; i < pins.length; i++) {
        const a = pins[i], b = prev[i]
        if (a.id !== b.id || a.visible !== b.visible ||
            Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5) { changed = true; break }
      }
    }
    if (changed) { lastPinsRef.current = pins; setScreenPins(pins) }
  }, [])

  // Float a label over the active (selected, else hovered) part each frame.
  const lastPartLabelRef = useRef(null)
  const projectPartLabel = useCallback((camera, renderer) => {
    const clear = () => { if (lastPartLabelRef.current) { lastPartLabelRef.current = null; setPartLabel(null) } }
    const THREE = window.THREE
    const key = selKeyRef.current || hoverKeyRef.current
    const entry = key && partsRef.current.find(e => e.key === key)
    if (!partHLRef.current || !entry || !camera || !THREE) { clear(); return }
    const canvas = renderer.domElement
    const w = canvas.clientWidth, h = canvas.clientHeight
    const ndc = entry.centroid.clone().project(camera)
    const x = (ndc.x * 0.5 + 0.5) * w, y = (-ndc.y * 0.5 + 0.5) * h
    const visible = ndc.z < 1 && Number.isFinite(x) && Number.isFinite(y)
    const text = (partsCfgRef.current[key] || {}).label || key
    const prev = lastPartLabelRef.current
    if (!visible) { clear(); return }
    if (!prev || prev.text !== text || Math.abs(prev.x - x) > 0.5 || Math.abs(prev.y - y) > 0.5) {
      const next = { x, y, text }
      lastPartLabelRef.current = next; setPartLabel(next)
    }
  }, [])

  useEffect(() => {
    // Sequential, NOT Promise.all: the legacy global GLTFLoader references
    // window.THREE at execution time, so THREE must finish loading first —
    // parallel loading races and throws "THREE is not defined" (uncaught → blank).
    loadScript(THREE_CDN)
      .then(() => loadScript(GLTF_CDN))
      .then(() => loadScript(DRACO_CDN))
      .then(() => loadScript(RGBE_CDN).catch(() => {}))   // HDRI presets optional; studio still works
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
    const gltfLoader = new THREE.GLTFLoader()
    if (THREE.DRACOLoader) {           // decode Draco-compressed GLBs
      const draco = new THREE.DRACOLoader()
      draco.setDecoderPath(DRACO_DECODER)
      gltfLoader.setDRACOLoader(draco)
    }
    gltfLoader.load(modelUrl, (gltf) => {
      const model = gltf.scene
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const scale = 2.0 / Math.max(size.x, size.y, size.z)
      model.scale.setScalar(scale); model.position.sub(center.multiplyScalar(scale))
      scene.add(model)
      modelRef.current = model
      if (scene.environment) applyEnvIntensity(model, envIntensity)   // env may already be set

      // Detect selectable PARTS: group meshes by name (each named mesh is a part;
      // meshes sharing a name merge into one). Centroid is the part's world-space
      // bounding-box center, for the floating label anchor.
      const byKey = new Map()
      model.updateMatrixWorld(true)
      model.traverse(o => {
        if (!o.isMesh) return
        const key = o.name || `Part ${byKey.size + 1}`
        if (!byKey.has(key)) byKey.set(key, { key, meshes: [], origMats: [], clones: [], level: 0, box: new THREE.Box3() })
        const e = byKey.get(key)
        e.meshes.push(o); e.origMats.push(o.material); e.clones.push(null)
        e.box.expandByObject(o)
      })
      const partsList = [...byKey.values()]
      partsList.forEach(e => { e.centroid = e.box.getCenter(new THREE.Vector3()) })
      partsRef.current = partsList
      onPartsDetected?.(partsList.map(e => ({ key: e.key })))
      applyLevels()   // reflect any pre-set selection

      orbitRef.current.radius = 3; updateCamera(camera, orbitRef.current)
      setLoading(false); onLoad?.()
    }, undefined, () => { setError('Failed to load 3D model.'); setLoading(false) })

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)
      // Auto-rotate by orbiting the CAMERA (not the model) so annotation pins
      // stay glued to the surface. Pauses while dragging, in pin-placement mode,
      // and for reduced-motion users.
      const o = orbitRef.current
      if (autoRotateRef.current && !o.dragging && !pinModeRef.current && !REDUCE_MOTION) {
        o.theta += 0.005
        updateCamera(camera, o)
      }
      renderer.render(scene, camera)
      projectAnnotations(camera, renderer)
      projectPartLabel(camera, renderer)
    }
    animate()

    const ro = new ResizeObserver(() => {
      const w2 = canvas.clientWidth || w
      renderer.setSize(w2, height); camera.aspect = w2 / height; camera.updateProjectionMatrix()
    })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(frameRef.current); ro.disconnect()
      if (envRef.current) { envRef.current.dispose(); envRef.current = null }
      modelRef.current = null; partsRef.current = []
      hoverKeyRef.current = null; lastPartLabelRef.current = null
      renderer.dispose()
    }
    // bgColor/height are intentionally NOT deps — changing them must not tear
    // down the scene + re-download the GLB. They're applied in place below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threeReady, modelUrl, projectAnnotations])

  // Apply background-color changes in place (no scene rebuild).
  useEffect(() => {
    const scene = sceneRef.current
    if (scene && window.THREE) scene.background = new window.THREE.Color(bgColor)
  }, [bgColor])

  // Build/clear the environment map (IBL) — the expensive PMREM step runs only
  // on environment/model change, never on an intensity drag.
  useEffect(() => {
    if (!threeReady) return
    const THREE = window.THREE, renderer = rendererRef.current, scene = sceneRef.current
    if (!THREE || !renderer || !scene) return
    let cancelled = false
    if (envRef.current) { envRef.current.dispose(); envRef.current = null }
    const setEnv = (tex) => {
      // A later environment change may have resolved first — drop a stale async result.
      if (cancelled) { try { tex && tex.dispose() } catch (_) {} ; return }
      if (envRef.current) { envRef.current.dispose() }
      envRef.current = tex; scene.environment = tex
      applyEnvIntensity(modelRef.current, envIntensity)   // model may already be loaded
    }
    if (environment === 'none' || !environment) {
      scene.environment = null
    } else if (HDRI_URLS[environment]) {
      buildHdriEnv(THREE, renderer, HDRI_URLS[environment])
        .then(setEnv)
        .catch((e) => {   // HDRI missing/failed → fall back to procedural studio
          if (cancelled) return
          try { console.warn('[Forge3D] HDRI load failed, using studio', e) } catch (_) {}
          try { setEnv(buildStudioEnv(THREE, renderer)) } catch (_) { scene.environment = null }
        })
    } else {   // 'studio' (procedural) or any unknown name
      try { setEnv(buildStudioEnv(THREE, renderer)) }
      catch (e) { scene.environment = null; try { console.warn('[Forge3D] environment build failed', e) } catch (_) {} }
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threeReady, environment, modelUrl])

  // Apply reflection intensity (cheap per-material scalar). When env is off,
  // restore the default 1 (NOT 0) so a GLB's own baked envMap still shows.
  useEffect(() => {
    if (!threeReady) return
    const on = environment && environment !== 'none'
    applyEnvIntensity(modelRef.current, on ? envIntensity : 1)
  }, [threeReady, environment, envIntensity, modelUrl])

  // Apply height/resize in place (no scene rebuild, no GLB re-fetch).
  useEffect(() => {
    const renderer = rendererRef.current, camera = cameraRef.current, canvas = canvasRef.current
    if (!renderer || !camera || !canvas) return
    const w = canvas.clientWidth || 800
    renderer.setSize(w, height); camera.aspect = w / height; camera.updateProjectionMatrix()
  }, [height])

  const handleCanvasClick = useCallback((e) => {
    // Part-highlight select (takes priority when enabled, not while placing a pin).
    if (partHighlight && !pinMode) {
      const dp = downPosRef.current
      if (dp && Math.hypot(e.clientX - dp.x, e.clientY - dp.y) > 6) return   // was a drag
      const entry = pickEntry(e.clientX, e.clientY)
      const key = entry ? entry.key : null
      const next = selKeyRef.current === key ? null : key
      if (onPartSelect) onPartSelect(next)
      else { selKeyRef.current = next; applyLevels() }
      return
    }
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
  }, [pinMode, onPinPlaced, partHighlight, onPartSelect, pickEntry, applyLevels])

  const onPointerDown = useCallback((e) => {
    if (pinMode) return
    if (e.button !== undefined && e.button !== 0) return
    downPosRef.current = { x: e.clientX, y: e.clientY }
    orbitRef.current.dragging = true
    orbitRef.current.lastX = e.clientX; orbitRef.current.lastY = e.clientY
    setHint(false); e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [pinMode])
  const onPointerMove = useCallback((e) => {
    const orbit = orbitRef.current
    if (!orbit.dragging) {
      // Hover-highlight the part under the cursor (when enabled, not placing a pin).
      if (partHighlight && !pinMode) {
        const entry = pickEntry(e.clientX, e.clientY)
        const k = entry ? entry.key : null
        if (k !== hoverKeyRef.current) {
          hoverKeyRef.current = k; applyLevels()
          const c = canvasRef.current; if (c) c.style.cursor = k ? 'pointer' : 'grab'
        }
      }
      return
    }
    orbit.theta -= (e.clientX - orbit.lastX) * 0.01
    // Drag DOWN tilts the model's top toward the viewer (grab-the-model feel),
    // not flight-stick pitch where pulling down looks up at the underside.
    orbit.phi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.phi - (e.clientY - orbit.lastY) * 0.01))
    orbit.lastX = e.clientX; orbit.lastY = e.clientY
    updateCamera(cameraRef.current, orbit)
  }, [partHighlight, pinMode, pickEntry, applyLevels])
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
      case 'ArrowUp':    orbit.phi = Math.min(orbit.maxPhi, orbit.phi + step); break
      case 'ArrowDown':  orbit.phi = Math.max(orbit.minPhi, orbit.phi - step); break
      case '+': case '=': orbit.radius = Math.max(orbit.minRadius, orbit.radius - 0.2); break
      case '-':           orbit.radius = Math.min(orbit.maxRadius, orbit.radius + 0.2); break
      case 'r': case 'R': orbit.theta = 0; orbit.phi = Math.PI / 4; orbit.radius = 3; break
      case 'Escape':      setActivePin(null); return
      default: return
    }
    e.preventDefault(); setHint(false); updateCamera(cameraRef.current, orbit)
  }, [])

  return (
    <div style={{ width: '100%', marginBottom: 12, userSelect: 'none' }}>
      {/* Stage wraps the canvas + absolute overlays so the bottom hint pill
          anchors to the canvas, not the caption that flows below it. */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 8 }}>
      <canvas ref={canvasRef} width={800} height={height}
        style={{ width: '100%', height, display: 'block', borderRadius: 8,
                 cursor: pinMode ? 'crosshair' : 'grab', outline: 'none', touchAction: 'none' }}
        tabIndex={decorative ? -1 : 0} role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : (caption || '3D model viewer — arrow keys orbit, +/- zoom, R reset, Tab to navigate annotations')}
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
      {attribution && !loading && !error && (
        <div style={{ position: 'absolute', bottom: 6, left: 8, maxWidth: '70%',
          background: 'rgba(0,0,0,0.45)', color: '#9FB4CC', fontSize: 8.5,
          fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', padding: '2px 7px',
          borderRadius: 4, letterSpacing: '0.03em', pointerEvents: 'none', lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {attribution}
        </div>
      )}
      {partHighlight && partLabel && (
        <div aria-hidden="true" style={{ position: 'absolute', left: partLabel.x, top: partLabel.y,
          transform: 'translate(-50%, calc(-100% - 10px))', zIndex: 25, pointerEvents: 'none',
          background: 'rgba(4,44,83,0.92)', color: '#FAC775', border: '1px solid var(--forge-amber, #F59E0B)',
          borderRadius: 14, padding: '3px 11px', fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)',
          fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap', boxShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>
          {partLabel.text}
        </div>
      )}
      </div>
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
