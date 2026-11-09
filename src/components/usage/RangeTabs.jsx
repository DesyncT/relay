import { useRef } from 'react';

export const RANGE_MODES = [['daily', 'Daily'], ['weekly', 'Weekly'], ['cumulative', 'Cumulative']];

// Shared keyboard-accessible view selector for Heatmap and Chart.
export default function RangeTabs({ value, onChange, options = RANGE_MODES, label = 'Range', id }) {
  const ref = useRef(null);
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
          <span className="u-range-t">{n}</span>
        </button>
      ))}
    </div>
  );
}
