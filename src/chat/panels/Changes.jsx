import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call, useIpcEvent } from '../../api.js';
import { setState } from '../../store.js';
import { ease } from '../../motion.js';
import { Bar, Sub, Btn } from './ui.jsx';

function Row({ f }) {
  const [open, setOpen] = useState(false);
  const i = f.file.lastIndexOf('/');
  const lines = f.diff ? f.diff.split('\n') : null;
  return (
    <div>
      <button className="pn-row" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="st">{f.status}</span>
        <span className="nm">{f.file.slice(i + 1)}{i > 0 && <small>{f.file.slice(0, i)}</small>}</span>
        <span className="ct"><span className="pn-add">+{f.add}</span> <span className="pn-del">−{f.del}</span></span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div style={{ overflow: 'hidden' }} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease }}>
            <div className="pn-diff">
              {lines ? lines.map((l, k) => <div key={k} className={l[0] === '+' ? 'a' : l[0] === '-' ? 'd' : l[0] === '@' ? 'h' : ''}>{l || ' '}</div>) : <div className="h">No text diff</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Changes({ sid, refresh }) {
  const [r, setR] = useState(null);
  const load = useCallback(async () => { if (sid) setR(await call('panel:changes', sid)); }, [sid]);
  useEffect(() => { load(); }, [load, refresh]);
  useIpcEvent('agent:status', (d) => { if (d && d.status == null && d.sid === sid) load(); });
  return (<>
    <Bar title="Changes">
      <Sub>{r && !r.error ? (r.mode === 'git' ? 'git' : 'since first run') : ''}</Sub>
      <Btn icon="reload" label="Refresh" onClick={load} />
      <Btn icon="x" label="Close" onClick={() => setState({ pnMode: null })} />
    </Bar>
    <div className="pn-body"><div className="pn-list">
      {r?.error ? <div className="pn-empty">{r.error}</div>
        : r && !r.files.length ? <div className="pn-empty">{r.fresh ? 'Tracking changes from now' : 'No changes'}</div>
        : r?.files.map((f) => <Row key={f.file} f={f} />)}
    </div></div>
  </>);
}
