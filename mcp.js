'use strict';
// Relay as an MCP server (Streamable HTTP, JSON-RPC 2.0). Other tools connect with a bearer token and can list projects,
// start sessions, send messages and read chats. Listens on localhost only; no external dependencies.
const http = require('http'), crypto = require('crypto');

const PROTOCOL = '2025-03-26';
const TOOLS = [
  { name: 'list_projects', description: 'Projects open in Relay (id, name, folder path).', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_sessions', description: 'Chat sessions, newest first. Optionally filter by projectId.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, additionalProperties: false } },
  { name: 'start_session', description: 'Create a new chat session in a project and make it active. Returns the session id.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, title: { type: 'string' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'send_message', description: 'Send a user message to a session. Optionally wait up to waitSeconds (max 600) for the agents to finish and return their replies.', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, text: { type: 'string' }, waitSeconds: { type: 'number', minimum: 0, maximum: 600 } }, required: ['sessionId', 'text'], additionalProperties: false } },
  { name: 'read_chat', description: 'Messages of a session (from, text, at). limit defaults to 50 from the end; after returns only messages newer than that timestamp.', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, limit: { type: 'number', minimum: 1, maximum: 500 }, after: { type: 'number' } }, required: ['sessionId'], additionalProperties: false } },
  { name: 'session_status', description: 'Whether agents are still working in a session.', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'], additionalProperties: false } },
];

const slim = (m) => ({ from: m.from, at: m.at, text: m.text || '', ...(m.attachments?.length && { attachments: m.attachments.map((a) => a.name) }) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// opts: invoke(ch, args) -> Promise (the app's IPC handlers), token, port (default 7717), host (default 127.0.0.1)
function createMcp(opts) {
  const host = opts.host || '127.0.0.1';
  let server = null, port = opts.port || 7717, token = opts.token || crypto.randomBytes(24).toString('base64url');
  const call = (ch, ...args) => opts.invoke(ch, args);

  const tools = {
    list_projects: async () => (await call('projects:list')).map(({ id, name, path }) => ({ id, name, path })),
    list_sessions: async ({ projectId } = {}) => (await call('sessions:tree')).sessions.filter((s) => !projectId || s.projectId === projectId)
      .sort((a, b) => b.updated - a.updated).map(({ id, projectId, title, created, updated }) => ({ id, projectId, title, created, updated })),
    start_session: async ({ projectId, title } = {}) => {
      if (!projectId) throw new Error('projectId is required');
      const s = await call('sessions:create', projectId, title || '');
      await call('sessions:setActive', s.id).catch(() => {});
      return { id: s.id, projectId: s.projectId, title: s.title };
    },
    send_message: async ({ sessionId, text, waitSeconds = 0 } = {}) => {
      if (!sessionId || typeof text !== 'string' || !text.trim()) throw new Error('sessionId and text are required');
      const since = Date.now();
      const r = await call('chat:send', sessionId, text, [], { queue: true });
      const wait = Math.min(600, Math.max(0, Number(waitSeconds) || 0)) * 1000;
      if (!wait) return { sent: true, queued: !!r?.queued, at: since };
      const deadline = Date.now() + wait; let started = false;
      while (Date.now() < deadline) { // wait for the run to start, then to finish; a queued message may take a moment to begin
        await sleep(500);
        const busy = (await call('sessions:working')).includes(sessionId);
        if (busy) started = true; else if (started || Date.now() - since > 3000) break;
      }
      const msgs = (await call('chat:history', sessionId)).filter((m) => m.at > since && m.from !== 'user');
      return { sent: true, at: since, done: !(await call('sessions:working')).includes(sessionId), replies: msgs.map(slim) };
    },
    read_chat: async ({ sessionId, limit = 50, after } = {}) => {
      if (!sessionId) throw new Error('sessionId is required');
      let msgs = await call('chat:history', sessionId);
      if (after) msgs = msgs.filter((m) => m.at > after);
      return { total: msgs.length, messages: msgs.slice(-Math.min(500, Math.max(1, limit | 0))).map(slim) };
    },
    session_status: async ({ sessionId } = {}) => {
      if (!sessionId) throw new Error('sessionId is required');
      const info = await call('chat:info', sessionId);
      return { working: (await call('sessions:working')).includes(sessionId), title: info?.title, project: info?.project || null };
    },
  };

  async function rpc(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
    const { id, method, params = {} } = msg;
    const ok = (result) => ({ jsonrpc: '2.0', id, result });
    try {
      switch (method) {
        case 'initialize': return ok({ protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'relay', version: opts.version || '0' } });
        case 'ping': return ok({});
        case 'tools/list': return ok({ tools: TOOLS });
        case 'tools/call': {
          const fn = tools[params?.name];
          if (!fn) return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } };
          try { return ok({ content: [{ type: 'text', text: JSON.stringify(await fn(params.arguments || {})) }] }); }
          catch (e) { return ok({ isError: true, content: [{ type: 'text', text: String(e.message || e) }] }); }
        }
        default:
          if (method.startsWith('notifications/')) return null; // no reply to notifications
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
      }
    } catch (e) { return { jsonrpc: '2.0', id, error: { code: -32603, message: String(e.message || e) } }; }
  }

  const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(body); };
  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/mcp') return send(res, 404, '{"error":"Not found"}');
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ') || auth.slice(7).length !== token.length || !crypto.timingSafeEqual(Buffer.from(auth.slice(7)), Buffer.from(token))) return send(res, 401, '{"error":"Unauthorized"}');
    if (req.method === 'GET') return send(res, 405, '{"error":"Streaming not supported; POST JSON-RPC to /mcp"}');
    if (req.method === 'DELETE') return send(res, 200, '{}');
    if (req.method !== 'POST') return send(res, 405, '{"error":"Method not allowed"}');
    const parts = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 4e6) return send(res, 413, '{"error":"Too large"}'); parts.push(c); }
    let body; try { body = JSON.parse(Buffer.concat(parts).toString() || 'null'); } catch { return send(res, 400, JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })); }
    if (Array.isArray(body)) { const out = (await Promise.all(body.map(rpc))).filter(Boolean); return out.length ? send(res, 200, JSON.stringify(out)) : (res.writeHead(202), res.end()); }
    const out = await rpc(body);
    if (!out) { res.writeHead(202); res.end(); return; }
    send(res, 200, JSON.stringify(out));
  }

  const api = {
    start: () => new Promise((resolve, reject) => {
      if (server) return resolve(api.status());
      server = http.createServer((req, res) => handle(req, res).catch((e) => { try { send(res, 500, JSON.stringify({ error: String(e.message || e) })); } catch {} }));
      server.once('error', (e) => { server = null; reject(e); });
      server.listen(port, host, () => { port = server.address().port; resolve(api.status()); });
    }),
    stop: () => { if (server) { server.close(); server = null; } },
    rotate: () => { token = crypto.randomBytes(24).toString('base64url'); return token; },
    status: () => ({ running: !!server, port, host, url: `http://${host}:${port}/mcp`, token }),
    tools: TOOLS.map((t) => t.name),
  };
  return api;
}
module.exports = { createMcp, TOOLS };
