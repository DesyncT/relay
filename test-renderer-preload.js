// Isolated renderer test: no real agents, accounts or chat data.
const { contextBridge } = require('electron');
const calls = [];
const savedSessions = new Map();
let appearanceTree=null,themeFails=false;
contextBridge.exposeInMainWorld('api', {
  on() {},
  call(channel, ...args) {
    calls.push([channel, ...args]);
    if (channel === 'test:calls') return Promise.resolve(calls);
    if (channel === 'test:appearance-tree') {appearanceTree=args[0];return Promise.resolve();}
    if (channel === 'test:theme-fails') {themeFails=args[0];return Promise.resolve();}
    if (channel === 'themes:generate') {
      if(themeFails) return Promise.reject(new Error('Provider credits exhausted'));
      return Promise.resolve({name:'Generated ink',font:'serif',radius:4,borderWidth:2,density:'compact',colors:{deep:'#101014',bg:'#18181d',card:'#202026',raised:'#282830',text:'#f4f4f6',text2:'#d1d1da',muted:'#b5b5c1',line:'#454550',lineStrong:'#666676',accent:'#e5bda1',codex:'#d3d3e1',negative:'#ff9292'}});
    }
    if (channel === 'sessions:tree') return Promise.resolve(appearanceTree || {projects:[],sessions:[...savedSessions].map(([id,info])=>({id,title:info.title}))});
    if (channel === 'sessions:setActive') return Promise.resolve();
    if (channel === 'chat:export') return Promise.resolve({canceled:true});
    if (channel === 'chat:requirement-retry') return Promise.resolve(true);
    if (channel === 'test:save-session') { savedSessions.set(args[0], args[1]); return Promise.resolve(); }
    if (channel === 'chat:info') return Promise.resolve(savedSessions.get(args[0]) || null);
    if (channel === 'chat:history' || channel === 'subagents:list' || channel === 'chat:queue') return Promise.resolve([]);
    if (channel === 'chat:send') return Promise.resolve({});
    return new Promise(() => {}); // Hold unrelated startup work outside this fixture.
  },
});
