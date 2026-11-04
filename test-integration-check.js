'use strict';
// The integrator's full-check gate in main.js: only an npm test exit code of 0 counts as passed.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const start = source.indexOf("      let checkEvidence = 'No full project check could be run.';"), end = source.indexOf('      const checksPassed = hasFullCheck;');
assert.ok(start > 0 && end > start, 'integration check block found in main.js');
const gate = new Function('fs', 'path', 'run', 'projectPath', 'sid', `return (async () => {\n${source.slice(start, end)}\nreturn { hasFullCheck, checkEvidence };\n})();`);
const pkg = { readFileSync: () => JSON.stringify({ scripts: { test: 'x' } }) };
const fail = (code) => async () => { const e = new Error('tests failed'); e.code = code; throw e; };
(async () => {
  assert.equal((await gate(pkg, path, async () => 'ok', '.', 's')).hasFullCheck, true, 'exit 0 with output passes');
  assert.equal((await gate(pkg, path, fail(1), '.', 's')).hasFullCheck, false, 'a red suite never counts as passed');
  assert.equal((await gate(pkg, path, fail(0), '.', 's')).hasFullCheck, true, 'a silent exit 0 still passes');
  assert.equal((await gate({ readFileSync: () => JSON.stringify({}) }, path, async () => 'ok', '.', 's')).hasFullCheck, false, 'no test script is not a pass');
  console.log('integration check gate tests passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
