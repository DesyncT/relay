// Port of themes.js. Storage key and saved shape ({id, theme?}) are identical so existing user themes keep working.
export const STORAGE_KEY = 'relay.theme.v1';
export const TOKEN_MAP = { deep: 'deep', bg: 'bg', card: 'card', raised: 'raised', text: 'text', text2: 'text-2', muted: 'muted', line: 'line', lineStrong: 'line-strong', accent: 'claude', codex: 'codex', negative: 'negative' };
const P = (name, description, style, font, c) => ({ name, description, style, font, colors: Object.fromEntries(Object.keys(TOKEN_MAP).map((k, i) => [k, c[i]])), radius: style === 'square' ? 0 : 8, borderWidth: 1, density: 'comfortable' });
export const PRESETS = {
  graphite: P('Graphite', 'Quiet charcoal. The Relay original.', 'rounded', 'sans', ['#111112', '#181819', '#1e1e20', '#29292c', '#ededee', '#b5b5bc', '#96969e', '#303033', '#444449', '#e5997c', '#dedee3', '#f16b70']),
  paper: P('Paper', 'Warm white, ink, and a softer contrast.', 'rounded', 'sans', ['#e9e7e2', '#f6f4ef', '#ffffff', '#e5e2da', '#222321', '#51544e', '#62665e', '#d5d3cb', '#b5b7ad', '#9c432c', '#46554b', '#b52d36']),
  midnight: P('Midnight', 'Deep blue with a restrained lavender accent.', 'rounded', 'sans', ['#11141e', '#171b29', '#1d2333', '#2a3247', '#edf0fa', '#bcc5db', '#a0aecb', '#343e56', '#4c5c7b', '#b4a6e8', '#b9d5e4', '#f68a95']),
  forest: P('Forest', 'Pine charcoal with fresh sage highlights.', 'rounded', 'sans', ['#101613', '#161e19', '#1c2821', '#29382e', '#eff6ee', '#c2d5c4', '#a4bba8', '#34483a', '#506956', '#b0d694', '#c8e5d3', '#ff9c9c']),
  ember: P('Ember', 'Warm charcoal, copper, and late-night focus.', 'rounded', 'sans', ['#191311', '#211a17', '#2b221d', '#3c3028', '#fff1e7', '#dfc8b8', '#c4ac9b', '#4c3b30', '#705544', '#ffba83', '#f0d7b3', '#ffa3a3']),
  ocean: P('Ocean', 'Deep sea surfaces with clear aqua accents.', 'square', 'sans', ['#0d171c', '#132129', '#1a2b34', '#253e48', '#ebf7fa', '#c1dce3', '#a4c3ce', '#304c58', '#4b6d7b', '#8bdcd5', '#b4d9f5', '#ffa2ac']),
  porcelain: P('Porcelain', 'Cool white, slate ink, and cobalt details.', 'rounded', 'sans', ['#e6eaf0', '#f4f6fa', '#ffffff', '#dce3ed', '#172435', '#35475c', '#4c5b70', '#cad3df', '#a4b2c5', '#2458a6', '#315e69', '#ac3042']),
  terminal: P('Terminal', 'Phosphor green. Monospace. Square corners.', 'square', 'mono', ['#0a100c', '#101812', '#16201a', '#213228', '#d5f2d9', '#a8cfb0', '#91b49a', '#2e4936', '#456d51', '#a1e9af', '#d5f2d9', '#f38d8d']),
};
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((s) => parseInt(hex.slice(s, s + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};
export function validate(value) {
  if (!value || typeof value !== 'object' || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 48 || !['sans', 'mono', 'serif'].includes(value.font) || !Number.isFinite(value.radius) || value.radius < 0 || value.radius > 20 || !Number.isFinite(value.borderWidth) || value.borderWidth < 0 || value.borderWidth > 2 || !['compact', 'comfortable'].includes(value.density)) return null;
  const colors = {};
  for (const key of Object.keys(TOKEN_MAP)) {
    if (typeof value.colors?.[key] !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value.colors[key])) return null;
    colors[key] = value.colors[key];
  }
  for (const key of Object.keys(TOKEN_MAP).filter((k) => !['line', 'lineStrong'].includes(k))) if (colors[key].length === 9 && !/ff$/i.test(colors[key])) return null;
  for (const s of ['deep', 'bg', 'card', 'raised']) for (const f of ['text', 'text2', 'muted']) {
    const a = lum(colors[s]), b = lum(colors[f]);
    if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4.5) return null;
  }
  return { name: value.name.trim(), font: value.font, radius: value.radius, borderWidth: value.borderWidth, density: value.density, colors };
}
let selected = 'graphite', custom = null;
export const getSelected = () => selected;
export const getCustom = () => custom;
export function applyTheme(theme, id) {
  const root = document.documentElement, set = (k, v) => root.style.setProperty(k, v);
  for (const [key, token] of Object.entries(TOKEN_MAP)) set('--' + token, theme.colors[key]);
  set('--app-font', theme.font === 'mono' ? 'var(--mono)' : theme.font === 'serif' ? 'Georgia, Cambria, serif' : '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif');
  set('--app-radius', theme.radius + 'px');
  root.dataset.themeStyle = theme.radius === 0 ? 'square' : 'rounded';
  root.dataset.relayTheme = id;
  set('--app-border-width', theme.borderWidth + 'px');
  set('--app-control-height', theme.density === 'compact' ? '30px' : '36px');
  set('--app-density-space', theme.density === 'compact' ? '16px' : '24px');
  root.dataset.themeFont = theme.font;
  root.style.colorScheme = lum(theme.colors.bg) > 0.179 ? 'light' : 'dark';
  if (document.body) document.body.dataset.theme = id;
  selected = id;
}
// Called once before first render so the saved theme paints without a flash.
export function applyStoredTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.id === 'custom' && (custom = validate(saved.theme))) applyTheme(custom, 'custom');
    else if (PRESETS[saved?.id]) applyTheme(PRESETS[saved.id], saved.id);
  } catch (_) { /* corrupt storage: keep default */ }
}
// Apply + persist. Returns false when storage failed. Briefly tags <html> so colors crossfade.
export function persistTheme(theme, id) {
  const root = document.documentElement;
  root.classList.add('theme-fading');
  setTimeout(() => root.classList.remove('theme-fading'), 450);
  applyTheme(theme, id);
  if (id === 'custom') custom = theme;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, theme: id === 'custom' ? theme : undefined })); return true; } catch (_) { return false; }
}
