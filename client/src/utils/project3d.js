// Shared 3D -> screen projection for the Model3DViewer overlays (annotation pins
// AND the floating part label). This is the React twin of the Forge3D viewer's
// projectToScreen() helper (forge-3d/electron/src/three-preview.js) — keep the
// visibility rules in step so pins/labels read the same in both tools, the same
// way calloutOverlay.js and scorm12.py are kept as twins.
//
// All points are world-space THREE.Vector3; w/h are the canvas CSS pixel size.

// Project a world point to canvas pixels + a visibility verdict.
//   x, y      screen pixels (top-left origin)
//   z         NDC depth (>=1 means behind the camera)
//   onScreen  NDC x/y inside [-1,1] (off-screen points would overflow the frame)
//   visible   in front of the camera, on-screen, and finite (the finite guard
//             covers a degenerate camera before the first updateCamera())
export function projectToScreen(worldPoint, camera, w, h) {
  const ndc = worldPoint.clone().project(camera)
  const x = (ndc.x * 0.5 + 0.5) * w
  const y = (-ndc.y * 0.5 + 0.5) * h
  const onScreen = ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1
  const visible = ndc.z < 1 && onScreen && Number.isFinite(x) && Number.isFinite(y)
  return { x, y, z: ndc.z, onScreen, visible }
}

// True when `model` geometry sits BETWEEN the camera and worldPoint, so a pin on
// the far side shouldn't show through. Casts camera -> point and compares the
// first hit distance to the point distance, with a small tolerance so the point's
// own surface doesn't flicker it off. Needs a THREE.Raycaster instance; its `far`
// is saved/restored so callers that reuse the raycaster (e.g. pickEntry) aren't
// left with a clamped range.
export function isOccluded(worldPoint, camera, model, raycaster) {
  if (!model || !raycaster) return false
  const prevFar = raycaster.far
  const dir = worldPoint.clone().sub(camera.position)
  const dist = dir.length()
  raycaster.set(camera.position, dir.normalize())
  raycaster.far = dist
  const hits = raycaster.intersectObject(model, true)
  raycaster.far = prevFar
  return hits.length > 0 && hits[0].distance < dist - Math.max(0.01, dist * 0.02)
}
