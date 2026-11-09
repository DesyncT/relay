import { useRef, useState } from 'react';
import { readBackgroundPrefs } from '../shell/ChatBackground.jsx';

const EFFECTS = [['off','None'],['ascii','ASCII waves'],['liquid','Liquid currents'],['stars','Starfield'],['grid','Perspective grid'],['aurora','Aurora'],['wallpaper','Image'],['video','Looping video']];
function saveVideo(file) {
  return new Promise((resolve,reject) => {
    const req=indexedDB.open('relay-wallpapers',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('media');
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{ const db=req.result,tx=db.transaction('media','readwrite'); file ? tx.objectStore('media').put(file,'video') : tx.objectStore('media').delete('video'); tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}; };
  });
}
export default function BackgroundSettings() {
  const [prefs,setPrefs]=useState(readBackgroundPrefs),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const input=useRef(null);
  const save=patch=>{
    const next={...readBackgroundPrefs(),...patch};
    try { localStorage.setItem('relay.background.v1',JSON.stringify(next));setPrefs(next);dispatchEvent(new Event('relay:background'));setStatus('Background saved'); }
    catch { setStatus('Could not save the background. Try a smaller image.'); }
  };
  const choose=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    const video=/^video\/(mp4|webm)$/.test(file.type),image=/^image\/(png|jpeg|webp|gif)$/.test(file.type);
    if(!video&&!image){setStatus('Choose a PNG, JPEG, WebP, GIF, MP4 or WebM file.');return;}
    if(file.size>(video?50:2)*1024*1024){setStatus(video?'Videos must be under 50 MB.':'Images must be under 2 MB.');return;}
    setBusy(true);
    try {
      if(video){await saveVideo(file);save({effect:'video',hasVideo:true,videoName:file.name,mediaVersion:Date.now()});}
      else {const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file)});save({effect:'wallpaper',image:data,imageName:file.name});}
    } catch {setStatus('Could not save this file. Try another file.');} finally {setBusy(false);}
  };
  return <section className="background-controls" aria-labelledby="backgroundHeading">
    <div className="background-controls-heading"><div><h3 id="backgroundHeading">Conversation background</h3><p>Effects stay behind your messages. Your theme and background are saved separately.</p></div>
      <label><input type="checkbox" checked={prefs.paused} onChange={e=>save({paused:e.target.checked})} /> Pause motion</label></div>
    <div className="background-options" role="group" aria-label="Choose a background">
      {EFFECTS.map(([effect,label])=><button type="button" key={effect} data-effect={effect} aria-pressed={prefs.effect===effect} onClick={()=>save({effect})}>{label}</button>)}
    </div>
    <div className="background-adjustments">
      <label htmlFor="backgroundStrength">Strength <output>{prefs.strength}%</output><input id="backgroundStrength" type="range" min="10" max="70" step="5" value={prefs.strength} onChange={e=>save({strength:Number(e.target.value)})} /></label>
      <label htmlFor="backgroundSpeed">Speed <output>{prefs.speed}%</output><input id="backgroundSpeed" type="range" min="10" max="100" step="5" value={prefs.speed} onChange={e=>save({speed:Number(e.target.value)})} /></label>
      <label><input type="checkbox" checked={prefs.interactive} onChange={e=>save({interactive:e.target.checked})} /> Follow the pointer</label>
    </div>
    <div className="background-file"><span>{prefs.effect==='video' ? prefs.videoName || 'Choose a video loop' : prefs.imageName || (prefs.image ? 'Saved image' : 'Use your own image or video')}</span>
      <button type="button" className="b" disabled={busy} onClick={()=>input.current.click()}>{busy?'Saving file…':'Choose file'}</button>
      <button type="button" className="b ghost" disabled={busy||(!prefs.image&&!prefs.hasVideo)} onClick={async()=>{try {if(prefs.hasVideo) await saveVideo(null);save({effect:'off',image:'',imageName:'',hasVideo:false,videoName:'',mediaVersion:Date.now()});}catch{setStatus('Could not remove the saved video.');}}}>Remove media</button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" onChange={choose} hidden />
    </div>
    <p className="background-save-status" role="status">{status || 'Images up to 2 MB. Video loops up to 50 MB. Reduced motion is respected.'}</p>
  </section>;
}
