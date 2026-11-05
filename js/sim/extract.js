// Extraction. Once the objective is done (and the bonus bases are cleared or their time is up) the extraction point goes live:
//   open      the squad heads for it
//   beacon    a Helldiver reached it and threw the blue extraction beacon; it falls for CONFIG.extract.beaconSec
//   called    the beacon is down: the pelican arrives in CONFIG.extract.callSec. The enemy always answers: a first wave the moment
//             the beacon lands (drop ships, or bugs breaching), then more every so often. Nobody has to clear the map to leave.
// (The pad is on the map from the drop, locked until the objective is done, so SEAF can dig in round it early.)
//   landing   the pelican comes down on the pad
//   boarding  every Helldiver runs for the ramp and boards
//   away      the pelican climbs out; (0.39) the destroyer leaves orbit CONFIG.extract.orbitSec later and the mission ends. SEAF
//             go home only by a pickup (seaf.js): anyone still on the ground then is left behind. The extraction pelican's belly
//             autocannon fires on the way down and while it waits.
import { t as tr } from '../i18n.js';
import { bossAlive } from './boss.js';
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { callReinforcements, reinfCount } from './reinforce.js';
import { bark } from './chatter.js';
import { pelicanGun } from './seaf.js';

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
    m.notice(tr(ex.boardedH > 1 ? 'n.aboardN' : 'n.aboard1', { who: m.tag(a), n: ex.boardedH }), 'good');
  } else ex.boardedS++;
  m.emit('board', { x: a.x, y: a.y, type: a.type });
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
      // the blue beacon: thrown, it falls to the pad; the pelican is called when it lands
      ex.state = 'beacon'; ex.beaconAt = t; ex.beaconDown = t + X.beaconSec; ex.wait = X.callSec;
      m.emit('extract_beacon', { x: ex.x, y: ex.y });
      bark(m, a, 'extract', '', true);
      break;
    }
    return;
  }
  if (ex.state === 'beacon') {
    if (t < ex.beaconDown) return;
    const wait = X.callSec;
    ex.state = 'called'; ex.landAt = t + wait; ex.wait = wait;
    ex.waveAt = t + C.reinf.extractEvery / Math.max(0.8, Math.min(1.5, m.pressure));
    m.radio(COMMS.extractCalled(wait), 'excall', 0);
    m.notice(tr('n.exCalled', { n: wait }), 'warn');
    if (m.seafAlive.length && !m.ls) { m.notice(tr('n.exSeaf'), 'warn'); m.radio(COMMS.exSeaf, 'exseaf', 0); }     // (0.39) get the SEAF picked up
    m.emit('extract_call', { x: ex.x, y: ex.y });
    ex.calledAt = t;
    callReinforcements(m, ex.x, ex.y, 'extract', { dist: [55, 105], extra: 1, count: reinfCount(m, 'extract', { first: true }) });      // the enemy always comes for an extraction (0.31: from more than one side)
    return;
  }
  if (ex.state === 'called') {
    if (t >= ex.waveAt) {
      ex.waveAt = t + C.reinf.extractEvery / Math.max(0.8, Math.min(1.5, m.pressure));
      callReinforcements(m, ex.x, ex.y, 'extract', { dist: [55, 105], count: reinfCount(m, 'extract', { since: t - (ex.calledAt ?? t) }) });     // (0.31: more places at once the longer it takes)
    }
    if (t >= ex.landAt) {
      ex.state = 'landing'; ex.touchAt = t + X.landSec;
      m.radio(COMMS.pelicanLanding, 'exland', 0);
      m.emit('extract_landing', { x: ex.x, y: ex.y });
    }
    return;
  }
  // (0.39) the extraction pelican's autocannon, on the way down and on the pad
  if (ex.state === 'landing' || ex.state === 'boarding') pelicanGun(m, ex.gun || (ex.gun = { id: -7, x: ex.x, y: ex.y, gunT: 0.4 }), dt);
  if (ex.state === 'landing') {
    if (t >= ex.touchAt) {
      ex.state = 'boarding'; ex.leaveBy = t + X.boardSec;
      m.radio(COMMS.board, 'exboard', 0);
      m.notice(tr('msg.exDown'), 'good');
      m.emit('extract_down', { x: ex.x, y: ex.y });
    }
    return;
  }
  if (ex.state === 'boarding') {
    for (const a of m.hdAlive) if (!a.mounted && !a.dead && (a.x - ex.x) ** 2 + (a.y - ex.y) ** 2 <= X.boardR * X.boardR) board(m, a);
    const waiting = m.hdAlive.filter((a) => !a.dead).length + m.pendingPods('H');
    if ((waiting === 0 && ex.boardedH > 0) || t >= ex.leaveBy || (waiting === 0 && m.hd.lives <= 0)) {
      ex.state = 'away'; ex.awayAt = t; ex.leaveAt = t + X.orbitSec;
      m.radio(ex.boardedH ? COMMS.victory : COMMS.extractEmpty, 'exaway', 0);
      m.emit('extract_away', { x: ex.x, y: ex.y, n: ex.boardedH });
      // (0.39) the destroyer will not wait: SEAF still on the ground have orbitSec to be picked up
      const left = m.seafAlive.filter((a) => !a.dead).length;
      m.notice(tr(left ? 'n.orbitLeaveN' : 'n.orbitLeave', { s: X.orbitSec, n: left }), left ? 'bad' : 'info');
      m.radio(COMMS.orbitLeave(X.orbitSec, left), 'orbitleave', 0);
      m.emit('orbit_leave', { at: ex.leaveAt, n: left });
    }
    return;
  }
  if (ex.state === 'away') {
    // the mission is won only by getting Helldivers out: a pelican that leaves without one is a failed mission
    if (t >= ex.leaveAt) m.finish(ex.boardedH > 0 ? 'victory' : m.objDone ? 'complete' : 'defeat');
  }
}
