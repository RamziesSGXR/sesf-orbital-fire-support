// 0.62.9: pay that does not run away in a long or high-level operation (kills past the first few thousand pay less, the
// operation bonus stops growing), and the ground's height shown in what stands on it.
//   node test/r629.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { setElev, elevK, setFlat } from '../js/render/relief.js';
import { propCols } from '../js/render/terrain.js';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const mk = (o = {}) => new Mission({ seed: 5, faction: 'bugs', biome: 'grass', difficulty: 5, missionN: 1, events: false, ...o });

// ---------------------------------------------------------------- pay
{
  const m = mk(); const mul = m.reward * m.bumpPay, S = C.credits.killSoft;
  const c0 = m.cr.total; m.earn('kills', 1000, 0, 0);
  check('the first kills pay in full', Math.abs((m.cr.total - c0) - 1000 * mul) <= 1, `${m.cr.total - c0} for 1000 at x${mul.toFixed(2)}`);
  m.earn('kills', S - 1000, 0, 0); const c1 = m.cr.total; m.earn('kills', 1000, 0, 0);
  check(`past ${S} CR of kills in a mission, kills pay ${C.credits.killTaper * 100}%`, Math.abs((m.cr.total - c1) - 1000 * mul * C.credits.killTaper) <= 1, `${m.cr.total - c1} for 1000`);
  const c2 = m.cr.total; m.earn('bases', 1000, 0, 0);
  check('...and objectives pay as before', Math.abs((m.cr.total - c2) - 1000 * mul * m.opBonus) <= 1, `${m.cr.total - c2}`);
  check('credits stay whole numbers', Number.isInteger(m.cr.total) && Number.isInteger(m.wallet ? m.wallet.bal : 0), m.cr.total);
}
{
  const a = mk({ opDone: 2, missionN: 3 }), b = mk({ opDone: 3, missionN: 4 }), z = mk({ opDone: 14, missionN: 15 }), y = mk({ opDone: 30, missionN: 31 });
  check('the operation bonus still grows over the first missions', b.opBonus > a.opBonus && a.opBonus > 1, `${a.opBonus} → ${b.opBonus}`);
  check(`...and stops at x${C.difficulty.opBonusMax}`, z.opBonus === C.difficulty.opBonusMax && y.opBonus === z.opBonus, `${z.opBonus}, ${y.opBonus}`);
  const k1 = mk({ opDone: 0 }), k2 = mk({ opDone: 14, missionN: 15 }); const p1 = k1.cr.total, p2 = k2.cr.total; k1.earn('kills', 500, 0, 0); k2.earn('kills', 500, 0, 0);
  check('kills are not multiplied by the operation bonus', (k1.cr.total - p1) === (k2.cr.total - p2), `${k1.cr.total - p1} and ${k2.cr.total - p2}`);
  const lo = mk({ difficulty: 1 }), hi = mk({ difficulty: 10 }), top = mk({ difficulty: 16 });
  check('a harder level pays more, within the set range', hi.reward > lo.reward && Math.abs(lo.reward - C.difficulty.reward[0]) < 0.01 && Math.abs(hi.reward - C.difficulty.reward[1]) < 0.01, `${lo.reward} … ${hi.reward}; level 16: ${top.reward.toFixed(2)}`);
}

// ---------------------------------------------------------------- height
{
  const m = mk(), T = m.terrain, K = C.elev.size;
  setFlat(false); setElev((x, y) => 1 + K * (T.height(x, y) - 0.5) * 2);
  let lo = 9, hi = 0, pLo = null, pHi = null;
  for (let i = 0; i < 3000; i++) { const x = (i * 37.7) % 1200, y = (i * 91.3) % 1200, h = T.height(x, y), k = elevK(x, y); if (k < lo) lo = k; if (k > hi) hi = k; if (!pLo || h < pLo.h) pLo = { h, k }; if (!pHi || h > pHi.h) pHi = { h, k }; }
  check(`things on the ground are drawn within ${K * 100}% of their size, by its height`, lo >= 1 - K - 0.011 && hi <= 1 + K + 0.011 && hi > lo, `${lo} … ${hi}`);
  check('...bigger on high ground than on low', pHi.k > pLo.k, `height ${pLo.h.toFixed(2)}: x${pLo.k}; height ${pHi.h.toFixed(2)}: x${pHi.k}`);
  setFlat(true); check('...and not at all with 3D off', elevK(100, 100) === 1);
  setElev(null); setFlat(false); check('...or before a map is up', elevK(100, 100) === 1); setFlat(true);
  const g = propCols('grass'), d = propCols('desert'), q = propCols('nowhere');
  check('craters take their light and dark from the biome', g.light.length === 3 && d.dark.length === 3 && String(g.light) !== String(d.light) && q.light.length === 3, `${g.light} / ${d.light}`);
  check('craters are kept as damage', C.elev.craters.max >= 100 && C.elev.craters.minR > 0);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
