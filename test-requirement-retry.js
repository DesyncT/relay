'use strict';
const assert = require('node:assert/strict');
const {prepareRequirementRetry} = require('./requirement-retry');
const routes = {codex:{coding:{model:'gpt-6-luna',effort:'low'}},claude:{coding:{model:'claude-haiku-5-5',effort:'low'}}};
const available = ['codex','claude'];
const failed = {id:'one',status:'blocked',provider:'codex',model:'gpt-6-luna',effort:'low',task:'Fix it',files:['a.js'],workspace:{path:'work'},patch:'patch',blocker:'worker-failed',error:'failed',ended:123,progress:90,attemptedRoutes:[{provider:'claude',model:'claude-haiku-5-5',effort:'low'}],workerFailures:[{error:'old'}],reviewEvidence:[{verdict:'FAIL'}]};
const before = structuredClone(failed);
const retry = prepareRequirementRetry(failed,{routes,available});
assert.equal(retry.status,'queued');
assert.equal(retry.provider,'codex');
assert.equal(retry.model,failed.model);
assert.equal(retry.effort,failed.effort);
assert.deepEqual(retry.attemptedRoutes,[]);
for (const key of ['blocker','error','ended']) assert.equal(retry[key],null);
assert.equal(retry.progress,0);
for (const key of ['task','files','workspace','patch','workerFailures','reviewEvidence']) assert.deepEqual(retry[key],failed[key]);
assert.deepEqual(failed,before);
const alternate=prepareRequirementRetry(failed,{alternate:true,routes,available});
assert.equal(alternate.provider,'claude');
assert.deepEqual(alternate.attemptedRoutes,[]);
assert.equal(prepareRequirementRetry({...failed,blocker:'review-unknown'},{routes,available}).status,'reviewing');
assert.equal(prepareRequirementRetry({...failed,blocker:'review-unknown'},{alternate:true,routes,available}).status,'queued');
assert.equal(prepareRequirementRetry({...failed,status:'open'},{routes,available}).status,'queued');
assert.throws(()=>prepareRequirementRetry(failed,{routes,available:['claude']}),/unavailable/i);
assert.throws(()=>prepareRequirementRetry(failed,{alternate:true,routes,available:[]}),/another|alternative/i);
for (const status of ['queued','running','reviewing','passed']) assert.throws(()=>prepareRequirementRetry({...failed,status},{routes,available}),/retr/i);
const integrated={...failed,status:'passed',integrationStatus:'open',integrationFindings:'broken'};
const integrationRetry=prepareRequirementRetry(integrated,{alternate:true,routes,available});
assert.equal(integrationRetry.status,'passed');
assert.equal(integrationRetry.provider,'codex');
assert.equal(integrationRetry.integrationRoute.provider,'claude');
assert.equal(integrationRetry.integrationStatus,'pending');
assert.equal(integrationRetry.integrationFindings,null);
assert.equal(integrationRetry.patch,'patch');
const repeated=prepareRequirementRetry({...integrated,integrationRoute:integrationRetry.integrationRoute},{routes,available});
assert.equal(repeated.integrationRoute.provider,'claude');
const oneModel={...failed,provider:'local',model:'only',effort:'low'};
assert.throws(()=>prepareRequirementRetry(oneModel,{alternate:true,routes:{local:{coding:{model:'only'}}},available:['local']}),/another|alternative/i);
const effortOnly=prepareRequirementRetry({...failed,effort:'high'},{alternate:true,routes,available:['codex']});
assert.notEqual(effortOnly.model,failed.model);
console.log('requirement retry checks passed');
// Exercise the real IPC retry path with saved task state and no live provider calls.
const source=require('node:fs').readFileSync(require.resolve('./main'),'utf8');
const handlerSource=source.slice(source.indexOf("ipcMain.handle('chat:requirement-retry'"),source.indexOf("ipcMain.handle('chat:bypass'"));
(async()=>{
  let handler,started;
  const done={...failed,id:'done',status:'passed',blocker:null,patch:'passed patch',files:['done.js']};
  const target={...failed,id:'failed',owner:'codex',requirementIndex:1,workspace:{path:'owned-workspace'}};
  const session={lead:'codex',messages:[{from:'user',text:'Implement both',at:1}],reqs:{items:[{t:'First'},{t:'Second'}],assignments:[done,target]}};
  const retrying=new Set();
  require('node:vm').runInNewContext(handlerSource,{
    ipcMain:{handle:(_channel,fn)=>{handler=fn;}},supercodeOn:()=>true,chatBusy:()=>false,
    store:{getSession:()=>session},AGENT_NAMES:['codex','claude'],down:{},isDown:()=>false,
    initialWorkerRoutes:require('./worker-routing').initialWorkerRoutes,settings:{routes},require,
    RT:()=>({epoch:0}),requirementRetries:retrying,validTaskWorkspace:()=>true,
    setReqs:(_sid,reqs)=>{session.reqs=reqs;},workspacesFromAssignments:()=>({mode:'worktree',tasks:[]}),
    startRequirementWorkflow:async(_sid,_owner,_trigger,_epoch,recovery)=>{started=recovery.assignments;},drainUserQueue:()=>{},
  });
  await handler(null,'session','failed',true);
  assert.equal(started[0].status,'passed','Retry preserves completed siblings');
  assert.equal(started[0].patch,'passed patch','Retry preserves completed patches');
  assert.equal(started[1].status,'queued');
  assert.equal(started[1].provider,'claude','Alternate-model retry switches the failing Codex worker');
  assert.equal(retrying.size,0);
  console.log('Requirement retry IPC preservation checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
