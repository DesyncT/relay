import { AnimatePresence, motion } from 'framer-motion';
import { useRef, useState, useCallback } from 'react';
import { spring } from '../../motion.js';

// const [node, flash] = useSaved(); render {node}; call flash() after a save.
export function useSaved(ms = 1500) {
  const [on, setOn] = useState(false);
  const t = useRef();
  const flash = useCallback(() => { setOn(true); clearTimeout(t.current); t.current = setTimeout(() => setOn(false), ms); }, [ms]);
  const node = (
    <span className="saved" role="status" style={{ display: 'inline-block', minWidth: 40 }}>
      <AnimatePresence>{on && <motion.span key="s" initial={{ opacity: 0, scale: 0.8, x: 6 }} animate={{ opacity: 1, scale: 1, x: 0, transition: spring }} exit={{ opacity: 0 }} style={{ display: 'inline-block' }}>Saved</motion.span>}</AnimatePresence>
    </span>
  );
  return [node, flash];
}
