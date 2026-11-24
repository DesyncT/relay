// Git-backed checkpoints (rewind). Snapshots the worktree into a commit under refs/relay/<sid>/<n> via a temporary index, so the real index/HEAD/stash are untouched.
const { execFile } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const KEEP = 30;
const git = (cwd, args, env = {}, input) => new Promise((res, rej) => {
  const p = execFile('git', args, { cwd, env: { ...process.env, ...env }, maxBuffer: 256 << 20, windowsHide: true, encoding: 'utf8' }, (e, out, err) => e ? rej(new Error((err || e.message).trim())) : res(out));
  if (input != null) p.stdin.end(input);
});
const refBase = (sid) => `refs/relay/${String(sid).replace(/[^\w.-]/g, '_')}`;
// newest KEEP stay; the rest are returned in drop (pure, tested)
const prune = (list, keep = KEEP) => { const s = [...list].sort((a, b) => a.id - b.id); return { keep: s.slice(-keep), drop: s.slice(0, Math.max(0, s.length - keep)) }; };
const isGit = (cwd) => git(cwd, ['rev-parse', '--is-inside-work-tree']).then((o) => o.trim() === 'true', () => false);
const withIndex = async (fn) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-ix-')); try { return await fn({ GIT_INDEX_FILE: path.join(dir, 'index') }); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };
const ID = { GIT_AUTHOR_NAME: 'Relay', GIT_AUTHOR_EMAIL: 'relay@localhost', GIT_COMMITTER_NAME: 'Relay', GIT_COMMITTER_EMAIL: 'relay@localhost' };

// tree hash of the current worktree (tracked + untracked, not ignored), via a temporary index
const worktreeTree = async (cwd, head) => {
  if (head === undefined) head = await git(cwd, ['rev-parse', '-q', '--verify', 'HEAD']).then((o) => o.trim(), () => '');
  return withIndex(async (env) => { if (head) await git(cwd, ['read-tree', head], env); await git(cwd, ['add', '-A'], env); return (await git(cwd, ['write-tree'], env)).trim(); });
};
// unified diff between two commit/tree ids, capped
const diffBetween = async (cwd, a, b, max = 40000) => (await git(cwd, ['diff', '--no-color', a, b])).slice(0, max);

// -> {id, ref, sha, at, who, label}; id continues after the highest existing one
async function snapshot(cwd, sid, list, who, label) {
  const id = Math.max(0, ...list.map((c) => c.id)) + 1, ref = `${refBase(sid)}/${id}`;
  const head = await git(cwd, ['rev-parse', '-q', '--verify', 'HEAD']).then((o) => o.trim(), () => '');
  const tree = await worktreeTree(cwd, head);
  const sha = (await git(cwd, ['commit-tree', tree, ...(head ? ['-p', head] : []), '-m', 'relay checkpoint'], ID)).trim();
  await git(cwd, ['update-ref', ref, sha]);
  return { id, ref, sha, at: Date.now(), who, label: String(label || '').slice(0, 60) };
}
const dropRefs = (cwd, drop) => Promise.all(drop.map((c) => git(cwd, ['update-ref', '-d', c.ref]).catch(() => {})));

// worktree -> snapshot tree; then removes files that exist now (tracked or untracked, not ignored) but not in the snapshot
async function restore(cwd, sha) {
  await withIndex((env) => git(cwd, ['read-tree', sha], env).then(() => git(cwd, ['checkout-index', '-a', '-f'], env)));
  const lines = async (args) => (await git(cwd, args)).split('\0').filter(Boolean);
  const want = new Set(await lines(['ls-tree', '-r', '--name-only', '-z', sha]));
  const root = path.resolve(cwd);
  for (const f of await lines(['ls-files', '-c', '-o', '--exclude-standard', '-z'])) {
    const abs = path.resolve(root, f);
    if (!want.has(f) && abs.startsWith(root + path.sep)) try { fs.unlinkSync(abs); } catch {}
  }
}
module.exports = { worktreeTree, diffBetween, KEEP, prune, isGit, snapshot, dropRefs, restore };
