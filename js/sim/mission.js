// One mission = one game loop on one map. DOM-free and deterministic for a given seed.
// The player runs the destroyer: a UAV scan, orbital stratagems from the armory, and SEAF pods and orders.
// The four Helldivers (one per stratagem group) fight on their own and are reinforced automatically from a pool of lives.
import { buildCostMul } from '../data/perks.js';
import { addSpawners, hitSpawners, liveSpawners } from './spawners.js';
import { initAlert, updateAlert, alertRaise, alertClear } from './alert.js';
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { RNG } from '../util/rng.js';
import { Grid } from '../util/grid.js';
import { FACTIONS, SUBTYPES, ALLY, BIOMES, NUKE, COMMS } from '../data/data.js';
import { rollLoadout } from '../data/strat.js';
import { newKit, newWallet, seafStats, maxLives, zoneExtra, buy, equip, loadoutIds, buildStats, buildLevel } from '../data/kit.js';
import { seafName } from '../data/names.js';
import { updateSquad } from './squad.js';
import { setupDefenders } from './defenders.js';
import { initSeaf, busyWith, targetSquads, setSquadOrder, drawOrder, callPelican, pendingTroops, dropSquad, callCargo, boxSelect, setForm, pickTroops, toSquad, disband, PICKED, LOOSE, takePelican, backCut, seafHeld, makeLz, lzCount, selectSquads as seafSelectSquads, mergeSquads as seafMergeSquads } from './seaf.js';
import { updatePosts, updateSam, garrisonPost, releaseGarrison, POSTS, makePost, INSIDE, foxSize, GARRISON, demolish, chains, chainPlan, wallShape, removePost, onEnemy, buildFoot, inCone } from './posts.js';
import { updateEnemies, updateAllies } from './enemies.js';
import { updateDirector, alertBase, detectR } from './director.js';
import { initPatrols, updatePatrols } from './patrols.js';
import { setupSides, updateSides, beaconAt, sporeMul } from './sides.js';
import { noise } from './enemies.js';
import { locked } from './combat.js';
import { initPlan, updatePlan, noteWipe } from './planner.js';
import { initPlayer, updatePlayer, syncSlots, slotStats } from './player.js';
import { initStrat, updateStrat, destroyAsset, mechDown } from './strat.js';
import { setupObjectives, updateObjectives, completeObjective, startSetup } from './objectives.js';
import { placeBase, setupLastStand, updateLastStand, lsBegin, lsSpawn, lsJammer, lsSupply } from './laststand.js';
import { setupPois, updatePois, damagePoi, damageBreach } from './pois.js';
import { setupCover } from './cover.js';
import { updateChatter } from './chatter.js';
import { initKit, updateHelldivers } from './helldiver.js';
import { buildDanger, updateEvade } from './safety.js';
import { getTerrain } from './terrain.js';
import { domeBlocks } from './ops.js';
import { boardingNow } from './extract.js';
import { initReinf, updateReinf, damageDrop, callReinforcements } from './reinforce.js';
import { updateExtract } from './extract.js';
import { hurtCiv, updateCivs } from './civilians.js';
import { initSupply, updateSupply } from './supply.js';
import { initBoss, updateBoss } from './boss.js';
import { pickAO, aoX, aoY, aoScale, aoClamp } from './ao.js';
import { applyDifficulty, appliedLevel, clampAny, reward, warMinutes, LEVELS } from '../difficulty.js';

const SIZE = C.world.size;
const ORDER_KINDS = ['auto', 'move', 'protect', 'attack', 'escort'];
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
      if ((x - a.cx) ** 2 + (y - a.cy) ** 2 > (a.R - margin) ** 2) continue;       // (the round area)
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
    this.difficulty = clampAny(opts.difficulty ?? LEVELS);
    this.noDefenders = opts.defenders === false;      // (0.18: tests turn the SEAF already at the site off)
    this.forceJam = opts.jammer === true;              // (0.38) a campaign chapter wants a jammer site on the map
    this.noHbSides = opts.hellbombSides === false;     // (0.38) ...or none of the Hellbomb's side jobs yet (no jammer; towers fall to guns)
    applyDifficulty(this.difficulty);
    this.reward = reward(this.difficulty);     // credits and score multiplier
    this.opDone = Math.max(0, opts.opDone || 0);                                // (0.40) missions already done in this operation
    this.opBonus = 1 + C.difficulty.opBonus * this.opDone;                       // ...and what that adds to every credit
    this.bump = Math.max(0, opts.bump | 0); this.bumpPay = 1 + C.offers.payPer * this.bump;     // (0.51) the offer's bump: harder, and paid for it
    this._crc = 0;                             // the fraction of a credit carried over between payouts
    this.seed = opts.seed >>> 0;
    this.rng = new RNG(this.seed);
    this.crng = new RNG((this.seed ^ 0x5bd1e995) >>> 0);   // cosmetic randomness (names, chatter), never touches the sim
    this.srng = new RNG((this.seed ^ 0x2c1b3c6d) >>> 0);   // which mediums come out special (kept apart, so the map does not change)
    this.rrng = new RNG((this.seed ^ 0x6a09e667) >>> 0);   // (0.31) off-map patrols and how many places a call comes in at (kept apart too)
    this.faction = FACTIONS[opts.faction];
    this.groupSize = C.enemies.group[opts.faction] || C.enemies.groupSize;
    this.biome = BIOMES[opts.biome];
    this.terrain = getTerrain(opts.biome, this.seed);   // the ground: height, water depth, soft going (see terrain.js)
    this.terrain.clearDecks();                          // (light bridges from an earlier mission on the same ground come off)
    this.S = opts.sessionMinutes || 0; // session minutes played before this mission (the map grows with them)
    // (0.19) war minutes: how far the war has escalated (difficulty.js): the enemy's toughness, damage, numbers and heavies
    this.W = warMinutes(opts.difficulty ?? null, this.S);
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
    this.shells = []; this.beams = []; this.bridgeQ = []; this.markers = []; this.pods = []; this.pelicans = []; this.incoming = []; this.uavs = []; this.relays = []; this.spotters = []; this.bubbles = []; this.evading = false; this.hellbomb = null;
    this.assets = []; this.zones = []; this.civs = [];
    this.crates = []; this.arty = []; this.posts = []; this.trenches = [];   // supply crates SEAF deploy into defences; artillery cannons; everything SEAF built (posts.js)
    this.pois = []; this.breaches = [];
    this.locked = [];                      // enemies that have given themselves away long enough to be hit from orbit
    this.radar = { nextAt: 3, at: -99, blips: [], n: 0 };   // the UAV's radar sweeps
    initReinf(this);
    initSupply(this);
    initBoss(this, opts);
    initAlert(this, opts);
    this.eGrid = new Grid(SIZE, 40); this.aGrid = new Grid(SIZE, 40); this.tGrid = new Grid(SIZE, 40);
    this.cx = 0; this.cy = 0; // centroid of the Helldivers (or of everyone if none are alive)
    this.hx = 0; this.hy = 0;
    this.dirtyE = false; this.dirtyA = false;
    this.pressure = Math.max(C.pressure.floor, C.pressure.start + C.pressure.perSessionMin * this.W);
    this.hpMul = Math.min(C.ramp.hpCap, 1 + C.ramp.hp * this.W); // enemy toughness and damage grow with the war
    const dBase = C.ramp.base * (C.ramp.fac[opts.faction] || 1);
    this.dmgMul = Math.min(C.ramp.dmgCap * dBase, dBase * (1 + C.ramp.dmg * this.W));
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

  // Bases come in clusters: the spread-out points become the clusters' centres and the rest of the bases gather round them. The
  // later in the session and the higher the difficulty, the bigger and tighter the clusters (CONFIG.bases.cluster). Its own random
  // stream, so the rest of the map is laid out as it was.
  _clusters(pts, lzAvoid, land) {
    const K = C.bases.cluster, n = pts.length;
    if (n < 2) return pts;
    const q = Math.max(0, Math.min(1, K.base + this.S / K.perMin + ((this.difficulty ?? 10) - 1) * K.perLevel));
    const rng = new RNG((this.seed ^ 0x7f4a7c15) >>> 0), sizes = [];
    let left = n;
    while (left > 0) {
      let s = 1 + rng.int(1 + Math.round((K.maxSize - 1) * q));
      if (rng.next() < K.single * (1 - q)) s = 1;
      s = Math.min(s, left); sizes.push(s); left -= s;
    }
    this.clusterLevel = q; this.clusterSizes = sizes.slice();
    const out = [], near = (x, y, r) => out.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < r * r);
    sizes.forEach((s, c) => {
      const P = pts[c];
      out.push(P);
      const R0 = K.far - (K.far - K.near) * q, a0 = rng.angle();
      for (let k = 1; k < s; k++) {
        let placed = false;
        for (let tries = 0; tries < 24 && !placed; tries++) {
          const ang = a0 + (k / s) * Math.PI * 2 + rng.range(-0.5, 0.5), r = R0 * rng.range(0.8, 1.25);
          const { x, y } = aoClamp(this.ao, P.x + Math.cos(ang) * r, P.y + Math.sin(ang) * r, 60);
          if (!land(x, y) || near(x, y, K.gap) || Math.hypot(x - lzAvoid.x, y - lzAvoid.y) < lzAvoid.r) continue;
          out.push({ x, y }); placed = true;
        }
        if (!placed) { const f = pts[sizes.length + out.length - c - 1] || pts.find((p) => !out.includes(p)); if (f && !out.includes(f)) out.push(f); }
      }
    });
    return out;
  }

  _setup(opts) {
    const rng = this.rng;
    // Landing zone near a random edge of the area of operations.
    const tr = this.terrain, land = (x, y) => tr.isLand(x, y), A = this.ao;
    let lz = null, lastTry = null;
    for (let k = 0; k < 80 && !lz; k++) {
      // (0.18: the area is round: near its rim, at a random bearing)
      const side = rng.int(4), inset = Math.max(70, A.size * 0.1), along = rng.range(0.2, 0.8);     // (the same draws as the square had: maps stay alike)
      const ang = ((side + along) / 4) * Math.PI * 2;
      const c = { x: A.cx + Math.cos(ang) * (A.R - inset), y: A.cy + Math.sin(ang) * (A.R - inset) };
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
    const spread = placePoints(this, nBases, aoScale(this, B.spacing), [lzAvoid], 60, land);
    this.bases = this._clusters(spread, lzAvoid, land).map((p) => ({
      id: this.nextId++, x: p.x, y: p.y, hp: B.hp, maxHp: B.hp, destroyed: false, r: B.radius,
      garrisoned: false, nextSpawn: 0, lastHit: -99,
    }));
    for (const b of this.bases) addSpawners(this, b, opts.seed || 0);     // (0.49) each a cluster of small spawners
    this.baseTotal = nBases;
    this.limitSec = C.world.missionSec + C.world.extraSecPerBase * (nBases - C.bases.min);

    // Objectives (may add the citadel to the base list).
    setupObjectives(this, opts.lastStand ? ['evac'] : opts.objectives);
    if (opts.lastStand) placeBase(this);      // (0.19: the tutorial's base, laststand.js)
    // Bases close together work as a cluster (director.js): each one knows its neighbours.
    for (const b of this.bases) b.nb = this.bases.filter((q) => q !== b && Math.hypot(q.x - b.x, q.y - b.y) <= C.bases.clusterR);

    // Hidden extraction point.
    // (0.47) and clear of every objective's site (an evacuation bunker had its extraction pad put on top of it)
    const objAt = (o) => (o.type === 'vip' ? [{ x: o.x, y: o.y }, { x: o.dx, y: o.dy }] : [{ x: o.x, y: o.y }]);
    const exAvoid = [{ x: this.lz.x, y: this.lz.y, r: aoScale(this, C.extract.minFromLz) }, ...this.bases.map((b) => ({ x: b.x, y: b.y, r: C.extract.minFromBase })),
      ...this.objectives.flatMap(objAt).filter((p) => Number.isFinite(p.x)).map((p) => ({ x: p.x, y: p.y, r: C.extract.minFromObj }))];
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
    this.extraction = { x: ex.x, y: ex.y, revealed: true, holdT: 0, nextWave: Infinity };     // (on the map from the drop; locked until the objective is done)
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
      this.pods.push({ type: 'H', team: i, n: 1, landAt: (opts.countdown || 0) + C.helldivers.initialDropSec + 0.5 * i, x: this.lz.x + Math.cos(ang) * 11, y: this.lz.y + Math.sin(ang) * 11, start: true });
    });

    // Side missions and SEAF drop beacons.
    setupSides(this);

    // Every base's patrols are already out on their routes.
    initPatrols(this);
    initPlan(this);
    // (0.18) now and then SEAF are already holding the site the Helldivers are heading for
    setupDefenders(this);
    this.countdown = opts.countdown || 0; this.dropAt = this.countdown + C.helldivers.initialDropSec;    // (0.18) the drop countdown
    if (opts.lastStand) setupLastStand(this);
    this._refreshAlive();               // (the mission starts paused on the tactical screen: who is on the ground already shows)
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
    p.weapon = i; p.swapUntil = this.t + C.weapons.swapSec; p.queued = -1;
    this.emit('swap', { w: i });
  }

  _deny(reason, text) {
    this.emit('deny', { reason });
    if (text) this.radio(text, 'deny' + reason, 3);
    return { ok: false, reason };
  }
  pendingPods(type) { if (type === 'S') return pendingTroops(this); let n = 0; for (const p of this.pods) if (p.type === type) n += p.n; return n; }

  // Call a SEAF drop. A troop pelican flies it in; it has to land inside the strike zone. The troops join the selected squad.
  // (0.27.3) opts.hold: a squad of its own waits for orders where it lands (see dropHold); false keeps the old way (it goes
  // straight off to clear the nearest objective: the test bot plays like that)
  callSeaf(x, y, opts = {}) {
    const t = this.t, sf = this.seaf, st = seafStats(this.kit);
    if (this.over) return { ok: false, reason: 'over' };
    // (0.18) before the Helldivers are down (the start, on the tactical screen) the landing zone takes a drop
    const atLz = t < (this.dropAt || 0) + C.seaf.startSec && Math.hypot(x - this.lz.x, y - this.lz.y) <= C.seaf.startR;
    if (!this.alive.length && !atLz) return this._deny('noallies');
    const bc = beaconAt(this, x, y);
    if (bc) { x = bc.x; y = bc.y; }      // a drop beacon takes it anywhere on the map (while it is lit)
    else if (!atLz && !this.inZone(x, y, -5)) return this._deny('nocoverage', COMMS.noCoverage);
    // (0.39) troopers aboard the destroyer (picked up) come down first; new ones only as far as there is room
    const room = Math.max(0, st.max - seafHeld(this)) + sf.reserve.length;
    if (room <= 0) return this._deny('full');
    const n = Math.min(st.drop, room), back = Math.min(n, sf.reserve.length);
    // (0.39: one of the hangar's pelicans, shared with pickups; 0.40: troopers coming back down make its turnaround shorter, and
    // those it cannot carry stay aboard for the next one)
    if (takePelican(this, backCut(this, back)) < 0) return this._deny('cooldown');
    const squad = dropSquad(this, x, y);
    const fresh = !this.seafAlive.some((a) => a.sq === squad) && !this.pelicans.some((p) => p.squad === squad);
    callPelican(this, x, y, n, squad, fresh && opts.hold !== false);
    this.stats.seafCalls++;
    this.radio(COMMS.seafDrop, 'seafDrop', 0);
    this.emit('pod_call', { type: 'S', x, y, n, back });
    return { ok: true, n, squad, back };
  }

  // (0.39) PICKUP: a pickup point at (x, y), anywhere in the strike zone (or at a lit drop beacon). If SEAF are already standing
  // there a pelican comes for them as soon as one is ready; if not, it waits like a building for troops to be sent to it
  // (seafMan). One already close by is used instead of a second.
  callPickup(x, y) {
    if (this.over) return { ok: false, reason: 'over' };
    if (!this.seafAlive.length) return this._deny('noseaf');
    const bc = beaconAt(this, x, y);
    if (bc) { x = bc.x; y = bc.y; }
    else if (!this.inZone(x, y, -5)) return this._deny('nocoverage', COMMS.noCoverage);
    ({ x, y } = aoClamp(this.ao, x, y, 20));
    if (!this.terrain.isLand(x, y) || this.terrain.blocked(x, y)) return this._deny('water', COMMS.noWater);
    const P = C.pelican;
    const lz = this.posts.find((p) => p.what === 'lz' && !p.dead && Math.hypot(p.x - x, p.y - y) < P.pickR * 1.5) || makeLz(this, x, y);
    const n = lzCount(this, lz);
    this.radio(COMMS.lzDown, 'lzdown', 1);
    this.notice(tr(n ? 'n.lzIn' : 'n.lzWait', { n }), 'info');
    this.emit('lz_call', { x: lz.x, y: lz.y, n });
    return { ok: true, lz, n };
  }
  // (0.39) The squads picked (every one of them) go to a pickup point and wait in it for the pelican.
  seafToLz(lz) {
    if (this.over || !lz || lz.dead) return { ok: false, reason: 'over' };
    const sq = targetSquads(this).filter((q) => q.n > 0);
    if (!sq.length) return this._deny('noseaf');
    for (const q of sq) setSquadOrder(this, q, 'post', lz.x, lz.y, { post: lz, site: lz.site });
    this.radio(COMMS.seafToLz, 'seaftolz', 1);
    this.emit('seaf_order', { kind: 'post', x: lz.x, y: lz.y, sq: sq[0].i, lz: true });
    return { ok: true, squad: sq[0].i, n: sq.reduce((k, q) => k + q.n, 0) };
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
  // Send the selected squad (one squad: the selected one, or the nearest to the spot when all are selected) to build at (x, y)
  // (posts.js lists what can be built). Paid for when it is ordered; there is no limit on how many. The foxhole is free and dug
  // on the spot (0.39.2: and so is concertina wire); everything else comes down as a crate from a cargo pelican.
  // (0.39) opts: { face (which way it faces: turned before it was put down; default away from the Helldivers' landing), shape
  // ('line' for a line of bastions) }. Concertina wire carries on from a free end of wire near the spot (posts.js wirePlan).
  seafBuild(what, x, y, opts = {}) {
    if (this.over) return { ok: false, reason: 'over' };
    const B = C.build[what];
    if (!B || !POSTS.includes(what)) return { ok: false, reason: 'kind' };
    const lvl = buildLevel(this.kit, what);
    if (!lvl) return this._deny('locked');                       // (the SAM site and the cannon have to be unlocked in the armory first)
    const st = { ...buildStats(what, lvl) }; st.cost = Math.round(st.cost * buildCostMul(this.kit));     // (0.51: the Engineering Corps commendation)
    const sq = targetSquads(this).filter((q) => q.n > 0);
    if (!sq.length) return this._deny('noseaf');
    if (what === 'bridge') return this.bridgeDrop(x, y);     // (0.22) a light bridge comes down from the ship: nobody builds it
    let span = null;
    if (what === 'bridge') {
      // a light bridge goes across the water at the spot: the shortest way over, the crate on the bank nearer the squad
      const q0 = sq.slice().sort((a, b) => Math.hypot(a.cx - x, a.cy - y) - Math.hypot(b.cx - x, b.cy - y))[0];
      span = this.terrain.findSpan(x, y, st.span, q0.cx, q0.cy);
      if (!span) return this._deny('nospan');
      x = span.x1; y = span.y1;
      if (!this.terrain.isLand(x, y)) { const l = this.terrain.nearestLand(x, y, 30); if (!l) return this._deny('nospan'); x = l.x; y = l.y; }
    } else {
      ({ x, y } = aoClamp(this.ao, x, y, 20));
      if (!this.terrain.isLand(x, y) || this.terrain.blocked(x, y)) return this._deny('water', COMMS.noWater);
    }
    let face = Number.isFinite(opts.face) ? opts.face : Math.atan2(y - this.hy, x - this.hx);
    // (0.28) a foxhole is dug by the squads picked (or the nearest, with every squad picked), as long as there are troopers in them
    const diggers = what === 'foxhole' ? this.diggers(sq, x, y) : null;
    const digSize = diggers ? foxSize(diggers.reduce((n, q) => n + q.n, 0)) : undefined;
    // (0.47) wire and foxholes carry on from a free end near the spot (posts.js chainPlan). A section planned in the pause was
    // snapped when it was planned (opts.exact), so it goes exactly where the plan showed it.
    if (chains(what) && !opts.exact) { const w = chainPlan(this, what, x, y, face, { size: digSize }); x = w.x; y = w.y; face = w.face; }
    const shape = what === 'bastion' ? wallShape(opts.shape) : undefined;     // (0.47: a line or a corner)
    if (what !== 'bridge' && onEnemy(this, x, y, buildFoot(what, lvl, shape))) return this._deny('onbase');     // (0.40) not on a base that still stands
    // a crate of this kind already on the ground near the spot (from an order that was changed) is used again, at no charge
    // (0.39: wire and foxholes only right on the spot, so a row of them is a row, not one)
    const reuseR = what === 'wire' || what === 'foxhole' ? 2.5 : C.build.crateR;
    let crate = this.crates.find((c) => c.what === what && !c.used && Math.hypot(c.x - x, c.y - y) < reuseR);
    if (crate) { crate.face = face; crate.shape = shape; }
    if (!crate && what === 'foxhole') { crate = { id: this.nextId++, what, x, y, landed: true, used: false, dig: true, prog: 0, born: this.t, size: Number.isFinite(opts.size) ? foxSize(opts.size) : digSize, face }; this.crates.push(crate); }
    // (0.39.2) concertina wire is free and strung on the spot, like a foxhole: no crate comes down for it
    if (!crate && what === 'wire') { crate = { id: this.nextId++, what, x, y, landed: true, used: false, lay: true, prog: 0, born: this.t, face }; this.crates.push(crate); }
    if (!crate) {
      if (this.wallet.bal < st.cost) return this._deny('funds');
      this.wallet.bal -= st.cost; this.wallet.spent += st.cost;     // paid now: a cargo pelican brings the crate
      crate = { id: this.nextId++, what, x, y, landed: false, used: false, prog: 0, born: this.t, span, face, shape };
      this.crates.push(crate);
      callCargo(this, x, y, crate);
      this.notice(tr('n.crateIn', { what: tr('build.' + what), cr: st.cost }), 'info');
    }
    const q = diggers ? diggers[0] : sq.slice().sort((a, b) => Math.hypot(a.cx - x, a.cy - y) - Math.hypot(b.cx - x, b.cy - y))[0];
    if (span && !crate.span) crate.span = span;
    // (0.47) the build queue: a squad already building something nearby finishes it first and comes to this one after (seaf.js
    // nextCrate); it is only sent straight here when it has nothing to build close by
    for (const d of diggers || [q]) if (!busyWith(this, d, crate.x, crate.y)) setSquadOrder(this, d, 'build', crate.x, crate.y, { what, crate });
    this.radio(COMMS.seafBuild(what), 'seafbuild', 1);
    this.emit('seaf_order', { kind: 'build', what, x, y, sq: q.i });
    return { ok: true, squad: q.i };
  }
  // (0.28) Who digs a foxhole at (x, y): every squad picked (one, several, or troopers picked as a group), nearest first; with every
  // squad picked (nothing chosen), just the nearest one. Its size is theirs: a trooper to a place.
  diggers(sq = targetSquads(this).filter((q) => q.n > 0), x = 0, y = 0) {
    const L = sq.slice().sort((a, b) => Math.hypot(a.cx - x, a.cy - y) - Math.hypot(b.cx - x, b.cy - y));
    const all = this.seaf.sel === -1 && !(this.seaf.multi && this.seaf.multi.length);
    return all ? L.slice(0, 1) : L;
  }
  // how many places a foxhole dug at (x, y) now would have, and which squads would dig it (for the ghost: nothing is changed)
  digPlan(x = 0, y = 0) {
    const sf = this.seaf;
    if (sf.sel === -2) return { size: foxSize((sf.pick || []).filter((a) => !a.dead).length), sq: [] };
    let L = sf.sel >= 0 ? [sf.squads[sf.sel]] : sf.multi && sf.multi.length ? sf.multi.map((i) => sf.squads[i]) : sf.squads;
    L = L.filter((q) => q && q.n > 0).sort((a, b) => Math.hypot(a.cx - x, a.cy - y) - Math.hypot(b.cx - x, b.cy - y));
    if (sf.sel === -1 && !(sf.multi && sf.multi.length)) L = L.slice(0, 1);
    return { size: foxSize(L.reduce((n, q) => n + q.n, 0)), sq: L };
  }
  // (0.22) A light bridge, dropped from the ship: anywhere an ally (or a UAV) can see, across the water at the spot. No crate and
  // nobody to build it; it comes down on its own after dropSec, a little slower than a crate the squad builds.
  bridgeDrop(x, y) {
    if (this.over) return { ok: false, reason: 'over' };
    const lvl = buildLevel(this.kit, 'bridge');
    if (!lvl) return this._deny('locked');
    const st = { ...buildStats('bridge', lvl) }; st.cost = Math.round(st.cost * buildCostMul(this.kit));
    if (!this.inSight(x, y)) return this._deny('nosight');
    let ref = null, rd = Infinity;
    for (const a of this.alive) { const d = Math.hypot(a.x - x, a.y - y); if (d < rd) { rd = d; ref = a; } }
    const span = this.terrain.findSpan(x, y, st.span, ref ? ref.x : this.hx, ref ? ref.y : this.hy);
    if (!span) return this._deny('nospan');
    if (this.bridgeQ.some((b) => Math.hypot((b.span.x1 + b.span.x2) / 2 - (span.x1 + span.x2) / 2, (b.span.y1 + b.span.y2) / 2 - (span.y1 + span.y2) / 2) < 12)) return this._deny('nospan');
    if (this.wallet.bal < st.cost) return this._deny('funds');
    this.wallet.bal -= st.cost; this.wallet.spent += st.cost;
    const at = this.t + C.build.bridge.dropSec, mx = (span.x1 + span.x2) / 2, my = (span.y1 + span.y2) / 2;
    this.bridgeQ.push({ at, span, lvl });
    this.markers.push({ type: 'bridge', x: mx, y: my, r: 6, span, start: this.t, end: at });
    this.notice(tr('n.bridgeIn', { s: C.build.bridge.dropSec, cr: st.cost }), 'info');
    this.emit('bridge_call', { x: mx, y: my, at });
    return { ok: true, at, span };
  }
  _bridges() {
    for (let i = this.bridgeQ.length - 1; i >= 0; i--) {
      const b = this.bridgeQ[i]; if (this.t < b.at) continue;
      this.bridgeQ.splice(i, 1);
      makePost(this, 'bridge', b.span.x1, b.span.y1, { span: b.span, lvl: b.lvl });
      this.notice(tr('n.bridgeDown'), 'good');
    }
  }
  // (0.22) Can an ally (or a UAV circle) see (x, y)? Light bridges need it.
  inSight(x, y) {
    for (const a of this.alive) { const r = a.vision || a.sight || 0, dx = a.x - x, dy = a.y - y; if (dx * dx + dy * dy <= r * r) return true; }
    for (const u of this.uavs) { const dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy <= u.r * u.r) return true; }
    for (const u of this.relays) { const dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy <= u.r * u.r) return true; }
    return false;
  }
  // A crate on the ground (or a foxhole being dug): the selected squad (or the nearest) goes and builds it. Its progress is the crate's,
  // so it carries on where the last squad left off.
  seafBuildCrate(crate) {
    if (this.over || !crate || crate.used) return { ok: false, reason: 'over' };
    const sq = targetSquads(this).filter((q) => q.n > 0);
    if (!sq.length) return this._deny('noseaf');
    const q = sq.slice().sort((a, b) => Math.hypot(a.cx - crate.x, a.cy - crate.y) - Math.hypot(b.cx - crate.x, b.cy - crate.y))[0];
    setSquadOrder(this, q, 'build', crate.x, crate.y, { what: crate.what, crate });
    this.radio(COMMS.seafBuild(crate.what), 'seafbuild', 1);
    this.emit('seaf_order', { kind: 'build', what: crate.what, x: crate.x, y: crate.y, sq: q.i });
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
  // ----- posts (posts.js): send the selected squad (or the nearest, with every squad selected) to man a post or a defence site
  // (one of the walled sites a defence is held at): they take its places and stay there.
  seafMan(target) {
    if (this.over || !target) return { ok: false, reason: 'over' };
    if (target.what === 'lz') return this.seafToLz(target);     // (0.39) a pickup point: everyone picked goes
    const sq = targetSquads(this).filter((q) => q.n > 0);
    if (!sq.length) return this._deny('noseaf');
    const post = target.kind === 'post' ? target : null, site = post ? post.site : target;
    const q = sq.slice().sort((a, b) => Math.hypot(a.cx - site.x, a.cy - site.y) - Math.hypot(b.cx - site.x, b.cy - site.y))[0];
    // (0.22) a building (turret nest, lookout, tower, cannon): they hold beside it and crew it from there. Going inside takes them out
    // of their squad, so that only happens through its door (the game offers it: see main.js commandAt).
    const room = !!(post && INSIDE.has(post.what) && post.cap);
    setSquadOrder(this, q, 'post', site.x, site.y, { post, site, garrison: room ? false : undefined });
    this.radio(COMMS.seafMan, 'seafman', 1);
    this.emit('seaf_order', { kind: 'post', x: site.x, y: site.y, sq: q.i });
    return { ok: true, squad: q.i, canGarrison: room && post.garrison < post.cap };
  }
  // The door on a selected post: the selected squad (or the nearest) goes there and as many as fit go in for good: they leave
  // their squad and stay with it (they still count toward the troops in the field). Anyone of the squad already on it goes in now.
  garrisonGo(p) {
    if (this.over || !p || p.dead || p.kind !== 'post') return { ok: false, reason: 'over' };
    if (!p.cap) return this._deny('nogarrison');
    if (!INSIDE.has(p.what)) return this.seafMan(p);      // (0.27.3) a foxhole or a bastion has no inside: they just man it
    if (p.garrison >= p.cap) return this._deny('postfull');
    const sq = targetSquads(this).filter((q) => q.n > 0);
    if (!sq.length) return this._deny('noseaf');
    const q = sq.slice().sort((a, b) => Math.hypot(a.cx - p.x, a.cy - p.y) - Math.hypot(b.cx - p.x, b.cy - p.y))[0];
    setSquadOrder(this, q, 'post', p.site.x, p.site.y, { post: p, site: p.site, garrison: true });
    const now = garrisonPost(this, p, q.i);
    this.radio(COMMS.seafMan, 'seafman', 1);
    this.emit('seaf_order', { kind: 'post', x: p.x, y: p.y, sq: q.i });
    if (now) this.notice(tr('n.garrison', { n: now, what: p.name.toUpperCase() }), 'info');
    return { ok: true, squad: q.i, now };
  }
  // The SEAF crew on a post leave their squad and stay with it (they still count toward the troops in the field).
  garrison(p) {
    if (this.over || !p || p.dead) return { ok: false, reason: 'over' };
    const n = garrisonPost(this, p);
    if (!n) return this._deny('nocrew');
    this.notice(tr('n.garrison', { n, what: p.name.toUpperCase() }), 'info');
    this.emit('garrison', { id: p.id, n });
    return { ok: true, n };
  }
  ungarrison(p) {
    if (!p) return { ok: false, reason: 'over' };
    for (const q of this.seaf.squads) if (q.order.post === p) q.order.garrison = false;     // (or they would walk straight back in)
    const n = releaseGarrison(this, p, this.seaf.sel);
    if (!n) return this._deny('nogarrison');
    this.notice(tr('n.ungarrison', { n, what: p.name.toUpperCase() }), 'info');
    return { ok: true, n };
  }
  // A box dragged on the map: the troopers inside it become a squad of their own (or join one, if they are all of it), and it is
  // selected, so the next order is theirs. (x0, y0)-(x1, y1) in world metres.
  seafBox(x0, y0, x1, y1) {
    if (this.over) return { ok: false, reason: 'over' };
    const r = boxSelect(this, Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1));
    if (!r.ok) return this._deny('box' + r.reason);
    if (r.to >= 0) this.notice(tr('n.boxSel', { n: r.n, a: r.to + 1 }), 'info');
    this.emit('squad_select', { sel: this.seaf.sel });
    return r;
  }
  // A formation for squad i (the tactical menu): loose, line, wedge, column or ring.
  setForm(i, f) { const q = this.seaf.squads[i]; if (q) setForm(this, q, f); }
  // -1 selects every squad.
  selectSquad(i) { this.seaf.sel = i >= 0 && i < this.seaf.squads.length ? i : -1; this.seaf.pick = null; this.seaf.multi = null; this.emit('squad_select', { sel: this.seaf.sel }); }
  // (0.22) several squads at once (Shift+click, a finger held on a squad's button): orders go to each of them
  selectSquads(list) { const L = seafSelectSquads(this, list); this.emit('squad_select', { sel: this.seaf.sel, multi: L }); return L; }
  // (0.22) MERGE: the squads listed become one (the lowest number keeps its order)
  mergeSquads(list) {
    const r = seafMergeSquads(this, list);
    if (!r.ok) return this._deny('merge');
    this.notice(tr('n.merged', { from: r.from.map((i) => 'S' + (i + 1)).join(' + '), to: 'S' + (r.to + 1) }), 'info');
    this.emit('squad_select', { sel: this.seaf.sel });
    return r;
  }
  // (0.31) Ctrl+A: every trooper on the map (not those inside a building). Their squads are picked together, each taking an order as
  // itself; troopers in no squad are picked with everyone else (an order then forms them all into one squad).
  selectAllTroops() {
    const all = this.seafAlive.filter((a) => a.sq !== GARRISON && !a.inside);
    if (!all.length) return { ok: false, reason: 'noseaf' };
    if (all.some((a) => a.sq === LOOSE)) { const r = this.pickSeaf(all); return { ...r, ok: r.ok !== false, n: all.length, k: 0 }; }
    const L = [...new Set(all.map((a) => a.sq))].filter((i) => i >= 0).sort((a, b) => a - b);
    if (L.length === 1) this.selectSquad(L[0]); else this.selectSquads(L);
    return { ok: true, n: all.length, k: L.length };
  }
  // (0.18) pick troopers (a click on one, a box): see seaf.js pickTroops
  pickSeaf(list) { const r = pickTroops(this, list); this.emit('squad_select', { sel: this.seaf.sel }); return r; }
  // the selection joins squad i (Alt+number, a double tap on a squad button)
  toSquad(i) {
    const r = toSquad(this, i);
    if (!r.ok) return this._deny('tosquad');
    this.notice(tr('n.toSquad', { n: r.n, a: i + 1 }), 'info');
    this.emit('squad_select', { sel: this.seaf.sel });
    return r;
  }
  // out of their squad: they hold where they are
  disbandSeaf() {
    const r = disband(this);
    if (!r.ok) return this._deny('disband');
    this.notice(tr('n.disband', { n: r.n }), 'info');
    this.emit('squad_select', { sel: this.seaf.sel });
    return r;
  }
  get seafPicked() { return this.seaf.sel === PICKED; }
  // (0.18) DEPLOY NOW: the Helldivers drop at once instead of when the countdown runs out
  deployNow() {
    if (this.over || !(this.t < this.dropAt - C.helldivers.initialDropSec)) return { ok: false, reason: 'dropping' };
    let k = 0;
    for (const p of this.pods) if (p.start) p.landAt = this.t + C.helldivers.initialDropSec + 0.5 * k++;
    this.dropAt = this.t + C.helldivers.initialDropSec;
    this.emit('deploy_now', {});
    return { ok: true };
  }
  // (0.19) the last stand (laststand.js): the evacuation opens; a lesson's group comes at the base
  lsBegin() { return lsBegin(this); }
  lsSpawn(kind, ang) { return lsSpawn(this, kind, ang); }
  lsJammer() { return lsJammer(this); }     // (0.37) the tutorial's Hellbomb and resupply lessons
  lsSupply() { return lsSupply(this); }
  get dropIn() { return Math.max(0, this.dropAt - C.helldivers.initialDropSec - this.t); }
  seafTargets() { return targetSquads(this).filter((q) => q.n > 0); }

  // ----- the armory: upgrades can be bought mid-mission, new orbitals and slots only between missions -----
  spend(id, tier) {
    // (0.21) what each weapon's recharge was before the purchase: an upgrade that shortens it shortens the one already running too
    const before = this.player ? this.player.slots.map((s, i) => (s.readyAt !== undefined ? slotStats(this, i)?.cd || 0 : 0)) : [];
    const r = buy(this.kit, this.wallet, id, !this.ls, tier);       // (0.26: the tutorial has no between-missions: anything open goes)
    if (!r.ok) { this.emit('deny', { reason: r.reason }); return r; }
    // (and a new stratagem goes straight into a slot: a free one; with none free, the bar grows a slot, up to five; with five
    // full, it takes the last one)
    if (this.ls && (id.startsWith('own:') || r.gift)) Object.assign(r, this.slotIn(r.gift || id.slice(4)));
    syncSlots(this);
    if (this.player) this.player.slots.forEach((s, i) => {
      const was = before[i], now = s.readyAt !== undefined ? slotStats(this, i)?.cd || 0 : 0;
      if (was > 0 && now > 0 && now < was && s.readyAt > this.t) s.readyAt = this.t + (s.readyAt - this.t) * (now / was);
    });
    const st = seafStats(this.kit);
    for (const a of this.seafAlive) {
      const nm = Math.round(ALLY.S.hp * st.hpMul);
      a.hp = Math.min(nm, a.hp + (nm - a.maxHp)); a.maxHp = nm; a.dmgMul = st.dmgMul;
    }
    this.emit('bought', { id });
    this.notice(tr('n.bought', { name: r.item.name.toUpperCase() }), 'good');
    if (r.gift) this.notice(tr('n.gift', { name: String(r.giftName).toUpperCase() }), 'good');     // (0.31: the Hangar's free Eagle)
    return r;
  }

  // (0.47) The tutorial puts a stratagem in a slot: a free one; with none free, the bar grows a slot, up to five; with five full, it
  // takes the last one. A stratagem it took a slot from can be put back (the tutorial's armory lists it to EQUIP), the same way.
  slotIn(sid) {
    const K = this.kit, r = {};
    if (!K.owned[sid]) return { ok: false };
    if (!equip(K, sid)) {
      if (K.slots < 5) { K.slots++; equip(K, sid); r.grew = true; }
      else { r.swapped = K.loadout[K.slots - 1]; K.loadout[K.slots - 1] = sid; }
    }
    r.slot = K.loadout.indexOf(sid);
    return r;
  }
  equipLive(sid) {
    if (!this.ls) return { ok: false, reason: 'between' };
    const r = this.slotIn(sid);
    if (r.ok === false) return r;
    syncSlots(this);
    return { ok: true, ...r };
  }

  // Names typed in the menus: a blank ship keeps the random one, a blank Helldiver name goes back to the code (B4).
  setNames(names) {
    this.names = { ships: [], hd: [], ...(names || {}) };
    this.teams.forEach((tm, i) => {
      if (this.names.ships[i]) tm.ship = this.names.ships[i];
      if (tm.hd && !tm.hd.dead) tm.hd.name = this.names.hd[i] || '';
    });
  }

  // The player gives up the mission. Pulling out early always fails it, even with the objective done: the session can only go on
  // from a mission the squad saw through (or lost only after the objective). Retry or end the session from the debrief.
  retire() { this.finish('retired'); }

  // ----- the nuke: only available once the squad has held the launch site -----
  nukeObj() { return this.objectives.find((o) => o.type === 'nuke') || null; }
  nukeReady() { const o = this.nukeObj(); return !!o && o.state === 'armed'; }
  nukeFire(x, y) {
    const o = this.nukeObj(), t = this.t;
    if (!o || o.state !== 'armed') return false;
    o.state = 'inbound';
    const N = C.objective.nuke;
    // (0.40) it flies from the launch site (sx, sy, from t0): the renderer draws the missile on its way, and the camera goes to
    // where it lands for a moment (main.js)
    this.shells.push({ x, y, at: t + NUKE.delay, dmg: N.blastDmg, splash: N.blastR, mult: { L: 1, M: 1, H: 1, B: 1 }, by: 'player', friendly: true, big: true, nuke: true, sx: o.x, sy: o.y, t0: t });
    this.markers.push({ type: 'nuke', x, y, r: N.blastR, start: t, end: t + NUKE.delay });
    this.radio(COMMS.nukeInbound, 'nukeinbound', 0);
    this.emit('nuke_call', { x, y, delay: NUKE.delay, sx: o.x, sy: o.y, r: N.blastR });
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
    const mul = this.reward * this.opBonus * this.bumpPay;     // the difficulty's pay, (0.40) the operation's bonus and (0.51) the bump's
    if (mul !== 1) { const v = amt * mul + this._crc; amt = Math.floor(v); this._crc = v - amt; if (amt <= 0) return; }
    const cr = this.cr, w = this.wallet;
    cr[kind] = (cr[kind] || 0) + amt; cr.total += amt;
    w.bal += amt; w.earned += amt;
    if (amt >= 10 && x !== undefined) this.emit('credit', { x, y, amt, kind });
  }
  damagePoi(p, dmg, by) { damagePoi(this, p, dmg, by); }
  damageDrop(d, dmg, by) { damageDrop(this, d, dmg, by); }
  callReinf(x, y, why = 'site', opts = {}) { return callReinforcements(this, x, y, why, opts); }     // (tests and the browser checks)
  // (0.36) blow up one of your own buildings (again before it blows: the charges come off)
  demolishPost(p) {
    if (this.over) return { ok: false, reason: 'over' };
    if (p && p.what === 'lz') {     // (0.39) a pickup point is called off, not blown up (a pelican on its way still comes)
      if (p.dead) return { ok: false, reason: 'nodemo' };
      removePost(this, p); this.notice(tr('n.lzOff'), 'info'); this.emit('lz_off', { x: p.x, y: p.y }); return { ok: true, cancelled: true };
    }
    return demolish(this, p);
  }
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
      a.gren = st.grenades;            // (0.26) G-12 grenades, every role
      a.name = seafName(this.crng, a.role);
    }
    a.sight0 = base.sight * this.biome.ping;   // flat-ground sight; a rise adds to it (see _refreshAlive)
    a.zone0 = (C.sight.zoneBase[type === 'H' ? 'helldiver' : 'seaf'] || base.sight) * this.biome.ping;   // the strike zone does not grow with sight
    const sm = this.terrain.sightMul(a.x, a.y);
    a.sight = a.sight0 * sm; a.vision = a.sight + C.sight.playerBonus + zoneExtra(this.kit);     // (0.47) strike range upgrades widen the view too
    a.zone = Math.min(a.vision, a.zone0 * sm + C.sight.playerBonus + C.sight.strikeBonus + zoneExtra(this.kit));     // (0.47) never past what the player sees
    this.allies.push(a);
    return a;
  }
  drawToken() {
    if (!this.bag.length) {
      const b = C.enemies.bag;
      // (below level 10 the medium and heavy counts are fractional: the remainder is a chance of one more)
      const whole = (x) => { const f = x - Math.floor(x); return Math.floor(x) + (f > 1e-9 && this.rng.next() < f ? 1 : 0); };
      for (let i = 0; i < b.light; i++) this.bag.push('L');
      const nm = whole(b.medium + Math.floor(this.W / C.ramp.mediumEvery)), nh = whole(b.heavy + Math.floor(this.W / C.ramp.heavyEvery));
      for (let i = 0; i < nm; i++) this.bag.push('M');
      // (0.40) the heavy draws: a share of them are specials ('S'; which ones from their own stream, so the map does not change)
      for (let i = 0; i < nh; i++) this.bag.push(this.srng.next() < C.special.share ? 'S' : 'H');
      this.rng.shuffle(this.bag);
    }
    const k = this.bag.pop();
    if (k === 'L') return k;
    // Keep the field mostly light: past the cap for live mediums and heavies, the draw comes out light instead. (0.40) Specials
    // and heavies share the heavy cap.
    const cap = C.enemies.kindCap, mm = this.t / 60;   // more mediums and heavies allowed as the war and the mission go on
    const max = k === 'M' ? Math.min(cap.maxM, cap.M + cap.perMinM * this.W + cap.perMissionMinM * mm) : Math.min(cap.maxH, cap.H + cap.perMinH * this.W + cap.perMissionMinH * mm);
    let n = 0;
    if (k === 'M') { for (const e of this.enemies) if (!e.dead && e.kind === 'M' && !e.sub) n++; }
    else for (const e of this.enemies) if (!e.dead && !e.boss && (e.kind === 'H' || e.sub)) n++;
    return n >= max ? 'L' : k;
  }
  // (0.49) is there room under the heavy cap for one more heavy (drawToken's rule), for heavies placed outside the bag
  heavyRoom() {
    const cap = C.enemies.kindCap, max = Math.min(cap.maxH, cap.H + cap.perMinH * this.W + cap.perMissionMinH * (this.t / 60));
    let n = 0; for (const e of this.enemies) if (!e.dead && !e.boss && (e.kind === 'H' || e.sub)) n++;
    return n < max;
  }
  _refreshAlive() {
    this.alive.length = 0; this.hdAlive.length = 0; this.seafAlive.length = 0;
    let sx = 0, sy = 0, hx = 0, hy = 0;
    const zx = C.sight.strikeBonus + zoneExtra(this.kit), vx = zoneExtra(this.kit);
    const tr = this.terrain;
    const spores = this.sides && this.sides.some((s) => s.kind === 'spore' && !s.done && !s.failed);
    for (const a of this.allies) {
      if (a.dead || a.hidden) continue;           // hidden SEAF (sides.js) are nobody's until they are found
      const sm = tr.sightMul(a.x, a.y), spm = spores ? sporeMul(this, a.x, a.y) : 1;     // (0.40: less sight in a spore tower's cloud)
      if (a.down) {     // (0.31) a downed trooper lies low: he sees only what is right round him, and gives the strike zone nothing
        a.sight = a.sight0 * C.medic.downSight; a.vision = a.sight; a.zone = 0;
      } else {
        a.sight = a.sight0 * sm * spm; a.vision = a.sight + (C.sight.playerBonus + vx) * spm;   // high ground sees farther (0.47: strike range upgrades too)
        a.zone = Math.min(a.vision, (a.zone0 ?? a.sight0) * sm + C.sight.playerBonus + zx);     // (0.47) the strike zone sits inside the view
      }
      this.alive.push(a); sx += a.x; sy += a.y;
      if (a.type === 'H') { this.hdAlive.push(a); hx += a.x; hy += a.y; } else if (!a.pinned) this.seafAlive.push(a);   // pinned SEAF are not the player's (yet)
    }
    if (this.hdAlive.length) { this.hx = hx / this.hdAlive.length; this.hy = hy / this.hdAlive.length; this.cx = this.hx; this.cy = this.hy; }
    else if (this.alive.length) { this.cx = sx / this.alive.length; this.cy = sy / this.alive.length; }
  }
  countAlly(type) { let n = 0; for (const a of this.allies) if (!a.dead && a.type === type && !a.pinned) n++; return n; }
  // An objective being worked makes noise the enemy hears from far off.
  siteNoise(x, y) { noise(this, x, y, C.noise.site); }

  // Every enemy's visibility at once (the same answer as visLevel for each, but swept from the few who see rather than checked
  // from the many who are seen): UAV circles and relays first, then each ally's sight and the player's vision past it, then a
  // manned lookout's spotting ring (only inside the strike zone).
  _visAll() {
    const G = this.eGrid;
    const two = (e) => { e.vis = 2; };
    for (const u of this.uavs) G.near(u.x, u.y, u.r, two);
    for (const u of this.relays) G.near(u.x, u.y, u.r, two);
    for (const a of this.alive) {
      const s2 = a.sight * a.sight;
      G.near(a.x, a.y, a.vision, (e, d2) => { if (d2 <= s2) e.vis = 2; else if (e.vis < 1) e.vis = 1; });
    }
    // a lookout spots for the fire support: anything in its long ring and inside the strike zone shows on the map
    // (0.47) down the lookout's cone, past what anyone sees: the strike zone no longer reaches past sight (the vision ladder), so
    // the spotting is no longer held to it; what it shows there is seen, not yet in reach
    for (const u of this.spotters) G.near(u.x, u.y, u.r, (e) => { if (e.vis < 1 && inCone(u, e.x, e.y)) { e.vis = 1; e.spotted = true; } });
  }
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
    const st = SUBTYPES[e.kind], rw = e.sub ? C.special.reward : 1;
    this.stats.kills[e.kind]++;
    if (e.sub) this.stats.specials = (this.stats.specials || 0) + 1;
    if (by === 'player') {
      const s = C.score, c = this.combo;
      if (this.t - c.last > s.comboResetSec) c.mult = 1;
      else if (this.t - c.last <= s.comboWindowSec) c.mult = Math.min(s.comboMax, c.mult + s.comboStep);
      c.last = this.t;
      this.sc.kills += Math.round(st.pts * rw * c.mult);
      this.stats.killsPlayer++;
    } else {
      this.sc.allyKills += Math.floor(st.pts * rw * C.score.allyKillShare);
      this.stats.killsAlly++;
    }
    this.earn('kills', C.credits.kill[e.kind] * rw, e.x, e.y);
    this.emit('kill', { x: e.x, y: e.y, kind: e.kind, by, sub: e.sub || '', id: e.id, face: e.face || 0, r: e.r, boss: !!e.boss });
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
    this.emit('ally_down', { x: a.x, y: a.y, type: a.type, unit: a.type, by, id: a.id, face: a.face || 0, role: a.role, team: a.team });
  }
  destroyAsset(s, why) { destroyAsset(this, s, why); }
  mechDown(a) { mechDown(this, a); }
  // (fx, fy): where the hit came from, when it came along the ground (a shot); none for a blast from above.
  damageBase(b, dmg, by = 'player', fx, fy, at) {
    if (b.destroyed || dmg <= 0) return;
    if (b.dome && domeBlocks(this, b, fx, fy)) return;          // a shield dome stops anything from outside it (ops.js)
    if (!b.alert) alertBase(this, b, 'hit');      // a hit on the structure wakes the base
    if (b.bombOnly) { b.lastHit = this.t; return; }             // the citadel's keep: only a Hellbomb brings it down
    // (0.49) a cluster: the spawners the blast reaches, or the one nearest the shot, take it
    if (b.spawners) {
      const hp0 = b.hp;
      hitSpawners(this, b, dmg, at || (fx !== undefined ? { x: fx, y: fy } : null));
      b.lastHit = this.t;
      if (by in this.stats.dmg) this.stats.dmg[by] += Math.max(0, hp0 - b.hp);
      if (!liveSpawners(b).length) this.destroyBase(b);
      return;
    }
    const dealt = Math.min(dmg, b.hp);
    b.hp -= dmg; b.lastHit = this.t;
    if (by in this.stats.dmg) this.stats.dmg[by] += dealt;
    if (b.hp <= 0) this.destroyBase(b);
  }
  destroyBase(b) {
    b.destroyed = true; b.hp = 0;
    if (b.spawners) for (const s of b.spawners) { s.dead = true; s.hp = 0; }
    if (!b.fortress && !b.part && !b.op) this.stats.bases++;     // (the citadel and its bases, and an operation's structures, are the objective)
    // The citadel pays out as the objective; ordinary bases are score and credits. Once the objective is done they are bonus.
    if (!b.fortress) { this.sc.bases += C.score.base; this.earn('bases', C.credits.base, b.x, b.y); }
    this.pressure = Math.max(C.pressure.floor, this.pressure * C.pressure.onBaseKill);
    // (0.48) the felt win: the base's call for help ends (the spike clears), but the enemy's alert ratchets up a notch
    alertClear(this, 'base'); alertRaise(this, b.part ? C.alert.part : 1, 'base');
    for (const e of this.enemies) if (e.g.base === b) e.g.garrison = false; // survivors stop being garrison
    this.emit('base_down', { x: b.x, y: b.y, fortress: !!b.fortress });
    if (b.part) {
      const o = this.objectives.find((x) => x.type === 'fortress'), n = o ? o.parts.filter((x) => !x.destroyed).length : 0;
      if (n) this.notice(tr('n.partDown', { n }), 'good');
    } else if (b.op) {
      this.notice(tr(b.node ? 'n.nodeDown' : b.cannon ? 'n.cannonDown' : 'n.opBaseDown'), 'good');
    } else if (!b.fortress) {
      const left = this.bases.filter((x) => !x.destroyed && !x.fortress && !x.part && !x.op).length;
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
    // (0.40) the whole squad is down: they come in together, a good way off from where they fell (C.wipe.d), on the quietest side
    // (fewest enemies round the spot, farthest from those round where they fell), well inside the map, so the fresh Helldivers
    // are not dropped straight back into what killed them. The spot is picked once for the whole squad; the pods land round it.
    const W = C.wipe, t = this.t;
    if (!this._wipeAt || this._wipeAt.t !== t) {
      const L = this.teams.map((q) => q.lastDeath).filter(Boolean), s = L.length ? { x: L.reduce((a, q) => a + q.x, 0) / L.length, y: L.reduce((a, q) => a + q.y, 0) / L.length } : this.lz;
      let ex = 0, ey = 0, en = 0; this.eGrid.near(s.x, s.y, 120, (e) => { ex += e.x; ey += e.y; en++; });
      const foe = en ? { x: ex / en, y: ey / en } : s, AR = this.ao.R || this.ao.size / 2;
      let best = null, bs = -Infinity;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + rng.range(-0.15, 0.15), d = rng.range(W.d[0], W.d[1]);
        const c = aoClamp(this.ao, s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, W.edge), x = c.x, y = c.y;
        if (!this.terrain.isLand(x, y) || this.terrain.blocked(x, y)) continue;
        let n = 0; this.eGrid.near(x, y, W.quietR, (e) => { n += e.kind === 'H' ? 4 : e.kind === 'M' ? 2 : 1; });
        for (const b of this.bases) if (!b.destroyed && Math.hypot(b.x - x, b.y - y) < detectR(b)) n += 6;     // (not inside a base's detection ring)
        const gap = AR - Math.hypot(x - this.ao.cx, y - this.ao.cy);
        const sc = -n * 12 + Math.hypot(x - foe.x, y - foe.y) * 0.25 + Math.min(Math.hypot(x - s.x, y - s.y), W.d[1]) * 0.1 - Math.max(0, 110 - gap) * 1.2;
        if (sc > bs) { bs = sc; best = { x, y }; }
      }
      this._wipeAt = { t, ...(best || aoClamp(this.ao, s.x, s.y, W.edge)), k: 0 };
      this.stats.wipeDrops = (this.stats.wipeDrops || 0) + 1;
    }
    const w = this._wipeAt, a = (w.k++ / 4) * Math.PI * 2 + 0.4;
    const c = aoClamp(this.ao, w.x + Math.cos(a) * W.spread, w.y + Math.sin(a) * W.spread, W.edge);
    return this.terrain.isLand(c.x, c.y) ? c : { x: w.x, y: w.y };
  }
  _reinforce() {
    if (this.over) return;
    const t = this.t, hd = this.hd, H = C.helldivers;
    if (boardingNow(this)) return;    // nobody drops in while the pelican is loading
    if (!this.hdAlive.length) {
      if (!this.wiped && !this.pods.some((p) => p.type === 'H' && p.start)) {
        this.wiped = true;
        if (hd.lives > 0) { this.stats.wipes++; this.sc.wipes += C.score.wipe; this.radio(COMMS.hdWipe, 'hdWipe', 0); }
        noteWipe(this);       // (0.40) a side task they were wiped at is left alone for a while
      }
    } else this.wiped = false;
    // (0.26) a reinforcement brings every dead Helldiver down together: once one is due, the others who are down come with him
    const dead = (tm) => !(tm.hd && !tm.hd.dead) && !tm.pod;
    const due = this.teams.some((tm) => dead(tm) && t >= tm.respawnAt);
    for (const tm of this.teams) {
      if (!due || !dead(tm) || hd.lives <= 0) continue;
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
    // (0.39) the destroyer leaves orbit (the Helldivers away, or the time up): SEAF still on the ground are left behind, lost like
    // any other (and replaced at a cost); those taken up by a pickup are safe aboard
    const aboardS = this.seaf.reserve.length;
    if (!this.ls && (outcome === 'victory' || outcome === 'timeout')) {
      const left = this.seafAlive.filter((a) => !a.dead).length;
      if (left) { this.stats.lostS = (this.stats.lostS || 0) + left; this.stats.leftS = left; this.notice(tr('n.leftBehind', { n: left }), 'bad'); this.emit('seaf_left', { n: left }); }
    }
    if (outcome === 'victory' || outcome === 'timeout' || outcome === 'complete') {
      const ex = this.extraction, groundS = !this.ls && (outcome === 'victory' || outcome === 'timeout') ? 0 : this.countAlly('S');
      this.sc.survivor = (this.countAlly('H') + (ex.boardedH || 0)) * s.survivorHelldiver + (groundS + aboardS + (ex.boardedS || 0)) * s.survivorSeaf;
    }
    // every SEAF trooper lost is replaced for the next mission, each one dearer than the last
    const lost = this.stats.lostS || 0, L = C.seaf;
    const rep = Math.round(lost * L.lifeCost + (L.lifeStep * lost * (lost - 1)) / 2), paid = Math.min(rep, Math.max(0, this.wallet.bal));
    this.wallet.bal -= paid; this.cr.seafLives = paid;
    if (paid) this.notice(tr('n.seafLives', { n: lost, cr: paid }), 'warn');
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
      score: Math.max(0, Math.round(raw)), raw: Math.round(raw), breakdown: { ...sc }, base: Math.round(this._baseScore()), difficulty: this.difficulty, reward: this.reward, opBonus: this.opBonus, bump: this.bump, bumpPay: this.bumpPay,
      kills: this.stats.killsPlayer + this.stats.killsAlly, stats: { ...this.stats }, bossName: this.boss ? this.boss.name : null,
      bases: this.stats.bases, baseTotal: this.baseTotal, pois: this.stats.pois, poiTotal: this.pois.length, breaches: this.stats.breaches, sides: (this.sides || []).filter((q) => q.done).length, sideTotal: (this.sides || []).length, fullClear: !!(this.plan && this.plan.full),
      livesLeft: this.hd.lives, livesMax: this.hd.max, survivorsH: this.countAlly('H') + (this.extraction.boardedH || 0), survivorsS: (this.stats.leftS !== undefined || ((this.outcome === 'victory' || this.outcome === 'timeout') && !this.ls) ? 0 : this.countAlly('S')) + this.seaf.reserve.length + (this.extraction.boardedS || 0), leftS: this.stats.leftS || 0,
      civSaved: this.stats.civSaved || 0, civLost: this.stats.civLost || 0,
      lastStand: this.ls ? { lifted: this.ls.lifted, held: Math.round(this.ls.holdT), fallen: this.ls.fallen, pop: this.ls.pop } : null,
      objectives: this.objectives.map((o) => ({ type: o.type, done: o.done })), objDone: this.objDone, extracted: this.extracted,
      share: { player: d.player / tot, squad: d.squad / tot, strat: d.strat / tot },
      loadout: this.loadout.slice(), orbitals: loadoutIds(this.kit),
      credits: { kills: cr.kills, bases: cr.bases, pois: cr.pois, breaches: cr.breaches, objective: cr.objective, extraction: cr.extraction, drops: cr.drops, civ: cr.civ, boss: cr.boss, sides: cr.sides,
        total: cr.total, spent: this.wallet.spent - cr.spent0, start: cr.start, balance: this.wallet.bal, seafLives: cr.seafLives || 0, seafLost: this.stats.lostS || 0 },
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
    // (allies keep to the square: a way round water can cut through a corner of it, outside the round area; 0.40: holding them to
    // the circle there left squads stuck against its edge, so a Helldiver pulling back is kept off the edge instead: helldiver.js)
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
    for (const e of this.enemies) if (!e.dead) { this.eGrid.insert(e); e.vis = 0; e.spotted = false; }
    this._visAll();
    for (const a of this.alive) if (!a.mounted && !a.inside && !a.down) this.aGrid.insert(a);     // (0.26: nor the downed, lying low)     // (the crew inside a building are out of reach: posts.js)
    for (const s of this.assets) if (!s.dead && s.kind !== 'mines') this.tGrid.insert(s);

    buildDanger(this);
    updatePosts(this, dt);
    updateSam(this);
    updatePlayer(this, dt);
    if (this.bridgeQ.length) this._bridges();
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
    updateAlert(this, dt);
    updatePatrols(this, dt);
    updateReinf(this, dt);
    updateCivs(this, dt);
    updateExtract(this, dt);
    if (this.ls) updateLastStand(this, dt);
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
    if (this.dirtyA) { compact(this.allies, deadE); this.dirtyA = false; this._refreshAlive(); }     // (0.31: and who is alive, so the dead see nothing between ticks)

    // A mission is won outright by extracting (extract.js). If the squad is gone for good (the last Helldiver down with no lives
    // left; SEAF cannot finish the job for them) or the clock runs out, what counts is the primary objective: done, and the
    // mission is complete without extraction and the session goes on; not done, and the mission has failed.
    if (!this.over) {
      const hdAlive = this.allies.some((a) => !a.dead && a.type === 'H');
      if (this.ls) { /* the last stand ends only when Mars is glassed (laststand.js) */ }
      else if (!hdAlive && this.pendingPods('H') === 0 && this.hd.lives <= 0) this.finish(this.objDone ? 'complete' : 'defeat');
      else if (this.t >= this.limitSec) this.finish(this.objDone ? 'complete' : 'timeout');
    }
  }
}
