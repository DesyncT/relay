import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call, useIpcEvent } from '../api.js';
import { getState, setState } from '../store.js';
import { ease, fadeUp, item, stagger } from '../motion.js';
import Limits from '../components/usage/Limits.jsx';
import Chart from '../components/usage/Chart.jsx';
import Heatmap from '../components/usage/Heatmap.jsx';
import Skeleton from '../components/usage/Skeleton.jsx';
import { CountUp, ToolIcon, ModelIcon, usd, sh, pct, dayLabel, ucol } from '../components/usage/util.jsx';
import '../styles/usage.css';

const INFO = 'API-price estimate from retained local transcripts, not a subscription bill. Account-only tokens have no cost records; the lifetime line prices them at your average local Codex rate. Unknown prices and missing costs are excluded; chat CLI-reported cost can use a different calculation.';
const TYPE_KEYS = [['input', 'Input', '#6b6b6b'], ['cacheRead', 'Cache read', '#3a3a3a'], ['cacheWrite', 'Cache write', '#bdbdbd'], ['output', 'Output', '#ffffff']];
const SPEED_KEYS = [['standard', 'Standard', '#3a3a3a'], ['fast', 'Fast', '#9a9a9a']];

function Bar({ keys, o }) {
  const sum = keys.reduce((n, [k]) => n + o[k], 0) || 1;
  return (
    <>
      <div className="u-bar">{keys.map(([k, , c], i) => (
        <motion.i key={k} style={{ background: c, flexBasis: 0 }} initial={{ flexGrow: 0 }} animate={{ flexGrow: o[k] / sum }} transition={{ duration: 0.8, ease, delay: 0.1 + i * 0.05 }} />
      ))}</div>
      <div className="u-leg">{keys.map(([k, n, c]) => <span key={k}><i style={{ background: c }} />{n}  <b>{usd(o[k])}</b></span>)}</div>
    </>
  );
}

const Grow = ({ w, className = 'u-mb', style, children }) => (
  <motion.div className={className} style={style} initial={{ width: 0 }} animate={{ width: w }} transition={{ duration: 0.7, ease }}>{children}</motion.div>
);

function Breakdown({ models, dayKeys, days, tools, t }) {
  const [view, setView] = useState('model');
  const mx = (models[0] || [0, { cost: 1 }])[1].cost || 1;
  const dayTot = (d) => Object.values(days[d] || {}).reduce((n, v) => n + v, 0);
  const dmx = Math.max(1e-9, ...dayKeys.map(dayTot));
  return (
    <>
      <div className="u-hd"><h3>Breakdown</h3>
        <div className="u-seg">{['model', 'day'].map((v) => <button key={v} className={view === v ? 'on' : ''} data-v={v} onClick={() => setView(v)}>{v === 'model' ? 'Model' : 'Day'}</button>)}</div>
      </div>
      <div id="ubreak">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={view} {...fadeUp}>
            {view === 'model' ? (
              <table><tbody>
                <tr><th>#</th><th>Model</th><th>Est. cost</th><th>Share</th><th>Tokens</th></tr>
                {models.map(([m, v], i) => (
                  <tr key={m}>
                    <td>{i + 1}</td>
                    <td><div className="u-m"><ModelIcon m={m} />{m}</div><Grow w={v.cost / mx * 360} style={{ background: ucol(v.tool) }} /></td>
                    <td>{v.rates ? usd(v.cost) : 'Unpriced'}</td>
                    <td className="muted">{pct(v.cost, t.cost)}</td>
                    <td className="muted">{sh(v.tokens)}
                      <details style={{ textAlign: 'left', marginTop: 8 }}><summary>Token breakdown</summary>
                        {Object.entries(v.breakdown || {}).map(([k, n]) => (
                          <div key={k}>{k}: {n.toLocaleString()} tokens{v.costs[k] != null ? ` · ${usd(v.costs[k])}` : k === 'unclassified' ? ' (historical type and cost unavailable)' : ' (included in cache write cost)'}</div>
                        ))}
                        {v.rates ? <div>Rates per 1M: input ${v.rates[0]} · cached ${v.rates[3]} · write ${v.rates[2]} · output ${v.rates[1]}</div> : 'No verified rate'}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            ) : (
              <table><tbody>
                <tr><th>#</th><th>Day</th><th>Est. cost</th><th>Share</th></tr>
                {dayKeys.map((d, i) => { const c = dayTot(d); return (
                  <tr key={d}>
                    <td>{i + 1}</td>
                    <td><div className="u-m">{dayLabel(d)}, {d.slice(0, 4)}</div>
                      <Grow className="u-mb seg" w={c / dmx * 360}>{tools.filter((k) => (days[d] || {})[k]).map((k) => <i key={k} style={{ flex: days[d][k], background: ucol(k) }} />)}</Grow></td>
                    <td>{usd(c)}</td><td className="muted">{pct(c, t.cost)}</td>
                  </tr>
                ); })}
              </tbody></table>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

function Report({ s, snap, rescan }) {
  const t = s.total, days = s.days || {}, toolsMap = s.tools || {};
  const tools = Object.keys(toolsMap).sort((a, b) => (toolsMap[b]?.cost || 0) - (toolsMap[a]?.cost || 0));
  const models = Object.entries(s.models || {}).sort((a, b) => b[1].cost - a[1].cost);
  const dayKeys = Object.keys(days).sort().reverse();
  const cov = s.coverage;
  const lifetimeTotal = t.lifetimeCostEstimate ?? t.cost;
  const providerCost = k => toolsMap[k].lifetimeCostEstimate ?? (toolsMap[k].cost + (k === 'Codex' ? t.accountCostEstimate || 0 : 0));
  const totals = [['Known lifetime tokens', t.tokens], ['Cached input', t.cached], ['Uncached input', t.uncached], ['Output', t.output]];
  return (
    <motion.div initial={false}>
      <button className="rescan" id="rescan" onClick={rescan}>Rescan</button>
      <Limits snap={snap} />
      <motion.div className="u-top" variants={item}>
        <div>
          <p className="u-big"><CountUp value={lifetimeTotal} format={usd} /></p>
          <div className="u-sub">{t.sessions} local sessions · API estimate <svg viewBox="0 0 16 16" role="img" aria-label={INFO}><title>{INFO}</title><circle cx="8" cy="8" r="6.5" /><path d="M8 7.2v4M8 4.8v.1" /></svg></div>
          {tools.map((k, i) => (
            <motion.div className="u-tool" key={k} initial={false}>
              <div className="r1"><span className="dot" style={{ background: ucol(k) }} /><ToolIcon k={k} /><span className="n">{k}</span><small>{toolsMap[k].sessions} sessions</small><span className="c">{usd(providerCost(k))}</span></div>
              <div className="r2">{pct(providerCost(k), lifetimeTotal)} of lifetime estimated cost · {sh(toolsMap[k].tokens)} tokens</div>
              <div className="provider-lifetime" title="Local transcript costs plus any priced account-only tokens. Recovered tokens without pricing are excluded.">Lifetime API estimate <b>{(toolsMap[k].accountCostEstimate || (k === 'Codex' ? t.accountCostEstimate : 0)) > 0 ? '\u2248 ' : ''}{usd(toolsMap[k].lifetimeCostEstimate ?? (toolsMap[k].cost + (k === 'Codex' ? t.accountCostEstimate || 0 : 0)))}</b>
                {(toolsMap[k].accountCostEstimate || (k === 'Codex' ? t.accountCostEstimate : 0)) > 0 && <small>+{usd(toolsMap[k].accountCostEstimate ?? t.accountCostEstimate)} estimated from account-only tokens</small>}
              </div>
            </motion.div>
          ))}
          {t.accountCostEstimate > 0 && <p className="u-sub" title="Tokens that only your Codex account reports, priced at your average local Codex rate">Lifetime incl. account-only tokens ≈ <b>{usd(t.lifetimeCostEstimate)}</b> (+{usd(t.accountCostEstimate)} estimated)</p>}
          {t.unpriced.length > 0 && <p className="warn">{t.unpriced.length} unpriced model{t.unpriced.length === 1 ? '' : 's'}: tokens are included; their estimated cost is unavailable.</p>}
        </div>
        <div><h3>Estimated daily API cost</h3><Chart days={s.chartDays || days} tools={tools} accountCostDays={s.accountCostDays || {}} />
          {t.accountCostEstimate > 0 && <p className="muted usage-coverage">{Object.keys(s.accountCostDays || {}).length ? <>Codex includes {usd(t.accountCostEstimate)} in account-only estimates, spread across usage days in proportion to token activity. These are allocated estimates, not recorded daily charges.</> : <>The {usd(t.accountCostEstimate)} account-only estimate is included in Codex totals. No dated Codex activity is available to distribute it on the graph.</>}</p>}</div>
      </motion.div>
      <motion.div variants={item}>
        <h3>Totals</h3>
        <div className="u-totals">
          {totals.map(([l, v]) => <div key={l}>{l}<span><CountUp value={v} format={(n) => sh(Math.round(n))} /></span></div>)}
          <div>Cache savings<span><CountUp value={t.savings} format={usd} /></span></div>
        </div>
      </motion.div>
      <motion.div variants={item}>
        {s.accountUsage?.codex
          ? <p className="muted usage-coverage">Codex account lifetime: <b>{sh(s.accountUsage.codex.summary.lifetimeTokens)} tokens</b> · {s.accountUsage.codex.cached ? 'cached account report' : 'fetched from signed-in account'}. Model and token-type costs use local transcripts; the graph also includes allocated account-only estimates.</p>
          : <p className="muted usage-coverage">Codex account lifetime unavailable for this sign-in; showing retained local history.</p>}
        {t.recoveredTokens ? <p className="muted usage-coverage">{sh(t.recoveredTokens)} older Claude tokens recovered from saved statistics. Their costs and token-type breakdown are unavailable.{t.undatedTokens ? ` ${sh(t.undatedTokens)} tokens have no recoverable day and appear only in totals.` : ''}</p> : null}
        <Heatmap days={s.dayTokens || {}} />
        <p className="muted usage-coverage">All retained local CLI history, including archives and sessions outside Relay. Imported history stays saved locally.{cov?.malformedLines || cov?.unreadableFiles?.length ? ` ${cov.malformedLines || 0} incomplete log lines and ${cov.unreadableFiles?.length || 0} unreadable files were skipped; totals may be incomplete.` : ''}</p>
      </motion.div>
      <motion.div className="u-split" variants={item}>
        <div><div className="u-hd"><h3>Cost by type</h3></div><Bar keys={TYPE_KEYS} o={s.type} /></div>
        <div><div className="u-hd"><h3>Cost by speed</h3><span>Premium {usd(s.speed.fast / 2)}</span></div><Bar keys={SPEED_KEYS} o={s.speed} /></div>
      </motion.div>
      <motion.div variants={item}><Breakdown models={models} dayKeys={dayKeys} days={days} tools={tools} t={t} /></motion.div>
    </motion.div>
  );
}

export default function Usage() {
  const [state, setLocal] = useState({ phase: 'loading' });
  const [snap, setSnap] = useState({});
  const run = useRef(0);

  const load = useCallback(async (fresh) => {
    const id = ++run.current;
    setLocal({ phase: 'loading' });
    try {
      const cfg = getState().cfg;
      const [s, settings] = await Promise.all([
        call('usage:scan', fresh === true),
        cfg?.disabledProviders ? Promise.resolve(cfg) : call('settings:get').catch(() => ({})),
      ]);
      if (id !== run.current) return;
      if (settings) setState({ cfg: { ...getState().cfg, ...settings } });
      setState({ navStats: `${s.total.sessions} sessions · ${usd(s.total.lifetimeCostEstimate ?? s.total.cost)}` });
      setLocal({ phase: 'ready', s });
    } catch (error) {
      if (id === run.current) setLocal({ phase: 'error', message: error?.message || 'Usage history could not be loaded.' });
    }
  }, []);

  const quota = useCallback(async () => {
    const data = await call('usage:quota').catch(() => null);
    const next = data || {};
    setSnap(next);
    window.codexFiveHourUsed = next.codex?.windows?.find((w) => w.minutes === 300)?.used ?? null;
    setState({ quotaSnap: next });
  }, []);

  useEffect(() => { load(); return () => { run.current++; }; }, [load]);
  useEffect(() => {
    quota();
    const t = setInterval(quota, 10000);
    window.addEventListener('focus', quota);
    return () => { clearInterval(t); window.removeEventListener('focus', quota); };
  }, [quota]);
  useIpcEvent('usage:quota-update', quota);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state.phase === 'loading' && <motion.div key="sk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}><Skeleton /></motion.div>}
      {state.phase === 'error' && (
        <motion.div key="err" {...fadeUp}>
          <h2>Usage history</h2><p className="muted">{state.message}</p>
          <button className="b" type="button" onClick={() => load(true)}>Retry usage scan</button>
        </motion.div>
      )}
      {state.phase === 'ready' && <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}><Report s={state.s} snap={snap} rescan={() => load(true)} /></motion.div>}
    </AnimatePresence>
  );
}
