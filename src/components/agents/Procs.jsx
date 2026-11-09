import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call, useIpcEvent } from '../../api.js';
import { spring } from '../../motion.js';

const color = (from) => from.startsWith('claude') ? 'var(--claude)' : from === 'codex' ? 'var(--codex)' : from.startsWith('antigravity') ? 'var(--antigravity)' : 'var(--system)';

export default function Procs() {
  const [list, setList] = useState([]);
  const [, tick] = useState(0);
  useIpcEvent('procs', (l) => setList(l || []));
  useEffect(() => {
    let on = true;
    const poll = () => call('procs:list').then((l) => on && setList(l || [])).catch(() => {});
    poll();
    const t = setInterval(poll, 2000), t2 = setInterval(() => tick((n) => n + 1), 1000);
    return () => { on = false; clearInterval(t); clearInterval(t2); };
  }, []);
  return (
    <div id="procs" className="side-label">
      <AnimatePresence initial={false}>
        {list.map((p) => (
          <motion.div key={p.id} className="proc" layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 40 }} exit={{ opacity: 0, height: 0 }} transition={spring}>
            <span><i className="dot" style={{ background: color(p.label) }} />{p.label}<span className="mono muted">{Math.round((Date.now() - p.started) / 1000)}s</span></span>
            <button className="b ghost danger" onClick={() => call('procs:kill', p.id)}>Stop</button>
          </motion.div>
        ))}
      </AnimatePresence>
      {!list.length && 'Nothing running'}
    </div>
  );
}
