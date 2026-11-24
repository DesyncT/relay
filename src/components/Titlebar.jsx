import { useEffect, useState } from 'react';
import { call, useIpcEvent } from '../api.js';
import { getState, setState, useStore } from '../store.js';
import { Icon } from './icons.jsx';
import { setMode } from '../theme/themeStore.js';

export const TAB_LABEL = { usage: 'Usage', agents: 'Subagents', rules: 'Rules', skills: 'Skills', settings: 'Settings', themes: 'Appearance' };
const readChat = () => window.ActiveChat || null;

export default function Titlebar() {
  const tab = useStore((s) => s.tab);
  const sbTree = useStore((s) => s.sbTree);
  const [chat, setChat] = useState(readChat);
  const [procs, setProcs] = useState([]);
  const [just, setJust] = useState(false);
  const [light, setLight] = useState(() => document.documentElement.dataset.mode === 'light');
  useEffect(() => { const f = () => setLight(document.documentElement.dataset.mode === 'light'); window.addEventListener('relay-theme', f); return () => window.removeEventListener('relay-theme', f); }, []);


  useEffect(() => {
    document.body.classList.add('tb');
    const sync = () => setChat(readChat() && { ...readChat() });
    window.addEventListener('active-chat', sync);
    call('procs:list').then((l) => setProcs(l || []), () => {});
    return () => { document.body.classList.remove('tb'); window.removeEventListener('active-chat', sync); };
  }, []);
  useIpcEvent('procs', (l) => setProcs(l || []));
  useIpcEvent('workflow:changed', (d) => setChat((c) => (c?.sid === d.sid ? { ...c, easyMode: d.easyMode } : c)));

  const isSuper = !!chat?.easyMode;
  useEffect(() => { setJust(isSuper); }, [isSuper]);
  const sid = chat?.sid || getState().openSid;
  const disabled = !sid || procs.some((p) => p.sid === sid);
  const change = async (enabled) => {
    if (!sid || !!chat?.easyMode === enabled) return;
    try { await call('chat:workflow', sid, enabled); setChat((c) => (c ? { ...c, easyMode: enabled } : c)); } catch (e) { alert(e.message); }
  };
  const title = tab === 'chat' ? sbTree?.sessions.find((s) => s.id === sbTree.active)?.title || 'Chat' : TAB_LABEL[tab] || '';
  const keys = (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key) || disabled) return;
    e.preventDefault();
    const b = e.currentTarget.querySelectorAll('button')[e.key === 'ArrowLeft' ? 0 : 1]; b.focus(); b.click();
  };
  const seg = (on, id, label, tip, path, v) => (
    <button id={id} role="radio" aria-checked={on} disabled={disabled} title={tip} onClick={() => change(v)} className={v && just ? 'just-activated' : ''}>
      <Icon>{path}</Icon><span>{label}</span>
    </button>
  );
  return (
    <div id="tb">
      <div className="tb-brand"><img src="./assets/relay.svg" width="16" height="16" style={{ display: 'block', borderRadius: 4, flex: 'none' }} alt="Relay" /><span>Relay</span></div>
      <span className="tb-sep">/</span>
      <span className="tb-title" id="tbTitle">{title}</span>
      <div className="tb-actions">
        <div className="workflow-toggle" role="radiogroup" aria-label="Session workflow" onKeyDown={keys}>
          {seg(isSuper, 'tbSupercode', 'EasyCode', 'EasyCode: short questions and Spreader quota balancing', <path d="m13 2-9 12h7l-1 8 10-12h-7z" />, true)}
          {seg(!isSuper, 'tbNormal', 'Code', 'Code: direct Claude Code or Codex session in your project', <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16" />, false)}
        </div>
        <button id="tbMode" title={light ? 'Switch to dark mode' : 'Switch to light mode'} aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'} onClick={() => setMode(light ? 'dark' : 'light')}>
          <Icon>{light ? <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}</Icon>
        </button>
        <button id="tbVsc" title="Open this folder in VS Code" aria-label="Open this folder in VS Code" disabled={!sid} onClick={() => call('chat:vscode', sid).catch((e) => alert(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))}>
          <Icon><path d="M16 3 8 12l8 9V3Z" /><path d="m8 12-5 4V8l5 4Z" /></Icon>
        </button>
        <button id="tbScan" title="Rescan usage" aria-label="Rescan usage" onClick={() => { setState({ tab: 'usage' }); setTimeout(() => document.getElementById('rescan')?.click(), 50); }}>
          <Icon><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></Icon>
        </button>
        <button id="tbSettings" title="Settings" aria-label="Settings" onClick={() => setState({ tab: 'settings' })}>
          <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Icon>
        </button>
      </div>
    </div>
  );
}
