// liberty/src/water/surface.js: the bay's surface, from under the pier to the horizon (the 50 km far plane).
//
// Geometry: a polar grid round the camera (rings in a geometric series from 0.3 m to 50 km, 192 segments), placed in
// the vertex shader under the eye each frame, so its density follows the screen; the surface it samples is anchored in
// the world (spectrum.js), displaced within 160 m of the eye by the components its rings can carry.
// Shading (the colour pass, drawn in the transparent pass over the opaque frame like niwa's pond):
//   waves      the 64 components (spectrum.js) per pixel, each scaled by the local fetch's growth (field.js q per
//              direction bin), each faded out where it is finer than the pixel (no crawl at grazing angles); what is
//              faded goes into the roughness (its slope variance), with the capillary floor
//   the hull   her side reflects the waves coming at her (a standing pattern within a wavelength or two: field.js SDF)
//   events     rings (ripple(): splashes, the guns' blast rings at 343 m/s that flatten and darken the chop), the boats'
//              Kelvin wakes (boats.js)
//   light      the planar reflection (the pipeline's RT_REFL: the scene and the stage's beams mirrored) read along the
//              perturbed normal and spread by the roughness; the water's body (turbid green-teal, lit by the sky, the
//              lamps and the stage's spots: their pools on the water); the lamps' and spots' glitter (Beckmann on the
//              roughness: the columns under every light)
//   the look   the anime treatment (style.md W1-W8), in look.glsl below
import { G } from './spectrum.js';

const T = window.THREE;
export const NRIP = 32, NWAKE = 6, NSEG = 24;

export const SURFACE_GLSL = /* glsl */`
uniform vec4 uWave;              // -, -, -, the capillary floor's slope variance
uniform vec4 uNearBox;           // the near box (x0, z0, x1, z1): its fetch and env maps
uniform vec4 uFarBox;            // the far q grid: x0, z0, size, -
uniform vec4 uSdfBox;            // the hull's distance field's box
// the atlases (field.js): q (near A, near B, far A, far B), env (near env, hull SDF), the DEMs (near, far)
uniform sampler2D uQTex; uniform vec4 uQR[4]; uniform vec2 uQSize;
uniform sampler2D uEnvTex; uniform vec4 uER[3]; uniform vec2 uESize;
uniform float uMaskNear;          // 1: no module draws the near land (a solo render): the fetch atlas masks it too
uniform float uMaskFar;           // 1: no far land (B6's module not built): the far atlas masks it (index.js turns it off once far is built)
uniform float uMaskHull;          // 1: no hull module: the water stops at her waterline
vec4 tile(sampler2D t, vec4 r, vec2 sz, vec2 u) { return textureLod(t, (r.xy + clamp(u * r.zw, vec2(0.5), r.zw - 0.5)) / sz, 0.0); }
// the bins' q (fetch: omega_p(F) / omega_p(Fref)) at p: the near box, the far grid, the open bay beyond
void binsAt(vec2 p, out vec4 qa, out vec4 qb) {
  vec2 u = (p - uNearBox.xy) / (uNearBox.zw - uNearBox.xy);
  if (all(greaterThan(u, vec2(0.0))) && all(lessThan(u, vec2(1.0)))) { qa = tile(uQTex, uQR[0], uQSize, u); qb = tile(uQTex, uQR[1], uQSize, u); return; }
  vec2 f = (p - uFarBox.xy) / uFarBox.z;
  if (all(greaterThan(f, vec2(0.0))) && all(lessThan(f, vec2(1.0)))) { qa = tile(uQTex, uQR[2], uQSize, f); qb = tile(uQTex, uQR[3], uQSize, f); return; }
  qa = vec4(1.0); qb = vec4(1.0);
}
vec4 envAt(vec2 p) {
  vec2 u = (p - uNearBox.xy) / (uNearBox.zw - uNearBox.xy);
  if (all(greaterThan(u, vec2(0.0))) && all(lessThan(u, vec2(1.0)))) return tile(uEnvTex, uER[0], uESize, u);
  return vec4(-8.0, 0.0, 0.0, 0.0);
}
// the sky a point of the water under a deck still sees through the deck's nearest open side (B4's skyUnder, the same
// numbers): 0.5 (1 - e / sqrt(e^2 + h^2)), e from the bake (env R), h the soffit's height; 1 in the open
float skyUnder(vec4 env) { float e = env.r; return e <= 0.0 ? 1.0 : 0.5 * (1.0 - e / sqrt(e * e + ${2.65 * 2.65})); }
// the hull: signed distance (m, negative inside) and the outward normal; far: (99, 0, 0)
vec3 hullAt(vec2 p) {
  vec2 u = (p - uSdfBox.xy) / (uSdfBox.zw - uSdfBox.xy);
  if (any(lessThan(u, vec2(0.0))) || any(greaterThan(u, vec2(1.0)))) return vec3(99.0, 0.0, 0.0);
  vec4 s = tile(uEnvTex, uER[1], uESize, u); return vec3(s.x, normalize(s.yz + 1e-6));
}
// land (1) or water (0), from the fetch atlas: where nothing upwave lets a wave grow in any direction, q is at its top
// (field.js: the solids' F = 0); in the near box only for a solo render (else the pier module's land is drawn)
float landAt(vec2 p) {
  vec2 u = (p - uNearBox.xy) / (uNearBox.zw - uNearBox.xy);
  if (all(greaterThan(u, vec2(0.0))) && all(lessThan(u, vec2(1.0)))) {
    if (uMaskNear < 0.5 || hullAt(p).x < 8.0) return 0.0;      // (her hull is solid in the fetch grid, not land)
    vec4 a = tile(uQTex, uQR[0], uQSize, u), b = tile(uQTex, uQR[1], uQSize, u);
    return step(15.0, min(min(min(a.x, a.y), min(a.z, a.w)), min(min(b.x, b.y), min(b.z, b.w))));
  }
  vec2 f = (p - uFarBox.xy) / uFarBox.z;
  if (uMaskFar > 0.5 && all(greaterThan(f, vec2(0.0))) && all(lessThan(f, vec2(1.0)))) {
    vec4 a = tile(uQTex, uQR[2], uQSize, f), b = tile(uQTex, uQR[3], uQSize, f);
    return step(15.0, min(min(min(a.x, a.y), min(a.z, a.w)), min(min(b.x, b.y), min(b.z, b.w))));
  }
  return 0.0;
}
uniform vec4 uRip[${NRIP}]; uniform vec4 uRipB[${NRIP}]; uniform int uNumRip;
uniform vec4 uWkA[${NWAKE}]; uniform vec4 uWkB[${NWAKE}]; uniform int uNumWk;
uniform vec4 uWkTrack[${NWAKE * NSEG}]; uniform vec4 uWkBox[${NWAKE}];
uniform vec4 uMinor[16]; uniform vec4 uMinorC[16]; uniform int uNumMinor;   // minor lights (boats' nav lights, windows): W3's ticks
uniform vec4 uHullRefl;          // reflection coefficient, decay (wavelengths), on, -
uniform vec4 uDbg;               // (cost probes: max components, lights on, -, -)
uniform highp sampler2DArray uTiles;  // the bands' tiles (index.js renders them each frame): slope x, slope z, height, mean square slope
uniform vec4 uBandL[3];          // each band's tile size (m)
uniform vec4 uBandK[10];         // each band: 1 / its tile size, cos and sin of its lattice's turn, -
uniform vec4 uBandW[20];         // each band's energy share by direction bin (two vec4 a band)
uniform vec4 uBandV[10];         // each band's slope variance and height variance at the reference fetch, its mean wavelength
uniform vec4 uLut[80];           // the bands' growth tables (spectrum.js): 32 gains a band over log q, 8 vec4 a band
float bandL(int b) { return uBandL[b / 4][b - (b / 4) * 4]; }
float lutAt(int b, int j) { int i = b * 32 + j; return uLut[i / 4][i - (i / 4) * 4]; }
// a band's gain at the bins' (log) q: q averaged with the band's direction weights, then its growth table (spectrum.js)
float bandGain(int b, vec4 la, vec4 lb) {
  float lq = dot(uBandW[2 * b], la) + dot(uBandW[2 * b + 1], lb);
  float f = min(1.0, lq / ${Math.log(25).toFixed(6)}) * 31.0;
  int j = min(30, int(f)); float u = f - float(j);
  return mix(lutAt(b, j), lutAt(b, j + 1), u);
}
vec2 gShape; float gShapeVar; float gShapeH; float gShapeHVar;   // (seaAt's by-products: the drawn waves' slope, height and their variances)
// the wind sea at p: slope (x, z), height; dpx, dpy the pixel's footprint (dFdx, dFdy of p, taken in uniform flow): each
// tile filtered over it (the mip's mean slope; its mean square slope gives what the pixel can't resolve: uvar, the
// roughness; rvar what it can); the drawn scale (13+ px a wavelength) a few levels coarser (the tones, the crests).
// hn: the hull (distance, outward normal): within a couple of wavelengths of her plating the field adds its own image
// across her side (a straight wall's reflection: the standing waves along her)
vec4 seaAt(vec2 p, vec2 dpx, vec2 dpy, vec3 hn, out float uvar, out float rvar) {
  float fp = max(length(dpx), length(dpy));
  vec4 qa, qb; binsAt(p, qa, qb);
  vec4 la = log(max(qa, vec4(1.0))), lb = log(max(qb, vec4(1.0)));
  vec4 acc = vec4(0.0); uvar = 0.0; rvar = 0.0; gShape = vec2(0.0); gShapeVar = 0.0; gShapeH = 0.0; gShapeHVar = 0.0;
  bool nearHull = hn.x < 30.0 && hn.x > -0.3 && uHullRefl.z > 0.5;
  for (int b = 0; b < 10; b++) {
    if (uDbg.z > 0.5) break;
#if (WCOST & 2)
    break;
#endif
    float g = bandGain(b, la, lb);
    if (g < 1e-4) continue;
    vec4 bk = uBandK[b]; float iL = bk.x, sv = uBandV[b].x, lam = uBandV[b].z;
    // a band all finer than the pixel: its mean is flat and all its slope is roughness (no fetch)
    if (fp > 2.5 * lam) { uvar += g * g * sv; continue; }
    // (the band's lattice is turned by b golden angles: into its frame, and its slope back out)
    mat2 toT = mat2(bk.y, -bk.z, bk.z, bk.y), toW = mat2(bk.y, bk.z, -bk.z, bk.y);
    vec3 uvw = vec3(toT * p * iL, float(b));
    vec2 gx = toT * dpx * iL, gy = toT * dpy * iL;
    vec4 t = textureGrad(uTiles, uvw, gx, gy);
    t.xy = toW * t.xy;
    float un = clamp(t.w - dot(t.xy, t.xy), 0.0, sv);
    acc.xy += g * t.xy; acc.z += g * t.z;
    uvar += g * g * un; rvar += g * g * (sv - un);
    // the drawn scale: 13+ px a wavelength. A band all of whose waves are that coarse is its own drawn scale (the main
    // fetch); one straddling the threshold a few levels coarser (isotropic), and only where its shortest wave keeps 2+
    // texels there (a box mip chain folds what is finer into slow false stripes, which the tones' normalisation amplified)
    if (fp * 5.3 < 0.18 * lam) {
      gShape += g * t.xy; gShapeVar += g * g * (sv - un); gShapeH += g * t.z; gShapeHVar += g * g * uBandV[b].y * (1.0 - un / max(sv, 1e-12));
    } else if (fp * 5.3 * 2.2 < lam * 0.7) {
      // (faded in over a factor of 2.2 in its on-screen wavelength: it entered at full strength the moment its waves
      // crossed the threshold, and the tones and crest lines it drives switched on along one hard curve across the near
      // water (the tour's T3 at 21.0 s, B9's read: a hard-edged dark band of ripples along the bottom of the frame))
      float wD = smoothstep(1.0, 2.2, lam * 0.7 / (fp * 5.3 * 2.2));
#ifdef WDBG_LOD0
      vec4 ts = textureLod(uTiles, uvw, 0.0); ts.xy = toW * ts.xy;
#else
      vec4 ts = textureLod(uTiles, uvw, max(0.0, log2(fp * 5.3 * ${256}.0 * iL))); ts.xy = toW * ts.xy;
#endif
      float uns = clamp(ts.w - dot(ts.xy, ts.xy), 0.0, sv), gD = g * wD;
      gShape += gD * ts.xy; gShapeVar += gD * gD * (sv - uns); gShapeH += gD * ts.z; gShapeHVar += gD * gD * uBandV[b].y * (1.0 - uns / max(sv, 1e-12));
    }
    if (nearHull && lam > 1.0) {
      float dec = uHullRefl.x * exp(-max(hn.x, 0.0) / (uHullRefl.y * uBandV[b].z));
      if (dec > 0.02) {
        vec2 pm = p - 2.0 * max(hn.x, 0.0) * hn.yz;
        vec4 tm = textureGrad(uTiles, vec3(toT * pm * iL, float(b)), gx, gy); tm.xy = toW * tm.xy;
        acc.xy += g * dec * (tm.xy - 2.0 * dot(tm.xy, hn.yz) * hn.yz); acc.z += g * dec * tm.z;
      }
    }
  }
  uvar += uWave.w;
  return acc;
}
`;

// the vertex shader: the polar grid under the eye, displaced near it
export const VERTEX_GLSL = /* glsl */`
uniform vec4 uGrid;              // r0, ratio, segments, displacement's reach (m)
uniform vec4 uNearBox; uniform sampler2D uQTex; uniform vec4 uQR[4]; uniform vec2 uQSize;
uniform sampler2D uEnvTex; uniform vec4 uER[3]; uniform vec2 uESize;
uniform highp sampler2DArray uTiles; uniform vec4 uBandL[3]; uniform vec4 uBandW[20]; uniform vec4 uLut[80];
vec4 tileV(sampler2D t, vec4 r, vec2 sz, vec2 u) { return textureLod(t, (r.xy + clamp(u * r.zw, vec2(0.5), r.zw - 0.5)) / sz, 0.0); }
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  float r = P.x;                   // (the ring's radius)
  float th = P.z * 6.28318531 / uGrid.z;
  vec2 xz = cameraPosition.xz + r * vec2(cos(th), sin(th));
  float spacing = max(r * 6.28318531 / uGrid.z, 0.01);
  float h = 0.0;
  if (r < uGrid.w) {
    vec2 u = (xz - uNearBox.xy) / (uNearBox.zw - uNearBox.xy);
    vec4 qa = vec4(1.0), qb = vec4(1.0);
    if (all(greaterThan(u, vec2(0.0))) && all(lessThan(u, vec2(1.0)))) { qa = tileV(uQTex, uQR[0], uQSize, u); qb = tileV(uQTex, uQR[1], uQSize, u); }
    vec4 la = log(max(qa, vec4(1.0))), lb = log(max(qb, vec4(1.0)));
    for (int b = 0; b < 10; b++) {
      float lq = dot(uBandW[2 * b], la) + dot(uBandW[2 * b + 1], lb);
      float f = min(1.0, lq / ${Math.log(25).toFixed(6)}) * 31.0; int j = min(30, int(f)), i0 = b * 32 + j, i1 = i0 + 1;
      float g = mix(uLut[i0 / 4][i0 - (i0 / 4) * 4], uLut[i1 / 4][i1 - (i1 / 4) * 4], f - float(j));
      if (g < 1e-4) continue;
      float L = uBandL[b / 4][b - (b / 4) * 4];
      // (the level where a texel spans the grid's spacing: what the grid can carry)
      float ra = float(b) * ${2.39996323}; vec2 xl = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * xz;
      h += g * textureLod(uTiles, vec3(xl / L, float(b)), max(0.0, log2(spacing * ${256}.0 / L) + 1.0)).z;
    }
    h *= 1.0 - smoothstep(uGrid.w * 0.6, uGrid.w, r);
  }
  P = vec3(xz.x, h, xz.y);
  N = vec3(0.0, 1.0, 0.0);
  vRing = r;
}`;

// the bands' tiles: one layer a band, each texel the sum of its band's components on the tile's lattice (periodic), at
// the frame's time (each component's phase reduced mod 2 pi in double precision on the CPU: exact at any t)
export const TILE_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
export const TILE_FRAG = /* glsl */`
uniform vec4 uC[16];             // kx, kz, amplitude, phase now
uniform int uN; uniform float uL;
varying vec2 vUv;
void main() {
  vec2 x = vUv * uL; vec2 s = vec2(0.0); float h = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uN) break;
    float ph = dot(uC[i].xy, x) + uC[i].w;
    h += uC[i].z * cos(ph); s -= uC[i].z * sin(ph) * uC[i].xy;
  }
  gl_FragColor = vec4(s, h, dot(s, s));
}`;
export const TILE = 256;

// the polar grid: (ring radius, 0, segment) per vertex; the centre, then rings in a geometric series as fine as the
// segments out to rFine (square cells: the displacement's reach and the near water), then doubling to the far plane
// (rings packed into the horizon's few rows of pixels shade as slivers: a cost, nothing seen)
export function polarGrid({ r0 = 0.3, rFine = 300, rMax = 50000, seg = 192, farRatio = 2 } = {}) {
  const q = 1 + 2 * Math.PI / seg, radii = [0];
  for (let r = r0; r < rFine; r *= q) radii.push(r);
  for (let r = radii[radii.length - 1] * farRatio; ; r *= farRatio) { radii.push(Math.min(r, rMax)); if (r >= rMax) break; }
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  for (let i = 1; i < radii.length; i++) for (let s = 0; s <= seg; s++) pos.push(radii[i], 0, s);
  const at = (i, s) => 1 + (i - 1) * (seg + 1) + s;
  for (let s = 0; s < seg; s++) idx.push(0, at(1, s + 1), at(1, s));
  for (let i = 1; i < radii.length - 1; i++) for (let s = 0; s < seg; s++) {
    const a = at(i, s), b = at(i, s + 1), c = at(i + 1, s), d = at(i + 1, s + 1);
    idx.push(a, b, c, b, d, c);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2));
  g.setIndex(idx);
  g.boundingSphere = new T.Sphere(new T.Vector3(), 1e9);
  return { geo: g, ratio: q, rings: radii.length, seg, r0, tris: idx.length / 3 };
}

// the bands' uniforms (spectrum.js): tile sizes, direction weights, variances
export function waveUniforms(spec) {
  const B = spec.bands, L = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  B.forEach((b, i) => { L[i] = b.L; });
  const W = [], V = [];
  B.forEach(b => { W.push(new T.Vector4(...b.w.slice(0, 4)), new T.Vector4(...b.w.slice(4, 8))); V.push(new T.Vector4(b.slopeVar, b.hVar, 2 * Math.PI / Math.sqrt(b.k0 * b.k1), 0)); });
  return {
    uBandL: { value: [new T.Vector4(...L.slice(0, 4)), new T.Vector4(...L.slice(4, 8)), new T.Vector4(...L.slice(8, 12))] },
    uBandW: { value: W }, uBandV: { value: V },
    uBandK: { value: B.map((b, i) => new T.Vector4(1 / b.L, Math.cos(i * 2.39996323), Math.sin(i * 2.39996323), 0)).concat(Array.from({ length: Math.max(0, 10 - B.length) }, () => new T.Vector4())) },
    uLut: { value: Array.from({ length: 80 }, (_, i) => new T.Vector4(...[0, 1, 2, 3].map(k => { const n = i * 4 + k, b = B[Math.floor(n / 32)]; return b ? b.lut[n % 32] : 0; }))) },
    uWave: { value: new T.Vector4(spec.wp, Math.log(spec.gamma), 0, 0.002) },
  };
}
// the growth tables as an atlas tile: NQ x bands, R = gain
export function lutTile(spec, NQ) {
  const nb = spec.bands.length, d = new Float32Array(NQ * nb * 4);
  spec.bands.forEach((b, j) => b.lut.forEach((v, i) => { d[(j * NQ + i) * 4] = v; }));
  return { data: d, w: NQ, h: nb };
}
export { G };
