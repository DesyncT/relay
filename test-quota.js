const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {left,balanceFor}=require('./spreader');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-quota-')),cache=path.join(root,'quota-cache.json');
let now=Date.now();
class Clock extends Date {static now(){return now;}}
function load(status=429) {
  let calls=0;
  const localFs={...fs.promises,readdir:async()=>[],access:async()=>{throw Error('absent');},
    readFile:async(file,...args)=>String(file).endsWith('.credentials.json')?JSON.stringify({accessToken:'fixture'}):fs.promises.readFile(file,...args)};
  const context={module:{exports:{}},Buffer,Date:Clock,AbortSignal,
    require:name=>name==='fs/promises'?localFs:require(name),
    fetch:async()=>{calls++;return {ok:(typeof status==='function'?status(calls):status)===200,headers:{get:()=>null},json:async()=>({five_hour:{utilization:40,resets_at:new Date(now+3600000).toISOString()}})};}};
  vm.runInNewContext(fs.readFileSync(require.resolve('./quota'),'utf8'),context);
  return {quota:context.module.exports,calls:()=>calls};
}
(async()=>{
  const first=load(200); first.quota.setCacheFile(cache);
  let result=await first.quota.readQuota({fresh:true});
  assert.equal(result.claude.windows[0].remaining,60);
  const saved=JSON.parse(fs.readFileSync(cache,'utf8'));
  assert.equal(saved.claude.windows[0].used,40);
  assert.ok(!fs.readFileSync(cache,'utf8').includes('fixture'),'Cache stores no credentials');
  const restarted=load();restarted.quota.setCacheFile(cache);
  result=await restarted.quota.readQuota({fresh:true});
  assert.equal(result.claude.cached,true);
  assert.equal(result.claude.windows[0].remaining,60,'Last genuine response survives restart and endpoint failure');
  assert.equal(result.claude.at,saved.claude.at,'Restart does not invent a fresh timestamp');
  await restarted.quota.readQuota({fresh:true});
  assert.equal(restarted.calls(),1,'Dispatch refresh respects HTTP failure backoff');
  const event={type:'rate_limit_event',rate_limit_info:{unifiedWindows:{five_hour:{utilization:.18,resetsAt:(now+3600000)/1000},seven_day:{utilization:.3,resetsAt:(now+86400000)/1000}}}};
  assert.equal(restarted.quota.recordEvent('claude',event,now+1000),true);
  result=await restarted.quota.readQuota();
  assert.equal(result.claude.windows[0].remaining,82,'Live stream replaces the cached API report during backoff');
  assert.ok(!result.claude.cached);
  assert.equal(restarted.quota.recordEvent('claude',{type:'rate_limit_event',rate_limit_info:{status:'allowed',rateLimitType:'five_hour'}},now+2000),false,'Missing utilization never means zero usage');
  now+=600000;
  result=await restarted.quota.readQuota();
  assert.equal(result.claude.windows[0].stale,true);
  assert.equal(result.claude.windows[0].remaining,82,'Stale cache remains visible with original percentage');
  assert.equal(left(result.claude),50,'Stale percentages do not establish a precise routing target');
  const expired=restarted.quota.current(restarted.quota.snapshot({timestamp:new Date(now).toISOString(),payload:{rate_limits:{primary:{used_percent:87,window_minutes:300,resets_at:(now-1000)/1000}}}},now),now);
  assert.equal(expired.windows[0].remaining,13,'An expired reset never fabricates full allowance');
  assert.equal(expired.windows[0].stale,true);
  const fallback=await load().quota.readQuota();
  assert.equal(fallback.claude.estimated,true);
  assert.equal(fallback.claude.windows[0].remaining,undefined,'Token fallback has no invented remaining percentage');
  assert.equal(balanceFor({claude:fallback.claude,codex:{windows:[{minutes:300,remaining:13}]}},['claude','codex'],'claude'),null);
  const limited=load(call=>call===1?200:429);
  await limited.quota.readQuota();now+=121000;
  const failedRefresh=await limited.quota.readQuota({fresh:true});
  assert.equal(failedRefresh.claude.stale,true,'A failed refresh keeps the old report visibly stale');
  assert.equal(left(failedRefresh.claude),50);
  console.log('Live quota, restart cache, backoff, stale-data and token fallback checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});
});
