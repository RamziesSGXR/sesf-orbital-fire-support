// Extraction. Once the objective is done (and the bonus bases are cleared or their time is up) the extraction point goes live:
//   open      the squad heads for it
//   called    a Helldiver reached it and called the pelican; it arrives in CONFIG.extract.callSec. The squad holds the zone while
//             reinforcements come in waves. Nobody has to clear the map to leave.
//   landing   the pelican comes down on the pad
//   boarding  every Helldiver runs for the ramp and boards; SEAF squads get pelicans of their own wherever they are bunched up
//   away      the pelican climbs out; the mission ends
import { bossAlive } from './boss.js';
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { callReinforcements } from './reinforce.js';
import { bark } from './chatter.js';

const X = C.extract, SIZE = C.world.size;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const boardingNow = (m) => m.phase === 'extract' && (m.extraction.state === 'boarding' || m.extraction.state === 'away');

export function openExtract(m) {
  const ex = m.extraction;
  ex.revealed = true; ex.state = 'open'; ex.boardedH = 0; ex.boardedS = 0;
}

function board(m, a) {
  const ex = m.extraction;
  a.dead = true; a.boarded = true; m.dirtyA = true;
  if (a.type === 'H') {
    ex.boardedH++;
    const tm = m.teams[a.team];
    if (tm && tm.hd === a) { tm.hd = null; tm.boarded = true; }
    m.extracted = true;
    m.notice(`${m.tag(a)} ABOARD  ${ex.boardedH} HELLDIVER${ex.boardedH > 1 ? 'S' : ''} ON THE PELICAN`, 'good');
  } else ex.boardedS++;
  m.emit('board', { x: a.x, y: a.y, type: a.type });
}

// A pelican for every SEAF squad, set down where that squad is bunched up.
function seafShips(m) {
  const tr = m.terrain;
  for (const q of m.seaf.squads) {
    const list = m.seafAlive.filter((a) => a.sq === q.i);
    if (!list.length) continue;
    let x = 0, y = 0;
    for (const a of list) { x += a.x; y += a.y; }
    x /= list.length; y /= list.length;
    if (!tr.isLand(x, y)) { const l = tr.nearestLand(x, y); x = l.x; y = l.y; }
    const ang = m.rng.angle(), dx = Math.cos(ang), dy = Math.sin(ang);
    m.pelicans.push({ id: m.nextId++, evac: true, x: clamp(x - dx * 330, -200, SIZE + 200), y: clamp(y - dy * 330, -200, SIZE + 200), tx: x, ty: y, dx, dy,
      state: 'in', alt: 1, roles: [], dropped: 0, dropT: 0, hoverT: X.seafBoardSec, outT: 0, gunT: 0.4, squad: q.i, born: m.t, vis: 0 });
  }
}

export function updateExtract(m, dt) {
  if (m.phase !== 'extract' || m.over) return;
  const ex = m.extraction, t = m.t;
  if (!ex.state) openExtract(m);

  if (ex.state === 'open') {
    for (const a of m.hdAlive) {
      if (a.mounted || (a.x - ex.x) ** 2 + (a.y - ex.y) ** 2 > X.radius * X.radius) continue;
      if (bossAlive(m)) {               // a super heavy on the field: the pelican will not come in until it is dead
        if (ex.blockedSince === undefined) ex.blockedSince = t;
        if (t >= (ex.blockSaid || 0)) { ex.blockSaid = t + 15; m.radio(COMMS.bossBlock(m.boss.name), 'bossblock', 0); m.emit('boss_block', {}); }
        break;
      }
      const wait = Math.round(Math.min(X.callSec, X.callMin + X.callPerMin * m.S));   // longer waits later in the session
      ex.state = 'called'; ex.landAt = t + wait; ex.waveAt = t + 6; ex.wait = wait;
      m.radio(COMMS.extractCalled(wait), 'excall', 0);
      m.notice(`EXTRACTION CALLED  PELICAN IN ${wait}S  HOLD THE ZONE`, 'warn');
      m.emit('extract_call', { x: ex.x, y: ex.y });
      bark(m, a, 'extract', '', true);
      break;
    }
    return;
  }
  if (ex.state === 'called') {
    if (t >= ex.waveAt) {
      ex.waveAt = t + C.reinf.extractEvery / Math.max(0.8, Math.min(1.5, m.pressure));
      callReinforcements(m, ex.x, ex.y, 'extract', { dist: [55, 105] });
    }
    if (t >= ex.landAt) {
      ex.state = 'landing'; ex.touchAt = t + X.landSec;
      m.radio(COMMS.pelicanLanding, 'exland', 0);
      m.emit('extract_landing', { x: ex.x, y: ex.y });
    }
    return;
  }
  if (ex.state === 'landing') {
    if (t >= ex.touchAt) {
      ex.state = 'boarding'; ex.leaveBy = t + X.boardSec;
      seafShips(m);
      m.radio(COMMS.board, 'exboard', 0);
      m.notice('PELICAN DOWN. EVERYONE ABOARD', 'good');
      m.emit('extract_down', { x: ex.x, y: ex.y });
    }
    return;
  }
  // SEAF board their own pelicans (seaf.js walks them over), for as long as those pelicans wait
  if (ex.state === 'boarding' || ex.state === 'away') {
    for (const p of m.pelicans) {
      if (!p.evac || p.state !== 'hover') continue;
      for (const a of m.seafAlive) if (!a.dead && a.sq === p.squad && (a.x - p.x) ** 2 + (a.y - p.y) ** 2 <= (X.boardR + 2) ** 2) board(m, a);
    }
  }
  if (ex.state === 'boarding') {
    for (const a of m.hdAlive) if (!a.mounted && !a.dead && (a.x - ex.x) ** 2 + (a.y - ex.y) ** 2 <= X.boardR * X.boardR) board(m, a);
    const waiting = m.hdAlive.filter((a) => !a.dead).length + m.pendingPods('H');
    if ((waiting === 0 && ex.boardedH > 0) || t >= ex.leaveBy || (waiting === 0 && m.hd.lives <= 0)) {
      ex.state = 'away'; ex.awayAt = t;
      m.radio(ex.boardedH ? COMMS.victory : COMMS.extractEmpty, 'exaway', 0);
      m.emit('extract_away', { x: ex.x, y: ex.y, n: ex.boardedH });
    }
    return;
  }
  if (ex.state === 'away') {
    const seafLeft = m.pelicans.some((p) => p.evac && p.state !== 'out');
    if (t >= ex.awayAt + 2.5 && (!seafLeft || t >= ex.awayAt + X.seafBoardSec)) m.finish('victory');
  }
}
