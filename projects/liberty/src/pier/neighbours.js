// liberty/src/pier/neighbours.js: the finger piers east of Pier 35 (B4): Pier 33 (Alcatraz Landing: a flat-roofed shed
// with skylight monitors along its ridge, photos 07, 12; the queue canopies at its root, photo 46), Pier 31, and the
// cruise terminal's Pier 27 and Pier 23 toward the near box's edge. Outlines traced on z19/z18 (site.js); walls and
// doors as Pier 35's (photo 12: Pier 33's grey-beige concrete wall, rows of steel sash high up, brown roll-up doors).
import { Bins } from 'scene3d/kit/arch/kit.js';
import { rng } from 'scene3d/util.js';
import { P33, P31, LANDING, P27, P23 } from './site.js';
import { box, beam, merge, cylinder, flatPoly, polySides, quads, orient, wallRect, wallWithOpenings, latheAt } from './geo.js';
import { SUB } from './pier35.js';

const T = window.THREE;
const D = 2.95;

// a finger pier from its tip's corners (west, east) and its root's (west, east): the deck on piles, a shed inset by the
// aprons, its walls with doors and a sash band, a flat roof with monitors, fenders hung on the edges
function fingerPier(world, M, B, { tip, root, westApron = 3.0, eastApron = 3.0, tipApron = 2.0, eave = 9.0, monitors = 8, name }, r) {
  const [tw, te] = tip, [rw, re] = root;
  const deck = [tw, te, re, rw];
  B.add(M.deck, flatPoly(deck, D, { seed: r() }), name + ' deck');
  B.add(M.pile, flatPoly(deck, D - SUB.slab, { down: true, seed: r() }), name + ' deck');
  B.add(M.pile, polySides(deck, D - 1.25, D, 0.4), name + ' deck');
  // the axis: from the root's middle to the tip's middle
  const tm = [(tw[0] + te[0]) / 2, (tw[1] + te[1]) / 2], rm = [(rw[0] + re[0]) / 2, (rw[1] + re[1]) / 2];
  const ax = [tm[0] - rm[0], tm[1] - rm[1]], L = Math.hypot(...ax), u = [ax[0] / L, ax[1] / L], n = [-u[1], u[0]];
  const W = Math.hypot(te[0] - tw[0], te[1] - tw[1]);
  // the shed: a box rotated onto the axis, inset by the aprons
  const sw = W - westApron - eastApron, sl = L - tipApron - 1.0;
  // (n points east: the shed's centre sits half the aprons' difference east of the axis when the west apron is wider)
  const c = [rm[0] + u[0] * (1.0 + sl / 2) + n[0] * (westApron - eastApron) / 2, rm[1] + u[1] * (1.0 + sl / 2) + n[1] * (westApron - eastApron) / 2];
  const a = Math.atan2(-u[1], u[0]);
  // the long walls with openings: each side a wall frame (o at the root end, along u)
  const bay = 6.1, nb = Math.floor(sl / bay);
  for (const sg of [-1, 1]) {
    const o = [c[0] - u[0] * sl / 2 + n[0] * sg * sw / 2, D, c[1] - u[1] * sl / 2 + n[1] * sg * sw / 2], U = [u[0], 0, u[1]], N = [n[0] * sg, 0, n[1] * sg];
    const ops = [];
    for (let b = 0; b < nb; b++) {
      const ua = b * bay;
      ops.push({ u0: ua + 0.8, u1: ua + bay - 0.8, v0: eave - 3.1, v1: eave - 1.0, depth: 0.2, kind: 'sash' });
      if ((b + (sg > 0 ? 1 : 0)) % 3 === 0) ops.push({ u0: ua + 1.0, u1: ua + bay - 1.0, v0: 0, v1: 4.6, depth: 0.3, kind: 'door' });
    }
    B.add(M.wall, quads(wallWithOpenings(o, U, N, 0, sl, 0, eave, ops), r()), name + ' walls');
    for (const op of ops) B.add(op.kind === 'door' ? M.door : M.sash, quads([wallRect(o, U, N, op.u0, op.u1, op.v0, op.v1, -op.depth)], r()), name + ' openings');
    // wall-pack heads every second bay (their glow is the lens; their pools are the stage's business at this distance)
    for (let b = 1; b < nb; b += 2) { const p = [o[0] + U[0] * b * bay + N[0] * 0.15, D + 5.2, o[2] + U[2] * b * bay + N[2] * 0.15]; B.add(M.lens, box(p, [0.32, 0.08, 0.32]), name + ' lamps'); }
  }
  // the end walls and the roof (flat, a parapet), the monitors along the centre (07: low glazed boxes)
  const shedPoly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [c[0] + u[0] * i * sl / 2 + n[0] * j * sw / 2, c[1] + u[1] * i * sl / 2 + n[1] * j * sw / 2]);
  for (const [p, q, sg] of [[shedPoly[1], shedPoly[2], 1], [shedPoly[3], shedPoly[0], -1]]) {
    B.add(M.wall, quads([orient([[p[0], D, p[1]], [q[0], D, q[1]], [q[0], D + eave, q[1]], [p[0], D + eave, p[1]]], [[0, 0], [sw, 0], [sw, eave], [0, eave]], [u[0] * sg, 0, u[1] * sg])], r()), name + ' walls');
  }
  B.add(M.flat('pier33 roof', '#b9b9b4', { lamps: false }), flatPoly(shedPoly, D + eave, { seed: r() }), name + ' roof');
  for (let k = 0; k < monitors; k++) {
    const t = (k + 0.5) / monitors - 0.5, p = [c[0] + u[0] * t * sl * 0.92, D + eave + 0.9, c[1] + u[1] * t * sl * 0.92];
    const g = box([0, 0, 0], [8.5, 1.8, 7.0], { seed: r() }); g.rotateY(a); g.translate(p[0], p[1], p[2]);
    B.add(M.sash, g, name + ' monitors');
  }
  // fenders on both edges (orange cylinders, 07: on Pier 33 too)
  for (const [p, q] of [[tw, rw], [te, re]]) {
    const ll = Math.hypot(q[0] - p[0], q[1] - p[1]), uu = [(q[0] - p[0]) / ll, (q[1] - p[1]) / ll];
    const side = p === tw ? -1 : 1, off = [n[0] * side * 0.9, n[1] * side * 0.9];
    for (let s = 12; s < ll - 10; s += 24) {
      const x = p[0] + uu[0] * s + off[0], z = p[1] + uu[1] * s + off[1];
      B.add(M.fender, cylinder([x - uu[0] * 1.2, D - 1.6, z - uu[1] * 1.2], [x + uu[0] * 1.2, D - 1.6, z + uu[1] * 1.2], 0.55, 12, r()), name + ' fenders');
      for (const k of [-0.8, 0.8]) B.add(M.iron, beam([p[0] + uu[0] * s - off[0] * 0.15 + uu[0] * k, D + 0.05, p[1] + uu[1] * s - off[1] * 0.15 + uu[1] * k], [x + uu[0] * k, D - 1.1, z + uu[1] * k], 0.04, 0.04), name + ' chains');
    }
  }
  // piles: a 3.6 x 3.5 m grid under the deck (instanced by the caller)
  const piles = [];
  for (let s = 1.5; s < L - 0.5; s += 3.5) for (let k = 0.6; k < W - 0.4; k += 3.6) piles.push([rm[0] + u[0] * s + n[0] * (k - W / 2), rm[1] + u[1] * s + n[1] * (k - W / 2)]);
  return { piles, axis: { root: rm, tip: tm, L: +L.toFixed(1), W: +W.toFixed(1) } };
}

export function buildNeighbours(world, M, out) {
  const r = rng(3301);
  const B = new Bins(world, 'neighbours');
  const p33 = fingerPier(world, M, B, { ...P33, name: 'pier33' }, r);
  const p31 = fingerPier(world, M, B, { ...P31, name: 'pier31' }, r);
  // Alcatraz Landing's apron
  B.add(M.deck, flatPoly(LANDING.deck, D, { seed: 0.6 }), 'landing');
  B.add(M.pile, flatPoly(LANDING.deck, D - SUB.slab, { down: true, seed: 0.6 }), 'landing');
  B.add(M.pile, polySides(LANDING.deck, D - 1.25, D, 0.6), 'landing');
  { const [[a0, b0], [a1, b1]] = LANDING.canopy; B.add(M.flat('landing canopy', '#f2f4f6', { lamps: false }), box([(a0 + a1) / 2, D + 4.6, (b0 + b1) / 2], [a1 - a0, 0.5, b1 - b0]), 'landing');
    for (const [x, z] of [[a0, b0], [a1, b0], [a0, b1], [a1, b1]]) B.add(M.flat('landing posts', '#dfe2e4'), cylinder([x, D, z], [x, D + 4.4, z], 0.12, 8), 'landing'); }
  // Piers 29/27 (the James R. Herman cruise terminal, 2014) and Pier 23 at the box's east edge (site.js P27, P23)
  for (const [nm, poly] of [['pier27', P27.deck], ['pier23', P23.deck]]) {
    B.add(M.deck, flatPoly(poly, D, { seed: 0.4 }), nm);
    B.add(M.pile, flatPoly(poly, D - SUB.slab, { down: true, seed: 0.4 }), nm);
    B.add(M.pile, polySides(poly, D - 1.25, D, 0.4), nm);
  }
  B.add(M.flat('terminal glass', '#b9c6cc', { lamps: false }), polySides(P27.terminal, D, D + 12, 0.5), 'pier27');
  B.add(M.flat('terminal roof', '#d8d8d2', { lamps: false }), flatPoly(P27.terminal, D + 12, { seed: 0.5 }), 'pier27');
  B.add(M.wall, polySides(P27.arm, D, D + 9, 0.5), 'pier27');
  B.add(M.flat('pier29 roof', '#7c7f80', { lamps: false }), flatPoly(P27.arm, D + 9, { seed: 0.5 }), 'pier27');
  for (const [poly, h] of [[P23.shed, 9], [P23.root, 8]]) {
    B.add(M.wall, polySides(poly, D, D + h, 0.5), 'pier23');
    B.add(M.flat('pier23 roof', '#9da0a0', { lamps: false }), flatPoly(poly, D + h, { seed: 0.5 }), 'pier23');
  }
  // Alcatraz Landing (photo 46, z19): white tensile canopies on white masts at Pier 33's root's east side
  const canopy = [];
  const [[t0, u0], [t1, u1]] = LANDING.tents;
  for (let i = 0; i < 6; i++) {
    const x = t0 + 3 + (i % 3) * (t1 - t0 - 6) / 2, z = u0 + 3 + Math.floor(i / 3) * (u1 - u0 - 6);
    canopy.push(cylinder([x, D, z], [x, D + 5.65, z], 0.1, 8));
    const g = new T.ConeGeometry(4.4, 1.5, 4, 1, true); g.rotateY(Math.PI / 4); g.translate(x, D + 4.9, z);
    g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(g.attributes.position.count).fill(0.5), 1));
    canopy.push(g);
  }
  B.add(M.flat('canopy', '#eef1f4', { lamps: false, double: true }), merge(canopy), 'alcatraz landing');
  // the piles of the two finger piers, instanced
  const piles = p33.piles.concat(p31.piles);
  const pg = beam([0, SUB.toe, 0], [0, D - SUB.slab, 0], 0.45, 0.45, { up: [0, 0, 1], chamfer: 0.04, capA: false });
  const pm = world.mesh(pg, M.pile, { count: piles.length, name: 'neighbours:piles' });
  piles.forEach(([x, z], i) => pm.setMatrixAt(i, new T.Matrix4().makeTranslation(x, 0, z))); pm.instanceMatrix.needsUpdate = true; pm.computeBoundingSphere();
  const meshes = B.flush();
  out.neighbours = { pier33: p33.axis, pier31: p31.axis, piles: piles.length, tri: B.tris, meshes: meshes.concat([pm]) };
  return out.neighbours;
}
