// Auto-update via electron-updater (GitHub Releases). Only active in the packaged app.
const { app } = require('electron');

function init({ ipcMain, send, prepareInstall }) {
  let st = { state: 'idle', version: null, percent: 0, error: null, notes: '', date: null, speed: 0, total: 0, checkedAt: 0 };
  const set = (p) => { st = { ...st, ...p }; send('update:state', st); };
  ipcMain.handle('update:get', () => ({ ...st, current: app.getVersion(), packaged: app.isPackaged }));
  if (!app.isPackaged) { ipcMain.handle('update:check', () => {}); ipcMain.handle('update:install', () => {}); return; }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: null }));
  const info = (i) => ({ version: i.version, date: i.releaseDate || null, notes: Array.isArray(i.releaseNotes) ? i.releaseNotes.map((n) => n.note).join('\n') : i.releaseNotes || '' });
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', ...info(i), percent: 0, checkedAt: Date.now() }));
  autoUpdater.on('update-not-available', () => set({ state: 'none', checkedAt: Date.now() }));
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent), speed: p.bytesPerSecond, total: p.total }));
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', ...info(i), percent: 100 }));
  autoUpdater.on('error', (e) => set({ state: 'error', error: String(e?.message || e).slice(0, 200), checkedAt: Date.now() }));

  const check = () => { if (st.state === 'downloading' || st.state === 'ready') return; autoUpdater.checkForUpdates().catch(() => {}); };
  ipcMain.handle('update:check', check);
  // silent: no setup wizard, Relay reopens on its own; prepareInstall saves chat resume state first
  ipcMain.handle('update:install', () => { prepareInstall?.(); autoUpdater.quitAndInstall(true, true); });
  setTimeout(check, 5000);
  setInterval(check, 30 * 60 * 1000);
}
module.exports = { init };
