import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { springSoft } from '../../motion.js';
import { call, useIpcEvent } from '../../api.js';
import { setState } from '../../store.js';
import { Bar, Sub, Btn } from './ui.jsx';

const when = (at) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Checkpoints({ sid, refresh }) {
  const [list, setList] = useState(null), [ask, setAsk] = useState(null), [err, setErr] = useState('');
  const load = useCallback(() => { if (sid) call('checkpoints:list', sid).then((r) => setList(r)).catch(() => setList([])); }, [sid]);
  useEffect(() => { load(); }, [load, refresh]);
  useIpcEvent('checkpoint:update', (d) => { if (d?.sid === sid) load(); });
  const items = Array.isArray(list) ? list : list?.items || [];
  const rows = [...items].sort((a, b) => b.at - a.at);
  const restore = async () => { try { await call('checkpoints:restore', sid, ask.id); setAsk(null); setErr(''); load(); } catch (e) { setErr(e.message || 'Restore failed'); } };
  return (<>
    <Bar title="Checkpoints">
      <Sub>{rows.length ? rows.length + ' saved' : ''}</Sub>
      <Btn icon="reload" label="Refresh" onClick={load} />
      <Btn icon="x" label="Close" onClick={() => setState({ pnMode: null })} />
    </Bar>
    <div className="pn-body"><div className="pn-list">
      {ask && <div className="cp-ask" role="alertdialog" aria-label="Confirm rewind">Restore files to before this turn? Current uncommitted changes will be overwritten.
        <div><button type="button" className="pn-btn" onClick={restore}>Rewind</button><button type="button" className="pn-btn" onClick={() => setAsk(null)}>Cancel</button></div></div>}
      {err && <div className="pn-empty" role="alert">{err}</div>}
      {list === null ? null : list?.git === false ? <div className="pn-empty">Checkpoints need a git project</div>
        : !rows.length ? <div className="pn-empty">No checkpoints yet. One is saved before each turn.</div>
        : <AnimatePresence initial>{rows.map((c) => <motion.div key={c.id} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={springSoft} className="cp-row"><div className="cp-m"><div className="cp-l" title={c.label}>{c.label || 'Turn'}</div><small>{when(c.at)}{c.who ? ' · @' + c.who : ''}</small></div><button type="button" className="pn-btn" onClick={() => setAsk(c)}>Rewind</button></motion.div>)}</AnimatePresence>}
    </div></div>
  </>);
}
