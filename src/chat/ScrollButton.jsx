import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { clearUnread, smoothScrollToBottom, useChat } from './chatStore.js';
import { spring } from '../motion.js';

const R = 17, C = 2 * Math.PI * R;

// Pill above the composer: spring in/out, progress ring around the arrow orb, unread chip that expands to a label.
export default function ScrollButton({ logRef }) {
  const unread = useChat((s) => s.unread);
  const [away, setAway] = useState(false);
  const ring = useRef(null), btn = useRef(null), upd = useRef(() => {});
  const mx = useSpring(useMotionValue(0), { stiffness: 300, damping: 22 }), my = useSpring(useMotionValue(0), { stiffness: 300, damping: 22 });

  useEffect(() => {
    const el = logRef.current; if (!el) return;
    const f = upd.current = () => {
      const max = Math.max(1, el.scrollHeight - el.clientHeight), gap = max - el.scrollTop;
      if (ring.current) ring.current.style.strokeDashoffset = C * (1 - Math.min(1, Math.max(0, el.scrollTop / max)));
      setAway(gap > 80);
      if (gap < 40) clearUnread();
    };
    const key = (e) => { if (e.key === 'End' && e.target === el && !e.ctrlKey && !e.metaKey) { e.preventDefault(); smoothScrollToBottom(); } };
    f();
    el.addEventListener('scroll', f, { passive: true }); el.addEventListener('keydown', key);
    const ro = new ResizeObserver(f); ro.observe(el);
    return () => { el.removeEventListener('scroll', f); el.removeEventListener('keydown', key); ro.disconnect(); };
  }, [logRef]);

  const move = (e) => {
    const r = btn.current.getBoundingClientRect();
    mx.set(Math.max(-6, Math.min(6, (e.clientX - r.left - r.width / 2) * 0.18)));
    my.set(Math.max(-5, Math.min(5, (e.clientY - r.top - r.height / 2) * 0.25)));
  };
  const label = unread ? `${unread} new message${unread > 1 ? 's' : ''}, scroll to bottom` : 'Scroll to bottom';

  return (
    <div className="sb-anchor">
      <AnimatePresence>
        {away && (
          <motion.button ref={btn} id="scrollBottom" type="button" className={unread ? 'has-new' : ''} aria-label={label} title="Jump to latest (End)"
            layout style={{ x: mx, y: my, borderRadius: 999 }}
            initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.14 } }}
            transition={{ ...spring, layout: spring }}
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.94, scaleY: 0.88 }}
            onPointerMove={move} onPointerLeave={() => { mx.set(0); my.set(0); }}
            onClick={() => smoothScrollToBottom()}>
            <motion.span layout className="sb-orb">
              <svg className="sb-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r={R} className="sb-track" /><circle cx="20" cy="20" r={R} className="sb-prog" ref={(n) => { ring.current = n; upd.current(); }} strokeDasharray={C} strokeDashoffset={C} /></svg>
              <svg className="i sb-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-6-6 6 6 6-6" /></svg>
            </motion.span>
            <AnimatePresence initial={false} mode="popLayout">
              {unread > 0 && <motion.span key="lbl" layout="position" className="sb-lbl" aria-hidden="true" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6, transition: { duration: 0.1 } }}>New messages</motion.span>}
              {unread > 0 && <motion.span key="cnt" layout className="sb-cnt" aria-hidden="true" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.1 } }} transition={spring}>
                <AnimatePresence initial={false} mode="popLayout"><motion.span key={unread} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.18 }}>{unread > 99 ? '99+' : unread}</motion.span></AnimatePresence>
              </motion.span>}
            </AnimatePresence>
          </motion.button>
        )}
      </AnimatePresence>
      <span className="cu-sr" role="status" aria-live="polite">{unread ? `${unread} new message${unread > 1 ? 's' : ''}` : ''}</span>
    </div>
  );
}
