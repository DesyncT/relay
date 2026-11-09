import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

export default function Chat() {
  const chat = useChat();
  const panel = useStore(s => s.pnMode);
  const log = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const { rows, openAsk } = layoutItems(chat.items);
  useLayoutEffect(() => { setLogEl(log.current); if (chat.items.length) scrollLogToBottom(); else if (log.current) log.current.scrollTop = 0; return () => setLogEl(null); }, [chat.epoch]);
  useEffect(() => { if (panel) setSubsOpen(false); }, [panel]);
  return <>
    <div className="ch-head">
      <div className="conversation-title"><span className={Object.keys(chat.act).length ? "session-beacon working" : "session-beacon"} aria-hidden="true" /><h2 id="chName">{chat.title || 'New session'}</h2></div>
      <SkillChips /><Quota />
      <button className="b ghost" id="quickBtn" aria-label="Open actions" onClick={() => window.dispatchEvent(new CustomEvent('relay:palette', { detail: 'commands' }))}>Actions</button>
      <PanelButtons />
      {!!chat.subs.length && <button className="b ghost" id="subsBtn" aria-expanded={chat.subsOpen} onClick={() => { closePanel(); setSubsOpen(!chat.subsOpen); }}>Subagents · {chat.subs.length}</button>}
      {chat.stoppable && <button className="b ghost danger" id="stop" onClick={() => call('chat:stop', chat.sid)}>Stop</button>}
    </div>
    <Limits />
    <div className="ch-body"><div className="ch-main">
      <div id="log" ref={log} role="log" aria-label="Conversation" aria-live="polite" onScroll={() => { const el = log.current; setScrolled(el.scrollHeight - el.clientHeight - el.scrollTop > 80); }}>
        {!rows.length && <ConversationStart sid={chat.sid} />}
        {rows.map(row => <Message key={row.id} row={row} isOpen={row.id === openAsk} />)}
      </div>
      {scrolled && <button id="scrollBottom" aria-label="Scroll to bottom" onClick={scrollLogToBottom}><svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-6-6 6 6 6-6" /></svg></button>}
      <Typing /><ReqBar /><ReplyChip /><Composer />
    </div><SubsAside /><Panels /></div>
    <div id="drop">Drop files to attach to this chat</div>
    <Lightbox />
  </>;
}
