import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call } from '../api.js';
import { ease, springSoft } from '../motion.js';
import { Ico, Logo, openFile } from './bits.jsx';
import { getChat, setSubsOpen, useChat } from './chatStore.js';
import { dur, fcost, ftok } from './md.js';
import { useNow } from './Bars.jsx';

const nat = (r) => r.kind === 'native';
const subEnd = (r) => r.status !== 'running' && r.status !== 'queued';
const subTime = (r) => r.stateLabel || (r.status === 'running' ? dur(Date.now() - r.started) : r.status === 'queued' ? 'Queued' : r.status === 'done' ? 'Done' : r.status === 'failed' ? 'Failed' : 'Stopped');

function showSubInChat(r) {
  const it = [...getChat().items].reverse().find((x) => x.m?.sub === r.title);
  const row = it && document.querySelector(`#log [data-mid="${it.id}"]`);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.add('sr-hl'); setTimeout(() => row.classList.remove('sr-hl'), 1600);
}

const VERDICT = { accepted: 'Accepted', redo: 'Redo', fired: 'Fired' };
function Strikes({ n }) {
  return <span className="sr-strikes" role="img" aria-label={`${n} of 3 strikes`} title={`${n} of 3 strikes`}>{[0, 1, 2].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
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
  const files = r.files || [], hist = Array.isArray(r.history) ? r.history : [];
  const req = r.kind === 'requirement';
  return (
    <motion.div className="sr-x" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease }} style={{ overflow: 'hidden' }}>
      <small>Task</small><p>{r.task}</p>{r.feedback && r.verdict !== 'accepted' && <><small>Boss feedback</small><blockquote className="sr-fb">{r.feedback}</blockquote></>}{outcome}
      {hist.length > 0 && <details className="sr-hist"><summary>Previous attempts · {hist.length}</summary>{hist.map((h, i) => <div key={i} className="sr-h"><b>Attempt {h.attempt ?? i + 1}</b>{h.result && <p>{h.result}</p>}{h.feedback && <blockquote className="sr-fb">{h.feedback}</blockquote>}</div>)}</details>}
      {files.length > 0 && <><small>Files changed · {files.length}</small><div className="sr-files">{files.map((f) => <button key={f} type="button" title={f} onClick={() => openFile(f)}>{f.split(/[\\/]/).pop()}</button>)}</div></>}
      <div className="sr-acts">
        {!nat(r) && !end && <Act onClick={() => call('subagents:stop', r.id)}>Stop</Act>}
        {!nat(r) && end && (!req || r.status !== 'done') && (req ? <><RetryAct r={r} label="Retry" /><RetryAct r={r} label="Try another model" alternate /></> : <RetryAct r={r} label="Run again" />)}
        {r.result && <CopyAct r={r} />}
        {req ? <Act onClick={() => { const d = document.getElementById('reqbar'); if (d) { d.open = true; d.querySelector('ol')?.children[r.requirementIndex]?.scrollIntoView({ block: 'nearest' }); } }}>Show requirement</Act>
          : r.status === 'done' && <Act onClick={() => showSubInChat(r)}>Show in chat</Act>}
      </div>
    </motion.div>
  );
}

function SubRow({ r, open, toggle, depth = 0 }) {
  const end = subEnd(r);
  const meta = [r.model && r.model.replace(/^claude-/, ''), end && r.ended ? dur(r.ended - r.started) : '', r.tokensOut ? ftok(r.tokensOut) + ' out' : '', r.cost ? fcost(r.cost) : ''].filter(Boolean).join(' · ') || r.owner;
  const att = r.attempt || 1, strikes = Math.min(3, r.strikes || 0), vd = VERDICT[r.verdict], seen = useRef(att + ':' + r.verdict);
  const key = att + ':' + r.verdict, flash = key !== seen.current && (r.verdict === 'redo' || att > 1);
  useEffect(() => { seen.current = key; }, [key]);
  return (
    <motion.div layout="position" className={`sr ${r.status}${end ? ' end' : ''}${open ? ' open' : ''}${depth ? ' kid' : ''}${r.verdict ? ' v-' + r.verdict : ''}${flash ? ' flash' : ''}`} data-id={r.id} style={depth ? { marginLeft: Math.min(depth, 4) * 12 } : undefined}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={springSoft}>
      <div className="sr-hd">
        <button className="sr-top" type="button" aria-expanded={open} onClick={toggle}>
          <span className="sr-ic"><Logo name={r.owner === 'claude' ? 'claude' : 'openai'} size={16} color={r.owner === 'claude' ? '#D97757' : '#fff'} /></span>
          <span className="sr-t" title={r.title}>{r.title}</span>
          {r.status === 'running' && <span className="sr-live" />}
          <span className={'sr-s' + (r.status === 'running' ? ' tm' : '')}>{subTime(r)}</span>
          <span className="sr-chev"><Ico d="m9 6 6 6-6 6" /></span>
        </button>
        {!end && !nat(r) && <button className="sr-stop" type="button" title="Stop" aria-label={'Stop ' + r.title} onClick={() => call('subagents:stop', r.id)}><Ico><rect width="10" height="10" x="7" y="7" rx="1.5" /></Ico></button>}
      </div>
      <div className="sr-m">{meta}{nat(r) && <span className="sr-cc"> · Claude Code{r.agentType && r.agentType !== 'general-purpose' ? ' ' + r.agentType : ''}</span>}</div>
      {(att > 1 || strikes > 0 || vd) && <div className="sr-bd">{att > 1 && <span className="sr-chip">Attempt {att}</span>}{strikes > 0 && <Strikes n={strikes} />}{vd && <span className={'sr-v ' + r.verdict}>{vd}</span>}</div>}
      {nat(r) && !end && r.activity && <div className="sr-act" title={r.activity}>{r.activity}</div>}
      <AnimatePresence initial={false}>{open && <Detail key="d" r={r} end={end} />}</AnimatePresence>
    </motion.div>
  );
}

// boss first, children under their parent (parent id), oldest first; orphans become roots
function flatten(list) {
  const ids = new Set(list.map((r) => r.id)), kids = {}, out = [], bosses = {};
  // backend parent = boss run id (no record of its own): synthesize a header node per boss run
  list.forEach((r) => { if (r.parent && !ids.has(r.parent)) { const b = (bosses[r.parent] ||= { id: r.parent, boss: true, owner: r.owner, started: r.started, live: false }); b.started = Math.min(b.started || 0, r.started || 0); b.live ||= r.status === 'running' || r.status === 'queued'; } });
  Object.values(bosses).forEach((b) => (kids[''] ||= []).push(b));
  list.forEach((r) => { const p = r.parent && (ids.has(r.parent) || bosses[r.parent]) ? r.parent : ''; (kids[p] ||= []).push(r); });
  const walk = (p, d) => (kids[p] || []).sort((a, b) => (a.started || 0) - (b.started || 0)).forEach((r) => { out.push([r, d]); walk(r.id, d + 1); });
  walk('', 0);
  return out;
}

function PlanList() {
  const plan = useChat((s) => s.plan);
  if (!plan?.length) return null;
  const n = plan.filter((x) => x.status === 'done').length;
  return (
    <div className="pl" role="group" aria-label="Plan">
      <div className="pl-h"><b>Plan</b><span>{n}/{plan.length} steps</span></div>
      <div className="pl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={plan.length} aria-valuenow={n}><i style={{ width: (n / plan.length) * 100 + '%' }} /></div>
      <ol>{plan.map((x) => <li key={x.id} className={'pl-' + x.status}><span className="pl-d" aria-hidden="true" /><span className="pl-t">{x.text}<small className="sr-only"> ({x.status})</small></span></li>)}</ol>
    </div>
  );
}

export function SubsAside() {
  const subs = useChat((s) => s.subs), open = useChat((s) => s.subsOpen), sid = useChat((s) => s.sid), hasPlan = useChat((s) => s.plan.length > 0);
  const [exp, setExp] = useState(() => new Set()), [all, setAll] = useState(false);
  useEffect(() => { setAll(false); setExp(new Set()); }, [sid]);
  useNow(1000, open && subs.some((r) => r.status === 'running'));
  const run = subs.filter((r) => r.status === 'running').length, q = subs.filter((r) => r.status === 'queued').length, dn = subs.filter((r) => r.status === 'done').length, bad = subs.filter((r) => r.status === 'failed').length, redone = subs.filter((r) => (r.attempt || 1) > 1).length, fired = subs.filter((r) => r.verdict === 'fired').length;
  const every = flatten(subs), vis = all ? every : every.slice(0, 40);
  const show = open && (subs.length > 0 || hasPlan);
  const toggle = (id) => setExp((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.aside id="subs" aria-label="Subagents" key="subs" initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ width: { type: 'spring', stiffness: 300, damping: 32 }, opacity: { duration: 0.2 } }}>
          <div style={{ width: 280, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div className="sb-h"><b>Agents</b><span id="sbN">{[run && run + ' running', q && q + ' queued', dn && dn + ' done', bad && bad + ' failed', redone && redone + ' redone', fired && fired + ' fired'].filter(Boolean).join(' · ')}</span>
              <button className="sb-x" id="sbClose" type="button" aria-label="Hide subagents" title="Hide" onClick={() => setSubsOpen(false)}><Ico d="M18 6 6 18M6 6l12 12" /></button></div>
            <PlanList />
            <div id="sbList">
              <AnimatePresence initial={false}>{vis.map(([r, d]) => r.boss
                ? <div key={r.id} className="sb-boss"><span className={'sb-boss-dot' + (r.live ? ' live' : '')} />Boss · @{r.owner}<small>{r.live ? 'delegating' : 'settled'}</small></div>
                : <SubRow key={r.id} r={r} depth={d} open={exp.has(r.id)} toggle={() => toggle(r.id)} />)}</AnimatePresence>
              {every.length > 40 && <button id="sbMore" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show ${every.length - vis.length} more`}</button>}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
