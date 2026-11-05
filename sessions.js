// Projects + chat sessions store (main process). Projects = folders agents run in; sessions = chat threads in a project.
const fs = require('fs');
const path = require('path');
const os = require('os');

const ID = /^[\w-]+$/;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);

function createSessions({ dataDir, send = () => {} }) {
  const PROJ = path.join(dataDir, 'projects.json');
  const DIR = path.join(dataDir, 'sessions');
  const INDEX = path.join(DIR, 'index.json');
  const ACTIVE = path.join(dataDir, 'active-session.json');
  const MIGRATED = path.join(DIR, '.migrated');

  const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
  const write = (f, data) => { // atomic: tmp then rename, a crash never leaves half a file
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data));
    fs.renameSync(tmp, f);
  };
  const sfile = (id) => { if (!ID.test(String(id))) throw new Error('bad session id'); return path.join(DIR, id + '.json'); };

  let projects = read(PROJ, []);
  let index = read(INDEX, []); // [{ id, projectId, title, created, updated, unread, auto }]
  let active = read(ACTIVE, {}).id || null;
  if (active && !index.some((s) => s.id === active)) active = null;
  let migratedWorkflow = false;
  for (const m of index) if (typeof m.supercode !== 'boolean') { m.supercode = true; migratedWorkflow = true; }
  if (migratedWorkflow) write(INDEX, index);
  { // manual order: sessions carry `order` (ascending, new ones get min-1); seed old ones once from recency
    let seeded = false;
    for (const pid of new Set(index.filter((s) => typeof s.order !== 'number').map((s) => s.projectId)))
      index.filter((s) => s.projectId === pid).sort((a, b) => b.updated - a.updated).forEach((s, i) => { s.order = i; seeded = true; });
    if (seeded) { // first run only: freeze the project order users currently see (newest activity first)
      const last = (p) => Math.max(0, ...index.filter((s) => s.projectId === p.id).map((s) => s.updated));
      projects.sort((a, b) => last(b) - last(a)); write(PROJ, projects); write(INDEX, index);
    }
  }
  const cache = new Map(); // id -> full session (ponytail: unbounded, fine for a personal app; add an LRU if it grows)

  const saveProjects = () => write(PROJ, projects);
  const saveIndex = () => write(INDEX, index);
  const emit = (kind, id) => send('sessions:changed', { kind, id, active });
  const project = (id) => { const p = projects.find((x) => x.id === id); if (!p) throw new Error('unknown project'); return p; };
  const meta = (id) => { const s = index.find((x) => x.id === id); if (!s) throw new Error('unknown session'); return s; };
  const full = (id) => {
    const m = meta(id);
    if (!cache.has(id)) {
      const loaded=read(sfile(id), null) || { ...m, messages: [] };
      cache.set(id,loaded);
    }
    const session = cache.get(id);
    session.supercode ??= m.supercode ?? false;
    return session;
  };
  const persist = (s) => {
    const m = meta(s.id);
    m.title = s.title; m.updated = s.updated; m.unread = !!s.unread; m.auto = !!s.auto; m.supercode = !!s.supercode;
    write(sfile(s.id), s); saveIndex();
  };

  const listProjects = () => projects.map((p) => ({ ...p }));

  function addProject(p, name) {
    const abs = path.resolve(String(p || ''));
    let st; try { st = fs.statSync(abs); } catch { throw new Error('Folder does not exist: ' + abs); }
    if (!st.isDirectory()) throw new Error('Not a folder: ' + abs);
    const dup = projects.find((x) => norm(x.path) === norm(abs));
    if (dup) return { ...dup };
    const pr = { id: uid(), name: String(name || path.basename(abs) || abs).trim(), path: abs, collapsed: false };
    projects.push(pr); saveProjects(); emit('projects', pr.id);
    return { ...pr };
  }
  function renameProject(id, name) {
    const n = String(name || '').trim(); if (!n) return;
    project(id).name = n; saveProjects(); emit('projects', id);
  }
  function removeProject(id) { // entry + its session jsons only; the folder on disk is never touched
    project(id);
    for (const s of index.filter((x) => x.projectId === id)) { cache.delete(s.id); fs.rmSync(sfile(s.id), { force: true }); }
    index = index.filter((s) => s.projectId !== id);
    projects = projects.filter((p) => p.id !== id);
    if (active && !index.some((s) => s.id === active)) { active = null; write(ACTIVE, {}); }
    saveProjects(); saveIndex(); emit('projects', id);
  }
  function toggleProject(id) { const p = project(id); p.collapsed = !p.collapsed; saveProjects(); emit('projects', id); return p.collapsed; }

  const listSessions = (projectId) => index.filter((s) => !projectId || s.projectId === projectId).sort((a, b) => a.order - b.order).map((s) => ({ ...s }));

  function reorderProjects(ids) { // ids = full project id list in the new order; unknown ids dropped, missing ones keep their relative spot at the end
    if (!Array.isArray(ids)) throw new Error('bad ids');
    const by = new Map(projects.map((p) => [p.id, p]));
    const next = [...new Set(ids)].filter((i) => by.has(i)).map((i) => by.get(i));
    projects = [...next, ...projects.filter((p) => !next.includes(p))];
    saveProjects(); emit('projects');
  }
  function reorderSessions(projectId, ids) {
    project(projectId); if (!Array.isArray(ids)) throw new Error('bad ids');
    const mine = index.filter((s) => s.projectId === projectId);
    const seen = [...new Set(ids)].map((i) => mine.find((s) => s.id === i)).filter(Boolean);
    [...seen, ...mine.filter((s) => !seen.includes(s)).sort((a, b) => a.order - b.order)].forEach((s, i) => { s.order = i; });
    saveIndex(); emit('sessions');
  }

  function createSession(projectId, title) {
    project(projectId);
    const now = Date.now();
    const s = { id: uid(), projectId, title: String(title || '').trim() || 'New session', created: now, updated: now, messages: [], unread: false, auto: !title, supercode: false, easyMode: true };
    index.push({ id: s.id, projectId, order: Math.min(0, ...index.filter((x) => x.projectId === projectId).map((x) => x.order)) - 1, title: s.title, created: now, updated: now, unread: false, auto: s.auto, supercode: false, easyMode: true });
    cache.set(s.id, s); persist(s); emit('sessions', s.id);
    return { ...s };
  }
  function updateSession(id, patch) { const s = full(id); if (typeof patch.supercode === 'boolean') s.supercode = patch.supercode; if (patch.chatModels && typeof patch.chatModels === 'object') s.chatModels = { ...s.chatModels, ...patch.chatModels }; if (['low','medium','high'].includes(patch.chatEffort)) s.chatEffort = patch.chatEffort; if (patch.lead != null) s.lead = patch.lead; if (patch.subs) s.subs = patch.subs; if (patch.queuedMessages) s.queuedMessages = patch.queuedMessages; if (patch.mode) s.mode = patch.mode; if (patch.usedSkills) s.usedSkills = patch.usedSkills; if ('easyMode' in patch) s.easyMode = !!patch.easyMode; if ('legacyWorkflowCleaned' in patch) s.legacyWorkflowCleaned = patch.legacyWorkflowCleaned; if ('resume' in patch) s.resume = patch.resume; if ('reqs' in patch) s.reqs = patch.reqs; if ('easycode' in patch) s.easycode = patch.easycode; if ('easycodeArchive' in patch) s.easycodeArchive = patch.easycodeArchive; if ('doneAt' in patch) s.doneAt = patch.doneAt; if (Array.isArray(patch.memory)) s.memory = patch.memory; if (Array.isArray(patch.tasks)) s.tasks = patch.tasks; if (patch.cli) s.cli = patch.cli; if ('spreadLast' in patch) s.spreadLast = patch.spreadLast; if ('nativeCodeVersion' in patch) s.nativeCodeVersion = patch.nativeCodeVersion; if (patch.spend) s.spend = patch.spend; persist(s); emit('sessions', id); } // per-session lead agent
  function renameSession(id, title) {
    const t = String(title || '').trim(); if (!t) return;
    const s = full(id); s.title = t; s.auto = false; persist(s); emit('sessions', id);
  }
  function deleteSession(id) {
    const m = meta(id);
    index = index.filter((s) => s.id !== id); cache.delete(id);
    fs.rmSync(sfile(id), { force: true }); saveIndex();
    if (active === id) { active = listSessions(m.projectId)[0]?.id || null; write(ACTIVE, { id: active }); }
    emit('sessions', id);
    return active;
  }
  const getSession = (id) => full(id);
  function clearSession(id) { const s = full(id); s.messages = []; s.queuedMessages = []; s.cli = {}; s.doneAt = null; s.tasks = []; s.reqs = null; s.easycode = null; s.easycodeArchive = []; s.spend = null; s.unread = false; persist(s); emit('sessions', id); }

  function appendMessage(id, msg) {
    const s = full(id);
    s.messages.push(msg);
    if (s.auto && msg.from === 'user') {
      const t = String(msg.text || '').replace(/@(?:claude|codex)\b/gi, '').replace(/^(?:hey|hi|hello|please|can (?:you|u)|could (?:you|u)|i want (?:you )?to)\b[ ,:!]*/i, '').replace(/\s+/g, ' ').trim();
      const original = String(msg.text || '').replace(/\s+/g, ' ').trim();
      if (t || original || msg.attachments?.length) {
        const source = t || original || msg.attachments.map((a) => a.name || 'attachment').join(', ');
        const words = source.replace(/[?!.]+$/, '').split(' ').slice(0, 8).join(' ');
        s.title = (words[0].toUpperCase() + words.slice(1)).slice(0, 64) || 'New session';
        s.auto = false;
      }
    }
    s.updated = Date.now();
    if (id !== active && msg.from !== 'user') s.unread = true;
    persist(s); emit('sessions', id);
    return msg;
  }
  function markRead(id) { const s = full(id); if (!s.unread) return; s.unread = false; persist(s); emit('sessions', id); }
  function setActive(id) {
    if (id) meta(id);
    active = id || null; write(ACTIVE, { id: active });
    if (active) markRead(active);
    emit('active', active);
  }
  const getActive = () => active;

  function search(query) {
    const q = String(query || '').trim().toLowerCase(); if (!q) return [];
    const out = [];
    for (const m of listSessions()) {
      const pn = projects.find((p) => p.id === m.projectId)?.name || '';
      let snippet = '', hit = m.title.toLowerCase().includes(q);
      for (const msg of full(m.id).messages) {
        const t = String(msg.text || ''), i = t.toLowerCase().indexOf(q);
        if (i >= 0) { hit = true; const a = Math.max(0, i - 30); snippet = (a ? '…' : '') + t.slice(a, i + q.length + 50).replace(/\s+/g, ' '); break; }
      }
      if (hit) out.push({ sessionId: m.id, title: m.title, projectName: pn, snippet });
      if (out.length >= 50) break;
    }
    return out;
  }

  // First run: fold the old global chat.json into a "Global chat" session under the cwd's project. Idempotent.
  function migrateLegacyChat(chatFile, cwd) {
    if (fs.existsSync(MIGRATED)) return null;
    const msgs = read(chatFile, []);
    if (!Array.isArray(msgs) || !msgs.length) { write(MIGRATED, '1'); return null; }
    let dir = cwd; try { if (!fs.statSync(cwd).isDirectory()) throw 0; } catch { dir = os.homedir(); }
    const pr = projects.find((p) => norm(p.path) === norm(path.resolve(dir))) || (addProject(dir), projects.at(-1));
    const s = createSession(pr.id, 'Global chat');
    const f = full(s.id); f.messages = msgs; f.updated = msgs.at(-1).at || f.updated; persist(f);
    write(MIGRATED, '1');
    if (!active) setActive(s.id);
    return s.id;
  }

  return { listProjects, addProject, renameProject, removeProject, toggleProject, reorderProjects, reorderSessions, listSessions, createSession, renameSession, deleteSession, getSession, updateSession, clearSession, appendMessage, setActive, getActive, markRead, search, migrateLegacyChat };
}

function registerIpc(ipcMain, dialog, store) {
  const h = (ch, fn) => ipcMain.handle(ch, (_e, ...a) => fn(...a));
  h('sessions:tree', () => ({ projects: store.listProjects(), sessions: store.listSessions(), active: store.getActive() }));
  h('sessions:update', (id, patch) => store.updateSession(id, patch));
  h('projects:list', () => store.listProjects());
  h('projects:add', (p, name) => store.addProject(p, name));
  h('projects:pick', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return r.canceled || !r.filePaths[0] ? null : store.addProject(r.filePaths[0]);
  });
  h('projects:rename', (id, name) => store.renameProject(id, name));
  h('projects:remove', (id) => store.removeProject(id));
  h('projects:toggle', (id) => store.toggleProject(id));
  h('projects:reorder', (ids) => store.reorderProjects(ids));
  h('sessions:reorder', (pid, ids) => store.reorderSessions(pid, ids));
  h('sessions:list', (pid) => store.listSessions(pid));
  h('sessions:create', (pid, title) => store.createSession(pid, title));
  h('sessions:rename', (id, title) => store.renameSession(id, title));
  h('sessions:delete', (id) => store.deleteSession(id));
  h('sessions:clear', (id) => store.clearSession(id));
  h('sessions:get', (id) => store.getSession(id));
  h('sessions:setActive', (id) => store.setActive(id));
  h('sessions:getActive', () => store.getActive());
  h('sessions:markRead', (id) => store.markRead(id));
  h('sessions:search', (q) => store.search(q));
}

module.exports = { createSessions, registerIpc };
