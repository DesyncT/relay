'use strict';
const assert = require('node:assert/strict');
const easy = require('./easycode');
async function test() {
  assert.equal(typeof easy.createRequest, 'function');
  let r = easy.createRequest('fix');
  const question = {kind:'question', question:'What is broken?',decisionKey:'target',unresolved:'The affected screen is not specified.', options:['Login','Checkout'], inspection:'Found login and checkout screens.'};
  r = easy.applyDiscovery(r, {...question,recommended:'Checkout'}, r.revision);
  assert.equal(r.question.recommended,'Checkout');
  assert.throws(()=>easy.validateDiscovery({...question,recommended:'Missing'}), /recommend/i);
  const payload = {requestId:r.id, questionId:r.question.id, revision:r.revision, answer:'Login'};
  const answered = easy.applyAnswer(r, payload);
  assert.throws(()=>easy.applyDiscovery(answered,{...question,question:'Which part needs work?',options:['Search','Account']},answered.revision), /answered|repeated/i);
  assert.throws(()=>easy.applyDiscovery(answered,question,answered.revision), /repeated/i);
  assert.throws(()=>easy.applyDiscovery(answered,{...question,question:'Which area should change?',options:['Checkout','Login']},answered.revision), /repeated/i);
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
  const pending=late.start('s','fix');await Promise.resolve();
  await late.action('s',{requestId:current.id,revision:current.revision,action:'cancel'});
  release(question);await pending;assert.equal(current.state,'cancelled');
  let recovery, setupBroken=true, discoveries=0;
  const recoverer=easy.createController({get:()=>recovery,save:(_sid,r)=>{recovery=r;},
    preflight:async()=>{if(setupBroken)throw Error('Git executable unavailable');return {projectKind:'folder',requiresGitRepository:false};},
    discover:async(_sid,prompt)=>{discoveries++;assert.match(prompt,/requiresGitRepository/);return ready;},execute:async()=>assert.fail('Recovery must require confirmation')});
  await recoverer.start('s','Improve the sidebar');assert.equal(recovery.state,'blocked');assert.equal(discoveries,0);
  recovery.history=[{id:'past',text:'Which density?',answer:'Compact',options:['Compact','Roomy']}];
  setupBroken=false;
  await recoverer.action('s',{requestId:recovery.id,revision:recovery.revision,action:'repair'});
  assert.equal(recovery.state,'ready');assert.equal(recovery.history[0].answer,'Compact');assert.equal(recovery.originalRequest,'Improve the sidebar');assert.equal(recovery.lastFailure,'Git executable unavailable');assert.equal(discoveries,1);
  let setupRelease, waitingSetup, lateDiscoveries=0;
  const cancelledSetup=easy.createController({get:()=>waitingSetup,save:(_sid,r)=>{waitingSetup=r;},preflight:()=>new Promise(resolve=>{setupRelease=resolve;}),discover:async()=>{lateDiscoveries++;return ready;},execute:async()=>assert.fail('Cancelled setup cannot run')});
  const setupPending=cancelledSetup.start('s','Fix the page');
  await cancelledSetup.action('s',{requestId:waitingSetup.id,revision:waitingSetup.revision,action:'cancel'});
  setupRelease({projectKind:'folder'});await setupPending;assert.equal(waitingSetup.state,'cancelled');assert.equal(lateDiscoveries,0);
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
  const mainSource=fs.readFileSync(require.resolve('./main'),'utf8');
  const dispatchSource=mainSource.slice(mainSource.indexOf('function dispatchEasycode('),mainSource.indexOf('const drainingUserQueue ='));
  const actions=[];
  let composerRequest={id:'composer-request',revision:3,state:'questioning',question:{id:'q3'}};
  const dispatch=require('node:vm').runInNewContext(dispatchSource+';dispatchEasycode',{
    sessOf:()=>({easycode:composerRequest}),easyAction:(_sid,payload)=>{actions.push(payload);return Promise.resolve();},post:()=>{},
  });
  dispatch('chat','yes',{});assert.equal(actions.at(-1).action,'answer');assert.equal(actions.at(-1).answer,'yes');
  composerRequest={...composerRequest,state:'ready'};
  dispatch('chat','Keep the composerRequest colors',{});assert.equal(actions.at(-1).action,'editSummary');
  dispatch('chat','fix it',{});assert.equal(actions.at(-1).action,'confirm');
  for(const state of ['questioning','ready','running','blocked']) {composerRequest={...composerRequest,state};dispatch('chat','cancel',{});assert.equal(actions.at(-1).action,'cancel');}
  let discoveryOptions;
  const controllerSource=mainSource.slice(mainSource.indexOf('const easyController='),mainSource.indexOf('async function easyAction('));
  const discoveryController=require('node:vm').runInNewContext(controllerSource+';easyController',{
    easycode:{createController:config=>config},saveEasycode(){},easyOwner:()=> 'codex',chatProgress:()=>()=>{},
    settings:{routes:{codex:{other:{model:'gpt-6.1-sol',effort:'low'}}}},
    seatRun:async(_sid,_owner,_phase,_prompt,_trigger,options)=>{discoveryOptions=options;return {text:'{}'};},
  });
  await discoveryController.discover('chat','Inspect');
  assert.equal(discoveryOptions.quiet,false,'EasyCode discovery must publish live model status');
  const echoes=[];let buttonRequest={id:'r',revision:1,state:'questioning',question:{id:'q'}};
  const actionSource=mainSource.slice(mainSource.indexOf('async function easyAction('),mainSource.indexOf("ipcMain.handle('easycode:action'"));
  const buttonAction=require('node:vm').runInNewContext(actionSource+';easyAction',{
    supercodeOn:()=>true,easyBusy:new Set(),sessOf:()=>({easycode:buttonRequest}),
    post:(_sid,from,text)=>echoes.push({from,text}),sendWorking(){},drainUserQueue(){},easyController:{action:async()=>{}},
  });
  const picked={requestId:'r',revision:1,questionId:'q',action:'answer',answer:'Make labels easier to read'};
  await buttonAction('chat',picked);assert.equal(echoes[0].from,'user');assert.equal(echoes[0].text,picked.answer);
  await buttonAction('chat',{...picked,fromComposer:true});assert.equal(echoes.length,1,'Typed answers already appear in chat');
  await buttonAction('chat',{...picked,revision:0});assert.equal(echoes.length,1,'Stale choices cannot add answers to history');
  buttonRequest={...buttonRequest,state:'ready'};
  await buttonAction('chat',{...picked,action:'confirm'});assert.equal(echoes.at(-1).text,'Do it');
  const echoCount=echoes.length;await buttonAction('chat',{...picked,action:'confirm',fromComposer:true});assert.equal(echoes.length,echoCount);
  console.log('EasyCode lifecycle, adaptive discovery, confirmation and verification checks passed');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
