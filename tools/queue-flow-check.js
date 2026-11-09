(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw Error(m)};
 const log=document.querySelector('#log'),queue=document.querySelector('#queueCount');assert(queue&&log.contains(queue),'Queue is not inside the conversation');
 const image=queue.querySelector('.q-thumb');assert(getComputedStyle(image).transform==='none','Image has a hover transform');
 const item=queue.querySelector('.q-item');log.scrollTop=log.scrollHeight;await wait(80);const bottom=item.getBoundingClientRect().top;
 log.scrollTop=Math.max(0,log.scrollTop-200);await wait(80);assert(item.getBoundingClientRect().top>bottom+100,'Queue is pinned instead of scrolling');
 queue.querySelector('.q-edit').click();await wait(80);assert(document.querySelector('#input').value.includes('Queued message'),'Edit does not load queued message');document.querySelector('#cancelQueueEdit').click();await wait(80);assert(document.querySelector('#input').value==='Keep my draft','Edit changed original draft');
 queue.querySelector('.q-delete').click();await wait(80);assert(__calls().some(c=>c[0]==='chat:queue-delete'&&c[2]==='q1'),'Delete action lost');
 __emit('chat:queue',{sid:'s1',items:[]});await wait(400);assert(!document.querySelector('#queueCount'),'Removed queue still visible');
 __emit('chat:queue',{sid:'s1',items:[{id:'q1',text:'Queued message stays inside the conversation.',files:[]}]});await wait(400);log.scrollTop=log.scrollHeight;await wait(80);
 return {passed:true,queue:'scrolls with chat',draft:'preserved'};
})()
