const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createWorkspaces } = require('./cowork-workspace');
const { createCowork } = require('./cowork');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-background-'));
const project = path.join(root, 'project'); fs.mkdirSync(project);
fs.writeFileSync(path.join(project, 'app.txt'), 'original');
fs.writeFileSync(path.join(project, 'delete.txt'), 'delete me');
fs.writeFileSync(path.join(project, '.env'), 'NEVER SEND');
const changes = [], notices = [];
const a = createCowork({ name: () => 'Alice', sharing: () => true, port: 0, beaconPort: 47998, backgroundRuns: true,
  onMessage: m => host.message(m), serve: async () => ({ text: 'unused' }) });
const b = createCowork({ name: () => 'Bob', sharing: () => true, backgroundRuns: true,
  cancel: id => guest.cancel(id),
  onMessage: m => guest.message(m), serve: async (provider, prompt, context) => {
    const entry = guest.incoming(context.workspaceId);
    assert(entry?.ready, 'Temporary copy is ready without any shared chat');
    assert.equal(fs.existsSync(path.join(entry.root, '.env')), false, 'Secrets are excluded');
    entry.runBusy = true;
    fs.writeFileSync(path.join(entry.root, 'app.txt'), 'remote ' + provider);
    fs.writeFileSync(path.join(entry.root, 'new.txt'), 'created');
    fs.unlinkSync(path.join(entry.root, 'delete.txt'));
    guest.completeIncoming(context.workspaceId);
    return { text: 'edited', usage: { tokens: 10 } };
  } });
const host = createWorkspaces({ dir: path.join(root, 'host'), send: m => a.send(m), onFinish: change => changes.push(change), onError: e => notices.push(e) });
const guest = createWorkspaces({ dir: path.join(root, 'guest'), send: m => b.send(m) });
const until = async fn => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 30)); } throw Error('timeout'); };
(async () => {
  try {
    const info = await a.host();
    await b.join(info.code + '@127.0.0.1:' + info.invite.split(':').pop());
    await until(() => a.ready() && b.ready());
    assert.equal(a.status().peer.backgroundRuns, true);
    const id = host.start({ root: project, sid: 'chat', author: 'Bob' });
    const result = await a.request('codex', 'edit files', { workspaceId: id });
    assert.equal(result.text, 'edited');
    host.finish(id);
    assert.equal(fs.readFileSync(path.join(project, 'app.txt'), 'utf8'), 'remote codex');
    assert.equal(fs.readFileSync(path.join(project, 'new.txt'), 'utf8'), 'created');
    assert.equal(fs.existsSync(path.join(project, 'delete.txt')), false);
    assert.equal(changes[0].entries.length, 3, 'Returned changes have undo backups');
    await until(() => !guest.incoming(id));
    assert.equal(fs.readdirSync(path.join(root, 'guest')).length, 0, 'Temporary project copy is removed');

    const conflictId = host.start({ root: project, sid: 'chat', author: 'Bob' });
    await until(() => guest.incoming(conflictId)?.ready);
    const remoteRoot = guest.incoming(conflictId).root;
    fs.writeFileSync(path.join(project, 'app.txt'), 'my new edit');
    fs.writeFileSync(path.join(remoteRoot, 'app.txt'), 'their edit');
    guest.completeIncoming(conflictId); await until(() => host.conflicts(conflictId).length > 0);
    const conflict = host.conflicts(conflictId)[0];
    assert.equal(fs.readFileSync(path.join(project, 'app.txt'), 'utf8'), 'my new edit', 'Local edits made during the turn survive');
    assert.equal(fs.readFileSync(conflict.path, 'utf8'), 'their edit', 'Conflicting remote edits remain recoverable');
    host.finish(conflictId);
    await until(() => !guest.incoming(conflictId));
    const cancelId = host.start({ root: project, sid: 'chat', author: 'Bob' });
    await until(() => guest.incoming(cancelId)?.ready);
    const cancelled = guest.incoming(cancelId); cancelled.runBusy = true;
    fs.writeFileSync(path.join(cancelled.root, 'app.txt'), 'cancelled remote edit');
    a.cancel(cancelId); await until(() => cancelled.runCancelled);
    assert(fs.existsSync(cancelled.root), 'Running processes keep their copy until stopped');
    guest.completeIncoming(cancelId); host.finish(cancelId);
    assert.equal(fs.existsSync(cancelled.root), false, 'Cancelled copy is removed after the process stops');
    assert.equal(fs.readFileSync(path.join(project, 'app.txt'), 'utf8'), 'my new edit', 'Cancelled edits never get applied');
    assert.equal(notices.length, 0);
    console.log('Encrypted background borrowing, secret exclusion, edits, deletes, conflict preservation, Undo and cleanup passed');
  } finally { a.stop(); b.stop(); host.disconnect(); guest.disconnect(); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
