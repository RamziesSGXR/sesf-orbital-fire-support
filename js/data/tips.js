// The loading screen: what is going on, and one tip at a time. Tips stick to what a player can use: how to fight, what the
// armory can do, and how each enemy fights. No numbers about the game's insides.
import { FACTIONS } from './data.js';
import { t, tl } from '../i18n.js';

// The tip lists live in the language tables (tip.<group>); the groups are the same in every language.
const TIPS = new Proxy({}, { get: (_, k) => tl('tip.' + String(k)) });

// What is going on this mission, in a few plain sentences.
export function situation(info, objectives) {
  const f = FACTIONS[info.faction];
  const job = objectives.map((o) => t('job.' + o));
  const jobText = job.length > 1 ? t('job.then', { a: job[0], b: job[1] }) : job[0] || t('job.any');
  return [t('sit.1', { full: f.full, biome: t(`biome.${info.biome}.the`), job: jobText }), t('sit.2'), t('sit.3')];
}

// The tips for this mission, in the order they are shown: something about this enemy or objective first (the basics first on
// the first two missions), then the rest shuffled.
export function tipsFor(info, objectives, missionN, rand = Math.random) {
  const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  const own = shuffle([...(TIPS[info.faction] || []), ...objectives.flatMap((o) => TIPS[o] || [])]);
  const rest = shuffle([...TIPS.fight, ...TIPS.upgrade, ...(missionN > 2 ? TIPS.basics : [])]);
  const lead = missionN <= 2 ? shuffle(TIPS.basics).slice(0, 2) : [];
  const out = [...lead, own.shift(), ...own.slice(0, 1)];
  const pool = shuffle([...own.slice(1), ...rest]);
  for (const tip of pool) if (!out.includes(tip)) out.push(tip);
  return out.filter(Boolean);
}
