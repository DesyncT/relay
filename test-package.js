// Run after npm run dist: verify the shipped archive contains unmodified source bytes.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),asar=require('@electron/asar');
const archive=path.join(__dirname,'dist/win-unpacked/resources/app.asar'),entries=new Set(asar.listPackage(archive).map(n=>n.replace(/\\/g,'/')));
let count=0;
for(const name of fs.readdirSync(__dirname)) {
 if(!/\.(js|css|html|json)$/.test(name) || name === 'package.json' || name.startsWith('test-') || !entries.has('/'+name))continue;
 assert.ok(asar.extractFile(archive,name).equals(fs.readFileSync(path.join(__dirname,name))),name+' must match the source bytes');count++;
}
assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,require('./package.json').version);
for(const name of ['backgrounds.js','notifications.js','account-usage.js','usage-recovery.js','easycode-design.js','assets/question-badge.png','assets/complete-badge.png','assets/question.wav','assets/complete.wav','assets/failure.wav']) {
 assert.ok(entries.has('/'+name),name+' must ship');assert.ok(asar.extractFile(archive,name).equals(fs.readFileSync(path.join(__dirname,name))),name+' must match source');
}
assert.ok(!entries.has('/test-background.webm'),'Test media must not ship');
assert.ok(count>10);assert.ok(![...entries].some(name=>name.endsWith('.log')),'Runtime logs must not ship');
console.log('Packaged source integrity passed: '+count+' files');
