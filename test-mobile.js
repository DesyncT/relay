'use strict';
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { createMobile, CALL_OK, EVENT_OK } = require('./mobile');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-mobile-'));
const root = path.join(tmp, 'dist'), uploads = path.join(tmp, 'uploads');
fs.mkdirSync(path.join(root, 'bundle'), { recursive: true }); fs.mkdirSync(uploads);
fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><head><title>x</title></head><body>app</body></html>');
fs.writeFileSync(path.join(root, 'bundle', 'a.js'), 'console.log(1)');
fs.writeFileSync(path.join(uploads, 'pic.png'), 'PNG'); fs.writeFileSync(path.join(uploads, 'note.html'), '<script>alert(1)</script>');
fs.writeFileSync(path.join(tmp, 'secret.txt'), 'TOP SECRET');

const calls = []; let approve = true, saved = [];
const m = createMobile({
  root, uploads, port: 0, host: '127.0.0.1',
  invoke: async (ch, args) => { calls.push([ch, args]); if (ch === 'boom') throw new Error('x'); return { ch, args }; },
  approve: async () => approve, load: () => [], save: (l) => { saved = l; },
});
const req = (port, p, { method = 'GET', headers = {}, body } = {}) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (resp) => { const parts = []; resp.on('data', (c) => parts.push(c)); resp.on('end', () => res({ status: resp.statusCode, headers: resp.headers, body: Buffer.concat(parts).toString() })); });
  r.on('error', rej); r.end(body);
});
const cookieOf = (r) => /rm=([\w-]+)/.exec(r.headers['set-cookie']?.[0] || '')?.[1];

(async () => {
  const st = await m.start(), port = +st.address.split(':')[1];
  // nothing works without pairing
  for (const p of ['/', '/bundle/a.js', '/events', '/f?p=x', '/m.js']) assert.equal((await req(port, p)).status, 401, p);
  assert.equal((await req(port, '/call', { method: 'POST', headers: { 'x-relay': '1' }, body: '{}' })).status, 401);
  assert.equal((await req(port, '/', { headers: { host: 'evil.example.com' } })).status, 400, 'DNS-rebinding style hosts are refused');

  // pairing: one-time token, device approval, cookie
  assert.equal((await req(port, '/?pair=nope')).status, 403);
  const link = m.pair(); assert.match(link.url, /^http:\/\/127\.0\.0\.1:\d+\/\?pair=[\w-]{32}$/);
  const tok = new URL(link.url).search;
  approve = false; assert.equal((await req(port, '/' + tok)).status, 403, 'declined on the desktop');
  assert.equal((await req(port, '/' + tok)).status, 403, 'token is single-use even when declined');
  approve = true; const t2 = new URL(m.pair().url).search;
  const paired = await req(port, '/' + t2, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604' } });
  assert.equal(paired.status, 302); assert.match(paired.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/);
  assert.equal((await req(port, '/' + t2)).status, 403, 'used token cannot pair a second device');
  const cookie = `rm=${cookieOf(paired)}`, H = { cookie };
  assert.equal(m.status().devices[0].name, 'iPhone · Safari'); assert.equal(saved.length, 1);
  assert.ok(!JSON.stringify(m.status()).includes(cookieOf(paired)), 'status never exposes the session secret');

  // the app is served with the shim injected; static files and traversal
  const home = await req(port, '/', { headers: H }); assert.equal(home.status, 200); assert.match(home.body, /<script src="\/m\.js">/); assert.match(home.body, /viewport/);
  assert.equal((await req(port, '/bundle/a.js', { headers: H })).body, 'console.log(1)');
  assert.match((await req(port, '/m.js', { headers: H })).body, /window\.api/);
  for (const p of ['/..%2f..%2fsecret.txt', '/%2e%2e/secret.txt', '/bundle/..%2f..%2fsecret.txt']) assert.notEqual((await req(port, p, { headers: H })).body, 'TOP SECRET', p);

  // calls: allowlisted only, needs the header, same-origin only
  const post = (ch, args = [], headers = {}) => req(port, '/call', { method: 'POST', headers: { ...H, 'x-relay': '1', ...headers }, body: JSON.stringify({ ch, args }) });
  const ok = await post('chat:send', ['s1', 'hi']); assert.equal(ok.status, 200); assert.deepEqual(JSON.parse(ok.body).result, { ch: 'chat:send', args: ['s1', 'hi'] });
  const before = calls.length;
  for (const ch of ['settings:save', 'agents:run', 'agents:save', 'rules:save', 'panel:term:write', 'panel:file:read', 'cowork:state', 'cowork:host', 'procs:kill', 'projects:pick', 'projects:remove', 'chat:clear', 'chat:open', 'sessions:delete', 'update:install', 'auth:login', '__proto__', 'constructor']) assert.equal((await post(ch)).status, 403, ch);
  assert.equal(calls.length, before, 'blocked channels never reach the desktop');
  assert.equal((await req(port, '/call', { method: 'POST', headers: { ...H }, body: '{"ch":"chat:info","args":[]}' })).status, 403, 'missing x-relay header');
  assert.equal((await post('chat:info', [], { origin: 'http://evil.example.com' })).status, 403, 'cross-site origin');
  assert.equal((await post('chat:info', [{ big: 'x'.repeat(1.1e6) }])).status, 403, 'oversized arguments');
  for (const ch of CALL_OK) assert.ok(!/^(?:settings:save|agents|rules|panel|cowork:(?:state|host|join|reset|stop|leave|lend|share|undo|unshare)|procs:kill|auth|update|plugins|themes)/.test(ch), 'allowlist stays chat-only: ' + ch);

  // live events: allowlisted channels stream, sensitive ones never do
  const got = []; await new Promise((resolve) => {
    const r = http.get({ host: '127.0.0.1', port, path: '/events', headers: { host: `127.0.0.1:${port}`, ...H } }, (resp) => { resp.on('data', (c) => got.push(c.toString())); setTimeout(resolve, 150); });
    r.on('error', () => {});
  });
  m.emit('chat:msg', { sessionId: 's1', text: 'hello' }); m.emit('cowork:state', { code: '123-456-789' }); m.emit('panel:term:data', 'secret'); m.emit('update:state', {});
  await new Promise((r) => setTimeout(r, 150));
  const stream = got.join(''); assert.match(stream, /event: chat:msg\ndata: \{"sessionId":"s1","text":"hello"\}/); assert.doesNotMatch(stream, /123-456-789|panel:term|update:state/);
  assert.ok(EVENT_OK.test('spend:update') && !EVENT_OK.test('cowork:state'));

  // files: only from the uploads folder, images inline, anything else as a download
  const f = (p) => req(port, '/f?p=' + encodeURIComponent(p), { headers: H });
  assert.equal((await f(path.join(uploads, 'pic.png'))).body, 'PNG');
  const html = await f(path.join(uploads, 'note.html')); assert.match(html.headers['content-disposition'], /attachment/); assert.equal(html.headers['content-type'], 'application/octet-stream');
  assert.equal((await f(path.join(tmp, 'secret.txt'))).status, 404); assert.equal((await f(path.join(uploads, '..', 'secret.txt'))).status, 404); assert.equal((await f('C:\\Windows\\win.ini')).status, 404);

  // revoking a device cuts it off at once
  m.revoke(m.status().devices[0].id); assert.equal((await req(port, '/', { headers: H })).status, 401); assert.equal(saved.length, 0);

  // repeated bad pairing attempts are throttled
  let last; for (let i = 0; i < 7; i++) last = await req(port, '/?pair=bad' + i); assert.equal(last.status, 429);

  m.stop(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log('mobile tests passed'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
