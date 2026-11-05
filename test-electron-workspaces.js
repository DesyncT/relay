'use strict';
// Run in Electron: the Node-only suite cannot reproduce virtual .asar filesystem bugs.
const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('original-fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Worker } = require('node:worker_threads');

app.whenReady().then(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-electron-workspace-test-'));
  try {
    const project = path.join(root, 'project');
    fs.mkdirSync(project);
    const git = args => execFileSync('git', args, { cwd: project, windowsHide: true, stdio: 'pipe' });
    git(['init', '-q']);
    git(['config', 'user.name', 'Test']);
    git(['config', 'user.email', 'test@example.com']);
    fs.writeFileSync(path.join(project, 'file.txt'), 'base');
    git(['add', '.']);
    git(['commit', '-qm', 'base']);
    const archiveSource = path.join(root, 'archive-source');
    fs.mkdirSync(archiveSource);
    fs.writeFileSync(path.join(archiveSource, 'package.json'), '{"name":"fixture"}');
    fs.mkdirSync(path.join(project, 'dist'));
    fs.writeFileSync(path.join(project, '.gitignore'), 'dist/\n');
    await require('@electron/asar').createPackage(archiveSource, path.join(project, 'dist', 'app.asar'));
    await new Promise((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        const fs = require('original-fs'), path = require('node:path'), assert = require('node:assert/strict');
        try {
          const api = require(workerData.module);
          const result = api.createTaskWorkspaces(workerData.project, 'electron', [{ id:'test', files:['file.txt'], preserveIgnored:true }]);
          assert.equal(result.blocked, undefined, result.reason);
          assert.equal(result.mode, 'worktree');
          const archive = path.join(result.tasks[0].path, 'dist', 'app.asar');
          assert.equal(fs.lstatSync(archive).isFile(), true, 'Copy archives as real files');
          assert.ok(fs.readFileSync(archive).equals(fs.readFileSync(path.join(workerData.project, 'dist', 'app.asar'))));
          assert.deepEqual(api.cleanupTaskWorkspaces(result), []);
          assert.equal(fs.existsSync(result.tasks[0].path), false, 'Cleanup removes archive-containing workspaces');
          parentPort.postMessage({ok:true});
        } catch (error) { parentPort.postMessage({error:error.stack}); }
      `, { eval:true, workerData:{module:process.env.RELAY_TEST_WORKSPACE_MODULE || path.join(__dirname, 'requirement-workspaces.js'), project} });
      worker.once('error', reject);
      worker.once('message', async message => {
        await worker.terminate();
        message.error ? reject(Error(message.error)) : resolve();
      });
    });
    assert.equal(fs.readFileSync(path.join(project, 'file.txt'), 'utf8'), 'base');
    console.log('Electron worker archive snapshot, byte preservation and cleanup checks passed');
  } finally {
    assert.equal(path.dirname(root), os.tmpdir());
    fs.rmSync(root, { recursive:true, force:true });
  }
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
