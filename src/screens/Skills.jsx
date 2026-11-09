import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call as rawCall } from '../api.js';
import { getState } from '../store.js';
import { Icon } from '../components/icons.jsx';
import { useSaved } from '../components/rules/Saved.jsx';
import { fadeUp, spring } from '../motion.js';
import '../styles/agents.css';

const call = async (ch, ...a) => {
  try { return (await rawCall(ch, ...a)) || { ok: false, error: 'No answer' }; }
  catch (e) { const m = String(e.message || e); return { ok: false, error: /No handler registered/.test(m) ? 'Relay was updated: restart it with Ctrl+Shift+R to load this page' : m }; }
};
const sid = () => getState().openSid;
const ICON = { folder: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z', trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5', plus: 'M12 5v14M5 12h14' };
const Ic = ({ n }) => <Icon d={ICON[n]} size={16} />;
const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);

function Seg({ items, cur, on, id }) {
  return (
    <div className="seg">
      {items.map(([k, label]) => (
        <button key={k} type="button" className={k === cur ? 'on' : ''} onClick={() => on(k)}>
          {k === cur && <motion.span  className="seg-ind" transition={spring} />}<span>{label}</span>
        </button>
      ))}
    </div>
  );
}

// inline confirm: first click swaps the button for "Remove? Yes / No"
function ConfirmBtn({ label, onYes }) {
  const [ask, setAsk] = useState(false);
  return (
    <span className="sk-act">
      {ask ? (<>
        <span className="muted" style={{ fontSize: 13, marginRight: 4 }}>Remove?</span>
        <button className="b danger" type="button" onClick={() => { setAsk(false); onYes(); }}>Yes</button>
        <button className="b ghost" type="button" onClick={() => setAsk(false)}>No</button>
      </>) : (
        <button className="b ghost danger ic" type="button" title={label} aria-label={label} onClick={() => setAsk(true)}><Ic n="trash" /></button>
      )}
    </span>
  );
}

const Btn = ({ text, onClick, cls = '', ic, ...r }) => <button className={'b ' + cls} type="button" onClick={onClick} {...r}>{ic && <Ic n={ic} />}{text}</button>;
const Section = ({ title, sub, action, children }) => (
  <motion.div className="panel sk-card" layout="position" {...fadeUp}>
    <div className="sk-head"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>{action}</div>
    {children}
  </motion.div>
);
const Status = ({ r, text }) => !r ? <div className="sk-empty">{text}</div> : !r.ok ? <div className="sk-err">{r.error || 'Could not load'}</div> : null;
const Row = ({ name, meta, desc, children }) => (
  <motion.div className="sk-row" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <div className="sk-main">
      <div className="sk-name">{name}{meta ? <span>{meta}</span> : null}</div>
      {desc ? <div className="sk-desc" title={desc}>{desc}</div> : null}
    </div>
    <div className="sk-act">{children}</div>
  </motion.div>
);

function Marketplaces({ list, addCh, rmCh, placeholder, act, busy }) {
  const [v, setV] = useState('');
  const go = () => { if (v.trim()) { act('mk:' + v, addCh, v.trim()); setV(''); } };
  return (
    <Section title="Marketplaces" sub="Where plugins come from">
      {list.length ? list.map((m) => <Row key={m.name} name={m.name} desc={m.source}><ConfirmBtn label="Remove" onYes={() => act('mkrm:' + m.name, rmCh, m.name)} /></Row>) : <div className="sk-empty">No marketplaces yet</div>}
      <div className="sk-add">
        <input placeholder={placeholder} aria-label="Add marketplace" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        <Btn text={[...busy].some((k) => k.startsWith('mk:')) ? 'Adding' : 'Add'} onClick={go} ic="plus" />
      </div>
      <span className="hint">A GitHub owner/repo or an https URL</span>
    </Section>
  );
}

function Browse({ items, onInstall, busy, search, setSearch }) {
  const q = search.toLowerCase();
  const hit = items.filter((p) => !q || (p.name + ' ' + (p.description || '') + ' ' + p.marketplace).toLowerCase().includes(q));
  const shown = hit.slice(0, 60);
  return (<>
    <div style={{ display: 'flex', marginBottom: 12 }}><input placeholder="Search plugins" aria-label="Search plugins" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    {shown.length ? shown.map((p) => (
      <Row key={p.id} name={p.name} meta={[p.marketplace, p.installs ? fmt(p.installs) + ' installs' : '', p.version].filter(Boolean).join(' · ')} desc={p.description}>
        {p.installed ? <span className="muted" style={{ fontSize: 13, padding: '0 8px' }}>Installed</span> : <Btn text={busy.has('install:' + p.id) ? 'Installing' : 'Install'} ic="plus" onClick={() => onInstall(p)} />}
      </Row>
    )) : <div className="sk-empty">Nothing matches</div>}
    {hit.length > shown.length && <div className="hint">{`Showing ${shown.length} of ${hit.length}. Search to narrow down.`}</div>}
  </>);
}

// "Always use": same forced-skills.md file, one name per line (rules:get / rules:save)
function AlwaysUse({ known }) {
  const [r, setR] = useState(null);
  const [checked, setChecked] = useState(null);
  const [extra, setExtra] = useState('');
  const [ok, flash] = useSaved();
  useEffect(() => { call('rules:get').then((x) => setR(x)); }, []);
  const f = r?.forced;
  useEffect(() => {
    if (!f) return;
    const have = f.text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    setChecked(new Set(have.filter((n) => known.has(n)))); setExtra(have.filter((n) => !known.has(n)).join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, known.size]);
  if (!r) return <div className="panel"><div className="sk-empty">Loading</div></div>;
  if (!f) return <div className="panel"><div className="sk-err">Could not read the list</div></div>;
  const persist = async (set, ex) => {
    const names = [...new Set([...set, ...ex.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)])];
    await call('rules:save', 'forced', names.join('\n') + (names.length ? '\n' : '')); flash();
  };
  const toggle = (n) => { const s = new Set(checked); s.has(n) ? s.delete(n) : s.add(n); setChecked(s); persist(s, extra); };
  const names = [...known].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <Section title="Always use" sub={'Added to every agent and subagent prompt · ' + f.path} action={ok}>
      {names.length ? <div className="sk-checks">{names.map(([n, kind]) => (
        <label key={n}><input type="checkbox" checked={!!checked?.has(n)} onChange={() => toggle(n)} /><span title={n}>{n}</span><small>{kind}</small></label>
      ))}</div> : <div className="sk-empty">No installed skills or plugins found</div>}
      <label className="hint" htmlFor="sk-extra" style={{ marginBottom: 6 }}>Other names</label>
      <textarea id="sk-extra" rows={3} placeholder="One name per line, for example ponytail" aria-label="Other names" value={extra} onChange={(e) => setExtra(e.target.value)} onBlur={() => persist(checked || new Set(), extra)} />
    </Section>
  );
}

export default function Skills() {
  const [tab, setTab] = useState('claude'), [view, setView] = useState('installed');
  const [cache, setCache] = useState({}), [busy, setBusy] = useState(new Set()), [search, setSearch] = useState(''), [note, setNote] = useState('');
  const cacheRef = useRef(cache); cacheRef.current = cache;
  const patch = (p) => setCache((c) => ({ ...c, ...p }));

  const load = useCallback(async (t, v, fresh) => {
    const have = fresh ? {} : cacheRef.current;
    if (fresh) setCache({});
    if (t === 'claude') {
      if (!have.skills) call('plugins:skills', sid()).then((r) => patch({ skills: r }));
      if (!have.cl) call('plugins:claudeList').then((r) => patch({ cl: r }));
      if (v === 'browse' && !have.clb) call('plugins:claudeBrowse').then((r) => patch({ clb: r }));
    } else if (!have.cx) call('plugins:codexList').then((r) => patch({ cx: r }));
  }, []);
  useEffect(() => { load(tab, view, false); }, [tab, view, load]);

  // skills:changed is main telling us the skills folders changed
  const reload = () => load(tab, view, true);
  const act = async (key, ch, ...args) => {
    setBusy((b) => new Set(b).add(key)); setNote('');
    const r = await call(ch, ...args);
    setBusy((b) => { const n = new Set(b); n.delete(key); return n; });
    setNote(!r.ok ? r.error || 'Failed' : key.startsWith('install') ? 'Installed. Restart a running agent to use it.' : '');
    reload();
  };

  const known = new Map();
  for (const k of cache.skills?.skills || []) known.set(k.name, 'skill');
  for (const p of [...(cache.cl?.plugins || []), ...(cache.cx?.plugins || []).filter((p) => p.installed)]) if (!known.has(p.name)) known.set(p.name, 'plugin');

  const { skills: s, cl: c, clb: b, cx } = cache;
  const refreshBtn = <Btn text="Refresh" cls="ghost" ic="refresh" onClick={reload} />;
  const mk = (l, a, r, ph) => <Marketplaces list={l} addCh={a} rmCh={r} placeholder={ph} act={act} busy={busy} />;
  const claudeMk = c?.ok && mk(c.marketplaces, 'plugins:claudeMarketAdd', 'plugins:claudeMarketRemove', 'anthropics/claude-plugins-official');
  let body;
  if (tab === 'claude' && view === 'installed') body = (<>
    <Section title="Skills" sub="Folders in ~/.claude/skills and the project .claude/skills">
      <Status r={s} text="Loading skills" />
      {s?.ok && (s.skills.length ? <AnimatePresence initial={false}>{s.skills.map((k) => (
        <Row key={k.source + k.name} name={k.name} meta={k.source === 'user' ? 'User' : 'Project'} desc={k.description || 'No description'}>
          <Btn cls="ghost ic" ic="folder" aria-label="Open folder" onClick={async () => { const r = await call('plugins:skillOpen', sid(), k.source, k.name); if (!r.ok) setNote(r.error); }} />
          <ConfirmBtn label="Remove" onYes={async () => { const r = await call('plugins:skillRemove', sid(), k.source, k.name); setNote(r.ok ? '' : r.error); reload(); }} />
        </Row>))}</AnimatePresence> : <div className="sk-empty">No skills found</div>)}
    </Section>
    <Section title="Plugins" sub="Installed in Claude Code" action={refreshBtn}>
      <Status r={c} text="Loading plugins" />
      {c?.ok && (c.plugins.length ? <AnimatePresence initial={false}>{c.plugins.map((p) => (
        <Row key={p.id} name={p.name} meta={[p.version, p.marketplace].filter(Boolean).join(' · ')}>
          <label className="sk-opt"><input type="checkbox" aria-label="Enabled" checked={p.enabled} disabled={busy.has('t:' + p.id)} onChange={(e) => act('t:' + p.id, 'plugins:claudeAct', e.target.checked ? 'enable' : 'disable', p.id)} />Enabled</label>
          <Btn cls="ghost" text={busy.has('u:' + p.id) ? 'Updating' : 'Update'} onClick={() => act('u:' + p.id, 'plugins:claudeAct', 'update', p.id)} />
          <ConfirmBtn label="Remove" onYes={() => act('r:' + p.id, 'plugins:claudeAct', 'uninstall', p.id)} />
        </Row>))}</AnimatePresence> : <div className="sk-empty">No plugins installed</div>)}
    </Section>
    {claudeMk}
  </>);
  else if (tab === 'claude') body = (<>
    <Section title="Available plugins" sub="From your configured marketplaces">
      <Status r={b} text="Loading the plugin catalog" />
      {b?.ok && <Browse items={b.available} busy={busy} search={search} setSearch={setSearch} onInstall={(p) => act('install:' + p.id, 'plugins:claudeAct', 'install', p.id)} />}
    </Section>
    {claudeMk}
  </>);
  else if (!cx || !cx.ok) body = <Section title="Plugins" sub="Codex"><Status r={cx} text="Loading Codex plugins" /></Section>;
  else body = (<>
    {view === 'installed' ? (() => { const ins = cx.plugins.filter((p) => p.installed); return (
      <Section title="Plugins" sub="Installed in Codex" action={refreshBtn}>
        {ins.length ? ins.map((p) => <Row key={p.id} name={p.name} meta={[p.version, p.marketplace, p.enabled ? '' : 'Disabled'].filter(Boolean).join(' · ')}><ConfirmBtn label="Remove" onYes={() => act('r:' + p.id, 'plugins:codexAct', 'remove', p.id)} /></Row>) : <div className="sk-empty">No plugins installed</div>}
      </Section>); })() : (
      <Section title="Available plugins" sub="From your configured marketplaces">
        <Browse items={cx.plugins} busy={busy} search={search} setSearch={setSearch} onInstall={(p) => act('install:' + p.id, 'plugins:codexAct', 'add', p.id)} />
      </Section>)}
    {mk(cx.marketplaces, 'plugins:codexMarketAdd', 'plugins:codexMarketRemove', 'owner/repo')}
  </>);

  return (
    <div className="sk-wrap">
      <div className="sk-seg">
        <Seg id="sk-tab" cur={tab} items={[['claude', 'Claude Code'], ['codex', 'Codex']]} on={(k) => { setTab(k); setView('installed'); setSearch(''); setNote(''); }} />
        <Seg id="sk-view" cur={view} items={[['installed', 'Installed'], ['browse', 'Browse']]} on={(k) => { setView(k); setSearch(''); setNote(''); }} />
      </div>
      <div className="sk-stack">
        <AnimatePresence>{note && <motion.div key="n" className={note.startsWith('Installed') ? 'hint' : 'sk-err'} {...fadeUp}>{note}</motion.div>}</AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab + view} className="sk-stack" {...fadeUp}>{body}</motion.div>
        </AnimatePresence>
        <AlwaysUse known={known} />
      </div>
    </div>
  );
}
