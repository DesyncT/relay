// Public helpers + shared state for the side panels. State lives in the shared store (namespaced pn*).
import { call } from '../api.js';
import { getState, setState } from '../store.js';

export const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
export const IMG = /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i;
export const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
export const fileUrl = (p) => 'file:///' + String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');

const sid = () => getState().openSid;
const bump = () => ({ pnRefresh: (getState().pnRefresh || 0) + 1 });

// kind: 'term' | 'changes' | 'browser' | 'files'. Toggles shut when already showing.
export function openPanel(kind) {
  if (getState().pnMode === kind) return closePanel();
  setState({ pnMode: kind, ...bump() });
}
export function closePanel() {
  if (!getState().pnMode) return;
  setState({ pnMode: null });
  call('panel:watch', sid(), null);
}
export const refreshPanel = () => setState(bump());
// returns the stat result (may be {error}); opens the viewer on success
export async function openFile(p) {
  const r = await call('panel:file:stat', sid(), p); if (r?.error) return r;
  const recent = [{ path: r.path, name: r.name }, ...(getState().pnRecent || []).filter((x) => x.path !== r.path)].slice(0, 8);
  setState({ pnFile: r, pnRecent: recent, pnMode: 'viewer', ...bump() });
  call('panel:watch', sid(), r.path);
  return r;
}
export const openUrl = (u) => setState({ pnMode: 'browser', pnUrl: { u, n: Date.now() } });
export const isPanelOpen = () => !!getState().pnMode;
