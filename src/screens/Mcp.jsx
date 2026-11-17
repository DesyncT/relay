import React, { useEffect, useState } from 'react';
import { call, useIpcEvent } from '../api.js';

const clean = (e) => String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// Relay as an MCP server: other tools (Claude Code, Codex, editors) connect over localhost to start sessions and read chats.
export default function Mcp() {
  const [st, setSt] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState('');
  useEffect(() => { call('mcp:state').then(setSt).catch(() => {}); }, []);
  useIpcEvent('mcp:state', setSt);
  const run = async (ch) => { setErr(''); setBusy(true); try { setSt(await call(ch)); } catch (e) { setErr(clean(e)); } setBusy(false); };
  const copy = (key, text) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500); };
  if (!st) return null;
  const claudeCmd = `claude mcp add --transport http relay ${st.url} --header "Authorization: Bearer ${st.token}"`;
  const json = JSON.stringify({ mcpServers: { relay: { type: 'http', url: st.url, headers: { Authorization: `Bearer ${st.token}` } } } }, null, 2);
  return (
    <div className="panel form" id="set-mcp">
      <div className="cw-head">
        <h3>MCP server</h3>
        <p className="hint">Let other tools drive Relay. Anything connected can list projects, start sessions, send messages and read chats on this computer.</p>
      </div>
      {!st.running ? (
        <div className="row-actions"><button type="button" className="b" disabled={busy} onClick={() => run('mcp:start')}>Turn on</button></div>
      ) : (
        <>
          <div className="mcp-grid">
            <div className="mcp-cell"><span className="mcp-k">Address</span><code className="mcp-v">{st.url}</code></div>
            <div className="mcp-cell"><span className="mcp-k">Token</span><code className="mcp-v">{st.token}</code></div>
          </div>
          <p className="hint">Only this computer can reach it, and every request needs the token. Tools: {st.tools.join(', ')}.</p>
          <div className="row-actions">
            <button type="button" className="b" onClick={() => copy('claude', claudeCmd)}>{copied === 'claude' ? 'Copied' : 'Copy Claude Code command'}</button>
            <button type="button" className="b" onClick={() => copy('json', json)}>{copied === 'json' ? 'Copied' : 'Copy JSON config'}</button>
            <button type="button" className="b ghost" disabled={busy} onClick={() => run('mcp:rotate')}>New token</button>
            <button type="button" className="b ghost" disabled={busy} onClick={() => run('mcp:stop')}>Turn off</button>
          </div>
        </>
      )}
      {err && <p role="alert" className="hint cw-err">{err}</p>}
    </div>
  );
}
