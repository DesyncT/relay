import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';
import { usd, dayLabel, ucol } from './util.jsx';
import { ease } from '../../motion.js';
import RangeTabs from './RangeTabs.jsx';

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
const MODE_NOUN = { daily: 'Daily', weekly: 'Weekly', cumulative: 'Cumulative' };
function series(all, days, accountCostDays, tools, mode) { // points: {i: day index, d: date, v: {tool: n}, a: allocated}
  const day = (d) => Object.fromEntries(tools.map((k) => [k, (days[d] || {})[k] || 0]));
  if (mode === 'daily') return all.map((d, i) => ({ i, d, v: day(d), a: accountCostDays[d] || 0 }));
  if (mode === 'cumulative') {
    const run = Object.fromEntries(tools.map((k) => [k, 0])); let a = 0;
    return all.map((d, i) => { const v = day(d); tools.forEach((k) => run[k] += v[k]); a += accountCostDays[d] || 0; return { i, d, v: { ...run }, a }; });
  }
  const out = []; // ISO weeks, Monday start; first point is the first day shown
  all.forEach((d, i) => {
    let p = out.at(-1);
    if (!p || new Date(d).getUTCDay() === 1) out.push(p = { i, d, v: Object.fromEntries(tools.map((k) => [k, 0])), a: 0 });
    const v = day(d); tools.forEach((k) => p.v[k] += v[k]); p.a += accountCostDays[d] || 0;
  });
  return out;
}
const FX = { fontSize: 13, fill: '#85858b', fontFamily: 'inherit' };

export default function Chart({ days, tools, accountCostDays = {} }) {
  const box = useRef(null), tipRef = useRef(null);
  const reduced = useReducedMotion();
  const [W, setW] = useState(900), [hover, setHover] = useState(null), [mode, setMode] = useState('daily'), [span, setSpan] = useState('all');
  const tipX = useMotionValue(0), sx = useSpring(tipX, { stiffness: 600, damping: 40 });

  useEffect(() => { // debounced width, like the legacy ResizeObserver
    let t; const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { const w = box.current?.clientWidth; if (w) setW(w); }, 120); });
    ro.observe(box.current); if (box.current.clientWidth) setW(box.current.clientWidth);
    return () => { clearTimeout(t); ro.disconnect(); };
  }, []);

  const now = new Date(), start = new Date(now.getFullYear(), span === 'year' ? 0 : now.getMonth(), span === 'year' ? 1 : span === 'month' ? 1 : now.getDate());
  if (span === 'week') start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const dateKey = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  const keys = Object.keys(days).filter(d => span === 'all' || (d >= dateKey(start) && d <= dateKey(now))).sort();

  const all = [];
  for (let t = Date.parse(keys[0]); t <= Date.parse(keys.at(-1)); t += 864e5) all.push(new Date(t).toISOString().slice(0, 10));
  const pts = series(all, days, accountCostDays, tools, mode);
  const peak = Math.max(1, ...pts.map((p) => Math.max(0, ...Object.values(p.v))));
  const step = niceStep(peak), max = step * 4;
  const H = W <= 900 ? 300 : 260, L = 84, R = 8, T = 8, B = 32, pw = W - L - R, ph = H - T - B;
  const x = (i) => L + (all.length < 2 ? pw / 2 : i / (all.length - 1) * pw), y = (v) => T + ph - v / max * ph;
  const ticks = pts.length < 3 ? pts.map((_, k) => k) : [0, Math.floor(pts.length / 2), pts.length - 1];

  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect(), vx = (e.clientX - r.left) * W / r.width;
    const di = (vx - L) / pw * (all.length - 1) || 0;
    const k = pts.reduce((b, p, j) => Math.abs(p.i - di) < Math.abs(pts[b].i - di) ? j : b, 0), p = pts[k];
    const left = x(p.i) * r.width / W + 12, tw = tipRef.current?.offsetWidth || 0;
    tipX.set(left + tw > r.width ? left - tw - 24 : left);
    setHover({ k, i: p.i, d: p.d });
  };

  const hp = hover && pts[hover.k];
  const spanTotal = keys.reduce((n, d) => n + tools.reduce((v, k) => v + (days[d]?.[k] || 0), 0), 0);
  return (
    <div className="u-chart" ref={box}>
      <div className="usage-chart-title"><h3>Estimated {mode} API cost</h3><span className="usage-period-total" aria-label="Selected period total" key={span}>{usd(spanTotal)} <small>in selected period</small></span></div>
      <div className="u-chart-head"><label className="u-timespan">Time span <select aria-label="Time span" value={span} onChange={e => { setHover(null); setSpan(e.target.value); }}><option value="week">This week</option><option value="month">This month</option><option value="year">This year</option><option value="all">All time</option></select></label><RangeTabs label="Cost range" value={mode} onChange={(m) => { setHover(null); setMode(m); }} /></div>
      {!keys.length ? <p className="dim">No usage in this time span.</p> : <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${MODE_NOUN[mode]} estimated cost by provider, including allocated account-only estimates`} onMouseMove={move} onMouseLeave={() => setHover(null)}>
        <AnimatePresence initial={false}>
          <motion.g key={mode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            {[0, 1, 2, 3, 4].map((t) => (
              <g key={t}><line x1={L} x2={W - R} y1={y(step * t)} y2={y(step * t)} stroke="#1f1f1f" /><text x={L - 12} y={y(step * t) + 4} {...FX} textAnchor="end">{t ? usd(step * t) : '0'}</text></g>
            ))}
            {[...tools].reverse().map((tool, k) => {
              const line = pts.length > 1 ? mono(pts.map((p) => [x(p.i), y(p.v[tool])])) : '', c = ucol(tool), gid = `cg-${tool.replace(/\W/g, '')}`;
              if (!line) return pts.length === 1 ? <circle key={tool} cx={x(pts[0].i)} cy={y(pts[0].v[tool])} r={3} fill={c} /> : null;
              return (
                <g key={tool}>
                  <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".22" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
                  <motion.path d={`${line} L${x(pts.at(-1).i)},${y(0)} L${x(pts[0].i)},${y(0)} Z`} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 + k * 0.1 }} />
                  <motion.path d={line} fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease, delay: k * 0.1 }} />
                </g>
              );
            })}
            {ticks.map((k) => <text key={k} x={x(pts[k].i)} y={H - 8} {...FX} textAnchor={k === 0 ? 'start' : k === pts.length - 1 && pts.length > 1 && mode !== 'weekly' ? 'end' : 'middle'}>{dayLabel(pts[k].d).toUpperCase()}</text>)}
          </motion.g>
        </AnimatePresence>
        {hp && tools.map(tool => <circle key={tool} cx={x(hp.i)} cy={y(hp.v[tool])} r="4" fill={ucol(tool)} stroke="var(--bg)" strokeWidth="2" />)}
        {hover && <line y1={T} y2={T + ph} x1={x(hover.i)} x2={x(hover.i)} stroke="#444" />}
      </svg>}
      {hp && (
        <motion.div className="u-tip" ref={tipRef} style={{ display: 'block', left: 0, top: 56, x: sx, animation: 'none' }}>
          <div className="muted">{mode === 'weekly' ? `Week of ${dayLabel(hp.d)}` : mode === 'cumulative' ? `Total through ${dayLabel(hp.d)}` : dayLabel(hp.d)}</div>
          {tools.map((k) => <div key={k}><span className="dot" style={{ background: ucol(k) }} /> {k} <b>{usd(hp.v[k])}</b></div>)}
          {hp.a > 0 && <div className="muted">Includes {usd(hp.a)} allocated Codex estimate</div>}
        </motion.div>
      )}
    </div>
  );
}
