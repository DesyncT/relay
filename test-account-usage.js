const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {normalize,readAccountUsage}=require('./account-usage');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-account-test-')),cacheFile=path.join(root,'usage.json');
function fixture({email='fixture@example.test',failure=false,ignoreEof=false}={}){
  const requests=[];let killed=false;
  const spawnProcess=()=>{
    const p=new EventEmitter();p.stdout=new PassThrough();p.stderr=new PassThrough();p.exitCode=null;p.kill=()=>{killed=true;p.exitCode=0;p.emit('exit',0);};
    p.stdin=new Writable({write(bytes,_encoding,done){
      const m=JSON.parse(String(bytes));requests.push(m.method);
      const result=m.id===1?{}:m.id===2?{account:{type:'chatgpt',email}}:m.id===3?{summary:{lifetimeTokens:1200000000},dailyUsageBuckets:[{startDate:'2026-01-01',tokens:1000}]}:null;
      if(m.id){const response=m.id===3&&failure?{id:m.id,error:{code:-1,message:'unavailable'}}:{id:m.id,result};queueMicrotask(()=>{const line=JSON.stringify(response)+'\n';p.stdout.write(line.slice(0,5));p.stdout.write(line.slice(5));});}done();
    }});
    p.stdin.on('finish',()=>{if(!ignoreEof){p.exitCode=0;p.emit('exit',0);}});return p;
  };
  return {spawnProcess,requests,wasKilled:()=>killed};
}
(async()=>{
  const live=fixture(),a=await readAccountUsage({cacheFile,...live});
  assert.equal(a.summary.lifetimeTokens,1200000000);
  assert.deepEqual(live.requests,['initialize','initialized','account/read','account/usage/read']);
  const text=fs.readFileSync(cacheFile,'utf8');assert.ok(!text.includes('fixture@example.test'),'No email or credentials are written to cache');
  const cached=await readAccountUsage({cacheFile,...fixture({failure:true})});
  assert.equal(cached.cached,true);assert.equal(cached.summary.lifetimeTokens,1200000000);
  assert.equal(await readAccountUsage({cacheFile,...fixture({email:'different@example.test',failure:true})}),null,'Another account cannot inherit a cached lifetime total');
  const stubborn=fixture({ignoreEof:true});await readAccountUsage(stubborn);assert.equal(stubborn.wasKilled(),true,'A child ignoring EOF is terminated before returning a result');
  assert.equal(normalize({summary:{lifetimeTokens:null}}),null);
  assert.equal(normalize({summary:{lifetimeTokens:-1}}),null);
  assert.equal(normalize({summary:{lifetimeTokens:0},dailyUsageBuckets:null}).summary.lifetimeTokens,0);
  console.log('Account lifetime RPC, split responses, private cache and account-switch isolation passed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});});
