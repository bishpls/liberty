// liberty/src/pier/geo.js: geometry helpers for the waterfront (B4), on engine/scene3d/geom.js's conventions (position,
// normal, uv in metres, aSeed per piece).
import { merge, seedAttr, box, beam, lathe } from 'scene3d/geom.js';

const T = window.THREE;

// one geometry from raw arrays
export function raw(pos, nrm, uv, idx, seed = 0.5) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(seed), 1));
  g.setIndex(idx);
  return g;
}
// a list of quads [{ p: [a, b, c, d] (CCW seen from the front), t: [[u, v] x4] }] -> geometry (flat normals)
export function quads(list, seed = 0.5) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (const { p, t } of list) {
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
    const b = pos.length / 3;
    for (let i = 0; i < 4; i++) { pos.push(...p[i]); nrm.push(...n); uv.push(...t[i]); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return raw(pos, nrm, uv, idx, seed);
}
// a rectangle in a wall's frame: origin o, along u (unit, horizontal), up y; its face looks along n (the wall's outward
// normal); d offsets it along n
export function wallRect(o, u, n, u0, u1, v0, v1, d = 0) {
  const P = (a, b) => [o[0] + u[0] * a + n[0] * d, o[1] + b, o[2] + u[2] * a + n[2] * d];
  return orient([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], n);
}
// a wall face with rectangular openings: the face's cells that no opening covers, plus each opening's reveals (depth
// back into the wall) -> quads. openings: [{ u0, u1, v0, v1, depth }]
export function wallWithOpenings(o, u, n, U0, U1, V0, V1, openings) {
  const us = new Set([U0, U1]), vs = new Set([V0, V1]);
  for (const op of openings) { us.add(op.u0); us.add(op.u1); vs.add(op.v0); vs.add(op.v1); }
  const UU = [...us].filter(x => x >= U0 && x <= U1).sort((a, b) => a - b), VV = [...vs].filter(x => x >= V0 && x <= V1).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < UU.length - 1; i++) for (let j = 0; j < VV.length - 1; j++) {
    const cu = (UU[i] + UU[i + 1]) / 2, cv = (VV[j] + VV[j + 1]) / 2;
    if (openings.some(op => cu > op.u0 && cu < op.u1 && cv > op.v0 && cv < op.v1)) continue;
    out.push(wallRect(o, u, n, UU[i], UU[i + 1], VV[j], VV[j + 1]));
  }
  // reveals: four quads per opening, facing into the opening
  const nn = [-n[0], -n[1], -n[2]], uneg = [-u[0], 0, -u[2]];
  for (const op of openings) {
    const d = op.depth || 0.25;
    const P = (a, b, k) => [o[0] + u[0] * a - n[0] * k, o[1] + b, o[2] + u[2] * a - n[2] * k];
    // left jamb (faces +u), right jamb (faces -u), head (faces down), sill (faces up)
    out.push(orient([P(op.u0, op.v0, 0), P(op.u0, op.v0, d), P(op.u0, op.v1, d), P(op.u0, op.v1, 0)], [[0, op.v0], [d, op.v0], [d, op.v1], [0, op.v1]], u));
    out.push(orient([P(op.u1, op.v0, 0), P(op.u1, op.v0, d), P(op.u1, op.v1, d), P(op.u1, op.v1, 0)], [[0, op.v0], [d, op.v0], [d, op.v1], [0, op.v1]], uneg));
    out.push(orient([P(op.u0, op.v1, 0), P(op.u1, op.v1, 0), P(op.u1, op.v1, d), P(op.u0, op.v1, d)], [[op.u0, 0], [op.u1, 0], [op.u1, d], [op.u0, d]], [0, -1, 0]));
    out.push(orient([P(op.u0, op.v0, 0), P(op.u1, op.v0, 0), P(op.u1, op.v0, d), P(op.u0, op.v0, d)], [[op.u0, 0], [op.u1, 0], [op.u1, d], [op.u0, d]], [0, 1, 0]));
  }
  return out;
}
// order a quad's corners so its normal points along 'want'
export function orient(p, t, want) {
  const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) return { p: [p[0], p[3], p[2], p[1]], t: [t[0], t[3], t[2], t[1]] };
  return { p, t };
}
// a horizontal cylinder (closed) from a to b, radius r
export function cylinder(a, b, r, segs = 12, seed = 0.5) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
  const g = lathe([[0, 0], [r, 0], [r, L], [0, L]], segs, { seed });
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(d[0] / L, d[1] / L, d[2] / L));
  g.applyQuaternion(q); g.translate(a[0], a[1], a[2]);
  return g;
}
// a vertical lathe placed at (x, y, z)
export function latheAt(profile, segs, x, y, z, seed = 0.5) { const g = lathe(profile, segs, { seed }); g.translate(x, y, z); return g; }
// a flat polygon (y = const), facing up (or down): [[x, z], ...] CCW in plan seen from above
export function flatPoly(poly, y, { down = false, seed = 0.5 } = {}) {
  const shape = new T.Shape(poly.map(([x, z]) => new T.Vector2(x, -z)));
  const g = new T.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const uv = g.attributes.uv, pp = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i), pp.getZ(i));
  if (down) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, -1, 0); }
  return seedAttr(g, seed);
}
// vertical side walls of a polygon between y0 and y1, facing outward (either winding)
export function polySides(poly, y0, y1, seed = 0.5, closed = true) {
  const list = []; let acc = 0;
  const n = poly.length;
  let A = 0; for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; A += a[0] * b[1] - b[0] * a[1]; }
  const sg = A > 0 ? -1 : 1;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = poly[i], b = poly[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const out = [sg * (b[1] - a[1]) / L, 0, -sg * (b[0] - a[0]) / L];
    list.push(orient([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], [[acc, y0], [acc + L, y0], [acc + L, y1], [acc, y1]], out));
    acc += L;
  }
  return quads(list, seed);
}
export { merge, seedAttr, box, beam, lathe };
