// Markdown -> plain AST. No HTML is ever produced; the renderer turns the AST into React elements (React escapes all text).
// Blocks: {t:'p',text} {t:'h',n,text} {t:'hr'} {t:'quote',kids} {t:'callout',kind,kids} {t:'list',ord,start,items:[{task,text,kids}]}
//         {t:'table',head,align,rows} {t:'code',lang,code}
const FENCE = /```([\w+#.-]*)[ \t]*\n?([\s\S]*?)(?:```|$)/g;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)]) +(.*)$/;
const HR = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const SEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const CALL = /^\[!(note|info|tip|warning|important|caution)\][ \t]*(.*)$/i;
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
const MAX_DEPTH = 4;

function listBlock(L, i) { // parses consecutive list lines starting at i; returns [block, nextIndex]
  const rows = [];
  while (i < L.length) { const m = LIST.exec(L[i]); if (!m || HR.test(L[i])) break; rows.push({ ind: m[1].replace(/\t/g, '    ').length, mark: m[2], text: m[3] }); i++; }
  const build = (from, ind) => { // items at indentation `ind`, children are deeper rows
    const ord = /\d/.test(rows[from].mark), items = []; let k = from;
    while (k < rows.length && rows[k].ind >= ind) {
      if (rows[k].ind > ind) { const sub = build(k, rows[k].ind); (items.at(-1) || (items[0] = { text: '', kids: [] })).kids.push(sub.block); k = sub.next; continue; }
      if (/\d/.test(rows[k].mark) !== ord) break;
      const task = /^\[( |x|X)\] +(.*)$/.exec(rows[k].text);
      items.push({ task: task ? (task[1] === ' ' ? 'todo' : 'done') : null, text: task ? task[2] : rows[k].text, kids: [] }); k++;
    }
    return { block: { t: 'list', ord, start: ord ? parseInt(rows[from].mark, 10) : 1, items }, next: k };
  };
  const r = build(0, rows[0].ind);
  // a lower-indented tail (rare) becomes its own list
  return [r.block, i - (rows.length - r.next)];
}

export function parseBlocks(src, depth = 0) {
  const out = [], L = src.split('\n');
  let buf = [], i = 0, m;
  const flush = () => { if (buf.length) { const text = buf.join('\n'); if (text.trim()) out.push({ t: 'p', text }); } buf = []; };
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { flush(); i++; continue; }
    if ((m = /^(#{1,3}) +(.*)$/.exec(l))) { flush(); out.push({ t: 'h', n: m[1].length, text: m[2] }); i++; }
    else if (HR.test(l)) { flush(); out.push({ t: 'hr' }); i++; }
    else if (l.includes('|') && i + 1 < L.length && SEP.test(L[i + 1]) && L[i + 1].includes('-') && (L[i + 1].includes('|') || cells(l).length > 1)) {
      flush(); const head = cells(l), align = cells(L[i + 1]).map((c) => (c.startsWith(':') ? (c.endsWith(':') ? 'center' : 'left') : c.endsWith(':') ? 'right' : null)), rows = []; i += 2;
      while (i < L.length && L[i].trim() && L[i].includes('|')) rows.push(cells(L[i++]).slice(0, head.length));
      out.push({ t: 'table', head, align, rows: rows.slice(0, 200) });
    } else if (/^ {0,3}>/.test(l)) {
      flush(); const q = []; while (i < L.length && /^ {0,3}>/.test(L[i])) q.push(L[i++].replace(/^ {0,3}> ?/, ''));
      const c = CALL.exec(q[0] || '');
      if (c && depth < MAX_DEPTH) { const rest = [c[2], ...q.slice(1)].join('\n'); out.push({ t: 'callout', kind: c[1].toLowerCase(), kids: parseBlocks(rest, depth + 1) }); }
      else out.push({ t: 'quote', kids: depth < MAX_DEPTH ? parseBlocks(q.join('\n'), depth + 1) : [{ t: 'p', text: q.join('\n') }] });
    } else if (LIST.test(l)) { flush(); const [b, n] = listBlock(L, i); out.push(b); i = n; }
    else { buf.push(l); i++; }
  }
  flush();
  return out;
}

export function parse(text) {
  const s = String(text || '').replace(/\0/g, ''), out = [];
  let last = 0, m;
  FENCE.lastIndex = 0;
  while ((m = FENCE.exec(s))) {
    if (m[0] === '') { FENCE.lastIndex++; continue; }
    out.push(...parseBlocks(s.slice(last, m.index)));
    out.push({ t: 'code', lang: m[1].toLowerCase(), code: m[2].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  out.push(...parseBlocks(s.slice(last)));
  return out;
}

export const wordCount = (s) => { const t = String(s || '').replace(/```[\s\S]*?(?:```|$)/g, ' ').trim(); return t ? t.split(/\s+/).length : 0; };
