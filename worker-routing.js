// EasyCode starts small. A failed provider can be replaced without jumping to flagship prices.
const LADDERS = {
  codex:['gpt-6-luna','gpt-6.1-sol','gpt-6-astra'],
  claude:['claude-haiku-5-5','claude-sonnet-5-5','claude-opus-5-5'],
  antigravity:['gemini-3.5-flash-lite','gemini-3.8-flash-low','gemini-3.8-flash-medium','gemini-3.8-flash-high'],
};
const key = route => [route.provider,route.model,route.effort].join(':');
// taskMax (Settings > Model routing > Task limit): the strongest model a requirement task may climb to, per provider
function initialWorkerRoutes(routes,taskMax={}) {
  return Object.fromEntries(Object.entries(routes || {}).map(([provider,phases])=>[provider,{...phases,
    coding:LADDERS[provider] ? {model:LADDERS[provider][0],effort:'low'} : phases.coding,taskMax:taskMax?.[provider]}]));
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
    const ladder=LADDERS[provider], cap=ladder?.indexOf(routes[provider]?.taskMax);
    // no limit set: stop at the middle tier (sonnet, sol); a flagship only when you allow it or pick it on Retry
    const models=ladder ? ladder.slice(0,cap>=0 ? cap+1 : 2) : [routes[provider]?.coding?.model].filter(Boolean);
    return models.map((model,tier)=>({provider,model,effort:routes[provider]?.coding?.effort || 'low',tier}));
  }).filter(route=>!attempted.has(key(route)) && (reason==='worker-failed' || route.tier>currentTier));
  candidates.sort((a,b)=>reason==='worker-failed'
    ? Number(a.provider===assignment.provider)-Number(b.provider===assignment.provider) || a.tier-b.tier
    : a.tier-b.tier || Number(a.provider===assignment.provider)-Number(b.provider===assignment.provider));
  const next=candidates[0];
  return next ? {provider:next.provider,model:next.model,effort:next.effort,escalationTier:(assignment.escalationTier || 0)+(reason==='worker-failed' ? 0 : 1)} : null;
}
module.exports={initialWorkerRoutes,balanceWorkers,nextWorkerRoute,LADDERS};
