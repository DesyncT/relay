// Run: node_modules/.bin/electron test-renderer.js
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = process.env.RELAY_TEST_OUTPUT || path.join(app.getPath('temp'), 'relay-ui-check');
// Hidden test windows must use foreground frame scheduling for input latency.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true });
  const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: path.join(__dirname, 'test-renderer-preload.js'), contextIsolation: true, backgroundThrottling:false } });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level === 3 && !message.includes('Electron Security Warning')) errors.push(message); });
  await win.loadFile(path.join(process.env.RELAY_TEST_APP || __dirname, 'index.html'));
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await win.webContents.executeJavaScript(`
    clearTimeout(bootTimer); document.querySelector('#boot')?.remove();
    document.querySelectorAll('main > section').forEach(s => s.classList.toggle('on', s.id === 'chat'));
    openSid = 'ui-test'; cfg = { lead: 'claude' };
    document.querySelector('#chat').classList.remove('ro');
    document.querySelector('#chName').textContent = 'Website requirements';
    document.querySelector('#log').replaceChildren();
    renderReqs({ items: [], idle: true });
    addMsg({from:'user', text:'Help me define the requirements for a customer portal.', at:Date.now() - 1000});
    addMsg({from:'claude', text:'Which customer task should the portal support first? [ask-user!: Track orders :: Customers can check delivery progress | Manage subscriptions :: Customers can change or pause their plan | Get support :: Customers can view and reply to tickets]\\nChoose the closest match.', at:Date.now()});
  `);
  for (const [label, width, height] of [['desktop', 1280, 900], ['compact', 860, 760]]) {
    win.setSize(width, height);
    const metrics = await win.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      const row = document.querySelector('.msg.ask'), opts = [...row.querySelectorAll('.opt')];
      const rects = opts.map(o => o.getBoundingClientRect());
      opts[0].focus({preventScroll:true}); document.querySelector('#log').scrollTop = 0;
      resolve({ count:opts.length, text:row.textContent, widths:rects.map(r=>r.width), stacked:rects.every((r,i)=>!i || r.top >= rects[i-1].bottom), overflow:row.scrollWidth > row.clientWidth, focus:getComputedStyle(opts[0]).outlineStyle, active:document.activeElement.className, display:getComputedStyle(document.querySelector('#chat')).display, idleHidden:document.querySelector('#reqbar').hidden });
    })))`);
    assert.equal(metrics.count, 3);
    assert.equal(metrics.stacked, true);
    assert.equal(metrics.overflow, false);
    assert.equal(metrics.focus, 'none');
    assert.equal(metrics.idleHidden, true);
    assert.doesNotMatch(metrics.text, /ask-user/);
    fs.writeFileSync(path.join(output, label + '.png'), (await win.webContents.capturePage()).toPNG());
    console.log(label, JSON.stringify(metrics));
  }
  await win.webContents.executeJavaScript(`document.querySelector('.msg.ask .opt').click()`);
  let calls = await win.webContents.executeJavaScript(`api.call('test:calls')`);
  assert.equal(calls.filter(c => c[0] === 'chat:send').at(-1)[2], 'Track orders');
  await win.webContents.executeJavaScript(`
    addMsg({from:'user', text:'Track orders', at:Date.now()});
    addMsg({from:'claude', askUser:true, options:['Email updates','Portal only','Both'], text:'How should customers receive delivery updates?', at:Date.now()});
    const own = document.querySelector('#input'); own.value = 'SMS notifications'; grow();
    document.querySelector('#send').click();
  `);
  calls = await win.webContents.executeJavaScript(`api.call('test:calls')`);
  assert.equal(calls.filter(c => c[0] === 'chat:send').at(-1)[2], 'SMS notifications');
  assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.opts').length`), 1);
  const checklist = await win.webContents.executeJavaScript(`(() => {
    const box = document.querySelector('#reqbar');
    renderReqs({items:[{t:'First requirement',done:false}]}); box.open = true;
    renderReqs({items:[]}); const hidden = box.hidden && box.children.length === 0;
    renderReqs({items:[{t:'Next requirement',done:false}]});
    return {hidden, visible:!box.hidden, expanded:box.open};
  })()`);
  assert.deepEqual(checklist, {hidden:true, visible:true, expanded:true});
  const assignments = await win.webContents.executeJavaScript(`(() => {
    const names = ['Queued task','Running task','Reviewing task','Passed task','Escalated task','Blocked task'];
    const states = ['queued','running','reviewing','passed','escalated','blocked'];
    const items = names.map(t => ({t, done:false}));
    const assignments = states.map((status, requirementIndex) => ({id:'a'+requirementIndex, requirementIndex, status,
      provider:'codex', model:'gpt-6.1-terra-with-a-very-long-model-name', effort:'high', progress:status==='passed'?100:37,
      reviewAttempts:status==='reviewing'?2:0, reviewEvidence:status==='reviewing'?[{evidence:'Independent check in progress'}]:[], blocker:status==='blocked'?'review-unknown':null}));
    renderReqs({items, assignments});
    const rows = [...document.querySelectorAll('#reqbar li')];
    const text = rows.map(row => row.textContent);
    const compact = rows.map(row => row.getBoundingClientRect().width);
    const recovered = ['running','reviewing'].map(status => {
      const assignment = {id:status, requirementIndex:0, status, provider:'claude', model:'claude-sonnet', effort:'medium'};
      renderReqs({items:[{t:'Recovered '+status, done:false}], assignments:[assignment]});
      return document.querySelector('#reqbar li').textContent;
    });
    renderReqs({items, assignments});
    const finalRows = [...document.querySelectorAll('#reqbar li')];
    return {text, compact, recovered, overflow:finalRows.some(row=>row.scrollWidth>row.clientWidth), details:finalRows.map(row=>row.querySelector('.rq-assignment')?.getBoundingClientRect().right <= row.getBoundingClientRect().right+1)};
  })()`);
  assert.equal(assignments.text.length, 6);
  for (const label of ['queued','running','reviewing','passed','escalated','blocked','codex · gpt-6.1-terra-with-a-very-long-model-name high','37%','review 2','needs verification']) {
    assert.ok(assignments.text.join(' ').toLowerCase().includes(label.toLowerCase()), `Assignment UI should show ${label}`);
  }
  assert.equal(assignments.overflow, false, 'Long assignment metadata must fit compact rows');
  assert.ok(assignments.details.every(Boolean), 'Assignment details must remain inside compact row bounds');
  assert.ok(assignments.recovered.every(text => !/passed/i.test(text)), 'Interrupted running/reviewing assignments must not recover as passed');
  const retryButtons=await win.webContents.executeJavaScript(`(async()=>{
    const buttons=[...document.querySelectorAll('#reqbar .rq-retry')];
    const same=buttons.find(button=>button.textContent==='Retry');
    const alternate=buttons.find(button=>button.textContent==='Try another model');
    await same.onclick();await alternate.onclick();
    const calls=(await api.call('test:calls')).filter(call=>call[0]==='chat:requirement-retry');
    return {count:buttons.length,same:calls.some(call=>call[3]===false),alternate:calls.some(call=>call[3]===true)};
  })()`);
  assert.ok(retryButtons.count>=2,'Failed checklist rows expose retry controls');
  assert.equal(retryButtons.same,true);assert.equal(retryButtons.alternate,true);
  const subagent=await win.webContents.executeJavaScript(`(async()=>{
    await api.call('test:emit','subagent:update',{id:'req:ui:a',sid:openSid,assignmentId:'a',requirementIndex:0,kind:'requirement',owner:'codex',title:'Fix header',task:'Fix the header',model:'gpt-6-luna',status:'failed',stateLabel:'Needs verification',result:'Could not reach staging'});
    subsExp.add('req:ui:a');openSubs();renderSubs();
    const row=document.querySelector('.sr[data-id="req:ui:a"]');
    const buttons=[...row.querySelectorAll('.sr-a')];
    const retry=buttons.find(button=>button.textContent==='Try another model');await retry.onclick({currentTarget:retry});
    const calls=await api.call('test:calls');
    const result={text:row.textContent,alternate:calls.some(call=>call[0]==='subagents:retry' && call[1]==='req:ui:a' && call[2]===true)};
    await api.call('test:emit','subagent:removed',{sid:openSid,id:'req:ui:a'});result.removed=!document.querySelector('.sr[data-id="req:ui:a"]');return result;
  })()`);
  assert.match(subagent.text,/Needs verification/);assert.equal(subagent.alternate,true);assert.equal(subagent.removed,true);
  const persistedRecovery = await win.webContents.executeJavaScript(`(async () => {
    const sid = 'persisted-assignment-recovery';
    await api.call('test:save-session', sid, {title:'Persisted recovery', reqs:{items:[{t:'Saved running',done:false},{t:'Saved reviewing',done:false}], assignments:[
      {id:'saved-running',requirementIndex:0,status:'running',provider:'codex',model:'gpt-6.1-sol',effort:'medium',progress:45},
      {id:'saved-reviewing',requirementIndex:1,status:'reviewing',provider:'claude',model:'claude-sonnet',effort:'high',progress:90,reviewAttempts:2,reviewEvidence:[null]}
    ]}});
    await openSession(sid, false);
    const firstOpen = [...document.querySelectorAll('#reqbar li')].map(row=>row.textContent);
    await openSession(null, false);
    await openSession(sid, false);
    return {firstOpen, reopened:[...document.querySelectorAll('#reqbar li')].map(row=>row.textContent)};
  })()`);
  for (const rows of [persistedRecovery.firstOpen, persistedRecovery.reopened]) {
    assert.equal(rows.length, 2, 'Opening a saved session must restore its assigned requirement rows');
    assert.match(rows[0], /Running/);
    assert.match(rows[1], /Reviewing/);
    assert.match(rows[1], /Review 2/);
    assert.ok(rows.every(text => !/Passed/.test(text)), 'Persisted interrupted assignments must remain non-passed after reopening');
  }
  await win.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  fs.writeFileSync(path.join(output, 'assignments-compact.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(1280, 900);
  await win.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  fs.writeFileSync(path.join(output, 'assignments-desktop.png'), (await win.webContents.capturePage()).toPNG());
  const workflow = await win.webContents.executeJavaScript(`(async () => {
    const key = (key, extra = {}) => document.dispatchEvent(new KeyboardEvent('keydown', {key, ctrlKey:true, bubbles:true, ...extra}));
    key('p', {shiftKey:true});
    const dialog = document.querySelector('#quickActions');
    const opened = dialog.open;
    const closeKey = new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
    dialog.querySelector('header button').dispatchEvent(closeKey);
    const closeKeyUntouched = !closeKey.defaultPrevented && dialog.open;
    const input = dialog.querySelector('input');
    input.value = 'settings'; input.dispatchEvent(new Event('input'));
    const filtered = [...dialog.querySelectorAll('.quick-result')].map(x=>x.textContent);
    dialog.querySelector('.quick-result').click();
    await Promise.resolve();
    const settings = document.querySelector('#settings').classList.contains('on');
    showTab('chat');
    addMsg({from:'user', text:'Unique search needle <script>literal</script>', at:Date.now()});
    key('f'); input.value = 'Unique search needle'; input.dispatchEvent(new Event('input'));
    const matches = dialog.querySelectorAll('.quick-result').length;
    dialog.querySelector('.quick-result').click();
    await Promise.resolve();
    const highlighted = !!document.querySelector('#log .search-hit');
    key('l'); const focused = document.activeElement.id;
    await QuickActions.exportChat();
    const calls = await api.call('test:calls');
    return {opened, closeKeyUntouched, filtered, settings, matches, highlighted, focused, exported:calls.some(x=>x[0]==='chat:export' && x[1]===openSid)};
  })()`);
  assert.equal(workflow.opened, true, 'Command palette shortcut opens a modal');
  assert.equal(workflow.closeKeyUntouched, true, 'Enter on Close must retain native button behavior');
  assert.equal(workflow.filtered.length, 1, 'Palette filters commands');
  assert.equal(workflow.settings, true, 'Palette executes navigation');
  assert.equal(workflow.matches, 1, 'Chat search finds the requested message');
  assert.equal(workflow.highlighted, true, 'Search selection jumps to a highlighted message');
  assert.equal(workflow.focused, 'input', 'Focus shortcut targets the composer');
  assert.equal(workflow.exported, true, 'Export uses the active session');
  const switching = await win.webContents.executeJavaScript(`(async () => {
    await QuickActions.open('sessions');
    const dialog = document.querySelector('#quickActions'), input = dialog.querySelector('input');
    input.value = 'Persisted recovery'; input.dispatchEvent(new Event('input'));
    const count = dialog.querySelectorAll('.quick-result').length;
    dialog.querySelector('.quick-result').click();
    await new Promise(resolve=>setTimeout(resolve,20));
    return {count, sid:openSid, title:document.querySelector('#chName').textContent};
  })()`);
  assert.equal(switching.count, 1, 'Session switcher filters saved sessions by title');
  assert.equal(switching.sid, 'persisted-assignment-recovery');
  assert.equal(switching.title, 'Persisted recovery');
  for (const width of [860,1280]) {
    win.setSize(width,900);
    await win.webContents.executeJavaScript(`QuickActions.open()`);
    await win.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    fs.writeFileSync(path.join(output, 'palette-'+width+'.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('#quickActions').close()`);
  }
  const spin = await win.webContents.executeJavaScript(`(() => {
    renderReqs({items:[{t:'Active requirement',done:false,by:'claude',pct:40}]});
    const icon = document.querySelector('#reqbar li.now .rq-ic');
    return {name:getComputedStyle(icon, '::after').animationName, reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
  })()`);
  if (spin.reduced) assert.equal(spin.name, 'none');
  else assert.equal(spin.name, 'rqSpin', 'Active requirement icons must keep spinning when motion is enabled');
  const fallbackSpin = await win.webContents.executeJavaScript(`(() => {
    renderReqs({items:[{t:'Waiting for worker',done:false}]});
    document.querySelector('#reqbar').classList.add('working');
    const icon = document.querySelector('#reqbar li.next .rq-ic');
    const result = {border:getComputedStyle(icon).borderTopColor, animation:getComputedStyle(icon).animationName,
      ring:getComputedStyle(icon, '::after').animationName};
    document.querySelector('#reqbar').classList.remove('working');
    return result;
  })()`);
  assert.equal(fallbackSpin.border, 'rgba(0, 0, 0, 0)', 'Fallback loader must not show a stationary ring beneath its spinner');
  assert.equal(fallbackSpin.animation, 'none', 'Only the outer loader ring should rotate');
  assert.equal(fallbackSpin.ring, spin.reduced ? 'none' : 'rqSpin');
  const heatmap = await win.webContents.executeJavaScript(`(() => {
    const usage = document.querySelector('#usage');
    document.querySelector('#chat').classList.remove('on'); usage.classList.add('on');
    usage.innerHTML = '<div class="u-hd u-heat-head"><h3>Token activity</h3><div class="u-seg" id="uheatseg"><button class="on" data-v="daily">Daily</button><button data-v="weekly">Weekly</button><button data-v="cumulative">Cumulative</button></div></div><div id="uheat"></div>';
    renderHeat({[new Date().toISOString().slice(0,10)]:1200}, 'daily');
    const head = usage.querySelector('.u-heat-head').getBoundingClientRect(), controls = usage.querySelector('#uheatseg').getBoundingClientRect();
    const grid = usage.querySelector('#uheat'), cell = grid.querySelector('i[data-d]:last-of-type');
    grid.onmouseover({target:cell});
    const tip = document.querySelector('#heatTip'), tr = tip.getBoundingClientRect(), cr = cell.getBoundingClientRect();
    return {insideHeading:controls.top >= head.top && controls.bottom <= head.bottom, fits:controls.right <= usage.getBoundingClientRect().right,
      outsideScrollBox:tip.parentElement === document.body, fixed:getComputedStyle(tip).position === 'fixed', insideViewport:tr.left >= 0 && tr.right <= innerWidth && tr.top >= 0 && tr.bottom <= innerHeight, aboveCell:tr.bottom <= cr.top};
  })()`);
  assert.equal(heatmap.insideHeading, true, 'Heatmap modes must align with their heading');
  assert.equal(heatmap.fits, true, 'Heatmap mode controls must fit within the usage panel');
  assert.equal(heatmap.outsideScrollBox, true, 'Heatmap tooltip must escape the scrolling grid');
  assert.equal(heatmap.fixed, true, 'Heatmap tooltip must use viewport positioning');
  assert.equal(heatmap.insideViewport, true, 'Heatmap tooltip must stay inside viewport edges');
  assert.equal(heatmap.aboveCell, true, 'Heatmap tooltip must open above its hovered day');
  await win.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  fs.writeFileSync(path.join(output, 'heatmap.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('#usage').classList.remove('on'); document.querySelector('#chat').classList.add('on')`);
  const observation = await win.webContents.executeJavaScript(`(async () => {
    const root = document.createElement('div'); root.style.cssText = 'height:100px;overflow:auto';
    const row = document.createElement('div');
    for (let i=0; i<1000; i++) row.append(document.createElement('span'));
    root.append(row); document.body.append(root);
    const originalObserve = ResizeObserver.prototype.observe, originalStyle = window.getComputedStyle;
    let observed = 0, styled = 0;
    ResizeObserver.prototype.observe = function(node, ...args) { if (node === root || root.contains(node)) observed++; return originalObserve.call(this,node,...args); };
    window.getComputedStyle = function(node,...args) { if (node === root || root.contains(node)) styled++; return originalStyle.call(this,node,...args); };
    try {
      followContent(root);
      for (let i=0; i<30; i++) row.children[i].textContent = 'Streaming message update';
      await new Promise(resolve => setTimeout(resolve,150));
      return {observed, styled};
    } finally { ResizeObserver.prototype.observe = originalObserve; window.getComputedStyle = originalStyle; root.remove(); }
  })()`);
  assert.equal(observation.observed, 2, 'Observe only the root and its message row, never every nested element');
  assert.equal(observation.styled, 0, 'Content updates must not scan computed styles across the conversation');
  console.log('Large-message observer regression:', JSON.stringify(observation));
  const history = await win.webContents.executeJavaScript(`(() => {
    const log = document.querySelector('#log');
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
    let reads = 0;
    Object.defineProperty(log, 'scrollHeight', { configurable:true, get() { reads++; return descriptor.get.call(this); } });
    const start = performance.now();
    try {
      for (let i=0;i<150;i++) addMsg({from:i%2 ? 'claude':'user', text:'History message '+i+'\\nA representative chat message with enough text to wrap on compact windows.', at:Date.now()+i*1000}, false, true);
      return {ms:Math.round(performance.now()-start), scrollHeightReads:reads};
    } finally { delete log.scrollHeight; }
  })()`);
  console.log('History rendering (150 messages):', JSON.stringify(history));
  assert.equal(history.scrollHeightReads, 0, 'History rendering must not force a layout and scroll for every message');
  const typing = await win.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#input');
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
    let reads = 0;
    Object.defineProperty(input, 'scrollHeight', { configurable:true, get() { reads++; return descriptor.get.call(this); } });
    const start = performance.now();
    try {
      input.value = '';
      for (let i=0;i<200;i++) { input.value += 'a'; input.dispatchEvent(new Event('input',{bubbles:true})); }
      return {ms:Math.round(performance.now()-start), scrollHeightReads:reads, nativeSizing:CSS.supports('field-sizing','content')};
    } finally { delete input.scrollHeight; clearTimeout(draftTimer); input.value = ''; }
  })()`);
  console.log('Composer typing (200 input events):', JSON.stringify(typing));
  assert.equal(typing.scrollHeightReads, 0, 'Typing must never synchronously measure and resize the composer');
  assert.equal(typing.nativeSizing, true);
  const sizing = await win.webContents.executeJavaScript(`(async () => {
    const input = document.querySelector('#input');
    const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    input.value = 'One line'; input.dispatchEvent(new Event('input')); await paint(); const short = input.clientHeight;
    input.value = Array.from({length:20},()=> 'Another line').join('\\n'); input.dispatchEvent(new Event('input')); await paint(); const tall = input.clientHeight;
    input.value = '/he'; input.dispatchEvent(new Event('input')); const slash = !document.querySelector('#slash').hidden;
    input.value = ''; input.dispatchEvent(new Event('input')); await paint(); const reset = input.clientHeight;
    clearTimeout(draftTimer);
    return {short,tall,reset,slash};
  })()`);
  assert.ok(sizing.tall > sizing.short, 'The composer must grow with additional lines');
  assert.ok(sizing.tall <= 240, 'The composer must stop growing at its height limit');
  assert.equal(sizing.reset, sizing.short);
  assert.equal(sizing.slash, true, 'Slash commands still work with the lightweight input handler');
  const stableSpend = await win.webContents.executeJavaScript(`(() => {
    act = {codex:{status:'thinking',since:Date.now()}}; renderSpend();
    const first = document.querySelector('#spend').firstChild;
    for(let i=0;i<100;i++) { act.codex.status = 'reading file '+i; renderSpend(); }
    return first === document.querySelector('#spend').firstChild;
  })()`);
  assert.equal(stableSpend,true,'Status updates must not rebuild unchanged usage totals');
  // Measure a visible, focused editor: hidden Windows windows intentionally
  // throttle compositor frames to ~1 Hz even with timer throttling disabled.
  win.show(); win.focus();
  const arrow = await win.webContents.executeJavaScript(`(async () => {
    const busy = document.querySelector('#busy'), reqbar = document.querySelector('#reqbar'), button = document.querySelector('#scrollBottom');
    busy.replaceChildren(document.createTextNode('Agent is working'));
    reqbar.hidden = false; reqbar.replaceChildren(document.createTextNode('Requirements · 40%'));
    button.hidden = false;
    await new Promise(resolve => requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await Promise.all(button.getAnimations().map(animation=>animation.finished.catch(()=>{})));
    const br = button.getBoundingClientRect(), busyTop = busy.getBoundingClientRect().top, reqTop = reqbar.getBoundingClientRect().top;
    return {clearOfStatus:br.bottom <= Math.min(busyTop, reqTop) + 1, cssOffset:document.querySelector('#chat').style.getPropertyValue('--scroll-bottom-offset'), buttonBottom:br.bottom, busyTop, reqTop};
  })()`);
  console.log('Dynamic arrow position:', JSON.stringify(arrow));
  assert.equal(arrow.clearOfStatus, true, 'Jump-to-latest arrow must stay above the dynamic status/checklist rows');
  await win.webContents.executeJavaScript(`document.querySelector('#input').focus({preventScroll:true}); window.nativePaintDelays=[]; document.querySelector('#input').addEventListener('input', () => { const start=performance.now(); requestAnimationFrame(()=>nativePaintDelays.push(performance.now()-start)); });`);
  for (let i=0;i<30;i++) {
    await win.webContents.debugger.sendCommand('Input.insertText', {text:i%6 ? 'typing ' : '\n'});
    await win.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => { renderTyping(); renderSpend(); resolve(); }))`);
  }
  const latency = await win.webContents.executeJavaScript(`({count:nativePaintDelays.length,maxMs:Math.round(Math.max(...nativePaintDelays)),spellcheck:document.querySelector('#input').spellcheck})`);
  assert.equal(latency.count,30);
  assert.equal(latency.spellcheck,false);
  console.log('Native input-to-frame with background updates:',JSON.stringify(latency));
  assert.ok(latency.maxMs < 250,'Native typing should paint without long stalls while status updates are active');
  assert.deepEqual(errors, []);
  const appearance = await win.webContents.executeJavaScript(`(async()=>{
    await api.call('test:appearance-tree',{projects:[{id:'project',name:'Relay',path:'C:/relay'}],sessions:[{id:'appearance',projectId:'project',title:'Balance workers across Claude and Codex and recover from provider limits',supercode:true},{id:'native',projectId:'project',title:'Code directly with the selected model',supercode:false}],active:'appearance'});
    await Sidebar.mount(document.querySelector('#sidebar'),{onOpen:openSession});
    showTab('themes');
    document.querySelector('[data-theme="terminal"]').click();
    const terminal={font:getComputedStyle(document.querySelector('#chat')).fontFamily,radius:getComputedStyle(document.querySelector('#quickBtn')).borderRadius,
      rowHeight:document.querySelector('.sb-row').getBoundingClientRect().height};
    document.querySelector('[data-theme="paper"]').click();
    const light=getComputedStyle(document.documentElement).colorScheme;
    document.querySelector('#themeGenerate').click();
    await new Promise(resolve=>setTimeout(resolve,20));
    const preview=!document.querySelector('.theme-generated').hidden;
    const unchanged=document.documentElement.dataset.relayTheme==='paper';
    document.querySelector('.theme-generated button').click();
    const generated={id:document.documentElement.dataset.relayTheme,font:getComputedStyle(document.querySelector('#chat')).fontFamily,radius:getComputedStyle(document.querySelector('#quickBtn')).borderRadius,
      border:getComputedStyle(document.querySelector('#quickActions')).borderTopWidth,saved:JSON.parse(localStorage.getItem('relay.theme.v1')).theme.name};
    await api.call('test:theme-fails',true); document.querySelector('#themeGenerate').click();
    await new Promise(resolve=>setTimeout(resolve,20));
    const failure={message:document.querySelector('.theme-status').textContent,id:document.documentElement.dataset.relayTheme};
    document.querySelector('[data-theme="graphite"]').click();
    return {terminal,light,preview,unchanged,generated,failure};
  })()`);
  assert.match(appearance.terminal.font,/mono|Consolas|Courier/i,'Terminal font must reach conversation text');
  assert.equal(appearance.terminal.radius,'0px');
  assert.ok(appearance.terminal.rowHeight>=56,'Themes preserve room for two-line session titles');
  assert.equal(appearance.light,'light');
  assert.equal(appearance.preview,true); assert.equal(appearance.unchanged,true,'AI theme preview must not replace the active theme');
  assert.equal(appearance.generated.id,'custom'); assert.match(appearance.generated.font,/Georgia/);
  assert.equal(appearance.generated.radius,'4px'); assert.equal(appearance.generated.border,'2px');
  assert.equal(appearance.generated.saved,'Generated ink');
  assert.match(appearance.failure.message,/credits/); assert.equal(appearance.failure.id,'custom','Generation failure keeps the chosen theme');
  for(const [label,theme] of [['themes','graphite'],['terminal','terminal']]) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-theme="${theme}"]').click();showTab('themes');new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    fs.writeFileSync(path.join(output,label+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  await win.webContents.executeJavaScript(`document.querySelector('[data-theme="graphite"]').click();localStorage.removeItem('relay.theme.v1')`);
  console.log('Renderer layout, tag recovery, focus, choice and custom-answer checks passed. Screenshots: ' + output);
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
