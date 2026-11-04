const assert = require('node:assert/strict');
const { createAssignments, nextEscalation, readyAssignments, allTasksPassed } = require('./requirement-workflow');
const routes = {
  codex: { coding: { model: 'gpt-6-astra', effort: 'medium' } },
  claude: { coding: { model: 'claude-opus-5-5', effort: 'medium' } },
};
const items = [
  { text: 'Fix parser', done: false },
  { text: 'Keep API stable', done: false, actionable: false },
  { text: 'Add tests', done: false },
];
const plan = [
  { requirementIndex: 0, task: 'Fix the parser', provider: 'codex', model: 'gpt-6-astra', effort: 'medium', files: ['src/parser.js'] },
  { requirementIndex: 2, task: 'Add parser tests', provider: 'codex', model: 'gpt-6-astra', effort: 'medium', files: ['test/parser.test.js'] },
];
const assignments = createAssignments(items, plan, routes, ['codex']);
assert.equal(assignments.length, 2, 'actionable requirements each receive exactly one task');
assert.deepEqual(assignments.map(a => a.requirementIndex), [0, 2]);
assert.equal(assignments[0].status, 'queued');
assert.equal(createAssignments(items, [], routes, ['codex']).length, 2, 'missing proposals fall back per actionable requirement');
assert.equal(createAssignments(items, [plan[0], plan[0]], routes, ['codex']).length, 2, 'duplicate proposals do not drop coverage');
assert.throws(() => createAssignments(items, [{ ...plan[0], model: 'invented-model' }], routes, ['codex']), /route|model/i);
assert.throws(() => createAssignments(items, [plan[0]], routes, []), /provider|route/i);
assert.throws(() => createAssignments(items, [{ ...plan[0], effort: 'max' }], routes, ['codex']), /route|effort/i);
const withClaude = createAssignments(items, [{ ...plan[0], provider: 'claude', model: 'claude-opus-5-5' }, plan[1]], routes, ['codex', 'claude']);
assert.equal(withClaude[0].provider, 'claude', 'valid planner provider override is honored');
const ladderRoutes = {
  codex: { coding: { model: 'gpt-6-luna', effort: 'low' } },
  claude: { coding: { model: 'claude-opus-5-5', effort: 'medium' } },
};
const ladder = createAssignments([{ text: 'task' }], [{ requirementIndex: 0, task: 'task', provider: 'codex', model: 'gpt-6-luna', effort: 'low' }], ladderRoutes, ['codex', 'claude']);
const escalated = nextEscalation(ladder[0], ladderRoutes, ['codex', 'claude']);
assert.ok(escalated);
assert.notDeepEqual([escalated.model, escalated.effort], [ladder[0].model, ladder[0].effort]);
assert.equal(nextEscalation({ ...ladder[0], model: escalated.model, effort: escalated.effort }, ladderRoutes, ['codex', 'claude']), null);
const scheduled = readyAssignments([{ ...assignments[0], status: 'running' }, assignments[1]], 2);
assert.equal(scheduled.length, 1);
assert.equal(allTasksPassed(assignments), false);
assert.equal(allTasksPassed([]), true);
assert.equal(allTasksPassed(assignments.map(a => ({ ...a, status: 'passed' }))), true);
console.log('requirement workflow tests passed');
