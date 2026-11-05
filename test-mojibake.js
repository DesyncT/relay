const assert = require('node:assert/strict');
const { fixMojibake } = require('./mojibake');
assert.equal(fixMojibake('Personenautoâ€™s'), 'Personenauto’s');
assert.equal(fixMojibake('DE MORTELEN Â· KEUZEHULP'), 'DE MORTELEN · KEUZEHULP');
assert.equal(fixMojibake('CafÃ© â€œquotedâ€\u009d â€” done'), 'Café “quoted” — done');
assert.equal(fixMojibake('café… naïve Ünïcode ✓'), 'café… naïve Ünïcode ✓', 'real accents stay');
assert.equal(fixMojibake(null), null);
console.log('Mojibake repair checks passed');
