const { EFFORTS } = require('./routing');

const EFFORT_RANK = { low: 0, medium: 1, high: 2, xhigh: 3, max: 4 };
const MODEL_RANK = {
  'gpt-6-luna': 0, 'gpt-6.1-sol': 1, 'gpt-6-astra': 2,
  'claude-haiku-5-5': 0, 'claude-sonnet-5-5': 1, 'claude-opus-5-5': 2,
  'gemini-3.5-flash-lite': 0, 'gemini-3.8-flash-low': 1,
  'gemini-3.8-flash-medium': 2, 'gemini-3.8-flash-high': 3,
};
const ACTIONABLE = item => item && item.actionable !== false && item.preservationOnly !== true && item.preserveOnly !== true && item.type !== 'preservation' && item.kind !== 'constraint';
const providerSet = available => new Set(Array.isArray(available) ? available : Object.keys(available || {}).filter(key => available[key]));
const routeAt = (routes, provider) => routes && routes[provider] && routes[provider].coding;
const routeScore = route => (MODEL_RANK[route.model] ?? -1) * 5 + (EFFORT_RANK[route.effort] ?? -1);

function createAssignments(items, plan, routes, availableProviders) {
  const providers = providerSet(availableProviders);
  const actionable = (Array.isArray(items) ? items : []).map((item, index) => ({ item, index })).filter(x => ACTIONABLE(x.item));
  const candidates = Array.isArray(plan) ? plan : [];
  const actionableIndices = new Set(actionable.map(x => x.index));
  const byIndex = new Map();
  for (const entry of candidates) {
    if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.requirementIndex) || !actionableIndices.has(entry.requirementIndex)) {
      throw new Error('Invalid plan entry: requirement index must map to an actionable requirement');
    }
    const index = entry.requirementIndex;
    const bucket = byIndex.get(index) || [];
    bucket.push(entry);
    byIndex.set(index, bucket);
  }
  const known = new Set(actionable.map(x => x.index));
  return actionable.map(({ item, index }) => {
    const entries = byIndex.get(index) || [];
    const proposal = entries.length === 1 ? entries[0] : null;
    const proposedRoute = proposal && routeAt(routes, proposal.provider);
    const valid = proposal && typeof proposal.task === 'string' && proposal.task.trim() &&
      providers.has(proposal.provider) && proposedRoute && proposal.model === proposedRoute.model &&
      proposal.effort === proposedRoute.effort && EFFORTS.includes(proposal.effort) &&
      typeof proposal.model === 'string' && proposal.model.trim();
    if (proposal && !valid) throw new Error(`Invalid route or task for requirement ${index}`);
    let task, provider, model, effort, files, coordinatorOwned = false;
    if (valid) {
      ({ task, provider, model, effort } = proposal);
      files = normalizeFiles(proposal.files || proposal.fileOwnership);
    } else {
      const fallbackProvider = [...providers].find(name => routeAt(routes, name) &&
        typeof routeAt(routes, name).model === 'string' && routeAt(routes, name).model.trim() && EFFORTS.includes(routeAt(routes, name).effort));
      if (!fallbackProvider) throw new Error('No valid configured coding route available for fallback assignment');
      ({ model, effort } = routeAt(routes, fallbackProvider));
      provider = fallbackProvider;
      task = `Coordinator-owned task for requirement ${index}: ${String(item.text || item.requirement || item.title || '').trim()}`;
      files = [];
      coordinatorOwned = true;
    }
    return { id: `requirement-${index}`, requirementIndex: index, task: task.trim(), provider, model, effort, files, fileOwnership: files, status: 'queued', coordinatorOwned, escalationTier: 0 };
  });
}
function normalizeFiles(value) { return [...new Set((Array.isArray(value) ? value : []).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().replace(/\\/g, '/')))]; }

function nextEscalation(assignment, routes, availableProviders) {
  const current = { model: assignment.model, effort: assignment.effort };
  const currentScore = routeScore(current);
  const routesAvailable = [...providerSet(availableProviders)].map(provider => ({ provider, route: routeAt(routes, provider) }))
    .filter(x => x.route && MODEL_RANK[x.route.model] !== undefined && EFFORTS.includes(x.route.effort) && routeScore(x.route) > currentScore)
    .sort((a, b) => routeScore(a.route) - routeScore(b.route));
  const next = routesAvailable[0];
  return next ? { provider: next.provider, model: next.route.model, effort: next.route.effort, escalationTier: (assignment.escalationTier || 0) + 1 } : null;
}
function readyAssignments(assignments, runningLimit) {
  const list = Array.isArray(assignments) ? assignments : [];
  const running = list.filter(a => a.status === 'running');
  const limit = Math.max(0, Math.floor(Number(runningLimit) || 0) - running.length);
  const busy = running.flatMap(a => a.fileOwnership || a.files || []).map(path => path.toLowerCase());
  const coordinatorBusy = running.some(a => a.coordinatorOwned);
  const ready = [];
  for (const assignment of list) {
    if (assignment.status !== 'queued' || ready.length >= limit) continue;
    if (assignment.coordinatorOwned && (coordinatorBusy || ready.some(a => a.coordinatorOwned))) continue;
    const files = assignment.fileOwnership || assignment.files || [];
    if (files.some(path => busy.includes(String(path).toLowerCase()))) continue;
    ready.push(assignment);
    busy.push(...files.map(path => String(path).toLowerCase()));
  }
  return ready;
}
function allTasksPassed(assignments) { return (Array.isArray(assignments) ? assignments : []).filter(a => a.actionable !== false).every(a => a.status === 'passed'); }
module.exports = { createAssignments, nextEscalation, readyAssignments, allTasksPassed };




