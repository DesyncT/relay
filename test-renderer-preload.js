// Isolated renderer test: no real agents, accounts or chat data.
const { contextBridge } = require('electron');
const calls = [];
const savedSessions = new Map();
contextBridge.exposeInMainWorld('api', {
  on() {},
  call(channel, ...args) {
    calls.push([channel, ...args]);
    if (channel === 'test:calls') return Promise.resolve(calls);
    if (channel === 'sessions:tree') return Promise.resolve({projects:[],sessions:[...savedSessions].map(([id,info])=>({id,title:info.title}))});
    if (channel === 'sessions:setActive') return Promise.resolve();
    if (channel === 'chat:export') return Promise.resolve({canceled:true});
    if (channel === 'test:save-session') { savedSessions.set(args[0], args[1]); return Promise.resolve(); }
    if (channel === 'chat:info') return Promise.resolve(savedSessions.get(args[0]) || null);
    if (channel === 'chat:history' || channel === 'subagents:list' || channel === 'chat:queue') return Promise.resolve([]);
    if (channel === 'chat:send') return Promise.resolve({});
    return new Promise(() => {}); // Hold unrelated startup work outside this fixture.
  },
});
