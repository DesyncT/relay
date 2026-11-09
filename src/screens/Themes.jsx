import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call } from '../api.js';
import { spring, fadeUp, stagger, item } from '../motion.js';
import { PRESETS, TOKEN_MAP, validate, persistTheme, getSelected, getCustom } from '../theme/themeStore.js';
import '../styles/settings.css';

function Preview({ theme }) {
  const vars = Object.fromEntries(Object.entries(TOKEN_MAP).map(([k, t]) => ['--' + t, theme.colors[k]]));
  return (
    <div className="theme-preview" aria-hidden="true" style={{ ...vars, borderWidth: theme.borderWidth, borderRadius: theme.radius, fontFamily: theme.font === 'mono' ? 'var(--mono)' : theme.font === 'serif' ? 'Georgia, serif' : 'inherit' }}>
      <div className="theme-preview-rail"><i /><i /><i /></div>
      <div className="theme-preview-content">
        <div className="theme-preview-heading">Relay</div><div className="theme-preview-line" />
        <div className="theme-preview-message"><span /><div><i /><i /></div></div>
        <div className="theme-preview-input" />
      </div>
    </div>
  );
}

export default function Themes() {
  const [sel, setSel] = useState(getSelected);
  const [custom, setCustom] = useState(getCustom);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [gen, setGen] = useState(null);

  const use = (theme, id) => {
    const ok = persistTheme(theme, id);
    setSel(id);
    setStatus(theme.name + ' applied.' + (ok ? '' : ' Your browser could not save this preference.'));
  };
  const generate = async () => {
    setBusy(true); setFailed(false); setGen(null); setStatus('Creating a palette with your connected provider…');
    try {
      const theme = validate(await call('themes:generate'));
      if (!theme) throw new Error('The provider returned an invalid theme. Try generating again.');
      setGen(theme); setStatus('Your new theme is ready to preview.');
    } catch (e) { setFailed(true); setStatus(e?.message || 'Theme generation failed. Please try again.'); }
    setBusy(false);
  };
  const cards = [...Object.entries(PRESETS), ...(custom ? [['custom', custom]] : [])];

  return (
    <div id="themes" aria-busy={busy || undefined}>
      <div className="page-head"><div><h2>Themes</h2><p>A different atmosphere for the same workspace.</p></div></div>
      <motion.div className="theme-presets" role="group" aria-label="Choose a theme" variants={stagger(0.05)} initial="initial" animate="animate">
        {cards.map(([id, theme]) => (
          <motion.button key={id} type="button" className="theme-choice" data-theme={id} aria-pressed={sel === id} variants={item} whileTap={{ scale: 0.985 }} onClick={() => use(theme, id)}>
            <Preview theme={theme} />
            {sel === id && <motion.span layoutId="theme-ring" className="theme-ring" transition={spring} />}
            <span className="theme-choice-title">{theme.name}<span className="theme-choice-state">{sel === id ? 'Active' : 'Use theme'}</span></span>
            <span className="theme-choice-description">{theme.description || 'Your AI-generated palette.'}</span>
          </motion.button>
        ))}
      </motion.div>
      <div className="theme-generate">
        <div><h3>Find a new palette</h3><p>Ask your connected AI provider for a random theme. Preview it here before applying.</p></div>
        <button type="button" className="b" id="themeGenerate" disabled={busy} onClick={generate}>{busy ? 'Generating…' : failed ? 'Retry generation' : 'Generate with AI'}</button>
      </div>
      <p className="theme-status" role="status" aria-live="polite">{status}</p>
      <AnimatePresence>
        {gen && (
          <motion.div className="theme-generated" key={gen.name + gen.colors.bg} {...fadeUp}>
            <Preview theme={gen} />
            <div>
              <h3>{gen.name}</h3>
              <p>{(gen.font === 'mono' ? 'Monospace' : gen.font === 'serif' ? 'Serif' : 'Sans serif') + ' · ' + gen.radius + 'px corners · ' + gen.borderWidth + 'px borders · ' + gen.density}</p>
              <button type="button" className="b primary" onClick={() => { setCustom(gen); use(gen, 'custom'); setGen(null); }}>Use theme</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="theme-local">Your theme is saved on this device.</p>
    </div>
  );
}
