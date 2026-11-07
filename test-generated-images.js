const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { collectImages } = require('./generated-images');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-images-'));
try {
  const dir = path.join(root, 'thread'); fs.mkdirSync(dir);
  const old = path.join(dir, 'old.png'); fs.writeFileSync(old, 'old');
  const collect = collectImages(root, 'thread');
  const fresh = path.join(dir, 'new.png'); fs.writeFileSync(fresh, 'new');
  assert.deepEqual(collect.finish(), [fresh]);
  collect.event({ type:'item.completed', item:{ type:'image_view', path:pathToFileURL(old).href } });
  assert.deepEqual(new Set(collect.finish()), new Set([old, fresh]));
  collect.event({ type:'item.started', item:{ type:'image_view', path:old } });
  assert.equal(collect.finish().length, 2);
  const empty = collectImages(root);
  empty.event({type:'thread.started', thread_id:'other'});
  fs.mkdirSync(path.join(root, 'other')); fs.writeFileSync(path.join(root, 'other', 'out.png'), 'image');
  assert.equal(empty.finish().length, 1);
  assert.deepEqual(collectImages(root, '../escape').finish(), []);
  console.log('Generated image collection passed');
} finally { fs.rmSync(root, { recursive:true, force:true }); }
