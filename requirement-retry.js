'use strict';
const {nextWorkerRoute} = require('./worker-routing');

function prepareRequirementRetry(assignment,{alternate=false,routes={},available=[]}={}) {
  const integrationOpen=assignment?.status==='passed' && assignment.integrationStatus==='open';
  if (!assignment || (!integrationOpen && !['blocked','open'].includes(assignment.status)))
    throw new Error('Only blocked or open requirements can be retried.');
  const current=integrationOpen ? assignment.integrationRoute || assignment : assignment;
  let route={provider:current.provider,model:current.model,effort:current.effort};
  if (alternate) {
    // Discard previous attempts, but an effort-only change is not another model.
    const attemptedRoutes=['low','medium'].map(effort=>({...route,effort}));
    route=nextWorkerRoute({...current,attemptedRoutes},routes,available,{reason:'worker-failed'});
    if (!route) throw new Error('No alternative model or provider is available for this requirement.');
  } else if (!available.includes(route.provider)) {
    throw new Error('This provider is unavailable. Choose another model or enable the provider.');
  }
  const retry={...assignment,attemptedRoutes:[],blocker:null,error:null,ended:null,progress:0};
  if (integrationOpen) return {...retry,status:'passed',integrationRoute:route,integrationStatus:'pending',integrationFindings:null};
  return {...retry,...route,status:!alternate && assignment.blocker==='review-unknown' ? 'reviewing' : 'queued'};
}

module.exports={prepareRequirementRetry};
