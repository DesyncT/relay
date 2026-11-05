const assert=require('node:assert/strict');
const {requirementSubagents}=require('./requirement-subagents');
const reqs={items:[{t:'Fix the header'},{t:'Update images'}],assignments:[
  {id:'a',requirementIndex:0,provider:'codex',owner:'claude',model:'gpt-6-luna',status:'blocked',blocker:'review-unknown',reviewEvidence:[{evidence:'Could not reach staging'}]},
  {id:'b',requirementIndex:1,provider:'claude',model:'claude-haiku-5-5',status:'running'},
]};
const before=JSON.stringify(reqs),workers=requirementSubagents('chat',reqs);
assert.equal(workers.length,2);assert.equal(workers[0].id,'req:chat:a');
assert.equal(workers[0].owner,'codex');assert.equal(workers[0].assignmentId,'a');
assert.equal(workers[0].stateLabel,'Needs verification');assert.match(workers[0].result,/staging/);
assert.equal(workers[1].status,'running');assert.equal(JSON.stringify(reqs),before);
assert.deepEqual(requirementSubagents('chat',null),[]);
const integration=requirementSubagents('chat',{items:[{t:'Task'}],assignments:[{...reqs.assignments[0],status:'passed',blocker:null,integrationStatus:'open',integrationFindings:'Staging unavailable',integrationRoute:{provider:'claude',model:'claude-sonnet-5-5',effort:'medium'}}]})[0];
assert.equal(integration.status,'failed');assert.equal(integration.owner,'claude');assert.equal(integration.model,'claude-sonnet-5-5');assert.match(integration.result,/Staging unavailable/);
console.log('Checklist subagent identity and status checks passed');
const source=require('node:fs').readFileSync(require.resolve('./main'),'utf8');
const marker='    reviewTask: ',start=source.indexOf(marker),end=source.indexOf('\n    },\n  });',start);
(async()=>{
  let calls=0,allUnknown=false;
  const review=require('node:vm').runInNewContext('('+source.slice(start+marker.length,end)+'\n})',{
    providerOrder:['claude','codex'],isDown:()=>false,epoch:0,rt:{epoch:0},judgeCount:()=>1,
    argsFor:()=>[],sid:'chat',checklist:[{t:'Fix header'}],isLimitError:()=>false,markDown:()=>{},setReqs:()=>{},reqsOf:()=>({}),coordinator:{assignments:[]},strictness:()=>'',
    ...require('node:vm').runInNewContext(source.slice(source.indexOf('function readVerdict'),source.indexOf('async function reviewIntegratedResult'))+';({readVerdict,combineVerdicts})'),
    PROV:{claude:async()=>{calls++;return {text:allUnknown ? 'VERDICT: UNKNOWN\nEVIDENCE: Could not reach staging' : 'The run ended before a verdict.'};},codex:async()=>{calls++;return {text:'VERDICT: PASS\nEVIDENCE: Verified header in staging'};}},
  });
  const assignment={id:'a',provider:'antigravity',requirementIndex:0,workspace:{path:'.'}};
  const result=await review(assignment,{paths:[],checkEvidence:'No npm test script',evidence:''});
  assert.equal(result.verdict,'PASS');assert.equal(calls,2,'A reviewer that gave no verdict is skipped for the next one');
  calls=0;allUnknown=true;assert.equal((await review(assignment,{paths:[]})).verdict,'FAIL','Could not verify is a FAIL, never a pass');assert.equal(calls,1);
  console.log('Inconclusive review fallback checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
