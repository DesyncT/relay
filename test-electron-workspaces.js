const {app} = require('electron');
const assert = require('node:assert/strict');
const fs = require('original-fs'), path = require('path'), os = require('os');
const {cleanupSessionAsync} = require('./legacy-workspace-cleanup');
app.whenReady().then(async()=>{
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'relay-legacy-cleanup-test-'));
  const source = fs.mkdtempSync(path.join(os.tmpdir(),'relay-archive-source-'));
  try {
    fs.writeFileSync(path.join(source,'package.json'),'{}');
    await require('@electron/asar').createPackage(source,path.join(root,'app.asar'));
    const entry={root,marker:path.join(root,'owner.json'),snapshot:path.join(root,'snapshot'),baselineRef:'test',paths:[path.join(root,'task')]};
    fs.writeFileSync(entry.marker,JSON.stringify({...entry,tasks:entry.paths}));
    assert.deepEqual(await cleanupSessionAsync({reqs:{assignments:[{workspace:{cleanup:entry}}]}}),[]);
    assert.equal(fs.existsSync(root),false);
    assert.equal((await cleanupSessionAsync({easycode:{worker:{workspace:{cleanup:{...entry,root:source,marker:path.join(source,'missing')}}}}})).length,1);
    assert.equal(fs.existsSync(source),true,'Unowned directories stay intact');
    console.log('Electron legacy workspace migration and archive cleanup passed');
  } finally {
    for (const target of [root,source]) {assert.equal(path.dirname(target),os.tmpdir());fs.rmSync(target,{recursive:true,force:true});}
  }
  app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
