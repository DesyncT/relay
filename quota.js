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
    const stat=await fs.stat(p).catch(()=>null);
    return stat ? [{ path: p, time:stat.mtimeMs }] : [];
  }));
  return nested.flat();
}
function snapshot(event, now = Date.now()) {
  const q = event?.payload?.rate_limits, at = Date.parse(event?.timestamp);
  if (!q || !Number.isFinite(at) || at > now + 60000) return null;
  if (q.limit_id && q.limit_id !== 'codex') return null;
  const windows = ['primary', 'secondary'].flatMap(key => {
    const w = q[key];
    if (!w || !Number.isFinite(w.used_percent) || !Number.isFinite(w.resets_at)) return [];
    if (w.used_percent < 0 || w.used_percent > 100) return [];
    return [{ used: w.used_percent, remaining: 100 - w.used_percent, minutes: w.window_minutes, reset: w.resets_at * 1000, at }];
  });
  return windows.length ? { at, windows } : null;
}
// Local token activity only; it cannot establish a subscription allowance.
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

    return {
      at: now,
      estimated:true,
      account: account || 'local',
      windows: [{
        minutes: 300,
        tokens: totalTokens,
      }]
    };
  } catch {}
  return null;
}

// Same endpoint Claude Code's /usage reads, with the local OAuth token. Returns real provider percentages.
// It rate-limits hard (429), so ask at most every 2 minutes, back off after a failure, and keep showing the last real answer meanwhile.
let officialCache = null, officialUntil = 0, officialFailed = false;
const lastOfficial = () => officialCache && { ...officialCache, stale: officialFailed || Date.now() - officialCache.at > 5 * 60000 };
async function checkClaudeOfficial(now = Date.now()) {
  if (now < officialUntil) return lastOfficial();
  officialUntil = now + 5 * 60000; // failure backoff; success shortens it below
  officialFailed = true;
  try {
    const creds = JSON.parse(await fs.readFile(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf8'));
    const token = (creds.claudeAiOauth || creds).accessToken;
    if (!token) return null;
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { Authorization: 'Bearer ' + token, 'anthropic-beta': 'oauth-2025-04-20' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { const ra = Number(res.headers.get('retry-after')); if (ra > 0) officialUntil = now + Math.min(ra, 3600) * 1000; return lastOfficial(); }
    const j = await res.json();
    const windows = [['five_hour', 300], ['seven_day', 10080]].flatMap(([key, minutes]) => {
      const w = j[key];
      if (!w || !Number.isFinite(w.utilization) || w.utilization < 0 || w.utilization > 100) return [];
      const reset = Date.parse(w.resets_at);
      return [{ used: w.utilization, remaining: 100 - w.utilization, minutes, reset: Number.isFinite(reset) ? reset : null, at:now }];
    });
    if (!windows.length) return lastOfficial();
    officialCache = { at: now, account: 'claude', windows };
    officialFailed = false;
    officialUntil = now + 2 * 60000;
    return officialCache;
  } catch {}
  return lastOfficial();
}

// Local token activity when the provider endpoint is unavailable, never a quota estimate.
async function checkClaudeQuota(now = Date.now()) {
  const WINDOW_MS = 5 * 60 * 60 * 1000;
  const cutoff = now - WINDOW_MS;
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
    return {
      at: now,
      estimated:true,
      account: 'local',
      windows: [{
        minutes: 300,
        tokens: totalTokens,
      }]
    };
  } catch {}
  return null;
}
let pending, cached, until = 0;
const live = {};
let cacheFile = null, cacheLoaded = null, cacheWrite = Promise.resolve();
function setCacheFile(file) { cacheFile=file; cacheLoaded=null; }
async function loadCache() {
  if (!cacheFile) return;
  if (!cacheLoaded) cacheLoaded=(async()=>{
    try {
      const saved=JSON.parse(await fs.readFile(cacheFile,'utf8'));
      for (const provider of ['claude','codex','antigravity']) {
        const s=saved[provider];
        if (!Number.isFinite(s?.at) || s.at>Date.now()+60000 || !Array.isArray(s.windows)) continue;
        const windows=s.windows.filter(w=>Number.isFinite(w.used) && w.used>=0 && w.used<=100 && Number.isFinite(w.minutes) && Number.isFinite(w.at) && w.at<=Date.now()+60000)
          .map(w=>({used:w.used,remaining:100-w.used,minutes:w.minutes,reset:Number.isFinite(w.reset)?w.reset:null,at:w.at}));
        if (windows.length && (!live[provider] || live[provider].at<s.at)) live[provider]={at:s.at,windows,cached:true};
      }
    } catch {}
  })();
  await cacheLoaded;
}
function saveCache() {
  if (!cacheFile) return Promise.resolve();
  const data=JSON.stringify(Object.fromEntries(Object.entries(live).map(([p,s])=>[p,{at:s.at,windows:s.windows.map(w=>({used:w.used,minutes:w.minutes,reset:w.reset,at:w.at ?? s.at}))}])));
  cacheWrite=cacheWrite.then(async()=>{
    await fs.mkdir(path.dirname(cacheFile),{recursive:true});
    await fs.writeFile(cacheFile+'.tmp',data,'utf8');
    await fs.rename(cacheFile+'.tmp',cacheFile);
  }).catch(()=>{});
  return cacheWrite;
}
function current(s, now = Date.now()) {
  if (!s) return null;
  return {...s,windows:s.windows.map(w=>({...w,stale:!!s.stale || now-(w.at ?? s.at)>300000 || !!(w.reset && w.reset<=now)}))};
}
function recordEvent(provider, line, now = Date.now()) {
  let event; try {event=typeof line==='string'?JSON.parse(line):line;} catch {return false;}
  let s = null;
  if (provider === 'codex') s = snapshot({...event,timestamp:event?.timestamp || new Date(now).toISOString()},now);
  if (provider === 'claude' && event?.type === 'rate_limit_event') {
    const info=event.rate_limit_info || {};
    const buckets=info.unifiedWindows || {[info.rateLimitType]:info};
    const windows=Object.entries(buckets).flatMap(([key,w])=>{
      const minutes=key==='five_hour'?300:key==='seven_day'?10080:null;
      if (!minutes || !Number.isFinite(w.utilization) || w.utilization<0 || w.utilization>1) return [];
      const used=w.utilization*100, reset=Number.isFinite(w.resetsAt)?w.resetsAt*1000:null;
      return [{minutes,used,remaining:100-used,reset,at:now}];
    });
    if (windows.length) s={at:now,windows};
  }
  if (!s) return false;
  const previous=live[provider]?.windows || [];
  live[provider]={...s,windows:[...previous.filter(w=>!s.windows.some(n=>n.minutes===w.minutes)),...s.windows]};
  until=0;
  saveCache();
  return true;
}
function latest(provider, fallback) {
  const streamed=live[provider];
  if (streamed && fallback?.stale && fallback.at === streamed.at) return current({...streamed,cached:true,stale:true});
  if (fallback && !fallback.estimated && (!streamed || fallback.at>streamed.at)) live[provider]={...fallback,windows:fallback.windows.map(w=>({...w,at:w.at ?? fallback.at}))};
  return current(live[provider] || fallback);
}
async function readQuota({fresh=false} = {}) {
  await loadCache();
  if (!fresh && cached && Date.now() < until) return Object.fromEntries(Object.entries(cached).map(([p,s])=>[p,current(s)]));
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
    cached = { codex:latest('codex',codex), claude:latest('claude',claude), antigravity:current(antigravity) }; until = Date.now() + 10000;
    await saveCache();
    return cached;
  })();
  try { return await pending; } finally { pending = null; }
}
module.exports = { readQuota, snapshot, recordEvent, current, setCacheFile, loadCache, saveCache };
