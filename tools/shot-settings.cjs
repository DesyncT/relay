// Renders desktop Settings (Co-work + Phone panels) with stand-in data. Usage: npx electron tools/shot-settings.cjs <outDir>
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const out = process.argv[2] || path.join(os.tmpdir(), 'relay-shots'); fs.mkdirSync(out, { recursive: true });
const now = Date.now();
const answers = {
  'update:get': () => ({ state: 'idle' }), 'procs:list': () => [], 'models:list': () => [], 'auth:status': () => ({}), 'settings:limits': () => ({}), 'limits:get': () => ({ down: {}, now: Date.now() }), 'usage:quota': () => ({}), 'prices:get': () => ({}), 'rules:get': () => ({}), 'skills:list': () => [],
  'profile:get': () => ({ name: 'you', avatar: '' }), 'settings:get': () => ({ lead: 'claude', lastTab: 'settings' }), 'sessions:getActive': () => null,
  'sessions:tree': () => ({ projects: [], sessions: [], active: null }),
  'mobile:state': () => ({ running: true, port: 47840, address: '192.168.1.20:47840', approved: true, devices: [{ id: 'a1', name: 'iPhone · Safari', added: now - 864e5, last: now - 5e3, online: true }, { id: 'a2', name: 'Android phone · Chrome', added: now - 9e8, last: now - 36e5, online: false }] }),
  'mobile:pair': () => ({ running: true, approved: true, devices: [], pair: { url: 'http://192.168.1.20:47840/?pair=Zk3nQ0wq8vTj1XrYb2LmN9pC5sDaHfGe', expires: Date.now() + 285000 } }),
  'cowork:state': () => ({ state: 'waiting', hosting: true, code: '482-913-607', invite: '482-913-607@192.168.1.20:47837', address: '192.168.1.20:47837', server: true, lend: { claude: true, codex: false }, lendable: { claude: true, codex: false }, lent: { runs: 0, tokens: 0, cost: 0 }, borrowed: { runs: 0, tokens: 0, cost: 0 }, sharing: true }),
};
ipcMain.handle('stub', (_e, ch) => (answers[ch] ? answers[ch]() : null));
app.whenReady().then(async () => {
  try {
    const w = new BrowserWindow({ width: 1100, height: 900, show: true, webPreferences: { preload: path.join(__dirname, 'shot-preload.cjs'), contextIsolation: true, sandbox: true } });
    const logs = []; w.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) logs.push(msg); });
    await w.loadFile(path.join(__dirname, '..', 'renderer-dist', 'index.html'));
    await new Promise((r) => setTimeout(r, 2500));
    await w.webContents.executeJavaScript("(() => { const b = [...document.querySelectorAll('#set-phone button')].find((x) => /pair another|new qr/i.test(x.textContent)); b && b.click(); const p = document.getElementById('set-phone'); p.style.cssText = 'position:fixed;top:10px;left:10px;width:760px;z-index:9999;background:var(--bg)'; })()");
    await new Promise((r) => setTimeout(r, 1200));
    const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(out, 'settings.png'), img.toPNG());
    console.log(await w.webContents.executeJavaScript("JSON.stringify({ phone: !!document.getElementById('set-phone'), qr: !!document.querySelector('.ph-qr svg'), devs: document.querySelectorAll('.ph-devs li').length })"));
    if (logs.length) console.log('console errors:', logs.slice(0, 5).join(' | '));
  } catch (e) { console.error('shot failed', e); }
  app.quit();
});
