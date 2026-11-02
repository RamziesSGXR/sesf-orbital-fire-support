// (0.24) The campaign's test story, while the real campaign is built. A chapter that can be played starts a session whose first
// mission is set (the enemy, the ground, the map and the objective); the session then goes on as usual. Nothing is saved yet.
export const STORY = {
  id: 'ember',
  chapters: [
    { n: 1, play: { faction: 'bugs', biome: 'grass', seed: 7042, objective: 'evac' } },
    { n: 2 },
    { n: 3 },
  ],
};
