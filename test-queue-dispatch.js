// Regression: real dequeue -> dispatch -> enqueue must start every user prompt.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('./main'), 'utf8');
const enqueue = source.slice(source.indexOf('function enqueue('), source.indexOf('// Crash/close safety'));
const drain = source.slice(source.indexOf('const drainingUserQueue ='), source.indexOf('const WRAP ='));
const dispatch = source.slice(source.indexOf('function dispatchUser('), source.indexOf("ipcMain.handle('chat:queue'"));
for (const lead of ['claude', 'codex']) {
  const lane = { busy:true, next:null }, rt = { lanes:{[lead]:lane}, turns:4, paused:true, awaiting:false };
  const texts = ['Long queued task\n' + 'Preserve every instruction. '.repeat(600), 'Follow-up queued task'];
  let queue = texts.map((text, i) => ({id:'q'+i,text,files:[],reply:null}));
  const started = [], posted = [], session = {lead,messages:[]};
  const ctx = {quitting:false,restoringSessions:false,room:null,RT:()=>rt,localBusy:()=>lane.busy||!!lane.next,subsOf:()=>[],subLive:()=>false,
    store:{getSession:()=>session},sessOf:()=>session,userQueues:{get:()=>queue,set:(_sid,items)=>{queue=items;}},
    send(){},shareQueue(){},queueUpdate(){},saveResume(){},supercodeOn:()=>false,isSpreader:()=>false,settings:{lead},AGENT_NAMES:['claude','codex'],reqsOf:()=>null,
    post:(_sid,from,text,reply,files)=>{const m={from,text,reply,files};session.messages.push(m);posted.push(text);return m;},
    pump:()=>{started.push(lane.next.trigger);lane.next=null;lane.busy=true;}
  };
  vm.runInNewContext(`${enqueue}\n${drain}\n${dispatch}`,ctx);
  ctx.drainUserQueue('s');assert.equal(queue.length,2,'Do not consume while agent is busy');
  lane.busy=false;ctx.drainUserQueue('s');
  assert.equal(started.length,1,'First queued message must actually start an agent while another message remains');
  assert.equal(started[0].text,texts[0],'Long prompt stays intact');
  assert.equal(rt.paused,false);assert.equal(rt.turns,0);
  ctx.drainUserQueue('s');assert.equal(queue.length,1,'Second prompt waits until first completes');
  lane.busy=false;ctx.drainUserQueue('s');
  assert.deepEqual(started.map(m=>m.text),texts);assert.deepEqual(posted,texts);assert.equal(queue.length,0);
}
console.log('Long queued messages start agents in order without drops or duplicates.');
