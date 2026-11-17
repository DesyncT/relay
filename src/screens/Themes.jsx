import BackgroundSettings from '../components/settings/BackgroundSettings.jsx';
import '../styles/settings.css';

export default function Themes() {
  return <div id="themes">
    <div className="page-head"><div><h2>Background</h2><p>Add atmosphere behind your conversation.</p></div></div>
    <BackgroundSettings />
  </div>;
}
