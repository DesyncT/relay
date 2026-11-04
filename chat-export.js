// A plain-text snapshot in Markdown; attachment names are included, file contents are not.
module.exports = function chatMarkdown(session) {
  const heading = String(session.title || 'Relay chat').replace(/[\r\n]+/g, ' ');
  const messages = (session.messages || []).map(message => {
    const author = String(message.from || 'system').replace(/[\r\n]+/g, ' ');
    const date = new Date(message.at);
    const stamp = Number.isNaN(date.getTime()) ? '' : ' · '+date.toISOString();
    const files = (message.attachments || []).map(file => typeof file === 'string' ? file : file.name || file.path || 'Attachment');
    return '## '+author+stamp+'\n\n'+String(message.text || '')+(files.length ? '\n\nAttachments:\n'+files.map(file=>'- '+String(file).replace(/[\r\n]+/g,' ')).join('\n') : '');
  });
  return '# '+heading+'\n\n'+messages.join('\n\n---\n\n')+'\n';
};
