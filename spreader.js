'use strict';
// Balance the five-hour allowance: run until 10 points below the other provider.
// Unknown quota counts as half full but cannot establish a sticky target.
const fiveHour = q => q?.windows?.find(w => w.minutes <= 360 && Number.isFinite(w.remaining));
function left(q) {
  const five = fiveHour(q);
  if (five) return Math.max(0, Math.min(100, five.remaining));
  const w = q?.windows?.filter(x => Number.isFinite(x.remaining) && !(x.minutes > 360)) || []; // weekly never drives the spread
  return w.length ? Math.min(...w.map(x => x.remaining)) : 50;
}
const usable = (quota, p) => !quota?.[p]?.windows?.some(w => Number.isFinite(w.remaining) && w.remaining <= 0);
function balanceFor(quota, available, provider) {
  const own = fiveHour(quota?.[provider]);
  const others = available.filter(p => p !== provider && usable(quota,p)).map(p => fiveHour(quota?.[p])).filter(Boolean);
  if (!own || !others.length) return null;
  return {provider,target:Math.max(0,Math.max(...others.map(w=>w.remaining)) - 10),start:own.remaining,reset:own.reset ?? null};
}
function canKeepBalance(quota, provider, balance) {
  const own = fiveHour(quota?.[provider]);
  // Unknown reset times become concrete on first use; estimated rolling windows
  // also move their reset as new transcript records arrive.
  const sameWindow = own && (own.budget || balance?.reset == null || own.reset == null || own.reset === balance?.reset);
  return balance?.provider === provider && usable(quota,provider) && sameWindow && own.remaining <= balance.start && own.remaining > balance.target;
}
function pickProvider(quota, available, last, balance) {
  const candidates = available.filter(p => usable(quota,p));
  if (!candidates.length) return null;
  // A reset/refill invalidates the previous target. Never stop an active turn here.
  if (candidates.includes(last) && canKeepBalance(quota,last,balance)) return last;
  return candidates.sort((a, b) => left(quota?.[b]) - left(quota?.[a]) || (a === last) - (b === last))[0];
}
module.exports = { pickProvider, left, balanceFor, canKeepBalance };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const q = (r) => ({ windows: [{ remaining: r }] });
  assert.equal(pickProvider({ claude: q(20), codex: q(80) }, ['claude', 'codex'], null), 'codex');
  assert.equal(pickProvider({ claude: q(90), codex: { windows: [{ remaining: 95 }, { remaining: 10, minutes: 300 }] } }, ['claude', 'codex']), 'claude');
  assert.equal(pickProvider({}, ['claude', 'codex'], 'claude'), 'codex');
  assert.equal(pickProvider({ codex: q(99) }, ['claude'], null), 'claude');
  assert.equal(pickProvider({}, [], null), null);
  console.log('spreader tests passed');
}
