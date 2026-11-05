const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('./main.js'), 'utf8');
const enqueue = source.slice(source.indexOf('function enqueue('), source.indexOf('// Crash/close safety'));
const drain = source.slice(source.indexOf('const drainingUserQueue ='), source.indexOf('const WRAP ='));

const lane = { busy:false, next:null }, rt = { lanes:{ claude:lane } };
const queued = [{ text:'queued user request' }], events = [];
const userQueues = { get:() => queued, set:(_sid, items) => { queued.splice(0, queued.length, ...items); } };
const requirementCoordinators = new Map();
const requirementRetries = new Set();
const context = {
  easyBusy:new Set(),RT:() => rt, userQueues, requirementCoordinators, requirementRetries, subsOf:() => [], subLive:() => false, saveResume:() => {},
  pump:(_sid, _who) => { const trigger = lane.next.trigger; lane.next = null; lane.busy = true; events.push(trigger.text); },
  send:() => {}, queueUpdate:() => {}, dispatchUser:(_sid, item) => events.push(item.text),
};
vm.runInNewContext(`${enqueue}\n${drain}`, context);

const resume = { text:'resume persisted implementation' };
context.enqueue('session', 'claude', { text:'normal agent followup' });
assert.equal(lane.next, null, 'ordinary follow-up still waits while a user message is queued');
context.enqueue('session', 'claude', resume, null, true, { resume:true });
assert.deepEqual(events, ['resume persisted implementation'], 'resume trigger dispatches before a queued user prompt');
assert.equal(queued.length, 1, 'resume does not consume the persisted queued message');
context.drainUserQueue('session');
assert.equal(queued.length, 1, 'queue remains intact while resumed work is active');
lane.busy = false;
context.drainUserQueue('session');
assert.deepEqual(events, ['resume persisted implementation', 'queued user request']);
assert.equal(queued.length, 0, 'queue drains after resumed work settles');
console.log('resume queue ordering tests passed');

lane.busy=false;queued.push({text:'second prompt waits during provider selection'});
context.enqueue('session','claude',{text:'first selected prompt'},null,true,{user:true});
assert.equal(events.at(-1),'first selected prompt','A pending user dispatch cannot be dropped by a later queued prompt');
assert.equal(queued.length,1);lane.busy=false;context.drainUserQueue('session');assert.equal(queued.length,0);
