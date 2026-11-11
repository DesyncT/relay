import React, { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { call, useIpcEvent } from '../api.js';

const clean = (e) => String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };

function Qr({ text }) {
  const svg = useMemo(() => { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }, [text]);
  return <div className="ph-qr" role="img" aria-label="QR code to pair your phone" dangerouslySetInnerHTML={{ __html: svg }} />;
}

// Chat from a phone on the same network: scan, approve the device here, done. The phone shows the same app, live.
export default function Phone() {
  const [st, setSt] = useState(null), [pair, setPair] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now());
  useEffect(() => { call('mobile:state').then(setSt).catch(() => {}); }, []);
  useIpcEvent('mobile:state', setSt);
  useEffect(() => { if (!pair) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [pair]);
  const run = async (ch, ...a) => {
    setErr(''); setBusy(true);
    try { const r = await call(ch, ...a); setSt(r); if (r.pair) setPair(r.pair); } catch (e) { setErr(clean(e)); }
    setBusy(false);
  };
  if (!st) return null;
  const left = pair ? Math.max(0, Math.round((pair.expires - now) / 1000)) : 0, live = pair && left > 0;
  return (
    <div className="panel form" id="set-phone">
      <h3>Phone</h3>
      <p className="hint">Chat from your phone: the same app, with the same animations, live in sync with this computer. Works on the same Wi-Fi. The phone can chat with your agents but cannot change settings or reach your files or terminal.</p>
      {!st.running ? (
        <div className="row-actions"><button type="button" className="b" disabled={busy} onClick={() => run('mobile:start')}>{st.approved ? 'Open on my phone' : 'Allow and open on my phone'}</button></div>
      ) : (
        <>
          {live ? (
            <div className="ph-pair">
              <Qr text={pair.url} />
              <div>
                <p><b>Scan with your phone's camera</b></p>
                <p className="hint">Then tap Allow in the window that appears here. This code works once and expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}.</p>
                <p className="hint ph-url">{pair.url.replace(/\?pair=.*/, '')}</p>
              </div>
            </div>
          ) : (
            <p className="hint">{pair ? 'The QR code expired.' : 'Phone access is on.'}</p>
          )}
          <div className="row-actions">
            <button type="button" className="b" disabled={busy} onClick={() => run('mobile:pair')}>{live ? 'New QR code' : 'Pair another phone'}</button>
            <button type="button" className="b ghost" disabled={busy} onClick={() => { setPair(null); run('mobile:stop'); }}>Turn off</button>
          </div>
        </>
      )}
      {st.devices?.length > 0 && (
        <>
          <h4>Paired phones</h4>
          <ul className="ph-devs">
            {st.devices.map((d) => (
              <li key={d.id}>
                <span className={'ph-dot' + (d.online ? ' on' : '')} title={d.online ? 'Connected now' : 'Not connected'} aria-hidden="true" />
                <span className="ph-name">{d.name}<small>{d.online ? 'Connected' : 'Last seen ' + ago(d.last)}</small></span>
                <button type="button" className="b ghost" aria-label={'Remove ' + d.name} onClick={() => run('mobile:revoke', d.id)}>Remove</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {err && <p role="alert" className="hint" style={{ color: 'var(--danger, #e5484d)' }}>{err}</p>}
    </div>
  );
}
