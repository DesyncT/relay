// Side panels (renderer, classic script). window.Panels = { mount, open, fileCard, imageFromPath }
// Needs window.api.call/on (preload) and panels-main.js on the main side.
(function () {
  const api = window.api;
  const NS = 'http://www.w3.org/2000/svg';
  const IC = { // lucide-style, 24 viewBox, 1.5 stroke
    term: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    diff: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v6M9 11h6M9 17h6"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    img: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    back: '<path d="m15 18-6-6 6-6"/>', fwd: '<path d="m9 18 6-6-6-6"/>', down: '<path d="m6 9 6 6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
    reload: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>', ext: '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    max: '<path d="m15 15 6 6M15 9l6-6M9 15l-6 6M9 9 3 3"/><path d="M21 16v5h-5M21 8V3h-5M3 16v5h5M3 8V3h5"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  };
  const svg = (n, cls = 'pn-i') => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.5'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.innerHTML = IC[n]; return s; };
  const h = (tag, p = {}, ...kids) => { const e = document.createElement(tag); for (const k in p) { if (k in e && k !== 'style') e[k] = p[k]; else e.setAttribute(k, p[k]); } e.append(...kids.flat().filter((x) => x != null)); return e; };
  const btn = (icon, label, fn, cls = 'pn-b') => { const b = h('button', { className: cls, title: label, type: 'button' }, svg(icon)); b.setAttribute('aria-label', label); b.onclick = fn; return b; };
  const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const IMG = /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i;
  const fileUrl = (p) => 'file:///' + String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');
  const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;

  let sess = () => null, host = null, aside = null, mode = null, modes = {}, widthKey = 'pn.w';
  const sid = () => sess()?.sid;
  const call = (ch, ...a) => api.call(ch, ...a);

  // ---------- minimal markdown ----------
  function md(src) {
    const inl = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    const out = []; let list = null, code = null, para = [];
    const flush = () => { if (para.length) out.push('<p>' + inl(para.join(' ')) + '</p>'); para = []; };
    const endList = () => { if (list) out.push(`</${list}>`); list = null; };
    for (const l of src.split('\n')) {
      if (code) { if (l.startsWith('```')) { out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>'); code = null; } else code.push(l); continue; }
      if (l.startsWith('```')) { flush(); endList(); code = []; continue; }
      let m;
      if ((m = /^(#{1,6})\s+(.*)/.exec(l))) { flush(); endList(); out.push(`<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`); }
      else if (/^(-{3,}|\*{3,})$/.test(l.trim())) { flush(); endList(); out.push('<hr>'); }
      else if ((m = /^\s*([-*]|\d+\.)\s+(.*)/.exec(l))) { flush(); const t = /\d/.test(m[1]) ? 'ol' : 'ul'; if (list !== t) { endList(); out.push(`<${t}>`); list = t; } out.push('<li>' + inl(m[2]) + '</li>'); }
      else if (!l.trim()) { flush(); endList(); }
      else if (l.startsWith('>')) { flush(); endList(); out.push('<blockquote>' + inl(l.replace(/^>\s?/, '')) + '</blockquote>'); }
      else para.push(l.trim());
    }
    if (code) out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
    flush(); endList(); return out.join('');
  }

  // ---------- shell: aside + resize ----------
  function ensureAside() {
    if (aside) return;
    aside = h('aside', { className: 'pn', hidden: true, ariaLabel: 'Side panel' });
    const grip = h('div', { className: 'pn-grip', role: 'separator', ariaOrientation: 'vertical' });
    grip.onpointerdown = (e) => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId); grip.classList.add('drag');
      const move = (ev) => setWidth(host.getBoundingClientRect().right - ev.clientX, true);
      const up = () => { grip.classList.remove('drag'); grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); lsSet(widthKey, aside.style.width.replace('px', '')); };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up);
    };
    aside.append(grip, ...Object.values(modes).flatMap((m) => [m.bar, m.body]));
    host.append(aside);
  }
  function setWidth(w, drag) {
    const max = mode === 'viewer' ? Math.max(320, host.clientWidth - 320) : 900;
    aside.style.width = Math.max(320, Math.min(max, Math.round(w))) + 'px';
  }
  function show(name) {
    ensureAside();
    if (mode === name && name !== 'viewer') return hide();
    mode = name;
    widthKey = name === 'viewer' ? 'pn.wv' : 'pn.w';
    const saved = +lsGet(widthKey, 0);
    setWidth(saved || (name === 'viewer' ? host.clientWidth * 0.55 : 400));
    aside.hidden = false;
    for (const [k, m] of Object.entries(modes)) { const on = k === name; m.bar.hidden = !on; m.body.hidden = !on; }
    modes[name].show?.();
  }
  function hide() { mode = null; if (aside) aside.hidden = true; call('panel:watch', sid(), null); }

  const mkMode = (title, ...barKids) => ({ bar: h('div', { className: 'pn-bar', hidden: true }, h('h3', { textContent: title }), ...barKids), body: h('div', { className: 'pn-body', hidden: true }) });
  const sub = () => h('div', { className: 'pn-sub' });

  // ---------- terminal ----------
  const termBuf = new Map(), urls = new Map(); // sid -> text / Set of dev urls
  const DEV = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+[^\s'")\]]*/g;
  function termMode() {
    const sb = sub(), log = h('pre', { className: 'pn-log', tabIndex: 0 }), chips = h('div', { className: 'pn-chips' });
    const input = h('input', { type: 'text', placeholder: 'Run a command', spellcheck: false, autocomplete: 'off' }); input.setAttribute('aria-label', 'Terminal input');
    const m = mkMode('Terminal', sb, btn('trash', 'Clear', () => { termBuf.set(sid(), ''); log.textContent = ''; }), btn('x', 'Close', hide));
    m.body.append(h('div', { className: 'pn-chipbar' }, chips), log, h('div', { className: 'pn-in' }, h('span', { textContent: '>' }), input));
    const hist = []; let hi = 0;
    const draw = () => { log.textContent = termBuf.get(sid()) || ''; log.scrollTop = log.scrollHeight; drawChips(); };
    const drawChips = () => { chips.replaceChildren(...[...(urls.get(sid()) || [])].map((u) => h('button', { className: 'pn-chip', type: 'button', onclick: () => Panels.openUrl(u) }, 'Open ', h('em', { textContent: u.replace(/^https?:\/\//, '') })))); };
    m.drawChips = drawChips;
    const start = async () => { const r = await call('panel:term:start', sid()); sb.textContent = r?.error || r?.cwd || sess()?.cwd || ''; };
    m.show = () => { sb.textContent = sess()?.cwd || ''; draw(); start(); input.focus(); };
    input.onkeydown = async (e) => {
      if (e.key === 'Enter') { const v = input.value; input.value = ''; if (v.trim()) { hist.push(v); hi = hist.length; } add('> ' + v + '\n'); await call('panel:term:start', sid()); call('panel:term:write', sid(), v); }
      else if (e.key === 'c' && e.ctrlKey && !getSelection().toString()) { e.preventDefault(); add('^C\n'); await call('panel:term:restart', sid()); }
      else if (e.key === 'ArrowUp' && hist.length) { e.preventDefault(); input.value = hist[(hi = Math.max(0, hi - 1))]; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); input.value = hist[(hi = Math.min(hist.length, hi + 1))] || ''; }
    };
    function add(s, id = sid()) {
      s = s.replace(ANSI, '');
      let t = (termBuf.get(id) || '') + s; if (t.length > 200000) t = t.slice(-150000); termBuf.set(id, t);
      for (const u of s.match(DEV) || []) { const k = urls.get(id) || new Set(); k.add(u.replace(/[.,;]+$/, '')); urls.set(id, k); }
      if (id === sid() && mode === 'term') { log.textContent = t; log.scrollTop = log.scrollHeight; drawChips(); }
      else if (id === sid()) modes.browser?.drawChips?.();
    }
    api.on('panel:term:data', (d) => add(d.data, d.sid));
    api.on('panel:term:exit', (d) => add(`[shell exited${d.code != null ? ' ' + d.code : ''}]\n`, d.sid));
    return m;
  }

  // ---------- changes ----------
  function changesMode() {
    const sb = sub(), list = h('div', { className: 'pn-list' });
    const m = mkMode('Changes', sb, btn('reload', 'Refresh', () => m.show()), btn('x', 'Close', hide));
    m.body.append(list);
    m.show = async () => {
      const id = sid(); if (!id) return;
      const r = await call('panel:changes', id);
      if (r?.error) { list.replaceChildren(h('div', { className: 'pn-empty', textContent: r.error })); return; }
      sb.textContent = r.mode === 'git' ? 'git' : 'since first run';
      if (!r.files.length) { list.replaceChildren(h('div', { className: 'pn-empty', textContent: r.fresh ? 'Tracking changes from now' : 'No changes' })); return; }
      list.replaceChildren(...r.files.map((f) => {
        const d = h('div', { className: 'pn-diff', hidden: true });
        d.append(...(f.diff ? f.diff.split('\n').map((l) => h('div', { className: l[0] === '+' ? 'a' : l[0] === '-' ? 'd' : l[0] === '@' ? 'h' : '', textContent: l || ' ' })) : [h('div', { className: 'h', textContent: 'No text diff' })]));
        const i = f.file.lastIndexOf('/');
        const row = h('button', { className: 'pn-row', type: 'button' }, h('span', { className: 'st', textContent: f.status }),
          h('span', { className: 'nm' }, f.file.slice(i + 1), i > 0 ? h('small', { textContent: f.file.slice(0, i) }) : null),
          h('span', { className: 'ct' }, h('span', { className: 'pn-add', textContent: '+' + f.add }), ' ', h('span', { className: 'pn-del', textContent: '−' + f.del })));
        row.onclick = () => { d.hidden = !d.hidden; };
        return h('div', {}, row, d);
      }));
    };
    api.on('agent:status', (d) => { if (d && d.status == null && d.sid === sid() && mode === 'changes') m.show(); });
    return m;
  }

  // ---------- browser ----------
  function browserMode() {
    const url = h('input', { className: 'pn-url', type: 'text', placeholder: 'Enter a URL', spellcheck: false }); url.setAttribute('aria-label', 'Address');
    const chips = h('div', { className: 'pn-chips' }), empty = h('div', { className: 'pn-empty', textContent: 'Enter a URL' });
    const view = h('div', { className: 'pn-view' }); let wv = null;
    const back = btn('back', 'Back', () => wv?.goBack()), fwd = btn('fwd', 'Forward', () => wv?.goForward()), rel = btn('reload', 'Reload', () => wv?.reload());
    const m = mkMode('Browser', back, fwd, rel, url, btn('x', 'Close', hide));
    m.body.append(h('div', { className: 'pn-chipbar' }, chips), view); view.append(empty);
    m.drawChips = () => { chips.replaceChildren(...[...(urls.get(sid()) || [])].map((u) => h('button', { className: 'pn-chip', type: 'button', onclick: () => go(u) }, 'Open ', h('em', { textContent: u.replace(/^https?:\/\//, '') })))); };
    const norm = (v) => { v = v.trim(); if (!v) return ''; if (/^(https?|file):/i.test(v)) return v; return (/^(localhost|127\.|\d+\.\d+\.\d+\.\d+|\[)/.test(v) ? 'http://' : 'https://') + v; };
    const sync = () => { if (!wv) return; try { back.disabled = !wv.canGoBack(); fwd.disabled = !wv.canGoForward(); } catch {} };
    function ensure() {
      if (wv) return;
      wv = document.createElement('webview'); wv.setAttribute('partition', 'pn-browser');
      wv.addEventListener('did-navigate', (e) => { url.value = e.url === 'about:blank' ? '' : e.url; empty.hidden = e.url !== 'about:blank'; sync(); });
      wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { url.value = e.url; sync(); } });
      view.prepend(wv);
    }
    function go(v) { v = norm(v); if (!v) return; ensure(); empty.hidden = true; url.value = v; wv.setAttribute('src', v); }
    url.onkeydown = (e) => { if (e.key === 'Enter') go(url.value); };
    m.go = go;
    m.show = async () => {
      m.drawChips(); back.disabled = fwd.disabled = true;
      if (wv) return;
      ensure();
      const dev = [...(urls.get(sid()) || [])][0];
      if (dev) go(dev); else if (await call('panel:probe', 3000) === true) go('http://localhost:3000');
    };
    return m;
  }

  // ---------- files tree ----------
  function filesMode() {
    const sb = sub(), tree = h('div', { className: 'pn-list pn-tree' }), pv = h('div', { className: 'pn-body', hidden: true });
    const m = mkMode('Files', sb, btn('reload', 'Refresh', () => m.show()), btn('x', 'Close', hide));
    m.body.append(tree, pv);
    async function kids(rel, into, depth) {
      const r = await call('panel:files:list', sid(), rel);
      if (r?.error) { into.append(h('div', { className: 'pn-empty', textContent: r.error })); return; }
      for (const e of r) {
        const p = rel ? rel + '/' + e.name : e.name, row = h('button', { className: 'pn-row', type: 'button' }, svg(e.dir ? 'right' : IMG.test(e.name) ? 'img' : 'file'), h('span', { className: 'nm', textContent: e.name }));
        row.style.paddingLeft = 8 + depth * 12 + 'px'; into.append(row);
        if (e.dir) {
          const box = h('div', {}); into.append(box); let open = false;
          row.onclick = async () => { open = !open; row.firstChild.replaceWith(svg(open ? 'down' : 'right')); box.replaceChildren(); if (open) await kids(p, box, depth + 1); };
        } else row.onclick = () => preview(p);
      }
    }
    async function preview(p) {
      const r = await call('panel:file:read', sid(), p);
      tree.hidden = true; pv.hidden = false;
      const close = () => { pv.hidden = true; tree.hidden = false; };
      const top = h('div', { className: 'pn-bar' }, btn('back', 'Back to files', close), h('div', { className: 'pn-sub', textContent: p }));
      let body;
      if (r?.error) body = h('div', { className: 'pn-empty', textContent: r.error });
      else if (r.kind === 'image') {
        const add = h('button', { className: 'pn-btn', type: 'button', textContent: 'Add to chat' });
        add.onclick = async () => { const b = await call('panel:file:b64', sid(), p); if (!b?.error) document.dispatchEvent(new CustomEvent('panels:attach', { detail: b })); add.textContent = 'Added'; };
        body = h('div', { className: 'pn-img' }, add, h('img', { src: r.url, alt: r.name }));
      } else if (r.kind === 'text') body = codeView(r.text);
      else body = otherCard(r);
      pv.replaceChildren(top, body);
    }
    m.show = () => { sb.textContent = sess()?.cwd || ''; tree.hidden = false; pv.hidden = true; tree.replaceChildren(); kids('', tree, 0); };
    return m;
  }
  const codeView = (text) => { const n = text.split('\n').length; return h('div', { className: 'pn-code' }, h('div', { className: 'g', textContent: Array.from({ length: n }, (_, i) => i + 1).join('\n') }), h('div', { className: 'c', textContent: text })); };
  const otherCard = (r) => h('div', { className: 'pn-pv' }, h('div', { textContent: r.name + ' · ' + fmtSize(r.size) }), h('button', { className: 'pn-btn', type: 'button', textContent: 'Open externally', onclick: () => call('panel:file:open', sid(), r.path) }));

  // ---------- viewer ----------
  const recent = []; let cur = null;
  function viewerMode() {
    const title = h('button', { className: 'pn-b', type: 'button', style: 'font-weight:500;color:var(--text);min-width:0;flex:1;justify-content:flex-start' }), tspan = h('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' });
    title.append(tspan, svg('down')); title.setAttribute('aria-haspopup', 'menu');
    const menu = h('div', { hidden: true, role: 'menu', style: 'position:absolute;top:44px;left:8px;z-index:5;min-width:240px;max-width:360px;padding:4px;border-radius:8px;background:var(--raised);border:1px solid var(--line-strong)' });
    const m = mkMode('', title, btn('ext', 'Open externally', () => cur && call('panel:file:open', sid(), cur.path)), btn('folder', 'Reveal in folder', () => cur && call('panel:file:reveal', sid(), cur.path)),
      btn('max', 'Expand', () => { const wide = aside.dataset.wide !== '1'; aside.dataset.wide = wide ? '1' : '0'; setWidth(wide ? host.clientWidth * 0.8 : host.clientWidth * 0.55); }), btn('x', 'Close', hide));
    m.bar.querySelector('h3').remove(); m.bar.style.position = 'relative'; m.bar.append(menu);
    title.onclick = () => { menu.hidden = !menu.hidden; menu.replaceChildren(...recent.map((r) => { const b = h('button', { className: 'pn-row', type: 'button', role: 'menuitem' }, h('span', { className: 'nm', textContent: r.name })); b.onclick = () => { menu.hidden = true; Panels.open(r.path); }; return b; })); };
    const bodyHost = m.body;
    async function render() {
      if (!cur) return;
      tspan.textContent = cur.name; bodyHost.replaceChildren();
      const r = cur, e = r.ext;
      if (/^html?$/.test(e) || e === 'pdf') {
        const wv = document.createElement('webview'); wv.setAttribute('src', r.url); wv.setAttribute('partition', 'pn-viewer'); wv.setAttribute('webpreferences', 'sandbox=yes,nodeIntegration=no');
        if (e === 'pdf') wv.setAttribute('plugins', ''); wv.style.cssText = 'flex:1;min-height:0;background:#fff'; bodyHost.append(wv);
      } else if (r.image) bodyHost.append(h('div', { style: 'flex:1;min-height:0;display:grid;place-items:center;background:var(--deep);padding:24px;overflow:auto' }, h('img', { src: r.url + '?t=' + Date.now(), alt: r.name, style: 'max-width:100%;max-height:100%;border-radius:8px' })));
      else {
        const t = await call('panel:file:read', sid(), r.path);
        if (t.kind === 'text' && e === 'md') bodyHost.append(h('div', { className: 'pn-md', innerHTML: md(t.text) }));
        else if (t.kind === 'text') bodyHost.append(codeView(t.text));
        else bodyHost.append(h('div', { className: 'pn-empty' }, otherCard(r)));
      }
    }
    m.openFile = async (r) => { cur = r; if (!recent.some((x) => x.path === r.path)) recent.unshift({ path: r.path, name: r.name }); recent.length = Math.min(recent.length, 8); menu.hidden = true; await render(); call('panel:watch', sid(), r.path); };
    api.on('panel:file:changed', (d) => {
      if (mode !== 'viewer' || !cur || d.path !== cur.path) return;
      const wv = bodyHost.querySelector('webview'); if (wv) { try { wv.reload(); return; } catch {} }
      render();
    });
    return m;
  }

  // ---------- public ----------
  const Panels = {
    mount(hostEl, getSession) {
      sess = getSession; host = hostEl;
      modes = { term: termMode(), changes: changesMode(), browser: browserMode(), files: filesMode(), viewer: viewerMode() };
      // main asks for a panel (e.g. Changes after a wrap-up); refresh instead of toggling it shut if it's already open
      api.on('panel:open-url', (d) => { if (d?.sid !== sid() || !/^https?:\/\//i.test(d.url)) return; if (mode !== 'browser') show('browser'); modes.browser.go(d.url); });
      api.on('panel:show', (d) => { if (d?.sid !== sid() || !modes[d.mode]) return; if (mode === d.mode) modes[d.mode].show?.(); else show(d.mode); });
    },
    // call when the open session changes
    refresh() { if (mode && mode !== 'viewer') modes[mode].show?.(); },
    async open(p) {
      const r = await call('panel:file:stat', sid(), p); if (r?.error) return r;
      await modes.viewer.openFile(r); show('viewer'); mode = 'viewer'; return r;
    },
    openUrl(u) { if (mode !== 'browser') show('browser'); modes.browser.go(u); },
    imageFromPath(p) {
      const i = h('img', { className: 'pn-thumb', src: fileUrl(p), alt: String(p).split(/[\\/]/).pop(), loading: 'lazy' });
      i.onclick = () => i.classList.toggle('big'); i.onerror = () => { i.style.display = 'none'; };
      return i;
    },
    fileCard(p) {
      const name = String(p).split(/[\\/]/).pop(), isImg = IMG.test(name);
      const meta = h('div', { style: 'font-size:12px;line-height:16px;color:var(--muted)', textContent: (name.split('.').pop() || 'file').toUpperCase() });
      const card = h('button', { type: 'button', style: 'all:unset;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;width:100%;max-width:432px;padding:12px;border-radius:8px;background:var(--card);border:1px solid var(--line);cursor:pointer;transition:background-color .15s var(--ease)' });
      card.onmouseenter = () => { card.style.background = 'var(--raised)'; }; card.onmouseleave = () => { card.style.background = 'var(--card)'; };
      const ico = svg(isImg ? 'img' : /\.(html?|js|ts|json|css|py|md)$/i.test(name) ? 'code' : 'file'); ico.style.cssText = 'display:block;width:20px;height:20px;flex:none;color:var(--muted)';
      const info = h('div', { style: 'min-width:0;flex:1' }, h('div', { style: 'color:var(--text);font-size:14px;line-height:20px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', textContent: name }), meta);
      if (isImg) { const im = h('img', { alt: name, loading: 'lazy', style: 'display:block;max-width:100%;max-height:240px;border-radius:4px;object-fit:contain;align-self:flex-start' }); im.onerror = () => im.remove(); card.append(im); card._img = im; }
      card.append(h('div', { style: 'display:flex;align-items:center;gap:12px' }, ico, info));
      card.setAttribute('aria-label', 'Open ' + name); card.onclick = () => Panels.open(p);
      call('panel:file:stat', sid(), p).then((r) => { if (r && !r.error) { meta.textContent = fmtSize(r.size) + ' · ' + (r.ext || 'file').toUpperCase(); if (card._img) card._img.src = r.url; } else { meta.textContent = 'Not found'; } }).catch(() => {});
      return card;
    },
  };
  window.Panels = Panels;
})();
