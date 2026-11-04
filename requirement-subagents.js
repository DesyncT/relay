// Checklist workers share the existing subagent surface; their assignment stays the source of truth.
function requirementSubagents(sid,reqs) {
  return (reqs?.assignments || []).map(a=>{
    const needsReview=a.blocker==='review-unknown', stopped=a.blocker==='cancelled', integrationOpen=a.integrationStatus==='open';
    const route=integrationOpen ? a.integrationRoute || a : a;
    const status=stopped ? 'stopped' : integrationOpen ? 'failed' : a.status==='passed' ? 'done' : ['running','reviewing'].includes(a.status) ? 'running' : a.status==='queued' ? 'queued' : 'failed';
    const reviews=(a.reviewEvidence || []).filter(Boolean).map(review=>review.evidence).filter(Boolean).join('\n');
    return {id:`req:${sid}:${a.id}`,sid,kind:'requirement',assignmentId:a.id,requirementIndex:a.requirementIndex,parent:a.owner,owner:route.provider,
      title:`${Number(a.requirementIndex)+1}. ${reqs.items?.[a.requirementIndex]?.t || a.task || 'Checklist task'}`,
      task:a.task || reqs.items?.[a.requirementIndex]?.t || '',status,
      stateLabel:integrationOpen ? 'Integration needs attention' : needsReview ? 'Needs verification' : a.status==='reviewing' ? 'Reviewing' : undefined,
      model:route.model,effort:route.effort,started:a.started || a.ended || Date.now(),ended:a.ended || 0,
      result:integrationOpen ? a.integrationFindings || 'Integration could not be verified.' : needsReview ? reviews || 'The reviewer could not verify the result.' : a.error || a.workerEvidence || reviews || '',
      files:a.changedPaths || [],tokensIn:(a.usage?.input || 0)+(a.usage?.cached || 0),tokensOut:a.usage?.output || 0,cost:a.usage?.cost || 0};
  });
}
module.exports={requirementSubagents};
