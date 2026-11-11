'use strict';
const assert = require('node:assert/strict');
const { createCowork } = require('./cowork');

const msgs = [];
const mk = (name, extra = {}) => createCowork({
  name: () => name, sharing: () => true, port: 0, beaconPort: 47999,
  serve: async (p, prompt) => ({ text: `${name}:${p}:${prompt}`, usage: { tokens: 10, cost: 0.5 } }),
  quota: async () => ({ claude: { windows: [{ remaining: 80, minutes: 300 }] } }),
  onMessage: (m, from) => msgs.push([name, from, m]),
  ...extra,
});
const until = async (f) => { for (let i = 0; i < 120; i++) { if (f()) return; await new Promise((r) => setTimeout(r, 50)); } throw new Error('timeout'); };
const digits = (c) => c.replace(/\D/g, '');

(async () => {
  const a = mk('Alice'), b = mk('Bob');
  const st = await a.host();
  assert.match(st.code, /^\d{3}-\d{3}-\d{3}$/); assert.match(st.invite, /^\d{3}-\d{3}-\d{3}@.+:\d+$/);
  const port = st.invite.split(':').pop(), code = st.code, at = (c) => `${c}@127.0.0.1:${port}`;

  // wrong code is refused with a clear error and does not link
  const wrong = code.slice(0, -1) + ((+code.at(-1) + 1) % 10);
  await assert.rejects(b.join(at(wrong)), /wrong or has been reset/);
  await assert.rejects(b.join('12'), /9-digit/);

  // correct code links, both sides see each other and each other's quota
  await b.join(at(code));
  await until(() => a.ready() && b.ready());
  assert.equal(a.peerName(), 'Bob'); assert.equal(b.peerName(), 'Alice');
  assert.equal(b.peerQuota().claude.windows[0].remaining, 80);

  // lending a subscription
  const r = await b.request('claude', 'hi');
  assert.equal(r.text, 'Alice:claude:hi'); assert.equal(r.usage.tokens, 10);
  assert.equal(a.status().lent.tokens, 10); assert.equal(b.status().borrowed.runs, 1);
  await assert.rejects(b.request('rm', 'x'), /Bad request/);

  // room traffic reaches the other side's onMessage
  b.send({ t: 'typing' }); await until(() => msgs.some(([, , m]) => m.t === 'typing'));
  assert.deepEqual(msgs.find(([, , m]) => m.t === 'typing').slice(0, 2), ['Alice', 'Bob']);

  // the code is reusable: disconnect and rejoin
  b.leave(); await until(() => a.status().state === 'waiting');
  await assert.rejects(a.request('claude', 'x'), /No co-work partner/);
  await b.join(at(code)); await until(() => a.ready() && b.ready());

  // reset kicks the partner and invalidates the old code
  const fresh = (await a.reset()).code;
  assert.notEqual(fresh, code); await until(() => !b.ready());
  await assert.rejects(b.join(at(code)), /wrong or has been reset/);
  await b.join(at(fresh)); await until(() => a.ready() && b.ready());
  b.leave(); await until(() => a.status().state === 'waiting');

  // five wrong guesses burn the code: even the right one stops working
  const burn = a.status().code;
  for (let i = 0; i < 5; i++) await b.join(at(burn.slice(0, -1) + ((+burn.at(-1) + 1) % 10))).catch(() => {});
  assert.notEqual(a.status().code, burn, 'code rotated after too many wrong guesses');
  await assert.rejects(b.join(at(burn)), /wrong or has been reset/);

  // short code alone is found on the network via the discovery beacon (loopback here)
  const c = mk('Carol', { beaconPort: 47999 });
  const real = require('./cowork');
  const found = await real.discover({ targets: ['127.0.0.1'], port: 47999, ms: 600 });
  assert.ok(found.some((f) => f.endsWith(':' + port)), 'beacon answers with the TCP port');

  a.stop(); b.stop(); c.stop();
  console.log('cowork tests passed'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
