// engine/scene3d/flow.js: current flowing past obstacles in the water. A world that opts in hands over its obstacles
// (footprints with a diameter: piles, buoys, a stem, a barge, rocks, mooring lines at the waterline) and its
// current; the module bakes which obstacle governs each place's wake and gives its water shader one function,
// flowWake, the wake there as the physics of flow past a bluff body has it at its Reynolds and Froude numbers:
//   the bow wave    the stagnation run-up U^2 / 2g at the upstream face (Chaplin & Teigen 2003: D1/d = Fr^2 / 2 at low
//                   Froude numbers), drawn lighter (the hump catches the sky) as far as its slope shows
//   the V           stationary ripples only above c_min = 0.23 m/s (the slowest capillary-gravity wave); their half-angle
//                   the larger of the capillary-gravity Mach angle asin(c_min / U) (Moisy & Rabaud 2014) and the gravity
//                   wake's: Kelvin's 19.47 deg below a Froude number U / sqrt(g d) of 0.5, ~0.17 / Fr above (Rabaud &
//                   Moisy 2013); their amplitude with Fr^2 (a big slow body makes none worth drawing); their crests along
//                   the arm where the Mach angle governs, en echelon at 54.7 deg to the track where Kelvin's does
//   the street      vortices shed at f = St U / d, St = 0.2 for 300 < Re < 2e5 (Roshko 1961; Lienhard 1966; rough
//                   cylinders keep it past 2e5: Achenbach & Heinecke 1981), none below
//                   Re 47 (a steady twin eddy), carried off at ~0.85 U (Williamson 1996): a street of wavelength
//                   0.85 / St = 4.25 d, its rows 0.281 of that apart (Karman's ratio)
//   the decay       the near wake's deficit falls as (1 + s / d)^-1/2 (the far wake's similarity, Schlichting), its width
//                   grows as sqrt(s / d); drawn out to 12 d; its marks with Fr^2 too (a slow barge's wake barely shows)
//   foam            only above a diameter Froude number of 0.8, where the bow wave starts to entrain air (Chaplin &
//                   Teigen 2003's tows to Fr 1.67; Zhang et al. 2025's air entrainment at Fr 0.8-1.7), broken
// An obstacle is a disc: right for piles, buoys, rocks, a stem meeting the current head on; wrong for a long body the
// current crosses (a hull broadside: the disc puts its bow wave in open water and runs its crescent along the side)
// It returns, per water point: tone (-1 darker .. +1 lighter: marks in the water's own cel tones, for the world's
// drawing to step its plate by), slope (the wake's own surface slopes: the V's crests, the eddies' dimples) and
// slopeVar (the turbulent strip's unresolved roughness), which a world adds to its sea state so the reflection breaks
// up in the wake, and foam. A world that doesn't import this file is untouched.
// Use (docs/ENVIRONMENT.md §2):
//   const field = bakeObstacleField({ obstacles: [{ x, z, d }], currentAt: (x, z) => [vx, vz] });
//   material uniforms: Object.assign(U, flowUniforms(field)); shader: COMMON + FLOW_GLSL, then
//   float tone, slopeVar, foam; vec2 slope; foam = flowWake(P.xz, footprint, uTime, tone, slope, slopeVar);
const T = window.THREE;

export const FLOW = {
  g: 9.81, nu: 1.15e-6,             // (sea water near 14 C: SF Bay in October)
  St: 0.2, ReShed: 47, cMin: 0.23, kelvin: 19.47 * Math.PI / 180, frMach: 0.5, machK: 0.17,
  convect: 0.85, rowRatio: 0.281, decayD: 12, foamFr: 0.8,
};
export const FLOW_SOURCES = [
  'Roshko 1961 (J. Fluid Mech. 10: 345), Lienhard 1966 (Wash. State Univ. Bull. 300): St ~0.2 for 300 < Re < 2e5; no shedding below Re ~47',
  'Achenbach & Heinecke 1981 (J. Fluid Mech. 109: 239): past Re 2e5 smooth cylinders jump (the drag crisis); rough ones keep shedding at St ~0.2-0.25 (piles are rough)',
  'Williamson 1996, Vortex dynamics in the cylinder wake (Annu. Rev. Fluid Mech. 28: 477): vortices convected at ~0.8-0.9 U',
  'von Karman: the street\'s stable row spacing 0.281 of its wavelength',
  'Chaplin & Teigen 2003, Steady flow past a vertical surface-piercing circular cylinder (J. Fluids Struct. 18: 271): run-up D1/d = Fr^2 / 2 at low Fr, tows to Fr 1.67',
  'Zhang et al. 2025: a surface-piercing cylinder at Fr 0.8-1.7, air entrainment',
  'Rabaud & Moisy 2013, Ship wakes: Kelvin or Mach angle? (PRL 110: 214503): Kelvin 19.47 deg below Fr ~0.5, ~1/Fr above',
  'Moisy & Rabaud 2014, Mach-like capillary-gravity wakes (PRE 90: 023009; arXiv 1406.0422): no stationary waves below c_min = 0.23 m/s, a Mach-like angle near it',
  'Lighthill, Waves in Fluids (1978) 3.10: at the cusp line the Kelvin wake\'s divergent crests stand at 54.7 deg to the track',
  'Schlichting, Boundary-Layer Theory: the plane far wake\'s deficit ~ (x / C_D d)^-1/2, its width ~ (x C_D d)^1/2',
];

// the numbers for one obstacle in one current (the shader's own, for measures and boards)
export function flowPhysics(U, d, o = {}) {
  const F = Object.assign({}, FLOW, o);
  const Re = U * d / F.nu, Fr = U / Math.sqrt(F.g * d), sheds = Re > F.ReShed;
  const vCap = U > F.cMin ? Math.asin(Math.min(F.cMin / U, 1)) : NaN;
  const vGrav = Fr < F.frMach ? F.kelvin : Math.min(F.kelvin, F.machK / Fr);
  return {
    Re, Fr, sheds, shedHz: sheds ? F.St * U / d : 0, streetWavelength: F.convect * d / F.St, streetRows: F.rowRatio * F.convect * d / F.St,
    convect: F.convect * U, bowHeight: U * U / (2 * F.g), vAngle: U > F.cMin ? Math.max(vCap, vGrav) : NaN, vAmp: U > F.cMin ? Math.min(1, Fr * Fr / 0.06) : 0,
    decay: F.decayD * d, wakeAmp: Math.min(1, Fr * Fr / 0.06), foam: Fr > F.foamFr,
  };
}

// which obstacle governs each place's wake: for every h-metre texel within an obstacle's reach (its wake's 12
// diameters down-current, at least minReach), the nearest obstacle upstream whose wake cone holds it. Two float
// textures: (x, z, d, U) and (ux, uz, seed, 0). obstacles: [{ x, z, d }]; currentAt(x, z) -> [vx, vz] (m/s)
export function bakeObstacleField({ obstacles, currentAt, h = 0.5, minU = 0.05, minReach = 4, maxReach = 120, maxTexels = 4e6 }) {
  const live = [];
  for (const o of obstacles) {
    const v = currentAt(o.x, o.z); if (!v) continue;
    const U = Math.hypot(v[0], v[1]); if (!(U > minU) || !(o.d > 0)) continue;
    const reach = Math.min(maxReach, Math.max(minReach, (FLOW.decayD + 1) * o.d));
    live.push({ x: o.x, z: o.z, d: o.d, U, ux: v[0] / U, uz: v[1] / U, reach, seed: (live.length * 0.618034) % 1, kind: o.kind || '' });
  }
  if (!live.length) return { live: [], tex: null, dir: null, box: [0, 0, 0, 0] };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const o of live) { x0 = Math.min(x0, o.x - o.reach); x1 = Math.max(x1, o.x + o.reach); z0 = Math.min(z0, o.z - o.reach); z1 = Math.max(z1, o.z + o.reach); }
  while (((x1 - x0) / h) * ((z1 - z0) / h) > maxTexels) h *= 1.25;
  const nx = Math.ceil((x1 - x0) / h), nz = Math.ceil((z1 - z0) / h);
  const A = new Float32Array(nx * nz * 4), B = new Float32Array(nx * nz * 4);
  const best = new Float32Array(nx * nz).fill(Infinity);
  for (const o of live) {
    // (each obstacle paints its own reach; a texel keeps the obstacle nearest upstream of it)
    const i0 = Math.max(0, Math.floor((o.x - o.reach - x0) / h)), i1 = Math.min(nx - 1, Math.ceil((o.x + o.reach - x0) / h));
    const j0 = Math.max(0, Math.floor((o.z - o.reach - z0) / h)), j1 = Math.min(nz - 1, Math.ceil((o.z + o.reach - z0) / h));
    const r = o.d / 2;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + (i + 0.5) * h, z = z0 + (j + 0.5) * h, dx = x - o.x, dz = z - o.z;
      const s = dx * o.ux + dz * o.uz, n = -dx * o.uz + dz * o.ux;
      if (s < -r - h - 0.5 || s > o.reach || Math.abs(n) > r + 0.3 * Math.max(s, 0) + h + 0.5) continue;
      const k = j * nx + i;
      if (s >= best[k]) continue;
      best[k] = s; A.set([o.x, o.z, o.d, o.U], k * 4); B.set([o.ux, o.uz, o.seed, 0], k * 4);
    }
  }
  const mk = data => { const t = new T.DataTexture(data, nx, nz, T.RGBAFormat, T.FloatType); t.minFilter = t.magFilter = T.NearestFilter; t.needsUpdate = true; return t; };
  return { live, tex: mk(A), dir: mk(B), box: [x0, z0, nx * h, nz * h], texels: [nx, nz], h };
}

export function flowUniforms(field, U = {}) {
  const blank = () => new T.DataTexture(new Float32Array(4), 1, 1, T.RGBAFormat, T.FloatType);
  U.uFlowTex = U.uFlowTex || { value: null }; U.uFlowDir = U.uFlowDir || { value: null }; U.uFlowBox = U.uFlowBox || { value: new T.Vector4() };
  U.uFlowK = U.uFlowK || { value: new T.Vector4(1, 1, 1, 0) };     // (tone, slope, roughness, -: a world's dials on the drawing; 1 the physics' own)
  U.uFlowTex.value = (field && field.tex) || blank(); U.uFlowDir.value = (field && field.dir) || blank();
  if (field && field.tex) U.uFlowBox.value.set(...field.box); else U.uFlowBox.value.set(0, 0, 0, 0);
  return U;
}

// the shader (needs COMMON's vnoise and hash12). fp: the pixel's footprint on the water (m); t: seconds
export const FLOW_GLSL = /* glsl */`
uniform sampler2D uFlowTex; uniform sampler2D uFlowDir; uniform vec4 uFlowBox; uniform vec4 uFlowK;
float flowWake(vec2 p, float fp, float t, out float tone, out vec2 slope, out float slopeVar) {
  tone = 0.0; slope = vec2(0.0); slopeVar = 0.0;
  if (uFlowBox.z <= 0.0) return 0.0;
  vec2 u = (p - uFlowBox.xy) / uFlowBox.zw;
  if (any(lessThan(u, vec2(0.0))) || any(greaterThan(u, vec2(1.0)))) return 0.0;
  vec4 ob = texture(uFlowTex, u);
  if (ob.z <= 0.0) return 0.0;
  vec4 od = texture(uFlowDir, u);
  float U = ob.w, d = ob.z, r = 0.5 * d;
  vec2 ud = od.xy, dp = p - ob.xy;
  float s = dot(dp, ud), n = dp.x * ud.y - dp.y * ud.x, an = abs(n), rho = length(dp);
  float Re = U * d / ${FLOW.nu.toExponential()}, Fr = U / sqrt(9.81 * d);
  // (drawn only where a pixel resolves the marks: a fifth of a diameter or 0.2 m, whichever is larger)
  float vis = 1.0 - smoothstep(max(0.06, 0.15 * d), max(0.2, 0.5 * d), fp), aa = max(fp, 0.004) * 1.5;
  if (vis <= 0.0) return 0.0;
  // the bow wave: the run-up U^2 / 2g at the upstream face, a lighter crescent as wide as a ripple of it
  float bh = U * U / 19.62, bw = 0.03 + 0.05 * d + 4.0 * bh;
  float bow = (1.0 - smoothstep(r + bw, r + bw + aa + 0.02, rho)) * smoothstep(r - aa, r, rho) * smoothstep(0.3 * r, -0.5 * r, s) * smoothstep(0.002, 0.008, bh);
  // (it shows by its slope 2 bh / bw tilting the reflection: full at 0.1, the sea's own rms slope; a big body's run-up
  // spreads over its wide crescent and barely shows)
  tone += 0.7 * bow * min(1.0, 20.0 * bh / bw); slope += normalize(dp + 1e-6) * bow * min(0.15, 2.0 * bh / bw);
  float foam = bow * smoothstep(${FLOW.foamFr.toFixed(2)}, ${(FLOW.foamFr * 1.3).toFixed(2)}, Fr) * step(0.55, vnoise(vec2(atan(dp.y, dp.x) * 3.0, t * 0.7) + ob.xy));
  if (s > 0.0) {
    // the V: short crests along each arm a quarter metre apart (drawn: the real ones are 2 pi U^2 / g), alternately lighter
    // and darker, a third missing, their lengths and places varied; above c_min only, its angle the Mach-like
    // capillary-gravity one or the gravity wake's. The crests lie along the arm where the capillary Mach angle governs
    // (a Mach cone's fronts are its lines) and en echelon where Kelvin's does: at the cusp line the divergent crests stand
    // at 54.7 deg to the track, 35.3 deg outward of the arm (Lighthill, Waves in Fluids 3.10)
    if (U > ${FLOW.cMin.toFixed(2)}) {
      float thC = asin(min(${FLOW.cMin.toFixed(2)} / U, 0.99)), thG = Fr < ${FLOW.frMach.toFixed(2)} ? ${FLOW.kelvin.toFixed(5)} : min(${FLOW.kelvin.toFixed(5)}, ${FLOW.machK.toFixed(3)} / Fr);
      float th = max(thC, thG), be = 0.6155 * smoothstep(-0.03, 0.03, thG - thC), sg = n < 0.0 ? -1.0 : 1.0;
      float LV = clamp(5.0 * d, 0.8, 6.0), amp = min(1.0, Fr * Fr / 0.06), lam = max(0.25, 0.1 * d);
      vec2 ea = vec2(cos(th), sin(th)), en = vec2(-sin(th), cos(th)), q = vec2(s, an - r);
      vec2 qa = vec2(dot(q, ea), dot(q, en));                                    // (along the arm, outward across it)
      float kc = floor(qa.x / lam), hs = od.z * 97.0 + sg;
      float onV = step(0.34, hash12(vec2(kc + od.z * 97.0, sg)));
      float hl = lam * (0.3 + 0.14 * hash12(vec2(kc * 1.7 + 3.1, hs))), hw = 0.016 + 0.006 * qa.x;   // (a crest: long and thin)
      vec2 dq = qa - vec2((kc + 0.5) * lam, (hash12(vec2(kc * 2.3 + 7.7, hs)) - 0.5) * 0.06);
      float cb = cos(be), sb = sin(be), xs = dq.x * cb + dq.y * sb, ys = dq.y * cb - dq.x * sb;
      float wd = hw * sqrt(max(1.0 - (xs / hl) * (xs / hl), 0.0));               // (a lens: the crest thins to its ends)
      float crest = (1.0 - smoothstep(hl - aa, hl, abs(xs))) * (1.0 - smoothstep(max(wd - aa, 0.0), wd + aa, abs(ys))) * (mod(kc, 2.0) < 0.5 ? 1.0 : -0.8);
      float vf = onV * amp * step(0.0, qa.x) * (1.0 - smoothstep(0.4 * LV, LV, s));
      vec2 cn = ea * -sb + en * cb;                                               // (the crest's normal, in (s, |n|))
      tone += 0.55 * crest * vf;
      slope += (ud * cn.x + sg * vec2(ud.y, -ud.x) * cn.y) * 0.06 * crest * vf;
    }
    // the near wake: its street (sheds above Re 47: St 0.2, carried at 0.85 U, rows 0.281 of the wavelength apart) as
    // darker smooth eddies on alternate sides, lighter rough water between, the deficit's decay (1 + s / d)^-1/2,
    // drawn to 12 d; below Re 47 a steady twin eddy behind it
    // (its surface signature grows with Fr^2, as the V's: the free surface's deformation by the flow, ~U^2 / 2g, against
    // the body's size; a big slow body, a barge in a quarter metre a second, leaves a wake the surface hardly shows)
    float Lw = ${FLOW.decayD.toFixed(1)} * d, dec = inversesqrt(1.0 + s / d) * (1.0 - smoothstep(0.5 * Lw, Lw, s)) * smoothstep(0.0, 0.6 * d, s) * min(1.0, Fr * Fr / 0.06);
    float w = d * (0.8 + 0.5 * sqrt(s / d));
    float strip = 1.0 - smoothstep(0.5 * w - aa, 0.5 * w + aa, an);
    float eddy = 0.0;
    if (Re > ${FLOW.ReShed.toFixed(1)}) {
      float a4 = ${(FLOW.convect / FLOW.St).toFixed(3)} * d, ph = ${FLOW.convect.toFixed(2)} * U * t / a4 + od.z;
      float kk = floor(s / a4 - fract(ph)), sk = (kk + fract(ph) + 0.5) * a4;
      float side = mod(kk + floor(ph), 2.0) < 0.5 ? 1.0 : -1.0;
      vec2 de = vec2(s - sk, n - side * 0.5 * ${FLOW.rowRatio.toFixed(3)} * a4);
      float er = 0.3 * w, ed = length(de / vec2(1.4, 1.0));
      eddy = 1.0 - smoothstep(er - aa, er + aa, ed);
      // (an eddy's core is a dimple: its slopes point in, ~ the swirl's U^2 / g over its radius, small)
      slope += -normalize(de + 1e-6) * eddy * min(0.08, 0.5 * U * U / 9.81 / max(er, 0.05)) * dec;
    } else {
      eddy = (1.0 - smoothstep(0.6 * d, 0.6 * d + aa, length(vec2(s - 0.6 * d, an - 0.25 * d)))) * step(s, 1.5 * d);
    }
    float rough = strip * smoothstep(0.15, 0.55, vnoise(vec2(s * 2.2 / max(d / 0.36, 1.0) - ${FLOW.convect.toFixed(2)} * U * t * 2.2 / max(d / 0.36, 1.0), n * 3.0 / max(d / 0.36, 1.0)) + ob.xy)) * (1.0 - eddy);
    tone += (-0.6 * eddy + 0.35 * rough) * dec;
    // the turbulent strip's roughness for the reflection: the short ripples it raises, ~0.06 rms slope at the pile
    slopeVar += pow(0.06 * strip * dec * (1.0 - 0.7 * eddy), 2.0);
  }
  tone = clamp(tone, -1.0, 1.0) * vis * uFlowK.x; slope *= vis * uFlowK.y; slopeVar *= vis * uFlowK.z;
  return foam * (1.0 - smoothstep(0.15, 0.4, fp));
}
`;
