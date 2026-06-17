const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('forge3d', {
  openFBX:           ()       => ipcRenderer.invoke('dialog:openFBX'),
  openOutputDir:     ()       => ipcRenderer.invoke('dialog:openOutputDir'),
  openBlender:       ()       => ipcRenderer.invoke('dialog:openBlender'),
  getConfig:         ()       => ipcRenderer.invoke('config:get'),
  setConfig:         (c)      => ipcRenderer.invoke('config:set', c),
  preflight:         (p)      => ipcRenderer.invoke('fbx:preflight', p),
  convert:           (params) => ipcRenderer.invoke('fbx:convert', params),
  showInFolder:      (p)      => ipcRenderer.invoke('shell:showItem', p),
  onLog: (cb) => ipcRenderer.on('convert:log', (_, line) => cb(line)),
  removeLogListener: ()       => ipcRenderer.removeAllListeners('convert:log')
})
