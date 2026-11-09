
// Two independent signals finding a shared direction: Relay's own visual signature.
export function RelaySignal({ compact = false }) {
  return <svg className={'relay-signal' + (compact ? ' compact' : '')} viewBox="0 0 480 200" fill="none" aria-hidden="true">
    <path className="signal-guide" d="M0 100h480M240 0v200" />
    {['M20 45C132 45 138 145 240 100S360 45 460 45', 'M20 155C132 155 138 55 240 100S360 155 460 155'].map((d, i) => <g key={d}>
      <path className="signal-track" d={d} />
      <path className={'signal-run signal-run-' + i} d={d} strokeDasharray="34 520" />
    </g>)}
    <circle className="signal-ring" cx="240" cy="100" r="27" />
    <rect className="signal-core" x="230" y="90" width="20" height="20" rx="5" transform="rotate(45 240 100)" />
    <path className="signal-mark" d="m234 100 4 4 8-8" />
  </svg>;
}

const STARTERS = [
  ['Build something new', 'Help me build '],
  ['Improve this project', 'Review this project and suggest the most valuable improvement.'],
  ['Find and fix a bug', 'Help me investigate a bug: '],
];
export default function ConversationStart({ sid }) {
  const compose = text => window.dispatchEvent(new CustomEvent('relay:compose', { detail: text }));
  return <div className="conversation-start" id="empty">
    <RelaySignal />
    <h2>Build with your agents</h2>
    <p>{sid ? 'Describe a change, ask a question, or investigate a bug in this project.' : 'Open a project in the sidebar. Give your next idea a place to begin.'}</p>
    {sid && <div className="start-actions">{STARTERS.map(([label, text]) => <button key={label} type="button" onClick={() => compose(text)}><span>{label}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></button>)}</div>}
  </div>;
}
