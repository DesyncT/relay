'use strict';

const { readyAssignments } = require('./requirement-workflow');
const hasExplicitScope = assignment => {
  const files = assignment.fileOwnership || assignment.files || [];
  if (!Array.isArray(files)) return false;
  return files.some(file => {
    if (typeof file !== 'string' || !file.trim()) return false;
    const normalized = file.trim().replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
    return normalized && normalized !== '.' && !normalized.split('/').includes('..') && !normalized.startsWith('/') && !/^[a-zA-Z]:\//.test(normalized);
  });
};

function createRequirementCoordinator({ persist = () => {}, emit = () => {}, runTask, reviewTask, nextRoute = () => null, limit = 3, workspaceMode = 'worktree' }) {
  let assignments = [];
  let active = 0;
  const inFlight = new Set(); // ids whose execute() is running; only a recovered 'reviewing' task (not in flight) resumes
  let settled;
  let cancelled=false;
  function save(assignment) {
    persist(assignments);
    emit({ assignments, assignment });
  }
  const routeKey = a => [a.provider,a.model,a.effort].join(':');
  function retry(a, reason, error) {
    if (error?.cancelled || error?.nonRetryable) return false;
    const route = nextRoute(a, {reason,error});
    if (!route || (a.attemptedRoutes || []).some(previous=>routeKey(previous)===routeKey(route))) return false;
    Object.assign(a, {provider:route.provider,model:route.model,effort:route.effort,
      escalationTier:route.escalationTier ?? ((a.escalationTier || 0)+1),status:'running',progress:0,blocker:null,error:null});
    save(a); return true;
  }
  function launch() {
    if (!settled) return;
    const max = Math.max(1, Number(limit) || 3);
    const available = Math.max(0, max - active);
    const running = assignments.filter(a => a.status === 'running' || inFlight.has(a.id)).map(a => a.status === 'running' ? a : { ...a, status:'running' });
    const waitingTasks = assignments.filter(a => !inFlight.has(a.id) && (a.status === 'queued' || a.status === 'reviewing'));
    const schedulable = [...running, ...waitingTasks.map(a => ({ ...a, status:'queued' }))];
    const waiting = workspaceMode === 'shared' ? schedulable.map(a => {
      const files = a.fileOwnership || a.files || [];
      return files.length ? a : { ...a, coordinatorOwned:true };
    }) : schedulable;
    const ready = workspaceMode === 'shared'
      ? readyAssignments(waiting, active + available).map(a => assignments.find(original => original.id === a.id))
      : waiting.filter(a => a.status === 'queued').slice(0, available).map(a => assignments.find(original => original.id === a.id));
    for (const a of ready) {
      if (active >= max) break;
      if (inFlight.has(a.id)) continue;
      inFlight.add(a.id); active++; if (a.status !== 'reviewing') { a.status = 'running'; a.progress = 0; } save(a);
      Promise.resolve().then(() => execute(a)).catch(error => {
        a.status = 'blocked'; a.blocker = 'worker-failed'; a.error = String(error?.message || error); a.ended = Date.now(); save(a);
      }).finally(() => {
        inFlight.delete(a.id); active--;
        launch();
        if (active === 0 && !assignments.some(x => x.status === 'queued' || x.status === 'running' || x.status === 'reviewing')) {
          const done = settled; settled = null; done?.(assignments);
        }
      });
    }
    if (active === 0 && !assignments.some(x => x.status === 'queued' || x.status === 'running' || x.status === 'reviewing')) {
      const done = settled; settled = null; done?.(assignments);
    }
  }
  async function execute(a) {
    while (!cancelled && (a.status === 'running' || a.status === 'reviewing')) {
      a.started = a.started || Date.now();
      let work;
      if (a.status === 'reviewing') {
        work = { paths:a.changedPaths || [], evidence:a.workerEvidence || '', checkEvidence:a.checkEvidence || '' };
      } else {
        a.attemptedRoutes = [...(a.attemptedRoutes || []), {provider:a.provider,model:a.model,effort:a.effort,at:Date.now()}];
        try { work = await runTask(a); }
        catch (error) {
          if (cancelled) return;
          a.workerFailures = [...(a.workerFailures || []), {provider:a.provider,model:a.model,error:String(error?.message || error),at:Date.now()}];
          if (retry(a,'worker-failed',error)) continue;
          a.status = 'blocked'; a.blocker = error?.cancelled ? 'cancelled' : 'worker-failed'; a.error = String(error?.message || error); a.ended = Date.now(); save(a); return;
        }
        if (cancelled) return;
        a.changedPaths = [...new Set(Array.isArray(work?.paths) ? work.paths : [])];
        a.workerEvidence = work?.evidence ?? work?.text ?? '';
        a.checkEvidence = work?.checkEvidence || '';
        a.status = 'reviewing'; a.progress = 90; save(a);
      }
      let review;
      try { review = await reviewTask(a, work); }
      catch (error) { review = { verdict: 'UNKNOWN', evidence: String(error?.message || error) }; }
      if (cancelled) return;
      const verdict = ['PASS', 'FAIL', 'UNKNOWN'].includes(String(review?.verdict).toUpperCase()) ? String(review.verdict).toUpperCase() : 'UNKNOWN';
      a.reviewAttempts = (a.reviewAttempts || 0) + 1;
      a.reviewEvidence = [...(a.reviewEvidence || []), { verdict, evidence: review?.evidence ?? review?.reason ?? '', at: Date.now(), reviewers: review?.reviewers || [] }];
      if (verdict === 'PASS') { a.status = 'passed'; a.progress = 100; a.blocker = null; a.ended = Date.now(); save(a); return; }
      if (verdict === 'UNKNOWN') { a.status = 'blocked'; a.blocker = 'review-unknown'; a.ended = Date.now(); save(a); return; }
      if (!retry(a,'review-failed')) { a.status = 'open'; a.blocker = 'review-failed-exhausted'; a.ended = Date.now(); save(a); return; }
    }
  }
  function start(input) {
    if (settled) return Promise.reject(new Error('Requirement workflow is already running'));
    assignments = Array.isArray(input) ? input : [];
    cancelled=false;
    for (const assignment of assignments) if (!hasExplicitScope(assignment)) {
      assignment.status = 'blocked'; assignment.blocker = 'missing-file-scope'; assignment.coordinatorOwned = true;
    }
    // This synchronous write is intentionally before launch() can start any worker.
    persist(assignments);
    emit({ assignments, assignment: null });
    const promise = new Promise(resolve => { settled = resolve; });
    launch();
    if (!assignments.length) { const done = settled; settled = null; done?.(assignments); }
    return promise;
  }
  function cancel() {
    cancelled=true;
    for(const assignment of assignments) if(['queued','running','reviewing'].includes(assignment.status)) {
      Object.assign(assignment,{status:'blocked',blocker:'cancelled',ended:Date.now()});
    }
    persist(assignments); emit({assignments,assignment:null}); launch();
  }
  return { start, cancel, get assignments() { return assignments; }, get workspaceMode() { return workspaceMode; } };
}

const integrationRuns = new WeakMap();
function selectIndependentReviewers(availableProviders, integratorProvider, limit = Infinity) {
  const cap = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : Infinity;
  return [...new Set(Array.isArray(availableProviders) ? availableProviders : [])]
    .filter(provider => provider && provider !== integratorProvider).slice(0, cap);
}
async function runRequirementIntegration(input, { integrate, review, nextRoute = () => null, persist = () => {} } = {}) {
  const assignments = Array.isArray(input) ? input : [];
  if (!assignments.length || assignments.some(a => a.actionable !== false && a.status !== 'passed'))
    return { status:'open', blocker:'assignments-not-passed' };
  const existing = integrationRuns.get(assignments);
  if (existing) return existing;
  const promise = (async () => {
    const passed = assignments.filter(a => a.actionable !== false && a.status === 'passed');
    const changes = passed.map(a => ({ assignmentId:a.id, paths:[...(a.changedPaths || [])], scope:[...(a.fileOwnership || a.files || [])], patch:Buffer.from(a.patch || '', 'base64') }));
    let integrator = { ...passed[0], ...(passed[0].integrationRoute || {}), attemptedRoutes:[], retryCount:0 }, findings = '';
    for (const a of passed) a.integrationStatus='integrating';
    persist(assignments);
    for (;;) {
      let integrated;
      let failure;
      integrator.attemptedRoutes = [...(integrator.attemptedRoutes || []), {provider:integrator.provider,model:integrator.model,effort:integrator.effort}];
      try { integrated = await integrate(integrator, changes); }
      catch (error) { failure=error; integrated = { checksPassed:false, evidence:String(error?.message || error) }; }
      if (!integrated?.checksPassed) {
        findings = integrated?.evidence || 'Full project checks did not pass.';
      } else {
        let finalReview;
        try { finalReview = await review(integrator, changes, integrated); }
        catch (error) { finalReview = { verdict:'UNKNOWN', evidence:String(error?.message || error) }; }
        const verdict = String(finalReview?.verdict || 'UNKNOWN').toUpperCase();
        if (verdict === 'PASS') {
          const result = { status:'passed', integrator, changes, checks:integrated, review:finalReview };
          for (const a of passed) { a.integrationStatus='passed'; a.blocker=null; }
          persist(assignments); return result;
        }
        findings = finalReview?.evidence || `Final review returned ${verdict}.`;
        if (verdict === 'UNKNOWN') break;
      }
      if (!integrated?.checksPassed || String(integrated?.verdict || '').toUpperCase() === 'FAIL') {
        // Check failures may be repaired on a stronger integration route too.
      }
      if (failure?.cancelled || failure?.nonRetryable) break;
      const route = nextRoute(integrator,{reason:failure ? 'worker-failed' : 'review-failed',error:failure});
      if (!route) break;
      integrator = { ...integrator, ...route, retryCount:(integrator.retryCount || 0) + 1, integrationStatus:'retrying', previousFindings:findings };
      for (const a of passed) a.integrationStatus='retrying';
      persist(assignments);
      // Every retry returns through integrate(), which reruns the complete check suite before a fresh review.
    }
    for (const a of passed) { a.integrationStatus='open'; a.blocker='integration-exhausted'; a.integrationFindings=findings; a.integrationRoute={provider:integrator.provider,model:integrator.model,effort:integrator.effort}; }
    persist(assignments);
    return { status:'open', blocker:'integration-exhausted', findings, integrator, changes };
  })().then(result => {
    if (result.status !== 'passed') integrationRuns.delete(assignments);
    return result;
  });
  integrationRuns.set(assignments, promise);
  return promise;
}

module.exports = { createRequirementCoordinator, runRequirementIntegration, selectIndependentReviewers };
