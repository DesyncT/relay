import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { call } from './api.js';
import { getState, setState, useStore } from './store.js';
import { SCREENS } from './screens/index.js';
import Nav, { TAB_HOME } from './components/Nav.jsx';
import Titlebar from './components/Titlebar.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import Boot from './components/Boot.jsx';
import ChatBackground from './components/shell/ChatBackground.jsx';
import { openSession } from './chat/chatStore.js';

export default function App() {
  const tab = useStore((s) => s.tab);
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  const main = useRef(null);
  useLayoutEffect(() => { if (main.current) main.current.scrollTop = 0; }, [tab]);
  const Screen = SCREENS[tab] || SCREENS[TAB_HOME[tab]] || SCREENS.usage;

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
      <main ref={main}>
        <section key={TAB_HOME[tab] || tab} id={tab} className="on">
          <Screen />
        </section>
      </main>
      <ChatBackground />
      <CommandPalette />
    </>
  );
}
