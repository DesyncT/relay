import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store.js';

// Render half of backgrounds.js: decorative layer behind .ch-main. Prefs live in localStorage 'relay.background.v1'
// (written by the Themes screen's settings panel); dispatch window event 'relay:background' after saving to apply live.
const KEY = 'relay.background.v1', MEDIA = ['off', 'wallpaper', 'video'];
export const readBackgroundPrefs = () => {
  let p = { effect: 'off', strength: 35, speed: 50, paused: false, interactive: true, image: '', hasVideo: false };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) p = { ...p, ...s }; } catch {}
  p.strength = Math.max(10, Math.min(70, Number(p.strength) || 35)); p.speed = Math.max(10, Math.min(100, Number(p.speed) || 50));
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(p.image)) p.image = '';
  return p;
};
const storedVideo = () => new Promise((res, rej) => {
  const r = indexedDB.open('relay-wallpapers', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('media'); r.onerror = () => rej(r.error);
  r.onsuccess = () => { const db = r.result, g = db.transaction('media').objectStore('media').get('video'); g.onsuccess = () => { db.close(); res(g.result); }; g.onerror = () => { db.close(); rej(g.error); }; };
});

function draw(c, w, h, t, p, pt, acc, sec, media) {
  c.clearRect(0, 0, w, h); c.globalAlpha = 1; c.fillStyle = acc; c.strokeStyle = acc;
  const px = p.interactive ? pt.x - 0.5 : 0, py = p.interactive ? pt.y - 0.5 : 0;
  if (p.effect === 'wallpaper' || p.effect === 'video') {
    const mw = media?.videoWidth || media?.naturalWidth, mh = media?.videoHeight || media?.naturalHeight;
    if (mw && mh) { const k = Math.max(w / mw, h / mh); c.drawImage(media, (w - mw * k) / 2, (h - mh * k) / 2, mw * k, mh * k); }
  } else if (p.effect === 'ascii') {
    c.font = '12px monospace'; const g = ' .:;+=*#%@';
    for (let y = 0; y < h; y += 22) for (let x = 0; x < w; x += 16) {
      const v = (Math.sin(x * 0.013 + t + px * 3) + Math.cos(y * 0.019 - t * 0.7 + py * 3) + Math.sin((x + y) * 0.008 + t * 0.4) + 3) / 6;
      c.globalAlpha = 0.15 + v * 0.75; c.fillText(g[Math.min(9, Math.floor(v * 10))], x, y);
    }
  } else if (p.effect === 'liquid' || p.effect === 'aurora') {
    for (let i = 0; i < 5; i++) {
      const x = w * (0.5 + 0.45 * Math.sin(t * 0.23 + i * 1.7) + px * 0.25), y = h * (0.5 + 0.4 * Math.cos(t * 0.19 + i * 2.3) + py * 0.2);
      const r = Math.max(w, h) * (p.effect === 'aurora' ? 0.65 : 0.38), g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, i % 2 ? sec : acc); g.addColorStop(1, 'transparent');
      c.globalAlpha = p.effect === 'aurora' ? 0.35 : 0.55; c.fillStyle = g; c.save();
      if (p.effect === 'aurora') { c.translate(0, h * 0.3); c.scale(1, 0.45); }
      c.fillRect(0, -h, w, h * 3); c.restore();
    }
  } else if (p.effect === 'stars') {
    for (let i = 0; i < 100; i++) {
      const x = ((i * 137.508) % w + Math.sin(t * 0.15 + i) * 12 + px * 60 + w) % w, y = ((i * 83.17 + t * (3 + i % 4) + py * 60) % h + h) % h;
      c.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t + i)); c.beginPath(); c.arc(x, y, i % 7 === 0 ? 1.8 : 1, 0, Math.PI * 2); c.fill();
    }
  } else if (p.effect === 'grid') {
    c.globalAlpha = 0.6; c.lineWidth = 1; const hz = h * (0.3 + py * 0.12), cx = w * (0.5 + px * 0.3);
    for (let i = -12; i <= 12; i++) { c.beginPath(); c.moveTo(cx + i * 12, hz); c.lineTo(w / 2 + i * w / 6, h); c.stroke(); }
    for (let i = 0; i < 18; i++) { const v = ((i + t * 0.35) % 18) / 18, y = hz + (h - hz) * v * v; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  }
  c.globalAlpha = 1;
}

function Layer({ host }) {
  const [p, setP] = useState(readBackgroundPrefs), [videoUrl, setVideoUrl] = useState('');
  const canvas = useRef(), img = useRef(), vid = useRef(), pt = useRef({ x: 0.5, y: 0.5 });
  const [vis, setVis] = useState(!document.hidden);
  const chatOn = useStore((s) => s.tab === 'chat');
  useEffect(() => {
    const f = () => setP(readBackgroundPrefs()), v = () => setVis(!document.hidden);
    window.addEventListener('relay:background', f); window.addEventListener('storage', f); document.addEventListener('visibilitychange', v);
    return () => { window.removeEventListener('relay:background', f); window.removeEventListener('storage', f); document.removeEventListener('visibilitychange', v); };
  }, []);
  useEffect(() => {
    if (!p.hasVideo || p.effect !== 'video') return;
    let url = '', live = true;
    storedVideo().then((f) => { if (live && f) setVideoUrl(url = URL.createObjectURL(f)); }).catch(() => {});
    return () => { live = false; url && URL.revokeObjectURL(url); };
  }, [p.hasVideo, p.effect, p.mediaVersion]);

  const reduced = useReducedMotion();
  const run = chatOn && vis && !reduced && !p.paused;
  useEffect(() => {
    const v = vid.current; if (!v) return;
    v.playbackRate = p.speed / 50;
    if (p.effect === 'video' && run && videoUrl) v.play().catch(() => {}); else v.pause();
  }, [p.effect, p.speed, run, videoUrl]);

  useEffect(() => {
    const cv = canvas.current, c = cv?.getContext('2d'); if (!c) return;
    const style = getComputedStyle(document.documentElement), acc = style.getPropertyValue('--claude').trim(), sec = style.getPropertyValue('--codex').trim();
    const size = () => { cv.width = Math.min(host.clientWidth, 960); cv.height = Math.min(host.clientHeight, 640); };
    size();
    const ro = new ResizeObserver(() => { size(); paint(t); }); ro.observe(host);
    const media = p.effect === 'video' ? vid.current : img.current;
    const paint = (t) => draw(c, cv.width, cv.height, t, p, pt.current, acc, sec, media);
    let timer = 0, last = performance.now(), t = 0, quietUntil = 0;
    const quiet = () => { quietUntil = performance.now() + 180; };
    const tick = () => {
      const now = performance.now();
      if (now >= quietUntil) { t += Math.min(now - last, 100) * 0.001 * p.speed / 50; paint(t); }
      last = now; timer = setTimeout(tick, 50);
    };
    if (run && !MEDIA.includes(p.effect)) timer = setTimeout(tick, 50); else paint(0);
    host.addEventListener('scroll', quiet, { passive: true, capture: true });
    document.addEventListener('input', quiet, { passive: true });
    const move = (e) => { if (!p.interactive || MEDIA.includes(p.effect)) return; const r = host.getBoundingClientRect(); pt.current = { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
    host.addEventListener('pointermove', move, { passive: true });
    return () => { clearTimeout(timer); host.removeEventListener('scroll', quiet, true); document.removeEventListener('input', quiet); ro.disconnect(); host.removeEventListener('pointermove', move); };
  }, [p, run, host, videoUrl]);

  if (p.effect === 'off') return null;
  return createPortal(
    <div id="chatBackground" aria-hidden="true" inert style={{ opacity: p.strength / 100 }}>
      <img ref={img} alt="" src={p.image || undefined} hidden={p.effect !== 'wallpaper' || !p.image} />
      <video ref={vid} src={videoUrl || undefined} loop muted playsInline preload="metadata" hidden={p.effect !== 'video'} />
      <canvas ref={canvas} hidden={p.effect === 'wallpaper' || p.effect === 'video'} />
    </div>, host, 'chat-bg');
}

export default function ChatBackground() {
  const [host, setHost] = useState(null);
  const tab = useStore((s) => s.tab);
  useEffect(() => {
    if (tab !== 'chat') { setHost(null); return; }
    let n = 0, t;
    const find = () => { const h = document.querySelector('.ch-main'); if (h) setHost(h); else if (n++ < 20) t = setTimeout(find, 100); };
    find();
    return () => clearTimeout(t);
  }, [tab]);
  return tab === 'chat' && host?.isConnected ? <Layer host={host} /> : null;
}
