// liberty/src/pier/city.js: the city inside the near box (B4): North Beach, the waterfront's blocks and Telegraph Hill's
// houses, on the street grid measured on z18 (site.js GRID: 50-vara blocks, 146.7 x 105.4 m on centre, 21 m streets).
// Lots follow San Francisco's 25 ft (7.62 m) frontage; buildings stand at the street line (no setback), 2-4 storeys on
// the hill (Telegraph Hill's 40 ft limit), 3-6 by the waterfront, pastel stucco and painted wood (photos 12, 37).
// Windows are the facade shader's (a storey 3.2 m, a bay 2.4 m): crisp emissive rectangles at night (style K3), each
// lit or dark by its own hash, a share that falls through the evening; no halo. Roofs flat with parapets (most of SF),
// some pitched; a few rooftop boxes (stair and lift housings, tanks).
import { Bins } from 'scene3d/kit/arch/kit.js';
import { rng, hash2 } from 'scene3d/util.js';
import { GRID, PARKS, COIT, LANDUSE } from './site.js';
import { CITY_LAMP } from './land.js';
import { pierMat } from './mats.js';
import { box, merge, seedAttr, cylinder, beam } from './geo.js';
import { lin } from 'scene3d/util.js';
import * as P from '../plan.js';

const T = window.THREE;
const NEAR = P.WORLD.near;

// facade colours (sampled on photo 12's houses: #d3d0c7 cream, and the hill's pastels; photo 37), sRGB
const PASTEL = ['#d9d2c3', '#e3dccb', '#cfc8b8', '#d8c9a8', '#c9b9a0', '#e0d0b8', '#bfc7c9', '#c8d1d0', '#d6bfb3', '#cdb6a6', '#eae5d8', '#b8b5ad', '#d5cfa9', '#a9b4b6'];

function inPoly(px, pz, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}

export function cityMats(world) {
  const pal = PASTEL.map(c => lin(c));
  const pu = {}; pal.forEach((c, i) => { pu['uP' + i] = { value: new T.Vector3(...c) }; });
  const decl = pal.map((_, i) => `uniform vec3 uP${i};`).join(' ');
  const pick = pal.map((_, i) => `if (k == ${i}) return uP${i};`).join(' ');
  const facade = pierMat(world, {
    name: 'city facade', lamps: false, uniforms: Object.assign(pu, {
      uRoof: { value: new T.Vector3(...lin('#5d5f62')) }, uRoofB: { value: new T.Vector3(...lin('#9a9893')) },
      uGlass: { value: new T.Vector3(...lin('#26313a')) }, uWarm: { value: new T.Vector3(...lin('#ffc46e')) }, uCool: { value: new T.Vector3(...lin('#bcd2ff')) },
    }),
    glsl: /* glsl */`${decl} uniform vec3 uRoof, uRoofB, uGlass, uWarm, uCool;
      vec3 pastel(float h) { int k = int(floor(h * ${pal.length}.0)); ${pick} return uP0; }`,
    body: /* glsl */`
      // aSeed carries the building: its hue (fract * 14), its window style, its base height (the uv's v is metres up)
      float b = sd;
      if (s.N.y > 0.6) {
        // roofs: tar or a pale membrane, with the parapet's shadow line
        vec3 r = hash11(b * 97.0) < 0.55 ? uRoof : uRoofB;
        s.albedo = r * (0.9 + 0.1 * step(0.0, vnoise(P.xz * 0.4)));
        s.rough = 0.9; return;
      }
      vec3 wall = pastel(fract(b * 7.31));
      float h = uv.y, u = uv.x;
      // per building: its storey height, its bay, its window shape (0 single, 1 paired, 2 a wide bay window), a trim colour
      float stH = 3.1 + 0.3 * hash11(b * 17.0), bayW = 2.6 + 0.9 * hash11(b * 31.0);
      float style = floor(hash11(b * 53.0) * 3.0);
      float fl = floor(h / stH), fy = fract(h / stH);
      float bx = floor(u / bayW), fx = fract(u / bayW);
      float ww = style < 0.5 ? 0.36 : (style < 1.5 ? 0.22 : 0.56);
      float wx = style < 1.5 && style > 0.5 ? min(abs(fx - 0.3), abs(fx - 0.7)) : abs(fx - 0.5);
      float win = step(wx, ww * 0.5) * step(0.3, fy) * step(fy, 0.84) * step(0.6, h);
      float frame = win * (1.0 - step(wx, ww * 0.5 - 0.05) * step(0.33, fy) * step(fy, 0.81));
      // the ground storey of a commercial building: a shop's wide glazing under a band
      float shop = step(0.62, hash11(b * 7.0)) * (1.0 - step(stH, h));
      win = mix(win, step(0.08, fx) * step(fx, 0.92) * step(0.08, fy) * step(fy, 0.8), shop);
      vec3 trim = mix(vec3(0.92, 0.9, 0.86), wall * 0.72, step(0.5, hash11(b * 3.0)));
      vec3 c = wall;
      // the cornice: a trim band in the top 0.5 m of every facade (uv.z unknown: by the building's height, aSeed's frac)
      c *= 1.0 - 0.16 * (1.0 - step(0.45, h));
      vec3 g = mix(uGlass, vec3(0.45, 0.55, 0.62), 0.45 + 0.3 * hash12(vec2(bx, fl) + b * 13.0)) * (1.0 - 0.6 * uNight);
      // curtains drawn in some windows by day: a pale fill
      g = mix(g, vec3(0.78, 0.74, 0.66), step(0.75, hash12(vec2(fl, bx) + b * 3.0)) * (1.0 - uNight));
      c = mix(c, g, win * (1.0 - frame));
      c = mix(c, trim, frame);
      s.albedo = c; s.rough = 0.85; s.spec = 0.25 * win;
      // night: each window's own hash against the evening's share, warm 2700-3500 K, a few cool
      float id = hash12(vec2(bx, fl) + b * 71.0);
      float share = mix(0.38, 0.75, shop) * smoothstep(0.1, 0.8, uNight);
      float on = step(id, share) * win * (1.0 - frame);
      vec3 lc = mix(uWarm, uCool, step(0.88, hash12(vec2(fl, bx) + b * 5.0)));
      float dim = mix(1.0, 0.45, step(0.66, hash12(vec2(bx * 3.0, fl) + b)));
      s.emissive += lc * on * dim * 1.35;
    `,
  });
  const trim = pierMat(world, { name: 'city trim', lamps: false, uniforms: { uC: { value: new T.Vector3(...lin('#e4ded2')) } }, glsl: 'uniform vec3 uC;', body: 's.albedo = uC * (0.85 + 0.15 * fract(sd * 17.0)); s.rough = 0.85;' });
  const roof = pierMat(world, { name: 'city pitched roofs', lamps: false, uniforms: { uA: { value: new T.Vector3(...lin('#6d6a66')) }, uB: { value: new T.Vector3(...lin('#8e4f3a')) } }, glsl: 'uniform vec3 uA, uB;',
    body: 'vec3 c = mix(uA, uB, step(0.65, fract(sd * 23.0))); c *= 1.0 - 0.12 * step(0.5, fract(uv.x * 2.2 + uv.y * 0.0)); s.albedo = c; s.rough = 0.8;' });
  const cars = pierMat(world, { name: 'parked cars', lamps: false, uniforms: {}, glsl: '',
    body: 'vec3 k = vec3(hash12(floor(P.xz / 2.6) + 1.0), hash12(floor(P.xz / 2.6) + 2.0), hash12(floor(P.xz / 2.6) + 3.0)); s.albedo = mix(vec3(0.05), mix(vec3(0.7), k * 0.6, step(0.5, k.x)), step(0.25, k.y)); s.rough = 0.35; s.spec = 0.6;' });
  const pole = pierMat(world, { name: 'city poles', lamps: false, uniforms: { uC: { value: new T.Vector3(...lin('#5b5f61')) } }, glsl: 'uniform vec3 uC;', body: 's.albedo = uC; s.rough = 0.6; s.spec = 0.2;' });
  const head = pierMat(world, { name: 'city lamp heads', lamps: false, lines: 0, uniforms: { uC: { value: new T.Vector3(...lin('#ffd2a0')) } }, glsl: 'uniform vec3 uC;', body: 's.albedo = uC * 0.6; s.emissive = uC * 4.0 * smoothstep(0.15, 0.55, uNight);' });
  return { facade, trim, roof, cars, pole, head };
}

// an extruded footprint whose walls carry uv (metres along, metres above 'base') and a roof cap
function prismUV(poly, y0, y1, seed, base) {
  const pos = [], nrm = [], uv = [], idx = [];
  let A = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; A += a[0] * b[1] - b[0] * a[1]; }
  const sg = A > 0 ? -1 : 1; let acc = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = [sg * (b[1] - a[1]) / L, 0, -sg * (b[0] - a[0]) / L], k = pos.length / 3;
    pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
    for (let j = 0; j < 4; j++) nrm.push(...n);
    uv.push(acc, y0 - base, acc + L, y0 - base, acc + L, y1 - base, acc, y1 - base);
    // (wind so the face looks along n)
    const e1 = [b[0] - a[0], 0, b[1] - a[1]], up = [0, 1, 0], c = [e1[1] * up[2] - e1[2] * up[1], e1[2] * up[0] - e1[0] * up[2], e1[0] * up[1] - e1[1] * up[0]];
    if (c[0] * n[0] + c[2] * n[2] > 0) idx.push(k, k + 1, k + 2, k, k + 2, k + 3); else idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
    acc += L;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(seed), 1));
  g.setIndex(idx);
  const shape = new T.Shape(poly.map(([x, z]) => new T.Vector2(x, -z)));
  const cap = new T.ShapeGeometry(shape); cap.rotateX(-Math.PI / 2); cap.translate(0, y1, 0);
  cap.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(cap.attributes.position.count).fill(seed), 1));
  return merge([g, cap.index ? cap : cap]);
}

// a gable roof over a w x d rectangle at height y (rise: 40 % of the half-span), turned by a about y
function gableRoof(c, L, W, y, a, seed) {
  const rise = W * 0.5 * 0.8, hl = L / 2 + 0.25, hw = W / 2 + 0.3;
  const P = (u, v, yy) => { const ca = Math.cos(a), sa = Math.sin(a); return [c[0] + ca * u - sa * v, yy, c[1] + sa * u + ca * v]; };
  const pos = [], nrm = [], uv = [], idx = [];
  const quad = (p, n) => { const k = pos.length / 3; for (const q of p) { pos.push(...q); nrm.push(...n); uv.push(q[0], q[2]); } idx.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  const tri = (p, n) => { const k = pos.length / 3; for (const q of p) { pos.push(...q); nrm.push(...n); uv.push(q[0], q[1] - y); } idx.push(k, k + 1, k + 2); };
  const nn = (p) => { const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]]; const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...n); return n.map(x => x / l); };
  const s1 = [P(-hl, -hw, y), P(-hl, 0, y + rise), P(hl, 0, y + rise), P(hl, -hw, y)], s2 = [P(hl, hw, y), P(hl, 0, y + rise), P(-hl, 0, y + rise), P(-hl, hw, y)];
  const fix = p => { const n = nn(p); return n[1] < 0 ? [p.slice().reverse(), nn(p.slice().reverse())] : [p, n]; };
  for (const q of [s1, s2]) { const [p, n] = fix(q); quad(p, n); }
  for (const sg of [-1, 1]) { let p = [P(sg * L / 2, -W / 2, y), P(sg * L / 2, W / 2, y), P(sg * L / 2, 0, y + rise)]; let n = nn(p); const want = [Math.cos(a) * sg, 0, Math.sin(a) * sg]; if (n[0] * want[0] + n[2] * want[2] < 0) { p = p.reverse(); n = n.map(x => -x); } tri(p, n); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(seed), 1)); g.setIndex(idx);
  return g;
}
// a canted bay window: a trapezoid in plan (front 'w' x 0.6, sides at 45 deg, 'out' deep) from y0 to y1 on a facade at
// c (the face's line), u along it, n out of it; its walls' uv carry metres above 'base' (the facade's windows)
function bayGeo(c, u, n, w, out, y0, y1, base, seed) {
  // (its back corners 0.1 m inside the lot line: the building's box stands 0.075 m behind it)
  const f = w * 0.3, poly = [[-w / 2, -0.1], [-f, out], [f, out], [w / 2, -0.1]].map(([a, b]) => [c[0] + u[0] * a + n[0] * b, c[1] + u[1] * a + n[1] * b]);
  const pos = [], nrm = [], uv = [], idx = []; let acc = 0;
  for (let i = 0; i < 3; i++) {
    const a = poly[i], b = poly[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = b[1] - a[1], nz = -(b[0] - a[0]); const l = Math.hypot(nx, nz); nx /= l; nz /= l;
    if (nx * n[0] + nz * n[1] < 0) { nx = -nx; nz = -nz; }
    const k = pos.length / 3;
    pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
    for (let j = 0; j < 4; j++) nrm.push(nx, 0, nz);
    uv.push(acc, y0 - base, acc + L, y0 - base, acc + L, y1 - base, acc, y1 - base);
    const e = [b[0] - a[0], b[1] - a[1]]; const cr = e[1] * 0 - 0;   // (winding fixed below by the normal)
    const crossY = (b[0] - a[0]) * 0 - 0;
    // CCW seen from outside: (a, b, b-top) is CCW if (b - a) x up points along the normal
    const cx = -(b[1] - a[1]), cz = (b[0] - a[0]);
    if (cx * nx + cz * nz < 0) idx.push(k, k + 1, k + 2, k, k + 2, k + 3); else idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
    acc += L;
  }
  // its roof and its underside
  for (const [yy, up] of [[y1, 1], [y0, -1]]) {
    const k = pos.length / 3;
    for (const p of poly) { pos.push(p[0], yy, p[1]); nrm.push(0, up, 0); uv.push(p[0], p[1]); }
    const tris = [[0, 1, 2], [0, 2, 3]];
    for (const t of tris) {
      const A = poly[t[0]], B = poly[t[1]], C = poly[t[2]];
      const cy = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);   // >0: CCW in (x, z) -> its normal points -y
      if ((cy > 0) === (up > 0)) idx.push(k + t[0], k + t[2], k + t[1]); else idx.push(k + t[0], k + t[1], k + t[2]);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(seed), 1)); g.setIndex(idx);
  return g;
}

// lots along the four sides of every block, inside the land (past the Embarcadero), out of the parks
export function buildCity(world, M, landAt, out) {
  const t0 = performance.now();
  const r = rng(3591);
  const CM = cityMats(world);
  const tiles = new Map();
  const tileOf = (x, z) => { const k = Math.floor((x + 1000) / 260) + ',' + Math.floor((z + 1000) / 260); if (!tiles.has(k)) tiles.set(k, new Bins(world, 'city ' + k)); return tiles.get(k); };
  const hw = GRID.street / 2;
  const blocks = [];
  const kx0 = Math.floor((NEAR.x0 - GRID.x0) / GRID.px) - 1, kx1 = Math.ceil((NEAR.x1 - GRID.x0) / GRID.px);
  const kz0 = Math.floor((-60 - GRID.z0) / GRID.pz), kz1 = Math.ceil((NEAR.z1 - GRID.z0) / GRID.pz);
  const parks = Object.values(PARKS);
  const lot = 7.62;
  let nb = 0, tri = 0;
  const footprints = [], streetTrees = [];
  // the traced buildings: their footprints extruded, flat roofs with a parapet line (the facade shader's cornice)
  const traced = LANDUSE.buildings.map(b => ({ ...b, poly: b.poly || [[b.r[0], b.r[1]], [b.r[2], b.r[1]], [b.r[2], b.r[3]], [b.r[0], b.r[3]]] }));
  for (const t of traced) {
    const ys = t.poly.map(([x, z]) => landAt(x, z)), y0 = Math.min(...ys) - 0.3, H = 0.6 + t.st * 3.6;
    const seed = hash2(Math.round(t.poly[0][0]), Math.round(t.poly[0][1])) * 0.999;
    const g = prismUV(t.poly, y0, Math.max(...ys) + H, seed, Math.min(...ys));
    const cx = t.poly.reduce((a, p) => a + p[0], 0) / t.poly.length, cz = t.poly.reduce((a, p) => a + p[1], 0) / t.poly.length;
    tileOf(cx, cz).add(CM.facade, g, 'traced');
    footprints.push([...t.poly.flat().slice(0, 2), ...t.poly.flat().slice(4, 6), +(Math.max(...ys) + H).toFixed(1)]);
    nb++;
  }
  for (let kx = kx0; kx < kx1; kx++) for (let kz = kz0; kz < kz1; kz++) {
    const bx0 = GRID.x0 + kx * GRID.px + hw, bx1 = GRID.x0 + (kx + 1) * GRID.px - hw;
    const bz0 = GRID.z0 + kz * GRID.pz + hw, bz1 = GRID.z0 + (kz + 1) * GRID.pz - hw;
    blocks.push([bx0, bz0, bx1, bz1]);
    // the four sides: lots of 25 ft, depth to the block's middle (with a rear yard)
    const sides = [
      { o: [bx0, bz0], u: [1, 0], n: [0, -1], L: bx1 - bx0, D: (bz1 - bz0) / 2 },      // the north side, facing north
      { o: [bx1, bz1], u: [-1, 0], n: [0, 1], L: bx1 - bx0, D: (bz1 - bz0) / 2 },     // south
      { o: [bx0, bz1], u: [0, -1], n: [-1, 0], L: bz1 - bz0, D: 0 },                  // west (corner lots only: the N-S frontage is short)
      { o: [bx1, bz0], u: [0, 1], n: [1, 0], L: bz1 - bz0, D: 0 },
    ];
    for (const sd of sides.slice(0, 2)) {
      let s = 0;
      while (s < sd.L - 1) {
        const cx = sd.o[0] + sd.u[0] * s, cz = sd.o[1] + sd.u[1] * s;
        // the zone at this lot: the waterfront's distance, the ground's height
        const mid = [cx + sd.u[0] * lot * 0.5 - sd.n[0] * 8, cz + sd.u[1] * lot * 0.5 - sd.n[1] * 8];
        if (mid[0] < NEAR.x0 + 4 || mid[0] > NEAR.x1 - 4 || mid[1] > NEAR.z1 - 4) { s += lot; continue; }
        const dShore = -landAt.shore(mid[0], mid[1]);
        if (dShore < 44 || parks.some(p => inPoly(mid[0], mid[1], p))) { s += lot; continue; }
        // (never on the Embarcadero: its far sidewalk ends 19 m from the centreline; a lot's middle 8 m back from the street)
        if (Math.abs(landAt.emb(mid[0], mid[1])) < 27 || Math.abs(landAt.emb(cx, cz)) < 20) { s += lot; continue; }
        if (LANDUSE.parking.some(q => mid[0] > q[0] - 4 && mid[0] < q[2] + 4 && mid[1] > q[1] - 4 && mid[1] < q[3] + 4) || traced.some(t => inPoly(mid[0], mid[1], t.poly))) { s += lot; continue; }
        const y0 = landAt(mid[0], mid[1]);
        const hill = y0 > 18;
        // merged lots: apartments and commercial by the waterfront and on the flats
        let w = lot;
        const big = !hill && (dShore < 260 ? r() < 0.55 : r() < 0.25);
        if (big) w = lot * (2 + Math.floor(r() * 4));
        w = Math.min(w, sd.L - s);
        if (w < 3) break;
        const depth = Math.min(sd.D - 2, hill ? 11 + r() * 9 : (big ? 22 + r() * 14 : 14 + r() * 12));
        let storeys = hill ? 2 + Math.floor(r() * 2.6) : (big ? 3 + Math.floor(r() * 4) : 2 + Math.floor(r() * 3));
        if (dShore < 120 && big) storeys = Math.min(storeys, 4);
        const H = 0.6 + storeys * 3.2;
        // footprint corners (along u, in along -n)
        const ax = cx, az = cz, bxp = cx + sd.u[0] * w, bzp = cz + sd.u[1] * w;
        const dx = -sd.n[0] * depth, dz = -sd.n[1] * depth;
        const xs = [ax, bxp, ax + dx, bxp + dx], zs = [az, bzp, az + dz, bzp + dz];
        const fx0 = Math.min(...xs), fx1 = Math.max(...xs), fz0 = Math.min(...zs), fz1 = Math.max(...zs);
        // the ground under it: stand on the lowest corner, the base down to it (hillside garages)
        const ys = [landAt(fx0, fz0), landAt(fx1, fz0), landAt(fx0, fz1), landAt(fx1, fz1)];
        const yb = Math.min(...ys) - 0.3, yt = (ys[0] + ys[1] + ys[2] + ys[3]) / 4 + H;
        const seed = (hash2(Math.round(cx * 10), Math.round(cz * 10)) * 0.999);
        const B = tileOf((fx0 + fx1) / 2, (fz0 + fz1) / 2);
        const g = box([(fx0 + fx1) / 2, (yb + yt) / 2, (fz0 + fz1) / 2], [fx1 - fx0 - 0.15, yt - yb, fz1 - fz0 - 0.15], { seed });
        // the facade's v is metres above the street at its front: shift the box's uv so windows start at the ground
        { const uvA = g.attributes.uv, pA = g.attributes.position; for (let i = 0; i < uvA.count; i++) uvA.setY(i, pA.getY(i) - Math.min(...ys)); }
        B.add(CM.facade, g, 'buildings');
        // a parapet and, on some, a rooftop box or a pitched roof
        // the roofline: a cornice cap round the top (the line that draws every SF facade's edge), then a pitched roof on a
        // fifth of the hill's houses (a gable to the street), else a rooftop box (stair or lift housing, a tank) on some
        B.add(CM.trim, box([(fx0 + fx1) / 2, yt - 0.2, (fz0 + fz1) / 2], [fx1 - fx0 + 0.15, 0.4, fz1 - fz0 + 0.15], { seed }), 'cornices');
        if (r() < 0.22 && hill) {
          const along = Math.abs(sd.u[0]) > 0.5;      // the ridge runs back from the street (a gable end to it)
          B.add(CM.roof, gableRoof([(fx0 + fx1) / 2, (fz0 + fz1) / 2], along ? fz1 - fz0 : fx1 - fx0, along ? fx1 - fx0 : fz1 - fz0, yt, along ? Math.PI / 2 : 0, seed), 'roofs');
        } else if (r() < 0.3) {
          B.add(CM.facade, box([fx0 + (fx1 - fx0) * (0.25 + 0.5 * r()), yt + 1.2, fz0 + (fz1 - fz0) * (0.25 + 0.5 * r())], [2.4, 2.4, 2.4], { seed }), 'roofs');
        }
        // bay windows (San Francisco's: a canted bay 3 m across, 0.75 m out, from the second storey to the top) on the
        // houses and small flats along the street
        if (!big && storeys >= 2 && r() < 0.7) {
          const nbw = w > 9 ? 2 : 1;
          for (let k = 0; k < nbw; k++) {
            const uc = s + (k + 0.5) * w / nbw, bxc = sd.o[0] + sd.u[0] * uc, bzc = sd.o[1] + sd.u[1] * uc;
            const yb0 = Math.min(...ys) + 3.3, yb1 = yt - 0.5;
            if (yb1 - yb0 < 2.5) continue;
            B.add(CM.facade, bayGeo([bxc, bzc], sd.u, sd.n, 3.0, 0.75, yb0, yb1, Math.min(...ys), seed), 'bays');
          }
        }
        // a street tree in front of one lot in three (planted in the sidewalk, 1.2 m from the kerb)
        if (r() < 0.36) {
          const tx = cx + sd.u[0] * w * 0.5 + sd.n[0] * 2.2, tz = cz + sd.u[1] * w * 0.5 + sd.n[1] * 2.2;
          streetTrees.push([tx, landAt(tx, tz), tz, 5 + r() * 4, 3 + r() * 2]);
        }
        footprints.push([+fx0.toFixed(1), +fz0.toFixed(1), +fx1.toFixed(1), +fz1.toFixed(1), +yt.toFixed(1)]);
        nb++;
        s += w;
      }
    }
  }
  // the surface parking lots (traced): bays 2.6 x 5.5 m in double rows with 7 m aisles, three cars in four bays (an
  // evening's occupancy, est.)
  const parked = [];
  for (const [x0p, z0p, x1p, z1p] of LANDUSE.parking) {
    for (let x = x0p + 3; x < x1p - 3; x += 2.6) for (let z = z0p + 4; z < z1p - 4; z += 18) for (const dz of [0, 5.6]) {
      if (r() > 0.75) continue;
      const y = landAt(x, z + dz);
      parked.push([x, y - 0.04, z + dz + 2.75, r()]);
    }
  }
  if (parked.length) {
    const wheel = (x, z) => cylinder([x - 0.11, 0.32, z], [x + 0.11, 0.32, z], 0.32, 8);
    const carG = merge([box([0, 0.66, 0], [1.8, 0.7, 4.5]), box([0, 1.3, 0.2], [1.6, 0.6, 2.4]), wheel(0.8, 1.4), wheel(-0.8, 1.4), wheel(0.8, -1.4), wheel(-0.8, -1.4)]);
    const cm = world.mesh(carG, CM.cars, { count: parked.length, name: 'city:parked cars' });
    parked.forEach(([x, y, z, k], i) => cm.setMatrixAt(i, new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), k < 0.5 ? 0 : Math.PI), new T.Vector3(1, 1, 1))));
    cm.instanceMatrix.needsUpdate = true; cm.computeBoundingSphere();
  }
  // the street lights (CITY_LAMP; their pools are land.js's): a pole, an arm over the road, a lit head
  const poles = [], heads = [];
  const lampAt = (x, z, ax, side) => {
    if (x < NEAR.x0 + 2 || x > NEAR.x1 - 2 || z > NEAR.z1 - 2) return;
    if (-landAt.shore(x, z) < 44 || Math.abs(landAt.emb(x, z)) < 19) return;
    const y = landAt(x, z), o = side * (hw - CITY_LAMP.kerb), px = ax === 0 ? x : x, pz = z;
    const inward = ax === 0 ? [0, -side] : [-side, 0];
    poles.push(cylinder([px, y, pz], [px, y + CITY_LAMP.h + 0.1, pz], 0.09, 6));
    const hx = px + inward[0] * 1.8, hz = pz + inward[1] * 1.8;
    poles.push(beam([px, y + CITY_LAMP.h, pz], [hx, y + CITY_LAMP.h + 0.15, hz], 0.07, 0.07));
    heads.push(box([hx, y + CITY_LAMP.h + 0.05, hz], [0.5, 0.12, 0.5]));
  };
  for (let k = Math.floor((NEAR.z0 - GRID.z0) / GRID.pz); k <= Math.ceil((NEAR.z1 - GRID.z0) / GRID.pz); k++) {
    const zc = GRID.z0 + k * GRID.pz, sp = GRID.px / CITY_LAMP.perEW;
    for (let j = Math.floor((NEAR.x0 - GRID.x0) / sp) - 1; j <= Math.ceil((NEAR.x1 - GRID.x0) / sp); j++) {
      const t = (j + 0.5) * sp, side = ((j % 2) + 2) % 2 === 0 ? 1 : -1;
      lampAt(GRID.x0 + t, zc + side * (hw - CITY_LAMP.kerb), 0, side);
    }
  }
  for (let k = Math.floor((NEAR.x0 - GRID.x0) / GRID.px); k <= Math.ceil((NEAR.x1 - GRID.x0) / GRID.px); k++) {
    const xc = GRID.x0 + k * GRID.px, sp = GRID.pz / CITY_LAMP.perNS;
    for (let j = Math.floor((-60 - GRID.z0) / sp) - 1; j <= Math.ceil((NEAR.z1 - GRID.z0) / sp); j++) {
      const t = (j + 0.5) * sp, side = ((j % 2) + 2) % 2 === 0 ? 1 : -1;
      lampAt(xc + side * (hw - CITY_LAMP.kerb), GRID.z0 + t, 1, side);
    }
  }
  if (poles.length) {
    world.mesh(merge(poles), CM.pole, { name: 'city:street light poles' });
    world.mesh(merge(heads), CM.head, { name: 'city:street light heads' });
  }
  const meshes = [];
  for (const B of tiles.values()) { meshes.push(...B.flush()); tri += B.total(); }
  out.city = { buildings: nb, tri, blocks: blocks.length, ms: performance.now() - t0, footprints, meshes, streetTrees };
  return out.city;
}
