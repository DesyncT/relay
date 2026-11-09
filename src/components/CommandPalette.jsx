import { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '../api.js';
import { getState, setState } from '../store.js';
import { openSession } from '../chat/chatStore.js';
import { newInOpenProject } from './shell/session.js';

// Ctrl+Shift+P / Ctrl+K / Ctrl+F / Ctrl+N / Ctrl+L / Ctrl+. (ported from quick-actions.js).
// Chat-screen hooks still go through its stable DOM ids (#input #log #stop #fAny #quickBtn).
// Open from anywhere: window.dispatchEvent(new CustomEvent('relay:palette', { detail: 'commands' | 'sessions' | 'find' })).
const $ = (s) => document.querySelector(s);
const chatOpen = () => !!getState().openSid && getState().tab === 'chat';
const TITLE = { find: 'Find in chat', sessions: 'Switch session', commands: 'Actions' };
const HOLD = { find: 'Search message text…', sessions: 'Search sessions or projects…', commands: 'Search actions…' };

async function exportChat() {
  try { await call('chat:export', getState().openSid); } catch (e) { alert('Could not export chat: ' + e.message); }
}
function commands(go) {
  const sid = getState().openSid, chat = chatOpen();
  return [
    { label: 'Find in chat', hint: 'Ctrl+F', run: () => go('find'), disabled: !chat },
    { label: 'Switch session', hint: 'Ctrl+K', run: () => go('sessions') },
    { label: 'New session in this project', hint: 'Ctrl+N', run: newInOpenProject, disabled: !sid },
    { label: 'Export chat as Markdown', hint: 'Save a copy', run: exportChat, disabled: !sid },
    { label: 'Focus message composer', hint: 'Ctrl+L', run: () => $('#input')?.focus(), disabled: !chat },
    { label: 'Attach files', hint: 'Paste or drop files', run: () => $('#fAny')?.click(), disabled: !chat },
    { label: 'Jump to newest message', hint: 'End of conversation', run: () => { const l = $('#log'); if (l) l.scrollTop = l.scrollHeight; }, disabled: !chat },
    { label: 'Stop active response', hint: 'Ctrl+.', run: () => $('#stop')?.click(), disabled: !chat || !$('#stop') || $('#stop').hidden },
    ...['chat', 'usage', 'rules', 'agents', 'settings', 'themes'].map((t) => ({ label: t === 'agents' ? 'Open subagents' : 'Open ' + t, run: () => setState({ tab: t }) })),
  ].filter((x) => !x.disabled);
}
function findEntries() {
  return [...document.querySelectorAll('#log .msg')].map((row) => ({
    label: String(row._m?.text ?? row.textContent ?? ''), hint: row._m?.from || 'Message',
    run: () => {
      document.querySelectorAll('#log .search-hit').forEach((x) => x.classList.remove('search-hit'));
      row.classList.add('search-hit'); row.tabIndex = -1; row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'center', behavior: 'instant' });
    },
  })).filter((e) => e.label);
}

export default function CommandPalette() {
  const dlg = useRef(), inp = useRef(), list = useRef(), gen = useRef(0), openRef = useRef();
  const [mode, setMode] = useState('commands');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [msg, setMsg] = useState('');
  const [src, setSrc] = useState([]);

  const open = useCallback(async (next = 'commands') => {
    if (next === 'find' && !chatOpen()) return;
    const token = ++gen.current;
    setMode(next); setQ(''); setSel(0); setSessions([]); setMsg('');
    setSrc(next === 'find' ? findEntries() : next === 'commands' ? commands((m) => openRef.current(m)) : []);
    if (!dlg.current.open) dlg.current.showModal();
    inp.current.focus();
    if (next !== 'sessions') return;
    setMsg('Loading sessions…');
    try {
      const t = await call('sessions:tree');
      if (token !== gen.current || !dlg.current.open) return;
      setSessions((t.sessions || []).map((s) => ({
        label: s.title || 'New session', hint: (t.projects || []).find((p) => p.id === s.projectId)?.name || 'Session',
        run: async () => { await call('sessions:setActive', s.id); setState({ openSid: s.id }); await openSession(s.id); },
      })));
      setMsg('');
    } catch { if (token === gen.current && dlg.current.open) setMsg('Could not load sessions. Close and try again.'); }
  }, []);
  openRef.current = open;

  const query = q.trim().toLocaleLowerCase();
  const source = mode === 'sessions' ? sessions : src;
  const entries = mode === 'find' && !query ? [] : source.filter((x) => (x.label + ' ' + (x.hint || '')).toLocaleLowerCase().includes(query));
  const cur = entries.length ? Math.min(sel, entries.length - 1) : 0;
  useEffect(() => { list.current?.children[cur]?.scrollIntoView({ block: 'nearest' }); }, [cur, entries.length]);

  const activate = (i) => {
    const e = entries[i]; if (!e) return;
    dlg.current.close(); Promise.resolve().then(e.run).catch((err) => alert(err.message));
  };
  useEffect(() => {
    const ext = (e) => open(e.detail || 'commands');
    const key = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.isComposing) return;
      const k = e.key.toLowerCase(), d = dlg.current;
      if ((k === 'p' && e.shiftKey) || (k === 'k' && !e.shiftKey)) { e.preventDefault(); open(k === 'k' ? 'sessions' : 'commands'); }
      else if (k === 'f' && chatOpen() && !e.shiftKey) { e.preventDefault(); open('find'); }
      else if (!e.shiftKey && k === 'l' && chatOpen()) { e.preventDefault(); if (d.open) d.close(); $('#input')?.focus(); }
      else if (!e.shiftKey && k === '.' && chatOpen() && $('#stop') && !$('#stop').hidden) { e.preventDefault(); $('#stop').click(); }
      else if (!d.open && !e.shiftKey && k === 'n' && getState().openSid) { e.preventDefault(); newInOpenProject().catch((err) => alert(err.message)); }
    };
    const click = (e) => { if (e.target.closest?.('#quickBtn')) open(); };
    window.addEventListener('relay:palette', ext); document.addEventListener('keydown', key); document.addEventListener('click', click);
    return () => { window.removeEventListener('relay:palette', ext); document.removeEventListener('keydown', key); document.removeEventListener('click', click); };
  }, [open]);

  const outside = (e) => { const r = dlg.current.getBoundingClientRect(); return e.target === dlg.current && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom); };
  const press = useRef(false);
  const status = mode === 'find' && !query ? 'Type to search this chat' : msg || (entries.length ? `${entries.length} results · ↑ ↓ to navigate · Enter to open` : 'No results');
  return (
    <dialog id="quickActions" ref={dlg} aria-labelledby="quickTitle"
      onClose={() => requestAnimationFrame(() => {
        if (dlg.current.open || !chatOpen() || document.querySelector('dialog[open]')) return;
        const a = document.activeElement;
        if (!a || a === document.body || a.id === 'quickBtn' || dlg.current.contains(a)) $('#input')?.focus({ preventScroll: true });
      })}
      onPointerDown={(e) => { press.current = outside(e); }}
      onClick={(e) => { if (press.current && outside(e)) dlg.current.close(); press.current = false; }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.target !== inp.current) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setSel(entries.length ? (cur + (e.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length : 0); }
        if (e.key === 'Enter') { e.preventDefault(); activate(cur); }
      }}>
      <header><h2 id="quickTitle">{TITLE[mode]}</h2><button type="button" onClick={() => dlg.current.close()}>Close</button></header>
      <input ref={inp} type="search" autoComplete="off" spellCheck={false} role="combobox" aria-controls="quickResults" aria-expanded="true" aria-autocomplete="list"
        aria-label={TITLE[mode]} placeholder={HOLD[mode]} value={q} aria-activedescendant={entries.length ? 'quick-result-' + cur : undefined}
        onChange={(e) => { setQ(e.target.value); setSel(0); }} />
      <div id="quickResults" role="listbox" aria-label="Results" ref={list}>
        {entries.map((e, i) => (
          <button key={i} type="button" id={'quick-result-' + i} role="option" aria-selected={i === cur} tabIndex={-1}
            className={'quick-result' + (i === cur ? ' selected' : '')} onClick={() => activate(i)}>
            <span>{e.label.slice(0, 240)}</span><small>{e.hint || ''}</small>
          </button>
        ))}
      </div>
      <p role="status">{status}</p>
    </dialog>
  );
}
