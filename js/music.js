// (0.29) Music, made the way the trailer's score was: no audio files, everything synthesised live from oscillators and noise.
// One piece at 120 BPM in A minor, Am - F - G - Em, two bars a chord. A low drone and a soft pad are always there; over them:
//   the menus: a slow bell picking out the chord, high and quiet;
//   a mission (Dynamic): the music follows the fight. A pulse comes in when the enemy is near the squad, war drums when they are
//     in a fight, and in a heavy one 16th-note hats, snares and a braam on every chord change. When it goes quiet, it falls back.
//   a mission (Ambient): just the drone, the pad and a sparse bell, whatever happens.
// Stingers: a braam when a super heavy arrives; a rising major chord for a win, a falling minor one for a loss.
// Notes are scheduled a little ahead on the audio clock (a 90 ms timer fills the next 0.3 s), so a busy frame doesn't make it stumble.
const BPM = 120, STEP = 60 / BPM / 4;            // one 16th note: 0.125 s
const LOOP = 128;                                 // 8 bars of 16ths: four chords of two bars
const CHORDS = [
  { root: 55.0, pad: [220.0, 261.63, 329.63] },   // Am
  { root: 43.65, pad: [174.61, 220.0, 261.63] },  // F
  { root: 49.0, pad: [196.0, 246.94, 293.66] },   // G
  { root: 41.2, pad: [164.81, 196.0, 246.94] },   // Em
];
const PULSE = [2, 2, 4, 2, 2, 3, 2, 4];           // the pulse's notes, as multiples of the chord's root, one per 8th
const BELL = [0, 1, 2, 1, 2, 0, 1, 2];            // which pad note the bell plays, an octave up, every half bar
export const MUSIC_STYLES = ['dynamic', 'ambient', 'off'];

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
    this.step = 0; this.next = 0; this.built = false; this.timer = null; this.lastHit = -99; this.gains = {}; this.chord = -1;
  }
  get ctx() { return this.a.ctx; }
  setStyle(s) { this.style = MUSIC_STYLES.includes(s) ? s : 'dynamic'; }

  build() {
    const c = this.ctx; if (!c || this.built || !this.a.musBus) return;
    this.built = true;
    this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(this.a.musBus);
    this.verb = c.createConvolver(); this.verb.buffer = impulse(c, 2.8);
    const wet = c.createGain(); wet.gain.value = 0.5; this.verb.connect(wet); wet.connect(this.out);
    const layer = (send) => { const g = c.createGain(); g.gain.value = 0; g.connect(this.out); const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(this.verb); return g; };
    this.L = { drone: layer(0.25), pad: layer(0.45), bell: layer(0.7), pulse: layer(0.3), drums: layer(0.35), hats: layer(0.2), hits: layer(0.5) };
    this.L.hits.gain.value = 1;
    // the drone: two detuned saws and a sine an octave down, under a low lowpass
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
    this.setChord(0, c.currentTime);
    this.next = c.currentTime + 0.1; this.step = 0;
    this.timer = setInterval(() => this.tick(), 90);
  }

  // Each frame: what is on screen (menu | play | pause | cine | end) and how hot the fight is (0..1, play only).
  update(dt, scene, heat = 0) {
    const c = this.ctx; if (!c) return;
    if (!this.built) this.build();
    if (!this.built) return;
    this.scene = scene;
    const h = Math.max(0, Math.min(1, heat));
    this.heat += (h - this.heat) * (1 - Math.exp(-dt / (h > this.heat ? 1.5 : 7)));     // up in a second or two, down slowly
    // the level, with a little hysteresis so it doesn't flicker at an edge
    const up = [0.1, 0.32, 0.6], lv0 = this.level;
    let lv = 0;
    if (this.style === 'dynamic' && (scene === 'play' || scene === 'pause')) {
      lv = this.heat > up[2] ? 3 : this.heat > up[1] ? 2 : this.heat > up[0] ? 1 : 0;
      if (lv < lv0 && this.heat > up[lv0 - 1] - 0.07) lv = lv0;
    }
    this.level = lv;
    const off = this.style === 'off', menu = scene === 'menu' || scene === 'end', amb = this.style === 'ambient';
    const T = {
      out: off ? 0 : scene === 'cine' ? 0.3 : scene === 'pause' ? 0.6 : 1,
      drone: menu ? 0.6 : amb ? 0.8 : [0.55, 0.65, 0.85, 1][lv],
      pad: menu ? 1 : amb ? 0.9 : [0.55, 0.45, 0.35, 0.3][lv],
      bell: menu ? 1 : amb ? 0.45 : 0,
      pulse: lv >= 1 ? 1 : 0,
      drums: lv >= 2 ? (lv >= 3 ? 1 : 0.75) : 0,
      hats: lv >= 3 ? 1 : 0,
    };
    for (const k in T) {
      if (Math.abs((this.gains[k] ?? -1) - T[k]) < 0.001) continue;
      this.gains[k] = T[k];
      const g = k === 'out' ? this.out.gain : this.L[k].gain;
      g.cancelScheduledValues(c.currentTime); g.setTargetAtTime(T[k], c.currentTime, k === 'out' ? 0.5 : T[k] > 0 ? 0.6 : 1.4);
    }
  }

  // Fill the next 0.3 s of the audio clock with notes. Skipped while the music is off or the tab is hidden (on coming back it
  // starts again from now rather than playing everything it missed at once).
  tick() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    if (this.style === 'off' || (typeof document !== 'undefined' && document.hidden)) { this.next = 0; return; }
    const now = c.currentTime;
    if (this.next < now) this.next = now + 0.05;
    while (this.next < now + 0.3) { this.play(this.step, this.next); this.step = (this.step + 1) % LOOP; this.next += STEP; }
  }

  setChord(k, t) {
    const ch = CHORDS[k % CHORDS.length]; this.chord = k % CHORDS.length;
    for (const v of this.dr) v.o.frequency.setTargetAtTime(ch.root * v.mul, t, 0.12);
    for (const v of this.pv) { v.o.frequency.setTargetAtTime(ch.pad[v.k], t, 0.25); v.s.frequency.setTargetAtTime(ch.pad[v.k] / 2, t, 0.25); }
  }

  // One 16th note: what each layer plays on it.
  play(i, t) {
    const bar = i % 16, ch = CHORDS[Math.floor(i / 32) % CHORDS.length], lv = this.level, g = this.gains;
    if (i % 32 === 0) { this.setChord(Math.floor(i / 32), t); if (lv >= 3) this.braam(t, ch.root, 2.6, 0.55); }
    if (g.bell > 0 && i % 8 === 0) { const k = BELL[(i / 8) % BELL.length]; if (this.scene !== 'play' || i % 16 === 0) this.bell(t, ch.pad[k] * 2, 0.07); }
    if (g.pulse > 0 && i % 2 === 0) this.pluck(t, ch.root * PULSE[(i / 2) % PULSE.length], bar === 0 ? 1 : 0.65);
    if (g.drums > 0) {
      if (bar === 0 || bar === 8) this.taiko(t, 1);
      else if (bar === 6 || bar === 14) this.taiko(t, 0.55);
      else if (lv >= 3 && (bar === 11 || bar === 3)) this.taiko(t, 0.45);
      if (lv >= 3 && (bar === 4 || bar === 12)) this.snare(t, 0.8);
    }
    if (g.hats > 0) this.hat(t, bar % 4 === 0 ? 1 : bar % 2 === 0 ? 0.6 : 0.35);
  }

  // ---- the instruments (each note is its own short-lived nodes)
  env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  osc(type, f, t, dur, dest) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; }
  noise(t, dur, dest) { const s = this.ctx.createBufferSource(); s.buffer = this.a.noiseBuf; s.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05); return s; }
  pluck(t, f, acc) {
    const c = this.ctx, fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = 'lowpass'; fl.Q.value = 2; fl.frequency.setValueAtTime(1600, t); fl.frequency.exponentialRampToValueAtTime(260, t + 0.16);
    this.env(g, t, 0.004, 0.28 * acc, 0.2); fl.connect(g); g.connect(this.L.pulse);
    this.osc('sawtooth', f, t, 0.22, fl); this.osc('sawtooth', f * 1.004, t, 0.22, fl);
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
  bell(t, f, a) {
    const c = this.ctx, g = c.createGain(); this.env(g, t, 0.003, a, 1.8); g.connect(this.L.bell);
    this.osc('sine', f, t, 1.9, g);
    const g2 = c.createGain(); g2.gain.value = 0.18; g2.connect(g); this.osc('sine', f * 2.76, t, 0.6, g2);
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
  // Stingers: 'boss' (a braam, at most one every 8 s), 'win', 'lose'.
  hit(kind) {
    const c = this.ctx; if (!c || !this.built || this.style === 'off') return;
    const t = c.currentTime + 0.05;
    if (kind === 'boss') { if (t - this.lastHit < 8) return; this.lastHit = t; this.braam(t, 41.2, 3.2, 1); return; }
    if (kind === 'win') {
      this.braam(t, 55, 3.6, 0.7);
      [440, 554.37, 659.25, 880].forEach((f, i) => this.bell(t + 0.25 + i * 0.18, f, 0.09));
      return;
    }
    if (kind === 'lose') {
      this.braam(t, 36.71, 4, 0.8);
      [329.63, 293.66, 261.63, 220].forEach((f, i) => this.bell(t + 0.3 + i * 0.3, f, 0.07));
    }
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
