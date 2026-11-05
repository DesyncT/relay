'use strict';
// Spreader: pick the subscription with the most quota left, so usage spreads across providers.
// quota = readQuota() output ({claude, codex, antigravity} each null or {windows:[{remaining}]}).
// Unknown quota counts as half full; ties go to whoever did not run last.
function left(q) {
  const w = q?.windows?.filter(x => Number.isFinite(x.remaining)) || [];
  return w.length ? Math.min(...w.map(x => x.remaining)) : 50;
}
function pickProvider(quota, available, last) {
  if (!available.length) return null;
  return [...available].sort((a, b) => left(quota?.[b]) - left(quota?.[a]) || (a === last) - (b === last))[0];
}
module.exports = { pickProvider, left };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const q = (r) => ({ windows: [{ remaining: r }] });
  assert.equal(pickProvider({ claude: q(20), codex: q(80) }, ['claude', 'codex'], null), 'codex');
  assert.equal(pickProvider({ claude: q(90), codex: { windows: [{ remaining: 95 }, { remaining: 10 }] } }, ['claude', 'codex']), 'claude');
  assert.equal(pickProvider({}, ['claude', 'codex'], 'claude'), 'codex');
  assert.equal(pickProvider({ codex: q(99) }, ['claude'], null), 'claude');
  assert.equal(pickProvider({}, [], null), null);
  console.log('spreader tests passed');
}
