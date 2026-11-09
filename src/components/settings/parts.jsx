import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call, useIpcEvent } from '../../api.js';
import { LOGOS as BASE } from '../usage/logos.js';
import { setState } from '../../store.js';
import { spring, ease } from '../../motion.js';

const EXTRA = {
  ollama: 'M7 2.5c-1.2 0-2 1.6-2 4.2v2.6C3.9 10.4 3.3 11.9 3.3 13.6c0 4.2 3.8 7.4 8.7 7.4s8.7-3.2 8.7-7.4c0-1.7-.6-3.2-1.7-4.3V6.7c0-2.6-.8-4.2-2-4.2-1.1 0-1.9 1.4-2.1 3.3-.6-.2-1.2-.3-2-.3s-1.4.1-2 .3C8.9 3.9 8.1 2.5 7 2.5ZM9 12.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Zm6 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z',
  lmstudio: 'M3 4h12v3.5H3zM9 10.25h12v3.5H9zM3 16.5h12V20H3z',
  openrouter: 'M2 11h5.5c1.5 0 2.3-.5 3.3-1.8L12.6 7H16V4l6 4.5-6 4.5v-3h-2.2l-1.8 2.3c-1.2 1.7-3 2.7-4.5 2.7H2v-2.5h5.3c.8 0 1.3-.3 1.8-1-.6.8-1.2 1-2.1 1H2Z',
  groq: 'M12 3a9 9 0 1 0 9 9h-9v3h5.7A6 6 0 1 1 12 6Z',
  xai: 'M3 3h4l14 18h-4ZM21 3h-3.5l-5 6.5 1.8 2.5ZM3 21h3.5l5-6.5-1.8-2.5Z',
  deepseek: 'M2 13c3-6 9-7.5 13-4.5l4-3-1 5c2 1 3 3 3 5-4-2-8-1-11 1-3 2-6.5 1-8-3.5Z',
  moonshot: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  zai: 'M4 4h16v3.5L9.5 17H20v3H4v-3.5L14.5 7H4Z',
  minimax: 'M3 19V5h3l3 7 3-7h3v14h-3v-8l-3 7-3-7v8ZM19 5h2v14h-2Z',
  plug: 'M8.5 2h2v5h3V2h2v5H17v3.5a5 5 0 0 1-4 4.9V19h3v3H8v-3h3v-3.6a5 5 0 0 1-4-4.9V7h1.5Z',
};
const LOGOS = { ...BASE, ...EXTRA };
const LOGO_COLOR = { claude: '#D97757', openai: '#fff', antigravity: '#4E88F5', anthropic: '#D97757', ollama: 'M7 2.5c-1.2 0-2 1.6-2 4.2v2.6C3.9 10.4 3.3 11.9 3.3 13.6c0 4.2 3.8 7.4 8.7 7.4s8.7-3.2 8.7-7.4c0-1.7-.6-3.2-1.7-4.3V6.7c0-2.6-.8-4.2-2-4.2-1.1 0-1.9 1.4-2.1 3.3-.6-.2-1.2-.3-2-.3s-1.4.1-2 .3C8.9 3.9 8.1 2.5 7 2.5ZM9 12.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Zm6 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z', lmstudio: '#8B8BF5', openrouter: '#6D8CF5', groq: '#F55036', xai: '#fff', deepseek: '#4D6BFE', moonshot: '#fff', zai: '#fff', minimax: '#F5426C', plug: '#9a9a9a' };
export const Logo = ({ name, size = 16, color }) => {
  const n = LOGOS[name] ? name : 'generic';
  return <svg viewBox="0 0 24 24" width={size} height={size} fill={color || LOGO_COLOR[n] || '#9a9a9a'} aria-hidden="true" style={{ flex: 'none' }}><path d={LOGOS[n]} /></svg>;
};
const presetLogo = (id) => (LOGOS[id] ? id : id.startsWith('custom') ? 'plug' : 'generic');
export const ALL_PROVIDERS = [['claude', 'Claude Code', 'claude', '#D97757'], ['codex', 'Codex', 'openai', '#fff'], ['antigravity', 'Antigravity', 'antigravity', '#4E88F5']];

const errText = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const prettyMethod = (m) => ({ 'claude.ai': 'Claude.ai', chatgpt: 'ChatGPT' }[String(m).toLowerCase()] || m || 'account');

// account status shared by the provider chips and the connect menu; one poll updates both
export function useAuth() {
  const [st, setSt] = useState(null);
  const ref = useRef(null); ref.current = st;
  const timers = useRef({});
  const refresh = async () => { try { const s = await call('auth:status'); ref.current = s; setSt(s); return s; } catch { return ref.current; } };
  useEffect(() => { refresh(); const t = timers.current; return () => Object.values(t).forEach(clearInterval); }, []);
  const poll = (k) => { // every 3s for up to 2 min, until this provider's state changes
    clearInterval(timers.current[k]);
    const t0 = Date.now(), was = JSON.stringify(ref.current?.[k]);
    timers.current[k] = setInterval(async () => {
      const s = await refresh();
      if (JSON.stringify(s?.[k]) !== was || Date.now() - t0 > 120000) clearInterval(timers.current[k]);
    }, 3000);
  };
  const login = (k) => call('auth:login', k).then(() => poll(k)).catch(() => {});
  const install = (k) => call('auth:install', k).then(() => poll(k)).catch(() => {});
  const logout = async (k) => { try { const s = await call('auth:logout', k); ref.current = s; setSt(s); } catch { refresh(); } };
  return { st, login, install, logout };
}

const Btn = ({ danger, ...p }) => <button type="button" className={'b ghost' + (danger ? ' danger' : '')} style={{ height: 24, padding: '0 8px', fontSize: 12, position: 'relative', zIndex: 1 }} {...p} />;

export function AuthChip({ k, auth }) {
  const { st, login, install, logout } = auth, s = st?.[k];
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false);
  let key, body;
  if (!s) { key = 'chk'; body = 'Checking…'; }
  else if (!s.installed) {
    key = 'ni';
    body = k === 'antigravity' ? 'Not installed' : <>{(k === 'codex' ? 'Codex' : 'Claude Code') + ' CLI not installed'}<Btn onClick={() => install(k)}>Install CLI</Btn></>;
  } else if (k === 'antigravity') { key = 'inst'; body = 'Installed'; }
  else if (s.loggedIn) {
    if (busy) { key = 'out'; body = 'Signing out…'; }
    else if (confirm) { key = 'cf'; body = <>Sign out?<Btn danger onClick={async () => { setBusy(true); await logout(k); setBusy(false); setConfirm(false); }}>Yes</Btn><Btn onClick={() => setConfirm(false)}>Cancel</Btn></>; }
    else { key = 'in'; body = <><span className="auth-dot">●</span>{'Signed in · ' + prettyMethod(s.method)}<Btn onClick={() => setConfirm(true)}>Sign out</Btn></>; }
  } else { key = 'so'; body = <>Signed out<Btn onClick={() => login(k)}>Sign in</Btn></>; }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span key={key} className="auth-chip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease } }} exit={{ opacity: 0, transition: { duration: 0.08 } }}>{body}</motion.span>
    </AnimatePresence>
  );
}

const SUBS = [['claude', 'Claude (Pro/Max)', 'via Claude Code CLI', 'claude'], ['codex', 'ChatGPT (Plus/Pro)', 'via Codex CLI', 'openai']];
const GROUPS = ['Local', 'API key', 'Custom'];
const groupOf = (p) => (p.local ? 'Local' : p.id.startsWith('custom') ? 'Custom' : 'API key');
const Badge = ({ ok, children }) => <span className={'conn-badge' + (ok ? ' ok' : '')}><i />{children}</span>;

function ConnForm({ p, det, onDone }) {
  const [url, setUrl] = useState(p.baseUrl || ''), [key, setKey] = useState(''), [mods, setMods] = useState('');
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const needKey = !p.local && !det.presets?.[p.id]?.keyFound, showKey = needKey || (!p.local && !p.envKey);
  const go = async () => {
    setBusy(true); setErr('');
    try { await call('models:connect', { preset: p.id, baseUrl: url, key, models: mods }); await onDone(); }
    catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <motion.div className="conn-form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease }}>
      <div className="hint">{p.name + ' · ' + (p.engine === 'codex' ? 'runs through the Codex CLI (OpenAI Responses API)' : 'runs through the Claude CLI (Anthropic API)')}</div>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://host/v1" aria-label="Base URL" />
      {showKey && <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" aria-label="API key" placeholder={p.envKey ? 'API key (or set ' + p.envKey + ')' : 'API key (optional)'} />}
      <input value={mods} onChange={(e) => setMods(e.target.value)} aria-label="Model names" placeholder="Model name(s), only if the endpoint cannot list them" />
      {err && <div className="warn" style={{ marginTop: 0 }}>{err}</div>}
      <div><button type="button" className="b primary" disabled={busy} onClick={go}>{busy ? 'Connecting…' : 'Connect'}</button></div>
    </motion.div>
  );
}

function ConnRow({ c, reload }) {
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <motion.div layout className="conn-row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring}>
      <Logo name={presetLogo(c.preset)} />
      <span style={{ flex: 1, minWidth: 0 }}>{c.name}</span>
      <span className="hint" style={{ margin: 0, color: msg ? 'var(--negative)' : undefined }}>{msg || c.models.length + ' models' + (c.hasKey ? ' · key saved' : '')}</span>
      <button type="button" className="b ghost" disabled={busy} style={{ height: 28, padding: '0 10px', position: 'relative', zIndex: 1 }}
        onClick={async () => { setBusy(true); setMsg(null); try { await call('models:refresh', c.id); await reload(); } catch (e) { setMsg(errText(e)); } setBusy(false); }}>{busy ? 'Reconnecting…' : 'Reconnect'}</button>
      <button type="button" className="b ghost danger" style={{ height: 28, padding: '0 10px', position: 'relative', zIndex: 1 }}
        onClick={async () => { if (!armed) return setArmed(true); await call('models:remove', c.id); reload(); }}>{armed ? 'Confirm?' : 'Disconnect'}</button>
    </motion.div>
  );
}

export function ConnectedModels({ auth }) {
  const [d, setD] = useState(null), [open, setOpen] = useState(false), [form, setForm] = useState(null);
  const wrap = useRef(null);
  const load = async () => {
    const [presets, det, conns] = await Promise.all([call('models:presets'), call('models:detect'), call('models:list')]);
    setState({ conns }); // shared with the chat model menu
    setD({ presets, det, conns }); setForm(null);
  };
  useEffect(() => { load().catch(() => {}); }, []);
  useEffect(() => {
    if (!open) return;
    const off = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('click', off);
    return () => document.removeEventListener('click', off);
  }, [open]);
  if (!d) return <div style={{ margin: 0 }} />;
  const connected = new Set(d.conns.map((c) => c.preset));
  return (
    <div>
      <AnimatePresence initial={false}>{d.conns.map((c) => <ConnRow key={c.id} c={c} reload={load} />)}</AnimatePresence>
      <div ref={wrap} style={{ position: 'relative', display: 'inline-block' }}>
        <button type="button" className="b" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>+ Connect</button>
        <AnimatePresence>
          {open && (
            <motion.div className="conn-menu" role="menu" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1, transition: spring }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
              <div className="conn-grp">Subscriptions</div>
              {SUBS.map(([k, name, sub, lg]) => {
                const s = auth.st?.[k];
                return (
                  <button key={k} type="button" className="mi" role="menuitem" onClick={() => { setOpen(false); if (!s?.installed) auth.install(k); else if (!s.loggedIn) auth.login(k); }}>
                    <Logo name={lg} /><span style={{ whiteSpace: 'nowrap' }}>{name}</span><span className="d" style={{ flex: 'none' }}>{sub}</span>
                    {s && (!s.installed ? <Badge>Not installed</Badge> : s.loggedIn ? <Badge ok>Connected</Badge> : <Badge>Sign in</Badge>)}
                  </button>
                );
              })}
              {GROUPS.map((g) => (
                <div key={g}>
                  <div className="conn-grp">{g}</div>
                  {d.presets.filter((x) => groupOf(x) === g).map((p) => {
                    const x = d.det.presets?.[p.id] || {};
                    const b = connected.has(p.id) ? <Badge ok>Connected</Badge> : p.local ? (x.running ? <Badge ok>Running</Badge> : <Badge>Not running</Badge>) : x.keyFound ? <Badge ok>Key found</Badge> : null;
                    return (
                      <button key={p.id} type="button" className="mi" role="menuitem" onClick={() => { setOpen(false); setForm(p); }}>
                        <Logo name={presetLogo(p.id)} /><span style={{ whiteSpace: 'nowrap' }}>{p.name.replace(/ \(local\)$/, '')}</span>{b}
                      </button>
                    );
                  })}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>{form && <ConnForm key={form.id} p={form} det={d.det} onDone={load} />}</AnimatePresence>
    </div>
  );
}

// ---- app updates (updater.js) ----
const mb = (n) => (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB';
const noteText = (html) => { const t = document.createElement('template'); t.innerHTML = String(html).replace(/<\/(li|p|h\d)>|<br\s*\/?>/gi, '\n'); return t.content.textContent.replace(/\n{3,}/g, '\n\n').trim(); };
export const UPD_LABEL = (u) => ({ checking: 'Checking', none: 'Up to date', downloading: `Downloading ${u.percent || 0}%`, ready: 'Restart to update', error: 'Check failed, retry' }[u.state] || 'Check for updates');

export function useUpdates() {
  const [u, setU] = useState({ state: 'idle' });
  useEffect(() => { call('update:get').then(setU).catch(() => {}); }, []);
  useIpcEvent('update:state', (d) => setU((p) => ({ ...p, ...d })));
  const act = () => { if (u.state === 'ready') return call('update:install'); setU({ ...u, state: 'checking' }); call('update:check'); };
  return [u, act];
}

export function UpdateCard({ u, act }) {
  const { state, version: v, percent, error, notes, speed, total, checkedAt, packaged, current } = u;
  const ago = checkedAt ? ' · checked ' + new Date(checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const status = packaged === false ? 'Updates install from the packaged app' : {
    checking: 'Checking for updates', none: 'Up to date' + ago,
    downloading: `Downloading ${v} · ${percent || 0}%${total ? ` of ${mb(total)}` : ''}${speed ? ` · ${mb(speed)}/s` : ''}`,
    ready: `Version ${v} is ready to install`, error: 'Update check failed' + ago,
  }[state] || 'Checks every 30 minutes';
  return (
    <div className="upd" id="updCard">
      <div className="upd-h">
        <div><b>{'Relay ' + (current || '')}</b><span className={'upd-s' + (state === 'error' ? ' bad' : '')} role="status">{status}</span></div>
        {state === 'ready'
          ? <button type="button" className="b primary" onClick={() => call('update:install')}>Restart and install</button>
          : <button type="button" className="b" disabled={state === 'checking' || state === 'downloading' || packaged === false} onClick={act}>{state === 'error' ? 'Retry' : 'Check now'}</button>}
      </div>
      {state === 'downloading' && <div className="upd-bar"><motion.i initial={false} animate={{ width: (percent || 0) + '%' }} transition={{ duration: 0.3, ease }} /></div>}
      {state === 'error' && error && <p className="upd-err">{error}</p>}
      {(state === 'downloading' || state === 'ready') && notes && <><small>{`What's new in ${v}`}</small><p className="upd-notes">{noteText(notes)}</p></>}
      {state === 'ready' && <p className="upd-fine">Open chats are saved first and pick up where they left off. Closing Relay also installs it</p>}
    </div>
  );
}
