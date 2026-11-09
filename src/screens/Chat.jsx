import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { call } from '../api.js';
import { useStore } from '../store.js';
import { layoutItems, scrollLogToBottom, setLogEl, setSubsOpen, useChat } from '../chat/chatStore.js';
import Message from '../chat/Message.jsx';
import Composer from '../chat/Composer.jsx';
import { Limits, Quota, ReplyChip, ReqBar, SkillChips, Typing } from '../chat/Bars.jsx';
import { SubsAside } from '../chat/Subs.jsx';
import Panels, { PanelButtons, closePanel } from '../chat/Panels.jsx';
import ConversationStart from '../components/ConversationStart.jsx';
import { Lightbox } from '../chat/lightbox.jsx';
import ScrollButton from '../chat/ScrollButton.jsx';
import { AnimatePresence, motion } from 'framer-motion';
import { ease, spring } from '../motion.js';
import '../styles/chatui.css';

export default function Chat() {
  const chat = useChat();
  const panel = useStore(s => s.pnMode);
  const log = useRef(null);
  const [drag, setDrag] = useState(false);
  const { rows, openAsk } = useMemo(() => layoutItems(chat.items), [chat.items]);
  useLayoutEffect(() => {
    setLogEl(log.current); if (chat.items.length) scrollLogToBottom(); else if (log.current) log.current.scrollTop = 0;
    if (chat.epoch > 1) log.current?.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
    return () => setLogEl(null);
  }, [chat.epoch]);
  useEffect(() => { // Composer toggles .drag on #chat while files are dragged over it
    const host = document.getElementById('chat'); if (!host) return;
    const mo = new MutationObserver(() => setDrag(host.classList.contains('drag')));
    mo.observe(host, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => { // queued messages live at the end of the log: keep following them when the reader is at the bottom
    const el = log.current, q = document.getElementById('logTail'); if (!el || !q) return;
    let near = true;
    const onScroll = () => { near = el.scrollHeight - el.scrollTop - el.clientHeight < 120; };
    const ro = new ResizeObserver(() => { if (near) scrollLogToBottom(); });
    el.addEventListener('scroll', onScroll, { passive: true }); ro.observe(q);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, []);
  useEffect(() => { if (panel) setSubsOpen(false); }, [panel]);
  return <>
    <div className="ch-head">
      <div className="conversation-title"><AnimatePresence initial={false} mode="popLayout"><motion.h2 id="chName" title={chat.title || 'New session'} key={chat.sid + '|' + chat.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease }}>{chat.title || 'New session'}</motion.h2></AnimatePresence></div>
      <SkillChips /><Quota />
      <button className="b ghost" id="quickBtn" aria-label="Open actions" onClick={() => window.dispatchEvent(new CustomEvent('relay:palette', { detail: 'commands' }))}>Actions</button>
      <PanelButtons />
      {!!chat.subs.length && <button className="b ghost" id="subsBtn" aria-expanded={chat.subsOpen} onClick={() => { closePanel(); setSubsOpen(!chat.subsOpen); }}>Subagents · {chat.subs.length}</button>}
      {chat.stoppable && <button className="b ghost danger" id="stop" onClick={() => call('chat:stop', chat.sid)}>Stop</button>}
    </div>
    <Limits />
    <div className="ch-body"><div className="ch-main">
      <div id="log" ref={log} role="log" aria-label="Conversation" aria-live="polite" tabIndex={0}>
        {!rows.length && <ConversationStart sid={chat.sid} />}
        <MessageRows rows={rows} openAsk={openAsk} />
        <div id="logTail"><Typing /><div id="logQueue" /></div>
      </div>
      <ScrollButton logRef={log} />
      <ReqBar /><ReplyChip /><Composer />
    </div><SubsAside /><Panels /></div>
    <AnimatePresence>{drag && (
      <motion.div id="drop" className="cu-drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
        <svg className="cu-drop-bd" aria-hidden="true"><rect x="10" y="10" width="calc(100% - 20px)" height="calc(100% - 20px)" rx="14" /></svg>
        <motion.div className="cu-drop-card" initial={{ scale: 0.88, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }} transition={spring}>
          <motion.svg className="i cu-drop-ic" viewBox="0 0 24 24" aria-hidden="true" animate={{ y: [0, -4, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}><path d="M12 16V4m-5 5 5-5 5 5M5 20h14" /></motion.svg>
          Drop files to attach to this chat
        </motion.div>
      </motion.div>)}</AnimatePresence>
    <Lightbox />
  </>;
}

const MessageRows = memo(function MessageRows({ rows, openAsk }) {
  return rows.map(row => <Message key={row.id} row={row} isOpen={row.id === openAsk} />);
});
