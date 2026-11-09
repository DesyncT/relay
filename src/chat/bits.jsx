import { LOGOS } from '../components/usage/logos.js';
import { useStore } from '../store.js';
import { fileUrl } from './md.js';

export const Logo = ({ name, size = 16, color = 'currentColor' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden="true" style={{ flex: 'none' }}><path d={LOGOS[name] || LOGOS.generic} /></svg>
);
export const provLogo = (p, size = 14) => <Logo name={p === 'codex' ? 'openai' : p} size={size} color={p === 'antigravity' ? '#4E88F5' : p === 'claude' ? '#D97757' : '#fff'} />;
export const Pair = ({ size = 18 }) => <img className="pair-mark" src="assets/relay.svg" alt="" style={{ width: size, height: size, display: 'inline-block', verticalAlign: 'middle' }} />;
export const Ico = ({ d, size, children, ...p }) => <svg className="i" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...p}>{d ? <path d={d} /> : children}</svg>;
export const CARET = 'm9 6 6 6-6 6';
export const FileIco = () => <Ico><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" /><path d="M14 2v6h6" /></Ico>;
// text goes through md() (escapes first) before it gets here
export const Html = ({ html, className }) => <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;

const short = (m) => { m = String(m || ''); const x = /^claude-([a-z]+)/.exec(m) || /^gpt-[\d.]+-([a-z]+)/.exec(m) || /^gemini-[\d.]+-([a-z]+)/.exec(m); return x ? x[1] : m; };
export function RtBadge({ model, effort }) { // RoutingUI.badge
  if (!model && !effort) return <span />;
  const n = short(model);
  return <span className="rt-chip" title={[model, effort && effort + ' effort'].filter(Boolean).join(', ')}>{n ? n[0].toUpperCase() + n.slice(1) : ''}{effort && <i>{effort}</i>}</span>;
}

const USER_SVG = <svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
export function Avatar({ from, sm, via, provider }) {
  const profile = useStore((s) => s.profile);
  const k = from === 'user' ? 'user' : provider || via || (from.startsWith('claude') ? 'claude' : from.startsWith('antigravity') ? 'antigravity' : from);
  const covering = k === 'codex' && from.startsWith('claude');
  const inner = k === 'user' ? (profile.avatar ? <img src={profile.avatar} alt="" /> : USER_SVG)
    : k === 'auto' ? <Pair size="100%" /> : k === 'claude' ? <Logo name="claude" size="100%" /> : k === 'codex' ? <Logo name="openai" size="100%" /> : k === 'antigravity' ? <Logo name="antigravity" size="100%" /> : null;
  return <span className={`av ${k}${covering ? ' covering' : ''}${sm ? ' sm' : ''}`} title={covering ? 'Codex covering for Claude' : k === 'codex' ? 'Codex' : k === 'antigravity' ? 'Antigravity' : k === 'claude' ? 'Claude' : ''}>{inner}</span>;
}

export { openFile } from './panelsApi.js';
export { fileUrl };
