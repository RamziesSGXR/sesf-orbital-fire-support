// 0.62.10: the field's own sound. What makes noise on the field is listed with where it is (soundscape.js); the audio keeps
// the nearest few playing from their places (audio.js; test/ui6210.mjs runs that in a browser).
//   node test/r6210.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { spawnGroup } from '../js/sim/director.js';
import { soundSources, resetScape } from '../js/soundscape.js';
import { Audio, SCAPE_KINDS } from '../js/audio.js';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const dt = 1 / C.world.tickHz;

check('no score for now: the music is off', C.musicOn === false);
for (const fac of ['bugs', 'bots', 'squids']) {
  resetScape();
  const m = new Mission({ seed: 41, faction: fac, biome: 'grass', difficulty: 5, missionN: 2, events: false });
  m.deployNow(); for (let i = 0; i < 30 * 12 && !m.hdAlive.length; i++) m.step(dt);
  for (let i = 0; i < 30 * 3; i++) m.step(dt);
  let src = soundSources(m, []);
  const bad = src.filter((s) => !SCAPE_KINDS.includes(s.kind) || !Number.isFinite(s.x) || !Number.isFinite(s.y) || !(s.vol > 0 && s.vol <= 1));
  check(`${fac}: every source has a sound the audio knows, a place and a loudness`, src.length > 0 && !bad.length, `${src.length} sources: ${[...new Set(src.map((s) => s.kind))].join(', ')}`);
  const hd = src.find((s) => s.key === 'hd'), cx = m.hdAlive.reduce((n, a) => n + a.x, 0) / m.hdAlive.length;
  check(`${fac}: the Helldivers are one source, at the middle of the squad`, hd && hd.kind === 'squad' && Math.abs(hd.x - cx) < 0.01, hd && `${hd.x.toFixed(0)}, ${hd.y.toFixed(0)}`);
  // a pack in sight beside the squad, and one out of sight
  const a = m.hdAlive[0];
  const g1 = spawnGroup(m, a.x + 30, a.y, 'patrol'); for (const e of g1.members) e.vis = 1;
  const hidden = m.enemies.filter((e) => !e.dead && !(e.vis > 0)).length;
  src = soundSources(m, []);
  const packs = src.filter((s) => s.kind === fac), near = packs.filter((s) => Math.hypot(s.x - (a.x + 30), s.y - a.y) < 60);
  check(`${fac}: a pack in sight is heard where it is, in the faction's own sound, as one source`, near.length === 1, `${packs.length} pack source(s), ${near.length} at the pack, of ${g1.members.length}`);
  for (const e of m.enemies) e.vis = 0;
  check(`${fac}: enemies out of sight make no sound of their own`, soundSources(m, []).filter((s) => s.kind === fac).length === 0, `${hidden + g1.members.length} out of sight`);
  // a fight
  const shots = []; for (let i = 0; i < 2; i++) shots.push({ x: a.x + 200, y: a.y + 200, t: m.t });
  check(`${fac}: two shots are not a fight`, !soundSources(m, shots).some((s) => s.kind === 'fight'));
  for (let i = 0; i < 10; i++) shots.push({ x: a.x + 200 + i, y: a.y + 200, t: m.t });
  const f = soundSources(m, shots).filter((s) => s.kind === 'fight');
  check(`${fac}: a dozen shots in one place are, wherever it is, and the louder for more`, f.length >= 1 && Math.hypot(f[0].x - (a.x + 204), f[0].y - (a.y + 200)) < 40 && f[0].vol > 0.5, f.map((s) => `${s.x.toFixed(0)},${s.y.toFixed(0)} vol ${s.vol.toFixed(2)}`).join(' '));
  for (const s of shots) s.t = m.t - 5;
  check(`${fac}: ...and it dies away when the firing stops`, !soundSources(m, shots).some((s) => s.kind === 'fight'));
  // marching
  soundSources(m, []); for (const q of m.hdAlive) { q.x += 3; } const mv = soundSources(m, []).find((s) => s.key === 'hd'), st = soundSources(m, []).find((s) => s.key === 'hd');
  check(`${fac}: a squad on the move has boots, a squad standing does not`, mv.moving === true && st.moving === false);
}
{
  // the listener
  const A = new Audio(); A.listen(500, 500, 200);
  const mid = A.heard(500, 500), edge = A.heard(600, 500), far = A.heard(900, 500), left = A.heard(420, 500);
  check('a source is loudest at the middle of the view and fades with distance', mid.g > edge.g && edge.g > far.g && far.g > 0, `${mid.g.toFixed(2)} > ${edge.g.toFixed(2)} > ${far.g.toFixed(3)}`);
  check('...to the right of the view it is in the right ear, to the left in the left', edge.pan > 0.5 && left.pan < -0.5 && mid.pan === 0, `${left.pan.toFixed(2)} … ${edge.pan.toFixed(2)}`);
  A.listen(500, 500, 80); const close = A.heard(500, 500); A.listen(500, 500, 600); const high = A.heard(500, 500);
  check('zoomed in the field is louder, zoomed out quieter', close.g > mid.g && mid.g > high.g, `${close.g.toFixed(2)} > ${mid.g.toFixed(2)} > ${high.g.toFixed(2)}`);
  A.emitters([{ key: 'x', kind: 'bugs', x: 0, y: 0 }]); A.say(0, 0); A.scapeStop();
  check('with no sound device, nothing breaks', A.scapeInfo().n === 0);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
