const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-images-'));
const image = path.join(out, 'large.svg');
fs.writeFileSync(image, '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="2400"><rect width="4000" height="2400" fill="#35445c"/><text x="200" y="1200" font-size="240" fill="white">Large image preview</text></svg>');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/react.json')));
const attachment = { path: image, name: 'large.svg', type: 'image/svg+xml', size: 200 };
fixture['chat:history'] = [{ from: 'user', text: 'Image preview', attachments: [attachment], at: Date.now() }];
fixture.__storage = { 'relay.draftFiles.s1': [attachment] };
const fixtures = path.join(out, 'fixtures.json');
fs.writeFileSync(fixtures, JSON.stringify(fixture));
for (const size of ['1280x800', '760x600']) {
  const result = spawnSync(require('electron'), ['tools/harness.cjs', '--dir', 'renderer-dist', '--fixtures', fixtures, '--eval', 'tools/image-layout-check.js', '--wait', '1200', '--size', size, '--out', path.join(out, size + '.png')], { encoding: 'utf8', timeout: 30000 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error || result.status !== 0) process.exit(1);
}
console.log('Image layout screenshots: ' + out);
