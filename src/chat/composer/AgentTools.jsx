import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { spring, springSoft } from '../../motion.js';
import { call } from '../../api.js';
import { setState } from '../../store.js';
import { openPanel } from '../panelsApi.js';
import { setSubsOpen } from '../chatStore.js';
import { addSystemCard } from '../chatStore.js';
import { Ico } from './ui.jsx';

const KEY = (sid) => 'relay.agentopts.' + sid;
const DEF = { autopilot: false, apMax: 12, boss: false, loop: false, loopMax: 6, runTests: true };
const read = (sid) => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY(sid)) || '{}') }; } catch { return { ...DEF }; } };

// Options for chat:send; empty when both toggles are off.
export function sendOpts(sid) {
  const o = read(sid);
  if (o.autopilot) return { autopilot: true, loopMax: o.apMax };
  return { ...(o.boss ? { boss: true } : {}), ...(o.loop ? { loop: true, loopMax: o.loopMax, runTests: o.runTests } : {}) };
}

const PROMPTS = {
  compact: 'Summarize this conversation so far into a compact brief, then continue from it.',
  review: 'Do a code review of the uncommitted changes in this project (git diff and untracked files). List bugs, risks and cleanups by file, most important first. Do not edit anything.',
  init: 'Explore this project and create or refresh CLAUDE.md and AGENTS.md at the project root: build/test commands, architecture, conventions and gotchas. Keep them concise and keep any existing content that is still accurate.',
};
const ACTS = [
  ['compact', 'Compact conversation', <path key="a" d="M4 8h16M4 16h16M9 12h6" />],
  ['review', 'Review uncommitted changes', <path key="a" d="M9 12l2 2 4-4M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />],
  ['init', 'Create or refresh CLAUDE.md and AGENTS.md', <path key="a" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14h6" />],
  ['memory', 'Open project memory', <path key="a" d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM8 20a3 3 0 0 1-3-3" />],
  ['rewind', 'Checkpoints: rewind files to an earlier turn', <path key="a" d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 8v4l3 2" />],
  ['agents', 'Open the agent tree', <path key="a" d="M12 4v5M6 20v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M12 9v5M4 20h4M16 20h4" />],
];

const TG = {
  autopilot: 'M13 3 4 14h7l-1 7 9-11h-7z',
  boss: 'M12 4v5M6 20v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M12 9v5',
  loop: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  tests: 'M9 12l2 2 4-4M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
};

// one glass toggle: icon + label, luminous when on
function Tg({ k, label, on, disabled, title, onClick, cls = '' }) {
  return (
    <motion.button type="button" layout className={'agt-tg ' + cls + (on ? ' on' : '')} aria-pressed={on} disabled={disabled} data-tip={title} aria-label={label + ': ' + title} onClick={onClick} whileTap={disabled ? undefined : { scale: 0.96 }} transition={spring}>
      <AnimatePresence initial={false}>{on && <motion.span key="g" className="agt-glow" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={springSoft} />}</AnimatePresence>
      <span className="agt-ic"><Ico><path d={TG[k]} /></Ico></span><span className="agt-lb">{label}</span>
    </motion.button>
  );
}

export default function AgentTools({ sid }) {
  const [o, setO] = useState(() => read(sid));
  useEffect(() => { setO(read(sid)); }, [sid]);
  const set = (p) => { const n = { ...o, ...p }; setO(n); try { localStorage.setItem(KEY(sid), JSON.stringify(n)); } catch { /* ignore */ } };
  const act = (k) => {
    if (k === 'memory') {
      setState({ tab: 'rules' });
      let n = 0; const go = () => { const el = document.getElementById('memory'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); else if (n++ < 20) setTimeout(go, 100); };
      return void setTimeout(go, 150);
    }
    if (k === 'rewind') return openPanel('checkpoints');
    if (k === 'agents') return call('subagents:list', sid).then((l) => (l.length ? setSubsOpen(true) : addSystemCard(<div>No subagents in this session yet</div>))).catch(() => {});
    call('chat:send', sid, PROMPTS[k], [], { queue: true }).catch(() => {});
  };
  const ap = !!o.autopilot, boss = ap || o.boss, loop = ap || o.loop, tests = ap || o.runTests;
  const mk = ap ? 'apMax' : 'loopMax', mx = o[mk];
  const inc = 'Included in Autopilot';
  return (
    <div className="agt" role="toolbar" aria-label="Agent tools">
      <motion.div layout className="agt-grp" role="group" aria-label="Agent modes" transition={spring}>
        <Tg k="autopilot" label="Autopilot" cls="ap" on={ap} title="Runs unattended with Super Auto access: plan, build with subagents, test, review, repeat until done" onClick={() => set({ autopilot: !ap })} />
        <Tg k="boss" label="Boss" on={boss} disabled={ap} title={ap ? inc : 'Split the work across subagents'} onClick={() => set({ boss: !o.boss })} />
        <Tg k="loop" label="Loop" on={loop} disabled={ap} title={ap ? inc : 'Keep iterating until the goal is met'} onClick={() => set({ loop: !o.loop })} />
        <AnimatePresence initial={false}>
          {loop && <motion.span key="st" className="agt-more" layout initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} transition={springSoft}>
            <span className="tg-step" role="group" aria-label="Maximum iterations">
              <button type="button" aria-label="Fewer iterations" disabled={mx <= 1} onClick={() => set({ [mk]: mx - 1 })}>-</button>
              <output aria-label="Maximum iterations">{mx}</output>
              <button type="button" aria-label="More iterations" disabled={mx >= 20} onClick={() => set({ [mk]: mx + 1 })}>+</button>
            </span>
            <Tg k="tests" label="Tests" on={tests} disabled={ap} title={ap ? inc : 'Run the project tests after each loop iteration'} onClick={() => set({ runTests: !o.runTests })} />
          </motion.span>}
        </AnimatePresence>
      </motion.div>
      <div className="agt-grp agt-tools" role="group" aria-label="Actions">
        {ACTS.map(([k, t, d]) => <button key={k} type="button" className="agt-ib" data-tip={t} title={t} aria-label={t} onClick={() => act(k)}><Ico>{d}</Ico></button>)}
      </div>
    </div>
  );
}
