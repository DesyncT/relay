// Unbloat: scans what every Claude run loads into context (plugins, skills, hooks, MCP, rules, Relay's own extras)
// and turns items off for Relay's runs only. The user's global Claude config is never edited.
const fs = require('fs'), path = require('path'), os = require('os');
const H = os.homedir();
const json = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const tok = (s) => Math.round(String(s).length / 4); // ponytail: chars/4 estimate; use the token-count API if precision matters
const HOOK = 3000, MCP = 1500, CHROME = 4000; // ponytail: rough per-item guesses, real size depends on the plugin/server

// Until a skill is invoked only its frontmatter (name + description) sits in context.
function skillCost(dir) {
  let n = 0, t = 0;
  try { for (const e of fs.readdirSync(dir)) { const m = read(path.join(dir, e, 'SKILL.md')); if (!m) continue; n++; const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(m); t += tok(fm ? fm[1] : m.slice(0, 400)); } } catch {}
  return { n, t };
}
function hookEvents(ip) {
  const pj = json(path.join(ip, '.claude-plugin', 'plugin.json'), {});
  const h = pj.hooks && typeof pj.hooks === 'object' ? pj.hooks : json(path.join(ip, typeof pj.hooks === 'string' ? pj.hooks : 'hooks/hooks.json'), {}).hooks;
  return Object.keys(h || {});
}
const injects = (ev) => ev.filter((e) => e === 'SessionStart' || e === 'UserPromptSubmit').length;

const DEFAULT = { plugins: [], skills: false, mcp: false, chrome: false, shared: false, forced: false }; // true / listed = turned off
const cfgOf = (s) => ({ ...DEFAULT, ...(s || {}), plugins: Array.isArray(s?.plugins) ? s.plugins : [] });

function scan(o) {
  const cfg = cfgOf(o.cfg), items = [];
  const on = json(path.join(H, '.claude', 'settings.json'), {}).enabledPlugins || {};
  const inst = json(path.join(H, '.claude', 'plugins', 'installed_plugins.json'), {}).plugins || {};
  for (const [id, list] of Object.entries(inst)) {
    if (!on[id]) continue;
    const ip = list?.[0]?.installPath || '', sk = skillCost(path.join(ip, 'skills')), ev = hookEvents(ip);
    const mcp = Object.keys(json(path.join(ip, '.mcp.json'), {}).mcpServers || json(path.join(ip, '.mcp.json'), {}) || {}).length;
    const why = [sk.n && `${sk.n} skills`, ev.length && `hooks: ${ev.join(', ')}`, mcp && `${mcp} MCP server${mcp > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
    items.push({ id: 'plugin:' + id, kind: 'Plugin', name: id.split('@')[0], why: why || 'commands only', tokens: sk.t + injects(ev) * HOOK + mcp * MCP, off: cfg.plugins.includes(id), hook: injects(ev) > 0 });
  }
  const user = skillCost(path.join(H, '.claude', 'skills')), proj = o.cwd ? skillCost(path.join(o.cwd, '.claude', 'skills')) : { n: 0, t: 0 };
  if (user.n + proj.n) items.push({ id: 'skills', kind: 'Skills', name: 'Standalone skills', why: `${user.n + proj.n} in ~/.claude/skills and the project. Off also blocks plugin skills and slash commands`, tokens: user.t + proj.t, off: cfg.skills });
  const um = Object.keys(json(path.join(H, '.claude.json'), {}).mcpServers || {}).length;
  items.push({ id: 'mcp', kind: 'MCP', name: 'MCP servers from your Claude config', why: um ? `${um} user servers + plugin servers` : 'Plugin MCP servers', tokens: um * MCP, off: cfg.mcp });
  items.push({ id: 'chrome', kind: 'Relay', name: 'Chrome browser tools (--chrome)', why: 'Browser tool definitions on every run', tokens: CHROME, off: cfg.chrome });
  const sh = o.dataDir ? skillCost(path.join(o.dataDir, 'shared-plugin', 'skills')) : { n: 0, t: 0 };
  items.push({ id: 'shared', kind: 'Relay', name: 'Shared Codex skills (relay-shared)', why: `${sh.n} skills shared from Codex + Relay design`, tokens: sh.t, off: cfg.shared });
  const forced = read(o.forcedFile).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (forced.length) items.push({ id: 'forced', kind: 'Prompt', name: 'Always-use skills', why: `Forces ${forced.join(', ')} to load in full on every task`, tokens: forced.length * 2500, off: cfg.forced });
  for (const [name, f] of [['~/.claude/CLAUDE.md', path.join(H, '.claude', 'CLAUDE.md')], ['Project CLAUDE.md', o.cwd && path.join(o.cwd, 'CLAUDE.md')], ['Shared rules', o.sharedFile]]) {
    const t = f && tok(read(f)); if (t) items.push({ id: 'file:' + f, kind: 'Prompt', name, why: f + ' (edit it to trim)', tokens: t, fixed: true });
  }
  items.sort((a, b) => b.tokens - a.tokens);
  return { items, total: items.reduce((s, x) => s + x.tokens, 0), saved: items.reduce((s, x) => s + (x.off ? x.tokens : 0), 0) };
}

// Everything the scan can turn off, off. Prompt files (CLAUDE.md, rules) stay: they are the user's own words.
function all(o) { const r = scan({ ...o, cfg: {} }); return { plugins: r.items.filter((x) => x.id.startsWith('plugin:')).map((x) => x.id.slice(7)), skills: true, mcp: true, chrome: true, shared: true, forced: true }; }

function toggle(cfg, id, off) {
  const c = cfgOf(cfg);
  if (id.startsWith('plugin:')) { const p = id.slice(7); c.plugins = off ? [...new Set([...c.plugins, p])] : c.plugins.filter((x) => x !== p); }
  else if (id in DEFAULT) c[id] = !!off;
  return c;
}

// Extra Claude CLI args for one run. q quotes a path for the shell.
function args(cfg, dataDir, q) {
  const c = cfgOf(cfg), out = [];
  if (c.plugins.length) {
    const f = path.join(dataDir, 'unbloat-settings.json');
    try { fs.writeFileSync(f, JSON.stringify({ enabledPlugins: Object.fromEntries(c.plugins.map((p) => [p, false])) })); out.push('--settings', q(f)); } catch {}
  }
  if (c.skills) out.push('--disable-slash-commands');
  if (c.mcp) out.push('--strict-mcp-config');
  return out;
}

module.exports = { scan, all, toggle, args, cfgOf };

if (require.main === module) { // self-check: node unbloat.js
  const assert = require('assert');
  let c = toggle({}, 'plugin:superpowers@x', true); assert.deepStrictEqual(c.plugins, ['superpowers@x']);
  c = toggle(c, 'chrome', true); assert.strictEqual(c.chrome, true);
  c = toggle(c, 'plugin:superpowers@x', false); assert.deepStrictEqual(c.plugins, []);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-'));
  assert.deepStrictEqual(args({ plugins: ['a@b'], skills: true }, tmp, (p) => `"${p}"`).slice(2), ['--disable-slash-commands']);
  assert.deepStrictEqual(json(path.join(tmp, 'unbloat-settings.json'), {}).enabledPlugins, { 'a@b': false });
  const r = scan({ cfg: {}, dataDir: tmp }); console.log(r.items.map((x) => `${x.tokens}\t${x.kind}\t${x.name}\t${x.why}`).join('\n'), '\ntotal ~', r.total);
  console.log('ok');
}
