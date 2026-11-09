import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { call } from '../../api.js';
import { spring } from '../../motion.js';
import Logo, { logoColor } from './Logo.jsx';
import { useSaved } from './Saved.jsx';

const EFFORTS = ['low', 'medium', 'high'];
const MODELS = {
  claude: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'],
  codex: ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'],
  antigravity: ['gemini-3.8-flash-high', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-low', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.8-pro'],
};
const DEF = { claude: ['claude-sonnet-5-5', 'low'], codex: ['gpt-6.1-sol', 'low'], antigravity: ['gemini-3.8-flash-low', 'low'] };
const NAMES = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity' };
const PHASES = ['planning', 'coding', 'other'];
const defaults = () => Object.fromEntries(Object.entries(DEF).map(([a, [model, effort]]) => [a, Object.fromEntries(PHASES.map((p) => [p, { model, effort }]))]));
const norm = (g = {}) => { const d = defaults(); for (const a in d) for (const p in d[a]) Object.assign(d[a][p], g[a] && g[a][p]); return d; };

// Longest matching prefix wins, same as usage.js. Rows: [input, output, ...] USD per MTok.
const priceOf = (prices, model) => {
  if (!prices || !model) return '';
  const k = Object.keys(prices).filter((x) => x[0] !== '_' && model.startsWith(x)).sort((a, b) => b.length - a.length)[0];
  const r = k && prices[k];
  return r ? `$${r[0]} in / $${r[1]} out per MTok` : '';
};

function Cell({ agent, r, prices, onChange }) {
  const [val, setVal] = useState(r.model);
  useEffect(() => setVal(r.model), [r.model]);
  return (
    <div className="rt-cell">
      <datalist id={`rt-${agent}`}>{MODELS[agent].map((m) => <option key={m} value={m} />)}</datalist>
      <input type="text" value={val} spellCheck={false} autoComplete="off" list={`rt-${agent}`} aria-label={`${agent} default model`} placeholder={DEF[agent][0]}
        onChange={(e) => setVal(e.target.value)} onBlur={() => { const m = val.trim() || DEF[agent][0]; setVal(m); if (m !== r.model) onChange({ model: m, effort: r.effort }); }} />
      <div className="rt-price">{priceOf(prices, r.model)}</div>
      <div className="seg" role="group" aria-label={`${agent} effort`}>
        {EFFORTS.map((e) => (
          <button key={e} type="button" className={r.effort === e ? 'on' : ''} aria-pressed={r.effort === e} onClick={() => onChange({ model: r.model, effort: e })}>
            {r.effort === e && <motion.span  className="seg-ind" transition={spring} />}
            <span>{e}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Routing() {
  const [s, setS] = useState(null), [prices, setPrices] = useState(null), [routes, setRoutes] = useState(null);
  const [saved, flash] = useSaved(1200);
  useEffect(() => {
    Promise.all([call('settings:get'), call('prices:get')]).then(([st, p]) => { setS(st); setPrices(p); setRoutes(norm(st.routes)); }).catch(() => {});
  }, []);
  if (!routes) return <div id="routing" />;
  const commit = (next) => { setRoutes(next); call('settings:save', { routes: next }); flash(); };
  const set = (agent, v) => commit({ ...routes, [agent]: Object.fromEntries(PHASES.map((p) => [p, { ...v }])) });
  const disabled = s.disabledProviders || [];
  const agents = Object.keys(DEF).filter((a) => !disabled.includes(a));
  return (
    <div id="routing">
      <div className="rt">
        <div className="rt-head"><h3>Default models</h3>{saved}</div>
        <div className="rt-grid" style={{ gridTemplateColumns: `minmax(140px,1fr) repeat(${agents.length},minmax(200px,1.3fr))` }}>
          <div />
          {agents.map((a) => <div key={a} className="rt-col"><span style={{ display: 'inline-flex' }}><Logo name={a === 'codex' ? 'openai' : a} color={logoColor(a)} /></span>{NAMES[a]}</div>)}
          <div className="rt-phase"><b>Default model</b><span>Used for every task. Spreader runs this model on whichever provider it picks</span></div>
          {agents.map((a) => <Cell key={a} agent={a} r={routes[a].coding} prices={prices} onChange={(v) => set(a, v)} />)}
        </div>
        <div className="rt-foot"><button className="b" type="button" onClick={() => commit(defaults())}>Reset to defaults</button></div>
      </div>
    </div>
  );
}
