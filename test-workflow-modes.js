const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('main.js','utf8');
const block=source.slice(source.indexOf('const easyModeOn ='),source.indexOf('const SPREAD_ASK ='));
const mode=vm.runInNewContext(block+';({easyModeOn,isSpreader})',{sessOf:()=>({easyMode:false,lead:'spreader'}),settings:{lead:'spreader'}});
assert.equal(mode.easyModeOn('s'),false);assert.equal(mode.isSpreader('s'),false,'Code never spreads across providers');
assert.match(fs.readFileSync('titlebar.js','utf8'),/EasyCode/);
console.log('Code and EasyCode mode separation passed');

const {todos}=require('./activity');
assert.deepEqual(todos({type:'item.completed',item:{type:'agent_message',text:'- [x] Create hello.txt\n- [ ] Verify content'}}),[{t:'Create hello.txt',done:true,now:false},{t:'Verify content',done:false,now:false}]);

const os=require('os'),path=require('path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-mode-store-'));
try {
 const {createSessions}=require('./sessions');let store=createSessions({dataDir:root});
 const project=store.addProject(root,'Fixture'),session=store.createSession(project.id,'Modes');
 store.updateSession(session.id,{easyMode:false,spreadLast:'codex',nativeCodeVersion:1,cli:{codex:'native-session'}});
 store=createSessions({dataDir:root});const saved=store.getSession(session.id);
 assert.equal(saved.easyMode,false);assert.equal(saved.spreadLast,'codex');assert.equal(saved.nativeCodeVersion,1);assert.equal(saved.cli.codex,'native-session');
} finally {assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});}

const routing=require('./routing');assert.deepEqual(routing.mergeRoutes(routing.DEFAULT_ROUTES),routing.DEFAULT_ROUTES,'Default models must survive saving unchanged');

(async()=>{
 const helper=source.slice(source.indexOf('function enqueueSpreader('),source.indexOf('function dispatchUser('));
 let resolve;const pending=new Promise(r=>resolve=r),state={epoch:1},queued=[];
 const enqueueSpread=vm.runInNewContext(helper+';enqueueSpreader',{quitting:false,saveResume(){},RT:()=>state,spreadTo:()=>pending,enqueue:(...a)=>queued.push(a),sendWorking(){},drainUserQueue(){},post(){},formatFailureInfo(){}});
 const work=enqueueSpread('s',{});assert.equal(state.selecting,true,'Selecting quota locks the chat');
 state.epoch++;state.selecting=false;resolve('codex');await work;assert.equal(queued.length,0,'Stop cancels pending selection');
 await enqueueSpread('s',{});assert.equal(queued.length,1);assert.equal(state.selecting,false);
 console.log('Spreader pending-selection cancellation passed');
})().catch(e=>{console.error(e);process.exitCode=1});
