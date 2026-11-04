// Skills page (renderer): Claude Code skills + plugins, Codex plugins, and the "always use" list.
// SkillsUI.init({ api, getSid }) once, SkillsUI.show() each time the tab opens. Talks to plugins.js over plugins:* channels.
(() => {
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, attrs); e.append(...kids.flat().filter((k) => k != null && k !== false)); return e; };
  const ICON = { folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/>', trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>', refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>', plus: '<path d="M12 5v14M5 12h14"/>' };
  const icon = (n) => el('span', { style: 'display:inline-flex', innerHTML: `<svg class="i" viewBox="0 0 24 24" style="width:16px;height:16px">${ICON[n]}</svg>` });

  const css = el('style', { textContent: `
    #skills .sk-seg { display:flex; gap:8px; margin-bottom:24px; flex-wrap:wrap; align-items:center; }
    #skills .sk-seg .gap { flex:1; }
    #skills .sk-stack { display:grid; gap:24px; }
    #skills .sk-head { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:12px; }
    #skills .sk-head h3 { margin:0; font-size:15px; font-weight:500; color:var(--text); }
    #skills .sk-head p { margin:4px 0 0; color:var(--muted); font-size:12px; }
    #skills .sk-row { display:flex; align-items:center; gap:12px; min-height:52px; padding:8px 0; border-top:1px solid var(--line); }
    #skills .sk-row:first-of-type { border-top:0; }
    #skills .sk-main { flex:1; min-width:0; }
    #skills .sk-name { color:var(--text); font-size:14px; display:flex; gap:8px; align-items:baseline; }
    #skills .sk-name span { color:var(--muted); font-size:12px; }
    #skills .sk-desc { color:var(--text-2); font-size:13px; line-height:18px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    #skills .sk-act { display:flex; gap:4px; align-items:center; flex:none; }
    #skills .sk-act .b { height:32px; padding:0 12px; font-size:13px; }
    #skills .sk-act .b.ic { padding:0 8px; }
    #skills .sk-empty { color:var(--muted); font-size:13px; padding:8px 0; }
    #skills .sk-err { color:var(--negative); font-size:13px; padding:8px 0; white-space:pre-wrap; }
    #skills .sk-add { display:flex; gap:8px; margin-top:12px; } #skills .sk-add input { flex:1; }
    #skills input[type=checkbox] { display:inline-block; width:16px; height:16px; padding:0; flex:none; accent-color:var(--text); cursor:pointer; }
    #skills .sk-opt { display:flex; align-items:center; gap:8px; color:var(--text-2); font-size:13px; cursor:pointer; }
    #skills .sk-checks { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:8px 24px; margin-bottom:12px; }
    #skills .sk-checks label { display:flex; align-items:center; gap:8px; font-size:14px; color:var(--text); cursor:pointer; min-width:0; }
    #skills .sk-checks label span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #skills .sk-checks small { color:var(--muted); font-size:11px; }
    #skills .seg button { height:28px; padding:0 12px; }
  ` });
  document.head.append(css);

  let api, getSid, root, tab = 'claude', view = 'installed', cache = {}, busy = new Set(), search = '', note = '';
  const call = async (ch, ...a) => { try { return (await api.call(ch, ...a)) || { ok: false, error: 'No answer' }; } catch (e) { const m = String(e.message || e); return { ok: false, error: /No handler registered/.test(m) ? 'Relay was updated: restart it with Ctrl+Shift+R to load this page' : m }; } };
  const seg = (items, cur, on) => el('div', { className: 'seg' }, ...items.map(([k, label]) => { const b = el('button', { textContent: label, type: 'button' }); if (k === cur) b.className = 'on'; b.onclick = () => on(k); return b; }));
  const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);

  // inline confirm: first click swaps the button for "Remove? Yes / No"
  function confirmBtn(label, onYes, extra = {}) {
    const box = el('span', { className: 'sk-act' });
    const show = () => {
      const b = el('button', { className: 'b ghost danger' + (extra.ic ? ' ic' : ''), type: 'button', title: label }, icon('trash'), extra.ic ? '' : label); b.setAttribute('aria-label', label);
      b.onclick = () => { box.replaceChildren(el('span', { className: 'muted', style: 'font-size:13px;margin-right:4px', textContent: 'Remove?' }), el('button', { className: 'b danger', type: 'button', textContent: 'Yes', onclick: onYes }), el('button', { className: 'b ghost', type: 'button', textContent: 'No', onclick: show })); };
      box.replaceChildren(b);
    };
    show(); return box;
  }
  const btn = (text, fn, cls = '', ic) => el('button', { className: 'b ' + cls, type: 'button', onclick: fn }, ic ? icon(ic) : '', text);

  async function act(key, ch, ...args) { // run an action, then reload the lists
    busy.add(key); note = ''; render();
    const r = await call(ch, ...args);
    busy.delete(key); if (!r.ok) note = r.error || 'Failed'; else note = key.startsWith('install') ? 'Installed. Restart a running agent to use it.' : '';
    cache = {}; await load(); render();
  }

  async function load() {
    if (tab === 'claude') {
      if (!cache.skills) cache.skills = await call('plugins:skills', getSid());
      if (!cache.cl) cache.cl = await call('plugins:claudeList');
      if (view === 'browse' && !cache.clb) { render(); cache.clb = await call('plugins:claudeBrowse'); }
    } else if (!cache.cx) { render(); cache.cx = await call('plugins:codexList'); }
  }

  const section = (title, sub, action, ...body) => el('div', { className: 'panel' }, el('div', { className: 'sk-head' }, el('div', {}, el('h3', { textContent: title }), sub ? el('p', { textContent: sub }) : null), action || null), ...body);
  const status = (r, loadingText) => !r ? el('div', { className: 'sk-empty', textContent: loadingText }) : !r.ok ? el('div', { className: 'sk-err', textContent: r.error || 'Could not load' }) : null;
  const rowEl = (main, acts) => el('div', { className: 'sk-row' }, el('div', { className: 'sk-main' }, ...main), el('div', { className: 'sk-act' }, ...acts));
  const nameEl = (n, meta, desc) => [el('div', { className: 'sk-name' }, n, meta ? el('span', { textContent: meta }) : null), desc ? el('div', { className: 'sk-desc', textContent: desc, title: desc }) : null];

  function marketplaces(list, addCh, rmCh, placeholder) {
    const input = el('input', { placeholder, 'aria-label': 'Add marketplace' });
    const go = () => { if (input.value.trim()) act('mk:' + input.value, addCh, input.value.trim()); };
    input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    return section('Marketplaces', 'Where plugins come from', null,
      ...(list.length ? list.map((m) => rowEl(nameEl(m.name, '', m.source), [confirmBtn('Remove', () => act('mkrm:' + m.name, rmCh, m.name), { ic: true })])) : [el('div', { className: 'sk-empty', textContent: 'No marketplaces yet' })]),
      el('div', { className: 'sk-add' }, input, btn(busy.size && [...busy].some((k) => k.startsWith('mk:')) ? 'Adding' : 'Add', go, '', 'plus')),
      el('span', { className: 'hint', textContent: 'A GitHub owner/repo or an https URL' }));
  }

  function claudeInstalled() {
    const s = cache.skills, c = cache.cl, out = [];
    out.push(section('Skills', 'Folders in ~/.claude/skills and the project .claude/skills', null,
      status(s, 'Loading skills') || (s.skills.length ? el('div', {}, ...s.skills.map((k) => rowEl(nameEl(k.name, k.source === 'user' ? 'User' : 'Project', k.description || 'No description'), [
        btn('', async () => { const r = await call('plugins:skillOpen', getSid(), k.source, k.name); if (!r.ok) { note = r.error; render(); } }, 'ghost ic', 'folder'),
        confirmBtn('Remove', async () => { const r = await call('plugins:skillRemove', getSid(), k.source, k.name); note = r.ok ? '' : r.error; cache = {}; await load(); render(); }, { ic: true })]))) : el('div', { className: 'sk-empty', textContent: 'No skills found' }))));
    out.push(section('Plugins', 'Installed in Claude Code', btn('Refresh', () => { cache = {}; load().then(render); }, 'ghost', 'refresh'),
      status(c, 'Loading plugins') || (c.plugins.length ? el('div', {}, ...c.plugins.map((p) => {
        const cb = el('input', { type: 'checkbox', checked: p.enabled, disabled: busy.has('t:' + p.id) }); cb.setAttribute('aria-label', 'Enabled');
        cb.onchange = () => act('t:' + p.id, 'plugins:claudeAct', cb.checked ? 'enable' : 'disable', p.id);
        return rowEl(nameEl(p.name, [p.version, p.marketplace].filter(Boolean).join(' · ')), [
          el('label', { className: 'sk-opt' }, cb, 'Enabled'),
          btn(busy.has('u:' + p.id) ? 'Updating' : 'Update', () => act('u:' + p.id, 'plugins:claudeAct', 'update', p.id), 'ghost'),
          confirmBtn('Remove', () => act('r:' + p.id, 'plugins:claudeAct', 'uninstall', p.id), { ic: true })]);
      })) : el('div', { className: 'sk-empty', textContent: 'No plugins installed' }))));
    if (c?.ok) out.push(marketplaces(c.marketplaces, 'plugins:claudeMarketAdd', 'plugins:claudeMarketRemove', 'anthropics/claude-plugins-official'));
    return out;
  }

  function browseList(items, onInstall, keyOf) {
    const q = search.toLowerCase(), hit = items.filter((p) => !q || (p.name + ' ' + (p.description || '') + ' ' + p.marketplace).toLowerCase().includes(q));
    const shown = hit.slice(0, 60);
    return [el('div', { style: 'display:flex;margin-bottom:12px' }, (() => { const i = el('input', { placeholder: 'Search plugins', value: search, 'aria-label': 'Search plugins' }); i.oninput = () => { search = i.value; const pos = i.selectionStart; render().then(() => { const n = root.querySelector('input[aria-label="Search plugins"]'); n?.focus(); n?.setSelectionRange(pos, pos); }); }; return i; })()),
      shown.length ? el('div', {}, ...shown.map((p) => rowEl(nameEl(p.name, [p.marketplace, p.installs ? fmt(p.installs) + ' installs' : '', p.version].filter(Boolean).join(' · '), p.description),
        [p.installed ? el('span', { className: 'muted', style: 'font-size:13px;padding:0 8px', textContent: 'Installed' }) : btn(busy.has(keyOf(p)) ? 'Installing' : 'Install', () => onInstall(p), '', 'plus')]))) : el('div', { className: 'sk-empty', textContent: 'Nothing matches' }),
      hit.length > shown.length ? el('div', { className: 'hint', textContent: `Showing ${shown.length} of ${hit.length}. Search to narrow down.` }) : null];
  }

  function claudeBrowse() {
    const b = cache.clb;
    return [section('Available plugins', 'From your configured marketplaces', null, status(b, 'Loading the plugin catalog') || browseList(b.available, (p) => act('install:' + p.id, 'plugins:claudeAct', 'install', p.id), (p) => 'install:' + p.id)),
      cache.cl?.ok ? marketplaces(cache.cl.marketplaces, 'plugins:claudeMarketAdd', 'plugins:claudeMarketRemove', 'anthropics/claude-plugins-official') : null];
  }

  function codex() {
    const c = cache.cx; if (!c || !c.ok) return [section('Plugins', 'Codex', null, status(c, 'Loading Codex plugins'))];
    const out = [];
    if (view === 'installed') {
      const ins = c.plugins.filter((p) => p.installed);
      out.push(section('Plugins', 'Installed in Codex', btn('Refresh', () => { cache = {}; load().then(render); }, 'ghost', 'refresh'), ins.length ? el('div', {}, ...ins.map((p) => rowEl(nameEl(p.name, [p.version, p.marketplace, p.enabled ? '' : 'Disabled'].filter(Boolean).join(' · ')), [confirmBtn('Remove', () => act('r:' + p.id, 'plugins:codexAct', 'remove', p.id), { ic: true })]))) : el('div', { className: 'sk-empty', textContent: 'No plugins installed' })));
    } else out.push(section('Available plugins', 'From your configured marketplaces', null, ...browseList(c.plugins, (p) => act('install:' + p.id, 'plugins:codexAct', 'add', p.id), (p) => 'install:' + p.id)));
    out.push(marketplaces(c.marketplaces, 'plugins:codexMarketAdd', 'plugins:codexMarketRemove', 'owner/repo'));
    return out;
  }

  // "Always use": same forced-skills.md file as before, one name per line (read and written through rules:get / rules:save)
  async function alwaysUse() {
    const box = el('div', { className: 'panel' }, el('div', { className: 'sk-empty', textContent: 'Loading' }));
    const r = await call('rules:get'); const f = r?.forced; if (!f) { box.replaceChildren(el('div', { className: 'sk-err', textContent: 'Could not read the list' })); return box; }
    const have = f.text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const known = new Map(); // name -> where it comes from
    for (const k of cache.skills?.skills || []) known.set(k.name, 'skill');
    for (const p of [...(cache.cl?.plugins || []), ...(cache.cx?.plugins || []).filter((p) => p.installed)]) if (!known.has(p.name)) known.set(p.name, 'plugin');
    const checks = [...known].sort((a, b) => a[0].localeCompare(b[0])).map(([n, kind]) => { const cb = el('input', { type: 'checkbox', checked: have.includes(n), value: n }); return el('label', {}, cb, el('span', { textContent: n, title: n }), el('small', { textContent: kind })); });
    const extra = el('textarea', { rows: 3, placeholder: 'One name per line, for example ponytail', value: have.filter((n) => !known.has(n)).join('\n'), 'aria-label': 'Other names' });
    const ok = el('span', { className: 'saved' });
    const save = async () => { const names = [...new Set([...checks.map((l) => l.firstChild).filter((c) => c.checked).map((c) => c.value), ...extra.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)])]; await call('rules:save', 'forced', names.join('\n') + (names.length ? '\n' : '')); ok.textContent = 'Saved'; setTimeout(() => ok.textContent = '', 1500); };
    checks.forEach((l) => l.firstChild.onchange = save); extra.onchange = save;
    box.replaceChildren(el('div', { className: 'sk-head' }, el('div', {}, el('h3', { textContent: 'Always use' }), el('p', { textContent: 'Added to every agent and subagent prompt · ' + f.path })), ok),
      checks.length ? el('div', { className: 'sk-checks' }, ...checks) : el('div', { className: 'sk-empty', textContent: 'No installed skills or plugins found' }),
      el('label', { className: 'hint', style: 'margin-bottom:6px', textContent: 'Other names' }), extra);
    return box;
  }

  let token = 0;
  async function render() {
    if (!root) return; const t = ++token;
    const body = tab === 'claude' ? (view === 'installed' ? claudeInstalled() : claudeBrowse()) : codex();
    const top = el('div', { className: 'sk-seg' }, seg([['claude', 'Claude Code'], ['codex', 'Codex']], tab, (k) => { tab = k; view = 'installed'; search = ''; note = ''; load().then(render); render(); }),
      seg([['installed', 'Installed'], ['browse', 'Browse']], view, (k) => { view = k; search = ''; note = ''; load().then(render); render(); }));
    const stack = el('div', { className: 'sk-stack' }, note ? el('div', { className: note.startsWith('Installed') ? 'hint' : 'sk-err', textContent: note }) : null, ...body.filter(Boolean));
    const au = await alwaysUse(); if (t !== token) return;
    stack.append(au);
    const old = root.querySelector('.sk-wrap'); const y = old ? old.parentElement.scrollTop : 0;
    root.querySelector('.sk-wrap')?.remove();
    root.append(el('div', { className: 'sk-wrap' }, top, stack));
    if (y) root.scrollTop = y;
  }

  window.SkillsUI = {
    init(o) { api = o.api; getSid = o.getSid; root = document.getElementById('skills'); },
    show() { cache = {}; busy.clear(); note = ''; render(); load().then(render); },
  };
})();
