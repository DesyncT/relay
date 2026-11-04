'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const OWNED_MARKER = '.relay-requirement-workspaces.json';
function runGit(cwd, args, input) {
  return execFileSync('git', args, {
    cwd, input, encoding: 'buffer', maxBuffer: 128 * 1024 * 1024,
    windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}
function gitText(cwd, args) { return runGit(cwd, args).toString('utf8').trim(); }
function pathInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}
function normalizeOwnedPaths(files) {
  return [...new Set((Array.isArray(files) ? files : []).filter(x => typeof x === 'string' && x.trim())
    .map(x => x.trim().replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(x => x && x !== '.' && !path.posix.isAbsolute(x) && !/^[a-zA-Z]:\//.test(x) && !x.startsWith('//') && !x.split('/').includes('..')))].sort();
}
function findSymlink(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return full;
    if (entry.isDirectory() && findSymlink(full)) return full;
  }
  return null;
}
function copyProjectSnapshot(source, destination) {
  const symlink = findSymlink(source);
  if (symlink) throw new Error(`Cannot safely snapshot symlink: ${symlink}`);
  fs.cpSync(source, destination, { recursive: true, force: false, filter: src => path.basename(src) !== '.git' });
}
function overlappingAssignments(assignments) {
  const result = [];
  for (let i = 0; i < assignments.length; i++) for (let j = i + 1; j < assignments.length; j++) {
    const left = normalizeOwnedPaths(assignments[i].files || assignments[i].fileOwnership);
    const right = normalizeOwnedPaths(assignments[j].files || assignments[j].fileOwnership);
    if (!left.length || !right.length || left.some(a => right.some(b => a.toLowerCase() === b.toLowerCase()))) result.push([assignments[i].id, assignments[j].id]);
  }
  return result;
}
function sharedResult(projectPath, assignments, reason) {
  const tasks = assignments.map(a => ({
    id: a.id, assignmentId: a.id, requirementIndex: a.requirementIndex,
    path: projectPath, taskPath: projectPath, files: normalizeOwnedPaths(a.files || a.fileOwnership),
    baselineCommit: null, baselineRef: null, mode: 'shared',
  }));
  return { mode: 'shared', base: null, tasks, sharedOverlaps: overlappingAssignments(assignments), reason,
    cleanup: [], cleanupTasks: () => cleanupTaskWorkspaces({ cleanup: [] }) };
}

function createTaskWorkspaces(projectPath, sessionId, assignments) {
  const project = path.resolve(projectPath);
  const list = Array.isArray(assignments) ? assignments : [];
  if (!fs.statSync(project).isDirectory()) throw new Error('Project path must be a directory');
  let tempRoot;
  try {
    const gitRoot = path.resolve(gitText(project, ['rev-parse', '--show-toplevel']));
    if (gitRoot !== project) throw new Error('Project path must be the Git working-tree root');
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `relay-req-${crypto.randomBytes(6).toString('hex')}-`));
    const snapshot = path.join(tempRoot, 'snapshot');
    fs.mkdirSync(snapshot);
    copyProjectSnapshot(project, snapshot);
    runGit(snapshot, ['init', '-q']);
    runGit(snapshot, ['config', 'user.name', 'Relay Task Snapshot']);
    runGit(snapshot, ['config', 'user.email', 'relay-snapshot@localhost']);
    runGit(snapshot, ['add', '-A']);
    runGit(snapshot, ['-c', 'core.safecrlf=false', 'commit', '-qm', 'Relay task baseline']);
    const baselineCommit = gitText(snapshot, ['rev-parse', 'HEAD']);
    const baselineRef = `refs/relay-task-baselines/${crypto.createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 16)}`;
    runGit(snapshot, ['update-ref', baselineRef, baselineCommit]);
    const tasks = [];
    for (const assignment of list) {
      const id = String(assignment.id || `requirement-${assignment.requirementIndex ?? tasks.length}`);
      const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'task';
      const taskPath = path.join(tempRoot, 'tasks', `${safeId}-${tasks.length}`);
      fs.mkdirSync(path.dirname(taskPath), { recursive: true });
      runGit(snapshot, ['worktree', 'add', '--detach', taskPath, baselineCommit]);
      tasks.push({ id, assignmentId: id, requirementIndex: assignment.requirementIndex, path: taskPath, taskPath,
        files: normalizeOwnedPaths(assignment.files || assignment.fileOwnership), baselineCommit, baselineRef,
        repo: snapshot, mode: 'worktree' });
    }
    const ownershipPath = path.join(tempRoot, OWNED_MARKER);
    fs.writeFileSync(ownershipPath, JSON.stringify({ root: tempRoot, snapshot, baselineRef, tasks: tasks.map(t => t.path) }));
    const cleanup = [{ root: tempRoot, marker: ownershipPath, snapshot, baselineRef, paths: tasks.map(t => t.path) }];
    return { mode: 'worktree', base: { path: snapshot, baselineCommit, baselineRef }, tasks,
      sharedOverlaps: overlappingAssignments(list), cleanup, cleanupTasks: () => cleanupTaskWorkspaces({ cleanup }) };
  } catch (error) {
    if (tempRoot && fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
    return sharedResult(project, list, error.message);
  }
}

function collectTaskChanges(workspace) {
  if (!workspace || workspace.mode === 'shared') return { paths: [], patch: Buffer.alloc(0), mode: 'shared', assignmentId: workspace && workspace.assignmentId };
  const baseline = workspace.baselineCommit;
  const scope = workspace.files;
  const addArgs = ['add', '-A', '--'];
  if (scope.length) addArgs.push(...scope); else addArgs.push('.');
  runGit(workspace.path, addArgs);
  const diffArgs = ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', baseline, '--'];
  if (scope.length) diffArgs.push(...scope);
  const patch = runGit(workspace.path, diffArgs);
  const namesArgs = ['diff', '--cached', '--name-only', '-z', baseline, '--'];
  if (scope.length) namesArgs.push(...scope);
  const paths = runGit(workspace.path, namesArgs).toString('utf8').split('\0').filter(Boolean).sort();
  return { paths, patch, baselineCommit: baseline, baselineRef: workspace.baselineRef, assignmentId: workspace.assignmentId, requirementIndex: workspace.requirementIndex };
}

function applyTaskChanges(projectPath, changes) {
  const project = path.resolve(projectPath);
  const patch = Buffer.isBuffer(changes && changes.patch) ? changes.patch : Buffer.from(changes && changes.patch || '');
  const paths = normalizeOwnedPaths(changes && changes.paths);
  if (!patch.length) return [];
  if (!paths.length) return [{ paths: [], error: 'Patch has no declared reviewed paths' }];
  // Validate in a disposable copy first so a failed multi-file patch cannot leave partial edits behind.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-req-apply-'));
  try {
    const candidate = path.join(temp, 'candidate'); fs.mkdirSync(candidate);
    copyProjectSnapshot(project, candidate);
    runGit(candidate, ['apply', '--binary', '--whitespace=nowarn', '-'], patch);
  } catch (error) {
    return [{ paths, error: error.stderr ? error.stderr.toString('utf8') : error.message }];
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  try {
    runGit(project, ['apply', '--binary', '--whitespace=nowarn', '-'], patch);
    return [];
  } catch (error) { return [{ paths, error: error.stderr ? error.stderr.toString('utf8') : error.message }]; }
}

function cleanupTaskWorkspaces(workspaces) {
  const entries = Array.isArray(workspaces && workspaces.cleanup) ? workspaces.cleanup : [];
  const errors = [];
  for (const entry of entries) {
    try {
      const root = path.resolve(entry.root || '');
      const marker = path.resolve(entry.marker || '');
      if (!root || !marker || !pathInside(os.tmpdir(), root) || !pathInside(root, marker) || !fs.existsSync(marker)) throw new Error('Refusing cleanup outside a marked owned temp directory');
      if (fs.lstatSync(root).isSymbolicLink() || fs.lstatSync(marker).isSymbolicLink() || path.resolve(fs.realpathSync(root)) !== root) throw new Error('Refusing cleanup through a symbolic link');
      const recorded = JSON.parse(fs.readFileSync(marker, 'utf8'));
      if (path.resolve(recorded.root) !== root || path.resolve(recorded.snapshot) !== path.resolve(entry.snapshot) || recorded.baselineRef !== entry.baselineRef) throw new Error('Cleanup ownership marker mismatch');
      const owned = new Set(recorded.tasks.map(p => path.resolve(p)));
      if ((entry.paths || []).some(p => !owned.has(path.resolve(p)))) throw new Error('Cleanup path is not owned by this workflow');
      if (recorded.snapshot !== entry.snapshot) throw new Error('Cleanup snapshot mismatch');
      // These worktrees and ref exist only below the uniquely-created owned root.
      fs.rmSync(root, { recursive: true, force: true });
    } catch (error) { errors.push(error.message); }
  }
  return errors;
}

module.exports = { createTaskWorkspaces, collectTaskChanges, applyTaskChanges, cleanupTaskWorkspaces };
