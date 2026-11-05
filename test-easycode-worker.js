const assert=require('node:assert/strict');
const {createRequirementCoordinator}=require('./requirement-coordinator');
(async()=>{
  let runs=0,escalations=0,debugs=0;
  const assignment={id:'a',task:'Fix login',provider:'codex',model:'configured-model',effort:'high',files:['login.js'],status:'queued'};
  const c=createRequirementCoordinator({limit:1,maxAttempts:2,requireChecks:true,
    nextRoute:()=>{escalations++;return {provider:'claude',model:'stronger'};},autoFix:()=>{debugs++;return 'try again';},
    runTask:async()=>{runs++;return {paths:['login.js'],checks:[{command:'npm test',exitCode:1}]};},reviewTask:async()=>({verdict:'PASS'})});
  await c.start([assignment]);
  assert.equal(assignment.status,'blocked','Failed commands cannot be overridden by reviewer PASS');
  assert.equal(runs,2,'One initial implementation and one repair');assert.equal(escalations,0);assert.equal(debugs,0);
  assert.equal(assignment.model,'configured-model');assert.equal(assignment.effort,'high');
  const missing={...assignment,id:'b',status:'queued',attemptedRoutes:[],implementationAttempts:0};
  const d=createRequirementCoordinator({maxAttempts:2,requireChecks:true,runTask:async()=>({paths:[]}),reviewTask:async()=>({verdict:'PASS'})});
  await d.start([missing]);assert.equal(missing.status,'blocked','Missing check evidence blocks success');
  let active=0,peak=0;
  const serial=createRequirementCoordinator({limit:1,maxAttempts:2,requireChecks:true,runTask:async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;return {checks:[{command:'check',exitCode:0}]};},reviewTask:async()=>({verdict:'PASS'})});
  await serial.start([1,2,3].map(n=>({...assignment,id:String(n),status:'queued',implementationAttempts:0})));
  assert.equal(peak,1);console.log('EasyCode bounded serial worker and command evidence checks passed');
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('./main'),'utf8');
  const execution=source.slice(source.indexOf('async function executeEasycode('),source.indexOf('const easyController='));
  const configured={provider:'codex',model:'gpt-6.1-sol',effort:'high'};
  const settings={routes:{codex:{coding:{model:configured.model,effort:configured.effort}}},taskMaxModel:{codex:'gpt-6-astra'}};
  const execute=vm.runInNewContext(`${execution};executeEasycode`,{RT:()=>({epoch:1}),cwdFor:()=>'.',easyOwner:()=> 'codex',settings,require,executeRequest:async(_r,deps)=>deps.route});
  let route=await execute('s',{id:'r'});assert.equal(route.model,'gpt-6.1-sol');assert.equal(route.effort,'high');
  settings.taskMaxModel.codex='gpt-6-luna';route=await execute('s',{id:'r'});assert.equal(route.model,'gpt-6-luna');assert.equal(route.effort,'high');
  assert.equal(settings.routes.codex.coding.model,'gpt-6.1-sol','Task caps do not overwrite saved worker settings');
})().catch(e=>{console.error(e);process.exitCode=1;});
