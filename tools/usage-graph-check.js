(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw Error(m)};
 document.querySelector('nav [data-tab="usage"]').click();await wait(800);
 assert(document.querySelector('.u-big').textContent==='$862.34','Headline excludes account-only estimate');
 const codex=[...document.querySelectorAll('.u-tool')].find(e=>e.querySelector('.n').textContent==='Codex');assert(codex.querySelector('.c').textContent==='$262.34','Provider excludes estimate');
 const svg=document.querySelector('.u-chart svg');assert(svg.getAttribute('aria-label').includes('allocated'),'Allocation not labeled');
 let found=false;
 svg.scrollIntoView({block:'center'});
 for(let i=0;i<42;i++){const b=svg.getBoundingClientRect(),w=svg.viewBox.baseVal.width;svg.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:b.left+(84+(w-92)*i/41)*b.width/w,clientY:b.top+b.height/2}));await wait(30);if(document.querySelector('.u-chart .u-tip')?.textContent.includes('allocated Codex estimate')){found=true;break;}}
 assert(found,'Graph tooltip does not disclose estimated addition');
 return {passed:true,provider:codex.querySelector('.c').textContent,graphPaths:svg.querySelectorAll('path').length};
})()
