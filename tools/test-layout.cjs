// Full renderer layout tour. Run after build: electron tools/test-layout.cjs
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const root=path.join(__dirname,'..'), out=fs.mkdtempSync(path.join(os.tmpdir(),'relay-layout-'));
app.setPath('userData',path.join(out,'profile'));
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/react.json')));
fx['panel:files:list']=[]; fx['panel:changes']={files:[]};
fx['chat:history']=Array.from({length:300},(_,i)=>({from:i%2?'claude':'user',text:`Message ${i}\nA representative long conversation with code, decisions and updates.`,at:Date.now()-300000+i*1000}));
fx.__storage={'relay.background.v1':{effect:'ascii',strength:80,speed:50,interactive:true}};
const fixture=path.join(out,'fixtures.json');fs.writeFileSync(fixture,JSON.stringify(fx));process.env.RELAY_FIXTURES=fixture;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{preload:path.join(__dirname,'harness-preload.cjs'),sandbox:false,contextIsolation:true,backgroundThrottling:false,offscreen:true}});
 const errors=[];win.webContents.on('console-message',(_e,level,msg)=>{if(level>=2&&!msg.includes('Electron Security Warning'))errors.push(msg)});
 await win.loadFile(path.join(root,'renderer-dist/index.html'));await sleep(1500);
 const run=code=>win.webContents.executeJavaScript(code);
 const responsiveness=[];
 const check=async label=>{
  await sleep(900);
  const metrics=await run(`(()=>{const main=document.querySelector('main').getBoundingClientRect();const input=document.querySelector('#input');return {overflow:document.documentElement.scrollWidth>innerWidth,mainRight:main.right,width:innerWidth,filter:getComputedStyle(document.querySelector('main>section.on')).filter,composer:input&&getComputedStyle(document.querySelector('#chat')).display!=='none'?{height:input.getBoundingClientRect().height,width:input.getBoundingClientRect().width}:null}})()`);
  assert.equal(metrics.overflow,false,label+' viewport overflow');assert.ok(metrics.mainRight<=metrics.width+1,label+' main overflow');assert.equal(metrics.filter,'none',label+' page filter');
  if(metrics.composer)assert.ok(metrics.composer.height<=180,label+' composer too tall');
  fs.writeFileSync(path.join(out,label+'.png'),(await win.webContents.capturePage()).toPNG());
 };
 for(const size of [[1280,800],[860,760]]){
  win.setSize(...size);const prefix=size[0]+'-';
  await run(`document.querySelector('.sb-row[data-id="s1"]').click()`);await sleep(300);
  await run(`localStorage.setItem('relay.background.v1',JSON.stringify({effect:'ascii',strength:80,speed:50,interactive:true}));dispatchEvent(new Event('relay:background'))`);
  await check(prefix+'chat');
  const latency=await run(`(async()=>{const el=document.querySelector('#input'),set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;const times=[];for(let i=0;i<8;i++){const start=performance.now();set.call(el,'Draft '+i);el.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(requestAnimationFrame);times.push(performance.now()-start)}return {maxFrameMs:Math.round(Math.max(...times)),draft:el.value,hidden:document.hidden}})()`);
  assert.equal(latency.draft,'Draft 7');assert.ok(latency.maxFrameMs<500,'Input frame stalled');responsiveness.push({width:size[0],...latency});
  // Reproduce the reported dark-blue theme + ASCII background, including a live response.
  await run(`(()=>{const tokens={deep:'#11141e',bg:'#171b29',card:'#1d2333',raised:'#2a3247',text:'#edf0fa','text-2':'#bcc5db',muted:'#a0aecb',line:'#343e56','line-strong':'#4c5c7b',claude:'#b4a6e8',codex:'#b9d5e4'};for(const [k,v] of Object.entries(tokens))document.documentElement.style.setProperty('--'+k,v);__emit('chat:msg',{sessionId:'s1',from:'codex',text:'Live response: text must stay fully readable with an ASCII background.',at:Date.now()})})()`);
  const readability=await run(`(()=>{const row=[...document.querySelectorAll('#log .msg')].at(-1),text=row.querySelector('.body');let opacity=1;for(let e=text;e;e=e.parentElement)opacity*=Number(getComputedStyle(e).opacity);const c=getComputedStyle(text),r=getComputedStyle(row);return {opacity,color:c.color,rowBackground:r.backgroundColor,themeBackground:getComputedStyle(document.querySelector('#log')).backgroundColor,backgroundParent:document.querySelector('#chatBackground')?.parentElement.id}})()`);
  assert.equal(readability.opacity,1,'Message text faded');assert.equal(readability.color,'rgb(237, 240, 250)','Message did not use full-contrast Midnight text');assert.equal(await run(`getComputedStyle([...document.querySelectorAll('#log .msg .body')].at(-1)).borderTopWidth`),'0px','Message inherits a panel border');assert.ok(readability.backgroundParent===undefined || readability.backgroundParent==='');
  await check(prefix+'midnight-readable');
  const bg=await run(`(()=>{const b=document.querySelector('#chatBackground');return {parent:b?.parentElement.id,z:b&&getComputedStyle(b).zIndex,canvasWidth:b?.querySelector('canvas').width}})()`);
  assert.equal(bg.parent,'');assert.equal(bg.z,'-1');assert.ok(bg.canvasWidth<=960);
  const stable=await run(`(async()=>{const el=document.querySelector('#log');el.scrollTop=0;__emit('chat:msg',{sessionId:'s1',from:'codex',text:'New message while reading',at:Date.now()});await new Promise(r=>setTimeout(r,60));return el.scrollTop})()`);assert.equal(stable,0,'Reading position changed');
  for(const tab of ['usage','agents','rules','settings']){
   await run(`document.querySelector('nav [data-tab="${tab}"]').click()`);await check(prefix+tab);
   assert.equal(await run(`document.querySelector('#chatBackground')===null`),true,'Background retained outside chat');
   if(tab==='usage'){
    const totals=await run(`[...document.querySelectorAll('.provider-lifetime')].map(e=>e.textContent)`);assert.equal(totals.length,2);assert.ok(totals[1].includes('262.34'),'Codex account-only estimate missing');
    await run(`document.querySelector('main').scrollTop=document.querySelector('main').scrollHeight`);await check(prefix+'usage-bottom');
   }
   if(tab==='rules'){await run(`[...document.querySelectorAll('.rules-top button')].find(b=>b.textContent==='Skills').click()`);await check(prefix+'skills');}
   if(tab==='settings'){await run(`[...document.querySelectorAll('#tabpair button')].find(b=>b.textContent==='Themes').click()`);await check(prefix+'themes');for(const theme of ['midnight','paper','graphite']) {await run(`document.querySelector('.theme-choice[data-theme="${theme}"]').click()`);await sleep(80);assert.equal(await run(`document.documentElement.dataset.relayTheme`),theme);}}
  }
  await run(`document.querySelector('.sb-row[data-id="s1"]').click()`);await sleep(300);assert.equal(await run(`document.querySelector('#input').value`),'Draft 7','Draft lost while navigating');
 }
 assert.deepEqual(errors,[],'Renderer errors');console.log(JSON.stringify({passed:true,sizes:2,screens:7,messages:300,screenshots:out,responsiveness,errors}));app.exit(0);
}).catch(e=>{console.error(e);app.exit(1)});

