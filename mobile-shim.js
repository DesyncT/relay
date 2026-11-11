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
  function pill(on) {
    let p = document.getElementById('mConn');
    if (!p) { p = document.createElement('div'); p.id = 'mConn'; p.setAttribute('role', 'status'); p.textContent = 'Reconnecting…'; document.body.appendChild(p); }
    p.classList.toggle('on', on);
  }
  function connect() {
    es = new EventSource('/events');
    for (const ch of handlers.keys()) listen(ch);
    es.onerror = () => { lost = true; pill(true); };
    // after a gap (phone asleep, Wi-Fi switch) events were missed: reload to catch up with the desktop
    es.onopen = () => { pill(false); if (lost) location.reload(); };
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

  // tap a message to show its actions (reply, copy, cost); tap again or another message to hide them
  document.addEventListener('click', (e) => {
    const msg = e.target.closest('#log .msg');
    if (!msg || e.target.closest('a, button, input, textarea, summary, pre, img, .opts, .reply, .acts')) return;
    if (String(window.getSelection?.() || '')) return; // the user is selecting text
    const was = msg.classList.contains('tap');
    document.querySelectorAll('#log .msg.tap').forEach((n) => n.classList.remove('tap'));
    if (!was) msg.classList.add('tap');
  });

  // swipe in from the left edge to open the session drawer, swipe it back to close
  let t0 = null;
  document.addEventListener('touchstart', (e) => { const t = e.touches[0]; t0 = { x: t.clientX, y: t.clientY }; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!t0) return; const t = e.changedTouches[0], dx = t.clientX - t0.x, dy = Math.abs(t.clientY - t0.y), open = root.classList.contains('nav-open'); const x0 = t0.x; t0 = null;
    if (dy > 48) return;
    if (!open && x0 < 28 && dx > 64) root.classList.add('nav-open');
    else if (open && dx < -64) root.classList.remove('nav-open');
  }, { passive: true });

  const addClose = () => { const nav = document.querySelector('#root > nav'); if (!nav) return false; if (!document.getElementById('navClose')) { const b = document.createElement('button'); b.id = 'navClose'; b.type = 'button'; b.setAttribute('aria-label', 'Close sessions'); b.textContent = '×'; b.onclick = () => root.classList.remove('nav-open'); nav.appendChild(b); } return true; };
  if (!addClose()) { const mo = new MutationObserver(() => { if (addClose()) mo.disconnect(); }); mo.observe(root, { childList: true, subtree: true }); }
  // the session drawer closes after picking a chat or tapping outside it
  document.addEventListener('click', (e) => {
    if (!root.classList.contains('nav-open')) return;
    if (e.target.closest('#navScrim') || (e.target.closest('nav') && e.target.closest('.sb-row, .sb-hit') && !e.target.closest('.sb-more'))) root.classList.remove('nav-open');
  });
})();
