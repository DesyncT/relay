// Per-phase model + effort routing. Pure (no Electron) so it can be tested with node.
const PHASES = ['planning', 'coding', 'other'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const DEFAULT_ROUTES = {
  claude: {
    planning: { model: 'claude-haiku-5-5', effort: 'low' },
    coding: { model: 'claude-haiku-5-5', effort: 'low' },
    other: { model: 'claude-haiku-5-5', effort: 'low' },
  },
  codex: {
    planning: { model: 'gpt-6-luna', effort: 'low' },
    coding: { model: 'gpt-6-luna', effort: 'low' },
    other: { model: 'gpt-6-luna', effort: 'low' },
  },
  antigravity: {
    planning: { model: 'gemini-3.5-flash-lite', effort: 'low' },
    coding: { model: 'gemini-3.8-flash-low', effort: 'low' },
    other: { model: 'gemini-3.5-flash-lite', effort: 'low' },
  },
};

// Fill gaps in saved routes with defaults; drop junk. Always returns a fresh, complete object.
function mergeRoutes(saved) {
  const out = {};
  const cx = saved && saved.codex; // earlier defaults had sol/astra swapped; fix saves still on that pair
  if (cx && cx.coding && cx.other && cx.coding.model === 'gpt-6.1-sol' && cx.other.model === 'gpt-6-astra') {
    saved = { ...saved, codex: { ...cx, coding: { ...cx.coding, model: 'gpt-6-astra' }, other: { ...cx.other, model: 'gpt-6.1-sol' } } };
  }
  // Migrate the old conversational default without replacing custom routes.
  if (saved?.codex?.other?.model === 'gpt-6.1-sol') {
    saved = { ...saved, codex: { ...saved.codex, other: { model: 'gpt-6-luna', effort: 'low' } } };
  }
  // Migrate old Antigravity model names to valid proxy models.
  if (saved?.antigravity) {
    const ag = saved.antigravity;
    let newAg = null;
    if (ag.planning?.model === 'gemini-3.8-flash') newAg = { ...ag, planning: { ...ag.planning, model: 'gemini-3.8-flash-low' } };
    if ((newAg || ag).coding?.model === 'gemini-3.8-pro' || (newAg || ag).coding?.model === 'gemini-3.8-flash') newAg = { ...(newAg || ag), coding: { ...(newAg || ag).coding, model: 'gemini-3.8-flash-high' } };
    if ((newAg || ag).other?.model === 'gemini-3.8-flash') newAg = { ...(newAg || ag), other: { ...(newAg || ag).other, model: 'gemini-3.8-flash-medium' } };
    if (newAg) saved = { ...saved, antigravity: newAg };
  }
  for (const a of Object.keys(DEFAULT_ROUTES)) {
    out[a] = {};
    for (const p of PHASES) {
      const d = DEFAULT_ROUTES[a][p], s = (saved && saved[a] && saved[a][p]) || {};
      out[a][p] = {
        model: typeof s.model === 'string' && s.model.trim() ? s.model.trim() : d.model,
        effort: EFFORTS.includes(s.effort) ? s.effort : d.effort,
      };
    }
  }
  return out;
}

// Building grants permission; it does not make every later conversation coding.
const WORK = /\b(fix|implement|build|code|edit|change|update|add|remove|rename|migrate|refactor|debug|test|wire|patch)\b/i;
// Explicitly asking the teammate to plan is a directed handoff too.
const PLAN_WITH_BUDDY = /\b(?:plan|brainstorm|think|work)\s+with\s+(?:yo\s+)?(?:buddy|mate|other|team(?:mate)?)\b/i;
const QUESTION = /^(?:(?:@\w+|hey|also)\s*[, :]*\s*)*(why|what|when|where|who|how|are|is|does|do|did|can(?:not|'t)?|could|would|should)\b/i;
const REQUEST = /\b(?:can|could|would)\s+(?:you|u)\s+(?:please\s+)?(?:fix|implement|build|code|edit|change|update|add|remove|rename|migrate|refactor|debug|test|wire|patch)\b/i;
const APPROVAL = /^(yes|yep|yeah|ok|okay|sure|go|go ahead|do it|start|start building|approved)[.!\s]*$/i;
function phaseFor({ text = '', trigger, sessionState, isSubagent } = {}) {
  if (isSubagent) return 'other';
  const t = String(text || (trigger && trigger.text) || '').trim();
  const fromUser = !trigger || trigger.from === 'user';
  if (!sessionState?.building) return 'planning';
  if (fromUser) {
    if (PLAN_WITH_BUDDY.test(t)) return 'other';
    if (APPROVAL.test(t)) return 'coding';
    if (QUESTION.test(t) && !REQUEST.test(t)) return 'other';
    return WORK.test(t) ? 'coding' : 'other';
  }
  // A conversational handoff keeps its originating phase unless it assigns work.
  if (REQUEST.test(t) || /(?:@(?:codex|claude)[,:]?\s+|\blet['’]s\s+)(?:please\s+)?(?:fix|implement|build|edit|change|update|add|remove|migrate|debug|test|check)\b/i.test(t)) return 'coding';
  return trigger?.route?.phase === 'coding' ? 'coding' : 'other';
}

const VALID_ANTIGRAVITY_MODELS = [
  'gemini-3.8-flash-high',
  'gemini-3.8-flash-medium',
  'gemini-3.8-flash-low',
  'gemini-3.5-flash-lite',
];

function sanitizeAntigravityModel(model, effort) {
  let m = model;
  if (m === 'gemini-3.8-pro') m = 'gemini-3.8-flash-high';
  else if (m === 'gemini-3.8-flash') m = 'gemini-3.8-flash-' + (effort || 'medium');
  else if (m === 'gemini-3.8-flash-lite') m = 'gemini-3.5-flash-lite';
  if (!VALID_ANTIGRAVITY_MODELS.includes(m)) m = 'gemini-3.8-flash-low';
  return m;
}

const SAFE_MODEL = /^[A-Za-z0-9][\w.:\/-]*$/; // no quotes/spaces/shell metachars: safe under spawn shell:true
const toStr = (x) => (Array.isArray(x) ? x.join(' ') : String(x || ''));
const hasModel = (s, agent) => (agent === 'codex' ? /(^|\s)(-m|--model)(\s|=|$)|(^|\s)-c\s+model\s*=/ : /(^|\s)--model(\s|=|$)/).test(s);
const hasEffort = (s, agent) => (agent === 'codex' ? /model_reasoning_effort\s*=/ : /(^|\s)--effort(\s|=|$)/).test(s);

// Extra CLI args for a run. An explicit --model / -m / --effort in the Settings args string wins (we add nothing for that part).
// Codex value is unquoted (model_reasoning_effort=low): cmd.exe would strip quotes anyway and codex parses bare TOML strings.
function argsFor(agent, phase, routes, extraArgs) {
  const r = (mergeRoutes(routes)[agent] || {})[phase];
  if (!r) return [];
  const extra = toStr(extraArgs), out = [];
  let model = r.model;
  if (agent === 'antigravity') {
    model = sanitizeAntigravityModel(model, r.effort);
  }
  if (SAFE_MODEL.test(model) && !hasModel(extra, agent)) out.push(agent === 'codex' ? '-m' : '--model', model);
  if (EFFORTS.includes(r.effort) && !hasEffort(extra, agent)) out.push(...(agent === 'codex' ? ['-c', `model_reasoning_effort=${r.effort}`] : ['--effort', r.effort]));
  return out;
}

// What actually applies, for agent:status / message meta. Null where the Settings args override routing.
const resolved = (agent, phase, routes, extraArgs) => {
  const merged = mergeRoutes(routes);
  const r = (merged[agent] && merged[agent][phase]) || (DEFAULT_ROUTES[agent] && DEFAULT_ROUTES[agent][phase]) || { model: 'gemini-3.8-flash-medium', effort: 'low' };
  const x = toStr(extraArgs);
  let model = r.model;
  if (agent === 'antigravity') {
    model = sanitizeAntigravityModel(model, r.effort);
  }
  return { phase, model: hasModel(x, agent) ? null : model, effort: hasEffort(x, agent) ? null : r.effort };
};

// Read the same argv sent to the CLI, including explicit Settings overrides.
function modelFromArgs(args, fallback = 'gpt-unknown') {
  let model = fallback;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '-m' || a === '--model') && args[i + 1]) model = args[++i];
    else if (/^(?:-m|--model)=/.test(a)) model = a.slice(a.indexOf('=') + 1);
    else if (a === '-c' && /^model\s*=/.test(args[i + 1] || '')) model = args[++i].replace(/^model\s*=\s*/, '');
  }
  return model.replace(/^["']|["']$/g, '');
}

module.exports = { PHASES, EFFORTS, DEFAULT_ROUTES, mergeRoutes, phaseFor, argsFor, resolved, modelFromArgs, VALID_ANTIGRAVITY_MODELS, sanitizeAntigravityModel };
