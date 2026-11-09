import { useSyncExternalStore } from 'react';

// Tiny shared store (replaces the old globals: openSid, cfg, profile...). Screens read slices with
// useStore(selector) and write with setState(patch). No dependency needed for this much state.
let state = { tab: 'usage', openSid: null, cfg: { routes: {}, edit: false }, profile: { name: 'you', avatar: '' } };
const listeners = new Set();
export const getState = () => state;
export const setState = (patch) => {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
export const useStore = (select = (s) => s) =>
  useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => select(state));
