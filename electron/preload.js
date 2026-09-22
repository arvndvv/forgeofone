const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('forgeAI', {
  models: () => ipcRenderer.invoke('forge:models'),
  chat: payload => ipcRenderer.invoke('forge:chat', payload),
})
