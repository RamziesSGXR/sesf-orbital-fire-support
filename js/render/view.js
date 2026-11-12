// (0.61.5) What the player is doing, for the map's drawing: less is drawn while a building or a drop is being placed (the zones
// that have nothing to do with it go, so the ghost and the ground can be seen). Set by the renderer once a frame.
export const VIEW = { quiet: false, squad: false };
