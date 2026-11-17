'use strict';
// One disposable project per borrowed turn. Uses the shared-folder path/secret filters,
// but never opens a shared chat or watches the lender's own project folders.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { createSync, safeRel, absOf, hash, LIM } = require('./cowork-fs');
function createWorkspaces({ dir, send, cancel = () => {}, onFinish = () => {}, onError = () => {} }) {
  const outgoing = new Map(), incoming = new Map();
  const valid = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
  const discard = entry => { entry.sync.close(); fs.rmSync(entry.root, { recursive: true, force: true }); incoming.delete(entry.id); };
  const stopIncoming = entry => {
    entry.runCancelled = true; cancel(entry.id);
    if (!entry.runBusy) discard(entry);
  };
  function finish(id, notify = true) {
    const entry = outgoing.get(id); if (!entry) return;
    outgoing.delete(id); entry.sync.close();
    if (notify) try { send({ t: 'work-end', wid: id }); } catch {}
    onFinish({ sid: entry.sid, author: entry.author, id, entries: [...entry.entries.values()], conflicts: [...entry.conflicts.values()] });
    return { error: entry.error };
  }
  function applyReturned(entry, frame) {
    if (frame.error) throw new Error(String(frame.error));
    const puts = [], dels = [];
    const accept = (rel, after) => {
      let current = null;
      try { current = hash(fs.readFileSync(absOf(entry.root, rel))); } catch {}
      const expected = entry.sync.known.get(rel) || null;
      if (current === expected || current === after) return true;
      if (!entry.conflictRoot) {
        const conflictDir = path.join(dir, 'conflicts'); fs.mkdirSync(conflictDir, { recursive: true });
        entry.conflictRoot = fs.mkdtempSync(path.join(conflictDir, 'turn-'));
      }
      return false;
    };
    for (const file of Array.isArray(frame.puts) ? frame.puts : []) {
      const rel = safeRel(file?.p); if (!rel || typeof file.d !== 'string') continue;
      const buffer = Buffer.from(file.d, 'base64'); if (buffer.length > LIM.file || hash(buffer) !== file.h) continue;
      if (accept(rel, file.h)) puts.push(file);
      else {
        fs.mkdirSync(path.dirname(path.join(entry.conflictRoot, rel)), { recursive: true });
        const dest = absOf(entry.conflictRoot, rel); fs.writeFileSync(dest, buffer);
        entry.conflicts.set(rel, { rel, path: dest });
      }
    }
    for (const value of Array.isArray(frame.dels) ? frame.dels : []) {
      const rel = safeRel(value); if (!rel) continue;
      if (accept(rel, null)) dels.push(rel); else entry.conflicts.set(rel, { rel, deleted: true });
    }
    for (const change of entry.sync.apply({ puts, dels })) {
      const previous = entry.entries.get(change.rel);
      entry.entries.set(change.rel, previous ? { ...previous, after: change.after } : change);
    }
  }
  return {
    start({ root, sid, author }) {
      const id = crypto.randomBytes(16).toString('hex');
      const sync = createSync({ root, send: frame => send({ t: 'work-fs', wid: id, frame }) });
      const entry = { id, root, sid, author, sync, entries: new Map(), conflicts: new Map() }; outgoing.set(id, entry);
      try { send({ t: 'work-open', wid: id }); sync.snapshot(); return id; }
      catch (error) { finish(id); throw error; }
    },
    incoming: id => incoming.get(id),
    conflicts: id => [...(outgoing.get(id)?.conflicts.values() || [])],
    finish,
    completeIncoming(id) {
      const entry = incoming.get(id); if (!entry) return;
      if (!entry.runCancelled) entry.sync.flush();
      entry.runBusy = false;
      if (entry.runCancelled) discard(entry);
    },
    cancel(id) { const entry = incoming.get(id); if (!entry) return false; stopIncoming(entry); return true; },
    disconnect() {
      for (const id of [...outgoing.keys()]) finish(id, false);
      for (const entry of [...incoming.values()]) stopIncoming(entry);
    },
    message(message) {
      if (!['work-open', 'work-fs', 'work-end', 'work-error'].includes(message?.t)) return false;
      const id = message.wid; if (!valid(id)) return true;
      try {
        if (message.t === 'work-error') {
          const entry = outgoing.get(id); if (entry) entry.error = String(message.error || 'Transfer failed').slice(0, 500);
        } else if (message.t === 'work-open') {
          if (incoming.has(id) || incoming.size >= 3) return true;
          fs.mkdirSync(dir, { recursive: true });
          const root = fs.mkdtempSync(path.join(dir, 'turn-'));
          incoming.set(id, { id, root, bytes: 0, count: 0, ready: false, sync: createSync({ root, allowSnap: true, send: frame => send({ t: 'work-fs', wid: id, frame }) }) });
        } else if (message.t === 'work-end') {
          const entry = incoming.get(id); if (entry) stopIncoming(entry);
        } else {
          const frame = message.frame; if (!frame || typeof frame !== 'object') return true;
          const local = outgoing.get(id), remote = incoming.get(id);
          if (local) applyReturned(local, frame);
          else if (remote && !remote.ready && !remote.error && !remote.runBusy && !remote.runCancelled) {
            const files = Array.isArray(frame.puts) ? frame.puts : [];
            remote.count += files.length;
            remote.bytes += files.reduce((total, file) => total + (typeof file?.d === 'string' ? Buffer.byteLength(file.d, 'base64') : 0), 0);
            if (remote.count > LIM.files || remote.bytes > LIM.total) throw new Error('Project copy exceeds the co-work transfer limits.');
            remote.sync.apply(frame); if (frame.snapEnd) remote.ready = true;
          }
        }
      } catch (error) {
        const local = outgoing.get(id), remote = incoming.get(id);
        if (local) local.error = error.message;
        if (remote) { remote.error = error.message; remote.ready = false; }
        try { send({ t: 'work-error', wid: id, error: error.message }); } catch {}
        onError(error);
      }
      return true;
    },
  };
}
module.exports = { createWorkspaces };
