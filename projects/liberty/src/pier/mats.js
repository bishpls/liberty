// liberty/src/pier/mats.js: the waterfront's materials (B4). Anime rules (research/style.md): flat tones in two or
// three steps with a designed, violet-leaning shade (S2: shade ~0.5x the lit value, hue +15-25 deg), detail drawn as
// lines and decals rather than texture (S4-S5: seams, rust streaks with hard edges on ~4 % of a surface), windows as
// crisp emissive rectangles with no halo (K3). Colours were sampled by k-means on the local reference photos
// (scratchpad/pier/scripts/sample.py: 07 the roofs and the apron, 06 the plaster and the arch door, 01 the shed's wall,
// 12 Pier 33's wall and the piles); values are sRGB hex, linearised here.
//
// The pier's own lamps light the pier's surfaces in these shaders (lampLight below): the wall packs repeat along both
// long walls on one spacing, so each surface finds its nearest few analytically, at any distance, without spending the
// engine's 24 point lights or the stage's 64 spots (which stay the stage's). A pack's pool has a bright core and a soft
// falloff in the world's cel style (WALLPACK_GLSL: a cos^3 lobe about its aim, cut at the lens's horizon, inverse square
// from a 0.6 m lens, one soft cel step for the core). Until 2026-10-24 the pools were three hard-edged bands (cut paper
// in the tour's T5: ?pierlamps=v0 reproduces them; ?pierlamps=0 turns the pier's lamps off).
import { lin } from 'scene3d/util.js';
import { P35 } from './site.js';
import * as PLAN from '../plan.js';

const T = window.THREE;
const v3 = c => new T.Vector3(...lin(c));
const SEED_V = /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObjN = N; }`;
const SEED_VARY = 'varying float vSeed; varying vec3 vObjN;';

// ---- the lamps (one schedule, read by every pier surface and by index.js's lamp heads and lights list)
export const LAMPS = {
  // wall packs: on the pilasters of both long walls, every second bay, 5.2 m above the deck (under the clerestory's
  // sash band at 5.7-8.1 m), the lens 0.53 m off the wall (on the 0.28 m pilaster)
  spacing: 2 * P35.bay, h: 5.2, off: 0.53,
  z0: P35.z0 + P35.tipApron + P35.bay,               // the first pack: the second pilaster from the tip
  col: '#ffb46b',                                    // 3000 K LED (site.md §7: the city's 3000 K program), sRGB
  power: 9.0,                                        // radiance scale at 1 m (scene units; tuned against the stage's intensity 6-8 at 10 m)
};
LAMPS.zEndW = P35.backZ(P35.wallW) - 3.0;
LAMPS.zEndE = P35.backZ(P35.wallE) - 3.0;
LAMPS.nW = Math.floor((LAMPS.zEndW - LAMPS.z0) / LAMPS.spacing) + 1;
LAMPS.nE = Math.floor((LAMPS.zEndE - LAMPS.z0) / LAMPS.spacing) + 1;
// every pack, with what a shader elsewhere needs to light by it (B1 lights the ship's starboard side from the west face's
// packs): the lens's position, its linear colour, a gain, the cone (axis, inner and outer half-angles: full inside
// inner, nothing past outer, smoothstep between), the falloff q = cone / (1 + 0.9 r^2), the toon bands the pier draws its
// pools in (q > 0.11 -> 1, > 0.045 -> 0.62, > 0.018 -> 0.33, else q x 10: the radiance is color x gain x band x N.L'),
// and the night ramp (on = smoothstep(0.15, 0.55, uNight))
// The light model is WALLPACK_GLSL's wallPack(P, N, L, axis, colour x gain): import it to light another surface by the
// same packs (B1's hull). 'bands' and 'falloff' describe the first cut's hard bands (kept for reference: superseded).
LAMPS.shape = { k: 5.0, r0: 0.8, h: 5.2, norm: 1 / 0.67, sat: 0.6, core: [0.5, 0.85, 0.3], gain: 0.6 };
LAMPS.list = () => {
  const out = [], col = lin(LAMPS.col);
  const pack = (side, x, z) => ({
    kind: 'wall pack', face: side < 0 ? 'west' : 'east', pos: [x, P35.deck + LAMPS.h, z], color: col, gain: +(LAMPS.power * 0.11).toFixed(3),
    axis: [side * 0.57, -0.82, 0], model: 'wallPack (src/pier/mats.js WALLPACK_GLSL)', shape: LAMPS.shape, night: [0.15, 0.55],
    inner: 55, outer: 80, falloff: [1, 0.9], bands: [[0.11, 1], [0.045, 0.62], [0.018, 0.33]],
  });
  for (let i = 0; i < LAMPS.nW; i++) out.push(pack(-1, P35.wallW - LAMPS.off, LAMPS.z0 + i * LAMPS.spacing));
  for (let i = 0; i < LAMPS.nE; i++) out.push(pack(1, P35.wallE + LAMPS.off, LAMPS.z0 + i * LAMPS.spacing));
  return out;
};

// one wall pack's light at P on a surface of normal N: the lens at L aimed along ax (unit), colour x gain col. A cos^k lobe
// about the aim, nothing above the lens's horizon (a full cut-off pack), inverse square from a lens of radius r0 (scaled so
// the pool's peak on the deck under it is ~1), a soft saturation (no clipping in the near field) and one soft cel step for
// the core: the pool's edge is a falloff, never a cut
export const WALLPACK_GLSL = /* glsl */`
vec3 wallPack(vec3 P, vec3 N, vec3 L, vec3 ax, vec3 col) {
  vec3 d = L - P; float r2 = dot(d, d); vec3 l = d * inversesqrt(max(r2, 1e-6));
  float c = max(dot(-l, ax), 0.0);
  float I = pow(c, ${LAMPS.shape.k.toFixed(1)}) * smoothstep(0.0, 0.35, l.y);
  // (a wrapped cosine: the wall under the pack takes a soft scallop from the lens's grazing spill, as wall packs do)
  float nl = clamp((dot(N, l) + 0.3) / 1.3, 0.0, 1.0);
  float win = smoothstep(17.0, 11.9, sqrt(r2));
  float E = I * nl * ${(LAMPS.shape.h * LAMPS.shape.h).toFixed(2)} / (r2 + ${(LAMPS.shape.r0 * LAMPS.shape.r0).toFixed(2)}) * ${LAMPS.shape.norm.toFixed(4)} * win;
  float Es = E * ${(1 + LAMPS.shape.sat).toFixed(2)} / (1.0 + ${LAMPS.shape.sat.toFixed(2)} * E);
  float tone = ${(1 - LAMPS.shape.core[2]).toFixed(2)} * Es + ${LAMPS.shape.core[2].toFixed(2)} * smoothstep(${LAMPS.shape.core[0].toFixed(2)}, ${LAMPS.shape.core[1].toFixed(2)}, Es);
  return col * tone * ${LAMPS.shape.gain.toFixed(2)};
}
`;

export const LAMP_GLSL = /* glsl */`
uniform vec4 uLampW;   // x of the west packs, y, first z, spacing
uniform vec4 uLampE;   // x of the east packs, y, last z west, last z east
uniform vec3 uLampCol; // radiance at 1 m
uniform float uLampMode;  // 1 the soft pools (default), 2 the first cut's hard bands (?pierlamps=v0), 0 off (?pierlamps=0)
float lampsOn() { return smoothstep(0.15, 0.55, uNight); }
${WALLPACK_GLSL}
// the first cut (kept for A/Bs: ?pierlamps=v0): a cone with toon bands, hard-edged
vec3 onePackV0(vec3 P, vec3 N, vec3 L, float side) {
  vec3 d = L - P; float r = length(d); vec3 l = d / max(r, 1e-3);
  vec3 ax = normalize(vec3(side * 0.57, -0.82, 0.0));
  float c = dot(-l, ax), cone = smoothstep(cos(radians(80.0)), cos(radians(55.0)), c);
  float e = 1.0 / (1.0 + r * r * 0.9);
  float q = e * cone;
  float band = q > 0.11 ? 1.0 : (q > 0.045 ? 0.62 : (q > 0.018 ? 0.33 : q * 10.0));
  float nl = clamp((dot(N, l) + 0.25) / 1.25, 0.0, 1.0);
  return uLampCol * band * 0.11 * nl;
}
vec3 onePack(vec3 P, vec3 N, vec3 L, float side) {
  if (uLampMode > 1.5) return onePackV0(P, N, L, side);
  return wallPack(P, N, L, normalize(vec3(side * 0.57, -0.82, 0.0)), uLampCol * 0.11);
}
vec3 lampLight(vec3 P, vec3 N) {
  float on = lampsOn();
  if (on <= 0.0 || uLampMode < 0.5) return vec3(0.0);
  // the soft model sums the three packs round P along the wall (its pools reach past one spacing: the window in wallPack
  // takes them to zero by 17 m, so the set's change at a pack's z is seamless); the first cut summed two
  int n = uLampMode > 1.5 ? 2 : 3; float k0 = uLampMode > 1.5 ? 0.0 : -1.0;
  vec3 acc = vec3(0.0);
  float sp = uLampW.w;
  // the west wall's packs: the two nearest along z
  if (abs(P.x - uLampW.x) < 26.0) {
    float k = floor((P.z - uLampW.z) / sp), kmax = floor((uLampE.z - uLampW.z) / sp);
    if (uLampMode > 1.5) k = clamp(k, 0.0, kmax);
    for (int i = 0; i < 3; i++) {
      if (i >= n) break;
      float kk = k + k0 + float(i);
      if (uLampMode > 1.5) kk = clamp(kk, 0.0, kmax); else if (kk < 0.0 || kk > kmax) continue;
      acc += onePack(P, N, vec3(uLampW.x, uLampW.y, uLampW.z + kk * sp), -1.0);
    }
  }
  if (abs(P.x - uLampE.x) < 22.0) {
    float k = floor((P.z - uLampW.z) / sp), kmax = floor((uLampE.w - uLampW.z) / sp);
    if (uLampMode > 1.5) k = clamp(k, 0.0, kmax);
    for (int i = 0; i < 3; i++) {
      if (i >= n) break;
      float kk = k + k0 + float(i);
      if (uLampMode > 1.5) kk = clamp(kk, 0.0, kmax); else if (kk < 0.0 || kk > kmax) continue;
      acc += onePack(P, N, vec3(uLampE.x, uLampW.y, uLampW.z + kk * sp), 1.0);
    }
  }
  return acc * on;
}
`;

// ---- the intertidal growth on anything standing in the water (site.md §2, rule 9; measured on the board against the
// datums): a barnacle crust from MLLW up to MHHW - 0.28 m (+-0.12, ragged), mussels taking over below the band's middle,
// a thin green fringe of Ulva at the crust's top, the wet band the falling tide left (high water 1.78 m MLLW at 15:44,
// site.md §4) to MHHW + 0.45, guano streaks white on vertical faces under the roosts above it
const W_ = PLAN.WATER;
export const GROWTH = { mllw: W_.mllw, mhhw: W_.mhhw, crustTop: W_.mhhw - 0.28, crustJitter: 0.12, wetTop: W_.mhhw + 0.45, musselMid: W_.mllw + 0.45 * (W_.mhhw - W_.mllw) };
const GROWTH_GLSL = /* glsl */`
const float G_MLLW = ${W_.mllw.toFixed(3)}, G_MHHW = ${W_.mhhw.toFixed(3)};
vec3 growth(vec3 c, vec3 P, vec3 N, out float wet) {
  float y = P.y;
  wet = 1.0 - smoothstep(G_MHHW, G_MHHW + 0.45 + 0.15 * vnoise(P.xz * 3.0), y);
  c = mix(c, c * vec3(0.62, 0.6, 0.56), wet * 0.85);
  float top = G_MHHW - 0.28 + 0.12 * vnoise(P.xz * 5.0 + y * 2.0);
  float bar = 1.0 - smoothstep(top - 0.02, top + 0.02, y);
  // the crust in two flat tones (anime: a pale band with a scatter of small darker pits, not a texture)
  vec3 w3 = worley(vec2(dot(P.xz, vec2(0.7, 0.7)) * 16.0, y * 16.0));
  vec3 crust = mix(vec3(0.36, 0.34, 0.28), vec3(0.2, 0.19, 0.16), step(0.82, w3.z) * step(w3.x, 0.3));
  float mus = smoothstep(0.2, -0.2, (y - mix(G_MLLW, G_MHHW, 0.45)) + 0.35 * vnoise(P.xz * 2.0 + y));
  crust = mix(crust, vec3(0.012, 0.016, 0.02), mus);
  c = mix(c, crust, bar);
  float alg = smoothstep(0.08, 0.0, abs(y - top - 0.04 + 0.05 * vnoise(P.xz * 9.0)));
  c = mix(c, vec3(0.08, 0.15, 0.03), alg * 0.9);
  // guano: white streaks down vertical faces above the wet band, from a roost at the face's top (caps, wales): hashed
  // per 0.5 m column, ~6 % of columns, 0.3-1.4 m long from the cap's underside (~2.15 m)
  if (abs(N.y) < 0.5 && y > G_MHHW + 0.5) {
    float u = dot(P.xz, normalize(vec2(-N.z, N.x)));
    float col = floor(u * 2.0), h = hash11(col * 7.31 + floor(P.y * 0.2));
    float len = 0.3 + 1.1 * hash11(col * 3.7);
    float top2 = 2.15 + 0.4 * hash11(col * 1.9);
    float gu = step(h, 0.035) * step(y, top2) * step(top2 - len, y) * step(abs(fract(u * 2.0) - 0.5), 0.07 * (1.0 - (top2 - y) / len));
    c = mix(c, vec3(0.86, 0.85, 0.8), gu);
  }
  return c;
}
`;

// ---- shared surface helpers: flat value steps, decals, seams
export const PIER_GLSL = /* glsl */`
float aaW(float x) { return max(fwidth(x), 1e-4); }
// a crisp line of width w (metres) at every multiple of 'period' along x, faded where it would alias
float lines1(float x, float period, float w) {
  float f = abs(fract(x / period + 0.5) - 0.5) * period, a = aaW(x);
  return (1.0 - smoothstep(w * 0.5 - a, w * 0.5 + a, f)) * (1.0 - smoothstep(period * 0.25, period * 0.5, a * 2.0));
}
// three flat value steps of a field (anime tones): 0, 0.5, 1
float steps3(float v, float a, float b) { return v < a ? 0.0 : (v < b ? 0.5 : 1.0); }
// a rust streak hanging from a fitting at (u0, v0) on a wall (u along, v up, metres): a hard-edged tapering drip
float streak(vec2 uv, vec2 at, float w, float len, float sd) {
  vec2 d = uv - at; if (d.y > 0.05 || d.y < -len) return 0.0;
  float t = -d.y / len, wob = 0.25 * sin(d.y * 7.0 + sd * 40.0) * w;
  float hw = w * (1.0 - 0.75 * t);
  return 1.0 - smoothstep(hw - aaW(d.x), hw + aaW(d.x), abs(d.x + wob));
}
// the sky a point under Pier 35's deck still sees: through the nearest open side (the bulkhead closes the shore end), a
// half-plane opening e metres away seen from h below the soffit: 0.5 (1 - e / sqrt(e^2 + h^2)); 1 outside the footprint
float skyUnder(vec3 P) {
  float h = ${P35.deck.toFixed(2)} - 0.3 - P.y;
  if (h <= 0.0 || P.x < ${P35.x0.toFixed(2)} || P.x > ${P35.x1.toFixed(2)} || P.z < ${P35.z0.toFixed(2)} || P.z > ${P35.streetZ0.toFixed(2)} + ${P35.slope.toFixed(3)} * P.x) return 1.0;
  float e = max(min(min(P.x - ${P35.x0.toFixed(2)}, ${P35.x1.toFixed(2)} - P.x), P.z - ${P35.z0.toFixed(2)}), 0.0);
  return 0.5 * (1.0 - e / sqrt(e * e + h * h));
}
// shade colour by the style rule S2: about half the lit value, hue turned toward violet
vec3 shadeOf(vec3 c) { return c * vec3(0.46, 0.47, 0.58); }
`;

// a material from a surface body; the engine's shade() is used unless the body sets things itself.
// opts: name, lines, uniforms, glsl (extra helpers), body (GLSL statements with s, P, V, vUv, vSeed in scope), double, transparent
export function pierMat(world, { name, lines = 1, uniforms = {}, glsl = '', body, double = false, lamps = true, noFog = false, transparent = false, depthWrite, blending }) {
  const U = Object.assign({}, uniforms, lamps ? LAMP_UNIFORMS() : {});
  return world.mat({
    name, lines, double, noFog, transparent, depthWrite, blending,
    uniforms: U, varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      ${lamps ? LAMP_GLSL : ''}
      ${PIER_GLSL}
      ${glsl}
      void smain(inout Surface s, vec3 P, vec3 V) {
        float sd = vSeed; vec2 uv = vUv;
        ${body}
        { float sk = skyUnder(P); s.sky = min(s.sky, sk); s.ao *= mix(0.45, 1.0, sk); }
        ${lamps ? 's.emissive += s.albedo * lampLight(P, s.N);' : ''}
      }`,
  });
}
let LU = null;
function LAMP_UNIFORMS() {
  if (!LU) {
    const c = lin(LAMPS.col).map(x => x * LAMPS.power);
    LU = {
      uLampW: { value: new T.Vector4(P35.wallW - LAMPS.off, P35.deck + LAMPS.h, LAMPS.z0, LAMPS.spacing) },
      uLampE: { value: new T.Vector4(P35.wallE + LAMPS.off, 0, LAMPS.z0 + (LAMPS.nW - 1) * LAMPS.spacing, LAMPS.z0 + (LAMPS.nE - 1) * LAMPS.spacing) },
      uLampCol: { value: new T.Vector3(...c) },
      uLampMode: { value: (q => q === 'v0' ? 2 : q === '0' ? 0 : 1)(typeof location !== 'undefined' ? new URLSearchParams(location.search).get('pierlamps') : null) },
    };
  }
  return LU;
}

// ---- the palette
export function pierMats(world) {
  const M = {};
  const C = (name, hex) => ({ [name]: { value: v3(hex) } });

  // the apron and the deck: pale concrete (07: #d2d3d0 lit, #8e9193 the mid) with asphalt patches, joints every 6.1 m
  // across and a seam along, a painted yellow line inside the edge (photo 11), oil and tyre marks, gum, drains
  M.deck = pierMat(world, {
    name: 'pier deck', uniforms: Object.assign(C('uA', '#b8b9b3'), C('uB', '#9a9b97'), C('uAs', '#a3a49f'), C('uY', '#d9b43a'),
      { uEdgeX: { value: new T.Vector2(P35.x0, P35.x1) } }),
    glsl: 'uniform vec3 uA, uB, uAs, uY; uniform vec2 uEdgeX;',
    body: /* glsl */`
      // world-anchored: x across, z along the pier
      vec2 w = P.xz;
      float n1 = fbm(w * 0.045 + sd * 3.0, 3), n2 = vnoise(w * 0.31);
      // the slab's two tones: flat steps of a slow field (old pours against newer)
      float tone = steps3(n1, -0.12, 0.18);
      vec3 c = mix(uB, uA, 0.35 + 0.65 * tone);
      // patched repairs: small axis-aligned infills (a trench across a joint, a pothole fill) in a few cells, a newer grey
      vec2 cell = floor(w / vec2(3.05, 6.1)); float h = hash12(cell + 7.1);
      vec2 f = fract(w / vec2(3.05, 6.1));
      vec2 pc = vec2(0.2 + 0.5 * hash12(cell + 2.0), 0.15 + 0.6 * hash12(cell + 5.0)), ps = vec2(0.06 + 0.14 * hash12(cell + 9.0), 0.04 + 0.08 * hash12(cell + 4.0));
      float patchA = step(0.93, h) * step(abs(f.x - pc.x), ps.x) * step(abs(f.y - pc.y), ps.y);
      c = mix(c, uAs * (0.9 + 0.2 * hash12(cell + 3.0)), patchA);
      // joints: across every 6.1 m, a seam along every 3.05 m; dark crisp lines
      float jt = max(lines1(w.y, 6.1, 0.03), lines1(w.x - 0.4, 3.05, 0.02) * 0.7);
      // cracks: a few thin dark polylines from a Worley field's edges
      vec3 wr = worley(w * 0.35 + 11.0); float crack = (1.0 - smoothstep(0.0, 0.02, wr.y - wr.x)) * step(0.8, hash11(wr.z * 91.0)) * smoothstep(0.2, 0.5, vnoise(w * 0.5));
      // oil and tyre marks: soft dark blots and long streaks along the apron (forklifts, trucks)
      float oil = smoothstep(0.55, 0.75, vnoise(w * vec2(0.6, 0.12) + 4.0)) * 0.35;
      float tyre = (lines1(w.x - 13.0 - 0.6 * sin(w.y * 0.05), 1.9, 0.18) * smoothstep(0.1, 0.5, vnoise(w * vec2(0.4, 0.05)))) * 0.25;
      // chewing gum: pale and dark dots, densest on the walkway near the bulkhead and the gangway
      vec2 gc = floor(w * 4.0); float g = step(0.9965, hash12(gc + 0.5)) * (1.0 - smoothstep(0.08, 0.16, length(fract(w * 4.0) - 0.5)));
      // the painted line: 0.15 m wide, 0.6 m inside each edge, worn through in places
      float yl = (1.0 - smoothstep(0.075, 0.085, abs(w.x - uEdgeX.x - 0.6))) + (1.0 - smoothstep(0.075, 0.085, abs(w.x - uEdgeX.y + 0.6)));
      yl *= smoothstep(-0.3, 0.1, vnoise(w * vec2(2.0, 0.7) + 9.0)) * step(w.y, uEdgeX.y + 999.0);
      c = mix(c, uY, clamp(yl, 0.0, 1.0) * 0.9);
      c *= 1.0 - 0.45 * jt - 0.4 * crack * (1.0 - patchA) - oil - tyre;
      c = mix(c, vec3(0.32, 0.31, 0.3), g * 0.8);
      s.albedo = c; s.rough = 0.85;
    `,
  });

  // the shed's long walls: board-formed concrete painted a warm grey-beige (01: #c8c9c4 lit, #b0aa9d), the board marks
  // every 0.30 m as faint lines, pilasters and door frames are geometry; grime at the foot, rust weeping from fittings
  M.wall = pierMat(world, {
    name: 'shed wall', uniforms: Object.assign(C('uA', '#bdb7a5'), C('uB', '#a8a290'), C('uR', '#8a5a34'), { uFoot: { value: P35.deck } }),
    glsl: 'uniform vec3 uA, uB, uR; uniform float uFoot;',
    body: /* glsl */`
      float h = P.y - uFoot;                                  // height above the deck
      float u = dot(P.xz, normalize(vec2(-s.N.z, s.N.x)));    // along the wall
      float tone = steps3(fbm(vec2(u * 0.05, h * 0.12) + sd * 5.0, 3), -0.15, 0.2);
      vec3 c = mix(uB, uA, 0.4 + 0.6 * tone);
      // board marks: horizontal lines every 0.30 m, faint (style: lines, not texture)
      c *= 1.0 - 0.06 * lines1(h, 0.3, 0.012);
      // paint failing in flat-edged flakes showing the grey concrete under it
      float fl = step(0.72, vnoise(vec2(u, h) * vec2(0.9, 1.6) + sd * 9.0)) * step(0.5, hash12(floor(vec2(u, h) * 2.0)));
      c = mix(c, vec3(0.42, 0.42, 0.4), fl * 0.6);
      // grime: a darker band at the foot (splash, forklifts), streaks running down from the eave's gutter
      c *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.9, h)) ;
      float drip = smoothstep(0.55, 0.8, vnoise(vec2(u * 1.7, 0.0) + sd)) * smoothstep(${(P35.eaveH - 3.5).toFixed(1)}, ${P35.eaveH.toFixed(1)}, h);
      c *= 1.0 - 0.18 * drip;
      // rust weeping (decals: S5, ~4 % of a wall with the flaking): from the wall packs down their pilasters (every
      // second pilaster from the second), and from the steel sash's sills (5.6 m) in one to three streaks a window
      float bay = ${P35.bay.toFixed(3)};
      float along = abs(s.N.x) > 0.5 ? P.z - ${(P35.z0 + P35.tipApron).toFixed(3)} : P.x;
      float bi = floor(along / bay), ub = along - bi * bay;
      float rs = streak(vec2(ub < bay * 0.5 ? ub : ub - bay, h), vec2(0.0, 5.0), 0.06, 1.2 + 1.6 * hash11(bi), sd) * step(0.5, mod(bi, 2.0)) * step(0.35, hash11(bi + 3.0));
      for (int k = 0; k < 3; k++) {
        float hk = hash11(bi * 3.1 + float(k) * 7.7 + sd);
        float uk = 0.9 + 0.3 + (bay - 2.4) * hk;
        rs += streak(vec2(ub, h), vec2(uk, 5.6), 0.035 + 0.03 * hash11(hk * 9.0), 0.5 + 1.8 * hash11(hk * 5.0), sd) * step(0.4 * float(k) - 0.05, hash11(bi + float(k) * 13.0));
      }
      c = mix(c, uR, clamp(rs, 0.0, 1.0) * 0.75);
      s.albedo = c; s.rough = 0.9;
    `,
  });

  // the roofs: dark slate composition roofing (07: #4a5059 lit slope, #686c6f the other, site.md #4d535c / #585e69),
  // its courses every 0.9 m down the slope as faint lines, patches of newer roofing, the rust of the vents' flashings
  M.roof = pierMat(world, {
    name: 'shed roof', lamps: false, uniforms: Object.assign(C('uA', '#4f555e'), C('uB', '#5f6468'), C('uP', '#6d7175')),
    glsl: 'uniform vec3 uA, uB, uP;',
    body: /* glsl */`
      // uv: u along the ridge (z), v down the slope (metres)
      float tone = steps3(fbm(P.xz * 0.03 + sd * 7.0, 3), -0.2, 0.25);
      vec3 c = mix(uA, uB, tone * 0.6);
      vec2 cell = floor(vec2(uv.x / 7.5, uv.y / 3.6)); float h = hash12(cell + sd * 13.0);
      c = mix(c, uP, step(0.83, h) * 0.8);                 // newer patches (flat-edged)
      c *= 1.0 - 0.10 * lines1(uv.y, 0.91, 0.02);          // the courses
      c *= 1.0 - 0.06 * lines1(uv.x, 7.5, 0.03);           // the sheets' laps
      // a guano-and-moss wash below the ridge vents (the middle gable's yellow stain in 07)
      c = mix(c, vec3(0.42, 0.40, 0.30), smoothstep(0.6, 0.9, vnoise(vec2(uv.x * 0.05, uv.y * 0.2) + 3.0)) * 0.35 * (1.0 - smoothstep(0.0, 5.0, uv.y)));
      s.albedo = c; s.rough = 0.75; s.spec = 0.08;
    `,
  });

  // concrete for the substructure: piles, caps, beams and the soffit. The growth bands by height (site.md §2, rule 9):
  // mussels and barnacles from MLLW to MHHW, a green algal fringe at the top, the wet band left by the falling tide
  // (high water at 15:44, +1.78 m MLLW), bare weathered concrete above with drips and efflorescence; guano on tops.
  M.pile = pierMat(world, {
    name: 'pier piles', uniforms: C('uA', '#8e8b82'), glsl: 'uniform vec3 uA;' + GROWTH_GLSL,
    body: /* glsl */`
      // bare concrete above: two flat tones; efflorescence and rust weeping from the reinforcement at the caps' edges
      vec3 c = uA * (0.92 + 0.08 * steps3(vnoise(P.xz * 0.4 + P.y * 0.3), -0.2, 0.3));
      float wet;
      c = growth(c, P, s.N, wet);
      s.albedo = c;
      s.rough = mix(0.9, 0.35, wet);
      s.spec = 0.25 * wet;
    `,
  });

  // creosoted timber: the fender piles, the curb, the chocks (01, 48: dark brown-grey, silvered where the sun reaches)
  M.timber = pierMat(world, {
    name: 'creosote timber', uniforms: Object.assign(C('uA', '#5a4e43'), C('uB', '#3e352e'), C('uS', '#8a8379')),
    glsl: 'uniform vec3 uA, uB, uS;' + GROWTH_GLSL,
    body: /* glsl */`
      float g = vnoise(vec2(uv.x * 0.8, uv.y * 25.0) + sd * 31.0);
      vec3 c = mix(uB, uA, step(0.0, g));
      float sun = clamp(s.N.y * 1.5 + 0.2, 0.0, 1.0);
      c = mix(c, uS, sun * 0.55 * step(0.2, vnoise(vec2(uv.x * 0.3, uv.y * 3.0) + sd * 7.0)));   // silvered tops
      c *= 1.0 - 0.25 * lines1(uv.y, 0.07, 0.008);
      float wet; c = growth(c, P, s.N, wet);
      s.albedo = c; s.rough = mix(0.9, 0.4, wet); s.spec = 0.2 * wet;
    `,
  });

  // the orange cylinder fenders (07: hung on both long edges; foam-filled, polyurethane skin), scuffed black where
  // hulls rub, chain-scarred
  M.fender = pierMat(world, {
    name: 'fender', uniforms: Object.assign(C('uA', '#cc5a2a'), C('uB', '#9d3f1d'), C('uS', '#2b2725')),
    glsl: 'uniform vec3 uA, uB, uS;',
    body: /* glsl */`
      float t = steps3(vnoise(P.xz * 0.9 + P.y * 1.3 + sd * 17.0), -0.3, 0.35);
      vec3 c = mix(uB, uA, 0.4 + 0.6 * t);
      // the rub: a dark band where the hull bears (the face toward the berth)
      float rub = smoothstep(0.55, 0.85, abs(s.N.x)) * step(0.3, vnoise(P.xz * 3.0 + P.y * 2.0));
      c = mix(c, uS, rub * 0.7);
      s.albedo = c; s.rough = 0.6; s.spec = 0.12;
    `,
  });

  // painted steel: bollards, bitts, cleats, door frames (black, scuffed to rust and bright steel at the rope's wear)
  M.iron = pierMat(world, {
    name: 'pier iron', uniforms: Object.assign(C('uA', '#2c2e30'), C('uR', '#6b3d20'), C('uW', '#8f8f88')),
    glsl: 'uniform vec3 uA, uR, uW;',
    body: /* glsl */`
      vec3 c = uA;
      float r = step(0.62, vnoise(P.xz * 6.0 + P.y * 7.0 + sd * 11.0));
      c = mix(c, uR, r * 0.8);
      // the rope's polish round the waist
      c = mix(c, uW, step(0.75, vnoise(vec2(atan(s.N.z, s.N.x) * 2.0, P.y * 9.0))) * 0.35 * step(abs(s.N.y), 0.6));
      s.albedo = c; s.rough = 0.55; s.spec = 0.3;
    `,
  });

  // the roll-up doors: corrugated steel (the slats are lines every 0.08 m), dark olive-grey (06: #3d3f38, #565b55)
  M.door = pierMat(world, {
    name: 'rollup door', uniforms: Object.assign(C('uA', '#5a5d55'), C('uB', '#444740'), C('uR', '#7b4b2a')),
    glsl: 'uniform vec3 uA, uB, uR;',
    body: /* glsl */`
      float h = P.y;
      vec3 c = mix(uB, uA, step(0.0, vnoise(vec2(uv.x * 0.2, h * 0.5) + sd * 5.0)));
      c *= 1.0 - 0.28 * lines1(h, 0.083, 0.012);
      c = mix(c, uR, smoothstep(0.65, 0.9, vnoise(vec2(uv.x * 1.3, h * 0.7) + sd * 13.0)) * smoothstep(1.2, 0.0, h - ${P35.deck.toFixed(2)}) * 0.6);
      s.albedo = c; s.rough = 0.6; s.spec = 0.15;
    `,
  });

  // steel-sash windows (the shed's clerestory and the bulkhead's): a dark glazed grid; at night some bays lit behind
  // the glass (crisp rectangles, no halo: K3). uv: u along the band, v up (metres); the band's own cell size in uniforms
  const sash = (name, share) => pierMat(world, {
    name, lamps: false,
    uniforms: Object.assign(C('uFrame', '#30353a'), C('uGlass', '#1c2a33'), C('uSky', '#7f97a8'), C('uLit', '#ffcf8a'), { uCell: { value: new T.Vector2(0.55, 0.42) }, uLitShare: { value: share } }),
    glsl: 'uniform vec3 uFrame, uGlass, uSky, uLit; uniform vec2 uCell; uniform float uLitShare;',
    body: /* glsl */`
      vec2 q = uv / uCell, f = fract(q), id = floor(q);
      float bar = 0.07 / uCell.x;
      float frame = 1.0 - step(bar, f.x) * step(f.x, 1.0 - bar) * step(bar * uCell.x / uCell.y, f.y) * step(f.y, 1.0 - bar * uCell.x / uCell.y);
      // panes: some broken or painted over (the shed's 1915 glass), a sky sheen by day
      float ph = hash12(id + sd * 41.0);
      vec3 g = uGlass * (0.8 + 0.4 * ph);
      g = mix(g, uSky, 0.35 * (1.0 - uNight) * smoothstep(0.2, 0.9, f.y + 0.3 * ph));
      g = mix(g, vec3(0.55, 0.55, 0.5), step(0.93, ph));   // painted-over panes
      s.albedo = mix(g, uFrame, frame); s.rough = 0.3; s.spec = 0.5 * (1.0 - frame);
      // lit at night: the whole window (a bay of 4 x 3 panes) is on or off, by its own hash, coming on through dusk
      vec2 bid = floor(uv / (uCell * vec2(4.0, 3.0)));
      float on = step(hash12(bid + sd * 7.0), uLitShare) * smoothstep(0.1 + 0.6 * hash12(bid + 3.0), 0.8, uNight + 0.05);
      s.emissive += uLit * on * (1.0 - frame) * (0.55 + 0.45 * hash12(bid + 1.0)) * 1.6;
    `,
  });
  M.sash = sash('steel sash', 0.18);
  M.lunette = sash('arch lunette', 1.0);

  // the bulkhead's plaster: warm light grey (06: #d8d7d1 / #d3d1ca lit; site.md #cccac3), weathered in flat streaks
  M.plaster = pierMat(world, {
    name: 'bulkhead plaster', lamps: false, uniforms: Object.assign(C('uA', '#d2d0c8'), C('uB', '#c3c1b8'), C('uG', '#9e9c93')),
    glsl: 'uniform vec3 uA, uB, uG;',
    body: /* glsl */`
      float tone = steps3(fbm(P.xz * 0.06 + P.y * 0.05 + sd * 3.0, 3), -0.1, 0.25);
      vec3 c = mix(uB, uA, tone);
      // weather streaks below sills and cornices: soft vertical darkening
      float st = smoothstep(0.55, 0.85, vnoise(vec2(dot(P.xz, vec2(0.83, -0.56)) * 1.4, 0.0) + sd * 3.0));
      c = mix(c, uG, st * 0.35 * smoothstep(0.0, 4.0, P.y - 3.0));
      // the base: darker plinth splash
      c *= 1.0 - 0.18 * (1.0 - smoothstep(3.0, 3.9, P.y));
      s.albedo = c; s.rough = 0.9;
      // at night the street's lamps wash the frontage's lower storey warm (3000 K), fading up the facade in flat steps
      float wash = steps3(1.0 - smoothstep(3.0, 11.0, P.y), 0.25, 0.6);
      s.emissive += c * vec3(1.0, 0.72, 0.45) * wash * 0.22 * smoothstep(0.15, 0.55, uNight) * step(0.3, s.N.y + 0.6);
    `,
  });

  M.flat = (name, hex, opts = {}) => pierMat(world, {
    name, lamps: opts.lamps !== false, lines: opts.lines === undefined ? 1 : opts.lines, double: !!opts.double,
    uniforms: C('uC', hex), glsl: 'uniform vec3 uC;',
    body: `s.albedo = uC; s.rough = ${(opts.rough || 0.8).toFixed(2)}; s.spec = ${(opts.spec || 0).toFixed(2)}; ${opts.emit ? `s.emissive = uC * ${opts.emit.toFixed(2)} * ${opts.nightOnly ? 'smoothstep(0.15, 0.55, uNight)' : '1.0'};` : ''}`,
  });
  // the mooring lines: weathered yellow-white synthetic (photo 01's stern line), the lay drawn as a spiral of lines
  M.rope = pierMat(world, {
    name: 'mooring line', uniforms: C('uA', '#d2c48c'), glsl: 'uniform vec3 uA;',
    body: 's.albedo = uA * (0.82 + 0.18 * step(0.5, fract(uv.x * 9.0 + uv.y * 26.0))); s.rough = 0.85;',
  });
  // a lamp's lens: bright warm emissive when on (blooms: a point emitter)
  M.lens = M.flat('lamp lens', '#ffd9a8', { lamps: false, emit: 6.0, nightOnly: true, lines: 0 });
  return M;
}
