const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  call: (ch, ...args) => ipcRenderer.invoke(ch, ...args),
  on: (ch, fn) => ipcRenderer.on(ch, (_e, d) => fn(d)),
});
