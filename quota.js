// Read provider-reported snapshots only; token spend is not a subscription quota.
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
async function files(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    if (!e.name.endsWith('.jsonl')) return [];
    return [{ path: p, time: (await fs.stat(p)).mtimeMs }];
  }));
  return nested.flat();
}
function snapshot(event, now = Date.now()) {
  const q = event.payload?.rate_limits, at = Date.parse(event.timestamp);
  if (!q || !Number.isFinite(at) || at > now + 60000) return null;
  if (q.limit_id && q.limit_id !== 'codex') return null;
  const windows = ['primary', 'secondary'].flatMap(key => {
    const w = q[key];
    if (!w || !Number.isFinite(w.used_percent) || !Number.isFinite(w.resets_at)) return [];
    // Window reset with no newer log = nothing used since; keep it visible, next reset unknown.
    if (w.resets_at * 1000 <= now) return [{ used: 0, remaining: 100, minutes: w.window_minutes, reset: null }];
    return [{ used: w.used_percent, remaining: 100 - w.used_percent, minutes: w.window_minutes, reset: w.resets_at * 1000 }];
  });
  return windows.length ? { at, windows } : null;
}
// ponytail: estimate rolling 5h quota from Antigravity session transcripts
async function checkAntigravity(now = Date.now()) {
  try {
    const acctPath = path.join(os.homedir(), '.gemini', 'google_accounts.json');
    const raw = await fs.readFile(acctPath, 'utf8').catch(() => '');
    let account = null;
    if (raw) {
      try { account = JSON.parse(raw).active || null; } catch {}
    }
    const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
    const brainExists = await fs.access(brainDir).then(() => true).catch(() => false);
    if (!account && !brainExists) return null;

    const WINDOW_MS = 5 * 60 * 60 * 1000;
    const cutoff = now - WINDOW_MS;
    const AG_5H_BUDGET = 1000000; // 1M tokens per 5h window
    let totalTokens = 0, oldest = Infinity;
    try {
      const ents = await fs.readdir(brainDir, { withFileTypes: true }).catch(() => []);
      for (const ent of ents) {
        if (!ent.isDirectory()) continue;
        const transcriptFile = path.join(brainDir, ent.name, '.system_generated', 'logs', 'transcript.jsonl');
        let handle;
        try {
          const st = await fs.stat(transcriptFile).catch(() => null);
          if (!st || st.mtimeMs < cutoff) continue;
          handle = await fs.open(transcriptFile, 'r');
          const size = st.size, start = Math.max(0, size - 512 * 1024);
          const buf = Buffer.alloc(size - start);
          const { bytesRead } = await handle.read(buf, 0, buf.length, start);
          for (const line of buf.toString('utf8', 0, bytesRead).split('\n')) {
            if (!line.includes('PLANNER_RESPONSE')) continue;
            try {
              const o = JSON.parse(line);
              if (o.type !== 'PLANNER_RESPONSE') continue;
              const t = Date.parse(o.created_at);
              if (!Number.isFinite(t) || t < cutoff) continue;
              const tok = (o.input_tokens || 0) + (o.output_tokens || 0) + (o.cache_read_tokens || 0);
              totalTokens += tok;
              if (t < oldest) oldest = t;
            } catch {}
          }
        } catch {} finally { await handle?.close(); }
      }
    } catch {}

    const used = Math.round((totalTokens / AG_5H_BUDGET) * 100);
    const reset = oldest < Infinity ? oldest + WINDOW_MS : now + WINDOW_MS;
    return {
      at: now,
      account: account || 'local',
      windows: [{
        used,
        remaining: Math.max(0, 100 - used),
        minutes: 300,
        reset,
        tokens: totalTokens,
        budget: AG_5H_BUDGET
      }]
    };
  } catch {}
  return null;
}

// Same endpoint Claude Code's /usage reads, with the local OAuth token. Returns real provider percentages.
let officialCache = null, officialUntil = 0;
async function checkClaudeOfficial(now = Date.now()) {
  if (officialCache && now < officialUntil) return officialCache;
  try {
    const creds = JSON.parse(await fs.readFile(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf8'));
    const token = (creds.claudeAiOauth || creds).accessToken;
    if (!token) return null;
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { Authorization: 'Bearer ' + token, 'anthropic-beta': 'oauth-2025-04-20' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const windows = [['five_hour', 300], ['seven_day', 10080]].flatMap(([key, minutes]) => {
      const w = j[key];
      if (!w || !Number.isFinite(w.utilization)) return [];
      const reset = Date.parse(w.resets_at);
      return [{ used: w.utilization, remaining: Math.max(0, 100 - w.utilization), minutes, reset: Number.isFinite(reset) ? reset : now }];
    });
    if (!windows.length) return null;
    officialCache = { at: now, account: 'claude', windows };
    officialUntil = now + 60000;
    return officialCache;
  } catch {}
  return null;
}

// ponytail: estimate rolling 5h quota from Claude session transcripts (fallback when the endpoint is unreachable)
async function checkClaudeQuota(now = Date.now()) {
  const WINDOW_MS = 5 * 60 * 60 * 1000;
  const cutoff = now - WINDOW_MS;
  const DEFAULT_5H_BUDGET = 250000; // estimated Claude 5h token budget
  try {
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');
    const allFiles = await files(claudeDir);
    const recent = allFiles.filter(f => f.time >= cutoff).sort((a, b) => b.time - a.time).slice(0, 20);
    let totalTokens = 0, oldest = Infinity;
    const seen = new Set();
    for (const file of recent) {
      let handle;
      try {
        handle = await fs.open(file.path, 'r');
        const size = (await handle.stat()).size, start = Math.max(0, size - 512 * 1024);
        const buf = Buffer.alloc(size - start);
        const { bytesRead } = await handle.read(buf, 0, buf.length, start);
        for (const line of buf.toString('utf8', 0, bytesRead).split('\n')) {
          if (!line.includes('"usage"')) continue;
          try {
            const o = JSON.parse(line);
            const t = Date.parse(o.timestamp);
            if (!Number.isFinite(t) || t < cutoff) continue;
            const msg = o.message;
            const u = msg?.usage;
            if (!u || !msg.model || msg.model === '<synthetic>') continue;
            const key = msg.id || o.uuid;
            if (key) {
              if (seen.has(key)) continue;
              seen.add(key);
            }
            const tok = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
            totalTokens += tok;
            if (t < oldest) oldest = t;
          } catch {}
        }
      } catch {} finally { await handle?.close(); }
    }
    const used = Math.round((totalTokens / DEFAULT_5H_BUDGET) * 100);
    const reset = oldest < Infinity ? oldest + WINDOW_MS : now + WINDOW_MS;
    return {
      at: now,
      account: 'local',
      windows: [{
        used,
        remaining: Math.max(0, 100 - used),
        minutes: 300,
        reset,
        tokens: totalTokens,
        budget: DEFAULT_5H_BUDGET
      }]
    };
  } catch {}
  return null;
}
let pending, cached, until = 0;
async function readQuota() {
  if (cached && Date.now() < until) return cached;
  if (pending) return pending;
  pending = (async () => {
    let codex = null;
    const logs = (await files(path.join(os.homedir(), '.codex', 'sessions'))).sort((a, b) => b.time - a.time).slice(0, 12);
    for (const file of logs) {
      let handle;
      try {
        handle = await fs.open(file.path, 'r');
        const size = (await handle.stat()).size, start = Math.max(0, size - 512 * 1024);
        const buf = Buffer.alloc(size - start);
        const { bytesRead } = await handle.read(buf, 0, buf.length, start);
        for (const line of buf.toString('utf8', 0, bytesRead).split('\n')) {
          if (!line.includes('"rate_limits"')) continue;
          try {
            const s = snapshot(JSON.parse(line));
            if (s && (!codex || s.at > codex.at)) codex = s;
          } catch {}
        }
      } catch {} finally { await handle?.close(); }
    }
    const [claude, antigravity] = await Promise.all([
      checkClaudeOfficial().then(s => s || checkClaudeQuota()),
      checkAntigravity(),
    ]);
    cached = { codex, claude, antigravity }; until = Date.now() + 10000;
    return cached;
  })();
  try { return await pending; } finally { pending = null; }
}
module.exports = { readQuota, snapshot };
