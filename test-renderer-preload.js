// Isolated renderer test: no real agents, accounts or chat data.
const { contextBridge } = require('electron');
const calls = [];
contextBridge.exposeInMainWorld('api', {
  on() {},
  call(channel, ...args) {
    calls.push([channel, ...args]);
    if (channel === 'test:calls') return Promise.resolve(calls);
    if (channel === 'chat:send') return Promise.resolve({});
    return new Promise(() => {}); // Hold unrelated startup work outside this fixture.
  },
});
