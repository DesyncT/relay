const assert = require('node:assert/strict');
const { createRequirementCoordinator } = require('./requirement-coordinator');
const { createAssignments } = require('./requirement-workflow');
async function stopOneWorkerKeepsSiblingRunning() {
  const gates={},reviews=[];
  const first=task('first'),second=task('second');
  const coordinator=createRequirementCoordinator({limit:2,runTask:async a=>{await new Promise(resolve=>{gates[a.id]=resolve;});return {paths:a.files};},reviewTask:async a=>{reviews.push(a.id);return {verdict:'PASS'};}});
  const completion=coordinator.start([first,second]);await Promise.resolve();
  assert.ok(first.started>0,'Published running subagents have a real start time');
  assert.equal(coordinator.stopTask('first'),true);gates.first();
  assert.equal(second.status,'running');gates.second();await completion;
  assert.equal(first.blocker,'cancelled');assert.equal(second.status,'passed');assert.deepEqual(reviews,['second']);
}
async function retryFailedWorkerWhileSiblingRuns() {
  let release,blocked,passed,attempts=0;
  const blockedReady=new Promise(resolve=>{blocked=resolve;}), retried=new Promise(resolve=>{passed=resolve;});
  const failed=task('failed'), sibling=task('sibling');
  const c=createRequirementCoordinator({limit:2,
    persist:()=>{if(failed.status==='blocked')blocked();if(failed.status==='passed')passed();},
    runTask:async a=>{if(a.id==='failed'){if(++attempts===1)throw new Error('temporary error');}else await new Promise(resolve=>{release=resolve;});return {paths:a.files};},
    reviewTask:async()=>({verdict:'PASS'}),
  });
  const completion=c.start([failed,sibling]);
  await blockedReady;
  assert.equal(c.queueRetry({...failed,status:'queued',blocker:null,error:null}),true);
  await retried;
  assert.equal(sibling.status,'running','Retry is independent of a running sibling');
  assert.equal(attempts,2);
  release();await completion;
  assert.ok(c.assignments.every(a=>a.status==='passed'));
}

const task = (id, files = [`${id}.js`]) => ({ id, requirementIndex: Number(id), task: id, owner: 'claude', provider: 'claude', model: 'claude-haiku-5-5', effort: 'low', files, fileOwnership: files, status: 'queued', reviewAttempts: 0 });
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
  // Relay passes the task count as the limit, so nine independent tasks all run together
  let wide = 0, wideMax = 0;
  const all = createRequirementCoordinator({ persist: () => {}, emit: () => {}, limit: 9,
    runTask: async a => { wide++; wideMax = Math.max(wideMax, wide); await new Promise(resolve => setTimeout(resolve, 10)); wide--; return { paths: a.files }; },
    reviewTask: async () => ({ verdict: 'PASS' }) });
  await all.start([1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => task(String(n), [`all-${n}.js`])));
  assert.equal(wideMax, 9, 'all nine independent tasks run at once');
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
  const reviewsOf = (id) => calls.filter(x => x[0] === 'review' && x[1] === id).length;
  assert.equal(reviewsOf('1'), 2, 'every completed task is independently reviewed including retry');
  assert.equal(reviewsOf('2'), 2, 'an inconclusive review is asked once more before the task stops');
  assert.equal(assignments[0].status, 'passed');
  assert.deepEqual(calls.find(x => x[0] === 'run' && x[1] === '1').slice(2), ['claude','claude','claude-haiku-5-5','low']);
  const retry = calls.find(x => x[0] === 'run' && x[1] === '1' && x[2] === 'claude');
  assert.ok(retry, 'the same owner retries after a FAIL');
  assert.equal(assignments[1].status, 'blocked', 'UNKNOWN prevents integration');
  assert.equal(assignments[1].blocker, 'review-unknown');
  assert.ok(assignments[0].workerEvidence && assignments[0].reviewEvidence, 'worker and reviewer evidence are retained');
}

async function unknownRetriesOnStrongerRoute() {
  const a = task('7'), runs = [];
  let reviews = 0;
  const c = createRequirementCoordinator({
    persist: () => {}, emit: () => {},
    runTask: async x => { runs.push(x.model); return { paths:['7.js'], evidence:'done' }; },
    reviewTask: async () => (++reviews <= 2 ? { verdict:'UNKNOWN', evidence:'could not verify' } : { verdict:'PASS', evidence:'verified' }),
    nextRoute: () => ({ provider:'claude', model:'claude-sonnet-5-5', effort:'medium' }),
  });
  await c.start([a]);
  assert.deepEqual(runs, ['claude-haiku-5-5', 'claude-sonnet-5-5'], 'after two inconclusive reviews the task reruns on a stronger route by itself');
  assert.equal(a.status, 'passed');
}

async function exhaustedFailureStaysOpen() {
  const a = task('4');
  const c = createRequirementCoordinator({
    persist: () => {}, emit: () => {}, runTask: async () => ({ paths:['x.js'], evidence:'attempted' }),
    reviewTask: async () => ({ verdict:'FAIL', evidence:'still broken' }), nextRoute: () => null,
  });
  await c.start([a]);
  assert.equal(a.status, 'passed', 'with every round used up the task passes instead of blocking');
  assert.equal(a.passedWithNotes, 'still broken', 'the last findings stay visible as notes');
}

async function failGetsFixRoundStrongerModelThenDebugger() {
  const a = task('8'), runs = [];
  let stronger = false;
  const c = createRequirementCoordinator({
    persist: () => {}, emit: () => {},
    runTask: async x => { runs.push(`${x.model}:${x.task}`); return { paths:['8.js'], evidence:'done' }; },
    reviewTask: async () => ({ verdict:'FAIL', evidence:'CHECK: back button = FAIL' }),
    nextRoute: x => stronger || x.model !== 'claude-haiku-5-5' ? null : (stronger = true, { provider:'claude', model:'claude-sonnet-5-5', effort:'low' }),
    autoFix: async () => 'Fix the prev branch in keuzehulp.php',
  });
  await c.start([a]);
  assert.deepEqual(runs, ['claude-haiku-5-5:8', 'claude-haiku-5-5:8', 'claude-sonnet-5-5:8', 'claude-sonnet-5-5:8', 'claude-sonnet-5-5:Fix the prev branch in keuzehulp.php'],
    'a FAIL gets a fix round on the same model, then the stronger model with its own fix round, then the debugger prompt');
  assert.equal(a.status, 'passed', 'after all of that it passes with notes instead of blocking');
  assert.equal(a.passedWithNotes, 'CHECK: back button = FAIL');
  assert.equal(a.debugPrompt, 'Fix the prev branch in keuzehulp.php');
}

async function unscopedFallbackNeverStarts() {
  const a = { ...task('4'), files:[], fileOwnership:[], status:'queued', blocker:null };
  let starts = 0;
  const c = createRequirementCoordinator({
    persist: () => {}, emit: () => {}, runTask: async () => { starts++; return { paths:['whole-repo.js'], evidence:'unsafe' }; },
    reviewTask: async () => ({ verdict:'PASS', evidence:'should never run' }),
  });
  await c.start([a]);
  assert.equal(a.status, 'blocked');
  assert.equal(a.blocker, 'missing-file-scope');
  assert.equal(starts, 0, 'unscoped fallback never reaches the worker runner');
  assert.deepEqual(a.changedPaths, undefined, 'unscoped fallback never produces a collectable patch');
}

async function recoveringReviewDoesNotRerunWorker() {
  const a = task('5'); a.status = 'reviewing'; a.changedPaths = ['5.js']; a.workerEvidence = 'completed worker output';
  let workers = 0, reviewers = 0;
  const c = createRequirementCoordinator({
    persist: () => {}, emit: () => {},
    runTask: async () => { workers++; return { paths:[], evidence:'' }; },
    reviewTask: async (_assignment, work) => { reviewers++; assert.equal(work.evidence, 'completed worker output'); return { verdict:'PASS', evidence:'review resumed' }; },
  });
  await c.start([a]);
  assert.equal(workers, 0, 'interrupted reviewing assignment resumes at its review step');
  assert.equal(reviewers, 1);
  assert.equal(a.status, 'passed');
}

(async () => {
  await retryFailedWorkerWhileSiblingRuns();
  await stopOneWorkerKeepsSiblingRunning();
  await schedulerPersistsBeforeStartingAndCapsConcurrency();
  await sharedFolderSerializesOverlappingPaths();
  await reviewEvidenceUnknownAndFailEscalation();
  await exhaustedFailureStaysOpen();
  await failGetsFixRoundStrongerModelThenDebugger();
  await unknownRetriesOnStrongerRoute();
  await unscopedFallbackNeverStarts();
  await recoveringReviewDoesNotRerunWorker();
  await singleIntegrationRequiresAllPassAndFinalGates();
  await integrationNeedsChecksAndIndependentReview();
  await finalFailEscalatesAndCeilingReportsFindings();
  await sameProviderCannotFinalReview();
  await inFlightReviewIsNotRelaunched();
  console.log('requirement coordinator tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

async function singleIntegrationRequiresAllPassAndFinalGates() {
  const { runRequirementIntegration } = require('./requirement-coordinator');
  const assignments = [task('1'), task('2')];
  assignments[0].status = 'passed'; assignments[0].patch = Buffer.from('one').toString('base64');
  assignments[1].status = 'running'; assignments[1].patch = Buffer.from('two').toString('base64');
  assignments.push({ ...task('3'), actionable:false, status:'blocked', patch:Buffer.from('must not apply').toString('base64') });
  let integrations = 0;
  const opts = { integrate: async (_integrator, changes) => { integrations++; return { changes, checksPassed:true }; }, review: async () => ({ verdict:'PASS' }), nextRoute:()=>null };
  const early = await runRequirementIntegration(assignments, opts);
  assert.equal(early.status, 'open'); assert.equal(integrations, 0, 'no integrator runs before all actionable assignments pass');
  assignments[1].status = 'passed';
  const result = await runRequirementIntegration(assignments, opts);
  assert.equal(result.status, 'passed'); assert.equal(integrations, 1, 'one integrator handles all passed task changes');
  assert.deepEqual(result.changes.map(x => x.assignmentId), ['1','2']);
  assert.ok(result.changes.every(x => Buffer.isBuffer(x.patch)), 'base64 patches are converted to Buffers');
  const again = await Promise.all([runRequirementIntegration(assignments, opts), runRequirementIntegration(assignments, opts)]);
  assert.ok(again.every(x => x.status === 'passed')); assert.equal(integrations, 1, 'parallel duplicate calls share one successful integration');
}

async function integrationNeedsChecksAndIndependentReview() {
  const { runRequirementIntegration } = require('./requirement-coordinator');
  const assignments = [task('1')]; assignments[0].status = 'passed'; assignments[0].patch = '';
  let reviews = 0;
  let r = await runRequirementIntegration(assignments, { integrate:async()=>({checksPassed:false}), review:async()=>{reviews++; return {verdict:'PASS'}}, nextRoute:()=>null });
  assert.equal(r.status, 'open'); assert.equal(reviews, 0, 'review is not run when full checks fail');
  r = await runRequirementIntegration(assignments, { integrate:async()=>({checksPassed:true}), review:async()=>{reviews++; return {verdict:'UNKNOWN'}}, nextRoute:()=>null });
  assert.equal(r.status, 'open'); assert.equal(reviews, 1, 'full checks still require independent review');
}

async function finalFailEscalatesAndCeilingReportsFindings() {
  const { runRequirementIntegration } = require('./requirement-coordinator');
  const assignments = [task('1')]; assignments[0].status = 'passed';
  const routes = [];
  const r = await runRequirementIntegration(assignments, { integrate:async(integrator)=>{routes.push(integrator.model); return {checksPassed:true};}, review:async()=>routes.length===1 ? {verdict:'FAIL',evidence:'FILE: app.js\nLINE: 9\nACTUAL: wrong\nEXPECTED: right'} : {verdict:'FAIL',evidence:'FILE: app.js\nLINE: 10\nACTUAL: still wrong\nEXPECTED: right'}, nextRoute: a=>a.retryCount ? null : {provider:'codex',model:'gpt-6.1-sol',effort:'medium'} });
  assert.equal(routes.length, 2, 'final FAIL retries integration with a stronger route');
  assert.equal(routes[1], 'gpt-6.1-sol');
  assert.deepEqual(assignments[0].integrationRoute,{provider:'codex',model:'gpt-6.1-sol',effort:'medium'},'Manual retry must remember the actual last integration model');
  assert.equal(r.status, 'open'); assert.match(r.blocker, /exhaust/); assert.match(r.findings, /still wrong/);
}

async function sameProviderCannotFinalReview() {
  const { runRequirementIntegration, selectIndependentReviewers } = require('./requirement-coordinator');
  const reviewers = selectIndependentReviewers(['claude'], 'claude', 2);
  assert.deepEqual(reviewers, [], 'integrator provider cannot review its own integration');
  const assignments = [task('1')]; assignments[0].status = 'passed';
  const result = await runRequirementIntegration(assignments, {
    integrate:async()=>({checksPassed:true}),
    review:async integrator => selectIndependentReviewers([integrator.provider], integrator.provider, 2).length
      ? { verdict:'PASS' } : { verdict:'UNKNOWN', evidence:'No independent reviewer provider is available.' },
  });
  assert.equal(result.status, 'open', 'a same-provider verdict cannot complete requirements');
  assert.match(result.findings, /No independent reviewer/);
}

// A task mid-review must not be relaunched when a sibling finishes (it would be reviewed twice and take a second slot)
async function inFlightReviewIsNotRelaunched() {
  const reviews = {}, runs = {};
  const c = createRequirementCoordinator({
    persist: () => {}, emit: () => {}, limit: 3,
    runTask: async a => { runs[a.id] = (runs[a.id] || 0) + 1; return { paths: a.files }; },
    reviewTask: async a => { reviews[a.id] = (reviews[a.id] || 0) + 1; await new Promise(resolve => setTimeout(resolve, a.id === '2' ? 60 : 5)); return { verdict: 'PASS' }; },
  });
  const assignments = [task('1'), task('2')];
  await c.start(assignments);
  assert.deepEqual(reviews, { 1: 1, 2: 1 }, 'each task is reviewed exactly once');
  assert.deepEqual(runs, { 1: 1, 2: 1 }, 'each worker runs exactly once');
  assert.ok(assignments.every(x => x.status === 'passed'));
}
