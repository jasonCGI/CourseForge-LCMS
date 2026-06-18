const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('forge3d', {
  // Electron 30 removed File.path; webUtils.getPathForFile is the supported way
  // to resolve a dropped file's absolute path (must run in the preload).
  getPathForFile:    (file)   => { try { return webUtils.getPathForFile(file) } catch { return '' } },
  openFBX:           ()       => ipcRenderer.invoke('dialog:openFBX'),
  openGLB:           ()       => ipcRenderer.invoke('dialog:openGLB'),
  openOutputDir:     ()       => ipcRenderer.invoke('dialog:openOutputDir'),
  setLastDir:        (p)      => ipcRenderer.invoke('config:setLastDir', p),
  openBlender:       ()       => ipcRenderer.invoke('dialog:openBlender'),
  getConfig:         ()       => ipcRenderer.invoke('config:get'),
  setConfig:         (c)      => ipcRenderer.invoke('config:set', c),
  preflight:         (p)      => ipcRenderer.invoke('fbx:preflight', p),
  convert:           (params) => ipcRenderer.invoke('fbx:convert', params),
  showInFolder:      (p)      => ipcRenderer.invoke('shell:showItem', p),
  onLog: (cb) => ipcRenderer.on('convert:log', (_, line) => cb(line)),
  removeLogListener: ()       => ipcRenderer.removeAllListeners('convert:log')
})
