(async () => {
  for (const status of ['thinking', 'thinking...', 'thinking\u2026', 'typing...']) {
    __emit('agent:status', { sid: 's1', who: 'codex', status });
    await new Promise(r => setTimeout(r, 400));
    const text = document.querySelector('#busy .cu-sr')?.textContent;
    if (text !== status.replace(/[.\u2026]+$/, '')) throw Error('Unexpected status: ' + text);
    if (document.querySelector('#busy .cu-dots')) throw Error('Decorative dots remain');
  }
  return { passed: true, statuses: 4 };
})()
