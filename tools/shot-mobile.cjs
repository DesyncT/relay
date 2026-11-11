// Renders the phone version (the real built app served by mobile.js, with stand-in data) at phone size and saves screenshots.
// Usage: npx electron tools/shot-mobile.cjs <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const { createMobile } = require('../mobile');
const out = process.argv[2] || path.join(os.tmpdir(), 'relay-shots'); fs.mkdirSync(out, { recursive: true });
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-up-'));
const now = Date.now();
const msgs = [
  { from: 'user', text: 'Add a dark mode toggle to the settings page', at: now - 600000 },
  { from: 'claude', text: 'I will check how themes are stored, then add the toggle.\n\n- read `themes.js`\n- add a switch in Settings\n\n```js\nexport const applyTheme = (name) => document.documentElement.setAttribute("data-theme", name); // keeps the saved choice on startup\n```', at: now - 590000, usage: { tokens: 1200, cost: 0.02, model: 'claude-sonnet-5-5' } },
  { from: 'user', text: 'Also make sure it remembers my choice', at: now - 300000 },
  { from: 'codex', text: 'Done. The choice is saved in local storage and applied on startup. Should I also follow the system setting on first launch?', at: now - 120000, usage: { tokens: 800, cost: 0.01, model: 'gpt-5' }, askUser: true, options: ['Yes, follow the system setting', 'No, default to dark'] },
];
const sessions = [{ id: 's1', projectId: 'p1', title: 'Dark mode toggle', updated: now, created: now - 9e5, unread: false }, { id: 's2', projectId: 'p1', title: 'Fix login redirect', updated: now - 3e6, created: now - 4e6, unread: true }, { id: 's3', projectId: 'p1', title: 'Usage chart colors', updated: now - 9e6, created: now - 9e6, unread: false }];
const answers = {
  'profile:get': () => ({ name: 'you', avatar: '' }), 'settings:get': () => ({ lead: 'claude', lastTab: 'usage' }), 'sessions:getActive': () => 's1',
  'sessions:tree': () => ({ projects: [{ id: 'p1', name: 'jarvis', path: 'C:\\jarvis', collapsed: false }], sessions, active: 's1' }),
  'chat:history': () => msgs, 'chat:queue': () => [], 'subagents:list': () => [], 'sessions:working': () => [], 'models:list': () => [], 'skills:list': () => [], 'skills:inUse': () => ({ forced: [], used: [] }),
  'chat:info': () => ({ title: 'Dark mode toggle', lead: 'claude', mode: 'edits', easyMode: false, chatModels: {}, chatEffort: 'low', spend: { claude: { tokens: 1200, cost: 0.02, input: 800, output: 400, cached: 0, model: 'claude' } } }),
  'limits:get': () => ({ down: {}, now: Date.now() }), 'usage:quota': () => ({}), 'prices:get': () => ({}),
};
const m = createMobile({
  root: path.join(__dirname, '..', 'renderer-dist'), uploads, port: 0, host: '127.0.0.1',
  invoke: async (ch) => (answers[ch] ? answers[ch]() : null), approve: async () => true, load: () => [], save: () => {},
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = `(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  return JSON.stringify({ vw: innerWidth, sw: document.documentElement.scrollWidth, cbar: r('.cbar'), input: r('#input'), send: r('#send'), plus: r('#plus'), opts: r('.cb-opts'), head: r('.ch-head'), state: document.querySelector('.ch-state')?.textContent });
})()`;
app.whenReady().then(async () => {
  try {
    await m.start();
    const w = new BrowserWindow({ width: 390, height: 844, show: true, webPreferences: { sandbox: true } });
    w.webContents.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    const logs = []; w.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) logs.push(msg); });
    const shot = async (name) => { const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(out, name + '.png'), img.toPNG()); };
    const js = (code) => w.webContents.executeJavaScript(code);
    await w.loadURL(m.pair().url); await wait(2800); await shot('1-chat');
    console.log(await js(probe));
    // typing a longer message, as the keyboard would leave it
    await js(`(() => { const t = document.getElementById('input'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'Yes, follow the system setting on first launch, and add a quick test for it please'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await wait(600); await shot('2-typing');
    await js(`(() => { const b = [...document.querySelectorAll('#log .msg .body')].at(-2); b.scrollIntoView({ block: 'center' }); b.click(); })()`); await wait(500); await shot('3-tap');
    console.log('tap:', await js(`(() => { const m = document.querySelector('#log .msg.tap'); const a = m && m.querySelector('.acts'); return JSON.stringify({ tapped: !!m, actsShown: a ? getComputedStyle(a).display : null, others: [...document.querySelectorAll('#log .msg:not(.tap) .acts')].every((x) => getComputedStyle(x).display === 'none') }); })()`));
    await js(`document.getElementById('normalModel')?.click()`); await wait(700); await shot('4-menu');
    await js(`document.getElementById('navToggle')?.click()`); await wait(1300); await shot('5-drawer');
    if (logs.length) console.log('console errors:', logs.slice(0, 5).join(' | '));
  } catch (e) { console.error('shot failed', e); }
  m.stop(); app.quit();
});
