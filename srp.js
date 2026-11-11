'use strict';
// SRP-6a over the RFC 3526 2048-bit group: turns a short code into a strong session key. Whoever sees or relays the
// handshake can test only one code guess per live connection (nothing to brute-force offline), and the key proves both sides know the code.
const crypto = require('crypto');
const N = BigInt('0x' + crypto.getDiffieHellman('modp14').getPrime('hex')), g = 2n;
const buf = (p) => (Buffer.isBuffer(p) ? p : Buffer.from(p));
const H = (...p) => crypto.createHash('sha256').update(Buffer.concat(p.map(buf))).digest();
const pad = (n) => Buffer.from(n.toString(16).padStart(512, '0'), 'hex');
const big = (b) => BigInt('0x' + b.toString('hex'));
const mod = (a) => ((a % N) + N) % N;
function modPow(b, e, m = N) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; e >>= 1n; b = (b * b) % m; } return r; }
const k = big(H(pad(N), pad(g)));
const u = (A, B) => { const v = big(H(pad(A), pad(B))); if (v === 0n) throw new Error('bad srp'); return v; };
const x = (salt, code) => big(crypto.scryptSync(String(code), salt, 32));
const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);
const valid = (n) => typeof n === 'bigint' && mod(n) !== 0n;

const newSalt = () => crypto.randomBytes(16);
const verifier = (code, salt) => modPow(g, x(salt, code));
const secret = () => big(crypto.randomBytes(32));
const pub = (a) => modPow(g, a);
// server: one-time (b, B) per connection from the stored verifier
function serverStart(v) { const b = secret(); return { b, B: (k * v + modPow(g, b)) % N }; }
function serverKey(v, A, b, B) { if (!valid(A)) throw new Error('bad srp'); return H(pad(modPow((A * modPow(v, u(A, B))) % N, b))); }
function clientKey(code, salt, a, A, B) {
  if (!valid(B)) throw new Error('bad srp');
  const xx = x(salt, code);
  return H(pad(modPow(mod(B - k * modPow(g, xx)), a + u(A, B) * xx)));
}
const proof1 = (A, B, K) => H(pad(A), pad(B), K);
const proof2 = (A, M1, K) => H(pad(A), M1, K);
const hex = (n) => n.toString(16);
const unhex = (s) => { if (typeof s !== 'string' || !/^[0-9a-f]{1,520}$/.test(s)) throw new Error('bad srp'); return BigInt('0x' + s); };

module.exports = { newSalt, verifier, secret, pub, serverStart, serverKey, clientKey, proof1, proof2, hex, unhex, eq };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const salt = newSalt(), v = verifier('123456789', salt), a = secret(), A = pub(a), { b, B } = serverStart(v);
  const Kc = clientKey('123456789', salt, a, A, B), Ks = serverKey(v, A, b, B);
  assert.ok(eq(Kc, Ks), 'same code gives the same key');
  assert.ok(!eq(clientKey('123456780', salt, a, A, B), Ks), 'wrong code gives a different key');
  assert.throws(() => serverKey(v, 0n, b, B));
  console.log('srp tests passed');
}
