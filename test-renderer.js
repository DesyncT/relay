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
  win.webContents.on('console-message', (_event, level, message) => { if (level === 3 && !message.includes('Electron Security Warning')) { errors.push(message); console.error('Renderer:',message); } });
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
  const quotaDisplay = await win.webContents.executeJavaScript(`(async () => {
    const at=Date.now()-600000;
    await api.call('test:quota',{codex:{at,cached:true,windows:[{minutes:300,used:87,remaining:13,reset:Date.now()-1000,stale:true}]},claude:{at:Date.now(),estimated:true,windows:[{minutes:300,tokens:4800000}]}});
    await refreshQuota();
    const text=document.querySelector('#quota').textContent, detail=limitsHtml();
    const cached=text.includes('13%') && text.includes('cached') && text.includes('10m ago');
    const unknown=text.includes('quota unknown') && !detail.includes('NaN') && detail.includes('quota unavailable');
    await api.call('test:quota',{claude:{at:Date.now(),windows:[{minutes:300,used:25,remaining:75,reset:Date.now()+3600000}]}});
    await api.call('test:emit','usage:quota-update',{});
    await refreshQuota();
    const live=document.querySelector('#quota').textContent.includes('75%');
    await api.call('test:quota',{}); await refreshQuota();
    return {cached,unknown,live};
  })()`);
  assert.deepEqual(quotaDisplay,{cached:true,unknown:true,live:true});
  console.log('Cached quota age, unknown allowance and live update display passed');
  const queueEditing = await win.webContents.executeJavaScript(`(async () => {
    const input = document.querySelector('#input'); input.value = 'Unsent draft';
    renderQueue([{id:'queued-edit-test',text:'Original queued message',files:[]}]);
    document.querySelector('.q-edit').click();
    const main = input.value === 'Original queued message' && document.activeElement === input && !document.querySelector('.q-editor');
    input.value = 'Changed queued message';
    document.querySelector('#cancelQueueEdit')?.click();
    const restored = input.value === 'Unsent draft' && localStorage.getItem(draftKey(openSid)) === 'Unsent draft';
    document.querySelector('.q-edit').click(); input.value = '/this stays text';
    await sendChat();
    const calls = await api.call('test:calls');
    const saved = calls.some(c=>c[0]==='chat:queue-edit' && c[2]==='queued-edit-test' && c[3]==='/this stays text');
    const draft = input.value === 'Unsent draft';
    renderQueue([]); input.value = ''; grow();
    return {main,restored,saved,draft};
  })()`);
  assert.deepEqual(queueEditing,{main:true,restored:true,saved:true,draft:true});
  const recovery = await win.webContents.executeJavaScript(`(async()=>{
    const saved={sid:openSid,text:document.querySelector('#input').value,files:pend},log=document.querySelector('#log'),count=log.children.length;
    openSid='qol-recovery';localStorage.removeItem(recoveryKey(openSid));
    document.querySelector('#input').value='Keep this message';pend=[{name:'notes.txt',path:'notes.txt',size:4}];
    await api.call('test:send-error',true);await sendChat();await api.call('test:send-error',false);
    const offered=!document.querySelector('#sendRecovery').hidden;
    document.querySelector('#input').value='New draft';document.querySelector('#sendRecovery button').click();
    const restored=document.querySelector('#input').value==='New draft\\n\\nKeep this message' && pend.length===1;
    const attachmentsPersist=loadDraftFiles(openSid).length===1;
    await api.call('test:delay-attach',true);
    const upload=addFiles([new File(['image'],'late-upload.png',{type:'image/png'})]);
    for(let n=0;n<20;n++){if((await api.call('test:calls')).some(c=>c[0]==='chat:attach' && c[1]==='late-upload.png'))break;await new Promise(r=>setTimeout(r,5));}
    renderQueue([{id:'upload-race',text:'Queued text',files:[]}]);document.querySelector('.q-edit').click();
    const saveWaits=document.querySelector('#saveQueueEdit').disabled;
    await api.call('test:resolve-attach');await upload;document.querySelector('#cancelQueueEdit').click();renderQueue([]);
    const lateUploadPreserved=pend.some(f=>f.name==='late-upload.png');
    localStorage.removeItem(draftKey(openSid));localStorage.removeItem(draftFilesKey(openSid));localStorage.removeItem(recoveryKey(openSid));
    openSid=saved.sid;document.querySelector('#input').value=saved.text;pend=saved.files;renderPend();renderRecovery();
    while(log.children.length>count)log.lastElementChild.remove();
    return {offered,restored,attachmentsPersist,lateUploadPreserved,saveWaits};
  })()`);
  assert.deepEqual(recovery,{offered:true,restored:true,attachmentsPersist:true,lateUploadPreserved:true,saveWaits:true});
  console.log('Failed sends preserve text, attachments and newer drafts');
  const motion = await win.webContents.executeJavaScript(`(() => {
    window.motionPrevious = {act,reqsNow,spendTotals,spendLedger};
    reqsNow = null;
    act = {claude:{status:'thinking',since:Date.now()-20000},codex:{status:'typing',since:Date.now()-10000}};
    spendTotals = {claude:{tokens:394800,cost:.34},codex:{tokens:2100000,cost:.72}};
    renderTyping(); renderSpend();
    const loader = document.querySelector('#busy .cc-spin'), shimmer = document.querySelector('#busy .rq-think');
    const timer = document.querySelector('#busy .busy-time'), before = timer.textContent;
    timer.dataset.since = Number(timer.dataset.since)-2000;
    renderTyping();
    return {dots:getComputedStyle(loader,'::before').animationName,stable:loader === document.querySelector('#busy .cc-spin') && shimmer === document.querySelector('#busy .rq-think'),timerUpdated:timer.textContent !== before,shine:getComputedStyle(shimmer).animationName,
      iconsAligned:[...document.querySelectorAll('#spend .sp')].every(e=>{const icon=e.querySelector('svg').getBoundingClientRect(),text=e.querySelector('b').getBoundingClientRect();return Math.abs((icon.top+icon.bottom-text.top-text.bottom)/2)<1;})};
  })()`);
  assert.equal(motion.dots,'ccSpin'); assert.equal(motion.stable,true); assert.equal(motion.timerUpdated,true); assert.equal(motion.shine,'rqThink'); assert.equal(motion.iconsAligned,true);
  for (const width of [1280,860]) {
    win.setSize(width,900);
    await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(output,'thinking-motion-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const reducedStatusMotion = await win.webContents.executeJavaScript(`(() => {
    const shine=getComputedStyle(document.querySelector('#busy .rq-think')),dot=getComputedStyle(document.querySelector('#busy .cc-spin'),'::before');
    return {shine:shine.animationName,dot:dot.animationName,readable:shine.color !== 'rgba(0, 0, 0, 0)'};
  })()`);
  assert.deepEqual(reducedStatusMotion,{shine:'none',dot:'none',readable:true});
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});
  await win.webContents.executeJavaScript('({act,reqsNow,spendTotals,spendLedger}=window.motionPrevious); delete window.motionPrevious; renderTyping(); renderSpend();');
  console.log('Thinking shimmer, persistent loader, provider alignment and reduced motion passed');
  const queueImages = await win.webContents.executeJavaScript(`(async () => {
    const original = {name:'existing.png',path:'existing.png',size:10};
    renderQueue([{id:'queue-images',text:'',files:[original]}]);
    document.querySelector('.q-edit').click();
    const visible = getComputedStyle(document.querySelector('#imgBtn')).display !== 'none';
    const existing = pend.length === 1 && !document.querySelector('#saveQueueEdit').disabled;
    await addFiles([new File(['image'], 'added.png', {type:'image/png'})]);
    await saveQueueEdit();
    const call = (await api.call('test:calls')).filter(c=>c[0]==='chat:queue-edit').at(-1);
    const saved = call[3] === '' && call[4].length === 2 && call[4][1].name === 'added.png';
    const root = document.documentElement, previous = root.getAttribute('data-relay-theme');
    root.setAttribute('data-relay-theme','test');
    const square = [...document.querySelectorAll('#queueCount .q-send,#queueEditBar button')].every(b=>getComputedStyle(b).borderRadius === '0px');
    if (previous === null) root.removeAttribute('data-relay-theme'); else root.setAttribute('data-relay-theme',previous);
    renderQueue([]);
    return {visible,existing,saved,square};
  })()`);
  assert.deepEqual(queueImages,{visible:true,existing:true,saved:true,square:true});
  await win.webContents.executeJavaScript(`renderQueue([{id:'preview',text:'Make editing use the main message box',files:[]},{id:'preview2',text:'yo',files:[]}]);new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  fs.writeFileSync(path.join(output,'queue-list.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('.q-edit').click();`);
  fs.writeFileSync(path.join(output,'queue-composer-edit.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('#cancelQueueEdit').click(); renderQueue([]);`);

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
  await win.webContents.executeJavaScript(`api.call('test:save-session','persisted-assignment-recovery',{title:'Persisted recovery'})`);
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
    usage.innerHTML = '<div class="u-hd u-heat-head"><h3>Token activity · all time</h3></div><p id="uheatRange"></p><div id="uheat"></div>';
    renderHeat({'2020-01-01':500,[new Date().toISOString().slice(0,10)]:1200}, 'daily');
    const grid = usage.querySelector('#uheat'), cell = [...grid.querySelectorAll('i[data-d]')].at(-1);
    grid.onmouseover({target:cell});
    const tip = document.querySelector('#heatTip'), tr = tip.getBoundingClientRect(), cr = cell.getBoundingClientRect();
    return {modesRemoved:!usage.querySelector('#uheatseg'),allHistory:!!grid.querySelector('[data-d="2020-01-01"]') && usage.querySelector('#uheatRange').textContent.includes('All time'),
      outsideScrollBox:tip.parentElement === document.body, fixed:getComputedStyle(tip).position === 'fixed', insideViewport:tr.left >= 0 && tr.right <= innerWidth && tr.top >= 0 && tr.bottom <= innerHeight, aboveCell:tr.bottom <= cr.top};
  })()`);
  assert.equal(heatmap.modesRemoved,true);assert.equal(heatmap.allHistory,true);
  assert.equal(heatmap.outsideScrollBox, true, 'Heatmap tooltip must escape the scrolling grid');
  assert.equal(heatmap.fixed, true, 'Heatmap tooltip must use viewport positioning');
  assert.equal(heatmap.insideViewport, true, 'Heatmap tooltip must stay inside viewport edges');
  assert.equal(heatmap.aboveCell, true, 'Heatmap tooltip must open above its hovered day');
  await win.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  fs.writeFileSync(path.join(output, 'heatmap.png'), (await win.webContents.capturePage()).toPNG());
  const historyUi=await win.webContents.executeJavaScript(`(async()=>{
    window.historyCfg=cfg;cfg={...cfg,disabledProviders:['codex']};
    await api.call('test:usage',{total:{cost:.2,tokens:1800,sessions:2,cached:200,uncached:1400,output:200,savings:0,unpriced:[]},tools:{Codex:{cost:.1,tokens:1000,sessions:1},'Claude Code':{cost:.1,tokens:800,sessions:1}},models:{},days:{'2020-01-01':{Codex:.1,'Claude Code':.1}},dayTokens:{'2020-01-01':1800},type:{input:.1,output:.1,cacheRead:0,cacheWrite:0},speed:{standard:.2,fast:0},coverage:{malformedLines:0,unreadableFiles:[]}});
    await loadUsage(true);
    const panel=document.querySelector('#usage');
    const result={allProviders:panel.textContent.includes('Codex') && panel.textContent.includes('Claude Code'),allHistory:!!panel.querySelector('[data-d="2020-01-01"]'),modesRemoved:!panel.querySelector('#uheatseg'),actualDailyBars:panel.querySelectorAll('#uchart svg rect').length===2};
    cfg=window.historyCfg;delete window.historyCfg;return result;
  })()`);
  assert.deepEqual(historyUi,{allProviders:true,allHistory:true,modesRemoved:true,actualDailyBars:true});
  for(const width of [1280,860]){
    win.setSize(width,900);await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(output,'all-time-usage-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
  }
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
  const sidebarQol=await win.webContents.executeJavaScript(`(async()=>{
    localStorage.removeItem('relay.pinnedSessions');
    await api.call('test:appearance-tree',{projects:[{id:'qol-project',name:'Pinned project',path:'C:/qol'}],sessions:[{id:'qol-one',projectId:'qol-project',title:'First session'},{id:'qol-two',projectId:'qol-project',title:'Second session'}]});
    await Sidebar.mount(document.querySelector('#sidebar'),{onOpen:()=>{}});
    document.querySelector('[data-id="qol-two"] .sb-more').click();
    [...document.querySelectorAll('.sb-mi')].find(b=>b.textContent==='Pin session').click();
    const pinned=document.querySelector('.sb-row').dataset.id==='qol-two' && document.querySelector('.sb-row').classList.contains('sb-pinned');
    const stored=JSON.parse(localStorage.getItem('relay.pinnedSessions')).includes('qol-two');
    let header=document.querySelector('.sb-group-h');header.focus();header.click();header=document.querySelector('.sb-group-h');
    const focus=document.activeElement===header,collapsed=header.getAttribute('aria-expanded')==='false';header.click();
    localStorage.removeItem('relay.pinnedSessions');
    return {pinned,stored,focus,collapsed};
  })()`);
  assert.deepEqual(sidebarQol,{pinned:true,stored:true,focus:true,collapsed:true});
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
    const title=document.querySelector('.sb-row .sb-title'), control=document.querySelector('.sb-group-h .sb-more');
    const sidebar={titleHeight:title.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(title).lineHeight),nowrap:getComputedStyle(title).whiteSpace,ellipsis:getComputedStyle(title).textOverflow,radius:getComputedStyle(control).borderRadius,width:control.getBoundingClientRect().width,height:control.getBoundingClientRect().height};
    return {terminal,light,preview,unchanged,generated,failure,sidebar};
  })()`);
  assert.match(appearance.terminal.font,/mono|Consolas|Courier/i,'Terminal font must reach conversation text');
  assert.equal(appearance.terminal.radius,'0px');
  assert.ok(appearance.terminal.rowHeight>=28 && appearance.terminal.rowHeight<=40,'Sidebar stays compact in themes');
  assert.equal(appearance.sidebar.titleHeight,appearance.sidebar.lineHeight);
  assert.equal(appearance.sidebar.nowrap,'nowrap');assert.equal(appearance.sidebar.ellipsis,'ellipsis');
  assert.equal(appearance.sidebar.radius,'8px');assert.equal(appearance.sidebar.width,appearance.sidebar.height);
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
  const modes=await win.webContents.executeJavaScript(`(async()=>{
    showTab('chat');openSid='mode-ui';window.ActiveChat={sid:openSid,easyMode:true,supercode:false};
    renderLead('spreader');window.dispatchEvent(new Event('active-chat'));
    const easy={selected:document.querySelector('#tbSupercode').getAttribute('aria-checked'),spreader:document.querySelector('#leadMenu').textContent.includes('Spreader'),modelHidden:document.querySelector('#normalModel').hidden};
    await api.call('test:emit','workflow:changed',{sid:openSid,easyMode:false,lead:'codex'});
    const code={selected:document.querySelector('#tbNormal').getAttribute('aria-checked'),spreader:document.querySelector('#leadMenu').textContent.includes('Spreader'),modelHidden:document.querySelector('#normalModel').hidden};
    renderReqs({items:[{t:'Create file',done:true},{t:'Verify file',done:false,by:'codex',pct:50}]});
    return {easy,code,progress:document.querySelector('#reqbar').textContent,legacyButtons:document.querySelectorAll('#reqbar .rq-retry').length};
  })()`);
  assert.equal(modes.easy.selected,'true');assert.equal(modes.easy.spreader,true);assert.equal(modes.easy.modelHidden,true);
  assert.equal(modes.code.selected,'true');assert.equal(modes.code.spreader,false);assert.equal(modes.code.modelHidden,false);
  assert.match(modes.progress,/75%/);assert.equal(modes.legacyButtons,0);
  await win.webContents.executeJavaScript(`document.querySelector('[data-theme=graphite]').click();document.querySelectorAll('main > section').forEach(s=>s.classList.toggle('on',s.id==='chat'));`);
  fs.writeFileSync(path.join(output,'code-easycode-modes.png'),(await win.webContents.capturePage()).toPNG());
  const atmosphereUi=await win.webContents.executeJavaScript(`(()=>{
    const tiles=[...document.querySelectorAll('.background-preset')];
    const liquid=tiles.find(b=>b.dataset.effect==='liquid');liquid?.click();
    const video=document.querySelector('#chatBackground video');
    return {tiles:tiles.length>=8,selection:document.querySelector('#backgroundEffect').value==='liquid',preview:!!document.querySelector('#backgroundPreview'),interactive:!!document.querySelector('#backgroundInteractive'),video:!!video&&video.loop&&video.muted,upload:document.querySelector('#backgroundFile').accept.includes('video/webm')};
  })()`);
  assert.deepEqual(atmosphereUi,{tiles:true,selection:true,preview:true,interactive:true,video:true,upload:true});
  const effectChecks = await win.webContents.executeJavaScript(`(async()=>{
    const select=document.querySelector('#backgroundEffect');
    if (!select) return {controls:false};
    const checks=[];
    for(const value of ['ascii','liquid','stars','grid','aurora']) {
      select.value=value;select.dispatchEvent(new Event('change'));
      await new Promise(r=>setTimeout(r,160));
      const layer=document.querySelector('#chatBackground');
      checks.push(document.documentElement.dataset.chatBackground===value && getComputedStyle(layer).pointerEvents==='none' && [...document.querySelectorAll('#log > .msg')].every(row=>getComputedStyle(row).backgroundColor==='rgba(0, 0, 0, 0)'));
    }
    const pause=document.querySelector('#backgroundPaused');pause.checked=true;pause.dispatchEvent(new Event('change'));
    const saved=JSON.parse(localStorage.getItem('relay.background.v1'));
    const input=document.querySelector('#input'); input.focus();
    document.querySelector('#quickBtn').click(); document.querySelector('#quickActions').close();
    await new Promise(r=>setTimeout(r,50));
    const focus=document.activeElement===input;
    select.value='off';select.dispatchEvent(new Event('change'));
    return {controls:true,effects:checks.every(Boolean),paused:saved.paused,focus,off:document.querySelector('#chatBackground').hidden};
  })()`);
  assert.deepEqual(effectChecks,{controls:true,effects:true,paused:true,focus:true,off:true});
  const pointerChecks=await win.webContents.executeJavaScript(`(()=>{
    const effect=document.querySelector('#backgroundEffect');effect.value='grid';effect.dispatchEvent(new Event('change'));
    const pause=document.querySelector('#backgroundPaused');pause.checked=false;pause.dispatchEvent(new Event('change'));
    const scene=document.querySelector('.ch-main'),canvas=document.querySelector('#chatBackground canvas'),r=scene.getBoundingClientRect(),before=canvas.toDataURL();
    const move=new PointerEvent('pointermove',{clientX:r.left+r.width*.9,clientY:r.top+r.height*.2,bubbles:true,cancelable:true});scene.dispatchEvent(move);
    const moved=canvas.toDataURL()!==before;
    pause.checked=true;pause.dispatchEvent(new Event('change'));const paused=canvas.toDataURL();scene.dispatchEvent(move);
    return {moved,passive:!move.defaultPrevented,paused:canvas.toDataURL()===paused};
  })()`);
  assert.deepEqual(pointerChecks,{moved:true,passive:true,paused:true});
  // Generated 1-second VP8 test pattern; excluded from packaged app by !test-* .
  const videoFixture=fs.readFileSync(path.join(__dirname,'test-background.webm')).toString('base64');
  const videoChecks=await win.webContents.executeJavaScript(`(async()=>{
    const bytes=Uint8Array.from(atob('${videoFixture}'),c=>c.charCodeAt(0));
    const transfer=new DataTransfer();transfer.items.add(new File([bytes],'loop.webm',{type:'video/webm'}));
    const input=document.querySelector('#backgroundFile');input.files=transfer.files;await input.onchange();
    const v=document.querySelector('#chatBackground video');await new Promise(r=>setTimeout(r,150));const uploaded=document.querySelector('#backgroundEffect').value==='video'&&v.loop&&v.muted&&v.videoWidth>0;
    const saved=await new Promise((resolve,reject)=>{const r=indexedDB.open('relay-wallpapers',1);r.onerror=reject;r.onsuccess=()=>{const db=r.result,get=db.transaction('media').objectStore('media').get('video');get.onsuccess=()=>{resolve(get.result?.size>0);db.close();};};});
    const pause=document.querySelector('#backgroundPaused');pause.checked=false;pause.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,150));const playing=!v.paused;
    pause.checked=true;pause.dispatchEvent(new Event('change'));const paused=v.paused;
    await document.querySelector('#backgroundRemove').onclick();
    return {uploaded,saved,playing,paused,removed:!v.getAttribute('src')};
  })()`);
  assert.deepEqual(videoChecks,{uploaded:true,saved:true,playing:true,paused:true,removed:true});
  const wallpaperChecks=await win.webContents.executeJavaScript(`(async()=>{
    const file=document.querySelector('#backgroundFile'), select=document.querySelector('#backgroundEffect');
    const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);
    const blob=await new Promise(r=>canvas.toBlob(r));const transfer=new DataTransfer();transfer.items.add(new File([blob],'wallpaper.png',{type:'image/png'}));file.files=transfer.files;await file.onchange();
    const saved=JSON.parse(localStorage.getItem('relay.background.v1'));
    const uploaded=saved.effect==='wallpaper' && saved.image.startsWith('data:image/png;base64,');
    const bad=new DataTransfer();bad.items.add(new File(['bad'],'bad.svg',{type:'image/svg+xml'}));file.files=bad.files;await file.onchange();
    const rejected=document.querySelector('#backgroundStatus').textContent.includes('Choose a PNG');
    document.querySelector('#backgroundRemove').click();
    return {uploaded,rejected,removed:select.value==='off' && !JSON.parse(localStorage.getItem('relay.background.v1')).image};
  })()`);
  assert.deepEqual(wallpaperChecks,{uploaded:true,rejected:true,removed:true});
  await win.webContents.executeJavaScript(`
    document.querySelector('[data-theme=ocean]').click();
    const select=document.querySelector('#backgroundEffect');select.value='ascii';select.dispatchEvent(new Event('change'));
    const pause=document.querySelector('#backgroundPaused');pause.checked=false;pause.dispatchEvent(new Event('change'));
    document.querySelector('#input').value=''; document.querySelector('#input').focus();
  `);
  await win.webContents.debugger.sendCommand('Input.insertText',{text:'Typing with an animated background'});
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#input').value`),'Typing with an animated background');
  await new Promise(r=>setTimeout(r,200));
  fs.writeFileSync(path.join(output,'chat-ascii-background.png'),(await win.webContents.capturePage()).toPNG());
  const animation=await win.webContents.executeJavaScript(`(async()=>{const canvas=document.querySelector('#chatBackground canvas');const first=canvas.toDataURL();await new Promise(r=>setTimeout(r,200));const moves=canvas.toDataURL()!==first;document.querySelector('#backgroundPaused').click();const still=canvas.toDataURL();await new Promise(r=>setTimeout(r,150));return {moves,paused:canvas.toDataURL()===still};})()`);
  assert.deepEqual(animation,{moves:true,paused:true});
  await win.webContents.executeJavaScript(`{const liquidEffect=document.querySelector('#backgroundEffect');liquidEffect.value='liquid';liquidEffect.dispatchEvent(new Event('change'));document.querySelector('#backgroundPaused').click();}`);
  await new Promise(r=>setTimeout(r,200));
  fs.writeFileSync(path.join(output,'chat-liquid-background.png'),(await win.webContents.capturePage()).toPNG());

  await win.webContents.executeJavaScript(`document.querySelector('#input').value='';grow();`);
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const reducedMotion=await win.webContents.executeJavaScript(`(async()=>{const canvas=document.querySelector('#chatBackground canvas');await new Promise(r=>setTimeout(r,100));const before=canvas.toDataURL();await new Promise(r=>setTimeout(r,150));return canvas.toDataURL()===before;})()`);
  assert.equal(reducedMotion,true);
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});
  await win.webContents.executeJavaScript(`showTab('themes');document.querySelector('main').scrollTop=0;`);
  await new Promise(r=>setTimeout(r,200));
  assert.ok(await win.webContents.executeJavaScript(`document.querySelector('.background-preset').getBoundingClientRect().height > 0`),'Background controls must be visible in Themes');
  assert.equal(await win.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#backgroundFile')).display`),'none');
  fs.writeFileSync(path.join(output,'background-controls.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`const effect=document.querySelector('#backgroundEffect');effect.value='off';effect.dispatchEvent(new Event('change'));showTab('chat');`);

  const palettePolish = await win.webContents.executeJavaScript(`(async()=>{
    const trigger=document.querySelector('#quickBtn'); trigger.click();
    const d=document.querySelector('#quickActions'); const r=d.getBoundingClientRect();
    d.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:r.left-8,clientY:r.top-8}));
    d.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left-8,clientY:r.top-8}));
    const outsideClosed=!d.open;
    await QuickActions.open(); d.querySelector('input').click(); const insideOpen=d.open; d.close();
    const themes=['forest','ember','ocean','porcelain'].every(id=>!!document.querySelector('.theme-choice[data-theme="'+id+'"]'));
    return {plain:!trigger.querySelector('kbd'),outsideClosed,insideOpen,themes};
  })()`);
  assert.deepEqual(palettePolish,{plain:true,outsideClosed:true,insideOpen:true,themes:true});
  await win.webContents.executeJavaScript(`document.querySelector('[data-theme=ocean]').click(); QuickActions.open();`);
  await new Promise(resolve=>setTimeout(resolve,180));
  fs.writeFileSync(path.join(output,'actions-polished.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('#quickActions').close(); document.querySelector('[data-theme=graphite]').click();`);

  const cli=await win.webContents.executeJavaScript(`(async()=>{
    AUTHST={codex:{installed:false,loggedIn:true,method:'chatgpt'}};
    const chip=authStatusEl('codex');document.body.append(chip);
    const missing=chip.textContent;chip.querySelector('button').click();await Promise.resolve();
    AUTHST={codex:{installed:true,loggedIn:true,method:'chatgpt'}};redrawAuth();const signedIn=chip.textContent;
    const failure=renderFailureCard({from:'system',failure:formatFailureInfo('Codex CLI is not installed or could not be started. Open Settings and click Install CLI for Codex, then try again.','codex')});
    const install=[...failure.querySelectorAll('button')].find(b=>b.textContent==='Install Codex CLI');install.click();await Promise.resolve();
    const calls=await api.call('test:calls');chip.remove();
    return {missing,signedIn,installCalls:calls.filter(c=>c[0]==='auth:install' && c[1]==='codex').length};
  })()`);
  assert.match(cli.missing,/Codex CLI not installed/);assert.doesNotMatch(cli.missing,/Signed in/);assert.match(cli.signedIn,/Signed in/);assert.ok(cli.installCalls>=2);
  const imageDrafts=await win.webContents.executeJavaScript(`(async()=>{
    const previous=openSid;
    await api.call('test:save-session','image-draft-a',{title:'Image draft A'});await api.call('test:save-session','image-draft-b',{title:'Image draft B'});
    await openSession('image-draft-a',false);document.querySelector('#input').value='Keep the pasted image';pend=[{name:'pasted.png',path:'pasted.png',size:10}];renderPend();
    showTab('settings');showTab('chat');const tabs=pend.length===1;
    await openSession('image-draft-b',false);const separate=pend.length===0;
    await openSession('image-draft-a',false);const restored=pend.length===1 && pend[0].name==='pasted.png' && document.querySelector('#input').value==='Keep the pasted image';
    await openSession(previous,false);
    for(const id of ['image-draft-a','image-draft-b']){localStorage.removeItem(draftKey(id));localStorage.removeItem(draftFilesKey(id));}
    return {tabs,separate,restored};
  })()`);
  assert.deepEqual(imageDrafts,{tabs:true,separate:true,restored:true});
  console.log('Pasted image drafts survive tabs and session switches');
  console.log('Renderer layout, progress, question controls and theme checks passed. Screenshots: ' + output);
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
