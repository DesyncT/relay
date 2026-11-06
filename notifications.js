function canNotifyComplete({msg,busy=false,queued=false,cancelled=false}) {
  return !!msg && !busy && !queued && !cancelled && !msg.askUser && !msg.failure && !msg.progress && msg.from !== 'system';
}
function createAlerts({windows,Notification,badges,icon,playSound,openSession}) {
  let questionPending=false;
  function clear() {
    questionPending=false;
    for(const w of windows()) try {w.flashFrame(false);w.setOverlayIcon(null,'');} catch {}
  }
  function notify(kind,{sid,from,text}) {
    const who=from ? from.charAt(0).toUpperCase()+from.slice(1) : 'Agent';
    const question=kind==='question';
    if(question)questionPending=true;
    const title=question ? `${who} needs your input` : `${who} finished`;
    const body=String(text || (question?'Needs your input to continue':'Your response is ready')).replace(/\[ask-user[\s\S]*?\]/gi,'').trim().slice(0,180);
    try {playSound(kind);} catch {}
    const background=!windows().some(w=>!w.isDestroyed()&&w.isFocused());
    // Sounds always play; unread badges and desktop toasts are for background work.
    if(!background)return;
    for(const w of windows()) try {
      w.flashFrame(true);
      w.setOverlayIcon(badges[questionPending?'question':'complete'],questionPending?'Input needed':'Response ready');
    } catch {}
    try {
      if(Notification.isSupported()) {
        const toast=new Notification({title,body,icon,silent:true});
        toast.on('click',()=>{clear();openSession(sid);});toast.show();
      }
    } catch {}
  }
  return {notify,clear};
}
module.exports={createAlerts,canNotifyComplete};
