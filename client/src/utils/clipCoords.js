// ForgeClip coordinate helpers — IDENTICAL math across every surface that renders
// a .clip.json (standalone ForgeClip, CF preview IVideoRuntime, CF inline editor
// IVideoBlock, and the published sco_shell vanilla JS). See the coord contract:
// interaction `data.x`/`data.y` = shape CENTER in NATIVE px, `data.w`/`data.h` =
// size in NATIVE px, relative to `clip.video.width`/`height`. Legacy % clips (no
// `clip.coords === 'px'`) auto-convert ONCE on load via normalizeClipToPx.
//
// IMPORTANT: the published renderer (server/templates/sco_shell*.html) re-implements
// this same math in vanilla JS. Any change here MUST be mirrored there to preserve
// byte-for-byte render parity between preview and published.

// Native pixel resolution of the clip's video, with the contract fallback.
export function nativeRes(clip) {
  const v = (clip && clip.video) || {}
  return { nW: v.width || 1920, nH: v.height || 1080 }
}

// Hard-switch legacy %-coords -> native px. Idempotent via the `coords` marker, so
// it is safe to call on every load. Mutates and returns the clip.
// NOTE: if the real native resolution is not yet known (video not loaded), defer the
// call until loadedmetadata and seed clip.video.width/height first, so the conversion
// uses the REAL native res rather than the 1920x1080 fallback.
export function normalizeClipToPx(clip) {
  if (!clip) return clip
  if (clip.coords === 'px') return clip
  const { nW, nH } = nativeRes(clip)
  const ints = clip.interactions || []
  for (const it of ints) {
    const d = it && it.data
    if (!d) continue
    if (d.x != null) d.x = Math.round((d.x / 100) * nW)
    if (d.y != null) d.y = Math.round((d.y / 100) * nH)
    if (d.w != null) d.w = Math.round((d.w / 100) * nW)
    if (d.h != null) d.h = Math.round((d.h / 100) * nH)
  }
  clip.coords = 'px'
  clip.schema_version = '2.0'
  return clip
}

// Render mapping: native px datum -> percentage box inside an overlay that tracks
// the rendered video rect. Returns numeric percents; callers append '%'. A missing
// w/h falls back to the legacy 22% default square so partial data still renders.
export function pxToPct(d, nW, nH) {
  return {
    leftPct: ((d.x ?? 0) / nW) * 100,
    topPct:  ((d.y ?? 0) / nH) * 100,
    wPct:    d.w != null ? (d.w / nW) * 100 : 22,
    hPct:    d.h != null ? (d.h / nH) * 100 : 22,
  }
}
