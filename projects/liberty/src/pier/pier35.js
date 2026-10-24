// liberty/src/pier/pier35.js: Pier 35 itself (B4): the deck and its edges, the substructure seen from the water, the
// fender system, the mooring fittings and the transit shed. Measured on the rectified imagery (site.js); heights from
// site.md (the deck 3.7 m above MLLW) and the photos (01, 07, 11, 42).
import { Bins } from 'scene3d/kit/arch/kit.js';
import { rng } from 'scene3d/util.js';
import { P35 } from './site.js';
import { quads, wallRect, wallWithOpenings, orient, cylinder, latheAt, flatPoly, polySides, merge, box, beam, seedAttr } from './geo.js';
import { sweep } from 'scene3d/geom.js';
const HEX = [0, 1, 2, 3, 4, 5].map(i => [0.038 * Math.cos(i * Math.PI / 3), 0.038 * Math.sin(i * Math.PI / 3)]);
import { LAMPS } from './mats.js';

const T = window.THREE;
const D = P35.deck;

// the substructure (est.: no Port data; site.md rule 9): square concrete piles 0.45 m in bents every 3.5 m along the
// pier, 17 across at 3.6 m; bent caps 0.8 x 0.85 m across; a beam under each pile line; a 0.30 m slab
export const SUB = { bent: 3.5, across: 17, pile: 0.45, slab: 0.30, cap: [0.8, 0.85], beam: [0.42, 0.55], toe: -7.0 };
// the fender system on both edges and the tip: timber piles every 3.05 m (10 ft), 0.36 m, 0.25 m outboard; a wale
// along their heads; orange foam cylinders hung on chains (07: ~12 a side, ~22 m apart; 1.5 x 3.0 m on the berth side)
export const FEND = { pitch: 3.05, r: 0.18, out: 0.25, cylW: { r: 0.75, L: 3.0, every: 22.0 }, cylE: { r: 0.55, L: 2.4, every: 24.0 } };

export function buildPier35(world, M, out, ctxHull = null) {
  const B = new Bins(world, 'pier35');
  const tri = {};
  const x0 = P35.x0, x1 = P35.x1, z0 = P35.z0;
  const zBackW = P35.backZ(x0), zStreetW = P35.streetZ(x0), zStreetE = P35.streetZ(x1);

  // ---- the deck: the slab from the tip to the bulkhead's street face (the bulkhead building stands on it)
  const outline = [[x0, z0], [x1, z0], [x1, zStreetE], [x0, zStreetW]];
  B.add(M.deck, flatPoly(outline, D, { seed: 0.31 }), 'deck');
  B.add(M.pile, flatPoly(outline, D - SUB.slab, { down: true, seed: 0.2 }), 'soffit');
  // the slab's edge (fascia): a deeper edge beam on the two long sides and the tip, down to D - 1.25
  const fasciaPoly = [[x0, zStreetW], [x0, z0], [x1, z0], [x1, zStreetE]];
  B.add(M.pile, polySides(fasciaPoly, D - 1.25, D, 0.4, false), 'fascia');
  // the edge beams' undersides and inner faces (seen from the water under the deck)
  const eb = 0.6;
  B.add(M.pile, box([x0 + eb / 2, D - 0.775, (z0 + zStreetW) / 2], [eb, 0.95, zStreetW - z0]), 'fascia');
  B.add(M.pile, box([x1 - eb / 2, D - 0.775, (z0 + zStreetE) / 2], [eb, 0.95, zStreetE - z0]), 'fascia');
  B.add(M.pile, box([(x0 + x1) / 2, D - 0.775, z0 + eb / 2], [x1 - x0, 0.95, eb]), 'fascia');

  // ---- the substructure: bents of piles under caps, beams along each pile line
  const piles = [];
  const r = rng(3501);
  const nb = Math.floor((P35.streetZ(x1) - z0 - 1.0) / SUB.bent);
  const xs = []; for (let i = 0; i < SUB.across; i++) xs.push(x0 + 0.9 + i * (x1 - x0 - 1.8) / (SUB.across - 1));
  const pileGeo = beam([0, SUB.toe, 0], [0, 0, 0], SUB.pile, SUB.pile, { up: [0, 0, 1], chamfer: 0.04, capA: false });
  const capY = D - SUB.slab - SUB.cap[1];
  const mats = [], jackets = [];
  for (let b = 0; b <= nb; b++) {
    const z = z0 + 1.2 + b * SUB.bent;
    let any = false;
    for (const x of xs) {
      if (z > P35.streetZ(x) - 0.8) continue;
      any = true;
      const h = capY;                                   // the pile's head under its cap
      const m = new T.Matrix4().compose(new T.Vector3(x + (r() - 0.5) * 0.06, h, z + (r() - 0.5) * 0.06), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), (r() - 0.5) * 0.03), new T.Vector3(1, (h - SUB.toe) / -SUB.toe, 1));
      mats.push(m); piles.push([+x.toFixed(2), +z.toFixed(2), +(SUB.pile * 0.56).toFixed(2)]);
      // ~7 % carry a repair jacket from below the water to the cap (newer, smoother concrete; the 1990s Port program, est.)
      if (r() < 0.07) jackets.push([x, z]);
    }
    if (!any) continue;
    // the cap across the bent, clipped to the deck's oblique end
    const xbMax = x1 - 0.3, xaa = Math.max(x0 + 0.3, (z + 0.4 - P35.streetZ0) / P35.slope);
    B.add(M.pile, box([(xaa + xbMax) / 2, capY + SUB.cap[1] / 2, z], [xbMax - xaa, SUB.cap[1], SUB.cap[0]]), 'caps');
  }
  // beams along each pile line
  for (const x of xs) {
    const zEnd = P35.streetZ(x) - 0.5;
    B.add(M.pile, box([x, D - SUB.slab - SUB.beam[1] / 2, (z0 + 0.6 + zEnd) / 2], [SUB.beam[0], SUB.beam[1], zEnd - z0 - 0.6]), 'beams');
  }
  const pileMesh = world.mesh(pileGeo, M.pile, { count: mats.length, name: 'pier35:piles' });
  mats.forEach((m, i) => pileMesh.setMatrixAt(i, m)); pileMesh.instanceMatrix.needsUpdate = true; pileMesh.computeBoundingSphere();
  tri.piles = mats.length * pileGeo.index.count / 3;
  for (const [x, z] of jackets) B.add(M.pile, box([x, (-1.2 + capY) / 2, z], [0.62, capY + 1.2, 0.62]), 'jackets');
  // the seawall under the street face (mostly in the dark: the bulkhead wharf's back)
  B.add(M.pile, quads([orient([[x0, -4, zStreetW], [x1, -4, zStreetE], [x1, D - SUB.slab, zStreetE], [x0, D - SUB.slab, zStreetW]],
    [[0, -4], [70, -4], [70, D], [0, D]], [-P35.out[0], 0, -P35.out[1]])], 0.6), 'seawall');

  // ---- the fender system: timber piles along both edges and round the tip, a wale on their heads, chocks between
  const fpos = [];
  const fTop = D - 0.1, fBot = -3.5;
  const addF = (x, z) => fpos.push([x, z]);
  for (let z = z0 + 1.2; z < zStreetW - 3; z += FEND.pitch) addF(x0 - FEND.out, z);
  for (let z = z0 + 1.2; z < zStreetE - 3; z += FEND.pitch) addF(x1 + FEND.out, z);
  for (let x = x0 + 1.5; x < x1 - 1.0; x += FEND.pitch) addF(x, z0 - FEND.out);
  const fgeo = latheAt([[FEND.r * 1.02, 0], [FEND.r, 0.4], [FEND.r * 0.98, fTop - fBot - 0.15], [FEND.r * 0.7, fTop - fBot], [0, fTop - fBot]], 9, 0, fBot, 0, 0.6);
  const fm = world.mesh(fgeo, M.timber, { count: fpos.length, name: 'pier35:fender piles' });
  fpos.forEach(([x, z], i) => fm.setMatrixAt(i, new T.Matrix4().compose(new T.Vector3(x, 0, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), r() * 6.28), new T.Vector3(1, 1, 1))));
  fm.instanceMatrix.needsUpdate = true; fm.computeBoundingSphere();
  tri.fenderPiles = fpos.length * fgeo.index.count / 3;
  // wales along the heads, outboard (two levels on the berth side, where the ship bears)
  const wale = (a, b, y, s = 0.3) => B.add(M.timber, beam(a.map((v, i) => i === 1 ? y : v), b.map((v, i) => i === 1 ? y : v), s, s, { seed: r() }), 'wales');
  const wo = FEND.out + FEND.r + 0.15;
  wale([x0 - wo, 0, z0 + 0.2], [x0 - wo, 0, zStreetW - 3], D - 0.45); wale([x0 - wo, 0, z0 + 0.2], [x0 - wo, 0, zStreetW - 3], D - 1.6);
  wale([x1 + wo, 0, z0 + 0.2], [x1 + wo, 0, zStreetE - 3], D - 0.45);
  wale([x0 - 0.1, 0, z0 - wo], [x1 + 0.1, 0, z0 - wo], D - 0.45);
  // the timber curb on the deck's edge (a 0.30 x 0.25 m stringer with scupper gaps every 3.05 m)
  const curb = (xa, za, xb, zb) => {
    const L = Math.hypot(xb - xa, zb - za), n = Math.floor(L / FEND.pitch);
    for (let i = 0; i < n; i++) {
      const t0 = i / n + 0.05 / L, t1 = (i + 1) / n - 0.25 / L;
      B.add(M.timber, beam([xa + (xb - xa) * t0, D + 0.125, za + (zb - za) * t0], [xa + (xb - xa) * t1, D + 0.125, za + (zb - za) * t1], 0.3, 0.25, { seed: r() }), 'curb');
    }
  };
  curb(x0 + 0.15, z0 + 0.15, x0 + 0.15, zBackW - 8);       // (the west apron's curb stops short of the wharf crossing)
  curb(x1 - 0.15, z0 + 0.15, x1 - 0.15, zStreetE - 4);
  curb(x0 + 0.15, z0 + 0.15, x1 - 0.15, z0 + 0.15);

  // the orange cylinder fenders, hung on two chains from the curb: the berth side's large ones bear on the hull
  const cyl = (x, z, c, side) => {
    const cx = x + side * (FEND.out + FEND.r + 0.25 + c.r), cy = D - 1.1 - c.r;
    B.add(M.fender, cylinder([cx, cy, z - c.L / 2], [cx, cy, z + c.L / 2], c.r, 16, r()), 'fenders');
    for (const dz of [-c.L * 0.38, c.L * 0.38]) {
      // the chains: a thin dark bar from the curb to the fender's top (links are lines at this size)
      B.add(M.iron, beam([x - side * 0.05, D + 0.2, z + dz], [cx - side * c.r * 0.3, cy + c.r * 0.95, z + dz], 0.035, 0.035, { seed: r() }), 'chains');
    }
  };
  const fenders = [];
  for (let z = z0 + 10; z < zBackW - 12; z += FEND.cylW.every) { cyl(x0, z, FEND.cylW, -1); fenders.push([x0, z]); }
  for (let z = z0 + 14; z < zStreetE - 12; z += FEND.cylE.every) { cyl(x1, z, FEND.cylE, 1); fenders.push([x1, z]); }

  // ---- mooring fittings: double bitts where the ship's lines land (bow, breasts, springs, stern), single mushroom
  // bollards every ~18 m elsewhere on both edges, cleats between (07, 42: black, on the edge 0.6 m in)
  // the line landings: double bitts ashore for each of her starboard closed chocks (research/ship.md §3: two at the
  // bow, abreast No. 3 / the house front, the house's after end, the quarters; B1's hull anchors when built). The bow
  // and stern lines lead ~24 m ahead and astern, the springs ~22 m along (the forward one leads forward, the after one
  // aft), the breasts straight across. Defaults (no hull): the chocks at ship.md's stations
  const FT = 0.3048, zOf = ft => (ft - 213.65) * FT;
  const hullChocks = ctxHull && ctxHull.anchors && ctxHull.anchors.chocks ? ctxHull.anchors.chocks.filter(c => c.side > 0).sort((a, b) => a.at - b.at) : null;
  const chockAt = ft => { const c = hullChocks && hullChocks.find(c => c.at === ft); return c ? c.world : [8.6, 8.5, zOf(ft)]; };
  const LINES = [
    { kind: 'bow line', ft: 22, lead: -24 }, { kind: 'forward breast', ft: 34, lead: 0 },
    { kind: 'forward spring', ft: 190, lead: -22 }, { kind: 'midship breast', ft: 205, lead: 0 },
    { kind: 'after breast', ft: 269, lead: 0 }, { kind: 'after spring', ft: 283, lead: 22 },
    { kind: 'stern breast', ft: 395, lead: 0 }, { kind: 'stern line', ft: 410, lead: 24 },
  ].map(l => { const c = chockAt(l.ft); return Object.assign(l, { chock: c.map(v => +v.toFixed(2)), chockZ: +c[2].toFixed(2), z: +(c[2] + l.lead).toFixed(1) }); });
  const lines = LINES.map(l => l.z);
  const bollards = [];
  const bollardGeo = (x, z, s) => latheAt([[0.30 * s, 0], [0.30 * s, 0.05], [0.18 * s, 0.1], [0.15 * s, 0.38], [0.17 * s, 0.5], [0.27 * s, 0.56], [0.27 * s, 0.62], [0.2 * s, 0.68], [0, 0.7]], 14, x, D, z, r());
  for (const z of lines) {
    const x = x0 + 0.75;
    B.add(M.iron, bollardGeo(x, z - 0.55, 1.15), 'bollards'); B.add(M.iron, bollardGeo(x, z + 0.55, 1.15), 'bollards');
    B.add(M.iron, box([x, D + 0.04, z], [0.8, 0.08, 1.9]), 'bollards');
    bollards.push([+x.toFixed(2), +(D + 0.6).toFixed(2), z]);
    const L = LINES.find(l => l.z === z); L.bollard = [+x.toFixed(2), +(D + 0.6).toFixed(2), z];
  }
  for (let z = z0 + 6; z < zBackW - 6; z += 18) {
    if (lines.some(l => Math.abs(l - z) < 6)) continue;
    B.add(M.iron, bollardGeo(x0 + 0.7, z, 1.0), 'bollards'); bollards.push([+(x0 + 0.7).toFixed(2), +(D + 0.55).toFixed(2), +z.toFixed(2)]);
  }
  for (let z = z0 + 8; z < zStreetE - 6; z += 18) { B.add(M.iron, bollardGeo(x1 - 0.7, z, 1.0), 'bollards'); bollards.push([+(x1 - 0.7).toFixed(2), +(D + 0.55).toFixed(2), +z.toFixed(2)]); }
  for (let x = x0 + 6; x < x1 - 4; x += 15) { B.add(M.iron, bollardGeo(x, z0 + 0.7, 1.0), 'bollards'); bollards.push([+x.toFixed(2), +(D + 0.55).toFixed(2), +(z0 + 0.7).toFixed(2)]); }

  // ---- the mooring lines (3 in synthetic hawsers, ~76 mm: Port practice for a 7,000 t ship, est.): a catenary from
  // her chock to the bitts, sagging 2 % of the span (made fast, slack enough for the falling tide), turned round the
  // bitts in two figure-eight turns
  const ropes = [], guards = { chafe: [], cones: [] };
  for (const L of LINES) {
    const a = L.chock, b = [x0 + 0.75, D + 0.45, L.z - 0.55], span = Math.hypot(b[0] - a[0], b[2] - a[2], b[1] - a[1]);
    const path = [];
    for (let k = 0; k <= 24; k++) { const u = k / 24; path.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - 4 * 0.02 * span * u * (1 - u), a[2] + (b[2] - a[2]) * u]); }
    ropes.push(sweep(HEX, path, { seed: r() }));
    // chafe gear: a canvas sleeve over the first 1.2 m out of the chock; a rat guard (a galvanised cone, 0.9 m across,
    // its open side toward the ship) 2.2 m out (the Port requires guards on every line)
    const at = d => { let acc = 0; for (let k = 1; k < path.length; k++) { const l = Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1], path[k][2] - path[k - 1][2]); if (acc + l >= d) { const u = (d - acc) / l; return [0, 1, 2].map(c => path[k - 1][c] + (path[k][c] - path[k - 1][c]) * u); } acc += l; } return path[path.length - 1]; };
    const sl = []; for (let d = 0; d <= 1.2; d += 0.2) sl.push(at(d));
    guards.chafe.push(sweep(HEX.map(([x, y]) => [x * 1.7, y * 1.7]), sl, { seed: r() }));
    const g0 = at(2.2), g1 = at(2.45), dir = [g1[0] - g0[0], g1[1] - g0[1], g1[2] - g0[2]];
    const cone = new T.ConeGeometry(0.45, 0.25, 16, 1, true); cone.translate(0, -0.125, 0);
    cone.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...dir).normalize().negate()));
    cone.translate(g0[0], g0[1], g0[2]);
    cone.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(cone.attributes.position.count).fill(0.5), 1));
    guards.cones.push(cone);
    // the turns: a flattened loop round both posts of the bitts at two heights
    for (const y of [D + 0.3, D + 0.42]) {
      const loop = []; for (let k = 0; k <= 20; k++) { const t = k / 20 * Math.PI * 2; loop.push([x0 + 0.75 + 0.2 * Math.sin(t), y + 0.03 * Math.sin(2 * t), L.z + 0.62 * Math.cos(t)]); }
      ropes.push(sweep(HEX, loop, { seed: r() }));
    }
    L.span = +span.toFixed(1);
  }
  B.add(M.rope || M.timber, ropes, 'mooring lines');
  B.add(M.flat('chafe gear', '#4a4f3e'), guards.chafe, 'chafe gear');
  B.add(M.flat('rat guards', '#b9bdbf', { spec: 0.35, rough: 0.4, double: true }), guards.cones, 'rat guards');

  // ---- the transit shed
  const shed = buildShed(world, M, B, r);

  const meshes = B.flush();
  Object.assign(tri, B.tris);
  out.pier35 = { tri, piles, bollards, lines: LINES, fenders, fenderPiles: fpos.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2), FEND.r]), shed, meshes: meshes.concat([pileMesh, fm]) };
  return out.pier35;
}

// the transit shed (1915-16, lengthened 1933): three gable roofs of unequal width over concrete walls, the full length
// from the tip to the bulkhead. Bays of 6.1 m; on the long walls a roll-up cargo door every second bay, a clerestory
// band of steel sash in every bay, man doors and small windows between; pilasters at the bay lines; wall packs on
// every second pilaster (mats.js LAMPS)
function buildShed(world, M, B, r) {
  const W = P35.wallW, E = P35.wallE, z0 = P35.z0, eH = P35.eaveH, D0 = P35.deck;
  const zt = z0 + P35.tipApron;                         // the end wall at the tip
  const eaveY = D0 + eH, tanP = Math.tan(P35.pitch * Math.PI / 180);
  const xsG = [P35.eaveW, P35.valleys[0], P35.valleys[1], P35.eaveE];   // eave, valley, valley, eave (roof lines)
  const gables = [0, 1, 2].map(i => {
    const xa = xsG[i], xb = xsG[i + 1], xm = (xa + xb) / 2;
    return { xa, xb, xm, rise: (xb - xa) / 2 * tanP, zEnd: P35.backZ(xa) };     // each gable ends square at its west corner's back line
  });
  const info = { gables: gables.map(g => ({ xa: g.xa, xb: g.xb, ridgeY: +(eaveY + g.rise).toFixed(2), zEnd: +g.zEnd.toFixed(1) })), eaveY, doors: [] };
  const bay = P35.bay;

  // the long walls: west (faces -x) and east (faces +x), from the tip's end wall to the bulkhead's back face
  for (const side of [-1, 1]) {
    const x = side < 0 ? W : E, n = [side, 0, 0], u = [0, 0, 1];
    const zEnd = P35.backZ(x);
    const L = zEnd - zt, nBays = Math.floor(L / bay);
    const ops = [];
    for (let b = 0; b < nBays; b++) {
      const ua = b * bay, ub = ua + bay;
      // clerestory band: 4.3 m of sash, 2.4 m tall, every bay
      ops.push({ u0: ua + 0.9, u1: ub - 0.9, v0: 5.7, v1: 8.1, depth: 0.22, kind: 'sash' });
      const k = (b + (side < 0 ? 0 : 1)) % 2;
      if (k === 0) { ops.push({ u0: ua + 0.85, u1: ub - 0.85, v0: 0, v1: 4.9, depth: 0.3, kind: 'door' }); info.doors.push([x, zt + (ua + ub) / 2, side]); }
      else if (r() < 0.5) ops.push({ u0: ua + 2.6, u1: ua + 3.6, v0: 0, v1: 2.3, depth: 0.2, kind: 'mandoor' });
      else ops.push({ u0: ua + 1.6, u1: ub - 1.6, v0: 1.6, v1: 3.4, depth: 0.2, kind: 'window' });
    }
    const o = [x, D0, zt];
    B.add(M.wall, quads(wallWithOpenings(o, u, n, 0, L, 0, eH, ops), r()), 'shed walls');
    // the fillers set back in each opening
    for (const op of ops) {
      const d = op.depth;
      const q = wallRect(o, u, n, op.u0, op.u1, op.v0, op.v1, -d);
      const mat = op.kind === 'sash' || op.kind === 'window' ? M.sash : M.door;
      B.add(mat, quads([q], r()), 'shed openings');
      // a sill under each window band (a ledge pigeons stand on)
      if (op.kind !== 'door' && op.kind !== 'mandoor') B.add(M.wall, box([x + side * 0.08, D0 + op.v0 - 0.06, zt + (op.u0 + op.u1) / 2], [0.36, 0.12, op.u1 - op.u0 + 0.2]), 'sills');
      if (op.kind === 'door') B.add(M.iron, box([x + side * 0.12, D0 + op.v1 + 0.25, zt + (op.u0 + op.u1) / 2], [0.3, 0.5, op.u1 - op.u0 + 0.3]), 'door hoods');   // the roll-up's drum housing
    }
    // pilasters at every bay line, and the base course
    for (let b = 0; b <= nBays; b++) {
      const z = zt + b * bay;
      B.add(M.wall, box([x + side * 0.14, D0 + eH / 2 - 0.1, z], [0.28, eH - 0.2, 0.62]), 'pilasters');
    }
    B.add(M.wall, box([x + side * 0.06, D0 + 0.2, (zt + zEnd) / 2], [0.12, 0.4, L]), 'base');
    // the remainder of the wall past the last bay (to the bulkhead)
    const rest = L - nBays * bay;
    if (rest > 0.05) B.add(M.wall, quads([wallRect(o, u, n, nBays * bay, L, 0, eH)], r()), 'shed walls');
    // wall packs on every second pilaster from LAMPS (their heads: a dark box, a warm lens below)
    const n2 = side < 0 ? LAMPS.nW : LAMPS.nE;
    for (let i = 0; i < n2; i++) {
      const z = LAMPS.z0 + i * LAMPS.spacing, y = D0 + LAMPS.h;
      B.add(M.iron, box([x + side * 0.53, y + 0.12, z], [0.5, 0.26, 0.42]), 'lamps');
      B.add(M.lens, box([x + side * 0.6, y - 0.03, z], [0.36, 0.06, 0.32]), 'lamps');
    }
    // downpipes from the eave gutter at every fourth pilaster
    // (against the wall beside a pilaster; an offset at the top to the eave gutter, 0.55 m out)
    for (let b = 1; b < nBays; b += 4) {
      const zp = zt + b * bay + 0.45, gy = eaveY - 0.45 * Math.tan(P35.pitch * Math.PI / 180) - 0.12;
      B.add(M.iron, cylinder([x + side * 0.08, D0 + 0.15, zp], [x + side * 0.08, gy - 0.6, zp], 0.075, 8, r()), 'downpipes');
      B.add(M.iron, beam([x + side * 0.08, gy - 0.65, zp], [x + side * 0.55, gy - 0.05, zp], 0.12, 0.12, { seed: r() }), 'downpipes');
    }
  }

  // the end wall at the tip: three gable ends, a cargo door in the middle gable, louvres in the gable triangles
  {
    const n = [0, 0, -1], u = [1, 0, 0], o = [0, D0, zt];
    const ops = [{ u0: P35.axisX - 2.6, u1: P35.axisX + 2.6, v0: 0, v1: 5.2, depth: 0.3, kind: 'door' }];
    for (let k = 0; k < 7; k++) { const uc = W + 2.8 + k * (E - W - 5.6) / 6; if (Math.abs(uc - P35.axisX) < 4) continue; ops.push({ u0: uc - 1.4, u1: uc + 1.4, v0: 5.7, v1: 8.1, depth: 0.22, kind: 'sash' }); }
    B.add(M.wall, quads(wallWithOpenings(o, u, n, W, E, 0, eH, ops), r()), 'shed walls');
    for (const op of ops) B.add(op.kind === 'door' ? M.door : M.sash, quads([wallRect(o, u, n, op.u0, op.u1, op.v0, op.v1, -op.depth)], r()), 'shed openings');
    // the gable triangles above the eave line, and their louvres
    for (const g of gables) {
      const a = [Math.max(g.xa, W), eaveY, zt], b = [Math.min(g.xb, E), eaveY, zt], c = [g.xm, eaveY + g.rise, zt];
      B.add(M.wall, tri3(a, b, c, [0, 0, -1]), 'gables');
      B.add(M.door, box([g.xm, eaveY + g.rise * 0.42, zt - 0.06], [1.6, 1.0, 0.12]), 'louvres');
    }
  }

  // the roofs: two slopes a gable with a 0.45 m overhang at the eaves and the tip, a ridge cap, gutters at the eaves
  // and in the valleys, turbine vents along the middle ridge (07)
  const ov = 0.45;
  for (const [i, g] of gables.entries()) {
    const za = zt - ov, zb = g.zEnd;
    const ridge = eaveY + g.rise;
    const eA = i === 0 ? g.xa - ov : g.xa, eB = i === 2 ? g.xb + ov : g.xb;
    const yA = i === 0 ? eaveY - ov * tanP : eaveY, yB = i === 2 ? eaveY - ov * tanP : eaveY;
    const slopeW = Math.hypot(g.xm - eA, ridge - yA), slopeE = Math.hypot(eB - g.xm, ridge - yB);
    // uv: u along z, v down the slope from the ridge
    B.add(M.roof, quads([orient([[g.xm, ridge, za], [g.xm, ridge, zb], [eA, yA, zb], [eA, yA, za]], [[0, 0], [zb - za, 0], [zb - za, slopeW], [0, slopeW]], [-(ridge - yA), g.xm - eA, 0])], 0.2 + i * 0.3), 'roofs');
    B.add(M.roof, quads([orient([[g.xm, ridge, za], [g.xm, ridge, zb], [eB, yB, zb], [eB, yB, za]], [[0, 0], [zb - za, 0], [zb - za, slopeE], [0, slopeE]], [ridge - yB, eB - g.xm, 0])], 0.35 + i * 0.3), 'roofs');
    // the roof's thickness at the tip's barge (a fascia board along the verge)
    B.add(M.timber, quads([orient([[eA, yA - 0.25, za], [g.xm, ridge - 0.25, za], [g.xm, ridge, za], [eA, yA, za]], [[0, 0], [slopeW, 0], [slopeW, 0.25], [0, 0.25]], [0, 0, -1]),
      orient([[g.xm, ridge - 0.25, za], [eB, yB - 0.25, za], [eB, yB, za], [g.xm, ridge, za]], [[0, 0], [slopeE, 0], [slopeE, 0.25], [0, 0.25]], [0, 0, -1])], r()), 'verges');
    // the gable's end at the bulkhead side (above the bulkhead's roof: a plain gable wall)
    B.add(M.wall, tri3([Math.max(g.xa, W), eaveY, zb], [Math.min(g.xb, E), eaveY, zb], [g.xm, ridge, zb], [0, 0, 1]), 'gables');
    B.add(M.wall, box([(Math.max(g.xa, W) + Math.min(g.xb, E)) / 2, (D0 + eaveY) / 2, zb + 0.1], [Math.min(g.xb, E) - Math.max(g.xa, W), eaveY - D0, 0.2]), 'gables');
    // the ridge cap
    B.add(M.iron, beam([g.xm, ridge + 0.04, za], [g.xm, ridge + 0.04, zb], 0.32, 0.1, { seed: r() }), 'ridge');
    // vents: turbine ventilators along the middle gable's ridge every ~15 m, small stack vents on the others
    for (let z = za + 8; z < zb - 6; z += (i === 1 ? 15 : 37)) {
      if (i === 1) {
        B.add(M.iron, latheAt([[0.32, 0], [0.32, 0.3], [0.38, 0.35], [0.4, 0.6], [0.3, 0.75], [0.05, 0.85], [0, 0.86]], 12, g.xm, ridge, z, r()), 'vents');
      } else {
        B.add(M.iron, cylinder([g.xm + 2.0, ridge - 2.0 * tanP - 0.1, z], [g.xm + 2.0, ridge - 2.0 * tanP + 0.8, z], 0.14, 8, r()), 'vents');
      }
    }
  }
  // two roof hatches on the east gable's east slope (z19: light 4 m squares at z -35 and +52; photo 07's two white
  // rectangles), sitting on the slope
  { const g = gables[2], hx = 61.5, hy = eaveY + g.rise - (hx - g.xm) * tanP;
    for (const hz of [-35, 52]) B.add(M.flat('roof hatch', '#d7d9d8'), box([hx, hy + 0.1, hz], [4.0, 1.6, 4.0]), 'hatches'); }
  // gutters at the two eaves and in the two valleys
  const gutter = (x, z1, z2, y) => B.add(M.iron, beam([x, y, z1], [x, y, z2], 0.3, 0.22, { seed: r() }), 'gutters');
  gutter(P35.eaveW - ov - 0.1, zt - ov, P35.backZ(W), eaveY - ov * tanP - 0.12);
  gutter(P35.eaveE + ov + 0.1, zt - ov, P35.backZ(E), eaveY - ov * tanP - 0.12);
  for (const v of P35.valleys) gutter(v, zt - ov, P35.backZ(v), eaveY - 0.05);
  // the flat roofs over the triangles each gable's square end leaves against the oblique bulkhead (at the eave)
  for (const g of gables) {
    const xa = Math.max(g.xa, W), xb = Math.min(g.xb, E);
    const tri = [[xa, g.zEnd], [xb, g.zEnd], [xb, P35.backZ(xb)]];
    B.add(M.roof, flatPoly(tri, eaveY + 0.05, { seed: 0.9 }), 'flat roofs');
    B.add(M.wall, polySides(tri, D0, eaveY + 0.05, 0.4), 'flat roofs');
  }
  return info;
}
function tri3(a, b, c, want) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  let p = [a, b, c];
  if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) { p = [a, c, b]; n = n.map(x => -x); }
  const l = Math.hypot(...n); n = n.map(x => x / l);
  const g = new T.BufferGeometry();
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
  g.setAttribute('position', new T.Float32BufferAttribute(p.flat(), 3));
  g.setAttribute('normal', new T.Float32BufferAttribute([...n, ...n, ...n], 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(p.map(q => [Math.hypot(q[0] - a[0], q[2] - a[2]), q[1]]).flat(), 2));
  g.setIndex([0, 1, 2]);
  return seedAttr(g, 0.5);
}
