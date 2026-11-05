const assert = require('node:assert/strict');
const { parseTurn, route, isConversation, conversationReply, answeredQuestions } = require('./turn');
const fs = require('node:fs');
const vm = require('node:vm');
const { fullAccessArgs } = require('./permissions');
assert.deepEqual(fullAccessArgs(['--sandbox', 'read-only', '-a', 'on-request', '-c', 'sandbox_mode="read-only"', '--model', 'example'], 'codex'), ['--model','example','--dangerously-bypass-approvals-and-sandbox']);
assert.deepEqual(fullAccessArgs(['--permission-mode=plan', '--tools', 'Read', '--model', 'example'], 'claude'), ['--model','example','--dangerously-skip-permissions']);
assert.deepEqual(fullAccessArgs(['exec','resume','session','--full-auto','--config=approval_policy="on-request"'], 'codex'), ['exec','resume','session','--dangerously-bypass-approvals-and-sandbox']);
// Super Auto: a question the voters answered (agent autoAsk, then the auto verdict, then the viaAuto reply) still counts as answered
assert.equal(answeredQuestions([{from:'user',text:'build x'},{from:'claude',text:'Q1?',autoAsk:true},{from:'auto',text:'Intent: A'},{from:'user',text:'A',viaAuto:true},{from:'claude',text:'Q2?',askUser:true},{from:'user',text:'B'}]), 2);

const tag = '[ask-user!: Yes, one at a time | Show all questions at once | Keep current behavior | Something else :: type your own answer]';
for (const raw of [`Which outcome matters most? ${tag}`, `Which outcome matters most? ${tag}\nChoose an answer below.`]) {
  const question = parseTurn(raw, 'claude');
  assert.equal(question.askUser, true);
  assert.equal(question.important, true);
  assert.equal(question.options.length, 4);
  assert.equal(question.optionInfo[3], 'type your own answer');
  assert.doesNotMatch(question.text, /ask-user|Show all questions/);
  assert.deepEqual(question.next, []);
}
assert.equal(parseTurn('Finished. [done].', 'codex').text, 'Finished.');
assert.deepEqual(parseTurn('Please check. [pass @codex]', 'claude').next, ['codex']);
assert.equal(parseTurn('Which scope? [ask-user: Page :: One page | Site :: All pages | Component :: One control]', 'codex').important, undefined);
console.log('Question controls: passed.');

for (const building of [false, true]) {
  assert.deepEqual(route('@codex @claude ask me questions', 'claude', building, () => 0, true), { first: ['claude'], after: null, lead: 'claude' });
}
assert.equal(route('Build it', 'claude', true).first.length, 2);
const interview = [{from:'user',text:'Build a product selector'}];
for(let i=0;i<5;i++) interview.push({from:'claude',askUser:true},{from:'user',text:'Answer '+i});
assert.equal(answeredQuestions(interview),5);
for (const text of ['hello', 'hey!', 'are u done', 'are you done?', 'what is React', 'How does this work?', 'Any updates?', 'How do I deploy this?', 'Explain React hooks', 'Tell me about CSS', 'can u explain react', 'do you know TypeScript', 'why is the sky blue']) assert.equal(isConversation(text), true, text);
for (const text of ['Build a portal', 'Can you fix the layout?', 'What should we build?', 'ask me some questions', 'hello, fix the UI', 'yes', 'no', 'okay', 'do it', 'can u polish this', 'How do I deploy this and then you run it?']) assert.equal(isConversation(text), false, text);
for (const text of ['hi there!', 'hey relay', 'how r u?', 'how’s it going?', 'thx', 'thank you very much', 'what can u do?', 'who are you?', 'status', 'done yet?', 'u done?', 'is it ready?', 'still working?', 'what’s left?']) assert.notEqual(conversationReply(text), null, text);
assert.match(conversationReply('status', {busy:true}), /Still working/);
assert.match(conversationReply("what's left?", {items:[{t:'Fix login',done:false},{t:'Fix logo',done:true}]}), /Fix login/);
assert.equal(conversationReply('done yet?', {items:[{done:true}]}), 'Yes.');
