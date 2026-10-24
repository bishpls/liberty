// liberty/src/stage/mats.js: the stage's materials (B5). Anime rules (research/style.md): flat tones in two or three
// steps with a designed shade (S2/rule 4: about half the lit value, hue turned 15-25 deg toward violet), detail as lines
// and decals (rule 5), concert gear near-black (C1: everything that is not light sits at V .04-.2) so the light reads
// as an addition. Colours are sRGB hex, linearised here; the toon light, the spots and the ink are the engine's.
import { lin } from 'scene3d/util.js';

const T = window.THREE;
const v3 = c => new T.Vector3(...lin(c));
const SEED_V = /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObjN = N; vObjP = P; }`;
const SEED_VARY = 'varying float vSeed; varying vec3 vObjN; varying vec3 vObjP;';

export const STAGE_GLSL = /* glsl */`
float aaW(float x) { return max(fwidth(x), 1e-4); }
float lines1(float x, float period, float w) {
  float f = abs(fract(x / period + 0.5) - 0.5) * period, a = aaW(x);
  return (1.0 - smoothstep(w * 0.5 - a, w * 0.5 + a, f)) * (1.0 - smoothstep(period * 0.25, period * 0.5, a * 2.0));
}
float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// the style's shade: about half the lit value, turned toward violet (rule 4)
vec3 shadeOf(vec3 c) { return c * vec3(0.47, 0.48, 0.60); }
void toon(inout Surface s, vec3 lit) { s.albedo = lit; s.shadeCol = shadeOf(lit); s.useShade = 1.0; }
`;

// a material from a surface body (GLSL statements with s, P, V, uv, sd = the piece's seed in scope)
// the uniforms a body uses, declared from their values' types (an array or one already declared in glsl is left alone)
function declare(uniforms, glsl) {
  const out = [];
  for (const [k, u] of Object.entries(uniforms)) {
    if (new RegExp('uniform\\s+\\w+\\s+' + k + '\\b').test(glsl)) continue;
    const v = u.value, ty = typeof v === 'number' ? 'float' : v && v.isVector4 ? 'vec4' : v && v.isVector3 ? 'vec3' : v && v.isVector2 ? 'vec2' : v && v.isColor ? 'vec3' : v && v.isTexture ? 'sampler2D' : v && v.isMatrix4 ? 'mat4' : null;
    if (ty) out.push(`uniform ${ty} ${k};`);
  }
  return out.join('\n');
}
export function smat(world, { name, lines = 1, uniforms = {}, glsl = '', body, double = false, transparent = false, depthWrite, blending, vertex, varyings, noFog = false }) {
  glsl = declare(uniforms, glsl) + '\n' + glsl;
  return world.mat({
    name, lines, double, transparent, depthWrite, blending, noFog,
    uniforms, varyings: SEED_VARY + (varyings || ''), vertex: vertex || SEED_V,
    surface: /* glsl */`
      ${STAGE_GLSL}
      ${glsl}
      void smain(inout Surface s, vec3 P, vec3 V) {
        float sd = vSeed; vec2 uv = vUv;
        ${body}
      }`,
  });
}

const C = (name, hex) => ({ [name]: { value: v3(hex) } });

export function stageMats(world) {
  const M = {};
  // aluminium box truss and towers (S1): mill-finish silver, the chords' welds and scuffs as a slightly darker tone
  M.truss = smat(world, { name: 'stage truss', uniforms: Object.assign(C('uA', '#a3a8ae'), C('uB', '#868b92')),
    body: `float w = step(0.82, h21(floor(uv * vec2(3.0, 1.0)) + sd * 17.0)); toon(s, mix(uA, uB, w * 0.6)); s.spec = 0.35; s.rough = 0.35;` });
  // galvanised scaffold tube and fittings (the decks' substructure)
  M.scaffold = smat(world, { name: 'stage scaffold', uniforms: Object.assign(C('uA', '#8b9096'), C('uB', '#6e737a')),
    body: `float w = step(0.7, h21(floor(uv * vec2(1.3, 1.0)) + sd * 11.0)); toon(s, mix(uA, uB, w * 0.7)); s.spec = 0.2; s.rough = 0.5;` });
  // black gear: speaker boxes, road cases, fixture bodies, the LED wall's back, the decks' skirts (C1: near-black)
  M.black = smat(world, { name: 'stage black', uniforms: Object.assign(C('uA', '#2a2b30'), C('uB', '#3a3b41')),
    body: `float w = step(0.86, h21(floor(uv * 2.0) + sd * 31.0)); toon(s, mix(uA, uB, w)); s.spec = 0.15; s.rough = 0.6;` });
  M.blackGloss = smat(world, { name: 'stage black gloss', uniforms: C('uA', '#24252a'), body: `toon(s, uA); s.spec = 0.6; s.rough = 0.25;` });
  // the speaker grilles: black perforated steel (a fine dot field drawn as a tone, rule 5)
  M.grille = smat(world, { name: 'stage grille', uniforms: Object.assign(C('uA', '#1d1e22'), C('uB', '#34363c')),
    body: `vec2 g = fract(uv * 90.0) - 0.5; float d = step(0.3, length(g)); float far = smoothstep(0.004, 0.012, aaW(uv.x));
           toon(s, mix(mix(uA, uB, d * 0.5), mix(uA, uB, 0.25), far)); s.rough = 0.8;` });
  // the stage floor: black-painted ply decks (S2: 4 x 8 ft modules), joints every module, scuffs and gaffer tape where
  // feet go, spike marks (coloured tape crosses) at the band's marks (set in the uniforms by structure.js)
  M.deck = smat(world, { name: 'stage deck', lines: 1,
    uniforms: Object.assign(C('uA', '#2c2c30'), C('uB', '#3c3c42'), C('uT', '#d8d3c6'), { uMod: { value: new T.Vector4(1.2192, 2.4384, 0, 0) },
      uMarks: { value: Array.from({ length: 8 }, () => new T.Vector4(0, 0, 0, -1)) }, uLip: { value: 1e9 } }),
    glsl: `uniform vec4 uMarks[8]; uniform vec4 uMod; uniform float uLip;`,
    body: `
      // the module joints (a 3 mm gap drawn as a line), the scuffs (paler, where feet go), a few tape strips
      vec2 q = P.xz - uMod.zw;
      float j = max(lines1(q.x, uMod.x, 0.012), lines1(q.y, uMod.y, 0.012));
      float sc = smoothstep(0.55, 0.85, vnoise(P.xz * 1.7 + 3.1) * 0.7 + vnoise(P.xz * 7.3) * 0.3);
      vec3 c = mix(uA, uB, sc * 0.8);
      c = mix(c, uA * 0.45, j);
      // spike marks: a tape cross 0.3 m at each mark, in the mark's colour code (w = hue index)
      for (int i = 0; i < 8; i++) {
        vec4 m = uMarks[i]; if (m.w < 0.0) continue;
        vec2 d = abs(P.xz - m.xz);
        float cross = max(step(d.x, 0.15) * step(d.y, 0.024), step(d.y, 0.15) * step(d.x, 0.024));
        vec3 tc = m.w < 0.5 ? vec3(0.95, 0.85, 0.2) : m.w < 1.5 ? vec3(0.9, 0.25, 0.55) : m.w < 2.5 ? vec3(0.2, 0.75, 0.95) : m.w < 3.5 ? vec3(0.35, 0.9, 0.35) : vec3(0.95, 0.5, 0.15);
        c = mix(c, tc * 0.75, cross);
      }
      // white gaffer along the downstage edge (the lip's safety line, 50 mm), 0.1 m in
      c = mix(c, uT * 0.8, step(abs(P.x - uLip), 0.025));
      toon(s, c); s.spec = 0.15; s.rough = 0.55;` });
  // the risers' carpet (drums): dark grey needle felt
  M.carpet = smat(world, { name: 'stage carpet', uniforms: Object.assign(C('uA', '#3a3640'), C('uB', '#2e2b33')),
    body: `float n = vnoise(P.xz * 9.0 + sd * 7.0); toon(s, mix(uA, uB, step(0.55, n))); s.rough = 0.95;` });
  // timber: sole boards and pads under every foot (S7: the load spread on a heritage deck), cable-ramp tops
  M.timber = smat(world, { name: 'stage timber', uniforms: Object.assign(C('uA', '#8f714e'), C('uB', '#6f553a')),
    body: `float g = lines1(uv.y + 0.03 * sin(uv.x * 3.0 + sd * 20.0), 0.05, 0.006); float t = step(0.6, h11(floor(sd * 40.0)));
           toon(s, mix(mix(uA, uB, t * 0.5), uB * 0.8, g)); s.rough = 0.9;` });
  // ballast: IBC water totes (white HDPE in a galvanised cage) and steel weights
  M.tote = smat(world, { name: 'stage ballast tote', uniforms: Object.assign(C('uA', '#d9dbd4'), C('uB', '#b4b8b0')),
    body: `float g = lines1(uv.y, 0.25, 0.01); toon(s, mix(uA, uB, g + 0.2 * step(0.5, h21(floor(uv * 4.0))))); s.rough = 0.7;` });
  M.galv = smat(world, { name: 'stage galvanised', uniforms: Object.assign(C('uA', '#9aa0a3'), C('uB', '#7c8285')),
    body: `toon(s, mix(uA, uB, step(0.75, h21(floor(uv * 5.0) + sd)))); s.spec = 0.3; s.rough = 0.45;` });
  // the cables: black rubber; the cable ramps: yellow lids on black
  M.cable = smat(world, { name: 'stage cable', lines: 0, uniforms: C('uA', '#18181b'), body: `toon(s, uA); s.spec = 0.25; s.rough = 0.4;` });
  M.ramp = smat(world, { name: 'stage cable ramp', uniforms: Object.assign(C('uA', '#e1b52c'), C('uB', '#1d1d20')),
    body: `float st = step(0.5, fract(uv.x * 2.5)); toon(s, P.y > 0.0 && vObjN.y > 0.7 ? mix(uA, uA * 0.8, st * 0.3) : uB); s.rough = 0.7;` });
  // aluminium road-case trim, the cases themselves are black (with the crew's stencils as pale blocks)
  M.case = smat(world, { name: 'stage road case', uniforms: Object.assign(C('uA', '#2b2c31'), C('uE', '#a4a9ae'), C('uL', '#d6d2c6')),
    body: `float lab = step(abs(uv.y - 0.55), 0.06) * step(abs(fract(uv.x * 0.9 + sd) - 0.5), 0.22);
           toon(s, mix(uA, uL * 0.8, lab)); s.spec = 0.2; s.rough = 0.55;` });
  // drum shells (each kit piece its own seed: a wrap in deep red sparkle), chrome hardware, cymbals' bronze
  M.drum = smat(world, { name: 'stage drum shell', uniforms: Object.assign(C('uA', '#7c1f2c'), C('uB', '#9b2b39')),
    body: `float sp = step(0.93, h21(floor(uv * 60.0))); toon(s, mix(uA, uB, sp)); s.spec = 0.7; s.rough = 0.2;` });
  M.chrome = smat(world, { name: 'stage chrome', uniforms: C('uA', '#b9bec4'), body: `toon(s, uA); s.spec = 0.9; s.rough = 0.12;` });
  M.bronze = smat(world, { name: 'stage cymbal', uniforms: Object.assign(C('uA', '#c89a3c'), C('uB', '#a87c28')),
    body: `float r = length(vObjP.xz); toon(s, mix(uA, uB, step(0.5, fract(r * 25.0)) * 0.4)); s.spec = 0.85; s.rough = 0.2;` });
  M.drumhead = smat(world, { name: 'stage drum head', uniforms: C('uA', '#e6e1d3'), body: `toon(s, uA); s.rough = 0.6;` });
  // the barge: a steel deck barge, black topsides with rust weeping, a grey deck; the mortar racks' timber and tubes
  M.barge = smat(world, { name: 'pyro barge hull', uniforms: Object.assign(C('uA', '#26292d'), C('uR', '#6a3a22'), C('uB', '#3d4247')),
    body: `float top = smoothstep(0.6, 0.9, vObjN.y);
           float wh = vnoise(vec2(P.x * 3.0 + P.z * 3.0, P.y * 0.6)) * smoothstep(0.3, -0.6, fract(P.y * 0.8));
           float rust = step(0.72, vnoise(vec2((P.x + P.z) * 4.0, floor(P.y * 2.0) * 1.7)) + 0.25 * sin((P.x + P.z) * 0.9));
           vec3 c = mix(mix(uA, uR, rust * 0.6), uB, top);
           toon(s, c); s.rough = 0.8;` });
  M.tube = smat(world, { name: 'mortar tube', uniforms: Object.assign(C('uA', '#e7e5df'), C('uB', '#25262a')),
    body: `toon(s, vObjN.y > 0.9 ? uB : uA); s.rough = 0.6;` });
  return M;
}

// emissive materials (no ink): LED dots, lamp lenses, festoon bulbs. col is linear rgb x strength, driven per frame
export function glowMat(world, name, { uniforms = {}, body, lines = 0, vertex, varyings, glsl = '', transparent, blending, depthWrite, double }) {
  return smat(world, { name, lines, uniforms, vertex, varyings, glsl, transparent, blending, depthWrite, double, body: `s.albedo = vec3(0.0); s.useShade = 0.0; ${body}` });
}
