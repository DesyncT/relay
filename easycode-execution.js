'use strict';
const {createRequirementCoordinator}=require('./requirement-coordinator');
const {scopeCovers}=require('./requirement-workflow');
async function executeRequest(request,deps) {
  const scope=request.scope;
  const guard=()=>{if(deps.isCancelled())throw Object.assign(Error('Request cancelled; integration stopped.'),{cancelled:true});};
  const assignment={id:`easy-${request.id}`,requirementIndex:0,task:scope.summary,owner:deps.route.provider,...deps.route,files:scope.files,fileOwnership:scope.files,status:'queued',reviewEvidence:[]};
  const before=await deps.baseline();guard();
  if(before===null || before===undefined)throw Error('Cannot record a safe project baseline. Use a Git project root before running this change.');
  const workspace=await deps.createWorkspace(assignment);
  assignment.workspace=workspace;deps.save(assignment);guard();
  if(!workspace?.path || !workspace.isolated && workspace.mode!=='worktree' || workspace.blocked || workspace.path===deps.projectPath)throw Error('An isolated workspace is required.');
  const baselineChecks=await deps.check(workspace.path,scope.checks);guard();
  assignment.baselineChecks=baselineChecks;
  let changes;
  const coordinator=createRequirementCoordinator({limit:1,maxAttempts:2,requireChecks:true,workspaceMode:'worktree',persist:()=>deps.save(assignment),
    runTask:async a=>{
      guard();
      const prompt=`Implement this exact confirmed change: ${scope.summary}\nOriginal request: ${request.originalRequest || ''}\nAnswers: ${JSON.stringify(request.history || [])}\nPreserve: ${JSON.stringify(scope.preserve)}\nAcceptance: ${JSON.stringify(scope.acceptance)}\nOwned repository paths: ${JSON.stringify(scope.files)}\nChecks: ${JSON.stringify(scope.checks)}\nWork only in this isolated workspace and these paths. Never deploy, push, publish, edit remote data or delegate to other workers. Do not broaden scope. If an unresolved product choice prevents the change, stop and report it. Post brief plain-language progress updates before tools, describing what you are checking, findings, changes and tests. Explain practical reasons without private internal reasoning. Report changes and checks honestly.\n${a.reviewEvidence.length ? `Repair only the failed checks: ${JSON.stringify(a.reviewEvidence.at(-1))}` : ''}`;
      await deps.work(a,prompt);guard();
      changes=await deps.collect(workspace);guard();
      if(changes.paths.some(file=>!scope.files.some(owned=>scopeCovers(owned,file))))throw Object.assign(Error('Worker changed files outside the confirmed scope.'),{nonRetryable:true});
      a.patch=Buffer.from(changes.patch || []).toString('base64');
      const checks=await deps.check(workspace.path,scope.checks);guard();
      return {paths:changes.paths,checks,checkEvidence:JSON.stringify(checks),evidence:'See scoped diff and recorded command results.'};
    },
    reviewTask:async(a,work)=>{guard();if(!work.checks?.length || work.checks.some(c=>c.exitCode!==0))return {verdict:'FAIL',evidence:JSON.stringify(work.checks)};const review=await deps.review(a,workspace.path,scope,work);guard();return review;}
  });
  await coordinator.start([assignment]);guard();
  const attempts=assignment.implementationAttempts || 0;
  if(assignment.status!=='passed')return {integrated:false,attempts,checks:assignment.commandEvidence || [],paths:changes?.paths || [],error:assignment.error || `Checks or review did not pass after ${attempts} attempt(s). Work retained in ${workspace.path}`};
  const verifiedChanges=await deps.collect(workspace);guard();
  if(verifiedChanges.paths.some(file=>!scope.files.some(owned=>scopeCovers(owned,file))))throw Error('Verification edited files outside the confirmed scope.');
  if(!Buffer.from(verifiedChanges.patch || []).equals(Buffer.from(changes.patch || [])))throw Error('Verification changed the reviewed patch. Review the retained workspace before retrying.');
  changes=verifiedChanges;
  if(!await deps.unchanged(before))throw Error('Project files changed during the fix. Saved worker changes need review before integration.');
  guard();
  const conflicts=await deps.integrate({...changes,scope:scope.files});guard();
  if(conflicts?.length)throw Error(`Integration conflict. Work retained in ${workspace.path}: ${JSON.stringify(conflicts)}`);
  assignment.patchApplied=true;assignment.integrationStatus='verifying';deps.save(assignment);
  const checks=await deps.check(deps.projectPath,scope.checks);guard();
  let review={verdict:'FAIL',evidence:'Integrated checks failed or unavailable.'};
  if(checks.length && checks.every(c=>c.exitCode===0))review=await deps.review(assignment,deps.projectPath,scope,{paths:changes.paths,checks});
  if(deps.verifyIntegrated && !await deps.verifyIntegrated())review={verdict:'FAIL',evidence:'Project files changed during integrated verification. Review the retained changes.'};
  guard();assignment.integrationStatus=review.verdict==='PASS'?'passed':'open';assignment.integratedChecks=checks;assignment.integrationFindings=review.evidence;deps.save(assignment);
  return {integrated:true,attempts,checks,paths:changes.paths,review:review.verdict,error:review.verdict==='PASS'?null:`Integrated verification failed. Changes remain available; review before retrying. ${review.evidence || ''}`};
}
module.exports={executeRequest};
