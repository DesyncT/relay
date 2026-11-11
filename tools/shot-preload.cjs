const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', { call: (ch, ...a) => ipcRenderer.invoke('stub', ch, a), on: () => {} });
