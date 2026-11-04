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
const unscoped = createAssignments(items, [{ ...plan[0], files: [] }, plan[1]], routes, ['codex']);
assert.equal(unscoped[0].coordinatorOwned, true, 'unscoped proposals retain checklist coverage through coordinator fallback');
assert.equal(unscoped[0].status, 'blocked', 'unscoped fallback cannot run');
assert.equal(unscoped[0].blocker, 'missing-file-scope', 'unscoped task explains why it is blocked');
const wholeRepo = createAssignments(items, [{ ...plan[0], files: ['.'] }, plan[1]], routes, ['codex']);
assert.equal(wholeRepo[0].status, 'blocked', 'a whole-repository marker is not accepted as a file scope');
const traversalScope = createAssignments(items, [{ ...plan[0], files: ['../outside.js'] }, plan[1]], routes, ['codex']);
assert.equal(traversalScope[0].status, 'blocked', 'a path outside the repository cannot create a runnable scope');
const duplicateFallback = createAssignments(items, [plan[0], plan[0]], routes, ['codex']);
assert.equal(duplicateFallback.length, 2, 'duplicate proposals do not drop coverage');
assert.equal(duplicateFallback[0].coordinatorOwned, true, 'duplicate proposals use a coordinator-owned fallback');
assert.equal(duplicateFallback[1].coordinatorOwned, true, 'uncovered requirements also receive coordinator-owned fallbacks');
assert.throws(() => createAssignments(items, [{ ...plan[0], requirementIndex: 99 }], routes, ['codex']), /invalid|requirement/i, 'out-of-range plan entries are rejected');
assert.throws(() => createAssignments(items, [null], routes, ['codex']), /invalid|requirement|plan/i, 'malformed plan entries are rejected');
assert.equal(createAssignments([{ text: 'Preserve compatibility', type: 'preservation' }, { text: 'Protect data', kind: 'constraint' }], [], routes, ['codex']).length, 0, 'preservation and constraint type/kind forms are excluded');
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
const overlappingRunning = { ...assignments[0], status: 'running', fileOwnership: ['shared.js'] };
const overlappingQueued = { ...assignments[1], fileOwnership: ['SHARED.js'] };
const unrelatedQueued = { ...assignments[1], id: 'unrelated', fileOwnership: ['other.js'] };
const scheduled = readyAssignments([overlappingRunning, overlappingQueued, unrelatedQueued], 2);
assert.equal(scheduled.length, 1);
assert.equal(scheduled[0].id, 'unrelated', 'overlap test only schedules unrelated queued assignment');
const blockedByOverlap = readyAssignments([overlappingRunning, { ...assignments[1], fileOwnership: ['shared.js'] }], 2);
assert.equal(blockedByOverlap.length, 0, 'queued ownership overlapping a running task is withheld');
const folderRunning = { ...assignments[0], status: 'running', fileOwnership: ['src/'] };
assert.equal(readyAssignments([folderRunning, { ...assignments[1], fileOwnership: ['SRC/app.js'] }], 2).length, 0, 'a file inside a running folder scope is withheld');
assert.equal(readyAssignments([folderRunning, { ...assignments[1], fileOwnership: ['srcx/app.js'] }], 2).length, 1, 'a sibling folder with the same prefix is not an overlap');
assert.equal(allTasksPassed(assignments), false);
assert.equal(allTasksPassed([]), true);
assert.equal(allTasksPassed(assignments.map(a => ({ ...a, status: 'passed' }))), true);
console.log('requirement workflow tests passed');
