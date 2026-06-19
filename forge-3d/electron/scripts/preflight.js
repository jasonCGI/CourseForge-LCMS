/**
 * Forge3D Preflight Scanner — Node.js main process
 * Structural/heuristic scan of the conversion input (FBX or glTF/GLB).
 * Deep mesh/material analysis runs in Blender.
 */

const fs   = require('fs')
const path = require('path')

const WARN_SIZE_MB = 200
const FAIL_SIZE_MB = 1000
const SUPPORTED = ['.fbx', '.glb', '.gltf']

// glTF extensions Blender's importer/exporter round-trips cleanly. spec-gloss is
// deprecated but Blender imports it (and our pipeline bakes it to metal-rough).
const KNOWN_EXTS = [
  'KHR_materials_pbrSpecularGlossiness', 'KHR_draco_mesh_compression',
  'KHR_materials_specular', 'KHR_materials_ior', 'KHR_texture_transform',
  'KHR_lights_punctual', 'KHR_materials_emissive_strength', 'KHR_materials_unlit',
  'KHR_materials_clearcoat', 'KHR_materials_transmission', 'KHR_materials_volume',
]

// Read the JSON chunk of a binary GLB (or parse a text .gltf).
function readGltfJson(p, ext) {
  if (ext === '.gltf') {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
  }
  try {
    const fd = fs.openSync(p, 'r')
    const head = Buffer.alloc(12); fs.readSync(fd, head, 0, 12, 0)
    if (head.toString('ascii', 0, 4) !== 'glTF') { fs.closeSync(fd); return null }
    const ch = Buffer.alloc(8); fs.readSync(fd, ch, 0, 8, 12)
    const len = ch.readUInt32LE(0)
    const buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, 20)
    fs.closeSync(fd)
    return JSON.parse(buf.toString('utf8'))
  } catch { return null }
}

function scanGltf(p, ext, add) {
  const g = readGltfJson(p, ext)
  if (!g) { add('format', 'warn', 'Could not parse glTF JSON — Blender will still attempt the import.'); return }

  const used = g.extensionsUsed || []
  if (used.includes('KHR_materials_pbrSpecularGlossiness'))
    add('materials', 'pass', 'Spec-gloss materials — will be baked to metallic-roughness on convert.')
  else
    add('materials', 'pass', `${(g.materials || []).length} material(s), metallic-roughness.`)

  const required = g.extensionsRequired || []
  const unknownReq = required.filter(e => !KNOWN_EXTS.includes(e))
  if (unknownReq.length)
    add('extensions', 'warn', `Required extension(s) Blender may not support: ${unknownReq.join(', ')}.`)
  else if (used.length)
    add('extensions', 'pass', `Extensions: ${used.join(', ')}.`)

  // A text .gltf references external .bin/textures by relative URI — flag any missing.
  if (ext === '.gltf') {
    const dir = path.dirname(p)
    const refs = [...(g.buffers || []), ...(g.images || [])]
      .map(o => o && o.uri).filter(u => u && !u.startsWith('data:'))
    const missing = refs.filter(u => { try { return !fs.existsSync(path.join(dir, decodeURIComponent(u))) } catch { return true } })
    if (missing.length) add('resources', 'warn', `${missing.length} external file(s) not found beside the .gltf (textures/.bin). Prefer a .glb, or keep companions together.`)
    else if (refs.length) add('resources', 'pass', 'External resources resolve.')
    else add('resources', 'pass', 'Self-contained (embedded resources).')
  }
}

async function scan(srcPath) {
  const results = { pass: true, categories: {} }

  function add(cat, status, message) {
    results.categories[cat] = { status, message }
    if (status === 'fail') results.pass = false
  }

  if (!fs.existsSync(srcPath)) { add('file', 'fail', 'File not found.'); return results }

  const ext = path.extname(srcPath).toLowerCase()
  if (!SUPPORTED.includes(ext)) { add('format', 'fail', `Unsupported ${ext} — accepts FBX, GLB, glTF.`); return results }
  add('format', 'pass', `${ext.slice(1).toUpperCase()} accepted.`)

  const sizeMB = fs.statSync(srcPath).size / (1024 * 1024)
  if      (sizeMB > FAIL_SIZE_MB) add('size', 'fail', `${sizeMB.toFixed(1)} MB — exceeds ${FAIL_SIZE_MB} MB limit.`)
  else if (sizeMB > WARN_SIZE_MB) add('size', 'warn', `${sizeMB.toFixed(1)} MB — large file, conversion may be slow.`)
  else                            add('size', 'pass', `${sizeMB.toFixed(1)} MB.`)

  if (ext === '.fbx') {
    const fd  = fs.openSync(srcPath, 'r')
    const hdr = Buffer.alloc(23)
    fs.readSync(fd, hdr, 0, 23, 0)
    fs.closeSync(fd)
    const isBinary = hdr.toString('ascii').startsWith('Kaydara FBX Binary')
    add('encoding', 'pass', isBinary ? 'Binary FBX.' : 'ASCII FBX.')

    if (!isBinary) {
      const content  = fs.readFileSync(srcPath, 'utf8')
      const absPaths = (content.match(/[A-Z]:\\/g) || []).length
      if (absPaths > 0) add('textures', 'warn', `${absPaths} absolute texture path(s) detected — may not resolve.`)
      else              add('textures', 'pass', 'No absolute texture paths found.')
    } else {
      add('textures', 'pass', 'Binary FBX — texture paths resolved at Blender import.')
    }
  } else {
    scanGltf(srcPath, ext, add)
  }

  add('compatibility', 'pass', 'Structurally valid. Full mesh/material analysis runs in Blender.')

  add('508-downstream', 'warn',
    'GLB has no native 508 requirements. Ensure the embedding application ' +
    'provides text alternatives per WCAG 2.1 SC 1.1.1.')

  return results
}

module.exports = { scan }
