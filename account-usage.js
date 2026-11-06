// Read-only Codex account activity through the documented app-server protocol.
// No model turn is created, and credentials remain inside the installed CLI.
const {spawn,execFile}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function normalize(result){
  const n=result?.summary?.lifetimeTokens;
  if(!Number.isSafeInteger(n) || n<0)return null;
  const dailyUsageBuckets=Array.isArray(result.dailyUsageBuckets)?[...new Map(result.dailyUsageBuckets.filter(b=>/^\d{4}-\d{2}-\d{2}$/.test(b?.startDate) && Number.isFinite(Date.parse(b.startDate)) && Number.isSafeInteger(b.tokens) && b.tokens>=0).map(b=>[b.startDate,{startDate:b.startDate,tokens:b.tokens}])).values()]:null;
  return {summary:{lifetimeTokens:n},dailyUsageBuckets};
}
function requestAccountUsage({command='codex',timeoutMs=15000,spawnProcess=spawn}={}){
  return new Promise(resolve=>{
    let child,buffer='',done=false,fingerprint=null;
    const finish=(data,error)=>{
      if(done)return;done=true;clearTimeout(timeout);
      let cleanupTimer;
      const complete=()=>{clearTimeout(cleanupTimer);resolve({data,fingerprint,error});};
      if(!child || child.exitCode!==null){complete();return;}
      child.once('exit',complete);
      cleanupTimer=setTimeout(()=>{
        if(child.exitCode!==null){complete();return;}
        if(process.platform==='win32' && child.pid)execFile('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,timeout:2000},complete);
        else {child.kill();complete();}
      },1000);
      child.stdin.end();
    };
    const timeout=setTimeout(()=>finish(null,'Usage request timed out'),timeoutMs);
    try{child=spawnProcess(command,['app-server','--listen','stdio://'],{shell:process.platform==='win32' && !/\.exe$/i.test(command),windowsHide:true,stdio:['pipe','pipe','pipe']});}
    catch{finish(null,'Codex could not start');return;}
    const send=message=>{if(!done)child.stdin.write(JSON.stringify(message)+'\n');};
    child.stdin.on('error',()=>finish(null,'Codex connection closed'));
    child.stderr.resume();
    child.on('error',()=>finish(null,'Codex is unavailable'));
    child.on('exit',()=>finish(null,'Codex closed before returning usage'));
    child.stdout.on('data',bytes=>{
      buffer+=bytes;let at;
      while((at=buffer.indexOf('\n'))>=0){
        let m;try{m=JSON.parse(buffer.slice(0,at));}catch{}buffer=buffer.slice(at+1);
        if(!m || done)continue;
        if(m.id===1 && m.result){send({method:'initialized',params:{}});send({id:2,method:'account/read',params:{refreshToken:false}});}
        else if(m.id===2 && m.result){
          const account=m.result.account,key=account?.id || account?.accountId || account?.email;
          if(typeof key==='string')fingerprint=crypto.createHash('sha256').update(key.toLowerCase()).digest('hex');
          send({id:3,method:'account/usage/read'});
        }else if(m.id===3 && m.result){const data=normalize(m.result);finish(data,data?null:'Lifetime usage was not reported');}
        else if(m.error && [1,2,3].includes(m.id))finish(null,'Account usage is unavailable for this Codex sign-in');
      }
    });
    send({id:1,method:'initialize',params:{clientInfo:{name:'relay_usage',title:'Relay Usage',version:'1.0.0'},capabilities:{experimentalApi:true}}});
  });
}
async function readAccountUsage({cacheFile,...options}={}){
  const result=await requestAccountUsage(options),now=Date.now();
  if(result.data){
    const report={...result.data,at:now,source:'codex-account',fingerprint:result.fingerprint};
    if(cacheFile && result.fingerprint)try{await fs.mkdir(path.dirname(cacheFile),{recursive:true});await fs.writeFile(cacheFile+'.tmp',JSON.stringify(report),'utf8');await fs.rename(cacheFile+'.tmp',cacheFile);}catch{}
    return report;
  }
  // A cache from a different or unverifiable sign-in must not become this account's total.
  if(cacheFile && result.fingerprint)try{
    const saved=JSON.parse(await fs.readFile(cacheFile,'utf8')),data=normalize(saved);
    if(data && saved.fingerprint===result.fingerprint && Number.isFinite(saved.at))return {...data,at:saved.at,source:'codex-account',cached:true};
  }catch{}
  return null;
}
module.exports={readAccountUsage,requestAccountUsage,normalize};
