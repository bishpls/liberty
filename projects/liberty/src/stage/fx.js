// liberty/src/stage/fx.js: the renderers every effect draws through (style.md §6). Each frame the effects (pyro.js,
// guns.js) evaluate their particles as pure functions of t and push them here; end() uploads the live ones.
//   sparks  streaks along their velocity (one frame's travel, E9: 2-5 px dots and 10-40 px streaks), a white-yellow
//           core cooling to orange, additive, blooming (C10)
//   fire    flat-toned lumps (E1: 4-6 tones in one hue ramp, white-hot core -> yellow -> orange -> red -> brown, the hue
//           falling as the saturation rises; E2: scalloped edges, a lighter inner shape on the hot side), cut out, so
//           they read as painted shapes; a soft glow under them for the bloom
//   smoke   lobes in the scene's light (the toon ramp's cel split on each puff, E2; the ink's outline, E5), eroding
//           away by a noise threshold as they age (they break into smaller lobes rather than fading)
//   rings   a blast's shock front (E7): a thin bright line where the expanding sphere's edge is seen
import { smat } from './mats.js';

const T = window.THREE;

// the fire ramp (E1; the 50/51 frames' yellow-orange family): heat 1 -> 0
export const FIRE_GLSL = /* glsl */`
vec3 fireTone(float h) {
  // five flat steps; the brightest blooms
  if (h > 0.86) return vec3(4.2, 3.9, 3.2);          // white-hot core (50 deg, .10, 1.0)
  if (h > 0.66) return vec3(3.1, 2.15, 0.62);        // yellow (48 deg, .55, 1.0)
  if (h > 0.44) return vec3(2.2, 0.92, 0.2);         // orange (32 deg, .78, .98)
  if (h > 0.22) return vec3(1.05, 0.26, 0.06);       // red-orange (16 deg, .85, .88)
  return vec3(0.22, 0.07, 0.03);                     // brown-red shade (8 deg, .70, .45)
}
// a smooth value noise (bilinear with a smoothstep fade: rounded contours at any scale, no cells)
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y); }`;

function quadGeo() {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setAttribute('normal', new T.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new T.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
  g.setAttribute('aSeed', new T.Float32BufferAttribute([0, 0, 0, 0], 1));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
// a unit icosphere (subdivided once): the smoke's lobe
function lobeGeo() {
  const g = new T.IcosahedronGeometry(1, 2);
  const n = g.attributes.position.count;
  g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(n), 1));
  return g;
}
function pool(world, geo, mat, max, attrs, name, flags) {
  const ig = new T.InstancedBufferGeometry();
  ig.index = geo.index; for (const k of Object.keys(geo.attributes)) ig.setAttribute(k, geo.attributes[k]);
  const A = {};
  for (const [k, n] of Object.entries(attrs)) { A[k] = new T.InstancedBufferAttribute(new Float32Array(max * n), n); A[k].setUsage(T.DynamicDrawUsage); ig.setAttribute(k, A[k]); }
  ig.instanceCount = 0;
  const m = world.mesh(ig, mat, Object.assign({ name, frustum: false }, flags));
  m.userData.loose = 'an effect: fire, sparks or smoke';
  return { m, ig, A, max, n: 0 };
}

// an unlit effect material (the transparent pass and the water's reflection only): the emissive effects skip the scene's
// lighting entirely (as the engine's own beams and lasers do); in the reflection pass uClip is the water's plane
function fxMat(world, { name, vertex, fragment, blending = T.AdditiveBlending, depthWrite = false, uniforms = {} }) {
  const U = world.U;
  const mat = new T.ShaderMaterial({
    name, uniforms: Object.assign({ uResolution: U.uResolution, uClip: U.uClip }, uniforms),
    vertexShader: `attribute vec4 iP; attribute vec4 iQ; uniform vec2 uResolution; varying vec2 vUv; varying vec4 vQ; varying vec3 vW;
      ${vertex}`,
    fragmentShader: `uniform vec4 uClip; varying vec2 vUv; varying vec4 vQ; varying vec3 vW;
      ${FIRE_GLSL}
      ${fragment}`,
    transparent: true, depthTest: true, depthWrite, side: T.DoubleSide,
  });
  // additive as the engine's beams add: one-one on colour, the alpha left alone (three's AdditiveBlending scales by alpha)
  if (blending === T.AdditiveBlending) Object.assign(mat, { blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor });
  else mat.blending = blending;
  return { color: mat };
}
// the camera-facing frame of a point (vertex shader)
const BILL = `vec3 vd = normalize(cameraPosition - c), rt = normalize(cross(vec3(0.0, 1.0, 0.0), vd) + vec3(1e-5, 0.0, 0.0)), up = cross(vd, rt);`;
const CLIP = `if (dot(vW, uClip.xyz) + uClip.w < 0.0) discard;`;

export function makeFx(world) {
  const qs0 = new URLSearchParams(location.search);
  const NOFIRE = qs0.get('nofire') === '1';     // (?nofire=1: no fire lumps: a measure's reference frame)
  const NOSPARKS = qs0.get('nosparks') === '1'; // (?nosparks=1: no sparks: the reference a spark measure subtracts)
  const MAX = { spark: 20000, fire: 2500, smoke: 2400, ring: 32, glow: 800 };   // (the show's peaks: 15,190 sparks at the drop, 99 glows)
  // a spark's streak is its travel over the shutter (180 degrees at 24 fps: 1/48 s), the same segment in every sub-frame:
  // each sub-frame draws it back and ahead of the spark by its own place in the shutter (host.js's sub-frame tf), so the
  // finals (?spp=8, a sum of display values) and the live page (spp 1) carry one streak, the camera's. (The first pass drew
  // a whole frame's travel behind each sub-frame's spark: about three shutters' worth at spp 8, its ends faded.) ?pyro=v0
  const SHUT_T = (qs0.has('shutter') ? +qs0.get('shutter') : 0.5) / +(qs0.get('fps') || 24), PV0 = qs0.get('pyro') === 'v0';
  const uStreak = { value: new T.Vector2(PV0 ? 0.042 : SHUT_T / 2, PV0 ? 0 : SHUT_T / 2) };
  // ---- sparks: a quad stretched along v over the shutter's travel (above); width a few cm, held >= 1.2 px
  const sparkMat = fxMat(world, { name: 'fx sparks', uniforms: { uStreak },
    vertex: `uniform vec2 uStreak;
      void main() {
        vec3 c = iP.xyz, v = iQ.xyz; float w = iP.w;
        vec3 vd = normalize(cameraPosition - c);
        float L = length(v); vec3 ax = L > 1e-4 ? v / L : vec3(0.0, 1.0, 0.0);
        vec3 side = normalize(cross(ax, vd) + vec3(1e-5));
        // (the pixel's true size from the camera's projection: a long lens far off makes it small)
        vec4 vp = viewMatrix * vec4(c, 1.0);
        float px = 2.0 * max(-vp.z, 0.01) / (max(uResolution.y, 1.0) * projectionMatrix[1][1]);
        float ww = max(w, 1.2 * px);
        vec3 tail = -ax * (L * uStreak.x + ww * 2.0), head = ax * (L * uStreak.y + ww * 0.5);
        vec3 P = c + side * position.x * ww + tail * (0.5 - 0.5 * position.y) + head * (0.5 + 0.5 * position.y);
        vUv = position.xy; vQ = vec4(iQ.w, w / ww, 0.0, 0.0); vW = P;
        gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
      }`,
    fragment: `void main() {
        ${CLIP}
        float h = vQ.x, along = vUv.y * 0.5 + 0.5, across = 1.0 - smoothstep(0.35, 1.0, abs(vUv.x));
        vec3 core = mix(vec3(2.6, 1.55, 0.45), vec3(4.0, 3.6, 2.6), smoothstep(0.55, 0.95, h));   // E9: (52, .65, 1.0) core, (21 deg) tail
        vec3 tailc = mix(vec3(0.9, 0.22, 0.04), vec3(2.2, 0.9, 0.2), h);
        vec3 c = mix(tailc, core, smoothstep(0.2, 0.9, along)) * across * (0.25 + 0.75 * along) * max(pow(vQ.y, 1.2), 0.06);
        gl_FragColor = vec4(c * smoothstep(0.0, 0.15, h), 0.0);
      }` });
  const sparks = pool(world, quadGeo(), sparkMat, MAX.spark, { iP: 4, iQ: 4 }, 'fx sparks', { trans: true, cast: false, id: false, gbuf: false });

  // ---- fire lumps: camera-facing discs, scalloped, flat tones by heat, cut out (written to depth: painted shapes)
  const fireMat = fxMat(world, { name: 'fx fire', blending: T.NormalBlending, depthWrite: true,
    vertex: `void main() {
        vec3 c = iP.xyz; float r = iP.w; ${BILL}
        vec3 P = c + (rt * position.x + up * position.y) * r * 1.25 + vd * r * 0.3;
        vUv = position.xy * 1.25; vQ = iQ; vW = P;
        gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
      }`,
    fragment: `void main() {
        ${CLIP}
        float heat = vQ.x, sd2 = vQ.y, a = vQ.z, lit = vQ.w;
        vec2 q = vUv; float r = length(q), th = atan(q.y, q.x);
        float bumps = 5.0 + floor(fract(sd2 * 7.3) * 4.0);
        float edge = 0.86 + 0.1 * sin(th * bumps + sd2 * 40.0) + 0.05 * sin(th * (bumps * 2.0 + 1.0) - sd2 * 17.0);
        if (r > edge) discard;
        float inner = step(length(q - vec2(0.12 * sin(sd2 * 9.0), -0.22)), edge * 0.62);
        float h = clamp(heat + inner * 0.2 - smoothstep(edge - 0.12, edge, r) * 0.12, 0.0, 1.0);
        // the lump burns out from its rim inward through rounded scallops: a smooth value noise in the lump's own frame
        // (scaled with it, so the same shapes at any distance) against its alpha. (A 6 x 6 cell hash here broke an old
        // lump into 30-50 px squares from 3 m: the integrator's frame scan, B9's flame; board/stage/fire.html)
        float n = 0.65 * vn2(q * 2.6 + sd2 * 31.0) + 0.35 * vn2(q * 5.3 - sd2 * 17.0);
        if (0.8 * n + 0.45 * (1.0 - r / edge) < 1.05 * (1.0 - a)) discard;
        gl_FragColor = vec4(fireTone(h) * lit, 1.0);
      }` });
  const fire = pool(world, quadGeo(), fireMat, MAX.fire, { iP: 4, iQ: 4 }, 'fx fire', { trans: true, cast: false, id: false, gbuf: false });
  // a soft glow under the fire and the flashes (additive): what lights the haze round a flame
  const glowMat = fxMat(world, { name: 'fx glow',
    vertex: `void main() {
        vec3 c = iP.xyz; float r = iP.w; ${BILL}
        vec3 P = c + (rt * position.x + up * position.y) * r;
        vUv = position.xy; vQ = iQ; vW = P;
        gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
      }`,
    fragment: `void main() {
        ${CLIP}
        float r = length(vUv); float g = max(exp(-r * r * 5.5) - 0.0041, 0.0);
        gl_FragColor = vec4(vQ.rgb * g, 0.0);
      }` });
  const glow = pool(world, quadGeo(), glowMat, MAX.glow, { iP: 4, iQ: 4 }, 'fx glow', { trans: true, cast: false, id: false, gbuf: false });

  // ---- smoke lobes: opaque, in the scene's light and ink, eroded by a noise threshold as they age
  const qf = new URLSearchParams(location.search), T0 = qf.get('smoketone'), SFILL = +(qf.get('smokefill') ?? 1);
  // the night's light on smoke (the integrator's note on B4 FIRE, 2026-10-23: unlit after the flash, the 5"/38's ball went
  // one flat dark tone, darker than the sky behind it: a hole; measured, no lamp or spot reaches it 10 m over her stern).
  // Smoke scatters the light round it: at night it takes the sky behind it a little lifted (its shade cel, violet-leaning,
  // E5) and on the side toward the lamps below (the decks, the shore) a warm lit cel; refs (night firings, MOD 45153013/4,
  // 45166047/85): smoke p50 L* +20..+38 over the sky beside it, its interior p90 - p10 31-54. ?smokenight=shade,warm
  const SN = (qf.get('smokenight') || '0.7,0.85').split(',').map(Number), V0 = qf.get('smoke') === 'v0';   // (?smoke=v0: the first cut's smoke, for A/Bs)
  const smokeMat = smat(world, {
    name: 'fx smoke', lines: 1,
    vertex: /* glsl */`attribute float aSeed; attribute vec4 iP; attribute vec4 iS;
      void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
        vec3 o = position; float r = iP.w;
        // a lumpy lobe: the sphere pushed out by a few big bumps (its seed turns them)
        float b = 0.12 * sin(o.x * 3.1 + iS.y * 20.0) * sin(o.y * 2.7 + iS.y * 13.0) * sin(o.z * 2.9 - iS.y * 7.0);
        P = iP.xyz + o * r * (1.0 + b) * (1.0 - 0.45 * iS.z);
        N = normalize(o); uv = o.xy; vSeed = aSeed; vObjN = N; vObjP = o; vS = iS;
      }`,
    varyings: 'varying vec4 vS;',
    uniforms: { uTones: { value: [
      T0 ? new T.Vector3(...T0.split(',').map(Number)) : V0 ? new T.Vector3(0.115, 0.098, 0.062) : new T.Vector3(0.21, 0.175, 0.11),    // 0 the guns' blanks: olive-tan (G7; a blank's reduced charge smokes paler, show.md)
      new T.Vector3(0.42, 0.42, 0.44),       // 1 flash powder (the mortars): white-grey
      new T.Vector3(0.62, 0.66, 0.70),       // 2 CO2 fog: pale, cool
      new T.Vector3(0.030, 0.024, 0.018),    // 3 unburnt powder, the flash's dark core
      new T.Vector3(0.30, 0.30, 0.31),       // 4 the gerbs' grey
      new T.Vector3(0.16, 0.15, 0.14),       // 5 propane's thin dark wisp
    ] }, uSkyFill: { value: new T.Vector3(0.030, 0.031, 0.052).multiplyScalar(SFILL) },
      uSmokeNight: { value: new T.Vector2(SN[0], SN[1]) }, uSmokeV0: { value: V0 ? 1 : 0 }, uSmokeLit: { value: new T.Vector3(0.3, -1.0, 0.15).normalize() } },
    glsl: 'uniform vec3 uTones[6]; uniform vec3 uSkyFill; uniform vec2 uSmokeNight; uniform vec3 uSmokeLit; uniform float uSmokeV0;',
    body: `int k = int(vS.x + 0.5); vec3 c = uTones[0];
      for (int i = 0; i < 6; i++) if (i == k) c = uTones[i];
      // erosion: the lobe breaks into big scallops as it ages (vS.z 0 whole .. 1 gone); vnoise3 is -1..1
      float n = 0.5 + 0.5 * (vnoise3(vObjP * 1.15 + vS.y * 17.0) * 0.8 + vnoise3(vObjP * 2.9 - vS.y * 9.0) * 0.2);
      // (the lobe's rim as the eye sees it goes first: scalloped edges, not holes punched through its middle)
      float rimE = (1.0 - abs(dot(vObjN, V))) * (1.0 - uSmokeV0);
      if (n - 0.3 * rimE * vS.z < vS.z * 1.1 - 0.05) discard;
      // the hot glow from inside a fresh blast (vS.w: heat), then the scene's light
      toon(s, c); s.shadeCol = c * vec3(0.55, 0.52, 0.72);       // E1/E5: a violet-leaning shade at night
      s.rough = 1.0; s.rim = 0.4;
      // the night's light on it: the sky behind it (as the eye sees it) lifted and leaning violet, the shade cel; toward
      // the lamps below a warm lit cel, its edge broken by the erosion's noise (two cels and the ink: E2, E5). The flash's
      // dark core (tone 3) keeps the old fill; by day the scene's light does it all
      vec3 vd = -V; vec3 skyB = skyBase(normalize(vec3(vd.x, max(vd.y, 0.03), vd.z)));
      float nk = smoothstep(0.0, 0.6, uNight) * (k == 3 ? 0.0 : 1.0) * (1.0 - uSmokeV0);
      // (the cels split on a light from above and to one side as the eye sees it, the toon convention: whatever the
      // camera, both cels show; the key at night is near the camera's back in some shots, which left one cel in view)
      vec3 Lv = normalize(vec3(0.0, 0.75, 0.0) + 0.45 * normalize(cross(vec3(0.0, 1.0, 0.0), V) + vec3(1e-4)) + 0.25 * V);
      float lit = smoothstep(-0.07, 0.07, dot(vObjN, Lv) + 0.05 + 0.5 * (n - 0.5));
      vec3 skyG = mix(skyB, vec3(dot(skyB, vec3(0.2126, 0.7152, 0.0722))), 0.45);       // (the sky's light, half greyed)
      vec3 shadeT = skyG * uSmokeNight.x * vec3(0.98, 0.9, 1.1), litT = shadeT + c * vec3(1.0, 0.86, 0.68) * uSmokeNight.y;
      s.emissive = mix(uSkyFill * (0.6 + 2.5 * dot(c, vec3(0.2126, 0.7152, 0.0722))) * (0.6 + 0.4 * saturate(vObjN.y)), mix(shadeT, litT, lit), nk)
        + vec3(2.4, 1.0, 0.25) * vS.w * (0.6 + 0.4 * n);`,
  });
  const smoke = pool(world, lobeGeo(), smokeMat, MAX.smoke, { iP: 4, iS: 4 }, 'fx smoke', { cast: false, id: true });

  // ---- shock rings (E7): a camera-facing ring line 6-10 px wide with radial hairlines, near the muzzle for 3-5 frames
  // (the front itself is invisible; anime draws its ring small and quick); width in pixels, so it reads at any distance
  const ringMat = fxMat(world, { name: 'fx rings',
    vertex: `void main() {
        vec3 c = iP.xyz; float r = iP.w; ${BILL}
        vec3 P = c + (rt * position.x + up * position.y) * r * 1.5;
        vUv = position.xy * 1.5; vQ = iQ; vW = P;
        gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
      }`,
    fragment: `void main() {
        ${CLIP}
        float r = length(vUv), fw = max(fwidth(r), 1e-4), a = atan(vUv.y, vUv.x);
        float line = 1.0 - smoothstep(3.5 * fw, 4.5 * fw, abs(r - 1.0));
        float k = floor((a / 6.28318 + 0.5) * 14.0), fa = fract((a / 6.28318 + 0.5) * 14.0) - 0.5;
        float hl = 1.12 + 0.25 * fract(sin(k * 12.9898 + vQ.a * 7.0) * 43758.5453);
        float hair = (1.0 - smoothstep(0.8 * fw, 1.7 * fw, abs(fa) * 6.28318 / 14.0 * r)) * step(1.06, r) * step(r, hl);
        gl_FragColor = vec4(vQ.rgb * max(line, hair * 0.8) * vQ.a, 0.0);
      }` });
  const rings = pool(world, quadGeo(), ringMat, MAX.ring, { iP: 4, iQ: 4 }, 'fx rings', { trans: true, cast: false, id: false, gbuf: false });

  const all = { sparks, fire, glow, smoke, rings };
  const F = {
    pools: all, MAX, stats: { sparks: 0, fire: 0, smoke: 0, rings: 0, glow: 0, peak: { sparks: 0, fire: 0, smoke: 0, rings: 0, glow: 0 } },
    begin() {
      for (const p of Object.values(all)) p.n = 0;
      const sub = !PV0 && typeof window !== 'undefined' && window.SCENE && window.SCENE._sub;
      if (sub) uStreak.value.set((sub.tf + 0.5) * SHUT_T, (0.5 - sub.tf) * SHUT_T); else if (!PV0) uStreak.value.set(SHUT_T / 2, SHUT_T / 2);
    },
    spark(p, v, w, heat) { if (NOSPARKS) return; const s = sparks; if (s.n >= s.max) return; const i = s.n++; s.A.iP.array.set([p[0], p[1], p[2], w], i * 4); s.A.iQ.array.set([v[0], v[1], v[2], heat], i * 4); },
    fire(p, r, heat, seed, a = 1, lit = 1) { if (NOFIRE) return; const s = fire; if (s.n >= s.max) return; const i = s.n++; s.A.iP.array.set([p[0], p[1], p[2], r], i * 4); s.A.iQ.array.set([heat, seed, a, lit], i * 4); },
    glow(p, r, c) { const s = glow; if (s.n >= s.max) return; const i = s.n++; s.A.iP.array.set([p[0], p[1], p[2], r], i * 4); s.A.iQ.array.set([c[0], c[1], c[2], 1], i * 4); },
    smoke(p, r, tone, seed, erosion, heat = 0) { const s = smoke; if (s.n >= s.max) return; const i = s.n++; s.A.iP.array.set([p[0], p[1], p[2], r], i * 4); s.A.iS.array.set([tone, seed, erosion, heat], i * 4); },
    ring(p, r, c, a) { const s = rings; if (s.n >= s.max) return; const i = s.n++; s.A.iP.array.set([p[0], p[1], p[2], r], i * 4); s.A.iQ.array.set([c[0], c[1], c[2], a], i * 4); },
    end() {
      for (const [k, p] of Object.entries(all)) {
        for (const a of Object.values(p.A)) { a.needsUpdate = true; a.clearUpdateRanges && a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, p.n) * a.itemSize); }
        p.ig.instanceCount = p.n; p.m.visible = p.n > 0;
        F.stats[k] = p.n; if (p.n > F.stats.peak[k]) F.stats.peak[k] = p.n;
      }
    },
  };
  return F;
}
