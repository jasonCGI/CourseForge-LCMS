const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

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

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

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
