'use strict';
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { safeRel, createSync, saveChange, undoChange, hash } = require('./cowork-fs');

// paths that must never be written or read
for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:\\Windows\\x', 'C:/x', '.git/config', 'a/.git/hooks/pre-commit', 'node_modules/x/y.js', '.claude/settings.json', '.codex/config.toml',
  '.env', 'cfg/.env.local', 'id_rsa', 'k/server.pem', 'a//b', 'a/./b', 'con.txt', 'x/aux', 'trail.', 'file:stream', '', 'a\u0000b', 5]) assert.equal(safeRel(bad), null, String(bad));
assert.equal(safeRel('src\\app\\main.js'), 'src/app/main.js'); assert.equal(safeRel('README.md'), 'README.md');

const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), 'relay-' + n + '-'));
const wr = (root, rel, txt) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), txt); };
const rd = (root, rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; } };

(async () => {
  const hostRoot = tmp('host'), guestRoot = tmp('guest'), undoDir = tmp('undo');
  wr(hostRoot, 'src/a.js', 'one'); wr(hostRoot, 'readme.md', 'hi'); wr(hostRoot, '.env', 'SECRET=1'); wr(hostRoot, 'node_modules/x/i.js', 'x'); wr(hostRoot, '.git/config', 'g');
  wr(guestRoot, 'stale.txt', 'old copy');
  let host, guest; const toGuest = [], toHost = [];
  host = createSync({ root: hostRoot, send: (m) => toGuest.push(m) });
  guest = createSync({ root: guestRoot, send: (m) => toHost.push(m), allowSnap: true });
  const flush = () => { while (toGuest.length) guest.apply(toGuest.shift()); const applied = []; while (toHost.length) applied.push(...host.apply(toHost.shift())); return applied; };

  // snapshot: allowed files only, the guest's stale copy is wiped
  host.snapshot(); flush();
  assert.equal(rd(guestRoot, 'src/a.js'), 'one'); assert.equal(rd(guestRoot, 'readme.md'), 'hi');
  assert.equal(rd(guestRoot, '.env'), null); assert.equal(rd(guestRoot, 'node_modules/x/i.js'), null); assert.equal(rd(guestRoot, '.git/config'), null); assert.equal(rd(guestRoot, 'stale.txt'), null);

  // guest edits, creates and deletes: applied on the host, backups recorded, no echo back
  wr(guestRoot, 'src/a.js', 'two'); wr(guestRoot, 'src/new.js', 'new'); fs.unlinkSync(path.join(guestRoot, 'readme.md'));
  guest.push(['src/a.js', 'src/new.js', 'readme.md']);
  const applied = flush();
  assert.equal(rd(hostRoot, 'src/a.js'), 'two'); assert.equal(rd(hostRoot, 'src/new.js'), 'new'); assert.equal(rd(hostRoot, 'readme.md'), null);
  assert.equal(applied.length, 3); assert.equal(applied.find((e) => e.rel === 'src/a.js').prev.toString(), 'one');
  host.push(['src/a.js', 'src/new.js', 'readme.md']); assert.equal(toGuest.length, 0, 'applied changes are not echoed back');

  // undo restores all three on the host, and pushing the result reverts the guest copy too
  saveChange(undoDir, 'c1', { author: 'Bob' }, applied);
  const u = undoChange(undoDir, 'c1', hostRoot);
  assert.equal(u.restored.length, 3); assert.equal(rd(hostRoot, 'src/a.js'), 'one'); assert.equal(rd(hostRoot, 'src/new.js'), null); assert.equal(rd(hostRoot, 'readme.md'), 'hi');
  host.push(['src/a.js', 'src/new.js', 'readme.md']); flush();
  assert.equal(rd(guestRoot, 'src/a.js'), 'one'); assert.equal(rd(guestRoot, 'src/new.js'), null); assert.equal(rd(guestRoot, 'readme.md'), 'hi');
  assert.throws(() => undoChange(undoDir, 'c1', hostRoot), /Already undone/);

  // undo skips files the host changed afterwards
  wr(guestRoot, 'src/a.js', 'guest2'); guest.push(['src/a.js']); const ap2 = flush(); saveChange(undoDir, 'c2', {}, ap2);
  wr(hostRoot, 'src/a.js', 'host edited after');
  const u2 = undoChange(undoDir, 'c2', hostRoot); assert.deepEqual(u2.skipped, ['src/a.js']); assert.equal(rd(hostRoot, 'src/a.js'), 'host edited after');

  // hostile messages are ignored: traversal, secrets, .git, hash mismatch, oversize
  const evil = (p, txt = 'pwn') => ({ p, d: Buffer.from(txt).toString('base64'), h: hash(Buffer.from(txt)) });
  const outside = path.join(path.dirname(hostRoot), 'escaped.txt');
  host.apply({ t: 'fs', puts: [evil('../escaped.txt'), evil('.env'), evil('.git/hooks/post-checkout'), evil('.claude/settings.json'), evil('ok.txt', 'fine'), { ...evil('bad.txt'), h: 'deadbeef' }], dels: ['../../x', '.env'] });
  assert.equal(fs.existsSync(outside), false); assert.equal(rd(hostRoot, '.env'), 'SECRET=1'); assert.equal(rd(hostRoot, 'ok.txt'), 'fine'); assert.equal(rd(hostRoot, 'bad.txt'), null);
  assert.equal(fs.existsSync(path.join(hostRoot, '.git', 'hooks')), false);

  // writing through a symlinked directory is refused (skipped where the OS will not create symlinks)
  const target = tmp('target');
  try { fs.symlinkSync(target, path.join(hostRoot, 'link'), 'junction'); host.apply({ t: 'fs', puts: [evil('link/out.txt')] }); assert.equal(fs.existsSync(path.join(target, 'out.txt')), false, 'symlink escape'); } catch (e) { if (e.name === 'AssertionError') throw e; }

  // a hostile partner cannot make the host wipe its real project with a snapshot message
  host.apply({ t: 'fs', snap: true }); assert.equal(rd(hostRoot, 'src/a.js'), 'host edited after');

  // editing can be paused
  const paused = createSync({ root: hostRoot, send() {}, canWrite: () => false });
  assert.deepEqual(paused.apply({ t: 'fs', puts: [evil('nope.txt')] }), []); assert.equal(rd(hostRoot, 'nope.txt'), null);

  // the file watcher pushes real edits on its own
  const got = []; const w = createSync({ root: guestRoot, send: (m) => got.push(m) }); w.watch();
  await new Promise((r) => setTimeout(r, 200)); wr(guestRoot, 'watched.txt', 'live');
  for (let i = 0; i < 40 && !got.some((m) => m.puts?.some((f) => f.p === 'watched.txt')); i++) await new Promise((r) => setTimeout(r, 100));
  w.close(); assert.ok(got.some((m) => m.puts?.some((f) => f.p === 'watched.txt')), 'watcher noticed the new file');

  for (const d of [hostRoot, guestRoot, undoDir, target]) fs.rmSync(d, { recursive: true, force: true });
  console.log('cowork-fs tests passed'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
