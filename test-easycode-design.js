const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ensureDesignSkill,easyCodePrompt,DESIGN_SKILL}=require('./easycode-design');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-design-'));
try {
  const file=ensureDesignSkill(root),text=easyCodePrompt(file);
  assert.equal(fs.readFileSync(file,'utf8'),DESIGN_SKILL);
  const before=fs.statSync(file).mtimeMs;ensureDesignSkill(root);assert.equal(fs.statSync(file).mtimeMs,before);
  assert.ok(text.includes(file));
  assert.match(text,/At most 3 questions/);assert.match(text,/once the request is clear, just do the work/);
  assert.match(text,/one appropriate installed design skill/);assert.match(text,/Backend-only work does not need design steps/);
  assert.match(DESIGN_SKILL,/reduced-motion/);assert.match(DESIGN_SKILL,/Inspect screenshots/);assert.match(DESIGN_SKILL,/preserve user input/);
  console.log('Bundled EasyCode design skill, prompt constraints and idempotent installation passed');
}finally {assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});}
