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
    '<button type="button" data-grid class="active" aria-pressed="true">Grid</button>'
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
  ]).then(([THREE, { GLTFLoader }, { RGBELoader }, { OrbitControls }]) => {

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
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

    new GLTFLoader().load(fileUrl, (gltf) => {
      const model = gltf.scene
      const box   = new THREE.Box3().setFromObject(model)
      const size  = box.getSize(new THREE.Vector3())
      model.position.sub(box.getCenter(new THREE.Vector3()))
      camera.position.set(size.x * 1.5, size.y * 1.5, size.z * 2 || 3)
      controls.update()
      scene.add(model)
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
      controls.update()
      renderer.render(scene, camera)
    })()

    // Expose teardown for the next initForge3DPreview call.
    window.__forge3dCleanup = function () {
      cancelAnimationFrame(rafId)
      try { controls.dispose() } catch (e) {}
      try { if (curEnvRT) curEnvRT.dispose() } catch (e) {}
      try { if (curBg) curBg.dispose() } catch (e) {}
      try { pmrem.dispose() } catch (e) {}
      try { renderer.dispose() } catch (e) {}
    }
  })
}
