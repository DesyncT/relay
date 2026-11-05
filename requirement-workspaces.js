'use strict';

// User projects contain real files, including .asar archives. Electron's virtual
// archive filesystem must not expand them while copying or cleaning workspaces.
const fs = process.versions.electron ? require('original-fs') : require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { scopeCovers, pathsOverlap } = require('./requirement-workflow');

const OWNED_MARKER = '.relay-requirement-workspaces.json';
function runGit(cwd, args, input) {
  return execFileSync('git', args, {
    cwd, input, stdio:'pipe', encoding: 'buffer', maxBuffer: 128 * 1024 * 1024,
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
    if (!left.length || !right.length || left.some(a => right.some(b => pathsOverlap(a, b)))) result.push([assignments[i].id, assignments[j].id]);
  }
  return result;
}
function sharedResult(projectPath, assignments, reason) {
  let root;
  try {
    if (fs.lstatSync(projectPath).isSymbolicLink()) throw new Error('Project root is a symbolic link');
    root = fs.mkdtempSync(path.join(os.tmpdir(), `relay-req-shared-${crypto.randomBytes(6).toString('hex')}-`));
    const snapshot = path.join(root, 'snapshots'); fs.mkdirSync(snapshot);
    const tasks = assignments.map((assignment, index) => {
      const id = String(assignment.id || `requirement-${assignment.requirementIndex ?? index}`);
      const taskPath = path.join(snapshot, `${id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'task'}-${index}`);
      fs.mkdirSync(taskPath);
      copyProjectSnapshot(projectPath, taskPath);
      runGit(taskPath, ['init', '-q']);
      runGit(taskPath, ['config', 'user.name', 'Relay Task Snapshot']);
      runGit(taskPath, ['config', 'user.email', 'relay-snapshot@localhost']);
      runGit(taskPath, ['add', '-A']);
      runGit(taskPath, ['-c', 'core.safecrlf=false', 'commit', '-qm', 'Relay isolated task baseline']);
      const baselineCommit = gitText(taskPath, ['rev-parse', 'HEAD']);
      const baselineRef = `refs/relay-task-baselines/${crypto.createHash('sha256').update(`${id}:${index}`).digest('hex').slice(0, 16)}`;
      runGit(taskPath, ['update-ref', baselineRef, baselineCommit]);
      const files = normalizeOwnedPaths(assignment.files || assignment.fileOwnership);
      if (!files.length) throw new Error(`Assignment ${id} has no explicit safe file scope`);
      return { id, assignmentId: id, requirementIndex: assignment.requirementIndex, path: taskPath, taskPath,
        files, baselineCommit, baselineRef, repo: taskPath, mode: 'shared', isolated: true };
    });
    const baselineRef = `isolated-${crypto.randomBytes(6).toString('hex')}`;
    const marker = path.join(root, OWNED_MARKER);
    fs.writeFileSync(marker, JSON.stringify({ root, snapshot, baselineRef, tasks: tasks.map(task => ({ path:task.path, assignmentId:task.assignmentId, files:task.files, baselineCommit:task.baselineCommit, baselineRef:task.baselineRef, repo:task.repo, mode:task.mode })) }));
    const cleanup = [{ root, marker, snapshot, baselineRef, paths: tasks.map(task => task.path) }];
    return { mode: 'shared', base: null, tasks, sharedOverlaps: overlappingAssignments(assignments), reason,
      isolated: true, cleanup, cleanupTasks: () => cleanupTaskWorkspaces({ cleanup }) };
  } catch (error) {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    const failedReason = `${reason}; isolated fallback failed: ${error.message}`;
    return { mode: 'shared', base: null, tasks: assignments.map((a, index) => ({
      id: a.id, assignmentId: a.id, requirementIndex: a.requirementIndex, path: null, taskPath: null,
      files: normalizeOwnedPaths(a.files || a.fileOwnership), baselineCommit: null, baselineRef: null,
      mode: 'shared', isolated: false, blocked: true,
    })), sharedOverlaps: overlappingAssignments(assignments), reason: failedReason, blocked: true,
      cleanup: [], cleanupTasks: () => cleanupTaskWorkspaces({ cleanup: [] }) };
  }
}

function createTaskWorkspaces(projectPath, sessionId, assignments) {
  const project = path.resolve(projectPath);
  const list = Array.isArray(assignments) ? assignments : [];
  try { if (!fs.statSync(project).isDirectory()) return sharedResult(project, list, 'Project path is not a directory'); }
  catch (error) { return sharedResult(project, list, error.message); }
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
      if(assignment.preserveIgnored) {
        // Keep installed dependencies and local configuration available, but do
        // not link writable worker inputs back into the user's project.
        const ignored=runGit(snapshot,['ls-files','--others','--ignored','--exclude-standard','-z']).toString('utf8').split('\0').filter(Boolean);
        for(const file of ignored) {
          const destination=path.join(taskPath,file);
          fs.mkdirSync(path.dirname(destination),{recursive:true});
          fs.copyFileSync(path.join(snapshot,file),destination,fs.constants.COPYFILE_FICLONE);
        }
      }
      tasks.push({ id, assignmentId: id, requirementIndex: assignment.requirementIndex, path: taskPath, taskPath,
        files: normalizeOwnedPaths(assignment.files || assignment.fileOwnership), baselineCommit, baselineRef,
        repo: snapshot, mode: 'worktree' });
    }
    const ownershipPath = path.join(tempRoot, OWNED_MARKER);
    fs.writeFileSync(ownershipPath, JSON.stringify({ root:tempRoot, snapshot, baselineRef, tasks:tasks.map(t => ({ path:t.path, assignmentId:t.assignmentId, files:t.files, baselineCommit:t.baselineCommit, baselineRef:t.baselineRef, repo:t.repo, mode:t.mode })) }));
    const cleanup = [{ root: tempRoot, marker: ownershipPath, snapshot, baselineRef, paths: tasks.map(t => t.path) }];
    return { mode: 'worktree', base: { path: snapshot, baselineCommit, baselineRef }, tasks,
      sharedOverlaps: overlappingAssignments(list), cleanup, cleanupTasks: () => cleanupTaskWorkspaces({ cleanup }) };
  } catch (error) {
    if (tempRoot && fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
    return sharedResult(project, list, error.message);
  }
}

function collectTaskChanges(workspace) {
  if (!workspace || !Array.isArray(workspace.files) || !workspace.files.length) throw new Error('Cannot collect changes from a task without an explicit file scope');
  if (workspace.mode === 'shared' && !workspace.isolated) return { paths: [], patch: Buffer.alloc(0), mode: 'shared', assignmentId: workspace && workspace.assignmentId };
  const baseline = workspace.baselineCommit;
  const scope = workspace.files;
  if(workspace.strictScope) {
    const tracked=runGit(workspace.path,['diff','--name-only','-z',baseline,'--']).toString('utf8').split('\0').filter(Boolean);
    const untracked=runGit(workspace.path,['ls-files','--others','--exclude-standard','-z']).toString('utf8').split('\0').filter(Boolean);
    const outside=[...tracked,...untracked].filter(file=>!scope.some(owned=>scopeCovers(owned,file)));
    if(outside.length)throw Object.assign(new Error(`Worker changed files outside its scope: ${outside.join(', ')}`),{nonRetryable:true});
  }
  const addArgs = ['add', '-A', '--'];
  if (scope.length) addArgs.push(...scope); else addArgs.push('.');
  runGit(workspace.path, addArgs);
  const diffArgs = ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', baseline, '--'];
  if (scope.length) diffArgs.push(...scope);
  const patch = runGit(workspace.path, diffArgs);
  const namesArgs = ['diff', '--cached', '--name-only', '-z', baseline, '--'];
  if (scope.length) namesArgs.push(...scope);
  const paths = runGit(workspace.path, namesArgs).toString('utf8').split('\0').filter(Boolean).sort();
  return { paths, patch, scope: [...scope], baselineCommit: baseline, baselineRef: workspace.baselineRef, assignmentId: workspace.assignmentId, requirementIndex: workspace.requirementIndex };
}

function readPatchPaths(cwd, patch) {
  const output = runGit(cwd, ['apply', '--numstat', '-z', '--binary', '-'], patch);
  const records = output.toString('utf8').split('\0');
  const paths = [];
  for (const record of records) {
    if (!record) continue;
    const firstTab = record.indexOf('\t');
    const secondTab = record.indexOf('\t', firstTab + 1);
    if (firstTab < 0 || secondTab < 0 || secondTab === record.length - 1) throw new Error('Patch contains unsupported or ambiguous path metadata');
    paths.push(record.slice(secondTab + 1));
  }
  return [...new Set(paths)].sort();
}

function applyTaskChanges(projectPath, changes) {
  const project = path.resolve(projectPath);
  const patch = Buffer.isBuffer(changes && changes.patch) ? changes.patch : Buffer.from(changes && changes.patch || '');
  const paths = normalizeOwnedPaths(changes && changes.paths);
  if (!patch.length) return [];
  const scope = normalizeOwnedPaths(changes.scope);
  if (!scope.length) return [{ paths, error:'Patch has no explicit assignment scope' }];
  if (!paths.length) return [{ paths: [], error: 'Patch has no declared reviewed paths' }];
  // Validate in a disposable copy first so a failed multi-file patch cannot leave partial edits behind.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-req-apply-'));
  try {
    const candidate = path.join(temp, 'candidate'); fs.mkdirSync(candidate);
    copyProjectSnapshot(project, candidate);
    const actualPaths = readPatchPaths(candidate, patch);
    const declared = new Set(paths);
    const outsideDeclared = actualPaths.filter(p => !declared.has(p));
    const outsideScope = scope.length ? actualPaths.filter(p => !scope.some(s => scopeCovers(s, p))) : [];
    if (outsideDeclared.length || outsideScope.length) {
      return [{ paths: [...new Set([...outsideDeclared, ...outsideScope])], error: 'Patch paths exceed the reviewed or assigned scope' }];
    }
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
      const owned = new Set(recorded.tasks.map(task => path.resolve(typeof task === 'string' ? task : task.path)));
      if ((entry.paths || []).some(p => !owned.has(path.resolve(p)))) throw new Error('Cleanup path is not owned by this workflow');
      if (recorded.snapshot !== entry.snapshot) throw new Error('Cleanup snapshot mismatch');
      // These worktrees and ref exist only below the uniquely-created owned root.
      fs.rmSync(root, { recursive: true, force: true });
    } catch (error) { errors.push(error.message); }
  }
  return errors;
}

// Fingerprint of each changed or untracked file in a Git project root, to see which paths a live-project run touched; null outside a Git root.
function projectChanges(project) {
  try {
    if (path.resolve(gitText(project, ['rev-parse', '--show-toplevel'])) !== path.resolve(project)) return null;
    const entries = runGit(project, ['status', '--porcelain=v1', '-z', '-uall', '--no-renames']).toString('utf8').split(' ').filter(Boolean);
    return new Map(entries.map(entry => {
      const file = entry.slice(3);
      let hash; try { hash = crypto.createHash('sha1').update(fs.readFileSync(path.join(project, file))).digest('hex'); } catch { hash = 'missing'; }
      return [file, entry.slice(0, 2) + hash];
    }));
  } catch { return null; }
}
// Git roots use tracked change fingerprints; ordinary folders use file hashes.
// Both protect the original project while the worker edits an isolated snapshot.
function projectBaseline(project) {
  const changes=projectChanges(project);
  if(changes)try {return {kind:'git',changes,head:gitText(project,['rev-parse','HEAD'])};}catch{} // An unborn repository uses the folder baseline.
  const files=new Map();
  const walk=(directory,relative='')=>{
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
      if(entry.name==='.git')continue;
      const name=relative ? relative+'/'+entry.name : entry.name, full=path.join(directory,entry.name);
      if(entry.isSymbolicLink())throw Error('Cannot safely snapshot symbolic link: '+name);
      if(entry.isDirectory())walk(full,name);
      else if(entry.isFile()) {
        const hash=crypto.createHash('sha256'), buffer=Buffer.allocUnsafe(65536), descriptor=fs.openSync(full,'r');
        try {let count;while((count=fs.readSync(descriptor,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,count));}
        finally {fs.closeSync(descriptor);}
        files.set(name,hash.digest('hex'));
      } else throw Error('Unsupported project file: '+name);
    }
  };
  walk(project);return {kind:'folder',files};
}
function baselineUnchanged(project,before) {
  if(!before)return false;
  try {
    if(before.kind==='git')return gitText(project,['rev-parse','HEAD'])===before.head && touchedSince(project,before.changes)?.length===0;
    if(before.kind!=='folder')return false;
    const after=projectBaseline(project);
    return after.kind==='folder' && before.files.size===after.files.size && [...before.files].every(([name,hash])=>after.files.get(name)===hash);
  } catch {return false;}
}
function inspectProjectSetup(project,scope) {
  if(!fs.statSync(project).isDirectory())throw Error('The project folder is unavailable. Choose an existing folder.');
  fs.accessSync(project,fs.constants.R_OK | fs.constants.W_OK);
  fs.accessSync(os.tmpdir(),fs.constants.R_OK | fs.constants.W_OK);
  let gitVersion;
  try {gitVersion=gitText(project,['--version']);}
  catch {throw Error('Git could not start. Install Git or restart Relay after installing it, then choose Fix setup and retry.');}
  let gitRoot=null;
  try {gitRoot=gitText(project,['rev-parse','--show-toplevel']);}catch{}
  let scripts={};
  const packageFile=path.join(project,'package.json');
  if(fs.existsSync(packageFile))scripts=JSON.parse(fs.readFileSync(packageFile,'utf8')).scripts || {};
  for(const command of scope?.checks || []) {
    const executable=command.trim().match(/^([a-z0-9_-]+)(?:\.cmd)?(?:\s|$)/i)?.[1];
    if(executable && /^(node|npm|npx|pnpm|yarn|php|python|python3|pytest|composer|go|cargo|dotnet|bun)$/.test(executable)) {
      try {execFileSync(process.platform==='win32'?'where.exe':'which',[executable],{windowsHide:true,stdio:'pipe'});}
      catch {throw Error('The check needs '+executable+', which is not available. Use Fix setup and retry to find a supported check.');}
    }
    const script=command.trim().match(/^npm(?:\.cmd)?\s+(?:run\s+([\w:-]+)|(test|start|stop|restart))(?:\s|$)/i);
    if(script && !scripts[script[1] || script[2]])throw Error('The project has no npm script named '+(script[1] || script[2])+'. Use an existing verification command.');
  }
  return {gitVersion,scripts,projectKind:gitRoot && path.resolve(gitRoot)===path.resolve(project)?'git':'folder',workspace:'isolated snapshot',requiresGitRepository:false};
}

function touchedSince(project, before) {
  const after = before && projectChanges(project);
  if (!after) return null;
  return [...new Set([...before.keys(), ...after.keys()])].filter(file => before.get(file) !== after.get(file)).sort();
}

function validTaskWorkspace(workspace, assignment) {
  try {
    if (!workspace || !Array.isArray(workspace.files) || !workspace.files.length) return false;
    const normalizedFiles = normalizeOwnedPaths(workspace.files);
    if (!normalizedFiles.length || normalizedFiles.length !== workspace.files.length || normalizedFiles.some((file, i) => file !== workspace.files[i])) return false;
    if (assignment) {
      const assignedFiles = normalizeOwnedPaths(assignment.files || assignment.fileOwnership);
      if (!assignedFiles.length || JSON.stringify(assignedFiles) !== JSON.stringify(normalizedFiles)) return false;
      if (String(workspace.assignmentId || workspace.id) !== String(assignment.id)) return false;
    }
    if (workspace.mode !== 'worktree' && !(workspace.mode === 'shared' && workspace.isolated === true)) return false;
    const cleanup = workspace.cleanup || {};
    const root = path.resolve(cleanup.root || ''), marker = path.resolve(cleanup.marker || ''), taskPath = path.resolve(workspace.path || '');
    if (!pathInside(os.tmpdir(), root) || !pathInside(root, marker) || !pathInside(root, taskPath)) return false;
    for (const target of [root, marker, taskPath]) if (fs.lstatSync(target).isSymbolicLink()) return false;
    if (path.resolve(fs.realpathSync(root)) !== root || !fs.statSync(root).isDirectory() || !fs.statSync(taskPath).isDirectory()) return false;
    const recorded = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (path.resolve(recorded.root) !== root || path.resolve(recorded.snapshot) !== path.resolve(cleanup.snapshot || '') || recorded.baselineRef !== cleanup.baselineRef) return false;
    const taskRecord = (recorded.tasks || []).find(item => path.resolve(typeof item === 'string' ? item : item.path) === taskPath);
    if (!taskRecord || !(cleanup.paths || []).some(p => path.resolve(p) === taskPath)) return false;
    const record = typeof taskRecord === 'string' ? null : taskRecord;
    if (!record || record.assignmentId !== workspace.assignmentId || record.mode !== workspace.mode || record.repo !== workspace.repo ||
        record.baselineCommit !== workspace.baselineCommit || record.baselineRef !== workspace.baselineRef ||
        JSON.stringify(normalizeOwnedPaths(record.files)) !== JSON.stringify(normalizedFiles)) return false;
    if (!fs.existsSync(path.join(taskPath, '.git')) || !workspace.baselineCommit || !workspace.baselineRef || !workspace.repo) return false;
    const actualRoot = path.resolve(gitText(taskPath, ['rev-parse', '--show-toplevel']));
    if (actualRoot !== taskPath) return false;
    const actualCommon = path.resolve(taskPath, gitText(taskPath, ['rev-parse', '--git-common-dir']));
    const expectedCommon = path.resolve(workspace.repo, '.git');
    if (actualCommon !== expectedCommon) return false;
    if (gitText(workspace.repo, ['cat-file', '-e', `${workspace.baselineCommit}^{commit}`]) !== '') return false;
    if (gitText(workspace.repo, ['rev-parse', workspace.baselineRef]) !== workspace.baselineCommit) return false;
    if (workspace.mode === 'worktree') {
      const worktrees = gitText(workspace.repo, ['worktree', 'list', '--porcelain']);
      const listedPaths = worktrees.split(/\r?\n/).filter(line => line.startsWith('worktree ')).map(line => path.resolve(line.slice(9)));
      if (!listedPaths.includes(taskPath)) return false;
    } else runGit(taskPath, ['merge-base', '--is-ancestor', workspace.baselineCommit, 'HEAD']); // workers may commit: HEAD may advance, but only from the baseline (throws otherwise)
    return true;
  } catch { return false; }
}

module.exports = { createTaskWorkspaces, collectTaskChanges, applyTaskChanges, cleanupTaskWorkspaces, validTaskWorkspace, projectChanges, touchedSince, projectBaseline, baselineUnchanged, inspectProjectSetup };
