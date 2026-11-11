// Loaded first on a paired phone (served by mobile.js). Replaces the Electron preload bridge: window.api.call goes over HTTP, events arrive over
// one server-sent-events stream, so the phone runs the very same app (same components, same animations) and stays in live sync.
(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.add('mobile');
  window.__relayMobile = true;
  window.relayFileUrl = (p) => '/f?p=' + encodeURIComponent(p); // uploaded images and files come from the desktop's uploads folder

  const handlers = new Map(); let es = null, lost = false;
  const expired = () => {
    if (document.getElementById('mExpired')) return;
    const d = document.createElement('div'); d.id = 'mExpired';
    d.style.cssText = 'position:fixed;inset:0;z-index:999;display:grid;place-items:center;background:#0b0b0e;color:#eee;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px';
    d.innerHTML = '<div><h1 style="font-size:20px;margin:0 0 8px">Disconnected</h1><p style="color:#aaa;margin:0">This phone is no longer paired. In Relay open Settings → Phone and scan the QR code again.</p></div>';
    document.body.appendChild(d);
  };
  const call = (ch, ...args) => {
    if (ch === 'settings:save') return Promise.resolve(); // the phone never changes the desktop's settings
    return fetch('/call', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-relay': '1' }, body: JSON.stringify({ ch, args }) })
      .then(async (r) => {
        if (r.status === 401) { expired(); throw new Error('Not paired'); }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Request failed');
        return j.result;
      });
  };
  const listen = (ch) => es.addEventListener(ch, (e) => { let d = null; try { d = JSON.parse(e.data); } catch { return; } handlers.get(ch)?.forEach((f) => { try { f(d); } catch (err) { console.error(err); } }); });
  function connect() {
    es = new EventSource('/events');
    for (const ch of handlers.keys()) listen(ch);
    es.onerror = () => { lost = true; };
    // after a gap (phone asleep, Wi-Fi switch) events were missed: reload to catch up with the desktop
    es.onopen = () => { if (lost) location.reload(); };
  }
  window.api = {
    call,
    on(ch, fn) {
      if (!handlers.has(ch)) { handlers.set(ch, new Set()); if (es) listen(ch); }
      handlers.get(ch).add(fn);
    },
  };
  document.addEventListener('DOMContentLoaded', connect);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && es && es.readyState === 2) location.reload(); });

  // the session drawer closes after picking a chat or tapping outside it
  document.addEventListener('click', (e) => {
    if (!root.classList.contains('nav-open')) return;
    if (e.target.closest('#navScrim') || (e.target.closest('nav') && e.target.closest('.sb-row, .sb-hit') && !e.target.closest('.sb-more'))) root.classList.remove('nav-open');
  });
})();
