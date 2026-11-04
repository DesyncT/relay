// Keyboard navigation, session switching and message search. No chat HTML is rewritten.
window.QuickActions = (() => {
  let ctx, dialog, input, results, status, mode, selected = 0, entries = [], sessions = [], generation = 0;
  const node = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const chatOpen = () => !!ctx.sid() && document.querySelector('#chat').classList.contains('on');
  async function exportChat() {
    if (!ctx.sid()) return;
    try { await window.api.call('chat:export', ctx.sid()); }
    catch (error) { window.alert('Could not export chat: ' + error.message); }
  }
  function commands() {
    return [
      {label:'Find in chat', hint:'Ctrl+F', run:()=>open('find'), disabled:!chatOpen()},
      {label:'Switch session', hint:'Ctrl+K', run:()=>open('sessions')},
      {label:'New session in this project', hint:'Ctrl+N', run:ctx.newSession, disabled:!ctx.sid()},
      {label:'Export chat as Markdown', hint:'Save a copy', run:exportChat, disabled:!ctx.sid()},
      {label:'Focus message composer', hint:'Ctrl+L', run:()=>document.querySelector('#input').focus(), disabled:!chatOpen()},
      ...['chat','usage','rules','agents','settings'].map(tab=>({label:tab === 'agents' ? 'Open subagents' : 'Open '+tab, run:()=>ctx.tab(tab)})),
    ].filter(x=>!x.disabled);
  }
  function draw() {
    const query = input.value.trim().toLocaleLowerCase();
    const source = mode === 'find'
      ? [...document.querySelectorAll('#log .msg')].filter(row=>row._m).map(row=>({
          label:String(row._m.text || ''), hint:row._m.from || 'Message', run:()=>{
            document.querySelectorAll('#log .search-hit').forEach(x=>x.classList.remove('search-hit'));
            row.classList.add('search-hit'); row.tabIndex = -1; row.focus({preventScroll:true});
            row.scrollIntoView({block:'center', behavior:'instant'});
          }}))
      : mode === 'sessions' ? sessions : commands();
    entries = (mode === 'find' && !query ? [] : source.filter(x=>(x.label+' '+(x.hint || '')).toLocaleLowerCase().includes(query)));
    selected = Math.max(0, Math.min(selected, entries.length - 1));
    results.replaceChildren(...entries.map((entry, index)=>{
      const button = node('button', {type:'button', className:'quick-result'+(index===selected ? ' selected' : ''), tabIndex:-1});
      button.id = 'quick-result-'+index; button.setAttribute('role','option'); button.setAttribute('aria-selected',String(index===selected));
      button.append(node('span',{textContent:entry.label.slice(0,240)}),node('small',{textContent:entry.hint || ''}));
      button.onclick = ()=>activate(index); return button;
    }));
    status.textContent = mode === 'find' && !query ? 'Type to search this chat' : entries.length ? entries.length+' results · ↑ ↓ to navigate · Enter to open' : 'No results';
    if (entries.length) input.setAttribute('aria-activedescendant','quick-result-'+selected);
    else input.removeAttribute('aria-activedescendant');
    results.children[selected]?.scrollIntoView({block:'nearest'});
  }
  function activate(index) {
    const entry = entries[index]; if (!entry) return;
    dialog.close(); Promise.resolve().then(entry.run).catch(error=>window.alert(error.message));
  }
  async function open(next = 'commands') {
    if (next === 'find' && !chatOpen()) return;
    const token = ++generation; mode = next; selected = 0; sessions = []; input.value = '';
    const title = mode === 'find' ? 'Find in chat' : mode === 'sessions' ? 'Switch session' : 'Command palette';
    dialog.querySelector('h2').textContent = title; input.setAttribute('aria-label',title);
    input.placeholder = mode === 'find' ? 'Search message text…' : mode === 'sessions' ? 'Search sessions or projects…' : 'Search actions…';
    if (!dialog.open) dialog.showModal(); input.focus(); draw();
    if (next !== 'sessions') return;
    status.textContent = 'Loading sessions…';
    try {
      const tree = await window.api.call('sessions:tree');
      if (token !== generation || !dialog.open) return;
      sessions = (tree.sessions || []).map(session=>({label:session.title || 'New session',
        hint:(tree.projects || []).find(project=>project.id===session.projectId)?.name || 'Session',
        run:async()=>{ await window.api.call('sessions:setActive',session.id); await ctx.session(session.id); }}));
      draw();
    } catch { if (token===generation && dialog.open) status.textContent = 'Could not load sessions. Close and try again.'; }
  }
  function mount(options) {
    ctx = options;
    dialog = node('dialog',{id:'quickActions'}); dialog.setAttribute('aria-labelledby','quickTitle');
    const header = node('header'), title = node('h2',{id:'quickTitle'}), close = node('button',{type:'button',textContent:'Close'});
    close.onclick = ()=>dialog.close(); header.append(title,close);
    input = node('input',{type:'search',autocomplete:'off',spellcheck:false});
    input.setAttribute('role','combobox'); input.setAttribute('aria-controls','quickResults'); input.setAttribute('aria-expanded','true'); input.setAttribute('aria-autocomplete','list');
    results = node('div',{id:'quickResults'}); results.setAttribute('role','listbox'); results.setAttribute('aria-label','Results');
    status = node('p'); status.setAttribute('role','status'); dialog.append(header,input,results,status); document.body.append(dialog);
    input.oninput = ()=>{selected=0; draw();};
    dialog.addEventListener('keydown',event=>{
      if (event.isComposing || event.target !== input) return;
      if (event.key==='ArrowDown' || event.key==='ArrowUp') { event.preventDefault(); selected=entries.length ? (selected+(event.key==='ArrowDown' ? 1 : -1)+entries.length)%entries.length : 0; draw(); }
      if (event.key==='Enter') {event.preventDefault(); activate(selected);}
    });
    document.querySelector('#quickBtn').onclick = ()=>open();
    document.addEventListener('keydown',event=>{
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
      const key = event.key.toLowerCase();
      if ((key==='p' && event.shiftKey) || (key==='k' && !event.shiftKey)) {event.preventDefault(); open(key==='k' ? 'sessions' : 'commands');}
      else if (key==='f' && chatOpen() && !event.shiftKey) {event.preventDefault(); open('find');}
      else if (!dialog.open && !event.shiftKey && key==='l' && chatOpen()) {event.preventDefault(); document.querySelector('#input').focus();}
      else if (!dialog.open && !event.shiftKey && key==='n' && ctx.sid()) {event.preventDefault(); Promise.resolve(ctx.newSession()).catch(error=>window.alert(error.message));}
    });
  }
  return {mount,open,exportChat};
})();
