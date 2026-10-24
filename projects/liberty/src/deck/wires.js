// liberty/src/deck/wires.js: every wire and rope on her (B2): standing and running rigging, aerials, halyards, the flag
// lines, the mooring lines. Each is a catenary under a stated horizontal tension H (N) and weight w (N/m) (ship.js
// catenary), swept as a thin tube carrying its true radius (aR) and its look (aTone: mats.js wire), merged into one draw
// and drawn at least a few pixels wide (mats.js WIRE_V). Every end is made fast to a fitting registered here, and the
// measure checks it from the geometry: the distance from each end to its fitting's nearest triangle.
import { catenary, tube, triCount } from './ship.js';
import { merge } from 'scene3d/geom.js';

const T = window.THREE;

export class Wires {
  constructor() { this.list = []; this.geos = []; this.fits = []; this.ropes = []; this.ropeGeos = []; }
  // a fitting a wire can end on: its geometry (ship frame; also added to the caller's bins) -> id
  fit(kind, geo, p) { this.fits.push({ kind, geo, p }); return this.fits.length - 1; }
  // a wire from a to b (ship frame): { r, tone, H, w, n, kind, ends: [fitA, fitB], name } -> the record (pts, sag)
  add(a, b, o) {
    const span = Math.hypot(b[0] - a[0], b[2] - a[2]), L = Math.hypot(span, b[1] - a[1]);
    const n = o.n || Math.max(4, Math.min(40, Math.round(L / 0.8)));
    const c = catenary(a, b, o.H || 15000, o.w || 15, n);
    return this.path(c.pts, Object.assign({ sag: c.sag, cat: c, span, L }, o));
  }
  // a wire along a given path (a runner along a boom, a rope round a bitt): no catenary
  path(pts, o) {
    const r = o.r || 0.01, tone = o.tone || 0;
    const g = tube(pts, r, { sides: o.sides || (r > 0.02 ? 8 : r >= 0.01 ? 5 : 4), caps: true, seed: o.seed || 0.5 });     // (wires under 1 cm: a square section, drawn 1.6 px wide anyway)
    const nv = g.attributes.position.count;
    g.setAttribute('aR', new T.Float32BufferAttribute(new Float32Array(nv).fill(r), 1));
    g.setAttribute('aTone', new T.Float32BufferAttribute(new Float32Array(nv).fill(tone), 1));
    const rec = Object.assign({ pts, a: pts[0], b: pts[pts.length - 1] }, o);
    if (o.rope) { this.ropeGeos.push(g); this.ropes.push(rec); } else { this.geos.push(g); this.list.push(rec); }
    return rec;
  }
  tris() { return this.geos.concat(this.ropeGeos).reduce((s, g) => s + triCount(g), 0); }
  // the share of wire ends made fast: each end within tol of its fitting's geometry (closest point on its triangles)
  attached(tol = 0.03) {
    let n = 0, ok = 0; const bad = [];
    for (const w of this.list.concat(this.ropes)) {
      for (const [i, end] of [[0, w.a], [1, w.b]]) {
        const fid = w.ends ? w.ends[i] : undefined;
        n++;
        // 'deck': a free end lying on the deck (a line's flaked tail): on it within tol
        if (fid === 'deck') { const d = Math.abs(end[1] - (this.deckAt ? this.deckAt(end[0], end[2]) : end[1])) - (w.r || 0); if (d <= tol) ok++; else bad.push({ wire: w.name || w.kind, end: i, fit: 'deck', gap: +d.toFixed(3) }); continue; }
        if (fid === undefined || fid === null || !this.fits[fid]) { bad.push({ wire: w.name || w.kind, end: i, why: 'no fitting' }); continue; }
        // a line led through a fitting (a chock's ring): within the ring's opening
        const slack = w.through && w.through[i] ? w.through[i] : 0;
        const d = distToGeo(end, this.fits[fid].geo);
        if (d <= tol + (w.r || 0) + slack) ok++; else bad.push({ wire: w.name || w.kind, end: i, fit: this.fits[fid].kind, gap: +d.toFixed(3) });
      }
    }
    return { ends: n, attached: ok, share: n ? +(ok / n).toFixed(4) : 1, bad: bad.slice(0, 20), badCount: bad.length };
  }
}

// the distance from p to a geometry's nearest triangle (Ericson's closest point; small geometries only)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function closestOnTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}
export function distToGeo(p, g) {
  const pos = g.attributes.position.array, idx = g.index ? g.index.array : null, nt = idx ? idx.length / 3 : pos.length / 9;
  let best = Infinity;
  const P = i => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  for (let t = 0; t < nt; t++) {
    const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const q = closestOnTri(p, P(i0), P(i1), P(i2)), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (d < best) best = d;
  }
  return best;
}
export { merge };
