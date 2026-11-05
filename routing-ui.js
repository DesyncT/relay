// "Model routing" panel (Rules tab). Classic script: window.RoutingUI = { mount, badge }.
// Uses the page's globals el() and logo() when present; falls back to tiny local versions (standalone harness).
(() => {
  const PHASES = [['planning', 'Planning', 'Before you say go, and the lead’s first proposal'], ['coding', 'Coding', 'After go, while agents build and edit'], ['other', 'Other', 'Quick @mention questions, reviews, chit-chat, subagents']];
  const EFFORTS = ['low', 'medium', 'high'];
  const MODELS = {
    claude: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'],
    codex: ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'],
    antigravity: ['gemini-3.8-flash-high', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-low', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.8-pro'],
  };
  const DEFAULTS = {
    claude: { planning: ['claude-haiku-5-5', 'low'], coding: ['claude-opus-5-5', 'medium'], other: ['claude-sonnet-5-5', 'medium'] },
    codex: { planning: ['gpt-6-luna', 'low'], coding: ['gpt-6-astra', 'medium'], other: ['gpt-6.1-sol', 'medium'] },
    antigravity: { planning: ['gemini-3.5-flash-lite', 'low'], coding: ['gemini-3.8-flash-low', 'low'], other: ['gemini-3.5-flash-lite', 'low'] },
  };
  const DEFAULT_ROUTES = DEFAULTS;
  // same ladders as worker-routing.js: requirement tasks start on the first and climb at most to the limit
  const TASK_LADDER = {
    claude: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
    codex: ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'],
    antigravity: ['gemini-3.5-flash-lite', 'gemini-3.8-flash-low', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-high'],
  };
  const defaults = () => Object.fromEntries(Object.entries(DEFAULTS).map(([a, ph]) => [a, Object.fromEntries(Object.entries(ph).map(([p, [model, effort]]) => [p, { model, effort }]))]));

  const mk = typeof el === 'function' ? el : (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, attrs); e.append(...kids); return e; };
  const mkLogo = (name) => {
    const s = document.createElement('span');
    s.style.display = 'inline-flex';
    const color = name === 'claude' ? '#D97757' : name === 'antigravity' ? '#4E88F5' : '#fff';
    s.innerHTML = typeof logo === 'function' ? logo(name === 'codex' ? 'openai' : name, 16, color) : '';
    return s;
  };

  const css = `
  .rt { border:1px solid var(--line); border-radius:8px; background:var(--card); margin-bottom:16px; }
  .rt-head { display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--line); }
  .rt-head h3 { margin:0; font-size:14px; font-weight:600; flex:1; }
  .rt-saved { color:var(--muted); font-size:12px; opacity:0; transition:opacity .2s var(--ease); } .rt-saved.on { opacity:1; }
  .rt-grid { display:grid; grid-template-columns:minmax(140px,1fr) repeat(auto-fit,minmax(200px,1.3fr)); gap:0; }
  .rt-grid > div { padding:12px 16px; border-bottom:1px solid var(--line); min-width:0; }
  .rt-col { display:flex; align-items:center; gap:8px; color:var(--text-2); font-size:12px; }
  .rt-phase b { display:block; font-weight:500; font-size:13px; } .rt-phase span { display:block; color:var(--muted); font-size:12px; line-height:16px; margin-top:2px; }
  .rt-cell { display:flex; flex-direction:column; gap:8px; }
  .rt-cell select { padding:4px 8px; font-family:var(--mono); font-size:12px; height:28px; }
  .rt-cell input { padding:4px 8px; font-family:var(--mono); font-size:12px; line-height:16px; height:28px; }
  .rt-price { color:var(--muted); font-size:12px; line-height:16px; min-height:16px; font-family:var(--mono); }
  .rt .seg { align-self:flex-start; }
  .rt-foot { display:flex; justify-content:flex-end; padding:8px 16px; border-top:1px solid var(--line); }
  .rt-chip { color:var(--text-2); font-size:12px; font-weight:400; line-height:16px; white-space:nowrap; }
  .rt-chip i { font-style:normal; color:var(--muted); margin-left:4px; }
  @media (max-width:720px) { .rt-grid { grid-template-columns:1fr !important; } }`;
  const injectCss = () => { if (document.getElementById('rt-css')) return; const s = document.createElement('style'); s.id = 'rt-css'; s.textContent = css; document.head.append(s); };

  // Longest matching prefix wins, same as usage.js. prices rows: [input, output, ...] USD per MTok.
  const priceOf = (prices, model) => {
    if (!prices || !model) return '';
    const k = Object.keys(prices).filter((x) => x[0] !== '_' && model.startsWith(x)).sort((a, b) => b.length - a.length)[0];
    const r = k && prices[k];
    return r ? `$${r[0]} in / $${r[1]} out per MTok` : '';
  };

  // "claude-haiku-5-5" -> "haiku", "gpt-6.1-sol" -> "sol"; unknown ids are shown whole.
  const short = (m) => { m = String(m || ''); const x = /^claude-([a-z]+)/.exec(m) || /^gpt-[\d.]+-([a-z]+)/.exec(m) || /^gemini-[\d.]+-([a-z]+)/.exec(m); return x ? x[1] : m; };
  function badge(model, effort) {
    if (!model && !effort) return mk('span');
    const n = short(model), c = mk('span', { className: 'rt-chip', textContent: n ? n[0].toUpperCase() + n.slice(1) : '', title: [model, effort && effort + ' effort'].filter(Boolean).join(', ') });
    if (effort) c.append(mk('i', { textContent: effort }));
    return c;
  }

  function mount(container, { get, save, prices, disabledProviders, limits = {}, saveLimits } = {}) {
    injectCss();
    let routes = null, timer;
    const norm = () => {
      if (routes) return routes;
      const d = defaults(), g = (get && get()) || {};
      routes = {};
      for (const a in d) { routes[a] = {}; for (const p in d[a]) routes[a][p] = Object.assign({}, d[a][p], g[a] && g[a][p]); }
      return routes;
    };
    const saved = mk('span', { className: 'rt-saved', textContent: 'Saved' });
    const commit = () => { save && save(JSON.parse(JSON.stringify(routes))); saved.classList.add('on'); clearTimeout(timer); timer = setTimeout(() => saved.classList.remove('on'), 1200); };

    const cell = (agent, phase) => {
      const r = norm()[agent][phase], price = mk('div', { className: 'rt-price' });
      const dl = mk('datalist', { id: `rt-${agent}-${phase}` }, ...(MODELS[agent] || []).map((m) => mk('option', { value: m })));
      const upd = () => { price.textContent = priceOf(prices, r.model); };
      const inp = mk('input', { type: 'text', value: r.model, spellcheck: false, autocomplete: 'off', placeholder: DEFAULTS[agent][phase][0] });
      inp.setAttribute('list', dl.id); inp.setAttribute('aria-label', `${agent} ${phase} model`);
      inp.onchange = () => { r.model = inp.value.trim() || DEFAULTS[agent][phase][0]; inp.value = r.model; upd(); commit(); };
      const seg = mk('div', { className: 'seg', role: 'group' });
      seg.setAttribute('aria-label', `${agent} ${phase} effort`);
      const btns = EFFORTS.map((e) => { const b = mk('button', { type: 'button', textContent: e }); b.setAttribute('aria-pressed', 'false'); b.onclick = () => { r.effort = e; paint(); commit(); }; return b; });
      const paint = () => btns.forEach((b, i) => { const on = EFFORTS[i] === r.effort; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      seg.append(...btns); paint(); upd();
      return mk('div', { className: 'rt-cell' }, dl, inp, price, seg);
    };

    // Task limit: the strongest model a requirement task may move up to when it fails (default: the middle tier)
    const limitCell = (agent) => {
      const ladder = TASK_LADDER[agent] || [], price = mk('div', { className: 'rt-price' });
      const sel = mk('select', {}, ...ladder.map((m) => mk('option', { value: m, textContent: m })));
      sel.value = ladder.includes(limits[agent]) ? limits[agent] : ladder[1];
      sel.setAttribute('aria-label', `${agent} task model limit`);
      const upd = () => { price.textContent = priceOf(prices, sel.value); };
      sel.onchange = () => { limits = { ...limits, [agent]: sel.value }; upd(); saveLimits && saveLimits(limits); saved.classList.add('on'); clearTimeout(timer); timer = setTimeout(() => saved.classList.remove('on'), 1200); };
      upd();
      return mk('div', { className: 'rt-cell' }, sel, price);
    };

    const render = () => {
      const reset = mk('button', { className: 'b', type: 'button', textContent: 'Reset to defaults' });
      reset.onclick = () => { routes = defaults(); render(); commit(); };
      const disabled = disabledProviders || [];
      const agents = ['claude', 'codex', 'antigravity'].filter(a => !disabled.includes(a));
      const agentNames = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity' };
      const grid = mk('div', { className: 'rt-grid' },
        mk('div'), ...agents.map(a => mk('div', { className: 'rt-col' }, mkLogo(a), agentNames[a])),
        ...PHASES.flatMap(([p, name, desc]) => [
          mk('div', { className: 'rt-phase' }, mk('b', { textContent: name }), mk('span', { textContent: desc })),
          ...agents.map(a => cell(a, p))
        ]),
        mk('div', { className: 'rt-phase' }, mk('b', { textContent: 'Task limit' }), mk('span', { textContent: 'Strongest model a checklist task may move up to when it fails' })),
        ...agents.map(limitCell)
      );
      grid.style.gridTemplateColumns = `minmax(140px,1fr) repeat(${agents.length},minmax(200px,1.3fr))`;
      container.replaceChildren(mk('div', { className: 'rt' },
        mk('div', { className: 'rt-head' }, mk('h3', { textContent: 'Model routing' }), saved),
        grid, mk('div', { className: 'rt-foot' }, reset)));
    };
    render();
  }

  window.RoutingUI = { mount, badge };
})();
