import { motion } from 'framer-motion';
import { setState, useStore } from '../../store.js';
import { spring } from '../../motion.js';

const PAIRS = [[['rules', 'Rules'], ['skills', 'Skills']], [['settings', 'Settings'], ['themes', 'Themes']]];

// Rules<->Skills and Settings<->Themes switcher above the page (legacy renderTabPair).
export default function TabPair() {
  const tab = useStore((s) => s.tab);
  const pair = PAIRS.find((p) => p.some((x) => x[0] === tab));
  if (!pair) return null;
  return (
    <div id="tabpair" className="tabpair">
      {pair.map(([id, name]) => (
        <button key={id} type="button" className={id === tab ? 'on' : ''} onClick={() => setState({ tab: id })}>
          {id === tab && <motion.span layoutId="tabpair-pill" className="tp-pill" transition={spring} />}
          <span>{name}</span>
        </button>
      ))}
    </div>
  );
}
