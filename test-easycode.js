'use strict';
const assert = require('node:assert/strict');
const easy = require('./easycode');
async function test() {
  assert.equal(typeof easy.createRequest, 'function');
  let r = easy.createRequest('fix');
  const question = {kind:'question', question:'What is broken?', options:['Login','Checkout'], inspection:'Found login and checkout screens.'};
  r = easy.applyDiscovery(r, question, r.revision);
  const payload = {requestId:r.id, questionId:r.question.id, revision:r.revision, answer:'Login'};
  const answered = easy.applyAnswer(r, payload);
  assert.equal(answered.history[0].answer, 'Login');
  assert.throws(() => easy.applyAnswer(answered, payload), /stale/i);
  assert.throws(() => easy.confirmRequest(answered, answered.revision), /ready/i);
  const ready = {kind:'ready', summary:'Fix login redirect', preserve:['Checkout'], files:['login.js'], checks:['npm test'], acceptance:['Login reaches the dashboard']};
  r = easy.applyDiscovery(answered, ready, answered.revision);
  assert.throws(() => easy.confirmRequest(r, r.revision-1), /revision/i);
  const running = easy.confirmRequest(r, r.revision);
  assert.equal(running.state,'running');
  assert.throws(() => easy.confirmRequest(running,running.revision), /ready/i);
  assert.equal(easy.recoverRequest(running).state,'blocked');
  assert.equal(easy.recoverRequest(r).state,'ready');
  const cancelled = easy.cancelRequest(r);
  assert.throws(() => easy.applyDiscovery(cancelled,ready,cancelled.revision), /stale/i);
  assert.throws(() => easy.validateDiscovery({...ready, files:['../secret']}), /scope/i);
  assert.throws(() => easy.validateDiscovery({...ready, checks:[]}), /check/i);
  assert.throws(() => easy.validateDiscovery({...question,options:['Same','Same']}), /option/i);
  assert.equal(easy.finishRequest(running,{checks:[],review:'PASS'}).state,'blocked');
  assert.equal(easy.finishRequest(running,{checks:[{command:'npm test',exitCode:1}],review:'PASS'}).state,'blocked');
  assert.equal(easy.finishRequest(running,{checks:[{command:'npm test',exitCode:0}],review:'PASS',integrated:true}).state,'succeeded');
  const edited=easy.editRequest(r,0);
  assert.equal(edited.question.text,'What is broken?'); assert.equal(edited.history.length,0);
  let current, calls=0, executions=0, contexts=[];
  const controller=easy.createController({get:()=>current,save:(_sid,value)=>{current=value;},
    discover:async (_sid,context)=>{calls++;contexts.push(context);return calls===1?question:ready;},
    execute:async()=>{executions++;return {checks:[{command:'npm test',exitCode:0}],review:'PASS',integrated:true};}});
  await controller.start('s','fix'); assert.equal(executions,0);
  await controller.action('s',{requestId:current.id,revision:current.revision,questionId:current.question.id,action:'answer',answer:'Login'});
  assert.match(contexts[1],/Login/); assert.match(contexts[1],/fix/);
  const confirm={requestId:current.id,revision:current.revision,action:'confirm'};
  await Promise.allSettled([controller.action('s',confirm),controller.action('s',confirm)]);
  assert.equal(executions,1);assert.equal(current.state,'succeeded');assert.equal(calls,2);
  let malformed=0;
  const broken=easy.createController({get:()=>current,save:(_s,r)=>{current=r;},discover:async()=>{malformed++;return {kind:'wrong'};},execute:async()=>{throw Error('must not execute');}});
  await broken.start('s','fix');assert.equal(malformed,2);assert.equal(current.state,'blocked');
  let release;
  const late=easy.createController({get:()=>current,save:(_s,r)=>{current=r;},discover:()=>new Promise(resolve=>{release=resolve;}),execute:async()=>{}});
  const pending=late.start('s','fix');
  await late.action('s',{requestId:current.id,revision:current.revision,action:'cancel'});
  release(question);await pending;assert.equal(current.state,'cancelled');
  const branchScopes=[];
  for(const branch of ['Login','Checkout']) {
    let state;
    const branching=easy.createController({get:()=>state,save:(_s,r)=>{state=r;},execute:async()=>assert.fail('Discovery cannot execute'),
      discover:async(_s,prompt)=>prompt.includes('"answer"')?{...ready,summary:prompt.includes('Checkout')?'Fix checkout payment':'Fix login redirect'}:question});
    await branching.start('s','fix');
    await branching.action('s',{requestId:state.id,revision:state.revision,questionId:state.question.id,action:'answer',answer:branch});
    branchScopes.push(state.scope.summary);
  }
  assert.deepEqual(branchScopes,['Fix login redirect','Fix checkout payment']);
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'easycode-session-'));
  try {
    let sessions=require('./sessions').createSessions({dataDir});
    const project=sessions.addProject(process.cwd());const session=sessions.createSession(project.id,'Fix login');
    sessions.updateSession(session.id,{easycode:running,easycodeArchive:[{worker:{workspace:{path:'retained'}}}]});
    sessions=require('./sessions').createSessions({dataDir});
    assert.equal(sessions.getSession(session.id).easycode.state,'blocked');
    assert.equal(sessions.getSession(session.id).easycodeArchive[0].worker.workspace.path,'retained');
    sessions.updateSession(session.id,{easycode:r});
    sessions=require('./sessions').createSessions({dataDir});assert.equal(sessions.getSession(session.id).easycode.state,'ready');
  } finally {fs.rmSync(dataDir,{recursive:true,force:true});}
  console.log('EasyCode lifecycle, adaptive discovery, confirmation and verification checks passed');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
