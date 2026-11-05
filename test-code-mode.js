const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalPrompt } = require('./normal-code');
const session = {messages:[{from:'user',text:'Fix it',attachments:[{name:'shot.png',path:'C:/shot.png'}]},{from:'claude',text:'First result'},{from:'user',text:'Now improve it'}]};
assert.ok(normalPrompt(session,'claude',true).endsWith('Now improve it'));
assert.match(normalPrompt(session,'claude',true), /progress updates/);
assert.match(normalPrompt(session,'claude',false), /C:\/shot.png/);
assert.match(normalPrompt(session,'claude',false), /First result/);
assert.doesNotMatch(normalPrompt(session,'claude',false), /requirements interviewer|Always use|\[pass|Shared instructions/);
const source = fs.readFileSync(require.resolve('./main'),'utf8');
const dispatch = source.slice(source.indexOf('const WRAP ='),source.indexOf("ipcMain.handle('chat:queue',"));
for (const text of ['Fix this bug','What is React?','wrap up','[req: literal text]']) {
  const queued = [], posted = [], state = {};
  vm.runInNewContext(`${dispatch}; dispatchUser('test',{text:input});`, {
    input:text, store:{getSession:()=>({lead:'codex'})}, RT:()=>state, supercodeOn:()=>false,
    post:(_sid,from,text)=>{const message={from,text};posted.push(message);return message;},
    AGENT_NAMES:['claude','codex'], settings:{lead:'claude'}, enqueue:(...args)=>queued.push(args),
    setReqs:()=>assert.fail('Code mode must not create a requirements workflow'),
  });
  assert.equal(queued.length,1);
  assert.equal(queued[0][1],'codex');
  assert.equal(posted.length,1);
}
console.log('Native Code prompt and dispatch checks passed');
const seatSource=source.slice(source.indexOf('async function seatRun('),source.indexOf('// Forced skills/plugins'));
(async()=>{
  let current={messages:[{from:'user',text:'Fix it'}],cli:{codex:'old-requirements-session'}};
  const calls=[];
  const context={
    supercodeOn:()=>false,settings:{codexArgs:''},routeFor:()=>({extra:[],meta:{}}),
    argsFor:()=>[],resolved:()=>({}),models:{resolve:()=>null},sessOf:()=>current,
    store:{updateSession:(_sid,patch)=>{current={...current,...patch};}},ctxFor:()=>({}),
    PROV:{codex:async(prompt,_trigger,options)=>{calls.push({prompt,...options});options.onSession('native-session');return {text:'Done'};}},
  };
  const seat=vm.runInNewContext(`${seatSource};seatRun`,context);
  const prompt=(_stand,state)=>normalPrompt(current,'codex',state.resumed);
  await seat('test','codex','coding',prompt,{});
  current.messages.push({from:'codex',text:'Done'},{from:'user',text:'Now improve it'});
  await seat('test','codex','coding',prompt,{});
  assert.equal(calls[0].resumeId,undefined,'Old requirement-injected CLI sessions are replaced once');
  assert.equal(calls[0].nativeCode,true);
  assert.equal(calls[1].resumeId,'native-session','Later Code messages continue the native CLI conversation');
  assert.ok(calls[1].prompt.endsWith('Now improve it'));
  let failedCalls=0,markedDown=0;
  context.supercodeOn=()=>true;
  context.PROV.claude=async()=>{failedCalls++;throw new Error('Insufficient credits');};
  context.isLimitError=require('./limits').isLimitError; context.markDown=()=>{markedDown++;};
  await assert.rejects(seat('test','claude','coding',()=>'',{}, {routeOverride:{provider:'claude',model:'claude-haiku-5-5',effort:'low'}}),/credits/);
  assert.equal(failedCalls,1,'A pinned worker route must hand failure back instead of retrying the same provider');
  assert.equal(markedDown,1);
  console.log('Native CLI session continuity and pinned-route failure checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

// Exercise both actual provider event parsers: updates arrive before completion,
// private reasoning stays private, and the final answer is not duplicated.
async function checkProgress(provider) {
  const updates=[];
  let release;
  const finished=new Promise(resolve=>{release=resolve;});
  const context={
    createProgressStream:require('./normal-code').createProgressStream,
    settings:{claudeCmd:'claude',codexCmd:'codex'},process:{env:{}},DATA:'.',HOME:'.',
    require:()=>({sync:()=>''}),q:x=>x,providerArgs:x=>x,splitArgs:()=>[],
    modelFromArgs:()=> 'test',readText:()=>'',path:require('path'),json:JSON.parse,
    activity:{claude(){},codex(){},clean:x=>x},setStatusFor(){},toolStatus:()=>'',base:()=>'',
    mkUsage:()=>({}),cleanErrorMessage:x=>x,
    run:async(_label,_cmd,_args,_prompt,onLine)=>{
      const emit=e=>onLine(JSON.stringify(e));
      if(provider==='codex') {
        emit({type:'item.completed',item:{type:'reasoning',text:'private reasoning'}});
        emit({type:'item.completed',item:{type:'agent_message',text:'I found the cause.'}});
        emit({type:'item.started',item:{type:'command_execution',command:'node test.js'}});
      } else {
        emit({type:'assistant',message:{content:[{type:'thinking',thinking:'private reasoning'},{type:'text',text:'I found the cause.'},{type:'tool_use',name:'Bash',input:{}}]}});
      }
      assert.deepEqual(updates,['I found the cause.'],'Progress must be visible while a tool is running');
      await finished;
      if(provider==='codex') emit({type:'item.completed',item:{type:'agent_message',text:'Done, tests passed.'}});
      else {
        emit({type:'assistant',message:{content:[{type:'text',text:'Done, tests passed.'}]}});
        emit({type:'result',result:'Done, tests passed.'});
      }
    },
  };
  const parsers=source.slice(source.indexOf('function claudeRun('),source.indexOf('let proxyProcess'));
  const funcs=vm.runInNewContext(parsers+';({claudeRun,codexRun})',context);
  const options={nativeCode:true,onProgress:text=>updates.push(text)};
  const promise=provider==='codex'?funcs.codexRun('Fix it',[],options):funcs.claudeRun('test','claude','Fix it',options);
  release();
  const result=await promise;
  assert.equal(result.text,'Done, tests passed.');
  assert.deepEqual(updates,['I found the cause.'],'Final answer is posted separately, once');
}
(async()=>{await checkProgress('codex');await checkProgress('claude');console.log('Live Code progress checks passed');})().catch(error=>{console.error(error);process.exitCode=1;});

// Persisted progress uses the real task/model, and stopped work stays quiet.
{
  let epoch=1, active=true;
  const messages=[];
  const helper=source.slice(source.indexOf('function chatProgress('),source.indexOf('const ref ='));
  const makeProgress=vm.runInNewContext(helper+';chatProgress',{RT:()=>({epoch}),post:(...args)=>messages.push(args)});
  const report=makeProgress('session','codex','Review task 2',{model:'gpt-6-luna',effort:'low'},()=>active);
  report('I found a missing error state.');
  assert.equal(messages[0][1],'codex');assert.equal(messages[0][5].sub,'Review task 2');assert.equal(messages[0][5].route.model,'gpt-6-luna');
  active=false;report('stopped');assert.equal(messages.length,1);
  active=true;epoch++;report('stale');assert.equal(messages.length,1);
  console.log('Labeled subagent progress and cancellation checks passed');
}
