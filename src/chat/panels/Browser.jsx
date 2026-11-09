import { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '../../api.js';
import { getState, setState, useStore } from '../../store.js';
import { Bar, Btn } from './ui.jsx';
import { Chips } from './Term.jsx';

const norm = (v) => { v = v.trim(); if (!v) return ''; if (/^(https?|file):/i.test(v)) return v; return (/^(localhost|127\.|\d+\.\d+\.\d+\.\d+|\[)/.test(v) ? 'http://' : 'https://') + v; };

// <webview> restrictions (no preload / node / sandboxed) are enforced by main.js will-attach-webview.
export default function Browser({ sid }) {
  const [url, setUrl] = useState('');
  const [empty, setEmpty] = useState(true);
  const [nav, setNav] = useState({ back: false, fwd: false });
  const host = useRef(null), wv = useRef(null);
  const req = useStore((s) => s.pnUrl);

  const sync = () => { try { setNav({ back: !!wv.current?.canGoBack(), fwd: !!wv.current?.canGoForward() }); } catch {} };
  const ensure = useCallback(() => {
    if (wv.current) return wv.current;
    const w = document.createElement('webview'); w.setAttribute('partition', 'pn-browser');
    w.addEventListener('did-navigate', (e) => { setUrl(e.url === 'about:blank' ? '' : e.url); setEmpty(e.url === 'about:blank'); sync(); });
    w.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { setUrl(e.url); sync(); } });
    host.current.prepend(w); wv.current = w; return w;
  }, []);
  const go = useCallback((v) => { v = norm(v); if (!v) return; const w = ensure(); setEmpty(false); setUrl(v); w.setAttribute('src', v); }, [ensure]);

  // open request from openUrl() / panel:open-url; otherwise first show: dev-server chip or probe :3000
  const seen = useRef(null);
  useEffect(() => {
    if (req && seen.current !== req.n) { seen.current = req.n; go(req.u); return; }
    if (wv.current) return;
    ensure();
    const dev = (getState().pnUrls?.[sid] || [])[0];
    if (dev) go(dev); else call('panel:probe', 3000).then((ok) => { if (ok === true && !wv.current?.getAttribute('src')) go('http://localhost:3000'); });
  }, [req, sid, go, ensure]);
  useEffect(() => () => { wv.current?.remove(); wv.current = null; }, []);

  return (<>
    <Bar title="Browser">
      <Btn icon="back" label="Back" disabled={!nav.back} onClick={() => wv.current?.goBack()} />
      <Btn icon="fwd" label="Forward" disabled={!nav.fwd} onClick={() => wv.current?.goForward()} />
      <Btn icon="reload" label="Reload" onClick={() => wv.current?.reload()} />
      <input className="pn-url" type="text" placeholder="Enter a URL" spellCheck={false} aria-label="Address" value={url}
        onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(url); }} />
      <Btn icon="x" label="Close" onClick={() => setState({ pnMode: null })} />
    </Bar>
    <div className="pn-body">
      <Chips sid={sid} onPick={go} />
      <div className="pn-view" ref={host}><div className="pn-empty" hidden={!empty}>Enter a URL</div></div>
    </div>
  </>);
}
