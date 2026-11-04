// Main-process side of the side panels. Usage: const panels = require('./panels-main')(ipcMain, { getCwd, win }); panels.snapshot(sid)
// getCwd(sid) -> folder; win -> BrowserWindow or () => BrowserWindow. Channels: panel:*
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { pathToFileURL } = require('url');

const IGNORE = new Set(['node_modules', '.git', 'dist', '.next']);
const IMG = /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i;
const SNAP_MAX = 200 * 1024, SNAP_FILES = 5000, DIFF_CAP = 400;
const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]/g;

module.exports = function registerPanels(ipcMain, { getCwd, win, extraRoots = [] }) {
  const send = (ch, d) => { try { const ws = [].concat(typeof win === 'function' ? win() : win); for (const w of ws) if (w && !w.isDestroyed()) w.webContents.send(ch, d); } catch {} }; // one window or all of them
  const cwdOf = (sid) => { const c = getCwd(sid); if (!c) throw new Error('no project folder'); return c; };
  const inside = (root, p) => { const r = path.relative(root, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
  const safe = (sid, rel) => { const root = cwdOf(sid), p = path.resolve(root, rel || '.'); if (!inside(root, p)) throw new Error('outside project'); return p; };
  // the viewer may also read files in extra roots (e.g. userData/uploads)
  const safeView = (sid, f) => { const root = cwdOf(sid), p = path.resolve(root, f); if (![root, ...extraRoots].some((r) => inside(r, p))) throw new Error('outside project'); return p; };
  const isText = (buf) => !buf.subarray(0, 8192).includes(0);
  const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => { try { return await fn(...a); } catch (e) { return { error: String(e.message || e) }; } });

  // ---------- terminal ----------
  const terms = new Map(); // sid -> child
  function termStart(sid) {
    if (terms.has(sid)) return { running: true };
    const cwd = cwdOf(sid), win32 = process.platform === 'win32';
    const c = spawn(win32 ? 'powershell.exe' : (process.env.SHELL || 'sh'), win32 ? ['-NoLogo', '-NoProfile', '-Command', '-'] : [], { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    terms.set(sid, c);
    const out = (b) => send('panel:term:data', { sid, data: b.toString('utf8').replace(ANSI, '').replace(/\r\n?/g, '\n') });
    c.stdout.on('data', out); c.stderr.on('data', out);
    c.on('error', (e) => out(Buffer.from('shell error: ' + e.message + '\n')));
    c.on('exit', (code) => { if (terms.get(sid) === c) terms.delete(sid); send('panel:term:exit', { sid, code }); });
    c.stdin.on('error', () => {});
    if (win32) c.stdin.write('[Console]::OutputEncoding=[Text.Encoding]::UTF8\n');
    return { running: true, cwd };
  }
  function termKill(sid) {
    const c = terms.get(sid); if (!c) return; terms.delete(sid);
    if (process.platform === 'win32') execFile('taskkill', ['/pid', String(c.pid), '/T', '/F'], () => {}); else c.kill('SIGKILL');
  }
  handle('panel:term:start', termStart);
  handle('panel:term:write', (sid, line) => { const c = terms.get(sid); if (!c) return false; c.stdin.write(String(line) + '\n'); return true; });
  handle('panel:term:restart', (sid) => { termKill(sid); return termStart(sid); }); // Ctrl+C
  handle('panel:term:stop', (sid) => { termKill(sid); return true; });

  // ---------- changes ----------
  const snaps = new Map(); // sid -> Map(rel -> {size, mtime, text|null})
  // async on purpose: a sync walk of a big project (5000 files, ~80 MB) blocked the UI thread for 5s and Windows killed Relay as "not responding"
  async function walk(root, cb, rel = '', n = { v: 0 }) {
    let ents; try { ents = await fs.promises.readdir(path.join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (IGNORE.has(e.name) || n.v > SNAP_FILES) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) await walk(root, cb, r, n); else if (e.isFile()) { n.v++; await cb(r); }
    }
  }
  async function readSnap(root, rel, old) {
    const p = path.join(root, rel); let st; try { st = await fs.promises.stat(p); } catch { return null; }
    if (old && old.size === st.size && old.mtime === st.mtimeMs) return old; // unchanged: don't read it again
    let text = null;
    if (st.size < SNAP_MAX) { const b = await fs.promises.readFile(p).catch(() => null); if (b && isText(b)) text = b.toString('utf8'); }
    return { size: st.size, mtime: st.mtimeMs, text };
  }
  const snapping = new Map(); // one baseline walk per session at a time
  function snapshot(sid) {
    if (!snapping.has(sid)) snapping.set(sid, (async () => { const root = cwdOf(sid), m = new Map(); await walk(root, async (r) => m.set(r, await readSnap(root, r))); snaps.set(sid, m); return m.size; })().finally(() => snapping.delete(sid)));
    return snapping.get(sid);
  }
  // ponytail: one hunk (common prefix/suffix trimmed, 3 lines context), not an LCS diff. Upgrade to a real diff lib if interleaved edits matter.
  function mkDiff(a, b) {
    const x = a === '' ? [] : a.split('\n'), y = b === '' ? [] : b.split('\n');
    let s = 0; while (s < x.length && s < y.length && x[s] === y[s]) s++;
    let e = 0; while (e < x.length - s && e < y.length - s && x[x.length - 1 - e] === y[y.length - 1 - e]) e++;
    const c0 = Math.max(0, s - 3), ce = Math.min(e, 3), xs = x.slice(s, x.length - e), ys = y.slice(s, y.length - e);
    const L = [`@@ -${c0 + 1},${x.length - c0 - e + ce} +${c0 + 1},${y.length - c0 - e + ce} @@`, ...x.slice(c0, s).map((l) => ' ' + l), ...xs.map((l) => '-' + l), ...ys.map((l) => '+' + l), ...x.slice(x.length - e, x.length - e + ce).map((l) => ' ' + l)];
    return { add: ys.length, del: xs.length, diff: L.slice(0, DIFF_CAP).join('\n') };
  }
  const count = (d) => { let add = 0, del = 0; for (const l of d.split('\n')) { if (l[0] === '+' && !l.startsWith('+++')) add++; else if (l[0] === '-' && !l.startsWith('---')) del++; } return { add, del }; };
  const git = (cwd, args) => new Promise((res) => execFile('git', args, { cwd, maxBuffer: 16e6, windowsHide: true }, (err, out) => res(err ? null : out)));
  async function changes(sid) {
    const root = cwdOf(sid);
    if ((await git(root, ['rev-parse', '--is-inside-work-tree']))?.trim() === 'true') {
      const st = (await git(root, ['status', '--porcelain', '-z', '-uall'])) || '', parts = st.split('\0'), files = [];
      for (let i = 0; i < parts.length && files.length < 200; i++) {
        const q = parts[i]; if (q.length < 4) continue;
        const code = q.slice(0, 2), file = q.slice(3); if (code[0] === 'R' || code[0] === 'C') i++;
        const status = code.includes('?') || code.includes('A') ? 'A' : code.includes('D') ? 'D' : 'M';
        let diff = '', cnt;
        if (code === '??') { const t = (await readSnap(root, file))?.text; if (t != null) { const d = mkDiff('', t); diff = d.diff; cnt = { add: d.add, del: 0 }; } }
        else { diff = (await git(root, ['diff', 'HEAD', '--', file])) ?? (await git(root, ['diff', '--', file])) ?? ''; cnt = count(diff); }
        files.push({ file, status, ...(cnt || { add: 0, del: 0 }), diff: diff.split('\n').slice(0, DIFF_CAP).join('\n') });
      }
      return { mode: 'git', files };
    }
    const base = snaps.get(sid);
    if (!base) { snapshot(sid); return { mode: 'snapshot', files: [], fresh: true }; }
    const files = [], seen = new Set();
    await walk(root, async (r) => {
      seen.add(r); const old = base.get(r), cur = await readSnap(root, r, old);
      if (!cur || cur === old) return;
      if (!old) { files.push({ file: r, status: 'A', ...(cur.text != null ? mkDiff('', cur.text) : { add: 0, del: 0, diff: '' }) }); return; }
      if (old.size === cur.size && old.mtime === cur.mtime) return;
      if (old.text != null && cur.text != null) { if (old.text !== cur.text) files.push({ file: r, status: 'M', ...mkDiff(old.text, cur.text) }); }
      else files.push({ file: r, status: 'M', add: 0, del: 0, diff: '' });
    });
    for (const [r, o] of base) if (!seen.has(r)) files.push({ file: r, status: 'D', ...(o?.text != null ? mkDiff(o.text, '') : { add: 0, del: 0, diff: '' }) });
    return { mode: 'snapshot', files: files.slice(0, 200) };
  }
  handle('panel:snapshot', snapshot);
  handle('panel:changes', changes);

  // ---------- files ----------
  handle('panel:files:list', (sid, rel) => fs.readdirSync(safe(sid, rel), { withFileTypes: true }).filter((e) => !IGNORE.has(e.name))
    .map((e) => ({ name: e.name, dir: e.isDirectory() })).sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name)));
  const view = (sid, f) => {
    const p = safeView(sid, f), st = fs.statSync(p), ext = path.extname(p).slice(1).toLowerCase();
    return { path: p, name: path.basename(p), ext, size: st.size, url: pathToFileURL(p).href, image: IMG.test(p) };
  };
  handle('panel:file:stat', view);
  handle('panel:file:read', (sid, f) => {
    const v = view(sid, f); if (v.image) return { ...v, kind: 'image' };
    if (v.size > 1e6) return { ...v, kind: 'other' };
    const b = fs.readFileSync(v.path); if (!isText(b)) return { ...v, kind: 'other' };
    return { ...v, kind: 'text', text: b.toString('utf8').split('\n').slice(0, 5000).join('\n') };
  });
  handle('panel:file:b64', (sid, f) => { const v = view(sid, f); if (v.size > 15e6) throw new Error('file too large'); return { name: v.name, b64: fs.readFileSync(v.path).toString('base64') }; });
  handle('panel:file:open', async (sid, f) => (await require('electron').shell.openPath(view(sid, f).path)) || true);
  handle('panel:file:reveal', (sid, f) => { require('electron').shell.showItemInFolder(view(sid, f).path); return true; });

  // viewer live reload: one watcher, debounced 200ms
  let watcher = null, timer = null;
  handle('panel:watch', (sid, f) => {
    if (watcher) { watcher.close(); watcher = null; }
    if (!f) return true;
    const p = view(sid, f).path;
    watcher = fs.watch(p, () => { clearTimeout(timer); timer = setTimeout(() => send('panel:file:changed', { path: p }), 200); });
    watcher.on('error', () => {});
    return true;
  });

  handle('panel:probe', (port) => new Promise((res) => {
    const s = net.connect({ port: +port, host: '127.0.0.1' }); s.setTimeout(400);
    s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); s.on('timeout', () => { s.destroy(); res(false); });
  }));

  return { snapshot, killAll: () => { for (const s of [...terms.keys()]) termKill(s); if (watcher) watcher.close(); } };
};
