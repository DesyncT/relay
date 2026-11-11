'use strict';
// Phone access: a small built-in web server (local network only, started by the user) that serves the same React app to a paired phone
// and bridges window.api to the desktop, so the phone shows the same chat live. Pairing: scan a QR code (one-time token), the desktop user
// approves the device, the phone gets a long-lived cookie. Only an allowlist of chat channels is reachable; everything else is refused.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const PORT = 47840, PAIR_TTL = 5 * 60 * 1000, SHIM = path.join(__dirname, 'mobile-shim.js');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webm': 'video/webm', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const IMAGE = /^\.(png|jpe?g|gif|webp|svg)$/i;
// What a paired phone may call: chat, sessions and read-only status. Settings, agents, rules, panels (files/terminal), updates, cowork and
// anything that opens dialogs or touches the desktop itself are not reachable from the network.
const CALL_OK = new Set(['profile:get', 'settings:get', 'settings:limits', 'sessions:tree', 'sessions:getActive', 'sessions:setActive', 'sessions:create', 'sessions:rename', 'sessions:search', 'sessions:working', 'sessions:markRead', 'projects:list',
  'chat:info', 'chat:history', 'chat:send', 'chat:interrupt-send', 'chat:stop', 'chat:queue', 'chat:queue-edit', 'chat:queue-delete', 'chat:queue-send', 'chat:queue-interrupt-send', 'chat:attach', 'chat:mode', 'chat:retry', 'chat:endTask', 'chat:workflow', 'chat:cowork',
  'subagents:list', 'subagents:stop', 'subagents:retry', 'models:list', 'skills:list', 'skills:inUse', 'limits:get', 'usage:quota', 'prices:get', 'notify:clearQuestion', 'cowork:typing', 'procs:list']);
const EVENT_OK = /^(?:chat:|spend:|agent:|subagent:|sessions:|limits:|workflow:|reqs:|skills:|procs$|cowork:(?:typing|peerQueue)$|usage:quota-update$)/;
const HOST_OK = /^(?:\d{1,3}(?:\.\d{1,3}){3}|localhost)(?::\d{1,5})?$/; // an IP or localhost, never a name: blocks DNS-rebinding pages
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const page = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#0b0b0e;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#aaa;max-width:32ch;margin:0 auto}</style><div><h1>${title}</h1><p>${body}</p></div>`;

function lanIp() {
  const rank = (a) => (/^192\.168\./.test(a) ? 0 : /^10\./.test(a) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a) ? 2 : 3);
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  return ips.sort((a, b) => rank(a) - rank(b))[0] || '127.0.0.1';
}
const deviceName = (ua = '') => {
  const os_ = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android phone' : /Windows/.test(ua) ? 'Windows PC' : /Mac OS X/.test(ua) ? 'Mac' : 'Device';
  const br = /EdgA?\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'browser';
  return `${os_} · ${br}`;
};

// opts: root (built renderer dir), uploads (dir a phone may read files from), invoke(ch, args) -> Promise, approve({name, ip}) -> Promise<bool>,
//       load() -> [{id, hash, name, added, last}], save(list), onChange(), port, host
function createMobile(opts) {
  let server = null, port = 0, devices = (opts.load?.() || []).slice();
  const clients = new Set(), pairs = new Map(), fails = new Map(); // pairs: token hash -> expiry; fails: ip -> {n, until}
  const changed = () => { try { opts.onChange?.(); } catch {} };
  const persist = () => { try { opts.save?.(devices); } catch {} changed(); };
  const ip = () => opts.host || lanIp();
  const cookieOf = (req) => (/(?:^|;\s*)rm=([\w-]{20,64})/.exec(req.headers.cookie || '') || [])[1];
  function who(req) {
    const t = cookieOf(req); if (!t) return null;
    const d = devices.find((x) => x.hash === sha(t)); if (!d) return null;
    if (Date.now() - (d.last || 0) > 60000) { d.last = Date.now(); persist(); }
    return d;
  }
  const send = (res, code, type, body, extra = {}) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra }); res.end(body); };
  const readBody = (req, max) => new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    req.on('data', (c) => { n += c.length; if (n > max) { reject(new Error('too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8'))); req.on('error', reject);
  });
  function file(res, base, rel, { inline = true } = {}) {
    let abs; try { abs = fs.realpathSync(path.join(base, rel)); const b = fs.realpathSync(base); if (abs !== b && !abs.startsWith(b + path.sep)) throw new Error('outside'); if (!fs.statSync(abs).isFile()) throw new Error('not a file'); } catch { return send(res, 404, 'text/plain', 'Not found'); }
    const ext = path.extname(abs).toLowerCase(), type = MIME[ext] || 'application/octet-stream', safe = inline && (IMAGE.test(ext) || base === opts.root);
    const h = { 'content-type': safe ? type : 'application/octet-stream', 'content-disposition': safe ? 'inline' : 'attachment', 'x-content-type-options': 'nosniff', 'cache-control': base === opts.root ? 'no-cache' : 'private, max-age=3600' };
    if (ext === '.svg') h['content-security-policy'] = "default-src 'none'; style-src 'unsafe-inline'"; // an uploaded SVG must never run script
    res.writeHead(200, h);
    fs.createReadStream(abs).pipe(res);
  }
  async function pairing(req, res, url) {
    const tok = url.searchParams.get('pair') || '', h = sha(tok), key = req.socket.remoteAddress, f = fails.get(key) || { n: 0, until: 0 };
    if (Date.now() < f.until) return send(res, 429, 'text/html; charset=utf-8', page('Too many tries', 'Wait a minute, then scan the QR code again.'));
    const exp = pairs.get(h);
    if (!exp || exp < Date.now()) {
      if (++f.n >= 5) { f.n = 0; f.until = Date.now() + 60000; } fails.set(key, f); pairs.delete(h);
      return send(res, 403, 'text/html; charset=utf-8', page('Link expired', 'In Relay open Settings → Phone and scan the new QR code.'));
    }
    pairs.delete(h); // one use
    const name = deviceName(req.headers['user-agent']);
    let ok = false; try { ok = await opts.approve({ name, ip: key }); } catch {}
    if (!ok) return send(res, 403, 'text/html; charset=utf-8', page('Not allowed', 'The request was declined on the computer.'));
    const secret = crypto.randomBytes(32).toString('base64url');
    devices.push({ id: sha(secret).slice(0, 10), hash: sha(secret), name, added: Date.now(), last: Date.now() }); persist();
    send(res, 302, 'text/plain', '', { location: '/', 'set-cookie': `rm=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` });
  }
  async function handle(req, res) {
    if (!HOST_OK.test(req.headers.host || '')) return send(res, 400, 'text/plain', 'Bad host');
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    if (p === '/' && url.searchParams.has('pair')) return pairing(req, res, url);
    const dev = who(req);
    if (!dev) return send(res, 401, 'text/html; charset=utf-8', page('Relay', 'Scan the QR code in Relay → Settings → Phone to connect this device.'));
    if (req.method === 'POST' && p === '/call') {
      const origin = req.headers.origin; // a page on another site cannot call: the cookie is SameSite=Strict and the header below cannot be set cross-site without a preflight
      if (req.headers['x-relay'] !== '1' || (origin && new URL(origin).host !== req.headers.host)) return send(res, 403, 'application/json', '{"error":"Forbidden"}');
      let m; try { m = JSON.parse(await readBody(req, 40e6)); } catch { return send(res, 400, 'application/json', '{"error":"Bad request"}'); }
      if (typeof m?.ch !== 'string' || !CALL_OK.has(m.ch) || !Array.isArray(m.args) || (m.ch !== 'chat:attach' && JSON.stringify(m.args).length > 1e6)) return send(res, 403, 'application/json', '{"error":"Not available on the phone"}');
      try { const result = await opts.invoke(m.ch, m.args); return send(res, 200, 'application/json', JSON.stringify({ result: result === undefined ? null : result })); }
      catch (e) { return send(res, 500, 'application/json', JSON.stringify({ error: String(e?.message || e).slice(0, 500) })); }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'Method not allowed');
    if (p === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write(': ok\n\n'); const c = { res, id: dev.id }; clients.add(c);
      const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch {} }, 20000);
      req.on('close', () => { clearInterval(ka); clients.delete(c); }); return;
    }
    if (p === '/m.js') return send(res, 200, MIME['.js'], fs.readFileSync(SHIM));
    if (p === '/manifest.webmanifest') return send(res, 200, MIME['.webmanifest'], JSON.stringify({ name: 'Relay', short_name: 'Relay', start_url: '/', display: 'standalone', background_color: '#0b0b0e', theme_color: '#0b0b0e' }));
    if (p === '/f') return file(res, opts.uploads, url.searchParams.get('p') ? path.relative(opts.uploads, path.resolve(url.searchParams.get('p'))) : '');
    if (p === '/' || p === '/index.html') {
      let html; try { html = fs.readFileSync(path.join(opts.root, 'index.html'), 'utf8'); } catch { return send(res, 500, 'text/plain', 'App not built'); }
      html = html.replace('<head>', '<head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="theme-color" content="#0b0b0e"><link rel="manifest" href="/manifest.webmanifest"><script src="/m.js"></script>');
      return send(res, 200, MIME['.html'], html);
    }
    return file(res, opts.root, decodeURIComponent(p).replace(/^\/+/, ''));
  }
  const api = {
    start() {
      if (server) return Promise.resolve(api.status());
      server = http.createServer((req, res) => { handle(req, res).catch(() => { try { send(res, 500, 'text/plain', 'Error'); } catch {} }); });
      server.requestTimeout = 0; // the event stream stays open
      return new Promise((resolve, reject) => {
        let tries = [opts.port ?? PORT, 0];
        const go = () => server.listen(tries.shift(), '0.0.0.0');
        server.on('error', (e) => { if (e.code === 'EADDRINUSE' && tries.length) go(); else { server = null; reject(e); } });
        server.on('listening', () => { port = server.address().port; changed(); resolve(api.status()); });
        go();
      });
    },
    stop() { for (const c of clients) try { c.res.end(); } catch {} clients.clear(); pairs.clear(); try { server?.close(); } catch {} try { server?.closeAllConnections?.(); } catch {} server = null; changed(); },
    // A fresh one-time QR link (valid 5 minutes).
    pair() {
      if (!server) throw new Error('Phone access is off.');
      const tok = crypto.randomBytes(24).toString('base64url'); pairs.set(sha(tok), Date.now() + PAIR_TTL);
      for (const [h, e] of pairs) if (e < Date.now()) pairs.delete(h);
      return { url: `http://${ip()}:${port}/?pair=${tok}`, expires: Date.now() + PAIR_TTL };
    },
    revoke(id) { devices = devices.filter((d) => d.id !== id); for (const c of [...clients]) if (c.id === id) { try { c.res.end(); } catch {} clients.delete(c); } persist(); },
    emit(ch, data) {
      if (!clients.size || !EVENT_OK.test(ch)) return;
      let line; try { line = `event: ${ch}\ndata: ${JSON.stringify(data === undefined ? null : data)}\n\n`; } catch { return; }
      for (const c of [...clients]) { try { if (c.res.writableLength > 8e6) { c.res.end(); clients.delete(c); } else c.res.write(line); } catch { clients.delete(c); } }
    },
    status: () => ({ running: !!server, port, address: server ? `${ip()}:${port}` : '', devices: devices.map(({ id, name, added, last }) => ({ id, name, added, last, online: [...clients].some((c) => c.id === id) })) }),
  };
  return api;
}
module.exports = { createMobile, CALL_OK, EVENT_OK, lanIp };
