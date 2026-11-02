// (0.24) The campaign. (0.27) Operation Ember Line, told by Super Earth Special Forces command: every chapter is a set mission
// (the enemy, the ground, the map, the hour and the objective) with a briefing before it and a debrief after it, played like the
// tutorial's cinematics, and the cast on the radio during it. A chapter starts a session; the chapters after it are that session's
// next missions, in order; after the last one the session goes on as usual. Nothing is saved yet.
//
// cast: who speaks. Their names and units stay as they are in every language; tag is the short name on the radio, col its colour.
export const CAST = {
  ramzies: { name: 'GENERAL RAMZIES', unit: 'cast.u.ramzies', tag: 'RAMZIES', col: '#ffe600' },
  ktl: { name: 'KTL', unit: 'cast.u.ktl', tag: 'KTL', col: '#9fd3ff' },
  rudolph: { name: 'RUDOLPH THE RED', unit: 'cast.u.rudolph', tag: 'RUDOLPH', col: '#ff6a5a' },
  neonboot: { name: 'NEONBOOT', unit: 'cast.u.neonboot', tag: 'NEONBOOT', col: '#7dffb0' },
  mota: { name: 'MOTA', unit: 'cast.u.mota', tag: 'MOTA', col: '#c9b8ff' },
};
export const CAST_ORDER = ['ramzies', 'ktl', 'rudolph', 'neonboot', 'mota'];

// Each chapter: play (the mission), brief / win / lose (who says each line of the cinematic, in order; the text is
// cp.ember.c<n>.<part><k> in the language files), and night for a scene on the planet's dark side.
export const STORY = {
  id: 'ember',
  chapters: [
    { n: 1, play: { faction: 'bugs', biome: 'grass', seed: 7042, objective: 'evac', tod: 9 },
      brief: ['ramzies', 'ktl', 'neonboot', 'mota', 'rudolph', 'ramzies'],
      win: ['rudolph', 'neonboot', 'mota', 'ramzies'],
      lose: ['rudolph', 'ktl', 'ramzies'] },
    { n: 2, play: { faction: 'bugs', biome: 'grass', seed: 7113, objective: 'vip', tod: 23 }, night: true,
      brief: ['ramzies', 'ktl', 'neonboot', 'mota', 'rudolph', 'ramzies'],
      win: ['rudolph', 'neonboot', 'mota', 'ramzies'],
      lose: ['rudolph', 'ktl', 'ramzies'] },
    { n: 3, play: { faction: 'bugs', biome: 'grass', seed: 7187, objective: 'nuke', tod: 18 },
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
