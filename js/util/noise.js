// Smooth value noise on a 256 x 256 lattice, seeded. Shared by the terrain the simulation walks on and the picture of it.
import { RNG } from './rng.js';

export class Noise {
  constructor(seed) {
    const rng = new RNG(seed);
    this.lat = new Float32Array(256 * 256);
    for (let i = 0; i < this.lat.length; i++) this.lat[i] = rng.next();
  }
  v(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const L = this.lat, x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
    const a = L[y0 | x0], b = L[y0 | x1], c = L[y1 | x0], d = L[y1 | x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  fbm(x, y, oct = 3) {
    let s = 0, amp = 0.5, tot = 0, f = 1;
    for (let i = 0; i < oct; i++) { s += amp * this.v(x * f, y * f); tot += amp; amp *= 0.5; f *= 2; }
    return s / tot;
  }
}
