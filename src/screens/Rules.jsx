import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { call } from '../api.js';
import { getState, setState, useStore } from '../store.js';
import { item, spring, stagger } from '../motion.js';
import Routing from '../components/rules/Routing.jsx';
import Logo from '../components/rules/Logo.jsx';
import { useSaved } from '../components/rules/Saved.jsx';
import Skills from './Skills.jsx';
import '../styles/agents.css';

const NAMES = { shared: 'Shared chat rules', forced: 'Forced skills and plugins', claude: 'Claude Code', codex: 'Codex' };

function RuleCard({ k, v, setText }) {
  const [ok, flash] = useSaved();
  const save = async () => { await call('rules:save', k, v.text); flash(); };
  return (
    <motion.div className="panel" variants={item} layout>
      <div className="rule-head">
        <div>
          <label htmlFor={'rule-' + k} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontSize: 15 }}>
            {(k === 'claude' || k === 'codex') && <span style={{ display: 'inline-flex' }}><Logo name={k === 'claude' ? 'claude' : 'openai'} size={18} color={k === 'claude' ? '#D97757' : '#fff'} /></span>}
            {NAMES[k]}
          </label>
          <p title={v.path}>{v.path}</p>
        </div>
        <div>{ok}<button className="b" onClick={save}>Save</button></div>
      </div>
      <textarea id={'rule-' + k} rows={10} value={v.text} placeholder="No rules yet" onChange={(e) => setText(k, e.target.value)} />
    </motion.div>
  );
}

function RulesList() {
  const [rules, setRules] = useState(null);
  useEffect(() => { call('rules:get').then(setRules).catch(() => setRules({})); }, []);
  if (!rules) return <div id="rulesList" className="rules" />;
  const setText = (k, text) => setRules((r) => ({ ...r, [k]: { ...r[k], text } }));
  return (
    <motion.div id="rulesList" className="rules" variants={stagger(0.06)} initial="initial" animate="animate">
      {Object.entries(rules).filter(([k]) => k !== 'forced').map(([k, v]) => <RuleCard key={k} k={k} v={v} setText={setText} />)}
    </motion.div>
  );
}

export default function Rules() {
  // Rules/Skills share one nav slot. TabPair (shell) may drive state.tab === 'skills'; otherwise the local switcher flips rulesView.
  const view = useStore((s) => s.tab === 'skills' ? 'skills' : 'rules');
  const items = [['rules', 'Rules'], ['skills', 'Skills']];
  return (
    <>
      <div className="rules-top"><div className="seg" role="group" aria-label="Rules or skills">
        {items.map(([id, name]) => (
          <button key={id} type="button" className={view === id ? 'on' : ''} aria-pressed={view === id} onClick={() => setState({ tab: id })}>
            {view === id && <motion.span  className="seg-ind" transition={spring} />}<span>{name}</span>
          </button>
        ))}
      </div></div>
      {view === 'skills' ? (<>
        <div className="page-head"><div><h2>Skills</h2><p>Skills and plugins for Claude Code and Codex</p></div></div>
        <Skills />
      </>) : (<>
        <div className="page-head"><div><h2>Rules</h2><p>Model routing and instructions for your agents</p></div></div>
        <Routing />
        <RulesList />
      </>)}
    </>
  );
}
