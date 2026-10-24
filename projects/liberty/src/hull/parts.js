// liberty/src/hull/parts.js: geometry helpers in ship coordinates (B1): walls standing on a cambered, sheered deck, slabs
// (decks, platforms, roofs) from a plan polygon, rings (gun tubs), pipe rails, tubes. Every builder returns a
// BufferGeometry with position, normal, uv (metres) and aSeed; index.js merges by material and bakes the ship's matrix.
import { merge, seedAttr, box, beam as beamG } from 'scene3d/geom.js';

const T = window.THREE;

function finish(pos, nrm, uv, idx, seed = 0.5) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return seedAttr(g, seed);
}

// a wall along a plan path [[x, z], ...] from yb(x, z) to yt(x, z), th thick (to the path's left: inside for a CCW-from-
// above loop... we take the path's right-hand normal as the outer face), with its top capped. closed: a loop.
// uv: u along the path (m), v height above the wall's foot (m)
export function wall(path, yb, yt, th, { closed = false, seed = 0.5, inner = true, top = true } = {}) {
  const n = path.length, pts = closed ? path.concat([path[0]]) : path;
  const m = pts.length;
  // the outward normal in plan at each point (averaged at corners, mitred)
  const nr = [];
  const seg = i => { const a = pts[i], b = pts[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; };
  for (let i = 0; i < m; i++) {
    let a = i > 0 ? seg(i - 1) : (closed ? seg(m - 2) : seg(0)), b = i < m - 1 ? seg(i) : (closed ? seg(0) : seg(m - 2));
    let nx = a[0] + b[0], nz = a[1] + b[1]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const k = 1 / Math.max(0.3, nx * b[0] + nz * b[1]);
    nr.push([nx * k, nz * k]);
  }
  const pos = [], nrm = [], uv = [], idx = [];
  let acc = 0;
  const L = [0]; for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  // faces: outer (offset 0), inner (offset -th), each a strip; flat normals per segment
  const face = (off, flip) => {
    for (let i = 0; i < m - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const pa = [a[0] - nr[i][0] * off, a[1] - nr[i][1] * off], pb = [b[0] - nr[i + 1][0] * off, b[1] - nr[i + 1][1] * off];
      const s = seg(i), nn = flip ? [-s[0], -s[1]] : s;
      const base = pos.length / 3;
      const ya0 = yb(a[0], a[1]), ya1 = yt(a[0], a[1]), yb0 = yb(b[0], b[1]), yb1 = yt(b[0], b[1]);
      pos.push(pa[0], ya0, pa[1], pb[0], yb0, pb[1], pb[0], yb1, pb[1], pa[0], ya1, pa[1]);
      for (let k = 0; k < 4; k++) nrm.push(nn[0], 0, nn[1]);
      uv.push(L[i], 0, L[i + 1], 0, L[i + 1], yb1 - yb0, L[i], ya1 - ya0);
      if (!flip) idx.push(base, base + 2, base + 1, base, base + 3, base + 2); else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  };
  face(0, false);
  if (inner && th > 0) face(th, true);
  if (top && th > 0) {
    for (let i = 0; i < m - 1; i++) {
      const a = pts[i], b = pts[i + 1], base = pos.length / 3;
      const ai = [a[0] - nr[i][0] * th, a[1] - nr[i][1] * th], bi = [b[0] - nr[i + 1][0] * th, b[1] - nr[i + 1][1] * th];
      pos.push(a[0], yt(a[0], a[1]), a[1], b[0], yt(b[0], b[1]), b[1], bi[0], yt(b[0], b[1]), bi[1], ai[0], yt(a[0], a[1]), ai[1]);
      for (let k = 0; k < 4; k++) nrm.push(0, 1, 0);
      uv.push(L[i], 0, L[i + 1], 0, L[i + 1], th, L[i], th);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  return finish(pos, nrm, uv, idx, seed);
}
// a CCW-or-CW plan polygon -> its orientation made counter-clockwise seen from above (x right, z down the page)
const area = poly => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
// a slab: a plan polygon [[x, z], ...] between y0 and y1 (y may be a function of x, z), top, bottom and edges
export function slab(poly, y0, y1, { seed = 0.5, bottom = true, edges = true } = {}) {
  const f0 = typeof y0 === 'function' ? y0 : () => y0, f1 = typeof y1 === 'function' ? y1 : () => y1;
  if (area(poly) < 0) poly = poly.slice().reverse();
  const tris = T.ShapeUtils.triangulateShape(poly.map(([x, z]) => new T.Vector2(x, z)), []);
  const pos = [], nrm = [], uv = [], idx = [];
  // top (normal +y) and bottom: each triangle's winding checked against the face it belongs to
  const cap = (fy, up) => {
    const base = pos.length / 3;
    for (const [x, z] of poly) { pos.push(x, fy(x, z), z); nrm.push(0, up ? 1 : -1, 0); uv.push(x, z); }
    for (const t of tris) {
      const a = poly[t[0]], b = poly[t[1]], c = poly[t[2]];
      const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);     // the triangle's normal's y as listed
      if ((ny > 0) === up) idx.push(base + t[0], base + t[1], base + t[2]); else idx.push(base + t[0], base + t[2], base + t[1]);
    }
  };
  cap(f1, true);
  if (bottom) cap(f0, false);
  const g = finish(pos, nrm, uv, idx, seed);
  if (!edges) return g;
  return merge([g, wall(poly, f0, f1, 0, { closed: true, seed, inner: false, top: false })]);
}
// an arc of wall: centre (cx, cz), radius r (the outer face), angles a0..a1 (rad, 0 = +z aft, pi/2 = +x starboard)
export function arcPath(cx, cz, r, a0, a1, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + r * Math.sin(a), cz + r * Math.cos(a)]); }
  return out;
}
// a round tube (n sides) along a polyline of 3D points
export function tube(path, r, { n = 6, seed = 0.5, caps = false } = {}) {
  const pos = [], nrm = [], uv = [], idx = [];
  const P = path.map(p => new T.Vector3(...p)), m = P.length;
  let along = 0, prevS = null;
  for (let i = 0; i < m; i++) {
    const t = new T.Vector3().subVectors(P[Math.min(m - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
    let s = prevS ? prevS.clone().sub(t.clone().multiplyScalar(prevS.dot(t))) : new T.Vector3().crossVectors(t, Math.abs(t.y) > 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0));
    s.normalize(); prevS = s;
    const u = new T.Vector3().crossVectors(t, s).normalize();
    if (i > 0) along += P[i].distanceTo(P[i - 1]);
    for (let k = 0; k <= n; k++) {
      const a = k / n * Math.PI * 2, nn = s.clone().multiplyScalar(Math.cos(a)).addScaledVector(u, Math.sin(a));
      const p = P[i].clone().addScaledVector(nn, r);
      pos.push(p.x, p.y, p.z); nrm.push(nn.x, nn.y, nn.z); uv.push(along, k / n * Math.PI * 2 * r);
    }
  }
  for (let i = 0; i < m - 1; i++) for (let k = 0; k < n; k++) {
    const a = i * (n + 1) + k, b = (i + 1) * (n + 1) + k;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  return finish(pos, nrm, uv, idx, seed);
}
// a pipe rail along a plan path at a foot height yb(x, z): stanchions every 'every' m, 'courses' horizontal pipes up
// to 'height' (ship.md §3: 2-3 courses, ~1.0-1.07 m)
export function rail(path, yb, { height = 1.02, courses = 3, every = 1.5, r = 0.024, rs = 0.022, seed = 0.5, closed = false } = {}) {
  const pts = closed ? path.concat([path[0]]) : path;
  const parts = [];
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1];
  const at = d => { let i = 1; while (i < pts.length - 1 && L[i] < d) i++; const t = (d - L[i - 1]) / Math.max(L[i] - L[i - 1], 1e-9); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; };
  // the courses follow the path, sampled at its corners and every 0.5 m (a sheer or a curve)
  const samp = []; for (let i = 0; i < pts.length - 1; i++) { const n = Math.max(1, Math.ceil((L[i + 1] - L[i]) / 0.5)); for (let k = 0; k < n; k++) samp.push(at(L[i] + (L[i + 1] - L[i]) * k / n)); }
  samp.push(pts[pts.length - 1]);
  for (let c = 1; c <= courses; c++) {
    const hh = height * c / courses;
    parts.push(tube(samp.map(([x, z]) => [x, yb(x, z) + hh, z]), c === courses ? r : r * 0.8, { seed }));
  }
  const ns = Math.max(1, Math.round(total / every));
  for (let k = 0; k <= ns; k++) {
    if (closed && k === ns) break;
    const [x, z] = at(total * k / ns), y = yb(x, z);
    parts.push(tube([[x, y - 0.02, z], [x, y + height, z]], rs, { n: 5, seed }));
  }
  return merge(parts);
}
// a round porthole's rim: a flat ring on a wall (centre c, outward normal nrm in plan, radius r)
export function ringDisc(c, nrm, r, w, { seed = 0.5, n = 12, proud = 0.02 } = {}) {
  const pos = [], nn = [], uv = [], idx = [];
  const sx = -nrm[1], sz = nrm[0];   // the wall's direction in plan
  for (let k = 0; k <= n; k++) {
    const a = k / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (const rr of [r, r + w]) {
      pos.push(c[0] + nrm[0] * proud + sx * ca * rr, c[1] + sa * rr, c[2] + nrm[1] * proud + sz * ca * rr);
      nn.push(nrm[0], 0, nrm[1]); uv.push(ca * rr, sa * rr);
    }
  }
  for (let k = 0; k < n; k++) { const a = k * 2, b = a + 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  return finish(pos, nn, uv, idx, seed);
}

// ---- fittings on a wall: everything is placed by a frame on the wall's face: o (the point on the face), n (the outward
// normal in plan [nx, nz]), so the along-the-wall direction is s = [-nz, nx] (to the right, seen from outside)
const frameOf = (o, n) => ({ o, n: [n[0], 0, n[1]], s: [-n[1], 0, n[0]] });
const at3 = (F, u, v, w) => [F.o[0] + F.s[0] * u + F.n[0] * w, F.o[1] + v, F.o[2] + F.s[2] * u + F.n[2] * w];
// a flat ring (or disc, r0 = 0) on the wall at (u, v), proud by w, facing out
function ringOn(F, cu, cv, r0, r1, w, segs = 16) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (let k = 0; k <= segs; k++) {
    const a = k / segs * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (const r of [r0, r1]) { pos.push(...at3(F, cu + ca * r, cv + sa * r, w)); nrm.push(...F.n); uv.push(ca * r, sa * r); }
  }
  // (the frame's s x up is -n: wind clockwise in (s, up) so the face looks out)
  for (let k = 0; k < segs; k++) { const a = k * 2, b = a + 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  return finish(pos, nrm, uv, idx, 0.5);
}
// the rim's edge: a short cylinder wall from w0 to w1 at radius r
function rimOn(F, cu, cv, r, w0, w1, segs = 16) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (let k = 0; k <= segs; k++) {
    const a = k / segs * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const nn = [F.s[0] * ca, sa, F.s[2] * ca];
    for (const w of [w0, w1]) { pos.push(...at3(F, cu + ca * r, cv + sa * r, w)); nrm.push(...nn); uv.push(k / segs * 6.28 * r, w); }
  }
  for (let k = 0; k < segs; k++) { const a = k * 2, b = a + 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  return finish(pos, nrm, uv, idx, 0.5);
}
// a porthole (ship.md §7: 0.37 m clear): its brass-and-steel rim, the glass set back, the deadlight's hinge lug above
export function porthole(o, n, { r = 0.185, seed = 0.5 } = {}) {
  const F = frameOf(o, n);
  // (the wall behind has no hole: the glass sits just proud of its face, inside the rim's lip)
  const rim = merge([ringOn(F, 0, 0, r, r + 0.055, 0.035), rimOn(F, 0, 0, r + 0.055, 0, 0.035), rimOn(F, 0, 0, r, 0.035, 0.008, 14),
    box(at3(F, 0, r + 0.09, 0.03), [0.06, 0.05, 0.06])]);
  const glass = ringOn(F, 0, 0, 0, r, 0.008, 14);
  seedAttr(glass, seed);
  // about a third have their deadlight (the hinged steel cover) swung open to the side and dogged back against the wall
  // (to the side: on the boat-deck house the deck above leaves no room over them)
  const parts = [rim];
  if ((seed * 7.77) % 1 < 0.33) {
    const R = r + 0.07, cu = (seed * 13.1) % 1 < 0.5 ? -(r + 0.1 + R) : r + 0.1 + R;
    parts.push(ringOn(F, cu, 0, 0, R, 0.045, 16), rimOn(F, cu, 0, R, 0.0, 0.045, 16), boxOn(F, Math.sign(cu) * (r + 0.08), 0, 0.08, 0.07, 0.05));
  }
  return { rim: merge(parts), glass };
}
// a rectangular window (the wheelhouse front's small squares): frame and glass
export function windowRect(o, n, w, h, { seed = 0.5 } = {}) {
  const F = frameOf(o, n), t = 0.05;
  const fr = [];
  const bar = (u0, v0, u1, v1) => { const c = at3(F, (u0 + u1) / 2, (v0 + v1) / 2, 0.02); fr.push(boxOn(F, (u0 + u1) / 2, (v0 + v1) / 2, u1 - u0, v1 - v0, 0.04)); };
  bar(-w / 2 - t, -h / 2 - t, w / 2 + t, -h / 2); bar(-w / 2 - t, h / 2, w / 2 + t, h / 2 + t);
  bar(-w / 2 - t, -h / 2, -w / 2, h / 2); bar(w / 2, -h / 2, w / 2 + t, h / 2);
  const glass = quadOn(F, 0, 0, w, h, 0.008); seedAttr(glass, seed);
  return { frame: merge(fr), glass };
}
// a box on the wall: centred at (u, v), w along, h up, d proud (from the face out)
export function boxOn(F, u, v, w, h, d) {
  const g = box([0, 0, 0], [w, h, d]);
  const m = new T.Matrix4().makeBasis(new T.Vector3(...F.s), new T.Vector3(0, 1, 0), new T.Vector3(...F.n));
  m.setPosition(new T.Vector3(...at3(F, u, v, d / 2)));
  g.applyMatrix4(m);
  return g;
}
function quadOn(F, u, v, w, h, wOff) {
  const p = [at3(F, u - w / 2, v - h / 2, wOff), at3(F, u + w / 2, v - h / 2, wOff), at3(F, u + w / 2, v + h / 2, wOff), at3(F, u - w / 2, v + h / 2, wOff)];
  return finish(p.flat(), [...F.n, ...F.n, ...F.n, ...F.n], [0, 0, w, 0, w, h, 0, h], [0, 2, 1, 0, 3, 2], 0.5);
}
// a dogged watertight door (sheet 2; photos 29, 38): a rounded-corner frame, the leaf proud of it, six dogs round the
// edge, two hinges on the hinge side, the raised sill; foot at o (the deck under it), 0.66 x 1.6 m clear (26 x 66 in)
export function door(o, n, { w = 0.70, h = 1.62, sill = 0.30, hinge = 1 } = {}) {
  const F = frameOf(o, n), parts = [], cr = 0.14;
  // the frame: a rounded rectangle ring, 6 cm wide, 3 cm proud
  const outline = (W, H, r, segs = 5) => {
    const pts = [], c = [[W / 2 - r, H - r, 0], [-W / 2 + r, H - r, Math.PI / 2], [-W / 2 + r, r, Math.PI], [W / 2 - r, r, Math.PI * 1.5]];
    for (const [cx, cy, a0] of c) for (let k = 0; k <= segs; k++) { const a = a0 + k / segs * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return pts;
  };
  const ringPts = (o1, o2, d0, d1) => {
    const pos = [], nrm = [], uv = [], idx = [];
    for (let i = 0; i < o1.length; i++) { pos.push(...at3(F, o1[i][0], sill + o1[i][1], d1), ...at3(F, o2[i][0], sill + o2[i][1], d1)); nrm.push(...F.n, ...F.n); uv.push(o1[i][0], o1[i][1], o2[i][0], o2[i][1]); }
    const n = o1.length;
    for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    return finish(pos, nrm, uv, idx, 0.5);
  };
  const inner = outline(w, h, cr), outer = outline(w + 0.18, h + 0.18, cr + 0.09).map(([x, y]) => [x, y - 0.09]);
  parts.push(ringPts(outer, inner, 0, 0.05));
  // the leaf: a slab with the same rounded outline, 4 cm proud
  const leaf = slab(inner.map(([x, y]) => [x, y]), 0, 0.045, { bottom: false });
  const m = new T.Matrix4().makeBasis(new T.Vector3(...F.s), new T.Vector3(...F.n), new T.Vector3(0, 1, 0)).multiply(new T.Matrix4().makeRotationX(0));
  // (slab builds in x-z with y up: map x -> along the wall, z -> up, y -> out)
  const lp = leaf.attributes.position, ln = leaf.attributes.normal;
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i), y = lp.getY(i), z = lp.getZ(i), q = at3(F, x, sill + z, y + 0.005);
    lp.setXYZ(i, q[0], q[1], q[2]);
    const nx = ln.getX(i), ny = ln.getY(i), nz = ln.getZ(i);   // (normals: the slab's y is the door's out)
    ln.setXYZ(i, F.s[0] * nx + F.n[0] * ny, nz, F.s[2] * nx + F.n[2] * ny);
  }
  parts.push(leaf);
  // dogs: six lever handles round the edge; hinges on the hinge side; the sill
  for (const [u, v] of [[0.32, 0.25], [0.32, 0.8], [0.32, 1.35], [-0.32, 0.8], [0, 1.58], [0, 0.04]]) parts.push(boxOn(F, u * Math.sign(hinge) * -1, sill + v, 0.05, 0.12, 0.09));
  for (const v of [0.3, 1.3]) parts.push(boxOn(F, hinge * (w / 2 + 0.03), sill + v, 0.08, 0.2, 0.08));
  parts.push(boxOn(F, 0, sill / 2, w + 0.14, sill, 0.05));
  return merge(parts);
}
// an inclined ladder (stair) from a foot point to a head point: two stringers, treads every 0.25 m, handrails
export function ladder(foot, head, width = 0.7, { rails = true } = {}) {
  const parts = [];
  const d = [head[0] - foot[0], head[1] - foot[1], head[2] - foot[2]], L = Math.hypot(...d);
  const hor = Math.hypot(d[0], d[2]) || 1, fx = d[0] / hor, fz = d[2] / hor, sx = -fz, sz = fx;   // the side direction
  const off = (p, s, up = 0) => [p[0] + sx * s, p[1] + up, p[2] + sz * s];
  for (const s of [-width / 2, width / 2]) {
    parts.push(beamRaw(off(foot, s), off(head, s), 0.03, 0.18));
    if (rails) parts.push(tube([off(foot, s, 0.95), off(head, s, 0.95)], 0.022, { n: 6 }), tube([off(foot, s, -0.05), off(foot, s, 0.95)], 0.02, { n: 5 }), tube([off(head, s, -0.05), off(head, s, 0.95)], 0.02, { n: 5 }));
  }
  const n = Math.max(2, Math.round(d[1] / 0.24));
  for (let k = 1; k < n; k++) { const t = k / n, p = [foot[0] + d[0] * t, foot[1] + d[1] * t, foot[2] + d[2] * t]; parts.push(beamRaw(off(p, -width / 2), off(p, width / 2), 0.2, 0.025)); }
  return merge(parts);
}
function beamRaw(a, b, w, h) { return beamG(a, b, w, h); }
