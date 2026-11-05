// Custom title bar. Load with <script src="titlebar.js"></script> after the main script. Needs chrome.css.
(() => {
  if (document.getElementById('tb')) return;
  const ic = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const mark = `<img src="assets/relay.svg" width="16" height="16" style="display:block;border-radius:4px;flex:none" alt="Relay">`;
  const bar = document.createElement('div');
  bar.id = 'tb';
  bar.innerHTML = `<div class="tb-brand">${mark}<span>Relay</span></div><span class="tb-sep">/</span><span class="tb-title" id="tbTitle"></span>
    <div class="tb-actions">
      <button id="tbScan" title="Rescan usage" aria-label="Rescan usage">${ic('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>')}</button>
      <button id="tbSettings" title="Settings" aria-label="Settings">${ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>')}</button>
    </div>`;
  document.body.prepend(bar);
  document.body.classList.add('tb');
  const title = document.getElementById('tbTitle');
  window.Titlebar = { setTitle: (t) => { title.textContent = t || ''; } };
  const label = (b) => b && b.textContent.trim();
  Titlebar.setTitle(label(document.querySelector('nav button.on')));
  document.querySelectorAll('nav button[data-tab]').forEach((b) => b.addEventListener('click', () => Titlebar.setTitle(label(b))));
  document.getElementById('tbScan').onclick = () => { document.querySelector('nav button[data-tab=usage]')?.click(); document.getElementById('rescan')?.click(); };
  document.getElementById('tbSettings').onclick = () => document.querySelector('nav button[data-tab=settings]')?.click();
})();
