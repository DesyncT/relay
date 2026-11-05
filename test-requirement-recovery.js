const assert = require('node:assert/strict');
const { recoverRequirementAssignments } = require('./requirement-recovery');

const valid = () => true;
const resumed = recoverRequirementAssignments([
  { id:'running', status:'running', files:['src/a.js'], workspace:{ assignmentId:'running', path:'temp-a' } },
  { id:'reviewing', status:'reviewing', files:['src/b.js'], workspace:{ assignmentId:'reviewing', path:'temp-b' } },
  { id:'passed', status:'passed', files:['src/c.js'], workspace:{ assignmentId:'passed', path:'temp-c' } },
], valid);
assert.equal(resumed.kind, 'resume');
assert.equal(resumed.assignments[0].status, 'queued', 'interrupted worker restarts from its persisted workspace');
assert.equal(resumed.assignments[1].status, 'reviewing', 'interrupted review resumes review without marking it passed');
assert.equal(resumed.assignments[2].status, 'passed', 'already reviewed tasks retain their passed state');

const invalid = recoverRequirementAssignments([
  { id:'missing', status:'running', files:['src/a.js'], workspace:null },
], () => false);
assert.equal(invalid.kind, 'open');
assert.equal(invalid.assignments[0].status, 'open');
assert.equal(invalid.assignments[0].blocker, 'workspace-unavailable');
assert.match(invalid.assignments[0].error, /workspace/i);

const integration = recoverRequirementAssignments([
  { id:'done', status:'passed', integrationStatus:'integrating', files:['src/a.js'] },
], valid);
assert.equal(integration.kind, 'resume', 'a combine step cut off by a restart runs again');
assert.equal(integration.integrate, true);
assert.equal(integration.assignments[0].integrationStatus, 'pending');
assert.equal(integration.assignments[0].blocker, null);
const exhaustedIntegration = recoverRequirementAssignments([
  { id:'done', status:'passed', integrationStatus:'open', blocker:'integration-exhausted', files:['src/a.js'] },
], valid);
assert.equal(exhaustedIntegration.kind, 'resume', 'a failed combine runs again after a restart');
assert.equal(exhaustedIntegration.integrate, true);
assert.equal(exhaustedIntegration.assignments[0].blocker, null);

const integrated = recoverRequirementAssignments([
  { id:'done', status:'passed', integrationStatus:'passed', files:['src/a.js'] },
], valid);
assert.equal(integrated.kind, 'integrated', 'persisted final integration is not duplicated');
const legacy = recoverRequirementAssignments([], valid);
assert.equal(legacy.kind, 'legacy', 'sessions without assignments retain the normal lane-resume path');

const { canCleanupRequirementWorkspaces } = require('./requirement-recovery');
assert.equal(canCleanupRequirementWorkspaces([{ actionable:true, status:'open' }], 'passed'), false, 'open tasks retain their owned workspaces');
assert.equal(canCleanupRequirementWorkspaces([{ actionable:true, status:'blocked' }], 'passed'), false, 'blocked tasks retain their owned workspaces');
assert.equal(canCleanupRequirementWorkspaces([{ actionable:true, status:'passed' }], 'open'), false, 'failed integration retains workspaces for inspection and retry');
assert.equal(canCleanupRequirementWorkspaces([{ actionable:true, status:'passed' }], 'passed'), true, 'only successful integration permits cleanup');
console.log('requirement recovery tests passed');
