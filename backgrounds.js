// Local, decorative chat backgrounds. Never receives pointer or keyboard input.
window.ChatBackgrounds = (() => {
  const key = 'relay.background.v1';
  const effects = {off:'None',ascii:'ASCII waves',liquid:'Liquid currents',stars:'Starfield',grid:'Perspective grid',aurora:'Aurora',wallpaper:'Image',video:'Looping video'};
  let mounted = false;
  function mount() {
    if (mounted) return; mounted = true;
    const host = document.querySelector('.ch-main'), page = document.querySelector('#themes');
    if (!host || !page) return;
    let prefs = {effect:'off',strength:35,speed:50,paused:false,interactive:true,image:'',hasVideo:false,videoName:''};
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved && Object.hasOwn(effects,saved.effect)) prefs = {...prefs,...saved};
    } catch {}
    prefs.strength = Math.max(10,Math.min(70,Number(prefs.strength)||35));
    prefs.speed = Math.max(10,Math.min(100,Number(prefs.speed)||50));
    prefs.paused = prefs.paused === true;
    if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(prefs.image)) prefs.image = '';
    const layer = document.createElement('div'); layer.id = 'chatBackground'; layer.setAttribute('aria-hidden','true'); layer.inert = true;
    const canvas = document.createElement('canvas'), wallpaper = document.createElement('img'), video = document.createElement('video');
    video.loop=true;video.muted=true;video.playsInline=true;video.preload='metadata';
    let videoUrl='';
    wallpaper.alt = ''; layer.append(wallpaper,video,canvas); host.prepend(layer);
    const context = canvas.getContext('2d');
    const panel = document.createElement('div'); panel.className = 'background-settings';
    panel.setAttribute('role','region');panel.setAttribute('aria-labelledby','backgroundHeading');
    panel.innerHTML = `<div class="background-heading"><div><h3 id="backgroundHeading">Your chat, your atmosphere</h3><p>Set the scene behind your conversations.</p></div><label class="background-pause"><input id="backgroundPaused" type="checkbox"> Pause motion</label></div>
      <div class="background-studio"><div class="background-preview" aria-label="Live background preview"><canvas id="backgroundPreview" width="560" height="280" aria-hidden="true"></canvas><div class="background-preview-copy" aria-hidden="true"><span>Relay / preview</span><strong>A little atmosphere.<br>Room to focus.</strong><span id="backgroundPreviewHint">Move your pointer to explore</span></div></div>
      <div class="background-tuning"><label class="background-select-label" hidden>Background<select id="backgroundEffect"></select></label>
      <label class="background-slider"><span>Strength<output id="backgroundStrengthValue"></output></span><input id="backgroundStrength" type="range" min="10" max="70" step="5"></label>
      <label class="background-slider"><span>Speed<output id="backgroundSpeedValue"></output></span><input id="backgroundSpeed" type="range" min="10" max="100" step="5"></label>
      <label class="background-interact"><input id="backgroundInteractive" type="checkbox"> Follow the pointer</label><p class="background-note">Click empty space for a ripple. Typing and message controls stay responsive.</p></div></div>
      <div class="background-presets" role="group" aria-label="Choose a background"></div>
      <div class="background-media"><div><strong>Your own scene</strong><p id="backgroundMediaName">Add an image or a seamless video loop.</p></div><button type="button" class="b" id="backgroundChoose">Choose file</button><button type="button" class="b ghost" id="backgroundRemove">Remove</button><input id="backgroundFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" hidden></div>
      <p class="background-note">Images up to 2 MB. MP4 or WebM up to 50 MB, looped and muted. Saved on this device. Motion pauses when hidden or reduced motion is enabled.</p><p id="backgroundStatus" role="status"></p>`;
    page.querySelector('.page-head').after(panel);
    const $ = id => panel.querySelector('#'+id);
    const select = $('backgroundEffect');
    for (const [value,label] of Object.entries(effects)) select.add(new Option(label,value));
    for(const [value,label] of Object.entries(effects)) {
      const button=document.createElement('button');button.type='button';button.className='background-preset';button.dataset.effect=value;
      button.innerHTML='<span class="background-swatch swatch-'+value+'" aria-hidden="true"></span><span>'+label+'</span>';
      button.onclick=()=>{select.value=value;select.onchange();};panel.querySelector('.background-presets').append(button);
    }
    const preview=$('backgroundPreview'), previewContext=preview.getContext('2d'), previewHost=panel.querySelector('.background-preview');
    let pointer={x:.5,y:.5}, ripple=null;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, last = 0, time = 0, width = 0, height = 0;
    let accent, secondary;
    const stillWallpaper = () => prefs.paused || motion.matches || document.hidden || !document.querySelector('#chat').classList.contains('on');
    function colors() {
      const style = getComputedStyle(document.documentElement);
      accent = style.getPropertyValue('--claude').trim(); secondary = style.getPropertyValue('--codex').trim();
    }
    const visible = () => document.querySelector('#chat').classList.contains('on') || page.classList.contains('on');
    function running() { return !prefs.paused && !motion.matches && !document.hidden && visible() && !['off','wallpaper'].includes(prefs.effect); }
    function draw(c,width,height,t) {
      if (!c || !width || !height) return;
      const px=(prefs.interactive && !prefs.paused && !motion.matches)?pointer.x-.5:0, py=(prefs.interactive && !prefs.paused && !motion.matches)?pointer.y-.5:0;
      c.clearRect(0,0,width,height); c.globalAlpha=1; c.fillStyle=accent; c.strokeStyle=accent;
      if (prefs.effect === 'wallpaper' || prefs.effect === 'video') {
        const media=prefs.effect==='video'?video:wallpaper;const mw=media.videoWidth || media.naturalWidth, mh=media.videoHeight || media.naturalHeight;
        if (mw && mh) {
          const scale=Math.max(width/mw,height/mh);
          const w=mw*scale,h=mh*scale;
          c.drawImage(media,(width-w)/2,(height-h)/2,w,h);
        }
      } else if (prefs.effect === 'ascii') {
        c.font='12px monospace'; const glyphs=' .:;+=*#%@';
        for(let y=0;y<height;y+=22) for(let x=0;x<width;x+=16) {
          const v=(Math.sin(x*.013+t+px*3)+Math.cos(y*.019-t*.7+py*3)+Math.sin((x+y)*.008+t*.4)+3)/6;
          c.globalAlpha=.15+v*.75; c.fillText(glyphs[Math.min(9,Math.floor(v*10))],x,y);
        }
      } else if (prefs.effect === 'liquid' || prefs.effect === 'aurora') {
        for(let i=0;i<5;i++) {
          const x=width*(.5+.45*Math.sin(t*.23+i*1.7)+px*.25), y=height*(.5+.4*Math.cos(t*.19+i*2.3)+py*.2);
          const r=Math.max(width,height)*(prefs.effect==='aurora'?.65:.38);
          const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,i%2?secondary:accent);g.addColorStop(1,'transparent');
          c.globalAlpha=prefs.effect==='aurora'?.35:.55;c.fillStyle=g;
          c.save(); if(prefs.effect==='aurora'){c.translate(0,height*.3);c.scale(1,.45);} c.fillRect(0,-height,width,height*3);c.restore();
        }
      } else if (prefs.effect === 'stars') {
        for(let i=0;i<100;i++) {
          const x=((i*137.508)%width+Math.sin(t*.15+i)*12+px*60+width)%width;
          const y=((i*83.17+t*(3+i%4)+py*60)%height+height)%height;
          c.globalAlpha=.3+.5*(.5+.5*Math.sin(t+i));c.beginPath();c.arc(x,y,i%7===0?1.8:1,0,Math.PI*2);c.fill();
        }
      } else if (prefs.effect === 'grid') {
        c.globalAlpha=.6;c.lineWidth=1;const horizon=height*(.3+py*.12), center=width*(.5+px*.3);
        for(let i=-12;i<=12;i++){c.beginPath();c.moveTo(center+i*12,horizon);c.lineTo(width/2+i*width/6,height);c.stroke();}
        for(let i=0;i<18;i++){const v=((i+t*.35)%18)/18;const y=horizon+(height-horizon)*v*v;c.beginPath();c.moveTo(0,y);c.lineTo(width,y);c.stroke();}
      }
      if(ripple && !['off','wallpaper','video'].includes(prefs.effect)) {
        const age=t-ripple.at;if(age<1.5){c.globalAlpha=Math.max(0,.65-age/2);c.strokeStyle=accent;c.lineWidth=1;c.beginPath();c.arc(ripple.x*width,ripple.y*height,age*160+8,0,Math.PI*2);c.stroke();}
      }
      c.globalAlpha=1;
    }
    function paint() {
      if(document.querySelector('#chat').classList.contains('on')) draw(context,width,height,time);
      if(page.classList.contains('on')) draw(previewContext,preview.width,preview.height,time);
    }
    function tick(now) {
      frame=0;if(!running()) return;
      if(now-last>=50) {time+=Math.min(now-last,100)*.001*prefs.speed/50;last=now;paint();}
      frame=requestAnimationFrame(tick);
    }
    function refresh() {
      cancelAnimationFrame(frame);frame=0;last=performance.now();colors();
      document.documentElement.dataset.chatBackground=prefs.effect;
      layer.hidden=prefs.effect==='off';layer.style.opacity=String(prefs.strength/100);preview.style.opacity=String(prefs.strength/100);
      wallpaper.hidden=prefs.effect!=='wallpaper' || stillWallpaper();video.hidden=prefs.effect!=='video' || stillWallpaper();
      canvas.hidden=['wallpaper','video'].includes(prefs.effect) && !stillWallpaper();
      if(prefs.effect==='video' && !prefs.paused && !motion.matches && !document.hidden && visible() && videoUrl) video.play().catch(()=>{$('backgroundStatus').textContent='Video playback was blocked. Try selecting the video again.';}); else video.pause();
      video.playbackRate=prefs.speed/50;
      if(prefs.image && wallpaper.getAttribute('src')!==prefs.image) wallpaper.src=prefs.image;
      select.value=prefs.effect;$('backgroundStrength').value=prefs.strength;$('backgroundSpeed').value=prefs.speed;$('backgroundPaused').checked=prefs.paused;
      $('backgroundStrengthValue').textContent=prefs.strength+'%';$('backgroundSpeedValue').textContent=(prefs.speed/50).toFixed(1)+'x';
      $('backgroundInteractive').checked=prefs.interactive!==false;
      $('backgroundInteractive').disabled=['off','wallpaper','video'].includes(prefs.effect);
      panel.querySelectorAll('.background-preset').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.effect===prefs.effect)));
      $('backgroundMediaName').textContent=prefs.effect==='video' && prefs.videoName ? prefs.videoName : prefs.image?'Image saved on this device':'Add an image or a seamless video loop.';
      $('backgroundPreviewHint').textContent=prefs.effect==='video'?'Looping video / muted':prefs.paused || motion.matches?'Motion paused':prefs.effect==='off'?'No background':prefs.interactive?'Move your pointer to explore':'Live preview';
      $('backgroundRemove').disabled=!prefs.image && !prefs.hasVideo;$('backgroundSpeed').disabled=['off','wallpaper'].includes(prefs.effect);
      paint();if(running()) frame=requestAnimationFrame(tick);
    }
    wallpaper.onload=refresh;video.onloadeddata=paint;
    video.onerror=()=>{video.pause();$('backgroundStatus').textContent='This video could not be played. Try a WebM or H.264 MP4.';};
    function track(surface,event,click=false) {
      if(!prefs.interactive || prefs.paused || motion.matches || !visible() || ['off','wallpaper','video'].includes(prefs.effect))return;
      const rect=surface.getBoundingClientRect();pointer={x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
      if(click && !event.target.closest('button,input,textarea,a,select'))ripple={...pointer,at:time};paint();
    }
    for(const surface of [host,previewHost]) {
      surface.addEventListener('pointermove',event=>track(surface,event),{passive:true});
      surface.addEventListener('pointerdown',event=>{if(event.button===0)track(surface,event,true);},{passive:true});
      surface.addEventListener('pointerleave',()=>{pointer={x:.5,y:.5};});
    }
    $('backgroundInteractive').onchange=()=>{prefs.interactive=$('backgroundInteractive').checked;save();};
    function storedVideo(mode,value) {
      return new Promise((resolve,reject)=>{
        const request=indexedDB.open('relay-wallpapers',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('media');request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{const db=request.result,tx=db.transaction('media',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('media');
          const operation=mode==='get'?store.get('video'):mode==='put'?store.put(value,'video'):store.delete('video');
          tx.oncomplete=()=>{db.close();resolve(operation.result);};tx.onerror=()=>{db.close();reject(tx.error);};};
      });
    }
    async function loadVideo(file) {
      const url=URL.createObjectURL(file),probe=document.createElement('video');probe.preload='metadata';
      try {await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Video took too long to load.')),8000);probe.onloadedmetadata=()=>{clearTimeout(timeout);resolve();};probe.onerror=()=>{clearTimeout(timeout);reject(new Error('Use a WebM or H.264 MP4 video.'));};probe.src=url;});}
      catch(error){URL.revokeObjectURL(url);throw error;}finally{probe.removeAttribute('src');probe.load();}
      if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=url;video.src=url;
    }

    function save() {
      refresh();
      try {localStorage.setItem(key,JSON.stringify(prefs));$('backgroundStatus').textContent='';}
      catch {$('backgroundStatus').textContent='Applied for now. Device storage is full; choose a smaller wallpaper to save it.';}
    }
    select.onchange=()=>{prefs.effect=select.value;save();};
    for(const [id,field] of [['backgroundStrength','strength'],['backgroundSpeed','speed']]) $(id).oninput=()=>{prefs[field]=Number($(id).value);save();};
    $('backgroundPaused').onchange=()=>{prefs.paused=$('backgroundPaused').checked;save();};
    $('backgroundChoose').onclick=()=>$('backgroundFile').click();
    $('backgroundRemove').onclick=async()=>{
      prefs.image='';prefs.hasVideo=false;prefs.videoName='';wallpaper.removeAttribute('src');video.pause();video.removeAttribute('src');video.load();
      if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl='';if(['wallpaper','video'].includes(prefs.effect))prefs.effect='off';save();
      try{await storedVideo('delete');}catch{$('backgroundStatus').textContent='Removed from the scene, but the saved video could not be cleared.';}
    };
    $('backgroundFile').onchange=async()=>{
      const file=$('backgroundFile').files[0];$('backgroundFile').value='';if(!file)return;
      const isVideo=['video/mp4','video/webm'].includes(file.type);
      if(!isVideo && !['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size>(isVideo?50:2)*1024*1024){$('backgroundStatus').textContent='Choose a PNG, JPG, WebP or GIF up to 2 MB, or MP4 / WebM up to 50 MB.';return;}
      $('backgroundChoose').disabled=true;$('backgroundStatus').textContent='Opening '+file.name;
      try {
        if(isVideo) {
          await loadVideo(file);prefs.hasVideo=true;prefs.videoName=file.name;prefs.effect='video';save();
          try{await storedVideo('put',file);}catch{$('backgroundStatus').textContent='Video applied for now, but could not be saved on this device.';}
        } else {
          const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
          await new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src=data;});
          prefs.image=data;prefs.effect='wallpaper';save();
        }
      }catch(error){$('backgroundStatus').textContent=error.message || 'That file could not be opened. Try another file.';}
      finally{$('backgroundChoose').disabled=false;}
    };
    if(prefs.hasVideo)storedVideo('get').then(async file=>{if(file){await loadVideo(file);refresh();}else{prefs.hasVideo=false;if(prefs.effect==='video')prefs.effect='off';save();}}).catch(()=>{$('backgroundStatus').textContent='Saved video unavailable. Choose it again to restore it.';});
    window.addEventListener('beforeunload',()=>{if(videoUrl)URL.revokeObjectURL(videoUrl);});
    new ResizeObserver(()=>{width=Math.min(host.clientWidth,1200);height=Math.min(host.clientHeight,1000);canvas.width=width;canvas.height=height;refresh();}).observe(host);
    new MutationObserver(refresh).observe(document.documentElement,{attributes:true,attributeFilter:['data-relay-theme']});
    new MutationObserver(refresh).observe(document.querySelector('#chat'),{attributes:true,attributeFilter:['class']});
    new MutationObserver(refresh).observe(page,{attributes:true,attributeFilter:['class']});
    document.addEventListener('visibilitychange',refresh);motion.addEventListener('change',refresh);refresh();
  }
  return {mount};
})();
