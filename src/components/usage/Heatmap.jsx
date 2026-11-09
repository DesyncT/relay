import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ftok, dayLabel } from './util.jsx';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MODES = [['daily', 'Daily'], ['weekly', 'Weekly'], ['cumulative', 'Cumulative']];

function build(days, mode) { // trailing 52 weeks, Sunday first
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end); start.setDate(start.getDate() - (52 * 7 - 1));
  const raw = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) raw.push({ date: iso(d), v: days[iso(d)] || 0 });
  let vals = raw.map((x) => x.v);
  if (mode === 'weekly') vals = raw.map((_, i) => raw.slice(Math.max(0, i - 6), i + 1).reduce((n, x) => n + x.v, 0));
  if (mode === 'cumulative') { let c = 0; vals = vals.map((v) => c += v); }
  const max = Math.max(...vals, 1);
  const cells = raw.map((x, i) => ({ date: x.date, v: vals[i] }));
  const months = [];
  for (let w = 0; w * 7 < cells.length; w++) {
    const hit = cells.slice(w * 7, w * 7 + 7).find((c) => c.date.endsWith('-01'));
    months.push(hit ? new Date(hit.date + 'T00:00:00').toLocaleString('en', { month: 'short' }).toLowerCase() : '');
  }
  return { cells, max, months };
}

export default function Heatmap({ days }) {
  const [mode, setMode] = useState('daily'), [tip, setTip] = useState(null);
  const { cells, max, months } = useMemo(() => build(days, mode), [days, mode]);
  const over = (c, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ c, cx: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };
  const place = (el) => { // measure after render, then clamp to viewport (legacy behavior)
    if (!el || !tip) return;
    const pad = 8, w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.min(Math.max(pad, tip.cx - w / 2), innerWidth - w - pad)}px`;
    const above = tip.top - h - pad;
    el.style.top = `${above >= pad ? above : Math.min(innerHeight - h - pad, tip.bottom + pad)}px`;
  };
  return (
    <>
      <div className="u-hd u-heat-head"><h3>Token activity</h3>
        <div className="u-seg" id="uheatseg">{MODES.map(([v, n]) => <button key={v} className={mode === v ? 'on' : ''} data-v={v} onClick={() => setMode(v)}>{n}</button>)}</div>
      </div>
      <div id="uheat" onMouseLeave={() => setTip(null)}>
        <div className="hm-grid" style={{ gridTemplateRows: 'repeat(7,auto)' }}>
          {cells.map((c, i) => (
            <motion.i key={c.date} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: Math.floor(i / 7) * 0.008 }}
              style={{ background: c.v ? `rgba(59,130,246,${(0.15 + 0.85 * c.v / max).toFixed(2)})` : 'rgba(128,128,128,.15)' }}
              data-d={c.date} onMouseEnter={(e) => over(c, e)} />
          ))}
        </div>
        <div className="hm-grid hm-months">{months.map((m, i) => <span key={i}>{m}</span>)}</div>
      </div>
      {tip && createPortal(
        <div id="heatTip" className="u-tip" style={{ display: 'block' }} ref={place}>
          <div className="muted">{dayLabel(tip.c.date)}</div>
          <div><b>{ftok(Math.round(days[tip.c.date] || 0))}</b> tokens</div>
          {mode !== 'daily' && <div className="muted">{mode === 'weekly' ? '7-day' : 'cumulative'}: {ftok(Math.round(tip.c.v))}</div>}
        </div>, document.body)}
    </>
  );
}
