const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const stage = require('./scripts/stage')

// The flat temp dir holding the current model + its textures (see stage.js).
// Cleaned when a new model is resolved, on clear, and on quit.
let currentStageDir = null
function disposeStage() { stage.cleanup(currentStageDir); currentStageDir = null }

// ── Config store (simple JSON, no electron-store dependency) ──────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'forge3d-config.json')

function loadConfig() {
  try { return { blenderPath: '', lastDir: '', ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } }
  catch { return { blenderPath: '', lastDir: '' } }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}

// Last directory a file was picked/dropped from, so dialogs reopen there.
function dialogDefaultDir() {
  const d = loadConfig().lastDir
  try { return (d && fs.existsSync(d)) ? d : undefined } catch { return undefined }
}
function rememberDir(p) {
  if (!p) return
  try {
    const dir = fs.statSync(p).isDirectory() ? p : path.dirname(p)
    const config = loadConfig(); config.lastDir = dir; saveConfig(config)
  } catch { /* path gone — leave lastDir as-is */ }
}

// Auto-locate a Blender executable in the usual install locations so first
// launch doesn't prompt when Blender is already installed. Returns '' if none.
function detectBlender() {
  const candidates = []
  if (process.platform === 'win32') {
    for (const base of ['C:\\Program Files\\Blender Foundation', 'C:\\Program Files (x86)\\Blender Foundation']) {
      try {
        for (const dir of fs.readdirSync(base)) {
          candidates.push(path.join(base, dir, 'blender.exe'))
        }
      } catch { /* base not present */ }
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Blender.app/Contents/MacOS/Blender')
  } else {
    candidates.push('/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender', '/var/lib/flatpak/exports/bin/org.blender.Blender')
  }
  const found = candidates.filter(c => { try { return fs.existsSync(c) } catch { return false } })
  found.sort().reverse()   // highest version dir first (e.g. "Blender 5.1" before "Blender 4.0")
  return found[0] || ''
}

// ── Window ────────────────────────────────────────────────────────────────
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0D0D0D',
    titleBarStyle: 'hiddenInset',
    frame: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.loadFile('src/index.html')
}

// ── Application menu ──────────────────────────────────────────────────────
function sendMenu(action) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:action', action)
}

function showQuickStart() {
  dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'Forge3D — Quick Start', message: 'Quick Start', buttons: ['Got it'],
    detail:
      'Forge3D converts FBX / glTF / GLB into a clean, self-contained GLB.\n\n' +
      '1. Drop a model, a whole folder, or a model + its textures onto the drop zone ' +
      '(or use Browse File / Browse Folder). Textures are staged automatically — including ' +
      'the common source/ + textures/ download layout.\n' +
      '2. Review the preflight scan and set options (animations, transforms, Draco, force metallic).\n' +
      '3. Convert — the output GLB embeds all textures and animations.\n' +
      '4. In the preview: orbit/zoom, switch Studio/Day/Night lighting, play animations, and use ' +
      '📷 Capture to save a PNG of the current view.\n\n' +
      'Blender must be installed — set its path under Help ▸ Set Blender Path.'
  })
}

function showArtistGuide() {
  dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'Forge3D — Preparing Models', message: 'Preparing models for Forge3D', buttons: ['Close'],
    detail:
      '• Keep texture image files with the model. A sibling textures/ folder is fine — Forge3D stages ' +
      'them flat so Blender resolves them (and relinks renamed maps like foo.tga → foo.tga.png).\n\n' +
      '• PBR metal: 3ds Max metalness doesn\'t always survive FBX. Name metal materials with words like ' +
      '"metal", "chrome", "steel" (auto-detected), or tick Force Metallic.\n\n' +
      '• Animations export and play automatically — keep the rig/armature in the FBX.\n\n' +
      '• For part-highlighting downstream, keep objects as SEPARATE, NAMED meshes (don\'t merge).\n\n' +
      '• Deprecated spec-gloss glTF is baked to metallic-roughness on convert.'
  })
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'About Forge3D', message: `Forge3D ${app.getVersion()}`, buttons: ['Close'],
    detail: 'FBX → GLB conversion pipeline.\nPart of the CourseForge ecosystem · Cardona Creative Technology Lab.'
  })
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'Open Model…',   accelerator: 'CmdOrCtrl+O',       click: () => sendMenu('open-model') },
      { label: 'Open Folder…',  accelerator: 'CmdOrCtrl+Shift+O', click: () => sendMenu('open-folder') },
      { label: 'Preview GLB…',                                    click: () => sendMenu('preview-glb') },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' }
    ]},
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help', submenu: [
      { label: 'Quick Start',                       click: showQuickStart },
      { label: 'Preparing Models (Artist Guide)',   click: showArtistGuide },
      { type: 'separator' },
      { label: 'Set Blender Path…',                 click: () => sendMenu('open-settings') },
      { label: 'Forge3D on the Web',                click: () => shell.openExternal('https://cardonalab.dev/forge3d/') },
      { type: 'separator' },
      { label: 'About Forge3D',                     click: showAbout }
    ]}
  ]
  return Menu.buildFromTemplate(template)
}

app.whenReady().then(() => {
  createWindow()
  Menu.setApplicationMenu(buildAppMenu())
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
app.on('will-quit', disposeStage)   // don't leave staging temp dirs behind

// ── IPC: Resolve a dropped folder / multi-file set / single model ─────────
// Stages the model + textures flat into a temp dir (see stage.js) and returns
// the staged model path the rest of the flow (preflight, convert) runs against.
ipcMain.handle('model:resolve', (_, inputPaths) => {
  disposeStage()
  const res = stage.stageInputs(inputPaths)
  if (res.error) return res
  currentStageDir = res.stageDir
  rememberDir(res.sourceDir)
  return {
    modelPath: res.modelPath, modelName: res.modelName,
    sourceDir: res.sourceDir, textures: res.textures
  }
})

// ── IPC: Dispose the current staging dir (on clear) ──────────────────────
ipcMain.handle('model:cleanup', () => { disposeStage(); return true })

// ── IPC: Pick a model FOLDER (model + textures) ──────────────────────────
ipcMain.handle('dialog:openModelFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select a model folder (model + textures)',
    defaultPath: dialogDefaultDir(),
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  rememberDir(result.filePaths[0])
  return result.filePaths[0]
})

// ── IPC: Save a viewer screenshot (PNG data URL) to a chosen location ─────
ipcMain.handle('screenshot:save', async (_, { dataUrl, suggestedName }) => {
  if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
    return { saved: false, error: 'No image to save.' }
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save screenshot',
    defaultPath: path.join(dialogDefaultDir() || app.getPath('pictures'), suggestedName || 'forge3d-capture.png'),
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  })
  if (result.canceled || !result.filePath) return { saved: false }
  try {
    const b64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    fs.writeFileSync(result.filePath, Buffer.from(b64, 'base64'))
    rememberDir(result.filePath)
    return { saved: true, path: result.filePath }
  } catch (e) {
    return { saved: false, error: e.message }
  }
})

// ── IPC: Open model file dialog (conversion input) ────────────────────────
ipcMain.handle('dialog:openFBX', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select model to convert (FBX, glTF, or GLB)',
    defaultPath: dialogDefaultDir(),
    filters: [{ name: '3D Models', extensions: ['fbx', 'glb', 'gltf'] }],
    properties: ['openFile']
  })
  if (result.canceled) return null
  rememberDir(result.filePaths[0])
  return result.filePaths[0]
})

// ── IPC: Open a GLB/glTF to preview (no conversion) ───────────────────────
ipcMain.handle('dialog:openGLB', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select GLB / glTF to preview',
    defaultPath: dialogDefaultDir(),
    filters: [{ name: '3D Models', extensions: ['glb', 'gltf'] }],
    properties: ['openFile']
  })
  if (result.canceled) return null
  rememberDir(result.filePaths[0])
  return result.filePaths[0]
})

// ── IPC: Persist the last directory (e.g. from a drag-drop, which has no dialog)
ipcMain.handle('config:setLastDir', (_, p) => { rememberDir(p); return true })

// ── IPC: Open output directory dialog ────────────────────────────────────
ipcMain.handle('dialog:openOutputDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Output Directory',
    defaultPath: dialogDefaultDir(),
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  rememberDir(result.filePaths[0])
  return result.filePaths[0]
})

// ── IPC: Browse for Blender executable ───────────────────────────────────
ipcMain.handle('dialog:openBlender', async () => {
  const filters = process.platform === 'win32'
    ? [{ name: 'Blender', extensions: ['exe'] }]
    : [{ name: 'All Files', extensions: ['*'] }]
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Locate Blender Executable',
    filters,
    properties: ['openFile']
  })
  if (!result.canceled) {
    const config = loadConfig()
    config.blenderPath = result.filePaths[0]
    saveConfig(config)
    return result.filePaths[0]
  }
  return null
})

// ── IPC: Get/set config ───────────────────────────────────────────────────
ipcMain.handle('config:get', () => {
  const config = loadConfig()
  // Auto-detect + persist Blender if unset or the saved path no longer exists,
  // so a machine with Blender installed is never prompted.
  if (!config.blenderPath || !fs.existsSync(config.blenderPath)) {
    const detected = detectBlender()
    if (detected) { config.blenderPath = detected; saveConfig(config) }
  }
  return config
})
ipcMain.handle('config:set', (_, config) => { saveConfig(config); return true })

// ── IPC: FBX Preflight scan ───────────────────────────────────────────────
ipcMain.handle('fbx:preflight', async (_, fbxPath) => {
  const preflight = require('./scripts/preflight.js')
  return await preflight.scan(fbxPath)
})

// ── IPC: Run Blender conversion ───────────────────────────────────────────
const CONVERT_TIMEOUT_MS = 5 * 60 * 1000   // kill a hung Blender after 5 min
let activeBlender = null                    // single-flight guard

// The window may be closed mid-convert; guard every send.
function sendConvertLog(line) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('convert:log', line)
  }
}

ipcMain.handle('fbx:convert', async (_, { fbxPath, glbPath, options }) => {
  const config = loadConfig()
  if (!config.blenderPath) return { success: false, error: 'Blender path not configured.' }
  if (activeBlender) return { success: false, error: 'A conversion is already in progress.' }

  // Blender is an external process and can't read inside app.asar — the script
  // is unpacked (asarUnpack in build config), so point at the unpacked copy.
  const scriptPath = path.join(__dirname, 'scripts', 'convert.py').replace('app.asar', 'app.asar.unpacked')

  return new Promise((resolve) => {
    const args = [
      '--background',
      '--python', scriptPath,
      '--', fbxPath, glbPath, JSON.stringify(options || {})
    ]

    const blender = spawn(config.blenderPath, args)
    activeBlender = blender
    const logs = []
    let settled = false

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      activeBlender = null
      resolve(result)
    }

    const timer = setTimeout(() => {
      sendConvertLog('[error] Conversion timed out — terminating Blender.')
      try { blender.kill() } catch (_) { /* already gone */ }
      finish({ success: false, error: `Conversion timed out after ${CONVERT_TIMEOUT_MS / 60000} minutes.`, logs })
    }, CONVERT_TIMEOUT_MS)

    blender.stdout.on('data', (data) => {
      const line = data.toString()
      logs.push(line)
      sendConvertLog(line)
    })
    blender.stderr.on('data', (data) => {
      const line = '[stderr] ' + data.toString()
      logs.push(line)
      sendConvertLog(line)
    })
    blender.on('close', (code) => {
      finish(code === 0
        ? { success: true, glbPath, logs }
        : { success: false, error: `Blender exited with code ${code}`, logs })
    })
    blender.on('error', (err) => finish({ success: false, error: err.message, logs }))
  })
})

// ── IPC: Cancel an in-progress conversion ─────────────────────────────────
ipcMain.handle('fbx:cancel', () => {
  if (activeBlender) {
    try { activeBlender.kill() } catch (_) { /* already gone */ }
    return { cancelled: true }
  }
  return { cancelled: false }
})

// ── IPC: Reveal file in Explorer/Finder ──────────────────────────────────
ipcMain.handle('shell:showItem', (_, filePath) => {
  // showItemInFolder needs a native (back-slash on Windows), existing path; it
  // silently no-ops on forward-slash or missing paths. Normalize + fall back to
  // opening the containing folder.
  const p = path.normalize(String(filePath || ''))
  try {
    if (fs.existsSync(p)) { shell.showItemInFolder(p); return true }
    const dir = path.dirname(p)
    if (fs.existsSync(dir)) { shell.openPath(dir); return true }
  } catch (e) { /* fall through */ }
  return false
})
