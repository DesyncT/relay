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
