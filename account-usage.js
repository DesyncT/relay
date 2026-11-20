// Read-only provider CLI requests for account usage and model discovery.
// No model turn is created, and credentials remain inside the installed CLI.
const {spawn,execFile}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function normalize(result){
  const n=result?.summary?.lifetimeTokens;
  if(!Number.isSafeInteger(n) || n<0)return null;
  const dailyUsageBuckets=Array.isArray(result.dailyUsageBuckets)?[...new Map(result.dailyUsageBuckets.filter(b=>/^\d{4}-\d{2}-\d{2}$/.test(b?.startDate) && Number.isFinite(Date.parse(b.startDate)) && Number.isSafeInteger(b.tokens) && b.tokens>=0).map(b=>[b.startDate,{startDate:b.startDate,tokens:b.tokens}])).values()]:null;
  return {summary:{lifetimeTokens:n},dailyUsageBuckets};
}
function requestCli({command='codex',timeoutMs=15000,spawnProcess=spawn,title, args=['app-server','--listen','stdio://'], initialRequest, endInput=false}, onMessage){
  return new Promise(resolve=>{
    let child,buffer='',done=false;
    const finish=(data,error)=>{
      if(done)return;done=true;clearTimeout(timeout);
      let cleanupTimer;
      const complete=()=>{clearTimeout(cleanupTimer);resolve({data,error});};
      if(!child || child.exitCode!==null){complete();return;}
      child.once('exit',complete);
      cleanupTimer=setTimeout(()=>{
        if(child.exitCode!==null){complete();return;}
        if(process.platform==='win32' && child.pid)execFile('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,timeout:2000},complete);
        else {child.kill();complete();}
      },1000);
      child.stdin.end();
    };
    const timeout=setTimeout(()=>finish(null,'Codex request timed out'),timeoutMs);
    try{child=spawnProcess(command,args,{shell:process.platform==='win32' && !/\.exe$/i.test(command),windowsHide:true,stdio:['pipe','pipe','pipe']});}
    catch{finish(null,'Codex could not start');return;}
    const send=message=>{if(!done)child.stdin.write(JSON.stringify(message)+'\n');};
    child.stdin.on('error',()=>finish(null,'Codex connection closed'));
    child.stderr.resume();
    child.on('error',()=>finish(null,'Codex is unavailable'));
    child.on('close',()=>finish(null,'CLI closed before responding'));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',bytes=>{
      buffer+=bytes;let at;
      while((at=buffer.indexOf('\n'))>=0){
        let m;try{m=JSON.parse(buffer.slice(0,at));}catch{}buffer=buffer.slice(at+1);
        if(!m || done)continue;
        if(!initialRequest && m.id===1 && m.result)send({method:'initialized',params:{}});
        onMessage(m,send,finish);
      }
    });
    send(initialRequest ?? {id:1,method:'initialize',params:{clientInfo:{name:'relay_usage',title,version:'1.0.0'},capabilities:{experimentalApi:true}}});
    if(endInput)child.stdin.end();
  });
}
async function requestAccountUsage(options={}){
  let fingerprint=null;
  const result=await requestCli({...options,title:'Relay Usage'},(m,send,finish)=>{
    if(m.id===1 && m.result)send({id:2,method:'account/read',params:{refreshToken:false}});
    else if(m.id===2 && m.result){
      const account=m.result.account,key=account?.id || account?.accountId || account?.email;
      if(typeof key==='string')fingerprint=crypto.createHash('sha256').update(key.toLowerCase()).digest('hex');
      send({id:3,method:'account/usage/read'});
    }else if(m.id===3 && m.result){const data=normalize(m.result);finish(data,data?null:'Lifetime usage was not reported');}
    else if(m.error && [1,2,3].includes(m.id))finish(null,'Account usage is unavailable for this Codex sign-in');
  });
  return {...result,fingerprint};
}

async function readCodexModels(command){
  const models=new Map(), cursors=new Set();
  let id=1;
  const {data}=await requestCli({command,title:'Relay Model Discovery'},(m,send,finish)=>{
    if(m.id!==id)return;
    if(m.error){finish(null,'Codex models are unavailable');return;}
    if(id===1 && m.result){send({id:++id,method:'model/list',params:{}});return;}
    if(!Array.isArray(m.result?.data)){finish(null,'Invalid Codex model list');return;}
    for(const entry of m.result.data){
      if(typeof entry?.model==='string' && entry.model)models.set(entry.model,entry.displayName || entry.model);
    }
    const cursor=m.result.nextCursor;
    if(!cursor){finish([...models]);return;}
    if(cursors.has(cursor)){finish(null,'Invalid Codex model cursor');return;}
    cursors.add(cursor);
    send({id:++id,method:'model/list',params:{cursor}});
  });
  return data;
}

async function readClaudeModels(command){
  const {data}=await requestCli({
    command,
    args:['-p','--input-format','stream-json','--output-format','stream-json','--verbose'],
    initialRequest:{type:'control_request',request_id:'relay-models',request:{subtype:'initialize'}},
    endInput:true,
  },(message,_send,finish)=>{
    const response=message.response;
    if(message.type!=='control_response' || response?.request_id!=='relay-models')return;
    const entries=response.response?.models;
    if(!Array.isArray(entries)){finish(null,'Claude models are unavailable');return;}
    const models=new Map();
    for(const entry of entries){
      if(typeof entry?.value==='string' && entry.value)models.set(entry.value,entry.displayName || entry.value);
    }
    finish([...models]);
  });
  return data;
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
module.exports={readAccountUsage,requestAccountUsage,readCodexModels,readClaudeModels,normalize};
