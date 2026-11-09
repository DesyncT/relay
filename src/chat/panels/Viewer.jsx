import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call, useIpcEvent } from '../../api.js';
import { setState, useStore } from '../../store.js';
import { pop } from '../../motion.js';
import { openFile } from '../panelsApi.js';
import { Bar, Btn, Icon, CodeView, OtherCard } from './ui.jsx';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// minimal markdown; escapes first, so the produced html only contains tags emitted here
function md(src) {
  const inl = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  const out = []; let list = null, code = null, para = [];
  const flush = () => { if (para.length) out.push('<p>' + inl(para.join(' ')) + '</p>'); para = []; };
  const endList = () => { if (list) out.push(`</${list}>`); list = null; };
  for (const l of src.split('\n')) {
    if (code) { if (l.startsWith('```')) { out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>'); code = null; } else code.push(l); continue; }
    if (l.startsWith('```')) { flush(); endList(); code = []; continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*)/.exec(l))) { flush(); endList(); out.push(`<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`); }
    else if (/^(-{3,}|\*{3,})$/.test(l.trim())) { flush(); endList(); out.push('<hr>'); }
    else if ((m = /^\s*([-*]|\d+\.)\s+(.*)/.exec(l))) { flush(); const t = /\d/.test(m[1]) ? 'ol' : 'ul'; if (list !== t) { endList(); out.push(`<${t}>`); list = t; } out.push('<li>' + inl(m[2]) + '</li>'); }
    else if (!l.trim()) { flush(); endList(); }
    else if (l.startsWith('>')) { flush(); endList(); out.push('<blockquote>' + inl(l.replace(/^>\s?/, '')) + '</blockquote>'); }
    else para.push(l.trim());
  }
  if (code) out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
  flush(); endList(); return out.join('');
}

export default function Viewer({ sid, wide, onWide }) {
  const cur = useStore((s) => s.pnFile);
  const recent = useStore((s) => s.pnRecent) || [];
  const [menu, setMenu] = useState(false);
  const [text, setText] = useState(null);
  const [tick, setTick] = useState(0); // bumped by panel:file:changed for non-webview content
  const wv = useRef(null);
  const e = cur?.ext;
  const isWeb = /^html?$/.test(e || '') || e === 'pdf';

  useEffect(() => {
    setText(null);
    if (!cur || isWeb || cur.image) return;
    let on = true; call('panel:file:read', sid, cur.path).then((t) => on && setText(t));
    return () => { on = false; };
  }, [cur, tick, sid, isWeb]);

  useIpcEvent('panel:file:changed', (d) => {
    if (!cur || d.path !== cur.path) return;
    if (wv.current) { try { wv.current.reload(); return; } catch {} }
    setTick((n) => n + 1);
  });

  if (!cur) return null;
  let body = null;
  if (isWeb) body = <webview ref={wv} key={cur.path} src={cur.url} partition="pn-viewer" webpreferences="sandbox=yes,nodeIntegration=no" plugins={e === 'pdf' ? '' : undefined} style={{ flex: 1, minHeight: 0, background: '#fff' }} />;
  else if (cur.image) body = <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', background: 'var(--deep)', padding: 24, overflow: 'auto' }}><img src={cur.url + '?t=' + tick} alt={cur.name} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} /></div>;
  else if (text?.kind === 'text' && e === 'md') body = <div className="pn-md" dangerouslySetInnerHTML={{ __html: md(text.text) }} />;
  else if (text?.kind === 'text') body = <CodeView text={text.text} />;
  else if (text) body = <div className="pn-empty"><OtherCard r={cur} onOpen={() => call('panel:file:open', sid, cur.path)} /></div>;

  return (<>
    <div className="pn-bar" style={{ position: 'relative' }}>
      <button className="pn-b" type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} style={{ fontWeight: 500, color: 'var(--text)', minWidth: 0, flex: 1, justifyContent: 'flex-start' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur.name}</span><Icon n="down" />
      </button>
      <Btn icon="ext" label="Open externally" onClick={() => call('panel:file:open', sid, cur.path)} />
      <Btn icon="folder" label="Reveal in folder" onClick={() => call('panel:file:reveal', sid, cur.path)} />
      <Btn icon="max" label="Expand" onClick={onWide} />
      <Btn icon="x" label="Close" onClick={() => { setState({ pnMode: null }); call('panel:watch', sid, null); }} />
      <AnimatePresence>
        {menu && (
          <motion.div role="menu" {...pop} style={{ position: 'absolute', top: 44, left: 8, zIndex: 5, minWidth: 240, maxWidth: 360, padding: 4, borderRadius: 8, background: 'var(--raised)', border: '1px solid var(--line-strong)', transformOrigin: 'top left' }}>
            {recent.map((r) => <button key={r.path} className="pn-row" type="button" role="menuitem" onClick={() => { setMenu(false); openFile(r.path); }}><span className="nm">{r.name}</span></button>)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    <div className="pn-body" style={{ position: 'relative' }}>{body}</div>
  </>);
}
