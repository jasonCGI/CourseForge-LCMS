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
      '<button type="button" data-env="studio" class="active" aria-pressed="true">Studio</button>' +
      '<button type="button" data-env="day" aria-pressed="false">Day</button>' +
      '<button type="button" data-env="night" aria-pressed="false">Night</button>' +
    '</div>' +
    '<button type="button" data-grid class="active" aria-pressed="true">Grid</button>' +
    '<span class="f3d-viewer-bar-spacer"></span>' +
    '<button type="button" data-anim style="display:none" aria-pressed="true" title="Play / pause animation">⏸ Anim</button>' +
    '<button type="button" data-follow style="display:none" aria-pressed="false" title="Keep an animating model centered in view">⌖ Follow</button>' +
    '<button type="button" data-recenter title="Reframe the model in view">Recenter</button>' +
    '<button type="button" data-capture title="Save a PNG of the current view">📷 Capture</button>'
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'flex:1;width:100%;display:block;min-height:0;'
  container.appendChild(bar)
  container.appendChild(canvas)

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
    setEnv('studio')

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

    // Draco decoder bundled locally so Draco-compressed GLBs load offline.
    const draco = new DRACOLoader()
    draco.setDecoderPath(V + '/draco/')
    let mixer = null, model = null, followTarget = null, following = false
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
      tmpD.subVectors(camera.position, controls.target)
      if (tmpD.lengthSq() < 1e-6) tmpD.set(1, 0.7, 1)
      tmpD.normalize().multiplyScalar(maxDim * 2.2)
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
      frameModel()

      // Play every animation clip the GLB carries — confirms animation survived
      // conversion, and gives the viewer a live preview.
      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model)
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play())
        const animBtn = bar.querySelector('[data-anim]')
        animBtn.style.display = ''
        animBtn.textContent = `⏸ Anim (${gltf.animations.length})`
        animBtn.addEventListener('click', () => {
          const playing = mixer.timeScale !== 0
          mixer.timeScale = playing ? 0 : 1
          animBtn.setAttribute('aria-pressed', String(!playing))
          animBtn.textContent = `${playing ? '▶' : '⏸'} Anim (${gltf.animations.length})`
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
    }
    new ResizeObserver(fit).observe(canvas); fit()

    let rafId
    ;(function animate() {
      rafId = requestAnimationFrame(animate)
      const dt = clock.getDelta()
      if (mixer) mixer.update(dt)
      if (following) followModel()
      controls.update()
      renderer.render(scene, camera)
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
      try { renderer.dispose() } catch (e) {}
    }
  })
}
