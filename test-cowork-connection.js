const assert = require('node:assert/strict'), net = require('node:net');
const { createCowork } = require('./cowork');
const originalConnect = net.connect, sockets = [];
net.connect = (...args) => { const socket = originalConnect(...args); sockets.push(socket); return socket; };
let releaseQuota, served = 0;
const quota = new Promise(resolve => { releaseQuota = resolve; });
const a = createCowork({ name: () => 'Alice', sharing: () => true, port: 0, beaconPort: 47997, quota: () => quota, serve: () => { served++; return new Promise(() => {}); } });
const b = createCowork({ name: () => 'Bob', sharing: () => true });
const until = async fn => { for (let i = 0; i < 160; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 30)); } throw Error('timeout'); };
(async () => {
  try {
    const host = await a.host(); await b.join(host.code + '@127.0.0.1:' + host.invite.split(':').pop());
    await until(() => a.ready() && b.ready());
    assert.equal(b.peerQuota().claude.windows.length, 0, 'Sharing is usable before a slow quota scan completes');
    const interrupted = b.request('codex', 'do not run this twice');
    const rejection = assert.rejects(interrupted, error => error.coworkInterrupted === true && /connection dropped/i.test(error.message));
    await until(() => served === 1);
    const first = sockets[0]; first.destroy();
    await rejection;
    await until(() => b.status().state === 'reconnecting');
    await until(() => a.ready() && b.ready());
    assert(sockets.length >= 2, 'Dropped authenticated connections reconnect automatically');
    assert.equal(served, 1, 'Reconnecting never replays a paid turn');
    const count = sockets.length; b.leave();
    await new Promise(resolve => setTimeout(resolve, 1300));
    assert.equal(sockets.length, count, 'Disconnect never reconnects behind the user’s back');
    await b.join(host.code + '@127.0.0.1:' + host.invite.split(':').pop());
    await until(() => a.ready() && b.ready());
    const peerCount = sockets.length; a.leave();
    await new Promise(resolve => setTimeout(resolve, 1300));
    assert.equal(sockets.length, peerCount, 'A partner deliberately disconnecting is respected too');
    let handshakeTimeout = 0;
    const stalled = net.createServer(socket => socket.on('error', () => {}));
    await new Promise(resolve => stalled.listen(0, '127.0.0.1', resolve));
    net.connect = (...args) => {
      const socket = originalConnect(...args), setTimeout = socket.setTimeout.bind(socket);
      socket.setTimeout = (ms, callback) => { handshakeTimeout = ms; return setTimeout(Math.min(ms, 50), callback); };
      return socket;
    };
    try {
      await assert.rejects(b.join('123456789@127.0.0.1:' + stalled.address().port), /Could not reach/i);
      assert.equal(handshakeTimeout, 10000, 'A silent SRP peer cannot freeze reconnection indefinitely');
    } finally { stalled.close(); }
    releaseQuota({});
    console.log('Immediate sharing availability, automatic reconnect and deliberate disconnect checks passed');
  } finally { releaseQuota({}); a.stop(); b.stop(); net.connect = originalConnect; }
})().catch(error => { console.error(error); process.exitCode = 1; });
