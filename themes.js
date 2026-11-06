/* Shared theme tokens. Saved values are data, never executable styles. */
(() => {
  'use strict';
  const storageKey = 'relay.theme.v1';
  const tokenMap = {deep:'deep',bg:'bg',card:'card',raised:'raised',text:'text',text2:'text-2',muted:'muted',line:'line',lineStrong:'line-strong',accent:'claude',codex:'codex',negative:'negative'};
  const presets = {
    graphite: {name:'Graphite', description:'Quiet charcoal. The Relay original.',style:'rounded',font:'sans',colors:{deep:'#111112',bg:'#181819',card:'#1e1e20',raised:'#29292c',text:'#ededee',text2:'#b5b5bc',muted:'#96969e',line:'#303033',lineStrong:'#444449',accent:'#e5997c',codex:'#dedee3',negative:'#f16b70'}},
    paper: {name:'Paper', description:'Warm white, ink, and a softer contrast.',style:'rounded',font:'sans',colors:{deep:'#e9e7e2',bg:'#f6f4ef',card:'#ffffff',raised:'#e5e2da',text:'#222321',text2:'#51544e',muted:'#62665e',line:'#d5d3cb',lineStrong:'#b5b7ad',accent:'#9c432c',codex:'#46554b',negative:'#b52d36'}},
    midnight: {name:'Midnight', description:'Deep blue with a restrained lavender accent.',style:'rounded',font:'sans',colors:{deep:'#11141e',bg:'#171b29',card:'#1d2333',raised:'#2a3247',text:'#edf0fa',text2:'#bcc5db',muted:'#a0aecb',line:'#343e56',lineStrong:'#4c5c7b',accent:'#b4a6e8',codex:'#b9d5e4',negative:'#f68a95'}},
    forest: {name:'Forest',description:'Pine charcoal with fresh sage highlights.',style:'rounded',font:'sans',colors:{deep:'#101613',bg:'#161e19',card:'#1c2821',raised:'#29382e',text:'#eff6ee',text2:'#c2d5c4',muted:'#a4bba8',line:'#34483a',lineStrong:'#506956',accent:'#b0d694',codex:'#c8e5d3',negative:'#ff9c9c'}},
    ember: {name:'Ember',description:'Warm charcoal, copper, and late-night focus.',style:'rounded',font:'sans',colors:{deep:'#191311',bg:'#211a17',card:'#2b221d',raised:'#3c3028',text:'#fff1e7',text2:'#dfc8b8',muted:'#c4ac9b',line:'#4c3b30',lineStrong:'#705544',accent:'#ffba83',codex:'#f0d7b3',negative:'#ffa3a3'}},
    ocean: {name:'Ocean',description:'Deep sea surfaces with clear aqua accents.',style:'square',font:'sans',colors:{deep:'#0d171c',bg:'#132129',card:'#1a2b34',raised:'#253e48',text:'#ebf7fa',text2:'#c1dce3',muted:'#a4c3ce',line:'#304c58',lineStrong:'#4b6d7b',accent:'#8bdcd5',codex:'#b4d9f5',negative:'#ffa2ac'}},
    porcelain: {name:'Porcelain',description:'Cool white, slate ink, and cobalt details.',style:'rounded',font:'sans',colors:{deep:'#e6eaf0',bg:'#f4f6fa',card:'#ffffff',raised:'#dce3ed',text:'#172435',text2:'#35475c',muted:'#4c5b70',line:'#cad3df',lineStrong:'#a4b2c5',accent:'#2458a6',codex:'#315e69',negative:'#ac3042'}},
    terminal: {name:'Terminal', description:'Phosphor green. Monospace. Square corners.',style:'square',font:'mono',colors:{deep:'#0a100c',bg:'#101812',card:'#16201a',raised:'#213228',text:'#d5f2d9',text2:'#a8cfb0',muted:'#91b49a',line:'#2e4936',lineStrong:'#456d51',accent:'#a1e9af',codex:'#d5f2d9',negative:'#f38d8d'}}
  };
  for (const theme of Object.values(presets)) Object.assign(theme, {radius:theme.style === 'square' ? 0 : 8,borderWidth:1,density:'comfortable'});
  function luminance(hex) {
    const rgb = [1,3,5].map(start => parseInt(hex.slice(start,start+2),16)/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  }
  function validate(value) {
    if (!value || typeof value !== 'object' || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 48 || !['sans','mono','serif'].includes(value.font) || !Number.isFinite(value.radius) || value.radius < 0 || value.radius > 20 || !Number.isFinite(value.borderWidth) || value.borderWidth < 0 || value.borderWidth > 2 || !['compact','comfortable'].includes(value.density)) return null;
    const colors = {};
    for (const key of Object.keys(tokenMap)) {
      if (typeof value.colors?.[key] !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value.colors[key])) return null;
      colors[key] = value.colors[key];
    }
    for (const key of Object.keys(tokenMap).filter(key => !['line','lineStrong'].includes(key))) {
      if (colors[key].length === 9 && !/ff$/i.test(colors[key])) return null;
    }
    for (const surface of ['deep','bg','card','raised']) for (const foreground of ['text','text2','muted']) {
      const a=luminance(colors[surface]), b=luminance(colors[foreground]);
      if ((Math.max(a,b)+.05)/(Math.min(a,b)+.05) < 4.5) return null;
    }
    return {name:value.name.trim(),font:value.font,radius:value.radius,borderWidth:value.borderWidth,density:value.density,colors};
  }
  let selected = 'graphite', custom = null;
  function apply(theme, id) {
    for (const [key, token] of Object.entries(tokenMap)) document.documentElement.style.setProperty('--'+token, theme.colors[key]);
    document.documentElement.style.setProperty('--app-font', theme.font === 'mono' ? 'var(--mono)' : theme.font === 'serif' ? 'Georgia, Cambria, serif' : '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif');
    document.documentElement.style.setProperty('--app-radius', theme.radius+'px');
    document.documentElement.dataset.themeStyle = theme.radius === 0 ? 'square' : 'rounded';
    document.documentElement.dataset.relayTheme = id;
    document.documentElement.style.setProperty('--app-border-width',theme.borderWidth+'px');
    document.documentElement.style.setProperty('--app-control-height',theme.density === 'compact' ? '30px' : '36px');
    document.documentElement.style.setProperty('--app-density-space',theme.density === 'compact' ? '16px' : '24px');
    document.documentElement.dataset.themeFont = theme.font;
    document.documentElement.style.colorScheme = luminance(theme.colors.bg) > .179 ? 'light' : 'dark';
    if (document.body) document.body.dataset.theme = id;
    selected = id;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.id === 'custom' && (custom = validate(saved.theme))) apply(custom, 'custom');
    else if (presets[saved?.id]) apply(presets[saved.id], saved.id);
  } catch (_) { /* Private browsing or corrupt storage: use the default. */ }
  function mount({api}) {
    const page = document.getElementById('themes');
    if (!page || page.dataset.mounted) return;
    page.dataset.mounted = 'true';
    document.body.dataset.theme = selected;
    page.innerHTML = '<div class="page-head"><div><h2>Themes</h2><p>A different atmosphere for the same workspace.</p></div></div><div class="theme-presets" role="group" aria-label="Choose a theme"></div><div class="theme-generate"><div><h3>Find a new palette</h3><p>Ask your connected AI provider for a random theme. Preview it here before applying.</p></div><button type="button" class="b" id="themeGenerate">Generate with AI</button></div><p class="theme-status" role="status" aria-live="polite"></p><div class="theme-generated" hidden></div><p class="theme-local">Your theme is saved on this device.</p>';
    const grid = page.querySelector('.theme-presets');
    const status = page.querySelector('.theme-status');
    const generated = page.querySelector('.theme-generated');
    const generate = page.querySelector('#themeGenerate');
    function persist(theme,id) {
      apply(theme,id);
      try { localStorage.setItem(storageKey, JSON.stringify({id,theme:id === 'custom' ? theme : undefined})); status.textContent = theme.name+' applied.'; }
      catch (_) { status.textContent = theme.name+' applied. Your browser could not save this preference.'; }
      updateSelection();
    }
    function updateSelection() {
      grid.querySelectorAll('button').forEach(button => {
        const active = button.dataset.theme === selected;
        button.setAttribute('aria-pressed', String(active));
        button.querySelector('.theme-choice-state').textContent = active ? 'Active' : 'Use theme';
      });
    }
    function preview(theme) {
      const visual = document.createElement('div');
      visual.className = 'theme-preview';
      visual.setAttribute('aria-hidden','true');
      visual.style.borderWidth = theme.borderWidth+'px';
      visual.style.fontFamily = theme.font === 'mono' ? 'var(--mono)' : theme.font === 'serif' ? 'Georgia, serif' : 'inherit';
      for (const [key,token] of Object.entries(tokenMap)) visual.style.setProperty('--'+token, theme.colors[key]);
      visual.style.borderRadius = theme.radius+'px';
      visual.innerHTML = '<div class="theme-preview-rail"><i></i><i></i><i></i></div><div class="theme-preview-content"><div class="theme-preview-heading">Relay</div><div class="theme-preview-line"></div><div class="theme-preview-message"><span></span><div><i></i><i></i></div></div><div class="theme-preview-input"></div></div>';
      return visual;
    }
    function card(theme,id) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'theme-choice'; button.dataset.theme = id;
      button.append(preview(theme));
      const title = document.createElement('span'); title.className='theme-choice-title'; title.textContent=theme.name;
      const state = document.createElement('span'); state.className='theme-choice-state';
      title.append(state); button.append(title);
      const description = document.createElement('span'); description.className='theme-choice-description'; description.textContent=theme.description || 'Your AI-generated palette.'; button.append(description);
      button.addEventListener('click',()=>persist(theme,id)); grid.append(button);
    }
    Object.entries(presets).forEach(([id,theme])=>card(theme,id));
    if (custom) card(custom,'custom');
    updateSelection();
    generate.addEventListener('click', async () => {
      let failed=false;
      generate.disabled = true; generate.textContent = 'Generating…'; page.setAttribute('aria-busy','true');
      status.textContent = 'Creating a palette with your connected provider…'; generated.hidden = true;
      try {
        const result = await api.call('themes:generate');
        const theme = validate(result);
        if (!theme) throw new Error('The provider returned an invalid theme. Try generating again.');
        generated.replaceChildren(preview(theme));
        const detail = document.createElement('div');
        const heading = document.createElement('h3'); heading.textContent=theme.name;
        const copy = document.createElement('p'); copy.textContent=(theme.font === 'mono' ? 'Monospace' : theme.font === 'serif' ? 'Serif' : 'Sans serif')+' · '+theme.radius+'px corners · '+theme.borderWidth+'px borders · '+theme.density;
        const use = document.createElement('button'); use.type='button'; use.className='b primary'; use.textContent='Use theme';
        use.addEventListener('click',()=>{
          custom=theme; grid.querySelector('[data-theme="custom"]')?.remove(); card(theme,'custom'); persist(theme,'custom'); generated.hidden=true;
        });
        detail.append(heading,copy,use); generated.append(detail); generated.hidden=false;
        status.textContent='Your new theme is ready to preview.';
      } catch (error) { failed=true; status.textContent=error?.message || 'Theme generation failed. Please try again.'; }
      finally { generate.disabled=false; generate.textContent=failed ? 'Retry generation' : 'Generate with AI'; page.removeAttribute('aria-busy'); }
    });
  }
  window.Themes = {mount};
})();
