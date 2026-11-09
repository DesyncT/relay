// Mock window.api for isolated UI checks. Channel values come from the JSON fixtures file in RELAY_FIXTURES:
// { "settings:get": {...}, "chat:history": [...] }. Unlisted channels resolve null. Every call is recorded;
// window.__calls() returns them, window.__emit(channel, data) fires a main-process push event.
const { contextBridge } = require('electron');
const fs = require('fs');
const fx = process.env.RELAY_FIXTURES ? JSON.parse(fs.readFileSync(process.env.RELAY_FIXTURES, 'utf8')) : {};
for (const [key, value] of Object.entries(fx.__storage || {})) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
const calls = [], listeners = new Map();
contextBridge.exposeInMainWorld('api', {
  on: (ch, fn) => { (listeners.get(ch) || listeners.set(ch, []).get(ch)).push(fn); },
  call: (ch, ...args) => { calls.push([ch, ...args]); return Promise.resolve(ch in fx ? fx[ch] : null); },
});
contextBridge.exposeInMainWorld('__calls', () => calls);
contextBridge.exposeInMainWorld('__emit', (ch, data) => (listeners.get(ch) || []).forEach((f) => f(data)));
