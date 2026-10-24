// liberty/src/pier/near.js: the near box's city plan from data (B4). DataSF's building footprints with their 2010 LiDAR
// heights and OpenStreetMap's streets and car parks (assets/near, made by tools/near_data.py; sources and licences in
// assets/near/rights.json) become the plan the land paints and the city builds on: each street's kerbs, parking lanes
// and sidewalks, its junctions and crosswalks, its street lights and kerbside parking, the car parks' stalls (at grade
// and on the garages' roof decks), the fields the land's shader paints from, and the parked cars' check.
//
// Street widths (SF's North Beach and waterfront streets, measured on z18 at 2 px/m, +-1 m): Bay Street 18-20 m kerb
// to kerb (four lanes and parking both sides), the residential streets 10-12 m (two lanes and parking), one-way lanes
// 7-8 m; sidewalks 3-4.5 m. A side whose building line (measured from the footprints by near_data.py) leaves less
// room loses its parking lane, then its roadway narrows to the line less a 1.5 m sidewalk.
import { SHORE, EMB, COIT, embProfile } from './site.js';
import * as P from '../plan.js';

const BASE = new URL('../../assets/near/', import.meta.url);
// the data files, for a bake's sources (relative to src/pier/)
export const NEAR_FILES = ['../../assets/near/buildings.json.gz', '../../assets/near/streets.json.gz', '../../assets/near/parking.json.gz'];
async function gzJson(name) {
  const r = await fetch(new URL(name, BASE));
  if (!r.ok) throw new Error('near: ' + name + ' ' + r.status);
  return JSON.parse(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text());
}
let LOAD = null;
export function loadNear() {
  if (!LOAD) LOAD = Promise.all(['buildings.json.gz', 'streets.json.gz', 'parking.json.gz'].map(gzJson))
    .then(([b, s, p]) => ({ buildings: b.b, ways: s.w, junctions: s.junctions, parking: p.p }));
  return LOAD;
}

// classes (near_data.py): 1 primary, 2 secondary, 3 tertiary, 4 residential, 5 living street, 6 link
export const STREET = {
  laneW: [0, 3.3, 3.3, 3.2, 3.0, 2.8, 3.3], lanes: [0, 4, 2, 2, 2, 1, 1], walk: [0, 4.0, 3.6, 3.6, 3.0, 2.4, 2.0],
  park: 2.4, walkMin: 1.5, kerbMin: 2.8,
  ret: 4.0,                     // kerb returns at the corners (a smooth union, ~4 m radius)
  xwalk: 3.0, xwalkGap: 1.0,    // crosswalks 3 m wide, 1 m clear of the crossing street's kerb line
  lampSp: [0, 32, 32, 32, 40, 40, 0], lampBack: 0.6, lampArm: 1.8,
  slot: 6.4, curbFill: 0.62,    // kerbside spaces (SF's 20-22 ft) and the evening's share taken (est.)
  embClear: 2,                  // nothing of the city's streets within 2 m of the Embarcadero's paved zone (its own: kerbs and sidewalks)
};
export const CAR = { L: 4.5, W: 1.8, hl: 2.3, hw: 0.92 };   // a parked car (its box with bumpers and mirrors: hl, hw)
export const STALL = { w: 2.6, d: 5.5, aisle: 7.0, fill: 0.8, roofFill: 0.62 };

export function inPoly(px, pz, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
function segD(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
  return Math.hypot(ax + t * dx - px, az + t * dz - pz);
}
function polyDist(px, pz, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segD(px, pz, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  return d;
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function hash(x, z, k = 0) { let h = Math.imul(Math.round(x * 10) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 10) | 0, 0x165667b1) ^ Math.imul(k + 1, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca77); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
export { hash as hash2k };

// a uniform bucket grid over boxes: items inserted by their bounds, queried by a point
function Buckets(cell) {
  const m = new Map(), key = (i, j) => i * 100003 + j;
  return {
    add(x0, z0, x1, z1, it) { for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) { const k = key(i, j); if (!m.has(k)) m.set(k, []); m.get(k).push(it); } },
    at(x, z) { return m.get(key(Math.floor(x / cell), Math.floor(z / cell))) || []; },
  };
}
// the land's polygon (land.js's LAND) and the Embarcadero's centreline distance, as exact geometry (no map needed)
// (and inside P.WORLD.near, 2 m in: past it the ground is the far view's)
const LANDP = SHORE.concat([[SHORE[SHORE.length - 1][0], 1060], [SHORE[0][0], 1060]]), NB = P.WORLD.near;
export const onLand = (x, z) => x > NB.x0 + 2 && x < NB.x1 - 2 && z < NB.z1 - 2 && inPoly(x, z, LANDP);
export function embDist(x, z) { let d = Infinity; const L = EMB.line; for (let k = 0; k < L.length - 1; k++) d = Math.min(d, segD(x, z, L[k][0], L[k][1], L[k + 1][0], L[k + 1][1])); return d; }
// metres outside the Embarcadero's paved zone (- inside): its kerb on that side (site.js embProfile, from the road's middle)
// and a 5.5 m sidewalk; the bay side's promenade beyond counts as outside (the waterfront, not the road)
export function embClear(x, z) {
  const L = EMB.line; let best = Infinity, e = 0, xn = 0;
  for (let k = 0; k < L.length - 1; k++) {
    const a = L[k], b = L[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    const d = Math.hypot(a[0] + t * dx - x, a[1] + t * dz - z);
    if (d < best) { best = d; e = (dx * (z - a[1]) - dz * (x - a[0])) > 0 ? d : -d; xn = a[0] + t * dx; }
  }
  const pr = embProfile(xn), ep = e - pr.c;
  return Math.abs(ep) - ((ep < 0 ? pr.hb : pr.hc) + 5.5);
}

// ---- the plan
export function streetModel(N) {
  const S = STREET, REACH = 30;
  // the buildings: on the land (the piers' sheds and the bulkheads are the pier builder's), off the Embarcadero, Coit
  // Tower its own; a bucket index for inside tests
  const buildings = [], bIdx = Buckets(32), dropped = { water: 0, emb: 0, coit: 0 };
  for (const b of N.buildings) {
    let cx = 0, cz = 0; for (const p of b.p) { cx += p[0]; cz += p[1]; } cx /= b.p.length; cz /= b.p.length;
    if (!inPoly(cx, cz, LANDP)) { dropped.water++; continue; }          // (a building clipped at the box's edge keeps its inside part: the far city has the rest)
    if (embClear(cx, cz) < 1) { dropped.emb++; continue; }
    if (Math.hypot(cx - COIT.at[0], cz - COIT.at[1]) < 12) { dropped.coit++; continue; }
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of b.p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    let A = 0; for (let i = 0, j = b.p.length - 1; i < b.p.length; j = i++) A += b.p[j][0] * b.p[i][1] - b.p[i][0] * b.p[j][1];
    const B = { ...b, ix: buildings.length, c: [cx, cz], box: [x0, z0, x1, z1], area: Math.abs(A) / 2 };
    buildings.push(B); bIdx.add(x0, z0, x1, z1, B);
  }
  const inBuilding = (x, z) => { for (const b of bIdx.at(x, z)) if (x >= b.box[0] && x <= b.box[2] && z >= b.box[1] && z <= b.box[3] && inPoly(x, z, b.p) && !b.h.some(h => inPoly(x, z, h))) return b; return null; };
  // the streets: each side's kerb (hr), parking lane (pk) and sidewalk (wk), from the class and lanes, narrowed to the
  // measured building line
  const ways = [];
  for (const w of N.ways) {
    if (w.emb) continue;
    const c = w.c, lanes = w.lanes || (w.oneway ? Math.max(1, S.lanes[c] / 2) : S.lanes[c]), half = lanes * S.laneW[c] / 2, park = c <= 5 ? S.park : 0;
    const side = b => {
      let hr = half + park, pk = park, wk = S.walk[c];
      if (b != null) {
        const avail = b - S.walkMin;
        if (avail < hr) { pk = 0; hr = Math.max(S.kerbMin, Math.min(half, avail)); }
        wk = Math.max(S.walkMin, Math.min(wk, b - hr));
      }
      return { hr, pk, wk };
    };
    const L = side(w.bl), R = side(w.br);
    ways.push({ id: w.id, c, name: w.name, lanes, oneway: w.oneway, twoWay: !w.oneway && lanes >= 2, p: w.p, L, R, off: (L.hr - R.hr) / 2 });
  }
  const segs = [], sIdx = Buckets(16);
  ways.forEach((w, wi) => {
    let acc = 0; w.arc = [0];
    for (let i = 0; i < w.p.length - 1; i++) {
      const a = w.p[i], b = w.p[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      acc += L; w.arc.push(acc);
      if (L < 0.05) continue;
      const sg = { a, b, u: [dx / L, dz / L], n: [-dz / L, dx / L], L, w: wi, s0: acc - L };
      segs.push(sg);
      sIdx.add(Math.min(a[0], b[0]) - REACH, Math.min(a[1], b[1]) - REACH, Math.max(a[0], b[0]) + REACH, Math.max(a[1], b[1]) + REACH, sg);
    }
    w.len = acc;
  });
  // the fields at a point: dK the kerb (- in a roadway), dB the sidewalk's back (- in the street's right of way), dT the
  // travel lanes (- in one), dC the distance to the roadway's centre line of the nearest street, way that street, nRoad
  // how many roadways hold the point (2+: a junction's box)
  const fieldAt = (x, z) => {
    const per = new Map();
    for (const sg of sIdx.at(x, z)) {
      const px = x - sg.a[0], pz = z - sg.a[1], t = (px * sg.u[0] + pz * sg.u[1]), tc = Math.max(0, Math.min(sg.L, t));
      const d = Math.hypot(px - sg.u[0] * tc, pz - sg.u[1] * tc);
      const o = per.get(sg.w);
      if (!o || d < o.d) per.set(sg.w, { d, s: px * sg.n[0] + pz * sg.n[1], inner: t >= 0 && t <= sg.L, sg, t: tc });
    }
    let dK = 12.8, dB = 12.8, dT = 12.8, best = null, bestK = Infinity, nRoad = 0, first = true;
    for (const [wi, o] of per) {
      const w = ways[wi], sd = o.s >= 0 ? w.L : w.R;
      const k = o.d - sd.hr, b = o.d - sd.hr - sd.wk, tt = o.d - (sd.hr - sd.pk);
      if (first) { dK = k; dB = b; first = false; } else { dK = smin(dK, k, S.ret); dB = smin(dB, b, S.ret); }
      dT = Math.min(dT, tt);
      if (k < 0) nRoad++;
      if (k < bestK) { bestK = k; best = { w: wi, dC: o.inner ? Math.abs(o.s - w.off) : o.d, sC: o.s - w.off, s: o.s, seg: o.sg, t: o.t }; }
    }
    return { dK, dB, dT, nRoad, near: best };
  };
  // junctions: the nodes two or more ways share; their arms (each street leaving it), the crossing distance along each
  // arm (the crossing streets' kerb lines), a crosswalk across each arm just past it. None where a street meets the
  // Embarcadero (its own crossings) or a way simply continues
  const vIdx = new Map(); ways.forEach((w, wi) => w.p.forEach((p, i) => { const k = p[0].toFixed(2) + ',' + p[1].toFixed(2); if (!vIdx.has(k)) vIdx.set(k, []); vIdx.get(k).push([wi, i]); }));
  const embNodes = new Set();
  for (const w of N.ways) if (w.emb) for (const p of w.p) embNodes.add(p[0].toFixed(2) + ',' + p[1].toFixed(2));
  const junctions = [], xwalks = [], xIdx = Buckets(16), jIdx = Buckets(32);
  for (const [jx, jz] of N.junctions) {
    const key = jx.toFixed(2) + ',' + jz.toFixed(2), at = vIdx.get(key);
    if (!at) continue;
    const arms = [];
    for (const [wi, i] of at) {
      const w = ways[wi];
      for (const dir of [1, -1]) {
        const q = w.p[i + dir]; if (!q) continue;
        const dx = q[0] - jx, dz = q[1] - jz, L = Math.hypot(dx, dz); if (L < 0.5) continue;
        // (an arm against the way's direction swaps its left and right)
        arms.push({ w: wi, u: [dx / L, dz / L], L: dir > 0 ? w.L : w.R, R: dir > 0 ? w.R : w.L, len: L });
      }
    }
    if (arms.length < 2) continue;
    const bent = arms.length > 2 || (arms[0].u[0] * arms[1].u[0] + arms[0].u[1] * arms[1].u[1]) > -0.87;
    let rj = 0;
    for (const A of arms) {
      let R = 0;
      for (const B of arms) {
        if (B === A) continue; const c = A.u[0] * B.u[0] + A.u[1] * B.u[1];
        if (Math.abs(c) > 0.9) continue;
        R = Math.max(R, Math.max(B.L.hr, B.R.hr) / Math.sqrt(1 - c * c));
      }
      A.R = Math.min(25, R); rj = Math.max(rj, A.R);
    }
    const J = { x: jx, z: jz, arms, r: rj, emb: embNodes.has(key), cross: bent && !embNodes.has(key) };
    junctions.push(J); jIdx.add(jx - 40, jz - 40, jx + 40, jz + 40, J);
    if (!J.cross) continue;
    for (const A of arms) {
      if (A.R <= 0 || A.R + S.xwalkGap + S.xwalk > A.len + 4) continue;
      const along = A.R + S.xwalkGap + S.xwalk / 2, n = [-A.u[1], A.u[0]];
      const xw = { c: [jx + A.u[0] * along + n[0] * (A.L.hr - A.R.hr) / 2, jz + A.u[1] * along + n[1] * (A.L.hr - A.R.hr) / 2], u: A.u, n, hl: S.xwalk / 2, hw: (A.L.hr + A.R.hr) / 2 };
      xwalks.push(xw); const r = Math.hypot(xw.hl, xw.hw) + 7; xIdx.add(xw.c[0] - r, xw.c[1] - r, xw.c[0] + r, xw.c[1] + r, xw);
    }
  }
  const xwalkAt = (x, z) => {
    let d = 6.4;
    for (const xw of xIdx.at(x, z)) {
      const px = x - xw.c[0], pz = z - xw.c[1], a = Math.abs(px * xw.u[0] + pz * xw.u[1]) - xw.hl, b = Math.abs(px * xw.n[0] + pz * xw.n[1]) - xw.hw;
      d = Math.min(d, Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0));
    }
    return d;
  };
  const nearJunction = (x, z, pad = 0) => { for (const J of jIdx.at(x, z)) if (Math.hypot(x - J.x, z - J.z) < J.r + pad) return J; return null; };
  // a way's point and frame at arc length s
  const along = (w, s) => {
    let i = 1; while (i < w.arc.length - 1 && w.arc[i] < s) i++;
    const a = w.p[i - 1], b = w.p[i], L = w.arc[i] - w.arc[i - 1] || 1, t = (s - w.arc[i - 1]) / L, dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, u: [dx, dz], n: [-dz, dx] };
  };
  const clearOfEmb = (x, z) => embClear(x, z) > S.embClear;
  // ---- the street lights: cobra heads on the sidewalk behind the kerb, alternating sides, the arm over the road
  const lamps = [];
  ways.forEach((w, wi) => {
    const sp = S.lampSp[w.c]; if (!sp || w.len < 20) return;
    for (let k = 0, s = sp / 2; s < w.len; k++, s += sp) {
      const f = along(w, s), sd = k % 2 ? -1 : 1, side = sd > 0 ? w.L : w.R, o = side.hr + S.lampBack;
      const x = f.x + f.n[0] * sd * o, z = f.z + f.n[1] * sd * o;
      if (!onLand(x, z) || !clearOfEmb(x, z) || nearJunction(f.x, f.z, 6) || inBuilding(x, z)) continue;
      const F = fieldAt(x, z); if (!(F.dK > 0.2 && F.dB < -0.2)) continue;
      lamps.push({ pole: [x, z], head: [x - f.n[0] * sd * S.lampArm, z - f.n[1] * sd * S.lampArm], arm: [-f.n[0] * sd, -f.n[1] * sd], way: wi });
    }
  });
  const lIdx = Buckets(16); for (const L of lamps) lIdx.add(L.pole[0] - 4, L.pole[1] - 4, L.pole[0] + 4, L.pole[1] + 4, L);
  const nearLamp = (x, z, r) => lIdx.at(x, z).some(L => Math.hypot(x - L.pole[0], z - L.pole[1]) < r);
  // ---- kerbside parking: parallel in the parking lanes, clear of the junctions and crosswalks, a share taken
  const cars = [];
  const box = (x, z, a, hl = CAR.hl, hw = CAR.hw) => { const c = Math.cos(a), s = Math.sin(a); return [[x + c * hl - s * hw, z + s * hl + c * hw], [x + c * hl + s * hw, z + s * hl - c * hw], [x - c * hl + s * hw, z - s * hl - c * hw], [x - c * hl - s * hw, z - s * hl + c * hw]]; };
  ways.forEach((w, wi) => {
    for (const sd of [1, -1]) {
      const side = sd > 0 ? w.L : w.R; if (!side.pk) continue;
      for (let s = S.slot / 2; s < w.len - S.slot / 2; s += S.slot) {
        const f = along(w, s), off = side.hr - side.pk / 2 - 0.05, x = f.x + f.n[0] * sd * off, z = f.z + f.n[1] * sd * off;
        if (hash(x, z, 11) > S.curbFill) continue;
        if (!onLand(x, z) || !clearOfEmb(x, z) || nearJunction(x, z, S.xwalk + S.xwalkGap + 1.5)) continue;
        const a = Math.atan2(f.u[1], f.u[0]) + (hash(x, z, 12) < 0.5 ? 0 : Math.PI);
        const cs = box(x, z, a);
        let ok = true;
        for (const [qx, qz] of cs.concat([[x, z]])) { const F = fieldAt(qx, qz); if (F.dK > -0.15 || F.dT < 0.05 || F.nRoad > 1 || xwalkAt(qx, qz) < 0.5 || inBuilding(qx, qz) || !onLand(qx, qz) || embClear(qx, qz) < 1) { ok = false; break; } }
        if (ok && !nearLamp(x, z, 3.2)) cars.push({ x, z, a, kind: 'curb', way: wi });
      }
    }
  });
  // ---- the car parks: stalls laid out per lot, double rows with aisles, at grade (OSM's surface car parks) and on the
  // garages' roof decks (footprints OSM's multi-storey car parks cover)
  const lots = [], lines = [];
  const lotPolys = N.parking.filter(p => p.kind === 'surface' && onLand(...p.p[0])).map(p => ({ osm: p.osm, p: p.p, cap: p.cap }));
  const layout = (poly, okStall, fill, kind, ref, blockers = null) => {
    // try each edge's direction (and its normal) and five row offsets; keep the layout with the most stalls
    let best = null;
    const dirs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const dx = poly[i][0] - poly[j][0], dz = poly[i][1] - poly[j][1], L = Math.hypot(dx, dz); if (L < 6) continue;
      const a = ((Math.atan2(dz, dx) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
      if (!dirs.some(b => Math.abs(b - a) < 0.03)) dirs.push(a);
    }
    for (const a0 of dirs) for (const a of [a0, a0 + Math.PI / 2]) {
      const u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const p of poly) { const pu = p[0] * u[0] + p[1] * u[1], pv = p[0] * v[0] + p[1] * v[1]; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); }
      for (const vo of [0.4, 2.2, 4.0, 5.8, 7.6]) for (const uo of [0.3, 1.6]) {
        const st = [];
        // rows: stall row, aisle, stall row (back to back with the next module)
        for (let vb = v0 + vo; vb + STALL.d + STALL.aisle < v1 + 0.01; vb += 2 * STALL.d + STALL.aisle) {
          for (const [rv, face] of [[vb, 1], [vb + STALL.d + STALL.aisle, -1]]) {
            if (rv + STALL.d > v1) continue;
            for (let ub = u0 + uo; ub + STALL.w <= u1; ub += STALL.w) {
              const cu = ub + STALL.w / 2, cv = rv + STALL.d / 2, x = u[0] * cu + v[0] * cv, z = u[1] * cu + v[1] * cv;
              // the stall inside the lot (corners 0.3 m in) and its aisle side reachable (the aisle's middle in the lot)
              const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => [x + u[0] * su * (STALL.w / 2 - 0.05) + v[0] * sv * (STALL.d / 2 - 0.05), z + u[1] * su * (STALL.w / 2 - 0.05) + v[1] * sv * (STALL.d / 2 - 0.05)]);
              if (!corners.every(([qx, qz]) => inPoly(qx, qz, poly) && polyDist(qx, qz, poly) > 0.3)) continue;
              // (a concave lot: none of its corners may poke into the stall)
              if (poly.some(([px, pz]) => { const du = (px - x) * u[0] + (pz - z) * u[1], dv = (px - x) * v[0] + (pz - z) * v[1]; return Math.abs(du) < STALL.w / 2 + 0.3 && Math.abs(dv) < STALL.d / 2 + 0.3; })) continue;
              if (blockers && blockers(x, z, u, v)) continue;
              const ax = x + v[0] * face * (STALL.d / 2 + STALL.aisle / 2), az = z + v[1] * face * (STALL.d / 2 + STALL.aisle / 2);
              if (!inPoly(ax, az, poly)) continue;
              if (!corners.every(([qx, qz]) => okStall(qx, qz))) continue;
              st.push({ x, z, u, v, face, cu, cv });
            }
          }
        }
        if (!best || st.length > best.st.length) best = { st, u, v };
      }
    }
    if (!best) return { stalls: 0, cars: 0 };
    let n = 0;
    for (const s of best.st) {
      // the stall's lines (its two sides, 0.1 m wide, to 0.3 m short of the aisle)
      for (const sg of [-1, 1]) lines.push({ x: s.x + s.u[0] * sg * STALL.w / 2 - s.v[0] * s.face * 0.15, z: s.z + s.u[1] * sg * STALL.w / 2 - s.v[1] * s.face * 0.15, a: Math.atan2(s.v[1], s.v[0]), len: STALL.d - 0.3, kind, ref });
      if (hash(s.x, s.z, 21) > fill) continue;
      // nose in to the aisle mostly; 0.25 m off the stall's back
      const nose = hash(s.x, s.z, 22) < 0.85 ? 1 : -1, back = (STALL.d - CAR.L) / 2 - 0.25;
      cars.push({ x: s.x + s.v[0] * s.face * back, z: s.z + s.v[1] * s.face * back, a: Math.atan2(s.v[1] * s.face * nose, s.v[0] * s.face * nose), kind, ref });
      n++;
    }
    return { stalls: best.st.length, cars: n };
  };
  for (const L of lotPolys) {
    // (a stall's corners 0.6 m off the Embarcadero's paved zone: the check's 0.5 with a margin)
    const ok = (x, z) => onLand(x, z) && embClear(x, z) > 0.6 && !inBuilding(x, z) && fieldAt(x, z).dB >= 0.2;
    const poke = (x, z, u, v) => bIdx.at(x, z).some(b => b.p.some(([px, pz]) => { const du = (px - x) * u[0] + (pz - z) * u[1], dv = (px - x) * v[0] + (pz - z) * v[1]; return Math.abs(du) < STALL.w / 2 + 0.2 && Math.abs(dv) < STALL.d / 2 + 0.2; }));
    lots.push({ ...L, kind: 'surface', ...layout(L.p, ok, STALL.fill, 'lot', L.osm, poke) });
  }
  for (const b of buildings) if (b.garage) {
    // the roof deck: inside the footprint less the parapet (0.6 m), off any hole
    const deck = b.deck || b.p, ok = (x, z) => polyDist(x, z, b.p) > 0.6 && !b.h.some(h => inPoly(x, z, h));
    const poke = (x, z, u, v) => b.p.concat(...b.h).some(([px, pz]) => { const du = (px - x) * u[0] + (pz - z) * u[1], dv = (px - x) * v[0] + (pz - z) * v[1]; return Math.abs(du) < STALL.w / 2 + 0.6 && Math.abs(dv) < STALL.d / 2 + 0.6; });
    lots.push({ id: b.ix, p: deck, kind: 'garage', bldg: b, ...layout(deck, ok, STALL.roofFill, 'roof', b.ix, poke) });
  }
  return { ways, segs, buildings, dropped, inBuilding, fieldAt, xwalkAt, junctions, xwalks, lamps, cars, lots, lines, box, along, nearJunction, nearLamp };
}

// ---- the paint: fields on the land map's texels (land.js packs them into its textures)
//   st: R dK, G dB, A dT (0.1 m steps about 128, +-12.8 m); B the crosswalks (0.05 m about 128, +-6.4 m)
//   ph.B the nearest street light's head (0.25 m steps, 0-63.75 m); ph.A the signed distance to the roadway's centre
//   line (signed, so it interpolates through the line): 0.15 m steps, two-way streets about 64 (1-127), other streets
//   about 191 (128-254: the crosswalks' bars only), 255 none (a junction's box)
//   px.A the surface car parks (signed, 0.1 m steps about 128)
export function paintFields(MAP, SM, ph, px) {
  const n = MAP.n, st = new Uint8Array(n * n * 4), q = (v, k, o = 128) => Math.max(0, Math.min(255, Math.round(o + v * k)));
  const cx = j => MAP.x0 + (j + 0.5) * MAP.res, cz = i => MAP.z0 + (i + 0.5) * MAP.res;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = (i * n + j) * 4, x = cx(j), z = cz(i), F = SM.fieldAt(x, z);
    st[k] = q(F.dK, 10); st[k + 1] = q(F.dB, 10); st[k + 3] = q(F.dT, 10); st[k + 2] = q(SM.xwalkAt(x, z), 20);
    let c = 255;
    if (F.near && F.nRoad < 2 && F.dB < 1) { const w = SM.ways[F.near.w], v = Math.round(F.near.sC / 0.15); c = w.twoWay ? Math.max(1, Math.min(127, 64 + v)) : Math.max(128, Math.min(254, 191 + v)); }
    ph[k + 3] = c;
    ph[k + 2] = 255; px[k + 3] = 255;
  }
  // the street lights' pools: the nearest head within 63 m
  const R = 34;
  for (const L of SM.lamps) {
    const [hx, hz] = L.head, j0 = Math.max(0, Math.floor((hx - R - MAP.x0) / MAP.res)), j1 = Math.min(n - 1, Math.ceil((hx + R - MAP.x0) / MAP.res)), i0 = Math.max(0, Math.floor((hz - R - MAP.z0) / MAP.res)), i1 = Math.min(n - 1, Math.ceil((hz + R - MAP.z0) / MAP.res));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = (i * n + j) * 4 + 2, d = Math.hypot(cx(j) - hx, cz(i) - hz); ph[k] = Math.min(ph[k], q(d, 4, 0)); }
  }
  // the surface car parks
  for (const L of SM.lots) {
    if (L.kind !== 'surface') continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of L.p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    const j0 = Math.max(0, Math.floor((x0 - 13 - MAP.x0) / MAP.res)), j1 = Math.min(n - 1, Math.ceil((x1 + 13 - MAP.x0) / MAP.res)), i0 = Math.max(0, Math.floor((z0 - 13 - MAP.z0) / MAP.res)), i1 = Math.min(n - 1, Math.ceil((z1 + 13 - MAP.z0) / MAP.res));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = (i * n + j) * 4 + 3, x = cx(j), z = cz(i), d = polyDist(x, z, L.p) * (inPoly(x, z, L.p) ? -1 : 1);
      px[k] = Math.min(px[k], q(d, 10));
    }
  }
  return st;
}

// ---- the parked cars' check (every build): each car's box (CAR.hl x CAR.hw about its centre) against every other car
// (separating axes), the travel lanes (no corner in one), the kerbs and sidewalks (a kerbside car wholly in its parking
// lane; a stall's car wholly off the streets), the Embarcadero (its paved zone, 0.5 m clear: embClear), the buildings, and its
// lot or roof deck
export function checkCars(cars, SM) {
  const t0 = performance.now();
  const boxes = cars.map(c => SM.box(c.x, c.z, c.a)), idx = Buckets(8);
  boxes.forEach((b, i) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of b) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } idx.add(x0, z0, x1, z1, i); });
  const sep = (A, B) => {
    for (const P of [A, B]) for (let i = 0; i < 4; i++) {
      const a = P[i], b = P[(i + 1) % 4], nx = -(b[1] - a[1]), nz = b[0] - a[0];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const p of A) { const d = p[0] * nx + p[1] * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const p of B) { const d = p[0] * nx + p[1] * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return true;
    }
    return false;
  };
  const r = { cars: cars.length, byKind: {}, overlaps: 0, inTravelLane: 0, onKerbOrWalk: 0, onEmbarcadero: 0, inBuilding: 0, outsideLot: 0, offWater: 0, examples: [] };
  const flag = (k, c) => { r[k]++; if (r.examples.length < 12) r.examples.push([k, c.kind, +c.x.toFixed(1), +c.z.toFixed(1)]); };
  const seen = new Set();
  cars.forEach((c, i) => {
    r.byKind[c.kind] = (r.byKind[c.kind] || 0) + 1;
    const B = boxes[i], pts = B.concat([[c.x, c.z]]);
    for (const p of B) for (const j of idx.at(p[0], p[1])) {
      if (j <= i) continue; const key = i * 1e6 + j; if (seen.has(key)) continue; seen.add(key);
      if (!sep(B, boxes[j])) flag('overlaps', c);
    }
    if (pts.some(([x, z]) => !onLand(x, z))) flag('offWater', c);
    if (pts.some(([x, z]) => embClear(x, z) < 0.5)) flag('onEmbarcadero', c);
    if (c.kind === 'roof') {
      const L = SM.lots.find(l => l.kind === 'garage' && l.id === c.ref), b = L.bldg;
      if (pts.some(([x, z]) => !inPoly(x, z, L.p) || !inPoly(x, z, b.p) || polyDist(x, z, b.p) < 0.3)) flag('outsideLot', c);
      return;
    }
    if (pts.some(([x, z]) => SM.inBuilding(x, z))) flag('inBuilding', c);
    const F = pts.map(([x, z]) => SM.fieldAt(x, z));
    if (F.some(f => f.dT < 0)) flag('inTravelLane', c);
    if (c.kind === 'curb') { if (F.some(f => f.dK > -0.1)) flag('onKerbOrWalk', c); }
    else {
      if (F.some(f => f.dB < 0)) flag('onKerbOrWalk', c);
      const L = SM.lots.find(l => l.osm === c.ref);
      if (!L || pts.some(([x, z]) => !inPoly(x, z, L.p))) flag('outsideLot', c);
    }
  });
  // the stalls' spacing: each car's nearest neighbour (centre to centre) in its lot
  const nn = [];
  cars.forEach((c, i) => { if (c.kind === 'curb') return; let d = Infinity; for (const j of idx.at(c.x, c.z)) if (j !== i && cars[j].kind === c.kind) d = Math.min(d, Math.hypot(cars[j].x - c.x, cars[j].z - c.z)); if (d < Infinity) nn.push(d); });
  nn.sort((a, b) => a - b);
  r.stallNearest = nn.length ? { min: +nn[0].toFixed(2), p50: +nn[nn.length >> 1].toFixed(2) } : null;
  r.faults = r.overlaps + r.inTravelLane + r.onKerbOrWalk + r.onEmbarcadero + r.inBuilding + r.outsideLot + r.offWater;
  r.ms = +(performance.now() - t0).toFixed(0);
  return r;
}
