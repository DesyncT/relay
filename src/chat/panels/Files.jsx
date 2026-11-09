import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call } from '../../api.js';
import { getState, setState } from '../../store.js';
import { ease } from '../../motion.js';
import { IMG } from '../panelsApi.js';
import { Bar, Sub, Btn, Icon, CodeView, OtherCard } from './ui.jsx';

function Kids({ sid, rel, depth, onPick }) {
  const [list, setList] = useState(null);
  useEffect(() => { let on = true; call('panel:files:list', sid, rel).then((r) => on && setList(r)); return () => { on = false; }; }, [sid, rel]);
  if (!list) return null;
  if (list.error) return <div className="pn-empty">{list.error}</div>;
  return list.map((e) => <Node key={e.name} sid={sid} onPick={onPick} e={e} p={rel ? rel + '/' + e.name : e.name} depth={depth} />);
}
function Node({ sid, e, p, depth, onPick }) {
  const [open, setOpen] = useState(false);
  const pad = { paddingLeft: 8 + depth * 12 };
  if (!e.dir) return (
    <button className="pn-row" type="button" style={pad} onClick={() => onPick(p)}>
      <Icon n={IMG.test(e.name) ? 'img' : 'file'} /><span className="nm">{e.name}</span>
    </button>
  );
  return (<>
    <button className="pn-row" type="button" style={pad} aria-expanded={open} onClick={() => setOpen(!open)}>
      <motion.span style={{ display: 'flex' }} animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}><Icon n="right" /></motion.span>
      <span className="nm">{e.name}</span>
    </button>
    <AnimatePresence initial={false}>
      {open && <motion.div style={{ overflow: 'hidden' }} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease }}>
        <Kids sid={sid} rel={p} depth={depth + 1} onPick={onPick} />
      </motion.div>}
    </AnimatePresence>
  </>);
}

function Preview({ sid, p, onBack }) {
  const [r, setR] = useState(null);
  const [added, setAdded] = useState(false);
  useEffect(() => { call('panel:file:read', sid, p).then(setR); }, [sid, p]);
  const add = async () => {
    const b = await call('panel:file:b64', sid, p);
    if (!b?.error) document.dispatchEvent(new CustomEvent('panels:attach', { detail: b }));
    setAdded(true);
  };
  let body = null;
  if (r?.error) body = <div className="pn-empty">{r.error}</div>;
  else if (r?.kind === 'image') body = <div className="pn-img"><button className="pn-btn" type="button" onClick={add}>{added ? 'Added' : 'Add to chat'}</button><img src={r.url} alt={r.name} /></div>;
  else if (r?.kind === 'text') body = <CodeView text={r.text} />;
  else if (r) body = <OtherCard r={r} onOpen={() => call('panel:file:open', sid, r.path)} />;
  return (
    <motion.div className="pn-body" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, ease }}>
      <div className="pn-bar"><Btn icon="back" label="Back to files" onClick={onBack} /><div className="pn-sub">{p}</div></div>
      {body}
    </motion.div>
  );
}

export default function Files({ sid, refresh }) {
  const [prev, setPrev] = useState(null);
  useEffect(() => { setPrev(null); }, [sid, refresh]);
  return (<>
    <Bar title="Files">
      <Sub>{getState().sessionCwd || ''}</Sub>
      <Btn icon="reload" label="Refresh" onClick={() => { setPrev(null); setState({ pnRefresh: (getState().pnRefresh || 0) + 1 }); }} />
      <Btn icon="x" label="Close" onClick={() => setState({ pnMode: null })} />
    </Bar>
    {prev == null
      ? <div className="pn-body"><div className="pn-list pn-tree" key={refresh}><Kids sid={sid} rel="" depth={0} onPick={setPrev} /></div></div>
      : <Preview sid={sid} p={prev} onBack={() => setPrev(null)} />}
  </>);
}
