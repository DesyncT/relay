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
      <div className="cw-head">
        <h3>Co-work</h3>
        <p className="hint">Link two Relays directly with a 9-digit code. Everything is encrypted and nothing goes through anyone else.</p>
      </div>

      <div className="cw-sec" aria-labelledby="cw-subs">
        <h4 id="cw-subs">My subscriptions</h4>
        <p className="hint">Choose what {them} may run on your account. Claude and Codex can work in the background using a temporary project copy. Edits return automatically with Undo.</p>
        <div className="cw-rows" role="group" aria-label={`Which of my subscriptions ${them} may use`}>
          {PROVS.map(([k, n]) => {
            const off = st.lendable?.[k] === false;
            return (
              <label className={'cw-row' + (off ? ' off' : '')} key={k}>
                <span className="cw-row-l"><b>{n}</b><span className="hint">{off ? 'Update Relay to enable sharing.' : `Let ${them} use my ${n}`}</span></span>
                <input type="checkbox" role="switch" disabled={off || busy} checked={!!st.lend?.[k] && !off} onChange={(e) => act('cowork:lend', k, e.target.checked)} />
              </label>
            );
          })}
        </div>
        <p className="hint">Pick your partner’s agent in any chat. No shared chat is needed. Project files travel encrypted; secret files are excluded and temporary copies are deleted afterward. Both Relays must stay running and connected.</p>
      </div>

      {st.state === 'reconnecting' && <p className="hint" role="status">Connection interrupted. Relay is reconnecting automatically. Interrupted turns stay stopped; retry after reconnecting.</p>}
      {linked && (
        <div className="cw-sec" aria-labelledby="cw-linked">
          <h4 id="cw-linked">Linked with {st.peer.name}</h4>
          <p role="status" className="hint">
            {st.peer.lends?.length ? `${st.peer.name} lets you use their ${st.peer.lends.map((k) => PROVS.find((p) => p[0] === k)?.[1] || k).join(' and ')}.` : `${st.peer.name} is not sharing any subscription right now.`}
            {st.room ? ` Shared chat is live (${st.room.role === 'host' ? 'your project' : 'their project copy'}).` : st.pending ? ' Shared chat invite is waiting for an answer.' : ''}
          </p>
          <div className="cw-stats"><span><i>Lent</i>{fmt(st.lent)}</span><span><i>Borrowed</i>{fmt(st.borrowed)}</span></div>
          <div className="row-actions">
            {st.room && <button type="button" className="b ghost" onClick={() => act('cowork:unshare')}>End shared chat</button>}
            <button type="button" className="b ghost" onClick={() => act('cowork:leave')}>Disconnect</button>
          </div>
        </div>
      )}

      {st.hosting ? (
        <div className="cw-sec" aria-labelledby="cw-your">
          <h4 id="cw-your">Your code</h4>
          <div className="cw-code" aria-label="Your 9-digit co-work code">{st.code}</div>
          <p className="hint">Send it to your partner. On the same network that is all they need. Over the internet send the full invite, which includes your address ({st.address}). Five wrong guesses retire the code.</p>
          <div className="row-actions">
            <button type="button" className="b" onClick={() => copy('code', st.code)}>{copied === 'code' ? 'Copied' : 'Copy code'}</button>
            <button type="button" className="b" onClick={() => copy('invite', st.invite)}>{copied === 'invite' ? 'Copied' : 'Copy invite'}</button>
            <button type="button" className="b ghost" onClick={() => act('cowork:reset')}>New code</button>
            <button type="button" className="b ghost" onClick={() => act('cowork:stop')}>Stop server</button>
          </div>
        </div>
      ) : !linked && (
        <div className="cw-sec" aria-labelledby="cw-connect">
          <h4 id="cw-connect">Connect</h4>
          <div className="cw-connect">
            <div className="cw-opt">
              <span className="cw-row-l"><b>Share a code</b><span className="hint">Create a code your partner enters on their side.</span></span>
              <button type="button" className="b" disabled={busy} onClick={() => act('cowork:host')}>{st.server ? 'Create a code' : 'Allow and create a code'}</button>
            </div>
            <div className="cw-opt">
              <label className="cw-row-l" htmlFor="cw-join"><b>Join a partner</b><span className="hint">Enter the 9-digit code they sent you.</span></label>
              <div className="cw-join">
                <input id="cw-join" value={code} placeholder="123-456-789" spellCheck={false} autoComplete="off" inputMode="numeric" onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && code.trim() && act('cowork:join', code)} />
                <button type="button" className="b" disabled={busy || !code.trim()} onClick={() => act('cowork:join', code)}>{busy ? 'Connecting…' : 'Join'}</button>
              </div>
            </div>
          </div>
          <p className="hint">In a chat, type <b>/cowork share</b> to work in it together, or <b>/cowork on</b> to let the Spreader also use your partner's subscription.</p>
        </div>
      )}
      {err && <p role="alert" className="hint cw-err">{err}</p>}
    </div>
  );
}
