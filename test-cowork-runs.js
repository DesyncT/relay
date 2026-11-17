const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), os = require('node:os');
const { createSync } = require('./cowork-fs');
const source = fs.readFileSync('main.js', 'utf8');
const section = source.slice(source.indexOf('const lendOf ='), source.indexOf('const REMOTE_NOTE ='));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-cowork-runs-'));
const hostRoot = path.join(root, 'host'), guestRoot = path.join(root, 'guest');
fs.mkdirSync(hostRoot); fs.mkdirSync(guestRoot);
const host = createSync({ root: hostRoot, send: m => guest.apply(m) });
const guest = createSync({ root: guestRoot, send: m => host.apply(m), allowSnap: true });
fs.writeFileSync(path.join(hostRoot, 'app.txt'), 'before'); host.snapshot();
const calls = [], state = { room: null, busy: false };
const context = {
  settings: { coworkLend: { codex: true } }, room: null, pendingRoom: null,
  fs, path, SCRATCH_DIR: path.join(root, 'scratch'), DATA: root,
  prof: () => ({ name: 'Alice' }), isDown: () => false, routeFor: () => ({ meta: { model: 'test-model' } }),
  localBusy: () => state.busy, syncBusy: () => {}, drainUserQueue: () => {},
  saveSettings: () => {}, send: () => {}, endRoom: () => {}, onRoomMessage: () => {},
  unpackFiles: files => files || [],
  sessOf: () => ({ messages: [] }),
  createCowork: opts => ({ serve: opts.serve, status: () => ({}) }),
  PROV: Object.fromEntries(['claude', 'codex'].map(provider => [provider, async (prompt, trigger, options) => {
    calls.push({ provider, prompt, trigger, options });
    if (!options.textOnly) fs.writeFileSync(path.join(options.cwd, 'app.txt'), provider + ' edited');
    return { text: 'Edited', usage: { tokens: 10 } };
  }])),
};
vm.createContext(context);
vm.runInContext(section + '\nthis.serve = cowork.serve; this.status = coworkState;', context);
(async () => {
  try {
    assert.equal(context.status().lendable.codex, true, 'Codex switch is enabled');
    assert.equal(context.status().lend.codex, true);
    context.settings.coworkLend.codex = false;
    assert.equal(context.status().lend.codex, false, 'Switch off is preserved');
    context.settings.coworkLend.codex = true;
    await assert.rejects(context.serve('codex', 'edit', {}), /shared chat/i);
    assert.equal(calls.length, 0, 'Codex cannot run tools outside a shared chat');
    context.room = { sid: 'guest-session', rid: 'shared-room', root: guestRoot, ready: true, sync: guest };
    await assert.rejects(context.serve('codex', 'edit', { roomId: 'wrong-room' }), /shared chat/i);
    assert.equal(calls.length, 0, 'Unmatched room cannot select a filesystem root');
    context.room.ready = false;
    await assert.rejects(context.serve('codex', 'edit', { roomId: 'shared-room' }), /sync/i);
    context.room.ready = true; state.busy = true;
    await assert.rejects(context.serve('codex', 'edit', { roomId: 'shared-room' }), /busy/i);
    state.busy = false;
    for (const provider of ['claude', 'codex']) {
      const result = await context.serve(provider, 'edit app.txt', { roomId: 'shared-room', attachments: [{ name: 'spec.txt', path: path.join(guestRoot, 'spec.txt') }] });
      assert.equal(result.text, 'Edited');
      assert.equal(calls.at(-1).options.cwd, guestRoot);
      assert.ok(calls.at(-1).prompt.includes(path.join(guestRoot, 'spec.txt')), 'Borrowed agents receive local attachment paths');
      assert.equal(!!calls.at(-1).options.isCancelled(), false);
      assert.equal(!!calls.at(-1).options.textOnly, false, 'Shared agents retain edit tools');
      assert.equal(fs.readFileSync(path.join(hostRoot, 'app.txt'), 'utf8'), provider + ' edited', 'Changes arrive before the run completes');
      assert.equal(!!context.room.runBusy, false);
    }
    const oldRun = context.PROV.codex;
    context.PROV.codex = async () => { throw new Error('provider failed'); };
    await assert.rejects(context.serve('codex', 'edit', { roomId: 'shared-room' }), /provider failed/);
    assert.equal(context.room.runBusy, false, 'Provider errors release the busy state');
    context.PROV.codex = oldRun;
    context.room = null;
    await context.serve('claude', 'text reply', {});
    assert.equal(calls.at(-1).options.textOnly, true, 'Legacy Claude borrowing remains text-only');
    const requestCalls = [];
    const remote = {
      room: { sid: 'host-session', rid: 'shared-room', ready: true, sync: { flush: () => {} } },
      routeFor: () => ({ meta: {} }), REMOTE_NOTE: 'TEXT ONLY: ',
      packFiles: files => files || [], addSpend: () => {}, send: () => {},
      cowork: { peerName: () => 'Alice', status: () => ({ peer: { sharedRuns: true } }), request: async (...args) => { requestCalls.push(args); return { text: 'done', usage: {} }; } },
    };
    vm.createContext(remote);
    vm.runInContext(source.slice(source.indexOf('async function remoteRun('), source.indexOf('// ---- shared chat room ----')), remote);
    await remote.remoteRun('host-session', 'codex', () => 'edit app.txt', { attachments: [{ name: 'image.png' }] });
    assert.equal(requestCalls[0][2].roomId, 'shared-room');
    assert.equal(requestCalls[0][1], 'edit app.txt', 'Editable runs are not given text-only instructions');
    remote.room = null;
    await assert.rejects(remote.remoteRun('host-session', 'codex', () => 'edit'), /both clients/i);
    assert.equal(requestCalls.length, 1, 'Codex cannot borrow tools without an accepted shared folder');
    let finishPreflight;
    const cli = { settings: {}, preflightCli: () => new Promise(resolve => { finishPreflight = resolve; }), tracked: () => { throw Error('Must not launch'); }, runCodex: () => { throw Error('Must not launch'); }, runClaude: () => { throw Error('Must not launch'); } };
    vm.createContext(cli);
    vm.runInContext(source.slice(source.indexOf('claudeRun = async'), source.indexOf('const PROV =')), cli);
    for (const provider of ['claude', 'codex']) {
      const options = { isCancelled: () => true };
      const run = provider === 'claude' ? cli.claudeRun('claude', 'claude', 'edit', options) : cli.codexRun('edit', [], options);
      finishPreflight();
      await assert.rejects(run, error => error.cancelled === true, 'Cancelled preflight must not launch tool access');
    }
    console.log('Codex and Claude shared edit routing, sync, scope and busy guards passed');
  } finally { host.close(); guest.close(); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
