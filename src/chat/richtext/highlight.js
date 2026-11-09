// Tiny regex tokenizer: first matching rule wins at each position. Returns [{c: class|null, s: text}].
// ponytail: regex-only, no real grammar (nested template strings, heredocs etc. are approximations).
const words = (s) => `\\b(?:${s.split(' ').join('|')})\\b`;
const JS_KW = words('const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this super static get set yield void delete interface type enum implements public private protected readonly as');
const STR = `"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'`;
const NUM = '\\b\\d[\\d_]*(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b|\\b0x[\\da-f]+\\b';
const js = [['cm', '//.*|/\\*[\\s\\S]*?(?:\\*/|$)'], ['st', STR + '|`(?:\\\\.|[^`\\\\])*`?'], ['lit', words('true false null undefined NaN')], ['kw', JS_KW], ['nu', NUM], ['fn', '[A-Za-z_$][\\w$]*(?=\\s*\\()'], ['ty', '\\b[A-Z][\\w$]*\\b']];
const LANGS = {
  js, ts: js,
  json: [['key', '"(?:\\\\.|[^"\\\\\\n])*"(?=\\s*:)'], ['st', '"(?:\\\\.|[^"\\\\\\n])*"'], ['lit', words('true false null')], ['nu', '-?\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b']],
  python: [['cm', '#.*'], ['st', '"""[\\s\\S]*?(?:"""|$)|\'\'\'[\\s\\S]*?(?:\'\'\'|$)|' + STR], ['lit', words('True False None')], ['kw', words('def class return if elif else for while in not and or is import from as with try except finally raise pass break continue lambda yield async await global nonlocal assert del')], ['nu', NUM], ['fn', '[A-Za-z_]\\w*(?=\\s*\\()'], ['ty', '@\\w+']],
  bash: [['cm', '(?:^|\\s)#.*'], ['st', STR], ['va', '\\$\\{?[\\w@#?*]+\\}?|\\$\\([^)]*\\)'], ['kw', words('if then else elif fi for do done while case esac function in export local return echo cd set unset source')], ['fl', '(?<=\\s)--?[A-Za-z][\\w-]*'], ['nu', NUM], ['fn', '(?<=^|\\n)[ \\t]*[\\w./-]+|(?<=[|;&]\\s*)[\\w./-]+']],
  css: [['cm', '/\\*[\\s\\S]*?(?:\\*/|$)'], ['st', STR], ['kw', '@[\\w-]+'], ['va', '--[\\w-]+|var\\('], ['nu', '#[\\da-fA-F]{3,8}\\b|-?\\b\\d+(?:\\.\\d+)?(?:px|rem|em|%|vh|vw|ms|s|deg|fr)?\\b'], ['key', '[\\w-]+(?=\\s*:)'], ['ty', '[.#][\\w-]+']],
  html: [['cm', '<!--[\\s\\S]*?(?:-->|$)'], ['st', STR], ['kw', '</?[A-Za-z][\\w:-]*|/?>'], ['key', '[\\w:-]+(?==)']],
};
const ALIAS = { javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js', typescript: 'ts', tsx: 'ts', py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', powershell: 'bash', ps1: 'bash', console: 'bash', xml: 'html', svg: 'html', vue: 'html', scss: 'css' };
const cache = {};
const rx = (l) => cache[l] || (cache[l] = new RegExp(LANGS[l].map(([, p]) => `(${p})`).join('|'), 'g'));

export const langName = (l) => ALIAS[l] || l;
export function highlight(code, lang) {
  const l = langName(lang);
  if (!LANGS[l] || code.length > 20000) return [{ c: null, s: code }];
  const out = [], re = rx(l), rules = LANGS[l];
  let last = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(code))) {
    if (!m[0]) { re.lastIndex++; continue; }
    if (m.index > last) out.push({ c: null, s: code.slice(last, m.index) });
    out.push({ c: rules[m.slice(1).findIndex((x) => x !== undefined)][0], s: m[0] });
    last = m.index + m[0].length;
  }
  if (last < code.length) out.push({ c: null, s: code.slice(last) });
  return out;
}
