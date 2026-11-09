import { useId, useRef } from 'react';
import { motion } from 'framer-motion';
import { springSoft } from '../../motion.js';

export const RANGE_MODES = [['daily', 'Daily'], ['weekly', 'Weekly'], ['cumulative', 'Cumulative']];

// Pill segmented control with a sliding active highlight (shared by Heatmap and Chart).
export default function RangeTabs({ value, onChange, options = RANGE_MODES, label = 'Range', id }) {
  const lid = useId(), ref = useRef(null);
  const key = (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = options.findIndex(([v]) => v === value), n = options[(i + d + options.length) % options.length][0];
    onChange(n);
    ref.current?.querySelector(`[data-v="${n}"]`)?.focus();
  };
  return (
    <div className="u-seg u-range" id={id} role="tablist" aria-label={label} ref={ref} onKeyDown={key}>
      {options.map(([v, n]) => (
        <button key={v} role="tab" aria-selected={value === v} tabIndex={value === v ? 0 : -1} className={value === v ? 'on' : ''} data-v={v} onClick={() => onChange(v)}>
          {value === v && <motion.span className="u-range-pill" layoutId={lid} transition={springSoft} />}
          <span className="u-range-t">{n}</span>
        </button>
      ))}
    </div>
  );
}
