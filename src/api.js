import { useEffect, useRef, useState, useCallback } from 'react';

// window.api comes from preload.js: call(channel, ...args) -> Promise, on(channel, fn) -> push events.
export const api = window.api;
export const call = (ch, ...args) => api.call(ch, ...args);

// Subscribe to a main-process push event. preload.js has no off(), so one listener per channel is
// registered lazily and fanned out to every mounted subscriber.
const subs = new Map();
function subscribe(ch, fn) {
  let set = subs.get(ch);
  if (!set) { set = new Set(); subs.set(ch, set); api.on(ch, (d) => set.forEach((f) => f(d))); }
  set.add(fn);
  return () => set.delete(fn);
}
export function useIpcEvent(ch, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe(ch, (d) => ref.current(d)), [ch]);
}

// One-shot request that re-runs on demand: const { data, reload } = useCall('settings:get').
export function useCall(ch, ...args) {
  const [data, setData] = useState(null);
  const key = JSON.stringify(args);
  const reload = useCallback(() => call(ch, ...JSON.parse(key)).then((d) => { setData(d); return d; }), [ch, key]);
  useEffect(() => { reload().catch(() => {}); }, [reload]);
  return { data, reload, setData };
}
