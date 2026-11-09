import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call } from '../../api.js';
import { isImg, fileUrl } from './ui.jsx';
import { spring, ease } from '../../motion.js';

// One queued image: tries previewUrl, dataUrl, url, src, then the file path; falls back to "Preview unavailable".
function Thumb({ file, onOpen }) {
  const sources = [...new Set([file.previewUrl, file.dataUrl, file.url, file.src,
    typeof file.path === 'string' && file.path.trim() ? fileUrl(file.path) : ''].filter((s) => typeof s === 'string' && s.trim()))];
  const [i, setI] = useState(0);
  const name = file.name || 'Queued image';
  if (i >= sources.length) return <span className="q-image-missing" title={name}>Preview unavailable</span>;
  return <img className="q-thumb" alt={name} title={name} src={sources[i]} onError={() => setI(i + 1)}
    onClick={(e) => onOpen(file.path ? fileUrl(file.path) : e.currentTarget.src, file.name)} />;
}

function Item({ item, sid, onEdit, onOpen, onError }) {
  const [busy, setBusy] = useState(false);
  const files = item.files || [], images = files.filter(isImg);
  const text = (item.text || '').trim();
  const preview = text || files.map((f) => f.name).join(', ') || 'Attachment';
  const run = async (fn, msg) => { setBusy(true); try { await fn(); } catch (e) { if (msg) onError(`${msg}: ${e.message}`); } finally { setBusy(false); } };
  const btn = (cls, label, title, txt, onClick) => (
    <button type="button" className={`q-send q-icon ${cls}`} aria-label={label} title={title} disabled={busy} onClick={onClick}>{txt}</button>
  );
  return (
    <motion.div className="q-item" layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: spring }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.16 } }}>
      <div className="q-content">
        {images.map((f, k) => <Thumb key={k} file={f} onOpen={onOpen} />)}
        {(text || !images.length) && <div className="q-preview" title={preview}>{preview}</div>}
      </div>
      <div className="q-acts">
        <span className="q-state">Queued</span>
        {btn('q-go', 'Interrupt and send', 'Interrupt current work, then send this message', 'Send now', () => run(() => call('chat:queue-interrupt-send', sid, item.id)))}
        {btn('q-edit', 'Edit', 'Edit queued message', 'Edit', () => onEdit(item))}
        {btn('q-delete', 'Delete', 'Delete queued message', 'Delete', () => run(() => call('chat:queue-delete', sid, item.id), 'Could not delete queued message'))}
      </div>
    </motion.div>
  );
}

export default function Queue({ items, sid, onEdit, onOpen, onError }) {
  return (
    <AnimatePresence initial={false}>
      {items.length > 0 && (
        <motion.div id="queueCount" role="status" style={{ overflow: 'hidden' }}
          initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: 'auto', marginBottom: 8, transition: { duration: 0.28, ease } }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.2, ease } }}>
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((it) => <Item key={it.id} item={it} sid={sid} onEdit={onEdit} onOpen={onOpen} onError={onError} />)}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
