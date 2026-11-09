import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { motion, animate } from 'framer-motion';
import { LOGOS } from './logos.js';
import { spring, ease } from '../../motion.js';

export const Logo = ({ name, size = 14, color = 'currentColor' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden="true" style={{ flex: 'none' }}><path d={LOGOS[name]} /></svg>
);
export const Ico = ({ children }) => <svg className="i" viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
export const Check = () => <span className="ck"><Ico><path d="M20 6 9 17l-5-5" /></Ico></span>;
export const Chev = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
export const XIcon = () => <Ico><path d="M18 6 6 18M6 6l12 12" /></Ico>;
export const FileIcon = () => <Ico><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" /><path d="M14 2v6h6" /></Ico>;

export const PROV = {
  claude: { logo: 'claude', color: '#D97757' },
  codex: { logo: 'openai', color: '#fff' },
  antigravity: { logo: 'antigravity', color: '#4E88F5' },
};
export const ProvLogo = ({ k, size = 14 }) => <Logo name={PROV[k]?.logo || 'claude'} size={size} color={PROV[k]?.color} />;
export const SpreaderIcon = () => (
  <Ico><path d="m18 14 4 4-4 4" /><path d="m18 2 4 4-4 4" /><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" /><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" /><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" /></Ico>
);

export const isImg = (a) => a?.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(a?.name || '');
export const fileUrl = (p) => encodeURI('file:///' + p.replace(/\\/g, '/'));
export const fsize = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
export const ftok = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
export const fcost = (c) => '$' + (c < 0.1 ? c.toFixed(3) : c.toFixed(2));

// Same transient toast the legacy renderer used (#appNotice is styled in workbench.css).
let noticeTimer;
export function notify(text) {
  let n = document.getElementById('appNotice');
  if (!n) { n = document.createElement('div'); n.id = 'appNotice'; n.setAttribute('role', 'status'); document.body.append(n); }
  n.textContent = text; n.hidden = false;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { n.hidden = true; }, 3000);
}

// Popover that scales + fades from its anchor. With anchorRef it positions itself above the anchor inside .cbar
// (port of positionCbarMenu); without it, CSS places it. Arrow keys move focus between items.
export function Pop({ id, name, role = 'menu', label, anchorRef, kb, origin = 'bottom right', className, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const a = anchorRef?.current, m = ref.current, cbar = a?.closest('.cbar');
    if (!a || !m || !cbar) return;
    const cb = cbar.getBoundingClientRect(), ar = a.getBoundingClientRect(), w = m.offsetWidth || 180;
    setPos({
      right: Math.max(8, Math.min(Math.round(cb.right - ar.right), Math.round(cb.width - w - 8))),
      bottom: Math.max(48, Math.round(cb.bottom - ar.top + 6)),
    });
  }, [anchorRef]);
  useEffect(() => { if (kb) ref.current?.querySelector('button.mi')?.focus(); }, [kb]);
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const b = [...ref.current.querySelectorAll('button.mi')], i = b.indexOf(document.activeElement);
    b[(i + (e.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length]?.focus();
  };
  return (
    <motion.div ref={ref} id={id} data-menu={name} role={role} aria-label={label} className={className} onKeyDown={onKeyDown}
      style={{ ...pos, transformOrigin: origin, visibility: anchorRef && !pos ? 'hidden' : undefined }}
      initial={{ opacity: 0, scale: 0.94, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0, transition: spring }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}>
      {children}
    </motion.div>
  );
}

// Spend numbers count up/down to the new total.
const spendTxt = (s) => (s && s.cost > 0 ? `${fcost(s.cost)} · ` : '') + `${ftok(Math.round(s?.tokens || 0))} tokens`;
export function Tween({ tokens, cost }) {
  const ref = useRef(null), prev = useRef({ tokens, cost });
  useLayoutEffect(() => {
    const from = prev.current, to = { tokens, cost };
    ref.current.textContent = spendTxt(from);
    const c = animate(0, 1, { duration: 0.5, ease, onUpdate: (t) => {
      const v = { tokens: from.tokens + (to.tokens - from.tokens) * t, cost: from.cost + (to.cost - from.cost) * t };
      prev.current = v; if (ref.current) ref.current.textContent = spendTxt(v);
    }, onComplete: () => { prev.current = to; if (ref.current) ref.current.textContent = spendTxt(to); } });
    return () => c.stop();
  }, [tokens, cost]);
  return <span className="sn" ref={ref} />;
}
