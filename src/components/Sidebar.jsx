import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call, useIpcEvent } from '../api.js';
import { setState, useStore } from '../store.js';
import { ease, spring } from '../motion.js';
import { Icon } from './icons.jsx';
import './shell/shell.css';
import * as S from './shell/session.js';

const P = {
  plus: <path d="M5 12h14M12 5v14" />,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  folder: <><path d="M12 10v6M9 13h6" /><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></>,
  caret: <path d="m6 9 6 6 6-6" />,
  more: <><circle cx="12" cy="12" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
};
const IconBtn = ({ cls, label, ic, onClick }) => (
  <button type="button" className={cls} title={label} aria-label={label} onClick={onClick}><Icon>{P[ic]}</Icon></button>
);

// Native drag and drop (same as legacy, keeps the .drop-before/.drop-after CSS). Attached via ref because
// motion components own the onDrag* props.
let drag = null;
function useDnd(nodeRef, handleRef, kind, id, pid, setMark) {
  useEffect(() => {
    const node = nodeRef.current, handle = handleRef.current;
    const side = (e) => { const b = node.getBoundingClientRect(); return e.clientY < b.top + b.height / 2 ? 'before' : 'after'; };
    const ok = () => drag && drag.kind === kind && drag.pid === pid && drag.id !== id;
    const start = (e) => { e.stopPropagation(); drag = { kind, id, pid }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); node.classList.add('dragging'); };
    const end = () => { drag = null; node.classList.remove('dragging'); setMark(null); };
    const over = (e) => { if (!ok()) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setMark({ id, side: side(e) }); };
    const drop = (e) => { if (!ok()) return; e.preventDefault(); e.stopPropagation(); const d = drag, s = side(e); setMark(null); drag = null; S.moveTo(kind, pid, d.id, id, s); };
    handle.draggable = true;
    handle.addEventListener('dragstart', start); handle.addEventListener('dragend', end);
    node.addEventListener('dragover', over); node.addEventListener('drop', drop);
    return () => { handle.removeEventListener('dragstart', start); handle.removeEventListener('dragend', end); node.removeEventListener('dragover', over); node.removeEventListener('drop', drop); };
  }, [kind, id, pid]);
}

function InlineEdit({ cur, onDone }) {
  const ref = useRef(), done = useRef(false);
  useEffect(() => { ref.current.focus(); ref.current.select(); }, []);
  const end = (save) => { if (done.current) return; done.current = true; const v = ref.current.value.trim(); onDone(save && v && v !== cur ? v : null); };
  return <input ref={ref} className="sb-edit" defaultValue={cur} spellCheck={false} onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false); }} onBlur={() => end(true)} />;
}

function arrowNav(e, el) {
  const all = [...el.closest('.sb-list').querySelectorAll('.sb-row,.sb-group-h,.sb-show')], k = all.indexOf(el) + (e.key === 'ArrowDown' ? 1 : -1);
  all[k]?.focus(); e.preventDefault();
}

function Row({ s, active, working, pinned, menu, editing, setEditing, onPin }) {
  const ref = useRef(), [mark, setMark] = useState(null);
  useDnd(ref, ref, 'session', s.id, s.projectId, setMark);
  const items = [
    ['Rename', () => setEditing(s.id)],
    ['Delete', () => S.delSession(s), true],
    [pinned ? 'Unpin session' : 'Pin session', () => onPin(s.id)],
  ];
  const keys = (e) => {
    if (e.target !== ref.current) return;
    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); S.moveBy('session', s.projectId, s.id, e.key === 'ArrowDown' ? 1 : -1); }
    else if (e.key === 'Enter') S.open(s.id);
    else if (e.key === 'Delete') S.delSession(s);
    else if (e.key === 'F2') setEditing(s.id);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') arrowNav(e, ref.current);
  };
  const title = (pinned ? 'Pinned · ' : '') + s.title + '\nF2 to rename · Alt+↑/↓ to reorder';
  return (
    <motion.div ref={ref} layout="position" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8, transition: { duration: 0.12 } }} transition={spring}
      className={'sb-row' + (active ? ' on' : '') + (pinned ? ' sb-pinned' : '') + (mark ? ' drop-' + mark.side : '')}
      data-id={s.id} tabIndex={0} role="button" aria-pressed={active} title={title}
      onClick={() => S.open(s.id)} onKeyDown={keys}
      onContextMenu={(e) => { e.preventDefault(); menu(e.currentTarget, items, { x: e.clientX, y: e.clientY }); }}>
      {editing === s.id
        ? <InlineEdit cur={s.title} onDone={(v) => { setEditing(null); if (v) call('sessions:rename', s.id, v); }} />
        : <span className="sb-title">{s.title}</span>}
      {working ? <span className="sb-spin" title="Working" />
        : s.waitingQuestion ? <span className="sb-qdot" title="Waiting for your answer" />
        : s.unread ? <span className="sb-dot" title="Done, not read yet" /> : null}
      <IconBtn cls="sb-more" label="Session actions" ic="more" onClick={(e) => { e.stopPropagation(); menu(e.currentTarget, items); }} />
    </motion.div>
  );
}

function Group({ p, tree, working, pins, menu, editing, setEditing, onPin, expanded, toggleExpanded }) {
  const gRef = useRef(), hRef = useRef(), [mark, setMark] = useState(null);
  useDnd(gRef, hRef, 'project', p.id, null, setMark);
  const all = expanded.has(p.id), rows = all ? p.rows : p.rows.slice(0, S.LIMIT);
  const items = [
    ['New session here', () => S.newSession(p)],
    ['Rename', () => setEditing('p:' + p.id)],
    ['Copy path: ' + p.path, () => navigator.clipboard?.writeText(p.path)],
    ['Remove from list', () => S.removeProject(p), true],
  ];
  const keys = (e) => {
    if (e.target !== hRef.current) return;
    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); S.moveBy('project', null, p.id, e.key === 'ArrowDown' ? 1 : -1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.toggleCollapsed(p); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') arrowNav(e, hRef.current);
  };
  return (
    <motion.div ref={gRef} layout="position" transition={spring} className={'sb-group' + (mark ? ' drop-' + mark.side : '')}>
      <div ref={hRef} className={'sb-group-h' + (p.collapsed ? ' collapsed' : '')} tabIndex={0} role="button" aria-expanded={!p.collapsed}
        title={p.path + '\nAlt+↑/↓ to reorder'} data-pid={p.id} onClick={() => S.toggleCollapsed(p)} onKeyDown={keys}
        onContextMenu={(e) => { e.preventDefault(); menu(e.currentTarget, items, { x: e.clientX, y: e.clientY }); }}>
        <Icon>{P.caret}</Icon>
        {editing === 'p:' + p.id
          ? <InlineEdit cur={p.name} onDone={(v) => { setEditing(null); if (v) call('projects:rename', p.id, v); }} />
          : <span className="sb-name">{p.name}</span>}
        <IconBtn cls="sb-more" label="Project actions" ic="more" onClick={(e) => { e.stopPropagation(); menu(e.currentTarget, items); }} />
        <IconBtn cls="sb-more sb-add" label="New session" ic="plus" onClick={(e) => { e.stopPropagation(); S.newSession(p); }} />
      </div>
      <AnimatePresence initial={false}>
        {!p.collapsed && (
          <motion.div key="rows" className="sb-rows"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1, transition: { duration: 0.24, ease } }} exit={{ height: 0, opacity: 0, transition: { duration: 0.18, ease } }}>
            <AnimatePresence initial={false}>
              {rows.map((s) => <Row key={s.id} s={s} active={s.id === tree.active} working={working.has(s.id)} pinned={pins.has(s.id)} menu={menu} editing={editing} setEditing={setEditing} onPin={onPin} />)}
            </AnimatePresence>
            {!rows.length && <div className="sb-none">No sessions yet</div>}
            {p.rows.length > S.LIMIT && (
              <div className="sb-show" tabIndex={0} role="button" onClick={() => toggleExpanded(p.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') toggleExpanded(p.id); else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') arrowNav(e, e.currentTarget); }}>
                {all ? 'Show less' : `Show more (${p.rows.length - S.LIMIT})`}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Search({ onClose }) {
  const [q, setQ] = useState(''), [found, setFound] = useState(null), ref = useRef(), res = useRef();
  useEffect(() => { ref.current.focus(); }, []);
  useEffect(() => {
    const v = q.trim();
    if (!v) { setFound(null); return; }
    let live = true;
    const t = setTimeout(() => call('sessions:search', v).then((r) => live && setFound(r)).catch(() => {}), 120);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const by = useMemo(() => { const m = new Map(); for (const r of found || []) (m.get(r.projectName) || m.set(r.projectName, []).get(r.projectName)).push(r); return [...m]; }, [found]);
  const go = (id) => { onClose(); S.open(id); };
  return (
    <motion.div className="sb-search" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease }}>
      <input ref={ref} className="sb-q" type="search" placeholder="Search sessions" spellCheck={false} aria-label="Search sessions" value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { onClose(); e.stopPropagation(); }
          else if (e.key === 'Enter') res.current.querySelector('.sb-hit')?.click();
          else if (e.key === 'ArrowDown') { res.current.querySelector('.sb-hit')?.focus(); e.preventDefault(); }
        }} />
      <div className="sb-list" ref={res}>
        {found && !found.length && <div className="sb-none">No matches</div>}
        {by.map(([pn, rs]) => [
          <div key={'h' + pn} className="sb-group-h static">{pn}</div>,
          ...rs.map((r) => (
            <div key={r.sessionId} className="sb-hit" tabIndex={0} role="button" data-id={r.sessionId} onClick={() => go(r.sessionId)} onKeyDown={(e) => { if (e.key === 'Enter') go(r.sessionId); }}>
              <span className="sb-title">{r.title}</span>{r.snippet && <span className="sb-snip">{r.snippet}</span>}
            </div>
          )),
        ])}
      </div>
    </motion.div>
  );
}

export default function Sidebar() {
  const tree = useStore((s) => s.sbTree) || { projects: [], sessions: [], active: null };
  const working = useStore((s) => s.sbWorking) || new Set();
  const [pins, setPins] = useState(() => new Set(S.loadPins()));
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const box = useRef();

  useEffect(() => { S.refresh().catch(() => {}); }, []);
  useIpcEvent('sessions:changed', S.refreshSoon);
  const setWorking = (ids) => setState({ sbWorking: new Set(ids || []) });
  useIpcEvent('sessions:working', setWorking);
  useEffect(() => { call('sessions:working').then(setWorking, () => {}); }, []);

  const onPin = (id) => setPins((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); S.savePins([...n]); return n; });
  const toggleExpanded = (id) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const groups = useMemo(() => tree.projects.map((p) => ({ ...p, rows: tree.sessions.filter((x) => x.projectId === p.id).sort((a, b) => Number(pins.has(b.id)) - Number(pins.has(a.id))) })), [tree, pins]);

  const showMenu = (anchor, items, at) => {
    const b = box.current.getBoundingClientRect(), r = anchor.getBoundingClientRect();
    const x = at ? at.x - b.left : r.right - b.left - 144, y = at ? at.y - b.top : r.bottom - b.top + 4;
    setMenu({ items, x: Math.max(4, Math.min(x, b.width - 148)), y: Math.max(4, Math.min(y, b.height - items.length * 28 - 12)) });
  };
  useEffect(() => {
    if (!menu) return;
    const down = (e) => { if (!e.target.closest?.('.sb-menu')) setMenu(null); };
    const key = (e) => { if (e.key === 'Escape') { setMenu(null); e.stopPropagation(); } };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key, true);
    box.current.querySelector('.sb-mi')?.focus();
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true); };
  }, [menu]);

  const act = (label, ic, fn) => <button type="button" className="sb-act" onClick={fn}><Icon>{P[ic]}</Icon>{label}</button>;
  return (
    <div id="sidebar" className="sb" ref={box}>
      <div className="sb-top">
        {act('New session', 'plus', () => S.newSession())}
        {act('Search', 'search', () => setSearching((v) => !v))}
        {act('Add project', 'folder', S.addProject)}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {searching
          ? <Search key="s" onClose={() => setSearching(false)} />
          : (
            <motion.div key="l" className="sb-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              {groups.length
                ? groups.map((g) => <Group key={g.id} p={g} tree={tree} working={working} pins={pins} menu={showMenu} editing={editing} setEditing={setEditing} onPin={onPin} expanded={expanded} toggleExpanded={toggleExpanded} />)
                : <div className="sb-none sb-empty">Add a project folder to start a session</div>}
            </motion.div>
          )}
      </AnimatePresence>
      <AnimatePresence>
        {menu && (
          <motion.div key="menu" className="sb-menu" role="menu" style={{ left: menu.x, top: menu.y, transformOrigin: 'top right' }}
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1, transition: spring }} exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}>
            {menu.items.map(([label, fn, danger]) => (
              <button key={label} type="button" role="menuitem" className={'sb-mi' + (danger ? ' danger' : '')} onClick={(e) => { e.stopPropagation(); setMenu(null); fn(); }}>{label}</button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
