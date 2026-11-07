// (0.24) The campaign, told by Super Earth Special Forces command (0.53: Operation Sweet Liberty; it was Operation Freedom Vista
// on Fronteria, five chapters). Every chapter is a set mission
// (the enemy, the ground, the map, the hour and the objective) with a briefing before it and a debrief after it, played like the
// tutorial's cinematics, and the cast on the radio during it. A chapter starts a session; the chapters after it are that session's
// next missions, in order; after the last one the session goes on as usual. (0.37) Progress is kept on the browser (session.js).
//
// cast: who speaks. Their names and units stay as they are in every language; tag is the short name on the radio, col its colour.
export const CAST = {
  ramzies: { name: 'GENERAL RAMZIES', unit: 'cast.u.ramzies', tag: 'RAMZIES', col: '#ffe600' },
  ktl: { name: 'KTL', unit: 'cast.u.ktl', tag: 'KTL', col: '#9fd3ff' },
  rudolph: { name: 'RUDOLPH THE RED', unit: 'cast.u.rudolph', tag: 'RUDOLPH', col: '#ff6a5a' },
  neonboot: { name: 'NEONBOOT', unit: 'cast.u.neonboot', tag: 'NEONBOOT', col: '#7dffb0' },
  mota: { name: 'MOTA', unit: 'cast.u.mota', tag: 'MOTA', col: '#c9b8ff' },
  // (0.28) the tutorial's voices on the command radio: Base Tharsis, Mars
  tharsis: { name: 'THARSIS CONTROL', unit: 'cast.u.tharsis', tag: 'THARSIS', col: '#ffd24a' },
  pelican: { name: 'PELICAN LEAD', unit: 'cast.u.pelican', tag: 'PELICAN', col: '#9fd3ff' },
  sarge: { name: 'SEAF SERGEANT', unit: 'cast.u.sarge', tag: 'SEAF SGT', col: '#7dffb0' },
};
export const CAST_ORDER = ['ramzies', 'ktl', 'rudolph', 'neonboot', 'mota'];

// Each chapter: play (the mission), brief / win / lose (who says each line of the cinematic, in order; the text is
// cp.<id>.c<n>.<part><k> in the language files), and night for a scene on the planet's dark side.
// (0.53) Operation Sweet Liberty: the Illuminate close in on Super Earth, and the one answer is a planetary defence gun on the
// outskirts of the capital. Ten chapters in three arcs and a finale, each arc on one world (named by its ground, not by name):
// E-710 fuel from the bugs on the dunes, scrap parts from the bots on the glaciers, and the squids' vanguard broken in the jungle
// on the road to the capital; then the gun is held in the capital while it brings down the mothership. The tutorial teaches the
// basics, so the chapters teach only what is new in them (teach).
const B5 = ['ramzies', 'ktl', 'neonboot', 'mota', 'ramzies'], W3 = ['rudolph', 'neonboot', 'ramzies'], L2 = ['rudolph', 'ramzies'];
export const STORY = {
  id: 'liberty',
  chapters: [
    { n: 1, arc: 'desert', play: { faction: 'bugs', biome: 'desert', seed: 7301, objective: 'oil', tod: 9, boss: false }, teach: ['build', 'supply'], brief: B5, win: W3, lose: L2 },
    { n: 2, arc: 'desert', play: { faction: 'bugs', biome: 'desert', seed: 7333, objective: 'vip', tod: 17 }, teach: ['uav', 'escort'], brief: B5, win: W3, lose: L2 },
    { n: 3, arc: 'desert', play: { faction: 'bugs', biome: 'desert', seed: 7367, objective: 'fortress', tod: 12, jammer: true }, teach: ['bases', 'sides', 'jammer', 'hellbomb'], brief: B5, win: W3, lose: L2 },
    { n: 4, arc: 'ice', play: { faction: 'bots', biome: 'ice', seed: 7401, objective: 'cannon', tod: 10 }, teach: ['cover', 'garrison'], brief: B5, win: W3, lose: L2 },
    { n: 5, arc: 'ice', play: { faction: 'bots', biome: 'ice', seed: 7433, objective: 'evac', tod: 15 }, teach: ['demolish'], brief: B5, win: W3, lose: L2 },
    { n: 6, arc: 'ice', play: { faction: 'bots', biome: 'ice', seed: 7469, objective: 'nuke', tod: 19 }, teach: ['hold', 'time'], brief: B5, win: W3, lose: L2 },
    { n: 7, arc: 'jungle', play: { faction: 'squids', biome: 'jungle', seed: 7503, objective: 'dome', tod: 8 }, teach: [], brief: B5, win: W3, lose: L2 },
    { n: 8, arc: 'jungle', play: { faction: 'squids', biome: 'jungle', seed: 7537, objective: 'vip', tod: 22 }, night: true, teach: ['night', 'flare'], brief: B5, win: W3, lose: L2 },
    { n: 9, arc: 'jungle', play: { faction: 'squids', biome: 'jungle', seed: 7571, objective: 'fortress', tod: 13 }, teach: [], brief: B5, win: W3, lose: L2 },
    { n: 10, arc: 'city', play: { faction: 'squids', biome: 'city', seed: 7601, objective: 'gun', tod: 18, boss: false }, teach: [], brief: B5, win: W3, lose: L2, finale: true },
  ],
};

// Which chapter mission n (1, 2, ...) of a story session is, or null once the story has run out.
export function chapterFor(session, n) {
  if (!session || !session.story) return null;
  const k = session.story.ch + (n - 1);
  return STORY.chapters.find((c) => c.n === k && c.play) || null;
}
