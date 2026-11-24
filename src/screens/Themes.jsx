import { useEffect, useState } from 'react';
import { PRESETS, TOKEN_MAP, persistTheme, getSelected, getMode, setMode } from '../theme/themeStore.js';
import BackgroundSettings from '../components/settings/BackgroundSettings.jsx';
import '../styles/settings.css';

function Preview({ theme }) {
  const vars = Object.fromEntries(Object.entries(TOKEN_MAP).map(([k, t]) => ['--' + t, theme.colors[k]]));
  return (
    <div className="theme-preview" aria-hidden="true" style={{ ...vars, borderWidth: theme.borderWidth, borderRadius: theme.radius, fontFamily: theme.font === 'mono' ? 'var(--mono)' : 'inherit' }}>
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
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); window.addEventListener('relay-theme', f); return () => window.removeEventListener('relay-theme', f); }, []);
  const sel = getSelected(), mode = getMode();
  return <div id="themes">
    <div className="page-head"><div><h2>Appearance</h2><p>Choose a mode and theme, then add atmosphere behind your conversation.</p></div></div>
    <div className="tabpair appearance-mode" role="radiogroup" aria-label="Color mode">
      {[['dark', 'Dark'], ['light', 'Light'], ['system', 'System']].map(([id, label]) => (
        <button key={id} type="button" role="radio" aria-checked={mode === id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)}>{label}</button>
      ))}
    </div>
    <div className="appearance-presets" role="group" aria-label="Choose a theme">
      {Object.entries(PRESETS).map(([id, theme]) => (
        <button key={id} type="button" className="theme-choice" data-theme={id} aria-pressed={sel === id} onClick={() => persistTheme(theme, id)}>
          <Preview theme={theme} />
          <span className="theme-choice-title">{theme.name}<span className="theme-choice-state">{sel === id ? 'Active' : 'Use theme'}</span></span>
          <span className="theme-choice-description">{theme.description}</span>
        </button>
      ))}
    </div>
    <BackgroundSettings />
  </div>;
}
