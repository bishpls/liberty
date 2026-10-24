// liberty/src/far/land.js: the far land (B6): one terrain from the three height grids (far 100 m over 100 km, mid 28 m
// over 42 km, near 12 m over 12 km), drawn by the engine's CDLOD terrain everywhere outside the pier builder's box (its
// hole: B4's land mesh fills it). The ground's look is the land cover's (NLCD 2021 at 28 m and 100 m: the city's
// developed classes, the parks, the golden late-October grass of the headlands and the East Bay hills, the oak and bay
// woodland in their ravines, the chaparral, the marsh), drawn the anime way: flat tones by class, the toon ramp's two
// values, and at night a two-tone silhouette pulled toward the sky by distance, the city's carpet glowing warm under
// its lights (lights.js puts the lights themselves on it).
//
// The seam (with B4, through the integrator): B4's ground is an 8 m grid over x -600..704, z -100..1004 from the same
// near grid (land.js landAt: the DEM inland, flat at 2.92 m within ~40-62 m of the shore). Ours is discarded inside
// that rectangle (the hole), and our heights take the same waterfront rule along San Francisco's shore, so the two
// meet edge to edge at the same heights.
import * as P from '../plan.js';
import { makeTerrain } from 'scene3d/terrain.js';
import { baked } from 'scene3d/bake.js';
import { lin } from 'scene3d/util.js';
import { AIR_GLSL, AIR_U } from './structure.js';

const T = window.THREE;
export const SHORE_Y = 2.92;                      // B4's waterfront (pier/land.js SHORE_Y: the Embarcadero's fill)
// the hole: B4's ground mesh (pier/land.js: x NEAR.x0 .. +163 x 8 m, z -100 .. +138 x 8 m), the water north of it
export const HOLE = { x0: P.WORLD.near.x0, z0: P.WORLD.near.z0, x1: P.WORLD.near.x0 + 163 * 8, z1: -100 + 138 * 8 };

// the cover classes' colours (sRGB, then linear): late October, before the rains (site.md §5: dry, clear)
export const COVER = {
  11: '#7d7563',   // water above the datum: wet rock and sand
  21: '#76804c',   // developed, open space: lawns, parks, golf courses (watered, late-season green)
  22: '#8f8a7d',   // developed, low: houses among trees
  23: '#a39e93',   // developed, medium
  24: '#b2ada4',   // developed, high: downtowns, the port, roofs and paving
  31: '#a99f8b',   // barren: rock, sand, quarries
  41: '#4e5c36', 42: '#2f4530', 43: '#4a5835',     // deciduous, evergreen (cypress, eucalyptus, redwood), mixed
  52: '#6e6a44',   // shrub: coastal scrub, chaparral (olive)
  71: '#b99f66',   // grassland: the golden hills
  81: '#a8945c', 82: '#9c8a58',                    // pasture, crops
  90: '#56603f', 95: '#7b7a55',                    // woody and herbaceous wetland (marsh)
};
// the hills' value by day: the cover colours are their grass and leaves; a hill seen whole is darker (the shade inside
// the scrub and the trees, the slopes turned from the sun). Fitted on far_bow at 14.0 against photo 02 (from this ship:
// Angel Island 0.33 of its sky's value, ours was 1.13; the anime keeps it lighter than the photo, under its sky)
export const LAND_K = 0.42;
export const COVER_GLOW = { 21: 0.15, 22: 0.45, 23: 0.8, 24: 1.0 };   // the night's carpet glow by developed class

// the grids as the terrain wants them: copies with the waterfront rule and the shore step applied
//  - land at or above +1.0 m and the bay floor at or below -2.5 m: the shore is one cell's step, so the far shoreline
//    can't z-fight the water's plane over a wide band of mudflat (the far plane is 50 km: depth is coarse out there)
//  - San Francisco's waterfront outside B4's box flat at SHORE_Y within 40 m of the water, blended in by 62 m (B4's rule)
function prepGrids(D) {
  return baked('liberty-far-grids', { sources: [import.meta.url], inputs: { v: 4, hole: HOLE, n: [D.near.w, D.mid.w, D.far.w, D.alc.w] } }, () => {
    const out = {};
    for (const k of ['far', 'mid', 'near', 'alc']) {
      const g = D[k], a = new Float32Array(g.a);
      for (let i = 0; i < a.length; i++) { const h = a[i]; a[i] = h > 0 ? Math.max(h, 1.0) : Math.min(h, -2.5); }
      out[k] = a;
    }
    // the waterfront: distance to the water (chamfer, metres) on the near grid, San Francisco's side only
    const g = D.near, n = g.w, st = g.dx, src = g.a, dist = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) dist[i] = src[i] > 0 ? 1e9 : 0;
    const d1 = st, d2 = st * Math.SQRT2;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i; let d = dist[k]; if (d === 0) continue;
      if (i > 0) d = Math.min(d, dist[k - 1] + d1); if (j > 0) { d = Math.min(d, dist[k - n] + d1); if (i > 0) d = Math.min(d, dist[k - n - 1] + d2); if (i < n - 1) d = Math.min(d, dist[k - n + 1] + d2); }
      dist[k] = d;
    }
    for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
      const k = j * n + i; let d = dist[k]; if (d === 0) continue;
      if (i < n - 1) d = Math.min(d, dist[k + 1] + d1); if (j < n - 1) { d = Math.min(d, dist[k + n] + d1); if (i < n - 1) d = Math.min(d, dist[k + n + 1] + d2); if (i > 0) d = Math.min(d, dist[k + n - 1] + d2); }
      dist[k] = d;
    }
    const a = out.near, half = g.half;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, x = -half + i * st, z = -half + j * st;
      // San Francisco's shore: the city's side of the bay south of the near box's north edge, west to the Golden Gate
      if (src[k] <= 0 || z < -1200 || x < -6000 || x > 3000 || (x > 1300 && z < 2400)) continue;
      const d = dist[k], w = Math.max(0, Math.min(1, (d - 40) / 22)), s = w * w * (3 - 2 * w);
      a[k] = SHORE_Y + (Math.max(src[k], SHORE_Y) - SHORE_Y) * s;
    }
    return out;
  });
}

// an RGBA8 texture over a grid's extent: R the cover class, G the night glow (cover x the satellite's light), B, A spare
function coverTexture(D, which) {
  const c = D.cover[which], n = c.n, px = new Uint8Array(n * n * 4), L = D.lights;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, cls = c.u8[k];
    const x = -c.half + i * c.step, z = -c.half + j * c.step;
    const li = Math.round((x + L.half) / L.step), lj = Math.round((z + L.half) / L.step);
    const v = (li >= 0 && lj >= 0 && li < L.n && lj < L.n) ? L.u8[lj * L.n + li] / 255 : 0;
    const glow = (COVER_GLOW[cls] || 0) * (0.35 + 0.65 * v);
    px[k * 4] = cls; px[k * 4 + 1] = Math.round(glow * 255); px[k * 4 + 3] = 255;
  }
  const t = new T.DataTexture(px, n, n, T.RGBAFormat, T.UnsignedByteType);
  t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

const SURFACE = (cover) => AIR_GLSL + /* glsl */`
uniform sampler2D uCovM, uCovF; uniform vec4 uCovB;     // the mid raster's half, step, n; the far's (zw: half, step)
uniform float uCovFn;
uniform vec3 uGlowCol, uNightLand; uniform vec4 uAir, uAlcB;  // the night's carpet glow colour, the land's night tone; air: beta (1/m), max
uniform float uLandK;                                    // the cover colours' value: a hill's albedo seen whole (its grass, scrub and the shade between)
uniform vec3 uCov[${Object.keys(cover).length}];
uniform float uCovK[${Object.keys(cover).length}];
vec3 coverCol(float k) {
  ${Object.keys(cover).map((k, i) => `if (k < ${+k}.5) return uCov[${i}];`).join(' ')}
  return uCov[0];
}
// a raster texel: (class, glow) at integer texel ij of the mid or the far grid
vec2 covTexel(int which, ivec2 ij) {
  vec4 t = which == 0 ? texelFetch(uCovM, ij, 0) : texelFetch(uCovF, ij, 0);
  return vec2(floor(t.r * 255.0 + 0.5), t.g);
}
// the ground's colour and glow at xz: the four nearest texels' class colours blended (no class codes interpolated),
// the lookup warped by noise so the 28 m squares read as patches
vec4 coverAt(vec2 xz, float pix) {
  vec2 w = vec2(vnoise(xz * 0.021), vnoise(xz * 0.021 + 7.3)) * 18.0 + vec2(vnoise(xz * 0.07 + 3.1), vnoise(xz * 0.07 - 5.7)) * 6.0;
  vec2 q = xz + w * (1.0 - smoothstep(30.0, 90.0, pix));
  int which = 0; float half_ = uCovB.x, st = uCovB.y, n = uCovB.z;
  if (abs(q.x) > half_ - st * 2.0 || abs(q.y) > half_ - st * 2.0) { which = 1; half_ = uCovB.w; st = uCovFn; n = ${'1001.0'}; }
  vec2 f = (q + half_) / st; vec2 i0 = floor(f); vec2 t = f - i0;
  ivec2 b = ivec2(i0);
  vec2 a00 = covTexel(which, b), a10 = covTexel(which, b + ivec2(1, 0)), a01 = covTexel(which, b + ivec2(0, 1)), a11 = covTexel(which, b + ivec2(1, 1));
  vec3 c = mix(mix(coverCol(a00.x), coverCol(a10.x), t.x), mix(coverCol(a01.x), coverCol(a11.x), t.x), t.y);
  float g = mix(mix(a00.y, a10.y, t.x), mix(a01.y, a11.y, t.x), t.y);
  return vec4(c, g);
}
void smain(inout Surface s, vec3 P, vec3 V) {
#ifndef FAR_NODISCARD
  if (tInHole(P) || P.y < -0.6) discard;
#endif
#ifdef FAR_NOLAND
  discard;
#endif
  float pix = max(length(dFdx(P.xz)), length(dFdy(P.xz))) + 1e-4;
  s.Ng = tFaceNormal(P);
  s.N = tNormal(P.xz, clamp(pix * 1.5, 1.0, 400.0));
  vec4 cv = coverAt(P.xz, pix);
  vec3 c = cv.rgb * uLandK;
  // the anime's few flat tones: a coarse value break by patch (fields, groves, roofs) where it can be seen
  float patchN = vnoise(P.xz * 0.013 + 11.0) + 0.5 * vnoise(P.xz * 0.041 - 3.0);
  c *= mix(1.0, 0.9 + 0.1 * step(0.15, patchN), 1.0 - smoothstep(40.0, 120.0, pix));
  // the ravines hold the woodland and the steep faces show their rock (the cover is 28 m; the shape is finer)
  float steep = 1.0 - s.N.y;
  // (sea cliffs: near the water a 30 deg face in the DEM is a smoothed cliff, rock; higher up the hills keep their cover)
  float thr = mix(0.12, 0.30, smoothstep(10.0, 70.0, P.y));
  float cliff = smoothstep(thr, thr + 0.18, steep);
  // Alcatraz (its 3 m grid): the gardens and the ice plant, the cypress and eucalyptus on its upper slopes, in dark
  // greens between the paths and the ruins (photos 30, 44); bare rock below
  vec2 ad = abs(P.xz - uAlcB.xy);
  if (max(ad.x, ad.y) < uAlcB.z) {
    // (the island's ground: the prison's paving and the rubble of its ruins, grey-brown, not NLCD's 'developed' cream)
    // (grey concrete and rubble, neutral: photo 44's slopes k-means (78, 84, 88) 30 %, (120, 116, 116) 28 %; photo 02 from
    // this ship (54, 60, 61) median)
    c = mix(vec3(0.050, 0.052, 0.054), vec3(0.085, 0.083, 0.082), step(0.15, vnoise(P.xz * 0.12)));
    float veg = smoothstep(-0.15, 0.2, vnoise(P.xz * 0.06) + 0.5 * vnoise(P.xz * 0.19 + 3.0)) * smoothstep(4.0, 9.0, P.y) * (1.0 - smoothstep(0.36, 0.55, steep));
    c = mix(c, mix(vec3(0.020, 0.032, 0.018), vec3(0.042, 0.055, 0.026), step(0.45, vnoise(P.xz * 0.35))), veg);
    // (its 3 m grid resolves the slopes, so the smoothed-cliff rule above would take the whole island for rock: rock only
    // on the true faces, and the band above the water, pale with the birds' white: photo 44's waterline)
    cliff = max(smoothstep(0.42, 0.58, steep), smoothstep(0.18, 0.32, steep) * (1.0 - smoothstep(7.0, 15.0, P.y))) * (1.0 - veg);
  }
  vec3 rock = mix(vec3(0.075, 0.068, 0.056), vec3(0.20, 0.19, 0.17), (1.0 - smoothstep(4.0, 40.0, P.y)) * 0.8);   // (linear)
  rock *= 0.85 + 0.3 * step(0.0, vnoise(vec2(P.x * 0.25 + P.z * 0.25, P.y * 0.6)));      // strata, two tones
  rock = mix(rock, vec3(0.42, 0.41, 0.38), step(0.62, vnoise(vec2(P.x * 0.9 + P.z * 0.9, P.y * 0.15))) * (1.0 - smoothstep(10.0, 45.0, P.y)) * 0.6);   // guano streaks
  c = mix(c, rock, cliff * 0.85);
  // the beach and the wet edge just above the water
  c = mix(c, vec3(0.13, 0.12, 0.10), (1.0 - smoothstep(0.8, 2.2, P.y)) * 0.6);
  s.albedo = c; s.rough = 0.9;
  // the night: the city's carpet lit from within (its streets' glow), under the lights themselves (lights.js)
  float night = smoothstep(0.15, 0.7, uNight);
  s.emissive += uGlowCol * cv.a * cv.a * night;
  // the night: anime's painted far land, a dark silhouette (style.md K: the far land two-tone against the sky); the air
  // (farAir: the same for every far material) pulls it toward the sky by distance, day and night
  float nk = smoothstep(0.3, 0.9, uNight);
  s.albedo *= 1.0 - 0.75 * nk;
  s.emissive += uNightLand * nk;
  farAir(s, P);
}
`;

// a max pyramid of the land's heights (100 m cells over the 100 km grid, each level halving): the terrain skips a node
// wholly under the water (the bay is a third of every view: nothing of it is the land's to draw)
function landMax(D, G) {
  const C = 100, n = 1000, half = 50000, base = new Float32Array(n * n).fill(-1e9);
  const put = (g, a) => { for (let j = 0; j < g.h; j++) { const z = g.z0 + j * g.dx, cj = Math.floor((z + half) / C); if (cj < 0 || cj >= n) continue; for (let i = 0; i < g.w; i++) { const x = g.x0 + i * g.dx, ci = Math.floor((x + half) / C); if (ci < 0 || ci >= n) continue; const k = cj * n + ci, v = a[j * g.w + i]; if (v > base[k]) base[k] = v; } } };
  put(D.far, G.far); put(D.mid, G.mid); put(D.near, G.near); put(D.alc, G.alc);
  const levels = [{ n, a: base }];
  while (levels[levels.length - 1].n > 1) {
    const p = levels[levels.length - 1], m = Math.ceil(p.n / 2), a = new Float32Array(m * m).fill(-1e9);
    for (let j = 0; j < p.n; j++) for (let i = 0; i < p.n; i++) { const k = (j >> 1) * m + (i >> 1); if (p.a[j * p.n + i] > a[k]) a[k] = p.a[j * p.n + i]; }
    levels.push({ n: m, a });
  }
  return (x0, z0, size) => {
    let l = 0; while (l < levels.length - 1 && C * Math.pow(2, l + 1) <= size / 2) l++;
    const cs = C * Math.pow(2, l), L = levels[l];
    const i0 = Math.floor((x0 - cs + half) / cs), i1 = Math.floor((x0 + size + cs + half) / cs), j0 = Math.floor((z0 - cs + half) / cs), j1 = Math.floor((z0 + size + cs + half) / cs);
    if (i1 < 0 || j1 < 0 || i0 >= L.n || j0 >= L.n) return false;        // (outside the grids: the far grid's edge holds; draw)
    for (let j = Math.max(0, j0); j <= Math.min(L.n - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(L.n - 1, i1); i++) if (L.a[j * L.n + i] > -1.0) return false;
    return true;
  };
}

export function buildLand(world, ctx, D) {
  const t0 = performance.now();
  return prepGrids(D).then(G => {
    const grids = [
      { x0: D.far.x0, z0: D.far.z0, dx: D.far.dx, w: D.far.w, h: D.far.h, a: G.far },
      { x0: D.mid.x0, z0: D.mid.z0, dx: D.mid.dx, w: D.mid.w, h: D.mid.h, a: G.mid },
      { x0: D.near.x0, z0: D.near.z0, dx: D.near.dx, w: D.near.w, h: D.near.h, a: G.near },
      { x0: D.alc.x0, z0: D.alc.z0, dx: D.alc.dx, w: D.alc.w, h: D.alc.h, a: G.alc },
    ];
    const keys = Object.keys(COVER);
    const U = {
      uCovM: { value: coverTexture(D, 'mid') }, uCovF: { value: coverTexture(D, 'far') },
      uCovB: { value: new T.Vector4(D.cover.mid.half, D.cover.mid.step, D.cover.mid.n, D.cover.far.half) }, uCovFn: { value: D.cover.far.step },
      uCov: { value: keys.map(k => new T.Vector3(...lin(COVER[k]))) }, uCovK: { value: keys.map(k => +k) },
      uGlowCol: { value: new T.Vector3(...lin('#ffb46a').map(v => v * 0.05)) },
      uAir: { value: new T.Vector4(1 / 30000, 0.85, 0, 0) }, uAlcB: { value: new T.Vector4(D.alc.x0 + D.alc.half, D.alc.z0 + D.alc.half, D.alc.half - 6, 0) }, uNightLand: { value: new T.Vector3(...lin('#1a2436').map(v => v * 0.9)) },
      uLandK: { value: +(new URLSearchParams(location.search).get('landk') || LAND_K) },
    };
    const q = new URLSearchParams(location.search);
    const TR = makeTerrain(world, {
      grids, name: 'far land', lines: 2, hole: HOLE, uniforms: Object.assign(U, AIR_U), noFocusShadow: true, cast: false, mip: q.get('fmip') || 'max', skip: q.get('fskip') === '0' ? null : landMax(D, G),
      s0: +(q.get('fs0') || 1), r0: +(q.get('fr0') || 150), G: +(q.get('fg') || 32), morph: 0.7, far: P.WORLD.far * 1.02,
      defines: Object.assign({ SPOTS: 0, NO_ATMOS: 1 }, q.get('fardbg') === '1' ? { FAR_NODISCARD: 1 } : q.get('fardbg') === '2' ? { FAR_NOLAND: 1 } : {}),
      surface: SURFACE(COVER),
    });
    const ms = Math.round(performance.now() - t0);
    return { terrain: TR, heightAt: TR.heightAt, uniforms: U, ms, levels: TR.levels, textureMB: TR.textureMB };
  });
}
