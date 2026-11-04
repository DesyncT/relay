// Run: node_modules/.bin/electron test-renderer.js
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = process.env.RELAY_TEST_OUTPUT || path.join(app.getPath('temp'), 'relay-ui-check');
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true });
  const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: path.join(__dirname, 'test-renderer-preload.js'), contextIsolation: true } });
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
  assert.deepEqual(errors, []);
  console.log('Renderer layout, tag recovery, focus, choice and custom-answer checks passed. Screenshots: ' + output);
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
