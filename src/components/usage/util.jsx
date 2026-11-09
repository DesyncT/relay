import { useEffect, useState } from 'react';
import { LOGOS } from './logos.js';

export const usd = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const short = (n) => n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
export const sh = (n) => short(n).replace(/\.0(?=[BMK])/, '');
export const ftok = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
export const fmtLeft = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };
export const dayLabel = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const pct = (v, of) => of ? (v / of * 100).toFixed(1) + '%' : '0%';

const UC = { 'Claude Code': 'var(--claude)', Codex: 'var(--codex)', Antigravity: 'var(--antigravity)', antigravity: 'var(--antigravity)', claude: 'var(--claude)', codex: 'var(--codex)' };
export const ucol = (k) => UC[k] || (String(k).toLowerCase().includes('antigravity') ? 'var(--antigravity)' : '#85858b');
const FILL = { claude: '#D97757', openai: '#fff', anthropic: '#fff', antigravity: '#4E88F5', generic: '#85858b' };
const brandOf = (m) => /^anthropic\//i.test(m) ? 'anthropic' : /^claude/i.test(m) ? 'claude' : /^(gemini|antigravity)/i.test(m) ? 'antigravity' : /^(gpt|o[134]\b|o[134]-|codex)/i.test(m) ? 'openai' : 'generic';
export const Logo = ({ name, size = 16, color = 'currentColor' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden="true" style={{ flex: 'none' }}><path d={LOGOS[name] || LOGOS.generic} /></svg>
);
export const ModelIcon = ({ m }) => { const b = brandOf(m); return <Logo name={b} size={20} color={FILL[b]} />; };
export const ToolIcon = ({ k }) => <ModelIcon m={k === 'Claude Code' ? 'claude' : k === 'Codex' ? 'codex' : k} />;

// Always display the current total, including during background refreshes.
export function CountUp({ value, format = String }) {
  return <span>{format(value)}</span>;
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
