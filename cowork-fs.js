'use strict';
// Live project sync for a shared chat. Both sides hold a copy of the project and push changes to each other; the host keeps a
// backup of everything the partner overwrites so each change set can be undone. Every incoming path is validated: relative only,
// never inside .git / node_modules / agent-config folders, never secrets, never through a symlink, always inside the root.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SKIP_DIR = new Set(['.git', 'node_modules', '.claude', '.codex', '.agents', '.venv', 'venv', '__pycache__', '.next', '.cache', '.ssh', '.aws', '.gnupg', '.kube', '.docker', '.azure']); // compared lower-case: Windows and macOS are case-insensitive
const SECRET = /^(\.env(\..*)?|\.npmrc|\.pypirc|\.netrc|\.pgpass|\.htpasswd|\.git-credentials|\.dockercfg|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|pfx|p12|p8|jks|keystore|kdbx|tfstate|gpg|asc)|(.*[-_.])?(secrets?|credentials?|private[-_.]?keys?|api[-_.]?keys?|service[-_.]?accounts?)([-_.].*)?\.(json|ya?ml|toml|txt|ini|cfg|conf|properties|xml|env))$/i;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
const LIM = { file: 2 * 1024 * 1024, files: 4000, total: 100 * 1024 * 1024, batch: 2 * 1024 * 1024 };
const hash = (b) => crypto.createHash('sha1').update(b).digest('hex');

// Normalised forward-slash relative path, or null when it must never be synced.
function safeRel(p) {
  if (typeof p !== 'string' || !p || p.length > 400 || p.includes('\0')) return null;
  const s = p.replace(/\\/g, '/');
  if (s.startsWith('/') || /^[a-zA-Z]:/.test(s)) return null;
  const parts = s.split('/');
  if (parts.some((x) => !x || x === '.' || x === '..' || x.includes(':') || /[. ]$/.test(x) || /~\d/.test(x) || SKIP_DIR.has(x.toLowerCase()) || RESERVED.test(x))) return null;
  return SECRET.test(parts.at(-1)) ? null : parts.join('/');
}
const real = (p) => fs.realpathSync.native(p);
// Absolute path for rel inside root; throws if any existing ancestor escapes the root or the target is a symlink.
function absOf(root, rel) {
  const abs = path.join(root, ...rel.split('/')), rr = real(root);
  let cur = path.dirname(abs);
  while (!fs.existsSync(cur) && cur.length > root.length) cur = path.dirname(cur);
  const r = real(cur);
  if (r !== rr && !r.startsWith(rr + path.sep)) throw new Error('outside the project');
  try { if (fs.lstatSync(abs).isSymbolicLink()) throw new Error('symlink'); } catch (e) { if (e.message === 'symlink') throw e; }
  return abs;
}
function walk(root, sub = '') {
  const out = []; let total = 0;
  (function rec(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (!SKIP_DIR.has(e.name.toLowerCase())) rec(path.join(dir, e.name), r); continue; }
      if (!e.isFile() || !safeRel(r)) continue;
      const size = fs.statSync(path.join(dir, e.name)).size;
      if (size > LIM.file) continue;
      total += size; out.push(r);
      if (out.length > LIM.files || total > LIM.total) throw new Error('This project is too large to share (limit 4000 files / 100 MB, not counting node_modules and .git).');
    }
  })(sub ? path.join(root, sub) : root, sub);
  return out;
}
const wipe = (root) => { for (const e of fs.readdirSync(root)) fs.rmSync(path.join(root, e), { recursive: true, force: true }); };

// send(msg) ships {t:'fs', ...} to the partner. canWrite() gates incoming changes (the host can pause editing).
// allowSnap: only the guest's disposable copy may be wiped by a snapshot; the host's real project never is.
function createSync({ root, send, canWrite = () => true, allowSnap = false }) {
  const known = new Map(); // rel -> hash of the last content both sides agreed on (null = deleted)
  let watcher = null, timer = null, pending = new Set();
  const read = (rel) => { try { const abs = absOf(root, rel), st = fs.statSync(abs); return st.isFile() && st.size <= LIM.file ? fs.readFileSync(abs) : null; } catch { return null; } };

  function ship(rels) {
    const puts = [], dels = []; let size = 0;
    const out = () => { if (puts.length) send({ t: 'fs', puts: puts.splice(0) }); size = 0; };
    for (const rel of rels) {
      const r = safeRel(rel); if (!r) continue;
      const buf = read(r);
      if (buf) {
        const h = hash(buf); if (known.get(r) === h) continue;
        known.set(r, h); puts.push({ p: r, d: buf.toString('base64'), h }); size += buf.length;
        if (size >= LIM.batch) out();
      } else if (known.get(r)) { known.set(r, null); dels.push(r); }
    }
    out(); if (dels.length) send({ t: 'fs', dels });
  }
  function drain() {
    const p = pending; pending = new Set(); timer = null;
    try {
      if (p.has(null)) return ship(new Set([...walk(root), ...known.keys()])); // unknown change: compare everything
      const rels = new Set();
      for (const rel of p) {
        try { if (fs.statSync(absOf(root, safeRel(rel) || '_')).isDirectory()) { for (const f of walk(root, rel)) rels.add(f); continue; } } catch {}
        rels.add(rel);
      }
      ship(rels);
    } catch (e) { send({ t: 'fs', error: e.message }); }
  }
  const api = {
    known,
    // Host: send the whole project. The partner wipes its copy first.
    snapshot() { const files = walk(root); known.clear(); send({ t: 'fs', snap: true, count: files.length }); ship(files); send({ t: 'fs', snapEnd: true }); },
    // Start pushing local edits (debounced). Safe to call once.
    watch() {
      if (watcher) return;
      watcher = fs.watch(root, { recursive: true }, (_ev, name) => {
        const rel = name ? String(name).replace(/\\/g, '/') : null;
        if (rel && !safeRel(rel) && rel.split('/').some((x) => SKIP_DIR.has(x.toLowerCase()))) return; // node_modules churn etc.
        pending.add(rel); clearTimeout(timer); timer = setTimeout(drain, 300);
      });
      watcher.on('error', () => {});
    },
    push(rels) { ship(rels); },
    // Apply a partner message. Returns [{rel, prev (Buffer|null), after (hash|null)}] for what actually changed.
    apply(m) {
      const applied = [];
      if (m.snap) { if (allowSnap) { wipe(root); known.clear(); } return applied; }
      if (!canWrite()) return applied;
      for (const f of Array.isArray(m.puts) ? m.puts : []) {
        const rel = safeRel(f?.p); if (!rel || typeof f.d !== 'string') continue;
        const buf = Buffer.from(f.d, 'base64');
        if (buf.length > LIM.file || hash(buf) !== f.h) continue;
        let abs; try { abs = absOf(root, rel); } catch { continue; }
        let prev = null; try { if (fs.statSync(abs).isFile()) prev = fs.readFileSync(abs); } catch {}
        if (prev && hash(prev) === f.h) { known.set(rel, f.h); continue; }
        try { fs.mkdirSync(path.dirname(abs), { recursive: true }); abs = absOf(root, rel); fs.writeFileSync(abs, buf); } catch { continue; }
        known.set(rel, f.h); applied.push({ rel, prev, after: f.h });
      }
      for (const p of Array.isArray(m.dels) ? m.dels : []) {
        const rel = safeRel(p); if (!rel) continue;
        let abs; try { abs = absOf(root, rel); } catch { continue; }
        let prev; try { if (!fs.statSync(abs).isFile()) continue; prev = fs.readFileSync(abs); fs.unlinkSync(abs); } catch { continue; }
        known.set(rel, null); applied.push({ rel, prev, after: null });
      }
      return applied;
    },
    close() { clearTimeout(timer); try { watcher?.close(); } catch {} watcher = null; },
  };
  return api;
}

// ---- undo: backups of what a partner's change overwrote, grouped into change sets on disk ----
function saveChange(dir, id, meta, entries) {
  const d = path.join(dir, id); fs.mkdirSync(d, { recursive: true });
  const list = entries.map((e, i) => { if (e.prev) fs.writeFileSync(path.join(d, i + '.bak'), e.prev); return { rel: e.rel, bak: e.prev ? i + '.bak' : null, after: e.after }; });
  fs.writeFileSync(path.join(d, 'change.json'), JSON.stringify({ id, ...meta, entries: list }));
}
// Restores each file to its backup unless it changed again since (those are skipped). Returns {restored: [rel], skipped: [rel]}.
function undoChange(dir, id, root) {
  const d = path.join(dir, String(id).replace(/[^\w-]/g, '')), mf = path.join(d, 'change.json');
  if (!fs.existsSync(mf)) throw new Error('That change is no longer available.');
  const ch = JSON.parse(fs.readFileSync(mf, 'utf8'));
  if (ch.undone) throw new Error('Already undone.');
  const restored = [], skipped = [];
  for (const e of ch.entries) {
    const rel = safeRel(e.rel); if (!rel) continue;
    let abs; try { abs = absOf(root, rel); } catch { continue; }
    let cur = null; try { cur = fs.readFileSync(abs); } catch {}
    if ((cur ? hash(cur) : null) !== e.after) { skipped.push(rel); continue; }
    try {
      if (e.bak) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, fs.readFileSync(path.join(d, e.bak))); } else fs.unlinkSync(abs);
      restored.push(rel);
    } catch { skipped.push(rel); }
  }
  fs.writeFileSync(mf, JSON.stringify({ ...ch, undone: Date.now() }));
  return { restored, skipped };
}
module.exports = { safeRel, absOf, walk, createSync, saveChange, undoChange, hash, LIM };
