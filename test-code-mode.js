const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalPrompt } = require('./normal-code');
const session = {messages:[{from:'user',text:'Fix it',attachments:[{name:'shot.png',path:'C:/shot.png'}]},{from:'claude',text:'First result'},{from:'user',text:'Now improve it'}]};
assert.equal(normalPrompt(session,'claude',true), 'Now improve it');
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
  assert.equal(calls[1].prompt,'Now improve it');
  let failedCalls=0,markedDown=0;
  context.supercodeOn=()=>true;
  context.PROV.claude=async()=>{failedCalls++;throw new Error('Insufficient credits');};
  context.isLimitError=require('./limits').isLimitError; context.markDown=()=>{markedDown++;};
  await assert.rejects(seat('test','claude','coding',()=>'',{}, {routeOverride:{provider:'claude',model:'claude-haiku-5-5',effort:'low'}}),/credits/);
  assert.equal(failedCalls,1,'A pinned worker route must hand failure back instead of retrying the same provider');
  assert.equal(markedDown,1);
  console.log('Native CLI session continuity and pinned-route failure checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
