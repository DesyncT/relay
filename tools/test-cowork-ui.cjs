const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-cowork-ui-'));
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/react.json')));
fixture['cowork:state'] = { state: 'linked', hosting: false, peer: { name: 'Alex', lends: ['claude', 'codex'], sharedRuns: true }, lend: { claude: true, codex: false }, lendable: { claude: true, codex: true }, lent: { runs: 0, tokens: 0 }, borrowed: { runs: 0, tokens: 0 } };
const fixtures = path.join(out, 'fixtures.json'); fs.writeFileSync(fixtures, JSON.stringify(fixture));
for (const size of ['1280x800', '760x600']) {
  const result = spawnSync(require('electron'), ['tools/harness.cjs', '--dir', 'renderer-dist', '--fixtures', fixtures, '--eval', 'tools/cowork-ui-check.js', '--wait', '1200', '--size', size, '--out', path.join(out, size + '.png')], { encoding: 'utf8', timeout: 30000 });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  if (result.error || result.status !== 0) { console.error(result.error?.message || 'Co-work UI checks failed'); process.exit(1); }
}
console.log('Co-work screenshots: ' + out);
