import { useCallback, useEffect, useState } from 'react';
import { call, useIpcEvent } from '../../api.js';
import { useChat } from '../../chat/chatStore.js';
import { useSaved } from './Saved.jsx';

// Project memory (.relay/memory.md) for the active session, or the global memory shared by every project.
// Agents append to the project file, so reload on memory:update.
export default function Memory() {
  const sid = useChat((s) => s.sid);
  const [scope, setScope] = useState('project');
  const g = scope === 'global';
  const [m, setM] = useState(null), [text, setText] = useState(''), [dirty, setDirty] = useState(false), [ok, flash] = useSaved();
  const load = useCallback(() => (g || sid) ? (g ? call('memory:getGlobal') : call('memory:get', sid)).then((r) => { setM(r); setText(r?.text || ''); setDirty(false); }).catch(() => setM(null)) : setM(null), [g, sid]);
  useEffect(() => { setM(null); load(); }, [load]);
  useIpcEvent('memory:update', (d) => { if (!g && d?.sid === sid && !dirty) load(); });
  const save = async () => { try { await (g ? call('memory:saveGlobal', text) : call('memory:save', sid, text)); setDirty(false); flash(); } catch (e) { alert(e.message); } };
  const tab = (k, t) => <button type="button" role="tab" aria-selected={scope === k} onClick={() => { setScope(k); setDirty(false); }}>{t}</button>;
  return (
    <div id="memory" className="panel">
      <div className="mem-tabs" role="tablist" aria-label="Memory scope">{tab('project', 'This project')}{tab('global', 'Everywhere')}</div>
      <div className="rule-head">
        <div><label htmlFor="memText" style={{ margin: 0, color: 'var(--text)', fontSize: 15 }}>{g ? 'Global memory' : 'Project memory'}</label><p title={m?.path}>{m?.path || (!g && !sid ? 'Open a session to edit its project memory' : 'Not available')}</p></div>
        <div>{ok}<button className="b" disabled={!m || !dirty} onClick={save}>Save</button></div>
      </div>
      <textarea id="memText" rows={10} value={text} disabled={!m} placeholder={g ? 'Facts every agent should remember in every project' : 'Facts every agent should remember about this project'} onChange={(e) => { setText(e.target.value); setDirty(true); }} />
    </div>
  );
}
