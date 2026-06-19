/**
 * Forge3D — Input staging (Node.js main process)
 *
 * 3D downloads almost never ship as a single self-contained file. The common
 * shape (Sketchfab/CGTrader) is `model/source/<model>.fbx` with the maps in a
 * SIBLING `model/textures/` folder. Blender's FBX `use_image_search` only scans
 * subdirs of the FBX's own folder, so it never reaches `../textures/` and the
 * model imports untextured.
 *
 * Staging fixes that: collect the chosen model + every texture (from a dropped
 * folder, a multi-file drop, or auto-discovered sibling texture folders) and
 * copy them FLAT into one temp dir. Blender then resolves textures by basename,
 * and convert.py's reconnect pass salvages renamed maps (e.g. `foo.tga` ref ->
 * `foo.tga.png` file). The output GLB embeds everything; the temp dir is
 * disposable.
 */

const fs   = require('fs')
const path = require('path')
const os   = require('os')

const MODEL_EXTS = ['.fbx', '.gltf', '.glb']
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.tga', '.bmp', '.tif', '.tiff',
                    '.webp', '.exr', '.hdr', '.dds', '.gif', '.ktx2']
// Folder names that conventionally hold maps, checked beside/above the model.
const TEX_DIR_NAMES = ['textures', 'texture', 'tex', 'maps', 'map', 'materials', 'images', 'img']

const isImage = (f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase())

function walk(dir, out, depth) {
  if (depth > 8) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out, depth + 1)
    else if (e.isFile()) out.push(full)
  }
}

// Expand input paths (files and/or directories) into a flat file list.
function gatherFiles(inputPaths) {
  const files = []
  for (const p of inputPaths || []) {
    try {
      const st = fs.statSync(p)
      if (st.isDirectory()) walk(p, files, 0)
      else files.push(p)
    } catch { /* missing path — skip */ }
  }
  return files
}

// Prefer FBX (needs texture staging most), then glTF, then GLB.
function pickModel(files) {
  for (const ext of MODEL_EXTS) {
    const m = files.find(f => path.extname(f).toLowerCase() === ext)
    if (m) return m
  }
  return null
}

function imagesInDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isFile() && isImage(e.name))
      .map(e => path.join(dir, e.name))
  } catch { return [] }
}

// When only a single model file is given (e.g. "browse" or a lone-file drop),
// look for maps where artists usually put them: the model's own folder, and any
// conventionally-named texture folder beside the model or one level up.
function autoDiscoverTextures(modelPath) {
  const found = []
  const dir    = path.dirname(modelPath)
  const parent = path.dirname(dir)
  found.push(...imagesInDir(dir))
  for (const base of [dir, parent]) {
    let entries
    try { entries = fs.readdirSync(base, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (e.isDirectory() && TEX_DIR_NAMES.includes(e.name.toLowerCase())) {
        const sub = path.join(base, e.name)
        found.push(...imagesInDir(sub))
        // one level deeper (e.g. textures/4k/*) — shallow, to stay cheap
        try {
          for (const d of fs.readdirSync(sub, { withFileTypes: true })) {
            if (d.isDirectory()) found.push(...imagesInDir(path.join(sub, d.name)))
          }
        } catch { /* ignore */ }
      }
    }
  }
  return found
}

/**
 * Stage the chosen model + all its textures into a flat temp dir.
 * @param {string[]} inputPaths  files and/or directories
 * @returns {{stageDir,modelPath,modelName,sourceDir,textures}|{error}}
 */
function stageInputs(inputPaths) {
  const files = gatherFiles(inputPaths)
  if (!files.length) return { error: 'Nothing readable in the dropped item(s).' }

  const model = pickModel(files)
  if (!model) return { error: 'No FBX, glTF, or GLB found in the dropped item(s).' }

  let images = files.filter(isImage)
  if (!images.length) images = autoDiscoverTextures(model)

  const sourceDir = path.dirname(model)
  const stageDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'forge3d-stage-'))

  const stagedModel = path.join(stageDir, path.basename(model))
  fs.copyFileSync(model, stagedModel)

  // A text .gltf references an external .bin by URI — bring it along.
  if (path.extname(model).toLowerCase() === '.gltf') {
    for (const f of files) {
      if (path.extname(f).toLowerCase() === '.bin') {
        try { fs.copyFileSync(f, path.join(stageDir, path.basename(f))) } catch { /* ignore */ }
      }
    }
  }

  // Flatten textures; first file wins on a basename collision.
  const textures = []
  const seen = new Set([path.basename(model).toLowerCase()])
  for (const img of images) {
    const base = path.basename(img)
    const key  = base.toLowerCase()
    if (seen.has(key)) continue
    try {
      fs.copyFileSync(img, path.join(stageDir, base))
      textures.push(base)
      seen.add(key)
    } catch { /* unreadable image — skip */ }
  }

  return { stageDir, modelPath: stagedModel, modelName: path.basename(model), sourceDir, textures }
}

function cleanup(stageDir) {
  if (!stageDir) return
  try { fs.rmSync(stageDir, { recursive: true, force: true }) } catch { /* already gone */ }
}

module.exports = { stageInputs, cleanup, MODEL_EXTS, IMAGE_EXTS }
