// liberty/src/far/landmarks.js: the skyline's and the bay's landmarks built by hand (B6), each at its footprint
// (DataSF, OSM) and to its published numbers:
//  - the Transamerica Pyramid (1972): 260 m (853 ft), a square base 53 m (175 ft) tapering to the 48th floor, its
//    wings (the lift shafts east, the stairs west) from the 29th, the hollow spire above; floodlit white, a red beacon
//  - Salesforce Tower (2018): 326 m (1,070 ft), a square with rounded corners ~52 m tapering to the crown; its
//    crown's 11,000 LEDs (Jim Campbell's 'Day for Night', the top nine floors: low-resolution figures and weather,
//    drifting); red beacons
//  - the Ferry Building's clock tower (1898): 245 ft (74.7 m), its four lit clock faces 22 ft across
//  - Alcatraz's lighthouse (1909): the tower 84 ft (26 m) on the island's crest, its focal plane 65 m (214 ft) above
//    the water, flashing white every 5 s (Fl W 5s, 22 nmi; site.md §3); the water tower; the power house's chimney
// and the city's towers' red obstruction beacons (every tower over 120 m).
import { lin, hash1 } from 'scene3d/util.js';
import { box, beam, lathe, merge } from 'scene3d/geom.js';
import { solidMat, lineMat, lineMesh, AIR_GLSL, AIR_U } from './structure.js';
import { json } from './data.js';
import { LIGHT_COL } from './sprites.js';

const T = window.THREE;
const rot = (c, a, x, z) => [c[0] + Math.cos(a) * x - Math.sin(a) * z, c[1] + Math.sin(a) * x + Math.cos(a) * z];

export const MARKS = {
  transamerica: { c: [278, 1507], y0: 3.3, top: 264.1, side: 53, rot: -5.7, body: 212, spireBase: 15 },
  salesforce: { c: [738, 2158], y0: 4.0, top: 330.0, roof: 274, side: 52, sideTop: 44, rot: 48.5, crown: 52 },
  ferry: { c: [1075, 1545], y0: 3.1, axis: 57.4, depth: 58, tower: 74.7, front: 17 },
  sutro: { c: [-4398, 5688], h: 298, spread: 26, waist: 8, bars: [88, 160, 232] },
  alcatraz: { light: [-1224, -2026], lightH: 26, focal: 65, period: 5, water: [-1370, -2182], chimney: [-1408, -2261] },
};

// a loft of a squarish section (superellipse, exponent p) through rings [y, half-size], with the facade's attributes
// (aU: m along the perimeter, aB: centre x, z, base y, height to the roof) so the city's window shader dresses it
function loft(c, a, rings, p, base, roofH, seg = 48) {
  const pos = [], au = [], ab = [], idx = [];
  rings.forEach(([y, h], j) => {
    let u = 0, prev = null;
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
      const x = h * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / p), z = h * Math.sign(st) * Math.pow(Math.abs(st), 2 / p);
      const [wx, wz] = rot(c, a, x, z);
      if (prev) u += Math.hypot(wx - prev[0], wz - prev[1]);
      prev = [wx, wz];
      pos.push(wx, y, wz); au.push(u); ab.push(c[0], c[1], base, roofH);
    }
  });
  const n = seg + 1;
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < seg; i++) {
    const a0 = j * n + i, b0 = a0 + 1, a1 = a0 + n, b1 = a1 + 1;
    idx.push(a0, a1, b1, a0, b1, b0);
  }
  // the top cap
  const ct = pos.length / 3, ty = rings[rings.length - 1][0];
  pos.push(c[0], ty, c[1]); au.push(0); ab.push(c[0], c[1], base, roofH);
  for (let i = 0; i < seg; i++) { const k = (rings.length - 1) * n + i; idx.push(k, ct, k + 1); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('aU', new T.Float32BufferAttribute(au, 1));
  g.setAttribute('aB', new T.Float32BufferAttribute(ab, 4)); g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
// a box's faces with the facade's attributes (for wings and towers dressed by the window shader)
function facadeBox(c, a, hx, hz, y0, y1, base, roofH) {
  const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => rot(c, a, x, z));
  const pos = [], au = [], ab = [], idx = []; let u = 0;
  for (let i = 0; i <= 4; i++) {
    const p = corners[i % 4]; if (i > 0) u += Math.hypot(p[0] - corners[(i - 1) % 4][0], p[1] - corners[(i - 1) % 4][1]);
    pos.push(p[0], y0, p[1], p[0], y1, p[1]); au.push(u, u); ab.push(c[0], c[1], base, roofH, c[0], c[1], base, roofH);
  }
  for (let i = 0; i < 4; i++) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  const t0 = pos.length / 3;
  for (const p of corners) { pos.push(p[0], y1, p[1]); au.push(0); ab.push(c[0], c[1], base, roofH); }
  idx.push(t0, t0 + 2, t0 + 1, t0, t0 + 3, t0 + 2);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('aU', new T.Float32BufferAttribute(au, 1));
  g.setAttribute('aB', new T.Float32BufferAttribute(ab, 4)); g.setIndex(idx);
  // (winding: outward by the corners' order; fixed below if the first face points in)
  g.computeVertexNormals();
  return g;
}
function mergeAttr(list) {
  // merge geometries with position, aU, aB (indexed)
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), au = new Float32Array(nv), ab = new Float32Array(nv * 4), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, ov * 3); au.set(g.attributes.aU.array, ov); ab.set(g.attributes.aB.array, ov * 4);
    for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov;
    ov += g.attributes.position.count; oi += g.index.count;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aU', new T.BufferAttribute(au, 1)); g.setAttribute('aB', new T.BufferAttribute(ab, 4));
  g.setIndex(new T.BufferAttribute(idx, 1)); g.computeBoundingSphere();
  return g;
}

// the crown's LEDs: 'Day for Night' (low-resolution moving figures and weather): a slow field of soft shapes drifting
// across a ~1.2 m pixel grid, white, a pure function of t
const CROWN_GLSL = /* glsl */`
uniform vec4 uCrown;     // centre x, z, y0, y1
// a walking figure in low resolution: a head, a body, two legs scissoring with its stride (u: m along the crown from
// the figure's centre; y: m up the screen; h: its height)
float figure(vec2 q, float h, float ph) {
  vec2 p = q / h;
  float head = 1.0 - smoothstep(0.06, 0.09, length(p - vec2(0.0, 0.88)));
  float body = (1.0 - smoothstep(0.1, 0.14, abs(p.x))) * step(0.45, p.y) * step(p.y, 0.8);
  float sw = 0.12 * sin(ph);
  float legs = 0.0;
  for (int k = 0; k < 2; k++) { float s = k == 0 ? sw : -sw; float x = p.x - s * (0.45 - p.y) / 0.45; legs = max(legs, (1.0 - smoothstep(0.04, 0.07, abs(x))) * step(0.0, p.y) * step(p.y, 0.47)); }
  return max(head, max(body, legs));
}
float crownField(vec2 q, float t) {
  q = floor(q / 1.2) * 1.2 + 0.6;                       // the LEDs' coarse grid (11,000 over the top nine floors)
  float a = 0.0, per = 175.0;
  for (int k = 0; k < 5; k++) {
    float fk = float(k), dir = mod(fk, 2.0) < 0.5 ? 1.0 : -1.0, v = 1.1 + 0.25 * fk;
    float u = mod(q.x - (fk * 37.0 + dir * v * t), per) - per * 0.5;
    a = max(a, figure(vec2(u, q.y - 1.5), 26.0 + 3.0 * fk, t * v * 0.55 + fk));
  }
  float clouds = 0.5 + 0.5 * vnoise(q * 0.05 + vec2(t * 0.03, 0.0));
  return clamp(0.06 * clouds + 0.9 * a, 0.0, 1.0);
}`;

export async function buildLandmarks(world, ctx, { facade, lights, towers, ground }) {
  const t0 = performance.now();
  const out = {};
  const L = lights;
  const DEG = Math.PI / 180;
  // ---- the Transamerica Pyramid
  {
    const M = MARKS.transamerica, a = M.rot * DEG, c = M.c, y0 = M.y0;
    const hb = M.side / 2, ht = M.spireBase / 2;
    const body = loft(c, a, [[y0 - 2, hb], [y0 + 18, hb], [y0 + M.body, ht + 1.5]], 14, y0, M.body, 32);
    // the wings: east (lifts) and west (stairs), from the 29th floor (~105 m) to above the 48th, flush with the faces
    const fy = y => hb - (hb - ht - 1.5) * (y - y0 - 18) / (M.body - 18);
    const wing = sx => facadeBox(rot(c, a, sx * (fy(160) + 3.0), 0), a, 4.0, 7.5, y0 + 105, y0 + M.body + 14, y0, M.body);
    const g = mergeAttr([body, wing(1), wing(-1)]);
    world.mesh(g, facade, { name: 'landmark:transamerica pyramid', cast: false });
    // the spire: a slim pyramid, floodlit white at night; the crown jewel's red beacon at the tip
    const spire = new T.ConeGeometry(ht * Math.SQRT2, M.top - (y0 + M.body), 4, 1, true);
    spire.rotateY(Math.PI / 4 - a); spire.translate(c[0], y0 + M.body + (M.top - y0 - M.body) / 2, c[1]);
    world.mesh(spire, solidMat(world, 'transamerica spire', '#e8e4da', { flood: '#fff4e4', floodH: 1e6, night: 0.7 }), { name: 'landmark:transamerica spire', cast: false });
    L.fixed.add(c[0], M.top + 0.5, c[1], LIGHT_COL.red, 3.5, { size: 1.2, minPx: 2.0, on: 0, period: 1.6, duty: 0.5 });
    out.transamerica = { top: M.top, base: M.side };
  }
  // ---- Salesforce Tower: the shaft (the window shader dresses it) and the crown's lattice with its LEDs
  {
    const M = MARKS.salesforce, a = M.rot * DEG, c = M.c, y0 = M.y0;
    const shaft = loft(c, a, [[y0 - 2, M.side / 2], [y0 + 40, M.side / 2], [M.roof, M.sideTop / 2 + 0.6]], 7, y0, M.roof - y0, 48);
    world.mesh(shaft, facade, { name: 'landmark:salesforce tower', cast: false });
    const crownG = loft(c, a, [[M.roof, M.sideTop / 2 + 0.6], [M.top, M.sideTop / 2 - 2.0]], 7, M.roof, M.top - M.roof, 48);
    const crownM = world.mat({
      name: 'salesforce crown', lines: 1, double: true, defines: { SPOTS: 0 }, noFog: true, varyings: 'varying float vU2; varying vec4 vB2;',
      uniforms: Object.assign({ uCrown: { value: new T.Vector4(c[0], c[1], M.roof, M.top) }, uAlb: { value: new T.Vector3(...lin('#d9dcdc')) } }, AIR_U),
      vertex: 'attribute float aU; attribute vec4 aB;\nvoid worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vU2 = aU; vB2 = aB; }',
      surface: AIR_GLSL + CROWN_GLSL + /* glsl */`
uniform vec3 uAlb;
void smain(inout Surface s, vec3 P, vec3 V) {
  // the lattice: vertical fins every 1.5 m, open between them above the top floor (the crown is a screen of fins)
  float f = fract(vU2 / 1.5), fw = fwidth(vU2 / 1.5);
  float fin = 1.0 - smoothstep(0.18, 0.18 + fw, abs(f - 0.5) * 2.0 - 0.6);
  float y = (P.y - uCrown.z) / (uCrown.w - uCrown.z);
  bool open = y > 0.55;
  if (open && fin < 0.5 && fw < 0.4) discard;
  s.albedo = uAlb * mix(1.0, 0.5, uNight); s.rough = 0.4; s.spec = 0.4;
  // the LED field on the screen's lower part (the top nine floors), white, drifting
  float night = smoothstep(0.15, 0.6, uNight);
  float led = crownField(vec2(vU2, P.y - uCrown.z), uTime + 300.0) * step(y, 0.62) * step(0.04, y);
  s.emissive += vec3(0.9, 0.93, 1.0) * led * 1.3 * night;
  farAir(s, P);
}`,
    });
    world.mesh(crownG, crownM, { name: 'landmark:salesforce crown', cast: false });
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => rot(c, a, x * (M.sideTop / 2 - 3), z * (M.sideTop / 2 - 3)))) L.fixed.add(x, M.top + 0.8, z, LIGHT_COL.red, 3.2, { size: 1.0, minPx: 1.9, on: 0 });
    out.salesforce = { top: M.top, roof: M.roof };
  }
  // ---- the Ferry Building's clock tower (the hall itself is in the city's footprints)
  {
    const M = MARKS.ferry, a = M.axis * DEG, c = M.c;
    const n = [-Math.sin(a), Math.cos(a)];          // across the building: toward the city (SW)
    const tc = [c[0] - n[0] * M.front * (n[0] < 0 ? -1 : 1), c[1] - n[1] * M.front * (n[0] < 0 ? -1 : 1)];
    const y0 = M.y0, stages = [[y0, y0 + 46, 13.0], [y0 + 46, y0 + 58, 11.4], [y0 + 58, y0 + 66, 9.0], [y0 + 66, y0 + 71, 6.2]];
    const g = merge(stages.map(([ya, yb, w]) => box([tc[0], (ya + yb) / 2, tc[1]], [w, yb - ya, w], { rotY: -a })).concat([box([tc[0], y0 + 72.5, tc[1]], [2.4, 3.0, 2.4], { rotY: -a })]));
    world.mesh(g, solidMat(world, 'ferry building tower', '#d8cfb8', { flood: '#ffe0b0', floodH: 90, night: 0.75 }), { name: 'landmark:ferry building tower', cast: false });
    // the four clock faces: lit discs on the clock stage
    const faces = [];
    for (let k = 0; k < 4; k++) {
      const ang = -a + k * Math.PI / 2, dx = Math.sin(ang), dz = Math.cos(ang);
      const d = new T.CircleGeometry(3.35, 24); d.rotateY(ang); d.translate(tc[0] + dx * 5.75, y0 + 52, tc[1] + dz * 5.75); faces.push(d);
    }
    const fm = world.mat({ name: 'ferry clock faces', lines: 0, defines: { SPOTS: 0 }, surface: 'void smain(inout Surface s, vec3 P, vec3 V) { s.albedo = vec3(0.8, 0.78, 0.7); s.emissive = vec3(1.0, 0.95, 0.82) * 1.6 * smoothstep(0.1, 0.5, uNight); }' });
    world.mesh(merge(faces), fm, { name: 'landmark:ferry building clocks', cast: false });
    out.ferry = { tower: M.tower, at: tc.map(v => +v.toFixed(0)) };
  }
  // ---- Alcatraz: the lighthouse (white, its lantern black), the water tower, the chimney; the light Fl W 5 s
  {
    const M = MARKS.alcatraz, hAt = ground;
    const gl = hAt(M.light[0], M.light[1]);
    // (slender: photos 30, 45 put its shaft at a fifth of its height; the gallery, the lantern, the cap)
    const prof = [[2.3, 0], [2.0, 12], [1.75, M.lightH - 4.5], [2.2, M.lightH - 4.4], [2.2, M.lightH - 4.0], [1.3, M.lightH - 3.9], [1.3, M.lightH], [1.0, M.lightH + 0.8], [0.1, M.lightH + 1.6]];
    const tower = lathe(prof.map(([r, y]) => [r, y]), 8); tower.translate(M.light[0], gl, M.light[1]);
    world.mesh(tower, solidMat(world, 'alcatraz lighthouse', '#ece8e0', { night: 0.6 }), { name: 'landmark:alcatraz lighthouse', cast: false });
    const focal = Math.max(gl + M.lightH - 2.0, M.focal);
    // the flash: a rotating lens's beam passing the eye, ~0.5 s every 5 s; white, the brightest thing on the bay
    L.fixed.add(M.light[0], focal, M.light[1], LIGHT_COL.white, 9.0, { size: 2.0, minPx: 3.4, on: 0, period: M.period, duty: 0.1, phase: 1.3 });
    L.fixed.add(M.light[0], focal, M.light[1], LIGHT_COL.amber, 0.25, { size: 0.8, minPx: 1.2, on: 0.2 });
    // the water tower on its legs, the power house's chimney
    const gw = hAt(M.water[0], M.water[1]), wt = [];
    for (const [dx, dz] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) wt.push(beam([M.water[0] + dx, gw, M.water[1] + dz], [M.water[0] + dx * 0.8, gw + 20, M.water[1] + dz * 0.8], 0.5, 0.5));
    const tank = lathe([[0.1, 0], [4.6, 0.2], [4.6, 7.0], [3.6, 8.2], [0.1, 8.6]], 16); tank.translate(M.water[0], gw + 20, M.water[1]); wt.push(tank);
    const gc = hAt(M.chimney[0], M.chimney[1]);
    const ch = lathe([[1.6, 0], [1.3, 28], [1.4, 29]], 10); ch.translate(M.chimney[0], gc, M.chimney[1]); wt.push(ch);
    world.mesh(merge(wt), solidMat(world, 'alcatraz water tower', '#b9b5aa', { night: 0.6 }), { name: 'landmark:alcatraz water tower', cast: false });
    // a few of the island's lamps (the dock, the road, the cellhouse's floods): warm, sparse
    for (const [x, z, k] of [[-1180, -2074, 1.2], [-1150, -2098, 1.0], [-1296, -2075, 0.8], [-1259, -2044, 0.9], [-1441, -2186, 0.6], [-1332, -2119, 0.7], [-1210, -2110, 0.8]]) L.fixed.add(x, hAt(x, z) + 6, z, LIGHT_COL.sodium, k, { size: 1.0, minPx: 1.4 });
    out.alcatraz = { lightGround: +gl.toFixed(1), focal: +focal.toFixed(1), period: M.period };
  }
  // ---- Sutro Tower (1973): 298 m (977 ft) on Mount Sutro's shoulder, three legs braced at three levels, three masts
  // above; red and white; its red beacons at every level (the city's night landmark from the west and the hills)
  {
    const M = MARKS.sutro, c = M.c, g = ground(c[0], c[1]);
    const leg = (k, y) => { const r = M.spread + (M.waist - M.spread) * Math.min(1, y / M.bars[2]), a = k * Math.PI * 2 / 3 + 0.3; return [c[0] + Math.cos(a) * r, g + y, c[1] + Math.sin(a) * r]; };
    const segs = [];
    for (let k = 0; k < 3; k++) {
      for (let y = 0; y < M.bars[2]; y += 24) segs.push({ a: leg(k, y), b: leg(k, Math.min(y + 24, M.bars[2])), w: 3.2 });
      for (const y of M.bars) segs.push({ a: leg(k, y), b: leg((k + 1) % 3, y), w: 2.4 });
      const top = leg(k, M.bars[2]); segs.push({ a: top, b: [top[0], g + M.h - (k === 0 ? 0 : 10), top[2]], w: 1.6 });
      for (const y of [0.25, 0.5, 0.75, 1.0].map(f => f * M.bars[2])) { const p = leg(k, y); L.fixed.add(p[0], p[1] + 1, p[2], LIGHT_COL.red, 2.4, { size: 1.0, minPx: 1.7, on: 0 }); }
      L.fixed.add(top[0], g + M.h - (k === 0 ? 0 : 10) + 1, top[2], LIGHT_COL.red, 3.0, { size: 1.2, minPx: 2.0, on: 0, period: 1.5, duty: 0.5, phase: k * 0.2 });
    }
    lineMesh(world, lineMat(world, 'sutro tower', '#b8483c', { minPx: 1.1, night: 0.5 }), segs, 'landmark:sutro tower');
    out.sutro = { top: +(g + M.h).toFixed(0), ground: +g.toFixed(0) };
  }
  // ---- the Port of Oakland's container cranes (OSM's 36; photo 21: lit behind the Bay Bridge): ship-to-shore cranes on
  // rails 30.5 m apart, the portal 48 m up, a 65 m outreach over the water (lowered where a ship is worked, raised ~80
  // deg where none is), the A-frame at 85 m with its forestays; floodlit sodium and white, red beacons on the apex and
  // the boom's tip (dimensions: a super-post-Panamax crane, est.)
  {
    const C = (await json('far/cranes.json')).cranes, segs = [], houses = [];
    C.forEach(([x, z, ang, gy], i) => {
      const u = [Math.cos(ang), Math.sin(ang)], v = [-u[1], u[0]], g = Math.max(gy, 2);
      const P2 = (du, dv, y) => [x + u[0] * du + v[0] * dv, g + y, z + u[1] * du + v[1] * dv];
      const raised = hash1(i * 97 + 5) < 0.6;
      for (const du of [-15, 15]) for (const dv of [-9, 9]) segs.push({ a: P2(du, dv, 0), b: P2(du, dv, 48), w: 2.2 });
      for (const dv of [-9, 9]) { segs.push({ a: P2(-15, dv, 48), b: P2(15, dv, 48), w: 2.0 }); segs.push({ a: P2(-35, dv, 50), b: P2(15, dv, 50), w: 1.6 }); segs.push({ a: P2(-15, dv, 48), b: P2(0, dv * 0.6, 85), w: 1.4 }); segs.push({ a: P2(15, dv, 48), b: P2(0, dv * 0.6, 85), w: 1.4 }); }
      for (const du of [-15, 15]) segs.push({ a: P2(du, -9, 48), b: P2(du, 9, 48), w: 2.0 });
      const tip = raised ? P2(15 + 65 * Math.cos(80 * DEG), 0, 50 + 65 * Math.sin(80 * DEG)) : P2(80, 0, 50);
      for (const dv of [-4, 4]) segs.push({ a: P2(15, dv, 50), b: [tip[0] + v[0] * dv * 0.5, tip[1], tip[2] + v[1] * dv * 0.5], w: 1.6 });
      segs.push({ a: P2(0, 0, 85), b: tip, w: 0.5 });
      houses.push(box(P2(-27, 0, 54), [12, 7, 9], { rotY: -ang }));
      // the floods along the portal and the boom, the beacons
      for (const [du, dv] of [[-15, -9], [-15, 9], [15, -9], [15, 9], [0, -9], [0, 9]]) L.fixed.add(...P2(du, dv, 47), hash1(i * 3 + du) < 0.5 ? LIGHT_COL.sodium : LIGHT_COL.led4000, 2.0, { size: 1.6, minPx: 1.6, on: 0.1 });
      L.fixed.add(...P2(0, 0, 86), LIGHT_COL.red, 2.4, { size: 1.0, minPx: 1.6, on: 0 });
      L.fixed.add(tip[0], tip[1] + 1, tip[2], LIGHT_COL.red, 2.4, { size: 1.0, minPx: 1.6, on: 0, period: raised ? 0 : 2.0, duty: 0.5 });
    });
    lineMesh(world, lineMat(world, 'oakland cranes', '#d6d6d0', { minPx: 1.0, night: 0.55 }), segs, 'landmark:oakland cranes');
    world.mesh(merge(houses), solidMat(world, 'crane houses', '#cfd0cc', { night: 0.55 }), { name: 'landmark:oakland crane houses', cast: false });
    out.cranes = C.length;
  }
  // ---- the city's towers' obstruction beacons: red, steady, on every tower over 120 m (FAA AC 70/7460-1)
  let nb = 0;
  for (const t of towers) {
    if (t.roof - t.base < 120) continue;
    L.fixed.add(t.x, t.peak + 1.5, t.z, LIGHT_COL.red, 2.6, { size: 1.0, minPx: 1.8, on: 0, period: hash1(nb * 13) < 0.4 ? 2.0 : 0, duty: 0.5, phase: hash1(nb * 7) * 2 });
    nb++;
  }
  out.beacons = nb;
  out.ms = Math.round(performance.now() - t0);
  return out;
}
