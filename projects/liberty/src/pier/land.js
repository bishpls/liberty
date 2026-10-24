// liberty/src/pier/land.js: the land inside P.WORLD.near (B4): the ground from the terrain grid (assets/terrain/near.f16,
// USGS 3DEP via Terrain Tiles, on the world's frame), cut at the traced shore (site.js SHORE) by a signed-distance map,
// the seawall and its railing along the water, the Embarcadero painted from its cross-section along its length (site.js
// EMB.profile: the full section with the F-line's median from Kearny south-east, the narrow road by Pier 39), the city's
// streets, crosswalks, car parks and street lights' pools from near.js's plan (OSM's streets, their
// widths fitted to DataSF's building lines), parks from their traced outlines.
// landAt(x, z) is the land's height for anything standing on it.
import * as P from '../plan.js';
import { baked } from 'scene3d/bake.js';
import { SHORE, FRONTAGE, PARKS, EMB } from './site.js';
import { loadNear, streetModel, paintFields, NEAR_FILES } from './near.js';
import { pierMat } from './mats.js';
import { quads, orient, merge, box, beam } from './geo.js';
import { lin } from 'scene3d/util.js';

const T = window.THREE;
// the map's extent (2 m texels): the near box and a margin
export const MAP = { x0: -660, z0: -360, size: 1420, res: 2 };
MAP.n = MAP.size / MAP.res;
export const SHORE_Y = 2.92;
// the Embarcadero's lamps (embarcadero.js places them on this spacing and these phases; land.js draws their pools)
// the city's street lights (cobra heads, 3000 K LED: site.md §7): near.js places them along every street, alternating
// sides, on the sidewalk 0.6 m behind the kerb, the head 7.6 m up on a 1.8 m arm (city.js builds them; land.js draws
// their pools from the nearest head)
export const CITY_LAMP = { h: 7.6 };
export const LAMP_SPACING = 30, LAMP_PROM = { s: 10, e: -16.5, h: 5.0 }, LAMP_STREET = { s: 22, e: 12.8, h: 8.7 };                      // the waterfront's ground (the pier's deck is 2.95: the land meets it a curb lower)
const NEAR = P.WORLD.near;

function f16(h) {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}
// the near grid: 12 x 12 km at 12 m, rows along +z, columns along +x from -half
let DEM = null;
export async function loadDEM() {
  if (DEM) return DEM;
  const meta = await (await fetch(new URL('../../assets/terrain/meta.json', import.meta.url))).json();
  const buf = new Uint16Array(await (await fetch(new URL('../../assets/terrain/near.f16', import.meta.url))).arrayBuffer());
  const n = meta.near.n, half = meta.near.half, st = meta.near.step;
  const h = new Float32Array(n * n); for (let i = 0; i < h.length; i++) h[i] = f16(buf[i]);
  DEM = { n, half, st, h };
  DEM.at = (x, z) => {
    const fi = (z + half) / st, fj = (x + half) / st, i = Math.max(0, Math.min(n - 2, Math.floor(fi))), j = Math.max(0, Math.min(n - 2, Math.floor(fj)));
    const a = fi - i, b = fj - j, k = i * n + j;
    return h[k] * (1 - a) * (1 - b) + h[k + 1] * (1 - a) * b + h[k + n] * a * (1 - b) + h[k + n + 1] * a * b;
  };
  return DEM;
}

// the land polygon: the shore west to east, closed round the south past the near box
export const LAND = SHORE.concat([[SHORE[SHORE.length - 1][0], 1060], [SHORE[0][0], 1060]]);
function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2)) : 0;
  return Math.hypot(a[0] + t * dx - px, a[1] + t * dz - pz);
}
function inPoly(px, pz, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
// signed distance to a closed polygon (negative inside), clamped to +-lim, over the map's texels
function sdfField(poly, lim, edges = null) {
  const n = MAP.n, out = new Float32Array(n * n);
  const segs = []; const E = edges || poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
  for (const [a, b] of E) segs.push([a, b, Math.min(a[0], b[0]) - lim, Math.max(a[0], b[0]) + lim, Math.min(a[1], b[1]) - lim, Math.max(a[1], b[1]) + lim]);
  for (let i = 0; i < n; i++) {
    const z = MAP.z0 + (i + 0.5) * MAP.res;
    // even-odd crossings along this row, once (the row's inside spans)
    const xs = [];
    for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
      const [xi, zi] = poly[k], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z)) xs.push((xj - xi) * (z - zi) / (zj - zi) + xi);
    }
    xs.sort((a, b) => a - b);
    for (let j = 0; j < n; j++) {
      const x = MAP.x0 + (j + 0.5) * MAP.res;
      let c = 0; for (const v of xs) if (v < x) c++;
      let d = lim;
      for (const s of segs) { if (x < s[2] || x > s[3] || z < s[4] || z > s[5]) continue; const q = segDist(x, z, s[0], s[1]); if (q < d) d = q; }
      out[i * n + j] = (c & 1) ? -d : d;
    }
  }
  return out;
}
// the signed distance to the Embarcadero's centreline (+ on the city's side: the right of its west-to-east run)
function embField() {
  const n = MAP.n, out = new Float32Array(n * n), arc = new Float32Array(n * n), nx = new Float32Array(n * n), L = EMB.line, lim = 63;
  // (arc length from the first point the lamps' path starts at: embarcadero.js shorePath keeps x >= -620)
  const s0 = [0]; for (let k = 1; k < L.length; k++) s0.push(s0[k - 1] + Math.hypot(L[k][0] - L[k - 1][0], L[k][1] - L[k - 1][1]));
  const k0 = L.findIndex(p => p[0] >= -620), base = s0[k0];
  for (let i = 0; i < n; i++) {
    const z = MAP.z0 + (i + 0.5) * MAP.res;
    for (let j = 0; j < n; j++) {
      const x = MAP.x0 + (j + 0.5) * MAP.res;
      let best = lim, sg = 1;
      for (let k = 0; k < L.length - 1; k++) {
        const a = L[k], b = L[k + 1];
        if (x < Math.min(a[0], b[0]) - lim || x > Math.max(a[0], b[0]) + lim || z < Math.min(a[1], b[1]) - lim || z > Math.max(a[1], b[1]) + lim) continue;
        const d = segDist(x, z, a, b);
        if (d < best) {
          best = d; sg = ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) > 0 ? 1 : -1;
          const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
          arc[i * n + j] = s0[k] + t * Math.sqrt(l2) - base; nx[i * n + j] = a[0] + t * dx;
        }
      }
      out[i * n + j] = best * sg;
    }
  }
  return { out, arc, nx };
}
// the map: px R the shore (signed metres, + toward the water), G the parks (signed, - inside), B the Embarcadero's
// centreline (0.5 m a level about 128), A the car parks (near.js paintFields); ph R, G the Embarcadero's lamps' phase, B
// the city's lamps, A the streets' centre lines; st the streets' kerbs, sidewalks, crosswalks and travel lanes (near.js)
export async function buildMap(SM) {
  return baked('liberty-pier-landmap', { sources: [import.meta.url, './site.js', './near.js', ...NEAR_FILES], inputs: { MAP, v: 10, LAMP_SPACING } }, () => {
    const shoreEdges = []; for (let i = 0; i < SHORE.length - 1; i++) shoreEdges.push([SHORE[i], SHORE[i + 1]]);
    const shore = sdfField(LAND, 63, shoreEdges);
    const parks = new Float32Array(MAP.n * MAP.n).fill(63);
    for (const poly of Object.values(PARKS)) { const f = sdfField(poly, 63); for (let i = 0; i < f.length; i++) parks[i] = Math.min(parks[i], f[i]); }
    const { out: emb, arc, nx } = embField();
    const px = new Uint8Array(MAP.n * MAP.n * 4), ph = new Uint8Array(MAP.n * MAP.n * 4);
    // the lamps' phase along the Embarcadero (30 m spacing), as its cosine and sine (they filter smoothly)
    for (let i = 0; i < MAP.n * MAP.n; i++) { const a = arc[i] / LAMP_SPACING * Math.PI * 2; ph[i * 4] = Math.round(127.5 + 127.5 * Math.cos(a)); ph[i * 4 + 1] = Math.round(127.5 + 127.5 * Math.sin(a)); ph[i * 4 + 3] = 255; }
    for (let i = 0; i < MAP.n * MAP.n; i++) {
      px[i * 4] = Math.max(0, Math.min(255, Math.round(128 + shore[i] * 2)));
      px[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(128 + parks[i] * 2)));
      px[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(128 + emb[i] * 2)));
      px[i * 4 + 3] = 255;
    }
    const st = paintFields(MAP, SM, ph, px);
    // the Embarcadero's signed distance and its nearest centreline point's x at full precision (half floats: the 0.5 m
    // steps of px.B drew its lines wavy up close; a distance to a line filters exactly between texels)
    const ef = new Uint16Array(MAP.n * MAP.n * 2), H = T.DataUtils.toHalfFloat;
    for (let i = 0; i < MAP.n * MAP.n; i++) { ef[i * 2] = H(emb[i]); ef[i * 2 + 1] = H(nx[i]); }
    return { px, shore, ph, st, ef };
  });
}

// the land's height: the terrain grid inland; the waterfront flat at SHORE_Y within ~40 m of the shore (the
// Embarcadero is on fill at 11.7 ft NAVD88, site.md: ~2.9 m above the show's water), blended over 22 m
export function makeLandAt(map) {
  const n = MAP.n, sh = map.shore;
  const shoreAt = (x, z) => {
    const fj = (x - MAP.x0) / MAP.res - 0.5, fi = (z - MAP.z0) / MAP.res - 0.5;
    const i = Math.max(0, Math.min(n - 2, Math.floor(fi))), j = Math.max(0, Math.min(n - 2, Math.floor(fj))), a = fi - i, b = fj - j, k = i * n + j;
    return sh[k] * (1 - a) * (1 - b) + sh[k + 1] * (1 - a) * b + sh[k + n] * a * (1 - b) + sh[k + n + 1] * a * b;
  };
  const at = (x, z) => {
    const d = -shoreAt(x, z);                      // metres inland
    const dem = DEM.at(x, z);
    const w = Math.max(0, Math.min(1, (d - 40) / 22)), s = w * w * (3 - 2 * w);      // (the map clamps at 63 m)
    return SHORE_Y + (Math.max(dem, SHORE_Y) - SHORE_Y) * s;
  };
  at.shore = shoreAt;
  // the signed distance to the Embarcadero's centreline (channel B, 0.5 m steps, +-63 m): + on the city's side
  const px = map.px;
  at.emb = (x, z) => { const j = Math.max(0, Math.min(n - 1, Math.round((x - MAP.x0) / MAP.res - 0.5))), i = Math.max(0, Math.min(n - 1, Math.round((z - MAP.z0) / MAP.res - 0.5))); return (px[(i * n + j) * 4 + 2] - 128) / 2; };
  return at;
}

// the ground's material: everything painted from the map and the rules (style: flat tones, lines for kerbs and lanes)
function landMat(world, tex, ph, stx, efx) {
  const EK = EMB.profile;
  return pierMat(world, {
    name: 'land', lamps: false,
    uniforms: {
      uMap: { value: tex }, uPh: { value: ph }, uSt: { value: stx }, uEf: { value: efx },
      uEK: { value: EK.map(k => new T.Vector4(k[1], k[2], k[3], k[4])) }, uEX: { value: EK.map(k => k[0]) }, uLampC: { value: new T.Vector3(...lin('#ffc98a').map(v => v * 1.1)) }, uMapB: { value: new T.Vector3(MAP.x0, MAP.z0, MAP.size) },
      uLot: { value: new T.Vector3(...lin('#3d4044')) },
      uAsph: { value: new T.Vector3(...lin('#4a4d52')) }, uWalk: { value: new T.Vector3(...lin('#a8a69e')) }, uGrass: { value: new T.Vector3(...lin('#4f6a3a')) },
      uYard: { value: new T.Vector3(...lin('#8a877d')) }, uBike: { value: new T.Vector3(...lin('#3f7a52')) }, uTrack: { value: new T.Vector3(...lin('#7b776d')) },
    },
    glsl: /* glsl */`
      uniform sampler2D uMap, uPh, uSt, uEf; uniform vec3 uMapB; uniform vec3 uLampC, uLot;
      uniform vec4 uEK[${EK.length}]; uniform float uEX[${EK.length}];
      // the Embarcadero's cross-section at its nearest centreline point's x (site.js EMB.profile, linear in x)
      vec4 embProf(float x) {
        vec4 r = uEK[0];
        for (int i = 0; i < ${EK.length - 1}; i++) { if (x >= uEX[i] && x <= uEX[i + 1]) r = mix(uEK[i], uEK[i + 1], clamp((x - uEX[i]) / (uEX[i + 1] - uEX[i]), 0.0, 1.0)); }
        if (x > uEX[${EK.length - 1}]) r = uEK[${EK.length - 1}];
        return r;
      }
      float poolBand(float d, float h) { float q = pow(h * h / (h * h + d * d), 1.5); return q > 0.5 ? 1.0 : (q > 0.2 ? 0.6 : (q > 0.07 ? 0.3 : q * 4.0)); }
      uniform vec3 uAsph, uWalk, uGrass, uYard, uBike, uTrack;
      float band(float d, float a, float b) { float w = aaW(d); return smoothstep(a - w, a + w, d) * (1.0 - smoothstep(b - w, b + w, d)); }
      float sIn(float d) { float w = aaW(d); return 1.0 - smoothstep(-w, w, d); }     // 1 where a signed distance is below 0
    `,
    body: /* glsl */`
      vec2 mUV = (P.xz - uMapB.xy) / uMapB.z;
      vec4 mm = texture2D(uMap, mUV);
      vec3 m = (mm.rgb * 255.0 - 128.0) * 0.5;
      if (m.x > 0.0) discard;                       // the water's side of the shore
      float d = -m.x;                               // metres inland from the shore (or the bulkheads' street face)
      vec3 c = uYard;
      // steep ground (the quarried east face of Telegraph Hill, the cuts on its slopes: photo 12's cliff, #363d43 /
      // #74706b / #b1a79d): rock in three flat tones with strata lines, scrub on the ledges
      float steep = smoothstep(0.86, 0.74, s.N.y);
      if (steep > 0.0) {
        float st = vnoise(vec2(P.x * 0.05 + P.z * 0.05, P.y * 0.6)), ledge = step(0.55, fract(P.y * 0.45 + 0.3 * vnoise(P.xz * 0.1)));
        vec3 rock = st > 0.25 ? vec3(0.42, 0.38, 0.33) : (st > -0.2 ? vec3(0.18, 0.165, 0.15) : vec3(0.045, 0.05, 0.055));
        rock = mix(rock, vec3(0.06, 0.09, 0.05), ledge * step(0.2, vnoise(P.xz * 0.3)) * 0.8);
        c = mix(c, rock, steep);
      }
      // parks: grass with paths
      float park = 1.0 - smoothstep(-0.5, 0.5, m.y);
      vec3 grass = uGrass * (0.85 + 0.25 * step(0.0, vnoise(P.xz * 0.15)));
      float path = band(abs(vnoise(P.xz * 0.02) ), 0.0, 0.04);
      c = mix(c, mix(grass, uWalk * 0.9, path), park);
      // the car parks (OSM's, at grade): sealed asphalt, its edge
      float dL = (mm.a * 255.0 - 128.0) * 0.1;
      c = mix(c, uLot * (1.0 - 0.3 * band(dL, -0.25, 0.0)), sIn(dL));
      // the streets (near.js's plan): dK the kerb, dB the sidewalk's back, dX the crosswalks, dC the signed distance to the
      // roadway's centre line (its code: two-way streets about 64, others about 191, 255 none: a junction's box)
      vec4 sq = texture2D(uSt, mUV), pq = texture2D(uPh, mUV);
      float dK = (sq.r * 255.0 - 128.0) * 0.1, dB = (sq.g * 255.0 - 128.0) * 0.1, dX = (sq.b * 255.0 - 128.0) * 0.05;
      float cE = pq.a * 255.0, twoWay = 1.0 - step(127.5, cE), noLine = step(254.5, cE), dC = (cE - mix(191.0, 64.0, twoWay)) * 0.15;
      float onStreet = sIn(dB), road = sIn(dK);
      vec3 street = mix(uWalk * (0.96 + 0.04 * step(0.5, fract((P.x + P.z) * 0.33))), uAsph, road);
      street *= 1.0 - 0.35 * band(dK, -0.06, 0.1);                                      // the kerb
      street = mix(street, vec3(0.75, 0.6, 0.15), band(abs(dC), -1.0, 0.12) * twoWay * (1.0 - noLine) * road * step(0.0, dX) * 0.8);   // the centre line
      street = mix(street, vec3(0.82), sIn(dX) * road * (1.0 - noLine) * step(0.5, fract(dC / 1.2)) * 0.85);                   // the crosswalks' bars
      c = mix(c, street, onStreet);
      // the Embarcadero by its centreline (e: signed metres, + toward the city) and its cross-section there (embProf: the
      // road's middle ec off the line, its kerbs hb, hc from it, the median's half-width md; site.js EMB.profile): the median with
      // the F-line's tracks, the lanes each side, a bike lane inside the bay kerb and parking inside the city kerb where
      // there's room, a double yellow line where there's no median; the promenade from the bay kerb to the water, the
      // city side's sidewalk 5.5 m
      vec2 en = texture2D(uEf, mUV).rg;                 // (the signed distance and the nearest point's x, half floats)
      float e = en.x; vec4 pr = embProf(en.y); float ec = pr.x, hbk = pr.y, hck = pr.z, md = pr.w;
      float ep = e - ec, aep = abs(ep), hk = ep < 0.0 ? hbk : hck;
      if (aep < hk + 5.5 || (ep < 0.0 && d < 60.0)) {
        float exB = clamp(hbk - md - 7.0, 0.0, 2.0), exC = clamp(hck - md - 7.0, 0.0, 2.0), tk = md > 3.0 ? 2.2 : 0.0, hasMed = step(0.1, md);
        vec3 E = uWalk * (0.95 + 0.05 * step(0.5, fract(P.x * 0.5 + P.z * 0.5)));
        float lanes = band(aep, md, hk);
        E = mix(E, uAsph, lanes);
        E = mix(E, uBike, band(ep, -hbk, -hbk + exB) * step(0.1, exB));
        E = mix(E, uTrack, (1.0 - step(md, aep)) * hasMed);
        float le = ep < 0.0 ? hbk - exB : hck - exC, mid = (md + le) * 0.5;
        float dash = step(0.55, fract((P.x * 0.83 + P.z * 0.56) / 9.0));
        E = mix(E, vec3(0.85), band(aep, mid - 0.05, mid + 0.05) * dash * lanes);
        E = mix(E, vec3(0.85), band(ep, hck - exC - 0.05, hck - exC + 0.05) * step(0.1, exC));
        E = mix(E, vec3(0.75, 0.6, 0.15), clamp(band(ep, -0.2, -0.08) + band(ep, 0.08, 0.2), 0.0, 1.0) * (1.0 - hasMed) * 0.85);
        E *= 1.0 - 0.45 * clamp(band(aep, md - 0.05, md + 0.1) * hasMed + band(aep, hk - 0.1, hk + 0.1), 0.0, 1.0);
        float rl = 0.0;
        for (int k = 0; k < 2; k++) { float tc = (float(k) * 2.0 - 1.0) * tk; rl += band(ep, tc - 0.75, tc - 0.68) + band(ep, tc + 0.68, tc + 0.75); }
        E = mix(E, vec3(0.2, 0.2, 0.21), clamp(rl, 0.0, 1.0) * 0.9 * step(0.1, tk));
        // the promenade's edge stone at the water
        E *= 1.0 - 0.12 * band(d, 0.0, 0.5);
        c = mix(c, E, clamp((1.0 - smoothstep(hk + 5.0, hk + 5.5, aep)) + step(ep, -hbk) * (1.0 - smoothstep(58.0, 60.0, d)), 0.0, 1.0));     // (the promenade: the kerb to the water, 17-40 m by the bulkheads)
      }
      // wear: a slow mottling, tyre-darkened lanes, oil spots on the asphalt
      c *= 0.92 + 0.08 * step(0.0, vnoise(P.xz * 0.05) + 0.5 * vnoise(P.xz * 0.11));     // (two octaves: the land fills the frame from the hill)
      s.albedo = c; s.rough = 0.85;
      // the Embarcadero's lamps' pools (3000 K): the promenade's globes and the far side's street lights
      float nightK = smoothstep(0.15, 0.55, uNight);
      if (nightK > 0.0 && aep < 32.0) {
        vec2 cs = texture2D(uPh, (P.xz - uMapB.xy) / uMapB.z).rg * 2.0 - 1.0;
        float sp = fract(atan(cs.y, cs.x) / 6.2831853) * ${LAMP_SPACING.toFixed(1)};
        float d1 = length(vec2(fract((sp - ${LAMP_PROM.s.toFixed(1)}) / ${LAMP_SPACING.toFixed(1)} + 0.5) * ${LAMP_SPACING.toFixed(1)} - ${(LAMP_SPACING / 2).toFixed(1)}, ep - (-hbk - 3.0)));
        float d2 = length(vec2(fract((sp - ${LAMP_STREET.s.toFixed(1)}) / ${LAMP_SPACING.toFixed(1)} + 0.5) * ${LAMP_SPACING.toFixed(1)} - ${(LAMP_SPACING / 2).toFixed(1)}, ep - (hck - 0.7)));
        float pool = max(poolBand(d1, ${LAMP_PROM.h.toFixed(1)}) * 0.8, poolBand(d2, ${LAMP_STREET.h.toFixed(1)}));
        s.emissive += c * uLampC * pool * nightK;
      }
      // the city's street lights (near.js: the nearest head's distance)
      float dl = pq.b * 255.0 * 0.25;
      if (nightK > 0.0 && dl < 40.0) s.emissive += c * uLampC * poolBand(dl, ${CITY_LAMP.h.toFixed(1)}) * 0.9 * nightK;
    `,
  });
}

export async function buildLand(world, M, out) {
  const t0 = performance.now();
  await loadDEM();
  const near = await loadNear(), SM = streetModel(near);
  const map = await buildMap(SM);
  const landAt = makeLandAt(map);
  const tex = new T.DataTexture(map.px, MAP.n, MAP.n, T.RGBAFormat, T.UnsignedByteType);
  tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearFilter; tex.needsUpdate = true;
  const ph = new T.DataTexture(map.ph, MAP.n, MAP.n, T.RGBAFormat, T.UnsignedByteType);
  ph.magFilter = T.LinearFilter; ph.minFilter = T.LinearFilter; ph.needsUpdate = true;
  const stx = new T.DataTexture(map.st, MAP.n, MAP.n, T.RGBAFormat, T.UnsignedByteType);
  stx.magFilter = T.LinearFilter; stx.minFilter = T.LinearFilter; stx.needsUpdate = true;
  const efx = new T.DataTexture(map.ef, MAP.n, MAP.n, T.RGFormat, T.HalfFloatType);
  efx.magFilter = T.LinearFilter; efx.minFilter = T.LinearFilter; efx.needsUpdate = true;
  const mat = landMat(world, tex, ph, stx, efx);
  // the ground mesh: an 8 m grid over the land's box inside the near box (the far view's builder owns beyond it)
  const st = 8, xa = NEAR.x0, xb = NEAR.x1, za = -100, zb = NEAR.z1;
  const nx = Math.round((xb - xa) / st), nz = Math.round((zb - za) / st);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2);
  const hs = new Float32Array((nx + 1) * (nz + 1));
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= nx; j++) {
    const x = xa + j * st, z = za + i * st, k = i * (nx + 1) + j;
    const y = landAt(x, z); hs[k] = y;
    pos.set([x, y, z], k * 3); uv.set([x, z], k * 2);
  }
  const idx = [];
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
    const a = i * (nx + 1) + j, b = a + 1, c = a + nx + 1, d = c + 1;
    // skip cells wholly on the water's side (all four corners more than 12 m out)
    const xs = xa + j * st, zs = za + i * st;
    if (landAt.shore(xs, zs) > 12 && landAt.shore(xs + st, zs) > 12 && landAt.shore(xs, zs + st) > 12 && landAt.shore(xs + st, zs + st) > 12) continue;
    idx.push(a, c, b, b, c, d);
  }
  // the ground mesh's own surface (its triangles, split b-c as drawn): for what stands on it, between its 8 m vertices
  // landAt's curve and the drawn triangles part by up to ~0.2 m on the hill
  landAt.mesh = (x, z) => {
    const fx = (x - xa) / st, fz = (z - za) / st, j = Math.max(0, Math.min(nx - 1, Math.floor(fx))), i = Math.max(0, Math.min(nz - 1, Math.floor(fz)));
    const u = fx - j, v = fz - i, A = hs[i * (nx + 1) + j], B = hs[i * (nx + 1) + j + 1], Cc = hs[(i + 1) * (nx + 1) + j], D = hs[(i + 1) * (nx + 1) + j + 1];
    return u + v <= 1 ? A + (B - A) * u + (Cc - A) * v : D + (Cc - D) * (1 - u) + (B - D) * (1 - v);
  };
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(hs.length).fill(0.5), 1));
  g.setIndex(idx); g.computeVertexNormals();
  const ground = world.mesh(g, mat, { name: 'land:ground' });

  // the seawall along the water (not along the bulkheads' street face): concrete with the growth bands, a cap stone,
  // and the promenade's railing (steel, dark green-grey: photo 48's Port railings, simplified)
  const wall = [], cap = [], rails = [];
  for (let i = 0; i < SHORE.length - 1; i++) {
    const a = SHORE[i], b = SHORE[i + 1];
    if (a[0] >= FRONTAGE.x0 - 0.01 && b[0] <= FRONTAGE.x1 + 0.01) continue;
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), n = [dz / L, 0, -dx / L];
    wall.push(orient([[a[0], -4, a[1]], [b[0], -4, b[1]], [b[0], SHORE_Y, b[1]], [a[0], SHORE_Y, a[1]]], [[0, -4], [L, -4], [L, SHORE_Y], [0, SHORE_Y]], n));
    cap.push(beam([a[0] - n[0] * 0.2, SHORE_Y + 0.08, a[1] - n[2] * 0.2], [b[0] - n[0] * 0.2, SHORE_Y + 0.08, b[1] - n[2] * 0.2], 0.5, 0.16, { seed: (i * 0.37) % 1 }));
    // the railing: posts every 2.4 m, a top rail and a mid rail, 0.35 m in from the edge
    const ox = -n[0] * 0.35, oz = -n[2] * 0.35;
    rails.push(beam([a[0] + ox, SHORE_Y + 1.07, a[1] + oz], [b[0] + ox, SHORE_Y + 1.07, b[1] + oz], 0.06, 0.06));
    rails.push(beam([a[0] + ox, SHORE_Y + 0.55, a[1] + oz], [b[0] + ox, SHORE_Y + 0.55, b[1] + oz], 0.04, 0.04));
    for (let s = 0; s < L; s += 2.4) { const t = s / L; rails.push(box([a[0] + dx * t + ox, SHORE_Y + 0.55, a[1] + dz * t + oz], [0.06, 1.1, 0.06])); }
  }
  world.mesh(quads(wall, 0.3), M.pile, { name: 'land:seawall' });
  world.mesh(merge(cap), M.flat('seawall cap', '#b3b0a6'), { name: 'land:seawall cap' });
  world.mesh(merge(rails), M.flat('railing', '#3f4a46', { spec: 0.2, rough: 0.5 }), { name: 'land:railing' });
  out.land = { landAt, ground, SM, tris: idx.length / 3, ms: performance.now() - t0 };
  return out.land;
}
