const assert = require('node:assert/strict');
const markdown = require('./chat-export');
const result = markdown({title:'Example\nchat', messages:[
  {from:'user', at:0, text:'Keep **Markdown** and\n```js\ncode()\n```', attachments:[{name:'design.png'},'notes.txt']},
  {from:'codex',at:'invalid',text:'Done'},
]});
assert.ok(result.startsWith('# Example chat\n'));
assert.ok(result.includes('## user · 1970-01-01T00:00:00.000Z'));
assert.ok(result.includes('Keep **Markdown** and\n```js\ncode()\n```'));
assert.ok(result.includes('- design.png\n- notes.txt'));
assert.ok(result.includes('## codex\n\nDone'));
assert.equal(markdown({title:'Empty',messages:[]}), '# Empty\n\n\n');
console.log('Chat Markdown export checks passed');
