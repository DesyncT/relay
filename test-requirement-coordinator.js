const assert = require('node:assert/strict');
const { createRequirementCoordinator } = require('./requirement-coordinator');

const task = (id, files = []) => ({ id, requirementIndex: Number(id), task: id, owner: 'claude', provider: 'claude', model: 'claude-haiku-5-5', effort: 'low', files, fileOwnership: files, status: 'queued', reviewAttempts: 0 });
async function schedulerPersistsBeforeStartingAndCapsConcurrency() {
  const events = [];
  let active = 0, max = 0;
  const c = createRequirementCoordinator({
    persist: assignments => events.push(['persist', assignments.map(x => x.status)]),
    emit: () => {}, limit: 3,
    runTask: async a => {
      assert.equal(events[0][0], 'persist', 'all assignments are persisted before worker launch');
      active++; max = Math.max(max, active); events.push(['run', a.id]);
      await new Promise(resolve => setTimeout(resolve, 5)); active--;
      return { paths: a.files, evidence: 'worker finished' };
    },
    reviewTask: async () => ({ verdict: 'PASS', evidence: 'reviewed' }),
  });
  const assignments = [1, 2, 3, 4].map(n => task(String(n), [`file-${n}.js`]));
  await c.start(assignments);
  assert.ok(max <= 3, `maximum concurrency was ${max}`);
  assert.equal(max, 3, 'three disjoint workers overlap');
  assert.ok(assignments.every(x => x.status === 'passed'));
}

async function sharedFolderSerializesOverlappingPaths() {
  let activeOnPath = 0, maxOnPath = 0, active = 0, max = 0;
  const c = createRequirementCoordinator({
    persist: () => {}, emit: () => {}, limit: 3, workspaceMode: 'shared',
    runTask: async a => { active++; max = Math.max(max, active); if (a.files.includes('same.js')) { activeOnPath++; maxOnPath = Math.max(maxOnPath, activeOnPath); } await new Promise(resolve => setTimeout(resolve, 5)); if (a.files.includes('same.js')) activeOnPath--; active--; return { paths:a.files }; },
    reviewTask: async () => ({ verdict:'PASS', evidence:'ok' }),
  });
  await c.start([task('1', ['same.js']), task('2', ['same.js']), task('3', ['other.js'])]);
  assert.equal(maxOnPath, 1, 'overlapping paths never run together in shared-folder mode');
  assert.equal(max, 2, 'disjoint task can overlap the path owner');
}

async function reviewEvidenceUnknownAndFailEscalation() {
  const calls = [];
  let firstReviews = 0;
  const c = createRequirementCoordinator({
    persist: () => {}, emit: () => {}, limit: 3,
    runTask: async a => { calls.push(['run', a.id, a.owner, a.provider, a.model, a.effort]); return { paths:[`${a.id}.js`], evidence:'worker evidence' }; },
    reviewTask: async a => { calls.push(['review', a.id, a.provider, a.reviewAttempts]); return a.id === '1' && firstReviews++ === 0 ? { verdict:'FAIL', evidence:'needs fix' } : a.id === '2' ? { verdict:'UNKNOWN', evidence:'review provider failed' } : { verdict:'PASS', evidence:'independent review' }; },
    nextRoute: a => a.reviewAttempts === 1 ? { provider:'codex', model:'gpt-6.1-sol', effort:'medium', escalationTier:1 } : null,
  });
  const assignments = [task('1'), task('2')];
  await c.start(assignments);
  assert.deepEqual(calls.filter(x => x[0] === 'review').map(x => x[1]), ['1','2','1'], 'every completed task is independently reviewed including retry');
  assert.equal(assignments[0].status, 'passed');
  assert.deepEqual(calls.find(x => x[0] === 'run' && x[1] === '1').slice(2), ['claude','claude','claude-haiku-5-5','low']);
  const retry = calls.find(x => x[0] === 'run' && x[1] === '1' && x[2] === 'claude');
  assert.ok(retry, 'the same owner retries after a FAIL');
  assert.equal(assignments[1].status, 'blocked', 'UNKNOWN prevents integration');
  assert.equal(assignments[1].blocker, 'review-unknown');
  assert.ok(assignments[0].workerEvidence && assignments[0].reviewEvidence, 'worker and reviewer evidence are retained');
}

async function exhaustedFailureStaysOpen() {
  const a = task('4');
  const c = createRequirementCoordinator({
    persist: () => {}, emit: () => {}, runTask: async () => ({ paths:['x.js'], evidence:'attempted' }),
    reviewTask: async () => ({ verdict:'FAIL', evidence:'still broken' }), nextRoute: () => null,
  });
  await c.start([a]);
  assert.equal(a.status, 'open', 'exhausted failed task stays open');
  assert.equal(a.blocker, 'review-failed-exhausted');
}

(async () => {
  await schedulerPersistsBeforeStartingAndCapsConcurrency();
  await sharedFolderSerializesOverlappingPaths();
  await reviewEvidenceUnknownAndFailEscalation();
  await exhaustedFailureStaysOpen();
  console.log('requirement coordinator tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
