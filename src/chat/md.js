// Pure helpers ported from index.html (chat section). md() escapes first, so its output is safe for innerHTML.
export const ftok = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
export const fcost = (c) => '$' + (c < 0.1 ? c.toFixed(3) : c.toFixed(2));
export const fsize = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
export const isImg = (a) => a?.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(a?.name || '');
export const fileUrl = (p) => globalThis.window?.relayFileUrl ? window.relayFileUrl(p) : encodeURI('file:///' + p.replace(/\\/g, '/'));
export const hm = (at) => new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
export const stamp = (at) => { // Discord style: Today at 12:04 / Yesterday at 9:15 / 11/02/2026 9:15
  const day = (x) => new Date(x).setHours(0, 0, 0, 0), diff = Math.round((day(Date.now()) - day(at)) / 864e5);
  return diff === 0 ? `Today at ${hm(at)}` : diff === 1 ? `Yesterday at ${hm(at)}` : `${new Date(at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} ${hm(at)}`;
};
export const dur = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's'; };

export const speakerColor = (from) => from.startsWith('claude') ? 'var(--claude)' : from === 'codex' ? 'var(--codex)' : from.startsWith('antigravity') ? 'var(--antigravity)' : 'var(--system)';
export const nameColor = (f) => f === 'user' ? 'var(--text)' : speakerColor(f);
export const modelProvider = (model) => /^(claude|opus|sonnet|haiku|fable)/i.test(model || '') ? 'claude' : /^(gpt|codex|luna|sol|astra|terra|o[134])/i.test(model || '') ? 'codex' : /^(gemini|antigravity)/i.test(model || '') ? 'antigravity' : null;
export const messageProvider = (m) => {
  if (m.from !== 'auto') return modelProvider(m.route?.model || m.usage?.model);
  const providers = m.providers || (m.text || '').split('\n').map((line) => modelProvider(line.split(':')[0])).filter(Boolean);
  return providers.length && providers.every((p) => p === providers[0]) ? providers[0] : 'auto';
};
export const visibleSpeaker = (m) => m.via || m.from;
export const disp = (f, profile) => f === 'user' ? profile.name : f === 'auto' ? 'Auto' : f === 'codex' ? 'Codex' : f === 'antigravity' ? 'Antigravity' : f;

// block pass on escaped text: lists, headings, quotes. Plain lines stay as-is (pre-wrap keeps their newlines).
function mdBlocks(t) {
  const L = t.split('\n'), out = [], ul = /^[-*] +(.*)$/, ol = /^(\d+)\. +(.*)$/, q = /^&gt; ?(.*)$/;
  let buf = [], i = 0, m;
  const flush = () => { if (buf.length) out.push(buf.join('\n')); buf = []; };
  while (i < L.length) {
    const re = ul.test(L[i]) ? ul : ol.test(L[i]) ? ol : q.test(L[i]) ? q : null;
    if (re) {
      const items = [], start = re === ol ? +ol.exec(L[i])[1] : 1; while (i < L.length && (m = re.exec(L[i]))) { items.push(m[re === ol ? 2 : 1]); i++; }
      flush(); out.push(re === q ? `<blockquote>${items.join('\n')}</blockquote>` : `<${re === ul ? 'ul' : `ol start="${start}"`}>${items.map((x) => `<li>${x}</li>`).join('')}</${re === ul ? 'ul' : 'ol'}>`);
    } else if ((m = /^(#{1,3}) +(.*)$/.exec(L[i]))) { flush(); out.push(`<div class="h${m[1].length}">${m[2]}</div>`); i++; }
    else buf.push(L[i++]);
  }
  flush();
  return out.join('');
}
export const LOCAL_IMAGE_LINK = /!?\[([^\]\n]+)\]\(<?((?:[A-Za-z]:[\\/]|file:\/\/\/|\/)[^\n]*?\.(?:png|jpe?g|webp|gif|bmp|svg|avif|ico))>?\)/gi;
export function linkedImages(text) {
  return [...String(text || '').replace(/```[\s\S]*?```|`[^`\n]*`/g, '').matchAll(LOCAL_IMAGE_LINK)].map((m) => {
    let p = m[2];
    if (p.startsWith('file:///')) { try { p = decodeURIComponent(new URL(p).pathname).replace(/^\/([A-Za-z]:)/, '$1'); } catch {} }
    return { name: p.split(/[\\/]/).pop(), path: p };
  });
}
export function md(s, profileName = 'you') { // escape first, stash code so later rules can't touch it, then bold / links / mentions
  const keep = [], stash = (h) => `\0${keep.push(h) - 1}\0`;
  return String(s).replace(/\0/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\n?```\w*\n?([\s\S]*?)```\n?/g, (_, c) => stash(`<pre><code>${c.replace(/\n$/, '')}</code></pre>`))
    .replace(/`([^`\n]+)`/g, (_, c) => stash(`<code>${c}</code>`))
    .replace(/^[\s\S]*$/, mdBlocks)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(LOCAL_IMAGE_LINK, (_, label) => stash(`<span>${label}</span>`))
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => stash(`<a href="${u}" target="_blank" rel="noreferrer">${t}</a>`))
    .replace(/https?:\/\/(?:(?!&quot;)[^\s<])*[^\s<.,;:!?)]/g, (u) => stash(`<a href="${u}" target="_blank" rel="noreferrer">${u}</a>`))
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(new RegExp(`(^|[\\s(>])@(claude|codex|you|user${profileName === 'you' ? '' : '|' + profileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi'), (_, p, n) => `${p}<span class="men ${/^(claude|codex)$/i.test(n) ? n.toLowerCase() : 'me'}">@${n}</span>`)
    .replace(/\0(\d+)\0/g, (_, i) => keep[i]);
}
