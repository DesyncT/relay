import { call } from '../../api.js';
import { getState, setState } from '../../store.js';
import { addSystemCard, openSession, setSubsOpen } from '../chatStore.js';
import { ftok, fcost } from './ui.jsx';

const Line = ({ a, b }) => <div><span className="num">{b}</span>{a}</div>;
const Head = ({ t }) => <div><b>{t}</b></div>;
const card = (...kids) => addSystemCard(<>{kids.map((k, i) => (typeof k === 'string' ? <div key={i}>{k}</div> : k))}</>);

// Legacy modules (QuickActions) have no React twin yet: call them when present, else broadcast for the shell.
const quick = (action, ...args) => {
  if (window.QuickActions?.[action]) return window.QuickActions[action](...args);
  window.dispatchEvent(new CustomEvent('relay:quick', { detail: { action, args } }));
};
const goTab = (tab) => () => setState({ tab });

// ctx: { sid, spend, leads, modes, setLead, pickMode, refreshCfg }
export function makeCmds(ctx) {
  const CMDS = [
    { n: 'find', d: 'Search messages in this chat', run: () => quick('open', 'find') },
    { n: 'export', d: 'Save this chat as Markdown', run: () => quick('exportChat') },
    { n: 'switch', d: 'Find and switch sessions', run: () => quick('open', 'sessions') },
    { n: 'usage', d: 'Spend in this session and all time', run: async () => {
      const s = ctx.spend, ks = Object.keys(s);
      let all;
      try {
        const u = await call('usage:scan');
        all = [<Line key="t" a="Total" b={`${fcost(u.total.cost)} · ${ftok(u.total.tokens)} tokens`} />,
          ...Object.entries(u.models).sort((a, b) => b[1].cost - a[1].cost).slice(0, 3).map(([m, v]) => <Line key={m} a={m} b={fcost(v.cost)} />)];
      } catch { all = [<div key="e">Could not read usage</div>]; }
      card(<Head key="h1" t="This session" />,
        ...(ks.length ? ks.map((k) => <Line key={k} a={k} b={`${ftok(Math.round(s[k].tokens))} chat tokens`} />) : [<div key="n">No spend yet</div>]),
        <Head key="h2" t="All time" />, ...all);
    } },
    { n: 'clear', d: 'Clear this session’s thread', run: async () => {
      await call('chat:clear', ctx.sid); await openSession(ctx.sid, false);
    } },
    { n: 'subs', d: 'Show the subagents panel', run: async () => {
      const list = await call('subagents:list', ctx.sid).catch(() => []);
      if (list.length) setSubsOpen(true); else card('No subagents in this session yet');
    } },
    { n: 'stop', d: 'Stop agents and subagents', run: () => { call('chat:stop', ctx.sid); card('Stopped agents and subagents.'); } },
    { n: 'end', d: 'End this task: stop, drop the requirements, start fresh (keeps what the agents learned)', run: () => call('chat:endTask', ctx.sid) },
    { n: 'lead', a: 'claude|codex|spreader', d: 'Who answers', run: (x) => {
      if (!ctx.leads.includes(x)) return card('Usage: /lead claude, codex or spreader');
      ctx.setLead(x); card('Lead is now ' + x + '.');
    } },
    { n: 'mode', a: 'auto|manual|edits|plan', d: 'Set the session mode', run: (x) => {
      const m = ctx.modes.find((y) => y[0] === x.toLowerCase());
      if (!m) return card('Usage: /mode auto, manual, edits or plan');
      ctx.pickMode(m[0]); card('Mode is now ' + m[1] + '.');
    } },
    { n: 'model', d: 'Show model routing', run: async () => {
      await ctx.refreshCfg(); const cfg = getState().cfg;
      card(...['claude', 'codex'].flatMap((a) => ['planning', 'coding', 'other'].map((p) => {
        const r = cfg.routes?.[a]?.[p]; return <Line key={a + p} a={`${a} · ${p}`} b={r ? `${r.model} · ${r.effort}` : '-'} />;
      })), <div key="b"><button onClick={goTab('rules')}>Open Rules to change</button></div>);
    } },
    { n: 'rules', d: 'Open Rules', run: goTab('rules') },
    { n: 'agents', d: 'Open Subagents', run: goTab('agents') },
    { n: 'settings', d: 'Open Settings', run: goTab('settings') },
    { n: 'new', d: 'New session in this project', run: async () => {
      const t = await call('sessions:tree'), s = t.sessions.find((x) => x.id === ctx.sid);
      if (!s) return card('Add a project first.');
      const n = await call('sessions:create', s.projectId); await call('sessions:setActive', n.id);
      await openSession(n.id);
    } },
    { n: 'rename', a: '<title>', d: 'Rename this session', run: async (x) => {
      if (!x) return card('Usage: /rename <title>');
      await call('sessions:rename', ctx.sid, x); ctx.reloadInfo(); card('Renamed to ' + x + '.');
    } },
    { n: 'help', d: 'List commands', run: () => card(...CMDS.map((c) => <Line key={c.n} a={'/' + c.n + (c.a ? ' ' + c.a : '')} b={c.d} />)) },
  ];
  return CMDS;
}
