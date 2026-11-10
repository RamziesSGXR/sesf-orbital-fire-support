// (0.55) Enemy turrets: a bot base's guns (one or two among its spawners) and the guns on a Siege Walker's back. Each swings round
// to the nearest ally in reach (C.eturret) and fires every `every` seconds; a hit does dmg, a miss lands a few metres off.
import { CONFIG as C } from '../config.js';
import { hurtTarget } from './combat.js';

export function turretStep(m, T, x, y, dt, mul = 1, range = 0) {
  const K = C.eturret, RG = range || K.range;
  T.cool = (T.cool ?? K.every * 0.5) - dt;
  let best = null, bd = RG * RG;
  for (const a of m.alive) { if (a.dead || a.mounted || a.inside) continue; const d2 = (a.x - x) ** 2 + (a.y - y) ** 2; if (d2 < bd) { bd = d2; best = a; } }
  if (!best) return;
  const want = Math.atan2(best.y - y, best.x - x);
  let da = want - (T.face || 0); while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
  T.face = (T.face || 0) + Math.max(-K.turn * dt, Math.min(K.turn * dt, da));
  if (T.cool > 0 || Math.abs(da) > 0.35) return;
  T.cool = K.every; T.firedAt = m.t;
  const R = m.vrng || m.rng, hit = R.next() < K.acc;
  let tx = best.x, ty = best.y;
  if (!hit) { const [ox, oy] = R.inDisc(5); tx += ox; ty += oy; }
  m.emit('tracer', { x: x + Math.cos(T.face) * 2, y: y + Math.sin(T.face) * 2, tx, ty, s: 'e', f: 'bots', k: 'M', hit, big: false, snd: 'botsM' });
  if (hit) hurtTarget(m, best, K.dmg * m.dmgMul * mul, 'enemy', 'M', x, y);
}
