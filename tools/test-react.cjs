const { spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const electron = require('electron');
for (const size of ['1280x800', '860x760']) {
  const result = spawnSync(electron, ['tools/harness.cjs', '--dir', 'renderer-dist', '--fixtures', 'tools/fixtures/react.json', '--eval', 'tools/react-check.js', '--wait', '3000', '--size', size, '--out', path.join(os.tmpdir(), `relay-react-${size}.png`)], { encoding:'utf8', timeout:45000 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error || result.status !== 0) { console.error(result.error?.message || `UI check failed at ${size}`); process.exit(1); }
}
console.log('React chat, live events, choices, navigation and panel checks passed at both window sizes.');

const cinemaFixtures = path.join(os.tmpdir(), `relay-cinema-${process.pid}.json`);
const fx = JSON.parse(fs.readFileSync('tools/fixtures/react.json'));
fx['chat:history'] = [];
fs.writeFileSync(cinemaFixtures, JSON.stringify(fx));
try {
  for (const size of ['1280x800', '860x760']) {
    const result = spawnSync(electron, ['tools/harness.cjs', '--dir', 'renderer-dist', '--fixtures', cinemaFixtures, '--eval', 'tools/cinema-check.js', '--wait', '2500', '--size', size, '--reduced', 'true'], { encoding: 'utf8', timeout: 45000 });
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.error || result.status !== 0) { console.error(result.error?.message || `Starting composition failed at ${size}`); process.exitCode = 1; break; }
  }
} finally { fs.unlinkSync(cinemaFixtures); }
