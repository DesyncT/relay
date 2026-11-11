const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('./main.js'), 'utf8');
// Queue edits persist changed attachments and allow image-only messages.
let editHandler, editedQueue = [{id:'edit',text:'old',files:[{name:'old.png'}]}];
vm.runInNewContext(source.slice(source.indexOf("ipcMain.handle('chat:queue-edit'"), source.indexOf("ipcMain.handle('chat:queue-delete'")), {
  ipcMain:{handle:(_name,handler)=>{editHandler=handler;}},
  userQueues:{get:()=>editedQueue,set:(_sid,items)=>{editedQueue=items;}},queueUpdate(){}
});
assert.equal(editHandler(null,'session','edit','',[{name:'new.png'}]),true);
assert.equal(editedQueue[0].files[0].name,'new.png');
assert.equal(editedQueue[0].text,'');
assert.throws(()=>editHandler(null,'session','edit','',[]),/Enter a message/);
assert.equal(editHandler(null,'session','edit','text',[]),true);
assert.equal(editedQueue[0].files.length,0);
const enqueue = source.slice(source.indexOf('function enqueue('), source.indexOf('// Crash/close safety'));
const drain = source.slice(source.indexOf('const drainingUserQueue ='), source.indexOf('const WRAP ='));

const lane = { busy:false, next:null }, rt = { lanes:{ claude:lane } };
const queued = [{ text:'queued user request' }], events = [];
const userQueues = { get:() => queued, set:(_sid, items) => { queued.splice(0, queued.length, ...items); } };
const requirementCoordinators = new Map();
const requirementRetries = new Set();
const context = {
  room:null,shareQueue:()=>{},syncBusy:()=>{},quitting:false,restoringSessions:false,easyBusy:new Set(),RT:() => rt, userQueues, requirementCoordinators, requirementRetries, subsOf:() => [], subLive:() => false, saveResume:() => {},
  pump:(_sid, _who) => { const trigger = lane.next.trigger; lane.next = null; lane.busy = true; events.push(trigger.text); },
  send:() => {}, queueUpdate:() => {}, dispatchUser:(_sid, item) => events.push(item.text),
};
vm.runInNewContext(`${enqueue}\n${drain}`, context);

const resume = { text:'resume persisted implementation' };
context.enqueue('session', 'claude', { text:'normal agent followup' });
assert.equal(lane.next, null, 'ordinary follow-up still waits while a user message is queued');
context.enqueue('session', 'claude', resume, null, true, { resume:true });
assert.deepEqual(events, ['resume persisted implementation'], 'resume trigger dispatches before a queued user prompt');
assert.equal(queued.length, 1, 'resume does not consume the persisted queued message');
context.drainUserQueue('session');
assert.equal(queued.length, 1, 'queue remains intact while resumed work is active');
lane.busy = false;
context.drainUserQueue('session');
assert.deepEqual(events, ['resume persisted implementation', 'queued user request']);
assert.equal(queued.length, 0, 'queue drains after resumed work settles');
console.log('resume queue ordering tests passed');

lane.busy=false;queued.push({text:'second prompt waits during provider selection'});
context.enqueue('session','claude',{text:'first selected prompt'},null,true,{user:true});
assert.equal(events.at(-1),'first selected prompt','A pending user dispatch cannot be dropped by a later queued prompt');
assert.equal(queued.length,1);lane.busy=false;context.drainUserQueue('session');assert.equal(queued.length,0);

// A restarted renderer asks for its queue before background restoration completes.
const restoringLane={busy:false,next:null}, startupQueue=[{text:'must wait for restored turn'}], startupEvents=[];
const startupContext={
  room:null,shareQueue:()=>{},syncBusy:()=>{},quitting:false,restoringSessions:true,RT:()=>({lanes:{claude:restoringLane}}),subsOf:()=>[],subLive:()=>false,
  userQueues:{get:()=>startupQueue,set:(_sid,items)=>startupQueue.splice(0,startupQueue.length,...items)},
  send:()=>{},queueUpdate:()=>{},dispatchUser:(_sid,item)=>startupEvents.push(item.text),
};
vm.runInNewContext(drain,startupContext);
startupContext.drainUserQueue('session');assert.equal(startupQueue.length,1,'Startup queue reads must not dispatch before interrupted work is restored');
startupContext.restoringSessions=false;startupContext.quitting=true;
startupContext.drainUserQueue('session');assert.equal(startupQueue.length,1,'Shutdown must not consume queued messages');
startupContext.quitting=false;startupContext.drainUserQueue('session');assert.deepEqual(startupEvents,['must wait for restored turn']);

// Startup must drain idle sessions too, not only the chat that happens to be open.
const resumeSource=source.slice(source.indexOf('async function resumeSessions()'),source.indexOf('// ---- subagents:'));
const restoredEvents=[];
const restartSessions=[{id:'interrupted',legacyWorkflowCleaned:true,resume:{who:['claude'],requests:[]}},{id:'idle',legacyWorkflowCleaned:true,resume:null},{id:'selecting',legacyWorkflowCleaned:true,resume:{who:[],selectionTrigger:{text:'original prompt'}}}];
const restoreContext={enqueueSpreader:(sid,trigger)=>restoredEvents.push('selection:'+sid+':'+trigger.text),restoringSessions:true,store:{listSessions:()=>restartSessions},sessOf:id=>restartSessions.find(s=>s.id===id),RT:()=>({}),AGENT_NAMES:['claude','codex','antigravity'],post:()=>({text:'resume'}),enqueue:sid=>restoredEvents.push('resume:'+sid),drainUserQueue:sid=>{assert.equal(restoreContext.restoringSessions,false);restoredEvents.push('drain:'+sid);}};
vm.runInNewContext(resumeSource,restoreContext);
restoreContext.resumeSessions().then(()=>{
  assert.equal(restoreContext.restoringSessions,false,'Startup barrier must be released');
  assert.deepEqual(restoredEvents,['resume:interrupted','selection:selecting:original prompt','drain:interrupted','drain:idle','drain:selecting']);
  console.log('Restart startup and shutdown queue regressions passed');
}).catch(error=>{console.error(error);process.exitCode=1;});

// Provider selection is real work even before it owns an agent lane.
const saveResumeSource=source.slice(source.indexOf('function saveResume('),source.indexOf('const isRelay ='));
let savedResume;
const saveContext={quitting:false,restoringSessions:false,AGENT_NAMES:['claude'],RT:()=>({lanes:{claude:{busy:false,next:null}},selectionTrigger:{text:'pick then run'}}),store:{updateSession:(_sid,patch)=>{savedResume=patch.resume;}}};
vm.runInNewContext(saveResumeSource,saveContext);saveContext.saveResume('session');
assert.equal(savedResume.selectionTrigger.text,'pick then run');assert.equal(savedResume.who.length,0);

// Real disk round-trip: a queued attachment and reply keep their identity on restart.
const os=require('node:os'),path=require('node:path');
const {createSessions}=require('./sessions');
const diskRoot=fs.mkdtempSync(path.join(os.tmpdir(),'relay-restart-queue-'));
try {
  let disk=createSessions({dataDir:diskRoot,send:()=>{}});
  const project=disk.addProject(diskRoot,'Restart queue'),session=disk.createSession(project.id,'Restart queue');
  const original={id:'q-persisted',text:'Next task',files:[{name:'photo.png',path:path.join(diskRoot,'photo.png')}],reply:{from:'codex',at:123},queuedAt:456};
  disk.updateSession(session.id,{queuedMessages:[original],resume:{who:['codex'],requests:[]}});
  disk=createSessions({dataDir:diskRoot,send:()=>{}});
  assert.deepEqual(disk.getSession(session.id).queuedMessages,[original]);
  assert.deepEqual(disk.getSession(session.id).resume.who,['codex']);
}finally{fs.rmSync(diskRoot,{recursive:true,force:true});}
