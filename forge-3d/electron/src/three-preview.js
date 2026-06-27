window.initForge3DPreview = function(container, glbPath) {
  // Tear down a previous preview so repeated loads don't stack render loops.
  if (window.__forge3dCleanup) { try { window.__forge3dCleanup() } catch (e) {} window.__forge3dCleanup = null }
  const fileUrl = 'file:///' + glbPath.replace(/\\/g, '/')

  // Rebuild the preview area: a small control bar + the canvas.
  container.innerHTML = ''
  const bar = document.createElement('div')
  bar.className = 'f3d-viewer-bar'
  bar.innerHTML =
    '<div class="f3d-env-group" role="group" aria-label="Environment lighting">' +
      '<span class="f3d-viewer-bar-label">Environment</span>' +
      '<button type="button" data-env="day" class="active" aria-pressed="true">Day</button>' +
      '<button type="button" data-env="night" aria-pressed="false">Night</button>' +
      '<button type="button" data-env="studio" aria-pressed="false">Studio</button>' +
    '</div>' +
    '<button type="button" data-grid class="active" aria-pressed="true">Grid</button>' +
    '<button type="button" data-shadow class="active" aria-pressed="true" title="Soft contact shadow under the model">Shadow</button>' +
    '<button type="button" data-labels aria-pressed="false" title="Show part-name labels on the model">Labels</button>' +
    '<span class="f3d-viewer-bar-spacer"></span>' +
    '<button type="button" data-anim style="display:none" aria-pressed="true" title="Play / pause animation">⏸ Anim</button>' +
    '<input type="range" data-anim-scrub min="0" max="1000" value="0" style="display:none;width:90px;vertical-align:middle" title="Scrub the animation" aria-label="Animation time">' +
    '<button type="button" data-follow style="display:none" aria-pressed="false" title="Keep an animating model centered in view">⌖ Follow</button>' +
    '<button type="button" data-recenter title="Reframe the model in view">Recenter</button>' +
    '<button type="button" data-reset title="Reset the view + tools (section off, explode off, recenter)">↺ Reset</button>' +
    '<button type="button" data-capture title="Save a PNG of the current view">📷 Capture</button>'
  // Second row: model-inspection tools (section / explode / zoom) so the bar
  // doesn't wrap.
  const bar2 = document.createElement('div')
  bar2.className = 'f3d-viewer-bar'
  bar2.innerHTML =
    '<button type="button" data-section aria-pressed="false" title="Cross-section: slice the model to reveal internals">✂ Section</button>' +
    '<span data-section-ctl style="display:inline-flex;align-items:center;gap:6px;opacity:0.4;transition:opacity .15s">' +
      '<button type="button" data-section-axis title="Cut axis (X / Y / Z)">Y</button>' +
      '<input type="range" data-section-slider min="0" max="100" value="0" aria-label="Section position" style="width:90px;vertical-align:middle">' +
      '<button type="button" data-section-flip title="Flip the cut side">⇄</button>' +
    '</span>' +
    '<span class="f3d-viewer-bar-label" style="margin-left:10px">Explode</span>' +
    '<button type="button" data-explode-axis title="Explode direction: radial (from center) / X / Y / Z">⊕</button>' +
    '<button type="button" data-explode-origin title="Pick the explode origin: click a point on the model">⊙ Origin</button>' +
    '<span data-origin-name class="f3d-viewer-bar-label" style="max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="Explode origin">center</span>' +
    '<input type="range" data-explode-slider min="0" max="100" value="0" aria-label="Exploded view amount" title="Separate the parts" style="width:78px;vertical-align:middle">' +
    '<span class="f3d-viewer-bar-label" style="margin-left:10px">Zoom</span>' +
    '<input type="range" data-zoom-slider min="0" max="100" value="50" aria-label="Zoom" title="Dolly the camera (or use the mouse wheel)" style="width:78px;vertical-align:middle">'
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'flex:1;width:100%;display:block;min-height:0;'
  // HTML label overlay (CSS2DRenderer isn't in the offline bundle, so DIY).
  container.style.position = 'relative'
  const labelsLayer = document.createElement('div')
  labelsLayer.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:hidden;display:none'
  container.appendChild(bar)
  container.appendChild(bar2)
  container.appendChild(canvas)
  container.appendChild(labelsLayer)

  // three + addons are vendored locally (assets/vendor/three) so the preview
  // works fully offline. The addon copies have their bare `three` imports
  // rewritten to the local build. Paths resolve relative to src/index.html.
  const V = '../assets/vendor/three'
  Promise.all([
    import(V + '/three.module.js'),
    import(V + '/loaders/GLTFLoader.js'),
    import(V + '/loaders/RGBELoader.js'),
    import(V + '/controls/OrbitControls.js'),
    import(V + '/loaders/DRACOLoader.js'),
  ]).then(([THREE, { GLTFLoader }, { RGBELoader }, { OrbitControls }, { DRACOLoader }]) => {

    // preserveDrawingBuffer keeps the WebGL backbuffer readable so the Capture
    // button can pull a PNG of exactly what's on screen.
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.localClippingEnabled = true   // enables the Section / cross-cut tool

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true

    // A couple of soft lights so the model is lit even before the HDRI resolves.
    scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(5, 10, 5); scene.add(dir)

    const grid = new THREE.GridHelper(10, 20, 0x2E2E2E, 0x1A1A1A)
    scene.add(grid)

    // ── HDRI environments (Poly Haven, CC0; bundled under ../assets/hdri) ──────
    const ENVS = { studio: '../assets/hdri/studio.hdr', day: '../assets/hdri/day.hdr', night: '../assets/hdri/night.hdr' }
    const rgbe = new RGBELoader()
    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()
    let curEnvRT = null, curBg = null
    function setEnv(name) {
      const url = ENVS[name]; if (!url) return
      rgbe.load(url, (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping
        const rt = pmrem.fromEquirectangular(tex)         // PMREM for correct PBR reflections
        if (curEnvRT) curEnvRT.dispose()
        if (curBg) curBg.dispose()
        curEnvRT = rt; curBg = tex
        scene.environment = rt.texture
        scene.background = tex                              // show the HDRI so day/night reads clearly
      }, undefined, () => { /* keep current env on load error */ })
    }
    setEnv('day')

    bar.querySelectorAll('[data-env]').forEach((btn) => {
      btn.addEventListener('click', () => {
        bar.querySelectorAll('[data-env]').forEach((b) => {
          const on = b === btn
          b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on))
        })
        setEnv(btn.dataset.env)
      })
    })
    const gridBtn = bar.querySelector('[data-grid]')
    gridBtn.addEventListener('click', () => {
      grid.visible = !grid.visible
      gridBtn.classList.toggle('active', grid.visible)
      gridBtn.setAttribute('aria-pressed', String(grid.visible))
    })

    // ── Section / cross-cut ───────────────────────────────────────────────
    // One clipping plane on every model material; the toolbar drives its axis,
    // position (along the model's bbox), and side. Materials go DoubleSide while
    // active so the cut reveals the interior (capped cross-sections are a later
    // polish). `model` resolves async — these handlers run on click, after load.
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const CLIP_AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }
    const clipBox = new THREE.Box3()
    let clipOn = false, clipAxis = 'y', clipFlip = false, clipT = 0   // 0 = no cut (plane at the edge)
    function applyClipMaterials() {
      if (!model) return
      model.traverse((o) => {
        if (!o.isMesh) return
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          if (!m) continue
          if (m.__forgeSide === undefined) m.__forgeSide = m.side
          m.clippingPlanes = clipOn ? [clipPlane] : []
          m.side = clipOn ? THREE.DoubleSide : m.__forgeSide
          m.needsUpdate = true
        }
      })
    }
    function updateClipPlane() {
      if (!model) return
      const CLIP_MAX = 0.9   // max cut keeps a sliver so the model never fully vanishes
      clipBox.setFromObject(model)
      const n = CLIP_AXES[clipAxis].clone().multiplyScalar(clipFlip ? -1 : 1)
      const lo = clipBox.min[clipAxis], hi = clipBox.max[clipAxis]
      // Plane position from the slider only. Flip keeps the SAME plane and swaps
      // which side is kept -> "inverse what's shown" (the cut-away piece appears).
      const pos = lo + (hi - lo) * (clipT * CLIP_MAX)
      clipPlane.normal.copy(n)
      clipPlane.constant = -n[clipAxis] * pos
    }
    const secBtn = bar2.querySelector('[data-section]')
    const secCtl = bar2.querySelector('[data-section-ctl]')
    const secAxisBtn = bar2.querySelector('[data-section-axis]')
    const secSlider = bar2.querySelector('[data-section-slider]')
    const secFlipBtn = bar2.querySelector('[data-section-flip]')
    secBtn.addEventListener('click', () => {
      clipOn = !clipOn
      secBtn.classList.toggle('active', clipOn)
      secBtn.setAttribute('aria-pressed', String(clipOn))
      secCtl.style.opacity = clipOn ? '1' : '0.4'   // dim (not hide) -> no layout jump
      updateClipPlane(); applyClipMaterials()
    })
    secAxisBtn.addEventListener('click', () => {
      clipAxis = clipAxis === 'y' ? 'z' : clipAxis === 'z' ? 'x' : 'y'
      secAxisBtn.textContent = clipAxis.toUpperCase()
      updateClipPlane()
    })
    secSlider.addEventListener('input', () => { clipT = secSlider.value / 100; updateClipPlane() })
    secFlipBtn.addEventListener('click', () => {
      if (clipT <= 0.001) return     // nothing is cut -> nothing to invert
      clipFlip = !clipFlip           // same plane, swap kept side = inverse what's shown
      updateClipPlane()
    })

    // ── Exploded view ─────────────────────────────────────────────────────
    // Lazily capture each mesh's rest position + an outward unit direction (from
    // the model center, in the mesh's parent space), then offset by the slider.
    // Built on first use so it captures the ASSEMBLED rest pose. Best on static
    // models — a playing animation drives the same positions and will fight it.
    let explodeParts = null, explodeT = 0, explodeAxis = 'radial', explodeOrigin = null
    const EX_AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }
    function buildExplodeParts() {
      if (!model) { explodeParts = []; return }
      // Capture the true rest position once, and restore it before deriving parts,
      // so directions (and the reset target) are always relative to the ASSEMBLED
      // model — even when changing the axis mid-explode.
      model.traverse((o) => {
        if (!o.isMesh) return
        if (!o.userData.__restPos) o.userData.__restPos = o.position.clone()
        else o.position.copy(o.userData.__restPos)
      })
      explodeParts = []
      const mb = new THREE.Box3().setFromObject(model)
      const center = explodeOrigin ? explodeOrigin.clone() : mb.getCenter(new THREE.Vector3())
      const span = mb.getSize(new THREE.Vector3()).length() || 1
      const pInv = new THREE.Matrix4()
      model.traverse((o) => {
        if (!o.isMesh) return
        const wc = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
        let dir
        if (explodeAxis === 'radial') {
          dir = wc.sub(center)              // outward from the model center
          if (dir.lengthSq() < 1e-9) dir.set(0, 1, 0)
        } else {                            // translate along one axis, split by side
          const sign = Math.sign(wc[explodeAxis] - center[explodeAxis]) || 1
          dir = EX_AXES[explodeAxis].clone().multiplyScalar(sign)
        }
        o.parent.updateWorldMatrix(true, false)
        pInv.copy(o.parent.matrixWorld).invert()
        dir.transformDirection(pInv)        // -> unit direction in the mesh's parent space
        explodeParts.push({ mesh: o, base: o.userData.__restPos, dir, amt: span * 0.5 })
      })
    }
    function applyExplode() {
      if (!explodeParts) return
      for (const p of explodeParts) p.mesh.position.copy(p.base).addScaledVector(p.dir, explodeT * p.amt)
    }
    const explodeAxisBtn = bar2.querySelector('[data-explode-axis]')
    const explodeSlider = bar2.querySelector('[data-explode-slider]')
    explodeSlider.addEventListener('input', () => {
      if (!explodeParts) buildExplodeParts()
      explodeT = explodeSlider.value / 100
      applyExplode()
    })
    explodeAxisBtn.addEventListener('click', () => {
      explodeAxis = explodeAxis === 'radial' ? 'x' : explodeAxis === 'x' ? 'y' : explodeAxis === 'y' ? 'z' : 'radial'
      explodeAxisBtn.textContent = explodeAxis === 'radial' ? '⊕' : explodeAxis.toUpperCase()
      buildExplodeParts()       // recompute directions for the new axis
      applyExplode()
    })
    // Pick a custom explode origin by clicking on the model (orbit frozen while
    // armed). Defaults to the model center; handy to explode away from one part.
    let pickingOrigin = false
    const originRay = new THREE.Raycaster(), originNdc = new THREE.Vector2()
    const originBtn = bar2.querySelector('[data-explode-origin]')
    const originNameEl = bar2.querySelector('[data-origin-name]')
    originBtn.addEventListener('click', () => {
      pickingOrigin = !pickingOrigin
      originBtn.classList.toggle('active', pickingOrigin)
      canvas.style.cursor = pickingOrigin ? 'crosshair' : ''
      controls.enabled = !pickingOrigin            // freeze orbit so the click reads cleanly
    })
    canvas.addEventListener('pointerdown', (e) => {
      if (!pickingOrigin || !model) return
      const rect = canvas.getBoundingClientRect()
      originNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      originRay.setFromCamera(originNdc, camera)
      const hits = originRay.intersectObject(model, true)
      if (hits.length) {
        explodeOrigin = hits[0].point.clone()
        explodeAxis = 'radial'; explodeAxisBtn.textContent = '⊕'
        const obj = hits[0].object, p = explodeOrigin
        const nm = (obj.name || (obj.parent && obj.parent.name) || '').trim()
        originNameEl.textContent = nm || `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`
        originNameEl.title = 'Explode origin: ' + originNameEl.textContent
        buildExplodeParts(); applyExplode()
      }
      pickingOrigin = false; originBtn.classList.remove('active')
      canvas.style.cursor = ''; controls.enabled = true
    })

    // ── Hover highlight ───────────────────────────────────────────────────
    // Emissive glow on the mesh under the cursor (the OutlinePass substitute —
    // no postprocessing addon in the offline bundle). Restores on leave.
    const hoverRay = new THREE.Raycaster(), hoverNdc = new THREE.Vector2()
    let hovered = null
    function setHoverGlow(mesh, on) {
      if (!mesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        if (!m || !m.emissive) continue
        if (on) {
          if (m.__forgeEmis === undefined) { m.__forgeEmis = m.emissive.getHex(); m.__forgeEmisI = m.emissiveIntensity }
          m.emissive.setHex(0x2A3A55); m.emissiveIntensity = 1
        } else if (m.__forgeEmis !== undefined) {
          m.emissive.setHex(m.__forgeEmis); m.emissiveIntensity = m.__forgeEmisI
        }
      }
    }
    canvas.addEventListener('pointermove', (e) => {
      if (!model || pickingOrigin) return
      const rect = canvas.getBoundingClientRect()
      hoverNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      hoverRay.setFromCamera(hoverNdc, camera)
      const hits = hoverRay.intersectObject(model, true)
      const mesh = hits.length ? hits[0].object : null
      if (mesh === hovered) return
      setHoverGlow(hovered, false)
      hovered = mesh
      setHoverGlow(hovered, true)
    })
    canvas.addEventListener('pointerleave', () => { setHoverGlow(hovered, false); hovered = null })

    // ── Part labels (HTML overlay) ────────────────────────────────────────
    // Project each named mesh's centre to screen each frame and place an HTML
    // label over the canvas. projectToScreen() is the shareable helper CF's
    // annotation overlay can mirror: (worldPoint, camera, w, h) -> {x, y, visible}.
    let labelsOn = false
    const labelItems = []                          // { el, mesh, local }
    const _lblWorld = new THREE.Vector3(), _lblNdc = new THREE.Vector3()
    function projectToScreen(point, cam, w, h) {
      _lblNdc.copy(point).project(cam)
      const visible = _lblNdc.z < 1 && _lblNdc.x >= -1 && _lblNdc.x <= 1 && _lblNdc.y >= -1 && _lblNdc.y <= 1
      return { x: (_lblNdc.x * 0.5 + 0.5) * w, y: (-_lblNdc.y * 0.5 + 0.5) * h, visible }
    }
    function buildLabels() {
      labelItems.forEach(it => it.el.remove())
      labelItems.length = 0
      if (!model) return
      let i = 0
      model.traverse((o) => {
        if (!o.isMesh) return
        i++
        const name = (o.name || (o.parent && o.parent.name) || '').trim() || ('Part ' + i)
        if (o.geometry && !o.geometry.boundingBox) o.geometry.computeBoundingBox()
        const local = o.geometry && o.geometry.boundingBox
          ? o.geometry.boundingBox.getCenter(new THREE.Vector3()) : new THREE.Vector3()
        const el = document.createElement('div')
        el.textContent = name
        el.style.cssText = 'position:absolute;transform:translate(-50%,-50%);background:rgba(18,20,30,.85);' +
          'color:#C9C2FF;font:600 10px/1.2 system-ui,sans-serif;padding:2px 6px;border-radius:3px;' +
          'white-space:nowrap;border:1px solid rgba(123,110,253,.45)'
        labelsLayer.appendChild(el)
        labelItems.push({ el, mesh: o, local })
      })
    }
    function updateLabels() {
      if (!labelsOn || !model || !labelItems.length) return
      const w = labelsLayer.clientWidth, h = labelsLayer.clientHeight
      for (const it of labelItems) {
        _lblWorld.copy(it.local); it.mesh.localToWorld(_lblWorld)
        const s = projectToScreen(_lblWorld, camera, w, h)
        if (!s.visible) { it.el.style.display = 'none'; continue }
        it.el.style.display = ''
        it.el.style.left = s.x + 'px'; it.el.style.top = s.y + 'px'
      }
    }
    const labelsBtn = bar.querySelector('[data-labels]')
    labelsBtn.addEventListener('click', () => {
      labelsOn = !labelsOn
      labelsBtn.classList.toggle('active', labelsOn)
      labelsBtn.setAttribute('aria-pressed', String(labelsOn))
      if (labelsOn) buildLabels()
      labelsLayer.style.display = labelsOn ? '' : 'none'
    })

    // ── Contact shadow ────────────────────────────────────────────────────
    // A soft radial-gradient blob on a ground plane under the model (no
    // postprocessing addon needed — those aren't in the offline bundle). Sized to
    // the model's footprint after it loads.
    let shadowOn = true
    const shadowCanvas = document.createElement('canvas')
    shadowCanvas.width = shadowCanvas.height = 256
    const sctx = shadowCanvas.getContext('2d')
    const sgrad = sctx.createRadialGradient(128, 128, 8, 128, 128, 128)
    sgrad.addColorStop(0, 'rgba(0,0,0,0.45)')
    sgrad.addColorStop(1, 'rgba(0,0,0,0)')
    sctx.fillStyle = sgrad; sctx.fillRect(0, 0, 256, 256)
    const shadowTex = new THREE.CanvasTexture(shadowCanvas)
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat)
    shadowMesh.rotation.x = -Math.PI / 2
    shadowMesh.renderOrder = -1
    shadowMesh.visible = false
    scene.add(shadowMesh)
    function placeContactShadow() {
      if (!model) { shadowMesh.visible = false; return }
      const b = new THREE.Box3().setFromObject(model)
      const size = b.getSize(new THREE.Vector3())
      const c = b.getCenter(new THREE.Vector3())
      const r = (Math.max(size.x, size.z) * 1.6) || 1
      shadowMesh.scale.set(r, r, 1)
      shadowMesh.position.set(c.x, b.min.y + 0.001, c.z)
      shadowMesh.visible = shadowOn
    }
    const shadowBtn = bar.querySelector('[data-shadow]')
    shadowBtn.addEventListener('click', () => {
      shadowOn = !shadowOn
      shadowMesh.visible = shadowOn && !!model
      shadowBtn.classList.toggle('active', shadowOn)
      shadowBtn.setAttribute('aria-pressed', String(shadowOn))
    })

    // ── Double-click to focus ─────────────────────────────────────────────
    // Raycast the model on dblclick; tween the camera to frame the hit part (or
    // the whole model on a miss). The tween advances in the render loop.
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let focusAnim = null
    function focusOnBox(box) {
      const c = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z) || 0.1
      const _fov = camera.fov * Math.PI / 180
      const _fit = (maxDim / 2) / Math.tan(_fov / 2)
      const _dist = Math.max(_fit, _fit / camera.aspect) * 1.4
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target)
      if (dir.lengthSq() < 1e-6) dir.set(1, 0.7, 1)
      dir.normalize().multiplyScalar(_dist)
      focusAnim = { fp: camera.position.clone(), tp: c.clone().add(dir),
                    ft: controls.target.clone(), tt: c.clone(), t: 0 }
    }
    canvas.addEventListener('dblclick', (e) => {
      if (!model) return
      const rect = canvas.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObject(model, true)
      focusOnBox(new THREE.Box3().setFromObject(hits.length ? hits[0].object : model))
    })

    // ── Zoom slider ───────────────────────────────────────────────────────
    // Dolly the camera along its view direction; bounds set from the model size.
    // Two-way synced with the mouse wheel via OrbitControls' 'change' event.
    const zoomSlider = bar2.querySelector('[data-zoom-slider]')
    let zoomMin = 0.1, zoomMax = 100
    function setZoomBounds() {
      if (!model) return
      const md = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      const maxDim = Math.max(md.x, md.y, md.z) || 1
      const fit = (maxDim / 2) / Math.tan((camera.fov * Math.PI / 180) / 2)
      zoomMin = fit * 0.3; zoomMax = fit * 3.0
    }
    zoomSlider.addEventListener('input', () => {
      const d = zoomMin + (1 - parseFloat(zoomSlider.value) / 100) * (zoomMax - zoomMin)
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target)
      if (dir.lengthSq() < 1e-6) dir.set(1, 0.7, 1)
      camera.position.copy(controls.target).addScaledVector(dir.normalize(), d)
      controls.update()
    })
    controls.addEventListener('change', () => {
      if (zoomMax <= zoomMin) return
      const t = (camera.position.distanceTo(controls.target) - zoomMin) / (zoomMax - zoomMin)
      zoomSlider.value = String(Math.round((1 - Math.max(0, Math.min(1, t))) * 100))
    })

    // ── Reset everything ──────────────────────────────────────────────────
    // One clean escape hatch when the user gets lost: section off, explode off,
    // focus cancelled, and reframe the model.
    bar.querySelector('[data-reset]').addEventListener('click', () => {
      // Section off + clear the cut; controls back to defaults.
      clipOn = false; clipAxis = 'y'; clipFlip = false; clipT = 0
      secBtn.classList.remove('active'); secBtn.setAttribute('aria-pressed', 'false')
      secCtl.style.opacity = '0.4'
      secAxisBtn.textContent = 'Y'; secSlider.value = '0'
      applyClipMaterials()
      // Explode off + reassemble.
      explodeT = 0; explodeSlider.value = '0'
      explodeAxis = 'radial'; explodeAxisBtn.textContent = '⊕'; explodeOrigin = null
      if (originNameEl) originNameEl.textContent = 'center'
      applyExplode()               // parts back to their rest position
      explodeParts = null          // next explode rebuilds from the assembled pose
      // Cancel any focus tween, re-enable orbit (in case origin-pick was armed),
      // then reframe.
      focusAnim = null; controls.enabled = true
      frameModel()                 // recenter; the controls 'change' resyncs zoom
    })

    // Draco decoder bundled locally so Draco-compressed GLBs load offline.
    const draco = new DRACOLoader()
    draco.setDecoderPath(V + '/draco/')
    let mixer = null, model = null, followTarget = null, following = false, animMaxDur = 0
    const animScrub = bar.querySelector('[data-anim-scrub]')
    const clock = new THREE.Clock()
    const modelBox = new THREE.Box3()
    const tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpS = new THREE.Vector3()
    const lastCenter = new THREE.Vector3()

    // Reframe the camera to the model's current position (Recenter / on load).
    // Centers on the follow target (skeleton root for skinned motion, else the
    // model) and keeps the current orbit direction.
    function frameModel() {
      if (!model) return
      modelBox.setFromObject(model)
      if (modelBox.isEmpty()) return
      modelBox.getSize(tmpS)
      const maxDim = Math.max(tmpS.x, tmpS.y, tmpS.z) || 1
      if (followTarget) followTarget.getWorldPosition(tmpC); else modelBox.getCenter(tmpC)
      // Fill the viewport: distance that fits maxDim to the FOV (vertical, plus
      // the horizontal limit on portrait viewports) with a small margin. The old
      // 2.2x bounding-sphere multiple left the model tiny / "far away".
      const _fov = camera.fov * Math.PI / 180
      const _fit = (maxDim / 2) / Math.tan(_fov / 2)
      const _dist = Math.max(_fit, _fit / camera.aspect) * 1.2
      tmpD.subVectors(camera.position, controls.target)
      if (tmpD.lengthSq() < 1e-6) tmpD.set(1, 0.7, 1)
      tmpD.normalize().multiplyScalar(_dist)
      controls.target.copy(tmpC)
      camera.position.copy(tmpC).add(tmpD)
      controls.update()
      lastCenter.copy(tmpC)
    }

    // Translate the camera rig by the follow target's per-frame motion so an
    // animating model stays centered (orbit/zoom still work). Box3 ignores
    // skinning, so we track the skeleton root bone's world position instead.
    function followModel() {
      if (!followTarget) return
      followTarget.getWorldPosition(tmpC)
      tmpD.subVectors(tmpC, lastCenter)
      camera.position.add(tmpD)
      controls.target.add(tmpD)
      lastCenter.copy(tmpC)
    }

    const gltfLoader = new GLTFLoader()
    gltfLoader.setDRACOLoader(draco)
    gltfLoader.load(fileUrl, (gltf) => {
      model = gltf.scene
      // Some exports ship without vertex normals -> the model renders as a flat
      // black silhouette under lighting. Recompute them when absent (meshes that
      // already have normals are left untouched).
      model.traverse((o) => {
        if (o.isMesh && o.geometry && !o.geometry.getAttribute('normal')) {
          o.geometry.computeVertexNormals()
        }
      })
      const box = new THREE.Box3().setFromObject(model)
      model.position.sub(box.getCenter(new THREE.Vector3()))   // rest pose at origin
      scene.add(model)

      // Follow the skeleton root for skinned root-motion; else the model node.
      model.traverse((o) => {
        if (!followTarget && o.isSkinnedMesh && o.skeleton && o.skeleton.bones.length) {
          followTarget = o.skeleton.bones[0]
        }
      })
      if (!followTarget) followTarget = model
      setZoomBounds()
      frameModel()
      placeContactShadow()
      if (labelsOn) buildLabels()

      // Play every animation clip the GLB carries — confirms animation survived
      // conversion, and gives the viewer a live preview.
      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model)
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play())
        animMaxDur = Math.max(0.001, ...gltf.animations.map(c => c.duration || 0))
        const animBtn = bar.querySelector('[data-anim]')
        const setAnimLabel = (playing) => {
          animBtn.setAttribute('aria-pressed', String(playing))
          animBtn.textContent = `${playing ? '⏸' : '▶'} Anim (${gltf.animations.length})`
        }
        animBtn.style.display = ''
        if (animScrub) animScrub.style.display = ''
        setAnimLabel(true)
        animBtn.addEventListener('click', () => {
          const playing = mixer.timeScale !== 0
          mixer.timeScale = playing ? 0 : 1
          setAnimLabel(!playing)
        })
        if (animScrub) animScrub.addEventListener('input', () => {
          mixer.timeScale = 0                       // scrubbing pauses playback
          mixer.setTime((animScrub.value / 1000) * animMaxDur)
          setAnimLabel(false)
        })
        // Follow only matters when something moves — reveal it for animated models.
        bar.querySelector('[data-follow]').style.display = ''
      }
    })

    // ── Recenter / Follow ────────────────────────────────────────────────────
    bar.querySelector('[data-recenter]').addEventListener('click', frameModel)
    const followBtn = bar.querySelector('[data-follow]')
    followBtn.addEventListener('click', () => {
      following = !following
      if (following && followTarget) followTarget.getWorldPosition(lastCenter)  // baseline; no jump
      followBtn.classList.toggle('active', following)
      followBtn.setAttribute('aria-pressed', String(following))
    })

    // ── Capture: save a PNG of the current view to a chosen location ──────────
    bar.querySelector('[data-capture]').addEventListener('click', () => {
      renderer.render(scene, camera)                    // ensure the buffer is current
      const dataUrl = renderer.domElement.toDataURL('image/png')
      const base = (glbPath.split(/[\\/]/).pop() || 'forge3d').replace(/\.(glb|gltf)$/i, '')
      window.forge3d.saveScreenshot(dataUrl, base + '.png')
    })

    function fit() {
      const w = canvas.clientWidth, h = canvas.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
      labelsLayer.style.left = canvas.offsetLeft + 'px'; labelsLayer.style.top = canvas.offsetTop + 'px'
      labelsLayer.style.width = w + 'px'; labelsLayer.style.height = h + 'px'
    }
    new ResizeObserver(fit).observe(canvas); fit()

    let rafId
    ;(function animate() {
      rafId = requestAnimationFrame(animate)
      const dt = clock.getDelta()
      if (mixer) {
        mixer.update(dt)
        if (animScrub && animMaxDur && mixer.timeScale !== 0)
          animScrub.value = String(Math.round(((mixer.time % animMaxDur) / animMaxDur) * 1000))
      }
      if (following) followModel()
      if (focusAnim) {
        focusAnim.t = Math.min(1, focusAnim.t + dt / 0.4)
        const e = focusAnim.t * focusAnim.t * (3 - 2 * focusAnim.t)   // smoothstep
        camera.position.lerpVectors(focusAnim.fp, focusAnim.tp, e)
        controls.target.lerpVectors(focusAnim.ft, focusAnim.tt, e)
        if (focusAnim.t >= 1) focusAnim = null
      }
      controls.update()
      renderer.render(scene, camera)
      updateLabels()
    })()

    // Expose teardown for the next initForge3DPreview call.
    window.__forge3dCleanup = function () {
      cancelAnimationFrame(rafId)
      try { if (mixer) mixer.stopAllAction() } catch (e) {}
      try { controls.dispose() } catch (e) {}
      try { if (curEnvRT) curEnvRT.dispose() } catch (e) {}
      try { if (curBg) curBg.dispose() } catch (e) {}
      try { pmrem.dispose() } catch (e) {}
      try { draco.dispose() } catch (e) {}
      try { shadowTex.dispose(); shadowMat.dispose(); shadowMesh.geometry.dispose() } catch (e) {}
      try { renderer.dispose() } catch (e) {}
    }
  })
}
