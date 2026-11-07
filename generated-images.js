const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

// Codex stores generated tool images per thread, including images emitted by exec.
function collectImages(root, thread) {
  const images = new Set();
  const directory = id => /^[\w-]+$/.test(id || '') ? path.join(root, id) : null;
  const files = () => {
    try { return fs.readdirSync(directory(thread)).filter(n => /\.(png|jpe?g|webp|gif)$/i.test(n)).map(n => path.join(directory(thread), n)); }
    catch { return []; }
  };
  let before = new Set(files());
  return {
    event(e) {
      if (e.type === 'thread.started' && e.thread_id !== thread) {
        thread = e.thread_id; before = new Set(files());
      }
      const it = e.item || {};
      if (e.type === 'item.completed' && it.type === 'image_view' && it.path) {
        try { images.add(it.path.startsWith('file:') ? fileURLToPath(it.path) : it.path); } catch {}
      }
    },
    finish() {
      for (const file of files()) if (!before.has(file)) images.add(file);
      return [...images].filter(file => { try { return fs.statSync(file).isFile(); } catch { return false; } });
    },
  };
}
module.exports = { collectImages };
