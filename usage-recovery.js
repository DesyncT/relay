// Recover token totals from Claude's retained statistics without inventing costs.
const validDay=s=>typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s));
const number=n=>Number.isSafeInteger(n) && n>=0?n:0;
const total=r=>(r.input||0)+(r.output||0)+(r.cacheRead||0)+(r.cacheWrite||0)+(r.cacheWrite1h||0)+(r.unclassifiedTokens||0);
function normalizeClaudeStats(s){
  if(!validDay(s?.lastComputedDate) || !s.modelUsage || typeof s.modelUsage!=='object')return null;
  const modelTotals={};
  for(const [model,u] of Object.entries(s.modelUsage))if(u && typeof u==='object')modelTotals[model]=['inputTokens','outputTokens','cacheReadInputTokens','cacheCreationInputTokens'].reduce((n,k)=>n+number(u[k]),0);
  const daily=(Array.isArray(s.dailyModelTokens)?s.dailyModelTokens:[]).filter(d=>validDay(d.date) && d.date<=s.lastComputedDate).map(d=>({date:d.date,tokensByModel:Object.fromEntries(Object.entries(d.tokensByModel || {}).filter(([,n])=>Number.isSafeInteger(n) && n>=0))}));
  return {asOf:s.lastComputedDate,modelTotals,daily};
}
function recoverClaude(records,snapshots){
  const recovered=[];
  for(const snapshot of [...snapshots].sort((a,b)=>a.asOf.localeCompare(b.asOf))){
    if(!validDay(snapshot.asOf) || !snapshot.modelTotals)continue;
    for(const [model,reported] of Object.entries(snapshot.modelTotals)){
      if(!Number.isSafeInteger(reported) || reported<0)continue;
      const known=[...records,...recovered].filter(r=>r.tool==='Claude Code' && r.model===model && ((r.day && r.day<=snapshot.asOf) || (!r.day && r.asOf && r.asOf<=snapshot.asOf)));
      let missing=Math.max(0,reported-known.reduce((n,r)=>n+total(r),0));
      const add=(day,n)=>{if(!n)return;recovered.push({id:'recovered:claude:'+snapshot.asOf+':'+model+':'+day,tool:'Claude Code',session:null,model,day,asOf:snapshot.asOf,input:0,output:0,cacheRead:0,cacheWrite:0,cacheWrite1h:0,unclassifiedTokens:n,recovered:true,costUnknown:true,fast:false});missing-=n;};
      for(const day of snapshot.daily || []){
        if(!missing || !validDay(day.date) || day.date>snapshot.asOf)continue;
        const tokens=number(day.tokensByModel?.[model]),existing=known.filter(r=>r.day===day.date).reduce((n,r)=>n+total(r),0);
        add(day.date,Math.min(missing,Math.max(0,tokens-existing)));
      }
      add('',missing);
    }
  }
  return recovered;
}
module.exports={normalizeClaudeStats,recoverClaude,total};
