import { useEffect, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// Full-size image view: click or Esc closes. The thumbnail and the big image share a layoutId, so it zooms out of the thumb.
let cur = null;
const ls = new Set();
export const openLightbox = (src, name, id) => { cur = { src, name, id }; ls.forEach((l) => l()); };
const close = () => { cur = null; ls.forEach((l) => l()); };
export const lbId = (id) => 'lb-' + id;

export function Lightbox() {
  const lb = useSyncExternalStore((cb) => (ls.add(cb), () => ls.delete(cb)), () => cur);
  useEffect(() => {
    if (!lb) return;
    const key = (e) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [lb]);
  return (
    <AnimatePresence>
      {lb && (
        <motion.div key="lb" className="lb chat-lb" role="dialog" aria-label={lb.name || 'Image'} onClick={close}
          initial={{ backgroundColor: 'rgba(0,0,0,0)' }} animate={{ backgroundColor: 'rgba(0,0,0,.82)' }} exit={{ backgroundColor: 'rgba(0,0,0,0)', transition: { duration: 0.18 } }}>
          <motion.img layoutId={lb.id ? lbId(lb.id) : undefined} src={lb.src} alt={lb.name || ''} transition={{ type: 'spring', stiffness: 320, damping: 34 }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
