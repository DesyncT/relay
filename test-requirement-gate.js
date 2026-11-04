const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Execute the actual gate with a fake provider, without launching Electron or spending tokens.
const source = fs.readFileSync(require.resolve('./main.js'), 'utf8');
const parser = source.slice(source.indexOf('function applyReqTags('), source.indexOf('// A wrap-up'));
const gate = source.slice(source.indexOf('    const request = msgs()'), source.indexOf('    if (supercodeOn(sid) && /\\[escalate'));
const dispatch = source.slice(source.indexOf('const WRAP ='), source.indexOf("ipcMain.handle('chat:queue',"));

function dispatchTaggedRequest() {
  let reqs = { items: [{ t: 'Old request', done: true }], requestAt: 1 };
  const messages = [], rt = {};
  vm.runInNewContext(`${dispatch}\ndispatchUser('test', { text: '[req: User supplied requirement]' });`, {
    store: { getSession: () => ({ lead: 'claude' }) }, RT: () => rt,
    post: (_, from, text) => { const m = { from, text, at: 2 }; messages.push(m); return m; },
    reqsOf: () => reqs, setReqs: (_, value) => { reqs = value; },
    REQ_COUNT: /\b(\d+)\s+requirements?\b/i, supercodeOn: () => false,
    onUserText: () => {}, AGENT_NAMES: ['claude', 'codex'], enqueue: () => {},
  });
  assert.equal(reqs.items.length, 0, 'User tags must not populate the agent checklist');
  assert.match(messages[0].text, /\[req: User supplied requirement\]/);
  assert.match(messages[1].text, /Waiting for the agent/);
  return reqs;
}

async function check(responses, fails = false, initial = { items: [] }) {
  let reqs = initial;
  const prose = responses[0].includes('Here is the plan.');
  const events = [];
  const context = {
    sid: 'test', who: 'claude', phase: 'coding', notes: '', trigger: {}, isLead: true, tag: 'test', lockEdits: false,
    msgs: () => [{ from: 'user', text: 'Fix the new request', at: 2 }], WRAP: /^wrap up$/i,
    reqsOf: () => reqs,
    setReqs: (_, value) => { reqs = value; },
    promptFor: () => '', addUsage: () => null,
    post: (_, who, text) => { events.push({ text }); return { text }; },
    seatRun: async (_, who, phase, prompt, trigger, options) => {
      events.push({ readonly: !!options.readonly });
      return { text: responses.shift() || 'Implementation complete', rd: { meta: {} }, prov: who };
    },
  };
  const run = vm.runInNewContext(`${parser}\n(async () => { let r, rd, prov, usage; ${gate} })()`, context);
  if (fails) {
    await assert.rejects(run, /did not write requirements/);
    assert.deepEqual(events, [{ readonly: true }, { readonly: true }]);
  } else {
    await run;
    const publication = events.findIndex(e => e.text);
    assert.ok(publication > 0);
    assert.match(events[publication].text, /1\. Show requirements before editing/);
    if (prose) assert.match(events[publication].text, /@codex Here is the plan\./);
    assert.ok(events.slice(0, publication).every(e => e.readonly));
    assert.equal(events[publication + 1].readonly, false);
    assert.equal(reqs.items.length, 1);
    assert.equal(reqs.requestAt, 2);
  }
}

(async () => {
  await check(['@codex Here is the plan.\n[req: Show requirements before editing]']);
  await check(['[req: Show requirements before editing]']);
  await check(['Forgot the checklist.', '[req: Show requirements before editing]']);
  await check(['Forgot again.', 'Still missing.'], true);
  await check(['[req: Show requirements before editing]'], false, { items: [{ t: 'Old request', done: false }], requestAt: 1 });
  await check(['Forgot again.', 'Still missing.'], true, { items: [{ t: 'Old completed request', done: true }], requestAt: 1 });
  await check(['[req: Show requirements before editing]'], false, dispatchTaggedRequest());
  await check(['Forgot again.', 'Still missing.'], true, dispatchTaggedRequest());
  console.log('Requirement gate: 8 cases passed (including user tags requiring agent-written requirements and blocking implementation when omitted).');
})().catch(error => { console.error(error); process.exitCode = 1; });
