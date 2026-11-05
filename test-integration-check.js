'use strict';
// The integrator's gate in main.js: only an npm test exit code of 0 counts as passed, and no edit may land outside the passed tasks' scopes.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { scopeCovers } = require('./requirement-workflow');
const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const start = source.indexOf("      let checkEvidence = 'No full project check could be run.';"), end = source.indexOf('      let manualVerification', start);
assert.ok(start > 0 && end > start, 'integration check block found in main.js');
const gate = new Function('fs', 'path', 'run', 'projectPath', 'sid', 'changes', 'before', 'offThread', 'scopeCovers', 'step',
  `return (async () => {\n${source.slice(start, end)}\nreturn { checksPassed, checkEvidence };\n})();`);
const pkg = { readFileSync: () => JSON.stringify({ scripts: { test: 'x' } }) };
const fail = (code) => async () => { const e = new Error('tests failed'); e.code = code; throw e; };
const changes = [{ scope: ['src/', 'README.md'] }];
const check = (fsLike, run, touched = []) => gate(fsLike, path, run, '.', 's', changes, new Map(), async () => touched, scopeCovers, () => {});
(async () => {
  assert.equal((await check(pkg, async () => 'ok')).checksPassed, true, 'exit 0 with output passes');
  assert.equal((await check(pkg, fail(1))).checksPassed, false, 'a red suite never counts as passed');
  assert.equal((await check(pkg, fail(0))).checksPassed, true, 'a silent exit 0 still passes');
  assert.equal((await check({ readFileSync: () => JSON.stringify({}) }, async () => 'ok')).checksPassed, false, 'no test script is not a pass');
  assert.equal((await check(pkg, async () => 'ok', ['src/a.js', 'README.md'])).checksPassed, true, 'edits inside the task scopes pass');
  const outside = await check(pkg, async () => 'ok', ['src/a.js', 'package.json']);
  assert.equal(outside.checksPassed, false, 'an edit outside the task scopes fails the gate');
  assert.match(outside.checkEvidence, /outside the passed tasks' scopes: package\.json\. Revert/);
  const manualStart=source.indexOf('      let manualVerification',start),manualEnd=source.indexOf('      return { checksPassed',manualStart);
  const manual=new Function('checksPassed','checkUnavailable','outside','reviewIntegratedResult','sid','integrator','changes','integrated','checkEvidence','epoch',`return(async()=>{let report='';const step=()=>{};${source.slice(manualStart,manualEnd)}return manualVerification;})();`);
  let verifications=0;
  const verify=async()=>{verifications++;return {verdict:'PASS',evidence:'Verified acceptance criteria in staging'};};
  assert.equal((await manual(false,true,[],verify,'s',{},[],{text:'Done'},'No npm script',0)).verdict,'PASS');
  assert.equal(await manual(false,false,[],verify,'s',{},[],{text:'Done'},'npm test failed',0),null,'A failed automated suite cannot be bypassed');
  assert.equal(await manual(false,true,['outside.js'],verify,'s',{},[],{text:'Done'},'No npm script',0),null,'Scope violations cannot be bypassed');
  assert.equal(verifications,1);
  console.log('integration check gate tests passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
