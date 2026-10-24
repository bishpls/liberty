// liberty/src/far/city.js: San Francisco beyond B4's box (B6): every building from the city's footprints (DataSF,
// PDDL: 169,000 footprints with their 2010 LiDAR heights; the towers since 2010 at their published heights), in three
// levels of detail (tools/far_data.py): each footprint near the eye, neighbours of like height merged further out, blocks
// by height band beyond. A building crosses from one level to the next over a band of distance, dithered by its own
// fade (so a tile never pops and the two levels never draw the same pixel). Drawn the anime way (style.md §4, K3): flat
// pastel and stone walls by day; at night each window its own hash against the evening's lit share, a crisp emissive
// rectangle with no halo near, filtered to its average where it shrinks under a pixel (no crawl on a pan).
import { bytes } from './data.js';
import { HOLE } from './land.js';
import { lin } from 'scene3d/util.js';
import { AIR_GLSL, AIR_U } from './structure.js';

const T = window.THREE;
// the levels' reach (m from the eye to a building's centre) and the cross-fade bands
export const LOD = { d1: 1800, d2: 4600, band: 500 };
const TILE = [800, 1000, 3000];           // mesh tiles by level (m): few draws a pass, little drawn outside its band

// the binary: a JSON head, then the levels' arrays (tile, nv, vplanes, base, roof, peak, flags)
async function loadBuildings(file) {
  const u8 = await bytes(file);
  const hl = new DataView(u8.buffer, u8.byteOffset, 4).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + hl)));
  const body = u8.subarray(4 + hl), TA = { uint16: Uint16Array, int16: Int16Array, uint8: Uint8Array };
  const lods = head.lods.map(L => {
    const o = {};
    for (const [name, dt, off, n] of L.arrays) {
      const C = TA[dt], b = body.slice(off, off + n * C.BYTES_PER_ELEMENT);
      o[name] = new C(b.buffer);
    }
    // the vertices: byte planes of per-polygon deltas -> absolute (x, z) in metres
    const nvTot = L.nv, half = o.vplanes.length / 2, lo = o.vplanes.subarray(0, half), hi = o.vplanes.subarray(half);
    const q = new Int16Array(half);
    for (let i = 0; i < half; i++) q[i] = lo[i] | (hi[i] << 8);
    const verts = new Float32Array(half);
    let k = 0;
    for (let b = 0; b < L.n; b++) {
      const n = o.nv[b];
      let x = 0, z = 0;
      for (let v = 0; v < n; v++, k++) {
        if (v === 0) { x = q[2 * k]; z = q[2 * k + 1]; } else { x += q[2 * k]; z += q[2 * k + 1]; }
        verts[2 * k] = x * head.q; verts[2 * k + 1] = z * head.q;
      }
    }
    o.verts = verts; o.start = new Uint32Array(L.n);
    for (let b = 1; b < L.n; b++) o.start[b] = o.start[b - 1] + o.nv[b - 1];
    o.n = L.n;
    return o;
  });
  return { head, lods };
}

// one tile's geometry at one level: walls as two rings (bottom and top, u continuous round the perimeter) and the roof
// on the top ring; flat shading from the derivatives (no normals stored). Attributes: position, aU (m along the
// walls), aB (building centre x, z; base y; height to the roof)
function tileGeometry(L, ids, org) {
  let nv = 0, ni = 0;
  for (const b of ids) { const n = L.nv[b]; nv += 2 * (n + 1); ni += 6 * n + 3 * (n - 2); }
  const pos = new Float32Array(nv * 3), au = new Float32Array(nv), ab = new Float32Array(nv * 4);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let v0 = 0, i0 = 0;
  const contour = [], V2 = T.Vector2;
  for (const b of ids) {
    const n = L.nv[b], s = L.start[b], base = L.base[b] * 0.1 - 2.0, roof = L.roof[b] * 0.1, P = L.verts;
    let cx = 0, cz = 0, A = 0;
    for (let k = 0; k < n; k++) {
      const x0 = P[2 * (s + k)], z0 = P[2 * (s + k) + 1], x1 = P[2 * (s + (k + 1) % n)], z1 = P[2 * (s + (k + 1) % n) + 1];
      cx += x0; cz += z0; A += x0 * z1 - x1 * z0;
    }
    cx /= n; cz /= n;
    let u = 0;
    for (let k = 0; k <= n; k++) {
      const kk = k % n, x = P[2 * (s + kk)], z = P[2 * (s + kk) + 1];
      if (k > 0) { const kp = (k - 1) % n; u += Math.hypot(x - P[2 * (s + kp)], z - P[2 * (s + kp) + 1]); }
      for (const [j, y] of [[0, base], [1, roof]]) {
        const vi = v0 + 2 * k + j;
        pos[vi * 3] = x - org[0]; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = z - org[1];
        au[vi] = u; ab[vi * 4] = cx; ab[vi * 4 + 1] = cz; ab[vi * 4 + 2] = base + 2.0; ab[vi * 4 + 3] = roof - base - 2.0;
      }
    }
    // walls: outward (A > 0 in (x, z): the interior is on the left of each edge, so the winding flips)
    for (let k = 0; k < n; k++) {
      const a0 = v0 + 2 * k, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3;
      if (A > 0) { idx[i0++] = a0; idx[i0++] = b1; idx[i0++] = b0; idx[i0++] = a0; idx[i0++] = a1; idx[i0++] = b1; }
      else { idx[i0++] = a0; idx[i0++] = b0; idx[i0++] = b1; idx[i0++] = a0; idx[i0++] = b1; idx[i0++] = a1; }
    }
    // the roof: ear-clipped on the top ring, facing up
    contour.length = 0;
    for (let k = 0; k < n; k++) contour.push(new V2(P[2 * (s + k)], P[2 * (s + k) + 1]));
    const tris = T.ShapeUtils.triangulateShape(contour, []);
    let w = 0;
    for (const [a, b2, c] of tris) {
      const ax = contour[a].x, az = contour[a].y, bx = contour[b2].x, bz = contour[b2].y, qx = contour[c].x, qz = contour[c].y;
      const up = (bz - az) * (qx - ax) - (bx - ax) * (qz - az) > 0;
      const A1 = v0 + 2 * a + 1, B1 = v0 + 2 * b2 + 1, C1 = v0 + 2 * c + 1;
      if (up) { idx[i0++] = A1; idx[i0++] = B1; idx[i0++] = C1; } else { idx[i0++] = A1; idx[i0++] = C1; idx[i0++] = B1; }
      w++;
    }
    for (; w < n - 2; w++) { idx[i0++] = v0; idx[i0++] = v0; idx[i0++] = v0; }      // (a degenerate ring: padding)
    v0 += 2 * (n + 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('aU', new T.BufferAttribute(au, 1));
  g.setAttribute('aB', new T.BufferAttribute(ab, 4));
  g.setIndex(new T.BufferAttribute(idx, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// the facade: walls, windows and roofs from the building's height and a hash of its centre
export const FACADE_GLSL = /* glsl */`
uniform vec4 uFarEye;                 // the view's eye (xyz) for the levels' fades (the same in every pass)
uniform vec4 uLod;                    // d1, d2, band, level (0 1 2)
uniform vec3 uWarm, uCool, uGlass, uRoofA, uRoofB;
uniform vec3 uPal[8];
float lodFade(vec4 B) {
  float d = distance(uFarEye.xz, B.xy) + 0.3 * max(uFarEye.y - B.z, 0.0);
  float h = uLod.z * 0.5;
  float a = smoothstep(uLod.x - h, uLod.x + h, d), b = smoothstep(uLod.y - h, uLod.y + h, d);
  return uLod.w < 0.5 ? 1.0 - a : (uLod.w < 1.5 ? a * (1.0 - b) : b);
}
`;
const VERT = 'attribute float aU; attribute vec4 aB;\n' + FACADE_GLSL + /* glsl */`
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  vU = aU; vB = aB; vFade = lodFade(aB);
  // a building outside this level's band collapses (no raster for what the dither would throw away)
  if (vFade <= 0.0) P = vec3(aB.x, -1e4, aB.y);
}`;
const FRAG = FACADE_GLSL + /* glsl */`
// a box-filtered pulse train: the share of [x - w/2, x + w/2] inside the pulses [0, d) of period 1
float pulseInt(float x, float d) { return floor(x) * d + min(fract(x), d); }
float fpulse(float x, float d, float w) { w = max(w, 1e-4); return (pulseInt(x + 0.5 * w, d) - pulseInt(x - 0.5 * w, d)) / w; }
void smain(inout Surface s, vec3 P, vec3 V) {
  // the levels' dither: this building's fade against a per-pixel threshold, complementary across levels
  // (level 0 keeps th < fade, the next level 1 - th < fade: exactly complementary across a band)
  float th = ign(gl_FragCoord.xy);
  bool rising = uLod.w > 1.5 || (uLod.w > 0.5 && distance(uFarEye.xz, vB.xy) < 0.5 * (uLod.x + uLod.y));
  if ((rising ? 1.0 - th : th) >= vFade) discard;
  vec3 n = normalize(cross(dFdx(P), dFdy(P))); if (dot(n, V) < 0.0) n = -n;
  s.N = n; s.Ng = n;
  float seed = hash12(floor(vB.xy * 0.5) + 0.37);
  float H = vB.w;
  float tall = step(30.0, H), office = tall * step(0.35, seed);
  if (n.y > 0.7) {
    // roofs: tar or a pale membrane, a parapet line
    s.albedo = mix(uRoofA, uRoofB, step(0.55, hash11(seed * 91.0))); s.rough = 0.9;
    farAir(s, P);
    return;
  }
  float up = P.y - vB.z, along = vU;
  // the building's grid: storey, bay, window share of the cell (houses, mid-rise, towers: offices or flats)
  float stH = mix(mix(3.0, 3.2, step(15.0, H)), 3.9, office) + 0.25 * hash11(seed * 13.0);
  float bay = mix(mix(2.6, 3.1, step(15.0, H)), 1.6, office) + 0.6 * hash11(seed * 17.0) * (1.0 - office);
  float wf = mix(mix(0.38, 0.48, step(15.0, H)), 0.82, office), hf = mix(0.5, 0.62, office);
  vec2 cell = vec2(along / bay, (up - 0.6) / stH);
  vec2 fw = vec2(fwidth(along) / bay, fwidth(up) / stH) * 1.2;
  // the window's coverage of this pixel, filtered: crisp where a window spans pixels, its average where it doesn't
  float win = fpulse(cell.x - 0.5 + wf * 0.5, wf, fw.x) * fpulse(cell.y - 0.25, hf, fw.y) * step(0.6, up) * step(up, H - 0.8);
  float far = smoothstep(0.35, 0.9, max(fw.x, fw.y));
  // the wall by day: pastel stucco and painted wood (houses), stone and glass (towers)
  vec3 wall = uPal[int(floor(hash11(seed * 7.0) * 7.99))];
  vec3 tower = mix(vec3(0.42, 0.45, 0.48), vec3(0.62, 0.6, 0.55), hash11(seed * 23.0));
  wall = mix(wall, tower, tall);
  vec3 glass = uGlass * (0.8 + 0.4 * hash12(floor(cell) + seed));
  float nightA = smoothstep(0.3, 0.9, uNight);
  // from blue hour on, the far city reads as a silhouette (darker than its sky: style.md K, ref 11), beyond B4's near city
  float dusk = smoothstep(0.0, 0.5, uNight) * smoothstep(800.0, 2500.0, distance(cameraPosition.xz, P.xz));
  s.albedo = mix(wall, glass, win * (1.0 - 0.6 * far) * (1.0 - 0.8 * nightA)) * mix(1.0, 0.85, step(fract(cell.y), 0.08) * (1.0 - far));
  s.albedo *= mix(1.0, mix(0.8, 0.5, tall), nightA) * (1.0 - 0.6 * dusk);
  s.rough = 0.85; s.spec = 0.2 * win * tall;
  // night: each window lit or dark by its own hash against the evening's share (offices: whole floors on or off)
  // (the windows come on through the dusk: at 18:29 PDT, 17 minutes after sunset, uNight 0.19 and a fifth of the
  // evening's share lit; B4's near city ramps as smoothstep(0.1, 0.8))
  float night = smoothstep(0.05, 0.6, uNight);
  if (night > 0.0) {
    vec2 c = floor(cell);
    float share = mix(0.42, 0.3, office) * (0.85 + 0.3 * hash11(seed * 3.0));
    float floorOn = mix(1.0, step(0.45, hash12(vec2(c.y, seed * 9.0))), office);
    float on = step(hash12(c + seed * 71.0), mix(share, 0.8, office)) * floorOn;
    vec3 lc = mix(uWarm, uCool, step(mix(0.88, 0.45, office), hash12(c.yx + seed * 5.0)));
    float dim = mix(1.0, 0.45, step(0.66, hash12(c * 3.0 + seed)));
    float exact = on * dim;
    float mean = mix(share, 0.8 * 0.55, office) * 0.8 * mix(1.0, 0.55, office);
    // (sub-pixel windows merge into their facade's mean: kept at half, so a far tower is a dark mass with a glitter, not a lamp)
    s.emissive += lc * win * mix(exact, mean * 0.75, far) * 1.35 * night;
  }
  farAir(s, P);
}`;

export async function buildCity(world, ctx, { file = 'far/sf_bldg.bin.gz', name = 'far city', lod = LOD } = {}) {
  const t0 = performance.now();
  const B = await loadBuildings(file);
  const tl = performance.now() - t0;
  const PAL = ['#d9d2c3', '#e3dccb', '#cfc8b8', '#d8c9a8', '#bfc7c9', '#d6bfb3', '#eae5d8', '#c9b9a0'];
  const eye = new T.Vector4(0, 10, 0, 0);
  const shared = {
    uFarEye: { value: eye }, uWarm: { value: new T.Vector3(...lin('#ffc46e')) }, uCool: { value: new T.Vector3(...lin('#d6e4ff')) },
    uGlass: { value: new T.Vector3(...lin('#3a4752')) }, uRoofA: { value: new T.Vector3(...lin('#5d5f62')) }, uRoofB: { value: new T.Vector3(...lin('#9a9893')) },
    uPal: { value: PAL.map(c => new T.Vector3(...lin(c))) },
  };
  const mats = [0, 1, 2].map(l => world.mat({
    name: name + ' ' + l, lines: 1, defines: { SPOTS: 0 }, noFog: true, varyings: 'varying float vU; varying vec4 vB; varying float vFade;',
    uniforms: Object.assign({}, shared, AIR_U, { uLod: { value: new T.Vector4(lod.d1, lod.d2, lod.band, l) } }),
    vertex: VERT, surface: AIR_GLSL + FRAG,
  }));
  // tiles per level: the buildings grouped by their centres; level 0's geometry made when first needed
  const tiles = [];
  B.lods.forEach((L, l) => {
    const S = TILE[l], groups = new Map();
    for (let b = 0; b < L.n; b++) {
      const s = L.start[b];
      let cx = 0, cz = 0; for (let k = 0; k < L.nv[b]; k++) { cx += L.verts[2 * (s + k)]; cz += L.verts[2 * (s + k) + 1]; }
      cx /= L.nv[b]; cz /= L.nv[b];
      const key = Math.floor(cx / S) + ',' + Math.floor(cz / S);
      let g = groups.get(key); if (!g) groups.set(key, g = { ids: [], x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, y1: 0, i: Math.floor(cx / S), j: Math.floor(cz / S) });
      g.ids.push(b); g.x0 = Math.min(g.x0, cx); g.x1 = Math.max(g.x1, cx); g.z0 = Math.min(g.z0, cz); g.z1 = Math.max(g.z1, cz); g.y1 = Math.max(g.y1, L.roof[b] * 0.1);
    }
    for (const g of groups.values()) tiles.push({ l, L, ...g, org: [(g.i + 0.5) * S, (g.j + 0.5) * S], mesh: null });
  });
  const make = t => {
    const g = tileGeometry(t.L, t.ids, t.org);
    const m = world.mesh(g, mats[t.l], { name: name + ':' + ['buildings', 'rows', 'blocks'][t.l], cast: false });
    m.position.set(t.org[0], 0, t.org[1]); m.updateMatrixWorld(true);
    t.mesh = m; t.tris = g.index.count / 3;
    return m;
  };
  // which tiles a view needs: a level's tile when some building in it can be inside the level's band
  let made = 0;
  const update = cam => {
    const e = cam.position;
    eye.set(e.x, e.y, e.z, 0);
    for (const t of tiles) {
      const dx = Math.max(t.x0 - e.x, 0, e.x - t.x1), dz = Math.max(t.z0 - e.z, 0, e.z - t.z1);
      const dmin = Math.hypot(dx, dz), dmax = Math.hypot(Math.max(Math.abs(t.x0 - e.x), Math.abs(t.x1 - e.x)), Math.max(Math.abs(t.z0 - e.z), Math.abs(t.z1 - e.z)));
      const h = lod.band * 0.5 + 0.3 * Math.max(e.y, 0) + 5;
      const lo = t.l === 0 ? -1 : (t.l === 1 ? lod.d1 - h : lod.d2 - h), hi = t.l === 0 ? lod.d1 + h : (t.l === 1 ? lod.d2 + h : 1e9);
      const want = dmax >= lo && dmin <= hi;
      if (want && !t.mesh) { make(t); made++; }
      if (t.mesh) t.mesh.visible = want;
    }
  };
  // the levels 1 and 2 built at load (the whole city's skyline from anywhere), level 0 on demand
  for (const t of tiles) if (t.l > 0 || B.lods.length === 1) make(t);
  world.onFrame((tt, cam) => { if (cam) update(cam); });
  const counts = B.lods.map(L => L.n);
  // the towers (level 0's footprints at least 'minH' to the roof): centre, base, roof, peak (for beacons and measures)
  const towers = (minH = 90) => { const L = B.lods[0], out = []; for (let b = 0; b < L.n; b++) { const h = (L.roof[b] - L.base[b]) * 0.1; if (h < minH) continue; let cx = 0, cz = 0; const s = L.start[b]; for (let k = 0; k < L.nv[b]; k++) { cx += L.verts[2 * (s + k)]; cz += L.verts[2 * (s + k) + 1]; } out.push({ x: cx / L.nv[b], z: cz / L.nv[b], base: L.base[b] * 0.1, roof: L.roof[b] * 0.1, peak: L.peak[b] * 0.1, ring: Array.from({ length: L.nv[b] }, (_, k) => [L.verts[2 * (s + k)], L.verts[2 * (s + k) + 1]]) }); } return out; };
  return {
    tiles, update, counts, towers, mats, ms: Math.round(performance.now() - t0), loadMs: Math.round(tl), added: B.head.added,
    tris: () => tiles.filter(t => t.mesh && t.mesh.visible).reduce((a, t) => a + t.tris, 0),
    made: () => made,
  };
}
