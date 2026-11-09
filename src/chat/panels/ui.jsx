import { motion } from 'framer-motion';
import { fmtSize } from '../panelsApi.js';

const IC = {
  term: <><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></>,
  diff: <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M12 8v6M9 11h6M9 17h6" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>,
  folder: <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  file: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></>,
  img: <><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>,
  back: <path d="m15 18-6-6 6-6" />, fwd: <path d="m9 18 6-6-6-6" />, down: <path d="m6 9 6 6 6-6" />, right: <path d="m9 18 6-6-6-6" />,
  reload: <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />, ext: <><path d="M15 3h6v6M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  max: <><path d="m15 15 6 6M15 9l6-6M9 15l-6 6M9 9 3 3" /><path d="M21 16v5h-5M21 8V3h-5M3 16v5h5M3 8V3h5" /></>,
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />,
};
export const Icon = ({ n, cls = 'pn-i' }) => (
  <svg viewBox="0 0 24 24" className={cls} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{IC[n]}</svg>
);
export const Btn = ({ icon, label, onClick, disabled }) => (
  <motion.button className="pn-b" type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} whileTap={{ scale: 0.9 }}>
    <Icon n={icon} />
  </motion.button>
);
export const Bar = ({ title, children }) => <div className="pn-bar">{title != null && <h3>{title}</h3>}{children}</div>;
export const Sub = ({ children }) => <div className="pn-sub">{children}</div>;
export const CodeView = ({ text }) => {
  const n = text.split('\n').length;
  return <div className="pn-code"><div className="g">{Array.from({ length: n }, (_, i) => i + 1).join('\n')}</div><div className="c">{text}</div></div>;
};
export const OtherCard = ({ r, onOpen }) => (
  <div className="pn-pv"><div>{r.name} · {fmtSize(r.size)}</div><button className="pn-btn" type="button" onClick={onOpen}>Open externally</button></div>
);
