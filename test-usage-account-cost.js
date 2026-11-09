// Account-only lifetime tokens are priced at the average local Codex rate; model/type breakdowns stay local-only.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {scan,allocateAccountCost}=require('./usage');
const split=allocateAccountCost({'2026-11-01':100,'2026-11-02':300},[],80);
assert.deepEqual(split,{'2026-11-01':20,'2026-11-02':60});
assert.deepEqual(allocateAccountCost({},[],80),{});
assert.deepEqual(allocateAccountCost({'2026-11-01':100},[],0),{});
assert.deepEqual(allocateAccountCost({'2026-11-01':100},[{startDate:'2026-11-02',tokens:300}],80),split);

const home=fs.mkdtempSync(path.join(os.tmpdir(),'relay-acct-cost-'));
fs.mkdirSync(path.join(home,'.codex','sessions'),{recursive:true});
const model='gpt-6-astra';
fs.writeFileSync(path.join(home,'.codex','sessions','a.jsonl'),[{type:'session_meta',payload:{id:'s'}},{type:'turn_context',payload:{model}},{timestamp:'2026-11-01T12:00:00Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:1000000,cached_input_tokens:0,output_tokens:100000}}}}].map(r=>JSON.stringify(r)).join('\n'));
const fake=path.join(__dirname,'test-fake-codex.js');
(async()=>{
  try{
    const shim=path.join(home,'codex.cmd');fs.writeFileSync(shim,`@"${process.execPath}" "${fake}" %*`);
    const u=await scan({home,env:{},accountUsage:true,codexCommand:`"${shim}"`});
    const t=u.total;
    assert.ok(t.accountTokenAdjustment>0,'account tokens exceed local');
    assert.ok(Math.abs(t.accountCostEstimate-t.cost/(t.localTokens)*t.accountTokenAdjustment)<1e-9,'priced at the local average rate');
    assert.equal(t.lifetimeCostEstimate,t.cost+t.accountCostEstimate);
    assert.equal(u.tools.Codex.accountCostEstimate,t.accountCostEstimate);
    assert.equal(u.tools.Codex.lifetimeCostEstimate,u.tools.Codex.cost+t.accountCostEstimate);
    for(const [name,provider] of Object.entries(u.tools)) if(name!=='Codex') {assert.equal(provider.accountCostEstimate,0);assert.equal(provider.lifetimeCostEstimate,provider.cost);}
    assert.equal(Object.values(u.accountCostDays).reduce((n,v)=>n+v,0),t.accountCostEstimate);
    assert.equal(u.chartDays['2026-11-01'].Codex,u.days['2026-11-01'].Codex+t.accountCostEstimate);
    assert.equal(Object.values(u.days).reduce((n,v)=>n+(v.Codex||0),0),u.tools.Codex.cost,'local costs stay unchanged');
    console.log('Lifetime account-token cost estimate passed');
  } finally {fs.rmSync(home,{recursive:true,force:true});}
})();
