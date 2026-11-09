// Usage: node_modules/.bin/electron tools/harness.cjs --dir <vite outDir> --out shot.png [--fixtures fx.json]
//          [--eval script.js] [--size 1280x800] [--wait 600]
// Loads a built renderer with the mock api, runs the optional script in the page (its result is printed as JSON),
// prints console errors, and saves a screenshot. Never touches real Relay data.
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const [w, h] = arg('size', '1280x800').split('x').map(Number);
if (arg('fixtures')) process.env.RELAY_FIXTURES = path.resolve(arg('fixtures'));
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: w, height: h, webPreferences: { preload: path.join(__dirname, 'harness-preload.cjs'), contextIsolation: true, sandbox: false, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2 && !msg.includes('Electron Security Warning')) errors.push(msg); });
  win.webContents.on('render-process-gone', (_e, d) => errors.push('renderer gone: ' + d.reason));
  await win.loadFile(path.resolve(arg('dir'), 'index.html'));
  await new Promise((r) => setTimeout(r, Number(arg('wait', 600))));
  if (arg('eval')) {
    try { console.log('eval:', JSON.stringify(await win.webContents.executeJavaScript(fs.readFileSync(arg('eval'), 'utf8')))); }
    catch (e) { errors.push('eval failed: ' + e.message); }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (arg('out')) fs.writeFileSync(arg('out'), (await win.webContents.capturePage()).toPNG());
  console.log('errors:', JSON.stringify(errors));
  app.exit(errors.length ? 1 : 0);
});
