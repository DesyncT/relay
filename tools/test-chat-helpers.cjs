const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const helpers = await import('data:text/javascript;base64,' + fs.readFileSync('src/chat/md.js').toString('base64'));
 assert.ok(!helpers.md('<script>alert(1)</script>').includes('<script>'));
 assert.ok(helpers.md('@Sam', 'Sam').includes('class="men me"'));
 assert.equal(helpers.linkedImages('[Preview](C:/project/image.png)')[0].path, 'C:/project/image.png');
 assert.equal(helpers.linkedImages('[Preview](C:\\project\\image.png)')[0].path, 'C:\\project\\image.png');
 assert.equal(helpers.fileUrl('C:\\project\\image.png'), 'file:///C:/project/image.png');
 console.log('React markdown escaping, mentions and local image paths passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
