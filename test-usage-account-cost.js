// Account-only lifetime tokens are priced at the average local Codex rate; the breakdowns stay local-only.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {scan}=require('./usage');
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
    console.log('Lifetime account-token cost estimate passed');
  } finally {fs.rmSync(home,{recursive:true,force:true});}
})();
