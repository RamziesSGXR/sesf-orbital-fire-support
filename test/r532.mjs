// 0.53.2 Player reports: each Eagle stratagem has its own runs (one used up does not ground the others); the Eagle rearms once
// all are out, or early on the gunner's call; and a squad crossing a light bridge gets over it (no Helldiver left standing at
// the edge of the deck). Run: node test/r532.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet, buy, hangarStats } from '../js/data/kit.js';
import { syncSlots, fireSlot } from '../js/sim/player.js';
import { makePost } from '../js/sim/posts.js';
import { holdSites } from '../js/sim/cover.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, s, f) => { for (let i = 0, n = Math.round(s / dt); i < n && !m.over; i++) { m.step(dt); if (f) f(m); } };

// ---------------------------------------------------------------- the Eagles
{
  const m = new Mission({ seed: 532, faction: 'bots', biome: 'grass', difficulty: 2, events: true });
  const k = m.kit, w = newWallet(1e6);
  buy(k, w, 'own:eagle_500'); buy(k, w, 'own:eagle_rockets'); buy(k, w, 'own:eagle_napalm');
  k.loadout = ['eagle_500', 'eagle_rockets', 'eagle_napalm', 'orb_120', ''];
  syncSlots(m); m.deployNow(); run(m, 20);
  const p = m.player, H = hangarStats(k), at = (id) => p.slots.findIndex((s) => s.id === id);
  const i500 = at('eagle_500'), iRk = at('eagle_rockets'), iNp = at('eagle_napalm');
  check('three Eagles in the bar, each with the Hangar\'s runs of its own', [i500, iRk, iNp].every((i) => i > 0 && p.slots[i].eu === H.uses), [i500, iRk, iNp].map((i) => i > 0 && p.slots[i].eu).join(','));
  const aim = () => { const a = m.hdAlive[0]; p.aimX = a.x + 45; p.aimY = a.y; };
  const call = (i) => { p.slots[i].readyAt = 0; aim(); return fireSlot(m, i); };
  // the player's report: a 500, then a rocket pod, and both went on rearm
  check('a 500 kg, then rocket pods: both go', call(i500) && call(iRk));
  check('...and neither is grounded: each has a run left, and the Eagle is not away', p.slots[i500].eu === H.uses - 1 && p.slots[iRk].eu === H.uses - 1 && p.eagle.rearmAt === 0);
  let n = 0; for (let k2 = 0; k2 < H.uses + 2; k2++) if (call(i500)) n++;
  check('the 500 kg runs out of its own runs; the Eagle stays (the others still have theirs)', n === H.uses - 1 && p.slots[i500].eu === 0 && p.eagle.rearmAt === 0 && call(iNp), `${n} more, eu ${p.slots[i500].eu}`);
  check('an Eagle out of runs is refused with its own reason', !call(i500) && m.events.some((e) => e.type === 'deny' && e.reason === 'eagleempty'));
  // the early rearm
  const r = m.eagleRearm();
  check('EAGLE REARM with runs still on the others: the Eagle goes back now, for the Hangar\'s rearm time', r.ok && Math.abs(p.eagle.rearmAt - m.t - H.rearm) < 0.1 && m.events.some((e) => e.type === 'eagle_rearm' && e.early));
  check('while it is away no Eagle can be called (the ones with runs left too), and a second rearm is refused', !call(iNp) && !call(iRk) && !m.eagleRearm().ok);
  run(m, H.rearm + 1);
  check('back from the rearm: every Eagle full', [i500, iRk, iNp].every((i) => p.slots[i].eu === H.uses) && p.eagle.rearmAt === 0 && m.events.some((e) => e.type === 'eagle_ready'));
  check('full, there is nothing to rearm: refused', !m.eagleRearm().ok && m.events.some((e) => e.type === 'deny' && e.reason === 'eaglefull'));
  // every Eagle out: it goes back on its own
  for (const i of [i500, iRk, iNp]) for (let k2 = 0; k2 < H.uses; k2++) call(i);
  check('every Eagle out of runs: the Eagle goes back to rearm by itself', [i500, iRk, iNp].every((i) => p.slots[i].eu === 0) && p.eagle.rearmAt > m.t && m.events.some((e) => e.type === 'eagle_rearm' && !e.early));
  // a Hangar level bought mid-mission: a run more for every Eagle
  run(m, H.rearm + 1);
  const before = p.slots[i500].eu; k.hangar = (k.hangar || 1) + 2; run(m, 0.2);
  const H2 = hangarStats(k);
  check('a Hangar level bought mid-mission: every Eagle gets the extra run', H2.uses > H.uses && [i500, iRk, iNp].every((i) => p.slots[i].eu === before + (H2.uses - H.uses)), `${H.uses} -> ${H2.uses}: ${[i500, iRk, iNp].map((i) => p.slots[i].eu).join(',')}`);
  const m2 = new Mission({ seed: 533, faction: 'bots', biome: 'grass', difficulty: 2, events: true });
  check('no Eagle in the loadout: EAGLE REARM is refused', !m2.eagleRearm().ok);
}

// ---------------------------------------------------------------- the light bridge
// For each river crossing found, a deck is laid and the squad's anchor walked over it: every Helldiver must get across (the
// player's report: one stood at the edge of the deck, beside it, for good). SEAF ordered over it must get across too.
{
  let n = 0, hdStuck = [], sfStuck = [];
  for (const [biome, seed] of [['jungle', 404], ['ice', 222], ['grass', 101], ['ice', 505]]) {
    const m0 = new Mission({ seed, faction: 'bugs', biome, difficulty: 1, events: false, boss: false });
    const T = m0.terrain, B = m0.ao, spans = [];
    for (let y = B.y0 + 60; y < B.y1 - 60 && spans.length < 3; y += 37) for (let x = B.x0 + 60; x < B.x1 - 60 && spans.length < 3; x += 37) {
      if (!T.blocked(x, y)) continue;
      const s = T.findSpan(x, y, C.build.bridge.span); if (!s) continue;
      const ux = (s.x2 - s.x1) / s.L, uy = (s.y2 - s.y1) / s.L;
      if (T.blocked(s.x1 - ux * 10, s.y1 - uy * 10) || T.blocked(s.x2 + ux * 18, s.y2 + uy * 18)) continue;
      if (spans.some((q) => Math.hypot(q.x1 - s.x1, q.y1 - s.y1) < 30)) continue;
      // (at the objective the squad sets up and stands; by a base it fans out round it)
      const near = (o) => Math.hypot(o.x - s.x2, o.y - s.y2) < 160 || Math.hypot(o.x - s.x1, o.y - s.y1) < 160;
      if (m0.objectives.some(near) || (m0.bases || []).some((b) => !b.destroyed && near(b))) continue;
      const inAo = (x, y) => x > B.x0 + 45 && x < B.x1 - 45 && y > B.y0 + 45 && y < B.y1 - 45;     // (movers are held inside the area)
      if (!inAo(s.x1 - ux * 25, s.y1 - uy * 25) || !inAo(s.x2 + ux * 40, s.y2 + uy * 40)) continue;
      spans.push(s);
    }
    for (const span of spans) {
      n++;
      const ux = (span.x2 - span.x1) / span.L, uy = (span.y2 - span.y1) / span.L;
      const A = { x: span.x1 - ux * 10, y: span.y1 - uy * 10 }, Bp = { x: span.x2 + ux * 18, y: span.y2 + uy * 18 };
      const m = new Mission({ seed, faction: 'bugs', biome, difficulty: 1, events: false, boss: false });
      makePost(m, 'bridge', span.x1, span.y1, { span, lvl: 1 });
      m.deployNow(); run(m, 12);
      const sq = m.squad;
      for (const a of m.hdAlive) { a.x = A.x; a.y = A.y; a.hp = a.maxHp = 1e6; }
      sq.ax = A.x; sq.ay = A.y; let s = 0;
      run(m, 50, () => { for (const e of m.enemies) e.dead = true; s = Math.min(span.L + 28, s + 4.5 * dt); sq.ax = A.x + ux * s; sq.ay = A.y + uy * s; sq.state = 'advance'; });
      if (holdSites(m, sq.ax, sq.ay)) { n--; continue; }     // (a walled defence site by the far bank: they man its walls, as they should)
      const far = m.hdAlive.map((a) => Math.hypot(a.x - Bp.x, a.y - Bp.y));
      if (Math.max(...far) > 30) hdStuck.push(`${biome}/${seed} ${Math.round(span.L)}m: ${far.map(Math.round).join(',')}`);
      const m3 = new Mission({ seed, faction: 'bugs', biome, difficulty: 1, events: false, boss: false });
      makePost(m3, 'bridge', span.x1, span.y1, { span, lvl: 1 });
      const mine = [];
      for (let k = 0; k < 6; k++) { const a = m3.addAlly('S', A.x + (k % 3) * 2, A.y + Math.floor(k / 3) * 2, { role: 'rifle' }); a.sq = 0; a.hp = a.maxHp = 1e6; mine.push(a); }
      m3._refreshAlive(); m3.selectSquad(0); m3.seafOrder('move', Bp.x, Bp.y);
      run(m3, 60, () => { for (const e of m3.enemies) e.dead = true; });
      const sf = mine.map((a) => Math.hypot(a.x - Bp.x, a.y - Bp.y));
      if (Math.max(...sf) > 35) sfStuck.push(`${biome}/${seed} ${Math.round(span.L)}m: ${sf.map(Math.round).join(',')}`);
    }
  }
  check(`Helldivers walked over ${n} light bridges: every one of them gets across`, n >= 8 && !hdStuck.length, hdStuck.join(' | ') || `${n} bridges`);
  check(`SEAF ordered over them: every trooper gets across`, n >= 8 && !sfStuck.length, sfStuck.join(' | ') || `${n} bridges`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
