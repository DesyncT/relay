'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createTaskWorkspaces, collectTaskChanges, applyTaskChanges, cleanupTaskWorkspaces, validTaskWorkspace } = require('./requirement-workspaces');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-workspaces-test-'));
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function repo(name) {
  const dir = path.join(tempRoot, name); fs.mkdirSync(dir);
  git(dir, 'init', '-q'); git(dir, 'config', 'user.name', 'Test'); git(dir, 'config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(dir, 'tracked.txt'), 'base\n'); fs.mkdirSync(path.join(dir, 'nested')); fs.writeFileSync(path.join(dir, 'nested', 'owned.txt'), 'owned base\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'base'); return dir;
}
function read(dir, file) { return fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n'); }

try {
  // A clean checkout yields independently writable task worktrees and transfers scoped changes.
  {
    const project = repo('clean');
    const result = createTaskWorkspaces(project, 'clean-session', [{ id: 'a', requirementIndex: 2, files: ['tracked.txt'] }]);
    assert.equal(result.mode, 'worktree');
    const task = result.tasks[0];
    assert.ok(task.baselineCommit); assert.ok(task.baselineRef); assert.ok(fs.existsSync(task.path));
    const saved = { ...task, cleanup:result.cleanup[0] };
    const assignment = { id:'a', files:['./tracked.txt'] };
    assert.equal(validTaskWorkspace(saved, assignment), true, 'persisted ownership metadata validates a live task workspace and exact scope');
    assert.equal(validTaskWorkspace(saved, { id:'a', files:['nested/owned.txt'] }), false, 'stale assignment scope invalidates saved workspace');
    assert.equal(validTaskWorkspace({ ...saved, files:['nested/owned.txt'] }, assignment), false, 'tampered workspace scope is rejected');
    assert.equal(validTaskWorkspace({ ...saved, baselineCommit:'deadbeef' }, assignment), false, 'stale baseline commit is rejected');
    assert.equal(validTaskWorkspace({ ...saved, repo:project }, assignment), false, 'workspace cannot be rebound to the active project repo');
    assert.equal(validTaskWorkspace({ ...saved, baselineRef:'refs/heads/main' }, assignment), false, 'stale baseline ref is rejected');
    assert.equal(validTaskWorkspace({ ...task, path:project, cleanup:result.cleanup[0] }, assignment), false, 'active project paths cannot be accepted as recovered task workspaces');
    fs.writeFileSync(path.join(task.path, 'tracked.txt'), 'worker\n');
    fs.writeFileSync(path.join(task.path, 'ignored-by-scope.txt'), 'skip\n');
    const changes = collectTaskChanges(task);
    assert.deepEqual(changes.paths, ['tracked.txt']);
    assert.match(changes.patch.toString('utf8'), /worker/);
    assert.equal(applyTaskChanges(project, changes).length, 0);
    assert.equal(read(project, 'tracked.txt'), 'worker\n');
    assert.equal(fs.existsSync(path.join(project, 'ignored-by-scope.txt')), false);
    cleanupTaskWorkspaces(result); assert.equal(fs.existsSync(task.path), false);
    assert.equal(validTaskWorkspace(saved, assignment), false, 'deleted temporary workspaces fail recovery validation');
  }

  // Dirty tracked state, staged and unstaged edits, and untracked files are part of the captured baseline.
  {
    const project = repo('dirty');
    fs.writeFileSync(path.join(project, 'tracked.txt'), 'staged baseline\n'); git(project, 'add', 'tracked.txt');
    fs.writeFileSync(path.join(project, 'tracked.txt'), 'unstaged baseline\n');
    fs.writeFileSync(path.join(project, 'new.txt'), 'untracked baseline\n');
    const beforeStatus = git(project, 'status', '--porcelain=v1');
    const beforeIndex = git(project, 'write-tree');
    const result = createTaskWorkspaces(project, 'dirty-session', [{ id: 'dirty', requirementIndex: 0, files: ['tracked.txt'] }]);
    assert.equal(read(result.tasks[0].path, 'tracked.txt'), 'unstaged baseline\n');
    assert.equal(read(result.tasks[0].path, 'new.txt'), 'untracked baseline\n');
    fs.writeFileSync(path.join(result.tasks[0].path, 'tracked.txt'), 'worker result\n');
    const changes = collectTaskChanges(result.tasks[0]);
    assert.equal(applyTaskChanges(project, changes).length, 0);
    assert.equal(read(project, 'tracked.txt'), 'worker result\n');
    assert.equal(read(project, 'new.txt'), 'untracked baseline\n');
    assert.equal(git(project, 'status', '--porcelain=v1'), beforeStatus);
    assert.equal(git(project, 'write-tree'), beforeIndex);
    cleanupTaskWorkspaces(result);
  }

  // Binary changes round trip, while overlap remains a caller-visible serializable ownership constraint.
  {
    const project = repo('binary');
    const result = createTaskWorkspaces(project, 'binary-session', [
      { id: 'left', requirementIndex: 0, files: ['tracked.txt'] },
      { id: 'right', requirementIndex: 1, files: ['tracked.txt'] },
    ]);
    assert.deepEqual(result.sharedOverlaps, [['left', 'right']]);
    const task = result.tasks[0]; task.files = ['asset.bin']; const bytes = Buffer.from([0, 1, 2, 255, 10]);
    fs.writeFileSync(path.join(task.path, 'asset.bin'), bytes);
    const changes = collectTaskChanges(task);
    assert.ok(changes.patch.includes(Buffer.from('GIT binary patch')));
    assert.equal(applyTaskChanges(project, changes).length, 0);
    assert.deepEqual(fs.readFileSync(path.join(project, 'asset.bin')), bytes);
    cleanupTaskWorkspaces(result);
  }

  // Edits made in the active project after snapshot are detected and not overwritten.
  {
    const project = repo('concurrent-edit');
    const result = createTaskWorkspaces(project, 'concurrent-session', [{ id: 'one', requirementIndex: 0, files: ['tracked.txt'] }]);
    fs.writeFileSync(path.join(result.tasks[0].path, 'tracked.txt'), 'worker version\n');
    const changes = collectTaskChanges(result.tasks[0]);
    fs.writeFileSync(path.join(project, 'tracked.txt'), 'user concurrent version\n');
    const conflicts = applyTaskChanges(project, changes);
    assert.ok(conflicts.length); assert.equal(read(project, 'tracked.txt'), 'user concurrent version\n');
    cleanupTaskWorkspaces(result);
  }

  // A patch cannot smuggle an unrelated file by claiming only an allowed path.
  {
    const project = repo('scope-smuggling');
    const result = createTaskWorkspaces(project, 'scope-session', [{ id: 'scoped', requirementIndex: 0, files: ['tracked.txt', 'nested/owned.txt'] }]);
    const task = result.tasks[0];
    fs.writeFileSync(path.join(task.path, 'tracked.txt'), 'allowed worker change\n');
    fs.writeFileSync(path.join(task.path, 'nested', 'owned.txt'), 'unrelated worker change\n');
    const changes = collectTaskChanges(task);
    changes.paths = ['tracked.txt'];
    assert.ok(applyTaskChanges(project, changes).length, 'unreviewed patch path must be rejected');
    assert.equal(read(project, 'tracked.txt'), 'base\n');
    assert.equal(read(project, 'nested/owned.txt'), 'owned base\n');
    changes.paths = ['tracked.txt', 'nested/owned.txt'];
    changes.scope = ['tracked.txt'];
    assert.ok(applyTaskChanges(project, changes).length, 'assignment scope must be enforced');
    assert.equal(read(project, 'tracked.txt'), 'base\n');
    assert.equal(read(project, 'nested/owned.txt'), 'owned base\n');
    task.files = []; // An empty scope must never become a whole-repository patch.
    assert.throws(() => collectTaskChanges(task), /scope|unscoped/i);
    assert.ok(applyTaskChanges(project, { ...changes, scope:[] }).length, 'integrator rejects a patch without explicit file scope');
    assert.equal(read(project, 'tracked.txt'), 'base\n');
    assert.equal(read(project, 'nested/owned.txt'), 'owned base\n');
    cleanupTaskWorkspaces(result);
  }

  // Non-Git projects safely fall back to shared mode; cleanup refuses paths outside owned roots.
  {
    const project = path.join(tempRoot, 'plain'); fs.mkdirSync(project); fs.writeFileSync(path.join(project, 'file.txt'), 'keep');
    const result = createTaskWorkspaces(project, 'plain-session', [{ id: 'plain', requirementIndex: 0, files: ['file.txt'] }]);
    assert.equal(result.mode, 'shared'); assert.notEqual(result.tasks[0].path, project);
    assert.ok(result.tasks[0].path && !path.relative(os.tmpdir(), result.tasks[0].path).startsWith('..'), result.reason);
    fs.writeFileSync(path.join(result.tasks[0].path, 'file.txt'), 'worker file\n');
    fs.writeFileSync(path.join(result.tasks[0].path, 'unrelated.txt'), 'should remain isolated\n');
    const changes = collectTaskChanges(result.tasks[0]);
    assert.deepEqual(changes.paths, ['file.txt']);
    assert.equal(applyTaskChanges(project, changes).length, 0);
    assert.equal(read(project, 'file.txt'), 'worker file\n');
    assert.equal(fs.existsSync(path.join(project, 'unrelated.txt')), false);
    cleanupTaskWorkspaces(result);
    const unsafe = repo('setup-failure');
    const symlinkTarget = path.join(tempRoot, 'symlink-target'); fs.mkdirSync(symlinkTarget); fs.writeFileSync(path.join(symlinkTarget, 'keep.txt'), 'outside data');
    const link = path.join(unsafe, 'external');
    try {
      fs.symlinkSync(symlinkTarget, link, process.platform === 'win32' ? 'junction' : 'dir');
      const blocked = createTaskWorkspaces(unsafe, 'blocked-session', [{ id: 'blocked', requirementIndex: 1, files: ['tracked.txt'] }]);
      assert.equal(blocked.blocked, true); assert.equal(blocked.tasks[0].path, null); assert.equal(blocked.tasks[0].taskPath, null);
      assert.equal(fs.readFileSync(path.join(symlinkTarget, 'keep.txt'), 'utf8'), 'outside data');
    } catch (error) {
      if (error.code !== 'EPERM' && error.code !== 'EACCES' && error.code !== 'ENOTSUP') throw error;
    }
    const outside = path.join(tempRoot, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'important'), 'keep');
    assert.ok(cleanupTaskWorkspaces({ cleanup: [{ path: outside, marker: 'not-owned' }] }).length);
    assert.equal(fs.readFileSync(path.join(outside, 'important'), 'utf8'), 'keep');
  }
} finally { fs.rmSync(tempRoot, { recursive: true, force: true }); }
console.log('requirement workspaces tests passed');
