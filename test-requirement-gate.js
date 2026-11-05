const assert = require('node:assert/strict');
// the defaults of main.js LIMITS
const limit = (k) => ({ maxRequirements: 10, parallelTasks: 0, discoveryQuestions: 5, reviewRounds: 4, soloMinutes: 4, voterTimeoutSec: 60, debateRounds: 1, autoAnswers: 1, subagents: 3, relayRestarts: 3 })[k];
const fs = require('node:fs');
const vm = require('node:vm');

// Execute the actual gate with a fake provider, without launching Electron or spending tokens.
const source = fs.readFileSync(require.resolve('./main.js'), 'utf8');
const parser = source.slice(source.indexOf('function applyReqTags('), source.indexOf('// A wrap-up'));
const gate = source.slice(source.indexOf('    const request = msgs()'), source.indexOf('    if (supercodeOn(sid) && /\\[escalate'));
const askGate = source.slice(source.indexOf('  let asked = answeredQuestions'), source.indexOf('  const notes = [resumed'));
const dispatch = source.slice(source.indexOf('const WRAP ='), source.indexOf("ipcMain.handle('chat:queue',"));

function dispatchTaggedRequest() {
  let reqs = { items: [{ t: 'Old request', done: true }], requestAt: 1 };
  const messages = [], rt = {};
  vm.runInNewContext(`${dispatch}\ndispatchUser('test', { text: '[req: User supplied requirement]' });`, {
    store: { getSession: () => ({ lead: 'claude' }) }, RT: () => rt,
    post: (_, from, text) => { const m = { from, text, at: 2 }; messages.push(m); return m; },
    reqsOf: () => reqs, setReqs: (_, value) => { reqs = value; },
    limit, REQ_COUNT: /\b(\d+)\s+requirements?\b/i, supercodeOn: () => true, isConversation: require('./turn').isConversation,
    route:()=>({first:['claude']}),
    onUserText: () => {}, AGENT_NAMES: ['claude', 'codex'], enqueue: () => {},
  });
  assert.equal(reqs.items.length, 0, 'User tags must not populate the agent checklist');
  assert.match(messages[0].text, /\[req: User supplied requirement\]/);
  assert.match(messages[1].text, /Writing requirements/);
  return reqs;
}

let cases = 0;

// Round 1 asks the user questions, round 2 (the turn after an agent question) writes the list
function gateFor(messages, reqs = { items: [] }, writeNow) {
  cases += 1;
  return vm.runInNewContext(`${askGate}; checklistGate`, { limit, sid: 'test', messages, sess: { messages }, reqsOf: () => reqs, writeNow, answeredQuestions: require('./turn').answeredQuestions });
}

async function check(responses, fails = false, initial = { items: [] }) {
  cases += 1;
  let reqs = initial;
  const prose = String(responses[0].text ?? responses[0]).includes('Here is the plan.');
  const events = [];
  const context = {
    limit, answeredQuestions:()=>5, sid: 'test', who: 'claude', phase: 'coding', notes: '', trigger: {}, isLead: true, tag: 'test', lockEdits: false,
    supercodeOn:() => true, ep:0, startRequirementWorkflow:async()=>events.push({workflow:true}),
    msgs: () => [{ from: 'user', text: 'Fix the new request', at: 2 }], WRAP: /^wrap up$/i,
    reqsOf: () => reqs,
    setReqs: (_, value) => { reqs = value; },
    promptFor: () => '', addUsage: () => null,
    post: (_, who, text) => { events.push({ text }); return { text }; },
    seatRun: async (_, who, phase, prompt, trigger, options) => {
      events.push({ readonly: !!options.requirementsOnly });
      const res = responses.shift() || 'Implementation complete';
      return { ...(typeof res === 'string' ? { text: res } : res), rd: { meta: {} }, prov: who };
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
    if (prose) assert.equal(events[publication].text, '1. Show requirements before editing'); // the read-only run's prose ("plan mode is on…") is not posted
    assert.ok(events.slice(0, publication).every(e => e.readonly));
    assert.equal(events[publication + 1].workflow, true, 'EasyCode dispatches the published checklist to its coordinator');
    assert.equal(reqs.items.length, 1);
    assert.equal(reqs.requestAt, 2);
  }
}

// The gate must let the reply through without writing or failing
async function asks(responses, initial, count = 5) {
  cases += 1;
  let reqs = initial, runs = 0, expectedRuns = responses.length;
  await vm.runInNewContext(`${parser}\n(async () => { let r, rd, prov, usage; ${gate} })()`, {
    limit, answeredQuestions:()=>count, sid: 'test', who: 'codex', phase: 'coding', notes: '', trigger: {}, isLead: true, tag: 'test', lockEdits: false, supercodeOn:() => false,
    msgs: () => [{ from: 'user', text: 'wrap up', at: 2 }], WRAP: /^wrap up$/i,
    reqsOf: () => reqs, setReqs: (_, value) => { reqs = value; }, promptFor: () => '', addUsage: () => null,
    post: () => assert.fail('nothing should be posted'),
    seatRun: async (_, who) => { runs += 1; return { text: responses.shift(), rd: { meta: {} }, prov: who }; },
  });
  assert.equal(runs, expectedRuns);
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
  // Requirements written before tool calls, missing from the final message (Codex and Claude both do this)
  await check([{ text: 'Read the files.', said: ['[req: Show requirements before editing]', 'Read the files.'] }]);
  // Supercode replies put the tags after the @mention, and restate them in the final message (real Codex/Claude output)
  await check(['@claude [req: Show requirements before editing] [pass @claude]']);
  await check([{ text: '1. [req: Show requirements before editing]', said: ['@claude [req: Show requirements before editing]\nRead the files.', '1. [req: Show requirements before editing]'] }]);
  await check(['Each on its own [req: ...] line.\n- [req: Show requirements before editing]']);
  await asks(['1. Which page? 2. Which colours? [ask-user!]'], { items: [] }, 2); // under the question cap, a question goes through
  await asks(['How should matching work? [ask-user!: All filters | Weighted scoring | Rules]', 'Which page? [ask-user!: Home | Search | Cart]'], {items:[]}, 5); // cap reached: one retry asks for the checklist instead
  await asks(['Restarted, all good.'], null); // after a wrap-up there is no checklist to write
  const user = { from: 'user', text: 'Build it' }, ask = { from: 'claude', text: 'Which page?', askUser: true }, said = { from: 'claude', text: 'Done.' };
  assert.match(gateFor([user]), /one question at a time/); // first run asks one question
  assert.match(gateFor([user]), /\[ask-user!: Option A \| Option B \| Option C\]/);
  assert.doesNotMatch(gateFor([user]), /numbered questions/);
  assert.match(gateFor([user, ask, user]), /answered your earlier question/); // after one answer it may ask the next
  assert.match(gateFor([user, ask, user, ask, user, ask, user]), /answered your earlier question/);
  assert.match(gateFor([user, ask, user, ask, user, ask, user, ask, user]), /one question at a time/); // four answered, one question left
  assert.match(gateFor([user, ask, user, ask, user, ask, user, ask, user, ask, user]), /only writes the requirements/); // five answered: the cap is reached, write the checklist
  assert.match(gateFor([user, said, user]), /one question at a time/); // a plain reply is not a question: new task, asks again
  assert.match(gateFor([user]), /at most 5 questions in total/);
  assert.match(gateFor([user]), /inspect the relevant project/);
  assert.doesNotMatch(gateFor([user], { items: [] }, true), /1 to 3/);
  assert.match(gateFor([user], { items: [], target: 2 }), /exactly 2/);
  assert.match(gateFor([user], { items: [] }, true), /only writes the requirements/);
  const original = 'Build a customer portal. ' + 'Detailed workflow requirement. '.repeat(80) + 'Preserve subscription history.';
  const prompt = source.slice(source.indexOf('function promptFor('), source.indexOf('\nfunction post('));
  const fullBrief = vm.runInNewContext(`${prompt}; promptFor('test','claude','',false)`, {
    RT: () => ({}), store:{getSession:()=>({messages:[{from:'user',text:original,at:1},{from:'claude',text:'Which URL?',askUser:true,at:2},{from:'user',text:'Use the existing URL',at:3}]})},
    limit, answeredQuestions:require('./turn').answeredQuestions, supercodeOn:()=>true, pastNote:()=>'', reqNote:()=>'', reqsOf:()=>({items:[]}), forcedLine:()=>'', ACCESS_NOTE:'Full access',
  });
  assert.ok(fullBrief.includes(original), 'Preserve the entire original task even when it exceeds the recent-message truncation limit');
  assert.ok(fullBrief.includes('Use the existing URL'));
  assert.match(fullBrief, /end-to-end flows/);
  assert.match(fullBrief, /1 of at most 5 questions answered/);
  let detailed = {items:[]};
  const longRequirement = 'Preserve the complete acceptance criterion: ' + 'specific behavior '.repeat(20);
  vm.runInNewContext(`${parser}; applyReqTags('test', tags, 'claude')`, {
    limit, reqsOf:()=>detailed, setReqs:(_sid,r)=>{detailed=r;},
    tags:Array.from({length:35},(_,i)=>`[req: Workflow ${i}: ${longRequirement}]`).join('\n'),
  });
  assert.equal(detailed.items.length,10, 'The checklist stops at the Max requirements setting (default 10)');
  assert.ok(detailed.items[0].t.endsWith(longRequirement.trimEnd()), 'Do not truncate acceptance criteria at 200 characters');
  // review verdicts: real reviewer replies (bold, preamble, inline FAIL fields) and one reviewer down must not block a verified PASS
  const verdictSrc = source.slice(source.indexOf('function readVerdict'), source.indexOf('async function reviewIntegratedResult'));
  const { readVerdict, combineVerdicts } = vm.runInNewContext(`${verdictSrc}; ({ readVerdict, combineVerdicts })`);
  assert.equal(readVerdict('**VERDICT: PASS**\nEVIDENCE: ok'), 'PASS');
  assert.equal(readVerdict('I read the files.\n\nVERDICT: PASS'), 'PASS');
  assert.equal(readVerdict('VERDICT: FAIL\n- FILE: latest.md LINE: 193. ACTUAL: not synced EXPECTED: synced'), 'FAIL');
  assert.equal(readVerdict('VERDICT: FAIL\nit looks wrong'), 'UNKNOWN');
  assert.equal(combineVerdicts([{ verdict: 'PASS' }, { verdict: 'UNKNOWN' }]), 'PASS');
  assert.equal(combineVerdicts([{ verdict: 'PASS' }, { verdict: 'FAIL' }]), 'FAIL');
  assert.equal(combineVerdicts([{ verdict: 'UNKNOWN' }]), 'UNKNOWN');
  cases += 1;
  console.log(`Requirement gate: ${cases} cases passed (including user tags requiring agent-written requirements and blocking implementation when omitted).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
