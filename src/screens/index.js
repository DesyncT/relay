import Usage from './Usage.jsx';
import Chat from './Chat.jsx';
import Agents from './Agents.jsx';
import Rules from './Rules.jsx';
import Settings from './Settings.jsx';

// One file per screen so ports can land independently. `themes` lives under Settings and `skills` under
// Rules (see TAB_HOME in the legacy index.html), so they are sub-views of these, not separate screens.
export const SCREENS = { usage: Usage, chat: Chat, agents: Agents, rules: Rules, settings: Settings };
