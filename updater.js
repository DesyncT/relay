// Auto-update via electron-updater (GitHub Releases). Only active in the packaged app.
const { app } = require('electron');

function init({ ipcMain, send, prepareInstall }) {
  let st = { state: 'idle', version: null, percent: 0, error: null };
  const set = (p) => { st = { ...st, ...p }; send('update:state', st); };
  ipcMain.handle('update:get', () => ({ ...st, current: app.getVersion(), packaged: app.isPackaged }));
  if (!app.isPackaged) { ipcMain.handle('update:check', () => {}); ipcMain.handle('update:install', () => {}); return; }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: null }));
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => set({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version, percent: 100 }));
  autoUpdater.on('error', (e) => set({ state: 'error', error: String(e?.message || e).slice(0, 200) }));

  const check = () => { if (st.state === 'downloading' || st.state === 'ready') return; autoUpdater.checkForUpdates().catch(() => {}); };
  ipcMain.handle('update:check', check);
  ipcMain.handle('update:install', () => { prepareInstall?.(); autoUpdater.quitAndInstall(); }); // prepareInstall saves chat resume state first
  setTimeout(check, 5000);
  setInterval(check, 30 * 60 * 1000);
}
module.exports = { init };
