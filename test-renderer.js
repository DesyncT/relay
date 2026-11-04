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
    assert.equal(metrics.focus, 'solid');
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
  assert.deepEqual(errors, []);
  console.log('Renderer layout, tag recovery, focus, choice and custom-answer checks passed. Screenshots: ' + output);
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
