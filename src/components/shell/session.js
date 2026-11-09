// Sidebar data layer: tree + working set live in the shared store (sbTree / sbWorking), pins in localStorage.
import { call } from '../../api.js';
import { getState, setState } from '../../store.js';
import { openSession } from '../../chat/chatStore.js';

export const LIMIT = 20;
const PIN = 'relay.pinnedSessions';
export const loadPins = () => { try { const s = JSON.parse(localStorage.getItem(PIN) || '[]'); return Array.isArray(s) ? s.filter((x) => typeof x === 'string') : []; } catch { return []; } };
export const savePins = (a) => { try { localStorage.setItem(PIN, JSON.stringify(a)); } catch {} };

const EMPTY = { projects: [], sessions: [], active: null };
export const tree = () => getState().sbTree || EMPTY;
const setTree = (t) => setState({ sbTree: t });

let token = 0, timer;
export async function refresh() {
  const t = ++token, next = await call('sessions:tree');
  if (t !== token) return;
  const mine = getState().openSid;
  setTree(mine ? { ...next, active: mine } : next);
}
export const refreshSoon = () => { clearTimeout(timer); timer = setTimeout(() => refresh().catch(() => {}), 40); };

export async function open(id, show) {
  const t = tree();
  setTree({ ...t, active: id, sessions: t.sessions.map((s) => (s.id === id ? { ...s, unread: false } : s)) });
  if (id) setState({ openSid: id });
  await call('sessions:setActive', id);
  await openSession(id, show);
  if (id && show !== false) setState({ tab: 'chat' });
}

export async function newSession(g) {
  const t = tree();
  let pid = g?.id ?? (t.projects.find((p) => t.sessions.some((s) => s.projectId === p.id && s.id === t.active)) || t.projects[0])?.id;
  if (!pid) { const p = await call('projects:pick').catch((e) => { alert(e.message); }); pid = p?.id; }
  if (!pid) return;
  const s = await call('sessions:create', pid);
  await refresh(); await open(s.id);
}
export const addProject = async () => { const p = await call('projects:pick').catch((e) => alert(e.message)); if (p) await refresh(); };

// Palette "New session in this project": the project of the open chat (legacy /new).
export async function newInOpenProject() {
  const t = await call('sessions:tree'), s = t.sessions.find((x) => x.id === getState().openSid);
  if (!s) return;
  const n = await call('sessions:create', s.projectId); await call('sessions:setActive', n.id); await openSession(n.id); await refresh();
}

export async function delSession(s) {
  if (!confirm(`Delete "${s.title}"? This removes the chat history.`)) return;
  const was = tree().active === s.id, next = await call('sessions:delete', s.id);
  await refresh();
  if (was) next ? open(next) : openSession(null);
}

export async function removeProject(p) {
  if (!confirm(`Remove "${p.name}" from the list? Files on disk are not touched; its chats are deleted.`)) return;
  const was = tree().active; await call('projects:remove', p.id); await refresh();
  if (was && tree().active !== was) { const n = tree().sessions[0]?.id; n ? open(n) : openSession(null); }
}

export function applyOrder(kind, pid, ids) {
  const t = tree();
  if (kind === 'project') { setTree({ ...t, projects: ids.map((i) => t.projects.find((p) => p.id === i)) }); call('projects:reorder', ids); }
  else { setTree({ ...t, sessions: [...t.sessions.filter((x) => x.projectId !== pid), ...ids.map((i) => t.sessions.find((x) => x.id === i))] }); call('sessions:reorder', pid, ids); }
}
export const idsOf = (kind, pid) => (kind === 'project' ? tree().projects : tree().sessions.filter((x) => x.projectId === pid)).map((x) => x.id);
export function moveTo(kind, pid, from, to, side) {
  const ids = idsOf(kind, pid).filter((i) => i !== from);
  ids.splice(ids.indexOf(to) + (side === 'after' ? 1 : 0), 0, from);
  applyOrder(kind, pid, ids);
}
export function moveBy(kind, pid, id, d) {
  const ids = idsOf(kind, pid), i = ids.indexOf(id), j = i + d;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]]; applyOrder(kind, pid, ids);
}
export function toggleCollapsed(p) {
  const t = tree();
  setTree({ ...t, projects: t.projects.map((x) => (x.id === p.id ? { ...x, collapsed: !x.collapsed } : x)) });
  call('projects:toggle', p.id);
}
