// liberty/src/pier/bulkhead.js: the bulkhead buildings on the Embarcadero (B4): Pier 35's (1915-16) joined to Pier 33's
// (1919) in one Beaux-Arts frontage (photo 07), plaster over concrete in a warm light grey (06: #d8d7d1; site.md
// #cccac3). Each pier's pavilion (photo 06, scaled by the Golden Gate Transit coach, 3.3 m): 18 m wide, its cornice at
// 8.8 m, pilaster towers 4.5 m wide to 9.8 m, a pediment to 11.75 m with a dentil course and the cast "PIER·35"
// (photo 09), a round arch 11.2 m across its voussoirs (25 of them; the opening 7.2 m, springing at 3.2 m) holding a
// roll-up door (06: #3d3f38) under a steel-sash lunette, a flagpole on the apex to 17.5 m. The wings (photos 05, 06):
// two storeys to a cornice at 7.2 m and a parapet to 8.0 m, rusticated pilasters, small upper windows in pairs, tall
// lower windows and doors, big glazed entrances (05: "CRUISE TERMINAL"). The frontage runs at 121 deg true (traced: the
// street face z = 141.5 + 0.684 x); the buildings stand on the bulkhead wharf, a deck strip 13 m deep on piles.
import { Bins } from 'scene3d/kit/arch/kit.js';
import { rng } from 'scene3d/util.js';
import { P35 } from './site.js';
import { quads, wallRect, wallWithOpenings, orient, box, beam, merge, flatPoly, polySides, cylinder, latheAt } from './geo.js';
import { SUB } from './pier35.js';
import * as P from '../plan.js';

const T = window.THREE;
export const BH = {
  x0: 2.0, x1: 262.0,                  // the frontage's west end (traced on z19) to Pier 31's east root (z18; Pier 31's bulkhead in the same style, est.)
  depth: 13.0,                         // street face to back (traced: 15.8 m along z)
  wing: { h: 7.2, parapet: 0.8, ground: 4.2, bay: 4.8 },
  pav: { w: 18.0, proj: 0.8, cornice: 8.8, tower: 4.5, towerH: 9.8, apex: 11.75, archOut: 5.6, archIn: 3.6, spring: 3.2, pole: 17.5 },
  pavilions: [{ x: 42.65, label: 'PIER 35' }, { x: 141.8, label: 'PIER 33' }, { x: 232.1, label: 'PIER 31' }],   // each on its pier's axis
};

// a point on the street face at frontage coordinate u (metres along, from the west end), offset d outward (toward the
// street) and up y
function frame() {
  const a = P35.along, o = P35.out;              // along the frontage (+x side), out toward the street
  const z0 = P35.streetZ(BH.x0);
  const at = (u, d, y) => [BH.x0 + a[0] * u + o[0] * d, y, z0 + a[1] * u + o[1] * d];
  const uOf = x => (x - BH.x0) / a[0];
  return { a, o, at, uOf, L: uOf(BH.x1) };
}

// the stroke font for the cast letters (unit cap height; x advance per glyph): P I E R 3 5 and the centred dot
export const GLYPH = {
  P: { w: 0.62, s: [[[0, 0], [0, 1], [0.45, 1], [0.58, 0.88], [0.58, 0.62], [0.45, 0.5], [0, 0.5]]] },
  I: { w: 0.28, s: [[[0.14, 0], [0.14, 1]], [[0, 0], [0.28, 0]], [[0, 1], [0.28, 1]]] },
  E: { w: 0.56, s: [[[0.55, 0], [0, 0], [0, 1], [0.55, 1]], [[0, 0.52], [0.42, 0.52]]] },
  R: { w: 0.62, s: [[[0, 0], [0, 1], [0.45, 1], [0.58, 0.88], [0.58, 0.64], [0.45, 0.52], [0, 0.52]], [[0.3, 0.52], [0.6, 0]]] },
  3: { w: 0.56, s: [[[0.02, 0.9], [0.14, 1], [0.42, 1], [0.54, 0.88], [0.54, 0.66], [0.4, 0.54], [0.2, 0.54]], [[0.4, 0.54], [0.56, 0.4], [0.56, 0.12], [0.43, 0], [0.13, 0], [0, 0.1]]] },
  5: { w: 0.56, s: [[[0.54, 1], [0.06, 1], [0.03, 0.55], [0.38, 0.6], [0.55, 0.45], [0.55, 0.15], [0.4, 0], [0.12, 0], [0, 0.1]]] },
  1: { w: 0.36, s: [[[0.04, 0.8], [0.2, 1], [0.2, 0]], [[0.04, 0], [0.36, 0]]] },
  N: { w: 0.58, s: [[[0, 0], [0, 1], [0.55, 0], [0.55, 1]]] },
  A: { w: 0.62, s: [[[0, 0], [0.3, 1], [0.6, 0]], [[0.12, 0.4], [0.48, 0.4]]] },
  V: { w: 0.62, s: [[[0, 1], [0.3, 0], [0.6, 1]]] },
  Y: { w: 0.62, s: [[[0, 1], [0.3, 0.5], [0.6, 1]], [[0.3, 0.5], [0.3, 0]]] },
  G: { w: 0.6, s: [[[0.55, 0.85], [0.4, 1], [0.15, 1], [0, 0.8], [0, 0.2], [0.15, 0], [0.4, 0], [0.55, 0.15], [0.55, 0.45], [0.32, 0.45]]] },
  T: { w: 0.6, s: [[[0, 1], [0.6, 1]], [[0.3, 1], [0.3, 0]]] },
  C: { w: 0.58, s: [[[0.55, 0.85], [0.4, 1], [0.15, 1], [0, 0.8], [0, 0.2], [0.15, 0], [0.4, 0], [0.55, 0.15]]] },
  K: { w: 0.58, s: [[[0, 0], [0, 1]], [[0.55, 1], [0, 0.45]], [[0.18, 0.62], [0.55, 0]]] },
  S: { w: 0.6, s: [[[0.55, 0.85], [0.4, 1], [0.12, 1], [0, 0.85], [0, 0.62], [0.12, 0.52], [0.45, 0.48], [0.57, 0.38], [0.57, 0.13], [0.45, 0], [0.12, 0], [0, 0.15]]] },
  ' ': { w: 0.5, s: [], dot: true },
};
export function letters(text, at, H, depth, B, mat) {
  // centred on 'at' (a function (u, v) -> world point on the frieze, u along, v up)
  const sc = H, gap = 0.18;
  const W = [...text].reduce((w, c) => w + (GLYPH[c] || GLYPH[' ']).w + gap, -gap) * sc;
  let u = -W / 2;
  for (const c of text) {
    const g = GLYPH[c] || GLYPH[' '];
    for (const st of g.s) for (let i = 0; i < st.length - 1; i++) {
      const p = st[i], q = st[i + 1];
      B.add(mat, beam(at(u + p[0] * sc, p[1] * sc, depth), at(u + q[0] * sc, q[1] * sc, depth), 0.11 * H, 0.08, { seed: 0.5 }), 'letters');
    }
    if (g.dot) B.add(mat, box(at(u + g.w * sc * 0.5, 0.45 * sc, depth), [0.16 * H, 0.16 * H, 0.08]), 'letters');
    u += (g.w + gap) * sc;
  }
}

export function buildBulkhead(world, M, out) {
  const r = rng(3533);
  const B = new Bins(world, 'bulkhead');
  const F = frame(), D = P35.deck;
  const L = F.L, dep = BH.depth;
  const n = [F.o[0], 0, F.o[1]], uAx = [F.a[0], 0, F.a[1]];

  // ---- the bulkhead wharf: the deck strip under the frontage from its west end to Pier 33's east side, its fascia
  // on the water side, piles in rows
  const back = d => F.at(0, -d, D);
  // (two pieces: west of Pier 35's deck and east of it; Pier 35's own deck runs to the street face between)
  const dw = dep + 1.5, cosA = F.a[0], backAt = x => P35.streetZ(x) - dw / cosA;
  const west = [[F.at(0, 0, 0)[0], F.at(0, 0, 0)[2]], [P35.x0, P35.streetZ(P35.x0)], [P35.x0, backAt(P35.x0)], [F.at(0, -dw, 0)[0], F.at(0, -dw, 0)[2]]];
  const east = [[P35.x1, P35.streetZ(P35.x1)], [F.at(L, 0, 0)[0], F.at(L, 0, 0)[2]], [F.at(L, -dw, 0)[0], F.at(L, -dw, 0)[2]], [P35.x1, backAt(P35.x1)]];
  for (const poly of [west, east]) {
    B.add(M.deck, flatPoly(poly, D, { seed: 0.7 }), 'wharf');
    B.add(M.pile, flatPoly(poly, D - SUB.slab, { down: true, seed: 0.7 }), 'wharf');
    B.add(M.pile, polySides(poly, D - 1.25, D, 0.4), 'wharf');
  }
  const piles = [];
  for (let u = 2; u < L - 1; u += 3.5) for (const d of [-2.5, -6.5, -10.5, -14.0]) {
    const p = F.at(u, d, 0);
    if (p[0] > P35.x0 - 0.5 && p[0] < P35.x1 + 0.5 && p[2] < P35.streetZ(p[0])) continue;   // (Pier 35's own deck is above)
    piles.push(p);
  }
  const pg = beam([0, SUB.toe, 0], [0, D - SUB.slab, 0], 0.45, 0.45, { up: [0, 0, 1], chamfer: 0.04, capA: false });
  const pm = world.mesh(pg, M.pile, { count: piles.length, name: 'bulkhead:wharf piles' });
  piles.forEach((p, i) => pm.setMatrixAt(i, new T.Matrix4().makeTranslation(p[0], 0, p[2]))); pm.instanceMatrix.needsUpdate = true; pm.computeBoundingSphere();

  // ---- the wings: a solid block (the back and the ends plain), the street facade with its bays
  const W = BH.wing, P = BH.pav;
  const pavU = BH.pavilions.map(p => F.uOf(p.x));
  const inPav = u => pavU.some(c => Math.abs(u - c) < P.w / 2 + 0.01);
  // the block (back, roof, ends) as one prism
  const blockPoly = [F.at(0, 0, 0), F.at(L, 0, 0), F.at(L, -dep, 0), F.at(0, -dep, 0)].map(p => [p[0], p[2]]);
  B.add(M.plaster, polySides([blockPoly[1], blockPoly[2], blockPoly[3], blockPoly[0]], D, D + W.h + W.parapet, 0.3, false), 'wings');
  B.add(M.flat('bulkhead roof', '#565d66', { lamps: false }), flatPoly([F.at(0.3, -0.3, 0), F.at(L - 0.3, -0.3, 0), F.at(L - 0.3, -dep + 0.3, 0), F.at(0.3, -dep + 0.3, 0)].map(p => [p[0], p[2]]), D + W.h - 0.2, { seed: 0.2 }), 'roof');
  // the parapet's inner face and coping round the roof
  const copeY = D + W.h + W.parapet;
  for (const [a, b] of [[[0, 0], [L, 0]], [[L, 0], [L, -dep]], [[L, -dep], [0, -dep]], [[0, -dep], [0, 0]]]) {
    B.add(M.plaster, beam(F.at(a[0], a[1], copeY), F.at(b[0], b[1], copeY), 0.5, 0.18, { seed: r() }), 'coping');
  }
  // the street facade: bays of 4.8 m between rusticated pilasters; openings by the bay's role
  const segs = [];      // [u0, u1] stretches of wing between pavilions
  { let u = 0; const cs = pavU.slice().sort((a, b) => a - b); for (const c of cs) { segs.push([u, c - P.w / 2]); u = c + P.w / 2; } segs.push([u, L]); }
  const ops = [], wo = [];
  let bayN = 0;
  for (const [s0, s1] of segs) {
    const nb = Math.max(1, Math.round((s1 - s0) / W.bay)), bw = (s1 - s0) / nb;
    for (let b = 0; b < nb; b++) {
      const ua = s0 + b * bw, ub = ua + bw, cu = (ua + ub) / 2;
      bayN++;
      // the upper storey: a pair of small windows (photo 05: ~1.1 x 1.5 m)
      ops.push({ u0: cu - 1.45, u1: cu - 0.35, v0: 5.0, v1: 6.5, depth: 0.25, kind: 'win' }, { u0: cu + 0.35, u1: cu + 1.45, v0: 5.0, v1: 6.5, depth: 0.25, kind: 'win' });
      // the ground storey: mostly tall windows; every 7th a big glazed entrance or a cargo door (07: the left wing's
      // grey roll-up), a man door now and then
      const k = bayN % 7;
      if (k === 3) ops.push({ u0: ua + 0.55, u1: ub - 0.55, v0: 0, v1: 4.0, depth: 0.35, kind: bayN % 2 ? 'door' : 'glaze' });
      else if (k === 5) ops.push({ u0: cu - 0.6, u1: cu + 0.6, v0: 0, v1: 2.6, depth: 0.3, kind: 'mandoor' });
      else ops.push({ u0: cu - 0.9, u1: cu + 0.9, v0: 1.0, v1: 3.6, depth: 0.3, kind: 'win' });
      // the pilaster at the bay's west edge (rusticated: the grooves are the plaster shader's lines)
      wo.push(ua);
    }
    wo.push(s1);
  }
  const o = F.at(0, 0, D);
  for (const [s0, s1] of segs) B.add(M.plaster, quads(wallWithOpenings(o, uAx, n, s0, s1, 0, W.h, ops.filter(op => op.u0 >= s0 - 0.01 && op.u1 <= s1 + 0.01)), r()), 'facade');
  // the wing's wall behind each pavilion (the pavilion's own face stands proud of it; its arch opens through both)
  for (const c of pavU) for (const [a, b] of [[c - BH.pav.w / 2, c - BH.pav.archIn - 0.4], [c + BH.pav.archIn + 0.4, c + BH.pav.w / 2]]) B.add(M.plaster, quads([wallRect(o, uAx, n, a, b, 0, W.h)], r()), 'facade');
  for (const op of ops) {
    if (inPav((op.u0 + op.u1) / 2)) continue;
    const q = wallRect(o, uAx, n, op.u0, op.u1, op.v0, op.v1, -op.depth);
    B.add(op.kind === 'door' || op.kind === 'mandoor' ? M.door : M.sash, quads([q], r()), 'openings');
    if (op.kind === 'win') B.add(M.plaster, fbox(F, (op.u0 + op.u1) / 2, 0.06, D + op.v0 - 0.08, op.u1 - op.u0 + 0.3, 0.16, 0.2), 'sills');
  }
  for (const u of wo) if (!inPav(u)) B.add(M.plaster, slab(F, u, 0.12, 0.62, D, D + W.h), 'pilasters');
  // belt course, cornice, base course
  B.add(M.plaster, beam(F.at(0, 0.1, D + W.ground + 0.1), F.at(L, 0.1, D + W.ground + 0.1), 0.25, 0.22, { seed: 0.3 }), 'mouldings');
  B.add(M.plaster, beam(F.at(0, 0.25, D + W.h - 0.25), F.at(L, 0.25, D + W.h - 0.25), 0.55, 0.45, { seed: 0.3 }), 'mouldings');
  B.add(M.plaster, beam(F.at(0, 0.08, D + 0.35), F.at(L, 0.08, D + 0.35), 0.18, 0.7, { seed: 0.3 }), 'mouldings');

  // ---- the pavilions
  for (const [k, pv] of BH.pavilions.entries()) buildPavilion(world, M, B, F, pavU[k], pv, r, out);

  // the flags on the pavilions' poles: the US flag (photo 05) waving in the WSW breeze, a pure function of t
  if (out.flags) buildFlags(world, out.flags);
  const meshes = B.flush();
  out.bulkhead = { L: +L.toFixed(1), bays: bayN, tri: B.tris, meshes: meshes.concat([pm]), piles: piles.map(p => [+p[0].toFixed(2), +p[2].toFixed(2), 0.25]) };
  return out.bulkhead;
}
// a box in the frontage's frame: centre at frontage coordinate u, d out from the face, height y; size along, up, out
function fbox(F, u, d, y, su, sy, sd) { const g = box([0, 0, 0], [su, sy, sd]); g.applyMatrix4(new T.Matrix4().makeRotationY(Math.atan2(-F.a[1], F.a[0]))); const p = F.at(u, d, y); g.translate(p[0], p[1], p[2]); return g; }
// a pilaster: a slab standing proud of the facade at frontage coordinate u
function slab(F, u, proud, w, y0, y1) {
  const g = box([0, (y0 + y1) / 2, 0], [w, y1 - y0, proud * 2]);
  const p = F.at(u, 0, 0);
  g.applyMatrix4(new T.Matrix4().makeRotationY(Math.atan2(-F.a[1], F.a[0])));
  g.translate(p[0], 0, p[2]);
  return g;
}

function buildPavilion(world, M, B, F, uc, pv, r, out) {
  const P = BH.pav, D = P35.deck, pr = P.proj;
  const ua = uc - P.w / 2, ub = uc + P.w / 2;
  const rot = new T.Matrix4().makeRotationY(Math.atan2(-F.a[1], F.a[0]));
  // a box in the pavilion's frame: centre (u, d, y), size (along, up, out)
  const pbox = (u, d, y, su, sy, sd, mat = M.plaster, part = 'pavilion') => {
    const g = box([0, 0, 0], [su, sy, sd]); g.applyMatrix4(rot); const p = F.at(u, d, y); g.translate(p[0], p[1], p[2]); B.add(mat, g, part); return g;
  };
  // the body: the face with the arch's opening, projecting pr from the wings, up to its cornice
  const o = F.at(ua, pr, D), uAx = [F.a[0], 0, F.a[1]], n = [F.o[0], 0, F.o[1]];
  // the arch's opening as a polygon in the face: build the face as quads around a rectangle + the arch's spandrels
  const Rin = P.archIn, Rout = P.archOut, sp = P.spring, cx = P.w / 2;
  const face = [];
  // the wall left and right of the opening, below the springing and the piers above it
  face.push(wallRect(o, uAx, n, 0, cx - Rin, 0, P.cornice));
  face.push(wallRect(o, uAx, n, cx + Rin, P.w, 0, P.cornice));
  // the spandrel between the arch and the cornice: a fan of quads following the inner radius
  const N = 25;
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N;
    const p0 = [cx - Rin * Math.cos(a0), sp + Rin * Math.sin(a0)], p1 = [cx - Rin * Math.cos(a1), sp + Rin * Math.sin(a1)];
    const top = P.cornice;
    face.push(orient([ptOn(o, uAx, p0[0], p0[1]), ptOn(o, uAx, p1[0], p1[1]), ptOn(o, uAx, p1[0], top), ptOn(o, uAx, p0[0], top)], [[p0[0], p0[1]], [p1[0], p1[1]], [p1[0], top], [p0[0], top]], n));
    // the voussoirs: wedges standing 0.18 m proud, separated by a joint (every other face a shade apart: the shader's seed)
    const g = voussoir(o, uAx, n, cx, sp, Rin, Rout, a0 + 0.012, a1 - 0.012, 0.18, i === 12 ? 0.25 : 0);
    B.add(M.plaster, g, 'voussoirs');
    // the soffit of the arch (its intrados) back to the door
    const am = (a0 + a1) / 2;
    face.push(orient([ptOn(o, uAx, p0[0], p0[1]), ptOn(o, uAx, p1[0], p1[1]), ptBack(o, uAx, n, p1[0], p1[1], 1.2), ptBack(o, uAx, n, p0[0], p0[1], 1.2)], [[0, 0], [1, 0], [1, 1.2], [0, 1.2]], [Math.cos(am) * uAx[0], -Math.sin(am), Math.cos(am) * uAx[2]]));
  }
  // the jambs below the springing
  face.push(orient([ptOn(o, uAx, cx - Rin, 0), ptOn(o, uAx, cx - Rin, sp), ptBack(o, uAx, n, cx - Rin, sp, 1.2), ptBack(o, uAx, n, cx - Rin, 0, 1.2)], [[0, 0], [sp, 0], [sp, 1.2], [0, 1.2]], uAx));
  face.push(orient([ptOn(o, uAx, cx + Rin, 0), ptOn(o, uAx, cx + Rin, sp), ptBack(o, uAx, n, cx + Rin, sp, 1.2), ptBack(o, uAx, n, cx + Rin, 0, 1.2)], [[0, 0], [sp, 0], [sp, 1.2], [0, 1.2]], [-uAx[0], 0, -uAx[2]]));
  B.add(M.plaster, quads(face, r()), 'pavilion');
  // the door (lower) and the lunette's steel sash (in the arch), set back 1.2 m
  const back = 1.2;
  B.add(M.door, quads([wallRect(o, uAx, n, cx - Rin, cx + Rin, 0, sp, -back)], r()), 'arch door');
  const lun = [];
  for (let i = 0; i < 24; i++) {
    const a0 = Math.PI * i / 24, a1 = Math.PI * (i + 1) / 24;
    lun.push([ptBack(o, uAx, n, cx, sp, back), ptBack(o, uAx, n, cx - Rin * Math.cos(a0), sp + Rin * Math.sin(a0), back), ptBack(o, uAx, n, cx - Rin * Math.cos(a1), sp + Rin * Math.sin(a1), back)]);
  }
  B.add(M.lunette || M.sash, fan(lun, n, o, uAx), 'lunette');
  // the sides of the projection (returns to the wings)
  for (const [u, sg] of [[0, -1], [P.w, 1]]) {
    B.add(M.plaster, quads([orient([F.at(ua + u, 0, D), F.at(ua + u, pr, D), F.at(ua + u, pr, D + P.cornice), F.at(ua + u, 0, D + P.cornice)], [[0, 0], [pr, 0], [pr, P.cornice], [0, P.cornice]], [uAx[0] * sg, 0, uAx[2] * sg])], r()), 'pavilion');
  }
  // the pilaster towers each side (4.5 m wide, up to 9.8 m), their caps; the pediment between them
  for (const s of [-1, 1]) {
    const tu = uc + s * (P.w / 2 - P.tower / 2);
    pbox(tu, pr + 0.12, D + P.towerH / 2, P.tower, P.towerH, 0.6);
    pbox(tu, pr + 0.2, D + P.towerH - 0.25, P.tower + 0.4, 0.5, 0.9);              // the cap's cornice
    pbox(tu, pr + 0.2, D + 4.3, P.tower + 0.2, 0.25, 0.75);                         // the belt
    // the tower's side and back above the wing's roof
    pbox(tu, pr / 2 - 4.0, D + (BH.wing.h + P.towerH) / 2, P.tower, P.towerH - BH.wing.h, 8.5);
  }
  // the entablature over the arch and the pediment: a triangular gable from the cornice to the apex, the dentils
  const pu0 = ua + P.tower - 0.3, pu1 = ub - P.tower + 0.3, pm = (pu0 + pu1) / 2;
  pbox(pm, pr + 0.15, D + P.cornice + 0.2, pu1 - pu0, 0.4, 0.8);
  const tri = (dd) => [F.at(pu0, pr + dd, D + P.cornice + 0.4), F.at(pu1, pr + dd, D + P.cornice + 0.4), F.at(pm, pr + dd, D + P.apex)];
  const A = tri(0.0), Bk = tri(-9.0);
  B.add(M.plaster, triQuad(A, n), 'pediment');
  // the pediment's raking cornices and roof slopes back to the shed
  for (const [i0, sg] of [[0, 1], [1, -1]]) {
    const p = A[i0], q = A[2], pb = Bk[i0], qb = Bk[2];
    B.add(M.plaster, beam([p[0] + n[0] * 0.25, p[1] + 0.1, p[2] + n[2] * 0.25], [q[0] + n[0] * 0.25, q[1] + 0.1, q[2] + n[2] * 0.25], 0.5, 0.35, { seed: 0.3 }), 'pediment');
    B.add(M.flat('pavilion roof', '#5a616a', { lamps: false }), quads([orient([p, q, qb, pb], [[0, 0], [1, 0], [1, 9], [0, 9]], [0, 1, 0])], 0.4), 'pediment');
  }
  B.add(M.plaster, triQuad(Bk, [-n[0], 0, -n[2]]), 'pediment');
  // dentils under the raking cornice and along the entablature (every 0.32 m)
  for (let u = pu0 + 0.3; u < pu1 - 0.2; u += 0.32) pbox(u, pr + 0.32, D + P.cornice + 0.05, 0.16, 0.18, 0.12, M.plaster, 'dentils');
  // the cast letters in the frieze over the arch (photo 06, 09: "PIER·35" ~0.85 m caps)
  const at = (u, v, d) => F.at(pm + u, pr + 0.06 + d, D + P.cornice + 0.75 + v);
  letters(pv.label.replace(' ', ' '), at, 0.78, 0.0, B, M.plaster);
  // the flagpole on the apex with its flag (the US flag's red-white-blue at this distance: a stylised field)
  const top = F.at(pm, pr - 0.3, D + P.apex);
  B.add(M.flat('flagpole', '#e8e6e0', { spec: 0.3, rough: 0.4 }), cylinder(top, [top[0], D + P.pole, top[2]], 0.06, 8), 'flagpole');
  out.flags = (out.flags || []).concat([[top[0], D + P.pole - 0.2, top[2]]]);
}
const ptOn = (o, u, a, v) => [o[0] + u[0] * a, o[1] + v, o[2] + u[2] * a];
const ptBack = (o, u, n, a, v, d) => [o[0] + u[0] * a - n[0] * d, o[1] + v, o[2] + u[2] * a - n[2] * d];
function triQuad(p, want) { return quads([orient([p[0], p[1], p[2], p[2]], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]], want)], 0.3); }
function fan(list, n, o, u) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (const [a, b, c] of list) {
    const k = pos.length / 3;
    for (const p of [a, b, c]) { pos.push(...p); nrm.push(n[0], 0, n[2]); uv.push((p[0] - o[0]) * u[0] + (p[2] - o[2]) * u[2], p[1] - o[1]); }
    idx.push(k, k + 1, k + 2);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(0.5), 1));
  g.setIndex(idx);
  // face the way n points (fix the winding)
  const p = g.attributes.position;
  for (let i = 0; i < idx.length; i += 3) {
    const ax = p.getX(idx[i]), ay = p.getY(idx[i]), az = p.getZ(idx[i]);
    const e1 = [p.getX(idx[i + 1]) - ax, p.getY(idx[i + 1]) - ay, p.getZ(idx[i + 1]) - az], e2 = [p.getX(idx[i + 2]) - ax, p.getY(idx[i + 2]) - ay, p.getZ(idx[i + 2]) - az];
    const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (c[0] * n[0] + c[2] * n[2] < 0) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
  g.setIndex(idx);
  return g;
}
// a voussoir: the wedge between radii Rin and Rout over angles a0..a1, standing 'proud' off the face
function voussoir(o, u, n, cx, sp, Rin, Rout, a0, a1, proud, key) {
  const P = (R, a, d) => { const x = cx - R * Math.cos(a), y = sp + R * Math.sin(a); return [o[0] + u[0] * x + n[0] * d, o[1] + y, o[2] + u[2] * x + n[2] * d]; };
  const R2 = Rout + key;
  const q = [];
  q.push(orient([P(Rin, a0, proud), P(Rin, a1, proud), P(R2, a1, proud), P(R2, a0, proud)], [[0, 0], [1, 0], [1, 1], [0, 1]], n));          // its face
  const am = (a0 + a1) / 2, rad = a => [-Math.cos(a) * u[0], Math.sin(a), -Math.cos(a) * u[2]], tan = a => [Math.sin(a) * u[0], Math.cos(a), Math.sin(a) * u[2]];
  q.push(orient([P(R2, a0, 0), P(R2, a1, 0), P(R2, a1, proud), P(R2, a0, proud)], [[0, 0], [1, 0], [1, 0.2], [0, 0.2]], rad(am)));       // its outer edge
  q.push(orient([P(Rin, a0, 0), P(R2, a0, 0), P(R2, a0, proud), P(Rin, a0, proud)], [[0, 0], [1, 0], [1, 0.2], [0, 0.2]], tan(a0).map(x => -x)));
  q.push(orient([P(Rin, a1, 0), P(R2, a1, 0), P(R2, a1, proud), P(Rin, a1, proud)], [[0, 0], [1, 0], [1, 0.2], [0, 0.2]], tan(a1)));
  return quads(q, 0.5);
}

// a flag: a 2.4 x 1.4 m grid hung from the pole's top, waving in its vertex shader (a travelling wave whose amplitude
// grows away from the hoist; its phase from uTime, the same at every scale: no rate varying in space)
function buildFlags(world, tops) {
  const nu = 16, nv = 8, W = 2.4, H = 1.4;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { pos.push(i / nu * W, -j / nv * H, 0); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i; idx.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new T.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(0.5), 1)); g.setIndex(idx);
  const mat = world.mat({
    name: 'flag', lines: 1, double: true, uniforms: {},
    varyings: 'varying vec2 vF;',
    object: /* glsl */`void objVertex(inout vec3 p, inout vec3 n, inout vec2 uv) {
      float u = uv.x, ph = uTime * 4.2 - u * 7.0;
      p.z += sin(ph) * 0.22 * u + sin(ph * 1.7 + uv.y * 2.0) * 0.06 * u;
      p.y -= (1.0 - cos(sin(ph) * 0.3)) * 0.2 * u;
      n = normalize(vec3(-cos(ph) * 0.22 * 7.0 / 2.4 * u, 0.0, 1.0));
    }`,
    vertex: 'void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vF = uv; }',
    surface: /* glsl */`void smain(inout Surface s, vec3 P, vec3 V) {
      vec2 f = vF;
      vec3 red = vec3(0.6, 0.04, 0.06), white = vec3(0.92), blue = vec3(0.05, 0.08, 0.3);
      float stripe = mod(floor(f.y * 13.0), 2.0);
      vec3 c = mix(red, white, stripe);
      if (f.x < 0.4 && f.y < 7.0 / 13.0) c = blue + vec3(0.6) * step(0.75, fract(f.x * 15.0) * fract(f.y * 13.0 * 1.5) * 1.9);
      s.albedo = c; s.rough = 0.9; s.wrap = 0.3;
    }`,
  });
  for (const [x, y, z] of tops) {
    const m = new T.Mesh(g, mat.color);
    // fly downwind: the breeze is from 245 deg true, so the fly points toward ~65 deg (east-north-east)
    const [dx, dz] = P.atBearing((P.WATER.wind.from + 180) % 360, 1);
    m.position.set(x, y, z); m.rotation.y = Math.atan2(-dz, dx); m.translateX(0.055);       // (local +x onto the downwind direction; the hoist on the pole's skin)
    world.add(m, { mats: mat });
  }
}
