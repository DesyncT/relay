const assert=require('node:assert/strict');
const {executeRequest}=require('./easycode-execution');
(async()=>{
  const request={id:'request',scope:{summary:'Fix login',preserve:['Checkout'],acceptance:['Login works'],files:['login.js'],checks:['npm test']}};
  let workers=0,applied=0,reviews=0,saved=[],cancelled=false;
  const deps={route:{provider:'codex',model:'user-model',effort:'high'},
    createWorkspace:async a=>({path:'isolated',files:a.files,isolated:true}),baseline:async()=>[],
    check:async(_cwd,commands)=>commands.map(command=>({command,exitCode:0,output:'passed'})),
    work:async(a,prompt)=>{workers++;assert.equal(a.model,'user-model');assert.match(prompt,/Checkout/);},
    collect:async()=>({paths:['login.js'],patch:Buffer.from('patch')}),review:async()=>{reviews++;return {verdict:'PASS'};},
    integrate:async()=>{applied++;return [];},unchanged:async()=>true,save:a=>saved.push(structuredClone(a)),isCancelled:()=>cancelled,projectPath:'project'};
  const result=await executeRequest(request,deps);
  assert.equal(workers,1);assert.equal(applied,1);assert.equal(result.integrated,true);assert.equal(reviews,2);assert.equal(result.review,'PASS');
  workers=0;applied=0;
  const failed=await executeRequest(request,{...deps,check:async(_cwd,c)=>c.map(command=>({command,exitCode:1}))});
  assert.equal(workers,2);assert.equal(applied,0);assert.equal(failed.integrated,false);
  workers=0;
  let collections=0;
  await assert.rejects(()=>executeRequest(request,{...deps,collect:async()=>{if(++collections>1)throw Error('check edited outside scope');return {paths:['login.js'],patch:Buffer.from('patch')};}}),/outside scope/);
  assert.equal(applied,0,'Verification changes are inspected before integration');
  const changedDuringCheck=await executeRequest(request,{...deps,verifyIntegrated:async()=>false});
  assert.equal(changedDuringCheck.review,'FAIL','Integrated verification cannot silently mutate project files');
  applied=0;
  await assert.rejects(()=>executeRequest(request,{...deps,unchanged:async()=>false}),/changed/i);assert.equal(applied,0);
  await assert.rejects(()=>executeRequest(request,{...deps,work:async()=>{cancelled=true;}}),/cancel/i);assert.equal(applied,0);
  console.log('EasyCode scoped execution, preservation, repair and integration checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
