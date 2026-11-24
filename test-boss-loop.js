const assert = require('node:assert/strict');
const BL = require('./boss-loop');
assert.deepEqual(BL.parseCommand('/boss /loop fix the bug'), { boss: true, loop: true, goal: 'fix the bug' });
assert.deepEqual(BL.parseCommand('/loop /boss x'), { boss: true, loop: true, goal: 'x' });
assert.deepEqual(BL.parseCommand('/bossy thing'), { boss: false, loop: false, goal: '/bossy thing' });
const r = BL.parseRemember('Done.\n[remember: tests run with npm test]\nok [remember: my password is x]');
assert.equal(r.text, 'Done.\n\nok'); assert.deepEqual(r.facts, ['tests run with npm test']);
let m = BL.memAdd('', ['Use tabs', 'use  tabs.']); assert.equal(m, '- Use tabs\n');
assert.equal(BL.memAdd(m, ['USE TABS']), m);
assert.equal(BL.memAdd(m, ['b']), '- Use tabs\n- b\n');
assert.deepEqual(BL.parseVerdict('DONE'), { done: true, reason: '' });
assert.deepEqual(BL.parseVerdict('NOT DONE: tests fail'), { done: false, reason: 'tests fail' });
assert.equal(BL.parseVerdict('Looks good\nnot done - missing docs').done, false);
assert.equal(BL.parseVerdict('whatever').done, true);
console.log('boss-loop ok');
// plan tags, remember-global, test-command detection, checkpoint pruning
{
  const fs = require('fs'), os = require('os'), path = require('path');
  const p = BL.parsePlan('Start\n[plan: 1. write code; test it ; ship]\nmid [done: 2] [done: write code]');
  assert.deepEqual(p.plan, ['write code', 'test it', 'ship']); assert.deepEqual(p.done, ['2', 'write code']); assert.equal(p.text, 'Start\n\nmid');
  assert.equal(BL.parsePlan('no tags').plan, null);
  const plan = BL.mkPlan(p.plan);
  assert.ok(BL.planMark(plan, 'Test it', 'doing') && plan[1].status === 'doing');
  assert.ok(BL.planMark(plan, '1', 'done') && plan[0].status === 'done');
  assert.ok(!BL.planMark(plan, 'nothing like it', 'done'));
  const g = BL.parseRemember('x [remember-global: i like tabs]\n[remember: a]'); assert.deepEqual([g.facts, g.globals, g.text], [['a'], ['i like tabs'], 'x']);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-')); BL.addGlobal(['hello'], home);
  assert.ok(BL.globalBlock(home).includes('- hello')); assert.equal(BL.globalBlock(path.join(home, 'none')), '');
  const d = (files) => { const x = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-')); for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(x, f), c); return x; };
  assert.equal(BL.testCommand(d({})), null);
  assert.equal(BL.testCommand(d({ 'package.json': '{"scripts":{"test":"echo \\"Error: no test specified\\" && exit 1"}}' })), null);
  assert.equal(BL.testCommand(d({ 'package.json': '{"scripts":{"test":"node t.js"}}' })), 'npm test');
  assert.equal(BL.testCommand(d({ 'pyproject.toml': '[tool.pytest.ini_options]' })), 'python -m pytest -q');
  assert.equal(BL.testCommand(d({ 'Cargo.toml': '' })), 'cargo test'); assert.equal(BL.testCommand(d({ 'go.mod': '' })), 'go test ./...');
  const CP = require('./checkpoints'), list = Array.from({ length: 35 }, (_, i) => ({ id: i + 1, ref: 'r' + (i + 1) }));
  const pr = CP.prune(list.reverse()); assert.equal(pr.keep.length, 30); assert.deepEqual(pr.drop.map((c) => c.id), [1, 2, 3, 4, 5]); assert.equal(pr.keep[0].id, 6);
  assert.equal(CP.prune(list.slice(0, 3)).drop.length, 0);
}
console.log('plan/tests/checkpoints helpers ok');
// stall similarity, review verdicts, native subagent mapping
{
  assert.ok(BL.similar('Tests failed: foo is undefined.', 'tests failed  foo is undefined'));
  assert.ok(BL.similar('1 failing: a b c d e f g h i j', '1 failing: a b c d e f g h i k'));
  assert.ok(!BL.similar('missing docs', 'tests failed in parser'));
  assert.ok(!BL.similar('', 'x'));
  assert.deepEqual(BL.parseReview('LGTM'), { pass: true, reason: '' });
  assert.deepEqual(BL.parseReview('blocking: a.js:3 crashes\n- b.js leaks'), { pass: false, reason: 'a.js:3 crashes\n- b.js leaks' });
  assert.equal(BL.parseReview('looks fine, no blockers').pass, true);
  const tu = { type: 'tool_use', id: 'toolu_1', name: 'Task', input: { description: 'Find bug', subagent_type: 'explorer', prompt: 'x'.repeat(5000) } };
  const r = BL.nativeSub(tu, { sid: 's1', owner: 'claude', parent: 'b1', now: 5 });
  assert.deepEqual({ ...r, task: r.task.length }, { id: 'ntoolu_1', kind: 'native', sid: 's1', owner: 'claude', title: 'Find bug', agentType: 'explorer', task: 2048, status: 'running', parent: 'b1', depth: 1, started: 5, ended: 0, activity: '', result: '' });
  assert.equal(BL.nativeSub({ ...tu, name: 'Agent', input: {} }, { sid: 's', owner: 'o' }).agentType, 'general-purpose');
  assert.equal(BL.nativeSub({ ...tu, name: 'Bash' }, { sid: 's', owner: 'o' }), null);
  assert.equal(BL.resultText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]), 'a\nb');
  assert.equal(BL.resultText('x'.repeat(9000)).length, 4096);
  assert.ok(/disjoint|own/.test(BL.BOSS) && BL.BOSS.includes('[plan:'));
}
console.log('stall/review/native helpers ok');
