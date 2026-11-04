// Bodies thrown by blasts. Visual only: the sim is untouched, a unit that dies inside a blast is simply drawn once more as a flying
// copy of itself, and that copy has its own little physics (launch, spin, arc, bounce, slide), then fades out where it lands.
//
// How a body is made: the sim emits 'boom' (centre and radius) and, for each death, 'kill' or 'ally_down' (where, plus the unit's
// id, facing and size). The order of those events inside one frame is not guaranteed, so deaths wait in `pend` and are matched to a
// recent blast in resolve(), once the whole frame's events have come in. A death that is not inside any recent blast is ignored.
//
// Why it is not just an animation: throw distance and height come from how close the unit was to the centre of the blast and how
// heavy it is (a light bug flies, a heavy only lurches); bodies stop against terrain that blocks movement; a bounce takes speed and
// spin off; a second blast re-throws any body still lying within it.
import { SUBTYPES } from '../data/data.js';
import { CONFIG as C } from '../config.js';
import { drawAllyBody, drawEnemyBody, enemyR } from './units.js';

const TAU = Math.PI * 2;
const G = 60;                 // m/s^2, so a 3 m hop lasts about 0.6 s and a 30 m arc about 2 s
const MAX_BODIES = 50;        // a big strike on a swarm kills a hundred at once: past this, the oldest bodies go first
const HOLD = 0.9, FADE = 0.9; // seconds a landed body lies there, then fades
const MIN_BOOM = 3.5;         // smaller blasts (a spat glob, a grenade nick) do not throw anyone
const MASS = { L: 1, M: 0.62, H: 0.3 };

export class Launch {
  constructor(renderer) { this.r = renderer; this.booms = []; this.pend = []; this.bodies = []; this.last = 0; }
  clear() { this.booms.length = 0; this.pend.length = 0; this.bodies.length = 0; }

  onEvent(ev, now) {
    if (ev.type === 'boom') {
      if (!(ev.r >= MIN_BOOM)) return;
      const bm = { x: ev.x, y: ev.y, r: ev.r, t: now };
      this.booms.push(bm); if (this.booms.length > 24) this.booms.shift();
      for (const b of this.bodies) {            // a body still lying in the new blast is thrown again, less far than a fresh one
        if (!b.landed || b.fade < 0.4 || (b.x - bm.x) ** 2 + (b.y - bm.y) ** 2 > (bm.r * 1.1) ** 2) continue;
        this._throw(b, bm, 0.7);
      }
    } else if (ev.type === 'kill') { if (!ev.boss) this.pend.push({ ev, ally: false, t: now }); }
    else if (ev.type === 'ally_down') this.pend.push({ ev, ally: true, t: now });
  }

  // Match this frame's deaths to the blasts that caused them.
  _resolve() {
    if (!this.pend.length) return;
    for (const p of this.pend) {
      const ev = p.ev; let best = null, bf = 1;
      for (const bm of this.booms) {
        if (Math.abs(p.t - bm.t) > 0.6) continue;
        const f = Math.hypot(ev.x - bm.x, ev.y - bm.y) / (bm.r * 1.25);
        if (f < bf) { bf = f; best = bm; }
      }
      if (!best) continue;
      const b = {
        x: ev.x, y: ev.y, z: 0, vx: 0, vy: 0, vz: 0, rot: ev.face || 0, spin: 0, ally: p.ally, kind: ev.kind, sub: ev.sub || '', id: ev.id || 0,
        role: ev.role, type: ev.unit, team: ev.team, r0: ev.r, landed: false, bounces: 0, marked: false, age: 0, tl: 0, fade: 1,
        mass: p.ally ? (ev.type === 'H' ? 0.7 : 0.9) : (MASS[ev.kind] ?? 0.6),
      };
      this._throw(b, best, b.mass);
      this.bodies.push(b);
      if (this.bodies.length > MAX_BODIES) this.bodies.shift();
    }
    this.pend.length = 0;
  }

  _throw(b, bm, mass) {
    const dx = b.x - bm.x, dy = b.y - bm.y, d = Math.hypot(dx, dy);
    const f = Math.pow(Math.max(0, 1 - d / (bm.r * 1.25)), 0.7);                       // 1 at the centre, 0 at the edge
    const ang = (d < 0.8 ? Math.random() * TAU : Math.atan2(dy, dx)) + (Math.random() - 0.5) * 0.5;
    const D = Math.min(90, bm.r * (0.4 + 1.2 * f) * mass * (0.8 + Math.random() * 0.4)); // how far it will go, roughly
    const H = Math.min(30, Math.max(2.5, D * 0.35));                                  // how high
    const vz = Math.sqrt(2 * G * H), T = 2 * vz / G, v = (D * 0.75) / T;
    b.vx = Math.cos(ang) * v; b.vy = Math.sin(ang) * v; b.vz = vz;
    b.spin = (Math.random() < 0.5 ? -1 : 1) * (4 + 9 * f) * (this.r.settings.reduceFlash ? 0.3 : 1);
    b.landed = false; b.bounces = 0; b.fade = 1; b.age = 0; b.marked = false;
  }

  _step(dt, m) {
    const tr = m.terrain, S = C.world.size, bodies = this.bodies, black = this.r.settings.polarity === 'black';
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      b.age += dt;
      if (!b.landed) { b.vz -= G * dt; b.z += b.vz * dt; }
      else { const k = Math.exp(-5 * dt); b.vx *= k; b.vy *= k; b.spin *= k; }
      let nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      if ((b.landed || b.z < 2) && tr && tr.blocked(nx, ny)) { b.vx *= -0.25; b.vy *= -0.25; b.spin *= 0.5; nx = b.x; ny = b.y; }   // a wall or a cliff stops it
      b.x = Math.max(0, Math.min(S, nx)); b.y = Math.max(0, Math.min(S, ny)); b.rot += b.spin * dt;
      if (!b.landed && b.z <= 0 && b.vz < 0) {
        if (!b.marked) { b.marked = true; this.r._mark(b.x, b.y, b.ally ? 0.9 : (b.kind === 'H' ? 1.2 : 0.7), black); }
        if (b.bounces < 2 && -b.vz > 10) { b.z = 0; b.vz = -b.vz * 0.35; b.vx *= 0.65; b.vy *= 0.65; b.spin *= 0.6; b.bounces++; }
        else { b.z = 0; b.vz = 0; b.landed = true; b.tl = b.age; }
      }
      if (b.landed) { const k = (b.age - b.tl - HOLD) / FADE; b.fade = 1 - Math.max(0, k); if (k >= 1) bodies.splice(i, 1); }
    }
  }

  // Called once a frame from the renderer, after the allies are drawn: flying bodies are above everything else on the ground.
  draw(ctx, m, now, px, pal, fid) {
    const dt = Math.min(0.05, Math.max(0, now - this.last)); this.last = now;
    this._resolve();
    if (this.booms.length) { while (this.booms.length && now - this.booms[0].t > 1) this.booms.shift(); }
    if (!this.bodies.length) return;
    this._step(dt, m);
    for (const b of this.bodies) {
      const proxy = { x: 0, y: 0, face: b.rot, id: b.id, kind: b.kind, sub: b.sub, r: b.r0, role: b.role, type: b.type, down: false, braceUntil: 0 };
      const lift = b.z * 0.45, s = 1 + Math.min(0.8, b.z * 0.025);
      const r = b.ally ? Math.max(b.type === 'H' ? 2.6 : 1.9, px(b.type === 'H' ? 7 : 5)) : enemyR(proxy, SUBTYPES[b.kind] || SUBTYPES.L, px);
      // the shadow stays on the ground and shrinks and fades as the body climbs
      ctx.globalAlpha = b.fade * Math.max(0.12, 0.38 - b.z * 0.006); ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(b.x + b.z * 0.12, b.y + b.z * 0.12, r * 1.1 * (1 - Math.min(0.4, b.z * 0.01)), r * 0.9 * (1 - Math.min(0.4, b.z * 0.01)), 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = b.fade;
      ctx.save(); ctx.translate(b.x, b.y - lift); ctx.scale(s, s);
      if (b.ally) { const tm = b.team !== undefined ? m.teams[b.team] : null; drawAllyBody(ctx, proxy, r, pal.ally, tm && b.type === 'H' ? tm.color : null, false, now, px, m.t); }
      else drawEnemyBody(ctx, proxy, fid, r, pal.enemy, now, px, false);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
