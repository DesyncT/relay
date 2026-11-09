import { memo, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import '../../styles/richtext.css';
import { parse, wordCount } from './parse.js';
import { highlight, langName } from './highlight.js';
import { inline } from './inline.jsx';
import { parseViz, Viz } from './Visuals.jsx';

const played = new Set(); // message ids whose reveal already ran: a remount never replays it
const CAP_MS = 1400, STEP = 16, BLOCK_MODE_WORDS = 500;
const ICONS = {
  note: ['Note', 'M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z'],
  tip: ['Tip', 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z'],
  warning: ['Warning', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01'],
  important: ['Important', 'M12 8v5M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z'],
  caution: ['Caution', 'M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9zM12 8v4M12 16h.01'],
};
ICONS.info = ICONS.note;
const SVG = (d, p = {}) => <svg className="rt-i" viewBox="0 0 24 24" aria-hidden="true" {...p}><path d={d} /></svg>;
const LABEL = { js: 'JavaScript', ts: 'TypeScript', json: 'JSON', python: 'Python', bash: 'Shell', css: 'CSS', html: 'HTML' };

function CopyBtn({ code }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1600); return () => clearTimeout(t); }, [done]);
  return (
    <motion.button type="button" className={'rt-copy' + (done ? ' done' : '')} aria-label={done ? 'Copied' : 'Copy code'} whileTap={{ scale: 0.94 }}
      onClick={async () => { try { await navigator.clipboard.writeText(code); setDone(true); } catch {} }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={done ? 'y' : 'n'} className="rt-copy-in" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}>
          {done ? <>{SVG('m5 12 4 4L19 6')}Copied</> : <>{SVG('M8 8h12v12H8zM4 16V4h12')}Copy</>}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

function CodeBlock({ lang, code, fx }) {
  const toks = useMemo(() => highlight(code, lang), [code, lang]), l = langName(lang);
  return (
    <div className={'rt-code' + (fx.className ? ' ' + fx.className : '')} style={fx.style}>
      <div className="rt-code-h"><span className="rt-lang">{LABEL[l] || lang || 'Code'}</span><CopyBtn code={code} /></div>
      <pre tabIndex={0}><code>{toks.map((t, i) => (t.c ? <span key={i} className={'tk-' + t.c}>{t.s}</span> : t.s))}</code></pre>
    </div>
  );
}

// ---- AST -> React ----
function render(blocks, ctx, depth = 0, kp = '') {
  return blocks.map((b, i) => {
    const key = kp + i, top = depth === 0;
    // atomic blocks (code/table/visual) fade as a whole; in block mode every top-level block does
    const fx = (atomic) => (ctx.live && (atomic || (ctx.blockMode && top)) ? { className: 'rt-fade', style: { animationDelay: Math.min(CAP_MS, Math.round(ctx.blockMode ? ctx.b++ * 45 : ctx.n * ctx.step)) + 'ms' } } : {});
    const inl = (t) => inline(t, ctx, key + '.');
    switch (b.t) {
      case 'p': return <p key={key} {...fx(false)}>{inl(b.text)}</p>;
      case 'h': { const f = fx(false); return <div key={key} role="heading" aria-level={b.n} className={'h' + b.n + (f.className ? ' ' + f.className : '')} style={f.style}>{inl(b.text)}</div>; }
      case 'hr': return <hr key={key} {...fx(true)} />;
      case 'quote': return <blockquote key={key} {...fx(false)}>{render(b.kids, ctx, depth + 1, key + '.')}</blockquote>;
      case 'callout': {
        const [label, d] = ICONS[b.kind], f = fx(true);
        return <aside key={key} className={'rt-call ' + (b.kind === 'info' ? 'note' : b.kind) + (f.className ? ' ' + f.className : '')} style={f.style}><div className="rt-call-h">{SVG(d)}{label}</div><div className="rt-call-b">{render(b.kids, ctx, depth + 1, key + '.')}</div></aside>;
      }
      case 'list': {
        const Tag = b.ord ? 'ol' : 'ul', f = fx(false), tasks = b.items.some((x) => x.task);
        return (
          <Tag key={key} start={b.ord && b.start !== 1 ? b.start : undefined} className={[tasks && 'rt-tasks', f.className].filter(Boolean).join(' ') || undefined} style={f.style}>
            {b.items.map((it, j) => (
              <li key={j} className={it.task ? 'task ' + it.task : undefined}>
                {it.task && <input type="checkbox" checked={it.task === 'done'} readOnly disabled aria-label={it.task === 'done' ? 'Done' : 'Not done'} />}
                {inline(it.text, ctx, key + '.' + j + '.')}{render(it.kids, ctx, depth + 1, key + '.' + j + '.')}
              </li>
            ))}
          </Tag>
        );
      }
      case 'table': {
        const f = fx(true);
        return (
          <div key={key} className={'rt-tbl' + (f.className ? ' ' + f.className : '')} style={f.style} role="region" aria-label="Table" tabIndex={0}>
            <table>
              <thead><tr>{b.head.map((c, j) => <th key={j} style={{ textAlign: b.align[j] || undefined }}>{inline(c, ctx, key + 'h' + j)}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{b.head.map((_, k) => <td key={k} style={{ textAlign: b.align[k] || undefined }}>{inline(r[k] || '', ctx, key + 'r' + j + '.' + k)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      }
      case 'code': {
        const v = parseViz(b.lang, b.code);
        if (v) { const f = fx(true); return <div key={key} className={'rt-vz' + (f.className ? ' ' + f.className : '')} style={f.style}><Viz v={v} /></div>; }
        // invalid or partial visual JSON: fall back to a normal code block
        return <CodeBlock key={key} lang={['chart', 'stats', 'steps', 'compare'].includes(b.lang) ? 'json' : b.lang} code={b.code} fx={fx(true)} />;
      }
      default: return null;
    }
  });
}

function RichText({ text, id, live = false, name = 'you', className = 'body' }) {
  const [anim] = useState(() => !!live && !played.has(id));
  useEffect(() => { if (anim) played.add(id); }, [anim, id]);
  const tree = useMemo(() => {
    const s = String(text || ''), n = anim ? wordCount(s) : 0, blockMode = n > BLOCK_MODE_WORDS;
    const chunks = Math.min(n, Math.round(CAP_MS / STEP)), chunk = Math.max(1, Math.ceil(n / Math.max(1, chunks)));
    const ctx = { live: anim, blockMode, anim: anim && !blockMode, chunk, step: n ? Math.min(STEP, CAP_MS / Math.ceil(n / chunk)) : STEP, n: 0, b: 0, name };
    return render(parse(s), ctx);
  }, [text, name, anim]);
  return <div className={className + ' rt' + (anim ? ' rt-live' : '')}>{tree}</div>;
}
export default memo(RichText);
