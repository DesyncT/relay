import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './store.js';
import { SCREENS } from './screens/index.js';
import Nav from './components/Nav.jsx';
import { fadeUp } from './motion.js';

export default function App() {
  const tab = useStore((s) => s.tab);
  const Screen = SCREENS[tab] || SCREENS.usage;
  return (
    <>
      <Nav />
      <main>
        <AnimatePresence mode="wait" initial={false}>
          <motion.section key={tab} id={tab} className="on" {...fadeUp}><Screen /></motion.section>
        </AnimatePresence>
      </main>
    </>
  );
}
