const assert = require('node:assert/strict');
const { initialWorkerRoutes, balanceWorkers, nextWorkerRoute } = require('./worker-routing');
const { createRequirementCoordinator } = require('./requirement-coordinator');
const configured = {claude:{coding:{model:'claude-opus-5-5',effort:'low'}},codex:{coding:{model:'gpt-6-astra',effort:'medium'}}};
const routes = initialWorkerRoutes(configured);
assert.equal(routes.claude.coding.model,'claude-haiku-5-5');
assert.equal(routes.codex.coding.model,'gpt-6-luna');
assert.equal(configured.claude.coding.model,'claude-opus-5-5','Do not mutate saved or normal-chat routes');
const tasks = balanceWorkers(Array.from({length:5},(_,index)=>({id:String(index),status:'queued'})),routes,['claude','codex']);
assert.deepEqual(tasks.map(task=>task.provider),['codex','claude','codex','claude','codex']);
const first = tasks[0];
const alternate = nextWorkerRoute(first,routes,['claude','codex'],{reason:'worker-failed'});
assert.equal(alternate.provider,'claude');
assert.equal(alternate.model,'claude-haiku-5-5','Provider failure must not require paying for a flagship');
const stronger = nextWorkerRoute(first,routes,['codex'],{reason:'review-failed'});
assert.equal(stronger.model,'gpt-6.1-sol');
assert.equal(stronger.effort,'low','A stronger model keeps the effort from routing settings');
assert.equal(nextWorkerRoute(first,routes,[],{reason:'worker-failed'}),null);
assert.equal(nextWorkerRoute({...first,model:'gpt-6.1-sol'},routes,['codex'],{reason:'review-failed'}),null,'Automatic escalation never reaches a flagship model');
assert.equal(nextWorkerRoute({...first,model:'gpt-6.1-sol'},initialWorkerRoutes(configured,{codex:'gpt-6-astra'}),['codex'],{reason:'review-failed'}).model,'gpt-6-astra','The Task limit setting allows the flagship');
assert.equal(nextWorkerRoute(first,initialWorkerRoutes(configured,{codex:'gpt-6-luna'}),['codex'],{reason:'review-failed'}),null,'A limit on the cheapest model never escalates');
(async()=>{
  const task = {...first,files:['a.js'],fileOwnership:['a.js']}; const calls=[];
  const coordinator = createRequirementCoordinator({
    runTask:async assignment=>{calls.push(assignment.provider); if(assignment.provider==='codex') throw new Error('insufficient credits'); return {paths:['a.js']};},
    reviewTask:async()=>({verdict:'PASS'}), nextRoute:(a,reason)=>nextWorkerRoute(a,routes,['claude','codex'],reason),
  });
  await coordinator.start([task]);
  assert.deepEqual(calls,['codex','claude']); assert.equal(task.status,'passed');
  assert.equal(task.workerFailures.length,1);
  const stopped={...tasks[1],files:['b.js'],fileOwnership:['b.js']}; let attempts=0;
  await createRequirementCoordinator({runTask:async()=>{attempts++;throw Object.assign(new Error('Stopped'),{cancelled:true});},reviewTask:async()=>({verdict:'PASS'}),nextRoute:()=>assert.fail('Stop must not restart a worker')}).start([stopped]);
  assert.equal(attempts,1); assert.equal(stopped.status,'blocked');
  let finish,started=0,reviewed=0;
  const cancellation=createRequirementCoordinator({limit:1,
    runTask:async()=>{started++;await new Promise(resolve=>{finish=resolve;});return {paths:['a.js']};},
    reviewTask:async()=>{reviewed++;return {verdict:'PASS'};},nextRoute:()=>assert.fail('Cancelled workflow must not retry')});
  const pending=cancellation.start([{...tasks[0],files:['a.js']},{...tasks[1],files:['b.js']}]);
  await Promise.resolve(); cancellation.cancel(); finish(); await pending;
  assert.equal(started,1,'Stop prevents queued workers from starting');
  assert.equal(reviewed,0,'Stop prevents a finished worker from launching review');
  assert.ok(cancellation.assignments.every(a=>a.blocker==='cancelled'));
  const source=require('node:fs').readFileSync(require.resolve('./main'),'utf8');
  const interrupt=source.slice(source.indexOf('function interruptSession('),source.indexOf("require('./plugins').register"));
  const killed=[]; let coordinatorCancelled=false;
  require('node:vm').runInNewContext(`${interrupt};interruptSession('one',state);`,{
    state:{epoch:0,lanes:{}},requirementCoordinators:new Map([['one',{coordinator:{cancel:()=>{coordinatorCancelled=true;}}}]]),
    procs:new Map([['worker',{sid:'one',sub:'requirement-1'}],['review',{sid:'one',sub:'req-review-1'}],['integration',{sid:'one',sub:'req-integration'}],['other',{sid:'two'}]]),
    killProc:process=>killed.push(process),stopSubs:()=>{},
  });
  assert.equal(killed.length,3,'Stop kills workers, reviewers and integration for its own session');
  assert.equal(coordinatorCancelled,true);
  console.log('Balanced small-model routing and provider failover checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
