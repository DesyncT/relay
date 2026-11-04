const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Execute the actual gate with a fake provider, without launching Electron or spending tokens.
const source = fs.readFileSync(require.resolve('./main.js'), 'utf8');
const parser = source.slice(source.indexOf('function applyReqTags('), source.indexOf('// A wrap-up'));
const gate = source.slice(source.indexOf('    const request = msgs()'), source.indexOf('    if (supercodeOn(sid) && /\\[escalate'));

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
  console.log('Requirement gate: 6 cases passed (prose, tags only, retry, blocked implementation, stale active and completed checklists).');
})().catch(error => { console.error(error); process.exitCode = 1; });
