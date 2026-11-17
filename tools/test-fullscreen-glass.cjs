// Native check: fullscreen shows the blue theme and clears it on the way out. Also reports how see-through the glass is before and after
// (a red then blue window behind Relay; a big pixel change means see-through).
const {app,BrowserWindow,desktopCapturer,screen}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
process.env.RELAY_TEST_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'relay-fs-glass-'));
require('../main.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 await wait(2500);
 try {
  let win=BrowserWindow.getAllWindows()[0]; if(!win) throw Error('No app window');
  await win.webContents.executeJavaScript(`new Promise(r=>setTimeout(r,800))`);
  const bounds=win.getBounds();
  const backing=new BrowserWindow({...bounds,frame:false,backgroundColor:'#e33535',skipTaskbar:true,show:false,webPreferences:{backgroundThrottling:false}});
  await backing.loadURL('data:text/html,<body style="margin:0;background:%23e33535;height:100vh"></body>');
  const paint=async c=>{backing.setBackgroundColor(c);await backing.webContents.executeJavaScript(`document.body.style.background='${c}'`);backing.webContents.invalidate();await wait(1300);};
  backing.showInactive(); win.setAlwaysOnTop(true); win.show(); win.focus(); await wait(1000);
  const capture=async()=>{
   const d=screen.getDisplayMatching(win.getBounds());
   const src=(await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(d.size.width*d.scaleFactor),height:Math.round(d.size.height*d.scaleFactor)}})).find(s=>s.display_id===String(d.id));
   if(!src) throw Error('Compositor capture unavailable');
   const b=win.getBounds(),sz=src.thumbnail.getSize(),k=sz.width/d.size.width,bm=src.thumbnail.toBitmap(); if(process.env.SHOT_OUT) fs.writeFileSync(process.env.SHOT_OUT,src.thumbnail.toPNG());
   const px=(x,y)=>{const X=Math.round((b.x-d.bounds.x+x)*k),Y=Math.round((b.y-d.bounds.y+y)*k),i=(Y*sz.width+X)*4;return [bm[i+2],bm[i+1],bm[i]];};
   return {sidebar:px(120,480),main:px(700,300)};
  };
  const diff=(a,b)=>a.reduce((n,c,i)=>n+Math.abs(c-b[i]),0);
  const measure=async name=>{
   await paint('#e33535'); const r=await capture(); await paint('#2465df'); const bl=await capture();
   return {name,sidebar:diff(r.sidebar,bl.sidebar),main:diff(r.main,bl.main),red:r.sidebar.join(','),blue:bl.sidebar.join(',')};
  };
  const out=[await measure('before-fullscreen')];
  win.setFullScreen(true); await wait(1800);
  const fs1=await win.webContents.executeJavaScript(`({cls:document.documentElement.classList.contains('is-fullscreen'),bg:getComputedStyle(document.body).backgroundImage.slice(0,40),isFull:true})`);
  const idBefore=win.id;
  win.setFullScreen(false); await wait(3500); // the window is rebuilt on the way out
  const apps=BrowserWindow.getAllWindows().filter(x=>x.id!==backing.id&&!x.isDestroyed());
  win=apps[0];
  const fs2=await win.webContents.executeJavaScript(`new Promise(r=>setTimeout(()=>r({cls:document.documentElement.classList.contains('is-fullscreen'),ready:!!document.querySelector('#root > nav')}),800))`);
  win.setAlwaysOnTop(true); win.show(); win.focus(); await wait(600);
  out.push(await measure('after-fullscreen'));
  const sum=a=>a.split(',').reduce((n,c)=>n+Number(c),0);
  const checks={blueThemeInFullscreen:fs1.cls&&fs1.bg.startsWith('radial-gradient'),oneWindowAfter:apps.length===1,rebuilt:win.id!==idBefore,uiLoadedAfter:fs2.ready&&!fs2.cls,notBlackAfter:sum(out[1].red)+sum(out[1].blue)>60}; // glass see-through is reported, not asserted: DWM sampling depends on window focus
  console.log(JSON.stringify({passed:Object.values(checks).every(Boolean),checks,out}));
  backing.close(); app.exit(Object.values(checks).every(Boolean)?0:1);
 } catch(e){console.error(e.message);app.exit(1)}
});
