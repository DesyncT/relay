'use strict';

const INTERRUPTED_INTEGRATION = new Set(['integrating', 'retrying', 'open']);

function canCleanupRequirementWorkspaces(assignments, integrationStatus) {
  const actionable = (Array.isArray(assignments) ? assignments : []).filter(a => a.actionable !== false);
  return actionable.length > 0 && actionable.every(a => a.status === 'passed') && integrationStatus === 'passed';
}

function recoverRequirementAssignments(input, validateWorkspace = () => false) {
  const assignments = Array.isArray(input) ? JSON.parse(JSON.stringify(input)) : [];
  if (!assignments.length) return { kind:'legacy', assignments };

  const actionable = assignments.filter(a => a.actionable !== false);
  if (actionable.length && actionable.every(a => a.integrationStatus === 'passed'))
    return { kind:'integrated', assignments, integrate:false };

  // an earlier failed combine ('open') runs again too: it now ends with the lead fixing what is left instead of a blocked list
  const inFlightIntegration = assignments.some(a => INTERRUPTED_INTEGRATION.has(a.integrationStatus));
  const priorIntegration = assignments.some(a => INTERRUPTED_INTEGRATION.has(a.integrationStatus) || a.integrationStatus === 'passed');
  if (priorIntegration && !inFlightIntegration) return { kind:'integration-open', assignments, integrate:false };
  // a restart cut the combine step off: run it again. Patches already applied (patchApplied) are not applied twice
  if (inFlightIntegration) {
    for (const a of assignments) if (a.actionable !== false && a.status === 'passed') { a.integrationStatus = 'pending'; a.blocker = null; }
    return { kind:'resume', assignments, integrate:true };
  }

  let hasActive = false;
  for (const a of assignments) {
    if (!['queued', 'running', 'reviewing'].includes(a.status)) continue;
    if (!a.workspace || a.workspace.assignmentId !== a.id || !validateWorkspace(a.workspace, a)) {
      a.status = 'open';
      a.blocker = 'workspace-unavailable';
      a.error = 'The saved task workspace is missing or no longer owned by this workflow.';
      continue;
    }
    hasActive = true;
    if (a.status === 'running') {
      a.recoveredFrom = 'running';
      a.status = 'queued';
      a.progress = 0;
    }
  }
  const readyToIntegrate = actionable.length > 0 && actionable.every(a => a.status === 'passed');
  return { kind:hasActive || readyToIntegrate ? 'resume' : 'open', assignments, integrate:hasActive || readyToIntegrate };
}

module.exports = { recoverRequirementAssignments, canCleanupRequirementWorkspaces };
