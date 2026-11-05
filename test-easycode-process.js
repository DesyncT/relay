const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./main'),'utf8');
const code=source.slice(source.indexOf('function run(label,'),source.indexOf('// Live status:'));
const procs=new Map();
const run=vm.runInNewContext(`${code};run`,{spawn:require('node:child_process').spawn,settings:{},HOME:process.cwd(),process,procs,nextId:1,send:()=>{},procList:()=>[],setTimeout,clearTimeout,killProc:p=>process.platform==='win32'?require('node:child_process').execFile('taskkill',['/pid',String(p.child.pid),'/T','/F']):p.child.kill(),cleanErrorMessage:s=>s});
(async()=>{
  const silent=await run('check','node -e "process.exit(0)"',[],'',null,{commandEvidence:'silent check'});
  assert.equal(silent.exitCode,0);assert.equal(silent.command,'silent check');
  const failure=await run('check','node -e "process.exit(7)"',[],'',null,{commandEvidence:'failed check'});
  assert.equal(failure.exitCode,7);
  const started=Date.now();
  const timed=await run('check','node -e "setTimeout(()=>{},10000)"',[],'',null,{commandEvidence:'timeout check',timeoutMs:30});
  assert.ok(Date.now()-started<4000,'Hung verification commands are bounded');assert.notEqual(timed.exitCode,0);
  console.log('EasyCode command exit, silent success and timeout evidence checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
