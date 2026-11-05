const fs = process.versions.electron ? require('original-fs') : require('fs'), path = require('path'), os = require('os');
const pathInside = (root, target) => { const r = path.relative(root, target); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
function cleanupTaskWorkspaces(workspaces) {
  const entries = Array.isArray(workspaces && workspaces.cleanup) ? workspaces.cleanup : [];
  const errors = [];
  for (const entry of entries) {
    try {
      const root = path.resolve(entry.root || '');
      const marker = path.resolve(entry.marker || '');
      if (!fs.existsSync(root)) continue;
      if (!root || !marker || !pathInside(os.tmpdir(), root) || !pathInside(root, marker) || !fs.existsSync(marker)) throw new Error('Refusing cleanup outside a marked owned temp directory');
      if (fs.lstatSync(root).isSymbolicLink() || fs.lstatSync(marker).isSymbolicLink() || path.resolve(fs.realpathSync(root)) !== root) throw new Error('Refusing cleanup through a symbolic link');
      const recorded = JSON.parse(fs.readFileSync(marker, 'utf8'));
      if (path.resolve(recorded.root) !== root || path.resolve(recorded.snapshot) !== path.resolve(entry.snapshot) || recorded.baselineRef !== entry.baselineRef) throw new Error('Cleanup ownership marker mismatch');
      const owned = new Set(recorded.tasks.map(task => path.resolve(typeof task === 'string' ? task : task.path)));
      if ((entry.paths || []).some(p => !owned.has(path.resolve(p)))) throw new Error('Cleanup path is not owned by this workflow');
      if (recorded.snapshot !== entry.snapshot) throw new Error('Cleanup snapshot mismatch');
      // These worktrees and ref exist only below the uniquely-created owned root.
      fs.rmSync(root, { recursive: true, force: true });
    } catch (error) { errors.push(error.message); }
  }
  return errors;
}

function cleanupSession(session) {
  const assignments = [...(session.reqs?.assignments || []), ...(session.easycodeArchive || []).map(r => r.worker), session.easycode?.worker].filter(Boolean);
  const cleanup = [...new Map(assignments.map(a => a.workspace?.cleanup).filter(Boolean).map(e => [e.root,e])).values()];
  return cleanupTaskWorkspaces({cleanup});
}
function cleanupSessionAsync(session) {
  if (!session.reqs?.assignments?.length && !session.easycode?.worker && !session.easycodeArchive?.some(r=>r.worker)) return Promise.resolve([]);
  const {Worker} = require('worker_threads');
  return new Promise((resolve,reject)=>{
    const worker = new Worker(`const {parentPort,workerData} = require('worker_threads'); parentPort.postMessage(require(workerData.module).cleanupSession(workerData.session));`, {eval:true,workerData:{module:__filename,session}});
    worker.once('message',errors=>{worker.terminate();resolve(errors);}); worker.once('error',reject);
  });
}
module.exports = {cleanupSession, cleanupSessionAsync, cleanupTaskWorkspaces};
