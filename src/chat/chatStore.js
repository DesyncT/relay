import { useSyncExternalStore } from 'react';
import { api, call } from '../api.js';
import { getState, setState } from '../store.js';
import { isPanelOpen } from './panelsApi.js';
import '../../turn.js'; // classic script: defines window.parseTurn / window.formatFailureInfo

// Conversation state for the open session. Lives at module level (not in the Chat screen) because the
// sidebar opens sessions and main pushes chat events even while another tab is showing.
const AGENTS = ['claude', 'codex', 'antigravity'];
let S = { sid: null, title: '', loaded: false, items: [], subs: [], subsOpen: false, reqs: null, spend: {}, ledger: false, act: {}, limits: { claude: 0, codex: 0, antigravity: 0 }, chips: null, info: null, stoppable: false, epoch: 0, unread: 0 };
const listeners = new Set();
const patch = (p) => { S = { ...S, ...p }; listeners.forEach((l) => l()); };
export const getChat = () => S;
const subscribe = cb => { listeners.add(cb); return () => listeners.delete(cb); };
export const useChat = (sel = (s) => s) => useSyncExternalStore(subscribe, () => sel(S));
export const useMessages = () => useChat((s) => s.items);

const actBy = {}; // agent activity per session, so switching away and back keeps "claude is typing"
let nid = 0, tok = 0, liveN = 0, liveT = 0, sender = null;

// ---- composer hookup ----
export const registerSender = (fn) => { sender = fn; return () => { if (sender === fn) sender = null; }; };
export const sendChat = async (label) => {
  if (sender) return sender(label);
  if (S.sid) return call('chat:send', S.sid, label, [], { queue: true });
};
export const answerAsk = (label) => { call('notify:clearQuestion').catch(() => {}); return sendChat(label); };
export const replyTo = (m) => {
  setState({ chatReplying: { ...m, id: m.at } });
  window.dispatchEvent(new CustomEvent('chat:reply', { detail: m })); // composer prefills "@who " and focuses
};
export const cancelReply = () => setState({ chatReplying: null });

// ---- scrolling ----
let logEl = null;
export const setLogEl = (el) => { logEl = el; };
let anim = 0, stopAnim = null;
const cancelScroll = () => { if (stopAnim) stopAnim(); };
export const scrollLogToBottom = () => {
  cancelScroll();
  if (!logEl) return;
  logEl.scrollTop = logEl.scrollHeight;
  requestAnimationFrame(() => { if (logEl) logEl.scrollTop = logEl.scrollHeight; });
};
export const clearUnread = () => { if (S.unread) patch({ unread: 0 }); };
// eased (expo-out) scroll; any wheel/touch/key/pointer input from the user cancels it
export const smoothScrollToBottom = (ms = 520) => {
  cancelScroll();
  const el = logEl; if (!el) return;
  clearUnread();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return scrollLogToBottom();
  const from = el.scrollTop, t0 = performance.now(), id = ++anim;
  const stop = () => { anim++; stopAnim = null; ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach((e) => el.removeEventListener(e, stop)); };
  stopAnim = stop;
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach((e) => el.addEventListener(e, stop, { passive: true }));
  const step = (now) => {
    if (id !== anim) return;
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 4), to = el.scrollHeight - el.clientHeight;
    el.scrollTop = from + (to - from) * e;
    if (k < 1) requestAnimationFrame(step); else stop();
  };
  requestAnimationFrame(step);
};

// ---- messages ----
export function addMsg(m, live, batch) {
  if (AGENTS.includes(m.from) && /\[ask-user[!:\s\]]/i.test(m.text || '') && window.parseTurn) m = { ...m, ...window.parseTurn(m.text, m.from) };
  const item = { id: ++nid, m };
  if (live) { liveN = Date.now() - liveT < 800 ? liveN + 1 : 0; liveT = Date.now(); item.live = true; item.delay = liveN * 0.06; }
  if (batch) { batch.push(item); return item; }
  const follow = !logEl || logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 100 || m.from === 'user';
  patch({ items: [...S.items, item], ...(follow || m.from === 'system' ? {} : { unread: S.unread + 1 }) });
  if (follow) scrollLogToBottom();
  syncShared();
  return item;
}
// local system card (slash command output); not persisted. Accepts a React node or a DOM node.
export function addSystemCard(node) {
  const item = { id: ++nid, card: node, at: Date.now(), live: true, delay: 0 };
  patch({ items: [...S.items, item] });
  scrollLogToBottom();
  return item.id;
}

const providerKey = (m) => m.from !== 'auto' ? String(m.route?.model || m.usage?.model || '').split(/[-\d]/)[0].toLowerCase() : (m.providers || []).join(',');
const FAIL = /^(?:subagent\s+.*?\s+failed:|(?:claude|codex|antigravity)\s+failed:)/i;

// grouping, ask state and review context derive from the ordered list (the legacy code mutated `prev`/`lastOpts` as it appended)
export function layoutItems(items) {
  let prev = null, openAsk = null, lastUser = null;
  const rows = [];
  for (const it of items) {
    if (it.card) { prev = null; rows.push({ ...it, kind: 'card' }); continue; }
    const m = it.m;
    if (m.from === 'user' || m.askUser) openAsk = null;
    if (m.viaAuto && prev?.from === 'auto' && prev.auto === 'agree') continue; // the automatic answer is shown once
    const o = { ...it, kind: 'msg' };
    if (m.from === 'system') { prev = null; o.kind = m.failure || FAIL.test(m.text || '') ? 'failure' : 'sys'; }
    else {
      o.cont = !!(prev && prev.sub === m.sub && prev.from === m.from && prev.via === m.via && prev.pk === providerKey(m) && m.at - prev.at < 3e5 && !m.replyTo);
      prev = { sub: m.sub, from: m.from, via: m.via, at: m.at, auto: m.auto, pk: providerKey(m) };
    }
    if (m.from === 'auto') { o.kind = 'auto'; openAsk = m.auto === 'agree' ? null : it.id; }
    else if (m.askUser) openAsk = it.id;
    if (m.reviewBatch) o.kind = 'batch';
    else if (m.review || /:(?:review|vote)\d*$/.test(m.from)) {
      o.kind = 'judge';
      const lk = rows[rows.length - 1]?.kind;
      if ((m.review || /:review\d+$/.test(m.from)) && lk !== 'judge' && lk !== 'batch') {
        const round = m.review?.round || Number(/^Review \d+, round (\d+)/.exec(m.text || '')?.[1]) || null;
        rows.push({ id: it.id + 'c', kind: 'batch', inferred: true, m: { reviewBatch: { request: lastUser?.text, requestAt: lastUser?.at, round } }, live: it.live, delay: it.delay });
      }
    }
    if (m.from === 'user' && !m.viaAuto) lastUser = m;
    rows.push(o);
  }
  return { rows, openAsk };
}

// shared contract for the composer: chatWaitFor / chatBusy
function syncShared() {
  let wait = null;
  for (const it of S.items) {
    const m = it.m; if (!m) continue;
    if (m.from === 'user') wait = null; else if (m.askUser) wait = { id: it.id, opts: m.options?.length ? m.options : ['Approve', 'Reject'], from: m.from };
  }
  if (JSON.stringify(getState().chatWaitFor) !== JSON.stringify(wait)) setState({ chatWaitFor: wait });
  const busy = Object.keys(S.act).length > 0;
  if (getState().chatBusy !== busy) setState({ chatBusy: busy });
}

// ---- sessions ----
export async function openSession(id, show = true) {
  const t = ++tok;
  let msgs = [], info = null, sl = [];
  if (id) [info, msgs, sl] = await Promise.all([call('chat:info', id), call('chat:history', id), call('subagents:list', id)]);
  if (t !== tok) return; // another session was opened meanwhile
  liveN = 0;
  const batch = [];
  for (const m of msgs) addMsg(m, false, batch);
  const a = id ? (actBy[id] ||= {}) : {};
  patch({ sid: id || null, title: info ? info.title : '', loaded: true, items: batch, subs: sl, subsOpen: sl.length > 0 && !isPanelOpen(), reqs: info ? info.reqs || { items: [], idle: true } : null, ledger: !!info?.spend, spend: info?.spend ? JSON.parse(JSON.stringify(info.spend)) : {}, act: a, info, chips: null, unread: 0, epoch: S.epoch + 1 });
  setState({ sessionCwd: info?.project?.path || getState().sbTree?.projects?.find(p => p.id === info?.projectId)?.path || getState().cfg.cwd || '', openSid: id || null, chatReplying: null, chatSessionInfo: info, ...(show ? { tab: 'chat' } : {}) });
  syncShared();
  window.ActiveChat = { sid: S.sid, supercode: false, easyMode: !!info?.easyMode, chatModels: info?.chatModels || {}, chatEffort: info?.chatEffort || 'low' };
  window.dispatchEvent(new Event('active-chat'));
  window.Titlebar?.setTitle?.(info ? info.title : '');
  scrollLogToBottom();
  refreshChips();
}
export async function refreshChips() {
  const sid = S.sid;
  if (!sid) return patch({ chips: [] });
  const d = await call('skills:inUse', sid).catch(() => null);
  if (!d || sid !== S.sid) return;
  const by = new Map();
  for (const u of d.used || []) (by.get(u.name) || by.set(u.name, new Set()).get(u.name)).add(u.by);
  patch({ chips: [...by].map(([n, who]) => [n, [...who]]) });
}

// ---- subagents ----
export const setSubsOpen = (v) => { if (S.subsOpen !== v) patch({ subsOpen: v }); };

// ---- push events (registered once, at module load) ----
api.on('chat:msg', (m) => { if (m.sessionId === S.sid) addMsg(m, true); });
api.on('reqs:update', (d) => { if (d.sid === S.sid) patch({ reqs: d.reqs || null }); });
api.on('spend:update', (d) => { if (d.sid === S.sid) patch({ ledger: true, spend: JSON.parse(JSON.stringify(d.spend || {})) }); });
api.on('agent:status', (d) => {
  const a = actBy[d.sid] ||= {};
  if (d.status) a[d.who] = d; else delete a[d.who];
  if (d.sid === S.sid) { patch({ act: { ...a } }); syncShared(); }
});
api.on('agent:usage', () => {}); // totals arrive through spend:update
api.on('subagent:update', (d) => {
  if (d.sid !== S.sid) return;
  const i = S.subs.findIndex((x) => x.id === d.id), first = !S.subs.length, subs = [...S.subs];
  if (i < 0) subs.push(d); else subs[i] = d;
  patch({ subs, ...(first ? { subsOpen: true } : {}) });
});
api.on('subagent:removed', (d) => { if (d.sid === S.sid) patch({ subs: S.subs.filter((w) => w.id !== d.id) }); });
api.on('limits:state', (s) => { if (s?.down) patch({ limits: s.down }); });
api.on('skills:changed', (d) => { if (d.sid === S.sid) refreshChips(); });
api.on('notify:openSession', ({ sid }) => { if (sid) openSession(sid).catch((e) => console.error(e)); });
const procs = (list) => { const stoppable = !!list?.some(p => /\((chat|sub)\)$/.test(p.label)); if (stoppable !== S.stoppable) patch({ stoppable }); };
api.on('procs', procs);
api.on('sessions:changed', (d) => {
  if (d?.id !== S.sid) return;
  call('chat:info', S.sid).then((info) => {
    if (!info || S.sid !== d.id) return;
    patch({ title: info.title || '' });
    setState({ chatSessionInfo: info });
    window.Titlebar?.setTitle?.(info.title || '');
  }).catch(() => {});
});
call('limits:get').then((s) => s?.down && patch({ limits: s.down })).catch(() => {});
call('procs:list').then(procs).catch(() => {});
setInterval(() => call('procs:list').then(procs).catch(() => {}), 2000);
call('profile:get').then((p) => p && setState({ profile: p })).catch(() => {});
