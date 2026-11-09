// Scans local Claude Code + Codex + Antigravity session logs and estimates API cost.
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const {normalizeClaudeStats,recoverClaude,total:recordTokens}=require('./usage-recovery');

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

async function eachLine(file, fn, coverage) {
  coverage.files++;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  try { for await (const line of rl) {
    if (!line.trim()) continue;
    let value; try {value=JSON.parse(line);} catch {coverage.malformedLines++;continue;}
    fn(value);
  }} catch {coverage.unreadableFiles.push(file);}
}
const roots = (home, name, env, key) => [...new Set([path.join(home,name),env[key]].filter(Boolean).map(p=>path.resolve(p)))];
const dayOf = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(0,10) : '';
const tokens = value => Number.isFinite(value) && value>0 ? value : 0;

// One record per API call: { tool, session, model, day, input, cacheWrite, cacheWrite1h, cacheRead, output, fast }
async function claudeRecords(home, env, coverage) {
  const byId = new Map(); // Deduplicate API messages across resumed/copied session files too.
  for (const base of roots(home,'.claude',env,'CLAUDE_CONFIG_DIR')) for (const file of walk(path.join(base,'projects'))) {
    const session = path.basename(file, '.jsonl');
    await eachLine(file, (o) => {
      const msg = o.message;
      const u = msg && msg.usage;
      if (!u || msg.model === '<synthetic>') return;
      const cc = u.cache_creation || {};
      const w1h = cc.ephemeral_1h_input_tokens || 0;
      const key = msg.id || o.uuid || session+':'+o.timestamp+':'+JSON.stringify(u);
      const previous = byId.get(key);
      const record = {
        id:'claude:'+key,
        tool: 'Claude Code', session: file.includes(`${path.sep}subagents${path.sep}`) ? null : session,
        model: typeof msg.model==='string'?msg.model:'claude-unknown', day: dayOf(o.timestamp),
        input: tokens(u.input_tokens), cacheWrite: Math.max(0,tokens(u.cache_creation_input_tokens)-w1h), cacheWrite1h:tokens(w1h),
        cacheRead: tokens(u.cache_read_input_tokens), output:tokens(u.output_tokens), fast: u.speed === 'fast',
      };
      if (previous) for (const field of ['input','cacheWrite','cacheWrite1h','cacheRead','output']) record[field]=Math.max(previous[field],record[field]);
      byId.set(key,record);
    },coverage);
  }
  return [...byId.values()];
}

async function codexRecords(home, env, coverage) {
  const events = new Map();
  for (const base of roots(home,'.codex',env,'CODEX_HOME')) for (const dir of ['sessions','archived_sessions']) for (const file of walk(path.join(base,dir))) {
    let session = path.basename(file, '.jsonl');
    let model = 'gpt-unknown',owner=null,inheritedSession=session,started=0;
    await eachLine(file, (o) => {
      const p = o.payload || {};
      if (o.type === 'session_meta' && p.id) {
        if(!owner){owner=session=p.id;started=Date.parse(p.timestamp || o.timestamp) || 0;}
        inheritedSession=p.id;
      }
      if (o.type === 'turn_context' && p.model) model = p.model;
      if (p.type !== 'token_count' || !p.info || !p.info.total_token_usage) return;
      const t = p.info.total_token_usage;
      const cumulative=Object.fromEntries(['input_tokens','cached_input_tokens','output_tokens','cache_write_input_tokens'].map(k=>[k,tokens(t[k])]));
      const stamp=Number.isFinite(Date.parse(o.timestamp))?o.timestamp:'';
      // Forked subagent logs embed their parent's metadata and history. New
      // counters belong to the file's first session, not the last embedded one.
      const actualSession=started && Date.parse(stamp)<started ? inheritedSession : session;
      const id='codex:'+actualSession+':'+stamp+':'+JSON.stringify(cumulative);
      events.set(id,{id,tool:'Codex',session:actualSession,model,day:dayOf(stamp),stamp,cumulative});
    },coverage);
  }
  return [...events.values()];
}
function codexDeltas(records) {
  const previous=new Map();
  return records.sort((a,b)=>(Date.parse(a.stamp)||0)-(Date.parse(b.stamp)||0)).map(r=>{
    const t=r.cumulative,prev=previous.get(r.session);
    const last=prev && (t.input_tokens<prev.input_tokens || t.output_tokens<prev.output_tokens) ? {} : prev || {};
    const d=k=>Math.max(0,tokens(t[k])-tokens(last[k]));previous.set(r.session,t);
    return {...r,input:Math.max(0,d('input_tokens')-d('cached_input_tokens')),cacheRead:d('cached_input_tokens'),cacheWrite:d('cache_write_input_tokens'),cacheWrite1h:0,output:d('output_tokens'),fast:false};
  });
}

async function antigravityRecords(home, coverage) {
  const out = [];
  const brainDir = path.join(home, '.gemini', 'antigravity', 'brain');
  let ents;
  try { ents = fs.readdirSync(brainDir, { withFileTypes: true }); } catch { return []; }
  for (const ent of ents) {
    if (!ent.isDirectory()) continue;
    const session = ent.name;
    const transcriptFile = path.join(brainDir, session, '.system_generated', 'logs', 'transcript.jsonl');
    if (!fs.existsSync(transcriptFile)) continue;
    let model = 'gemini-unknown';
    await eachLine(transcriptFile, (o) => {
      if (o.type !== 'PLANNER_RESPONSE') return;
      if (typeof o.model==='string') model = o.model;
      const inp = o.input_tokens || 0;
      const cached = o.cache_read_tokens || 0;
      const outTok = o.output_tokens || 0;
      if (inp <= 0 && cached <= 0 && outTok <= 0) return;
      out.push({
        id:'antigravity:'+session+':'+(o.id || o.uuid || o.created_at+':'+JSON.stringify([inp,cached,outTok])),
        tool: 'Antigravity', session, model, day: dayOf(o.created_at),
        input: Math.max(0, inp), cacheWrite: 0, cacheWrite1h: 0,
        cacheRead: Math.max(0, cached), output: Math.max(0, outTok), fast: false,
      });
    },coverage);
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

async function scan({home=HOME,env=process.env,ledgerFile,accountUsage=false,codexCommand='codex',accountCacheFile} = {}) {
  const coverage={files:0,malformedLines:0,unreadableFiles:[]};
  const retained=new Map();
  let claudeStats=[];
  const accountPromise=accountUsage?require('./account-usage').readAccountUsage({command:codexCommand,cacheFile:accountCacheFile}):Promise.resolve(null);
  if (ledgerFile) try {
    const saved=JSON.parse(await fs.promises.readFile(ledgerFile,'utf8'));
    if (saved.version!==1 || !Array.isArray(saved.records)) throw Error('Invalid usage history');
    if(Array.isArray(saved.claudeStats))claudeStats=saved.claudeStats.filter(s=>s && typeof s.asOf==='string' && s.modelTotals && Array.isArray(s.daily));
    for (const r of saved.records) {
      if(!r || typeof r.id!=='string' || typeof r.model!=='string' || !['Claude Code','Codex','Antigravity'].includes(r.tool) || typeof r.day!=='string')throw Error('Invalid usage record');
      const fields=r.tool==='Codex'?['input_tokens','cached_input_tokens','output_tokens','cache_write_input_tokens']:['input','cacheRead','cacheWrite','cacheWrite1h','output'];
      const values=r.tool==='Codex'?r.cumulative:r;
      if(!values || fields.some(k=>!Number.isFinite(values[k]) || values[k]<0))throw Error('Invalid token record');
      retained.set(r.id,r);
    }
  } catch(error) {if(error.code!=='ENOENT') throw Error('Could not read saved usage history; it was left unchanged.');}
  const imported=[...await claudeRecords(home,env,coverage),...await codexRecords(home,env,coverage),...await antigravityRecords(home,coverage)];
  for(const base of roots(home,'.claude',env,'CLAUDE_CONFIG_DIR'))try{
    const snapshot=normalizeClaudeStats(JSON.parse(await fs.promises.readFile(path.join(base,'stats-cache.json'),'utf8')));
    if(snapshot && !claudeStats.some(s=>JSON.stringify(s)===JSON.stringify(snapshot)))claudeStats.push(snapshot);
  }catch{}
  for (const r of imported) {
    const previous=retained.get(r.id);
    if(previous && r.tool==='Claude Code') for(const field of ['input','cacheRead','cacheWrite','cacheWrite1h','output'])r[field]=Math.max(previous[field] || 0,r[field]);
    retained.set(r.id,r);
  }
  if(ledgerFile){await fs.promises.mkdir(path.dirname(ledgerFile),{recursive:true});await fs.promises.writeFile(ledgerFile+'.tmp',JSON.stringify({version:1,records:[...retained.values()],claudeStats}),'utf8');await fs.promises.rename(ledgerFile+'.tmp',ledgerFile);}
  const recs=[...[...retained.values()].filter(r=>r.tool!=='Codex'),...codexDeltas([...retained.values()].filter(r=>r.tool==='Codex'))];
  recs.push(...recoverClaude(recs,claudeStats));
  const tools = {}, models = {}, days = {}, dayTok = {};
  const type = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  const speed = { standard: 0, fast: 0 };
  const tot = { cost: 0, tokens: 0, cached: 0, uncached: 0, output: 0, savings: 0, recoveredTokens:0,undatedTokens:0,unpriced: new Set() };
  for (const r of recs) {
    const c = r.costUnknown?{input:0,output:0,cacheWrite:0,cacheRead:0,full:0}:cost(r);
    const usd = c.input + c.output + c.cacheWrite + c.cacheRead;
    const tok = recordTokens(r);
    if(r.recovered)tot.recoveredTokens+=tok;
    if(!r.day)tot.undatedTokens+=tok;
    if (!priceFor(r.model)) tot.unpriced.add(r.model);
    const t = tools[r.tool] ||= { cost: 0, tokens: 0, sessions: new Set() };
    t.cost += usd; t.tokens += tok; if (r.session) t.sessions.add(r.session);
    const m = models[r.model] ||= { tool: r.tool, cost: 0, tokens: 0, rates: priceFor(r.model), breakdown: { input: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0, output: 0,unclassified:0 }, costs: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } };
    for (const k of Object.keys(m.breakdown)) m.breakdown[k] += r[k] || 0;
    m.breakdown.unclassified+=r.unclassifiedTokens || 0;
    for (const k of Object.keys(m.costs)) m.costs[k] += c[k];
    m.cost += usd; m.tokens += tok;
    if (r.day) (days[r.day] ||= {})[r.tool] = (days[r.day][r.tool] || 0) + usd;
    if (r.day) dayTok[r.day] = (dayTok[r.day] || 0) + tok;
    for (const k of Object.keys(type)) type[k] += c[k];
    speed[r.fast ? 'fast' : 'standard'] += usd;
    tot.cost += usd; tot.tokens += tok; tot.cached += r.cacheRead; tot.uncached += r.input;
    tot.output += r.output; tot.savings += c.full - c.cacheRead - c.cacheWrite;
  }
  const account=await accountPromise;
  const localTokens=tot.tokens,localDayTokens={...dayTok};
  let accountTokenAdjustment=0,accountCostEstimate=0;
  if(account){
    const codex=tools.Codex ||= {cost:0,tokens:0,sessions:new Set()};
    codex.localTokens=codex.tokens;accountTokenAdjustment=account.summary.lifetimeTokens-codex.tokens;
    codex.tokens=account.summary.lifetimeTokens;codex.tokenSource='codex-account';tot.tokens+=accountTokenAdjustment;
    // The account reports only a token count, so price the tokens no local transcript covers at the average local Codex rate (an estimate, kept out of the breakdowns).
    if(accountTokenAdjustment>0 && codex.localTokens>0 && codex.cost>0)accountCostEstimate=codex.cost/codex.localTokens*accountTokenAdjustment;
    if(account.dailyUsageBuckets)for(const b of account.dailyUsageBuckets){
      const localCodex=recs.filter(r=>r.tool==='Codex' && r.day===b.startDate).reduce((n,r)=>n+recordTokens(r),0);
      dayTok[b.startDate]=(dayTok[b.startDate] || 0)-localCodex+b.tokens;
    }
  }
  return {
    total: { ...tot,localTokens,accountTokenAdjustment,accountCostEstimate,lifetimeCostEstimate:tot.cost+accountCostEstimate,costIsEstimate: true, scope: 'Codex account lifetime when available; Claude retained history plus recovered statistics; API costs from local transcripts only', unpriced: [...tot.unpriced], sessions: Object.values(tools).reduce((n, t) => n + t.sessions.size, 0),firstDay:Object.keys(dayTok).sort()[0] || null,lastDay:Object.keys(dayTok).sort().at(-1) || null },
    accountUsage:account?{codex:account}:{},localDayTokens,
    coverage,
    tools: Object.fromEntries(Object.entries(tools).map(([k, v]) => [k, { ...v, sessions: v.sessions.size, accountCostEstimate: k === 'Codex' ? accountCostEstimate : 0, lifetimeCostEstimate: v.cost + (k === 'Codex' ? accountCostEstimate : 0) }])),
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
