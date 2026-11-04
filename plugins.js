// Skills page, main process: Claude Code skills (folders), Claude Code plugins and Codex plugins (via their CLIs).
// register(ipcMain, { shell, HOME, cwdFor, cmds }) - cwdFor(sid) -> project folder, cmds() -> { claude, codex } command names. Channels: plugins:*
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const NAME = /^[\w.@\/:~%+-]+$/;                 // plugin and marketplace names / ids
const FOLDER = /^[\w.-]+$/;                      // skill folder names
const SOURCE = /^(?:https:\/\/[\w.\-\/~:@%+]+|[\w.-]+\/[\w.-]+)$/; // https url or github owner/repo
const bad = (s) => typeof s !== 'string' || s.startsWith('-') || s.includes('..') && !s.startsWith('https://');

// Runs a CLI with an args array. On Windows the npm shims are .cmd files, so shell:true is needed there; every dynamic arg is regex-checked by the callers.
function cli(cmd, args, timeout = 20000) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout, windowsHide: true, shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1' } }, (err, stdout, stderr) => {
        const out = String(stdout || ''), er = String(stderr || '').trim();
        if (err) return resolve({ ok: false, out, error: (err.killed ? 'Timed out' : er || err.message).split('\n').slice(0, 4).join('\n') });
        resolve({ ok: true, out, error: er });
      });
    } catch (e) { resolve({ ok: false, out: '', error: String(e.message || e) }); }
  });
}

function descOf(dir) { // frontmatter description: of SKILL.md (plain, quoted or folded scalar)
  try {
    const t = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8').replace(/^﻿/, '');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(t); if (!fm) return '';
    const lines = fm[1].split(/\r?\n/), i = lines.findIndex((l) => /^description:/.test(l)); if (i < 0) return '';
    let v = lines[i].replace(/^description:\s*/, '');
    if (/^[>|][+-]?$/.test(v)) { v = ''; for (let j = i + 1; j < lines.length && /^\s/.test(lines[j]); j++) v += ' ' + lines[j].trim(); }
    return v.trim().replace(/^(["'])([\s\S]*)\1$/, '$2').replace(/\s+/g, ' ');
  } catch { return ''; }
}

// `codex plugin list` is a table per marketplace: "Marketplace `x`" header, then PLUGIN STATUS VERSION SOURCE rows.
function parseCodex(text) {
  const rows = []; let mk = '';
  for (const raw of text.split(/\r?\n/)) {
    const h = /^Marketplace `([^`]+)`/.exec(raw); if (h) { mk = h[1]; continue; }
    const m = /^(\S+@\S+)\s+(not installed|installed(?:, \w+)?)\s*(.*)$/.exec(raw); if (!m) continue;
    const parts = m[3].trim().split(/\s{2,}/).filter(Boolean);
    const version = parts.length > 1 || (parts[0] && !/[\\/]/.test(parts[0])) ? parts[0] : '';
    rows.push({ id: m[1], name: m[1].split('@')[0], marketplace: mk, installed: m[2] !== 'not installed', enabled: m[2].includes('enabled'), version });
  }
  return rows;
}

function register(ipcMain, ctx) {
  const { shell, HOME, cwdFor, cmds } = ctx;
  const cmd = (k) => { const c = (cmds() || {})[k]; return typeof c === 'string' && /^[\w.-]+$/.test(c) ? c : k; };
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => { try { return await fn(...a); } catch (e) { return { ok: false, error: String(e.message || e) }; } });
  const roots = (sid) => { let p = ''; try { p = path.join(cwdFor(sid), '.claude', 'skills'); } catch {} return { user: path.join(HOME, '.claude', 'skills'), project: p }; };
  const dirOf = (sid, source, name) => { const r = roots(sid)[source]; if (!r || !FOLDER.test(name || '') || name === '.' || name === '..') throw new Error('Invalid skill'); return path.join(r, name); };

  // ---- Claude Code skills ----
  h('plugins:skills', (sid) => {
    const out = [], r = roots(sid);
    for (const source of ['user', 'project']) {
      if (!r[source] || (source === 'project' && r.project === r.user)) continue;
      let ents = []; try { ents = fs.readdirSync(r[source], { withFileTypes: true }); } catch {}
      for (const e of ents) if (e.isDirectory() || e.isSymbolicLink()) out.push({ name: e.name, source, description: descOf(path.join(r[source], e.name)) });
    }
    return { ok: true, skills: out.sort((a, b) => a.name.localeCompare(b.name)) };
  });
  h('plugins:skillOpen', async (sid, source, name) => { const d = dirOf(sid, source, name); const e = await shell.openPath(d); return e ? { ok: false, error: e } : { ok: true }; });
  h('plugins:skillRemove', async (sid, source, name) => { await shell.trashItem(dirOf(sid, source, name)); return { ok: true }; });

  // ---- Claude Code plugins ----
  const json = (r) => { if (!r.ok) return r; try { return { ok: true, data: JSON.parse(r.out) }; } catch { return { ok: false, error: 'Unexpected output from the claude CLI' }; } };
  h('plugins:claudeList', async () => {
    const [a, m] = await Promise.all([cli(cmd('claude'), ['plugin', 'list', '--json']).then(json), cli(cmd('claude'), ['plugin', 'marketplace', 'list', '--json']).then(json)]);
    if (!a.ok) return a;
    const plugins = (Array.isArray(a.data) ? a.data : []).map((p) => ({ id: p.id, name: String(p.id).split('@')[0], marketplace: String(p.id).split('@')[1] || '', version: p.version || '', enabled: !!p.enabled, scope: p.scope || '' }));
    return { ok: true, plugins, marketplaces: m.ok && Array.isArray(m.data) ? m.data.map((x) => ({ name: x.name, source: x.repo || x.url || x.path || x.source || '' })) : [] };
  });
  h('plugins:claudeBrowse', async () => {
    const r = json(await cli(cmd('claude'), ['plugin', 'list', '--json', '--available'], 60000)); if (!r.ok) return r;
    const have = new Set((r.data.installed || []).map((p) => p.id));
    return { ok: true, available: (r.data.available || []).map((p) => ({ id: p.pluginId, name: p.name, marketplace: p.marketplaceName, description: p.description || '', installs: p.installCount || 0, installed: have.has(p.pluginId) })) };
  });
  const ACT = { install: 60000, uninstall: 60000, enable: 60000, disable: 60000, update: 60000 };
  h('plugins:claudeAct', async (action, id) => {
    if (!ACT[action] || !NAME.test(id || '') || bad(id)) return { ok: false, error: 'Invalid plugin' };
    const r = await cli(cmd('claude'), ['plugin', action, id], ACT[action]); return { ok: r.ok, error: r.ok ? '' : r.error, message: r.out.trim().split('\n').pop() };
  });
  h('plugins:claudeMarketAdd', async (src) => {
    src = String(src || '').trim(); if (!SOURCE.test(src) || bad(src)) return { ok: false, error: 'Use a GitHub owner/repo or an https URL' };
    const r = await cli(cmd('claude'), ['plugin', 'marketplace', 'add', src], 60000); return { ok: r.ok, error: r.ok ? '' : r.error };
  });
  h('plugins:claudeMarketRemove', async (name) => {
    if (!NAME.test(name || '') || bad(name)) return { ok: false, error: 'Invalid marketplace' };
    const r = await cli(cmd('claude'), ['plugin', 'marketplace', 'remove', name], 60000); return { ok: r.ok, error: r.ok ? '' : r.error };
  });

  // ---- Codex plugins ----
  h('plugins:codexList', async () => {
    const r = await cli(cmd('codex'), ['plugin', 'list'], 45000); if (!r.ok && !r.out) return r;
    const plugins = parseCodex(r.out);
    const m = await cli(cmd('codex'), ['plugin', 'marketplace', 'list']);
    const marketplaces = m.ok ? m.out.split(/\r?\n/).slice(1).map((l) => l.trim().split(/\s{2,}/)).filter((x) => x[0] && NAME.test(x[0])).map((x) => ({ name: x[0], source: x[1] || '' })) : [];
    return { ok: true, plugins, marketplaces };
  });
  h('plugins:codexAct', async (action, id) => {
    if (!['add', 'remove'].includes(action) || !NAME.test(id || '') || bad(id)) return { ok: false, error: 'Invalid plugin' };
    const r = await cli(cmd('codex'), ['plugin', action, id], 60000); return { ok: r.ok, error: r.ok ? '' : r.error };
  });
  h('plugins:codexMarketAdd', async (src) => {
    src = String(src || '').trim(); if (!SOURCE.test(src) || bad(src)) return { ok: false, error: 'Use a GitHub owner/repo or an https URL' };
    const r = await cli(cmd('codex'), ['plugin', 'marketplace', 'add', src], 60000); return { ok: r.ok, error: r.ok ? '' : r.error };
  });
  h('plugins:codexMarketRemove', async (name) => {
    if (!NAME.test(name || '') || bad(name)) return { ok: false, error: 'Invalid marketplace' };
    const r = await cli(cmd('codex'), ['plugin', 'marketplace', 'remove', name], 60000); return { ok: r.ok, error: r.ok ? '' : r.error };
  });
}

module.exports = { register, parseCodex, descOf, cli };
