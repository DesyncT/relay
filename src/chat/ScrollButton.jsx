import { useEffect, useRef, useState } from 'react';
import { clearUnread, smoothScrollToBottom, useChat } from './chatStore.js';

export default function ScrollButton({ logRef }) {
  const unread=useChat(s=>s.unread);
  const [away,setAway]=useState(false);
  const update=useRef(()=>{});
  useEffect(()=>{
    const el=logRef.current;if(!el)return;
    const sync=update.current=()=>{
      const gap=el.scrollHeight-el.clientHeight-el.scrollTop;
      setAway(gap>80);if(gap<40)clearUnread();
    };
    const key=e=>{if(e.key==='End'&&e.target===el&&!e.ctrlKey&&!e.metaKey){e.preventDefault();smoothScrollToBottom();}};
    sync();el.addEventListener('scroll',sync,{passive:true});el.addEventListener('keydown',key);
    const ro=new ResizeObserver(sync);ro.observe(el);
    return()=>{el.removeEventListener('scroll',sync);el.removeEventListener('keydown',key);ro.disconnect();};
  },[logRef]);
  useEffect(()=>update.current(),[unread]);
  const label=unread?`${unread} new messages. Scroll to bottom`:'Scroll to bottom';
  return <div className="sb-anchor">{away&&<button id="scrollBottom" type="button" aria-label={label} title="Scroll to bottom (End)" onClick={()=>smoothScrollToBottom()}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-6-6 6 6 6-6" /></svg>
    {unread>0&&<span className="sb-count" aria-hidden="true">{unread>99?'99+':unread}</span>}
  </button>}</div>;
}
