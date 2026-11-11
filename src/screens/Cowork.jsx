import React, { useEffect, useState } from 'react';
import { call, useIpcEvent } from '../api.js';

const fmt = (t) => `${t.runs} run${t.runs === 1 ? '' : 's'} · ${t.tokens >= 1e3 ? (t.tokens / 1e3).toFixed(1) + 'k' : t.tokens} tokens${t.cost > 0 ? ` · $${t.cost.toFixed(2)}` : ''}`;
const PROVS = [['claude', 'Claude'], ['codex', 'Codex']];
const clean = (e) => String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// Link with another person's Relay. Each person decides, per provider, whether the other may use their subscription;
// the chat's spend strip counts everyone's tokens separately.
export default function Cowork() {
  const [st, setSt] = useState(null), [code, setCode] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState('');
  useEffect(() => { call('cowork:state').then(setSt).catch(() => {}); }, []);
  useIpcEvent('cowork:state', setSt);
  const act = async (ch, ...a) => { setErr(''); setBusy(true); try { setSt(await call(ch, ...a)); } catch (e) { setErr(clean(e)); } setBusy(false); };
  const copy = (key, text) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500); };
  if (!st) return null;
  const them = st.peer?.name || 'my partner', linked = st.state === 'linked';
  return (
    <div className="panel form" id="set-cowork">
      <h3>Co-work</h3>
      <p className="hint">Link two Relays directly with a 9-digit code (encrypted, nothing goes through anyone else). Type <b>/cowork share</b> in a chat to work in it together, or <b>/cowork on</b> to let the Spreader also use your partner's subscription there.</p>

      <h4>My subscriptions</h4>
      <div className="cw-lend" role="group" aria-label={`Which of my subscriptions ${them} may use`}>
        {PROVS.map(([k, n]) => (
          <label className="set-prov-l" key={k}>
            <input type="checkbox" checked={st.lend?.[k] !== false} onChange={(e) => act('cowork:lend', k, e.target.checked)} /> Let {them} use my {n}
          </label>
        ))}
      </div>
      <p className="hint">Off means that provider is never offered or run for your partner. Their runs only see the chat, never your files (shared chats work on a project copy instead).</p>

      {linked && (
        <>
          <h4>Linked with {st.peer.name}</h4>
          <p role="status" className="hint">
            {st.peer.lends?.length ? `${st.peer.name} lets you use their ${st.peer.lends.map((k) => PROVS.find((p) => p[0] === k)?.[1] || k).join(' and ')}.` : `${st.peer.name} is not sharing any subscription right now.`}
            {st.room ? ` Shared chat is live (${st.room.role === 'host' ? 'your project' : 'their project copy'}).` : st.pending ? ' Shared chat invite is waiting for an answer.' : ''}
          </p>
          <div className="cw-stats hint"><span>Lent to {st.peer.name}: {fmt(st.lent)}</span><span>Borrowed from {st.peer.name}: {fmt(st.borrowed)}</span></div>
          <div className="row-actions">
            {st.room && <button type="button" className="b ghost" onClick={() => act('cowork:unshare')}>End shared chat</button>}
            <button type="button" className="b ghost" onClick={() => act('cowork:leave')}>Disconnect</button>
          </div>
        </>
      )}

      {st.hosting ? (
        <>
          <h4>Your code</h4>
          <div className="cw-code" aria-label="Your 9-digit co-work code">{st.code}</div>
          <p className="hint">Send it to your partner. On the same network that is all they need; over the internet send the full invite, which includes your address ({st.address}). Five wrong guesses retire the code.</p>
          <div className="row-actions">
            <button type="button" className="b" onClick={() => copy('code', st.code)}>{copied === 'code' ? 'Copied' : 'Copy code'}</button>
            <button type="button" className="b" onClick={() => copy('invite', st.invite)}>{copied === 'invite' ? 'Copied' : 'Copy invite'}</button>
            <button type="button" className="b ghost" onClick={() => act('cowork:reset')}>New code</button>
            <button type="button" className="b ghost" onClick={() => act('cowork:stop')}>Stop server</button>
          </div>
        </>
      ) : !linked && (
        <>
          <h4>Connect</h4>
          <div className="row-actions"><button type="button" className="b" disabled={busy} onClick={() => act('cowork:host')}>{st.server ? 'Create a code' : 'Allow and create a code'}</button></div>
          <label htmlFor="cw-join">or enter your partner's code</label>
          <input id="cw-join" value={code} placeholder="123-456-789" spellCheck={false} autoComplete="off" onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && code.trim() && act('cowork:join', code)} />
          <div className="row-actions"><button type="button" className="b" disabled={busy || !code.trim()} onClick={() => act('cowork:join', code)}>{busy ? 'Connecting…' : 'Join'}</button></div>
        </>
      )}
      {err && <p role="alert" className="hint" style={{ color: 'var(--danger, #e5484d)' }}>{err}</p>}
    </div>
  );
}
