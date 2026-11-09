import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView } from 'framer-motion';
import { inline, PLAIN } from './inline.jsx';

// Model-emitted visual blocks (chart / stats / steps / compare). parseViz() validates and caps sizes; null means "show as code".
const MAX_POINTS = 200, MAX_SERIES = 6, MAX_ITEMS = 24;
const str = (v, n = 80) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, n) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
const COLORS = ['var(--claude)', 'var(--codex)', 'var(--antigravity)', 'var(--text-2)', 'var(--muted)', 'var(--line-strong)'];
const col = (i) => COLORS[i % COLORS.length];

export function parseViz(lang, code) {
  if (!['chart', 'stats', 'steps', 'compare'].includes(lang)) return null;
  let d;
  try { d = JSON.parse(code); } catch { return null; }
  try {
    if (lang === 'chart') {
      if (!d || !['bar', 'line', 'area', 'donut'].includes(d.type) || !Array.isArray(d.series) || !d.series.length) return null;
      const series = d.series.slice(0, d.type === 'donut' ? 1 : MAX_SERIES).map((s, i) => ({ name: str(s?.name, 40) || 'Series ' + (i + 1), data: (Array.isArray(s?.data) ? s.data : []).slice(0, MAX_POINTS).map(num) })).filter((s) => s.data.length && s.data.every((v) => v !== null));
      if (!series.length) return null;
      const n = Math.max(...series.map((s) => s.data.length));
      const labels = Array.from({ length: n }, (_, i) => str(d.labels?.[i], 24) || String(i + 1));
      if (d.type === 'donut' && (series[0].data.some((v) => v < 0) || !series[0].data.some((v) => v > 0))) return null;
      return { kind: 'chart', type: d.type, title: str(d.title, 100), unit: str(d.unit, 6), labels, series };
    }
    if (!Array.isArray(d) && lang !== 'compare') return null;
    if (lang === 'stats') {
      const items = d.slice(0, 8).map((x) => ({ label: str(x?.label, 40), value: str(x?.value, 24), delta: str(x?.delta, 16) })).filter((x) => x.label && x.value);
      return items.length ? { kind: 'stats', items } : null;
    }
    if (lang === 'steps') {
      const items = d.slice(0, 30).map((x) => ({ title: str(x?.title, 120), body: str(x?.body, 400), status: ['done', 'active', 'todo'].includes(x?.status) ? x.status : 'todo' })).filter((x) => x.title);
      return items.length ? { kind: 'steps', items } : null;
    }
    // compare: {left,right} | {before,after} | {pros,cons}; each side is {title,items[]} or a bare string array
    const pair = d.left ? ['left', 'right'] : d.before ? ['before', 'after'] : ['pros', 'cons'];
    const side = (v, t) => { const o = Array.isArray(v) ? { items: v } : v; const items = (Array.isArray(o?.items) ? o.items : []).slice(0, MAX_ITEMS).map((x) => str(x, 200)).filter(Boolean); return { title: str(o?.title, 40) || t, items }; };
    const cap = (s) => s[0].toUpperCase() + s.slice(1), a = side(d[pair[0]], cap(pair[0])), b = side(d[pair[1]], cap(pair[1]));
    return a.items.length || b.items.length ? { kind: 'compare', a, b, tone: pair[0] === 'pros' } : null;
  } catch { return null; }
}

// ---------- formatting / scales ----------
const PRE = ['$', '€', '£', '¥'];
function fmt(v, unit) {
  const a = Math.abs(v);
  let s = a >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : a >= 1e4 ? (v / 1e3).toFixed(1) + 'k' : String(+v.toFixed(2));
  s = s.replace(/\.0(?=[kMB]|$)/, '');
  return PRE.includes(unit) ? (v < 0 ? '-' : '') + unit + s.replace('-', '') : unit ? s + (/^[%°]/.test(unit) ? '' : ' ') + unit : s;
}
function scale(lo, hi) { // nice 0-based ticks
  lo = Math.min(0, lo); hi = Math.max(0, hi); if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / 4, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, ticks = [];
  for (let t = a; t <= b + step / 2; t += step) ticks.push(+t.toFixed(10));
  return { a, b, ticks };
}

// ---------- chart ----------
const W = 560, H = 240, PL = 46, PR = 12, PT = 12, PB = 28;
function Legend({ items, hi, setHi }) {
  return <ul className="rt-leg">{items.map((it, i) => <li key={i} className={hi === i ? 'on' : ''} onMouseEnter={() => setHi?.(i)} onMouseLeave={() => setHi?.(null)}><i style={{ background: col(i) }} />{it}</li>)}</ul>;
}

function Donut({ v, on }) {
  const [hi, setHi] = useState(null);
  const data = v.series[0].data, total = data.reduce((s, x) => s + x, 0), R = 62, C = 100;
  let acc = 0;
  const arcs = data.map((x, i) => {
    const a0 = (acc / total) * 360 - 90, a1 = ((acc + x) / total) * 360 - 90; acc += x;
    const gap = data.length > 1 ? 1.2 : 0, s = a0 + gap, e = Math.max(s + 0.2, Math.min(a1 - gap, s + 359.9)), p = (a) => [C + R * Math.cos((a * Math.PI) / 180), C + R * Math.sin((a * Math.PI) / 180)];
    const [x0, y0] = p(s), [x1, y1] = p(e);
    return { d: `M${x0} ${y0}A${R} ${R} 0 ${e - s > 180 ? 1 : 0} 1 ${x1} ${y1}`, i, x };
  }).filter((a) => a.x > 0);
  const cur = hi != null ? { l: v.labels[hi], t: fmt(data[hi], v.unit), s: Math.round((data[hi] / total) * 100) + '%' } : { l: 'Total', t: fmt(total, v.unit), s: '' };
  return (
    <div className="rt-donut">
      <svg viewBox="0 0 200 200" role="img" aria-label={v.title || 'Donut chart'}>
        {arcs.map((a) => (
          <motion.path key={a.i} d={a.d} fill="none" stroke={col(a.i)} strokeWidth={hi === a.i ? 30 : 26} strokeLinecap="butt" initial={{ pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: on ? 1 : 0, opacity: on ? (hi == null || hi === a.i ? 1 : 0.4) : 0.4 }} transition={{ pathLength: { duration: 0.8, delay: a.i * 0.12, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.2 }, strokeWidth: { duration: 0.15 } }}
            onMouseEnter={() => setHi(a.i)} onMouseLeave={() => setHi(null)} />
        ))}
        <text x="100" y="96" textAnchor="middle" className="rt-dv">{cur.t}</text>
        <text x="100" y="114" textAnchor="middle" className="rt-dl">{cur.l}{cur.s ? ' · ' + cur.s : ''}</text>
      </svg>
      <Legend items={v.labels.slice(0, data.length).map((l, i) => `${l}  ${Math.round((data[i] / total) * 100)}%`)} hi={hi} setHi={setHi} />
    </div>
  );
}

function XY({ v, on }) {
  const [hov, setHov] = useState(null), [hs, setHs] = useState(null);
  const all = v.series.flatMap((s) => s.data), { a, b, ticks } = scale(Math.min(...all), Math.max(...all));
  const n = v.labels.length, pw = W - PL - PR, ph = H - PT - PB, gw = pw / n;
  const y = (x) => PT + ph - ((x - a) / (b - a)) * ph, cx = (i) => PL + (i + 0.5) * gw, y0 = y(0);
  const skip = Math.ceil(n / Math.max(2, Math.floor(pw / 56)));
  return (
    <div className="rt-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={v.title || v.type + ' chart'} onMouseLeave={() => setHov(null)}>
        {ticks.map((t) => <g key={t}><line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} className={t === 0 ? 'rt-ax0' : 'rt-gr'} /><text x={PL - 8} y={y(t) + 3.5} textAnchor="end" className="rt-tk">{fmt(t, v.unit)}</text></g>)}
        {v.labels.map((l, i) => i % skip === 0 && <text key={i} x={cx(i)} y={H - 9} textAnchor="middle" className="rt-tk">{l}</text>)}
        {hov != null && <rect x={PL + hov * gw} y={PT} width={gw} height={ph} className="rt-hv" />}
        {v.type === 'bar' && v.series.map((s, si) => {
          const bw = Math.min(34, (gw * 0.72) / v.series.length), x0 = (i) => cx(i) - (bw * v.series.length) / 2 + si * bw;
          return s.data.map((x, i) => (
            <motion.rect key={si + '-' + i} x={x0(i) + 1} width={Math.max(1, bw - 2)} y={Math.min(y(x), y0)} height={Math.max(1, Math.abs(y(x) - y0))} rx={3} fill={col(si)} opacity={hs == null || hs === si ? 1 : 0.3}
              style={{ transformBox: 'fill-box', transformOrigin: x < 0 ? '50% 0%' : '50% 100%' }} initial={{ scaleY: 0 }} animate={{ scaleY: on ? 1 : 0 }} transition={{ duration: 0.6, delay: (i * v.series.length + si) * 0.03, ease: [0.22, 1, 0.36, 1] }} />
          ));
        })}
        {v.type !== 'bar' && v.series.map((s, si) => {
          const d = s.data.map((x, i) => `${i ? 'L' : 'M'}${cx(i)} ${y(x)}`).join('');
          return (
            <g key={si} opacity={hs == null || hs === si ? 1 : 0.3}>
              {v.type === 'area' && <motion.path d={`${d}L${cx(s.data.length - 1)} ${y0}L${cx(0)} ${y0}Z`} fill={col(si)} initial={{ opacity: 0 }} animate={{ opacity: on ? 0.16 : 0 }} transition={{ duration: 0.8, delay: 0.3 }} />}
              <motion.path d={d} fill="none" stroke={col(si)} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: on ? 1 : 0 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: si * 0.1 }} />
              {n <= 40 && s.data.map((x, i) => <motion.circle key={i} cx={cx(i)} cy={y(x)} r={hov === i ? 4.5 : 3} fill="var(--bg)" stroke={col(si)} strokeWidth={2} initial={{ opacity: 0 }} animate={{ opacity: on ? 1 : 0 }} transition={{ delay: 0.5 + (i / n) * 0.6 }} />)}
            </g>
          );
        })}
        {v.labels.map((l, i) => <rect key={i} x={PL + i * gw} y={PT} width={gw} height={ph} fill="transparent" onMouseEnter={() => setHov(i)} />)}
      </svg>
      {hov != null && (
        <div className="rt-tip" style={{ left: `${(cx(hov) / W) * 100}%` }}>
          <b>{v.labels[hov]}</b>
          {v.series.map((s, si) => s.data[hov] != null && <div key={si}><i style={{ background: col(si) }} />{v.series.length > 1 && <span>{s.name}</span>}{fmt(s.data[hov], v.unit)}</div>)}
        </div>
      )}
      {v.series.length > 1 && <Legend items={v.series.map((s) => s.name)} hi={hs} setHi={setHs} />}
    </div>
  );
}

function Chart({ v }) {
  const ref = useRef(null), on = useInView(ref, { once: true, margin: '0px 0px -30px 0px' });
  return (
    <figure className="rt-viz rt-chart" ref={ref}>
      {v.title && <figcaption>{v.title}</figcaption>}
      {v.type === 'donut' ? <Donut v={v} on={on} /> : <XY v={v} on={on} />}
    </figure>
  );
}

// ---------- stats ----------
function Count({ value, on }) {
  const m = /^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/.exec(value), [txt, setTxt] = useState(m ? m[1] + '0' + m[3] : value);
  useEffect(() => {
    if (!m || !on) return;
    const to = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length, grp = m[2].includes(',');
    const c = animate(0, to, { duration: 1, ease: [0.22, 1, 0.36, 1], onUpdate: (x) => setTxt(m[1] + x.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: grp }) + m[3]) });
    return () => c.stop();
  }, [on, value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span aria-label={value}>{txt}</span>;
}
function Stats({ v }) {
  const ref = useRef(null), on = useInView(ref, { once: true });
  return (
    <div className="rt-viz rt-stats" ref={ref}>
      {v.items.map((s, i) => (
        <motion.div key={i} className="rt-stat" initial={{ opacity: 0, y: 8 }} animate={{ opacity: on ? 1 : 0, y: on ? 0 : 8 }} transition={{ duration: 0.4, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}>
          <div className="rt-sl">{s.label}</div>
          <div className="rt-sv"><Count value={s.value} on={on} /></div>
          {s.delta && <div className={'rt-sd ' + (/^[-−]/.test(s.delta) ? 'dn' : /^\+/.test(s.delta) ? 'up' : '')}>{s.delta}</div>}
        </motion.div>
      ))}
    </div>
  );
}

// ---------- steps ----------
const TICK = 'm5 12 4 4L19 6';
function Steps({ v }) {
  const ref = useRef(null), on = useInView(ref, { once: true, margin: '0px 0px -30px 0px' });
  return (
    <ol className="rt-viz rt-steps" ref={ref}>
      {v.items.map((s, i) => (
        <motion.li key={i} className={"st-"+s.status} initial={{ opacity: 0, x: -8 }} animate={{ opacity: on ? 1 : 0, x: on ? 0 : -8 }} transition={{ duration: 0.4, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}>
          <span className="rt-dot" aria-hidden="true">{s.status === 'done' ? <svg viewBox="0 0 24 24"><path d={TICK} /></svg> : s.status === 'active' ? <i /> : null}</span>
          {i < v.items.length - 1 && <motion.span className="rt-rail" aria-hidden="true" initial={{ scaleY: 0 }} animate={{ scaleY: on ? 1 : 0 }} transition={{ duration: 0.4, delay: i * 0.08 + 0.15 }} />}
          <div className="rt-st"><b>{s.title}</b><span className="sr-only"> ({s.status})</span>{s.body && <p>{inline(s.body, PLAIN)}</p>}</div>
        </motion.li>
      ))}
    </ol>
  );
}

// ---------- compare ----------
function Compare({ v }) {
  const ref = useRef(null), on = useInView(ref, { once: true });
  const col2 = (s, k) => (
    <motion.div className={'rt-side rt-' + k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: on ? 1 : 0, y: on ? 0 : 8 }} transition={{ duration: 0.4, delay: k === 'a' ? 0 : 0.1, ease: [0.22, 1, 0.36, 1] }}>
      <h4>{s.title}</h4>
      <ul>{s.items.map((t, i) => <li key={i}><svg viewBox="0 0 24 24" aria-hidden="true">{v.tone ? <path d={k === 'a' ? TICK : 'M6 6l12 12M18 6 6 18'} /> : <path d="M5 12h14" />}</svg><span>{inline(t, PLAIN)}</span></li>)}</ul>
    </motion.div>
  );
  return <div className={'rt-viz rt-compare' + (v.tone ? ' pc' : '')} ref={ref}>{col2(v.a, 'a')}{col2(v.b, 'b')}</div>;
}

export function Viz({ v }) {
  return v.kind === 'chart' ? <Chart v={v} /> : v.kind === 'stats' ? <Stats v={v} /> : v.kind === 'steps' ? <Steps v={v} /> : <Compare v={v} />;
}
