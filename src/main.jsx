import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import './styles/base.css';
import '../sidebar.css';
import '../panels.css';
import '../chrome.css';
import '../workbench.css';
import '../sidebar-polish.css';
import '../themes.css';
import './styles/app.css';
import './styles/settings.css';
import './styles/globals.css';
import { applyStoredTheme } from './theme/themeStore.js';
import App from './App.jsx';

applyStoredTheme();

createRoot(document.getElementById('root')).render(
  <MotionConfig reducedMotion="user"><App /></MotionConfig>
);
