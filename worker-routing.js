// EasyCode starts small. A failed provider can be replaced without jumping to flagship prices.
const LADDERS = {
  codex:['gpt-6-luna','gpt-6.1-sol','gpt-6-astra'],
  claude:['claude-haiku-5-5','claude-sonnet-5-5','claude-opus-5-5'],
  antigravity:['gemini-3.5-flash-lite','gemini-3.8-flash-low','gemini-3.8-flash-medium','gemini-3.8-flash-high'],
};
const key = route => [route.provider,route.model,route.effort].join(':');
function initialWorkerRoutes(routes) {
  return Object.fromEntries(Object.entries(routes || {}).map(([provider,phases])=>[provider,{...phases,
    coding:LADDERS[provider] ? {model:LADDERS[provider][0],effort:'low'} : phases.coding}]));
}
function balanceWorkers(assignments,routes,available) {
  const providers = [...new Set(['codex','claude',...available])].filter(provider=>available.includes(provider) && routes[provider]?.coding);
  let index=0;
  return assignments.map(assignment=>{
    if (!providers.length || assignment.status !== 'queued') return assignment;
    const provider=providers[index++ % providers.length];
    return {...assignment,provider,...routes[provider].coding};
  });
}
function nextWorkerRoute(assignment,routes,available,{reason='review-failed'}={}) {
  const attempted = new Set([key(assignment),...(assignment.attemptedRoutes || []).map(key)]);
  const currentTier = (LADDERS[assignment.provider] || []).indexOf(assignment.model);
  const candidates = [...new Set(available)].flatMap(provider=>{
    const models=LADDERS[provider] || [routes[provider]?.coding?.model].filter(Boolean);
    return models.map((model,tier)=>({provider,model,effort:tier ? 'medium' : 'low',tier}));
  }).filter(route=>!attempted.has(key(route)) && (reason==='worker-failed' || route.tier>currentTier));
  candidates.sort((a,b)=>reason==='worker-failed'
    ? Number(a.provider===assignment.provider)-Number(b.provider===assignment.provider) || a.tier-b.tier
    : a.tier-b.tier || Number(a.provider===assignment.provider)-Number(b.provider===assignment.provider));
  const next=candidates[0];
  return next ? {provider:next.provider,model:next.model,effort:next.effort,escalationTier:(assignment.escalationTier || 0)+(reason==='worker-failed' ? 0 : 1)} : null;
}
module.exports={initialWorkerRoutes,balanceWorkers,nextWorkerRoute};
