import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call } from '../api.js';
import { ease, springSoft } from '../motion.js';
import { Ico, Logo, openFile } from './bits.jsx';
import { getChat, setSubsOpen, useChat } from './chatStore.js';
import { dur, fcost, ftok } from './md.js';
import { useNow } from './Bars.jsx';

const subEnd = (r) => r.status !== 'running' && r.status !== 'queued';
const subTime = (r) => r.stateLabel || (r.status === 'running' ? dur(Date.now() - r.started) : r.status === 'queued' ? 'Queued' : r.status === 'done' ? 'Done' : r.status === 'failed' ? 'Failed' : 'Stopped');

function showSubInChat(r) {
  const it = [...getChat().items].reverse().find((x) => x.m?.sub === r.title);
  const row = it && document.querySelector(`#log [data-mid="${it.id}"]`);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.add('sr-hl'); setTimeout(() => row.classList.remove('sr-hl'), 1600);
}

function Act({ children, onClick }) { return <button className="sr-a" type="button" onClick={onClick}>{children}</button>; }
function RetryAct({ r, label, alternate }) {
  const [st, setSt] = useState('');
  return <button className="sr-a" type="button" disabled={!!st} onClick={async () => { setSt('Queuing…'); try { await call('subagents:retry', r.id, alternate); setSt('Queued'); } catch (e) { setSt(''); alert(e.message); } }}>{st || label}</button>;
}
function CopyAct({ r }) {
  const [ok, setOk] = useState(false);
  return <Act onClick={() => navigator.clipboard?.writeText(r.result).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); })}>{ok ? 'Copied' : 'Copy result'}</Act>;
}

// an opened subagent: what it was asked, what came back, the files it touched, and what you can do with it
function Detail({ r, end }) {
  const outcome = r.result ? <><small>{r.status === 'failed' ? 'Error' : 'Result'}</small><p>{r.result}</p></>
    : r.status === 'stopped' ? <><small>Result</small><p className="muted">Stopped{r.ended ? ' after ' + dur(r.ended - r.started) : ''} before it reported back</p></>
    : r.status === 'queued' ? <p className="muted">Waiting for a free slot</p> : null;
  const files = r.files || [];
  const req = r.kind === 'requirement';
  return (
    <motion.div className="sr-x" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease }} style={{ overflow: 'hidden' }}>
      <small>Task</small><p>{r.task}</p>{outcome}
      {files.length > 0 && <><small>Files changed · {files.length}</small><div className="sr-files">{files.map((f) => <button key={f} type="button" title={f} onClick={() => openFile(f)}>{f.split(/[\\/]/).pop()}</button>)}</div></>}
      <div className="sr-acts">
        {!end && <Act onClick={() => call('subagents:stop', r.id)}>Stop</Act>}
        {end && (!req || r.status !== 'done') && (req ? <><RetryAct r={r} label="Retry" /><RetryAct r={r} label="Try another model" alternate /></> : <RetryAct r={r} label="Run again" />)}
        {r.result && <CopyAct r={r} />}
        {req ? <Act onClick={() => { const d = document.getElementById('reqbar'); if (d) { d.open = true; d.querySelector('ol')?.children[r.requirementIndex]?.scrollIntoView({ block: 'nearest' }); } }}>Show requirement</Act>
          : r.status === 'done' && <Act onClick={() => showSubInChat(r)}>Show in chat</Act>}
      </div>
    </motion.div>
  );
}

function SubRow({ r, open, toggle }) {
  const end = subEnd(r);
  const meta = [r.model && r.model.replace(/^claude-/, ''), end && r.ended ? dur(r.ended - r.started) : '', r.tokensOut ? ftok(r.tokensOut) + ' out' : '', r.cost ? fcost(r.cost) : ''].filter(Boolean).join(' · ') || r.owner;
  return (
    <motion.div layout="position" className={`sr ${r.status}${end ? ' end' : ''}${open ? ' open' : ''}`} data-id={r.id}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={springSoft}>
      <div className="sr-hd">
        <button className="sr-top" type="button" aria-expanded={open} onClick={toggle}>
          <span className="sr-ic"><Logo name={r.owner === 'claude' ? 'claude' : 'openai'} size={16} color={r.owner === 'claude' ? '#D97757' : '#fff'} /></span>
          <span className="sr-t" title={r.title}>{r.title}</span>
          {r.status === 'running' && <span className="sr-live" />}
          <span className={'sr-s' + (r.status === 'running' ? ' tm' : '')}>{subTime(r)}</span>
          <span className="sr-chev"><Ico d="m9 6 6 6-6 6" /></span>
        </button>
        {!end && <button className="sr-stop" type="button" title="Stop" aria-label={'Stop ' + r.title} onClick={() => call('subagents:stop', r.id)}><Ico><rect width="10" height="10" x="7" y="7" rx="1.5" /></Ico></button>}
      </div>
      <div className="sr-m">{meta}</div>
      <AnimatePresence initial={false}>{open && <Detail key="d" r={r} end={end} />}</AnimatePresence>
    </motion.div>
  );
}

export function SubsAside() {
  const subs = useChat((s) => s.subs), open = useChat((s) => s.subsOpen), sid = useChat((s) => s.sid);
  const [exp, setExp] = useState(() => new Set()), [all, setAll] = useState(false);
  useEffect(() => { setAll(false); setExp(new Set()); }, [sid]);
  useNow(1000, open && subs.some((r) => r.status === 'running'));
  const run = subs.filter((r) => r.status === 'running').length, q = subs.filter((r) => r.status === 'queued').length, dn = subs.filter(subEnd).length;
  const live = subs.filter((r) => !subEnd(r)).sort((a, b) => a.started - b.started), old = subs.filter(subEnd).sort((a, b) => b.ended - a.ended);
  const every = [...live, ...old], vis = all ? every : every.slice(0, Math.max(6, live.length));
  const show = open && subs.length > 0;
  const toggle = (id) => setExp((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.aside id="subs" aria-label="Subagents" key="subs" initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ width: { type: 'spring', stiffness: 300, damping: 32 }, opacity: { duration: 0.2 } }}>
          <div style={{ width: 280, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div className="sb-h"><b>Subagents</b><span id="sbN">{[run && run + ' running', q && q + ' queued', !run && !q && dn + ' done'].filter(Boolean).join(' · ')}</span>
              <button className="sb-x" id="sbClose" type="button" aria-label="Hide subagents" title="Hide" onClick={() => setSubsOpen(false)}><Ico d="M18 6 6 18M6 6l12 12" /></button></div>
            <div id="sbList">
              <AnimatePresence initial={false}>{vis.map((r) => <SubRow key={r.id} r={r} open={exp.has(r.id)} toggle={() => toggle(r.id)} />)}</AnimatePresence>
              {every.length > 6 && <button id="sbMore" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show ${every.length - vis.length} more`}</button>}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
