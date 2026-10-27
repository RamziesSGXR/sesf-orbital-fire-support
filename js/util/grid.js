// Spatial hash grid for range queries (pings, engagement, splash, sensor).
export class Grid {
  constructor(size, cell = 40) {
    this.cell = cell;
    this.n = Math.ceil(size / cell);
    this.cells = Array.from({ length: this.n * this.n }, () => []);
  }
  clear() { for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0; }
  _c(v) { const c = Math.floor(v / this.cell); return c < 0 ? 0 : c >= this.n ? this.n - 1 : c; }
  insert(e) { this.cells[this._c(e.y) * this.n + this._c(e.x)].push(e); }
  // Call fn(entity, distSquared) for every entity within r of (x, y).
  near(x, y, r, fn) {
    const r2 = r * r;
    const x0 = this._c(x - r), x1 = this._c(x + r), y0 = this._c(y - r), y1 = this._c(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.cells[cy * this.n + cx];
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e.dead) continue;
          const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
          if (d2 <= r2) fn(e, d2);
        }
      }
    }
  }
  nearest(x, y, r) {
    let best = null, bd = Infinity;
    this.near(x, y, r, (e, d2) => { if (d2 < bd) { bd = d2; best = e; } });
    return best;
  }
}
