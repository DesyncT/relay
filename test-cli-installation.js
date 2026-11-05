const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
let installed=true,version='codex desktop 1.0',statusCalls=0;
const context={module:{exports:{}},exports:{},process,Buffer,fetch:async()=>({ok:false}),AbortSignal,require(name){
 if(name==='child_process')return {execFile(cmd,args,options,cb){
  if(typeof args==='object'&&!Array.isArray(args)){cb=options;options=args;args=[];}
  if(cmd==='where'||cmd==='which')return cb(installed?null:Error('missing'),'');
  if(cmd.includes('--version'))return cb(null,version,'');
  statusCalls++;return cb(null,'Logged in using ChatGPT','');
 }};
 return require(name);
}};
vm.runInNewContext(fs.readFileSync('models.js','utf8'),context);
(async()=>{
 const models=context.module.exports;
 assert.equal(await models.cliInstalled('codex','codex'),false,'A desktop executable is not the Codex CLI');
 const status=await models.authStatus({cmds:()=>({claude:'missing-claude',codex:'codex',antigravity:'missing-antigravity'})});
 assert.equal(status.codex.installed,false);assert.equal(status.codex.loggedIn,false);
 version='codex-cli 0.99.0';assert.equal(await models.cliInstalled('codex','codex'),true);
 installed=false;await assert.rejects(models.requireCli('codex','codex'),/Codex CLI is not installed.*Settings.*Install/);
 const source=fs.readFileSync('main.js','utf8');
 const wrappers=source.slice(source.indexOf('const runClaude ='),source.indexOf('const PROV ='));
 let executions=0;
 const gated=vm.runInNewContext(wrappers+';codexRun',{claudeRun:async()=>{},codexRun:async()=>{executions++},models,settings:{codexCmd:'codex'},tracked:(_p,_s,r)=>r});
 await assert.rejects(gated('hello',[],{}),/Install CLI/);assert.equal(executions,0,'A missing CLI must not start a chat run');
 let resolveCheck;const checking=new Promise(r=>resolveCheck=r),state={epoch:1};
 const stopped=vm.runInNewContext(wrappers+';codexRun',{claudeRun:async()=>{},codexRun:async()=>{executions++},models:{requireCli:()=>checking},settings:{codexCmd:'codex'},RT:()=>state,tracked:(_p,_s,r)=>r});
 const pending=stopped('hello',[],{sid:'s'});state.epoch++;resolveCheck();
 await assert.rejects(pending,e=>e.cancelled===true);assert.equal(executions,0,'Stop during preflight must prevent launch');
 await assert.rejects(models.requireCli('codex','codex'),e=>e.provider==='codex');
 const failure=require('./turn').formatFailureInfo('Codex CLI is not installed or could not be started. Open Settings and click Install CLI for Codex, then try again.','codex');
 assert.equal(failure.action,'install');
 console.log('CLI installation and sign-in separation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
