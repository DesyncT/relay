// The CLI owns tools and session state; Relay requests readable progress in chat.
function normalPrompt(session, provider, resumed) {
  const messages = (session.messages || []).filter(message => message.from !== 'system');
  const lastUser = messages.findLastIndex(message => message.from === 'user');
  const fresh = resumed ? messages.slice(Math.max(0,lastUser)).filter(message => message.from !== provider) : messages;
  const guidance = 'While working, post brief, informative progress updates in plain language. Start with what you will check or change. Share useful findings, changes made, and what you are testing as the work progresses, especially before a long tool run. Explain practical reasons for decisions without private internal reasoning. Avoid filler such as thinking, typing, or working on it. Keep updates to one or two sentences; do not narrate every command. Never paste raw command output or stderr into chat. Summarize command results and errors in one or two sentences; quote at most 6 relevant lines when needed. Finish with the outcome, checks performed, and any remaining limitations.';
  return guidance + '\n\n' + fresh.map(message => `${message.from === 'user' ? '' : '['+message.from+'] '}${message.text || ''}${(message.attachments || []).map(file => '\nAttached: '+file.name+' ('+file.path+')').join('')}`).join('\n\n');
}
// Hold the latest message so the separately posted final answer is never repeated.
function createProgressStream(onProgress) {
  let pending = '', last = '';
  const flush = () => {
    if (pending && pending !== last) { onProgress?.(pending); last = pending; }
    pending = '';
  };
  return {
    push(text) { if (text?.trim() && text.trim() !== pending) { flush(); pending = text.trim(); } },
    flush,
    finish(finalText) { if (pending === finalText?.trim()) pending = ''; else flush(); },
  };
}
module.exports = {normalPrompt,createProgressStream};
