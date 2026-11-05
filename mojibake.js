// UTF-8 read as Windows-1252 ("Personenautoâ€™s", "Â·") turned back into the real characters.
// Only runs that decode as valid UTF-8 are replaced, so ordinary accents ("café…") stay as they are.
const CP1252 = { 0x20AC:0x80, 0x201A:0x82, 0x0192:0x83, 0x201E:0x84, 0x2026:0x85, 0x2020:0x86, 0x2021:0x87, 0x02C6:0x88, 0x2030:0x89, 0x0160:0x8A, 0x2039:0x8B, 0x0152:0x8C, 0x017D:0x8E,
  0x2018:0x91, 0x2019:0x92, 0x201C:0x93, 0x201D:0x94, 0x2022:0x95, 0x2013:0x96, 0x2014:0x97, 0x02DC:0x98, 0x2122:0x99, 0x0161:0x9A, 0x203A:0x9B, 0x0153:0x9C, 0x017E:0x9E, 0x0178:0x9F };
const CONT = '[\\u0080-\\u00BF\\u0152\\u0153\\u0160\\u0161\\u0178\\u017D\\u017E\\u0192\\u02C6\\u02DC\\u2013\\u2014\\u2018-\\u201A\\u201C-\\u201E\\u2020-\\u2022\\u2026\\u2030\\u2039\\u203A\\u20AC\\u2122]';
const RUN = new RegExp(`(?:[\\u00C2-\\u00F4]${CONT}+)+`, 'g');
const utf8 = new TextDecoder('utf-8', { fatal: true });
function fixMojibake(text) {
  if (typeof text !== 'string' || !/[Â-ô]/.test(text)) return text;
  return text.replace(RUN, (run) => {
    try { return utf8.decode(Uint8Array.from([...run], (ch) => CP1252[ch.codePointAt(0)] ?? ch.codePointAt(0))); }
    catch { return run; }
  });
}
module.exports = { fixMojibake };
