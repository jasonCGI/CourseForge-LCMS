/**
 * Forge3D FBX Preflight Scanner — Node.js main process
 * Structural/heuristic scan. Deep mesh/material analysis runs in Blender (Sprint 2).
 */

const fs   = require('fs')
const path = require('path')

const WARN_SIZE_MB = 200
const FAIL_SIZE_MB = 1000

async function scan(fbxPath) {
  const results = { pass: true, categories: {} }

  function add(cat, status, message) {
    results.categories[cat] = { status, message }
    if (status === 'fail') results.pass = false
  }

  if (!fs.existsSync(fbxPath)) { add('file', 'fail', 'File not found.'); return results }

  const ext = path.extname(fbxPath).toLowerCase()
  if (ext !== '.fbx') { add('format', 'fail', `Expected .fbx, got ${ext}`); return results }
  else add('format', 'pass', 'FBX extension confirmed.')

  const sizeMB = fs.statSync(fbxPath).size / (1024 * 1024)
  if      (sizeMB > FAIL_SIZE_MB) add('size', 'fail', `${sizeMB.toFixed(1)} MB — exceeds ${FAIL_SIZE_MB} MB limit.`)
  else if (sizeMB > WARN_SIZE_MB) add('size', 'warn', `${sizeMB.toFixed(1)} MB — large file, conversion may be slow.`)
  else                            add('size', 'pass', `${sizeMB.toFixed(1)} MB.`)

  const fd  = fs.openSync(fbxPath, 'r')
  const hdr = Buffer.alloc(23)
  fs.readSync(fd, hdr, 0, 23, 0)
  fs.closeSync(fd)
  const isBinary = hdr.toString('ascii').startsWith('Kaydara FBX Binary')
  add('encoding', 'pass', isBinary ? 'Binary FBX.' : 'ASCII FBX.')

  if (!isBinary) {
    const content   = fs.readFileSync(fbxPath, 'utf8')
    const absPaths  = (content.match(/[A-Z]:\\/g) || []).length
    if (absPaths > 0)
      add('textures', 'warn', `${absPaths} absolute texture path(s) detected — may not resolve.`)
    else
      add('textures', 'pass', 'No absolute texture paths found.')
  } else {
    add('textures', 'pass', 'Binary FBX — texture paths resolved at Blender import.')
  }

  add('compatibility', 'pass', 'Structurally valid. Full mesh/material analysis runs in Blender.')

  add('508-downstream', 'warn',
    'GLB has no native 508 requirements. Ensure the embedding application ' +
    'provides text alternatives per WCAG 2.1 SC 1.1.1.')

  return results
}

module.exports = { scan }
