// One mission = one game loop on one map. DOM-free and deterministic for a given seed.
// The player runs the destroyer: a UAV scan, orbital stratagems from the armory, and SEAF pods and orders.
// The four Helldivers (one per stratagem group) fight on their own and are reinforced automatically from a pool of lives.
import { CONFIG as C } from '../config.js';
import { RNG } from '../util/rng.js';
import { Grid } from '../util/grid.js';
import { FACTIONS, SUBTYPES, ALLY, BIOMES, NUKE, COMMS } from '../data/data.js';
import { rollLoadout } from '../data/strat.js';
import { newKit, newWallet, seafStats, maxLives, zoneExtra, buy, loadoutIds } from '../data/kit.js';
import { seafName } from '../data/names.js';
import { updateSquad, setSeafOrder } from './squad.js';
import { updateEnemies, updateAllies } from './enemies.js';
import { updateDirector, startGroups } from './director.js';
import { initPlayer, updatePlayer, syncSlots } from './player.js';
import { initStrat, updateStrat, destroyAsset, mechDown } from './strat.js';
import { setupObjectives, updateObjectives, completeObjective } from './objectives.js';
import { setupPois, updatePois, damagePoi, damageBreach } from './pois.js';
import { updateChatter } from './chatter.js';

const SIZE = C.world.size;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ORDER_KINDS = ['auto', 'move', 'protect', 'attack', 'escort'];
const ORDER_RADIO = { auto: 'seafAuto', move: 'seafMove', protect: 'seafProtect', attack: 'seafAttack', escort: 'seafEscort' };
// What killed an ally, by faction and size, for the death report.
const KIND_NAME = {
  bugs:   { L: 'SWARMER', M: 'BRUISER', H: 'CHARGER' },
  bots:   { L: 'TROOPER', M: 'RAIDER', H: 'TANK' },
  squids: { L: 'DRONE', M: 'WARRIOR', H: 'HARVESTER' },
};

function placePoints(rng, n, minSpacing, avoids, margin) {
  const pts = [];
  let spacing = minSpacing;
  for (let i = 0; i < n; i++) {
    let placed = false;
    for (let tries = 1; tries <= 900 && !placed; tries++) {
      if (tries % 150 === 0) spacing *= 0.88; // relax if the map is crowded
      const x = rng.range(margin, SIZE - margin), y = rng.range(margin, SIZE - margin);
      if (avoids.every((a) => Math.hypot(x - a.x, y - a.y) >= a.r) &&
          pts.every((p) => Math.hypot(x - p.x, y - p.y) >= spacing)) {
        pts.push({ x, y }); placed = true;
      }
    }
    if (!placed) pts.push({ x: rng.range(margin, SIZE - margin), y: rng.range(margin, SIZE - margin) });
  }
  return pts;
}

export class Mission {
  constructor(opts) {
    this.seed = opts.seed >>> 0;
    this.rng = new RNG(this.seed);
    this.crng = new RNG((this.seed ^ 0x5bd1e995) >>> 0);   // cosmetic randomness (names, chatter), never touches the sim
    this.faction = FACTIONS[opts.faction];
    this.biome = BIOMES[opts.biome];
    this.S = opts.sessionMinutes || 0; // session minutes played before this mission
    this.emitOn = opts.events !== false;
    this.events = [];
    this.radioAt = {};
    this.t = 0;
    // objective -> bonus (objective done, bases are extra points) -> extract -> over
    this.phase = 'objective';
    this.outcome = null;  // victory | defeat | timeout | retired
    this.over = false;
    this.objDone = false; this.extracted = false; this.bonusEnd = 0;
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
    this.sc = { kills: 0, allyKills: 0, bases: 0, pois: 0, breaches: 0, objective: 0, timeBonus: 0, extraction: 0, lives: 0, survivor: 0, ff: 0, deaths: 0, wipes: 0 };
    // Credits earned this mission. They go straight into the wallet so the armory can spend them mid-mission.
    this.cr = { kills: 0, bases: 0, pois: 0, breaches: 0, objective: 0, extraction: 0, total: 0, start: this.wallet.bal, spent0: this.wallet.spent };
    this.combo = { mult: 1, last: -99 };
    this.deaths = [];     // the death report: every Helldiver and SEAF who fell, in order

    this.enemies = []; this.groups = []; this.allies = []; this.alive = []; this.hdAlive = []; this.seafAlive = [];
    this.shells = []; this.beams = []; this.markers = []; this.pods = []; this.incoming = []; this.uavs = [];
    this.assets = []; this.zones = [];
    this.pois = []; this.breaches = [];
    this.eGrid = new Grid(SIZE, 40); this.aGrid = new Grid(SIZE, 40); this.tGrid = new Grid(SIZE, 40);
    this.cx = 0; this.cy = 0; // centroid of the Helldivers (or of everyone if none are alive)
    this.hx = 0; this.hy = 0;
    this.dirtyE = false; this.dirtyA = false;
    this.pressure = Math.max(C.pressure.floor, C.pressure.start + C.pressure.perSessionMin * this.S);
    this.hpMul = Math.min(C.ramp.hpCap, 1 + C.ramp.hp * this.S); // enemy toughness and damage grow with session time
    this.dmgMul = Math.min(C.ramp.dmgCap, 1 + C.ramp.dmg * this.S);
    this.bag = [];
    this.hd = { lives: maxLives(this.kit), max: maxLives(this.kit) };
    this.wiped = false;
    this.seaf = { readyAt: 0, order: { kind: 'auto', x: 0, y: 0, until: 0 }, tgt: null, tgtT: 0, clearT: 0, skip: new Map(), stand: null, followUntil: 0 };
    this.support = { enemyReadyAt: 0, spawnT: 0, lastSpawn: -99, scanT: 0, near: 0 };
    this.chat = { t: 0, hd: 0, seaf: 0, moveAt: -99, heavyAt: -99, seafAt: -99, wasEngaged: false, lastState: '' };
    this.noticeAt = { seaf: -99 };
    this.nuke = null;

    this._setup(opts);
  }

  _setup(opts) {
    const rng = this.rng;
    // Landing zone near a random map edge.
    const side = rng.int(4), along = rng.range(300, SIZE - 300), inset = 140;
    this.lz = side === 0 ? { x: along, y: inset } : side === 1 ? { x: SIZE - inset, y: along }
      : side === 2 ? { x: along, y: SIZE - inset } : { x: inset, y: along };
    this.cx = this.hx = this.lz.x; this.cy = this.hy = this.lz.y;

    // Bases: 3 + floor(S / 4) up to 20, fixed for the whole mission. All of them are visible from orbit.
    const nBases = Math.min(C.bases.max, C.bases.min + Math.floor(this.S / C.bases.minutesPerExtra));
    const lzAvoid = { x: this.lz.x, y: this.lz.y, r: C.bases.lzClearance };
    this.bases = placePoints(rng, nBases, C.bases.spacing, [lzAvoid], 100).map((p) => ({
      id: this.nextId++, x: p.x, y: p.y, hp: C.bases.hp, maxHp: C.bases.hp, destroyed: false, r: C.bases.radius,
      garrisoned: false, nextSpawn: 0, lastHit: -99,
    }));
    this.baseTotal = nBases;
    this.limitSec = C.world.missionSec + C.world.extraSecPerBase * (nBases - C.bases.min);

    // Objectives (may add the citadel to the base list).
    setupObjectives(this, opts.objectives);

    // Hidden extraction point.
    const exAvoid = [{ x: this.lz.x, y: this.lz.y, r: C.extract.minFromLz }, ...this.bases.map((b) => ({ x: b.x, y: b.y, r: C.extract.minFromBase }))];
    const ex = placePoints(rng, 1, 0, exAvoid, 100)[0];
    this.extraction = { x: ex.x, y: ex.y, revealed: false, holdT: 0, nextWave: Infinity };

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

    // Starting enemy groups sit just outside the Helldivers' sight.
    startGroups(this);
  }

  // ----- public input API -----
  setAim(x, y) { this.player.aimX = clamp(x, 0, SIZE); this.player.aimY = clamp(y, 0, SIZE); }
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
  pendingPods(type) { let n = 0; for (const p of this.pods) if (p.type === type) n += p.n; return n; }

  // Call a SEAF drop. It has to land inside the strike zone.
  callSeaf(x, y) {
    const t = this.t, sf = this.seaf, st = seafStats(this.kit);
    if (this.over) return { ok: false, reason: 'over' };
    if (!this.alive.length) return this._deny('noallies');
    if (!this.inZone(x, y, -5)) return this._deny('nocoverage', COMMS.noCoverage);
    const room = st.max - this.countAlly('S') - this.pendingPods('S');
    if (room <= 0) return this._deny('full');
    if (t < sf.readyAt) return this._deny('cooldown');
    sf.readyAt = t + st.cool;
    const n = Math.min(st.drop, room);
    this.pods.push({ type: 'S', n, landAt: t + C.seaf.dropDelaySec, x, y });
    this.stats.seafCalls++;
    this.radio(COMMS.seafDrop, 'seafDrop', 0);
    this.emit('pod_call', { type: 'S', x, y, n });
    return { ok: true, n };
  }

  // Give every SEAF trooper the same order: auto (clear the nearest objective), move, protect, attack or escort.
  seafOrder(kind, x = this.cx, y = this.cy) {
    if (this.over) return { ok: false, reason: 'over' };
    if (!ORDER_KINDS.includes(kind)) return { ok: false, reason: 'kind' };
    if (!this.seafAlive.length) return this._deny('noseaf');
    if (kind === 'escort' && !this.hdAlive.length) return this._deny('nohd');
    x = clamp(x, 20, SIZE - 20); y = clamp(y, 20, SIZE - 20);
    setSeafOrder(this, kind, x, y);
    this.radio(COMMS[ORDER_RADIO[kind]], 'seaf' + kind, 1);
    this.emit('seaf_order', { kind, x, y });
    return { ok: true };
  }

  // ----- the armory: upgrades can be bought mid-mission, new orbitals and slots only between missions -----
  spend(id) {
    const before = maxLives(this.kit), r = buy(this.kit, this.wallet, id, true);
    if (!r.ok) { this.emit('deny', { reason: r.reason }); return r; }
    const after = maxLives(this.kit);
    this.hd.lives += after - before; this.hd.max = after;
    syncSlots(this);
    const st = seafStats(this.kit);
    for (const a of this.seafAlive) {
      const nm = Math.round(ALLY.S.hp * st.hpMul);
      a.hp = Math.min(nm, a.hp + (nm - a.maxHp)); a.maxHp = nm; a.dmgMul = st.dmgMul;
    }
    this.emit('bought', { id });
    this.notice(`PURCHASED  ${r.item.name.toUpperCase()}`, 'good');
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
  retire() { this.finish(this.objDone ? 'victory' : 'retired'); }

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
    this.emit('radio', { text });
  }
  // A line on the notice feed: tone is 'good', 'warn', 'bad' or 'info'.
  notice(text, tone = 'info') { this.emit('notice', { text, tone }); }
  // What an ally is called on screen: a typed Helldiver name, the deployment code (B4), or a SEAF rank and surname.
  tag(a) { return a ? (a.name || a.code || '?') : '?'; }
  shipOf(i) { const t = this.teams[i]; return t ? t.ship : ''; }
  slotTag(team) { return this.names.hd[team.i] || `${team.letter}${team.n + 1}`; }

  earn(kind, amt, x, y) {
    if (!(amt > 0)) return;
    const cr = this.cr, w = this.wallet;
    cr[kind] = (cr[kind] || 0) + amt; cr.total += amt;
    w.bal += amt; w.earned += amt;
    if (amt >= 10 && x !== undefined) this.emit('credit', { x, y, amt, kind });
  }
  damagePoi(p, dmg, by) { damagePoi(this, p, dmg, by); }
  damageBreach(b, dmg, by) { damageBreach(this, b, dmg, by); }

  addAlly(type, x, y, o = {}) {
    const rng = this.rng, [ox, oy] = rng.inDisc(C.squad.clusterRadius), [jx, jy] = rng.inDisc(6), [fx, fy] = rng.inDisc(C.seaf.followSpread);
    const base = ALLY[type];
    const a = {
      id: this.nextId++, type, x: x + jx, y: y + jy, ox, oy, fx, fy, hp: base.hp, maxHp: base.hp, dead: false, atk: rng.next(),
      r: base.r, sight: 0, vision: 0, zone: 0, home: { x, y }, wx: x, wy: y, wT: 0,
      hurtAt: -9, mounted: null, sw: null, mech: null,
      team: -1, code: '', name: '', role: o.role || 'rifle', spT: 2 + rng.next() * 3, engaged: false,
      say: null, sayAt: 0, ping: null, lastSrc: null, dmgMul: 1, armorMul: 1, born: this.t,
    };
    if (type === 'H') {
      let ti = o.team;
      if (ti === undefined || ti < 0) ti = this.teams.findIndex((tm) => !tm.hd || tm.hd.dead);
      if (ti < 0) ti = 0;
      const tm = this.teams[ti];
      tm.n++; tm.hd = a; tm.pod = false;
      a.team = ti; a.code = `${tm.letter}${tm.n}`; a.name = this.names.hd[ti] || '';
    } else {
      const st = seafStats(this.kit);
      a.hp = a.maxHp = Math.round(base.hp * st.hpMul); a.dmgMul = st.dmgMul;
      a.name = seafName(this.crng, a.role);
    }
    a.sight = base.sight * this.biome.ping; a.vision = a.sight + C.sight.playerBonus;
    a.zone = a.vision + C.sight.strikeBonus + zoneExtra(this.kit);
    this.allies.push(a);
    return a;
  }
  drawToken() {
    if (!this.bag.length) {
      const b = C.enemies.bag;
      for (let i = 0; i < b.light; i++) this.bag.push('L');
      const nm = b.medium + Math.floor(this.S / C.ramp.mediumEvery), nh = b.heavy + Math.floor(this.S / C.ramp.heavyEvery);
      for (let i = 0; i < nm; i++) this.bag.push('M');
      for (let i = 0; i < nh; i++) this.bag.push('H');
      this.rng.shuffle(this.bag);
    }
    return this.bag.pop();
  }
  _refreshAlive() {
    this.alive.length = 0; this.hdAlive.length = 0; this.seafAlive.length = 0;
    let sx = 0, sy = 0, hx = 0, hy = 0;
    const zx = C.sight.strikeBonus + zoneExtra(this.kit);
    for (const a of this.allies) {
      if (a.dead) continue;
      a.zone = a.vision + zx;
      this.alive.push(a); sx += a.x; sy += a.y;
      if (a.type === 'H') { this.hdAlive.push(a); hx += a.x; hy += a.y; } else this.seafAlive.push(a);
    }
    if (this.hdAlive.length) { this.hx = hx / this.hdAlive.length; this.hy = hy / this.hdAlive.length; this.cx = this.hx; this.cy = this.hy; }
    else if (this.alive.length) { this.cx = sx / this.alive.length; this.cy = sy / this.alive.length; }
  }
  countAlly(type) { let n = 0; for (const a of this.allies) if (!a.dead && a.type === type) n++; return n; }

  // What the squad can see (2), what only the player can see just beyond that (1), or nothing (0). A UAV circle counts as seen by all.
  visLevel(x, y) {
    for (const u of this.uavs) { const dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy <= u.r * u.r) return 2; }
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
    if (src === 'friendly') return by === 'player' ? 'FRIENDLY FIRE (YOUR STRIKE)' : 'FRIENDLY FIRE';
    const names = KIND_NAME[this.faction.id];
    if (names && names[src]) return `${this.faction.name} ${names[src]}`;
    return 'UNKNOWN';
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
      this.notice(`${this.tag(a)} KIA  ${cause}${tm ? '  ' + tm.ship : ''}`, 'bad');
      if (this.hd.lives <= 0) this.radio(COMMS.noLives, 'nolives', 8);
    } else if (t - this.noticeAt.seaf > 1.2) {
      this.noticeAt.seaf = t;
      this.notice(`${this.tag(a)} KIA  ${cause}`, 'dim');
    }
    this.emit('ally_down', { x: a.x, y: a.y, type: a.type, by });
  }
  destroyAsset(s, why) { destroyAsset(this, s, why); }
  mechDown(a) { mechDown(this, a); }
  damageBase(b, dmg, by = 'player') {
    if (b.destroyed || dmg <= 0) return;
    const dealt = Math.min(dmg, b.hp);
    b.hp -= dmg; b.lastHit = this.t;
    if (by in this.stats.dmg) this.stats.dmg[by] += dealt;
    if (b.hp <= 0) this.destroyBase(b);
  }
  destroyBase(b) {
    b.destroyed = true; b.hp = 0;
    this.stats.bases++;
    // The citadel pays out as the objective; ordinary bases are score and credits. Once the objective is done they are bonus.
    if (!b.fortress) { this.sc.bases += C.score.base; this.earn('bases', C.credits.base, b.x, b.y); }
    this.pressure = Math.max(C.pressure.floor, this.pressure * C.pressure.onBaseKill);
    for (const e of this.enemies) if (e.g.base === b) e.g.garrison = false; // survivors stop being garrison
    this.emit('base_down', { x: b.x, y: b.y, fortress: !!b.fortress });
    if (!b.fortress) {
      const left = this.bases.filter((x) => !x.destroyed && !x.fortress).length;
      this.radio(left === 0 ? COMMS.lastBase : COMMS.baseDown(left, this.baseTotal), 'basedown', 0);
    }
  }

  // The four Helldivers come back by themselves, one pod per missing group, each costing one life.
  _podSpot(tm) {
    const rng = this.rng;
    if (this.hdAlive.length) {
      const h = this.hdAlive[rng.int(this.hdAlive.length)];
      const ang = this.squad.dir + Math.PI + rng.range(-0.9, 0.9), d = rng.range(26, 40);
      return { x: clamp(h.x + Math.cos(ang) * d, 30, SIZE - 30), y: clamp(h.y + Math.sin(ang) * d, 30, SIZE - 30) };
    }
    const s = tm.lastDeath || this.lz;
    return { x: clamp(s.x, 30, SIZE - 30), y: clamp(s.y, 30, SIZE - 30) };
  }
  _reinforce() {
    if (this.over) return;
    const t = this.t, hd = this.hd, H = C.helldivers;
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
      this.notice(`${this.slotTag(tm)} CALLED IN  ${tm.ship}   LIVES ${hd.lives}`, 'warn');
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
    if (outcome === 'victory' || outcome === 'timeout') {
      this.sc.survivor = this.countAlly('H') * s.survivorHelldiver + this.countAlly('S') * s.survivorSeaf;
    }
    this.radio(outcome === 'victory' ? COMMS.victory : outcome === 'timeout' ? COMMS.timeout : COMMS.defeat, 'end', 0);
    this.emit('end', { outcome });
  }

  // The running score for the HUD (cheap: no copies).
  liveScore() {
    const sc = this.sc;
    return Math.max(0, Math.round(sc.kills + sc.allyKills + sc.bases + sc.pois + sc.breaches + sc.objective + sc.timeBonus + sc.extraction + sc.lives + sc.survivor + sc.ff + sc.deaths + sc.wipes));
  }

  result() {
    const sc = this.sc;
    const raw = sc.kills + sc.allyKills + sc.bases + sc.pois + sc.breaches + sc.objective + sc.timeBonus + sc.extraction + sc.lives + sc.survivor + sc.ff + sc.deaths + sc.wipes;
    const d = this.stats.dmg, tot = d.player + d.squad + d.strat || 1;
    const cr = this.cr;
    return {
      outcome: this.outcome, t: this.t, minutes: this.t / 60,
      score: Math.max(0, Math.round(raw)), raw: Math.round(raw), breakdown: { ...sc },
      kills: this.stats.killsPlayer + this.stats.killsAlly, stats: { ...this.stats },
      bases: this.stats.bases, baseTotal: this.baseTotal, pois: this.stats.pois, poiTotal: this.pois.length, breaches: this.stats.breaches,
      livesLeft: this.hd.lives, survivorsH: this.countAlly('H'), survivorsS: this.countAlly('S'),
      objectives: this.objectives.map((o) => ({ type: o.type, done: o.done })), objDone: this.objDone, extracted: this.extracted,
      share: { player: d.player / tot, squad: d.squad / tot, strat: d.strat / tot },
      loadout: this.loadout.slice(), orbitals: loadoutIds(this.kit),
      credits: { kills: cr.kills, bases: cr.bases, pois: cr.pois, breaches: cr.breaches, objective: cr.objective, extraction: cr.extraction,
        total: cr.total, spent: this.wallet.spent - cr.spent0, start: cr.start, balance: this.wallet.bal },
      deaths: this.deaths.map((x) => ({ ...x })),
      teams: this.teams.map((tm) => ({ letter: tm.letter, ship: tm.ship, deaths: tm.deaths, ids: tm.ids.slice() })),
    };
  }

  // ----- one fixed step -----
  step(dt) {
    if (this.over) return;
    this.t += dt;
    this._refreshAlive();
    this.eGrid.clear(); this.aGrid.clear(); this.tGrid.clear();
    for (const e of this.enemies) if (!e.dead) { this.eGrid.insert(e); e.vis = this.visLevel(e.x, e.y); }
    for (const a of this.alive) if (!a.mounted) this.aGrid.insert(a);
    for (const s of this.assets) if (!s.dead && s.kind !== 'mines') this.tGrid.insert(s);

    updatePlayer(this, dt);
    updateSquad(this, dt);
    updateAllies(this, dt);
    updateEnemies(this, dt);
    updateStrat(this, dt);
    updatePois(this, dt);
    updateObjectives(this, dt);
    updateDirector(this, dt);
    updateChatter(this, dt);
    this._reinforce();

    if (this.dirtyE) {
      this.enemies = this.enemies.filter((e) => !e.dead);
      for (const g of this.groups) g.members = g.members.filter((e) => !e.dead);
      this.groups = this.groups.filter((g) => g.members.length);
      this.dirtyE = false;
    }
    if (this.dirtyA) { this.allies = this.allies.filter((a) => !a.dead); this.dirtyA = false; }

    // The mission only ends by failure (or by being banked and extracted): the clock runs out, or the squad is gone for good.
    if (!this.over) {
      const hdAlive = this.allies.some((a) => !a.dead && a.type === 'H');
      if (!hdAlive && this.pendingPods('H') === 0 && this.hd.lives <= 0) this.finish(this.objDone ? 'victory' : 'defeat');
      else if (this.t >= this.limitSec) this.finish(this.objDone ? 'victory' : 'timeout');
    }
  }
}
