// Time of day and the shadows of the four Super Destroyers. Every mission drops at a random hour (m.tod0, in Mission) and the clock
// runs on through the mission, faster than real time. The hour sets where the light comes from (the terrain is lit from there when
// it is built) and how the ground is tinted: warm at dawn and dusk, dark blue at night. By day the shadows of the squad's four
// destroyers drift slowly across the map, high above the fight. Cosmetic only: none of it touches the simulation.
import { t } from '../i18n.js';
const TAU = Math.PI * 2;
export const TOD_RATE = 6;      // hours of the day that pass per hour of play (a fifteen-minute mission spans an hour and a half)

export function todAt(m) { return (((m.tod0 ?? 12) + (m.t / 3600) * TOD_RATE) % 24 + 24) % 24; }
export function todName(h) {
  if (h >= 5 && h < 7.5) return t('tod.dawn');
  if (h >= 7.5 && h < 17) return t('tod.day');
  if (h >= 17 && h < 19.5) return t('tod.dusk');
  return t('tod.night');
}
export const todClock = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

// The sun for an hour: elevation (-1..1, above the horizon when > 0) and where it shines from, as a unit vector on the map (x east,
// y south) plus height. At night the moon lights the ground from the other side, dimly.
export function sunAt(h) {
  const day = (h - 6) / 12;                        // 0 at sunrise, 1 at sunset
  const elev = Math.sin(day * Math.PI);            // < 0 at night
  const az = Math.PI * (1 - day);                  // sunrise in the east (+x), noon in the south, sunset in the west
  const s = elev > 0 ? 1 : -1, lx = Math.cos(az) * s, ly = Math.abs(Math.sin(az)) * 0.6 + 0.2;
  const lz = Math.max(0.35, Math.abs(elev));
  return { elev, lx: -lx, ly: -ly, lz, night: elev < -0.05 };
}

// The tint laid over the ground (multiplied in), and how strong the destroyers' shadows are.
export function skyTint(h) {
  const sun = sunAt(h), e = sun.elev;
  if (e > 0.35) return { col: null, shadow: Math.min(1, (e - 0.1) * 1.4) };
  if (e > 0) {                                     // golden hour
    const k = 1 - e / 0.35;
    return { col: `rgb(${255},${Math.round(232 - 50 * k)},${Math.round(210 - 90 * k)})`, shadow: Math.max(0, (e - 0.06) * 2.5) };
  }
  if (e > -0.22) {                                 // twilight
    const k = -e / 0.22;
    return { col: `rgb(${Math.round(230 - 150 * k)},${Math.round(160 - 60 * k)},${Math.round(140 + 20 * k)})`, shadow: 0 };
  }
  return { col: 'rgb(78,98,150)', shadow: 0 };     // night
}

// The four destroyers, high overhead, in a loose line abreast, crossing the map once every few minutes. Their shadows are long hulls
// with a superstructure and an engine block at the stern.
export function destroyerShadows(m, size) {
  const rngA = ((m.seed >>> 3) % 360) * (Math.PI / 180), ux = Math.cos(rngA), uy = Math.sin(rngA), nx = -uy, ny = ux;
  const span = size * 1.5 + 900, speed = 2.6, cx = size / 2, cy = size / 2;
  const s0 = ((m.seed % 997) / 997) * span;
  const along = ((s0 + m.t * speed) % span) - span / 2;
  const out = [];
  for (let i = 0; i < 4; i++) {
    const back = (i % 2) * 140 + i * 25, side = (i - 1.5) * 170;
    out.push({ x: cx + ux * (along - back) + nx * side, y: cy + uy * (along - back) + ny * side, ang: rngA, len: 230 + (i % 3) * 15 });
  }
  return out;
}

export function drawDestroyerShadow(ctx, d, alpha) {
  const L = d.len, W = L * 0.24;
  ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.ang);
  for (const [k, a] of [[1.06, 0.35], [1, 1]]) {
    ctx.fillStyle = `rgba(0,0,0,${alpha * a})`;
    ctx.beginPath();
    ctx.moveTo(L * 0.5 * k, 0);
    ctx.lineTo(L * 0.18 * k, -W * 0.5 * k); ctx.lineTo(-L * 0.42 * k, -W * 0.46 * k); ctx.lineTo(-L * 0.5 * k, -W * 0.3 * k);
    ctx.lineTo(-L * 0.5 * k, W * 0.3 * k); ctx.lineTo(-L * 0.42 * k, W * 0.46 * k); ctx.lineTo(L * 0.18 * k, W * 0.5 * k);
    ctx.closePath(); ctx.fill();
  }
  // superstructure and the engine block read as darker patches
  ctx.fillStyle = `rgba(0,0,0,${alpha * 0.45})`;
  ctx.fillRect(-L * 0.12, -W * 0.18, L * 0.22, W * 0.36);
  ctx.fillRect(-L * 0.5, -W * 0.28, L * 0.1, W * 0.56);
  ctx.restore();
}
void TAU;
