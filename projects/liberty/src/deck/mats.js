// liberty/src/deck/mats.js: the deck fittings' materials (B2). Anime rules (research/style.md §3, §7): steel in flat
// tones (lit albedo from ship.md rule 17's haze grey #7A838A; the engine's designed shade and outlines do the rest),
// detail drawn as lines and flat-edged decals, rust as 2-3 hard-edged weeps a surface (S5, hue ~28-42 deg), more of it
// where ship.md §8 saw it (raft racks, winch drums, boom heels, hatch fittings). Wires and rigging are drawn at least a
// set number of pixels wide (style.md S6, rule 5: rigging ~2 px at 1280, 0.16 % of the frame's width), so a stay 60 m
// off reads as the line anime draws instead of aliasing away; close to, its true radius wins.
// Colours: ship.md §8 (sampled from the photos; rule 17's toon palette), show.md (brass, the guns' bands).
import { lin } from 'scene3d/util.js';

const T = window.THREE;
const v3 = c => new T.Vector3(...lin(c));
const SEED_V = /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObjN = N; }`;
const SEED_VARY = 'varying float vSeed; varying vec3 vObjN;';

export const DECK_GLSL = /* glsl */`
float aaW(float x) { return max(fwidth(x), 1e-4); }
float lines1(float x, float period, float w) {
  float f = abs(fract(x / period + 0.5) - 0.5) * period, a = aaW(x);
  return (1.0 - smoothstep(w * 0.5 - a, w * 0.5 + a, f)) * (1.0 - smoothstep(period * 0.25, period * 0.5, a * 2.0));
}
float steps3(float v, float a, float b) { return v < a ? 0.0 : (v < b ? 0.5 : 1.0); }
// a hard-edged rust weep hanging from 'at' (u along, v up; metres): tapering, slightly wandering
float streak(vec2 uv, vec2 at, float w, float len, float sd) {
  vec2 d = uv - at; if (d.y > 0.02 || d.y < -len) return 0.0;
  float t = -d.y / len, wob = 0.25 * sin(d.y * 7.0 + sd * 40.0) * w;
  float hw = w * (1.0 - 0.8 * t);
  return 1.0 - smoothstep(hw - aaW(d.x), hw + aaW(d.x), abs(d.x + wob));
}
// a surface's 2D coordinates: tops by plan, sides by (along, height): decals sit right on both
vec2 surf2(vec3 P, vec3 N) {
  if (abs(N.y) > 0.7) return P.xz;
  vec2 t = normalize(vec2(-N.z, N.x) + vec2(1e-5));
  return vec2(dot(P.xz, t), P.y);
}
`;

// a material from a surface body (GLSL statements with s, P, V, uv, sd, N0 (the vertex normal) in scope)
export function deckMat(world, { name, lines = 1, uniforms = {}, glsl = '', body, double = false, transparent = false, depthWrite, blending, cast, vertex, varyings, noFog }) {
  return world.mat({
    name, lines, double, transparent, depthWrite, blending, cast, noFog,
    uniforms, varyings: varyings || SEED_VARY, vertex: vertex || SEED_V,
    surface: /* glsl */`
      ${DECK_GLSL}
      ${glsl}
      void smain(inout Surface s, vec3 P, vec3 V) {
        float sd = vSeed; vec2 uv = vUv; vec3 N0 = normalize(vObjN);
        ${body}
      }`,
  });
}

// painted steel: the haze grey over decades of repainting (touch-up patches of a slightly different grey, flat-edged),
// chips to the primer, rust weeping in hard-edged streaks, grime. wear: x rust, y grime, z touch-ups, w chips.
// local: patterns keyed to the mesh's own uv (moving parts: the guns), not the world
function steelBody(local) {
  return /* glsl */`
    vec2 q = ${local ? 'uv' : 'surf2(P, N0)'};
    vec3 c = uPaint * (0.955 + 0.09 * hash11(sd * 97.13));
    // repainting: flat-edged patches of a fresher or older grey
    vec2 pc = floor(q / vec2(1.7, 1.1) + sd * 13.0); float ph = hash12(pc);
    vec2 pf = fract(q / vec2(1.7, 1.1) + sd * 13.0);
    float pat = step(1.0 - 0.22 * uWear.z, ph) * step(0.1 + 0.3 * hash12(pc + 2.0), pf.x) * step(pf.x, 0.9) * step(0.15, pf.y) * step(pf.y, 0.6 + 0.35 * hash12(pc + 5.0));
    c *= mix(1.0, 0.9 + 0.2 * hash12(pc + 9.0), pat);
    // chips: small flat flakes showing the red-brown primer or rust
    vec2 cc = floor(q * 11.0); float ch = step(1.0 - 0.006 * uWear.w, hash12(cc + floor(sd * 31.0)));
    float chipShape = 1.0 - smoothstep(0.25, 0.4, length(fract(q * 11.0) - 0.5));
    float near = 1.0 - smoothstep(0.03, 0.09, aaW(q.x * 11.0) + aaW(q.y * 11.0));      // (only where a chip is pixels wide)
    c = mix(c, mix(uPaint * 0.55, uRust, 0.6), ch * chipShape * near);
    // rust weeps on vertical faces: from fittings and seams, 2-3 a surface (S5)
    float vert = 1.0 - smoothstep(0.5, 0.75, abs(N0.y));
    vec2 rc = vec2(${local ? 'q.x' : 'q.x'} / 1.1, q.y / 1.6);
    vec2 ci = floor(rc); float rh = hash12(ci + 17.0 + floor(sd * 7.0));
    float rs = streak(vec2(fract(rc.x) * 1.1, fract(rc.y) * 1.6), vec2(0.2 + 0.7 * hash12(ci + 3.0), 1.55), 0.02 + 0.03 * hash12(ci + 4.0), 0.35 + 0.9 * hash12(ci + 6.0), sd)
       * step(1.0 - 0.35 * uWear.x, rh) * vert;
    c = mix(c, uRust, clamp(rs, 0.0, 1.0) * 0.8);
    // rust blooms on tops (where water sits) for the most weathered fittings
    float top = smoothstep(0.6, 0.9, N0.y);
    float bloom = step(0.86, vnoise(q * 3.1 + sd * 9.0) * 0.5 + 0.5) * top * smoothstep(0.4, 0.9, uWear.x);
    c = mix(c, uRust * 0.9, bloom * 0.7);
    // grime: a flat darker tone in the low field
    c *= 1.0 - 0.10 * uWear.y * steps3(fbm(q * 0.6 + sd * 5.0, 3), 0.1, 0.35);
    s.albedo = c; s.rough = 0.55; s.spec = 0.12;
  `;
}
const steelU = (paint, rust, wear) => ({ uPaint: { value: v3(paint) }, uRust: { value: v3(rust) }, uWear: { value: new T.Vector4(...wear) } });

// the wire: true radius aR, drawn at least uWirePx pixels wide; aTone picks the wire's look (0 tarred standing
// rigging, 1 galvanised running wire, 2 weathered copper aerial, 3 manila, 4 white synthetic, 5 yellow synthetic,
// 6 chain (dark, lumpy), 7 dark tarred hemp)
const WIRE_V = /* glsl */`
attribute float aSeed; attribute float aR; attribute float aTone;
uniform float uWirePx;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  vSeed = aSeed; vTone = aTone; vObjN = N;
  vec3 C = P - N * aR;
  bool ortho = projectionMatrix[3][3] > 0.5;
  float d = ortho ? 1.0 : distance(cameraPosition, C);
  float px = 2.0 * d / (projectionMatrix[1][1] * uResolution.y);
  float r = max(aR, 0.5 * uWirePx * px);
  vWiden = r / max(aR, 1e-5);
  P = C + N * r;
}`;

export function deckMats(world) {
  const M = {};
  const C = (name, hex) => ({ [name]: { value: v3(hex) } });
  const PAINT = '#7A838A', RUST = '#7d6248';           // rust: S5's weathered ochre-brown (hue ~30 deg, S ~0.42), not orange
  // haze grey steel: light wear (the museum keeps her painted: the 2012 dry-docking repainted the hull; deck gear less)
  M.steel = deckMat(world, { name: 'deck steel', uniforms: steelU(PAINT, RUST, [0.35, 0.5, 0.6, 0.6]), glsl: 'uniform vec3 uPaint, uRust; uniform vec4 uWear;', body: steelBody(false) });
  // weathered: winch drums, raft racks, boom heels, hatch fittings (ship.md §8: rust there)
  M.steelOld = deckMat(world, { name: 'deck steel (weathered)', uniforms: steelU('#77818a', RUST, [0.9, 0.8, 0.8, 1.0]), glsl: 'uniform vec3 uPaint, uRust; uniform vec4 uWear;', body: steelBody(false) });
  // the guns: the same grey, patterns on their own uv (they train and elevate)
  M.gunSteel = deckMat(world, { name: 'gun steel', uniforms: steelU('#7d868d', RUST, [0.45, 0.4, 0.5, 0.8]), glsl: 'uniform vec3 uPaint, uRust; uniform vec4 uWear;', body: steelBody(true) });
  // white (the bow tub's painted front is the hull's; this is for the boats' davit heads, signs, the bell's lanyard)
  M.white = deckMat(world, { name: 'deck white paint', uniforms: steelU('#dfe0dc', RUST, [0.25, 0.4, 0.3, 0.5]), glsl: 'uniform vec3 uPaint, uRust; uniform vec4 uWear;', body: steelBody(false) });
  // black: the gun's barrel band, rubber, the funnel-black of lamp housings
  M.black = deckMat(world, { name: 'deck black', uniforms: C('uA', '#1d2024'), glsl: 'uniform vec3 uA;', body: 's.albedo = uA * (0.9 + 0.2 * hash11(sd * 41.0)); s.rough = 0.45; s.spec = 0.25;' });
  M.gunBlack = deckMat(world, { name: 'gun black band', uniforms: C('uA', '#1a1c20'), glsl: 'uniform vec3 uA;', body: 's.albedo = uA; s.rough = 0.4; s.spec = 0.3;' });
  // red-brown oxide: the muzzle's ring (photos 34, 35), primer
  M.oxide = deckMat(world, { name: 'red oxide', uniforms: C('uA', '#7a3a22'), glsl: 'uniform vec3 uA;', body: 's.albedo = uA * (0.9 + 0.2 * vnoise(uv * 20.0)); s.rough = 0.8;' });
  // bare worn steel: the gun's bore face, the winch drums' wire-polished barrels, the warping heads' rope grooves
  M.bare = deckMat(world, { name: 'bare steel', uniforms: C('uA', '#8d9196'), glsl: 'uniform vec3 uA;', body: 's.albedo = uA * (0.85 + 0.25 * steps3(vnoise(uv * vec2(3.0, 9.0) + sd * 7.0), -0.2, 0.3)); s.rough = 0.35; s.spec = 0.5;' });
  // brass: the spent cases, the bell, the lamps' fittings (photo 09 of show refs: the cases' warm yellow)
  M.brass = deckMat(world, { name: 'brass', uniforms: C('uA', '#c09442'), glsl: 'uniform vec3 uA;', body: 's.albedo = uA * (0.92 + 0.12 * hash11(sd * 53.0)); s.rough = 0.25; s.spec = 0.9;' });
  // green canvas: the hatch tarpaulins (ship.md §8: #769396 in sun; the toon tarp #3F6E66), panels sewn every ~1.5 m,
  // faded where the sun sits, stained, patched; the folds at the corners
  M.tarp = deckMat(world, {
    name: 'hatch tarp', uniforms: Object.assign(C('uA', '#3f6e66'), C('uB', '#4f7f75'), C('uS', '#2c4a45'), C('uP', '#5a7a5a')),
    glsl: 'uniform vec3 uA, uB, uS, uP;',
    body: /* glsl */`
      vec2 q = uv;
      float tone = steps3(fbm(q * 0.35 + sd * 3.0, 3), -0.05, 0.3);
      vec3 c = mix(uA, uB, tone * 0.7 * smoothstep(0.3, 0.8, N0.y));         // sun-faded tops
      c *= 1.0 - 0.12 * lines1(q.x, 1.52, 0.025);                            // the panels' seams
      float stain = step(0.62, fbm(q * 0.8 + sd * 11.0, 3)) * 0.35;           // water and rust stains (flat)
      c = mix(c, uS, stain);
      vec2 pc = floor(q / vec2(1.3, 0.9) + sd * 5.0); float ph = hash12(pc);   // sewn patches
      vec2 pf = fract(q / vec2(1.3, 0.9) + sd * 5.0);
      float pat = step(0.93, ph) * step(0.2, pf.x) * step(pf.x, 0.75) * step(0.25, pf.y) * step(pf.y, 0.8);
      c = mix(c, uP, pat * 0.7);
      s.albedo = c; s.rough = 0.95;
    `,
  });
  // weathered timber: hatch wedges, boat chocks, benches, the battens' wedges
  M.wood = deckMat(world, { name: 'deck timber', uniforms: C('uA', '#8a7356'), glsl: 'uniform vec3 uA;', body: 'vec3 c = uA * (0.8 + 0.3 * hash11(sd * 71.0)); c *= 1.0 - 0.18 * lines1(uv.y, 0.035, 0.004); s.albedo = c; s.rough = 0.9;' });
  // the lifeboats: light grey-white hulls with a darker gunwale band (ship.md §7), their canvas covers
  M.boat = deckMat(world, { name: 'lifeboat', uniforms: steelU('#d6d8d4', RUST, [0.45, 0.6, 0.4, 0.5]), glsl: 'uniform vec3 uPaint, uRust; uniform vec4 uWear;', body: steelBody(false) });
  M.cover = deckMat(world, {
    name: 'boat cover', uniforms: C('uA', '#9aa29a'), glsl: 'uniform vec3 uA;',
    body: 'vec3 c = uA * (0.9 + 0.12 * steps3(fbm(uv * 0.6 + sd * 4.0, 3), 0.0, 0.3)); c *= 1.0 - 0.1 * lines1(uv.x, 0.9, 0.02); s.albedo = c; s.rough = 0.95;',
  });
  // rope (lay stripes): manila, white and yellow synthetics; per-vertex tone like the wires'
  M.rope = deckMat(world, {
    name: 'rope', lines: 1,
    varyings: SEED_VARY + ' varying float vTone;', vertex: /* glsl */`attribute float aSeed; attribute float aTone; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObjN = N; vTone = aTone; }`,
    body: /* glsl */`
      vec3 c = vTone < 3.5 ? vec3(0.50, 0.40, 0.25) : (vTone < 4.5 ? vec3(0.78, 0.77, 0.72) : (vTone < 5.5 ? vec3(0.80, 0.66, 0.20) : vec3(0.25, 0.28, 0.42)));
      float lay = fract(uv.x * 9.0 + uv.y * 4.0);
      c *= 0.82 + 0.18 * step(0.5, lay);
      s.albedo = c * (0.9 + 0.15 * hash11(sd * 37.0)); s.rough = 0.95;
    `,
  });
  // wires: see WIRE_V. No outline (the line is the rigging: style.md S6), no shadow (thin)
  M.wire = deckMat(world, {
    name: 'rigging wire', lines: 0, cast: false,
    uniforms: { uWirePx: { value: 1.6 } },
    glsl: 'uniform float uWirePx;',
    varyings: SEED_VARY + ' varying float vTone; varying float vWiden;', vertex: WIRE_V,
    body: /* glsl */`
      float tn = floor(vTone + 0.5);
      // (photo 01 against its solved camera: her wires read as dark lines against the sky, the running wire a little
      // lighter than the tarred standing rigging; anime draws them as the darkest tone: style.md S6)
      vec3 c = tn < 0.5 ? vec3(0.045, 0.048, 0.054) : (tn < 1.5 ? vec3(0.12, 0.125, 0.13) : (tn < 2.5 ? vec3(0.15, 0.11, 0.08)
             : (tn < 3.5 ? vec3(0.50, 0.40, 0.25) : (tn < 4.5 ? vec3(0.76, 0.75, 0.70) : (tn < 5.5 ? vec3(0.80, 0.66, 0.20) : (tn < 6.5 ? vec3(0.12, 0.12, 0.13) : vec3(0.09, 0.08, 0.07)))))));
      // close to: the lay of the strands
      c *= 0.86 + 0.14 * step(0.5, fract(uv.x * 14.0 + uv.y * 6.0)) * (1.0 - smoothstep(1.5, 3.0, vWiden));
      s.albedo = c; s.rough = tn < 2.5 ? 0.5 : 0.9; s.spec = tn < 2.5 ? 0.2 : 0.0; s.rim = 0.0;
    `,
  });
  // lamp lenses and glass: emissive at night (on by uNight), a coloured lens by day
  const lamp = (name, hex, k, dayHex) => deckMat(world, {
    name, lines: 0, uniforms: Object.assign(C('uC', hex), C('uD', dayHex || hex), { uK: { value: k } }), glsl: 'uniform vec3 uC, uD; uniform float uK;',
    body: 'float on = smoothstep(0.25, 0.55, uNight); s.albedo = mix(uD * 0.6, uD * 0.15, on); s.emissive = uC * uK * on; s.rough = 0.2; s.spec = 0.6;',
  });
  M.lampWarm = lamp('lamp warm', '#ffcf8a', 6.0, '#d8d2c0');
  M.lampWhite = lamp('lamp white', '#f2f0e6', 7.0, '#dcdcd6');
  M.lampRed = lamp('lamp red', '#ff3a26', 5.0, '#a83026');
  M.lampGreen = lamp('lamp green', '#2bff7a', 5.0, '#2f8a55');
  M.lampOff = lamp('lamp dark', '#000000', 0.0, '#b8c0c4');     // a lens that isn't lit tonight (nav lights: she's moored)
  M.porthole = lamp('window warm', '#ffc27a', 1.6, '#30383e');
  // life rings: orange with four white bands (uv.x round the ring)
  M.lifering = deckMat(world, { name: 'life ring', uniforms: Object.assign(C('uA', '#e0521c'), C('uB', '#e8e6df')), glsl: 'uniform vec3 uA, uB;', body: 's.albedo = step(0.75, fract(uv.x * 4.0 + 0.125)) > 0.5 ? uB : uA; s.rough = 0.6; s.spec = 0.2;' });
  // the flags: signal flags (International Code, by aFlag), the ensign and the jack; cloth flutters in the wind
  M.flag = flagMat(world);
  return M;
}

// ---- flags: a grid of cloth, uv 0..1 (u from the hoist to the fly, v from the head down), aFlag the flag's code:
// 0-25 the letters A-Z, 26 the US ensign, 27 the US jack, 28-37 numeral pennants 0-9 (tapered), 38 the museum's house
// flag (blue with the white Liberty L), aFly (the cloth's free direction: the wind's side), aPh (phase)
const FLAG_V = /* glsl */`
attribute float aSeed; attribute float aFlag; attribute float aPh; attribute vec3 aFly;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  vSeed = aSeed; vFlag = aFlag; vObjN = N;
  // the flutter: a wave running from the hoist to the fly, its amplitude growing toward the fly (the cloth is held at
  // the hoist); the wind's gusts (uWind.z) lift it
  float u = uv.x;
  float w = sin(u * 7.0 - uTime * 6.3 + aPh * 6.28) * 0.6 + sin(u * 13.0 - uTime * 10.1 + aPh * 3.0) * 0.25;
  float amp = 0.10 * u * (0.7 + 0.5 * uWind.z);
  P += N * w * amp + aFly * (0.04 * u * sin(uTime * 2.1 + aPh * 5.0));
}`;
function flagMat(world) {
  return deckMat(world, {
    name: 'flags', lines: 1, double: true,
    varyings: 'varying float vSeed; varying vec3 vObjN; varying float vFlag;', vertex: FLAG_V,
    body: /* glsl */`
      float f = floor(vFlag + 0.5);
      float x = uv.x, y = uv.y;               // x hoist -> fly, y head -> foot
      vec3 R = vec3(0.72, 0.06, 0.07), W = vec3(0.86, 0.86, 0.84), Bl = vec3(0.04, 0.10, 0.42), Y = vec3(0.92, 0.72, 0.05), K = vec3(0.03, 0.03, 0.04);
      vec3 c = W;
      // swallowtails (A, B) and pennants: cut by discard
      if ((f == 0.0 || f == 1.0) && x > 0.75 && abs(y - 0.5) < (x - 0.75) * 2.0) discard;
      if (f >= 28.0 && f <= 37.0 && abs(y - 0.5) > 0.5 * (1.0 - x * 0.85)) discard;
      float cx = x - 0.5, cy = y - 0.5;
      if (f == 0.0) c = x < 0.5 ? W : Bl;
      else if (f == 1.0) c = R;
      else if (f == 2.0) { float k = floor(y * 5.0); c = k == 0.0 || k == 4.0 ? Bl : (k == 2.0 ? R : W); }
      else if (f == 3.0) c = (y > 0.25 && y < 0.75) ? Bl : Y;
      else if (f == 4.0) c = y < 0.5 ? Bl : R;
      else if (f == 5.0) c = abs(cx) + abs(cy) < 0.36 ? R : W;
      else if (f == 6.0) c = mod(floor(x * 6.0), 2.0) < 0.5 ? Y : Bl;
      else if (f == 7.0) c = x < 0.5 ? W : R;
      else if (f == 8.0) c = length(vec2(cx * 1.5, cy)) < 0.27 ? K : Y;
      else if (f == 9.0) c = (y > 0.333 && y < 0.667) ? W : Bl;
      else if (f == 10.0) c = x < 0.5 ? Y : Bl;
      else if (f == 11.0) c = ((x < 0.5) == (y < 0.5)) ? Y : K;
      else if (f == 12.0) c = (abs(cx * 0.667 - cy * 1.0) < 0.09 || abs(cx * 0.667 + cy) < 0.09) ? W : Bl;
      else if (f == 13.0) c = mod(floor(x * 4.0) + floor(y * 4.0), 2.0) < 0.5 ? Bl : W;
      else if (f == 14.0) c = (x * 1.0 + (1.0 - y)) > 1.0 ? Y : R;
      else if (f == 15.0) c = (abs(cx) < 0.17 && abs(cy) < 0.17) ? W : Bl;
      else if (f == 16.0) c = Y;
      else if (f == 17.0) c = (abs(cx) < 0.09 || abs(cy) < 0.11) ? Y : R;
      else if (f == 18.0) c = (abs(cx) < 0.17 && abs(cy) < 0.17) ? Bl : W;
      else if (f == 19.0) c = x < 0.333 ? R : (x < 0.667 ? W : Bl);
      else if (f == 20.0) c = ((x < 0.5) == (y < 0.5)) ? R : W;
      else if (f == 21.0) c = (abs(cx * 0.667 - cy) < 0.09 || abs(cx * 0.667 + cy) < 0.09) ? R : W;
      else if (f == 22.0) { float m = max(abs(cx), abs(cy)); c = m > 0.33 ? Bl : (m > 0.17 ? W : R); }
      else if (f == 23.0) c = (abs(cx) < 0.09 || abs(cy) < 0.11) ? Bl : W;
      else if (f == 24.0) c = mod(floor((x + y) * 5.0), 2.0) < 0.5 ? Y : R;
      else if (f == 25.0) { c = (abs(cy) > abs(cx * 0.667)) ? (cy < 0.0 ? K : R) : (cx < 0.0 ? Y : Bl); }
      else if (f == 26.0) {
        // the US ensign: 13 stripes, the canton over 7 of them with its stars as white dots (5-4 rows)
        float st = floor(y * 13.0); c = mod(st, 2.0) < 0.5 ? R : W;
        if (x < 0.40 && y < 7.0 / 13.0) {
          c = Bl;
          vec2 g = vec2(x / 0.40 * 12.0, y / (7.0 / 13.0) * 10.0);
          vec2 gi = floor(g), gf = fract(g) - 0.5;
          if (mod(gi.x + gi.y, 2.0) < 0.5 && gi.x > 0.0 && gi.x < 11.0 && gi.y > 0.0 && gi.y < 9.0 && length(gf) < 0.42) c = W;
        }
      }
      else if (f == 27.0) { c = Bl; vec2 g = vec2(x * 12.0, y * 10.0); vec2 gi = floor(g), gf = fract(g) - 0.5; if (mod(gi.x + gi.y, 2.0) < 0.5 && gi.x > 0.0 && gi.x < 11.0 && gi.y > 0.0 && gi.y < 9.0 && length(gf) < 0.42) c = W; }
      else if (f >= 28.0 && f <= 37.0) { float n = f - 28.0; c = mod(n, 3.0) < 0.5 ? R : (mod(n, 3.0) < 1.5 ? Y : Bl); if (abs(cy) < 0.12 && x < 0.6) c = W; }
      else if (f == 38.0) { c = Bl; if ((x > 0.38 && x < 0.48 && y > 0.25 && y < 0.75) || (x > 0.38 && x < 0.66 && y > 0.65 && y < 0.75)) c = W; }
      // the cloth's weave and grime, faint
      c *= 0.93 + 0.07 * hash12(floor(uv * vec2(40.0, 30.0)) + sd);
      s.albedo = c; s.rough = 0.95; s.wrap = 0.35; s.trans = 0.25;
    `,
  });
}
