// Stand-in for the `claude` CLI (stream-json). Prompt arrives on stdin. Role is picked from the prompt text.
// FAKE_CLAUDE_LOG = jsonl file with one {role, args, head} line per invocation (also used to count verifier calls).
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), LOG = process.env.FAKE_CLAUDE_LOG;
if (args.includes('--version')) { console.log('2.0.0 (Claude Code)'); process.exit(0); }
const out = (o) => console.log(JSON.stringify(o));
let prompt = '';
process.stdin.setEncoding('utf8').on('data', (d) => prompt += d).on('end', () => {
  const role = /You verify whether an agent finished/.test(prompt) ? 'verifier'
    : /You are a subagent of/.test(prompt) ? 'sub'
    : /BOSS MODE/.test(prompt) ? 'boss' : 'plain';
  let prior = 0;
  if (LOG) { try { prior = fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes('"role":"' + role + '"')).length; } catch {} fs.appendFileSync(LOG, JSON.stringify({ role, args, cwd: process.cwd(), head: prompt.slice(0, 200) }) + '\n'); }
  const sid = 'fake-' + Math.random().toString(36).slice(2, 8);
  out({ type: 'system', subtype: 'init', session_id: sid, model: 'fake-model' });
  const say = (text) => out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
  let text = '';
  if (role === 'verifier') text = prior === 0 ? 'NOT DONE: missing b' : 'DONE';
  else if (role === 'sub') {
    const f = (/FILE:(\S+)/.exec(prompt) || [])[1] || 'out.txt';
    fs.writeFileSync(path.join(process.cwd(), f), 'written by fake-claude\n');
    out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_w' + prior, name: 'Write', input: { file_path: path.join(process.cwd(), f), content: 'x' } }] } });
    text = 'Created ' + f + ' (1 line).';
  } else if (role === 'boss' && !/Subagent results to review|check says the goal is not met/.test(prompt)) {
    // native Task call + its result, then the plan and two delegations
    out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_x', name: 'Task', input: { subagent_type: 'general-purpose', description: 'scan', prompt: 'scan the repo' } }] } });
    out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_x', content: 'scan finished: 2 files' }] } });
    text = 'Plan ready.\n[plan: write a; write b]\n[sub: write a | create the file FILE:a.txt with one line]\n[sub: write b | create the file FILE:b.txt with one line]\n[remember: e2e fake project uses npm test]';
  } else text = 'Reviewed the subagent results; everything is in place.';
  say(text);
  out({ type: 'result', subtype: 'success', is_error: false, result: text, session_id: sid, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
});
