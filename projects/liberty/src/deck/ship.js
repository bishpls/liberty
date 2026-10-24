// liberty/src/deck/ship.js: the deck builder's frame and geometry helpers (B2). Everything on deck is modelled in SHIP
// coordinates (x starboard, y = m above the baseline, z aft from midships: plan.js SHIP) and baked into the world by the
// museum trim (SHIP.matrix: 0.99 deg by the stern) when it is merged, so measures and raycasts see the world.
//
//   zs(m)                 m from the stem head -> ship z
//   deckCL(z), deckAt(x, z), sideAbl(z)   the weather deck (m ABL)
//   Bins                  geometry gathered per material, merged and baked into the world (one draw per material)
//   cyl, lath, boxM, tube, ring, disc ... geometry with uv in metres and aSeed (geom.js conventions)
//   catenary(a, b, H, w)  a wire's curve between two points under its horizontal tension H (N) and weight w (N/m)
import * as P from '../plan.js';
import { merge, seedAttr, lathe } from 'scene3d/geom.js';

const T = window.THREE;
export const SH = P.SHIP, FT = 0.3048, IN = 0.0254, DEG = Math.PI / 180;
export const zs = m => m - 67.29;
export const sideAbl = z => SH.sideAbl(z);
export const deckCL = z => SH.deckAbl(0, z);
export const deckAt = (x, z) => { const a = SH.deckAbl(x, z); return a === null ? SH.sideAbl(z) : a; };
export const halfAt = z => SH.halfAt(z);
export const V3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
export const SHIPM = () => SH.matrix();
export const toWorld = (p) => SH.toWorld(p[0], p[1], p[2]);
export const triCount = g => (g.index ? g.index.count : g.attributes.position.count) / 3;

// ---- transforms (ship frame): a small vocabulary of Matrix4s
export const M4 = () => new T.Matrix4();
export const tr = (x, y, z) => new T.Matrix4().makeTranslation(x, y, z);
export const rx = a => new T.Matrix4().makeRotationX(a);
export const ry = a => new T.Matrix4().makeRotationY(a);
export const rz = a => new T.Matrix4().makeRotationZ(a);
export const mul = (...ms) => ms.reduce((a, b) => a.clone().multiply(b));
// a frame at o whose local +y runs along dir (and local +z toward 'side' when given)
export function along(o, dir, side = null) {
  const y = V3(...dir).normalize();
  let z = side ? V3(...side) : (Math.abs(y.y) < 0.9 ? V3(0, 1, 0) : V3(0, 0, 1));
  const x = V3().crossVectors(y, z).normalize(); z = V3().crossVectors(x, y).normalize();
  return new T.Matrix4().makeBasis(x, y, z).setPosition(o[0], o[1], o[2]);
}
export const xf = (g, m) => { g.applyMatrix4(m); return g; };

// ---- geometry: every builder returns position, normal, uv (metres) and aSeed
// a lathed profile [[r, y], ...] (y up the axis); 'hard' duplicates every interior point so its edges stay crisp (toon)
export function lath(profile, sides = 12, { seed = 0.5, hard = true, phase = 0 } = {}) {
  let pr = profile;
  if (hard) { pr = [profile[0]]; for (let i = 1; i < profile.length - 1; i++) pr.push(profile[i], profile[i]); pr.push(profile[profile.length - 1]); }
  return lathe(pr, sides, { seed, phase });
}
// a tapered cylinder from a to b (radius r0 at a, r1 at b), capped
export function cyl(a, b, r0, r1 = r0, { sides = 12, caps = true, seed = 0.5, hard = true } = {}) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
  const pr = caps ? [[0, 0], [r0, 0], [r1, L], [0, L]] : [[r0, 0], [r1, L]];
  return xf(lath(pr, sides, { seed, hard }), along(a, d));
}
// a lathed profile placed along a -> dir from origin o
export const lathAt = (profile, o, dir, opts = {}) => xf(lath(profile, opts.sides || 12, opts), along(o, dir, opts.side));
// a box sx x sy x sz centred at the origin of matrix m (uv in metres per face)
export function boxM(sx, sy, sz, m, seed = 0.5) {
  const g = new T.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv, nrm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const [du, dv] = nx > 0.5 ? [sz, sy] : ny > 0.5 ? [sx, sz] : [sx, sy];
    uv.setXY(i, uv.getX(i) * du, uv.getY(i) * dv);
  }
  if (m) g.applyMatrix4(m);
  return seedAttr(g, seed);
}
export const boxAt = (c, s, seed = 0.5, rotY = 0) => boxM(s[0], s[1], s[2], rotY ? mul(tr(...c), ry(rotY)) : tr(...c), seed);
// a box spanning two points (a beam): w across (local x), h up (local z of the frame), from a to b
export function bar(a, b, w, h, seed = 0.5, side = null) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
  return boxM(w, L, h, mul(along(a, d, side), tr(0, L / 2, 0)), seed);
}
// a round section swept along a path (rails, pipes, ropes); closed paths for rings
export const STATS = { tubeTris: 0, filleted: 0 };
// round a path's sharp corners (> 20 deg) with a short bend, radius ~2.5x the tube's (at most 40 % of either segment):
// a tube's rings at a sharp corner cross each other and turn faces inside out (the winches' steam pipes did)
export function fillet(path, rad, ns = 6) {
  if (path.length < 3) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const p = V3(...path[i]), a = V3(...path[i - 1]), b = V3(...path[i + 1]);
    const d0 = p.clone().sub(a), d1 = b.clone().sub(p), l0 = d0.length(), l1 = d1.length();
    if (l0 < 1e-6 || l1 < 1e-6) { out.push(path[i]); continue; }
    d0.divideScalar(l0); d1.divideScalar(l1);
    const ang = Math.acos(Math.max(-1, Math.min(1, d0.dot(d1))));
    if (ang < 20 * Math.PI / 180) { out.push(path[i]); continue; }
    const t = Math.min(rad * Math.tan(ang / 2), 0.4 * l0, 0.4 * l1);
    const q0 = p.clone().addScaledVector(d0, -t), q1 = p.clone().addScaledVector(d1, t);
    for (let k = 0; k <= ns; k++) { const u = k / ns, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u; out.push([q0.x * w0 + p.x * w1 + q1.x * w2, q0.y * w0 + p.y * w1 + q1.y * w2, q0.z * w0 + p.z * w1 + q1.z * w2]); }
    STATS.filleted++;
  }
  out.push(path[path.length - 1]);
  return out;
}
export function tube(path, r, { sides = 8, seed = 0.5, closed = false, caps = true } = {}) {
  path = path.filter((p, i) => i === 0 || Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1], p[2] - path[i - 1][2]) > 1e-4);    // (no doubled points)
  if (!closed && typeof r === 'number') path = fillet(path, Math.max(2.5 * r, 0.02), r < 0.015 ? 3 : 6);    // (a thin wire's bend needs few rings to stay outside in)
  const n = path.length, P = path.map(p => V3(...p)), pos = [], nrm = [], uv = [], idx = [];
  const rr = typeof r === 'function' ? r : () => r;           // (a radius that varies along the path: a cowl's flare)
  // parallel transport frames (no flips where a path turns vertical)
  const Ts = P.map((p, i) => V3().subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize());
  if (closed) { Ts[0] = V3().subVectors(P[1], P[n - 1]).normalize(); Ts[n - 1] = V3().subVectors(P[0], P[n - 2]).normalize(); }
  let Nv = Math.abs(Ts[0].y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0);
  Nv = V3().crossVectors(Ts[0], V3().crossVectors(Nv, Ts[0])).normalize();
  let along_ = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      along_ += P[i].distanceTo(P[i - 1]);
      const ax = V3().crossVectors(Ts[i - 1], Ts[i]); const s = ax.length();
      if (s > 1e-6) Nv.applyAxisAngle(ax.normalize(), Math.atan2(s, Ts[i - 1].dot(Ts[i])));
      Nv = V3().crossVectors(Ts[i], V3().crossVectors(Nv, Ts[i])).normalize();
    }
    const B = V3().crossVectors(Ts[i], Nv), ri = rr(i / Math.max(1, n - 1));
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const nn = V3().addScaledVector(Nv, c).addScaledVector(B, sn);
      pos.push(P[i].x + nn.x * ri, P[i].y + nn.y * ri, P[i].z + nn.z * ri); nrm.push(nn.x, nn.y, nn.z); uv.push(along_, (k / sides) * Math.PI * 2 * ri);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    // (wound so each face's front is outward, as the normals are: the first tubes were wound inward, so a thick one
    // showed its far wall's inside through its culled near wall and read as cut open at its ends: the cowls' trunks)
    const a = i * (sides + 1) + k, b = a + sides + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  seedAttr(g, seed); STATS.tubeTris += idx.length / 3;
  if (!caps || closed) return g;
  return merge([g, disc(path[0], [-Ts[0].x, -Ts[0].y, -Ts[0].z], rr(0), sides, seed), disc(path[n - 1], [Ts[n - 1].x, Ts[n - 1].y, Ts[n - 1].z], rr(1), sides, seed)]);
}
// a flat disc facing n
export function disc(c, n, r, sides = 12, seed = 0.5) {
  const g = new T.CircleGeometry(r, sides); g.deleteAttribute('uv');
  const uv = []; const p = g.attributes.position; for (let i = 0; i < p.count; i++) uv.push(p.getX(i), p.getY(i));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  const q = new T.Quaternion().setFromUnitVectors(V3(0, 0, 1), V3(...n).normalize());
  g.applyMatrix4(new T.Matrix4().compose(V3(...c), q, V3(1, 1, 1)));
  return seedAttr(g.index ? g : g, seed);
}
// a torus ring of radius R (tube r) in the plane through c normal to n
export function ring(c, n, R, r, { seg = 16, sides = 6, seed = 0.5 } = {}) {
  const g = new T.TorusGeometry(R, r, sides, seg);
  const q = new T.Quaternion().setFromUnitVectors(V3(0, 0, 1), V3(...n).normalize());
  g.applyMatrix4(new T.Matrix4().compose(V3(...c), q, V3(1, 1, 1)));
  return seedAttr(g, seed);
}
// an extruded polygon (in the local x-y plane, depth along local z, centred) placed by m: brackets, plates, shields
export function plate(poly, depth, m, seed = 0.5) {
  const sh = new T.Shape(poly.map(([x, y]) => new T.Vector2(x, y)));
  const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -depth / 2);
  const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals();
  // uv in metres: planar on the face's dominant axes
  const p = ng.attributes.position, n = ng.attributes.normal, uv = [];
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    uv.push(ax > 0.5 ? p.getZ(i) : p.getX(i), ay > 0.5 ? p.getZ(i) : p.getY(i));
  }
  ng.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  if (m) ng.applyMatrix4(m);
  return seedAttr(ng, seed);
}
export const mergeG = list => merge(list.filter(Boolean));

// ---- a catenary between a and b (ship or world frame: y up) under horizontal tension H (N), weight w (N/m) -> points,
// and its sag (the largest drop below the chord). n segments.
export function catenary(a, b, H, w, n = 16) {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz), h = b[1] - a[1];
  const out = [];
  if (L < 1e-3 || !(H > 0) || !(w > 0)) { for (let i = 0; i <= n; i++) out.push([a[0] + dx * i / n, a[1] + h * i / n, a[2] + dz * i / n]); return { pts: out, sag: 0, a: Infinity, L }; }
  const c = H / w;
  const x0 = L / 2 - c * Math.asinh(h / (2 * c * Math.sinh(L / (2 * c))));
  const y = x => c * Math.cosh((x - x0) / c) - c * Math.cosh(-x0 / c);
  let sag = 0;
  for (let i = 0; i <= n; i++) {
    const s = i / n, x = L * s, yy = y(x);
    sag = Math.max(sag, h * s - yy);
    out.push([a[0] + dx * s, a[1] + yy, a[2] + dz * s]);
  }
  return { pts: out, sag, a: c, L, Tmax: H * Math.max(Math.cosh(-x0 / c), Math.cosh((L - x0) / c)) };
}

// drop zero-area triangles from an indexed geometry (the crisp edges' doubled lathe points and the caps' poles leave
// strips of them: drawn, never seen) -> how many were dropped
export function dropDegenerate(g) {
  if (!g.index) return 0;
  const p = g.attributes.position.array, ix = g.index.array, keep = [];
  for (let k = 0; k < ix.length; k += 3) {
    const a = ix[k] * 3, b = ix[k + 1] * 3, c = ix[k + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz > 1e-16) keep.push(ix[k], ix[k + 1], ix[k + 2]);
  }
  const dropped = ix.length / 3 - keep.length / 3;
  if (dropped) g.setIndex(new T.BufferAttribute(new Uint32Array(keep), 1));
  return dropped;
}
STATS.degenerate = 0;

// ---- geometry gathered per material, merged and baked into the world through the ship's trim (one draw per material)
const KEYS = new WeakMap(); let NK = 0;
export class Bins {
  constructor(world, name) { this.world = world; this.name = name; this.map = new Map(); this.tris = {}; this.meshes = []; }
  add(mat, geo, part = 'misc', flags = {}) {
    if (!geo) return geo;
    if (Array.isArray(geo)) { geo.forEach(g => this.add(mat, g, part, flags)); return geo; }
    if (!KEYS.has(mat)) KEYS.set(mat, ++NK);
    const key = KEYS.get(mat) + '|' + (flags.key || '') + '|' + JSON.stringify(flags);
    let b = this.map.get(key);
    if (!b) this.map.set(key, b = { mat, flags, list: [], parts: {} });
    b.list.push(geo);
    const tc = triCount(geo);
    this.tris[part] = (this.tris[part] || 0) + tc;
    return geo;
  }
  // merge each bin (chunks under ~1M vertices), bake the ship's matrix, make the meshes
  flush(m = SHIPM()) {
    const out = [];
    for (const b of this.map.values()) {
      let chunk = [], nv = 0;
      const emit = () => {
        if (!chunk.length) return;
        const g = merge(chunk); if (m) g.applyMatrix4(m); STATS.degenerate += dropDegenerate(g); g.computeBoundingSphere(); g.computeBoundingBox();
        const fl = Object.assign({}, b.flags); delete fl.key;
        const mesh = this.world.mesh(g, b.mat, fl); mesh.name = `${this.name}:${b.mat.name}${b.flags.key ? ':' + b.flags.key : ''}`;
        this.meshes.push(mesh); out.push(mesh); chunk = []; nv = 0;
      };
      for (const g of b.list) { chunk.push(g); nv += g.attributes.position.count; if (nv > 1e6) emit(); }
      emit();
    }
    this.map.clear();
    return out;
  }
  total() { return Object.values(this.tris).reduce((a, b) => a + b, 0); }
}

// a moving part: geometries merged into one mesh whose matrix the caller sets each frame (in the world: SHIP.matrix x local)
export function partMesh(world, geos, mat, name, flags = {}) {
  const g = merge(geos.filter(Boolean)); STATS.degenerate += dropDegenerate(g); g.computeBoundingSphere(); g.computeBoundingBox();
  const m = world.mesh(g, mat, flags); m.name = name; m.matrixAutoUpdate = false;
  return m;
}
export function setMatrix(mesh, m) { mesh.matrix.copy(m); mesh.matrixWorldNeedsUpdate = true; mesh.updateMatrixWorld(true); }

// ---- seats: where a fitting joins the body. The hull module's named anchors ({ ship: [x, abl, z], world } each, B1's
// ctx.mods.hull.anchors) when it has them, else the plan's numbers. seat(path, fallback) -> ship-frame point; 'used'
// records which source each seat came from (the board lists them)
export function seats(ctx) {
  const hull = ctx.mods && ctx.mods.hull && !ctx.mods.hull.failed ? ctx.mods.hull : null;
  const A = (hull && hull.anchors) || null;
  const used = {};
  const pick = path => { let a = A; for (const k of path.split('.')) { if (a == null) return null; a = a[k]; } return a; };
  const shipOf = a => (a == null ? null : a.ship ? a.ship : Array.isArray(a) && a.length === 3 ? SH.fromWorld(a[0], a[1], a[2]) : null);
  const get = (path, fallback) => { const p = shipOf(pick(path)); used[path] = p ? 'hull' : 'plan'; return p ? p.slice() : fallback; };
  return { get, pick, used, hull, A };
}

// smoothstep and a minimum-jerk ease
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mjerk = u => { u = clamp(u); return u * u * u * (10 + u * (-15 + 6 * u)); };
