import { AnimatePresence, motion } from 'framer-motion';

// Splash. Legacy hides it after the first load, or after 8s / any error, whichever comes first (App owns `ready`).
export default function Boot({ ready }) {
  return (
    <AnimatePresence>
      {!ready && (
        <motion.div id="boot" role="status" aria-label="Loading" key="boot" exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.3 }}>
          <img src="./assets/relay.svg" alt="" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
