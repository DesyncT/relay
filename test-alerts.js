const assert=require('node:assert/strict');
const {createAlerts,canNotifyComplete}=require('./notifications');
const events=[],toasts=[];let focused=false;
const win={isDestroyed:()=>false,isFocused:()=>focused,flashFrame:v=>events.push(['flash',v]),setOverlayIcon:(v)=>events.push(['badge',v])};
class Toast {static isSupported(){return true}constructor(options){this.options=options;this.listeners={};toasts.push(this)}on(k,fn){this.listeners[k]=fn}show(){events.push(['toast',this.options.title])}}
const alerts=createAlerts({windows:()=>[win],Notification:Toast,badges:{question:'amber',complete:'green'},icon:'relay.ico',playSound:k=>events.push(['sound',k]),openSession:sid=>events.push(['open',sid])});
alerts.notify('question',{sid:'one',from:'codex',text:'Choose? [ask-user: A | B]'});
assert.deepEqual(events.filter(x=>x[0]==='sound'),[['sound','question']]);
assert.equal(toasts[0].options.silent,true);assert.ok(!toasts[0].options.body.includes('ask-user'));assert.ok(events.some(x=>x[0]==='badge'&&x[1]==='amber'));
alerts.notify('complete',{sid:'two',from:'claude',text:'Finished the changes'});
assert.equal(events.filter(x=>x[0]==='sound').at(-1)[1],'complete');
assert.equal(events.filter(x=>x[0]==='badge').at(-1)[1],'amber','Pending questions take priority');
toasts[1].listeners.click();assert.ok(events.some(x=>x[0]==='open'&&x[1]==='two'));
alerts.clear();assert.equal(events.filter(x=>x[0]==='badge').at(-1)[1],null);
alerts.notify('complete',{sid:'two',from:'claude',text:'Done'});assert.equal(events.filter(x=>x[0]==='badge').at(-1)[1],'green');
focused=true;alerts.clear();alerts.notify('complete',{sid:'two',from:'claude',text:'Done'});assert.equal(events.filter(x=>x[0]==='badge').at(-1)[1],null,'Focused app needs no unread badge');
const msg={from:'codex',text:'Done'};assert.equal(canNotifyComplete({msg}),true);
for(const args of [{busy:true},{queued:true},{cancelled:true},{msg:null},{msg:{...msg,askUser:true}},{msg:{...msg,failure:{}}},{msg:{...msg,progress:true}}])assert.equal(canNotifyComplete({msg,...args}),false);
console.log('Completion and input alert checks passed');
alerts.notify('failure',{sid:'two',from:'codex',text:'Could not complete the task'});
assert.equal(events.filter(x=>x[0]==='sound').at(-1)[1],'failure');
focused=false;
alerts.notify('failure',{sid:'two',from:'codex',text:'Could not complete the task'});
assert.equal(toasts.at(-1).options.title,'Codex failed');
assert.equal(toasts.at(-1).options.silent,true);
const fs=require('node:fs'),path=require('node:path');
for(const kind of ['complete','question','failure']) {
  const wav=fs.readFileSync(path.join(__dirname,'assets',kind+'.wav'));
  assert.equal(wav.toString('ascii',0,4),'RIFF');
  assert.equal(wav.readUInt16LE(22),1);
  const rate=wav.readUInt32LE(24),samples=(wav.length-44)/2;
  assert.ok(samples/rate < .4,'A notification should be one short note');
  const blocks=[];
  for(let start=0;start<samples;start+=Math.round(rate*.01)) {
    let power=0,n=0;
    for(let i=start;i<Math.min(samples,start+Math.round(rate*.01));i++,n++)power+=wav.readInt16LE(44+i*2)**2;
    blocks.push(Math.sqrt(power/n));
  }
  const active=blocks.map(p=>p>500);
  assert.equal(active.filter((on,i)=>on && !active[i-1]).length,1,'Sound must have a single uninterrupted attack');
}
console.log('Single-note success, question and failure sound checks passed');
