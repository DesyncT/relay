// "Default models" panel (Rules tab): one model + effort per provider. Classic script: window.RoutingUI = { mount, badge }.
// Uses the page's globals el() and logo() when present; falls back to tiny local versions (standalone harness).
(() => {
  const EFFORTS = ['low', 'medium', 'high'];
  const MODELS = {
    claude: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'],
    codex: ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'],
    antigravity: ['gemini-3.8-flash-high', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-low', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.8-pro'],
  };
  const one = (model, effort) => ({ planning: [model, effort], coding: [model, effort], other: [model, effort] });
  const DEFAULTS = { claude: one('claude-sonnet-5-5', 'low'), codex: one('gpt-6.1-sol', 'low'), antigravity: one('gemini-3.8-flash-low', 'low') };
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

  function mount(container, { get, save, prices, disabledProviders } = {}) {
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

    // One model per provider: every phase (planning, coding, other) runs the same default
    const cell = (agent) => {
      const all = norm()[agent], r = all.coding, price = mk('div', { className: 'rt-price' });
      const dl = mk('datalist', { id: `rt-${agent}` }, ...(MODELS[agent] || []).map((m) => mk('option', { value: m })));
      const sync = () => { for (const p in all) all[p] = { model: r.model, effort: r.effort }; };
      const upd = () => { price.textContent = priceOf(prices, r.model); };
      const inp = mk('input', { type: 'text', value: r.model, spellcheck: false, autocomplete: 'off', placeholder: DEFAULTS[agent].coding[0] });
      inp.setAttribute('list', dl.id); inp.setAttribute('aria-label', `${agent} default model`);
      inp.onchange = () => { r.model = inp.value.trim() || DEFAULTS[agent].coding[0]; inp.value = r.model; upd(); sync(); commit(); };
      const seg = mk('div', { className: 'seg', role: 'group' });
      seg.setAttribute('aria-label', `${agent} effort`);
      const btns = EFFORTS.map((e) => { const b = mk('button', { type: 'button', textContent: e }); b.setAttribute('aria-pressed', 'false'); b.onclick = () => { r.effort = e; paint(); sync(); commit(); }; return b; });
      const paint = () => btns.forEach((b, i) => { const on = EFFORTS[i] === r.effort; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      seg.append(...btns); paint(); upd();
      return mk('div', { className: 'rt-cell' }, dl, inp, price, seg);
    };

    const render = () => {
      const reset = mk('button', { className: 'b', type: 'button', textContent: 'Reset to defaults' });
      reset.onclick = () => { routes = defaults(); render(); commit(); };
      const disabled = disabledProviders || [];
      const agents = ['claude', 'codex', 'antigravity'].filter(a => !disabled.includes(a));
      const agentNames = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity' };
      const grid = mk('div', { className: 'rt-grid' },
        mk('div'), ...agents.map(a => mk('div', { className: 'rt-col' }, mkLogo(a), agentNames[a])),
        mk('div', { className: 'rt-phase' }, mk('b', { textContent: 'Default model' }), mk('span', { textContent: 'Used for every task. Spreader runs this model on whichever provider it picks' })),
        ...agents.map(cell)
      );
      grid.style.gridTemplateColumns = `minmax(140px,1fr) repeat(${agents.length},minmax(200px,1.3fr))`;
      container.replaceChildren(mk('div', { className: 'rt' },
        mk('div', { className: 'rt-head' }, mk('h3', { textContent: 'Default models' }), saved),
        grid, mk('div', { className: 'rt-foot' }, reset)));
    };
    render();
  }

  window.RoutingUI = { mount, badge };
})();
