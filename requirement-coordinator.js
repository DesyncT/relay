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
  let settled;
  function save(assignment) {
    persist(assignments);
    emit({ assignments, assignment });
  }
  function launch() {
    if (!settled) return;
    const max = Math.min(3, Math.max(1, Number(limit) || 3));
    const available = Math.max(0, max - active);
    const running = assignments.filter(a => a.status === 'running');
    const schedulable = [...running, ...assignments.filter(a => a.status === 'queued')];
    const waiting = workspaceMode === 'shared' ? schedulable.map(a => {
      const files = a.fileOwnership || a.files || [];
      return files.length ? a : { ...a, coordinatorOwned:true };
    }) : schedulable;
    const ready = workspaceMode === 'shared'
      ? readyAssignments(waiting, active + available).map(a => assignments.find(original => original.id === a.id))
      : waiting.filter(a => a.status === 'queued').slice(0, available);
    for (const a of ready) {
      if (active >= max) break;
      active++; a.status = 'running'; a.progress = 0; save(a);
      Promise.resolve().then(() => execute(a)).catch(error => {
        a.status = 'blocked'; a.blocker = 'worker-failed'; a.error = String(error?.message || error); a.ended = Date.now(); save(a);
      }).finally(() => {
        active--;
        launch();
        if (active === 0 && !assignments.some(x => x.status === 'queued' || x.status === 'running')) {
          const done = settled; settled = null; done?.(assignments);
        }
      });
    }
    if (active === 0 && !assignments.some(x => x.status === 'queued' || x.status === 'running')) {
      const done = settled; settled = null; done?.(assignments);
    }
  }
  async function execute(a) {
    while (a.status === 'running') {
      a.started = a.started || Date.now();
      let work;
      try { work = await runTask(a); }
      catch (error) { a.status = 'blocked'; a.blocker = 'worker-failed'; a.error = String(error?.message || error); a.ended = Date.now(); save(a); return; }
      a.changedPaths = [...new Set(Array.isArray(work?.paths) ? work.paths : [])];
      a.workerEvidence = work?.evidence ?? work?.text ?? '';
      a.progress = 80; save(a);
      let review;
      try { review = await reviewTask(a, work); }
      catch (error) { review = { verdict: 'UNKNOWN', evidence: String(error?.message || error) }; }
      const verdict = ['PASS', 'FAIL', 'UNKNOWN'].includes(String(review?.verdict).toUpperCase()) ? String(review.verdict).toUpperCase() : 'UNKNOWN';
      a.reviewAttempts = (a.reviewAttempts || 0) + 1;
      a.reviewEvidence = [...(a.reviewEvidence || []), { verdict, evidence: review?.evidence ?? review?.reason ?? '', at: Date.now(), reviewers: review?.reviewers || [] }];
      if (verdict === 'PASS') { a.status = 'passed'; a.progress = 100; a.blocker = null; a.ended = Date.now(); save(a); return; }
      if (verdict === 'UNKNOWN') { a.status = 'blocked'; a.blocker = 'review-unknown'; a.ended = Date.now(); save(a); return; }
      const route = nextRoute(a);
      if (!route) { a.status = 'open'; a.blocker = 'review-failed-exhausted'; a.ended = Date.now(); save(a); return; }
      a.provider = route.provider; a.model = route.model; a.effort = route.effort; a.escalationTier = route.escalationTier ?? ((a.escalationTier || 0) + 1);
      a.status = 'running'; a.progress = 0; a.blocker = null; save(a);
    }
  }
  function start(input) {
    if (settled) return Promise.reject(new Error('Requirement workflow is already running'));
    assignments = Array.isArray(input) ? input : [];
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
  return { start, get assignments() { return assignments; }, get workspaceMode() { return workspaceMode; } };
}

module.exports = { createRequirementCoordinator };
