// What an agent actually did during a run, read from the CLI event streams. Pure (fs only for "did this file exist"), testable with node.
// Item: { kind: 'create'|'edit'|'delete'|'cmd', file, add, del, diff, cmd, code, bg }. Unknown events are ignored.
const fs = require('fs');
const path = require('path');
const CAP = 400; // diff lines kept per file
const base = (p) => String(p || '').split(/[\\/]/).pop();
const mk = (pre, s) => (s ? String(s).replace(/\n$/, '').split('\n').map((l) => pre + l) : []);

// same file touched again right after: fold into one row
function addFile(acc, it) {
  const last = acc[acc.length - 1];
  if (last && last.file === it.file && last.kind !== 'delete' && it.kind === 'edit' && last.diff != null) {
    last.add += it.add; last.del += it.del; last.diff = (last.diff + '\n' + it.diff).split('\n').slice(0, CAP).join('\n');
  } else acc.push(it);
}

function claude(e, acc, cwd, exists = fs.existsSync) {
  if (e.type === 'assistant') {
    for (const b of e.message?.content || []) {
      if (b.type !== 'tool_use') continue;
      const i = b.input || {}, file = base(i.file_path);
      if (b.name === 'Write') {
        const d = mk('+', i.content), abs = path.resolve(cwd || '.', String(i.file_path || ''));
        addFile(acc, { kind: exists(abs) ? 'edit' : 'create', file, abs, add: d.length, del: 0, diff: d.slice(0, CAP).join('\n') });
      } else if (b.name === 'Edit' || b.name === 'MultiEdit') {
        for (const x of b.name === 'Edit' ? [i] : i.edits || []) {
          const o = mk('-', x.old_string), n = mk('+', x.new_string);
          addFile(acc, { kind: 'edit', file, abs: path.resolve(cwd || '.', String(i.file_path || '')), add: n.length, del: o.length, diff: [...o, ...n].slice(0, CAP).join('\n') });
        }
      } else if (b.name === 'Skill') { const n = i.skill || i.name; if (n) (acc.skills ||= []).push(String(n)); // skills the agent invoked: kept beside the rows, not as a row
      } else if (b.name === 'Bash') acc.push({ kind: 'cmd', cmd: String(i.command || '').slice(0, 300), code: null, bg: !!i.run_in_background, _id: b.id });
    }
  } else if (e.type === 'user' && Array.isArray(e.message?.content)) {
    for (const b of e.message.content) if (b.type === 'tool_result') { const a = acc.find((x) => x._id === b.tool_use_id); if (a) a.code = b.is_error ? 1 : 0; }
  }
}

function codex(e, acc, cwd) {
  const it = e.item || {};
  if (e.type !== 'item.completed') return;
  if (it.type === 'command_execution') acc.push({ kind: 'cmd', cmd: String(it.command || '').replace(/^"[^"]*powershell[^"]*"\s+-Command\s+/i, '').replace(/^['"]|['"]$/g, '').slice(0, 300), code: it.exit_code ?? null });
  else if (/file_change|patch/.test(it.type || '')) for (const c of it.changes || []) acc.push({ kind: c.kind === 'add' ? 'create' : c.kind === 'delete' ? 'delete' : 'edit', file: base(c.path), abs: path.resolve(cwd || '.', String(c.path || '')) });
}

const clean = (acc) => acc.map(({ _id, ...r }) => r);

// The agent's own todo list (Claude TodoWrite, Codex todo_list) as [{t, done, now}], or null when the event has none.
function todos(e) {
  if (e.type === 'assistant') {
    const b = (e.message?.content || []).findLast((x) => x.type === 'tool_use' && x.name === 'TodoWrite');
    if (b) return (b.input?.todos || []).map((x) => ({ t: String(x.content || ''), done: x.status === 'completed', now: x.status === 'in_progress' }));
  }
  if (e.item?.type === 'todo_list') return (e.item.items || []).map((x) => ({ t: String(x.text || ''), done: !!x.completed, now: false }));
  const text = e.item?.type === 'agent_message' && e.type === 'item.completed' ? e.item.text : e.type === 'assistant' ? (e.message?.content || []).filter(b=>b.type==='text').map(b=>b.text || '').join('\n') : '';
  const items = [...String(text || '').replace(/```[^]*?```/g, '').matchAll(/^\s*[-*] \[([ xX])\] (.+)$/gm)].map(m=>({t:m[2].trim(),done:m[1].toLowerCase()==='x',now:false}));
  return items.length ? items : null;
}

module.exports = { claude, codex, clean, todos };
