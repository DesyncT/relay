import { motion } from 'framer-motion';
import { setState, useStore } from '../store.js';
import { Icon } from './icons.jsx';
import { spring } from '../motion.js';

const TABS = [
  ['usage', 'Usage', <><path d="M3 3v18h18" /><path d="m7 15 4-4 4 3 5-6" /></>],
  ['agents', 'Subagents', <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>],
  ['rules', 'Rules', <><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" /><path d="M14 2v6h6M16 13H8M16 17H8" /></>],
  ['settings', 'Settings', <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />],
];

// Sidebar (session list) and the footer update pill are ported by their own tasks and slot in here.
export default function Nav({ children }) {
  const tab = useStore((s) => s.tab);
  return (
    <nav aria-label="Sections">
      <div className="brand" id="brand">Relay</div>
      {TABS.map(([id, label, icon]) => (
        <button key={id} className={tab === id ? 'on' : ''} onClick={() => setState({ tab: id })} aria-current={tab === id ? 'page' : undefined}>
          {tab === id && <motion.span layoutId="nav-pill" className="nav-pill" transition={spring} />}
          <Icon>{icon}</Icon>{label}
        </button>
      ))}
      {children}
    </nav>
  );
}
