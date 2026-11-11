'use strict';
// Co-work: link two Relay clients directly (no third-party server). The built-in listener only runs after the user approves it.
// A 9-digit code authenticates both sides with SRP (srp.js), which yields a session key; every later frame is AES-256-GCM encrypted.
// Either side can lend its subscription (run) and the pair can share a chat room (any other message type goes to opts.onMessage).
const net = require('net'), os = require('os'), dgram = require('dgram'), crypto = require('crypto');
const srp = require('./srp');
const PORT = 47837, BEACON = 47838, MAX_FRAME = 16 << 20, RUN_TIMEOUT = 15 * 60 * 1000, MAX_FAILS = 5, MAX_PENDING = 6;
const clean = (n) => String(n || '').replace(/[^\w .-]/g, '').trim().slice(0, 24) || 'peer';
const lanIp = () => Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address || '127.0.0.1';
const fmtCode = (c) => c.replace(/(\d{3})(?=\d)/g, '$1-');
const genCode = () => String(crypto.randomInt(0, 1e9)).padStart(9, '0');

// Newline-delimited JSON used only for the key exchange; done() hands the socket over to the encrypted channel.
function reader(sock) {
  let buf = Buffer.alloc(0), waiter = null, closed = false;
  const pump = () => {
    if (!waiter) return;
    const i = buf.indexOf(10);
    if (i >= 0) { const line = buf.subarray(0, i).toString(), w = waiter; buf = buf.subarray(i + 1); waiter = null; try { w.res(JSON.parse(line)); } catch { w.rej(new Error('bad handshake')); } }
    else if (closed) { const w = waiter; waiter = null; w.rej(new Error('closed')); }
    else if (buf.length > 4096) sock.destroy();
  };
  const onData = (d) => { buf = Buffer.concat([buf, d]); pump(); }, onClose = () => { closed = true; pump(); };
  sock.on('data', onData); sock.once('close', onClose);
  return {
    next: () => new Promise((res, rej) => { waiter = { res, rej }; pump(); }),
    done() { sock.pause(); sock.off('data', onData); sock.off('close', onClose); return buf; },
  };
}
const line = (sock, o) => sock.write(JSON.stringify(o) + '\n');

async function clientHandshake(sock, code) {
  const rd = reader(sock), a = srp.secret(), A = srp.pub(a);
  try {
    line(sock, { t: 'hi', A: srp.hex(A) });
    const r = await rd.next();
    if (r.t !== 'ch') throw new Error('bad handshake');
    const B = srp.unhex(r.B), K = srp.clientKey(code, Buffer.from(String(r.salt), 'hex'), a, A, B), M1 = srp.proof1(A, B, K);
    line(sock, { t: 'm1', M: M1.toString('hex') });
    const r2 = await rd.next().catch(() => ({})); // the server just hangs up on a wrong code
    if (r2.t !== 'm2' || !srp.eq(Buffer.from(String(r2.M), 'hex'), srp.proof2(A, M1, K))) throw Object.assign(new Error('wrong code'), { wrong: true });
    return K;
  } finally { rd.done(); }
}
async function serverHandshake(sock, ctx) {
  const rd = reader(sock);
  try {
    const r = await rd.next();
    if (r.t !== 'hi') throw new Error('bad handshake');
    const A = srp.unhex(r.A), { b, B } = srp.serverStart(ctx.v), K = srp.serverKey(ctx.v, A, b, B);
    line(sock, { t: 'ch', salt: ctx.salt.toString('hex'), B: srp.hex(B) });
    const r2 = await rd.next();
    if (r2.t !== 'm1' || !srp.eq(Buffer.from(String(r2.M), 'hex'), srp.proof1(A, B, K))) throw Object.assign(new Error('wrong code'), { wrong: true });
    line(sock, { t: 'm2', M: srp.proof2(A, srp.proof1(A, B, K), K).toString('hex') });
    return K;
  } finally { rd.done(); }
}

// Encrypted, length-prefixed JSON frames. Counter IVs are safe because the key is new per connection (SRP output).
function channel(sock, key, server) {
  const mine = crypto.randomBytes(16), iv = (n) => { const b = Buffer.alloc(12); b.writeBigUInt64BE(BigInt(n), 4); return b; };
  let theirs = null, tx, rx, txn = 0, rxn = 0, buf = Buffer.alloc(0);
  const ch = {
    sock, onmsg() {},
    send(obj) {
      const c = crypto.createCipheriv('aes-256-gcm', tx, iv(txn++)), ct = Buffer.concat([c.update(JSON.stringify(obj)), c.final(), c.getAuthTag()]), h = Buffer.alloc(4);
      h.writeUInt32BE(ct.length); sock.write(Buffer.concat([h, ct]));
    },
  };
  const dk = (info, a, b) => Buffer.from(crypto.hkdfSync('sha256', key, Buffer.concat([a, b]), info, 32));
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    try {
      if (!theirs) {
        if (buf.length < 16) return;
        theirs = Buffer.from(buf.subarray(0, 16)); buf = buf.subarray(16);
        if (server) sock.write(mine);
        const [a, b] = server ? [theirs, mine] : [mine, theirs];
        tx = dk(server ? 's2c' : 'c2s', a, b); rx = dk(server ? 'c2s' : 's2c', a, b);
        ch.ready?.();
      }
      while (buf.length >= 4) {
        const n = buf.readUInt32BE(0);
        if (n < 16 || n > MAX_FRAME) throw new Error('bad frame');
        if (buf.length < 4 + n) break;
        const ct = buf.subarray(4, 4 + n); buf = buf.subarray(4 + n);
        const dc = crypto.createDecipheriv('aes-256-gcm', rx, iv(rxn++)); dc.setAuthTag(ct.subarray(n - 16));
        ch.onmsg(JSON.parse(Buffer.concat([dc.update(ct.subarray(0, n - 16)), dc.final()]).toString('utf8')));
      }
    } catch { sock.destroy(); } // tampering or garbage: drop the connection
  });
  if (!server) sock.write(mine);
  sock.resume();
  return ch;
}

// LAN discovery: hosts answer a UDP broadcast with their TCP port. The answer carries no secret; the code still has to pass SRP.
function discover({ targets = null, port = BEACON, ms = 1200 } = {}) {
  return new Promise((resolve) => {
    const found = new Set(), s = dgram.createSocket('udp4');
    s.on('error', () => resolve([...found]));
    s.on('message', (m, r) => { const t = /^RELAY-COWORK!(\d{1,5})$/.exec(m.toString()); if (t) found.add(`${r.address}:${t[1]}`); });
    s.bind(0, () => {
      try { s.setBroadcast(true); } catch {}
      const addrs = targets || ['255.255.255.255', ...Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => {
        const ip = i.address.split('.').map(Number), mk = i.netmask.split('.').map(Number); return ip.map((b, n) => (b | (~mk[n] & 255))).join('.');
      })];
      for (const a of addrs) s.send('RELAY-COWORK?', port, a, () => {});
      setTimeout(() => { try { s.close(); } catch {} resolve([...found]); }, ms);
    });
  });
}

// opts: name() display name, sharing() bool, lends(provider) bool (per-provider switch; default on), serve(provider, prompt) -> {text, usage}, quota() -> {claude, codex}, onChange(),
//       onMessage(m, peerName) for room traffic, publicAddr() -> 'ip:port' | '', port/beaconPort (tests)
function createCowork(opts) {
  let server = null, beacon = null, link = null, peer = null, timer = null, nextId = 1, code = '', salt = null, ver = null, fails = 0, pendingHs = 0, tcpPort = 0;
  const pending = new Map(), tally = { lent: { runs: 0, tokens: 0, cost: 0 }, borrowed: { runs: 0, tokens: 0, cost: 0 } };
  const changed = () => { try { opts.onChange?.(); } catch {} };
  const lends = (p) => !!opts.sharing() && (opts.lends ? !!opts.lends(p) : true);
  const add = (t, u) => { t.runs++; t.tokens += u?.tokens || 0; t.cost = +(t.cost + (u?.cost || 0)).toFixed(6); };

  async function pushQuota() {
    if (!link || !peer) return;
    const q = await Promise.resolve(opts.quota?.()).catch(() => ({})) || {}, out = {};
    for (const p of ['claude', 'codex']) if (lends(p)) out[p] = { windows: q?.[p]?.windows || [], estimated: q?.[p]?.estimated, stale: q?.[p]?.stale }; // only providers this user allows are ever offered
    try { link.send({ t: 'quota', sharing: Object.keys(out).length > 0, lends: Object.keys(out), quota: out }); } catch {}
  }
  function drop(c) {
    if (c !== link) return;
    link = null; peer = null; clearInterval(timer);
    for (const [, p] of pending) p.reject(new Error('Co-work partner disconnected'));
    pending.clear(); changed();
  }
  function onMsg(c, m) {
    if (!m || typeof m.t !== 'string') return;
    if (c !== link) { // first frame of an authenticated connection must be hello; only one partner at a time
      if (m.t !== 'hello' || link) return c.sock.destroy();
      link = c; peer = { name: clean(m.name), sharing: false, lends: [], quota: {} };
      c.sock.setTimeout(0); clearInterval(timer); timer = setInterval(pushQuota, 60000); timer.unref?.();
      pushQuota(); return changed();
    }
    if (m.t === 'quota') { peer.sharing = !!m.sharing; peer.lends = (Array.isArray(m.lends) ? m.lends : []).filter((p) => p === 'claude' || p === 'codex'); peer.quota = m.quota && typeof m.quota === 'object' ? m.quota : {}; return changed(); }
    if (m.t === 'run') {
      const reply = (r) => { try { c.send({ t: 'result', id: m.id, ...r }); } catch {} };
      if (!['claude', 'codex'].includes(m.provider) || typeof m.prompt !== 'string') return reply({ ok: false, error: 'Bad request.' });
      if (!lends(m.provider)) return reply({ ok: false, error: `Your partner is not sharing their ${m.provider} subscription right now.` });
      return Promise.resolve().then(() => opts.serve(m.provider, m.prompt)).then((r) => { add(tally.lent, r.usage); changed(); reply({ ok: true, text: r.text, usage: r.usage }); }, (e) => reply({ ok: false, error: String(e?.message || e).slice(0, 500) }));
    }
    if (m.t === 'result') {
      const p = pending.get(m.id); if (!p) return; pending.delete(m.id); clearTimeout(p.timer);
      if (m.ok) { add(tally.borrowed, m.usage); changed(); p.resolve({ text: String(m.text || ''), usage: m.usage }); } else p.reject(new Error(m.error || 'Partner run failed'));
      return;
    }
    if (m.t !== 'bye') try { opts.onMessage?.(m, peer.name); } catch {}
  }
  function attach(sock, key, isServer) {
    const c = channel(sock, key, isServer);
    c.ready = () => c.send({ t: 'hello', name: opts.name() });
    c.onmsg = (m) => onMsg(c, m);
    sock.setTimeout(10000, () => sock.destroy()); // a connection that never says hello gets 10 s
    sock.on('close', () => drop(c));
    return c;
  }
  function newCode() { code = genCode(); salt = srp.newSalt(); ver = srp.verifier(code, salt); fails = 0; }
  function accept(sock) {
    sock.on('error', () => {}); sock.setTimeout(10000, () => sock.destroy());
    if (pendingHs >= MAX_PENDING) return sock.destroy();
    pendingHs++;
    serverHandshake(sock, { salt, v: ver }).then((K) => { fails = 0; attach(sock, K, true); }, (e) => {
      sock.destroy();
      if (e.wrong && ++fails >= MAX_FAILS) { newCode(); changed(); } // too many wrong guesses: the code burns
    }).finally(() => pendingHs--);
  }
  async function connect(addr, c) {
    const [host, port] = addr.split(/:(?=\d+$)/);
    const sock = net.connect(+port || PORT, host);
    sock.on('error', () => {});
    try {
      await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('unreachable')), 4000); sock.once('connect', () => { clearTimeout(t); res(); }); sock.once('error', (e) => { clearTimeout(t); rej(e); }); });
      attach(sock, await clientHandshake(sock, c), false);
      await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('unreachable')), 8000), d = setInterval(() => { if (peer) { clearTimeout(t); clearInterval(d); res(); } }, 40); sock.once('close', () => { clearTimeout(t); clearInterval(d); if (!peer) rej(new Error('unreachable')); }); });
    } catch (e) { sock.destroy(); throw e; }
  }
  const api = {
    // Starts the built-in listener (the caller asks the user first). The code stays valid until reset() or too many wrong guesses.
    host() {
      if (server) return Promise.resolve(api.status());
      newCode();
      server = net.createServer(accept);
      return new Promise((resolve, reject) => {
        const go = (port) => server.listen(port, '0.0.0.0');
        server.on('error', (e) => { if (e.code === 'EADDRINUSE' && port0) { port0 = 0; go(0); } else { server = null; reject(e); } });
        let port0 = opts.port ?? PORT;
        server.on('listening', () => {
          tcpPort = server.address().port;
          beacon = dgram.createSocket({ type: 'udp4', reuseAddr: true }); beacon.on('error', () => {});
          beacon.on('message', (m, r) => { if (m.toString() === 'RELAY-COWORK?') beacon.send(`RELAY-COWORK!${tcpPort}`, r.port, r.address); });
          try { beacon.bind(opts.beaconPort ?? BEACON); } catch {}
          changed(); resolve(api.status());
        });
        go(port0);
      });
    },
    reset() { fails = 0; if (!server) return api.host(); newCode(); api.leave(); changed(); return Promise.resolve(api.status()); }, // new code; the live link ends
    // text: "123-456-789" (found on the local network, or at the host used last time) or "123-456-789@host:port"
    async join(text) {
      const m = /^\s*(\d{3})[-\s]?(\d{3})[-\s]?(\d{3})(?:\s*@\s*([^\s:]+)(?::(\d{1,5}))?)?\s*$/.exec(text || '');
      if (!m) throw new Error('Enter the 9-digit code (123-456-789), or the full invite with its @address.');
      const c = m[1] + m[2] + m[3];
      api.leave();
      const targets = m[4] ? [`${m[4]}:${m[5] || PORT}`] : [...new Set([...(opts.recent?.() || []), ...await discover({ port: opts.beaconPort ?? BEACON })])];
      if (!targets.length) throw new Error('No Relay found on this network. Ask your partner for the full invite (code@address) to connect over the internet.');
      let wrong = false;
      for (const t of targets) {
        try { await connect(t, c); opts.onJoined?.(t); return api.status(); }
        catch (e) { if (e.wrong) wrong = true; }
      }
      throw new Error(wrong ? 'That code is wrong or has been reset. Ask your partner for the current one.' : 'Could not reach your partner. Check the address and that their Relay has co-work switched on.');
    },
    stop() { if (server) { server.close(); server = null; code = ''; } try { beacon?.close(); } catch {} beacon = null; api.leave(); },
    leave() { // disconnect only; a hosted code keeps working
      if (link) { try { link.send({ t: 'bye' }); } catch {} link.sock.destroy(); drop(link); }
      changed();
    },
    send(obj) { if (!link || !peer) throw new Error('Not linked'); link.send(obj); },
    sharingChanged: pushQuota,
    linked: () => !!(link && peer),
    ready: () => !!(link && peer?.sharing),
    peerQuota: () => (api.ready() ? peer.quota : null),
    peerName: () => peer?.name || '',
    request(provider, prompt) {
      if (!api.ready()) return Promise.reject(new Error('No co-work partner is sharing right now.'));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Partner took too long')); }, RUN_TIMEOUT);
        pending.set(id, { resolve, reject, timer });
        try { link.send({ t: 'run', id, provider, prompt }); } catch (e) { pending.delete(id); clearTimeout(timer); reject(e); }
      });
    },
    status() {
      const lan = server ? `${lanIp()}:${tcpPort}` : '', addr = (server && opts.publicAddr?.()) || lan;
      return { state: link ? 'linked' : server ? 'waiting' : 'off', hosting: !!server, code: server ? fmtCode(code) : '', invite: server ? `${fmtCode(code)}@${addr}` : '', address: addr, peer: peer && { name: peer.name, sharing: peer.sharing, lends: peer.lends }, sharing: !!opts.sharing(), ...tally };
    },
  };
  return api;
}
module.exports = { createCowork, clean, discover };
