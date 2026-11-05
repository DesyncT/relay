'use strict';
const { randomUUID } = require('node:crypto');
const copy = value => structuredClone(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 12000;
const strings = value => Array.isArray(value) && value.every(text);
function createRequest(originalRequest) {
  if (!text(originalRequest)) throw Error('Describe what you want to change.');
  return {id:randomUUID(),revision:0,state:'inspecting',originalRequest,history:[],inspection:'',scope:null,confirmedRevision:null,attempts:0,changedPaths:[],evidence:[]};
}
function validateDiscovery(value) {
  if (!value || typeof value !== 'object') throw Error('Invalid discovery response');
  if (value.kind === 'question') {
    if (!text(value.question) || !strings(value.options) || value.options.length < 2 || value.options.length > 4 || new Set(value.options).size !== value.options.length) throw Error('Invalid question or options');
    if(typeof value.decisionKey!=='string' || !/^[a-z][a-z0-9.-]{0,79}$/.test(value.decisionKey) || !text(value.unresolved))throw Error('A question needs a stable decisionKey and an unresolved decision explaining why earlier answers are insufficient.');
    if(value.recommended != null && !value.options.includes(value.recommended))throw Error('Invalid recommended option');
    return {kind:'question',question:value.question,decisionKey:value.decisionKey,unresolved:value.unresolved,options:value.options,recommended:value.recommended || null,inspection:typeof value.inspection === 'string' ? value.inspection.slice(0,12000) : ''};
  }
  if (value.kind !== 'ready' || !text(value.summary) || !strings(value.preserve) || !strings(value.acceptance) || !value.acceptance.length) throw Error('Invalid change summary');
  if (!strings(value.files) || !value.files.length || value.files.some(file=>!file.trim() || file === '.' || /^(?:[a-z]:|[/\\])|[\r\n\0]/i.test(file) || file.replace(/\\/g,'/').split('/').some(part=>part==='..' || part==='.git' || !part))) throw Error('Invalid file scope');
  if (!strings(value.checks) || !value.checks.length) throw Error('At least one runnable check is required');
  return {kind:'ready',summary:value.summary,preserve:value.preserve,acceptance:value.acceptance,files:value.files,checks:value.checks,inspection:typeof value.inspection === 'string' ? value.inspection.slice(0,12000) : ''};
}
function applyDiscovery(request,value,revision) {
  if (request.revision !== revision || request.state !== 'inspecting') throw Error('Stale discovery response');
  const result=validateDiscovery(value), r=copy(request);
  const normalize=value=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const choices=options=>options.map(normalize).sort().join('|');
  if(result.kind==='question' && request.history.some(previous=>previous.decisionKey===result.decisionKey || normalize(previous.text)===normalize(result.question) || choices(previous.options)===choices(result.options)))throw Error('Repeated question or answer list. Ask about a different unresolved decision, or return the ready summary.');
  r.revision++;
  r.inspection=result.inspection || r.inspection;
  if(result.kind==='question') {r.state='questioning';r.question={id:randomUUID(),text:result.question,decisionKey:result.decisionKey,unresolved:result.unresolved,options:result.options,recommended:result.recommended};r.scope=null;}
  else {r.state='ready';r.scope=result;r.question=null;}
  return r;
}
function applyAnswer(request,{requestId,questionId,revision,answer}) {
  if(request.id!==requestId || request.revision!==revision || request.state!=='questioning' || request.question?.id!==questionId) throw Error('Stale question. Use the latest controls.');
  if(!text(answer)) throw Error('Choose an option or write an answer.');
  const r=copy(request);r.history.push({...r.question,answer});r.question=null;r.state='inspecting';r.revision++;return r;
}
function confirmRequest(request,revision) {
  if(request.revision!==revision) throw Error('The summary revision changed. Review it again.');
  if(request.state!=='ready') throw Error('The request must be ready before confirming.');
  validateDiscovery(request.scope);
  const r=copy(request);r.state='running';r.confirmedRevision=revision;r.attempts=0;return r;
}
function cancelRequest(request) {const r=copy(request);r.state='cancelled';r.revision++;return r;}
function editRequest(request,index) {
  if(!['ready','questioning','blocked'].includes(request.state) || !Number.isInteger(index) || !request.history[index]) throw Error('Choose an earlier answer to change.');
  const r=copy(request), previous=r.history[index];r.history=r.history.slice(0,index);r.question={id:randomUUID(),text:previous.text,decisionKey:previous.decisionKey,unresolved:previous.unresolved,options:previous.options,recommended:previous.recommended};r.scope=null;r.confirmedRevision=null;r.state='questioning';r.revision++;return r;
}
function recoverRequest(request) {
  const r=copy(request);
  if(['running','verifying','inspecting'].includes(r.state)) {r.state='blocked';r.error='Interrupted by restart. Review saved work before continuing.';r.revision++;}
  return r;
}
function finishRequest(request,result={}) {
  const r=copy(request);r.evidence=Array.isArray(result.checks)?result.checks:[];r.changedPaths=result.paths || [];r.attempts=result.attempts || r.attempts;
  const passed=r.evidence.length>0 && r.evidence.every(c=>text(c.command) && c.exitCode===0) && result.review==='PASS' && result.integrated===true;
  r.state=passed?'succeeded':'blocked';r.error=passed?null:result.error || 'Verification failed or is unavailable. Saved work remains available.';return r;
}
function discoveryPrompt(r) {
  return `Inspect the project read-only. Never edit, delegate, vote or implement. Before tool calls, share brief plain-language progress updates about what you are checking and what you found. Your final response must be ONLY JSON, no tags or fences. Use short, everyday words for someone with no technical background. Give at most two brief sentences of useful context, then ask ONE clear question using 2-4 distinct choices. Each choice must describe a concrete outcome, not technical jargon such as hierarchy or information architecture. Explain unavoidable technical terms. Be respectful and informative without baby talk. Select the most useful choice for this request as recommended and briefly explain why in the question context. Do not include Cancel or a custom-answer option; the user types in the normal message box. Generate fresh, question-specific answer choices from the actual decision being asked. Do not reuse the same answer list, repeat an answered decision, or ask for the same outcome in different words. Treat the selected answer as settled and move to the next missing detail; return the ready summary when nothing important is missing. Do not append generic fallback choices. Base choices on the project and all earlier answers. Do not repeat answered questions or invent observations. When target, desired outcome, preservation and observable checks are clear, return a ready summary. Ask only about material product ambiguity: answers that would change the goal, scope, important behavior, data, cost or an explicit preservation constraint. Resolve routine implementation details from the project and existing choices, and state assumptions in the editable summary. A preference applies to the entire requested surface: compact sidebar means compact chat rows AND navigation buttons unless the user says otherwise. Do not split one preference into repeated questions for individual elements, selectors or files. Default to a ready summary after one or two useful answers; five is a ceiling for complex tasks, never a target. Each new question MUST have a stable decisionKey naming the underlying decision, not the element or wording. Reuse the same key for the same preference across components (for example layout-density covers row height, button height and gaps). Explain in unresolved what material decision remains and why the original request and prior answers cannot settle it. If the key was answered, return ready or ask about a genuinely different missing decision. Ready summaries must preserve all settled preferences. A ready summary needs exact repository-relative file scope and runnable, noninteractive local verification commands. Do not use deployment, network writes or destructive commands. Preserve all earlier answers. Schemas:\n{"kind":"question","question":"...","decisionKey":"layout-density","unresolved":"Explain the materially different decision not already answered","options":["...","..."],"recommended":"exact label of your recommended option","inspection":"Observed evidence"}\n{"kind":"ready","summary":"I will change ...","preserve":["..."],"acceptance":["observable behavior"],"files":["src/file.js"],"checks":["npm test"],"inspection":"Observed evidence"}\nRequest context:\n${JSON.stringify({originalRequest:r.originalRequest,answers:r.history.map(q=>({decisionKey:q.decisionKey,question:q.text,answer:q.answer})),inspection:r.inspection,summaryRequested:!!r.summaryRequested})}`;
}
function createController({get,save,discover,execute,cancel=()=>{},stronger=()=>null}) {
  const same=(sid,id,revision,state)=>{const r=get(sid);return r?.id===id && r.revision===revision && r.state===state;};
  async function inspect(sid,r) {
    const {id,revision}=r;
    let repairReason='';
    for(let attempt=0;attempt<2;attempt++) {
      try {
        const value=await discover(sid,discoveryPrompt(r)+(attempt?'\nYour previous output was invalid: '+repairReason+' Repair it using exactly one of the JSON schemas.':''));
        if(!same(sid,id,revision,'inspecting'))return;
        const parsed=typeof value==='string'?JSON.parse(value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')):value;
        save(sid,applyDiscovery(r,parsed,revision));return;
      } catch(error) {
        repairReason=String(error.message || error);
        if(!same(sid,id,revision,'inspecting'))return;
        if(attempt===1)save(sid,{...get(sid),state:'blocked',error:String(error.message || error)});
      }
    }
  }
  async function run(sid,r) {
    save(sid,r);
    try {
      const result=await execute(sid,copy(r));
      if(same(sid,r.id,r.revision,'running') || same(sid,r.id,r.revision,'verifying'))save(sid,finishRequest(get(sid),result));
    } catch(error) {if(same(sid,r.id,r.revision,'running') || same(sid,r.id,r.revision,'verifying'))save(sid,{...get(sid),state:'blocked',error:String(error.message || error)});}
  }
  return {
    async start(sid,originalRequest) {
      const previous=get(sid);
      if(previous && ['running','verifying','inspecting'].includes(previous.state))throw Error('Cancel the current request first.');
      const r=createRequest(originalRequest);save(sid,r);await inspect(sid,r);
    },
    async action(sid,payload) {
      const r=get(sid);
      if(!r || r.id!==payload.requestId || r.revision!==payload.revision)throw Error('Stale request. Use the latest controls.');
      if(payload.action==='cancel') {save(sid,cancelRequest(r));cancel(sid);return;}
      if(payload.action==='confirm')return run(sid,confirmRequest(r,payload.revision));
      if(payload.action==='edit') {save(sid,editRequest(r,payload.index ?? r.history.length-1));return;}
      if(payload.action==='editSummary' && r.state==='ready') {
        if(!text(payload.answer))throw Error('Describe the change to the summary.');
        const next={...copy(r),state:'inspecting',revision:r.revision+1,scope:null,confirmedRevision:null};
        next.history.push({text:'Change the proposed summary',answer:payload.answer,options:[]});
        save(sid,next);return inspect(sid,next);
      }
      if(payload.action==='answer') {const next=applyAnswer(r,payload);save(sid,next);return inspect(sid,next);}
      if(payload.action==='summary' && r.state==='questioning') {const next=applyAnswer(r,{...payload,questionId:r.question.id,answer:'Show the fix summary if clear; ask about any unresolved material ambiguity.'});next.summaryRequested=true;save(sid,next);return inspect(sid,next);}
      if(['retry','stronger'].includes(payload.action) && r.state==='blocked') {
        let workerRoute=r.workerRoute;
        if(payload.action==='stronger') {workerRoute=stronger(sid,r);if(!workerRoute)throw Error('No stronger route is available within your worker limits.');}
        if(!r.scope) {const next={...r,state:'inspecting',revision:r.revision+1};save(sid,next);return inspect(sid,next);}
        // Reconfirmation is required; retry never runs edits directly.
        save(sid,{...r,workerRoute,state:'ready',revision:r.revision+1,confirmedRevision:null,error:null});return;
      }
      throw Error('This action is unavailable.');
    }
  };
}
module.exports={createRequest,validateDiscovery,applyDiscovery,applyAnswer,confirmRequest,cancelRequest,editRequest,recoverRequest,finishRequest,discoveryPrompt,createController};
