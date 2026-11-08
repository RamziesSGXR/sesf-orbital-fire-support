// 0.53 Operation Sweet Liberty: the campaign (ten chapters in three arcs and a finale, every line in all three languages), the
// city (buildings nobody walks through, open plazas in the middle), the planetary defence gun (set up, charge, fire, the
// mothership down; the gun lost is the mission lost), the tutorial that can be won, the one-time save reset, and LAST LIGHT,
// the gun's music. Run: node test/r53.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet } from '../js/data/kit.js';
import { STORY } from '../js/data/story.js';
import { LANGS } from '../js/i18n.js';
import { BIOMES } from '../js/data/data.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, s, f) => { for (let i = 0, n = Math.round(s / dt); i < n && !m.over; i++) { m.step(dt); if (f) f(m); } };

// ---------------------------------------------------------------- the story
{
  const ch = STORY.chapters;
  check('Sweet Liberty: ten chapters, numbered 1 to 10', STORY.id === 'liberty' && ch.length === 10 && ch.every((c, i) => c.n === i + 1));
  const arcs = ch.map((c) => `${c.arc}:${c.play.faction}:${c.play.biome}`);
  check('three arcs of three (bugs on the dunes, bots on the ice, squids in the jungle), then the capital',
    arcs.slice(0, 3).every((a) => a === 'desert:bugs:desert') && arcs.slice(3, 6).every((a) => a === 'ice:bots:ice') && arcs.slice(6, 9).every((a) => a === 'jungle:squids:jungle') && arcs[9] === 'city:squids:city', arcs.join(' '));
  check('the finale is the defence gun, and only the finale', ch[9].finale && ch[9].play.objective === 'gun' && ch.slice(0, 9).every((c) => c.play.objective !== 'gun'));
  let miss = [];
  for (const [l, L] of Object.entries(LANGS)) for (const c of ch) {
    const keys = [`cp.liberty.c${c.n}`, `cp.liberty.c${c.n}b`, `cp.liberty.c${c.n}t`, ...['brief', 'win', 'lose'].flatMap((part) => c[part].map((_, k) => `cp.liberty.c${c.n}.${part}${k + 1}`))];
    for (const k of keys) if (typeof L.t[k] !== 'string' || !L.t[k].trim()) miss.push(`${l}:${k}`);
  }
  check('every chapter\'s name, blurb, briefing, win and loss lines are there in English, French and Spanish', miss.length === 0, miss.slice(0, 4).join(' '));
  const old = Object.keys(LANGS.en.t).filter((k) => k.startsWith('cp.ember.'));
  check('the old story\'s lines are gone', old.length === 0, old.length + '');
  check('the city is a ground of its own, kept out of the random pool', BIOMES.city && BIOMES.city.pool === false);
}

// ---------------------------------------------------------------- the city
{
  const m = new Mission({ seed: 7601, faction: 'squids', biome: 'city', difficulty: 3, events: true, kit: newKit(), wallet: newWallet(5000), objectives: ['gun'], boss: false });
  const T = m.terrain, B = T.buildings;
  check('the city has buildings', B.length >= 20, B.length + '');
  let inside = 0, blocked = 0;
  for (const b of B) { const x = (b.x0 + b.x1) / 2, y = (b.y0 + b.y1) / 2; if (T.bld[T._i(x, y)]) { inside++; if (T.blocked(x, y)) blocked++; } }
  check('nobody walks through a building (its ground is blocked)', inside > B.length * 0.8 && blocked === inside, `${blocked}/${inside} of ${B.length}`);
  const o = m.objectives.find((q) => q.type === 'gun');
  check('the landing zone and the gun are on open ground', !T.blocked(m.lz.x, m.lz.y) && o && !T.blocked(o.x, o.y));
  // the squad gets there: walk them for a while toward the gun and see that they are never inside a building
  let stuck = false;
  run(m, 20, () => { for (const a of m.hdAlive) if (T.blocked(a.x, a.y)) stuck = true; });
  check('no Helldiver ever stands inside a building', !stuck);
}

// ---------------------------------------------------------------- the defence gun
function gunMission(seed = 7601) {
  const m = new Mission({ seed, faction: 'squids', biome: 'city', difficulty: 3, events: true, kit: newKit(), wallet: newWallet(5000), objectives: ['gun'], boss: false });
  const seen = {}, emit = m.emit.bind(m);
  m.emit = (type, o) => { seen[type] = (seen[type] || 0) + 1; if (type === 'reinf_spawn' && o && o.src === 'gun') seen.gunDrop = (seen.gunDrop || 0) + 1; emit(type, o); };
  return { m, o: m.objectives.find((q) => q.type === 'gun'), seen };
}
{
  const { m, o, seen } = gunMission();
  check('a gun objective: the gun stands (an ally the enemy can shoot), the mothership overhead with a part per shot',
    o && o.state === 'travel' && m.assets.includes(o.gun) && o.gun.kind === 'defgun' && o.need === C.objective.gun.shots && o.ship.hp === o.need);
  const { hurtAsset } = await import('../js/sim/combat.js');
  hurtAsset(m, o.gun, 999);
  check('until the squad reaches it the gun is shut down: nothing hurts it', o.gun.dormant && o.gun.hp === o.gun.maxHp);
  // bring the squad to the gun
  const put = () => { for (const a of m.hdAlive) { a.x = o.x + 4; a.y = o.y + 4; a.tx = a.x; a.ty = a.y; } };
  run(m, 12, (q) => { if (q.t > 6) put(); });
  check('the squad at the gun: it sets up', o.state === 'setup', o.state);
  hurtAsset(m, o.gun, 10); const hurt = o.gun.hp < o.gun.maxHp; o.gun.hp = o.gun.maxHp;
  check('then it is in the fight: the enemy can hurt it', !o.gun.dormant && hurt);
  run(m, C.defense.setupSec + 2, (q) => { put(); o.gun.hp = o.gun.maxHp; });
  check('then it fires on its own', o.state === 'fire', o.state);
  const pay0 = m.cr.total;
  run(m, C.objective.gun.dropFirst + 2, () => { put(); o.gun.hp = o.gun.maxHp; });
  check('drops come at the gun while it fires', seen.gunDrop > 0, JSON.stringify(seen.gunDrop));
  run(m, 400, () => { put(); o.gun.hp = o.gun.maxHp; if (!o.doneAt && o.gun.charge < 0.97) o.gun.charge = 0.97; });
  check(`${C.objective.gun.shots} shots bring the mothership down; the objective is done`, o.shots === o.need && seen.gun_fire === o.need && o.doneAt !== undefined && o.done && seen.mothership_down === 1, `shots ${o.shots} fired ${seen.gun_fire} done ${o.done}`);
  check('each shot pays', m.cr.total > pay0);
}
{
  const { m, o, seen } = gunMission(7602);
  const put = () => { for (const a of m.hdAlive) { a.x = o.x + 4; a.y = o.y + 4; a.tx = a.x; a.ty = a.y; } };
  run(m, C.defense.setupSec + 16, (q) => { if (q.t > 6) put(); });
  o.gun.hp = 0; o.gun.dead = true;
  run(m, 2, put);
  check('the gun lost is the mission lost', m.over && m.outcome === 'defeat' && seen.gun_down === 1, `${m.over} ${m.outcome}`);
}
{
  // the charge is slower with the enemy on the gun
  const { m, o } = gunMission(7603);
  o.state = 'fire'; o.gun.charge = 0;
  const G = C.objective.gun;
  const c0 = o.gun.charge; m.step(dt); const free = o.gun.charge - c0;
  check('it charges in about chargeSec with nothing on it', Math.abs(free - dt / G.chargeSec) < 1e-6, free.toExponential(2));
}

// ---------------------------------------------------------------- the tutorial can be won
{
  const m = new Mission({ seed: 20185052, faction: 'squids', biome: 'mars', difficulty: 1, events: true, lastStand: true, defenders: false, boss: false, countdown: 1 });
  const o = m.objectives.find((q) => q.lastStand);
  m.ls.stage = 'hold'; m.ls.holdT = m.ls.holdT || 0;
  o.saved = C.lastStand.winAt - 1; m.step(dt);
  const before = m.events.some((e) => e.type === 'ls_stage' && e.stage === 'complete');
  o.saved = C.lastStand.winAt; m.step(dt);
  const ev = m.events.filter((e) => e.type === 'ls_stage' && e.stage === 'complete');
  check(`MISSION COMPLETE at ${C.lastStand.winAt} off Mars, once, and the mission goes on (no extraction)`, !before && ev.length === 1 && m.objDone && !m.over, `${before} ${ev.length} ${m.objDone} ${m.over}`);
  o.saved += 5; m.step(dt);
  check('it says so only once', m.events.filter((e) => e.type === 'ls_stage' && e.stage === 'complete').length === 1);
}

// ---------------------------------------------------------------- the save reset
{
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
  const S = await import('../js/session.js');
  store.set('ofs.session', '{"n":3}'); store.set('ofs.slots', '[]'); store.set('ofs.campaign', '{}'); store.set('ofs.campRun', '{}'); store.set('ofs.history', '[]');
  store.set('ofs.settings', '{"vol":1}'); store.set('ofs.names', '{}'); store.set('ofs.coins', '5'); store.set('ofs.keys', '{}'); store.set('ofs.callsign', '"X"');
  store.set('undefined', 'true');
  const wiped = S.resetOldSaves();
  check('an old browser: the runs, slots, campaign and history are wiped, once', wiped && ['ofs.session', 'ofs.slots', 'ofs.campaign', 'ofs.campRun', 'ofs.history'].every((k) => !store.has(k)) && store.get('ofs.saveVer') === String(S.SAVE_VER));
  check('settings, names, keys, callsign and SESF coins are kept', ['ofs.settings', 'ofs.names', 'ofs.coins', 'ofs.keys', 'ofs.callsign'].every((k) => store.has(k)));
  check('the tutorial flags saved under no name are moved to their own keys', !store.has('undefined') && store.get('ofs.tutSeen') === 'true' && store.get('ofs.tutDone') === 'true');
  store.set('ofs.session', '{"n":4}');
  check('and never again', !S.resetOldSaves() && store.has('ofs.session'));
  store.clear();
  check('a fresh browser: nothing to wipe (no notice), the version is set', !S.resetOldSaves() && store.get('ofs.saveVer') === String(S.SAVE_VER));
}

// ---------------------------------------------------------------- LAST LIGHT
{
  const { THEME_NAMES } = await import('../js/music.js');
  check('the gun has its own battle theme', THEME_NAMES.includes('gun') && ['bugs', 'bots', 'squids'].every((f) => THEME_NAMES.includes(f)));
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
