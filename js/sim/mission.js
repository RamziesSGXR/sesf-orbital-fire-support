// One mission = one game loop on one map. DOM-free and deterministic for a given seed.
// The player runs the destroyer: a UAV scan, orbital stratagems from the armory, and SEAF pods and orders.
// The four Helldivers (one per stratagem group) fight on their own and are reinforced automatically from a pool of lives.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { RNG } from '../util/rng.js';
import { Grid } from '../util/grid.js';
import { FACTIONS, SUBTYPES, ALLY, BIOMES, NUKE, COMMS } from '../data/data.js';
import { rollLoadout } from '../data/strat.js';
import { newKit, newWallet, seafStats, maxLives, zoneExtra, buy, loadoutIds, buildStats, buildLevel } from '../data/kit.js';
import { seafName } from '../data/names.js';
import { updateSquad } from './squad.js';
import { initSeaf, targetSquads, setSquadOrder, builtCount, drawOrder, splitSquad, mergeSquad, assignNear, callPelican, pendingTroops, dropSquad, callCargo } from './seaf.js';
import { updateEnemies, updateAllies } from './enemies.js';
import { updateDirector, alertBase } from './director.js';
import { initPatrols, updatePatrols } from './patrols.js';
import { setupSides, updateSides, beaconAt } from './sides.js';
import { noise } from './enemies.js';
import { locked } from './combat.js';
import { initPlan, updatePlan } from './planner.js';
import { initPlayer, updatePlayer, syncSlots } from './player.js';
import { initStrat, updateStrat, destroyAsset, mechDown } from './strat.js';
import { setupObjectives, updateObjectives, completeObjective, startSetup } from './objectives.js';
import { setupPois, updatePois, damagePoi, damageBreach } from './pois.js';
import { setupCover } from './cover.js';
import { updateChatter } from './chatter.js';
import { initKit, updateHelldivers } from './helldiver.js';
import { buildDanger, updateEvade } from './safety.js';
import { getTerrain } from './terrain.js';
import { boardingNow } from './extract.js';
import { initReinf, updateReinf, damageDrop } from './reinforce.js';
import { updateExtract } from './extract.js';
import { hurtCiv, updateCivs } from './civilians.js';
import { initSupply, updateSupply } from './supply.js';
import { initBoss, updateBoss } from './boss.js';
import { pickAO, aoX, aoY, aoScale } from './ao.js';
import { applyDifficulty, appliedLevel, clampLevel, reward, LEVELS } from '../difficulty.js';

const SIZE = C.world.size;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ORDER_KINDS = ['auto', 'move', 'protect', 'attack', 'escort'];
export const BUILD_KINDS = ['wall', 'mg', 'beacon'];
const ORDER_RADIO = { auto: 'seafAuto', move: 'seafMove', protect: 'seafProtect', attack: 'seafAttack', escort: 'seafEscort', path: 'seafPath', line: 'seafLine', ring: 'seafRing' };
// What killed an ally, by faction and size, for the death report.

// n points inside the area of operations, margin in from its edge, spaced apart and clear of avoids ({x, y, r}). Both relax when
// the area is crowded.
export function placePoints(m, n, minSpacing, avoids, margin, ok) {
  const rng = m.rng, a = m.ao, pts = [];
  let spacing = minSpacing, k = 1;
  for (let i = 0; i < n; i++) {
    let placed = false;
    for (let tries = 1; tries <= 900 && !placed; tries++) {
      if (tries % 150 === 0) { spacing *= 0.88; k *= 0.88; }   // relax if the map is crowded
      const x = rng.range(a.x0 + margin, a.x1 - margin), y = rng.range(a.y0 + margin, a.y1 - margin);
      if (ok && !ok(x, y)) continue;
      if (avoids.every((v) => Math.hypot(x - v.x, y - v.y) >= v.r * k) &&
          pts.every((p) => Math.hypot(x - p.x, y - p.y) >= spacing)) {
        pts.push({ x, y }); placed = true;
      }
    }
    if (!placed) { const p = m.terrain.nearestLand(rng.range(a.x0 + margin, a.x1 - margin), rng.range(a.y0 + margin, a.y1 - margin)); pts.push({ x: aoX(m, p.x, margin), y: aoY(m, p.y, margin) }); }
  }
  return pts;
}

// Remove, in place and in order, every item for which gone(item) is true.
function compact(arr, gone) { let j = 0; for (let i = 0; i < arr.length; i++) { const x = arr[i]; if (!gone(x)) arr[j++] = x; } arr.length = j; }
const deadE = (e) => e.dead, emptyG = (g) => !g.members.length;

const SLIDE = [0.5, -0.5, 1.0, -1.0, 1.5, -1.5];   // how far (radians) a blocked step may be turned to slide along a shore

export class Mission {
  constructor(opts) {
    // The session's difficulty (difficulty.js): applied before anything reads the numbers it scales. 10 when not given.
    this.difficulty = clampLevel(opts.difficulty ?? LEVELS);
    applyDifficulty(this.difficulty);
    this.reward = reward(this.difficulty);     // credits and score multiplier
    this._crc = 0;                             // the fraction of a credit carried over between payouts
    this.seed = opts.seed >>> 0;
    this.rng = new RNG(this.seed);
    this.crng = new RNG((this.seed ^ 0x5bd1e995) >>> 0);   // cosmetic randomness (names, chatter), never touches the sim
    this.faction = FACTIONS[opts.faction];
    this.groupSize = C.enemies.group[opts.faction] || C.enemies.groupSize;
    this.biome = BIOMES[opts.biome];
    this.terrain = getTerrain(opts.biome, this.seed);   // the ground: height, water depth, soft going (see terrain.js)
    this.S = opts.sessionMinutes || 0; // session minutes played before this mission
    // Which mission of the session this is (1 = the first): it sets the size of the area of operations.
    this.missionN = opts.missionN ?? Math.max(1, 1 + Math.floor(this.S / 9));
    this.ao = pickAO(this, this.missionN);
    this.terrain.setBounds(this.ao);      // routes round the water stay inside it
    this.emitOn = opts.events !== false;
    this.events = [];
    this.radioAt = {};
    this.t = 0;
    // objective -> clear (objective done: the squad clears the map if it can afford to) -> extract -> over
    this.phase = 'objective';
    this.outcome = null;  // victory | defeat | timeout | retired
    this.over = false;
    this.objDone = false; this.extracted = false;
    this.nextId = 1;

    // The player's kit and wallet belong to the session; buying in a mission changes them for good.
    this.kit = opts.kit || newKit();
    this.wallet = opts.wallet || newWallet();
    this.names = { ships: [], hd: [], ...(opts.names || {}) };

    this.stats = {
      kills: { L: 0, M: 0, H: 0 }, killsPlayer: 0, killsAlly: 0, bases: 0, lostH: 0, lostS: 0, ff: 0, shots: 0, orbCalls: 0, uavs: 0,
      hdCalls: 0, seafCalls: 0, despawned: 0, pois: 0, breaches: 0,
      dmg: { player: 0, squad: 0, strat: 0, enemy: 0 }, stratCalls: 0, stratBy: {}, mechs: 0, frvs: 0, wipes: 0, objectives: 0, podKills: 0,
    };
    this.sc = { kills: 0, allyKills: 0, bases: 0, pois: 0, breaches: 0, objective: 0, timeBonus: 0, extraction: 0, lives: 0, survivor: 0, ff: 0, deaths: 0, wipes: 0, drops: 0, civ: 0, boss: 0, sides: 0, clear: 0 };
    // Credits earned this mission. They go straight into the wallet so the armory can spend them mid-mission.
    this.cr = { kills: 0, bases: 0, pois: 0, breaches: 0, objective: 0, extraction: 0, drops: 0, civ: 0, boss: 0, sides: 0, total: 0, start: this.wallet.bal, spent0: this.wallet.spent };
    this.combo = { mult: 1, last: -99 };
    this.deaths = [];     // the death report: every Helldiver and SEAF who fell, in order

    this.enemies = []; this.groups = []; this.allies = []; this.alive = []; this.hdAlive = []; this.seafAlive = [];
    this.shells = []; this.beams = []; this.markers = []; this.pods = []; this.pelicans = []; this.incoming = []; this.uavs = []; this.relays = [];
    this.assets = []; this.zones = []; this.civs = []; this.ffz = null;
    this.crates = []; this.arty = [];      // supply crates SEAF deploy into defences; howitzers (built or captured)
    this.pois = []; this.breaches = [];
    this.locked = [];                      // enemies that have given themselves away long enough to be hit from orbit
    this.radar = { nextAt: 3, at: -99, blips: [], n: 0 };   // the UAV's radar sweeps
    initReinf(this);
    initSupply(this);
    initBoss(this, opts);
    this.eGrid = new Grid(SIZE, 40); this.aGrid = new Grid(SIZE, 40); this.tGrid = new Grid(SIZE, 40);
    this.cx = 0; this.cy = 0; // centroid of the Helldivers (or of everyone if none are alive)
    this.hx = 0; this.hy = 0;
    this.dirtyE = false; this.dirtyA = false;
    this.pressure = Math.max(C.pressure.floor, C.pressure.start + C.pressure.perSessionMin * this.S);
    this.hpMul = Math.min(C.ramp.hpCap, 1 + C.ramp.hp * this.S); // enemy toughness and damage grow with session time
    const dBase = C.ramp.base * (C.ramp.fac[opts.faction] || 1);
    this.dmgMul = Math.min(C.ramp.dmgCap * dBase, dBase * (1 + C.ramp.dmg * this.S));
    this.bag = [];
    this.hd = { lives: maxLives(), max: maxLives() };    // a full set of lives every mission
    this.wiped = false;
    this.seaf = initSeaf();
    this.support = { spawnT: 0, lastSpawn: -99, scanT: 0, near: 0 };
    this.chat = { t: 0, hd: 0, seaf: 0, moveAt: -99, heavyAt: -99, seafAt: -99, wasEngaged: false, lastState: '' };
    this.noticeAt = { seaf: -99 };
    this.nuke = null;
    // The hour of the drop (cosmetic: it sets the light and the tint of the map, see render/sky.js). opts.tod forces it.
    this.tod0 = opts.tod ?? this.crng.range(0, 24);

    this._setup(opts);
  }

  _setup(opts) {
    const rng = this.rng;
    // Landing zone near a random edge of the area of operations.
    const tr = this.terrain, land = (x, y) => tr.isLand(x, y), A = this.ao;
    let lz = null, lastTry = null;
    for (let k = 0; k < 80 && !lz; k++) {
      const side = rng.int(4), inset = Math.max(70, A.size * 0.1), along = rng.range(A.size * 0.2, A.size * 0.8);
      const c = side === 0 ? { x: A.x0 + along, y: A.y0 + inset } : side === 1 ? { x: A.x1 - inset, y: A.y0 + along }
        : side === 2 ? { x: A.x0 + along, y: A.y1 - inset } : { x: A.x0 + inset, y: A.y0 + along };
      lastTry = c;
      // the landing zone is on dry, firm mainland, with room round it
      if (land(c.x, c.y) && tr.speedAt(c.x, c.y) === 1 && land(c.x + 30, c.y) && land(c.x - 30, c.y) && land(c.x, c.y + 30) && land(c.x, c.y - 30)) lz = c;
    }
    this.lz = lz || tr.nearestLand(lastTry.x, lastTry.y);
    this.cx = this.hx = this.lz.x; this.cy = this.hy = this.lz.y;

    // Bases: a couple on the small first maps, more as the area grows and the session goes on. All visible from orbit. Each one
    // sends out the patrols that walk the map (see patrols.js).
    const B = C.bases, nBases = Math.min(B.max, Math.round(B.min + (A.size - C.ao.start) / B.perAoM + this.S / B.minutesPerExtra));
    const lzAvoid = { x: this.lz.x, y: this.lz.y, r: aoScale(this, B.lzClearance) };
    this.bases = placePoints(this, nBases, aoScale(this, B.spacing), [lzAvoid], 60, land).map((p) => ({
      id: this.nextId++, x: p.x, y: p.y, hp: B.hp, maxHp: B.hp, destroyed: false, r: B.radius,
      garrisoned: false, nextSpawn: 0, lastHit: -99,
    }));
    this.baseTotal = nBases;
    this.limitSec = C.world.missionSec + C.world.extraSecPerBase * (nBases - C.bases.min);

    // Objectives (may add the citadel to the base list).
    setupObjectives(this, opts.objectives);
    // Bases close together work as a cluster (director.js): each one knows its neighbours.
    for (const b of this.bases) b.nb = this.bases.filter((q) => q !== b && Math.hypot(q.x - b.x, q.y - b.y) <= C.bases.clusterR);

    // Hidden extraction point.
    const exAvoid = [{ x: this.lz.x, y: this.lz.y, r: aoScale(this, C.extract.minFromLz) }, ...this.bases.map((b) => ({ x: b.x, y: b.y, r: C.extract.minFromBase }))];
    // Early on it is not far from where the objective ends, so the first missions stay short.
    const lastO = this.objectives[this.objectives.length - 1], end = lastO ? (lastO.type === 'vip' ? { x: lastO.dx, y: lastO.dy } : lastO) : null;
    const exReach = C.objective.reach.start + C.objective.reach.perMin * this.S;
    let ex = null, exD = Infinity;
    for (let k = 0; k < 24; k++) {
      const p = placePoints(this, 1, 0, exAvoid, 60, land)[0];
      const d = end ? Math.hypot(p.x - end.x, p.y - end.y) : 0;
      if (d < exD) { exD = d; ex = p; }
      if (d <= exReach) break;
    }
    this.extraction = { x: ex.x, y: ex.y, revealed: false, holdT: 0, nextWave: Infinity };
    // Cover round the sites the squad will have to hold.
    setupCover(this);

    // Points of interest SEAF can take out for credits.
    setupPois(this);

    // Squad anchor (Helldivers only).
    this.squad = { ax: this.lz.x, ay: this.lz.y, base: null, state: 'advance', engaged: false, holdT: 0, hpAt: 0, pushed: false,
      setupT: 0, setupCool: 4, free: true, spotG: null, attackT: 0, formed: false, dir: 0, goalDist: 999 };

    // Four groups of three stratagems and a ship for each. Typed ship names win over the random ones.
    initStrat(this, opts.loadout || rollLoadout(this.seed), !!opts.keepOrder);
    this.teams.forEach((tm, i) => { if (this.names.ships[i]) tm.ship = this.names.ships[i]; });

    // The player's kit: UAV, orbital slots and the nuke.
    initPlayer(this);

    // One Helldiver per group drops in from the destroyer.
    this.teams.forEach((tm, i) => {
      const ang = (i / this.teams.length) * Math.PI * 2 + Math.PI / 4;
      tm.pod = true;
      this.pods.push({ type: 'H', team: i, n: 1, landAt: C.helldivers.initialDropSec + 0.5 * i, x: this.lz.x + Math.cos(ang) * 11, y: this.lz.y + Math.sin(ang) * 11, start: true });
    });

    // Side missions and SEAF drop beacons.
    setupSides(this);

    // Every base's patrols are already out on their routes.
    initPatrols(this);
    initPlan(this);
  }

  // ----- public input API -----
  setAim(x, y) { this.player.aimX = aoX(this, x); this.player.aimY = aoY(this, y); }
  setFiring(b) { this.player.firing = !!b; }
  fire() { this.player.firePress = true; }   // one press, even if the button is released again before the next tick
  selectWeapon(i) {
    const p = this.player;
    if (i < 0 || i >= p.slots.length || i === p.weapon) return;
    const s = p.slots[i];
    if (s.type === 'empty') return;
    if (s.type === 'nuke' && !this.nukeReady()) { this.emit('deny', { reason: 'nomark' }); this.radio(COMMS.holdFire, 'nomark', 3); return; }
    p.weapon = i; p.swapUntil = this.t + C.weapons.swapSec;
    this.emit('swap', { w: i });
  }

  _deny(reason, text) {
    this.emit('deny', { reason });
    if (text) this.radio(text, 'deny' + reason, 3);
    return { ok: false, reason };
  }
  pendingPods(type) { if (type === 'S') return pendingTroops(this); let n = 0; for (const p of this.pods) if (p.type === type) n += p.n; return n; }

  // Call a SEAF drop. A troop pelican flies it in; it has to land inside the strike zone. The troops join the selected squad.
  callSeaf(x, y) {
    const t = this.t, sf = this.seaf, st = seafStats(this.kit);
    if (this.over) return { ok: false, reason: 'over' };
    if (!this.alive.length) return this._deny('noallies');
    const bc = beaconAt(this, x, y);
    if (bc) { x = bc.x; y = bc.y; }      // a drop beacon takes it anywhere on the map (while it is lit)
    else if (!this.inZone(x, y, -5)) return this._deny('nocoverage', COMMS.noCoverage);
    const room = st.max - this.countAlly('S') - this.pendingPods('S');
    if (room <= 0) return this._deny('full');
    if (t < sf.readyAt) return this._deny('cooldown');
    sf.readyAt = t + st.cool;
    const n = Math.min(st.drop, room), squad = dropSquad(this);
    callPelican(this, x, y, n, squad);
    this.stats.seafCalls++;
    this.radio(COMMS.seafDrop, 'seafDrop', 0);
    this.emit('pod_call', { type: 'S', x, y, n });
    return { ok: true, n, squad };
  }

  // Give the selected squad (or every squad) an order: auto (clear the nearest objective), move, protect, attack or escort.
  seafOrder(kind, x = this.cx, y = this.cy) {
    if (this.over) return { ok: false, reason: 'over' };
    if (!ORDER_KINDS.includes(kind)) return { ok: false, reason: 'kind' };
    const sq = targetSquads(this).filter((q) => q.n > 0);
    if (!sq.length) return this._deny('noseaf');
    if (kind === 'escort' && !this.hdAlive.length) return this._deny('nohd');
    x = aoX(this, x, 20); y = aoY(this, y, 20);
    for (const q of sq) setSquadOrder(this, q, kind, x, y);
    this.radio(COMMS[ORDER_RADIO[kind]], 'seaf' + kind, 1);
    this.emit('seaf_order', { kind, x, y, sq: this.seaf.sel });
    return { ok: true };
  }
  // Send the selected squad (one squad: the selected one, or the nearest to the spot when all are selected) to build a wall, an
  // MG nest or a drop beacon at (x, y). Paid for when it is done.
  seafBuild(what, x, y) {
    if (this.over) return { ok: false, reason: 'over' };
    const B = C.build[what];
    if (!B) return { ok: false, reason: 'kind' };
    const lvl = buildLevel(this.kit, what);
    if (!lvl) return this._deny('locked');                       // (the howitzer has to be unlocked in the armory first)
    const st = buildStats(what, lvl);
    const sq = targetSquads(this).filter((q) => q.n > 0);
    if (!sq.length) return this._deny('noseaf');
    x = aoX(this, x, 20); y = aoY(this, y, 20);
    if (!this.terrain.isLand(x, y) || this.terrain.blocked(x, y)) return this._deny('water', COMMS.noWater);
    // a crate of this kind already on the ground near the spot (from an order that was changed) is used again, at no charge
    let crate = this.crates.find((c) => c.what === what && !c.used && Math.hypot(c.x - x, c.y - y) < C.build.crateR);
    if (!crate) {
      if (builtCount(this, what) + this.crates.filter((c) => c.what === what && !c.used).length >= st.max) return this._deny('maxed');
      if (this.wallet.bal < st.cost) return this._deny('funds');
      this.wallet.bal -= st.cost; this.wallet.spent += st.cost;     // paid now: a cargo pelican brings the crate
      crate = { id: this.nextId++, what, x, y, landed: false, used: false, born: this.t };
      this.crates.push(crate);
      callCargo(this, x, y, crate);
      this.notice(tr('n.crateIn', { what: tr('build.' + what), cr: st.cost }), 'info');
    }
    const q = sq.slice().sort((a, b) => Math.hypot(a.cx - x, a.cy - y) - Math.hypot(b.cx - x, b.cy - y))[0];
    setSquadOrder(this, q, 'build', crate.x, crate.y, { what, prog: 0, crate });
    this.radio(COMMS.seafBuild(what), 'seafbuild', 1);
    this.emit('seaf_order', { kind: 'build', what, x, y, sq: q.i });
    return { ok: true, squad: q.i };
  }
  // A freehand stroke on the map becomes a route, a line or a ring for the selected squad(s).
  seafDraw(pts) {
    if (this.over) return { ok: false, reason: 'over' };
    const r = drawOrder(this, pts);
    if (!r.ok) return r.reason === 'noseaf' ? this._deny('noseaf') : this._deny('short');
    this.radio(COMMS[ORDER_RADIO[r.kind]], 'seaf' + r.kind, 1);
    this.emit('seaf_order', { kind: r.kind, x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, sq: this.seaf.sel });
    return r;
  }
  // -1 selects every squad.
  selectSquad(i) { this.seaf.sel = i >= 0 && i < this.seaf.squads.length ? i : -1; this.emit('squad_select', { sel: this.seaf.sel }); }
  splitSeaf() {
    const i = this.seaf.sel >= 0 ? this.seaf.sel : this.seaf.squads.reduce((b, q) => (q.n > (b ? b.n : -1) ? q : b), null).i;
    const r = splitSquad(this, i);
    if (!r.ok) return this._deny('split' + r.reason);
    this.notice(tr('n.split', { a: i + 1, n: r.n, b: r.to + 1 }), 'info');
    return r;
  }
  mergeSeaf() {
    const i = this.seaf.sel;
    if (i < 0) return this._deny('mergesel');
    const r = mergeSquad(this, i);
    if (!r.ok) return this._deny('merge' + r.reason);
    this.notice(tr('n.merged', { a: i + 1, b: r.to + 1 }), 'info');
    return r;
  }
  assignSeaf(x, y, r = 18) {
    if (this.seaf.sel < 0) return this._deny('assignsel');
    const res = assignNear(this, x, y, r, this.seaf.sel);
    if (!res.ok) return this._deny('assignnone');
    this.notice(tr('n.assigned', { n: res.n, a: this.seaf.sel + 1 }), 'info');
    return res;
  }

  // ----- the armory: upgrades can be bought mid-mission, new orbitals and slots only between missions -----
  spend(id) {
    const r = buy(this.kit, this.wallet, id, true);
    if (!r.ok) { this.emit('deny', { reason: r.reason }); return r; }
    syncSlots(this);
    const st = seafStats(this.kit);
    for (const a of this.seafAlive) {
      const nm = Math.round(ALLY.S.hp * st.hpMul);
      a.hp = Math.min(nm, a.hp + (nm - a.maxHp)); a.maxHp = nm; a.dmgMul = st.dmgMul;
    }
    this.emit('bought', { id });
    this.notice(tr('n.bought', { name: r.item.name.toUpperCase() }), 'good');
    return r;
  }

  // Names typed in the menus: a blank ship keeps the random one, a blank Helldiver name goes back to the code (B4).
  setNames(names) {
    this.names = { ships: [], hd: [], ...(names || {}) };
    this.teams.forEach((tm, i) => {
      if (this.names.ships[i]) tm.ship = this.names.ships[i];
      if (tm.hd && !tm.hd.dead) tm.hd.name = this.names.hd[i] || '';
    });
  }

  // The player gives up the mission. If the objective is already done the mission still counts.
  retire() { this.finish(this.objDone ? 'complete' : 'retired'); }   // with the primary objective done, pulling out still counts

  // ----- the nuke: only available once the squad has held the launch site -----
  nukeObj() { return this.objectives.find((o) => o.type === 'nuke') || null; }
  nukeReady() { const o = this.nukeObj(); return !!o && o.state === 'armed'; }
  nukeFire(x, y) {
    const o = this.nukeObj(), t = this.t;
    if (!o || o.state !== 'armed') return false;
    o.state = 'inbound';
    const N = C.objective.nuke;
    this.shells.push({ x, y, at: t + NUKE.delay, dmg: N.blastDmg, splash: N.blastR, mult: { L: 1, M: 1, H: 1, B: 1 }, by: 'player', friendly: true, big: true, nuke: true });
    this.markers.push({ type: 'nuke', x, y, r: N.blastR, start: t, end: t + NUKE.delay });
    this.radio(COMMS.nukeInbound, 'nukeinbound', 0);
    this.emit('nuke_call', { x, y, delay: NUKE.delay });
    this.stats.shots++;
    return true;
  }
  completeObjective(o) { completeObjective(this, o); }
  startSetup(o) { startSetup(this, o); }
  onNukeLanded() {
    const o = this.nukeObj();
    if (o && !o.done) completeObjective(this, o);
  }

  // ----- helpers -----
  emit(type, o = {}) {
    if (!this.emitOn) return;
    o.type = type; this.events.push(o);
    if (this.events.length > 3000) this.events.splice(0, 1500);
  }
  radio(text, key = text, minGap = 4) {
    if (!text || this.t - (this.radioAt[key] ?? -99) < minGap) return;
    this.radioAt[key] = this.t;
    this.emit('radio', { text, key });
  }
  // A line on the notice feed: tone is 'good', 'warn', 'bad' or 'info'.
  notice(text, tone = 'info') { this.emit('notice', { text, tone }); }
  // What an ally is called on screen: a typed Helldiver name, the deployment code (B4), or a SEAF rank and surname.
  tag(a) { return a ? (a.name || a.code || '?') : '?'; }
  shipOf(i) { const t = this.teams[i]; return t ? t.ship : ''; }
  slotTag(team) { return this.names.hd[team.i] || `${team.letter}${team.n + 1}`; }

  earn(kind, amt, x, y) {
    if (!(amt > 0)) return;
    if (this.reward !== 1) { const v = amt * this.reward + this._crc; amt = Math.floor(v); this._crc = v - amt; if (amt <= 0) return; }   // the difficulty's pay
    const cr = this.cr, w = this.wallet;
    cr[kind] = (cr[kind] || 0) + amt; cr.total += amt;
    w.bal += amt; w.earned += amt;
    if (amt >= 10 && x !== undefined) this.emit('credit', { x, y, amt, kind });
  }
  damagePoi(p, dmg, by) { damagePoi(this, p, dmg, by); }
  damageDrop(d, dmg, by) { damageDrop(this, d, dmg, by); }
  hurtCiv(c, dmg, by) { hurtCiv(this, c, dmg, by); }
  damageBreach(b, dmg, by) { damageBreach(this, b, dmg, by); }

  addAlly(type, x, y, o = {}) {
    const rng = this.rng, [ox, oy] = rng.inDisc(C.squad.clusterRadius), [jx, jy] = rng.inDisc(6), [fx, fy] = rng.inDisc(C.seaf.followSpread);
    const base = ALLY[type];
    let ax = x + jx, ay = y + jy;
    if (this.terrain.blocked(ax, ay)) { const l = this.terrain.nearestLand(ax, ay); ax = l.x; ay = l.y; }   // never lands in deep water
    const a = {
      id: this.nextId++, type, x: ax, y: ay, ox, oy, fx, fy, hp: base.hp, maxHp: base.hp, dead: false, atk: rng.next(),
      r: base.r, sight: 0, vision: 0, zone: 0, home: { x, y }, wx: x, wy: y, wT: 0,
      hurtAt: -9, mounted: null, sw: null, mech: null,
      team: -1, sq: -1, code: '', name: '', role: o.role || 'rifle', spT: 2 + rng.next() * 3, engaged: false,
      say: null, sayAt: 0, ping: null, lastSrc: null, dmgMul: 1, armorMul: 1, born: this.t,
      face: (this.squad ? this.squad.dir : 0) + rng.range(-0.6, 0.6), aimA: 0, aimUntil: 0,
    };
    if (type === 'H') {
      let ti = o.team;
      if (ti === undefined || ti < 0) ti = this.teams.findIndex((tm) => !tm.hd || tm.hd.dead);
      if (ti < 0) ti = 0;
      const tm = this.teams[ti];
      tm.n++; tm.hd = a; tm.pod = false;
      a.team = ti; a.code = `${tm.letter}${tm.n}`; a.name = this.names.hd[ti] || '';
      initKit(this, a);
    } else {
      const st = seafStats(this.kit);
      a.hp = a.maxHp = Math.round(base.hp * st.hpMul); a.dmgMul = st.dmgMul;
      a.name = seafName(this.crng, a.role);
    }
    a.sight0 = base.sight * this.biome.ping;   // flat-ground sight; a rise adds to it (see _refreshAlive)
    a.zone0 = (C.sight.zoneBase[type === 'H' ? 'helldiver' : 'seaf'] || base.sight) * this.biome.ping;   // the strike zone does not grow with sight
    const sm = this.terrain.sightMul(a.x, a.y);
    a.sight = a.sight0 * sm; a.vision = a.sight + C.sight.playerBonus;
    a.zone = a.zone0 * sm + C.sight.playerBonus + C.sight.strikeBonus + zoneExtra(this.kit);
    this.allies.push(a);
    return a;
  }
  drawToken() {
    if (!this.bag.length) {
      const b = C.enemies.bag;
      // (below level 10 the medium and heavy counts are fractional: the remainder is a chance of one more)
      const whole = (x) => { const f = x - Math.floor(x); return Math.floor(x) + (f > 1e-9 && this.rng.next() < f ? 1 : 0); };
      for (let i = 0; i < b.light; i++) this.bag.push('L');
      const nm = whole(b.medium + Math.floor(this.S / C.ramp.mediumEvery)), nh = whole(b.heavy + Math.floor(this.S / C.ramp.heavyEvery));
      for (let i = 0; i < nm; i++) this.bag.push('M');
      for (let i = 0; i < nh; i++) this.bag.push('H');
      this.rng.shuffle(this.bag);
    }
    const k = this.bag.pop();
    if (k === 'L') return k;
    // Keep the field mostly light: past the cap for live mediums and heavies, the draw comes out light instead.
    const cap = C.enemies.kindCap, mm = this.t / 60;   // more mediums and heavies allowed as the session and the mission go on
    const max = k === 'M' ? Math.min(cap.maxM, cap.M + cap.perMinM * this.S + cap.perMissionMinM * mm) : Math.min(cap.maxH, cap.H + cap.perMinH * this.S + cap.perMissionMinH * mm);
    let n = 0;
    for (const e of this.enemies) if (!e.dead && e.kind === k) n++;
    return n >= max ? 'L' : k;
  }
  _refreshAlive() {
    this.alive.length = 0; this.hdAlive.length = 0; this.seafAlive.length = 0;
    let sx = 0, sy = 0, hx = 0, hy = 0;
    const zx = C.sight.strikeBonus + zoneExtra(this.kit);
    const tr = this.terrain;
    for (const a of this.allies) {
      if (a.dead) continue;
      const sm = tr.sightMul(a.x, a.y);
      a.sight = a.sight0 * sm; a.vision = a.sight + C.sight.playerBonus;   // high ground sees farther
      a.zone = (a.zone0 ?? a.sight0) * sm + C.sight.playerBonus + zx;
      this.alive.push(a); sx += a.x; sy += a.y;
      if (a.type === 'H') { this.hdAlive.push(a); hx += a.x; hy += a.y; } else if (!a.pinned) this.seafAlive.push(a);   // pinned SEAF are not the player's (yet)
    }
    if (this.hdAlive.length) { this.hx = hx / this.hdAlive.length; this.hy = hy / this.hdAlive.length; this.cx = this.hx; this.cy = this.hy; }
    else if (this.alive.length) { this.cx = sx / this.alive.length; this.cy = sy / this.alive.length; }
  }
  countAlly(type) { let n = 0; for (const a of this.allies) if (!a.dead && a.type === type && !a.pinned) n++; return n; }
  // An objective being worked makes noise the enemy hears from far off.
  siteNoise(x, y) { noise(this, x, y, C.noise.site); }

  // What the squad can see (2), what only the player can see just beyond that (1), or nothing (0). A UAV circle counts as seen by all.
  visLevel(x, y) {
    for (const u of this.uavs) { const dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy <= u.r * u.r) return 2; }
    for (const u of this.relays) { const dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy <= u.r * u.r) return 2; }
    let lvl = 0;
    for (const a of this.alive) {
      const dx = a.x - x, dy = a.y - y, d2 = dx * dx + dy * dy;
      if (d2 <= a.sight * a.sight) return 2;
      if (d2 <= a.vision * a.vision) lvl = 1;
    }
    return lvl;
  }
  // The strike zone: where the player can call strikes and drops, and where the squad can call its own. It is
  // wider than what anyone can see. UAV circles count as well. extra shrinks (negative) or grows the zone.
  inZone(x, y, extra = 0) {
    for (const a of this.alive) {
      const r = a.zone + extra, dx = a.x - x, dy = a.y - y;
      if (dx * dx + dy * dy <= r * r) return true;
    }
    for (const u of this.uavs) { const r = u.r + extra, dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy <= r * r) return true; }
    for (const u of this.relays) { const r = u.r + extra, dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy <= r * r) return true; }
    return false;
  }
  // The same, but only around living Helldivers (and UAV circles): the squad's own stratagems need this.
  inHdZone(x, y, extra = 0) {
    for (const a of this.hdAlive) {
      const r = a.zone + extra, dx = a.x - x, dy = a.y - y;
      if (dx * dx + dy * dy <= r * r) return true;
    }
    for (const u of this.uavs) { const r = u.r + extra, dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy <= r * r) return true; }
    return false;
  }
  // Around allies only, never a UAV circle. A new UAV can reach this far, so scans cannot chain across the map.
  inAllyZone(x, y, extra = 0) {
    for (const a of this.alive) {
      const r = a.zone + extra, dx = a.x - x, dy = a.y - y;
      if (dx * dx + dy * dy <= r * r) return true;
    }
    return false;
  }
  // True when a point is farther than the despawn distance from every ally and every UAV circle.
  beyondRange(x, y, margin = C.sight.despawnMargin) {
    for (const a of this.alive) {
      const r = a.vision + margin, dx = a.x - x, dy = a.y - y;
      if (dx * dx + dy * dy <= r * r) return false;
    }
    for (const u of this.uavs) { const r = u.r + margin, dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy <= r * r) return false; }
    return true;
  }

  // Enemies locked by their own fire (see combat.js reveal) can be struck anywhere: is (x, y) on one?
  nearLock(x, y, r = C.reveal.lockR) {
    for (const e of this.locked) if (!e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 <= r * r) return e;
    return null;
  }
  _lockScan(dt) {
    this._lsT = (this._lsT || 0) - dt;
    if (this._lsT > 0) return;
    this._lsT = 0.2;
    this.locked.length = 0;
    for (const e of this.enemies) if (!e.dead && locked(this, e)) this.locked.push(e);
  }
  // The radar sweep: a snapshot of where every enemy is, taken every few seconds (faster with a better UAV).
  _radar() {
    const R = this.radar, t = this.t;
    if (t < R.nextAt) return;
    const lv = Math.max(1, Math.min(C.radar.every.length, this.kit.uav || 1));
    R.nextAt = t + C.radar.every[lv - 1]; R.at = t; R.n++;
    R.blips = this.enemies.filter((e) => !e.dead).map((e) => ({ x: e.x, y: e.y, k: e.kind, boss: !!e.boss }));
    this.emit('radar', { n: R.blips.length });
  }

  // ----- deaths, damage, score, credits -----
  killEnemy(e, by) {
    if (e.dead) return;
    e.dead = true; this.dirtyE = true;
    const st = SUBTYPES[e.kind];
    this.stats.kills[e.kind]++;
    if (by === 'player') {
      const s = C.score, c = this.combo;
      if (this.t - c.last > s.comboResetSec) c.mult = 1;
      else if (this.t - c.last <= s.comboWindowSec) c.mult = Math.min(s.comboMax, c.mult + s.comboStep);
      c.last = this.t;
      this.sc.kills += Math.round(st.pts * c.mult);
      this.stats.killsPlayer++;
    } else {
      this.sc.allyKills += Math.floor(st.pts * C.score.allyKillShare);
      this.stats.killsAlly++;
    }
    this.earn('kills', C.credits.kill[e.kind], e.x, e.y);
    this.emit('kill', { x: e.x, y: e.y, kind: e.kind, by });
  }

  _cause(by, src) {
    if (src === 'friendly') return tr(by === 'player' ? 'cause.ffPlayer' : 'cause.ff');
    if (src === 'L' || src === 'M' || src === 'H') return tr('cause.enemy', { fac: this.faction.name, kind: tr(`kind.${this.faction.id}.${src}`) });
    return tr('cause.unknown');
  }

  killAlly(a, by, src) {
    if (a.dead) return;
    a.dead = true; this.dirtyA = true;
    const isH = a.type === 'H', t = this.t, tm = isH ? this.teams[a.team] : null;
    if (isH) {
      this.stats.lostH++; this.sc.deaths += C.score.hdDeath;
      if (tm) { if (tm.hd === a) tm.hd = null; tm.deaths++; tm.lastDeath = { x: a.x, y: a.y }; tm.respawnAt = t + C.helldivers.reinforceSec; }
    } else this.stats.lostS++;
    if (a.sw) a.sw = null;
    if (a.mech) a.mech = null;
    const cause = this._cause(by, src || a.lastSrc);
    this.deaths.push({ t, type: a.type, team: a.team, code: a.code, name: a.name, tag: this.tag(a), ship: tm ? tm.ship : '', by, cause, x: a.x, y: a.y });
    if (by === 'player') {
      this.stats.ff++;
      this.sc.ff += isH ? C.score.ffHelldiver : C.score.ffSeaf;
      this.radio(COMMS.friendly, 'ff', 3);
    } else if (isH) {
      this.radio(COMMS.hdDown, 'downH', 1);
    } else this.radio(COMMS.seafDown, 'downS', 6);
    if (isH) {
      this.notice(tr('n.kia', { who: this.tag(a), cause }) + (tm ? '  ' + tm.ship : ''), 'bad');
      if (this.hd.lives <= 0) this.radio(COMMS.noLives, 'nolives', 8);
    } else if (t - this.noticeAt.seaf > 1.2) {
      this.noticeAt.seaf = t;
      this.notice(tr('n.kia', { who: this.tag(a), cause }), 'dim');
    }
    this.emit('ally_down', { x: a.x, y: a.y, type: a.type, by });
  }
  destroyAsset(s, why) { destroyAsset(this, s, why); }
  mechDown(a) { mechDown(this, a); }
  damageBase(b, dmg, by = 'player') {
    if (b.destroyed || dmg <= 0) return;
    if (!b.alert) alertBase(this, b, 'hit');      // a hit on the structure wakes the base
    const dealt = Math.min(dmg, b.hp);
    b.hp -= dmg; b.lastHit = this.t;
    if (by in this.stats.dmg) this.stats.dmg[by] += dealt;
    if (b.hp <= 0) this.destroyBase(b);
  }
  destroyBase(b) {
    b.destroyed = true; b.hp = 0;
    if (!b.fortress && !b.part) this.stats.bases++;     // (the citadel and its bases are the objective)
    // The citadel pays out as the objective; ordinary bases are score and credits. Once the objective is done they are bonus.
    if (!b.fortress) { this.sc.bases += C.score.base; this.earn('bases', C.credits.base, b.x, b.y); }
    this.pressure = Math.max(C.pressure.floor, this.pressure * C.pressure.onBaseKill);
    for (const e of this.enemies) if (e.g.base === b) e.g.garrison = false; // survivors stop being garrison
    this.emit('base_down', { x: b.x, y: b.y, fortress: !!b.fortress });
    if (b.part) {
      const o = this.objectives.find((x) => x.type === 'fortress'), n = o ? o.parts.filter((x) => !x.destroyed).length : 0;
      if (n) this.notice(tr('n.partDown', { n }), 'good');
    } else if (!b.fortress) {
      const left = this.bases.filter((x) => !x.destroyed && !x.fortress && !x.part).length;
      this.radio(left === 0 ? COMMS.lastBase : COMMS.baseDown(left, this.baseTotal), 'basedown', 0);
    }
  }

  // The four Helldivers come back by themselves, one pod per missing group, each costing one life.
  _podSpot(tm) {
    const rng = this.rng;
    if (this.hdAlive.length) {
      const h = this.hdAlive[rng.int(this.hdAlive.length)];
      const ang = this.squad.dir + Math.PI + rng.range(-0.9, 0.9), d = rng.range(26, 40);
      return { x: aoX(this, h.x + Math.cos(ang) * d, 20), y: aoY(this, h.y + Math.sin(ang) * d, 20) };
    }
    // the whole squad is down: the pods come in near where they fell, but on the side with the fewest enemies, so the fresh
    // Helldivers are not dropped straight back into what killed them
    const s = tm.lastDeath || this.lz;
    let best = null, bn = Infinity;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + rng.range(-0.2, 0.2), d = rng.range(45, 75);
      const x = aoX(this, s.x + Math.cos(a) * d, 20), y = aoY(this, s.y + Math.sin(a) * d, 20);
      if (!this.terrain.isLand(x, y)) continue;
      let n = 0; this.eGrid.near(x, y, 45, () => { n++; });
      if (n < bn) { bn = n; best = { x, y }; }
    }
    return best || { x: aoX(this, s.x, 20), y: aoY(this, s.y, 20) };
  }
  _reinforce() {
    if (this.over) return;
    const t = this.t, hd = this.hd, H = C.helldivers;
    if (boardingNow(this)) return;    // nobody drops in while the pelican is loading
    if (!this.hdAlive.length) {
      if (!this.wiped && !this.pods.some((p) => p.type === 'H' && p.start)) {
        this.wiped = true;
        if (hd.lives > 0) { this.stats.wipes++; this.sc.wipes += C.score.wipe; this.radio(COMMS.hdWipe, 'hdWipe', 0); }
      }
    } else this.wiped = false;
    for (const tm of this.teams) {
      if ((tm.hd && !tm.hd.dead) || tm.pod || t < tm.respawnAt || hd.lives <= 0) continue;
      hd.lives--;
      const p = this._podSpot(tm), alone = !this.hdAlive.length;
      tm.pod = true;
      this.pods.push({ type: 'H', team: tm.i, n: 1, landAt: t + (alone ? H.initialDropSec : H.dropDelaySec), x: p.x, y: p.y });
      this.stats.hdCalls++;
      this.notice(tr('n.calledIn', { who: this.slotTag(tm), ship: tm.ship, n: hd.lives }), 'warn');
      this.emit('pod_call', { type: 'H', x: p.x, y: p.y, n: 1, team: tm.i });
    }
  }

  finish(outcome) {
    if (this.over) return;
    this.over = true; this.outcome = outcome; this.phase = 'over';
    const s = C.score;
    if (outcome === 'victory') {
      this.sc.lives = s.perLifeLeft * this.hd.lives;
      if (this.extracted) { this.sc.extraction = s.extraction; this.earn('extraction', C.credits.extraction); }
      this.earn('extraction', C.credits.perMission);
    }
    if (outcome === 'victory' || outcome === 'timeout' || outcome === 'complete') {
      const ex = this.extraction;
      this.sc.survivor = (this.countAlly('H') + (ex.boardedH || 0)) * s.survivorHelldiver + (this.countAlly('S') + (ex.boardedS || 0)) * s.survivorSeaf;
    }
    this.radio(outcome === 'victory' ? COMMS.victory : outcome === 'complete' ? COMMS.complete : outcome === 'timeout' ? COMMS.timeout : COMMS.defeat, 'end', 0);
    this.emit('end', { outcome });
  }

  // The running score for the HUD (cheap: no copies).
  liveScore() {
    return Math.max(0, Math.round(this._rawScore()));
  }
  // Everything the mission scored, times the difficulty's multiplier.
  _rawScore() { return this._baseScore() * this.reward; }
  _baseScore() {
    const sc = this.sc;
    return sc.kills + sc.allyKills + sc.bases + sc.pois + sc.breaches + sc.objective + sc.timeBonus + sc.extraction + sc.lives + sc.survivor + sc.ff + sc.deaths + sc.wipes + sc.drops + sc.civ + sc.boss + sc.sides + sc.clear;
  }

  result() {
    const sc = this.sc;
    const raw = this._rawScore();
    const d = this.stats.dmg, tot = d.player + d.squad + d.strat || 1;
    const cr = this.cr;
    return {
      outcome: this.outcome, t: this.t, minutes: this.t / 60,
      score: Math.max(0, Math.round(raw)), raw: Math.round(raw), breakdown: { ...sc }, base: Math.round(this._baseScore()), difficulty: this.difficulty, reward: this.reward,
      kills: this.stats.killsPlayer + this.stats.killsAlly, stats: { ...this.stats }, bossName: this.boss ? this.boss.name : null,
      bases: this.stats.bases, baseTotal: this.baseTotal, pois: this.stats.pois, poiTotal: this.pois.length, breaches: this.stats.breaches, sides: (this.sides || []).filter((q) => q.done).length, sideTotal: (this.sides || []).length, fullClear: !!(this.plan && this.plan.full),
      livesLeft: this.hd.lives, survivorsH: this.countAlly('H') + (this.extraction.boardedH || 0), survivorsS: this.countAlly('S') + (this.extraction.boardedS || 0),
      civSaved: this.stats.civSaved || 0, civLost: this.stats.civLost || 0,
      objectives: this.objectives.map((o) => ({ type: o.type, done: o.done })), objDone: this.objDone, extracted: this.extracted,
      share: { player: d.player / tot, squad: d.squad / tot, strat: d.strat / tot },
      loadout: this.loadout.slice(), orbitals: loadoutIds(this.kit),
      credits: { kills: cr.kills, bases: cr.bases, pois: cr.pois, breaches: cr.breaches, objective: cr.objective, extraction: cr.extraction, drops: cr.drops, civ: cr.civ, boss: cr.boss, sides: cr.sides,
        total: cr.total, spent: this.wallet.spent - cr.spent0, start: cr.start, balance: this.wallet.bal },
      deaths: this.deaths.map((x) => ({ ...x })),
      teams: this.teams.map((tm) => ({ letter: tm.letter, ship: tm.ship, deaths: tm.deaths, ids: tm.ids.slice() })),
    };
  }

  // ----- ground: speed and deep water -----
  // Every mover (units, the squad's anchor, enemy group centres, SEAF route anchors) is stepped by the AI as if the ground were flat.
  // _snap() remembers where each one stood at the start of the tick; _walk() then scales the step by the going (shallows, mud, snow,
  // sand and dust slow everyone) and keeps everything out of deep water, sliding along the shore where it can.
  _snap() {
    for (const e of this.enemies) { e.px = e.x; e.py = e.y; }
    for (const a of this.alive) { a.px = a.x; a.py = a.y; }
    for (const g of this.groups) { g.pcx = g.cx; g.pcy = g.cy; }
    const sq = this.squad; sq.pax = sq.ax; sq.pay = sq.ay;
    for (const q of this.seaf.squads) { q.pax = q.ax; q.pay = q.ay; }
  }
  // Turn every unit toward where it is shooting, or else where it is going, at its own turning speed (heavies turn slowly).
  _turn(o, rate, dt) {
    let want = null;
    if (o.aimUntil > this.t) want = o.aimA;
    else { const dx = o.x - o.px, dy = o.y - o.py; if (dx * dx + dy * dy > 0.0004) want = Math.atan2(dy, dx); }
    if (want === null || want === undefined) return;
    let d = want - o.face;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const s = rate * dt;
    o.face += Math.abs(d) <= s ? d : Math.sign(d) * s;
  }
  _walk(dt = 1 / C.world.tickHz) {
    const tr = this.terrain, jump = this.t < this.buff.jumpUntil, R = this._wr || (this._wr = { x: 0, y: 0 });
    // One mover's step from (x0, y0) to (x1, y1), with the going and the water applied. The answer is left in R (no garbage).
    // soft: how much of the slow going applies (0 = none, 1 = all of it).
    const go = (x0, y0, x1, y1, soft) => {
      R.x = x1; R.y = y1;
      if (x0 === undefined) return R;
      const dx = x1 - x0, dy = y1 - y0, d2 = dx * dx + dy * dy;
      if (tr.blocked(x0, y0)) { const l = tr.nearestLand(x1, y1); R.x = l.x; R.y = l.y; return R; }   // somehow in deep water: back to dry ground
      if (d2 > 900) { if (tr.blocked(x1, y1)) { const l = tr.nearestLand(x1, y1); R.x = l.x; R.y = l.y; } return R; }   // a landing or a leap
      if (d2 === 0) return R;
      let tx = x1, ty = y1;                          // slide along the shore rather than step into deep water
      if (tr.blocked(x1, y1)) {
        if (!tr.blocked(x1, y0)) ty = y0; else if (!tr.blocked(x0, y1)) tx = x0;
        else {
          // a pocket in the shoreline: try the step turned a little either way before giving up on it
          tx = x0; ty = y0;
          for (const a of SLIDE) {
            const c = Math.cos(a), s = Math.sin(a), rx = x0 + dx * c - dy * s, ry = y0 + dx * s + dy * c;
            if (!tr.blocked(rx, ry)) { tx = rx; ty = ry; break; }
          }
        }
      }
      const s0 = tr.speedAt(x0, y0), s1 = tr.speedAt(tx, ty);
      let f = ((s0 || 1) + (s1 || 1)) * 0.5;
      f = 1 - (1 - f) * soft;
      let nx = x0 + (tx - x0) * f, ny = y0 + (ty - y0) * f;
      if (tr.blocked(nx, ny)) {
        // the shortened step clips the corner of a water cell: take the part of it along one axis instead of standing still
        const ax = nx, ay = ny;
        if (!tr.blocked(ax, y0)) { nx = ax; ny = y0; } else if (!tr.blocked(x0, ay)) { nx = x0; ny = ay; } else { nx = x0; ny = y0; }
      }
      R.x = nx; R.y = ny; return R;
    };
    // nobody walks out of the area of operations
    const A = this.ao, X0 = A.x0 + 2, X1 = A.x1 - 2, Y0 = A.y0 + 2, Y1 = A.y1 - 2;
    const inX = (v) => (v < X0 ? X0 : v > X1 ? X1 : v), inY = (v) => (v < Y0 ? Y0 : v > Y1 ? Y1 : v);
    for (const e of this.enemies) if (!e.dead) { go(e.px, e.py, e.x, e.y, 1); e.x = inX(R.x); e.y = inY(R.y); }
    for (const a of this.alive) if (!a.mounted) { go(a.px, a.py, a.x, a.y, a.type === 'H' && jump ? 0 : 1); a.x = inX(R.x); a.y = inY(R.y); }
    for (const g of this.groups) { go(g.pcx, g.pcy, g.cx, g.cy, 1); g.cx = inX(R.x); g.cy = inY(R.y); }
    const sq = this.squad;
    go(sq.pax, sq.pay, sq.ax, sq.ay, jump ? 0 : sq.mounted ? 0.5 : 1); sq.ax = inX(R.x); sq.ay = inY(R.y);
    for (const q of this.seaf.squads) { go(q.pax, q.pay, q.ax, q.ay, 1); q.ax = inX(R.x); q.ay = inY(R.y); }
    const T = C.combat.turn, hr = T.H[this.faction.id] || 2;
    for (const e of this.enemies) if (!e.dead) this._turn(e, e.kind === 'H' ? hr : T[e.kind], dt);
    for (const a of this.alive) if (!a.mounted) this._turn(a, T.ally, dt); else a.face = a.mounted.face;
  }

  // ----- one fixed step -----
  step(dt) {
    if (this.over) return;
    this.terrain.setBounds(this.ao);      // (the ground is shared between missions on the same seed)
    if (appliedLevel() !== this.difficulty) applyDifficulty(this.difficulty);   // (and the numbers, between missions of other levels)
    this.t += dt;
    this._snap();
    this._refreshAlive();
    this.eGrid.clear(); this.aGrid.clear(); this.tGrid.clear();
    for (const e of this.enemies) if (!e.dead) { this.eGrid.insert(e); e.vis = this.visLevel(e.x, e.y); }
    for (const a of this.alive) if (!a.mounted) this.aGrid.insert(a);
    for (const s of this.assets) if (!s.dead && s.kind !== 'mines') this.tGrid.insert(s);

    buildDanger(this);
    updatePlayer(this, dt);
    updatePlan(this, dt);
    updateSquad(this, dt);
    updateHelldivers(this, dt);
    updateEvade(this, dt);
    updateAllies(this, dt);
    updateEnemies(this, dt);
    this._lockScan(dt);
    this._radar();
    updateStrat(this, dt);
    updateSupply(this, dt);
    updateBoss(this, dt);
    updatePois(this, dt);
    updateSides(this, dt);
    updateObjectives(this, dt);
    updateDirector(this, dt);
    updatePatrols(this, dt);
    updateReinf(this, dt);
    updateCivs(this, dt);
    updateExtract(this, dt);
    updateChatter(this, dt);
    this._reinforce();
    this._walk(dt);

    // Drop the dead in place (no new arrays every tick).
    if (this.dirtyE) {
      compact(this.enemies, deadE);
      for (const g of this.groups) compact(g.members, deadE);
      compact(this.groups, emptyG);
      this.dirtyE = false;
    }
    if (this.dirtyA) { compact(this.allies, deadE); this.dirtyA = false; }

    // A mission is won outright by extracting (extract.js). If the squad is gone for good (the last Helldiver down with no lives
    // left; SEAF cannot finish the job for them) or the clock runs out, what counts is the primary objective: done, and the
    // mission is complete without extraction and the session goes on; not done, and the mission has failed.
    if (!this.over) {
      const hdAlive = this.allies.some((a) => !a.dead && a.type === 'H');
      if (!hdAlive && this.pendingPods('H') === 0 && this.hd.lives <= 0) this.finish(this.objDone ? 'complete' : 'defeat');
      else if (this.t >= this.limitSec) this.finish(this.objDone ? 'complete' : 'timeout');
    }
  }
}
