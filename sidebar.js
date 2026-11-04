// Projects/sessions sidebar (renderer). Classic script, load before the main inline script (it only needs window.api).
// Needs the sessions:* / projects:* IPC from sessions.js. Exposes window.Sidebar.
(() => {
  const api = window.api;
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, attrs); e.append(...kids); return e; };
  const P = {
    plus: '<path d="M5 12h14M12 5v14"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    folder: '<path d="M12 10v6M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    caret: '<path d="m6 9 6 6 6-6"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  };
  const icon = (n) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = P[n]; return s; };
  const btn = (cls, label, ic, onclick) => { const b = el('button', { type: 'button', className: cls, title: label, onclick }); b.setAttribute('aria-label', label); b.append(icon(ic)); return b; };
  const LIMIT = 20;

  let box, list, searchBox, input, results, menu, opts = {};
  let tree = { projects: [], sessions: [], active: null };
  let working = new Set(); // chats with an agent running
  const pinged = new Set(); // unread dots that already pinged; rows are rebuilt on every render
  const seen = new Set(); // ids already animated in
  let fresh = null; // session just created here
  const expanded = new Set(); // group keys showing more than LIMIT rows
  let timer, searchTimer;

  const open = (id) => { setActive(id); opts.onOpen?.(id); };
  let mine = null; // the session this window shows; the stored "active" is shared by all windows
  function setActive(id) {
    mine = tree.active = id; const s = tree.sessions.find((x) => x.id === id); if (s) s.unread = false;
    api.call('sessions:setActive', id);
    render();
  }

  async function refresh() { tree = await api.call('sessions:tree'); if (mine) tree.active = mine; render(); }
  const refreshSoon = () => { clearTimeout(timer); timer = setTimeout(refresh, 40); };

  // ---- grouping: one group per project; projects and sessions keep the order the user gave them (main process owns it) ----
  const groups = () => tree.projects.map((p) => ({ ...p, rows: tree.sessions.filter((x) => x.projectId === p.id) }));

  // ---- manual order: native drag and drop + Alt+Up/Down; kind is 'project' or 'session', pid scopes sessions to their project ----
  let drag = null;
  const clearMarks = () => list.querySelectorAll('.drop-before,.drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
  const idsOf = (kind, pid) => (kind === 'project' ? tree.projects : tree.sessions.filter((x) => x.projectId === pid)).map((x) => x.id);
  function applyOrder(kind, pid, ids) {
    if (kind === 'project') { tree.projects = ids.map((i) => tree.projects.find((p) => p.id === i)); api.call('projects:reorder', ids); }
    else { tree.sessions = [...tree.sessions.filter((x) => x.projectId !== pid), ...ids.map((i) => tree.sessions.find((x) => x.id === i))]; api.call('sessions:reorder', pid, ids); }
    render();
  }
  function moveTo(kind, pid, from, to, side) {
    const ids = idsOf(kind, pid).filter((i) => i !== from);
    ids.splice(ids.indexOf(to) + (side === 'after' ? 1 : 0), 0, from);
    applyOrder(kind, pid, ids);
  }
  function moveBy(kind, pid, id, d) { // Alt+Arrow
    const ids = idsOf(kind, pid), i = ids.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; applyOrder(kind, pid, ids);
  }
  function dnd(node, handle, kind, id, pid) {
    const side = (e) => { const b = node.getBoundingClientRect(); return e.clientY < b.top + b.height / 2 ? 'before' : 'after'; };
    const ok = () => drag && drag.kind === kind && drag.pid === pid && drag.id !== id;
    handle.draggable = true;
    handle.ondragstart = (e) => { e.stopPropagation(); drag = { kind, id, pid }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); node.classList.add('dragging'); };
    handle.ondragend = () => { drag = null; node.classList.remove('dragging'); clearMarks(); };
    node.addEventListener('dragover', (e) => { if (!ok()) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; clearMarks(); node.classList.add('drop-' + side(e)); });
    node.addEventListener('drop', (e) => { if (!ok()) return; e.preventDefault(); e.stopPropagation(); const d = drag; clearMarks(); drag = null; moveTo(kind, pid, d.id, id, side(e)); });
  }
  const activeGroup = () => groups().find((g) => g.rows.some((r) => r.id === tree.active));

  async function newSession(g) {
    g ||= activeGroup() || groups()[0];
    let pid = g?.id;
    if (!pid) { const p = await api.call('projects:pick').catch((e) => { alert(e.message); }); pid = p?.id; }
    if (!pid) return;
    const s = await api.call('sessions:create', pid);
    fresh = s.id; // its row grows in on the next render
    opts.onNew?.(pid, s.id);
    await refresh(); open(s.id);
  }
  const addProject = async () => { const p = await api.call('projects:pick').catch((e) => alert(e.message)); if (p) await refresh(); };
  // ---- popover menu ----
  function closeMenu() { menu?.remove(); menu = null; }
  function showMenu(anchor, items, at) {
    closeMenu();
    menu = el('div', { className: 'sb-menu', role: 'menu' });
    for (const [label, fn, danger] of items) menu.append(el('button', { type: 'button', role: 'menuitem', className: 'sb-mi' + (danger ? ' danger' : ''), textContent: label, onclick: (e) => { e.stopPropagation(); closeMenu(); fn(); } }));
    box.append(menu);
    const b = box.getBoundingClientRect(), r = anchor.getBoundingClientRect();
    const x = at ? at.x - b.left : r.right - b.left - 144, y = at ? at.y - b.top : r.bottom - b.top + 4;
    menu.style.left = Math.max(4, Math.min(x, b.width - 148)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, b.height - menu.offsetHeight - 4)) + 'px';
    menu.querySelector('button').focus();
  }
  document.addEventListener('mousedown', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) { closeMenu(); e.stopPropagation(); } }, true);

  function inlineRename(node, cur, commit) {
    const inp = el('input', { className: 'sb-edit', value: cur, spellcheck: false });
    let done = false;
    const end = (save) => { if (done) return; done = true; const v = inp.value.trim(); inp.replaceWith(node); if (save && v && v !== cur) commit(v); };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false); };
    inp.onblur = () => end(true);
    inp.onclick = (e) => e.stopPropagation();
    node.replaceWith(inp); inp.focus(); inp.select();
  }

  const delSession = async (s) => {
    if (!confirm(`Delete "${s.title}"? This removes the chat history.`)) return;
    const wasActive = tree.active === s.id;
    const next = await api.call('sessions:delete', s.id);
    await refresh();
    if (wasActive) next ? open(next) : opts.onOpen?.(null); // nothing left to show
  };

  const nav = (e, all, el_) => { const k = all.indexOf(el_) + (e.key === 'ArrowDown' ? 1 : -1); all[k]?.focus(); e.preventDefault(); };

  // ---- rendering ----
  function row(s, i) {
    const title = el('span', { className: 'sb-title', textContent: s.title });
    const r = el('div', { className: 'sb-row' + (s.id === tree.active ? ' on' : ''), tabIndex: 0, role: 'button', title: s.title });
    r.dataset.id = s.id;
    if (s.id === fresh) { r.classList.add('sb-new'); fresh = null; }
    else if (!seen.has(s.id) && i < 8) { r.classList.add('sb-in'); r.style.animationDelay = i * 20 + 'ms'; }
    seen.add(s.id);
    r.append(el('span', { className:'sb-supercode', title: s.supercode ? 'Supercode' : '', innerHTML: !s.supercode ? '' :'<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 10-12h-7z"/></svg>' }));
    r.append(title);
    if (working.has(s.id)) r.append(el('span', { className: 'sb-spin', title: 'Working' }));
    else if (s.unread) r.append(el('span', { className: 'sb-dot' + (pinged.has(s.id) ? '' : ' ping'), title: 'Done, not read yet' })), pinged.add(s.id);
    else pinged.delete(s.id);
    const items = [['Rename', () => inlineRename(title, s.title, (v) => api.call('sessions:rename', s.id, v))], ['Delete', () => delSession(s), true]];
    r.append(btn('sb-more', 'Session actions', 'more', (e) => { e.stopPropagation(); showMenu(e.currentTarget, items); }));
    r.onclick = () => open(s.id);
    r.oncontextmenu = (e) => { e.preventDefault(); showMenu(r, items, { x: e.clientX, y: e.clientY }); };
    dnd(r, r, 'session', s.id, s.projectId);
    r.onkeydown = (e) => {
      if (e.target !== r) return;
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); moveBy('session', s.projectId, s.id, e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'Enter') open(s.id);
      else if (e.key === 'Delete') delSession(s);
      else if (e.key === 'F2') items[0][1]();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') nav(e, [...list.querySelectorAll('.sb-row,.sb-group-h,.sb-show')], r);
    };
    return r;
  }

  function group(p) {
    const name = el('span', { className: 'sb-name', textContent: p.name });
    const h = el('div', { className: 'sb-group-h' + (p.collapsed ? ' collapsed' : ''), tabIndex: 0, role: 'button', title: p.path });
    h.setAttribute('aria-expanded', String(!p.collapsed));
    const caret = icon('caret'); caret.classList.add('sb-caret');
    h.append(caret, name);
    const toggle = () => {
      p.collapsed = !p.collapsed;
      const t = tree.projects.find((x) => x.id === p.id); if (t) t.collapsed = p.collapsed;
      api.call('projects:toggle', p.id);
      render();
    };
    const items = [
      ['New session here', () => newSession(p)],
      ['Rename', () => inlineRename(name, p.name, (v) => api.call('projects:rename', p.id, v))],
      ['Copy path: ' + p.path, () => navigator.clipboard?.writeText(p.path)],
      ['Remove from list', async () => {
        if (!confirm(`Remove "${p.name}" from the list? Files on disk are not touched; its chats are deleted.`)) return;
        const was = tree.active; await api.call('projects:remove', p.id); await refresh();
        if (was && tree.active !== was) { const n = tree.sessions[0]?.id; n ? open(n) : opts.onOpen?.(null); }
      }, true],
    ];
    h.append(btn('sb-more', 'Project actions', 'more', (e) => { e.stopPropagation(); showMenu(e.currentTarget, items); }));
    h.append(btn('sb-more sb-add', 'New session', 'plus', (e) => { e.stopPropagation(); newSession(p); }));
    h.onclick = toggle;
    h.oncontextmenu = (e) => { e.preventDefault(); showMenu(h, items, { x: e.clientX, y: e.clientY }); };
    h.dataset.pid = p.id;
    h.onkeydown = (e) => {
      if (e.target !== h) return;
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); moveBy('project', null, p.id, e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') nav(e, [...list.querySelectorAll('.sb-row,.sb-group-h,.sb-show')], h);
    };
    const g = el('div', { className: 'sb-group' }, h);
    dnd(g, h, 'project', p.id, null);
    if (!p.collapsed) {
      const all = expanded.has(p.id), rows = all ? p.rows : p.rows.slice(0, LIMIT);
      g.append(...(rows.length ? rows.map(row) : [el('div', { className: 'sb-none', textContent: 'No sessions yet' })]));
      if (p.rows.length > LIMIT) {
        const more = el('div', { className: 'sb-show', tabIndex: 0, role: 'button', textContent: all ? 'Show less' : `Show more (${p.rows.length - LIMIT})` });
        const go = () => { all ? expanded.delete(p.id) : expanded.add(p.id); render(); };
        more.onclick = go; more.onkeydown = (e) => { if (e.key === 'Enter') go(); else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') nav(e, [...list.querySelectorAll('.sb-row,.sb-group-h,.sb-show')], more); };
        g.append(more);
      }
    }
    return g;
  }

  function render() {
    const fo = document.activeElement?.closest?.('.sb-row,.sb-group-h'), keep = fo?.classList.contains('sb-row') ? fo.dataset.id : null, keepP = fo?.dataset.pid;
    const gs = groups();
    list.replaceChildren(...(gs.length ? gs.map(group) : [el('div', { className: 'sb-none sb-empty', textContent: 'Add a project folder to start a session' })]));
    if (keep) list.querySelector(`.sb-row[data-id="${CSS.escape(keep)}"]`)?.focus();
    else if (keepP) list.querySelector(`.sb-group-h[data-pid="${CSS.escape(keepP)}"]`)?.focus();
  }

  // ---- search ----
  function closeSearch() { searchBox.hidden = true; list.hidden = false; input.value = ''; results.replaceChildren(); }
  function openSearch() { searchBox.hidden = false; list.hidden = true; input.focus(); }
  async function runSearch() {
    const q = input.value.trim();
    if (!q) return results.replaceChildren();
    const found = await api.call('sessions:search', q);
    if (input.value.trim() !== q) return; // stale
    const by = new Map();
    for (const r of found) (by.get(r.projectName) || by.set(r.projectName, []).get(r.projectName)).push(r);
    results.replaceChildren(...(found.length ? [...by].flatMap(([pn, rs]) => [
      el('div', { className: 'sb-group-h static', textContent: pn }),
      ...rs.map((r) => {
        const b = el('div', { className: 'sb-hit', tabIndex: 0, role: 'button', onclick: () => { closeSearch(); open(r.sessionId); } },
          el('span', { className: 'sb-title', textContent: r.title }), ...(r.snippet ? [el('span', { className: 'sb-snip', textContent: r.snippet })] : []));
        b.dataset.id = r.sessionId;
        b.onkeydown = (e) => { if (e.key === 'Enter') b.click(); };
        return b;
      }),
    ]) : [el('div', { className: 'sb-none', textContent: 'No matches' })]));
  }

  function mount(container, o = {}) {
    opts = o; box = container; box.classList.add('sb');
    list = el('div', { className: 'sb-list' });
    input = el('input', { className: 'sb-q', type: 'search', placeholder: 'Search sessions', spellcheck: false });
    input.setAttribute('aria-label', 'Search sessions');
    results = el('div', { className: 'sb-list' });
    searchBox = el('div', { className: 'sb-search', hidden: true }, input, results);
    input.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 120); };
    input.onkeydown = (e) => {
      if (e.key === 'Escape') { closeSearch(); e.stopPropagation(); }
      else if (e.key === 'Enter') results.querySelector('.sb-hit')?.click();
      else if (e.key === 'ArrowDown') { results.querySelector('.sb-hit')?.focus(); e.preventDefault(); }
    };
    const act = (label, ic, fn) => el('button', { type: 'button', className: 'sb-act', onclick: fn }, icon(ic), label);
    box.replaceChildren(
      el('div', { className: 'sb-top' }, act('New session', 'plus', () => newSession()), act('Search', 'search', () => (searchBox.hidden ? openSearch() : closeSearch())), act('Add project', 'folder', addProject)),
      searchBox, list,
    );
    api.on('sessions:changed', refreshSoon);
    const setWorking = (ids) => { working = new Set(ids || []); render(); };
    api.on('sessions:working', setWorking);
    api.call('sessions:working').then(setWorking, () => {});
    return refresh();
  }

  window.Sidebar = { mount, refresh, setActive };
})();
