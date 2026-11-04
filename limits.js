// Provider limit detection + reset-time parsing. Pure (no Electron) so it can be tested with node.
// Matched case-insensitively against an error message (exit code text + stderr + stream error events).
const LIMIT_PATTERNS = [
  /usage[_ ]limit/, /rate[_ ]?limit/, /limit reached/, /hit your .{0,30}limit/, /quota/, /\b429\b/, /too many requests/,
  /overloaded/, /\b529\b/, /credit balance/, /insufficient[_ ]funds/, /insufficient[_ ]credits?/, /out of credits/, /no credits/, /credits? (?:exhausted|depleted)/, /\b402\b/, /resource[_ ]exhausted/,
  /authentication[_ ]error/, /invalid api key/, /run \/login/, /not logged in/, /(token|session|login|credentials?) (has |have )?(expired|is invalid)/, /\b401\b/, /unauthorized/,
  /is not recognized as an internal or external command/, /command not found/, /\benoent\b/, /spawn .* not found/,
];
const isLimitError = (text) => { const t = String(text || '').toLowerCase(); return LIMIT_PATTERNS.some((p) => p.test(t)); };

const UNIT = { d: 864e5, h: 36e5, m: 6e4, s: 1e3 };
const DEFAULT_MS = 60 * 6e4;
// Returns the epoch ms when the provider is expected back. Falls back to now + 60 min.
function parseReset(text, now = Date.now()) {
  const t = String(text || '');
  let m = /\b(\d{13}|\d{10})\b/.exec(t); // unix ts (s or ms), e.g. "limit reached|1762180800"
  if (m) { const v = m[1].length === 10 ? +m[1] * 1e3 : +m[1]; if (v > now && v < now + 40 * 864e5) return v; }
  m = /(?:in|after)\s+((?:\d+(?:\.\d+)?\s*(?:days?|hours?|hrs?|minutes?|mins?|seconds?|secs?|d|h|m|s)\b[\s,]*(?:and\s+)?)+)/i.exec(t);
  if (m) {
    let ms = 0;
    for (const x of m[1].matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/gi)) ms += +x[1] * UNIT[x[2][0].toLowerCase()];
    if (ms > 0) return now + Math.ceil(ms);
  }
  m = /(?:resets?|try again|until|available)\s*(?:at|on)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(t);
  if (m && (m[2] || m[3])) {
    let h = +m[1]; const mi = +(m[2] || 0), ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; else if (ap === 'am' && h === 12) h = 0;
    if (h < 24 && mi < 60) { const d = new Date(now); d.setHours(h, mi, 0, 0); if (d.getTime() <= now) d.setDate(d.getDate() + 1); return d.getTime(); }
  }
  return now + DEFAULT_MS;
}

module.exports = { LIMIT_PATTERNS, isLimitError, parseReset };
