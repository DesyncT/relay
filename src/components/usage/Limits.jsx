import { motion } from 'framer-motion';
import { ftok, useNow, fmtLeft } from './util.jsx';
import { ease } from '../../motion.js';

const NAMES = { codex: 'Codex', claude: 'Claude', antigravity: 'Antigravity' };

function Reset({ at }) {
  const ms = at - useNow();
  return <small>{ms > 0 ? `resets in ${fmtLeft(ms)}` : 'reset due'}</small>;
}

export default function Limits({ snap }) {
  return (
    <div className="u-limits" id="u-limits">
      {Object.keys(NAMES).map((p) => {
        const name = NAMES[p], s = snap[p], w = s?.windows?.find((x) => x.minutes === 300);
        if (!w) return <div className="u-lim" key={p}><span>{name}</span><small>5h not reported</small></div>;
        if (s?.estimated || w.budget || !Number.isFinite(w.remaining)) return <div className="u-lim" key={p}><span>{name}</span><small>{ftok(w.tokens || 0)} local tokens in 5h · quota unavailable</small></div>;
        const left = Math.max(0, Math.round(100 - w.used));
        return (
          <div className="u-lim" key={p}>
            <span>{name}</span>
            <div className="u-meter"><motion.i initial={{ width: 0 }} animate={{ width: `${left}%` }} transition={{ duration: 0.8, ease }} /></div>
            <b>{w.stale || s?.cached ? 'last reported ' : ''}{left}% left{w.tokens != null && <> <span className="muted">({ftok(w.tokens)} tok)</span></>}</b>
            {w.reset ? <Reset at={w.reset} /> : <small>window reset</small>}
          </div>
        );
      })}
    </div>
  );
}
