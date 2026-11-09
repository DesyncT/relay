(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  __emit('agent:status', { sid:'s1', who:'codex', status:'searching', model:'gpt-6-sol', since:Date.now()-7000 });
  await wait(500);
  const log = document.querySelector('#log'), busy = document.querySelector('#busy');
  if (!log.contains(busy)) throw Error('Status is outside chat');
  if (busy.querySelector('.cu-pulse')) throw Error('Pulse remains');
  if (getComputedStyle(busy.querySelector('svg')).animationName !== 'none') throw Error('Icon still animates');
  log.scrollTop=log.scrollHeight; await wait(100);
  const before=busy.getBoundingClientRect().top;
  log.scrollTop-=200; await wait(100);
  if (busy.getBoundingClientRect().top < before+150) throw Error('Status does not scroll');
  log.scrollTop=log.scrollHeight; await wait(100);
  return {passed:true};
})()
