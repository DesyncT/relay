import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { usd, dayLabel, ucol } from './util.jsx';
import { ease } from '../../motion.js';

function niceStep(max) { // 1, 2, 2.5 or 5 times a power of ten, so axis labels read as round numbers
  const raw = Math.max(Number.MIN_VALUE, max / 4), p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
}
function mono(pts) { // Fritsch-Carlson monotone cubic: no overshoot, so flat zero days stay at zero
  const n = pts.length, h = [], d = [], m = [];
  for (let i = 0; i < n - 1; i++) { h[i] = pts[i + 1][0] - pts[i][0]; d[i] = (pts[i + 1][1] - pts[i][1]) / h[i]; }
  m[0] = d[0] || 0; m[n - 1] = d[n - 2] || 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let p = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) p += ` C${pts[i][0] + h[i] / 3},${pts[i][1] + m[i] * h[i] / 3} ${pts[i + 1][0] - h[i] / 3},${pts[i + 1][1] - m[i + 1] * h[i] / 3} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  return p;
}
const FX = { fontSize: 13, fill: '#85858b', fontFamily: 'inherit' };

export default function Chart({ days, tools }) {
  const box = useRef(null), tipRef = useRef(null);
  const [W, setW] = useState(900), [hover, setHover] = useState(null);
  const tipX = useMotionValue(0), sx = useSpring(tipX, { stiffness: 600, damping: 40 });

  useEffect(() => { // debounced width, like the legacy ResizeObserver
    let t; const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { const w = box.current?.clientWidth; if (w) setW(w); }, 120); });
    ro.observe(box.current); if (box.current.clientWidth) setW(box.current.clientWidth);
    return () => { clearTimeout(t); ro.disconnect(); };
  }, []);

  const keys = Object.keys(days).sort();
  if (!keys.length) return <div className="u-chart" ref={box}><p className="dim">No sessions found yet</p></div>;
  const all = [];
  for (let t = Date.parse(keys[0]); t <= Date.parse(keys.at(-1)); t += 864e5) all.push(new Date(t).toISOString().slice(0, 10));
  const peak = Math.max(1, ...all.map((d) => Math.max(0, ...Object.values(days[d] || {}))));
  const step = niceStep(peak), max = step * 4;
  const H = W <= 900 ? 300 : 260, L = 84, R = 8, T = 8, B = 32, pw = W - L - R, ph = H - T - B;
  const x = (i) => L + (all.length < 2 ? pw / 2 : i / (all.length - 1) * pw), y = (v) => T + ph - v / max * ph;
  const ticks = all.length < 3 ? [0, all.length - 1] : [0, Math.floor(all.length / 2), all.length - 1];

  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect(), vx = (e.clientX - r.left) * W / r.width;
    const i = Math.max(0, Math.min(all.length - 1, Math.round((vx - L) / pw * (all.length - 1) || 0)));
    const left = x(i) * r.width / W + 12, tw = tipRef.current?.offsetWidth || 0;
    tipX.set(left + tw > r.width ? left - tw - 24 : left);
    setHover({ i, d: all[i] });
  };

  return (
    <div className="u-chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily cost by tool" onMouseMove={move} onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((t) => (
          <g key={t}><line x1={L} x2={W - R} y1={y(step * t)} y2={y(step * t)} stroke="#1f1f1f" /><text x={L - 12} y={y(step * t) + 4} {...FX} textAnchor="end">{t ? usd(step * t) : '0'}</text></g>
        ))}
        {[...tools].reverse().map((tool, k) => {
          const line = mono(all.map((d, i) => [x(i), y((days[d] || {})[tool] || 0)])), c = ucol(tool);
          return (
            <g key={tool}>
              <motion.path d={`${line} L${x(all.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={c} initial={{ opacity: 0 }} animate={{ opacity: 0.1 }} transition={{ duration: 0.6, delay: 0.5 + k * 0.1 }} />
              <motion.path d={line} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease, delay: k * 0.1 }} />
            </g>
          );
        })}
        {ticks.map((i) => <text key={i} x={x(i)} y={H - 8} {...FX} textAnchor={i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'middle'}>{dayLabel(all[i]).toUpperCase()}</text>)}
        {hover && <line y1={T} y2={T + ph} x1={x(hover.i)} x2={x(hover.i)} stroke="#444" />}
      </svg>
      {hover && (
        <motion.div className="u-tip" ref={tipRef} style={{ display: 'block', left: 0, top: 16, x: sx, animation: 'none' }}>
          <div className="muted">{dayLabel(hover.d)}</div>
          {tools.map((k) => <div key={k}><span className="dot" style={{ background: ucol(k) }} /> {k} <b>{usd((days[hover.d] || {})[k] || 0)}</b></div>)}
        </motion.div>
      )}
    </div>
  );
}
