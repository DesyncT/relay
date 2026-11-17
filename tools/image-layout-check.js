(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const fits = element => {
    const r = element.getBoundingClientRect();
    assert(r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 54 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, 'Image overflows window');
  };
  for (const selector of ['#log .atts img', '#pend img']) {
    const thumb = document.querySelector(selector);
    assert(thumb, 'Missing image: ' + selector);
    fits(thumb);
    thumb.click();
    await wait(900);
    const viewer = document.querySelector('body > .lb');
    assert(viewer, 'Viewer must escape transformed chat containers');
    fits(viewer.querySelector('img'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(1000);
    assert(!document.querySelector('.lb'), 'Escape must close viewer');
  }
  document.querySelector('#log .atts img').click();
  await wait(900);
  return { passed: true, width: innerWidth, height: innerHeight };
})()
