import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { call } from './api.js';
import { getState, setState, useStore } from './store.js';
import { SCREENS } from './screens/index.js';
import Nav, { TAB_HOME } from './components/Nav.jsx';
import Titlebar from './components/Titlebar.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import Boot from './components/Boot.jsx';
import ChatBackground from './components/shell/ChatBackground.jsx';
import { openSession } from './chat/chatStore.js';
import { ease } from './motion.js';

const ORDER = ['usage', 'chat', 'agents', 'rules', 'skills', 'settings', 'themes'];
let dir = 1, prevTab = 'usage';

export default function App() {
  const tab = useStore((s) => s.tab);
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  const Screen = SCREENS[tab] || SCREENS[TAB_HOME[tab]] || SCREENS.usage;
  if (tab !== prevTab) { dir = Math.sign(ORDER.indexOf(tab) - ORDER.indexOf(prevTab)) || 1; prevTab = tab; }

  // Startup mirrors the legacy IIFE: profile, lastTab + active session, reopen where you left off, then lift the splash.
  useEffect(() => {
    const done = () => setReady(true), fallback = setTimeout(done, 8000);
    window.addEventListener('error', done); window.addEventListener('unhandledrejection', done);
    (async () => {
      try {
        const profile = await call('profile:get');
        if (profile) setState({ profile });
        const cfg = await call('settings:get').catch(() => ({})) || {};
        setState({ cfg: { ...getState().cfg, ...cfg } });
        const last = cfg.lastTab || 'usage';
        const act = await call('sessions:getActive');
        await openSession(act, last === 'chat' && !!act);
        if (last !== 'chat' && last !== 'usage' && (SCREENS[last] || SCREENS[TAB_HOME[last]])) setState({ tab: last });
      } catch {}
      started.current = true; setState({}); done();
    })();
    return () => { clearTimeout(fallback); window.removeEventListener('error', done); window.removeEventListener('unhandledrejection', done); };
  }, []);
  useEffect(() => { if (started.current) call('settings:save', { lastTab: getState().tab }).catch(() => {}); }, [tab]);

  return (
    <>
      <Boot ready={ready} />
      <Titlebar />
      <Nav />
      <main>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.section key={tab} id={tab} className="on" custom={dir}
            initial={{ opacity: 0, filter: reduced ? 'blur(0px)' : 'blur(3px)' }} animate={{ opacity: 1, filter: 'blur(0px)', transition: { duration: 0.32, ease } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
            <Screen />
          </motion.section>
        </AnimatePresence>
      </main>
      <ChatBackground />
      <CommandPalette />
    </>
  );
}
