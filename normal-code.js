// Relay supplies conversation content; the CLI owns instructions, tools and session state.
function normalPrompt(session, provider, resumed) {
  const messages = (session.messages || []).filter(message => message.from !== 'system');
  const lastUser = messages.findLastIndex(message => message.from === 'user');
  const fresh = resumed ? messages.slice(Math.max(0,lastUser)).filter(message => message.from !== provider) : messages;
  return fresh.map(message => `${message.from === 'user' ? '' : '['+message.from+'] '}${message.text || ''}${(message.attachments || []).map(file => '\nAttached: '+file.name+' ('+file.path+')').join('')}`).join('\n\n');
}
module.exports = {normalPrompt};
