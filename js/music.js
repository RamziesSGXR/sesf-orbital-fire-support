// (0.29, 0.30, 0.33) Music, made the way the trailer's score was: no audio files, everything synthesised live from oscillators and
// noise. Each part of the game has its own cue, and the game moves between them:
//   ORBIT (the menus and the armory): 84 BPM, D minor. A music-box bell arpeggio over a soft pad, and every other time round a
//     slow melody on a soft lead.
//   BRIEFING (the loading screen, while the mission is made): 100 BPM, suspended chords. A clock ticking, a low pulse on the beat,
//     data blips and a slow swell every four bars: waiting to drop.
//   DROP (the start of a match, once): 120 BPM, 10 s. A riser and a snare roll, a hellpod whoosh, then the drop: a braam, a crash
//     and a march for three bars, which hands over to the battle music.
//   BATTLE (a match, Dynamic): a theme for each enemy, each with two sections that take turns, so it doesn't go round the same
//     sixteen seconds. It follows the fight: drone and pad when it's quiet, a pulse when the enemy closes on the squad, the theme's
//     own colour and drums in a firefight, and in a heavy one everything, with a braam on each chord change.
//       BUG HUNT (Terminids): 120 BPM, A minor. Tribal drums and toms, a skittering hat.
//       IRON FRONT (Automatons): 128 BPM, C minor. A square-wave bass line, metal clanks, four on the floor.
//       COLD LIGHT (Illuminate): 112 BPM, F# minor. A shimmering arpeggio, rim clicks, a deep sine pulse.
//   SWARM (a ton of enemies on screen): 140 BPM, E Phrygian, two sections. A 16th-note ostinato, double-time drums, a braam every
//     bar and a fill every four. In when the screen fills up, back to BATTLE once it has thinned out for a while.
//   VICTORY (a win, and its debrief): 96 BPM, A major. A braam and rising bells, then an anthem on a bright lead.
//   FALLEN (a loss, the end of a session, Mars glassed): 64 BPM, D minor. A low braam, a slow horn line, a funeral drum.
// (0.33) Transitions are smooth: every cue plays on its own deck. A change waits for the end of the bar (or the beat, when the
// bar is long or the moment is urgent), then the old deck plays on a little while it fades and the new one fades in. Going into
// SWARM, the old bar ends on a riser. In BATTLE a change of level lands on the bar too, with a snare fill when it goes up, and the
// layers fade in and out over a second or two; after DROP the battle music keeps up its drums for four bars before it settles.
// Ambient keeps a match calm (BATTLE's quiet layers only: no DROP, no SWARM). A super heavy arriving gets a braam of its own.
// Cinematics and the pause turn the music down. Notes are scheduled a little ahead on the audio clock (a 90 ms timer fills the
// next 0.3 s), so a busy frame doesn't make it stumble.
export const MUSIC_STYLES = ['dynamic', 'ambient', 'off'];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CH = (root, pad) => ({ root: mtof(root), pad: pad.map(mtof) });     // a chord: the drone's root and the pad's three notes
const LAYERS = ['drone', 'pad', 'bell', 'lead', 'pulse', 'drums', 'hats', 'color'];
// the swarm comes in at about this much on screen (light 1, medium 1.6, heavy 3; a desktop-sized view) and goes at the second
export const SWARM_IN = 80, SWARM_OUT = 55;

// melodies: [step, midi note, length in 16ths]
const MENU_MEL = [[0, 74, 8], [8, 77, 8], [16, 81, 12], [28, 79, 4], [32, 77, 8], [40, 74, 8], [48, 77, 16], [64, 81, 8], [72, 84, 8],
  [80, 81, 12], [92, 79, 4], [96, 76, 8], [104, 79, 8], [112, 76, 16]];
const WIN_MEL = [[0, 76, 4], [4, 81, 4], [8, 85, 8], [16, 83, 8], [24, 81, 8], [32, 80, 8], [40, 83, 8], [48, 76, 16], [64, 78, 8],
  [72, 81, 8], [80, 85, 12], [92, 83, 4], [96, 81, 8], [104, 78, 8], [112, 76, 16]];
const LOSE_MEL = [[0, 69, 16], [16, 65, 8], [24, 64, 8], [32, 67, 16], [48, 70, 8], [56, 69, 8], [64, 65, 16], [80, 62, 8], [88, 65, 8],
  [96, 64, 12], [108, 61, 4], [112, 57, 16]];
const PULSE = [2, 2, 4, 2, 2, 3, 2, 4];                                          // a pulse's notes, as multiples of the root, one per 8th
const SWARM_OST = [1, 1, 2, 1, 1, 1, 1.5, 1, 1, 1, 2, 1, 1.0595, 1, 1.5, 2];   // the swarm's 16th-note ostinato over the root (x2)
const IRON_BASS = [1, 1, 2, 1, 1.5, 1, 2, 1.5];                                 // Iron Front's square bass, one per 8th
const melody = (D, mel, i, t, kind, a) => { for (const [s, n, len] of mel) if (s === i) D.lead(t, mtof(n), len * D.stepDur, a, kind); };
const sec = (per, chords) => ({ per, chords, len: per * chords.length });

// A battle theme's levels: how loud each layer is at level 0..3 (Ambient: the quiet ones only).
const battleMix = (D, extra = {}) => {
  const lv = D.level, amb = D.M.style === 'ambient';
  if (amb) return { drone: 0.8, pad: 0.9, bell: 0.45 };
  return {
    drone: [0.55, 0.65, 0.85, 1][lv], pad: [0.55, 0.45, 0.35, 0.3][lv],
    pulse: lv >= 1 ? 1 : 0, color: lv >= 2 ? (lv >= 3 ? 1 : 0.7) : lv >= 1 ? (extra.color1 || 0) : 0,
    drums: lv >= 2 ? (lv >= 3 ? 1 : 0.75) : 0, hats: lv >= 3 ? 1 : 0, bell: extra.bell || 0,
  };
};
// what every battle theme does on a bar's last beat when the level is about to go up: a snare fill
const fillUp = (D, i, t) => { if (i % 16 >= 12 && D.M.level > D.level && D.level >= 1) D.snare(t, 0.3 + 0.12 * (i % 16 - 12)); };

const THEMES = {
  bugs: {     // BUG HUNT
    bpm: 120, sections: [sec(32, [CH(33, [57, 60, 64]), CH(29, [53, 57, 60]), CH(31, [55, 59, 62]), CH(28, [52, 55, 59])]),     // Am F G Em
      sec(32, [CH(38, [57, 62, 65]), CH(33, [57, 60, 64]), CH(28, [52, 56, 59]), CH(28, [52, 56, 59])])],                         // Dm Am E E
    mix: (D) => battleMix(D),
    play(D, i, t, ch) {
      const bar = i % 16, lv = D.level, g = D.gains;
      if (i % 32 === 0 && lv >= 3) D.braam(t, ch.root, 2.6, 0.55);
      if (g.bell > 0 && i % 16 === 0) D.bell(t, ch.pad[[0, 1, 2, 1, 2, 0, 1, 2][(i / 8) % 8]] * 2, 0.07);
      if (g.pulse > 0 && i % 2 === 0) D.pluck(t, ch.root * PULSE[(i / 2) % 8], bar === 0 ? 1 : 0.65);
      if (g.drums > 0) {
        if (bar === 0 || bar === 8) D.taiko(t, 1); else if (bar === 6 || bar === 14) D.taiko(t, 0.55);
        else if (lv >= 3 && (bar === 11 || bar === 3)) D.taiko(t, 0.45);
        if (lv >= 3 && (bar === 4 || bar === 12)) D.snare(t, 0.8);
      }
      if (g.color > 0 && [3, 7, 10, 13].includes(bar)) D.tom(t, bar === 10 ? 0.9 : 0.6, bar === 13 ? 150 : 190);     // the toms
      if (g.hats > 0) { D.hat(t, bar % 4 === 0 ? 1 : bar % 2 === 0 ? 0.6 : 0.35); if (bar % 4 === 3) D.hat(t + D.stepDur / 2, 0.3); }   // a skitter
      fillUp(D, i, t);
    },
  },
  bots: {     // IRON FRONT
    bpm: 128, sections: [sec(32, [CH(36, [55, 60, 63]), CH(32, [56, 60, 63]), CH(34, [58, 62, 65]), CH(31, [55, 59, 62])]),     // Cm Ab Bb G
      sec(32, [CH(29, [56, 60, 65]), CH(36, [55, 60, 63]), CH(32, [56, 60, 63]), CH(31, [55, 59, 62])])],                         // Fm Cm Ab G
    mix: (D) => battleMix(D),
    play(D, i, t, ch) {
      const bar = i % 16, lv = D.level, g = D.gains;
      if (i % 32 === 0 && lv >= 3) D.braam(t, ch.root, 2.4, 0.55);
      if (g.pulse > 0 && i % 2 === 0) D.pluck(t, ch.root * IRON_BASS[(i / 2) % 8], bar === 0 ? 1 : 0.7, 0.16, 'square');
      if (g.drums > 0) {
        if (lv >= 3 ? bar % 4 === 0 : bar === 0 || bar === 8 || bar === 10) D.taiko(t, bar === 0 ? 1 : 0.75);
        if (bar === 4 || bar === 12) D.snare(t, 0.85);
      }
      if (g.color > 0 && (bar === 6 || bar === 14 || (lv >= 3 && bar === 11))) D.clank(t, bar === 14 ? 1 : 0.7);
      if (g.hats > 0 && bar % 2 === 1) D.hat(t, bar % 4 === 3 ? 0.9 : 0.6);
      fillUp(D, i, t);
    },
  },
  squids: {   // COLD LIGHT
    bpm: 112, sections: [sec(32, [CH(30, [57, 61, 66]), CH(38, [57, 62, 66]), CH(35, [59, 62, 66]), CH(37, [56, 61, 65])]),     // F#m D Bm C#
      sec(32, [CH(35, [59, 62, 66]), CH(31, [55, 59, 62]), CH(28, [52, 55, 59]), CH(30, [54, 58, 61])])],                         // Bm G Em F#
    mix: (D) => battleMix(D, { color1: 0.6 }),
    play(D, i, t, ch) {
      const bar = i % 16, lv = D.level, g = D.gains;
      if (i % 32 === 0 && lv >= 3) D.braam(t, ch.root, 2.8, 0.5);
      if (g.color > 0) D.shimmer(t, ch.pad[[0, 1, 2, 1][i % 4]] * (i % 8 < 4 ? 4 : 2), bar % 4 === 0 ? 0.03 : 0.018);     // the arpeggio
      if (g.pulse > 0 && i % 4 === 0) D.pluck(t, ch.root * 2, bar === 0 ? 1 : 0.6, 0.3, 'sine');
      if (g.drums > 0) { if (bar === 0 || bar === 10) D.taiko(t, bar === 0 ? 1 : 0.7); if (bar === 4 || bar === 12) D.clock(t, 1.6); }
      if (lv >= 3 && (bar === 4 || bar === 12)) D.snare(t, 0.6);
      if (g.hats > 0) D.hat(t, bar % 4 === 0 ? 0.8 : 0.35);
      if (lv >= 2 && bar === 14 && (i >> 4) % 2 === 1) D.bell(t, ch.pad[2] * 4 * 1.122, 0.03);      // a glint, a whole tone up
      fillUp(D, i, t);
    },
  },
};

const CUES = {
  menu: {
    bpm: 84, sections: [sec(32, [CH(38, [57, 62, 65]), CH(34, [58, 62, 65]), CH(29, [57, 60, 65]), CH(36, [55, 60, 64])])],   // Dm Bb F C
    mix: () => ({ drone: 0.6, pad: 1, bell: 1, lead: 0.9 }),
    play(D, i, t, ch) {
      if (i % 2 === 0) { const k = [0, 1, 2, 3, 2, 1, 0, 1][(i / 2) % 8]; D.bell(t, k < 3 ? ch.pad[k] * 2 : ch.pad[0] * 4, i % 16 === 0 ? 0.05 : 0.032); }
      if (D.loops % 2 === 1) melody(D, MENU_MEL, i, t, 'soft', 0.07);
    },
  },
  loading: {
    bpm: 100, sections: [sec(32, [CH(33, [57, 59, 64]), CH(29, [57, 60, 64]), CH(36, [55, 60, 62]), CH(31, [55, 59, 64])])],   // Asus2 Fmaj7 Csus2 G6
    mix: () => ({ drone: 0.8, pad: 0.7, bell: 0.7, pulse: 0.6, hats: 0.8 }),
    play(D, i, t, ch) {
      const bar = i % 16;
      if (i % 2 === 0) D.clock(t, bar === 0 ? 1 : i % 4 === 0 ? 0.6 : 0.35);
      if (i % 4 === 0) D.pluck(t, ch.root * 2, bar === 0 ? 0.75 : 0.45);
      if (bar === 10 || bar === 11) D.bell(t, ch.pad[((i >> 4) + bar) % 3] * 4, 0.022);
      if (i === 96) D.riser(t, 32 * D.stepDur, 0.35);
    },
  },
  start: {
    bpm: 120, once: true, sections: [sec(16, [CH(33, [57, 60, 64]), CH(33, [57, 60, 64]), CH(33, [57, 60, 64]), CH(29, [53, 57, 60]), CH(31, [55, 59, 62])])],
    mix: () => ({ drone: 1, pad: 0.5, pulse: 1, drums: 1, hats: 0.8 }),
    play(D, i, t, ch) {
      const bar = i % 16;
      if (i === 0) D.riser(t, 32 * D.stepDur, 0.9);
      if (i < 32) {     // the build: a snare roll that tightens, a drum on each bar
        const every = i < 16 ? 4 : i < 24 ? 2 : 1;
        if (i % every === 0) D.snare(t, i < 16 ? 0.35 : i < 24 ? 0.5 : 0.3 + 0.07 * (i - 24));
        if (bar === 0) D.taiko(t, 0.6);
        if (i === 22) D.whoosh(t, 10 * D.stepDur, 0.9);     // the hellpod coming down
        return;
      }
      if (i === 32) { D.braam(t, ch.root, 3, 1); D.crash(t, 1); D.taiko(t, 1.2); return; }     // the drop
      if (bar === 0 || bar === 8) D.taiko(t, 1); else if (bar === 6 || bar === 14) D.taiko(t, 0.5);
      if (bar === 4 || bar === 12) D.snare(t, 0.75);
      if (i % 2 === 0) { D.pluck(t, ch.root * PULSE[(i / 2) % 8], bar === 0 ? 1 : 0.65); D.hat(t, bar % 4 === 0 ? 0.9 : 0.45); }
      if (i >= 72) D.snare(t, 0.3 + 0.08 * (i - 72));      // a fill into the battle music
    },
  },
  battle: { themes: THEMES },
  horde: {
    bpm: 140, sections: [sec(16, [CH(28, [52, 55, 59]), CH(29, [53, 57, 60]), CH(31, [55, 59, 62]), CH(29, [53, 57, 60])]),     // Em F G F
      sec(16, [CH(33, [57, 60, 64]), CH(34, [58, 62, 65]), CH(36, [55, 60, 64]), CH(34, [58, 62, 65])])],                         // Am Bb C Bb
    mix: () => ({ drone: 1, pad: 0.3, pulse: 1, drums: 1, hats: 1 }),
    play(D, i, t, ch) {
      const bar = i % 16;
      if (bar === 0) { D.braam(t, ch.root, 1.7, 0.5); if (i === 0) D.crash(t, 0.7); }
      D.pluck(t, ch.root * 2 * SWARM_OST[bar], bar % 4 === 0 ? 0.9 : 0.5, 0.11);
      const tk = [1, 0, 0.4, 0, 0.75, 0, 0.4, 0, 1, 0, 0.4, 0, 0.75, 0, 0.5, 0.35][bar];
      if (tk) D.taiko(t, tk);
      if (i >= 56) D.snare(t, 0.35 + 0.08 * (i - 56)); else if (bar === 4 || bar === 12) D.snare(t, 1);
      D.hat(t, bar % 4 === 0 ? 1 : bar % 2 === 0 ? 0.65 : 0.4);
    },
  },
  win: {
    bpm: 96, sections: [sec(32, [CH(33, [57, 61, 64]), CH(28, [56, 59, 64]), CH(30, [54, 57, 61]), CH(38, [54, 57, 62])])],   // A E F#m D
    mix: (D) => ({ drone: 0.7, pad: 1, bell: 0.8, lead: D.loops < 2 ? 1 : 0.7, pulse: D.loops < 2 ? 0.5 : 0.25, drums: D.loops < 2 ? 0.8 : 0.3 }),
    play(D, i, t, ch) {
      const bar = i % 16;
      if (i === 0 && D.loops === 0) { D.braam(t, 55, 3.6, 0.8); D.crash(t, 0.8); [440, 554.37, 659.25, 880].forEach((f, k) => D.bell(t + 0.25 + k * 0.18, f, 0.09)); }
      melody(D, WIN_MEL, i, t, 'bright', 0.06);
      if (bar === 0) D.taiko(t, 1); else if (bar === 8) D.taiko(t, 0.6);
      if (bar === 12 && i % 32 >= 16) D.snare(t, 0.4);
      if (i % 2 === 0) D.pluck(t, ch.root * 2, 0.45);
      if (i % 4 === 2) D.bell(t, ch.pad[(i / 4 | 0) % 3] * 4, 0.018);
    },
  },
  lose: {
    bpm: 64, sections: [sec(32, [CH(38, [57, 62, 65]), CH(31, [55, 58, 62]), CH(34, [53, 58, 62]), CH(33, [52, 57, 61])])],   // Dm Gm Bb A
    mix: () => ({ drone: 0.9, pad: 0.9, bell: 0.7, lead: 0.9, drums: 0.6 }),
    play(D, i, t, ch) {
      if (i === 0 && D.loops === 0) D.braam(t, 36.71, 4.5, 0.8);
      melody(D, LOSE_MEL, i, t, 'horn', 0.07);
      if (i % 16 === 0) D.taiko(t, 0.5);
      if (i % 32 === 0) D.bell(t, ch.pad[0], 0.09);
    },
  },
};
export const CUE_NAMES = Object.keys(CUES);
export const THEME_NAMES = Object.keys(THEMES);

// How a change of cue goes: q = where it lands ('bar', or 'beat' when it can't wait); out / in = how fast the old deck fades out and
// the new one in (time constants, s); hold = how long the old one keeps playing notes after the change; rise = a riser into it.
function transition(from, to) {
  if (to === 'horde') return { q: 'bar', out: 0.5, in: 0.15, hold: 0.25, rise: true };
  if (from === 'horde') return { q: 'bar', out: 1.4, in: 1.2, hold: 2.5 };
  if (to === 'win' || to === 'lose') return { q: 'beat', out: 0.5, in: 0.1, hold: 0.6 };
  if (to === 'start') return { q: 'beat', out: 0.6, in: 0.1, hold: 0.4 };
  if (from === 'start') return { q: 'now', out: 0.3, in: 0.05, hold: 0 };     // DROP ends on a bar: straight on
  return { q: 'bar', out: 1.2, in: 1.0, hold: 1.8 };
}

// A stereo reverb tail: decaying noise, darker as it fades.
function impulse(c, sec) {
  const n = Math.round(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) { const k = i / n; lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.42 * k); d[i] = lp * Math.pow(1 - k, 3); }
  }
  return b;
}

// One cue playing: its own layers, drone and pad, a fader, and where it is in the music.
class Deck {
  constructor(M, name, def, at, fadeIn) {
    const c = M.ctx;
    this.M = M; this.c = c; this.name = name; this.def = def; this.level = M.level;
    this.step = 0; this.loops = 0; this.section = 0; this.chord = -1; this.gains = {};
    this.floor = 0; this.floorTo = 0;      // (after DROP: the battle music keeps some of its energy for a few bars, then settles)
    this.next = at; this.schedUntil = Infinity; this.stopAt = Infinity;
    this.fade = c.createGain(); this.fade.gain.setValueAtTime(0.0001, M.now()); this.fade.gain.setValueAtTime(0.0001, at);
    this.fade.gain.setTargetAtTime(1, at, fadeIn); this.fade.connect(M.out);
    const layer = (send) => { const g = c.createGain(); g.gain.value = 0; g.connect(this.fade); const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(M.verb); return g; };
    this.L = { drone: layer(0.25), pad: layer(0.45), bell: layer(0.7), lead: layer(0.5), pulse: layer(0.3), drums: layer(0.35), hats: layer(0.2), color: layer(0.45), hits: layer(0.5) };
    this.L.hits.gain.value = 1;
    this.oscs = [];
    // the drone: two detuned saws, a sine an octave down and one an octave up, under a low lowpass
    const dF = c.createBiquadFilter(); dF.type = 'lowpass'; dF.frequency.value = 320; dF.Q.value = 0.8;
    const dg = c.createGain(); dg.gain.value = 0.065; dF.connect(dg); dg.connect(this.L.drone);
    this.dr = [['sawtooth', 1, -6], ['sawtooth', 1, 7], ['sine', 0.5, 0], ['sine', 2, 0]].map(([type, mul, cents]) => {
      const o = c.createOscillator(); o.type = type; o.detune.value = cents; o.connect(dF); o.start(); this.oscs.push(o); return { o, mul };
    });
    // the pad: the chord on triangles and a quiet saw, slowly breathing through a lowpass
    const pF = c.createBiquadFilter(); pF.type = 'lowpass'; pF.frequency.value = 1100; pF.Q.value = 0.5;
    const pg = c.createGain(); pg.gain.value = 0.06; pF.connect(pg); pg.connect(this.L.pad);
    this.pv = [0, 1, 2].map((k) => {
      const o = c.createOscillator(), s = c.createOscillator(), sg = c.createGain();
      o.type = 'triangle'; s.type = 'sawtooth'; s.detune.value = 5 - k * 5; sg.gain.value = 0.25;
      o.connect(pF); s.connect(sg); sg.connect(pF); o.start(); s.start(); this.oscs.push(o, s); return { o, s, k };
    });
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 380; lfo.connect(lg); lg.connect(pF.frequency); lfo.start(); this.oscs.push(lfo);
    this.setChord(this.sec.chords[0], at);
    this.mixNow(true);
  }
  get sec() { return this.def.sections[this.section % this.def.sections.length]; }
  get stepDur() { return 60 / this.def.bpm / 4; }
  // the layers' levels from the cue's mix (now: straight there, at the start)
  mixNow(now = false) {
    const mix = this.def.mix(this), t = this.M.now();
    for (const k of LAYERS) {
      const v = mix[k] || 0;
      if (Math.abs((this.gains[k] ?? -1) - v) < 0.001) continue;
      this.gains[k] = v; const g = this.L[k].gain;
      g.cancelScheduledValues(t);
      if (now) g.setValueAtTime(v, t); else g.setTargetAtTime(v, t, v > g.value ? 0.6 : 1.1);
    }
  }
  // fade this deck out from t, still playing notes for `hold` seconds
  retire(t, tc, hold) {
    const g = this.fade.gain; g.cancelScheduledValues(t); g.setTargetAtTime(0.0001, t, tc);
    this.schedUntil = t + hold; this.stopAt = t + Math.max(hold, tc * 6) + 0.5;
  }
  kill() { for (const o of this.oscs) { try { o.stop(); } catch { /* already */ } } try { this.fade.disconnect(); } catch { /* */ } }
  // the next 16th at t = this.next
  advance() {
    const s = this.sec, i = this.step, k = Math.floor(i / s.per) % s.chords.length, ch = s.chords[k];
    if (i % 16 === 0 && this.name === 'battle') this.level = Math.max(this.M.level, this.loops === 0 && i < this.floorTo ? this.floor : 0);   // a new level lands on the bar
    if (i % s.per === 0 || this.chord < 0) { this.setChord(ch, this.next); this.chord = k; }
    this.def.play(this, i, this.next, ch);
    this.next += this.stepDur;
    if (++this.step >= s.len) {
      this.step = 0; this.loops++; this.section++;
      if (this.def.once) this.M.deckDone(this);
    }
  }
  setChord(ch, t) {
    for (const v of this.dr) v.o.frequency.setTargetAtTime(ch.root * v.mul, t, 0.12);
    for (const v of this.pv) { v.o.frequency.setTargetAtTime(ch.pad[v.k], t, 0.25); v.s.frequency.setTargetAtTime(ch.pad[v.k] / 2, t, 0.25); }
  }

  // ---- the instruments (each note is its own short-lived nodes)
  env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  osc(type, f, t, dur, dest) { const o = this.c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; }
  noise(t, dur, dest) { const s = this.c.createBufferSource(); s.buffer = this.M.a.noiseBuf; s.loop = true; s.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05); return s; }
  pluck(t, f, acc, dec = 0.2, wave = 'sawtooth') {
    const c = this.c, fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = 'lowpass'; fl.Q.value = wave === 'sine' ? 0.7 : 2; fl.frequency.setValueAtTime(wave === 'square' ? 1100 : 1600, t); fl.frequency.exponentialRampToValueAtTime(wave === 'square' ? 220 : 260, t + dec * 0.8);
    this.env(g, t, 0.004, (wave === 'sine' ? 0.5 : wave === 'square' ? 0.2 : 0.28) * acc, dec); fl.connect(g); g.connect(this.L.pulse);
    this.osc(wave, f, t, dec + 0.02, fl); if (wave !== 'sine') this.osc(wave, f * 1.004, t, dec + 0.02, fl);
  }
  taiko(t, acc) {
    const c = this.c, g = c.createGain(), o = this.osc('sine', 120, t, 0.5, g);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.14);
    this.env(g, t, 0.003, 0.95 * acc, 0.45); g.connect(this.L.drums);
    const nf = c.createBiquadFilter(), ng = c.createGain(); nf.type = 'lowpass'; nf.frequency.value = 1100;
    this.env(ng, t, 0.001, 0.35 * acc, 0.06); this.noise(t, 0.08, nf); nf.connect(ng); ng.connect(this.L.drums);
  }
  tom(t, acc, f0 = 190) {
    const c = this.c, g = c.createGain(), o = this.osc('sine', f0, t, 0.35, g);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.18);
    this.env(g, t, 0.003, 0.45 * acc, 0.3); g.connect(this.L.color);
  }
  snare(t, acc) {
    const c = this.c, f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    this.env(g, t, 0.001, 0.32 * acc, 0.18); this.noise(t, 0.2, f); f.connect(g); g.connect(this.L.drums);
    const tg = c.createGain(); this.env(tg, t, 0.001, 0.08 * acc, 0.07); this.osc('triangle', 190, t, 0.08, tg); tg.connect(this.L.drums);
  }
  hat(t, acc) {
    const c = this.c, f = c.createBiquadFilter(), g = c.createGain(); f.type = 'highpass'; f.frequency.value = 7000;
    this.env(g, t, 0.001, 0.07 * acc, 0.045); this.noise(t, 0.06, f); f.connect(g); g.connect(this.L.hats);
  }
  // a metal clank: a ringing pair of square tones a tritone apart and a bright burst of noise
  clank(t, acc) {
    const c = this.c, g = c.createGain(); this.env(g, t, 0.001, 0.05 * acc, 0.22); g.connect(this.L.color);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 6; f.connect(g);
    this.osc('square', 540, t, 0.24, f); this.osc('square', 763, t, 0.24, f);
    const nf = c.createBiquadFilter(), ng = c.createGain(); nf.type = 'highpass'; nf.frequency.value = 3000;
    this.env(ng, t, 0.001, 0.1 * acc, 0.05); this.noise(t, 0.06, nf); nf.connect(ng); ng.connect(this.L.color);
  }
  // a high, glassy arpeggio note
  shimmer(t, f, a) { const g = this.c.createGain(); this.env(g, t, 0.004, a, 0.35); g.connect(this.L.color); this.osc('triangle', f, t, 0.4, g); }
  // a dry high click (the loading screen's clock; Cold Light's rim)
  clock(t, acc) {
    const c = this.c, g = c.createGain(); this.env(g, t, 0.001, 0.05 * acc, 0.03); g.connect(this.name === 'battle' ? this.L.drums : this.L.hats);
    this.osc('triangle', 2600, t, 0.04, g);
    const f = c.createBiquadFilter(), ng = c.createGain(); f.type = 'highpass'; f.frequency.value = 5000;
    this.env(ng, t, 0.001, 0.04 * acc, 0.02); this.noise(t, 0.03, f); f.connect(ng); ng.connect(this.name === 'battle' ? this.L.drums : this.L.hats);
  }
  bell(t, f, a) {
    const c = this.c, g = c.createGain(); this.env(g, t, 0.003, a, 1.8); g.connect(this.L.bell);
    this.osc('sine', f, t, 1.9, g);
    const g2 = c.createGain(); g2.gain.value = 0.18; g2.connect(g); this.osc('sine', f * 2.76, t, 0.6, g2);
  }
  // a held melody note: 'soft' (triangle and its octave), 'bright' (square and triangle), 'horn' (two saws, slow to speak)
  lead(t, f, dur, a, kind = 'soft') {
    const c = this.c, g = c.createGain(), fl = c.createBiquadFilter();
    fl.type = 'lowpass'; fl.Q.value = 0.7; fl.frequency.value = kind === 'horn' ? 1000 : kind === 'bright' ? 3000 : 2200;
    const att = kind === 'horn' ? 0.14 : 0.025, rel = 0.3, end = t + dur + rel;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + att);
    g.gain.setTargetAtTime(a * 0.7, t + att, Math.max(0.05, dur * 0.5)); g.gain.setTargetAtTime(0.0001, t + dur, rel / 3);
    fl.connect(g); g.connect(this.L.lead);
    const [t1, t2, m2, g2v] = kind === 'horn' ? ['sawtooth', 'sawtooth', 1.003, 0.8] : kind === 'bright' ? ['square', 'triangle', 1, 0.6] : ['triangle', 'sine', 2, 0.3];
    const o1 = this.osc(t1, f, t, dur + rel, fl), mg = c.createGain(); mg.gain.value = g2v; mg.connect(fl);
    const o2 = this.osc(t2, f * m2, t, dur + rel, mg);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.2;
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.005, t + Math.min(0.45, dur));
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency); lfo.start(t); lfo.stop(end + 0.05);
  }
  // a braam: a low brass-like wall of detuned saws opening up and closing, with a sub falling under it
  braam(t, root, dur, a) {
    const c = this.c, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(180, t); f.frequency.exponentialRampToValueAtTime(1000, t + 0.25); f.frequency.exponentialRampToValueAtTime(220, t + dur);
    this.env(g, t, 0.05, 0.07 * a, dur); f.connect(g); g.connect(this.L.hits);
    for (const m of [1, 1.5, 2, 3]) for (const d of [-8, 9]) { const o = this.osc('sawtooth', root * m, t, dur, f); o.detune.value = d; }
    const sg = c.createGain(); this.env(sg, t, 0.02, 0.4 * a, dur * 0.8); sg.connect(this.L.hits);
    const s = this.osc('sine', 72, t, dur, sg); s.frequency.exponentialRampToValueAtTime(36, t + dur * 0.7);
  }
  // a cymbal-like wash, a rising sweep, and a falling one (the hellpod)
  crash(t, a) {
    const c = this.c, f = c.createBiquadFilter(), g = c.createGain(); f.type = 'highpass'; f.frequency.value = 2500;
    this.env(g, t, 0.002, 0.12 * a, 1.7); this.noise(t, 1.8, f); f.connect(g); g.connect(this.L.hits);
  }
  riser(t, dur, a) {
    const c = this.c, f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(5000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13 * a, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    this.noise(t, dur + 0.1, f); f.connect(g); g.connect(this.L.hits);
    const tf = c.createBiquadFilter(), tg = c.createGain(); tf.type = 'lowpass'; tf.frequency.value = 1400;
    tg.gain.setValueAtTime(0.0001, t); tg.gain.exponentialRampToValueAtTime(0.03 * a, t + dur); tg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    const o = this.osc('sawtooth', 110, t, dur + 0.1, tf); o.frequency.exponentialRampToValueAtTime(880, t + dur); tf.connect(tg); tg.connect(this.L.hits);
  }
  whoosh(t, dur, a) {
    const c = this.c, f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.Q.value = 1;
    f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14 * a, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.noise(t, dur, f); f.connect(g); g.connect(this.L.hits);
  }
}

export class Music {
  constructor(audio) {
    this.a = audio; this.style = 'dynamic'; this.scene = 'menu'; this.heat = 0; this.level = 0; this.theme = 'bugs';
    this.want = 'menu'; this.run = null; this.swarm = false; this.swarmT = 0; this.decks = [];
    this.built = false; this.timer = null; this.lastHit = -99; this.outG = -1;
  }
  get ctx() { return this.a.ctx; }
  // the audio clock (an offline render sets vnow to step through its own timeline)
  now() { return this.vnow ?? this.ctx.currentTime; }
  // the deck playing now (the newest), and what tests and the HUD ask of it
  get deck() { return this.decks[this.decks.length - 1] || null; }
  get cueName() { return this.deck ? this.deck.name : this.want; }
  get step() { return this.deck ? this.deck.step : 0; }
  get loops() { return this.deck ? this.deck.loops : 0; }
  get next() { return this.deck ? this.deck.next : 0; }
  get gains() { return { out: this.outG, ...(this.deck ? this.deck.gains : {}) }; }
  get section() { return this.deck ? this.deck.section % this.deck.def.sections.length : 0; }
  setStyle(s) { this.style = MUSIC_STYLES.includes(s) ? s : 'dynamic'; }

  build() {
    const c = this.ctx; if (!c || this.built || !this.a.musBus) return;
    this.built = true;
    this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(this.a.musBus);
    this.verb = c.createConvolver(); this.verb.buffer = impulse(c, 2.8);
    const wet = c.createGain(); wet.gain.value = 0.5; this.verb.connect(wet); wet.connect(this.out);
    this.decks = [this.makeDeck(this.want, this.now() + 0.1, 1.5)];
    this.timer = setInterval(() => this.tick(), 90);
  }
  def(name) { const cue = CUES[name]; return cue.themes ? cue.themes[this.theme] || cue.themes.bugs : cue; }
  makeDeck(name, at, fadeIn) { return new Deck(this, name, this.def(name), at, fadeIn); }

  // Change cue: on the next bar (or beat) of the deck playing now, the old one fading while the new one comes in.
  switchTo(name, how) {
    const c = this.ctx, cur = this.deck, tr = how || transition(cur && cur.name, name);
    let at = this.now() + 0.05;
    // the deck that was about to start hasn't played a note yet: the new one simply takes its place, at its start
    if (cur && cur.step === 0 && cur.loops === 0 && cur.next > at) {
      at = cur.next; cur.kill(); this.decks.pop();
      const prev = this.deck; if (prev) prev.schedUntil = Math.max(prev.schedUntil, at);
      this.decks.push(this.makeDeck(name, at, tr.in));
      return;
    }
    if (cur && tr.q !== 'now') {
      const base = Math.max(cur.next, at), sd = cur.stepDur;
      const toBar = (16 - (cur.step % 16)) % 16, toBeat = (4 - (cur.step % 4)) % 4;
      const n = tr.q === 'bar' && toBar * sd <= 2.2 ? toBar : toBeat;
      at = base + n * sd;
      if (tr.rise && n * sd > 0.4) cur.riser(at - n * sd, n * sd, 0.7);
    } else if (cur && tr.q === 'now') at = Math.max(cur.next, at);
    if (cur) cur.retire(at, tr.out, tr.hold);
    this.decks.push(this.makeDeck(name, at, tr.in));
  }
  // DROP has played out: on into the battle music (or the swarm) exactly on the beat it ends
  deckDone(d) {
    if (d !== this.deck) return;
    this.switchTo(this.swarm ? 'horde' : 'battle', { q: 'now', out: 0.3, in: 0.05, hold: 0 });
    const nd = this.deck; if (nd.name === 'battle' && this.style === 'dynamic') { nd.floor = 2; nd.floorTo = 64; nd.level = Math.max(nd.level, 2); nd.mixNow(true); }
  }

  // Each frame: what is on screen (menu | loading | play | pause | cine | end), how hot the fight is near the squad (0..1), and o:
  //   run  the mission (a new one starts with DROP),  crowd  how many enemies on screen (weighted),  mood  'win' | 'lose' at the end,
  //   faction  whose battle theme
  update(dt, scene, heat = 0, o = {}) {
    const c = this.ctx; if (!c) return;
    if (!this.built) { this.want = scene === 'loading' ? 'loading' : 'menu'; this.build(); }
    if (!this.built) return;
    this.scene = scene;
    if (o.faction && THEMES[o.faction]) this.theme = o.faction;
    const h = Math.max(0, Math.min(1, heat));
    this.heat += (h - this.heat) * (1 - Math.exp(-dt / (h > this.heat ? 1.5 : 7)));     // up in a second or two, down slowly
    const dyn = this.style === 'dynamic', inMission = scene === 'play' || scene === 'pause' || scene === 'cine';
    // the battle level, with a little hysteresis so it doesn't flicker at an edge (the music takes it up on the next bar)
    const up = [0.1, 0.32, 0.6], lv0 = this.level;
    let lv = 0;
    if (dyn && (scene === 'play' || scene === 'pause')) {
      lv = this.heat > up[2] ? 3 : this.heat > up[1] ? 2 : this.heat > up[0] ? 1 : 0;
      if (lv < lv0 && lv0 > 0 && this.heat > up[Math.min(2, lv0 - 1)] - 0.07) lv = lv0;
    }
    this.level = lv;
    // the swarm: in after the screen has been full for 1.5 s, out after it has been thinner for 5 s
    const crowd = o.crowd || 0;
    if (!dyn || !inMission) { this.swarm = false; this.swarmT = 0; }
    else if (!this.swarm) { this.swarmT = crowd >= SWARM_IN ? this.swarmT + dt : 0; if (this.swarmT >= 1.5) { this.swarm = true; this.swarmT = 0; } }
    else { this.swarmT = crowd < SWARM_OUT ? this.swarmT + dt : 0; if (this.swarmT >= 5) { this.swarm = false; this.swarmT = 0; } }
    // which cue
    const cur = this.cueName;
    let want = cur;
    if (scene === 'menu') want = 'menu';
    else if (scene === 'loading') want = 'loading';
    else if (scene === 'end') want = o.mood === 'win' ? 'win' : 'lose';
    else if (scene === 'play' && o.run && o.run !== this.run) { this.run = o.run; want = dyn ? 'start' : 'battle'; if (cur === want) want = '+' + want; }
    else if (scene === 'play' || scene === 'pause') {
      if (cur === 'start' && dyn) want = 'start';     // DROP plays out, then hands over itself
      else want = dyn && this.swarm ? 'horde' : 'battle';
    }
    if (want[0] === '+') this.switchTo(want.slice(1));     // the same cue again, from the top (a new mission)
    else if (want !== cur || (want === 'battle' && this.deck && this.deck.def !== this.def('battle'))) this.switchTo(want);
    if (this.cueName === 'horde') this.level = 3;
    // the master fader (scene ducking), and each deck's layers
    const out = this.style === 'off' ? 0 : scene === 'cine' ? 0.3 : scene === 'pause' ? 0.6 : 1;
    if (Math.abs(out - this.outG) > 0.001) { this.outG = out; const g = this.out.gain; g.cancelScheduledValues(this.now()); g.setTargetAtTime(out, this.now(), 0.8); }
    for (const d of this.decks) d.mixNow();
  }

  // Fill the next 0.3 s of the audio clock with notes, for every deck still playing; let go of decks that have faded out.
  // Skipped while the music is off or the tab is hidden (on coming back it starts again from now, not with everything it missed).
  tick() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    if (this.style === 'off' || (typeof document !== 'undefined' && document.hidden)) { for (const d of this.decks) d.next = 0; return; }
    const now = this.now();
    for (const d of this.decks) {
      if (d.next < now) d.next = now + 0.05;
      const until = Math.min(now + 0.3, d.schedUntil);
      while (d.next < until) d.advance();
    }
    if (this.decks.length > 1) this.decks = this.decks.filter((d) => { if (d !== this.deck && now > d.stopAt) { d.kill(); return false; } return true; });
  }

  // Stingers: 'boss' (a braam, at most one every 8 s). (A win or a loss is its own cue: VICTORY or FALLEN.)
  hit(kind) {
    const c = this.ctx; if (!c || !this.built || this.style === 'off' || !this.deck) return;
    const t = this.now() + 0.05;
    if (kind === 'boss') { if (t - this.lastHit < 8) return; this.lastHit = t; this.deck.braam(t, 41.2, 3.2, 1); }
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
