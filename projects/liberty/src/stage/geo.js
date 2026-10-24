// liberty/src/stage/geo.js: a geometry accumulator for the stage's many small parts (truss tubes, scaffold, gear):
// tubes, capped cylinders, oriented boxes and discs written straight into flat arrays (uv in metres, aSeed a piece),
// then one BufferGeometry a material. And the box-truss generator (show.md S1).
const T = window.THREE;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const V = { sub, add: addv, mul, dot, cross, len, norm };

// an orthonormal frame round axis d (u, v perpendicular), stable for vertical d
export function frame(d, up = [0, 1, 0]) {
  let u = cross(d, up); if (len(u) < 1e-4) u = cross(d, [1, 0, 0]); u = norm(u);
  return [u, norm(cross(u, d))];
}

export class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.s = []; this.i = []; this.tris = 0; }
  get count() { return this.p.length / 3; }
  vert(p, n, u, v, seed) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(u, v); this.s.push(seed); return this.p.length / 3 - 1; }
  tri(a, b, c) { this.i.push(a, b, c); this.tris++; }
  // a tube from a to b, radius r (or [ra, rb]), sides; open unless caps
  tube(a, b, r, sides = 8, seed = 0.5, caps = false) {
    const d = sub(b, a), L = len(d); if (L < 1e-5) return this;
    const dn = mul(d, 1 / L), [u, v] = frame(dn), ra = Array.isArray(r) ? r[0] : r, rb = Array.isArray(r) ? r[1] : r;
    const base = this.count;
    for (let k = 0; k <= sides; k++) {
      const t = k / sides * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), n = addv(mul(u, c), mul(v, s));
      this.vert(addv(a, mul(n, ra)), n, 0, t * ra, seed); this.vert(addv(b, mul(n, rb)), n, L, t * ra, seed);
    }
    for (let k = 0; k < sides; k++) { const o = base + k * 2; this.tri(o, o + 2, o + 1); this.tri(o + 1, o + 2, o + 3); }
    if (caps) { this.disc(a, mul(dn, -1), ra, sides, seed); this.disc(b, dn, rb, sides, seed); }
    return this;
  }
  // a flat disc at c facing n (a fan)
  disc(c, n, r, sides = 12, seed = 0.5) {
    const [u, v] = frame(n), base = this.vert(c, n, 0, 0, seed);
    for (let k = 0; k <= sides; k++) { const t = k / sides * Math.PI * 2; this.vert(addv(c, addv(mul(u, Math.cos(t) * r), mul(v, Math.sin(t) * r))), n, Math.cos(t) * r, Math.sin(t) * r, seed); }
    for (let k = 0; k < sides; k++) this.tri(base, base + 1 + k, base + 2 + k);
    return this;
  }
  // a box with centre c and half-extents along the axes ax (3 unit vectors) = [hx, hy, hz]
  obox(c, h, ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], seed = 0.5) {
    for (let f = 0; f < 3; f++) for (const sg of [-1, 1]) {
      const n = mul(ax[f], sg), a1 = ax[(f + 1) % 3], a2 = ax[(f + 2) % 3], h1 = h[(f + 1) % 3], h2 = h[(f + 2) % 3];
      const fc = addv(c, mul(n, h[f])), base = this.count;
      const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [p, q] of cs) this.vert(addv(fc, addv(mul(a1, p * h1), mul(a2, q * h2))), n, (p + 1) * h1, (q + 1) * h2, seed);
      if (sg > 0) { this.tri(base, base + 1, base + 2); this.tri(base, base + 2, base + 3); } else { this.tri(base, base + 2, base + 1); this.tri(base, base + 3, base + 2); }
    }
    return this;
  }
  box(c, size, rotY = 0, seed = 0.5) {
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    return this.obox(c, [size[0] / 2, size[1] / 2, size[2] / 2], [[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]], seed);
  }
  // a box spanning two corner points (axis aligned)
  span(a, b, seed = 0.5) { return this.box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])], 0, seed); }
  // a beam of square-ish section from a to b (w across, h up), like geom.beam but into this accumulator
  bar(a, b, w, h, seed = 0.5, up = [0, 1, 0]) {
    const d = sub(b, a), L = len(d); if (L < 1e-5) return this;
    const dn = mul(d, 1 / L); let s = cross(dn, up); if (len(s) < 1e-4) s = cross(dn, [1, 0, 0]); s = norm(s);
    const u = norm(cross(s, dn));
    return this.obox(mul(addv(a, b), 0.5), [L / 2, h / 2, w / 2], [dn, u, s], seed);
  }
  // a capped cylinder along an axis (centre c, axis unit d, half length hl)
  cyl(c, d, r, hl, sides = 12, seed = 0.5) { return this.tube(addv(c, mul(d, -hl)), addv(c, mul(d, hl)), r, sides, seed, true); }
  // append another accumulator's content transformed by fn(p) / fnN(n)
  append(g, fp = p => p, fnN = n => n) {
    const o = this.count;
    for (let k = 0; k < g.count; k++) {
      const p = fp([g.p[k * 3], g.p[k * 3 + 1], g.p[k * 3 + 2]]), n = fnN([g.n[k * 3], g.n[k * 3 + 1], g.n[k * 3 + 2]]);
      this.vert(p, n, g.uv[k * 2], g.uv[k * 2 + 1], g.s[k]);
    }
    for (const i of g.i) this.i.push(i + o);
    this.tris += g.tris;
    return this;
  }
  geometry() {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aSeed', new T.Float32BufferAttribute(this.s, 1));
    g.setIndex(this.count > 65535 ? new T.Uint32BufferAttribute(this.i, 1) : new T.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

// ---- box truss (show.md S1: Prolyte H30V 290 mm / Tomcat 12 in = 305 mm, 20.5 in = 520 mm; chords 48-51 mm OD x 2-3
// mm, diagonals 25 mm). Four chords at the corners of a square section of side 'size' (chord centres), each face braced
// by a zig-zag of diagonals at the truss's pitch (~size: the diagonals at about 45 deg), with conical couplers and end
// plates at each section's joint (sections of 'sec' m: 0.5-3 m stock lengths). a -> b is the truss's centre line; up
// orients its faces. Returns the triangles it added.
export function boxTruss(G, a, b, { size = 0.29, chord = 0.0254, diag = 0.0127, sec = 3.0, up = [0, 1, 0], seed = 0.5, chordSides = 8, diagSides = 5, ladderEnds = true } = {}) {
  const t0 = G.tris, d = sub(b, a), L = len(d); if (L < 1e-4) return 0;
  const dn = mul(d, 1 / L); let s = cross(dn, up); if (len(s) < 1e-4) s = cross(dn, [1, 0, 0]); s = norm(s);
  const u = norm(cross(s, dn)), h = size / 2;
  const corner = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([p, q]) => addv(mul(s, p * h), mul(u, q * h)));
  for (const c of corner) G.tube(addv(a, c), addv(b, c), chord, chordSides, seed);
  // the diagonals: per face, a zig-zag; the pitch rounds to fit each section, restarting at the joints
  const nSec = Math.max(1, Math.round(L / sec)), sl = L / nSec;
  for (let k = 0; k < nSec; k++) {
    const s0 = k * sl, n = Math.max(1, Math.round(sl / size)), p = sl / n;
    for (let f = 0; f < 4; f++) {
      const c0 = corner[f], c1 = corner[(f + 1) % 4];
      for (let j = 0; j < n; j++) {
        const z0 = s0 + j * p, z1 = s0 + (j + 1) * p, A = j % 2 ? c1 : c0, B = j % 2 ? c0 : c1;
        // pulled in by the chord radius so the diagonal ends on the chord's surface
        G.tube(addv(addv(a, mul(dn, z0)), mul(A, 1 - chord / h * 0.7)), addv(addv(a, mul(dn, z1)), mul(B, 1 - chord / h * 0.7)), diag, diagSides, seed);
      }
      // a straight member across each face at the section's ends (the ladder of a section's end frame)
      if (ladderEnds) for (const zz of [s0 + 0.03, s0 + sl - 0.03]) G.tube(addv(addv(a, mul(dn, zz)), mul(c0, 0.92)), addv(addv(a, mul(dn, zz)), mul(c1, 0.92)), diag, diagSides, seed);
    }
    // the joint: conical couplers on each chord (a fat short sleeve), at the section's start
    if (k > 0) for (const c of corner) G.tube(addv(addv(a, mul(dn, s0 - 0.05)), c), addv(addv(a, mul(dn, s0 + 0.05)), c), chord * 1.45, chordSides, seed);
  }
  return G.tris - t0;
}
