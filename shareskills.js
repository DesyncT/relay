// Every agent gets every skill. Claude's skills (+ skills of enabled Claude plugins) are linked into ~/.agents/skills,
// which Codex reads; Codex's skills (~/.agents/skills + skills of enabled Codex plugins) reach Claude through a Relay
// plugin folder passed with --plugin-dir. Only directory junctions are made and removed, never real folders.
const fs = require('fs'), path = require('path'), os = require('os');
const H = os.homedir(), AGENTS = path.join(H, '.agents', 'skills');
const json = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const skillsIn = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => fs.existsSync(path.join(dir, e.name, 'SKILL.md'))).map((e) => [e.name, path.join(dir, e.name)]); } catch { return []; } };
const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };
const unlink = (p) => { if (isLink(p)) try { fs.unlinkSync(p); } catch { try { fs.rmdirSync(p); } catch {} } }; // junctions only; never recursive
const link = (src, dst) => { try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.symlinkSync(src, dst, 'junction'); return true; } catch { return false; } };

function claudeSkills() {
  const on = json(path.join(H, '.claude', 'settings.json'), {}).enabledPlugins || {};
  const inst = json(path.join(H, '.claude', 'plugins', 'installed_plugins.json'), {}).plugins || {};
  const out = skillsIn(path.join(H, '.claude', 'skills'));
  for (const [id, list] of Object.entries(inst)) if (on[id]) for (const p of list || []) out.push(...skillsIn(path.join(p.installPath || '', 'skills')));
  return out;
}
function codexSkills(ours) {
  let toml = ''; try { toml = fs.readFileSync(path.join(H, '.codex', 'config.toml'), 'utf8'); } catch {}
  const out = skillsIn(AGENTS).filter(([n]) => !ours.has(n));
  for (const [, id] of toml.matchAll(/\[plugins\."([^"]+)"\]\s*\r?\nenabled\s*=\s*true/g)) {
    const [name, mkt] = id.split('@'), base = path.join(H, '.codex', 'plugins', 'cache', mkt || '', name || '');
    let vers = []; try { vers = fs.readdirSync(base).sort(); } catch {}
    if (vers.length) out.push(...skillsIn(path.join(base, vers.at(-1), 'skills')));
  }
  return out;
}

let last = 0, dir = null;
// Returns the Relay plugin folder for Claude's --plugin-dir. Cheap; re-links at most every 30s.
function sync(dataDir) {
  if (dir && Date.now() - last < 30000) return dir;
  last = Date.now();
  const stateFile = path.join(dataDir, 'shared-skills.json'), state = json(stateFile, { codex: [] });
  // Claude -> Codex: links in ~/.agents/skills that Relay made (tracked, so the user's own folders are never touched)
  for (const n of state.codex) unlink(path.join(AGENTS, n));
  const made = [], seen = new Set();
  for (const [n, src] of claudeSkills()) if (!seen.has(n) && (seen.add(n), !fs.existsSync(path.join(AGENTS, n))) && link(src, path.join(AGENTS, n))) made.push(n);
  // Codex -> Claude: a plugin folder whose skills/ holds junctions, rebuilt each time
  const plug = path.join(dataDir, 'shared-plugin'), sk = path.join(plug, 'skills'), claudeHas = new Set([...seen]);
  fs.mkdirSync(path.join(plug, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(plug, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'relay-shared', version: '1.0.0', description: 'Codex skills and plugin skills, shared by Relay' }));
  try { for (const e of fs.readdirSync(sk)) unlink(path.join(sk, e)); } catch {}
  for (const [n, src] of codexSkills(new Set(made))) if (!claudeHas.has(n)) { claudeHas.add(n); link(src, path.join(sk, n)); }
  try { fs.writeFileSync(stateFile, JSON.stringify({ codex: made })); } catch {}
  return (dir = plug);
}

module.exports = { sync };
