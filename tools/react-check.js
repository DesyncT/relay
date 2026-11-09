(async () => {
 const wait = ms => new Promise(r=>setTimeout(r,ms));
 const assert = (ok,label) => {if(!ok) throw Error(label);};
 await wait(400);
 assert(document.querySelector('#input'),'Chat composer missing');
 assert(document.querySelectorAll('#log .msg').length >= 2,'Chat history missing');
 assert(document.querySelectorAll('.opt').length === 3,'Question choices missing');
 const nav=document.querySelector('nav').getBoundingClientRect(), main=document.querySelector('main').getBoundingClientRect();
 assert(main.x >= nav.right-1,'Sidebar must sit beside main content');
 assert(main.right <= innerWidth+1,'Main content overflows');
 document.querySelector('.opt').click(); await wait(100);
 assert(__calls().some(c=>c[0]==='chat:send'&&c[2]==='Motion'),'Choice does not send');
 __emit('chat:msg',{sessionId:'s1',from:'codex',text:'Live messages work.',at:Date.now()}); await wait(100);
 assert(document.querySelector('#log').textContent.includes('Live messages work.'),'Live push missing');
 document.querySelector('nav [data-tab="rules"]').click(); await wait(1800);
 [...document.querySelectorAll('button')].find(b=>b.textContent==='Skills').click(); await wait(1800);
 assert(document.querySelector('.sk-wrap'),'Skills route missing');
 document.querySelector('nav [data-tab="settings"]').click(); await wait(1800);
 [...document.querySelectorAll('button')].find(b=>b.textContent==='Themes').click(); await wait(1800);
 assert(document.querySelector('#themes'),'Themes route missing');
 assert(document.querySelectorAll('#tabpair').length===1,'Duplicate tab switchers');
 document.querySelector('.sb-row[data-id="s1"]')?.click(); await wait(1800);
 assert(document.querySelector('#input'), 'Return to chat failed');
 document.querySelector('[aria-label="Terminal"]').click(); await wait(800);
 assert(document.querySelector('aside.pn'), 'Terminal panel missing');
 document.querySelector('[aria-label="Terminal"]').click(); await wait(800);
 assert(!document.querySelector('aside.pn'), 'Terminal panel did not close');
 return {passed:true,calls:__calls().length};
})()
