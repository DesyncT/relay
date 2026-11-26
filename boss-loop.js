// Pure helpers for boss mode, loop-until-done and project memory (no Electron, so test-boss-loop.js can load them).
const fs = require('fs'), path = require('path'), os = require('os'), { execFile } = require('child_process');

// "/boss /loop <goal>" in any order; returns the flags and the goal with the prefixes stripped.
function parseCommand(text) {
  let t = String(text || ''), boss = false, loop = false, m;
  while ((m = /^\s*\/(boss|loop)\b\s*/i.exec(t))) { if (m[1].toLowerCase() === 'boss') boss = true; else loop = true; t = t.slice(m[0].length); }
  return { boss, loop, goal: t.trim() };
}

// [remember: fact] tags anywhere in a reply (max 3). Returns the text without them plus the facts.
const SECRET = /password|token|secret|api[ _-]?key/i;
function parseRemember(raw) {
  const facts = [], globals = [];
  const text = String(raw).replace(/[ \t]*\[remember(-global)?:\s*([^\]\n]+?)\s*\]/gi, (_, g, f) => { (g ? globals : facts).push(f.slice(0, 300)); return ''; }).replace(/\n{3,}/g, '\n\n').trim();
  const ok = (a) => a.filter((f) => !SECRET.test(f)).slice(0, 3);
  return { text, facts: ok(facts), globals: ok(globals) };
}

// [plan: a; b; c] replaces the plan, [done: text or number] marks a step done. Both are stripped from the text.
function parsePlan(raw) {
  let plan = null; const done = [];
  const text = String(raw).replace(/[ \t]*\[plan:\s*([^\]]+?)\s*\]/gi, (_, p) => { plan = p.split(/;|\n/).map((x) => x.trim().replace(/^\d+[.)]\s*/, '').slice(0, 120)).filter(Boolean).slice(0, 12); return ''; })
    .replace(/[ \t]*\[done:\s*([^\]\n]+?)\s*\]/gi, (_, d) => { done.push(d.trim()); return ''; }).replace(/\n{3,}/g, '\n\n').trim();
  return { text, plan, done };
}
const mkPlan = (steps) => steps.map((text, i) => ({ id: 'p' + (i + 1), text, status: 'todo' }));
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.!\s]+$/, '').trim();
// same text, one contains the other, or most of the shorter one's words appear in the other (worker titles paraphrase steps)
const stepMatch = (step, t) => { const a = norm(step.text), b = norm(t); if (!b) return false; if (a === b || a.includes(b) || b.includes(a)) return true; const big = (s) => new Set([...words(s)].filter((w) => w.length > 3)), x = big(a), y = big(b); let n = 0; for (const w of y) if (x.has(w)) n++; return Math.min(x.size, y.size) >= 2 && n / Math.min(x.size, y.size) >= 0.6; };
// mark the first matching not-done step (by number or text); returns true if something changed
function planMark(plan, ref, status) {
  const n = /^\d+$/.test(ref) ? plan[+ref - 1] : plan.find((x) => x.status !== 'done' && stepMatch(x, ref));
  if (!n || n.status === status) return false; n.status = status; return true;
}

// ~/.relay/memory.md: facts that apply to every project
const gmemFile = (home = os.homedir()) => path.join(home, '.relay', 'memory.md');
const readGlobal = (home) => { try { return fs.readFileSync(gmemFile(home), 'utf8'); } catch { return ''; } };
function writeGlobal(text, home) { const f = gmemFile(home); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text, 'utf8'); }
function addGlobal(facts, home) { const old = readGlobal(home), next = memAdd(old, facts); if (next === old) return false; writeGlobal(next, home); return true; }
const globalBlock = (home) => { const t = readGlobal(home).trim().slice(-2048); return t ? `Global memory (the user's own notes, ~/.relay/memory.md):\n${t}\n\n` : ''; };

// Test command for a project dir, or null. Cheap file checks only.
function testCommand(dir) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  try { const t = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts?.test; if (t && !/no test specified/i.test(t)) return 'npm test'; } catch {}
  let py = has('pytest.ini'); try { py = py || /pytest/i.test(fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8')); } catch {}
  if (py) return 'python -m pytest -q';
  if (has('Cargo.toml')) return 'cargo test';
  if (has('go.mod')) return 'go test ./...';
  return null;
}
// runs it (constant command strings only, so shell:true is safe); resolves {pass, out} with the last 3KB of output
const runTests = (dir, cmd, timeout = 300000) => new Promise((res) => execFile(cmd, [], { cwd: dir, shell: true, timeout, maxBuffer: 32 << 20, windowsHide: true, encoding: 'utf8' }, (e, so, se) => {
  let out = (String(so || '') + String(se || '')).trim().slice(-3072); if (e?.killed) out += '\n(timed out)';
  res({ pass: !e, out });
})); // ponytail: on timeout only the shell is killed, not its children; use taskkill /T if that leaks

// Append new facts as "- fact" bullets, skipping ones already there (case/space-insensitive).
function memAdd(text, facts) {
  const have = new Set(String(text || '').split(/\r?\n/).map((l) => norm(l.replace(/^[\s*•-]+/, ''))));
  let out = String(text || '').replace(/\s+$/, '');
  for (const f of facts) { const n = norm(f); if (n && !have.has(n)) { have.add(n); out += (out ? '\n' : '') + '- ' + f.trim(); } }
  return out ? out + '\n' : '';
}

// Verifier answer: "DONE" or "NOT DONE: <reason>". Anything unclear counts as DONE so a chatty verifier cannot loop forever.
function parseVerdict(raw) {
  const t = String(raw || '');
  const no = /^\W*NOT\s+DONE\b[:\s-]*(.*)$/im.exec(t);
  if (no) return { done: false, reason: (no[1] || '').trim().slice(0, 400) || 'not finished yet' };
  return { done: true, reason: '' };
}

const memFile = (dir) => path.join(dir, '.relay', 'memory.md');
const readMem = (dir) => { try { return fs.readFileSync(memFile(dir), 'utf8'); } catch { return ''; } };
function writeMem(dir, text) { fs.mkdirSync(path.join(dir, '.relay'), { recursive: true }); fs.writeFileSync(memFile(dir), text, 'utf8'); }
function addMem(dir, facts) { const old = readMem(dir), next = memAdd(old, facts); if (next === old) return false; writeMem(dir, next); return true; }
const memBlock = (dir) => { const t = readMem(dir).trim().slice(-4000); return t ? `Project memory (saved by earlier agents in .relay/memory.md):\n${t}\n\n` : ''; };

const TAGS_HELP = 'To save a durable fact about this project for future sessions (a convention, command, gotcha), put [remember: fact] on its own line (max 3 per reply); use [remember-global: fact] only for a preference of the user that applies to every project. Do not store secrets.\n\n';
const BOSS = 'BOSS MODE. You lead a team; work the way a strong lead works. 1) Plan first: put [plan: step one; step two; ...] on its own line before delegating (send it again to replace it; [done: step text or number] marks a step finished). 2) Break the goal into independent pieces and delegate each with a line [sub: short title | complete task] (max 3 per reply, they run in parallel as subagents in this folder). Name each title after the plan step it does. 3) Give every [sub:] a disjoint set of files that it alone owns and say so in the task ("You own only src/a.js and src/b.js; do not touch other files"). Never let two subagents edit the same file; if two pieces need the same file, make them sequential or give the file to one of them. 4) Delegate independent pieces in the same reply so they run in parallel. Do not do delegated work yourself. 5) When the results come back, grade EVERY worker with exactly one verdict line each: [accept: <worker title>] or [redo: <worker title> | <what is wrong and what to do>]. A rejected worker redoes the same piece and earns a strike; three rejections fire it, so only reject with a concrete defect. Verify before accepting: read their diffs (git diff) and run the tests; review critically against the goal. Delegate genuinely new pieces with new [sub: ...] lines. 6) Prefer the smallest change that meets the goal. Only finish once the whole goal is truly met, then reply with the summary. Mark each plan step [done: ...] as soon as you accept the work for it.\n\n';
// Claude Code boss: its own tools do this natively (TodoWrite = the live plan, Agent = parallel workers it reviews in-context)
const BOSS_CLAUDE = 'BOSS MODE. You lead a team of subagents. 1) Plan: before anything else create one task per deliverable with TaskCreate (or TodoWrite if that is the tool you have). It is the live plan the user watches: TaskUpdate it to in_progress when its work starts and to completed only once you verified it. 2) Delegate: launch every independent piece with your Agent tool, several Agent calls in ONE message so they run in parallel. Give each a complete brief: the goal, the files it alone owns (never two agents on one file), how to verify, what to report back. Wait for their results before ending your turn. 3) Review: read the diff (git diff) and run the tests yourself. A wrong result gets a new Agent call naming the concrete defect; never mark its task completed until verified. 4) Do small glue work yourself, delegate anything sizeable. 5) Finish only when every task is completed and the goal is truly met, then reply with a short summary.\n\n';
const bossPrompt = (engine) => engine === 'claude' ? BOSS_CLAUDE : BOSS;
// TodoWrite / Codex todo_list items {t, done, now} -> plan steps
const todoPlan = (list) => list.filter((x) => x.t).slice(0, 20).map((x, i) => ({ id: 'p' + (i + 1), text: x.t.slice(0, 120), status: x.done ? 'done' : x.now ? 'doing' : 'todo' }));
const verifierPrompt = (goal, last, files, testsPass) => `You verify whether an agent finished a goal. Do not edit anything.\nGoal: ${goal}\n\nAgent's last reply:\n${String(last).slice(0, 3000)}\n\nFiles changed: ${files.length ? files.slice(0, 30).join(', ') : 'none reported'}${testsPass ? '\nThe project test suite was just run: tests pass.' : ''}\n\nJudge only whether the goal is met by the project as it is now: issues that were already fixed, process remarks and nice-to-haves do not count.
Answer strictly with one line: DONE or NOT DONE: <the single most important reason>.`;


// Boss verdicts: [accept: title] / [redo: title | what is wrong]. Returns the text without them.
function parseVerdicts(raw) {
  const accepts = [], redos = [];
  const text = String(raw).replace(/[ \t]*\[(accept|redo):\s*([^\]\n|]+?)\s*(?:\|\s*([^\]]*?))?\s*\]/gi, (_, k, t, fb) => { if (k.toLowerCase() === 'accept') accepts.push(t); else redos.push({ title: t, feedback: (fb || '').trim() || 'not good enough' }); return ''; }).replace(/\n{3,}/g, '\n\n').trim();
  return { text, accepts, redos };
}
// worker whose title matches: exact (case-insensitive), then prefix, then substring either way
function matchWorker(workers, title) {
  const t = norm(title); if (!t) return null;
  return workers.find((w) => norm(w.title) === t) || workers.find((w) => norm(w.title).startsWith(t) || t.startsWith(norm(w.title))) || workers.find((w) => norm(w.title).includes(t) || t.includes(norm(w.title))) || null;
}
// what a rejection costs: strike 1 = redo, strike 2 = redo on the stronger 'coding' route at high effort, strike 3 = fired
const strikeStep = (strikes) => strikes >= 3 ? { fire: true } : { fire: false, stance: strikes >= 2 ? 2 : 1, phase: strikes >= 2 ? 'coding' : 'other', effort: strikes >= 2 ? 'high' : null };
const redoBlock = (r) => {
  const st = strikeStep(r.strikes || 1), prev = r.history?.at(-1)?.result || '';
  return `\n\nYour previous result:\n${prev}\n\nYour previous attempt was rejected by the boss: ${r.feedback}. Fix exactly this; prove it (show the test/command output).` + (st.stance === 2 ? ` This is strike ${r.strikes}: final warning: verify every claim before reporting. One more rejection and you are fired.` : '');
};
const clip = (s, n = 1024) => String(s || '').slice(0, n);
// the boss's wake-up note: workers to grade now, plus anyone fired since the last note
function reviewNote(ungraded, fired) {
  const line = (x) => `- ${x.title} [${x.status}]${x.attempt > 1 ? ` (attempt ${x.attempt}, ${x.strikes} strike${x.strikes > 1 ? 's' : ''})` : ''}: ${String(x.result).slice(0, 700)}`;
  return (ungraded.length ? 'Subagent results to review against the goal. Give exactly one verdict per worker: [accept: <worker title>] or [redo: <worker title> | <what is wrong and what to do>]. Unmentioned workers count as accepted; finish if the goal is met:\n' + ungraded.slice(-8).map(line).join('\n') : '')
    + (fired.length ? (ungraded.length ? '\n\n' : '') + 'FIRED after 3 rejections (their work was discarded): ' + fired.map((x) => x.title).join(', ') + '. Reassign each piece to a new worker with [sub: ...] or do it yourself.' : '');
}
function planReopen(plan, ref) { const n = plan.find((x) => x.status === 'done' && stepMatch(x, ref)); if (!n) return false; n.status = 'doing'; return true; }

// Stall detection: reasons are "the same" when normalized text is equal or word-set jaccard >= 0.8
const words = (s) => new Set(norm(String(s || '')).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean));
function similar(a, b, min = 0.8) {
  const x = words(a), y = words(b); if (!x.size || !y.size) return false;
  let n = 0; for (const w of x) if (y.has(w)) n++;
  return n / (x.size + y.size - n) >= min;
}
const STALL_NOTE = 'You are stuck repeating the same approach. Step back, re-read the failing output, form a different hypothesis, and try a different fix.';
// Reviewer answer: "LGTM" or "BLOCKING: <list>". Unclear counts as a pass so a chatty reviewer cannot block forever.
function parseReview(raw) {
  const m = /^\W*BLOCKING\b[:\s-]*([\s\S]*)$/im.exec(String(raw || ''));
  if (m) return { pass: false, reason: (m[1] || '').trim().slice(0, 800) || 'blocking issues found' };
  return { pass: true, reason: '' };
}
const reviewPrompt = (goal, diff) => `You review a code change. Do not edit anything. Report BLOCKING bugs only: wrong behavior, crashes, data loss, security holes, broken tests. Ignore style, naming and nice-to-haves.\nGoal: ${goal}\n\nDiff of the changes made:\n${String(diff).slice(0, 40000)}\n\nAnswer strictly: LGTM, or BLOCKING: <short list of the blocking bugs with file and line>.`;
// Claude Code native subagent: an assistant tool_use named Task/Agent -> a subagent record (or null)
const isNativeUse = (b) => b?.type === 'tool_use' && (b.name === 'Task' || b.name === 'Agent') && !!b.id;
function nativeSub(b, { sid, owner, parent = null, now = Date.now() }) {
  if (!isNativeUse(b)) return null;
  const i = b.input || {};
  return { id: 'n' + b.id, kind: 'native', sid, owner, title: String(i.description || i.subagent_type || 'Subagent').slice(0, 120), agentType: i.subagent_type || 'general-purpose', task: String(i.prompt || '').slice(0, 2048), status: 'running', parent, depth: 1, started: now, ended: 0, activity: '', result: '' };
}
// tool_result content (string or [{type:'text',text}]) -> text, max 4KB
// Claude Code runs Agent calls in the background: the tool_result is only a launch ack carrying "agentId: <id>"
const asyncLaunch = (t) => /agent launched|working in the background/i.test(t) ? (/agentId:\s*([\w-]+)/.exec(t)?.[1] || null) : null;
// a later (non-assistant) event naming that agentId with a completion status -> its result text, else null
function asyncDone(e, id) {
  if (!e || e.type === 'assistant') return null;
  const j = JSON.stringify(e); if (!j.includes(id) || /agent launched/i.test(j) || !/complet|finish|status/i.test(j)) return null;
  const raw = typeof e.result === 'string' ? e.result : (e.summary || (Array.isArray(e.message?.content) ? e.message.content.map((b) => b?.text || resultText(b?.content)).join('\n') : '') || j);
  const m = /<result>([\s\S]*?)<\/result>/i.exec(raw);
  return (m ? m[1] : raw.replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').trim().slice(0, 4096);
}
const resultText = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x?.text || '').join('\n') : '').trim().slice(0, 4096);

module.exports = { asyncLaunch, asyncDone, similar, STALL_NOTE, parseReview, reviewPrompt, isNativeUse, nativeSub, resultText, parsePlan, mkPlan, planMark, gmemFile, readGlobal, writeGlobal, addGlobal, globalBlock, testCommand, runTests, parseCommand, parseRemember, memAdd, parseVerdict, memFile, readMem, writeMem, addMem, memBlock, TAGS_HELP, BOSS, BOSS_CLAUDE, bossPrompt, todoPlan, verifierPrompt, parseVerdicts, matchWorker, strikeStep, redoBlock, clip, reviewNote, planReopen };
