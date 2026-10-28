// Spatial hash grid for range queries (pings, engagement, splash, sensor). Rebuilt every step: insert() only records the entity
// and its cell, and the first query sorts them into cells (a stable counting sort into flat typed arrays). Clearing is then a
// counter reset instead of emptying thousands of small arrays, and queries visit entities in the order they were inserted.
export class Grid {
  constructor(size, cell = 40) {
    this.cell = cell;
    this.n = Math.ceil(size / cell);
    this.start = new Int32Array(this.n * this.n + 1);
    this.items = [];
    this.cellOf = new Int32Array(512);
    this.order = new Int32Array(512);
    this.count = 0;
    this.built = true;
  }
  clear() { this.count = 0; this.built = false; }
  _c(v) { const c = Math.floor(v / this.cell); return c < 0 ? 0 : c >= this.n ? this.n - 1 : c; }
  insert(e) {
    const i = this.count++;
    if (i >= this.cellOf.length) {
      const a = new Int32Array(this.cellOf.length * 2); a.set(this.cellOf); this.cellOf = a;
      this.order = new Int32Array(this.cellOf.length);
    }
    this.items[i] = e;
    this.cellOf[i] = this._c(e.y) * this.n + this._c(e.x);
    this.built = false;
  }
  _build() {
    const st = this.start, N = this.count, cellOf = this.cellOf, order = this.order;
    st.fill(0);
    for (let i = 0; i < N; i++) st[cellOf[i] + 1]++;
    for (let c = 1; c < st.length; c++) st[c] += st[c - 1];
    // place with a moving cursor per cell (reusing the counts shifted by one), then restore the starts
    for (let i = 0; i < N; i++) order[st[cellOf[i]]++] = i;
    for (let c = st.length - 1; c > 0; c--) st[c] = st[c - 1];
    st[0] = 0;
    this.built = true;
  }
  // Call fn(entity, distSquared) for every entity within r of (x, y).
  near(x, y, r, fn) {
    if (!this.built) this._build();
    const r2 = r * r, n = this.n, st = this.start, order = this.order, items = this.items;
    const x0 = this._c(x - r), x1 = this._c(x + r), y0 = this._c(y - r), y1 = this._c(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * n + cx;
        for (let k = st[c], end = st[c + 1]; k < end; k++) {
          const e = items[order[k]];
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
