'use strict';
// main.js setReqs: a retained task workspace survives while its assignment is saved and is deleted once nothing saved points at it.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createTaskWorkspaces, cleanupTaskWorkspaces } = require('./requirement-workspaces');
const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const slice = (from, to) => { const a = source.indexOf(from), b = source.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return source.slice(a, b); };
const code = (slice('function setReqs(sid, reqs) {', '\nasync function startRequirementWorkflow') + '\n' + slice('function workspacesFromAssignments(', '\nfunction resumeSessions'))
  // the worker-thread hop runs inline here so the assertions can check the folders right away
  .replace(/function offThread\([\s\S]*?\n}\r?\n/, 'function offThread(name, ...args) { cleanupTaskWorkspaces(...args); return Promise.resolve(); }\n');
const sessions = { s: { reqs: null, projectId: 'p1' }, d: { reqs: null, projectId: 'p1' }, r: { reqs: null, projectId: 'p2' } };
const store = {
  updateSession: (sid, patch) => Object.assign(sessions[sid], patch),
  deleteSession: (sid) => { delete sessions[sid]; return null; },
  removeProject: (pid) => { for (const sid of Object.keys(sessions)) if (sessions[sid].projectId === pid) delete sessions[sid]; },
  listSessions: (pid) => Object.keys(sessions).filter((sid) => sessions[sid].projectId === pid).map((id) => ({ id })),
};
const reqsOf = (sid) => sessions[sid]?.reqs || null;
const env = new Function('store', 'reqsOf', 'send', 'cleanupTaskWorkspaces','requirementSubagents','supercodeOn','sessOf', `${code}\nreturn { setReqs, requirementCoordinators };`)(store, reqsOf, () => {}, cleanupTaskWorkspaces,require('./requirement-subagents').requirementSubagents,()=>true,sid=>sessions[sid]);

const project = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-reclaim-test-'));
try {
  fs.writeFileSync(path.join(project, 'a.txt'), 'a\n');
  const ws = createTaskWorkspaces(project, 's', [{ id: 'a', files: ['a.txt'] }]);
  assert.equal(ws.isolated, true);
  const assignment = { id: 'a', status: 'open', workspace: { ...ws.tasks[0], cleanup: { ...ws.cleanup[0] } } };
  env.setReqs('s', { items: [], assignments: [assignment] });
  env.setReqs('s', { ...reqsOf('s'), items: [{ t: 'x', done: false }] });
  assert.ok(fs.existsSync(ws.cleanup[0].root), 'an open task keeps its workspace while its assignment is saved');
  sessions.s.easycodeArchive=[{worker:assignment}];
  env.setReqs('s',{items:[],assignments:[]});
  assert.ok(fs.existsSync(ws.cleanup[0].root),'Archived EasyCode work survives a new request');
  env.setReqs('s',{items:[],assignments:[assignment]});
  sessions.s.easycodeArchive=[];
  env.requirementCoordinators.set('s', {});
  env.setReqs('s', { items: [], target: null });
  assert.ok(fs.existsSync(ws.cleanup[0].root), 'a running workflow keeps its workspaces');
  env.requirementCoordinators.delete('s');
  env.setReqs('s', { ...reqsOf('s'), assignments: [assignment] });
  env.setReqs('s', { items: [], target: null, requestAt: 1 });
  assert.equal(fs.existsSync(ws.cleanup[0].root), false, 'a new request reclaims the unreachable workspace');
  const saveOpen = (sid) => {
    const w = createTaskWorkspaces(project, sid, [{ id: 'a', files: ['a.txt'] }]);
    env.setReqs(sid, { items: [], assignments: [{ id: 'a', status: 'blocked', workspace: { ...w.tasks[0], cleanup: { ...w.cleanup[0] } } }] });
    assert.ok(fs.existsSync(w.cleanup[0].root)); return w.cleanup[0].root;
  };
  const deleted = saveOpen('d');
  store.deleteSession('d');
  assert.equal(fs.existsSync(deleted), false, 'deleting a session reclaims its workspaces');
  const removed = saveOpen('r');
  store.removeProject('p2');
  assert.equal(fs.existsSync(removed), false, 'removing a project reclaims its sessions\' workspaces');
  console.log('workspace reclaim tests passed');
} finally { fs.rmSync(project, { recursive: true, force: true }); }
