// Synthesised sound: no audio files. Everything is built from noise and oscillators.
// Every weapon has its own voice, including the enemy ones, so a firefight can be read by ear:
//   squad rifles crack, SMGs tick, grenades thunk, rockets whoosh, sentries chug, tesla zaps,
//   bugs skitter and spit, bots blast and boom, squids hum and pulse.
export class Audio {
  constructor() {
    this.ctx = null; this.master = null; this.volume = 0.6; this.muted = false; this.voices = 0; this.hum = null; this.noiseBuf = null;
    this.last = {};
  }

  // Browsers only allow audio after a user gesture, so call this from a click or tap.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this._applyVolume();
      const len = this.ctx.sampleRate * 1.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch { this.ctx = null; }
  }

  set(volume, muted) { this.volume = volume; this.muted = muted; this._applyVolume(); }
  _applyVolume() { if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.8; }

  // True when this key may sound again (each sound has its own minimum gap, so a swarm doesn't turn into static).
  _ok(key, gap) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[key] || 0) < gap) return false;
    this.last[key] = now; return true;
  }

  _noise(dur, f0, f1, gain, type = 'lowpass', q = 0.7, delay = 0) {
    const c = this.ctx; if (!c || this.voices > 28) return;
    const t = c.currentTime + delay, src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf; src.loop = true;
    flt.type = type; flt.Q.value = q; flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(Math.max(0.0002, gain), t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    this.voices++; src.start(t, Math.random()); src.stop(t + dur + 0.05);
    src.onended = () => { this.voices--; };
  }
  _tone(f0, f1, dur, gain, type = 'sine', delay = 0) {
    const c = this.ctx; if (!c || this.voices > 28) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.01, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    this.voices++; o.start(t); o.stop(t + dur + 0.05);
    o.onended = () => { this.voices--; };
  }

  // One shot of a named weapon. `v` is how loud it is on screen (0..1).
  snd(key, v = 1) {
    if (!this.ctx || !key) return;
    const S = VOICES[key]; if (!S) return;
    if (!this._ok(key, S.gap)) return;
    // A global gunfire budget: when the field is busy, only the louder shots get through.
    const now = this.ctx.currentTime;
    this._budget = (this._budget || 0) * Math.exp(-(now - (this._bt || now)) * 5) + 1; this._bt = now;
    if (this._budget > 9 && v < 0.6) return;
    S.f(this, v * (S.vol || 1));
  }

  boom(r, v = 1) {
    if (!this.ctx) return;
    if (r < 3) return;
    const big = Math.min(1, r / 30);
    this._noise(0.35 + big * 0.9, 1400 - big * 700, 60, (0.25 + big * 0.55) * v);
    if (r >= 8) this._tone(90 - big * 30, 28, 0.5 + big * 0.7, (0.35 + big * 0.35) * v);
  }
  strikeCall(id) { if (!this.ctx) return; this._tone(1800, 500, 0.5, 0.12, 'sawtooth'); if (id === 'strike_barrage' || id === 'strike_rail') this._tone(300, 900, 3, 0.07, 'sawtooth'); }
  deny() { if (!this.ctx) return; this._tone(160, 150, 0.18, 0.18, 'square'); }
  chirp() { if (!this._ok('chirp', 0.12)) return; this._tone(1500, 1900, 0.06, 0.07, 'square'); this._tone(1900, 1500, 0.06, 0.07, 'square', 0.08); }
  alarm() { if (!this.ctx) return; this._tone(880, 880, 0.12, 0.14, 'square'); this._tone(660, 660, 0.12, 0.14, 'square', 0.16); }
  ready() { if (!this.ctx) return; this._tone(700, 1000, 0.08, 0.08, 'triangle'); }
  baseDown() { if (!this.ctx) return; this._noise(1.6, 900, 40, 0.8); this._tone(70, 25, 1.4, 0.7); }
  podLand() { if (!this._ok('pod', 0.2)) return; this._noise(0.4, 600, 100, 0.35); this._tone(120, 50, 0.3, 0.3); }
  allyDown() { if (!this._ok('down', 0.15)) return; this._tone(420, 120, 0.4, 0.12, 'sawtooth'); }
  win() { if (!this.ctx) return; [523, 659, 784, 1046].forEach((f, i) => this._tone(f, f, 0.3, 0.12, 'triangle', i * 0.14)); }
  lose() { if (!this.ctx) return; [392, 330, 262, 196].forEach((f, i) => this._tone(f, f * 0.98, 0.4, 0.14, 'sawtooth', i * 0.2)); }
  stratCall() { if (!this._ok('sc', 0.1)) return; this._tone(900, 1300, 0.12, 0.08, 'triangle'); this._tone(1300, 1700, 0.12, 0.08, 'triangle', 0.13); }
  objective() { if (!this.ctx) return; [440, 554, 659, 880].forEach((f, i) => this._tone(f, f, 0.22, 0.1, 'triangle', i * 0.1)); }
  siren() { if (!this.ctx) return; this._tone(500, 900, 0.7, 0.12, 'sawtooth'); this._tone(900, 500, 0.7, 0.12, 'sawtooth', 0.7); }
  beam() { if (!this._ok('beam', 0.3)) return; this._tone(220, 880, 0.5, 0.14, 'sawtooth'); this._noise(0.4, 2400, 300, 0.18, 'bandpass', 2); }
  nukeBlast() { if (!this.ctx) return; this._noise(3.2, 1500, 30, 0.95); this._tone(60, 22, 2.8, 0.9); this._tone(120, 30, 1.8, 0.5, 'sawtooth'); }
  click() { if (!this.ctx) return; this._tone(900, 700, 0.04, 0.08, 'square'); }
  // Credits coming in: a small bright ping, rate limited so a kill streak is a trill and not a wall.
  coin() { if (!this._ok('coin', 0.09)) return; this._tone(1500, 2100, 0.07, 0.045, 'triangle'); }
  // The UAV scan: a rising sweep and two radar blips.
  uav() {
    if (!this.ctx) return;
    this._tone(260, 1300, 0.7, 0.1, 'sine');
    this._tone(1900, 1900, 0.05, 0.08, 'square', 0.75); this._tone(1900, 1900, 0.05, 0.08, 'square', 0.9);
  }

  // Low ship hum while a mission runs.
  humStart() {
    const c = this.ctx; if (!c || this.hum) return;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 55; o2.type = 'sine'; o2.frequency.value = 110.5;
    f.type = 'lowpass'; f.frequency.value = 220; g.gain.value = 0.035;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o.start(); o2.start(); this.hum = { o, o2, g };
  }
  humStop() {
    if (!this.hum) return;
    try { this.hum.o.stop(); this.hum.o2.stop(); } catch { /* already stopped */ }
    this.hum = null;
  }
}

// The voice of every weapon. gap = minimum seconds between two of them, vol = base loudness, f = how it sounds.
const VOICES = {
  // ---- Helldivers, SEAF and stratagem weapons
  rifle:   { gap: 0.07, vol: 1, f: (a, v) => { a._noise(0.07, 3200, 1100, 0.11 * v, 'bandpass', 1.3); a._tone(900, 300, 0.05, 0.03 * v, 'square'); } },
  smg:     { gap: 0.05, vol: 1, f: (a, v) => a._noise(0.035, 4200, 2200, 0.07 * v, 'bandpass', 1.6) },
  grenade: { gap: 0.2,  vol: 1, f: (a, v) => { a._tone(210, 70, 0.14, 0.14 * v, 'triangle'); a._noise(0.1, 700, 200, 0.12 * v); } },
  rocket:  { gap: 0.15, vol: 1, f: (a, v) => { a._noise(0.4, 500, 2400, 0.16 * v, 'bandpass', 0.9); a._tone(140, 55, 0.2, 0.18 * v); } },
  mg:      { gap: 0.06, vol: 1, f: (a, v) => { a._noise(0.07, 2000, 500, 0.12 * v); a._tone(150, 110, 0.05, 0.07 * v, 'square'); } },
  gat:     { gap: 0.045, vol: 1, f: (a, v) => a._noise(0.04, 2600, 1100, 0.08 * v, 'bandpass', 1.1) },
  ac:      { gap: 0.1,  vol: 1, f: (a, v) => { a._noise(0.16, 1600, 140, 0.26 * v); a._tone(120, 52, 0.14, 0.2 * v); } },
  mortar:  { gap: 0.2,  vol: 1, f: (a, v) => { a._tone(100, 38, 0.22, 0.28 * v); a._noise(0.18, 500, 90, 0.18 * v); a._tone(1300, 450, 0.35, 0.03 * v, 'sine', 0.1); } },
  zap:     { gap: 0.08, vol: 1, f: (a, v) => { a._tone(1500, 260, 0.1, 0.07 * v, 'sawtooth'); a._noise(0.08, 5000, 1500, 0.06 * v, 'bandpass', 2); } },
  flame:   { gap: 0.11, vol: 1, f: (a, v) => a._noise(0.26, 1000, 450, 0.1 * v, 'lowpass', 0.5) },
  rail:    { gap: 0.3,  vol: 1, f: (a, v) => { a._tone(2600, 280, 0.2, 0.16 * v, 'sawtooth'); a._noise(0.14, 3200, 200, 0.2 * v); } },
  missile: { gap: 0.2,  vol: 1, f: (a, v) => { a._noise(0.5, 900, 3400, 0.14 * v, 'highpass', 0.7); a._tone(380, 1100, 0.35, 0.07 * v, 'sawtooth'); } },
  dog:     { gap: 0.1,  vol: 1, f: (a, v) => a._tone(1900, 650, 0.08, 0.06 * v, 'square') },
  frvgun:  { gap: 0.07, vol: 1, f: (a, v) => { a._noise(0.08, 1300, 300, 0.16 * v); a._tone(95, 70, 0.07, 0.1 * v, 'square'); } },
  mechgat: { gap: 0.05, vol: 1, f: (a, v) => { a._tone(105, 85, 0.05, 0.08 * v, 'sawtooth'); a._noise(0.05, 1800, 600, 0.1 * v, 'bandpass', 0.9); } },
  mechrkt: { gap: 0.25, vol: 1, f: (a, v) => { a._noise(0.5, 400, 2000, 0.22 * v, 'bandpass', 0.8); a._tone(90, 40, 0.3, 0.26 * v); } },
  // ---- Terminids: skitter, spit, stomp
  bugsL:   { gap: 0.09, vol: 0.8, f: (a, v) => { a._noise(0.025, 5200, 3600, 0.05 * v, 'bandpass', 3); a._noise(0.025, 4600, 3000, 0.04 * v, 'bandpass', 3, 0.04); } },
  bugsM:   { gap: 0.15, vol: 1, f: (a, v) => { a._noise(0.12, 1500, 500, 0.1 * v, 'bandpass', 1.4); a._tone(320, 140, 0.1, 0.06 * v, 'sine'); } },
  bugsH:   { gap: 0.25, vol: 1, f: (a, v) => { a._tone(75, 38, 0.3, 0.26 * v, 'sawtooth'); a._noise(0.25, 500, 70, 0.2 * v); } },
  // ---- Automatons: blaster, cannon, tank gun
  botsL:   { gap: 0.07, vol: 1, f: (a, v) => { a._tone(1200, 520, 0.06, 0.06 * v, 'square'); a._noise(0.04, 3000, 1500, 0.04 * v, 'bandpass', 1.2); } },
  botsM:   { gap: 0.12, vol: 1, f: (a, v) => { a._tone(620, 190, 0.1, 0.1 * v, 'square'); a._noise(0.09, 1800, 400, 0.12 * v); } },
  botsH:   { gap: 0.3,  vol: 1, f: (a, v) => { a._noise(0.4, 900, 50, 0.3 * v); a._tone(80, 30, 0.35, 0.32 * v); a._tone(700, 200, 0.12, 0.05 * v, 'square'); } },
  // ---- Illuminate: cold hum, warble, deep pulse
  squidsL: { gap: 0.1,  vol: 1, f: (a, v) => a._tone(1700, 950, 0.09, 0.05 * v, 'triangle') },
  squidsM: { gap: 0.15, vol: 1, f: (a, v) => { a._tone(700, 1150, 0.12, 0.07 * v, 'triangle'); a._tone(1150, 700, 0.12, 0.06 * v, 'triangle', 0.1); } },
  squidsH: { gap: 0.3,  vol: 1, f: (a, v) => { a._tone(95, 55, 0.4, 0.26 * v, 'sine'); a._tone(190, 130, 0.3, 0.08 * v, 'triangle', 0.05); a._noise(0.25, 600, 120, 0.1 * v); } },
};
