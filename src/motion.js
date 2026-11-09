// Shared motion language. Every screen uses these so the whole app moves the same way.
// MotionConfig reducedMotion="user" (in main.jsx) turns transforms off for people who ask for it.
export const spring = { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 };
export const springSoft = { type: 'spring', stiffness: 220, damping: 28 };
export const ease = [0.22, 1, 0.36, 1]; // expo-out: fast start, long settle

export const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.18 } },
};
export const pop = {
  initial: { opacity: 0, scale: 0.96, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.12 } },
};
export const stagger = (gap = 0.04, delay = 0) => ({ animate: { transition: { staggerChildren: gap, delayChildren: delay } } });
export const item = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease } } };
