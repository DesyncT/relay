// Connected models: any LLM endpoint Relay can run through the Codex CLI (OpenAI Responses API) or the Claude CLI (Anthropic API).
// A connected model is referenced as `conn:<connId>/<model>` (session.chatModels.<seat>). Keys never leave the main process.
const { execFile } = require('child_process');

const PRESETS = [
  { id: 'ollama', name: 'Ollama (local)', engine: 'codex', baseUrl: 'http://localhost:11434/v1', envKey: '', local: true },
  { id: 'lmstudio', name: 'LM Studio (local)', engine: 'codex', baseUrl: 'http://localhost:1234/v1', envKey: '', local: true },
  { id: 'openai', name: 'OpenAI API', engine: 'codex', baseUrl: 'https://api.openai.com/v1', envKey: 'OPENAI_API_KEY' },
  { id: 'openrouter', name: 'OpenRouter', engine: 'codex', baseUrl: 'https://openrouter.ai/api/v1', envKey: 'OPENROUTER_API_KEY' },
  { id: 'groq', name: 'Groq', engine: 'codex', baseUrl: 'https://api.groq.com/openai/v1', envKey: 'GROQ_API_KEY' },
  { id: 'xai', name: 'xAI (Grok)', engine: 'codex', baseUrl: 'https://api.x.ai/v1', envKey: 'XAI_API_KEY' },
  { id: 'anthropic', name: 'Anthropic API', engine: 'claude', baseUrl: 'https://api.anthropic.com', envKey: 'ANTHROPIC_API_KEY' },
  { id: 'deepseek', name: 'DeepSeek', engine: 'claude', baseUrl: 'https://api.deepseek.com/anthropic', envKey: 'DEEPSEEK_API_KEY' },
  { id: 'moonshot', name: 'Moonshot (Kimi)', engine: 'claude', baseUrl: 'https://api.moonshot.ai/anthropic', envKey: 'MOONSHOT_API_KEY' },
  { id: 'zai', name: 'Z.ai (GLM)', engine: 'claude', baseUrl: 'https://api.z.ai/api/anthropic', envKey: 'ZAI_API_KEY' },
  { id: 'minimax', name: 'MiniMax', engine: 'claude', baseUrl: 'https://api.minimax.io/anthropic', envKey: 'MINIMAX_API_KEY' },
  { id: 'custom-openai', name: 'Custom (OpenAI Responses-compatible)', engine: 'codex', baseUrl: '', envKey: '' },
  { id: 'custom-anthropic', name: 'Custom (Anthropic-compatible)', engine: 'claude', baseUrl: '', envKey: '' },
];
const presetOf = (id) => PRESETS.find((p) => p.id === id);
const SAFE_URL = /^https?:\/\/[^\s"&|<>^%`$'\\]+$/, SAFE_MODEL = /^[\w.:/@+-]+$/;
const isConn = (m) => typeof m === 'string' && m.startsWith('conn:');
const parseRef = (m) => { const i = m.indexOf('/'); return i < 0 ? null : { id: m.slice(5, i), model: m.slice(i + 1) }; };
const envName = (id) => 'RELAY_KEY_' + String(id).replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
const trim = (u) => String(u || '').trim().replace(/\/+$/, '');

function ss() { try { return require('electron').safeStorage; } catch { return null; } }
function seal(k) {
  if (!k) return '';
  const s = ss();
  try { if (s?.isEncryptionAvailable()) return 'enc:' + s.encryptString(k).toString('base64'); } catch {}
  return 'raw:' + Buffer.from(k).toString('base64'); // ponytail: no OS keystore available, base64 only
}
function unseal(v) {
  if (!v) return '';
  try {
    const b = Buffer.from(v.slice(4), 'base64');
    return v.startsWith('enc:') ? ss().decryptString(b) : b.toString();
  } catch { return ''; }
}
const keyOf = (c) => unseal(c.key) || (presetOf(c.preset)?.envKey && process.env[presetOf(c.preset).envKey]) || '';

const has = (cmd) => new Promise((r) => execFile(process.platform === 'win32' ? 'where' : 'which', [cmd], { windowsHide: true }, (e) => r(!e)));
async function probe(url) {
  try { return (await fetch(trim(url) + '/models', { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
async function detect(cmds = {}) {
  const out = { presets: {}, cli: {} };
  await Promise.all([
    ...PRESETS.map(async (p) => { out.presets[p.id] = p.local ? { running: await probe(p.baseUrl) } : { keyFound: !!(p.envKey && process.env[p.envKey]) }; }),
    ...['claude', 'codex', 'antigravity'].map(async (n) => { out.cli[n] = await has(cmds[n] || n); }),
  ]);
  return out;
}

async function listModels(c) {
  const key = keyOf(c), base = trim(c.baseUrl);
  const anth = c.engine === 'claude';
  const headers = anth ? { 'anthropic-version': '2023-06-01', ...(key && { 'x-api-key': key, Authorization: 'Bearer ' + key }) } : key ? { Authorization: 'Bearer ' + key } : {};
  const r = await fetch(base + (anth ? '/v1/models' : '/models'), { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`.trim() + ' from ' + base);
  const j = await r.json();
  const ids = (j.data || j.models || []).map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter((x) => x && SAFE_MODEL.test(x));
  return [...new Set(ids)].sort();
}

// How to run `model` on connection `c`: { engine, args, env }. Args replace the routed -m/--model args entirely.
function spec(c, model) {
  const key = keyOf(c);
  if (c.engine === 'claude') {
    const env = { ANTHROPIC_BASE_URL: trim(c.baseUrl), ANTHROPIC_DEFAULT_HAIKU_MODEL: model, ANTHROPIC_DEFAULT_SONNET_MODEL: model, ANTHROPIC_DEFAULT_OPUS_MODEL: model };
    if (c.preset !== 'anthropic') env.ANTHROPIC_API_KEY = ''; // never hand the user's own Anthropic key to a third-party endpoint
    if (key) env[c.preset === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'ANTHROPIC_AUTH_TOKEN'] = key;
    return { engine: 'claude', args: ['--model', model], env };
  }
  const p = 'model_providers.relay_' + String(c.id).replace(/\W/g, '_');
  const kv = (k, v) => ['-c', `"${p}.${k}=\\"${v}\\""`];
  const env = {};
  if (key) env[envName(c.id)] = key;
  return {
    engine: 'codex',
    args: [...kv('name', String(c.name).replace(/[^\w .-]/g, '')), ...kv('base_url', trim(c.baseUrl)), ...kv('wire_api', 'responses'), ...(key ? kv('env_key', envName(c.id)) : []), '-c', `model_provider=relay_${String(c.id).replace(/\W/g, '_')}`, '-m', model],
    env,
  };
}
// Removes the user's own -m/--model args so a connected model is never overridden or duplicated.
function dropModel(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (/^(?:-m|--model)$/.test(args[i])) i++;
    else if (!/^--model=/.test(args[i])) out.push(args[i]);
  }
  return out;
}

const pub = (c) => ({ id: c.id, preset: c.preset, name: c.name, baseUrl: c.baseUrl, engine: c.engine, local: !!presetOf(c.preset)?.local, hasKey: !!(c.key || keyOf(c)), models: c.models || [] });

// ---- Subscriptions: sign in with a plan through the vendor CLI (fixed args only; command names are validated) ----
const AUTH = {
  claude: { pkg: '@anthropic-ai/claude-code', status: ['auth', 'status'], login: 'auth login', logout: ['auth', 'logout'] },
  codex: { pkg: '@openai/codex', status: ['login', 'status'], login: 'login', logout: ['logout'] },
};
const SAFE_CMD = /^[\w.\-\/: ]+$/;
const cliName = (ctx, k) => { const c = ctx.cmds?.()?.[k]; return typeof c === 'string' && SAFE_CMD.test(c) ? c : k; };
const runCli = (cmd, args) => new Promise((r) => {
  try { execFile(cmd + ' ' + args.join(' '), { shell: true, windowsHide: true, timeout: 8000 }, (e, o, se) => r({ ok: !e, out: String(o || '') + '\n' + String(se || '') })); } catch { r({ ok: false, out: '' }); }
});
async function authStatus(ctx) {
  const out = { antigravity: { installed: await has(cliName(ctx, 'antigravity')) } };
  await Promise.all(Object.keys(AUTH).map(async (k) => {
    const cmd = cliName(ctx, k), installed = await has(cmd);
    let loggedIn = false, method = '';
    if (installed) {
      const r = await runCli(cmd, AUTH[k].status);
      if (k === 'claude') {
        try { const j = JSON.parse(r.out.slice(r.out.indexOf('{'), r.out.lastIndexOf('}') + 1)); loggedIn = !!j.loggedIn; method = j.authMethod || ''; } catch {}
      } else {
        loggedIn = /logged in/i.test(r.out) && !/not logged in/i.test(r.out);
        method = (r.out.match(/using\s+(.+)/i) || [])[1]?.trim() || '';
      }
    }
    out[k] = { installed, loggedIn, method };
  }));
  return out;
}
// opens a visible terminal running a fixed command line
function openTerminal(line) {
  const { spawn } = require('child_process'), o = { detached: true, stdio: 'ignore' };
  let c;
  if (process.platform === 'win32') c = spawn('cmd.exe', ['/c', 'start "" cmd /k ' + line], { ...o, windowsVerbatimArguments: true });
  else if (process.platform === 'darwin') c = spawn('osascript', ['-e', `tell application "Terminal" to do script "${line}"`], o);
  else c = spawn('x-terminal-emulator', ['-e', 'sh', '-c', line + '; exec $SHELL'], o);
  c.on('error', () => {}); c.unref();
}
function registerAuth(ipc, ctx) {
  const ok = (p) => { if (!AUTH[p]) throw new Error('Unknown provider'); return p; };
  ipc.handle('auth:status', () => authStatus(ctx).catch(() => ({ claude: {}, codex: {}, antigravity: {} })));
  ipc.handle('auth:login', (_e, p) => { openTerminal(cliName(ctx, ok(p)) + ' ' + AUTH[p].login); return true; });
  ipc.handle('auth:install', (_e, p) => { openTerminal('npm i -g ' + AUTH[ok(p)].pkg); return true; });
  ipc.handle('auth:logout', async (_e, p) => { await runCli(cliName(ctx, ok(p)), AUTH[p].logout); return authStatus(ctx); });
}

// ctx: { get: () => settings, save: () => void, cmds: () => ({claude, codex, antigravity}) }
function register(ipc, ctx) {
  const conns = () => (ctx.get().connections ||= []);
  const find = (id) => conns().find((c) => c.id === id);
  registerAuth(ipc, ctx);
  ipc.handle('models:presets', () => PRESETS);
  ipc.handle('models:detect', () => detect(ctx.cmds?.()));
  ipc.handle('models:list', () => conns().map(pub));
  ipc.handle('models:connect', async (_e, f = {}) => {
    const p = presetOf(f.preset);
    if (!p) throw new Error('Unknown provider');
    const baseUrl = trim(f.baseUrl || p.baseUrl);
    if (!SAFE_URL.test(baseUrl)) throw new Error('Enter a valid http(s) base URL');
    let id = p.id, n = 2;
    while (find(id)) id = p.id + '-' + n++;
    const c = { id, preset: p.id, name: String(f.name || p.name).slice(0, 40), baseUrl, engine: p.engine, key: seal(String(f.key || '').trim()), models: [] };
    const typed = String(f.models || '').split(/[,\s]+/).filter((m) => SAFE_MODEL.test(m));
    try { c.models = await listModels(c); } catch (e) { if (!typed.length) throw new Error(`Could not list models: ${e.cause?.code || e.message}. Check the URL and key, or type a model name.`); }
    c.models = [...new Set([...typed, ...c.models])];
    if (!c.models.length) throw new Error('Connected, but the endpoint lists no models. Type a model name.');
    conns().push(c); ctx.save();
    return pub(c);
  });
  ipc.handle('models:refresh', async (_e, id) => {
    const c = find(id); if (!c) throw new Error('Unknown connection');
    c.models = await listModels(c); ctx.save();
    return pub(c);
  });
  ipc.handle('models:remove', (_e, id) => { ctx.get().connections = conns().filter((c) => c.id !== id); ctx.save(); return conns().map(pub); });
}

// `conn:<id>/<model>` -> { conn, model, ...spec } or null if unknown
function resolve(settings, ref) {
  if (!isConn(ref)) return null;
  const r = parseRef(ref), conn = r && (settings.connections || []).find((c) => c.id === r.id);
  return conn && SAFE_MODEL.test(r.model) ? { conn, model: r.model, ...spec(conn, r.model) } : null;
}

module.exports = { authStatus, PRESETS, register, resolve, dropModel, isConn, detect, listModels, spec, pub };
