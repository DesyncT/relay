(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(value,message)=>{if(!value)throw Error(message)};
 async function chooseProvider(label){
   document.querySelector('#leadPick').click();await wait(250);
   [...document.querySelectorAll('#leadMenu .mi')].find((button)=>button.textContent.includes(label)).click();await wait(250);
 }
 const codexModels=[
   ['gpt-6.2-sol','GPT-6.2 Sol'],['gpt-6.1-sol','GPT-6.1 Sol'],
   ...Array.from({length:8},(_,i)=>[`model-${i}`,`Model ${i}`]),
 ];
 window.__setFixture('models:available',codexModels);
 await chooseProvider('Codex');
 document.querySelector('#normalModel').click();await wait(500);
 const menu=document.querySelector('#normalModelMenu'),models=menu.querySelectorAll('[role=menuitemradio]');
 assert(models.length===12,'Fetched models did not populate the picker');
 assert(menu.getBoundingClientRect().top>=0 && menu.scrollHeight>menu.clientHeight,'Model list is clipped or cannot scroll');
 models[0].click();await wait(150);
 assert(document.querySelector('#normalModel').dataset.value==='gpt-6.2-sol','Fetched model could not be selected');
 window.__setFixture('models:available',[['claude-fable-5-2','Fable 5.2']]);
 await chooseProvider('Claude');
 document.querySelector('#normalModel').click();await wait(400);
 const fable=[...document.querySelectorAll('#normalModelMenu .mi')].find((button)=>button.textContent==='Fable 5.2');
 assert(fable && window.__calls().some(([channel,provider])=>channel==='models:available' && provider==='claude'),'Claude models were not fetched and rendered');
 fable.click();await wait(150);
 assert(document.querySelector('#normalModel').dataset.value==='claude-fable-5-2','Fetched Claude model could not be selected');
 window.__setFixture('models:available',codexModels);
 await chooseProvider('Codex');
 document.querySelector('#normalModel').click();await wait(400);
 assert(document.querySelector('#normalModelMenu [aria-checked="true"]')?.textContent==='GPT-6.2 Sol','Codex selection was lost after switching providers');
 return {passed:true,width:innerWidth};
})()
