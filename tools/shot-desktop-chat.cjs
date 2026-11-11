// Renders the desktop chat (real built app, stand-in data) to confirm the phone changes leave desktop layout alone.
// Usage: npx electron tools/shot-desktop-chat.cjs <outDir>
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const out = process.argv[2] || path.join(os.tmpdir(), 'relay-shots'); fs.mkdirSync(out, { recursive: true });
const now = Date.now();
const msgs = [
  { from: 'user', text: 'Add a dark mode toggle to the settings page', at: now - 600000 },
  { from: 'claude', text: 'I will check how themes are stored, then add the toggle.\n\n- read `themes.js`\n- add a switch in Settings', at: now - 590000, usage: { tokens: 1200, cost: 0.02, model: 'claude-sonnet-5-5' } },
  { from: 'codex', text: 'Done. Should I also follow the system setting on first launch?', at: now - 120000, askUser: true, options: ['Yes', 'No'] },
];
const sessions = [{ id: 's1', projectId: 'p1', title: 'Dark mode toggle', updated: now, created: now - 9e5, unread: false }];
const answers = {
  'update:get': () => ({ state: 'idle' }), 'procs:list': () => [], 'models:list': () => [], 'auth:status': () => ({}), 'settings:limits': () => ({}), 'limits:get': () => ({ down: {}, now }), 'usage:quota': () => ({}), 'prices:get': () => ({}), 'skills:list': () => [], 'skills:inUse': () => ({ forced: [], used: [] }),
  'profile:get': () => ({ name: 'you', avatar: '' }), 'settings:get': () => ({ lead: 'claude', lastTab: 'chat' }), 'sessions:getActive': () => 's1',
  'sessions:tree': () => ({ projects: [{ id: 'p1', name: 'jarvis', path: 'C:\\jarvis', collapsed: false }], sessions, active: 's1' }),
  'chat:history': () => msgs, 'chat:queue': () => [], 'subagents:list': () => [], 'sessions:working': () => [],
  'chat:info': () => ({ title: 'Dark mode toggle', lead: 'claude', mode: 'edits', easyMode: false, chatModels: {}, chatEffort: 'low', spend: { claude: { tokens: 1200, cost: 0.02, input: 800, output: 400, cached: 0, model: 'claude' } } }),
  'cowork:state': () => ({ state: 'off', hosting: false, server: false, lend: { claude: true, codex: false }, lendable: { claude: true, codex: false } }),
};
ipcMain.handle('stub', (_e, ch) => (answers[ch] ? answers[ch]() : null));
app.whenReady().then(async () => {
  try {
    const w = new BrowserWindow({ width: 1100, height: 760, show: true, webPreferences: { preload: path.join(__dirname, 'shot-preload.cjs'), contextIsolation: true, sandbox: true } });
    const logs = []; w.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) logs.push(msg); });
    await w.loadFile(path.join(__dirname, '..', 'renderer-dist', 'index.html'));
    await new Promise((r) => setTimeout(r, 2800));
    const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(out, 'desktop-chat.png'), img.toPNG());
    console.log(await w.webContents.executeJavaScript(`JSON.stringify({ stateVisible: !!document.querySelector('.ch-state') && getComputedStyle(document.querySelector('.ch-state')).display, navToggle: !!document.getElementById('navToggle') && getComputedStyle(document.getElementById('navToggle')).display, optsDisplay: getComputedStyle(document.querySelector('.cb-opts')).display, cbar: document.querySelector('.cbar').getBoundingClientRect().height })`));
    if (logs.length) console.log('console errors:', logs.slice(0, 5).join(' | '));
  } catch (e) { console.error('shot failed', e); }
  app.quit();
});
