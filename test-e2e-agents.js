// End-to-end: boss mode + loop-until-done + checkpoints + memory against tools/fake-claude.cjs. Run: npm run test:e2e
const { app, ipcMain } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-e2e-'));
const proj = path.join(tmp, 'proj'), home = path.join(tmp, 'home'), logFile = path.join(tmp, 'fake.log');
fs.mkdirSync(proj); fs.mkdirSync(home);
process.env.RELAY_TEST_DATA_DIR = path.join(tmp, 'data'); process.env.FAKE_CLAUDE_LOG = logFile;
const results = []; const check = (name, ok, info = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !info ? '' : '  -> ' + info)); };
const finish = (code) => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} app.exit(code); };
setTimeout(() => { console.log('FAIL hard timeout 120s'); finish(1); }, 120000).unref();

// capture the handlers main.js registers
const H = new Map(), orig = ipcMain.handle.bind(ipcMain); ipcMain.handle = (ch, fn) => { H.set(ch, fn); return orig(ch, fn); };
const call = (ch, ...a) => H.get(ch)({ sender: null }, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 250) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return null; await sleep(step); } };
const sh = (c) => cp.execSync(c, { cwd: proj, stdio: 'pipe' });

// fixture: git repo with a passing test script, and a .cmd shim so `where`/`--version` preflight accepts the fake CLI
fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'e2e', version: '1.0.0', scripts: { test: 'node -e "process.exit(0)"' } }));
sh('git init -q && git config user.email t@t && git config user.name t && git add -A && git commit -q -m init');
process.env.PATH = tmp + path.delimiter + process.env.PATH; // `where` only resolves bare names, so the shim dir goes on PATH
const shim = path.join(tmp, 'claude-fake.cmd');
fs.writeFileSync(shim, `@echo off\r\nnode "${path.join(__dirname, 'tools', 'fake-claude.cjs')}" %*\r\n`);

app.whenReady().then(async () => {
  try {
    require('./main');
    await sleep(1500);
    const s = await call('settings:get');
    await call('settings:save', { ...s, claudeCmd: 'claude-fake', claudeArgs: '', disabledProviders: ['codex'], lead: 'claude', loopRunTests: true });
    const pr = await call('projects:add', proj, 'e2e');
    const sess = await call('sessions:create', pr.id, 'e2e');
    const sid = sess.id;
    await call('chat:send', sid, 'build files a and b', [], { boss: true, loop: true, loopMax: 4, runTests: true });
    const loop = await until(async () => { const l = await call('loop:get', sid); const w = await call('sessions:working'); return ['done', 'gave-up', 'stopped'].includes(l.status) && !(w || []).includes(sid) ? l : null; }, 100000);
    check('loop settled', !!loop, JSON.stringify(await call('loop:get', sid)));
    const l = await call('loop:get', sid);
    check("loop status 'done'", l.status === 'done', JSON.stringify(l));
    check('loop iterations >= 2', l.iter >= 2, 'iter=' + l.iter);
    const subs = await call('subagents:list', sid);
    check('2 subagents spawned', subs.filter((x) => x.kind !== 'native').length >= 2, 'count=' + subs.length);
    check('subagents all done', subs.length > 0 && subs.every((x) => x.status === 'done'), subs.map((x) => x.title + ':' + x.status).join(', '));
    const nat = subs.filter((x) => x.kind === 'native');
    check('native Claude Code subagent captured and done', nat.length >= 1 && nat.every((x) => x.status === 'done' && x.agentType), JSON.stringify(nat.map((x) => [x.title, x.agentType, x.status])));
    check('subagent files exist', ['a.txt', 'b.txt'].every((f) => fs.existsSync(path.join(proj, f))));
    const wa = subs.find((x) => x.title === 'write a'), wb = subs.find((x) => x.title === 'write b');
    check('redone worker b: attempt 2, strikes 1, accepted, history 1', wb?.attempt === 2 && wb.strikes === 1 && wb.verdict === 'accepted' && wb.history?.length === 1 && /b\.txt must contain B/.test(wb.history[0].feedback), JSON.stringify(wb));
    check('worker a: attempt 1, strikes 0, accepted', wa?.attempt === 1 && wa.strikes === 0 && wa.verdict === 'accepted', JSON.stringify(wa));
    check('b.txt has the redone content', fs.existsSync(path.join(proj, 'b.txt')) && fs.readFileSync(path.join(proj, 'b.txt'), 'utf8').trim() === 'B');
    const plan = await call('plan:get', sid);
    check('plan has steps', plan.length >= 2, JSON.stringify(plan));
    check('plan steps marked done', plan.length > 0 && plan.every((x) => x.status === 'done'), JSON.stringify(plan));
    const cps = await call('checkpoints:list', sid);
    check('checkpoints >= 1', cps.git && cps.items.length >= 1, JSON.stringify(cps));
    const mem = path.join(proj, '.relay', 'memory.md');
    check('[remember:] persisted to .relay/memory.md', fs.existsSync(mem) && /npm test/.test(fs.readFileSync(mem, 'utf8')));
    const log = (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '').split('\n').filter(Boolean).map((x) => JSON.parse(x));
    const n = (r) => log.filter((x) => x.role === r).length;
    check('fake CLI roles: boss>=1, sub==3 (2 + 1 redo), verifier==2', n('boss') >= 1 && n('sub') === 3 && n('verifier') === 2, `boss=${n('boss')} sub=${n('sub')} verifier=${n('verifier')}`);
    const sf = await call('sessions:get', sid);
    check('boss mode turned off at the end', !(sf.boss), 'boss=' + sf.boss);
  } catch (e) { check('harness run', false, e.stack || e.message); }
  const bad = results.filter((x) => !x).length;
  console.log(bad ? `\n${bad} FAILED` : '\nALL PASSED');
  finish(bad ? 1 : 0);
});
