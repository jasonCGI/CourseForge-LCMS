const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

// ── Config store (simple JSON, no electron-store dependency) ──────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'forge3d-config.json')

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }
  catch { return { blenderPath: '' } }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
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

// ── IPC: Open FBX file dialog ─────────────────────────────────────────────
ipcMain.handle('dialog:openFBX', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select FBX File',
    filters: [{ name: 'FBX Files', extensions: ['fbx'] }],
    properties: ['openFile']
  })
  return result.canceled ? null : result.filePaths[0]
})

// ── IPC: Open output directory dialog ────────────────────────────────────
ipcMain.handle('dialog:openOutputDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Output Directory',
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
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
ipcMain.handle('config:get', () => loadConfig())
ipcMain.handle('config:set', (_, config) => { saveConfig(config); return true })

// ── IPC: FBX Preflight scan ───────────────────────────────────────────────
ipcMain.handle('fbx:preflight', async (_, fbxPath) => {
  const preflight = require('./scripts/preflight.js')
  return await preflight.scan(fbxPath)
})

// ── IPC: Run Blender conversion ───────────────────────────────────────────
ipcMain.handle('fbx:convert', async (_, { fbxPath, glbPath, options }) => {
  const config = loadConfig()
  if (!config.blenderPath) return { success: false, error: 'Blender path not configured.' }

  const scriptPath = path.join(__dirname, 'scripts', 'convert.py')

  return new Promise((resolve) => {
    const args = [
      '--background',
      '--python', scriptPath,
      '--', fbxPath, glbPath, JSON.stringify(options || {})
    ]

    const blender = spawn(config.blenderPath, args)
    const logs = []

    blender.stdout.on('data', (data) => {
      const line = data.toString()
      logs.push(line)
      mainWindow.webContents.send('convert:log', line)
    })
    blender.stderr.on('data', (data) => {
      const line = '[stderr] ' + data.toString()
      logs.push(line)
      mainWindow.webContents.send('convert:log', line)
    })
    blender.on('close', (code) => {
      resolve(code === 0
        ? { success: true, glbPath, logs }
        : { success: false, error: `Blender exited with code ${code}`, logs })
    })
    blender.on('error', (err) => resolve({ success: false, error: err.message, logs }))
  })
})

// ── IPC: Reveal file in Explorer/Finder ──────────────────────────────────
ipcMain.handle('shell:showItem', (_, filePath) => shell.showItemInFolder(filePath))
