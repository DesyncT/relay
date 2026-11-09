import { LOGOS } from '../usage/logos.js';
export default function Logo({ name, size = 16, color = 'currentColor' }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden="true" style={{ flex: 'none' }}><path d={LOGOS[name] || LOGOS.generic} /></svg>;
}
export const logoColor = (n) => n === 'claude' ? '#D97757' : n === 'antigravity' ? '#4E88F5' : '#fff';
