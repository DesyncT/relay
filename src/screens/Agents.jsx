import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call } from '../api.js';
import { Icon } from '../components/icons.jsx';
import Procs from '../components/agents/Procs.jsx';
import { item, spring, stagger } from '../motion.js';
import '../styles/agents.css';

const TEMPLATE = (n) => `---\nname: ${n}\ndescription: When to use this agent\nmodel: inherit\ntools: Read, Grep, Glob\n---\n\nYou are ${n}. Describe its job here.\n`;

export default function Agents() {
  const [list, setList] = useState(null);
  const [current, setCurrent] = useState(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [task, setTask] = useState('');
  const nameRef = useRef(null);
  const load = () => call('agents:list').then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const pick = (a) => { setCurrent(a.name); setName(a.name); setText(a.text); };
  const add = () => { setCurrent(null); setName('my-agent'); setText(TEMPLATE('my-agent')); nameRef.current?.focus(); };
  const save = async () => {
    try { const n = name.trim(); await call('agents:save', n, text); setCurrent(n); load(); } catch (e) { alert(e.message); }
  };
  const del = async () => {
    const n = name.trim();
    if (n && confirm(`Delete ${n}.md?`)) { await call('agents:delete', n); setCurrent(null); setName(''); setText(''); load(); }
  };
  const run = () => {
    const n = name.trim(), t = task.trim();
    if (n && t) { call('agents:run', n, t); setTask(''); }
  };

  return (
    <>
      <div className="page-head"><div><h2>Subagents</h2><p>Reusable agent definitions · Results appear in the active chat</p></div></div>
      <div className="grid2">
        <div>
          <button className="b" id="newAgent" style={{ width: '100%', justifyContent: 'center' }} onClick={add}><Icon d="M12 5v14M5 12h14" />New subagent</button>
          <motion.div id="agentList" className="list ag-list" variants={stagger(0.04)} initial="initial" animate="animate">
            {list && !list.length && <div className="side-label">No subagents yet</div>}
            {list?.map((a) => (
              <motion.div key={a.name} variants={item} layout className={'card' + (a.name === current ? ' on' : '')} tabIndex={0} role="button"
                onClick={() => pick(a)} onKeyDown={(e) => e.key === 'Enter' && pick(a)} whileTap={{ scale: 0.985 }}>
                {a.name === current && <motion.span layoutId="ag-ind" className="ag-ind" transition={spring} />}
                <b>{a.name}</b><small>{`${a.model} · ${a.desc}`}</small>
              </motion.div>
            ))}
          </motion.div>
          <h3>Running</h3>
          <Procs />
        </div>
        <div className="panel">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={current ?? '__new'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
              <label htmlFor="agentName">Name</label>
              <input id="agentName" ref={nameRef} placeholder="my-agent" value={name} onChange={(e) => setName(e.target.value)} />
              <label htmlFor="agentText">Definition</label>
              <textarea id="agentText" rows={16} value={text} onChange={(e) => setText(e.target.value)} />
            </motion.div>
          </AnimatePresence>
          <div className="row-actions">
            <button className="b" id="saveAgent" onClick={save}>Save</button>
            <button className="b danger" id="delAgent" onClick={del}>Delete</button>
          </div>
          <label htmlFor="agentTask">Task</label>
          <div className="compose">
            <textarea id="agentTask" placeholder="What should this subagent do" value={task} onChange={(e) => setTask(e.target.value)} />
            <button className="b primary" id="runAgent" onClick={run}>Run</button>
          </div>
        </div>
      </div>
    </>
  );
}
