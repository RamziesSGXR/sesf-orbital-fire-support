// (0.61.5) What the player is doing, for the map's drawing: less is drawn while a building or a drop is being placed (the zones
// that have nothing to do with it go, so the ghost and the ground can be seen). Set by the renderer once a frame.
export const VIEW = { quiet: false, squad: false, loud: false };
// (0.62.24) Dashed lines on the map are drawn quieter. Most of them are standing information (the edge of the area, a pickup
// point's ring, an objective's ring, a post's reach), and with a dozen on screen they shouted over the fight. Every stroke
// made with a dash set is drawn at `C.rings.dash` of its strength, except: while VIEW.loud is set (something being placed,
// a squad's orders being shown: the lines are what the player is looking at), and anything red (a warning must stay loud).
// Done once per canvas by wrapping its stroke and setLineDash, so every dashed ring in every file follows without being touched.
export function quietDashes(ctx, k) {
  if (!ctx._qd) {
    const stroke = ctx.stroke.bind(ctx), dash = ctx.setLineDash.bind(ctx);
    ctx._qd = { k: 1, on: false };
    ctx.setLineDash = (a) => { ctx._qd.on = !!(a && a.length); dash(a); };
    ctx.stroke = (...a) => {
      const q = ctx._qd;
      if (!q.on || q.k >= 1 || VIEW.loud || isWarn(ctx.strokeStyle)) return stroke(...a);
      const g = ctx.globalAlpha; ctx.globalAlpha = g * q.k; stroke(...a); ctx.globalAlpha = g;
    };
  }
  ctx._qd.k = k;
}
// a red line: '#ff4a4a', 'rgba(255, 70, 50, 0.8)'
const WARN = new Map();
function isWarn(s) {
  if (typeof s !== 'string') return false;
  let v = WARN.get(s);
  if (v === undefined) {
    let r = 0, g = 255, b = 255;
    if (s[0] === '#' && s.length >= 7) { r = parseInt(s.slice(1, 3), 16); g = parseInt(s.slice(3, 5), 16); b = parseInt(s.slice(5, 7), 16); }
    else { const m = /rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/.exec(s); if (m) { r = +m[1]; g = +m[2]; b = +m[3]; } }
    v = r > 200 && g < 135 && b < 135;
    if (WARN.size > 400) WARN.clear();
    WARN.set(s, v);
  }
  return v;
}
