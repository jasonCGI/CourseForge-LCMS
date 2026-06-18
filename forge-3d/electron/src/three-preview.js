window.initForge3DPreview = function(container, glbPath) {
  const fileUrl = 'file:///' + glbPath.replace(/\\/g, '/')
  const canvas  = document.createElement('canvas')
  canvas.style.cssText = 'width:100%;height:100%;display:block;'
  container.appendChild(canvas)

  // esm.sh (not jsdelivr): the jsm GLTFLoader/OrbitControls do `import … from
  // 'three'` — a bare specifier that won't resolve without an import map.
  // esm.sh rewrites that bare import to a full URL, so these load standalone.
  import('https://esm.sh/three@0.165.0').then(THREE => {
    import('https://esm.sh/three@0.165.0/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      import('https://esm.sh/three@0.165.0/examples/jsm/controls/OrbitControls.js').then(({ OrbitControls }) => {

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
        renderer.setSize(canvas.offsetWidth, canvas.offsetHeight)
        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.1

        const scene    = new THREE.Scene()
        const camera   = new THREE.PerspectiveCamera(45, canvas.offsetWidth / canvas.offsetHeight, 0.01, 1000)
        const controls = new OrbitControls(camera, canvas)
        controls.enableDamping = true

        // Procedural "studio" IBL (no HDR file) so metallic/glossy materials
        // reflect — matches the CourseForge viewer's studio environment, so what
        // an author sees here is what they'll get after upload.
        try {
          const pmrem = new THREE.PMREMGenerator(renderer)
          const es = new THREE.Scene()
          es.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12),
            new THREE.MeshStandardMaterial({ side: THREE.BackSide, color: 0x767676, roughness: 1, metalness: 0 })))
          const panel = (hex, x, y, z, sx, sy, sz, it) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz),
              new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(hex), emissiveIntensity: it }))
            m.position.set(x, y, z); es.add(m)
          }
          panel(0xffffff, 0, 5.5, 0, 8, 0.2, 8, 1.4)
          panel(0xbcd4ff, -5.5, 0, 1, 0.2, 7, 7, 0.7)
          panel(0xffe2b0, 5.5, 0, -1, 0.2, 7, 7, 0.6)
          scene.environment = pmrem.fromScene(es, 0.04).texture
          es.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose() })
          pmrem.dispose()
        } catch (e) { /* IBL is a nice-to-have; lights below still render the model */ }

        scene.add(new THREE.AmbientLight(0xffffff, 0.5))
        const dir = new THREE.DirectionalLight(0xffffff, 1.0)
        dir.position.set(5, 10, 5)
        scene.add(dir)
        scene.add(new THREE.GridHelper(10, 20, 0x2E2E2E, 0x1A1A1A))

        new GLTFLoader().load(fileUrl, (gltf) => {
          const model = gltf.scene
          const box   = new THREE.Box3().setFromObject(model)
          const size  = box.getSize(new THREE.Vector3())
          model.position.sub(box.getCenter(new THREE.Vector3()))
          camera.position.set(size.x * 1.5, size.y * 1.5, size.z * 2)
          controls.update()
          scene.add(model)
        })

        ;(function animate() {
          requestAnimationFrame(animate)
          controls.update()
          renderer.render(scene, camera)
        })()

        window.addEventListener('resize', () => {
          camera.aspect = canvas.offsetWidth / canvas.offsetHeight
          camera.updateProjectionMatrix()
          renderer.setSize(canvas.offsetWidth, canvas.offsetHeight)
        })
      })
    })
  })
}
