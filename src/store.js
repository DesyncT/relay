import { useSyncExternalStore } from 'react';

// Tiny shared store (replaces the old globals: openSid, cfg, profile...). Screens read slices with
// useStore(selector) and write with setState(patch). No dependency needed for this much state.
let state = { tab: 'usage', openSid: null, cfg: { routes: {}, edit: false }, profile: { name: 'you', avatar: '' } };
const listeners = new Set();
export const getState = () => state;
export const setState = (patch) => {
  const next = typeof patch === 'function' ? patch(state) : patch;
  if (!Object.keys(next).some(key => !Object.is(state[key], next[key]))) return;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = cb => { listeners.add(cb); return () => listeners.delete(cb); };
export const useStore = (select = (s) => s) =>
  useSyncExternalStore(subscribe, () => select(state));
