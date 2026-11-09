(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));const assert=(v,m)=>{if(!v)throw Error(m)};
 const input=document.querySelector('#input'),composer=document.querySelector('.cbar'),main=document.querySelector('main');
 assert(!document.querySelector('.workspace-brand'),'Redundant branding remains');
 assert(input.value==='Draft with an image','Draft lost');assert(document.querySelectorAll('#pend .tile').length===1,'Attachment missing');
 assert(composer.getBoundingClientRect().width>=main.clientWidth-44,'Composer not full width');assert(composer.getBoundingClientRect().height<220,'Composer too tall');
 assert(document.querySelector('#pend .tile').getBoundingClientRect().height===40,'Attachment not compact');
 assert(input.getBoundingClientRect().height<=40,'Single-line text area retains empty space');
 const textBox=input.getBoundingClientRect(),tile=document.querySelector('#pend .tile').getBoundingClientRect(),tools=document.querySelector('.cb-tools').getBoundingClientRect();assert(tile.top-textBox.bottom<=4,'Gap above attachments');assert(tools.top-tile.bottom<=8,'Gap below attachments');
 const header=[...document.querySelectorAll('#log .msg')].at(-1);const badge=header.querySelector('.rt-chip');assert(badge.textContent==='Sollow','Badge values missing');
 assert(getComputedStyle(badge.querySelector('.rt-effort')).fontStyle==='normal','Effort is italic');assert(parseFloat(getComputedStyle(badge).gap)>=8,'Badge values run together');
 const av=header.querySelector('.av').getBoundingClientRect(),hd=header.querySelector('.hd').getBoundingClientRect();assert(Math.abs(av.top-hd.top)<3,'Avatar not aligned with header');
 document.querySelector('nav [data-tab="settings"]').click();await wait(500);
 [...document.querySelectorAll('#tabpair button')].find(b=>b.textContent==='Themes').click();await wait(500);
 assert(getComputedStyle(document.querySelector('.background-controls')).display!=='none','Background settings hidden');
 document.querySelector('[data-effect="grid"]').click();await wait(80);assert(JSON.parse(localStorage.getItem('relay.background.v1')).effect==='grid','Background not saved');
 const fileInput=document.querySelector('.background-file input[type=file]');assert(getComputedStyle(fileInput).display==='none','Duplicate native file picker visible');const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0))],'scene.png',{type:'image/png'}));fileInput.files=transfer.files;fileInput.dispatchEvent(new Event('change',{bubbles:true}));await wait(150);
 assert(JSON.parse(localStorage.getItem('relay.background.v1')).imageName==='scene.png','Image background upload not saved');
 document.querySelector('[data-effect="ascii"]').click();
 document.querySelector('.sb-row[data-id="s1"]').click();await wait(500);
 assert(document.querySelector('#input').value==='Draft with an image','Draft lost after settings');
 const bg=document.querySelector('#chatBackground'),log=document.querySelector('#log');log.scrollTop=log.scrollHeight;
 const bounds=bg.getBoundingClientRect(),viewport=log.getBoundingClientRect();assert(bounds.top<=viewport.top&&bounds.bottom>=viewport.bottom,'Background scrolled out of view');
 assert(getComputedStyle(bg).zIndex==='-1','Background is above text');
 assert(getComputedStyle([...document.querySelectorAll('#log .msg .body')].at(-1)).opacity==='1','Text faded');
 return {passed:true,composerHeight:Math.round(document.querySelector('.cbar').getBoundingClientRect().height),width:innerWidth};
})()
