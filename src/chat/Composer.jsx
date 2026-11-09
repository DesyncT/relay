import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { call, useIpcEvent } from '../api.js';
import { getState, setState, useStore } from '../store.js';
import { spring, ease } from '../motion.js';
import { addSystemCard, registerSender } from './chatStore.js';
import { makeCmds } from './composer/commands.jsx';
import Queue from './composer/Queue.jsx';
import { Check, Chev, FileIcon, Ico, isImg, fileUrl, fsize, notify, Pop, ProvLogo, SpreaderIcon, Tween, XIcon } from './composer/ui.jsx';
import '../styles/composer.css';

const LEADS = [['claude', 'Claude'], ['codex', 'Codex'], ['antigravity', 'Antigravity'], ['spreader', 'Spreader']];
const MODES = [['edits', 'Full access', 'Agents can edit files and run commands'], ['auto', 'Auto', 'Full access; agents also resolve routine decisions'], ['super', 'Super Auto', 'Overnight: AI voters answer every question and the team wraps up on its own']];
const CHAT_MODELS = {
  claude: [['claude-haiku-5-5', 'Haiku 5.5'], ['claude-sonnet-5-5', 'Sonnet 5.5'], ['claude-opus-5-5', 'Opus 5.5'], ['claude-fable-5-1', 'Fable 5.1']],
  codex: [['gpt-6-luna', 'GPT-6 Luna'], ['gpt-6.1-sol', 'GPT-6.1 Sol'], ['gpt-6-astra', 'GPT-6 Astra']],
  antigravity: [['gemini-3.8-flash-high', 'Gemini 3.8 Flash (High)'], ['gemini-3.8-flash-medium', 'Gemini 3.8 Flash (Medium)'], ['gemini-3.8-flash-low', 'Gemini 3.8 Flash (Low)'], ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite']],
};
const bars = (n) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true" style={{ flex: 'none' }}>
    <rect x="2" y="10" width="3" height="4" rx="0.8" /><rect x="6.5" y="6" width="3" height="8" rx="0.8" opacity={n > 1 ? 1 : 0.28} /><rect x="11" y="2" width="3" height="12" rx="0.8" opacity={n > 2 ? 1 : 0.28} />
  </svg>
);
const EFFORTS = [['low', 'Low', 1], ['medium', 'Medium', 2], ['high', 'High', 3]];

// Unsent text/files and failed sends live in localStorage, keyed by session id (same keys as the legacy renderer).
const draftKey = (s) => 'relay.draft.' + s, filesKey = (s) => 'relay.draftFiles.' + s, recoveryKey = (s) => 'relay.unsent.' + s;
const readJson = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const loadDraft = (s) => { try { return (s && localStorage.getItem(draftKey(s))) || ''; } catch { return ''; } };
const loadDraftFiles = (s) => readJson(filesKey(s)).filter((f) => f && typeof f.path === 'string');
const failedDrafts = (s) => readJson(recoveryKey(s));
function saveDraft(sid, text, pend) {
  if (!sid) return;
  try {
    text.trim() ? localStorage.setItem(draftKey(sid), text) : localStorage.removeItem(draftKey(sid));
    pend.length ? localStorage.setItem(filesKey(sid), JSON.stringify(pend)) : localStorage.removeItem(filesKey(sid));
  } catch { /* storage full or blocked */ }
}
const b64 = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(f); });

export default function Composer() {
  const sid = useStore((s) => s.openSid), replying = useStore((s) => s.chatReplying), waitFor = useStore((s) => s.chatWaitFor);
  const busy = useStore((s) => s.chatBusy), cfg = useStore((s) => s.cfg);

  const [text, setText] = useState(() => loadDraft(sid)), [pend, setPend] = useState(() => loadDraftFiles(sid)), [uploads, setUploads] = useState(0);
  const [items, setItems] = useState([]), [qEdit, setQEdit] = useState(null), [failed, setFailed] = useState([]);
  const [queueBusy, setQueueBusy] = useState(true), [lightbox, setLightbox] = useState(null);
  const [info, setInfo] = useState({}), [conns, setConns] = useState([]), [leadSel, setLeadSel] = useState(null), [mode, setModeState] = useState('edits');
  const [menu, setMenu] = useState(null), [kb, setKb] = useState(false);
  const [slashSel, setSlashSel] = useState(0), [slashOff, setSlashOff] = useState(false), [skills, setSkills] = useState({ sid: null, list: [] });
  const [spend, setSpend] = useState({}), [running, setRunning] = useState({});
  const inputRef = useRef(null), fAny = useRef(null), fImg = useRef(null);
  const anchors = { lead: useRef(null), mode: useRef(null), model: useRef(null), effort: useRef(null) };

  // Latest values for async code and unmount handlers.
  const live = useRef({});
  live.current = { sid, text, pend, edit: qEdit, send: null };
  const focusInput = () => inputRef.current?.focus();

  // ---------- session switch: park the outgoing draft, load the incoming one ----------
  const loadInfo = useCallback((id, full) => call('chat:info', id).then((i) => {
    if (live.current.sid !== id) return;
    setInfo(i || {});
    if (full) {
      setLeadSel(i?.lead || getState().cfg.lead || 'claude'); setModeState(i?.mode || 'manual');
      if (i?.spend) setSpend(JSON.parse(JSON.stringify(i.spend)));
      else call('chat:history', id).then((msgs) => {
        const sum = {};
        for (const m of msgs || []) if (m.usage) { const a = sum[m.via || String(m.from).split(':')[0]] ||= { tokens: 0, cost: 0 }; a.tokens += m.usage.tokens; a.cost += m.usage.cost; }
        if (live.current.sid === id) setSpend(sum);
      }).catch(() => {});
    }
  }).catch(() => {}), []);
  const reloadInfo = useCallback(() => sid && loadInfo(sid, false), [sid, loadInfo]);

  useEffect(() => {
    setText(loadDraft(sid)); setPend(loadDraftFiles(sid)); setFailed(sid ? failedDrafts(sid) : []);
    setQEdit(null); setItems([]); setInfo({}); setSpend({}); setRunning({}); setMenu(null); setSlashOff(false);
    setState({ chatReplying: null });
    let dead = false;
    if (sid) { loadInfo(sid, true); call('chat:queue', sid).then((q) => { if (!dead && live.current.sid === sid) setItems(q || []); }).catch(() => {}); }
    return () => {
      dead = true;
      const L = live.current; // an open queue edit is cancelled first, so the real draft is what gets parked
      saveDraft(sid, L.edit ? L.edit.draft : L.text, L.edit ? L.edit.files : L.pend);
    };
  }, [sid, loadInfo]);

  // Draft autosave: immediately on attachment changes, debounced 750ms for typing, and on window close.
  useEffect(() => { if (sid && !qEdit) saveDraft(sid, live.current.text, pend); }, [pend]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sid || qEdit) return;
    const t = setTimeout(() => saveDraft(sid, text, live.current.pend), 750);
    return () => clearTimeout(t);
  }, [text, sid, !!qEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = () => { const L = live.current; if (L.sid && !L.edit) saveDraft(L.sid, L.text, L.pend); };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, []);

  useEffect(() => {
    const compose = e => {
      // Starter actions fill only an empty draft; existing work always wins.
      if (!live.current.text.trim() && !live.current.edit) setText(String(e.detail || ''));
      focusInput();
    };
    window.addEventListener('relay:compose', compose);
    return () => window.removeEventListener('relay:compose', compose);
  }, []);

  // ---------- settings, connections, push events ----------
  const refreshCfg = useCallback(() => call('settings:get').then((s) => { setState({ cfg: s }); }).catch(() => {}), []);
  useEffect(() => { refreshCfg(); call('models:list').then((c) => setConns(c || [])).catch(() => {}); }, [refreshCfg]);
  useIpcEvent('chat:queue', (d) => { if (d.sid === sid) setItems(d.items || []); });
  useIpcEvent('chat:mode', (d) => { if (d.sid === sid) setModeState(MODES.some((m) => m[0] === d.mode) ? d.mode : 'edits'); });
  useIpcEvent('spend:update', (d) => { if (d.sid === sid) setSpend(JSON.parse(JSON.stringify(d.spend || {}))); });
  useIpcEvent('agent:status', (d) => { if (d.sid === sid) setRunning((r) => { const n = { ...r }; if (d.status) n[d.who] = 1; else delete n[d.who]; return n; }); });
  useIpcEvent('sessions:changed', () => reloadInfo());
  useIpcEvent('workflow:changed', (d) => {
    if (d.sid !== sid) return;
    setInfo((i) => ({ ...i, easyMode: d.easyMode })); if (d.lead) setLeadSel(d.lead);
  });
  useEffect(() => { if (qEdit && !qEdit.saving && !items.some((i) => i.id === qEdit.id)) finishEdit(); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- lead / mode / model derived state ----------
  const disabled = cfg.disabledProviders || [];
  const availLeads = LEADS.filter(([k]) => !disabled.includes(k) && (k !== 'spreader' || info.easyMode));
  let lead = leadSel || availLeads[0]?.[0] || 'claude';
  if (lead === 'random') lead = 'spreader';
  if (!availLeads.some(([k]) => k === lead)) lead = 'codex';
  if (disabled.includes(lead)) lead = availLeads[0]?.[0] || 'claude';
  const leadName = (LEADS.find(([k]) => k === lead) || LEADS[0])[1];
  const provider = lead === 'codex' || lead === 'antigravity' ? lead : 'claude';
  const showPickers = !!sid && lead !== 'spreader';
  const defaultModel = cfg.routes?.[provider]?.coding?.model || (provider === 'codex' ? 'gpt-6.1-sol' : provider === 'antigravity' ? 'gemini-3.8-flash-low' : 'claude-sonnet-5-5');
  const modelOpts = [...(CHAT_MODELS[provider] || CHAT_MODELS.claude), ...conns.flatMap((c) => [['', c.name, 1], ...c.models.map((m) => ['conn:' + c.id + '/' + m, m])])];
  const selModel = info.chatModels?.[provider] || defaultModel;
  const modelLabel = (modelOpts.find(([v]) => v && v === selModel) || modelOpts[0] || [selModel, selModel])[1];
  const effVal = info.chatEffort || 'low', effLabel = (EFFORTS.find(([v]) => v === effVal) || EFFORTS[0])[1];
  const modeRow = MODES.find((m) => m[0] === mode) || MODES[0];

  function setLead(k) {
    setLeadSel(k); setState({ cfg: { ...getState().cfg, lead: k } });
    call('settings:save', { lead: k }); if (live.current.sid) call('sessions:update', live.current.sid, { lead: k });
  }
  function pickMode(k) {
    if (!sid) return;
    setModeState(MODES.some((m) => m[0] === k) ? k : 'edits'); call('chat:mode', sid, k); setMenu(null); focusInput();
  }
  const pickModel = (val) => { const models = { ...info.chatModels, [provider]: val }; setInfo({ ...info, chatModels: models }); setMenu(null); focusInput(); call('sessions:update', sid, { chatModels: models }); };
  const pickEffort = (val) => { setInfo({ ...info, chatEffort: val }); setMenu(null); focusInput(); call('sessions:update', sid, { chatEffort: val }); };

  const toggle = (name) => (e) => { setKb(e.detail === 0); setMenu((m) => (m === name ? null : name)); };
  useEffect(() => {
    if (!menu) return;
    const down = (e) => { if (!e.target.closest(`[data-menu="${menu}"]`)) setMenu(null); };
    const key = (e) => {
      if (e.key === 'Escape') { setMenu(null); anchors[menu].current?.focus(); }
      else if (menu === 'mode' && /^[1-3]$/.test(e.key) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); pickMode(MODES[+e.key - 1][0]); }
    };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [menu, sid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- slash commands ----------
  const CMDS = makeCmds({ sid, spend, leads: LEADS.map((l) => l[0]), modes: MODES, setLead, pickMode, refreshCfg, reloadInfo });
  const slashM = /^\/([\w-]*)$/.exec(text);
  useEffect(() => {
    if (!slashM || skills.sid === sid) return;
    let dead = false;
    call('skills:list', sid).then((l) => l.filter((n) => !CMDS.some((c) => c.n === n)).map((n) => ({ n, a: '<task>', d: 'Skill', skill: true })))
      .catch(() => []).then((list) => { if (!dead) setSkills({ sid, list }); });
    return () => { dead = true; };
  }, [!!slashM, sid]); // eslint-disable-line react-hooks/exhaustive-deps
  const skillCmds = skills.sid === sid ? skills.list : [];
  const slashList = useMemo(() => (slashM ? [...CMDS, ...skillCmds].filter((c) => c.n.toLowerCase().startsWith(slashM[1].toLowerCase())) : []), [text, skillCmds]); // eslint-disable-line react-hooks/exhaustive-deps
  const slashOpen = !!slashM && !slashOff && slashList.length > 0 && !qEdit;
  const sel = Math.min(slashSel, slashList.length - 1);
  const skillOf = (t) => { const m = /^\/([\w-]+)\s*([\s\S]*)$/.exec(t), c = m && skillCmds.find((x) => x.n === m[1]); return c ? `Use the ${c.n} skill.${m[2].trim() ? ' ' + m[2].trim() : ''}` : null; };
  function runSlash(t) {
    const m = /^\/(\w+)\s*([\s\S]*)$/.exec(t), c = CMDS.find((x) => x.n === m[1].toLowerCase());
    if (!c) return addSystemCard(<div>{`Unknown command /${m[1]}. Try /help`}</div>);
    if (!sid) return addSystemCard(<div>Open a session first.</div>);
    return c.run(m[2].trim());
  }
  function pickSlash(i, run) { // Enter runs a no-argument command; Tab / click / a command with arguments only fills it in
    const c = slashList[i]; if (!c) return;
    const v = '/' + c.n + (run && !c.a ? '' : ' ');
    setText(v); setSlashOff(true); focusInput();
    if (run && !c.a) sendChat(null, false, v);
  }

  // ---------- attachments ----------
  async function addFiles(files) {
    if (live.current.edit?.saving) return;
    const startSid = live.current.sid, startEdit = live.current.edit;
    setUploads((n) => n + 1);
    try {
      for (const f of files) {
        try {
          if (f.size > 25e6) throw new Error(`${f.name} is over the 25 MB limit`);
          const attached = await call('chat:attach', f.name, await b64(f));
          const L = live.current;
          if (L.sid !== startSid || L.edit !== startEdit) { // the user moved on: keep the file with its original draft
            const stored = L.sid === startSid && L.edit ? L.edit.files : loadDraftFiles(startSid);
            stored.push(attached); try { localStorage.setItem(filesKey(startSid), JSON.stringify(stored)); } catch { /* full */ }
            notify('Attachment saved with its original chat draft.'); continue;
          }
          setPend((p) => [...p, attached]);
        } catch (e) { notify(e.message); }
      }
    } finally { setUploads((n) => n - 1); }
  }
  useEffect(() => {
    const h = async (e) => { try { const a = await call('chat:attach', e.detail.name, e.detail.b64); setPend((p) => [...p, a]); } catch { /* ignore */ } };
    document.addEventListener('panels:attach', h); return () => document.removeEventListener('panels:attach', h);
  }, []);
  useEffect(() => { // drop files anywhere on the chat section
    const chat = document.getElementById('chat'); if (!chat) return;
    let n = 0;
    const enter = (e) => { e.preventDefault(); n++; chat.classList.add('drag'); }, over = (e) => e.preventDefault();
    const leave = () => { if (!--n) chat.classList.remove('drag'); };
    const drop = (e) => { e.preventDefault(); n = 0; chat.classList.remove('drag'); addFiles([...e.dataTransfer.files]); };
    chat.addEventListener('dragenter', enter); chat.addEventListener('dragover', over); chat.addEventListener('dragleave', leave); chat.addEventListener('drop', drop);
    return () => { chat.removeEventListener('dragenter', enter); chat.removeEventListener('dragover', over); chat.removeEventListener('dragleave', leave); chat.removeEventListener('drop', drop); chat.classList.remove('drag'); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onPaste = (e) => {
    const fs = [...e.clipboardData.files];
    if (fs.length) { e.preventDefault(); addFiles(fs.map((f) => (f.name === 'image.png' ? new File([f], `pasted-${Date.now()}.png`, { type: f.type }) : f))); }
  };

  // ---------- queue editing ----------
  function finishEdit() {
    const edit = live.current.edit; if (!edit || edit.saving) return;
    setText(edit.draft); setPend(edit.files); setQEdit(null); focusInput();
  }
  function beginEdit(item) {
    if (qEdit?.saving) return;
    if (qEdit) finishEdit();
    const L = live.current;
    saveDraft(sid, qEdit ? qEdit.draft : L.text, qEdit ? qEdit.files : L.pend);
    setQEdit({ sid, id: item.id, draft: qEdit ? qEdit.draft : L.text, files: qEdit ? qEdit.files : L.pend, saving: false });
    setPend([...(item.files || [])]); setText(item.text || ''); setSlashOff(true);
    setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0);
  }
  async function saveEdit() {
    const edit = qEdit; if (!edit || edit.saving || uploads || (!text.trim() && !pend.length)) return;
    setQEdit({ ...edit, saving: true }); live.current.edit = { ...edit, saving: true };
    try {
      const saved = await call('chat:queue-edit', edit.sid, edit.id, text, pend);
      if (!saved) throw new Error('This message is no longer queued.');
      live.current.edit = { ...edit, saving: false };
      setText(edit.draft); setPend(edit.files); setQEdit(null); focusInput();
    } catch (e) {
      setQEdit((q) => q && { ...q, saving: false });
      if (live.current.sid === edit.sid) addSystemCard(<div>{`Could not edit queued message: ${e.message}`}</div>);
    }
  }

  // ---------- sending ----------
  async function sendChat(pick, interrupt = false, override) { // pick: an option button's label, sent as-is without touching the draft
    if (qEdit && pick == null) return saveEdit();
    if (uploads) return notify('Wait for your attachments to finish uploading.');
    const raw = pick ?? override ?? text;
    let t = pick ?? raw.trim();
    const skillMsg = pick == null ? skillOf(t) : null; if (skillMsg) t = skillMsg; // /skill-name <task> goes to the agent
    if (!t && !pend.length) return;
    if (!skillMsg && pick == null && !pend.length && /^\/[a-z]+(\s|$)/i.test(t)) { setText(''); setSlashOff(true); return runSlash(t); }
    if (!sid) return;
    const reply = pick ? null : replying, files = pick ? [] : pend;
    if (!pick) {
      setText(''); setPend([]);
      try { localStorage.removeItem(draftKey(sid)); localStorage.removeItem(filesKey(sid)); } catch { /* ignore */ }
    }
    setState({ chatReplying: null, chatWaitFor: null });
    try {
      await call(interrupt ? 'chat:interrupt-send' : 'chat:send', sid, t, files, { reply: reply && { from: reply.from, at: reply.at }, queue: queueBusy });
    } catch (e) {
      try { localStorage.setItem(recoveryKey(sid), JSON.stringify([...failedDrafts(sid), { text: raw, files }])); } catch { /* full */ }
      if (live.current.sid === sid) {
        setFailed(failedDrafts(sid));
        addSystemCard(<div>{'Message was not sent. Your text and attachments are saved. ' + String(e.message).replace(/^.*Error: /, '')}</div>);
      } else notify('A message could not be sent. It is saved in its original chat.');
    }
  }
  live.current.send = sendChat;
  useEffect(() => {
    const off = registerSender((pick) => live.current.send(pick));
    return typeof off === 'function' ? off : undefined;
  }, []);

  function restore() {
    if (qEdit) return notify('Finish editing the queued message first.');
    const rows = failedDrafts(sid), draft = rows.shift(); if (!draft) return;
    setText([text, draft.text].filter(Boolean).join('\n\n'));
    setPend((p) => [...p, ...(draft.files || []).filter((f) => !p.some((x) => x.path === f.path))]);
    try { rows.length ? localStorage.setItem(recoveryKey(sid), JSON.stringify(rows)) : localStorage.removeItem(recoveryKey(sid)); } catch { /* ignore */ }
    setFailed(rows); focusInput();
  }

  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (qEdit && e.key === 'Escape') { e.preventDefault(); finishEdit(); return; }
    if (slashOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setSlashSel((sel + (e.key === 'ArrowDown' ? 1 : -1) + slashList.length) % slashList.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSlash(sel, e.key === 'Enter'); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlashOff(true); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  };
  useEffect(() => { document.getElementById('slashSel')?.scrollIntoView({ block: 'nearest' }); }, [sel, slashOpen]);

  // ---------- render ----------
  const sendDisabled = !!uploads || (!text.trim() && !pend.length);
  const label = qEdit ? 'Edit queued message' : waitFor ? 'Type your answer' : 'Message ' + (info.title || 'Relay');
  const placeholder = qEdit ? '' : (waitFor ? 'Type your answer' : label + '  ·  / for commands');
  const spendKeys = ['claude', 'codex', 'antigravity', 'auto'].filter((k) => spend[k] || Object.keys(running).some((w) => w.split(':')[0] === k));
  const sending = busy && queueBusy;

  return (
    <>
      <Queue items={items} sid={sid} onEdit={beginEdit} onOpen={(src, name) => setLightbox({ src, name })}
        onError={(m) => addSystemCard(<div>{m}</div>)} />
      <div className={'cbar' + (qEdit ? ' editing-queue' : '')}>
        <div id="spend" aria-label="Current chat session usage totals">
          {spendKeys.length > 0 && <span className="spend-caption">This chat ·</span>}
          {spendKeys.flatMap((k, i) => {
            const a = spend[k] || { tokens: 0, cost: 0, input: 0, output: 0, cached: 0, model: '' };
            const ft = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n || 0));
            const tip = `This chat only, across all turns. ${k === 'claude' ? 'Cost reported by the CLI.' : 'Cost estimated from configured API rates.'} Not lifetime account spend or a subscription bill.\n${a.model || k}\ninput ${ft(a.input)} · output ${ft(a.output)} · cached ${ft(a.cached)}${a.cost > 0 ? `\nest. cost $${a.cost < 0.1 ? a.cost.toFixed(3) : a.cost.toFixed(2)}` : ''}`;
            const run = Object.keys(running).some((w) => w.split(':')[0] === k);
            return [
              ...(i ? [<span key={'d' + k}>·</span>] : []),
              <span key={k} className="sp" data-k={k} title={tip}>
                {k === 'auto' ? <Ico><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></Ico> : <ProvLogo k={k} />}
                <b>{k}</b><Tween tokens={a.tokens || 0} cost={a.cost || 0} />{run && 'running'}
              </span>,
            ];
          })}
        </div>

        <AnimatePresence>
          {slashOpen && (
            <Pop key="slash" id="slash" name="slash" role="listbox" label="Commands" origin="bottom left">
              {slashList.map((c, i) => (
                <button key={c.n} id={i === sel ? 'slashSel' : undefined} className={'mi' + (i === sel ? ' on' : '')} tabIndex={-1} role="option" aria-selected={i === sel}
                  onMouseDown={(e) => { e.preventDefault(); pickSlash(i, false); }}>
                  {i === sel && <motion.span layoutId="slashHi" className="slash-hi" transition={spring} />}
                  <span>{'/' + c.n}</span><span className="d">{(c.a ? c.a + ' · ' : '') + c.d}</span>
                </button>
              ))}
            </Pop>
          )}
          {menu === 'model' && showPickers && (
            <Pop key="model" id="normalModelMenu" name="model" anchorRef={anchors.model} kb={kb}>
              {modelOpts.map(([val, lab, hdr], i) => hdr
                ? <div key={'h' + i} className="mi-hdr">{lab}</div>
                : <button key={val} className="mi" role="menuitemradio" aria-checked={val === selModel} onClick={() => pickModel(val)}>
                  <ProvLogo k={provider} /><span>{lab}</span>{val === selModel && <Check />}
                </button>)}
            </Pop>
          )}
          {menu === 'effort' && showPickers && (
            <Pop key="effort" id="normalEffortMenu" name="effort" anchorRef={anchors.effort} kb={kb}>
              {EFFORTS.map(([val, lab, n]) => (
                <button key={val} className="mi" role="menuitemradio" aria-checked={val === effVal} onClick={() => pickEffort(val)}>
                  {bars(n)}<span>{lab}</span>{val === effVal && <Check />}
                </button>
              ))}
            </Pop>
          )}
          {menu === 'lead' && (
            <Pop key="lead" id="leadMenu" name="lead" kb={kb}>
              {availLeads.map(([k, n]) => (
                <button key={k} className="mi" role="menuitemradio" aria-checked={k === lead} onClick={() => { setLead(k); setMenu(null); focusInput(); }}>
                  {k === 'spreader' ? <SpreaderIcon /> : <ProvLogo k={k} />}{n}{k === lead && <Check />}
                </button>
              ))}
            </Pop>
          )}
          {menu === 'mode' && (
            <Pop key="mode" id="modeMenu" name="mode" role="dialog" label="Mode" kb={kb} origin="bottom left">
              {MODES.map(([k, n, d]) => (
                <button key={k} type="button" className="mi mm" role="menuitemradio" aria-checked={k === mode} onClick={() => pickMode(k)}>
                  <span className="mm-t"><b>{n}</b><span>{d}</span></span>
                </button>
              ))}
            </Pop>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {qEdit && (
            <motion.div key="qe" id="queueEditBar" style={{ overflow: 'hidden' }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto', transition: { duration: 0.22, ease } }} exit={{ opacity: 0, height: 0, transition: { duration: 0.16 } }}>
              <span>Editing queued message</span>
              <button type="button" id="cancelQueueEdit" disabled={qEdit.saving} onClick={finishEdit}>Cancel</button>
              <button type="button" id="saveQueueEdit" disabled={qEdit.saving || !!uploads || (!text.trim() && !pend.length)} onClick={saveEdit}>Save changes</button>
            </motion.div>
          )}
          {failed.length > 0 && (
            <motion.div key="rec" id="sendRecovery" role="status" style={{ overflow: 'hidden' }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto', transition: { duration: 0.24, ease } }} exit={{ opacity: 0, height: 0, transition: { duration: 0.16 } }}>
              <span>{failed.length > 1 ? `${failed.length} messages were not sent` : 'A message was not sent'}</span>
              <button type="button" onClick={restore}>Restore unsent message</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="composer-entry">
        <textarea id="input" ref={inputRef} rows={1} spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
          value={text} placeholder={placeholder} aria-label={label}
          onChange={(e) => { setText(e.target.value); setSlashSel(0); setSlashOff(false); }} onKeyDown={onKeyDown} onPaste={onPaste} />

        <div id="pend">
          <AnimatePresence initial={false} mode="popLayout">
            {pend.map((a, i) => (
              <motion.div key={a.path || a.name + i} layout className={'tile' + (isImg(a) ? ' img' : '')}
                initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1, transition: spring }} exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.12 } }}>
                {isImg(a)
                  ? <img src={fileUrl(a.path)} alt={a.name} onClick={(e) => setLightbox({ src: e.currentTarget.src, name: a.name })} />
                  : <><span><FileIcon /></span><div><div className="fn">{a.name}</div><div className="fs">{fsize(a.size)}</div></div></>}
                <button className="x" title="Remove" aria-label={'Remove ' + a.name} onClick={() => setPend((p) => p.filter((_, j) => j !== i))}><XIcon /></button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        </div>
        <div className="cb-tools">
          <button className="plus" id="plus" aria-label="Upload a file" onClick={() => fAny.current.click()}><Ico><path d="M12 5v14M5 12h14" /></Ico></button>
          <button className="chip" id="modeChip" ref={anchors.mode} data-menu="mode" aria-haspopup="dialog" aria-expanded={menu === 'mode'} title="Filesystem and network access are always enabled" onClick={toggle('mode')}>{modeRow[1]}</button>
          <label className="queue-toggle"><input type="checkbox" id="queueBusy" checked={queueBusy} onChange={(e) => setQueueBusy(e.target.checked)} />Queue while busy</label>
          <span className="grow" />
          {showPickers && (
            <>
              <button type="button" className="pick normal-model" id="normalModel" ref={anchors.model} data-menu="model" aria-haspopup="menu" aria-expanded={menu === 'model'} title="Chat model" data-value={selModel} onClick={toggle('model')}><span>{modelLabel}</span><Chev /></button>
              <button type="button" className="pick normal-model" id="normalEffort" ref={anchors.effort} data-menu="effort" aria-haspopup="menu" aria-expanded={menu === 'effort'} title="Reasoning effort" data-value={effVal} onClick={toggle('effort')}><span>{effLabel}</span><Chev /></button>
            </>
          )}
          <button className="pick" id="leadPick" ref={anchors.lead} data-menu="lead" data-provider={lead} aria-haspopup="menu" aria-expanded={menu === 'lead'} title="Who answers first" onClick={toggle('lead')}>
            <span className="lead-mark">{lead === 'spreader' ? <SpreaderIcon /> : <ProvLogo k={lead} />}</span><span>{leadName}</span><Chev />
          </button>
          <button className="ib" id="imgBtn" aria-label="Attach an image" onClick={() => fImg.current.click()}>
            <Ico><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" /></Ico>
          </button>
          <motion.button className="send" id="send" aria-label={sending ? 'Queue message' : 'Send'} title={sending ? 'Agents are busy: this message will be queued' : 'Send'} disabled={sendDisabled}
            animate={{ scale: sendDisabled ? 0.9 : 1 }} whileTap={sendDisabled ? undefined : { scale: 0.88 }} transition={spring} onClick={() => sendChat()}>
            <Ico><path d="M12 19V5M5 12l7-7 7 7" /></Ico>
          </motion.button>
        </div>
        <div className="composer-help"><span>Enter to send · Shift+Enter for a new line</span><span>Paste or drop images</span></div>
        <input type="file" id="fAny" ref={fAny} multiple onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
        <input type="file" id="fImg" ref={fImg} accept="image/*" multiple onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
      </div>
      {createPortal(
        <AnimatePresence>
          {lightbox && <Lightbox key="lb" {...lightbox} onClose={() => setLightbox(null)} />}
        </AnimatePresence>, document.body)}
    </>
  );
}

// Full-size image view: click or Esc closes.
function Lightbox({ src, name, onClose }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <motion.div className="lb" role="dialog" aria-label={name || 'Image'} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
      <motion.img src={src} alt={name || ''} initial={{ scale: 0.94 }} animate={{ scale: 1, transition: spring }} />
    </motion.div>
  );
}
