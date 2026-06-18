/**
 * Forge3D — Renderer Process
 * All Electron API calls via window.forge3d (contextBridge)
 */

// ── State ─────────────────────────────────────────────────────────────────
let currentFBXPath  = null
let outputDir       = null
let lastGLBPath     = null
let settingsTrigger = null

// ── Theme system ──────────────────────────────────────────────────────────
const THEMES = ['night', 'day', 'hc']

function getDefaultTheme() {
  const stored = localStorage.getItem('forge3d_theme')
  if (stored && THEMES.includes(stored)) return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night'
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('forge3d_theme', theme)
  THEMES.forEach(t => {
    const btn = document.getElementById(`theme-${t}`)
    if (btn) btn.setAttribute('aria-pressed', String(t === theme))
  })
  announceToSR(`Display mode: ${theme === 'hc' ? 'high contrast' : theme}`)
}

// ── Screen reader announcer ───────────────────────────────────────────────
let srAnnouncer = null
function announceToSR(message) {
  if (!srAnnouncer) {
    srAnnouncer = document.createElement('div')
    srAnnouncer.setAttribute('role', 'status')
    srAnnouncer.setAttribute('aria-live', 'polite')
    srAnnouncer.setAttribute('aria-atomic', 'true')
    srAnnouncer.className = 'sr-only'
    document.body.appendChild(srAnnouncer)
  }
  srAnnouncer.textContent = ''
  requestAnimationFrame(() => { srAnnouncer.textContent = message })
}

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  // Theme
  applyTheme(getDefaultTheme())
  document.getElementById('theme-day')?.addEventListener('click', () => applyTheme('day'))
  document.getElementById('theme-night')?.addEventListener('click', () => applyTheme('night'))
  document.getElementById('theme-hc')?.addEventListener('click', () => applyTheme('hc'))
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (!localStorage.getItem('forge3d_theme')) applyTheme(e.matches ? 'day' : 'night')
  })

  // Blender config
  const config = await window.forge3d.getConfig()
  document.getElementById('blender-path-input').value = config.blenderPath || ''
  if (!config.blenderPath) setTimeout(() => openSettings(), 800)

  setupDropZone()
  setupButtons()
  setupTabs()
  setupLogStream()
}

// ── Drop zone ─────────────────────────────────────────────────────────────
function setupDropZone() {
  const zone = document.getElementById('drop-zone')
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over') })
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'))
  zone.addEventListener('drop', async (e) => {
    e.preventDefault()
    zone.classList.remove('drag-over')
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    const p = window.forge3d.getPathForFile(file)   // resolve the dropped path (no dialog)
    if (p && /\.fbx$/i.test(p)) { await loadFBX(p); return }
    if (p && /\.(glb|gltf)$/i.test(p)) { previewGLB(p); return }   // drop a GLB to preview it
    announceToSR('Please drop a .fbx, .glb, or .gltf file.')
    zone.classList.add('drop-reject')
    setTimeout(() => zone.classList.remove('drop-reject'), 1200)
  })
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); browseForFBX() }
  })
}

// ── Buttons ───────────────────────────────────────────────────────────────
function setupButtons() {
  document.getElementById('btn-browse').addEventListener('click', browseForFBX)
  document.getElementById('btn-preview-glb')?.addEventListener('click', async () => {
    const p = await window.forge3d.openGLB()
    if (p) previewGLB(p)
  })
  document.getElementById('btn-clear').addEventListener('click', clearFile)
  document.getElementById('btn-convert').addEventListener('click', runConversion)
  document.getElementById('btn-output-dir').addEventListener('click', browseOutputDir)
  document.getElementById('btn-reveal').addEventListener('click', revealOutput)
  document.getElementById('btn-settings').addEventListener('click', () => {
    settingsTrigger = document.activeElement
    openSettings()
  })
  document.getElementById('btn-close-settings').addEventListener('click', closeSettings)
  document.getElementById('btn-browse-blender').addEventListener('click', browseBlender)
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.f3d-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab))
    tab.addEventListener('keydown', (e) => {
      const tabs = [...document.querySelectorAll('.f3d-tab')]
      const idx  = tabs.indexOf(tab)
      if (e.key === 'ArrowRight') { e.preventDefault(); tabs[(idx + 1) % tabs.length].focus() }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); tabs[(idx - 1 + tabs.length) % tabs.length].focus() }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(tab.dataset.tab) }
    })
  })
}

function switchTab(tabName) {
  document.querySelectorAll('.f3d-tab').forEach(t => {
    const active = t.dataset.tab === tabName
    t.classList.toggle('active', active)
    t.setAttribute('aria-selected', String(active))
  })
  document.getElementById('tab-log').style.display     = tabName === 'log'     ? 'flex' : 'none'
  document.getElementById('tab-preview').style.display = tabName === 'preview' ? 'flex' : 'none'
}

// ── File selection ────────────────────────────────────────────────────────
async function browseForFBX() {
  const fbxPath = await window.forge3d.openFBX()
  if (fbxPath) await loadFBX(fbxPath)
}

// Preview a GLB/glTF directly (no conversion).
function previewGLB(glbPath) {
  if (!glbPath) return
  window.forge3d.setLastDir(glbPath)
  lastGLBPath = glbPath
  const sep  = glbPath.includes('/') ? '/' : '\\'
  const name = glbPath.split(sep).pop()
  showResult(true, `Previewing — ${name}`)
  loadPreview(glbPath)
}

async function loadFBX(fbxPath) {
  currentFBXPath = fbxPath
  const sep  = fbxPath.includes('/') ? '/' : '\\'
  const name = fbxPath.split(sep).pop()
  outputDir  = fbxPath.substring(0, fbxPath.lastIndexOf(sep))
  window.forge3d.setLastDir(fbxPath)

  document.getElementById('drop-zone').style.display    = 'none'
  document.getElementById('file-info').style.display    = 'block'
  document.getElementById('file-name').textContent      = name
  document.getElementById('file-meta').textContent      = fbxPath
  document.getElementById('output-path-display').textContent = outputDir
  document.getElementById('options-panel').style.display = 'block'

  await runPreflight(fbxPath)
}

function clearFile() {
  currentFBXPath = null; outputDir = null
  document.getElementById('drop-zone').style.display    = 'flex'
  document.getElementById('file-info').style.display    = 'none'
  document.getElementById('preflight-panel').style.display = 'none'
  document.getElementById('options-panel').style.display  = 'none'
  document.getElementById('result-bar').style.display     = 'none'
  clearLog()
}

// ── Preflight ─────────────────────────────────────────────────────────────
async function runPreflight(fbxPath) {
  const panel   = document.getElementById('preflight-panel')
  const results = document.getElementById('preflight-results')
  panel.style.display = 'block'
  results.innerHTML   = '<div class="f3d-scanning">Scanning...</div>'

  const report = await window.forge3d.preflight(fbxPath)
  results.innerHTML   = ''

  for (const [cat, { status, message }] of Object.entries(report.categories)) {
    const icon = status === 'pass' ? '✓' : status === 'warn' ? '⚠' : '✕'
    const row  = document.createElement('div')
    row.className = `f3d-preflight-row status-${status}`
    row.innerHTML = `
      <span class="f3d-preflight-icon" aria-hidden="true">${icon}</span>
      <span class="f3d-preflight-cat">${cat}</span>
      <span class="f3d-preflight-msg">${message}</span>
    `
    row.setAttribute('aria-label', `${cat}: ${status} — ${message}`)
    results.appendChild(row)
  }

  const convertBtn = document.getElementById('btn-convert')
  convertBtn.disabled = !report.pass
  convertBtn.setAttribute('aria-disabled', String(!report.pass))
}

// ── Output dir ────────────────────────────────────────────────────────────
async function browseOutputDir() {
  const dir = await window.forge3d.openOutputDir()
  if (dir) {
    outputDir = dir
    document.getElementById('output-path-display').textContent = dir
  }
}

// ── Conversion ────────────────────────────────────────────────────────────
async function runConversion() {
  if (!currentFBXPath || !outputDir) return

  const sep     = outputDir.includes('/') ? '/' : '\\'
  const name    = currentFBXPath.split(sep).pop().replace(/\.fbx$/i, '')
  const glbPath = outputDir + sep + name + '.glb'
  const options = {
    include_animations: document.getElementById('opt-animations').checked,
    apply_transforms:   document.getElementById('opt-transforms').checked,
    draco:              document.getElementById('opt-draco').checked,
    export_cameras:     document.getElementById('opt-cameras').checked
  }

  clearLog()
  appendLog('[Forge3D] Starting conversion...')

  const convertBtn = document.getElementById('btn-convert')
  convertBtn.setAttribute('aria-busy', 'true')
  convertBtn.setAttribute('aria-disabled', 'true')
  convertBtn.textContent = 'Converting...'
  document.getElementById('result-bar').style.display = 'none'

  const result = await window.forge3d.convert({ fbxPath: currentFBXPath, glbPath, options })

  convertBtn.setAttribute('aria-busy', 'false')
  convertBtn.setAttribute('aria-disabled', 'false')
  convertBtn.textContent = 'Convert to GLB'

  if (result.success) {
    lastGLBPath = result.glbPath
    showResult(true, `GLB exported — ${name}.glb`)
    loadPreview(result.glbPath)
  } else {
    showResult(false, result.error || 'Conversion failed.')
  }
}

// ── Log ───────────────────────────────────────────────────────────────────
function setupLogStream() {
  window.forge3d.onLog((line) => appendLog(line))
}

function appendLog(text) {
  const log = document.getElementById('conversion-log')
  log.querySelector('.f3d-log-placeholder')?.remove()
  const line = document.createElement('div')
  line.className = 'f3d-log-line'
  line.textContent = text.trim()
  if (text.includes('ERROR'))   line.classList.add('log-error')
  if (text.includes('WARN'))    line.classList.add('log-warn')
  if (text.includes('SUCCESS')) line.classList.add('log-success')
  log.appendChild(line)
  log.scrollTop = log.scrollHeight
}

function clearLog() {
  document.getElementById('conversion-log').innerHTML =
    '<span class="f3d-log-placeholder">Conversion log will appear here...</span>'
}

// ── Result bar ────────────────────────────────────────────────────────────
function showResult(success, message) {
  const bar = document.getElementById('result-bar')
  bar.style.display = 'flex'
  bar.className = `f3d-result-bar ${success ? 'result-success' : 'result-fail'}`
  document.getElementById('result-message').textContent = message
  document.getElementById('btn-reveal').style.display = success ? 'inline-block' : 'none'
  announceToSR(message)
}

// ── Preview ───────────────────────────────────────────────────────────────
function loadPreview(glbPath) {
  switchTab('preview')
  const area = document.getElementById('preview-area')
  area.innerHTML = ''
  // Load the preview module once; reuse it on subsequent previews.
  if (window.initForge3DPreview) { window.initForge3DPreview(area, glbPath); return }
  const script = document.createElement('script')
  script.src = 'three-preview.js'
  script.onload = () => window.initForge3DPreview(area, glbPath)
  document.body.appendChild(script)
}

// ── Shell ─────────────────────────────────────────────────────────────────
function revealOutput() { if (lastGLBPath) window.forge3d.showInFolder(lastGLBPath) }

// ── Settings ──────────────────────────────────────────────────────────────
function openSettings() {
  const overlay = document.getElementById('settings-overlay')
  overlay.style.display = 'flex'
  trapFocus(overlay.querySelector('.f3d-modal'))
  requestAnimationFrame(() => overlay.querySelector('button, input')?.focus())
}

function closeSettings() {
  document.getElementById('settings-overlay').style.display = 'none'
  settingsTrigger?.focus()
}

function trapFocus(el) {
  const focusable = el.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')
  const first = focusable[0]
  const last  = focusable[focusable.length - 1]
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSettings(); return }
    if (e.key !== 'Tab') return
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus() } }
    else            { if (document.activeElement === last)  { e.preventDefault(); first.focus() } }
  })
}

async function browseBlender() {
  const p = await window.forge3d.openBlender()
  if (p) document.getElementById('blender-path-input').value = p
}

// ── Boot ──────────────────────────────────────────────────────────────────
init()
