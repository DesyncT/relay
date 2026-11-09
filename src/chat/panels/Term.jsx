import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { call, useIpcEvent } from '../../api.js';
import { getState, setState, useStore } from '../../store.js';
import { openUrl } from '../panelsApi.js';
import { Bar, Sub, Btn } from './ui.jsx';

const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;
const DEV = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+[^\s'")\]]*/g;

// terminal text + detected dev urls per session; in the store so they survive panel close/open
export function addTerm(id, s) {
  s = s.replace(ANSI, '');
  const { pnBuf = {}, pnUrls = {} } = getState();
  let t = (pnBuf[id] || '') + s; if (t.length > 200000) t = t.slice(-150000);
  const set = new Set(pnUrls[id] || []);
  for (const u of s.match(DEV) || []) set.add(u.replace(/[.,;]+$/, ''));
  setState({ pnBuf: { ...pnBuf, [id]: t }, pnUrls: { ...pnUrls, [id]: [...set] } });
}
export function useTermEvents() {
  useIpcEvent('panel:term:data', (d) => addTerm(d.sid, d.data));
  useIpcEvent('panel:term:exit', (d) => addTerm(d.sid, `[shell exited${d.code != null ? ' ' + d.code : ''}]\n`));
}
export const Chips = ({ sid, onPick }) => {
  const list = useStore((s) => s.pnUrls?.[sid]) || [];
  if (!list.length) return null;
  return (
    <div className="pn-chipbar"><div className="pn-chips">{list.map((u) => (
      <motion.button key={u} className="pn-chip" type="button" onClick={() => onPick(u)} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        Open <em>{u.replace(/^https?:\/\//, '')}</em>
      </motion.button>
    ))}</div></div>
  );
};

export default function Term({ sid, refresh }) {
  const text = useStore((s) => s.pnBuf?.[sid]) || '';
  const [cwd, setCwd] = useState('');
  const [val, setVal] = useState('');
  const [flash, setFlash] = useState(0);
  const log = useRef(null), input = useRef(null), hist = useRef({ a: [], i: 0 });
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [text]);
  useEffect(() => {
    input.current?.focus();
    call('panel:term:start', sid).then((r) => setCwd(r?.error || r?.cwd || getState().sessionCwd || ''));
  }, [sid, refresh]);
  const add = (s) => addTerm(sid, s);
  const key = async (e) => {
    const h = hist.current;
    if (e.key === 'Enter') {
      const v = val; setVal(''); if (v.trim()) { h.a.push(v); h.i = h.a.length; }
      add('> ' + v + '\n'); await call('panel:term:start', sid); call('panel:term:write', sid, v);
    } else if (e.key === 'c' && e.ctrlKey && !getSelection().toString()) {
      e.preventDefault(); add('^C\n'); setFlash((n) => n + 1); await call('panel:term:restart', sid);
    } else if (e.key === 'ArrowUp' && h.a.length) { e.preventDefault(); setVal(h.a[(h.i = Math.max(0, h.i - 1))]); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setVal(h.a[(h.i = Math.min(h.a.length, h.i + 1))] || ''); }
  };
  return (<>
    <Bar title="Terminal">
      <Sub>{cwd}</Sub>
      <Btn icon="trash" label="Clear" onClick={() => setState((s) => ({ pnBuf: { ...s.pnBuf, [sid]: '' } }))} />
      <Btn icon="x" label="Close" onClick={() => setState({ pnMode: null })} />
    </Bar>
    <div className="pn-body">
      <Chips sid={sid} onPick={openUrl} />
      <pre className="pn-log" tabIndex={0} ref={log}>{text}</pre>
      <motion.div className="pn-in" key={flash} initial={flash ? { backgroundColor: 'rgba(255,255,255,.12)' } : false} animate={{ backgroundColor: 'rgba(0,0,0,0)' }} transition={{ duration: 0.4 }}>
        <span>&gt;</span>
        <input ref={input} type="text" placeholder="Run a command" spellCheck={false} autoComplete="off" aria-label="Terminal input" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={key} />
      </motion.div>
    </div>
  </>);
}
