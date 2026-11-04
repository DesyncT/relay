'use strict';
// main.js setReqs: a retained task workspace survives while its assignment is saved and is deleted once nothing saved points at it.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createTaskWorkspaces, cleanupTaskWorkspaces } = require('./requirement-workspaces');
const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const slice = (from, to) => { const a = source.indexOf(from), b = source.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return source.slice(a, b); };
const code = slice('function setReqs(sid, reqs) {', '\nasync function startRequirementWorkflow') + '\n' + slice('function workspacesFromAssignments(', '\nfunction resumeSessions');
const sessions = { s: { reqs: null } };
const store = { updateSession: (sid, patch) => Object.assign(sessions[sid], patch) };
const reqsOf = (sid) => sessions[sid].reqs;
const env = new Function('store', 'reqsOf', 'send', 'cleanupTaskWorkspaces', `${code}\nreturn { setReqs, requirementCoordinators };`)(store, reqsOf, () => {}, cleanupTaskWorkspaces);

const project = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-reclaim-test-'));
try {
  fs.writeFileSync(path.join(project, 'a.txt'), 'a\n');
  const ws = createTaskWorkspaces(project, 's', [{ id: 'a', files: ['a.txt'] }]);
  assert.equal(ws.isolated, true);
  const assignment = { id: 'a', status: 'open', workspace: { ...ws.tasks[0], cleanup: { ...ws.cleanup[0] } } };
  env.setReqs('s', { items: [], assignments: [assignment] });
  env.setReqs('s', { ...reqsOf('s'), items: [{ t: 'x', done: false }] });
  assert.ok(fs.existsSync(ws.cleanup[0].root), 'an open task keeps its workspace while its assignment is saved');
  env.requirementCoordinators.set('s', {});
  env.setReqs('s', { items: [], target: null });
  assert.ok(fs.existsSync(ws.cleanup[0].root), 'a running workflow keeps its workspaces');
  env.requirementCoordinators.delete('s');
  env.setReqs('s', { ...reqsOf('s'), assignments: [assignment] });
  env.setReqs('s', { items: [], target: null, requestAt: 1 });
  assert.equal(fs.existsSync(ws.cleanup[0].root), false, 'a new request reclaims the unreachable workspace');
  console.log('workspace reclaim tests passed');
} finally { fs.rmSync(project, { recursive: true, force: true }); }
