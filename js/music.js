// (0.29, 0.30) Music, made the way the trailer's score was: no audio files, everything synthesised live from oscillators and noise.
// Seven cues, each its own piece, and the game moves between them:
//   ORBIT (the menus and the armory): 84 BPM, D minor. A music-box bell arpeggio over a soft pad, and every other time round a
//     slow melody on a soft lead.
//   BRIEFING (the loading screen, while the mission is made): 100 BPM, suspended chords. A clock ticking, a low pulse on the beat,
//     data blips and a slow swell every four bars: waiting to drop.
//   DROP (the start of a match, once): 120 BPM, 10 s. A riser and a snare roll, a hellpod whoosh, then the drop: a braam, a crash
//     and a march for three bars, which hands over to the battle music.
//   BATTLE (a mission, Dynamic): 120 BPM, A minor, Am F G Em. It follows the fight: drone and pad when it's quiet, a pulse when the
//     enemy closes on the squad, war drums in a firefight, and in a heavy one hats, snares and a braam on every chord change.
//   SWARM (a ton of enemies on screen): 140 BPM, E Phrygian. A 16th-note ostinato, double-time drums, a braam every bar and a fill
//     every four. It comes in when the screen fills up and goes back to BATTLE once it has thinned out for a while.
//   VICTORY (a win, and its debrief): 96 BPM, A major. A braam and rising bells, then an anthem on a bright lead; it settles down
//     the longer the debrief stays up.
//   FALLEN (a loss, the end of a session, Mars glassed): 64 BPM, D minor. A low braam, a slow horn line, a funeral drum, a bell toll.
// Ambient keeps a mission calm (BATTLE's quiet layers only: no DROP, no SWARM); the menus, briefing and endings play as they are.
// A super heavy arriving gets a braam of its own. Cinematics and the pause turn the music down.
// Notes are scheduled a little ahead on the audio clock (a 90 ms timer fills the next 0.3 s), so a busy frame doesn't make it stumble.
export const MUSIC_STYLES = ['dynamic', 'ambient', 'off'];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CH = (root, pad) => ({ root: mtof(root), pad: pad.map(mtof) });     // a chord: the drone's root and the pad's three notes
const LAYERS = ['drone', 'pad', 'bell', 'lead', 'pulse', 'drums', 'hats'];
// the swarm comes in at about this much on screen (light 1, medium 1.6, heavy 3; a desktop-sized view) and goes at the second
export const SWARM_IN = 80, SWARM_OUT = 55;

const BATTLE = [CH(33, [57, 60, 64]), CH(29, [53, 57, 60]), CH(31, [55, 59, 62]), CH(28, [52, 55, 59])];          // Am F G Em
const PULSE = [2, 2, 4, 2, 2, 3, 2, 4];       // the battle pulse's notes, as multiples of the root, one per 8th
const BELL = [0, 1, 2, 1, 2, 0, 1, 2];        // which pad note the battle bell plays, an octave up, every half bar
// melodies: [step, midi note, length in 16ths]
const MENU_MEL = [[0, 74, 8], [8, 77, 8], [16, 81, 12], [28, 79, 4], [32, 77, 8], [40, 74, 8], [48, 77, 16], [64, 81, 8], [72, 84, 8],
  [80, 81, 12], [92, 79, 4], [96, 76, 8], [104, 79, 8], [112, 76, 16]];
const WIN_MEL = [[0, 76, 4], [4, 81, 4], [8, 85, 8], [16, 83, 8], [24, 81, 8], [32, 80, 8], [40, 83, 8], [48, 76, 16], [64, 78, 8],
  [72, 81, 8], [80, 85, 12], [92, 83, 4], [96, 81, 8], [104, 78, 8], [112, 76, 16]];
const LOSE_MEL = [[0, 69, 16], [16, 65, 8], [24, 64, 8], [32, 67, 16], [48, 70, 8], [56, 69, 8], [64, 65, 16], [80, 62, 8], [88, 65, 8],
  [96, 64, 12], [108, 61, 4], [112, 57, 16]];
const SWARM_OST = [1, 1, 2, 1, 1, 1, 1.5, 1, 1, 1, 2, 1, 1.0595, 1, 1.5, 2];   // the swarm's 16th-note ostinato over the root (x2)
const melody = (M, mel, i, t, kind, a) => { for (const [s, n, len] of mel) if (s === i) M.lead(t, mtof(n), len * M.stepDur, a, kind); };

const CUES = {
  menu: {
    bpm: 84, len: 128, per: 32, chords: [CH(38, [57, 62, 65]), CH(34, [58, 62, 65]), CH(29, [57, 60, 65]), CH(36, [55, 60, 64])],   // Dm Bb F C
    mix: () => ({ drone: 0.6, pad: 1, bell: 1, lead: 0.9 }),
    play(M, i, t, ch) {
      if (i % 2 === 0) { const k = [0, 1, 2, 3, 2, 1, 0, 1][(i / 2) % 8]; M.bell(t, k < 3 ? ch.pad[k] * 2 : ch.pad[0] * 4, i % 16 === 0 ? 0.05 : 0.032); }
      if (M.loops % 2 === 1) melody(M, MENU_MEL, i, t, 'soft', 0.07);
    },
  },
  loading: {
    bpm: 100, len: 128, per: 32, chords: [CH(33, [57, 59, 64]), CH(29, [57, 60, 64]), CH(36, [55, 60, 62]), CH(31, [55, 59, 64])],   // Asus2 Fmaj7 Csus2 G6
    mix: () => ({ drone: 0.8, pad: 0.7, bell: 0.7, pulse: 0.6, hats: 0.8 }),
    play(M, i, t, ch) {
      const bar = i % 16;
      if (i % 2 === 0) M.clock(t, bar === 0 ? 1 : i % 4 === 0 ? 0.6 : 0.35);
      if (i % 4 === 0) M.pluck(t, ch.root * 2, bar === 0 ? 0.75 : 0.45);
      if (bar === 10 || bar === 11) M.bell(t, ch.pad[((i >> 4) + bar) % 3] * 4, 0.022);
      if (i === 96) M.riser(t, 32 * M.stepDur, 0.35);
    },
  },
  start: {
    bpm: 120, len: 80, per: 16, once: true, chords: [BATTLE[0], BATTLE[0], BATTLE[0], BATTLE[1], BATTLE[2]],
    mix: () => ({ drone: 1, pad: 0.5, pulse: 1, drums: 1, hats: 0.8 }),
    play(M, i, t, ch) {
      const bar = i % 16;
      if (i === 0) M.riser(t, 32 * M.stepDur, 0.9);
      if (i < 32) {     // the build: a snare roll that tightens, a drum on each bar
        const every = i < 16 ? 4 : i < 24 ? 2 : 1;
        if (i % every === 0) M.snare(t, i < 16 ? 0.35 : i < 24 ? 0.5 : 0.3 + 0.07 * (i - 24));
        if (bar === 0) M.taiko(t, 0.6);
        if (i === 22) M.whoosh(t, 10 * M.stepDur, 0.9);     // the hellpod coming down
        return;
      }
      if (i === 32) { M.braam(t, ch.root, 3, 1); M.crash(t, 1); M.taiko(t, 1.2); return; }     // the drop
      if (bar === 0 || bar === 8) M.taiko(t, 1); else if (bar === 6 || bar === 14) M.taiko(t, 0.5);
      if (bar === 4 || bar === 12) M.snare(t, 0.75);
      if (i % 2 === 0) { M.pluck(t, ch.root * PULSE[(i / 2) % 8], bar === 0 ? 1 : 0.65); M.hat(t, bar % 4 === 0 ? 0.9 : 0.45); }
      if (i >= 72) M.snare(t, 0.3 + 0.08 * (i - 72));      // a fill into the battle music
    },
  },
  battle: {
    bpm: 120, len: 128, per: 32, chords: BATTLE,
    mix: (M) => {
      const lv = M.level, amb = M.style === 'ambient';
      return {
        drone: amb ? 0.8 : [0.55, 0.65, 0.85, 1][lv], pad: amb ? 0.9 : [0.55, 0.45, 0.35, 0.3][lv], bell: amb ? 0.45 : 0,
        pulse: lv >= 1 ? 1 : 0, drums: lv >= 2 ? (lv >= 3 ? 1 : 0.75) : 0, hats: lv >= 3 ? 1 : 0,
      };
    },
    play(M, i, t, ch) {
      const bar = i % 16, lv = M.level, g = M.gains;
      if (i % 32 === 0 && lv >= 3) M.braam(t, ch.root, 2.6, 0.55);
      if (g.bell > 0 && i % 16 === 0) M.bell(t, ch.pad[BELL[(i / 8) % 8]] * 2, 0.07);
      if (g.pulse > 0 && i % 2 === 0) M.pluck(t, ch.root * PULSE[(i / 2) % 8], bar === 0 ? 1 : 0.65);
      if (g.drums > 0) {
        if (bar === 0 || bar === 8) M.taiko(t, 1);
        else if (bar === 6 || bar === 14) M.taiko(t, 0.55);
        else if (lv >= 3 && (bar === 11 || bar === 3)) M.taiko(t, 0.45);
        if (lv >= 3 && (bar === 4 || bar === 12)) M.snare(t, 0.8);
      }
      if (g.hats > 0) M.hat(t, bar % 4 === 0 ? 1 : bar % 2 === 0 ? 0.6 : 0.35);
    },
  },
  horde: {
    bpm: 140, len: 64, per: 16, chords: [CH(28, [52, 55, 59]), CH(29, [53, 57, 60]), CH(31, [55, 59, 62]), CH(29, [53, 57, 60])],   // Em F G F
    mix: () => ({ drone: 1, pad: 0.3, pulse: 1, drums: 1, hats: 1 }),
    play(M, i, t, ch) {
      const bar = i % 16;
      if (bar === 0) { M.braam(t, ch.root, 1.7, 0.5); if (i === 0) M.crash(t, 0.7); }
      M.pluck(t, ch.root * 2 * SWARM_OST[bar], bar % 4 === 0 ? 0.9 : 0.5, 0.11);
      const tk = [1, 0, 0.4, 0, 0.75, 0, 0.4, 0, 1, 0, 0.4, 0, 0.75, 0, 0.5, 0.35][bar];
      if (tk) M.taiko(t, tk);
      if (i >= 56) M.snare(t, 0.35 + 0.08 * (i - 56)); else if (bar === 4 || bar === 12) M.snare(t, 1);
      M.hat(t, bar % 4 === 0 ? 1 : bar % 2 === 0 ? 0.65 : 0.4);
    },
  },
  win: {
    bpm: 96, len: 128, per: 32, chords: [CH(33, [57, 61, 64]), CH(28, [56, 59, 64]), CH(30, [54, 57, 61]), CH(38, [54, 57, 62])],   // A E F#m D
    mix: (M) => ({ drone: 0.7, pad: 1, bell: 0.8, lead: M.loops < 2 ? 1 : 0.7, pulse: M.loops < 2 ? 0.5 : 0.25, drums: M.loops < 2 ? 0.8 : 0.3 }),
    play(M, i, t, ch) {
      const bar = i % 16;
      if (i === 0 && M.loops === 0) { M.braam(t, 55, 3.6, 0.8); M.crash(t, 0.8); [440, 554.37, 659.25, 880].forEach((f, k) => M.bell(t + 0.25 + k * 0.18, f, 0.09)); }
      melody(M, WIN_MEL, i, t, 'bright', 0.06);
      if (bar === 0) M.taiko(t, 1); else if (bar === 8) M.taiko(t, 0.6);
      if (bar === 12 && i % 32 >= 16) M.snare(t, 0.4);
      if (i % 2 === 0) M.pluck(t, ch.root * 2, 0.45);
      if (i % 4 === 2) M.bell(t, ch.pad[(i / 4 | 0) % 3] * 4, 0.018);
    },
  },
  lose: {
    bpm: 64, len: 128, per: 32, chords: [CH(38, [57, 62, 65]), CH(31, [55, 58, 62]), CH(34, [53, 58, 62]), CH(33, [52, 57, 61])],   // Dm Gm Bb A
    mix: () => ({ drone: 0.9, pad: 0.9, bell: 0.7, lead: 0.9, drums: 0.6 }),
    play(M, i, t, ch) {
      if (i === 0 && M.loops === 0) M.braam(t, 36.71, 4.5, 0.8);
      melody(M, LOSE_MEL, i, t, 'horn', 0.07);
      if (i % 16 === 0) M.taiko(t, 0.5);
      if (i % 32 === 0) M.bell(t, ch.pad[0], 0.09);
    },
  },
};
export const CUE_NAMES = Object.keys(CUES);

// A stereo reverb tail: decaying noise, darker as it fades.
function impulse(c, sec) {
  const n = Math.round(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) { const k = i / n; lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.42 * k); d[i] = lp * Math.pow(1 - k, 3); }
  }
  return b;
}

export class Music {
  constructor(audio) {
    this.a = audio; this.style = 'dynamic'; this.scene = 'menu'; this.heat = 0; this.level = 0;
    this.cueName = 'menu'; this.cue = CUES.menu; this.loops = 0; this.run = null; this.swarm = false; this.swarmT = 0;
    this.step = 0; this.next = 0; this.built = false; this.timer = null; this.lastHit = -99; this.gains = {}; this.chord = -1;
  }
  get ctx() { return this.a.ctx; }
  get stepDur() { return 60 / this.cue.bpm / 4; }
  setStyle(s) { this.style = MUSIC_STYLES.includes(s) ? s : 'dynamic'; }

  build() {
    const c = this.ctx; if (!c || this.built || !this.a.musBus) return;
    this.built = true;
    this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(this.a.musBus);
    this.verb = c.createConvolver(); this.verb.buffer = impulse(c, 2.8);
    const wet = c.createGain(); wet.gain.value = 0.5; this.verb.connect(wet); wet.connect(this.out);
    const layer = (send) => { const g = c.createGain(); g.gain.value = 0; g.connect(this.out); const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(this.verb); return g; };
    this.L = { drone: layer(0.25), pad: layer(0.45), bell: layer(0.7), lead: layer(0.5), pulse: layer(0.3), drums: layer(0.35), hats: layer(0.2), hits: layer(0.5) };
    this.L.hits.gain.value = 1;
    // the drone: two detuned saws, a sine an octave down and one an octave up, under a low lowpass
    this.droneF = c.createBiquadFilter(); this.droneF.type = 'lowpass'; this.droneF.frequency.value = 320; this.droneF.Q.value = 0.8;
    const dg = c.createGain(); dg.gain.value = 0.065; this.droneF.connect(dg); dg.connect(this.L.drone);
    this.dr = [['sawtooth', 1, -6], ['sawtooth', 1, 7], ['sine', 0.5, 0], ['sine', 2, 0]].map(([type, mul, cents]) => {
      const o = c.createOscillator(); o.type = type; o.detune.value = cents; o.connect(this.droneF); o.start(); return { o, mul };
    });
    // the pad: the chord on triangles and a quiet saw, slowly breathing through a lowpass
    this.padF = c.createBiquadFilter(); this.padF.type = 'lowpass'; this.padF.frequency.value = 1100; this.padF.Q.value = 0.5;
    const pg = c.createGain(); pg.gain.value = 0.06; this.padF.connect(pg); pg.connect(this.L.pad);
    this.pv = [0, 1, 2].map((k) => {
      const o = c.createOscillator(), s = c.createOscillator(), sg = c.createGain();
      o.type = 'triangle'; s.type = 'sawtooth'; s.detune.value = 5 - k * 5; sg.gain.value = 0.25;
      o.connect(this.padF); s.connect(sg); sg.connect(this.padF); o.start(); s.start(); return { o, s, k };
    });
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 380; lfo.connect(lg); lg.connect(this.padF.frequency); lfo.start();
    this.switchTo(this.cueName);
    this.next = c.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 90);
  }

  switchTo(name) {
    if (!CUES[name]) return;
    this.cueName = name; this.cue = CUES[name]; this.step = 0; this.loops = 0; this.chord = -1;
  }

  // Each frame: what is on screen (menu | loading | play | pause | cine | end), how hot the fight is near the squad (0..1), and o:
  //   run   the mission (a new one starts with DROP),   crowd  how many enemies on screen (weighted),   mood  'win' | 'lose' at the end
  update(dt, scene, heat = 0, o = {}) {
    const c = this.ctx; if (!c) return;
    if (!this.built) this.build();
    if (!this.built) return;
    this.scene = scene;
    const h = Math.max(0, Math.min(1, heat));
    this.heat += (h - this.heat) * (1 - Math.exp(-dt / (h > this.heat ? 1.5 : 7)));     // up in a second or two, down slowly
    const dyn = this.style === 'dynamic', inMission = scene === 'play' || scene === 'pause' || scene === 'cine';
    // the battle level, with a little hysteresis so it doesn't flicker at an edge
    const up = [0.1, 0.32, 0.6], lv0 = this.level;
    let lv = 0;
    if (dyn && (scene === 'play' || scene === 'pause')) {
      lv = this.heat > up[2] ? 3 : this.heat > up[1] ? 2 : this.heat > up[0] ? 1 : 0;
      if (lv < lv0 && lv0 > 0 && this.heat > up[lv0 - 1] - 0.07) lv = lv0;
    }
    this.level = lv;
    // the swarm: in after the screen has been full for 1.5 s, out after it has been thinner for 5 s
    const crowd = o.crowd || 0;
    if (!dyn || !inMission) { this.swarm = false; this.swarmT = 0; }
    else if (!this.swarm) { this.swarmT = crowd >= SWARM_IN ? this.swarmT + dt : 0; if (this.swarmT >= 1.5) { this.swarm = true; this.swarmT = 0; } }
    else { this.swarmT = crowd < SWARM_OUT ? this.swarmT + dt : 0; if (this.swarmT >= 5) { this.swarm = false; this.swarmT = 0; } }
    // which cue
    let want = this.cueName;
    if (scene === 'menu') want = 'menu';
    else if (scene === 'loading') want = 'loading';
    else if (scene === 'end') want = o.mood === 'win' ? 'win' : 'lose';
    else if (scene === 'play' && o.run && o.run !== this.run) { this.run = o.run; want = dyn ? 'start' : 'battle'; }
    else if (scene === 'play' || scene === 'pause') {
      if (this.cueName === 'start' && dyn) want = 'start';     // DROP plays out, then hands over itself
      else want = dyn && this.swarm ? 'horde' : 'battle';
    }
    if (want !== this.cueName) this.switchTo(want);
    if (this.cueName === 'horde') this.level = 3;
    // the layers' levels
    const off = this.style === 'off', mix = this.cue.mix(this);
    const T = { out: off ? 0 : scene === 'cine' ? 0.3 : scene === 'pause' ? 0.6 : 1 };
    for (const k of LAYERS) T[k] = mix[k] || 0;
    for (const k in T) {
      if (Math.abs((this.gains[k] ?? -1) - T[k]) < 0.001) continue;
      this.gains[k] = T[k];
      const g = k === 'out' ? this.out.gain : this.L[k].gain;
      g.cancelScheduledValues(c.currentTime); g.setTargetAtTime(T[k], c.currentTime, k === 'out' ? 0.5 : T[k] > 0 ? 0.5 : 1.2);
    }
  }

  // Fill the next 0.3 s of the audio clock with notes. Skipped while the music is off or the tab is hidden (on coming back it
  // starts again from now rather than playing everything it missed at once).
  tick() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    if (this.style === 'off' || (typeof document !== 'undefined' && document.hidden)) { this.next = 0; return; }
    const now = c.currentTime;
    if (this.next < now) this.next = now + 0.05;
    while (this.next < now + 0.3) this.advance();
  }
  // one 16th of the current cue at this.next, then on to the next one
  advance() {
    const cue = this.cue;
    this.play(this.step, this.next);
    this.next += 60 / cue.bpm / 4;
    if (++this.step >= cue.len) {
      this.step = 0; this.loops++;
      if (cue.once) this.switchTo(this.swarm ? 'horde' : 'battle');
    }
  }

  setChord(ch, t) {
    for (const v of this.dr) v.o.frequency.setTargetAtTime(ch.root * v.mul, t, 0.12);
    for (const v of this.pv) { v.o.frequency.setTargetAtTime(ch.pad[v.k], t, 0.25); v.s.frequency.setTargetAtTime(ch.pad[v.k] / 2, t, 0.25); }
  }
  play(i, t) {
    const cue = this.cue, k = Math.floor(i / cue.per) % cue.chords.length, ch = cue.chords[k];
    if (i % cue.per === 0 || this.chord < 0) { this.setChord(ch, t); this.chord = k; }
    cue.play(this, i, t, ch);
  }

  // ---- the instruments (each note is its own short-lived nodes)
  env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  osc(type, f, t, dur, dest) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; }
  noise(t, dur, dest) { const s = this.ctx.createBufferSource(); s.buffer = this.a.noiseBuf; s.loop = true; s.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05); return s; }
  pluck(t, f, acc, dec = 0.2) {
    const c = this.ctx, fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = 'lowpass'; fl.Q.value = 2; fl.frequency.setValueAtTime(1600, t); fl.frequency.exponentialRampToValueAtTime(260, t + dec * 0.8);
    this.env(g, t, 0.004, 0.28 * acc, dec); fl.connect(g); g.connect(this.L.pulse);
    this.osc('sawtooth', f, t, dec + 0.02, fl); this.osc('sawtooth', f * 1.004, t, dec + 0.02, fl);
  }
  taiko(t, acc) {
    const c = this.ctx, g = c.createGain(), o = this.osc('sine', 120, t, 0.5, g);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.14);
    this.env(g, t, 0.003, 0.95 * acc, 0.45); g.connect(this.L.drums);
    const nf = c.createBiquadFilter(), ng = c.createGain(); nf.type = 'lowpass'; nf.frequency.value = 1100;
    this.env(ng, t, 0.001, 0.35 * acc, 0.06); this.noise(t, 0.08, nf); nf.connect(ng); ng.connect(this.L.drums);
  }
  snare(t, acc) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    this.env(g, t, 0.001, 0.32 * acc, 0.18); this.noise(t, 0.2, f); f.connect(g); g.connect(this.L.drums);
    const tg = c.createGain(); this.env(tg, t, 0.001, 0.08 * acc, 0.07); this.osc('triangle', 190, t, 0.08, tg); tg.connect(this.L.drums);
  }
  hat(t, acc) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain(); f.type = 'highpass'; f.frequency.value = 7000;
    this.env(g, t, 0.001, 0.07 * acc, 0.045); this.noise(t, 0.06, f); f.connect(g); g.connect(this.L.hats);
  }
  // the loading screen's clock: a dry high click
  clock(t, acc) {
    const c = this.ctx, g = c.createGain(); this.env(g, t, 0.001, 0.05 * acc, 0.03); g.connect(this.L.hats);
    this.osc('triangle', 2600, t, 0.04, g);
    const f = c.createBiquadFilter(), ng = c.createGain(); f.type = 'highpass'; f.frequency.value = 5000;
    this.env(ng, t, 0.001, 0.04 * acc, 0.02); this.noise(t, 0.03, f); f.connect(ng); ng.connect(this.L.hats);
  }
  bell(t, f, a) {
    const c = this.ctx, g = c.createGain(); this.env(g, t, 0.003, a, 1.8); g.connect(this.L.bell);
    this.osc('sine', f, t, 1.9, g);
    const g2 = c.createGain(); g2.gain.value = 0.18; g2.connect(g); this.osc('sine', f * 2.76, t, 0.6, g2);
  }
  // a held melody note: 'soft' (triangle and its octave), 'bright' (square and triangle), 'horn' (two saws, slow to speak);
  // a gentle vibrato comes in after the attack
  lead(t, f, dur, a, kind = 'soft') {
    const c = this.ctx, g = c.createGain(), fl = c.createBiquadFilter();
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
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(180, t); f.frequency.exponentialRampToValueAtTime(1000, t + 0.25); f.frequency.exponentialRampToValueAtTime(220, t + dur);
    this.env(g, t, 0.05, 0.07 * a, dur); f.connect(g); g.connect(this.L.hits);
    for (const m of [1, 1.5, 2, 3]) for (const d of [-8, 9]) { const o = this.osc('sawtooth', root * m, t, dur, f); o.detune.value = d; }
    const sg = c.createGain(); this.env(sg, t, 0.02, 0.4 * a, dur * 0.8); sg.connect(this.L.hits);
    const s = this.osc('sine', 72, t, dur, sg); s.frequency.exponentialRampToValueAtTime(36, t + dur * 0.7);
  }
  // a cymbal-like wash, a rising sweep, and a falling one (the hellpod)
  crash(t, a) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain(); f.type = 'highpass'; f.frequency.value = 2500;
    this.env(g, t, 0.002, 0.12 * a, 1.7); this.noise(t, 1.8, f); f.connect(g); g.connect(this.L.hits);
  }
  riser(t, dur, a) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(5000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13 * a, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    this.noise(t, dur + 0.1, f); f.connect(g); g.connect(this.L.hits);
    const tf = c.createBiquadFilter(), tg = c.createGain(); tf.type = 'lowpass'; tf.frequency.value = 1400;
    tg.gain.setValueAtTime(0.0001, t); tg.gain.exponentialRampToValueAtTime(0.03 * a, t + dur); tg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    const o = this.osc('sawtooth', 110, t, dur + 0.1, tf); o.frequency.exponentialRampToValueAtTime(880, t + dur); tf.connect(tg); tg.connect(this.L.hits);
  }
  whoosh(t, dur, a) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.Q.value = 1;
    f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14 * a, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.noise(t, dur, f); f.connect(g); g.connect(this.L.hits);
  }
  // Stingers: 'boss' (a braam, at most one every 8 s). (A win or a loss is its own cue now: VICTORY or FALLEN.)
  hit(kind) {
    const c = this.ctx; if (!c || !this.built || this.style === 'off') return;
    const t = c.currentTime + 0.05;
    if (kind === 'boss') { if (t - this.lastHit < 8) return; this.lastHit = t; this.braam(t, 41.2, 3.2, 1); }
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
