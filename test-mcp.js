'use strict';
const assert = require('node:assert/strict');
const http = require('http');
const { createMcp } = require('./mcp');

// A fake app: two sessions, one busy until the first poll, and a message log.
const sessions = [{ id: 's1', projectId: 'p1', title: 'Alpha', created: 1, updated: 5 }, { id: 's2', projectId: 'p2', title: 'Beta', created: 2, updated: 9 }];
const history = { s1: [{ from: 'user', at: 10, text: 'hi' }, { from: 'claude', at: 20, text: 'hello' }] };
let working = [], sent = [], active = null;
const handlers = {
  'projects:list': () => [{ id: 'p1', name: 'One', path: 'C:/one', collapsed: false }, { id: 'p2', name: 'Two', path: 'C:/two' }],
  'sessions:tree': () => ({ sessions, projects: [] }),
  'sessions:create': (pid, title) => { const s = { id: 's3', projectId: pid, title: title || 'New session' }; sessions.push(s); history.s3 = []; return s; },
  'sessions:setActive': (id) => { active = id; },
  'sessions:working': () => working,
  'chat:history': (sid) => { if (!history[sid]) throw new Error('unknown session'); return history[sid]; },
  'chat:info': (sid) => ({ title: sessions.find((s) => s.id === sid)?.title, project: { name: 'One', path: 'C:/one' } }),
  'chat:send': (sid, text) => { sent.push([sid, text]); working = [sid]; setTimeout(() => { history[sid].push({ from: 'claude', at: Date.now() + 1, text: 'reply to ' + text }); working = []; }, 700); },
};
const m = createMcp({ port: 0, token: 'tok', invoke: async (ch, args) => { if (!handlers[ch]) throw new Error('Unknown request'); return handlers[ch](...args); } });

const post = (port, body, headers = {}) => new Promise((res, rej) => {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (resp) => { const p = []; resp.on('data', (c) => p.push(c)); resp.on('end', () => res({ status: resp.statusCode, body: Buffer.concat(p).toString() })); });
  r.on('error', rej); r.end(data);
});
const AUTH = { authorization: 'Bearer tok' };
const rpc = async (port, method, params, id = 1) => { const r = await post(port, { jsonrpc: '2.0', id, method, params }, AUTH); assert.equal(r.status, 200, r.body); return JSON.parse(r.body); };
const tool = async (port, name, args) => { const r = await rpc(port, "tools/call", { name, arguments: args }); assert.ok(!r.error, JSON.stringify(r.error)); const text = r.result.content[0].text; let data; try { data = JSON.parse(text); } catch { data = text; } return { isError: r.result.isError, data }; };

(async () => {
  const st = await m.start(), port = st.port;
  assert.equal(st.url, `http://127.0.0.1:${port}/mcp`);
  // auth
  assert.equal((await post(port, {})).status, 401);
  assert.equal((await post(port, {}, { authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await post(port, 'not json', AUTH)).status, 400);
  // handshake
  const init = await rpc(port, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't' } });
  assert.equal(init.result.serverInfo.name, 'relay'); assert.ok(init.result.capabilities.tools);
  assert.equal((await post(port, { jsonrpc: '2.0', method: 'notifications/initialized' }, AUTH)).status, 202);
  const list = await rpc(port, 'tools/list');
  assert.deepEqual(list.result.tools.map((t) => t.name), ['list_projects', 'list_sessions', 'start_session', 'send_message', 'read_chat', 'session_status']);
  assert.equal((await rpc(port, 'nope')).error.code, -32601);
  // tools
  assert.deepEqual((await tool(port, 'list_projects')).data, [{ id: 'p1', name: 'One', path: 'C:/one' }, { id: 'p2', name: 'Two', path: 'C:/two' }]);
  assert.deepEqual((await tool(port, 'list_sessions')).data.map((s) => s.id), ['s2', 's1']);
  assert.deepEqual((await tool(port, 'list_sessions', { projectId: 'p1' })).data.map((s) => s.id), ['s1']);
  const started = await tool(port, 'start_session', { projectId: 'p2', title: 'From MCP' });
  assert.deepEqual(started.data, { id: 's3', projectId: 'p2', title: 'From MCP' }); assert.equal(active, 's3');
  assert.ok((await tool(port, 'start_session', {})).isError);
  const read = await tool(port, 'read_chat', { sessionId: 's1', limit: 1 });
  assert.deepEqual(read.data, { total: 2, messages: [{ from: 'claude', at: 20, text: 'hello' }] });
  assert.equal((await tool(port, 'read_chat', { sessionId: 's1', after: 15 })).data.messages.length, 1);
  assert.ok((await tool(port, 'read_chat', { sessionId: 'zzz' })).isError);
  const quick = await tool(port, 'send_message', { sessionId: 's3', text: 'go' });
  assert.equal(quick.data.sent, true); assert.deepEqual(sent, [['s3', 'go']]);
  await new Promise((r) => setTimeout(r, 800));
  const waited = await tool(port, 'send_message', { sessionId: 's3', text: 'again', waitSeconds: 5 });
  assert.equal(waited.data.done, true); assert.deepEqual(waited.data.replies.map((r) => r.text), ['reply to again']);
  assert.equal((await tool(port, 'session_status', { sessionId: 's3' })).data.working, false);
  // batch + unknown tool
  const batch = JSON.parse((await post(port, [{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'nope' } }], AUTH)).body);
  assert.equal(batch.length, 2); assert.equal(batch[1].error.code, -32602);
  // rotate + stop
  const t2 = m.rotate(); assert.notEqual(t2, 'tok'); assert.equal((await post(port, {}, AUTH)).status, 401);
  m.stop(); assert.equal(m.status().running, false);
  console.log('mcp tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
