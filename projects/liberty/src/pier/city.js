// liberty/src/pier/city.js: the city inside the near box (B4): North Beach, the waterfront's blocks and Telegraph Hill's
// houses, every building from DataSF's footprints with their 2010 LiDAR heights, the streets' furniture on OSM's streets
// (near.js's plan: assets/near, tools/near_data.py). Pastel stucco and painted wood (photos 12, 37); windows are the
// facade shader's (a storey 3.1-3.4 m, a bay 2.6-3.5 m): crisp emissive rectangles at night (style K3), each lit or dark
// by its own hash, a share that falls through the evening; no halo. Flat roofs with a cornice band (most of SF), a gable
// where the LiDAR's peak stands well over its median on a house, a rooftop box where it does on a flat roof; canted bay
// windows on the houses' street faces; the garages' open decks with cars on the roof. Parked cars in the car parks'
// stalls (2.6 x 5.5 m, 7 m aisles) and parallel in the streets' parking lanes, checked every build (near.js checkCars);
// the street lights (cobra heads); street trees on the sidewalks.
import { Bins } from 'scene3d/kit/arch/kit.js';
import { hash2 } from 'scene3d/util.js';
import { CITY_LAMP } from './land.js';
import { pierMat } from './mats.js';
import { box, merge, cylinder, beam, raw } from './geo.js';
import { lin } from 'scene3d/util.js';
import { CAR, STALL, checkCars, hash2k, onLand, embClear, inPoly } from './near.js';

const T = window.THREE;

// facade colours (sampled on photo 12's houses: #d3d0c7 cream, and the hill's pastels; photo 37), sRGB
const PASTEL = ['#d9d2c3', '#e3dccb', '#cfc8b8', '#d8c9a8', '#c9b9a0', '#e0d0b8', '#bfc7c9', '#c8d1d0', '#d6bfb3', '#cdb6a6', '#eae5d8', '#b8b5ad', '#d5cfa9', '#a9b4b6'];
// a building's seed for the facade shader: its wall's height above its base (decimetres) and its own fraction, negative
// for a garage
const packSeed = (topH, frac, garage) => (garage ? -1 : 1) * (Math.max(1, Math.round(topH * 10)) + Math.min(0.999, Math.max(0.001, frac))) / 10000;

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
      // aSeed packs the building (city.js packSeed): (its wall's height above its base in decimetres + its own random
      // fraction) / 10000, negative for a garage; the uv's u is metres along the wall, v metres above the base
      float sa = abs(sd), b = fract(sa * 10000.0), topH = floor(sa * 10000.0 + 1e-3) * 0.1, garage = step(sd, 0.0);
      if (s.N.y > 0.6) {
        // roofs: tar or a pale membrane; a garage's deck is concrete
        vec3 r = hash11(b * 97.0) < 0.55 ? uRoof : uRoofB;
        r = mix(r, vec3(0.26, 0.255, 0.245), garage);
        s.albedo = r * (0.9 + 0.1 * step(0.0, vnoise(P.xz * 0.4)));
        s.rough = 0.9; return;
      }
      if (garage > 0.5) {
        // a garage's open decks: a 3 m level, the slab and spandrel 1.1 m (pale concrete), the opening 1.9 m (its dark
        // inside; at night its tubes, cool and dim)
        float lv = fract(uv.y / 3.0), open = step(0.37, lv) * step(0.6, uv.y) * step(uv.y, topH - 0.9);
        vec3 conc = vec3(0.5, 0.49, 0.46) * (0.93 + 0.07 * step(0.5, fract(uv.x / 9.0)));
        s.albedo = mix(conc, vec3(0.035, 0.037, 0.04), open); s.rough = 0.9;
        s.emissive += uCool * open * 0.22 * smoothstep(0.1, 0.8, uNight) * step(0.3, fract(uv.x / 2.4));
        return;
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
      float win = step(wx, ww * 0.5) * step(0.3, fy) * step(fy, 0.84) * step(0.6, h) * step(0.8, topH - h);
      float frame = win * (1.0 - step(wx, ww * 0.5 - 0.05) * step(0.33, fy) * step(fy, 0.81));
      // the ground storey of a commercial building: a shop's wide glazing under a band
      float shop = step(0.62, hash11(b * 7.0)) * (1.0 - step(stH, h));
      win = mix(win, step(0.08, fx) * step(fx, 0.92) * step(0.08, fy) * step(fy, 0.8), shop);
      vec3 trim = mix(vec3(0.92, 0.9, 0.86), wall * 0.72, step(0.5, hash11(b * 3.0)));
      vec3 c = wall;
      // the plinth (the bottom 0.45 m, darker) and the cornice: a trim band in the top 0.5 m of every facade, a shadow
      // line under it (the line that draws every SF facade's edge)
      c *= 1.0 - 0.16 * (1.0 - step(0.45, h));
      float ft = topH - h;
      c = mix(c, mix(vec3(0.92, 0.9, 0.86), wall * 0.72, step(0.5, hash11(b * 3.0))), (1.0 - step(0.5, ft)) * step(-0.01, ft));
      c *= 1.0 - 0.3 * step(0.5, ft) * (1.0 - step(0.62, ft));
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
  const trim = pierMat(world, { name: 'city trim', lamps: false, uniforms: { uC: { value: new T.Vector3(...lin('#e4ded2')) } }, glsl: 'uniform vec3 uC;', body: 's.albedo = uC * (0.85 + 0.15 * fract(fract(abs(sd) * 10000.0) * 17.0)); s.rough = 0.85;' });
  const roof = pierMat(world, { name: 'city pitched roofs', lamps: false, uniforms: { uA: { value: new T.Vector3(...lin('#6d6a66')) }, uB: { value: new T.Vector3(...lin('#8e4f3a')) } }, glsl: 'uniform vec3 uA, uB;',
    body: 'vec3 c = mix(uA, uB, step(0.65, fract(fract(abs(sd) * 10000.0) * 23.0))); c *= 1.0 - 0.12 * step(0.5, fract(uv.x * 2.2 + uv.y * 0.0)); s.albedo = c; s.rough = 0.8;' });
  // parked cars: one colour a car (its instance's seed, aSeed per instance), from the US fleet's shares (white 25 %,
  // black 20 %, grey 18 %, silver 12 %, blue 10 %, red 8 %, other 7 %); dark glass above the waist (the cabin's sides)
  const cars = pierMat(world, { name: 'parked cars', lamps: false, uniforms: {}, glsl: /* glsl */`
      vec3 carPaint(float h) {
        if (h < 0.25) return vec3(0.78, 0.78, 0.76); if (h < 0.45) return vec3(0.03, 0.03, 0.035); if (h < 0.63) return vec3(0.16, 0.165, 0.17);
        if (h < 0.75) return vec3(0.45, 0.46, 0.47); if (h < 0.85) return vec3(0.05, 0.12, 0.3); if (h < 0.93) return vec3(0.42, 0.04, 0.04);
        return vec3(0.35, 0.3, 0.2); }`,
    // (the car's geometry carries its own (z, y) in the uv: the wheels 1.4 m fore and aft below 0.62 m, the sills below
    // 0.27 m, glass round the cabin)
    body: 'vec3 c = carPaint(fract(sd * 7.13)); float side = 1.0 - step(0.5, abs(s.N.y)); float wz = min(abs(uv.x - 1.4), abs(uv.x + 1.4)); float wheel = (1.0 - step(0.62, uv.y)) * (1.0 - step(0.34, wz)) * step(0.5, abs(s.N.x)); c = mix(c, vec3(0.02), side * max(wheel, 1.0 - step(0.27, uv.y))); c = mix(c, vec3(0.045, 0.055, 0.065), side * step(1.06, uv.y) * 0.9); s.albedo = c; s.rough = 0.35; s.spec = 0.6;' });
  const pole = pierMat(world, { name: 'city poles', lamps: false, uniforms: { uC: { value: new T.Vector3(...lin('#5b5f61')) } }, glsl: 'uniform vec3 uC;', body: 's.albedo = uC; s.rough = 0.6; s.spec = 0.2;' });
  const head = pierMat(world, { name: 'city lamp heads', lamps: false, lines: 0, uniforms: { uC: { value: new T.Vector3(...lin('#ffd2a0')) } }, glsl: 'uniform vec3 uC;', body: 's.albedo = uC * 0.6; s.emissive = uC * 4.0 * smoothstep(0.15, 0.55, uNight);' });
  return { facade, trim, roof, cars, pole, head };
}

// a footprint's walls (outer ring facing out, holes facing in: a courtyard's walls) from y0 to y1, their uv metres along
// the ring and above 'base'; and its roof cap (holes cut) at y1
function extrude(outer, holes, y0, y1, seed, base, cap = true, flip = false) {
  const pos = [], nrm = [], uv = [], idx = [];
  const ring = (poly, outward) => {
    let A = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; A += a[0] * b[1] - b[0] * a[1]; }
    const sg = (A > 0 ? -1 : 1) * (outward ? 1 : -1); let acc = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-3) continue;
      const n = [sg * (b[1] - a[1]) / L, 0, -sg * (b[0] - a[0]) / L], k = pos.length / 3;
      pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
      for (let j = 0; j < 4; j++) nrm.push(...n);
      uv.push(acc, y0 - base, acc + L, y0 - base, acc + L, y1 - base, acc, y1 - base);
      // (wind so the face looks along n: the triangle (a, b, b-top) faces (b - a) x up)
      const cx = -(b[1] - a[1]), cz = b[0] - a[0];
      if (cx * n[0] + cz * n[2] > 0) idx.push(k, k + 1, k + 2, k, k + 2, k + 3); else idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
      acc += L;
    }
  };
  ring(outer, !flip); for (const h of holes) ring(h, flip);
  const parts = [raw(pos, nrm, uv, idx, seed)];
  if (cap) {
    const shape = new T.Shape(outer.map(([x, z]) => new T.Vector2(x, -z)));
    for (const h of holes) shape.holes.push(new T.Path(h.map(([x, z]) => new T.Vector2(x, -z))));
    const g = new T.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, y1, 0);
    g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(seed), 1));
    parts.push(g);
  }
  return merge(parts);
}
// a car: the body and the cabin, five faces each (no floor): 20 triangles; the uv its own (z, y) (the shader's wheels, sills
// and glass); its long axis along +z
function carGeo() {
  const pos = [], nrm = [], uv = [], idx = [];
  const cube = (cx, cy, cz, sx, sy, sz) => {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const F = [[[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]],
      [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [0, 0, 1]], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]]];
    for (const [a, b, c, d, n] of F) {
      const k = pos.length / 3; for (const p of [a, b, c, d]) { pos.push(...p); nrm.push(...n); uv.push(p[2], p[1]); }
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0) idx.push(k, k + 1, k + 2, k, k + 2, k + 3); else idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
    }
  };
  cube(0, 0.505, 0, CAR.W, 1.01, CAR.L);          // the body, 0-1.01 m (its sides' foot the tyres and the sills, to the ground)
  cube(0, 1.285, -0.2, 1.6, 0.55, 2.5);           // the cabin, to 1.56 m, set back
  return raw(pos, nrm, uv, idx, 0.5);
}
// the principal axes of a footprint: its centre, the long axis' angle, its extents along and across
function obb(poly) {
  let cx = 0, cz = 0; for (const p of poly) { cx += p[0]; cz += p[1]; } cx /= poly.length; cz /= poly.length;
  let sxx = 0, szz = 0, sxz = 0; for (const p of poly) { const dx = p[0] - cx, dz = p[1] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const a = 0.5 * Math.atan2(2 * sxz, sxx - szz), u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of poly) { const pu = (p[0] - cx) * u[0] + (p[1] - cz) * u[1], pv = (p[0] - cx) * v[0] + (p[1] - cz) * v[1]; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); }
  const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
  return { c: [cx + u[0] * mu + v[0] * mv, cz + u[1] * mu + v[1] * mv], a, L: u1 - u0, W: v1 - v0 };
}

// a gable roof over a w x d rectangle at height y (rise: 40 % of the half-span), turned by a about y
function gableRoof(c, L, W, y, a, seed, riseIn = null) {
  const rise = riseIn != null ? riseIn : W * 0.5 * 0.8, hl = L / 2 + 0.25, hw = W / 2 + 0.3;
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

// the city: buildings from the footprints, the parked cars, the street lights and trees (SM: near.js's plan)
export function buildCity(world, M, landAt, out, SM) {
  const t0 = performance.now();
  const CM = cityMats(world);
  const tiles = new Map();
  const tileOf = (x, z) => { const k = Math.floor((x + 1000) / 260) + ',' + Math.floor((z + 1000) / 260); if (!tiles.has(k)) tiles.set(k, new Bins(world, 'city ' + k)); return tiles.get(k); };
  const footprints = [], streetTrees = [];
  const st = { bays: 0, gables: 0, boxes: 0, garages: 0, tooTall: 0 };
  // ---- the buildings
  for (const b of SM.buildings) {
    const ys = b.p.map(([x, z]) => landAt(x, z)), base = Math.min(...ys);
    const H = Math.max(3, b.r - b.g), top = base + H, frac = hash2(Math.round(b.c[0] * 10), Math.round(b.c[1] * 10));
    // (a garage's open decks on its walls when the car park is most of the footprint: DataSF joins some garages to their
    // offices; those keep their windows and carry the cars on the deck's part of the roof)
    const seed = packSeed(H, frac, b.garage >= 0.6), Bn = tileOf(b.c[0], b.c[1]);
    Bn.add(CM.facade, extrude(b.p, b.h, base - 0.3, top, seed, base), 'buildings');
    if (b.garage) {
      // the roof deck's parapet (1 m round the deck, both faces: seen from the deck too)
      const deck = b.deck || b.p, ps = packSeed(H + 1.0, frac, true);
      Bn.add(CM.facade, extrude(deck, [], top, top + 1.0, ps, base, false), 'buildings');
      Bn.add(CM.facade, extrude(deck, [], top, top + 1.0, ps, base, false, true), 'buildings');
      st.garages++;
    }
    footprints.push([+b.box[0].toFixed(1), +b.box[1].toFixed(1), +b.box[2].toFixed(1), +b.box[3].toFixed(1), +top.toFixed(1)]);
    const lift = b.k - b.r, house = H < 13 && b.area < 260 && !b.garage;
    // a gable where the LiDAR's peak stands well over its median (a pitched roof's ridge: 2.4 m clears the parapets,
    // chimneys and the trees over a roof's edge), on a house
    if (house && lift > 2.4) {
      const o = obb(b.p);
      if (o.W > 3 && o.L > 4) { Bn.add(CM.roof, gableRoof(o.c, o.L, o.W, top, o.a, seed, Math.min(4.0, Math.max(1.4, lift * 1.4))), 'roofs'); st.gables++; }
    } else if (!b.garage && lift > 1.2 && b.area > 150 && hash2k(b.c[0], b.c[1], 31) < 0.6 &&
      [[0, 0], [-1.8, -1.8], [1.8, -1.8], [1.8, 1.8], [-1.8, 1.8]].every(([dx, dz]) => inPoly(b.c[0] + dx, b.c[1] + dz, b.p) && !b.h.some(h => inPoly(b.c[0] + dx, b.c[1] + dz, h)))) {
      // a rooftop box (a stair or lift housing, a tank) where the peak stands over a flat roof (on the roof: off any courtyard)
      const sz = 2.4 + 1.2 * hash2k(b.c[0], b.c[1], 32), h = Math.min(4.0, Math.max(2.2, lift));
      const g = box([b.c[0], top + h / 2, b.c[1]], [sz, h, sz], { seed: packSeed(h, frac, false) });
      Bn.add(CM.facade, g, 'roofs'); st.boxes++;
    }
    // canted bay windows on a house's or small flats' street faces (from the second storey to under the cornice)
    if (!b.garage && H > 6.5 && H < 18 && b.area < 900) {
      for (let i = 0; i < b.p.length; i++) {
        const a = b.p[i], c = b.p[(i + 1) % b.p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (L < 4.5 || L > 14) continue;
        const u = [(c[0] - a[0]) / L, (c[1] - a[1]) / L], m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
        let n = [u[1], -u[0]]; if (inPoly(m[0] + n[0] * 0.3, m[1] + n[1] * 0.3, b.p)) n = [-n[0], -n[1]];
        const F = SM.fieldAt(m[0] + n[0] * 3.5, m[1] + n[1] * 3.5), F2 = SM.fieldAt(m[0] + n[0] * 0.9, m[1] + n[1] * 0.9);
        if (!(F.dB < 0 && F.dK > 0.3 && F2.dK > 0.4)) continue;
        if (hash2k(m[0], m[1], 33) > 0.7) continue;
        const nb = L > 10 ? 2 : 1, yg = landAt(m[0] + n[0], m[1] + n[1]);
        const y0 = Math.max(base + 3.3, yg + 2.7), y1 = top - 0.6;
        if (y1 - y0 < 2.5) continue;
        for (let k = 0; k < nb; k++) {
          const t = (k + 0.5) / nb * L, cc = [a[0] + u[0] * t, a[1] + u[1] * t];
          Bn.add(CM.facade, bayGeo(cc, u, n, 3.0, 0.75, y0, y1, base, seed), 'bays'); st.bays++;
        }
      }
    }
  }
  // ---- the parked cars: one instanced mesh (the stalls' at grade and on the roof decks, the kerbside), one colour a car
  const cars = SM.cars, carM = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(0, 0, 0, 'YXZ'), V = new T.Vector3(), S1 = new T.Vector3(1, 1, 1);
  const deckY = new Map(); for (const L of SM.lots) if (L.kind === 'garage') { const b = L.bldg, ys = b.p.map(([x, z]) => landAt(x, z)); deckY.set(L.id, Math.min(...ys) + Math.max(3, b.r - b.g)); }
  const seeds = new Float32Array(cars.length);
  const mats = cars.map((c, i) => {
    const yaw = Math.PI / 2 - c.a, ca = Math.cos(c.a), sa = Math.sin(c.a);
    let y, pitch = 0, roll = 0;
    if (c.kind === 'roof') y = deckY.get(c.ref);
    else {
      // on the ground mesh's slope (its own triangles): pitch from front to back, roll from side to side
      const G = landAt.mesh || landAt;
      const yF = G(c.x + ca * 2.0, c.z + sa * 2.0), yB = G(c.x - ca * 2.0, c.z - sa * 2.0), yR = G(c.x + sa * 0.8, c.z - ca * 0.8), yL = G(c.x - sa * 0.8, c.z + ca * 0.8);
      y = (yF + yB) / 2 - 0.02; pitch = -Math.atan2(yF - yB, 4.0); roll = Math.atan2(yR - yL, 1.6);
    }
    seeds[i] = hash2k(c.x, c.z, 41);
    e.set(pitch, yaw, roll); q.setFromEuler(e);
    return carM.compose(V.set(c.x, y, c.z), q, S1).clone();
  });
  let carCheck = null;
  if (cars.length) {
    const g = carGeo(); g.setAttribute('aSeed', new T.InstancedBufferAttribute(seeds, 1));
    const cm = world.mesh(g, CM.cars, { count: cars.length, name: 'city:parked cars' });
    mats.forEach((m, i) => cm.setMatrixAt(i, m));
    cm.instanceMatrix.needsUpdate = true; cm.computeBoundingSphere();
    carCheck = checkCars(cars, SM);
    if (carCheck.faults) console.warn('[pier] parked cars: ' + carCheck.faults + ' faults', JSON.stringify(carCheck));
  }
  // the stalls' lines (white, 0.1 m), at grade and on the decks
  if (SM.lines.length) {
    const pos = [], nrm = [], uv = [], idx = [];
    for (const l of SM.lines) {
      const ca = Math.cos(l.a), sa = Math.sin(l.a), hw = 0.05, hl = l.len / 2, cx = l.x, cz = l.z;
      const y = l.kind === 'roof' ? deckY.get(l.ref) + 0.02 : null;
      const k = pos.length / 3;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = cx + ca * su * hl - sa * sv * hw, z = cz + sa * su * hl + ca * sv * hw;
        pos.push(x, y != null ? y : (landAt.mesh || landAt)(x, z) + 0.03, z); nrm.push(0, 1, 0); uv.push(su, sv);
      }
      idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
    }
    const g = raw(pos, nrm, uv, idx);
    world.mesh(g, M.flat('stall lines', '#d6d4cc', { rough: 0.8 }), { name: 'city:stall lines', loose: 'paint: the stalls\' lines, 3 cm over the car park (a decal)' });
  }
  // ---- the street lights (CITY_LAMP; their pools are land.js's): a pole, an arm over the road, a lit head
  const poles = [], heads = [];
  for (const L of SM.lamps) {
    const [px, pz] = L.pole, y = landAt(px, pz), hx = L.head[0], hz = L.head[1];
    poles.push(cylinder([px, y, pz], [px, y + CITY_LAMP.h + 0.1, pz], 0.09, 6));
    poles.push(beam([px, y + CITY_LAMP.h, pz], [hx, y + CITY_LAMP.h + 0.15, hz], 0.07, 0.07));
    heads.push(box([hx, y + CITY_LAMP.h + 0.05, hz], [0.5, 0.12, 0.5]));
  }
  if (poles.length) {
    world.mesh(merge(poles), CM.pole, { name: 'city:street light poles' });
    world.mesh(merge(heads), CM.head, { name: 'city:street light heads' });
  }
  // ---- street trees: on the sidewalks 1 m behind the kerb, every 8 m a place, a third planted (fewer on the hill), clear
  // of the corners, the lights, the parked cars' doors and the buildings' faces
  for (const w of SM.ways) {
    for (const sd of [1, -1]) {
      const side = sd > 0 ? w.L : w.R; if (side.wk < 2.2) continue;
      for (let s = 4; s < w.len - 4; s += 8) {
        const f = SM.along(w, s), o = side.hr + 1.0, x = f.x + f.n[0] * sd * o, z = f.z + f.n[1] * sd * o;
        const y = landAt(x, z), pk = y > 18 ? 0.18 : 0.32;
        if (hash2k(x, z, 51) > pk) continue;
        if (!onLand(x, z) || embClear(x, z) < 3 || SM.nearJunction(x, z, 4) || SM.nearLamp(x, z, 4)) continue;
        const F = SM.fieldAt(x, z); if (!(F.dK > 0.6 && F.dB < -0.5)) continue;
        if (SM.inBuilding(x, z) || SM.inBuilding(x + f.n[0] * sd * 1.8, z + f.n[1] * sd * 1.8)) continue;
        streetTrees.push([x, y, z, 5 + 4 * hash2k(x, z, 52), 3 + 2 * hash2k(x, z, 53)]);
      }
    }
  }
  const meshes = [];
  let tri = 0;
  for (const B of tiles.values()) { meshes.push(...B.flush()); tri += B.total(); }
  out.city = { buildings: SM.buildings.length, tri, ms: performance.now() - t0, footprints, meshes, streetTrees, details: st, lamps: SM.lamps.length, cars: carCheck, lots: SM.lots.map(l => ({ kind: l.kind, id: l.osm || l.id, stalls: l.stalls, cars: l.cars })) };
  return out.city;
}
