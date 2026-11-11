import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call } from '../api.js';
import { useStore, setState } from '../store.js';
import { spring, fadeUp } from '../motion.js';
import { ALL_PROVIDERS, Logo, useAuth, AuthChip, ConnectedModels, useUpdates, UpdateCard, UPD_LABEL } from '../components/settings/parts.jsx';
import Themes from './Themes.jsx';
import Cowork from './Cowork.jsx';
import '../styles/settings.css';

const CLI_FIELDS = ALL_PROVIDERS.flatMap(([k]) => [k + 'Cmd', k + 'Args']);
const FIELDS = [...CLI_FIELDS, 'cwd'];
const SET_MODES = [['edits', 'Full access', 'Agents edit and run commands; you answer their questions'], ['auto', 'Auto', 'Voters answer routine questions; important ones still come to you'], ['super', 'Super Auto', 'Voters answer every question, so a run can finish overnight']];
const SET_SECS = [['profile', 'Profile'], ['providers', 'Providers'], ['agents', 'Agents'], ['limits', 'Limits'], ['notifications', 'Notifications'], ['updates', 'Updates']];
const CLI_PH = { claude: '--model claude-sonnet-5-5', codex: '--full-auto' };
const SOUNDS = [['complete', 'Test finished sound'], ['question', 'Test input sound'], ['failure', 'Test failure sound']];

const collect = (v, limits) => ({
  ...Object.fromEntries(FIELDS.map((k) => [k, v.f[k] ?? ''])),
  ...Object.fromEntries(Object.keys(limits).map((k) => [k, Number(v.l[k])])),
  defaultMode: v.mode || 'edits',
  disabledProviders: ALL_PROVIDERS.map(([k]) => k).filter((k) => v.disabled.includes(k)),
});
const initVals = (s, limits) => ({
  f: Object.fromEntries(FIELDS.map((k) => [k, s[k] ?? ''])),
  l: Object.fromEntries(Object.entries(limits).map(([k, d]) => [k, String(s[k] ?? d[0])])),
  mode: s.defaultMode || 'edits',
  disabled: s.disabledProviders || [],
});

function TabPair({ view, setView }) {
  return (
    <div className="tabpair" id="tabpair">
      {[['settings', 'Settings'], ['themes', 'Themes']].map(([id, n]) => (
        <button key={id} type="button" className={id === view ? 'on' : ''} onClick={() => setView(id)}>
          {id === view && <motion.span  className="tp-ind" transition={spring} />}
          <span>{n}</span>
        </button>
      ))}
    </div>
  );
}

function Profile() {
  const profile = useStore((s) => s.profile);
  const [name, setName] = useState(profile.name || '');
  const file = useRef(null);
  useEffect(() => { call('profile:get').then((p) => setState({ profile: p })).catch(() => {}); }, []);
  useEffect(() => setName(profile.name || ''), [profile.name]);
  const reload = (p) => setState({ profile: p });
  const pick = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const b64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
      reload(await call('profile:setAvatar', f.name, b64));
    } catch (err) { alert(err.message); }
  };
  const commit = async () => { if (name !== profile.name) reload(await call('profile:setName', name)); };
  return (
    <div className="panel form">
      <h3>Profile</h3>
      <div className="pf">
        <span className="av user">
          {profile.avatar ? <img src={profile.avatar} alt="" /> : <svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
        </span>
        <div className="row-actions" style={{ margin: 0 }}>
          <button type="button" className="b" onClick={() => file.current.click()}>Change picture</button>
          <button type="button" className="b ghost" onClick={async () => reload(await call('profile:setAvatar', null))}>Remove</button>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={pick} />
        </div>
      </div>
      <label htmlFor="s-pname">Display name</label>
      <input id="s-pname" value={name} maxLength={32} placeholder="you" onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    </div>
  );
}

const Sec = ({ id, title, sub, extra, children }) => (
  <motion.div className="set-sec" role="group" aria-label={title} id={'set-' + id} {...fadeUp} layout="position">
    <div className="set-sh"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>{extra}</div>
    {children}
  </motion.div>
);
const Row = ({ id, label, hint, children, show = true }) => show && (
  <div className="set-row">
    <div className="set-l">{React.createElement(id ? 'label' : 'span', { className: 'set-lb', ...(id && { htmlFor: id }) }, label)}{hint && <span className="hint">{hint}</span>}</div>
    <div className="set-c">{children}</div>
  </div>
);

function Limit({ k, def: [d, min, max, label, hint, , unit], value, onChange, show }) {
  if (!show) return null;
  const changed = String(value) !== String(d);
  const step = (n) => onChange(String(Math.max(min, Math.min(max, (Math.trunc(+value) || 0) + n))));
  const ico = (p) => <svg className="i" viewBox="0 0 24 24"><path d={p} /></svg>;
  return (
    <div className={'lim' + (changed ? ' changed' : '')}>
      <div className="lim-h">
        <label htmlFor={'s-' + k}>{label}</label><span className="lim-dot" aria-hidden="true" />
        <AnimatePresence>{changed && <motion.button key="r" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="lim-reset" type="button" aria-label={`Reset ${label} to ${d}`} onClick={() => onChange(String(d))}>Reset</motion.button>}</AnimatePresence>
      </div>
      <span className="hint">{hint}</span>
      <div className="lim-ctl">
        <button type="button" className="lim-step" aria-label={`Decrease ${label}`} onClick={() => step(-1)}>{ico('M5 12h14')}</button>
        <input id={'s-' + k} type="number" min={min} max={max} step={1} value={value} className="lim-in" inputMode="numeric" onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="lim-step" aria-label={`Increase ${label}`} onClick={() => step(1)}>{ico('M12 5v14M5 12h14')}</button>
        {unit && <span className="lim-unit">{unit}</span>}
        <span className="lim-def" title={`Allowed ${min} to ${max}`}>{`Default ${k === 'parallelTasks' && !d ? 'all' : d}`}</span>
      </div>
    </div>
  );
}

export default function Settings() {
  const view = useStore(s => s.tab === 'themes' ? 'themes' : 'settings');
  const setView = tab => setState({ tab });
  const [data, setData] = useState(null); // { limits, vals, snap }
  const [vals, setVals] = useState(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState('providers');
  const [saved, setSaved] = useState('');
  const auth = useAuth();
  const [upd, updAct] = useUpdates();
  const form = useRef(null), search = useRef(null);
  const limits = data?.limits || {};

  const load = useCallback(async () => {
    const [s, lim] = await Promise.all([call('settings:get'), call('settings:limits').catch(() => ({}))]);
    const limits = lim || {}, v = initVals(s, limits);
    setData({ limits, snap: JSON.stringify(collect(v, limits)) }); setVals(v);
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const dirty = !!(data && vals) && JSON.stringify(collect(vals, limits)) !== data.snap;
  const setF = (k, x) => setVals((v) => ({ ...v, f: { ...v.f, [k]: x } }));

  const save = useCallback(async () => {
    if (!data || !vals) return;
    const bad = [...(form.current?.querySelectorAll('input') || [])].find((i) => !i.checkValidity());
    if (bad) { setQ(''); setTimeout(() => bad.reportValidity(), 0); return; }
    const payload = collect(vals, limits);
    if (payload.disabledProviders.length >= ALL_PROVIDERS.length) { alert('At least one provider must remain enabled.'); return; }
    await call('settings:save', { ...payload, edit: true });
    setState((s) => ({ cfg: { ...s.cfg, disabledProviders: payload.disabledProviders } }));
    setData({ ...data, snap: JSON.stringify(payload) });
    setSaved('Saved');
  }, [data, vals, limits]);
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(''), 1500); return () => clearTimeout(t); }, [saved]);
  const saveRef = useRef(save); saveRef.current = save;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirtyRef.current) saveRef.current(); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);

  // search: a section shows when its title matches, or any of its rows/limits do
  const ql = q.trim().toLowerCase();
  const hit = (title, text) => !ql || title.toLowerCase().includes(ql) || text.toLowerCase().includes(ql);
  const rowHit = (title, text) => !ql || title.toLowerCase().includes(ql) || text.toLowerCase().includes(ql);
  const T = {
    prov: 'Enabled providers Disabled providers never run and leave the lead menu Claude Code Codex Antigravity',
    models: 'Connected models Ollama, OpenRouter, DeepSeek, Kimi, GLM and more, picked from the chat model menu',
    mode: 'Mode for new sessions Each chat can still switch from its mode menu ' + SET_MODES.map((m) => m.join(' ')).join(' '),
    cmds: 'Commands The CLI each provider runs, plus flags added to every run',
    cwd: 'Working directory Used by chats outside a project',
    sounds: 'Try the sounds Preview an alert without running an agent ' + SOUNDS.map((x) => x[1]).join(' '),
    upd: 'Relay updates ' + (upd.state || ''),
  };
  const limHit = (t, [, , , label, hint, , unit]) => rowHit(t, `${label} ${hint} ${unit || ''}`);
  const groups = useMemo(() => {
    const g = {};
    for (const [k, v] of Object.entries(limits)) (g[v[5] || 'Other'] ||= []).push([k, v]);
    return g;
  }, [limits]);
  const vis = {
    profile: hit('Profile', 'Display name Change picture Remove'),
    providers: hit('Providers', T.prov + T.models), agents: hit('Agents', T.mode + T.cmds + T.cwd),
    limits: hit('Limits', Object.values(limits).map((v) => v[3] + v[4]).join(' ')),
    notifications: hit('Notifications', T.sounds), updates: hit('Updates', T.upd),
  };
  const navSecs = SET_SECS.filter(([id]) => data && vis[id]);
  const any = navSecs.length > 0;
  const showRow = (sec, t) => !ql || sec.toLowerCase().includes(ql) || t.toLowerCase().includes(ql);

  // the section at the top of the scrolled page is the active one in the side list
  const spy = useCallback(() => {
    const main = document.querySelector('main'); if (!main) return;
    const top = Math.max(main.getBoundingClientRect().top, 0) + 96;
    let cur = null;
    for (const [id] of navSecs) { const el = document.getElementById('set-' + id); if (el && el.getBoundingClientRect().top <= top) cur = id; }
    if (main.scrollHeight > main.clientHeight + 4 && main.scrollTop + main.clientHeight >= main.scrollHeight - 4) cur = navSecs.at(-1)?.[0] || cur; // the last section never reaches the top
    setActive(cur || navSecs[0]?.[0] || 'providers');
  }, [navSecs.map((x) => x[0]).join()]); // eslint-disable-line
  useEffect(() => {
    if (view !== 'settings') return;
    document.addEventListener('scroll', spy, { passive: true, capture: true }); // main (or the window) may be the scroller
    const t = setTimeout(spy, 50);
    return () => { document.removeEventListener('scroll', spy, true); clearTimeout(t); };
  }, [spy, view, data]);

  const toggleProv = (k) => setVals((v) => ({ ...v, disabled: v.disabled.includes(k) ? v.disabled.filter((x) => x !== k) : [...v.disabled, k] }));
  const resetAll = () => setVals((v) => ({ ...v, l: Object.fromEntries(Object.entries(limits).map(([k, d]) => [k, String(d[0])])) }));
  const pickCwd = async () => { const p = await call('settings:pickFolder'); if (p) setF('cwd', p); };

  if (view === 'themes') return <><TabPair view={view} setView={setView} /><Themes /></>;
  return (
    <>
      <TabPair view={view} setView={setView} />
      <div className="page-head">
        <div><h2>Settings</h2><p>How Relay runs your agents on this computer</p></div>
        <div className="set-tools">
          <span id="saved" className="saved" role="status"><AnimatePresence>{saved && <motion.span key="s" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{saved}</motion.span>}</AnimatePresence></span>
          <button className={'b ' + (upd.state === 'ready' ? 'primary' : 'ghost')} id="setUpd" type="button" disabled={upd.state === 'checking' || upd.state === 'downloading'} onClick={updAct}>{UPD_LABEL(upd)}</button>
          <input id="setSearch" ref={search} type="search" placeholder="Find a setting" aria-label="Find a setting" spellCheck={false} autoComplete="off" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && q) setQ(''); }} />
        </div>
      </div>
      <div className="set-wrap">
        <div className="set-nav" id="setNav" role="navigation" aria-label="Settings sections">
          {navSecs.map(([id, n]) => (
            <button key={id} type="button" className={active === id ? 'on' : ''} data-sec={id} onClick={() => { setActive(id); document.getElementById('set-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              {active === id && <motion.span  className="sn-ind" transition={spring} />}
              <span>{n}</span>
            </button>
          ))}
        </div>
        <div className="set-main">
          {vals && (
            <>
              {vis.profile && <div id="set-profile"><Profile /><Cowork /></div>}
              <div id="settingsForm" ref={form} style={{ display: 'contents' }}>
                {vis.providers && (
                  <Sec id="providers" title="Providers" sub="Which agents Relay may run, and extra models you connect">
                    <Row label="Enabled providers" hint="Disabled providers never run and leave the lead menu" show={showRow('Providers', T.prov)}>
                      <div className="set-provs">
                        {ALL_PROVIDERS.map(([k, name, lg, col]) => (
                          <div className="set-prov" key={k}>
                            <label htmlFor={'prov-enable-' + k} className="set-prov-l">
                              <input type="checkbox" id={'prov-enable-' + k} checked={!vals.disabled.includes(k)} onChange={() => toggleProv(k)} />
                              <span className="set-ic"><Logo name={lg} size={14} color={col} /></span>{name}
                            </label>
                            <AuthChip k={k} auth={auth} />
                          </div>
                        ))}
                      </div>
                    </Row>
                    <Row label="Connected models" hint="Ollama, OpenRouter, DeepSeek, Kimi, GLM and more, picked from the chat model menu" show={showRow('Providers', T.models)}>
                      <ConnectedModels auth={auth} />
                    </Row>
                  </Sec>
                )}
                {vis.agents && (
                  <Sec id="agents" title="Agents" sub="How new sessions start and how each CLI is launched">
                    <Row label="Mode for new sessions" hint="Each chat can still switch from its mode menu" show={showRow('Agents', T.mode)}>
                      <div className="set-modes" role="radiogroup" aria-label="Mode for new sessions">
                        {SET_MODES.map(([k, n, d]) => (
                          <label className="set-mode" key={k}>
                            <input type="radio" name="s-mode" value={k} checked={vals.mode === k} onChange={() => setVals({ ...vals, mode: k })} />
                            {vals.mode === k && <motion.span layoutId="mode-ring" transition={spring} style={{ position: 'absolute', inset: -1, border: '1px solid var(--claude)', borderRadius: 12, pointerEvents: 'none' }} />}
                            <b>{n}</b><span>{d}</span>
                          </label>
                        ))}
                      </div>
                    </Row>
                    <Row label="Commands" hint="The CLI each provider runs, plus flags added to every run" show={showRow('Agents', T.cmds)}>
                      <div className="set-cli">
                        <span className="set-cli-h" /><span className="set-cli-h">Command</span><span className="set-cli-h">Extra args</span>
                        {ALL_PROVIDERS.flatMap(([k, name, lg, col]) => [
                          <span className="set-cli-n" key={k}><span className="set-ic"><Logo name={lg} size={14} color={col} /></span>{name}</span>,
                          <input key={k + 'c'} id={`s-${k}Cmd`} className="mono-in" spellCheck={false} aria-label={name + ' command'} placeholder={k} value={vals.f[k + 'Cmd']} onChange={(e) => setF(k + 'Cmd', e.target.value)} />,
                          <input key={k + 'a'} id={`s-${k}Args`} className="mono-in" spellCheck={false} aria-label={name + ' extra args'} placeholder={CLI_PH[k] || 'none'} value={vals.f[k + 'Args']} onChange={(e) => setF(k + 'Args', e.target.value)} />,
                        ])}
                      </div>
                    </Row>
                    <Row id="s-cwd" label="Working directory" hint="Used by chats outside a project" show={showRow('Agents', T.cwd)}>
                      <div className="set-inline">
                        <input id="s-cwd" className="mono-in" spellCheck={false} aria-label="Working directory" placeholder="Project folder" value={vals.f.cwd} onChange={(e) => setF('cwd', e.target.value)} />
                        <button type="button" className="b" onClick={pickCwd}>Browse</button>
                      </div>
                    </Row>
                  </Sec>
                )}
                {vis.limits && (
                  <Sec id="limits" title="Limits" sub="How much the team may do per task. A dot marks a value you changed" extra={<button type="button" className="b ghost" onClick={resetAll}>Reset all</button>}>
                    {Object.entries(groups).map(([g, items]) => {
                      const shown = items.filter(([, v]) => showRow('Limits', `${v[3]} ${v[4]} ${v[6] || ''}`));
                      return shown.length > 0 && (
                        <div className="lim-group" key={g}>
                          <h4>{g}</h4>
                          <div className="lim-grid">
                            {shown.map(([k, v]) => <Limit key={k} k={k} def={v} show value={vals.l[k]} onChange={(x) => setVals((p) => ({ ...p, l: { ...p.l, [k]: x } }))} />)}
                          </div>
                        </div>
                      );
                    })}
                  </Sec>
                )}
                {vis.notifications && (
                  <Sec id="notifications" title="Notifications" sub="Distinct chimes for finished responses and input requests. Background alerts also show a taskbar badge and desktop notification.">
                    <Row label="Try the sounds" hint="Preview an alert without running an agent" show={showRow('Notifications', T.sounds)}>
                      {SOUNDS.map(([kind, text]) => <button key={kind} type="button" className="b" onClick={() => call('notify:test', kind).catch((e) => alert(e.message))}>{text}</button>)}
                    </Row>
                  </Sec>
                )}
                {vis.updates && (
                  <Sec id="updates" title="Updates" sub="Relay downloads new versions in the background and installs them when you restart">
                    <div className="upd-wrap" style={{ marginTop: 8 }}><UpdateCard u={upd} act={updAct} /></div>
                  </Sec>
                )}
              </div>
            </>
          )}
          {data && !any && <div className="set-empty" id="setEmpty">No settings match</div>}
          <AnimatePresence>
            {dirty && (
              <motion.div className="set-bar" id="setBar" role="region" aria-label="Unsaved changes" initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1, transition: spring }} exit={{ opacity: 0, y: 16, transition: { duration: 0.15 } }}>
                <span>Unsaved changes</span>
                <button className="b ghost" id="discardSettings" type="button" onClick={() => load()}>Discard</button>
                <button className="b primary" id="saveSettings" type="button" onClick={save}>Save<span className="kc">Ctrl S</span></button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
