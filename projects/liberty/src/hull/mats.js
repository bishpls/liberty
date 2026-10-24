// liberty/src/hull/mats.js: the ship's body's materials (B1). Anime steel (research/style.md §3, S1-S7): near-neutral
// grey in flat tones, a designed shade at about half the lit value turned toward violet (S2), detail as lines and decals
// (S4: plating seams as thin dark lines, no rivet geometry), rust as flat-edged streaks under every fitting that weeps
// (S5), the hull's bands straight and parallel to the baseline (ship.md §3: red-brown below 3.87 m ABL, black to 4.91 m,
// grey above). Base albedos: ship.md §8 rule 17 (hull and superstructure #7A838A, deck #A9ADB2, boot-top #202326, bottom
// #7A3A22, lettering #EDEDE8), sampled from the photos and scaled to a toon palette.
//
// Every geometry carries aShip (its point in ship coordinates: x starboard, abl, z aft) so the paint's rules read the
// ship's own frame whatever the trim; uv is in metres (the shell: z along, girth below the deck edge).
import { lin } from 'scene3d/util.js';
import { markAtlas, MARK_GLSL, markUniforms, LETTER } from './marks.js';
import { WALLPACK_GLSL } from '../pier/mats.js';
import * as PLAN from '../plan.js';

const T = window.THREE;
const v3 = c => new T.Vector3(...lin(c));
const VERT = /* glsl */`attribute float aSeed; attribute vec3 aShip; attribute float aSide;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vShip = aShip; vSide = aSide; }`;
const VARY = 'varying float vSeed; varying vec3 vShip; varying float vSide;';

export const PAINT = {
  grey: '#7a838a', greyOld: '#737c84', deck: '#a9adb2', boot: '#202326', bottom: '#7a3a22', white: '#e3e3dd', letter: '#ededE8',
  rust: '#8a5233', rustDark: '#4e2e1e', tarpGreen: '#3f6e66', black: '#1c1d20', bronze: '#8c6a3c',
};
// the ship's lines: the red-brown below 3.87 m ABL, the black boot-top to 4.91 m (ship.md §3, rule 5)
export const BANDS = { red: 3.87, black: 4.91 };

// ---- shared hooks (one uniform set for every hull material)
// the pier's lamps on her (the integrator, 2026-10-23: B4's wall packs and apron lamps throw warm pools on her starboard
// side, lit here analytically, not through world.light): up to 16 lamps within ~40 m of the hull, set once the pier has
// built (index.js, setLamps). Each: the lens's position, linear colour x gain, the aim (and the first cut's cone cosines,
// for ?pierlamps=v0). The light model is B4's wallPack (WALLPACK_GLSL, imported), so the pier's pools and hers are one
// light (2026-10-24: the first cut's three hard bands had drawn cut-paper ellipses on both).
export const NLAMP = 16, NCHOCK = 16;
export const HOOK = {
  uHLampP: { value: Array.from({ length: NLAMP }, () => new T.Vector4(0, -999, 0, 0)) },
  uHLampC: { value: Array.from({ length: NLAMP }, () => new T.Vector4(0, 0, 0, -1)) },
  uHLampA: { value: Array.from({ length: NLAMP }, () => new T.Vector4(0, -1, 0, 1)) },
  uHLampN: { value: 0 },
  // the pier's ?pierlamps (v0: the first cut's bands; 0: off), its lamps' night ramp, its deck edge (x, y) that shades her
  uHLampMode: { value: (q => q === 'v0' ? 2 : q === '0' ? 0 : 1)(typeof location !== 'undefined' ? new URLSearchParams(location.search).get('pierlamps') : null) },
  uHLampNight: { value: new T.Vector2(0.15, 0.55) },
  uPierEdge: { value: new T.Vector2(PLAN.PIER.x0, PLAN.PIER.deck) },
  // closed chocks: oval openings through the bulwark (ship coordinates: z, abl centre; half length, half height)
  uChock: { value: Array.from({ length: NCHOCK }, () => new T.Vector4(0, -99, 0.01, 0.01)) },
  uChockN: { value: 0 },
  // freeing ports (ship.md §3: 1.37 x 0.40 m slots at deck level, a centre bar): z of the first, the spacing, the last;
  // and up to 8 z's to leave out (the chocks, the gangway)
  uFreeing: { value: new T.Vector4(-52, 4.6, 52, 0.4) },
  uFreeSkip: { value: Array.from({ length: 8 }, () => -999) },
};
export function setLamps(list) {
  const n = Math.min(NLAMP, list.length);
  for (let i = 0; i < NLAMP; i++) {
    const l = list[i];
    if (!l) { HOOK.uHLampP.value[i].set(0, -999, 0, 0); continue; }
    const c = Array.isArray(l.color) ? l.color : lin(l.color || '#ffb46b');
    const ax = l.axis, len = Math.hypot(ax[0], ax[1], ax[2]) || 1;
    HOOK.uHLampP.value[i].set(l.pos[0], l.pos[1], l.pos[2], 1);
    HOOK.uHLampC.value[i].set(c[0] * l.power, c[1] * l.power, c[2] * l.power, Math.cos(l.outer * Math.PI / 180));
    HOOK.uHLampA.value[i].set(ax[0] / len, ax[1] / len, ax[2] / len, Math.cos(l.inner * Math.PI / 180));
  }
  HOOK.uHLampN.value = n;
  const nt = list.find(l => l && l.night); if (nt) HOOK.uHLampNight.value.set(nt.night[0], nt.night[1]);
}
export function setFreeingSkip(zs) { for (let i = 0; i < 8; i++) HOOK.uFreeSkip.value[i] = zs[i] ?? -999; }
export function setChocks(list) {
  const n = Math.min(NCHOCK, list.length);
  for (let i = 0; i < n; i++) HOOK.uChock.value[i].set(list[i].z, list[i].abl, list[i].hz, list[i].hh);
  HOOK.uChockN.value = n;
}
const HOOK_GLSL = /* glsl */`
uniform vec4 uHLampP[${NLAMP}]; uniform vec4 uHLampC[${NLAMP}]; uniform vec4 uHLampA[${NLAMP}]; uniform float uHLampN, uHLampMode; uniform vec2 uHLampNight, uPierEdge;
uniform vec4 uChock[${NCHOCK}]; uniform float uChockN;
uniform vec4 uFreeing; uniform float uFreeSkip[8];
// a freeing port's slot at deck level (hAbove: height over the deck edge), split by its centre bar
bool inFreeing(float z, float hAbove) {
  if (hAbove < -0.01 || hAbove > uFreeing.w || z < uFreeing.x - 1.0 || z > uFreeing.z + 1.0) return false;
  float k = floor((z - uFreeing.x) / uFreeing.y + 0.5), zc = uFreeing.x + k * uFreeing.y;
  for (int i = 0; i < 8; i++) if (abs(zc - uFreeSkip[i]) < 1.4) return false;
  float d = abs(z - zc);
  return d < 0.685 && d > 0.035 && hAbove > 0.0;
}
// the pier's wall packs on her starboard side: B4's own light model (WALLPACK_GLSL from src/pier/mats.js: a cos^5 lobe
// about the aim, nothing above the lens's horizon, inverse square from a 0.8 m lens, a soft saturation and one soft cel
// step), so her plating and the apron are lit by one light. Below the pier's deck edge her side is in its shadow: the ray
// from the lens must clear the edge (x = uPierEdge.x, y = uPierEdge.y), softened by the lens's size seen from the plating.
// uHLampMode (the pier's ?pierlamps): 1 this model, 2 the first cut's hard bands (A/Bs), 0 off
${WALLPACK_GLSL}
vec3 pierLamps(vec3 P, vec3 N) {
  float on = smoothstep(uHLampNight.x, uHLampNight.y, uNight);
  if (on <= 0.0 || uHLampN < 0.5 || uHLampMode < 0.5) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${NLAMP}; i++) {
    if (float(i) >= uHLampN) break;
    vec3 L = uHLampP[i].xyz, d = L - P; float r = length(d); if (r > 45.0) continue;
    vec3 l = d / max(r, 1e-3);
    if (uHLampMode > 1.5) {
      // the first cut (kept for A/Bs: ?pierlamps=v0): a cone's falloff in three hard bands
      float cone = smoothstep(uHLampC[i].w, uHLampA[i].w, dot(-l, uHLampA[i].xyz));
      float q = cone / (1.0 + r * r * 0.9);
      float band = q > 0.11 ? 1.0 : (q > 0.045 ? 0.62 : (q > 0.018 ? 0.33 : q * 10.0));
      acc += uHLampC[i].rgb * band * clamp((dot(N, l) + 0.25) / 1.25, 0.0, 1.0);
      continue;
    }
    float clear = 1.0;
    if (P.x < uPierEdge.x && L.x > uPierEdge.x) {
      float f = (L.x - uPierEdge.x) / (L.x - P.x), yAt = L.y + (P.y - L.y) * f, w = 0.8 * (uPierEdge.x - P.x) / (L.x - P.x) + 0.02;
      clear = smoothstep(-w, w, yAt - uPierEdge.y);
    }
    acc += wallPack(P, N, L, uHLampA[i].xyz, uHLampC[i].rgb) * clear;
  }
  return acc * on;
}
// inside one of the closed chocks' ovals (on the ship's side: |x| past 3 m)
bool inChock(vec3 S) {
  if (abs(S.x) < 3.0) return false;
  for (int i = 0; i < ${NCHOCK}; i++) {
    if (float(i) >= uChockN) break;
    vec2 d = (vec2(S.z, S.y) - uChock[i].xy) / uChock[i].zw;
    if (dot(d, d) < 1.0) return true;
  }
  return false;
}
`;
const SHIP_GLSL = /* glsl */`
float aaW(float x) { return max(fwidth(x), 1e-4); }
// a crisp line of width w (m) at every multiple of 'period' along x, faded out where it would alias
float lines1(float x, float period, float w) {
  float f = abs(fract(x / period + 0.5) - 0.5) * period, a = aaW(x);
  return (1.0 - smoothstep(w * 0.5 - a, w * 0.5 + a, f)) * (1.0 - smoothstep(period * 0.2, period * 0.45, a * 2.0));
}
// one line at x = x0
float line1(float x, float x0, float w) { float a = aaW(x); return (1.0 - smoothstep(w * 0.5 - a, w * 0.5 + a, abs(x - x0))) * (1.0 - smoothstep(0.08, 0.3, a)); }
// three flat value steps of a field (anime tones)
float steps3(float v, float a, float b) { return v < a ? 0.0 : (v < b ? 0.5 : 1.0); }
// a rust streak hanging from (u0, v0) (u along, v down, metres): hard-edged, tapering, wavering
float streakDown(vec2 uv, vec2 at, float w, float len, float sd) {
  vec2 d = uv - at; if (d.y < -0.03 || d.y > len) return 0.0;
  float t = d.y / len, wob = 0.3 * sin(d.y * 5.0 + sd * 40.0) * w;
  float hw = w * (1.0 - 0.8 * t * t) * (0.6 + 0.4 * step(0.02, d.y));
  float a = aaW(d.x);
  return 1.0 - smoothstep(hw - a, hw + a, abs(d.x + wob));
}
// the designed shade (S2): about half the lit value, turned toward violet
vec3 shadeOf(vec3 c) { return c * vec3(0.50, 0.50, 0.535); }   // (measured: 0.47/0.48/0.60 gave shade S 0.30 against S2's 0.08-0.10)
`;

export function shipMat(world, { name, lines = 1, uniforms = {}, glsl = '', body, double = false, transparent = false, depthWrite, blending, noFog = false, lamps = true, chocks = false }) {
  return world.mat({
    name, lines, double, transparent, depthWrite, blending, noFog,
    uniforms: Object.assign({}, uniforms, HOOK), varyings: VARY, vertex: VERT,
    surface: /* glsl */`
      ${HOOK_GLSL}
      ${SHIP_GLSL}
      ${glsl}
      void smain(inout Surface s, vec3 P, vec3 V) {
        float sd = vSeed; vec2 uv = vUv; vec3 S = vShip;
        ${chocks ? 'if (inChock(S)) discard;' : ''}
        ${chocks === 'outer' ? 'if (inFreeing(S.z, -vUv.y)) discard;' : ''}${chocks === 'inner' ? 'if (inFreeing(S.z, vUv.y)) discard;' : ''}
        ${body}
        s.shadeCol = shadeOf(s.albedo); s.useShade = 1.0;
        ${lamps ? 'if (vSide > 0.5) s.emissive += s.albedo * pierLamps(P, s.N);' : ''}
      }`,
  });
}

const C = (name, hex) => ({ [name]: { value: v3(hex) } });

export function hullMats(world, place) {
  const M = {};
  const atlas = markAtlas(), MU = markUniforms(atlas, place);
  // ---- the shell: bands, plating, frames' dishing, the wet line, rust weeping from scuppers and freeing ports, the
  // pier side's fender scuffs, touch-up patches
  M.shell = shipMat(world, {
    name: 'hull shell', lines: 1, chocks: 'outer',
    uniforms: Object.assign(C('uGrey', PAINT.grey), C('uGrey2', PAINT.greyOld), C('uBoot', PAINT.boot), C('uRed', PAINT.bottom), C('uRust', PAINT.rust),
      C('uRustD', PAINT.rustDark), C('uLetter', PAINT.letter), { uDisch: { value: place.disch.map(d => new T.Vector3(...d)) } }, { uHawse: { value: new T.Vector2(place.hawse[0], place.hawse[1]) } }, { uBands: { value: new T.Vector2(BANDS.red, BANDS.black) } }, MU),
    glsl: 'uniform vec3 uGrey, uGrey2, uBoot, uRed, uRust, uRustD, uLetter; uniform vec2 uBands, uHawse; uniform vec3 uDisch[8];' + MARK_GLSL,
    body: /* glsl */`
      float abl = S.y, zz = S.z, g = uv.y;                    // g: girth below the deck edge (m; negative on the bulwark)
      // touch-up paint: big flat patches of a slightly different grey (the 2012 repaint, later touch-ups)
      vec2 pc = floor(vec2(zz / 6.5, g / 2.6) + sd * 3.0);
      float patchT = step(0.86, hash12(pc + 0.5)) * step(0.15, fract(zz / 6.5 + hash12(pc) * 0.3)) * step(fract(g / 2.6 + 0.2), 0.8);
      vec3 c = mix(uGrey, uGrey2, patchT * 0.6);
      // the bands (straight, parallel to the baseline)
      c = abl < uBands.y ? (abl < uBands.x ? uRed : uBoot) : c;
      // plating: strake seams at constant girth below the deck edge (sheet 14: J, H, G, F, E, D), the sheer strake's top
      // 0.17 m above the deck, butts every 8.2 m staggered strake to strake (ship.md §3)
      float seam = line1(g, -0.17, 0.03);
      float gs[5]; gs[0] = 1.86; gs[1] = 3.93; gs[2] = 5.94; gs[3] = 7.99; gs[4] = 9.66;
      float strake = 0.0;
      for (int k = 0; k < 5; k++) { seam = max(seam, line1(g, gs[k], 0.03)); strake += step(gs[k], g); }
      float butt = lines1(zz + strake * 4.1 + 2.0, 8.2, 0.03) * step(-0.17, g);
      seam = max(seam, butt);
      c *= 1.0 - (0.24 - 0.1 * butt) * seam;
      // the frames (sheet 2's chain: 24 in for 22 ft abaft the FP, 27 in to 82.75 ft, 30 in through the body, 24 in for the
      // last 24 ft): their lines carry the rivet rows and the plate dishes between them
      float fz = zz / 0.3048 + 213.65;                     // ft aft of the FP
      float fsp = fz < 22.0 || fz > 392.0 ? 0.6096 : (fz < 82.75 ? 0.6858 : 0.762);
      // rivet rows (photos 12, 16: dotted rows down every frame and along every seam, over the whole side above the
      // boot-top): ~1 in domes at ~3.5 in pitch, drawn only where a dot is a few pixels (S4), so they vanish with distance
      if (g > -0.1 && S.y > uBands.y) {
        float onFrame = line1(fract(zz / fsp + 0.5) * fsp - fsp * 0.5, 0.0, 0.028);
        float onSeam = line1(g, -0.12, 0.028);
        for (int k = 0; k < 5; k++) onSeam = max(onSeam, max(line1(g, gs[k] - 0.05, 0.028), line1(g, gs[k] + 0.05, 0.028)));
        float dotsV = smoothstep(0.36, 0.16, abs(fract(g / 0.089) - 0.5)), dotsH = smoothstep(0.36, 0.16, abs(fract(zz / 0.089) - 0.5));
        float riv = max(onFrame * dotsV, onSeam * dotsH);
        float res = 1.0 - smoothstep(0.010, 0.026, max(aaW(zz), aaW(g)));
        c *= 1.0 - 0.2 * riv * res;
      }
      // overboard discharges (photo 16): small round outlets with a lip, a rust weep below each
      for (int i = 0; i < 8; i++) {
        vec3 od = uDisch[i];
        vec2 d = vec2(zz - od.x, S.y - od.y); float r = length(d);
        if (od.z * vSide < 0.0 || r > 3.5) continue;
        c = mix(c, c * 1.12, (1.0 - smoothstep(0.13, 0.15, r)) * smoothstep(0.09, 0.11, r));
        c = mix(c, vec3(0.03), 1.0 - smoothstep(0.085, 0.1, r));
        c = mix(c, mix(uRust, uRustD, 0.5), streakDown(vec2(zz, -S.y), vec2(od.x, -od.y + 0.12), 0.05, 1.4 + 1.2 * fract(od.x * 3.7), sd) * 0.55);
      }
      // the frames' dishing ("hungry horse"): the plate sags between frames, read in raking light
      float dish = sin(zz / fsp * 6.2832) * 0.018 * (1.0 - smoothstep(0.3, 0.9, aaW(zz) / fsp * 6.0));
      s.N = normalize(s.N + vec3(0.0, 0.0, dish));
      // the wet line and growth: the water's surface is world y = 0
      float wy = P.y;
      float wet = (1.0 - smoothstep(0.0, 0.35 + 0.15 * vnoise(vec2(zz * 0.8, 1.0)), wy)) * step(-0.05, wy);
      c = mix(c, c * vec3(0.55, 0.62, 0.58), wet * 0.8);
      c = mix(c, vec3(0.14, 0.17, 0.12), (1.0 - smoothstep(-0.6, -0.05, wy)) * 0.6);
      // the slime line itself: a thin pale green-white band right at the water (photo 10)
      c = mix(c, vec3(0.42, 0.47, 0.38), line1(wy, 0.06, 0.07) * 0.5);
      // rust weeping (S5: a few flat-edged streaks, one per drip line): from the freeing ports' slots at deck level in the
      // well decks, one in three, and longer ones under the closed chocks and the hawse pipes; the 2012 repaint keeps the
      // rest of her side clean (ship.md §8)
      float c2 = floor(zz / 5.5), h2 = hash11(c2 * 2.3 + vSide * 3.0);
      float rs = streakDown(vec2(zz, g), vec2((c2 + 0.5) * 5.5 + (h2 - 0.5) * 1.2, -0.02), 0.035 + 0.03 * h2, 0.6 + 2.6 * h2 * h2, sd) * step(0.66, h2) * step(abs(zz), 52.0);
      for (int i = 0; i < 16; i++) {
        if (float(i) >= uChockN) break;
        vec4 ck = uChock[i];
        rs = max(rs, streakDown(vec2(zz, S.y), vec2(ck.x + 0.12 * (hash11(float(i) + vSide) - 0.5), ck.y - ck.w), 0.05, 1.2 + 2.2 * hash11(float(i) * 3.1 + vSide), sd));
      }
      // the hawse pipes (~40 ft ABL, just aft of the stem): a broad weep down the bow each side
      rs = max(rs, streakDown(vec2(zz, S.y), vec2(uHawse.x, uHawse.y - 0.45), 0.16, 3.6, sd) * step(0.0, 1.0));
      // dark smudges above the boot-top where tugs and fenders have worked (photo 01)
      float smudge = smoothstep(0.55, 0.8, vnoise(vec2(zz * 0.35, S.y * 2.0) + vSide * 7.0)) * smoothstep(4.9, 5.1, S.y) * (1.0 - smoothstep(5.4, 6.3, S.y));
      c = mix(c, c * 0.62, smudge * 0.7);
      c = mix(c, mix(uRust, uRustD, 0.4 * step(0.5, fract(zz * 3.1))), clamp(rs, 0.0, 1.0) * 0.55);
      // fender scuffs on the pier's side (starboard): dark smears where the hull has worked against the fenders and
      // camels, world height 0.4-2.6 m (ship.md §8)
      float scuff = step(0.5, vSide) * smoothstep(0.2, 0.6, wy) * (1.0 - smoothstep(2.2, 2.8, wy));
      scuff *= smoothstep(0.25, 0.6, vnoise(vec2(zz * 0.18, wy * 1.1)) * 0.5 + 0.5) * step(0.4, hash11(floor(zz / 7.5) + 2.0));
      c = mix(c, c * vec3(0.55, 0.53, 0.52), scuff * 0.8);
      // her markings: names, draft marks, the load line (marks.js), white paint a little worn
      float mk = hullMarks(S, g, vSide, s.N);
      c = mix(c, uLetter * (0.92 + 0.08 * vnoise(vec2(zz * 9.0, S.y * 9.0))), mk * 0.96);
      s.albedo = c; s.rough = 0.62;
    `,
  });
  // ---- the bulwark's inside face: the same grey, rust at its foot where water stands in the waterway
  M.bulwarkIn = shipMat(world, {
    name: 'bulwark inside', lines: 1, chocks: 'inner', lamps: false, uniforms: Object.assign(C('uGrey', PAINT.grey), C('uRust', PAINT.rust)),
    glsl: 'uniform vec3 uGrey, uRust;',
    body: /* glsl */`
      float h = uv.y;                                         // height above the deck
      vec3 c = uGrey * (0.96 + 0.04 * steps3(vnoise(vec2(S.z * 0.2, 3.0)), -0.2, 0.3));
      float foot = (1.0 - smoothstep(0.0, 0.08 + 0.1 * (vnoise(vec2(S.z * 1.3, 1.0)) * 0.5 + 0.5), h));
      c = mix(c, uRust, foot * 0.55);
      s.albedo = c; s.rough = 0.65;
    `,
  });
  // ---- the weather deck: light grey painted steel (no planking), plate seams, non-skid walkways, the waterway's rust
  M.deck = shipMat(world, {
    name: 'deck', lines: 2, lamps: false,
    uniforms: Object.assign(C('uDeck', PAINT.deck), C('uRust', PAINT.rust), C('uDark', '#8a8e93'), { uHatch: { value: place.hatches.map(h => new T.Vector4(h[0], h[1], h[2], 0)) } }),
    glsl: 'uniform vec3 uDeck, uRust, uDark; uniform vec4 uHatch[5];',
    body: /* glsl */`
      float ax = abs(S.x), zz = S.z;
      float edge = uv.y;                                      // distance in from the deck edge (m)
      float tone = steps3(fbm(vec2(zz * 0.05, S.x * 0.12) + sd * 4.0, 3), -0.15, 0.2);
      vec3 c = mix(uDark, uDeck, 0.55 + 0.45 * tone);
      // deck plating: strakes fore and aft every 1.83 m, butts staggered every 6.1 m
      float sk = floor(ax / 1.83);
      float seam = max(lines1(ax, 1.83, 0.025), lines1(zz + mod(sk, 2.0) * 3.05, 6.1, 0.025));
      c *= 1.0 - 0.18 * seam;
      // non-skid: rougher, darker walkway strips along each side inside the waterway and round the hatches
      float walk = step(0.9, edge) * step(edge, 2.1) * step(0.45, vnoise(vec2(zz * 0.07, 2.0)) * 0.5 + 0.5);
      c = mix(c, c * 0.88, walk);
      // scuffs and footwear grey where people walk (centre and the sides)
      c *= 1.0 - 0.07 * smoothstep(0.2, 0.7, vnoise(vec2(zz * 0.4, S.x * 0.9)) * 0.5 + 0.5);
      // the waterway: rust and standing-water stains along the bulwark's foot
      float ww = 1.0 - smoothstep(0.05, 0.35 + 0.2 * (vnoise(vec2(zz * 0.6, 4.0)) * 0.5 + 0.5), edge);
      c = mix(c, mix(uRust, c * 0.7, 0.4), ww * 0.65);
      // rust and grime at the foot of the hatch coamings (water stands against them; photos 27, 28)
      float dmin = 99.0;
      for (int i = 0; i < 5; i++) { vec4 hr = uHatch[i]; vec2 q = abs(vec2(S.x, S.z - hr.y)) - vec2(hr.x, hr.z); dmin = min(dmin, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0)); }
      float foot = (1.0 - smoothstep(0.0, 0.12 + 0.18 * (vnoise(vec2(S.z * 1.7, S.x * 1.7)) * 0.5 + 0.5), dmin)) * step(0.0, dmin);
      c = mix(c, mix(uRust, c * 0.6, 0.45), foot * 0.6);
      s.albedo = c; s.rough = 0.8;
    `,
  });
  // ---- the house decks (boat, bridge, top of house; platforms): the deck's paint with no waterway (their uv is plan
  // x, z), a darker scuffed walkway round the house, the underside painted grey like the house (it's seen from the side
  // passages)
  M.hdeck = shipMat(world, {
    name: 'house deck', lines: 2, lamps: false,
    uniforms: Object.assign(C('uDeck', PAINT.deck), C('uDark', '#8a8e93'), C('uGrey', PAINT.grey)),
    glsl: 'uniform vec3 uDeck, uDark, uGrey;',
    body: /* glsl */`
      float tone = steps3(fbm(vec2(S.z * 0.05, S.x * 0.12) + sd * 4.0, 3), -0.15, 0.2);
      vec3 c = mix(uDark, uDeck, 0.55 + 0.45 * tone);
      c *= 1.0 - 0.16 * max(lines1(abs(S.x), 1.83, 0.025), lines1(S.z + mod(floor(abs(S.x) / 1.83), 2.0) * 3.05, 6.1, 0.025));
      c *= 1.0 - 0.07 * smoothstep(0.2, 0.7, vnoise(vec2(S.z * 0.4, S.x * 0.9)) * 0.5 + 0.5);
      if (s.N.y < -0.5) c = uGrey * 0.96;
      else if (abs(s.N.y) < 0.5) c = uGrey;
      s.albedo = c; s.rough = 0.8;
    `,
  });
  // ---- the houses, coamings, platforms and tubs: the same grey as the hull (ship.md §8), panel seams, grime at the
  // foot, rust from the fittings; uv in metres (geom.js)
  M.steel = shipMat(world, {
    name: 'superstructure', lines: 1, lamps: false, uniforms: Object.assign(C('uGrey', PAINT.grey), C('uRust', PAINT.rust)),
    glsl: 'uniform vec3 uGrey, uRust;',
    body: /* glsl */`
      float tone = steps3(fbm(uv * vec2(0.15, 0.3) + sd * 7.0, 3), -0.18, 0.22);
      vec3 c = uGrey * (0.94 + 0.06 * tone);
      // weld seams on the house sides (vertical every 1.83 m), faint
      float vert = abs(s.N.y) < 0.5 ? 1.0 : 0.0;
      c *= 1.0 - 0.14 * lines1(uv.x + sd * 5.0, 1.83, 0.02) * vert;
      // rust weeping: a few streaks per surface from bolts and fittings near the top of each wall
      float cell = floor(uv.x / 1.6 + sd * 11.0), hz = hash11(cell * 3.7 + sd * 29.0);
      float rs = streakDown(vec2(uv.x, -uv.y), vec2((cell - sd * 11.0 + 0.5) * 1.6, -uv.y + (-uv.y) * 0.0 - 0.0), 0.03, 0.6 + 1.4 * hz, sd);
      rs = streakDown(vec2(mod(uv.x, 1.6), 9.0 - uv.y), vec2(0.8, 9.0 - (2.3 + 0.4 * hz)), 0.03, 0.4 + 1.6 * hz, sd) * step(0.62, hz) * vert;
      c = mix(c, uRust, clamp(rs, 0.0, 1.0) * 0.6);
      s.albedo = c; s.rough = 0.65;
    `,
  });
  // ---- glass: portholes, the wheelhouse windows, the engine-room skylight. By day dark with the sky in it; at night about
  // half of them lit warm from inside (the museum's crew quarters, the galley, the engine room under the skylight), each
  // its own by its seed, crisp with no halo (style.md K3/rule 8)
  M.glass = shipMat(world, {
    name: 'house glass', lines: 1, lamps: false, uniforms: Object.assign(C('uWarm', '#ffc27a'), C('uCool', '#cfe0ff')),
    glsl: 'uniform vec3 uWarm, uCool;',
    body: `vec3 c = vec3(0.035, 0.045, 0.06);
      float on = smoothstep(0.2, 0.6, uNight);
      float lit = step(fract(sd * 7.31 + 0.13), 0.58);
      vec3 hue = fract(sd * 3.7) < 0.15 ? uCool : uWarm;
      // (anime portholes: near-black discs, S4; no sky mirror, which read them as grey rings)
      s.albedo = c; s.rough = 0.3; s.spec = 0.25; s.env = 0.0; s.rim = 0.0;
      s.emissive += hue * lit * on * (0.55 + 0.45 * fract(sd * 13.1)) * 1.6;`,
  });
  // ---- plastic armour (ship.md §5: tan slab-textured splinter protection on the bridge wings and the pillboxes; photos
  // 05, 06, 25, 26): slabs ~0.9 x 0.6 m with dark joints, a mottled tan
  M.armour = shipMat(world, {
    name: 'plastic armour', lines: 1, lamps: false, uniforms: Object.assign(C('uTan', '#a8946c'), C('uTan2', '#8f7c58')),
    glsl: 'uniform vec3 uTan, uTan2;',
    body: `vec2 q = vec2(uv.x / 0.9, uv.y / 0.6); vec2 cell = floor(q + vec2(0.5 * mod(floor(q.y), 2.0), 0.0));
      float tone = hash12(cell + sd * 5.0);
      vec3 c = mix(uTan2, uTan, 0.45 + 0.55 * tone) * (0.94 + 0.06 * vnoise(uv * 6.0));
      float jx = lines1(uv.x + 0.45 * mod(floor(q.y), 2.0), 0.9, 0.025), jy = lines1(uv.y, 0.6, 0.025);
      c *= 1.0 - 0.35 * max(jx, jy);
      s.albedo = c; s.rough = 0.85;`,
  });
  // ---- doors: the same haze grey a shade darker (repainted on their own), rust weeping from the dogs and the sill
  M.door = shipMat(world, {
    name: 'doors', lines: 1, lamps: false, uniforms: Object.assign(C('uGrey', PAINT.grey), C('uRust', PAINT.rust)),
    glsl: 'uniform vec3 uGrey, uRust;',
    body: `vec3 c = uGrey * 0.84 * (0.96 + 0.04 * vnoise(uv * 3.0 + sd * 9.0));
      c = mix(c, uRust, step(0.82, vnoise(uv * vec2(14.0, 3.0) + 7.0)) * 0.35);
      s.albedo = c; s.rough = 0.6;`,
  });
  M.boot = shipMat(world, { name: 'black paint', lines: 1, uniforms: C('uC', PAINT.black), glsl: 'uniform vec3 uC;', body: 's.albedo = uC; s.rough = 0.5;' });
  // the bow tub's white front with its art (marks.js row D), mapped along the tub's front (uv: m along, m up)
  M.white = shipMat(world, { name: 'bow tub front', lines: 1, uniforms: Object.assign(C('uC', PAINT.white), { uMarks: MU.uMarks, uTubLen: { value: place.tubLen }, uTubH: { value: place.tubH } }),
    glsl: 'uniform vec3 uC; uniform sampler2D uMarks; uniform float uTubLen, uTubH;',
    body: `vec3 c = uC * (0.95 + 0.05 * steps3(vnoise(uv * 0.7), -0.2, 0.3));
      float t = 1.0 - uv.y / uTubH, u = uv.x / uTubLen;
      if (u >= 0.0 && u <= 1.0 && t >= 0.0 && t <= 1.0 && s.N.z < -0.15) { vec4 a = texture2D(uMarks, vec2(u, 1.0 - mix(512.0, 1024.0, t) / 1024.0)); c = mix(c, pow(a.rgb, vec3(2.2)), a.a); }
      s.albedo = c; s.rough = 0.6;` });
  M.bronze = shipMat(world, { name: 'propeller bronze', lines: 1, uniforms: C('uC', PAINT.bronze), glsl: 'uniform vec3 uC;', body: 'vec3 c = uC; c = mix(c, vec3(0.12, 0.16, 0.1), (1.0 - smoothstep(-1.0, 0.0, P.y)) * 0.6); s.albedo = c; s.rough = 0.4; s.spec = 0.3;' });
  M.underwater = shipMat(world, { name: 'stern frame', lines: 1, uniforms: Object.assign(C('uRed', PAINT.bottom), C('uBoot', PAINT.boot), C('uGrey', PAINT.grey), { uBands: { value: new T.Vector2(BANDS.red, BANDS.black) } }),
    glsl: 'uniform vec3 uRed, uBoot, uGrey; uniform vec2 uBands;',
    body: 'vec3 c = S.y < uBands.y ? (S.y < uBands.x ? uRed : uBoot) : uGrey; c = mix(c, vec3(0.14, 0.17, 0.12), (1.0 - smoothstep(-0.6, -0.05, P.y)) * 0.6); s.albedo = c; s.rough = 0.7;' });
  return M;
}
