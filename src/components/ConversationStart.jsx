const STARTERS = [
  ['Build something new', 'Help me build '],
  ['Improve this project', 'Review this project and suggest the most valuable improvement.'],
  ['Find and fix a bug', 'Help me investigate a bug: '],
];
export default function ConversationStart({ sid }) {
  const compose = text => window.dispatchEvent(new CustomEvent('relay:compose', { detail: text }));
  return <div className="conversation-start" id="empty">
    <h2>Build with your agents</h2>
    <p>{sid ? 'Describe a change, ask a question, or investigate a bug in this project.' : 'Open a project in the sidebar. Give your next idea a place to begin.'}</p>
    {sid && <div className="start-actions">{STARTERS.map(([label, text]) => <button key={label} type="button" onClick={() => compose(text)}><span>{label}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></button>)}</div>}
  </div>;
}
