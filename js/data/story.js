// (0.24) The campaign. (0.27) Operation Freedom Vista, told by Super Earth Special Forces command, on Fronteria (Umlaut Sector,
// planet 270 of the Helldivers 2 galaxy: a desert-oasis world, a nuclear test range in the First Galactic War, Class A resorts
// going up when the Predator Strain hit in May 2186). Every chapter is a set mission
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
// cp.ember.c<n>.<part><k> in the language files), and night for a scene on the planet's dark side.
export const STORY = {
  id: 'ember',      // (the id from 0.24: the language keys are cp.ember.*)
  planet: 'fronteria',
  // (0.38) Five chapters, each a kind of mission the player has not flown yet, and each teaching a few things through the cast on
  // the radio, at the moment they matter (teach: the topics, campaign.js CastRadio; their lines are teach.<topic> and
  // teach.<topic>.tip). play.boss: false keeps a super heavy out; play.jammer: true puts a jammer site on the map; play.hb: false
  // keeps the Hellbomb's side jobs off the map until the chapter that teaches it (no jammer, and broadcast towers fall to guns).
  chapters: [
    { n: 1, play: { faction: 'bugs', biome: 'desert', seed: 7042, objective: 'evac', tod: 9, hb: false },
      teach: ['gun', 'seaf', 'orbital', 'orders', 'lives', 'extract'],
      brief: ['ramzies', 'ktl', 'neonboot', 'mota', 'rudolph', 'ramzies'],
      win: ['rudolph', 'neonboot', 'mota', 'ramzies'],
      lose: ['rudolph', 'ktl', 'ramzies'] },
    { n: 2, play: { faction: 'bugs', biome: 'desert', seed: 7077, objective: 'oil', tod: 14, boss: false, hb: false },
      teach: ['build', 'garrison', 'cover', 'supply', 'demolish'],
      brief: ['ramzies', 'ktl', 'neonboot', 'mota', 'rudolph', 'ramzies'],
      win: ['rudolph', 'neonboot', 'mota', 'ramzies'],
      lose: ['rudolph', 'ktl', 'ramzies'] },
    { n: 3, play: { faction: 'bugs', biome: 'desert', seed: 7113, objective: 'vip', tod: 23, hb: false }, night: true,
      teach: ['night', 'uav', 'escort', 'flare'],
      brief: ['ramzies', 'ktl', 'neonboot', 'mota', 'rudolph', 'ramzies'],
      win: ['rudolph', 'neonboot', 'mota', 'ramzies'],
      lose: ['rudolph', 'ktl', 'ramzies'] },
    { n: 4, play: { faction: 'bugs', biome: 'desert', seed: 7151, objective: 'fortress', tod: 7, boss: false, jammer: true },
      teach: ['bases', 'sides', 'jammer', 'hellbomb'],
      brief: ['ramzies', 'ktl', 'neonboot', 'mota', 'rudolph', 'ramzies'],
      win: ['rudolph', 'neonboot', 'mota', 'ramzies'],
      lose: ['rudolph', 'ktl', 'ramzies'] },
    { n: 5, play: { faction: 'bugs', biome: 'desert', seed: 7187, objective: 'nuke', tod: 18 },
      teach: ['hold', 'time'],
      brief: ['ramzies', 'ktl', 'neonboot', 'mota', 'rudolph', 'ramzies'],
      win: ['rudolph', 'neonboot', 'mota', 'ktl', 'ramzies'],
      lose: ['rudolph', 'mota', 'ramzies'] },
  ],
};

// Which chapter mission n (1, 2, ...) of a story session is, or null once the story has run out.
export function chapterFor(session, n) {
  if (!session || !session.story) return null;
  const k = session.story.ch + (n - 1);
  return STORY.chapters.find((c) => c.n === k && c.play) || null;
}
