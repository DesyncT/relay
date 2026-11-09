import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, animate, useMotionValue } from 'framer-motion';
import { call, useIpcEvent } from '../api.js';
import { getState, setState, useStore } from '../store.js';
import { spring } from '../motion.js';
import { lsGet, lsSet, openPanel, closePanel, refreshPanel, openUrl, openFile, fileUrl, fmtSize, IMG } from './panelsApi.js';
import { Icon } from './panels/ui.jsx';
import Term, { useTermEvents } from './panels/Term.jsx';
import Changes from './panels/Changes.jsx';
import Browser from './panels/Browser.jsx';
import Files from './panels/Files.jsx';
import Viewer from './panels/Viewer.jsx';
import '../styles/panels-react.css';

export { openPanel, closePanel, openFile, openUrl, fileUrl, fmtSize, IMG };

const BTNS = [['term', 'Terminal', 'term'], ['changes', 'Changes', 'diff'], ['browser', 'Browser', 'globe'], ['files', 'Files', 'folder']];
// header buttons for the chat header; active state mirrors the open panel
export function PanelButtons() {
  const mode = useStore((s) => s.pnMode);
  return BTNS.map(([k, label, icon]) => (
    <motion.button key={k} className="pn-b pn-hb" type="button" title={label} aria-label={label} aria-pressed={mode === k} onClick={() => openPanel(k)} whileTap={{ scale: 0.9 }}>
      <Icon n={icon} />
      {mode === k && <motion.span layoutId="pn-hb-ind" className="pn-hb-ind" transition={spring} />}
    </motion.button>
  ));
}

export default function Panels() {
  const sid = useStore((s) => s.openSid);
  const mode = useStore((s) => s.pnMode);
  const refresh = useStore((s) => s.pnRefresh) || 0;
  const w = useMotionValue(0);
  const asideRef = useRef(null), wide = useRef(false), drag = useRef(false);
  useTermEvents();

  const hostW = () => asideRef.current?.parentElement?.clientWidth || window.innerWidth;
  const clamp = (v, m = getState().pnMode) => Math.max(320, Math.min(m === 'viewer' ? Math.max(320, hostW() - 320) : 900, Math.round(v)));
  const key = mode === 'viewer' ? 'pn.wv' : 'pn.w';
  const target = (m) => clamp(+lsGet(m === 'viewer' ? 'pn.wv' : 'pn.w', 0) || (m === 'viewer' ? hostW() * 0.55 : 400), m);

  // width spring when the mode changes (width differs between viewer and the rest)
  useEffect(() => { if (mode) { wide.current = false; const c = animate(w, target(mode), spring); return c.stop; } }, [mode]); // eslint-disable-line
  // session switched: re-run the active mode; legacy Panels.refresh()
  useEffect(() => { if (mode && mode !== 'viewer') refreshPanel(); }, [sid]); // eslint-disable-line

  useIpcEvent('panel:open-url', (d) => { if (d?.sid === sid && /^https?:\/\//i.test(d.url)) openUrl(d.url); });
  useIpcEvent('panel:show', (d) => {
    if (d?.sid !== sid || !['term', 'changes', 'browser', 'files', 'viewer'].includes(d.mode)) return;
    if (getState().pnMode === d.mode) refreshPanel(); else setState({ pnMode: d.mode, pnRefresh: refresh + 1 });
  });

  const onGrip = (e) => {
    e.preventDefault(); const g = e.currentTarget; g.setPointerCapture(e.pointerId); g.classList.add('drag'); drag.current = true;
    const move = (ev) => w.set(clamp(asideRef.current.parentElement.getBoundingClientRect().right - ev.clientX));
    const up = () => { g.classList.remove('drag'); drag.current = false; g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); lsSet(key, String(w.get())); };
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
  };
  const toggleWide = () => { wide.current = !wide.current; animate(w, clamp(hostW() * (wide.current ? 0.8 : 0.55)), spring); };
  const gripKey = (e) => {
    const d = e.key === 'ArrowLeft' ? 24 : e.key === 'ArrowRight' ? -24 : 0; if (!d) return;
    e.preventDefault(); const v = clamp(w.get() + d); w.set(v); lsSet(key, String(v));
  };

  return (
    <AnimatePresence>
      {mode && sid && (
        <motion.aside ref={asideRef} className="pn" aria-label="Side panel" style={{ width: w, overflow: 'hidden' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
          onAnimationStart={() => {}}>
          <div className="pn-grip" role="separator" aria-orientation="vertical" aria-label="Resize panel" tabIndex={0} onPointerDown={onGrip} onKeyDown={gripKey} />
          <div className="pn-inner">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} className="pn-mode" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={{ duration: 0.18 }}>
                {mode === 'term' && <Term sid={sid} refresh={refresh} />}
                {mode === 'changes' && <Changes sid={sid} refresh={refresh} />}
                {mode === 'browser' && <Browser sid={sid} />}
                {mode === 'files' && <Files sid={sid} refresh={refresh} />}
                {mode === 'viewer' && <Viewer sid={sid} onWide={toggleWide} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
