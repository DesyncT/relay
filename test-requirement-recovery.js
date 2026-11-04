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
assert.equal(integration.kind, 'integration-interrupted');
assert.equal(integration.integrate, false, 'an interrupted integration is not launched a second time');
assert.equal(integration.assignments[0].integrationStatus, 'open');
assert.equal(integration.assignments[0].blocker, 'integration-interrupted');
const exhaustedIntegration = recoverRequirementAssignments([
  { id:'done', status:'passed', integrationStatus:'open', blocker:'integration-exhausted', files:['src/a.js'] },
], valid);
assert.equal(exhaustedIntegration.kind, 'integration-open');
assert.equal(exhaustedIntegration.assignments[0].blocker, 'integration-exhausted', 'recovery preserves an exhausted integration blocker');

const integrated = recoverRequirementAssignments([
  { id:'done', status:'passed', integrationStatus:'passed', files:['src/a.js'] },
], valid);
assert.equal(integrated.kind, 'integrated', 'persisted final integration is not duplicated');
const legacy = recoverRequirementAssignments([], valid);
assert.equal(legacy.kind, 'legacy', 'sessions without assignments retain the normal lane-resume path');
console.log('requirement recovery tests passed');
