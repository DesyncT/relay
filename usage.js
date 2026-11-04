// Scans local Claude Code + Codex + Antigravity session logs and estimates API cost.
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const HOME = os.homedir();
const PRICES = JSON.parse(fs.readFileSync(path.join(__dirname, 'prices.json'), 'utf8'));

function priceFor(model) {
  const m = String(model || '').replace(/^.*\//, ''); // "anthropic/claude-opus-5-5" -> "claude-opus-5-5"
  let best = null;
  for (const k of Object.keys(PRICES)) if (k[0] !== '_' && (m === k || /^-\d{8}$/.test(m.slice(k.length)) && m.startsWith(k)) && (!best || k.length > best.length)) best = k;
  return best ? PRICES[best] : null;
}

function* walk(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.jsonl')) yield p;
  }
}

async function eachLine(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    try { fn(JSON.parse(line)); } catch {}
  }
}

// One record per API call: { tool, session, model, day, input, cacheWrite, cacheWrite1h, cacheRead, output, fast }
async function claudeRecords() {
  const out = [];
  const byId = new Map(); // Deduplicate API messages across resumed/copied session files too.
  for (const file of walk(path.join(HOME, '.claude', 'projects'))) {
    const session = path.basename(file, '.jsonl');
    await eachLine(file, (o) => {
      const msg = o.message;
      const u = msg && msg.usage;
      if (!u || !msg.model || msg.model === '<synthetic>') return;
      const cc = u.cache_creation || {};
      const w1h = cc.ephemeral_1h_input_tokens || 0;
      const key = msg.id || o.uuid;
      if (!key) return;
      const previous = byId.get(key);
      if (previous && previous.output > (u.output_tokens || 0)) return;
      byId.set(key, {
        tool: 'Claude Code', session: file.includes(`${path.sep}subagents${path.sep}`) ? null : session,
        model: msg.model, day: (o.timestamp || '').slice(0, 10),
        input: u.input_tokens || 0, cacheWrite: (u.cache_creation_input_tokens || 0) - w1h, cacheWrite1h: w1h,
        cacheRead: u.cache_read_input_tokens || 0, output: u.output_tokens || 0, fast: u.speed === 'fast',
      });
    });
  }
  return [...byId.values()];
}

async function codexRecords() {
  const out = [];
  const seen = new Set();
  for (const file of walk(path.join(HOME, '.codex', 'sessions'))) {
    let session = path.basename(file, '.jsonl');
    let model = 'gpt-unknown', prev = null;
    await eachLine(file, (o) => {
      const p = o.payload || {};
      if (o.type === 'session_meta' && p.id) session = p.id;
      if (o.type === 'turn_context' && p.model) model = p.model;
      if (p.type !== 'token_count' || !p.info || !p.info.total_token_usage) return;
      const t = p.info.total_token_usage; // cumulative -> take deltas so repeated events don't double count
      const reset = prev && (t.input_tokens < prev.input_tokens || t.output_tokens < prev.output_tokens);
      const last = reset ? {} : (prev || {});
      const d = (k) => (t[k] || 0) - (last[k] || 0);
      prev = t;
      const input = d('input_tokens'), cached = d('cached_input_tokens'), output = d('output_tokens');
      const key = session + ':' + JSON.stringify(t);
      if (seen.has(key) || (input <= 0 && output <= 0)) return;
      seen.add(key);
      out.push({
        tool: 'Codex', session, model, day: (o.timestamp || '').slice(0, 10),
        input: Math.max(0, input - cached), cacheWrite: Math.max(0, d('cache_write_input_tokens')), cacheWrite1h: 0,
        cacheRead: Math.max(0, cached), output: Math.max(0, output), fast: false,
      });
    });
  }
  return out;
}

async function antigravityRecords() {
  const out = [];
  const brainDir = path.join(HOME, '.gemini', 'antigravity', 'brain');
  let ents;
  try { ents = fs.readdirSync(brainDir, { withFileTypes: true }); } catch { return []; }
  for (const ent of ents) {
    if (!ent.isDirectory()) continue;
    const session = ent.name;
    const transcriptFile = path.join(brainDir, session, '.system_generated', 'logs', 'transcript.jsonl');
    if (!fs.existsSync(transcriptFile)) continue;
    let model = 'gemini-3.8-flash';
    await eachLine(transcriptFile, (o) => {
      if (o.type !== 'PLANNER_RESPONSE') return;
      if (o.model) model = o.model;
      const inp = o.input_tokens || 0;
      const cached = o.cache_read_tokens || 0;
      const outTok = o.output_tokens || 0;
      if (inp <= 0 && cached <= 0 && outTok <= 0) return;
      out.push({
        tool: 'Antigravity', session, model, day: (o.created_at || '').slice(0, 10),
        input: Math.max(0, inp), cacheWrite: 0, cacheWrite1h: 0,
        cacheRead: Math.max(0, cached), output: Math.max(0, outTok), fast: false,
      });
    });
  }
  return out;
}

function cost(r) {
  let p = priceFor(r.model);
  if (String(r.model).startsWith('claude-haiku-5-5') && r.input + r.cacheRead + r.cacheWrite + r.cacheWrite1h > 100000) p = [0.5, 2.5, 0.625, 0.05];
  if (!p) return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, full: 0 };
  const mult = r.fast ? 2 : 1; // ponytail: fast mode = flat 2x, true for current Opus; per-model table if that changes
  const c = {
    input: r.input * p[0] * mult / 1e6,
    output: r.output * p[1] * mult / 1e6,
    cacheWrite: (r.cacheWrite * p[2] + r.cacheWrite1h * p[0] * 2) * mult / 1e6,
    cacheRead: r.cacheRead * p[3] * mult / 1e6,
  };
  c.full = (r.cacheRead + r.cacheWrite + r.cacheWrite1h) * p[0] * mult / 1e6; // what cached input would cost uncached
  return c;
}

async function scan() {
  const recs = [...await claudeRecords(), ...await codexRecords(), ...await antigravityRecords()];
  const tools = {}, models = {}, days = {}, dayTok = {};
  const type = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  const speed = { standard: 0, fast: 0 };
  const tot = { cost: 0, tokens: 0, cached: 0, uncached: 0, output: 0, savings: 0, unpriced: new Set() };
  for (const r of recs) {
    const c = cost(r);
    const usd = c.input + c.output + c.cacheWrite + c.cacheRead;
    const tok = r.input + r.output + r.cacheWrite + r.cacheWrite1h + r.cacheRead;
    if (!priceFor(r.model)) tot.unpriced.add(r.model);
    const t = tools[r.tool] ||= { cost: 0, tokens: 0, sessions: new Set() };
    t.cost += usd; t.tokens += tok; if (r.session) t.sessions.add(r.session);
    const m = models[r.model] ||= { tool: r.tool, cost: 0, tokens: 0, rates: priceFor(r.model), breakdown: { input: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0, output: 0 }, costs: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } };
    for (const k of Object.keys(m.breakdown)) m.breakdown[k] += r[k] || 0;
    for (const k of Object.keys(m.costs)) m.costs[k] += c[k];
    m.cost += usd; m.tokens += tok;
    if (r.day) (days[r.day] ||= {})[r.tool] = (days[r.day][r.tool] || 0) + usd;
    if (r.day) dayTok[r.day] = (dayTok[r.day] || 0) + tok;
    for (const k of Object.keys(type)) type[k] += c[k];
    speed[r.fast ? 'fast' : 'standard'] += usd;
    tot.cost += usd; tot.tokens += tok; tot.cached += r.cacheRead; tot.uncached += r.input;
    tot.output += r.output; tot.savings += c.full - c.cacheRead - c.cacheWrite;
  }
  return {
    total: { ...tot, costIsEstimate: true, scope: 'All local CLI sessions, including work outside this app', unpriced: [...tot.unpriced], sessions: Object.values(tools).reduce((n, t) => n + t.sessions.size, 0) },
    tools: Object.fromEntries(Object.entries(tools).map(([k, v]) => [k, { ...v, sessions: v.sessions.size }])),
    models, days, dayTokens: dayTok, type, speed,
  };
}

module.exports = { scan, priceFor, cost };

if (require.main === module) {
  console.assert(priceFor('anthropic/claude-opus-5-5')[0] === 4, 'prefix strip');
  console.assert(priceFor('claude-opus-5-5-20260101')[0] === 4, 'longest prefix');
  console.assert(priceFor('claude-opus-5')[0] === 5, 'opus 5');
  console.assert(priceFor('mystery') === null, 'unknown');
  scan().then((s) => console.log(JSON.stringify({ total: s.total, tools: s.tools, type: s.type }, null, 1)));
}
