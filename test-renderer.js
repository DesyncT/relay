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
  const spin = await win.webContents.executeJavaScript(`(() => {
    renderReqs({items:[{t:'Active requirement',done:false,by:'claude',pct:40}]});
    const icon = document.querySelector('#reqbar li.now .rq-ic');
    return {name:getComputedStyle(icon).animationName, reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
  })()`);
  if (spin.reduced) assert.equal(spin.name, 'none');
  else assert.equal(spin.name, 'rqSpin', 'Active requirement icons must keep spinning when motion is enabled');
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
  assert.equal(sizing.tall, sizing.short, 'Typing additional lines must not resize the transcript');
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
    await new Promise(resolve => setTimeout(resolve, 80));
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
  console.log('Renderer layout, tag recovery, focus, choice and custom-answer checks passed. Screenshots: ' + output);
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
