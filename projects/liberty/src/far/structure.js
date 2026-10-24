// liberty/src/far/structure.js: what the far view's built works are made of (B6): steel and concrete in the anime way
// (flat lit and shade tones, violet-leaning shade at night: style.md S1-S3), floodlights on a structure (a band of
// light from its foot up), and lines that never thin under a pixel (cables, suspenders, masts seen from kilometres:
// style rule 5, rigging as a 1-2 px line).
import { lin } from 'scene3d/util.js';
import { merge } from 'scene3d/geom.js';

const T = window.THREE;

// the far view's own air (its materials draw with noFog, the engine's atmos off): an exponential haze 1.5 km deep,
// extinction beta by day (1/22 km: Koschmieder visibility ~85 km) to night (1/40 km: site.md's clear October evenings), the land pulled
// toward the sky behind it by the optical depth of the path (anime's value layers: farther is lighter, never lighter than
// the sky). Applied in the surface: albedo and emission times the transmittance, the sky's colour added for the rest.
// One set of numbers for every far material, so the land, the city and the bridges at one distance agree.
export const AIR = { betaDay: 1 / 22000, betaNight: 1 / 40000, H: 1500, max: 0.92 };
export const AIR_U = { uFarAir: { value: new T.Vector4(AIR.betaDay, AIR.betaNight, AIR.H, AIR.max) } };
export const AIR_GLSL = /* glsl */`
uniform vec4 uFarAir;
float farAirK(vec3 P) {
  vec3 cam = cameraPosition; float d = distance(cam, P), H = uFarAir.z;
  float dy = cam.y - P.y;
  float dens = abs(dy) > 1.0 ? H * (exp(-max(P.y, 0.0) / H) - exp(-max(cam.y, 0.0) / H)) / dy : exp(-max(P.y, 0.0) / H);
  return (1.0 - exp(-d * mix(uFarAir.x, uFarAir.y, uNight) * dens)) * uFarAir.w;
}
vec3 farAirSky(vec3 P) { vec3 v = P - cameraPosition; return skyBase(normalize(vec3(v.x, 0.0, v.z) + vec3(0.0, 0.01, 0.0))); }
void farAir(inout Surface s, vec3 P) {
  float a = farAirK(P);
  s.albedo *= 1.0 - a; s.emissive = s.emissive * (1.0 - a) + farAirSky(P) * a;
}`;

// a solid's material: albedo by day, a designed shade; at night a flood from below (uFlood: colour, height falloff)
export function solidMat(world, name, hex, { flood = null, floodH = 200, rough = 0.7, spec = 0.15, lines = 1, night = 0.75 } = {}) {
  const U = {
    uAlb: { value: new T.Vector3(...lin(hex)) },
    uFlood: { value: new T.Vector4(...(flood ? lin(flood) : [0, 0, 0]), floodH) },
    uNightK: { value: night },
  };
  return world.mat({
    name, lines, uniforms: Object.assign(U, AIR_U), defines: { SPOTS: 0 }, noFog: true,
    surface: AIR_GLSL + /* glsl */`
uniform vec3 uAlb; uniform vec4 uFlood; uniform float uNightK;
void smain(inout Surface s, vec3 P, vec3 V) {
  s.albedo = uAlb * mix(1.0, uNightK, uNight); s.rough = ${rough.toFixed(2)}; s.spec = ${spec.toFixed(2)};
  // a floodlit structure: lit from its foot, the light falling off up it; faces turned from the floods take less
  if (uFlood.w > 0.0 && dot(uFlood.rgb, vec3(1.0)) > 0.0) {
    float k = smoothstep(0.15, 0.6, uNight) * exp(-max(P.y, 0.0) / uFlood.w) * (0.55 + 0.45 * abs(s.N.y < 0.5 ? 1.0 : 0.4));
    s.emissive += uFlood.rgb * uAlb * k;
  }
  farAir(s, P);
}`,
  });
}

// lines with a minimum width in pixels: a segment list (a, b: [x, y, z]; w: metres) drawn as camera-facing ribbons.
// emit: 'none' or a GLSL body that sets the emission from (vLs: station s, height along h, the segment's own params)
const LINE_VERT = /* glsl */`
attribute vec3 aA; attribute vec3 aB; attribute vec4 aL; attribute vec4 aE;
uniform float uMinPx;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  vec3 p = mix(aA, aB, uv.x);
  vec3 dir = normalize(aB - aA + 1e-6);
  vec3 vd = normalize(p - cameraPosition);
  vec3 side = cross(dir, vd); float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(0.0, 1.0, 0.0);
  float d = max(distance(p, cameraPosition), 0.1);
  float mpp = projectionMatrix[3][3] > 0.5 ? 2.0 / (projectionMatrix[1][1] * uResolution.y) : 2.0 * d / (projectionMatrix[1][1] * uResolution.y);
  float w = max(aL.x, uMinPx * mpp);
  P = p + side * uv.y * w * 0.5;
  N = normalize(-vd + vec3(0.0, 0.25, 0.0));
  vLs = vec4(aL.z, mix(aL.y, aL.w, uv.x), uv.y, w / max(aL.x, 1e-3));
  vLe = aE;
}`;
const SOFT = typeof location !== 'undefined' && new URLSearchParams(location.search).get('farsoft') !== '0';
export function lineMat(world, name, hex, { minPx = 1.1, emit = '', head = '', uniforms = {}, lines = 0, night = 0.6, a2c = new URLSearchParams(location.search).get('fara2c') === '1', alphaMin = 0.3, glow = false, soft = SOFT } = {}) {
  // soft (default): a line thinner than its drawn minimum is blended in the transparent pass at its true coverage
  // (alpha = its width over the drawn width, a soft edge across it): a cable 0.4 px wide reads as a faint line that
  // glides over the pixel grid on a pan instead of a 1 px line that flickers between one and two columns (?farsoft=0)
  if (glow) soft = false;
  if (soft) minPx = Math.max(minPx, 1.6);
  // glow: a line of lights (emission only), drawn additive in the transparent pass, wide and soft (a gaussian across it):
  // it can't crawl over the pixel grid as a 1 px opaque line does on a pan, and the water still mirrors it
  // (alpha to coverage: a line drawn wider than it is (its minimum in pixels) covers the MSAA samples in proportion to
  // its true width, soft at its edges: a 1 px cable sliding over the pixel grid on a pan doesn't crawl)
  const U = Object.assign({ uAlb: { value: new T.Vector3(...lin(hex)) }, uMinPx: { value: a2c ? Math.max(minPx, 1.8) : minPx }, uNightK: { value: night } }, uniforms);
  const m = world.mat({
    name, lines, uniforms: Object.assign(U, AIR_U), defines: { SPOTS: 0 }, varyings: 'varying vec4 vLs; varying vec4 vLe;', vertex: LINE_VERT, noFog: true,
    ...(glow ? { transparent: true, depthWrite: false, blending: T.CustomBlending } : soft ? { transparent: true, depthWrite: false } : {}),
    surface: AIR_GLSL + /* glsl */`
uniform vec3 uAlb; uniform float uNightK;
${Object.keys(uniforms).map(k => { const v = uniforms[k].value; return `uniform ${typeof v === 'number' ? 'float' : v.isVector4 ? 'vec4' : v.isVector3 ? 'vec3' : v.isVector2 ? 'vec2' : 'float'} ${k};`; }).join('\n')}
${head}
void smain(inout Surface s, vec3 P, vec3 V) {
  s.albedo = uAlb * mix(1.0, uNightK, uNight); s.rough = 0.6; s.rim = 0.0;
  ${glow ? 's.albedo = vec3(0.0); s.rim = 0.0; float gProf = exp(-pow(vLs.z * 1.7, 2.0));' : ''}
  ${soft ? 'sAlpha = clamp(1.15 / max(vLs.w, 1.0), 0.0, 1.0) * (1.0 - smoothstep(0.35, 1.0, abs(vLs.z))) * 1.25;' : ''}
  ${a2c ? `sAlpha = clamp(1.25 / max(vLs.w, 1.0), ${alphaMin.toFixed(2)}, 1.0) * (1.0 - smoothstep(0.55, 1.0, abs(vLs.z)));` : ''}
  ${emit}
  ${glow ? 's.emissive *= 1.0 - farAirK(P);' : 'farAir(s, P);'}
}`,
  });
  if (a2c) m.color.alphaToCoverage = true;
  if (glow) { Object.assign(m.color, { blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor }); m.glow = true; }
  if (soft) m.soft = true;
  return m;
}
const LINE_QUAD = (() => {
  const g = new T.InstancedBufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(12), 3));
  g.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, -1, 1, -1, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
})();
// segs: [{ a, b, w, s (station), h0, h1 (heights along), e: [4] }]
export function lineMesh(world, mats, segs, name, flags = {}) {
  const n = segs.length, A = new Float32Array(n * 3), B = new Float32Array(n * 3), L = new Float32Array(n * 4), E = new Float32Array(n * 4);
  const box = new T.Box3();
  segs.forEach((g, i) => {
    A.set(g.a, i * 3); B.set(g.b, i * 3); L.set([g.w || 0.3, g.h0 || 0, g.s || 0, g.h1 || 0], i * 4); E.set(g.e || [0, 0, 0, 0], i * 4);
    box.expandByPoint(new T.Vector3(...g.a)); box.expandByPoint(new T.Vector3(...g.b));
  });
  const geo = LINE_QUAD.clone();
  geo.setAttribute('aA', new T.InstancedBufferAttribute(A, 3)); geo.setAttribute('aB', new T.InstancedBufferAttribute(B, 3));
  geo.setAttribute('aL', new T.InstancedBufferAttribute(L, 4)); geo.setAttribute('aE', new T.InstancedBufferAttribute(E, 4));
  const m = world.mesh(geo, mats, Object.assign({ count: n, name, cast: false }, mats.glow ? { trans: true, gbuf: false, id: false } : mats.soft ? { trans: true, gbuf: false } : {}, flags));
  m.boundingSphere = box.getBoundingSphere(new T.Sphere()); m.boundingSphere.radius += 20;
  m.userData.loose = 'a cable or a line (held by its ends)';
  return m;
}

// a polyline sampled: points along [x, y, z] knots by arc length
export function resample(pts, step) {
  const out = [pts[0]]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let t = step - carry;
    while (t <= L) { const f = t / L; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]); t += step; }
    carry = L - (t - step);
  }
  return out;
}
export { merge };
