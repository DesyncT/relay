import { Fragment } from 'react';

// Inline markdown -> React nodes. ctx: {anim, chunk, step, n, name}. All text goes through React, so it is escaped.
const EXT = 'png|jpe?g|webp|gif|bmp|svg|avif|ico';
const res = new Map();
function master(name) {
  const k = name || 'you';
  if (!res.has(k)) {
    const extra = k === 'you' ? '' : '|' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    res.set(k, new RegExp([
      '(?<code>`[^`\\n]+`)',
      `(?<img>!?\\[(?<imgl>[^\\]\\n]+)\\]\\(<?(?:[A-Za-z]:[\\\\/]|file:\\/\\/\\/|\\/)[^\\n]*?\\.(?:${EXT})>?\\))`,
      '(?<link>\\[(?<lt>[^\\]\\n]+)\\]\\((?<lu>https?:\\/\\/[^\\s)]+)\\))',
      '(?<url>https?:\\/\\/[^\\s<"]*[^\\s<".,;:!?)])',
      '(?<b>\\*\\*(?=\\S)(?<bt>.+?)\\*\\*)',
      '(?<s>~~(?=\\S)(?<st>.+?)~~)',
      '(?<i>(?<![*\\w])\\*(?=\\S)(?<it>[^*\\n]*?\\S)\\*(?!\\*))',
      `(?<men>(?<![^\\s(])@(?<mn>claude|codex|you|user${extra})\\b)`,
    ].join('|'), 'gi'));
  }
  return res.get(k);
}

// plain text -> word-chunk spans that fade in (CSS animation + per-span delay; cheap, no per-word component)
function words(s, ctx, key) {
  if (!ctx.anim) return s;
  const toks = s.match(/\s*\S+\s*/g);
  if (!toks) return s;
  const out = [];
  for (let j = 0; j < toks.length; j += ctx.chunk) {
    out.push(<span className="w" key={key + j} style={{ animationDelay: Math.round(ctx.n++ * ctx.step) + 'ms' }}>{toks.slice(j, j + ctx.chunk).join('')}</span>);
  }
  return out;
}

export function inline(text, ctx, kp = '') {
  const out = [];
  let last = 0, k = 0;
  const push = (n) => out.push(<Fragment key={kp + k++}>{n}</Fragment>);
  for (const m of String(text).matchAll(master(ctx.name))) {
    const g = m.groups;
    if (m.index > last) push(words(text.slice(last, m.index), ctx, kp + k + '.'));
    const sub = (t) => inline(t, ctx, kp + k + '.');
    if (g.code) push(<code>{m[0].slice(1, -1)}</code>);
    else if (g.img) push(<span>{g.imgl}</span>); // local image links render as their label; Message shows the image card
    else if (g.link) push(<a href={g.lu} target="_blank" rel="noreferrer">{sub(g.lt)}</a>);
    else if (g.url) push(<a href={g.url} target="_blank" rel="noreferrer">{g.url}</a>);
    else if (g.b) push(<b>{sub(g.bt)}</b>);
    else if (g.s) push(<del>{sub(g.st)}</del>);
    else if (g.i) push(<i>{sub(g.it)}</i>);
    else if (g.men) push(<span className={'men ' + (/^(claude|codex)$/i.test(g.mn) ? g.mn.toLowerCase() : 'me')}>@{g.mn}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) push(words(text.slice(last), ctx, kp + k + '.'));
  return out;
}

export const PLAIN = { anim: false, chunk: 1, step: 0, n: 0, name: 'you' };
