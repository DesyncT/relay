import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call, useIpcEvent } from '../api.js';
import { useStore } from '../store.js';
import { ease, spring } from '../motion.js';
import { CARET, Ico, Logo, RtBadge, provLogo } from './bits.jsx';
import { cancelReply, useChat } from './chatStore.js';
import { disp, dur, fcost, ftok, modelProvider, nameColor, visibleSpeaker } from './md.js';

export function useNow(ms, on = true) {
  const [, set] = useState(0);
  useEffect(() => { if (!on) return; const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [ms, on]);
  return Date.now();
}

// ---- typing line: who is working, with a live timer ----
export function Typing() {
  const act = useChat((s) => s.act), sid = useChat((s) => s.sid);
  const rows = Object.keys(act).map((w) => ({ who: w, ...act[w], text: ` is ${act[w].status}` }));
  const now = useNow(1000, rows.length > 0);
  const nm = (w) => <b style={{ color: nameColor(w) }}>{w}</b>;
  const allTyping = rows.length > 1 && rows.every((x) => x.status === 'typing');
  return (
    <div id="busy" key={sid}>
      <AnimatePresence initial={false} mode="popLayout">
        {rows.length > 0 && (
          <motion.div key="line" style={{ display: 'flex', alignItems: 'center', gap: 6 }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
            <span className="cc-spin" aria-hidden="true" />
            {allTyping ? <>{rows.map((x, i) => <span key={x.who}>{i ? (i === rows.length - 1 ? ' and ' : ', ') : ''}{nm(x.who)}</span>)}<span className="rq-think">are typing…</span></>
              : rows.map((x, i) => {
                const p = modelProvider(x.model) || x.who;
                return (
                  <motion.span key={x.who} layout="position" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && <span>·</span>}
                    <span className="busy-logo" style={{ '--c': nameColor(x.who) }}><Logo name={p === 'codex' ? 'openai' : p} size={15} color={nameColor(x.who)} /></span>
                    {nm(x.who)}{x.model && <RtBadge model={x.model} effort={x.effort} />}
                    <span className="rq-think">{x.text}</span>{x.since ? <span className="mono busy-time">{dur(now - x.since)}</span> : null}
                  </motion.span>
                );
              })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- progress checklist ----
export function ReqBar() {
  const reqs = useChat((s) => s.reqs), sid = useChat((s) => s.sid), working = useChat((s) => Object.keys(s.act).length > 0);
  const [sure, setSure] = useState(false);
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 3000); return () => clearTimeout(t); }, [sure]);
  const items = reqs?.items || [];
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round(items.reduce((n, i) => n + (i.done ? 100 : i.by ? i.pct || 0 : 0), 0) / items.length) : 0;
  const next = items.findIndex((x) => !x.done);
  return (
    <AnimatePresence initial={false}>
      {items.length > 0 && (
        <motion.details id="reqbar" className={'has' + (working ? ' working' : '')} key="rq" style={{ overflow: 'hidden' }}
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.28, ease }}>
          <summary title="Show progress" aria-label={`Progress ${done}/${items.length} · ${pct}%`}>
            <span className="rq-car"><Ico d={CARET} size={12} /></span>
            <span className="rq-lbl">{done === items.length ? 'All done' : 'Progress'}</span>
            <span className="rq-pct">{pct}%</span>
            <span className="rq-track"><span className="rq-fill" style={{ width: pct + '%' }} /></span>
            <span className="rq-cnt">{done} of {items.length} done</span>
            <button type="button" className="rq-end" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (sure) { setSure(false); return call('chat:endTask', sid); } setSure(true); }}>{sure ? 'End this task?' : 'End task'}</button>
          </summary>
          <ol>
            {items.map((i, n) => {
              const live = !i.done && i.by;
              return (
                <motion.li key={n} layout="position" className={i.done ? 'done' : live ? 'now' : n === next ? 'next' : ''}>
                  <span className="rq-n">{String(n + 1).padStart(2, '0')}</span>
                  <span className="rq-ic">{i.done ? <Ico d="M20 6 9 17l-5-5" /> : live ? <Logo name={i.by === 'codex' ? 'openai' : i.by} size={10} color={nameColor(i.by)} /> : null}</span>
                  <span className="rq-content"><span className="rq-title">{i.t}</span></span>
                </motion.li>
              );
            })}
          </ol>
        </motion.details>
      )}
    </AnimatePresence>
  );
}

// ---- provider limit banner ----
export function Limits() {
  const lim = useChat((s) => s.limits);
  const now = useNow(30000);
  const P = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity' };
  const out = ['claude', 'codex', 'antigravity'].filter((p) => lim[p] > now), up = ['claude', 'codex', 'antigravity'].filter((p) => !(lim[p] > now));
  const hm = (ms) => new Date(ms).toTimeString().slice(0, 5);
  const txt = out.length === 3 || !up.length ? 'All providers unavailable' : `${out.map((p) => P[p]).join(' and ')} unavailable · ${up.map((p) => P[p]).join('/')} covering`;
  return (
    <AnimatePresence initial={false}>
      {out.length > 0 && (
        <motion.div id="limits" role="status" key="lim" title={out.map((p) => `${P[p]}: provider limit until ${hm(lim[p])}`).join(' · ')} style={{ overflow: 'hidden' }}
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease }}>
          <span>{txt}</span><button type="button" onClick={() => call('limits:clear')}>Retry now</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---- header quota chips ----
const fmtLeft = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };
export function Quota() {
  const [data, setData] = useState(null);
  const cfg = useStore((s) => s.chatCfg || s.cfg);
  const load = useCallback(() => call('usage:quota').then((d) => setData(d || {})).catch(() => {}), []);
  useIpcEvent('usage:quota-update', load);
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    addEventListener('focus', load);
    return () => { clearInterval(t); removeEventListener('focus', load); };
  }, [load]);
  useNow(30000);
  const disabled = cfg?.disabledProviders || [];
  return (
    <div id="quota" aria-label="Provider usage">
      {['codex', 'claude', 'antigravity'].filter((p) => !disabled.includes(p)).map((provider) => {
        const s = data?.[provider];
        const name = provider === 'codex' ? 'Codex' : provider === 'claude' ? 'Claude' : 'Antigravity';
        const ws = s?.windows || [], est = s?.estimated || ws.some((w) => w.budget), pctOf = (w) => Math.round(w.used ?? (100 - w.remaining));
        const g = (v, l, cls = '', k) => <span className="q-g" key={k}><span className={'q-v' + cls}>{v}</span><span className="q-l">{l}</span></span>;
        const lvl = (p) => p >= 100 ? ' full' : p >= 80 ? ' hot' : '';
        const short = (w) => w.minutes === 10080 ? 'week' : w.minutes === 1440 ? 'day' : w.minutes === 300 ? '5h' : `${w.minutes}m`;
        const parts = !s || !ws.length ? [g('–', s ? 'not reported' : 'no data', '', 'x')]
          : est ? [g(ftok(ws[0].tokens || 0), 'local tokens · quota unknown', '', 'x')]
          : ws.map((w, i) => g(Math.max(0, 100 - pctOf(w)) + '%', short(w) + ' left', lvl(pctOf(w)), i));
        const hot = est ? null : ws.filter((w) => w.reset).sort((a, b) => pctOf(b) - pctOf(a))[0];
        if (hot && pctOf(hot) >= 50) parts.push(<span className="q-l q-r" key="r">{hot.reset > Date.now() ? 'resets in ' + (hot.reset - Date.now() >= 1728e5 ? Math.round((hot.reset - Date.now()) / 864e5) + 'd' : fmtLeft(hot.reset - Date.now())) : 'resetting'}</span>);
        const when = (t) => new Date(t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
        const old = s && (s.stale || ws.some((w) => w.stale) || (!est && Date.now() - s.at > 300000));
        if (s && !est && (old || s.cached)) parts.push(g(s.cached ? 'cached' : name + ' last report', fmtLeft(Date.now() - s.at) + ' ago', '', 'o'));
        const tip = [name, ...(!s ? ['No usage data yet'] : est ? ['Provider quota unavailable. Local token activity is not an allowance percentage and is not used for Spreader balancing.'] : ws.map((w) => `${short(w) === 'week' ? 'Weekly' : short(w)} window: ${Math.max(0, 100 - pctOf(w))}% left (${pctOf(w)}% used)${w.reset ? ', resets ' + when(w.reset) : ''}`)),
          ...(s && old ? [`Last reported ${fmtLeft(Date.now() - s.at)} ago${provider === 'codex' ? ' (updates when Codex runs)' : ''}`] : [])].join('\n');
        return <span key={provider} tabIndex={0} title={tip} aria-label={tip} className={old ? 'stale' : ''}>{provLogo(provider)}{parts}</span>;
      })}
    </div>
  );
}

// ---- header skill chips: show the ones that fit, fold the rest into "+N" ----
export function SkillChips() {
  const chips = useChat((s) => s.chips);
  const box = useRef(null), more = useRef(null);
  const fit = () => {
    const b = box.current, mo = more.current; if (!b || !mo) return;
    const cs = [...b.querySelectorAll('.sk1:not(.sk-n)')];
    mo.hidden = true;
    for (const c of cs) c.hidden = false;
    if (b.scrollWidth <= b.clientWidth) return;
    mo.hidden = false;
    for (let i = cs.length - 1; i >= 0 && b.scrollWidth > b.clientWidth; i--) {
      cs[i].hidden = true;
      const off = cs.filter((c) => c.hidden);
      mo.textContent = (off.length === cs.length ? '' : '+') + off.length + (off.length === cs.length ? ' skills' : '');
      mo.title = off.map((c) => c.title).join('\n');
    }
  };
  useLayoutEffect(fit, [chips]);
  useEffect(() => { const ro = new ResizeObserver(fit); ro.observe(box.current); return () => ro.disconnect(); }, []);
  return (
    <div className="skchips" id="skChips" aria-label="Skills in use" ref={box}>
      {(chips || []).map(([n, who]) => (
        <motion.span key={n} className="sk1" title={who.length ? `${n} (used by ${who.join(', ')})` : n} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
          {who.map((w) => <i key={w} style={{ background: `var(--${w === 'codex' ? 'codex' : 'claude'})` }} />)}<span className="sk-t">{n.replace(/^[\w-]+:/, '')}</span>
        </motion.span>
      ))}
      <span className="sk1 sk-n" ref={more} hidden />
    </div>
  );
}

// ---- spend strip ("This chat · claude $0.04 · 1.2k tokens") ----
const spendTxt = (s) => (s && s.cost > 0 ? `${fcost(s.cost)} · ` : '') + `${ftok(Math.round(s?.tokens || 0))} tokens`;
export function Spend() {
  const { items, ledger, spend, act } = useChat();
  let sum = spend;
  if (!ledger) {
    sum = {};
    for (const it of items) {
      const m = it.m; if (!m?.usage) continue;
      const k = m.via || m.from.split(':')[0], t = (sum[k] ||= { tokens: 0, cost: 0, input: 0, output: 0, cached: 0, model: '' });
      for (const f of ['tokens', 'cost', 'input', 'output', 'cached']) t[f] += m.usage[f] || 0;
      t.model = m.usage.model || t.model;
    }
  }
  const run = (k) => Object.keys(act).some((w) => w.split(':')[0] === k);
  const keys = ['claude', 'codex', 'antigravity', 'auto'].filter((k) => sum[k] || run(k));
  return (
    <div id="spend" aria-label="Current chat session usage totals">
      {keys.length > 0 && <span className="spend-caption">This chat ·</span>}
      {keys.map((k, i) => {
        const a = sum[k] || { tokens: 0, cost: 0, input: 0, output: 0, cached: 0, model: '' };
        const title = 'This chat only, across all turns. ' + (k === 'claude' ? 'Cost reported by the CLI.' : 'Cost estimated from configured API rates.') + ' Not lifetime account spend or a subscription bill.\n' + `${a.model || k}\ninput ${ftok(a.input)} · output ${ftok(a.output)} · cached ${ftok(a.cached)}${a.cost > 0 ? `\nest. cost ${fcost(a.cost)}` : ''}`;
        return (
          <span key={k} style={{ display: 'contents' }}>
            {i > 0 && <span>·</span>}
            <span className="sp" data-k={k} title={title}>
              <span>{k === 'auto' ? <Ico d="M13 2 3 14h9l-1 8 10-12h-9z" /> : <Logo name={k === 'claude' ? 'claude' : k === 'antigravity' ? 'antigravity' : 'openai'} size={14} color={k === 'claude' ? '#D97757' : k === 'antigravity' ? '#4E88F5' : '#fff'} />}</span>
              <b>{k}</b><span className="sn">{spendTxt(a)}</span>{run(k) ? 'running' : null}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ---- "Replying to ..." chip ----
export function ReplyChip() {
  const r = useStore((s) => s.chatReplying), profile = useStore((s) => s.profile);
  return (
    <div id="rchip">
      <AnimatePresence initial={false}>
        {r && (
          <motion.div key="rc" style={{ display: 'contents' }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
            Replying to <b style={{ color: nameColor(visibleSpeaker(r)) }}>{disp(visibleSpeaker(r), profile)}</b>
            <span className="reply-preview">{r.text || r.attachments?.[0]?.name || ''}</span>
            <button title="Cancel reply" aria-label="Cancel reply" onClick={cancelReply}><Ico d="M18 6 6 18M6 6l12 12" /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
