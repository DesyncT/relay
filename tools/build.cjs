// node tools/build.cjs <outDir>  -> private renderer build (so parallel work never clobbers renderer-dist)
const { execSync } = require('child_process'), fs = require('fs'), path = require('path');
const out = path.resolve(process.argv[2] || 'renderer-dist');
execSync(`npx vite build --outDir "${out}" --emptyOutDir`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
fs.cpSync(path.join(__dirname, '..', 'assets'), path.join(out, 'assets'), { recursive: true });
