import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { call, useIpcEvent } from '../api.js';
import { setState, useStore } from '../store.js';
import { Icon } from './icons.jsx';
import Sidebar from './Sidebar.jsx';
import { spring } from '../motion.js';
import { useEffect } from 'react';

// Skills lives with Rules, Themes with Settings (legacy TAB_HOME).
export const TAB_HOME = { skills: 'rules', themes: 'settings' };
const TABS = [
  ['usage', 'Usage', <><path d="M3 3v18h18" /><path d="m7 15 4-4 4 3 5-6" /></>],
  ['agents', 'Subagents', <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>],
  ['rules', 'Rules', <><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" /><path d="M14 2v6h6M16 13H8M16 17H8" /></>],
  ['settings', 'Settings', <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />],
];

function UpdatePill() {
  const [u, setU] = useState({ state: 'idle' });
  useEffect(() => { call('update:get').then(setU, () => {}); }, []);
  useIpcEvent('update:state', (d) => setU((p) => ({ ...p, ...d })));
  const show = u.state === 'downloading' || u.state === 'ready';
  const click = () => {
    if (u.state === 'ready') return call('update:install');
    setState({ tab: 'settings' });
    setTimeout(() => document.getElementById('set-updates')?.scrollIntoView({ block: 'start' }), 100);
  };
  return (
    <AnimatePresence>
      {show && (
        <motion.button id="updPill" key="upd" className={u.state === 'ready' ? 'ready' : ''} title="Open Settings > Updates" onClick={click}
          initial={{ opacity: 0, y: 8, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={spring}>
          {u.state === 'ready' ? `Restart to update v${u.version}` : `Update v${u.version} available · ${u.percent || 0}%`}
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export default function Nav() {
  const tab = useStore((s) => s.tab);
  const home = TAB_HOME[tab] || tab;
  const stats = useStore((s) => s.navStats);
  return (
    <nav aria-label="Sections">
      {TABS.map(([id, label, icon]) => (
        <button key={id} data-tab={id} className={home === id ? 'on' : ''} onClick={() => setState({ tab: id })} aria-current={home === id ? 'page' : undefined}>
          {home === id && <motion.span  className="nav-pill" transition={spring} />}
          <Icon>{icon}</Icon><span>{label}</span>
        </button>
      ))}
      <Sidebar />
      <div className="foot" id="navFoot"><span id="navStats">{stats}</span><UpdatePill /></div>
    </nav>
  );
}
