const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Execute the actual gate with a fake provider, without launching Electron or spending tokens.
const source = fs.readFileSync(require.resolve('./main.js'), 'utf8');
const parser = source.slice(source.indexOf('function applyReqTags('), source.indexOf('// A wrap-up'));
const gate = source.slice(source.indexOf('    const writingChecklist ='), source.indexOf('    if (supercodeOn(sid) && /\\[escalate'));

async function check(responses, fails = false) {
  let reqs = { items: [] };
  const events = [];
  const context = {
    sid: 'test', who: 'claude', phase: 'coding', notes: '', trigger: {}, isLead: true, tag: 'test', lockEdits: false,
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
    assert.ok(events.slice(0, publication).every(e => e.readonly));
    assert.equal(events[publication + 1].readonly, false);
    assert.equal(reqs.items.length, 1);
  }
}

(async () => {
  await check(['@codex Here is the plan.\n[req: Show requirements before editing]']);
  await check(['[req: Show requirements before editing]']);
  await check(['Forgot the checklist.', '[req: Show requirements before editing]']);
  await check(['Forgot again.', 'Still missing.'], true);
  console.log('Requirement gate: 4 cases passed (prose, tags only, retry, blocked implementation).');
})().catch(error => { console.error(error); process.exitCode = 1; });
