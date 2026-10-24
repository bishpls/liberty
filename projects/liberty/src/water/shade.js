// liberty/src/water/shade.js: the surface's colour (smain): the physics first, then the anime treatment (style.md §2).
//   physics    Fresnel (water's F0 0.02) between the water's body (turbid: what lies under the surface, absorbed and
//              hidden by the murk within a metre or two, lit by the sky, the lamps and the spots) and the reflection
//              (RT_REFL read along the perturbed normal; the roughness's slope variance spreads it along the view);
//              the lamps' and spots' glitter (Beckmann on the same variance): the columns under every light
//   anime      W1/W6 the plate in flat value steps round one hue, from the mirror image's broad tones; the lights'
//              reflection the glitter pass's (lights.js: the physics' own, every light in the mirror image off the
//              facets, at a named gain); W6 crest lines and foam as line shapes; W8 dark swell shapes. Each step is a
//              dial (uLook*), 0 the physical frame. (Until round 6 W2's dashes, W3's ticks and W4's glints drew the lights
//              by rules of their own: board/water/notes.md)
import { SURFACE_GLSL } from './surface.js';
import { EVENTS_GLSL } from './events.js';

export const SHADE_GLSL = SURFACE_GLSL + /* glsl */`
// (uReflDash: the planar reflection itself; uReflEx: its lights (the reflection less its broad tones, lights.js), its
// depth in alpha; uLight: the lights' reflection on the water, the glitter pass's at half the frame's size)
uniform sampler2D uReflDash; uniform sampler2D uReflEx; uniform sampler2D uLight; uniform float uLightGain; uniform float uSourceK; uniform vec4 uStroke; uniform float uPileLine; uniform sampler2D uRefr; uniform sampler2D uG; uniform mat4 uReflMatrix;
uniform vec3 uBody;              // the body's albedo (linear): turbid green-teal
uniform vec4 uBodySky;           // the night body, drawn: x its share of the sky's horizon colour at grazing, y the share looking down
uniform vec3 uAbsorb;            // its attenuation (1/m)
uniform vec4 uLook;              // tones (0 smooth .. 1 three flat steps), dashes, the dash value share (0.78), mirror hold-up
uniform vec4 uLook2;             // glint gain, crest lines, foam, swell shapes
uniform vec4 uLook3;             // spot pool gain, lamp gain, glitter gain, the tone steps' spread
uniform vec4 uPlate;             // the body's gain, the mirror's gain, the mirror's share looking down, at grazing
uniform vec4 uSteps;             // the four flat values (x the reference): darkest, dark, mid, light
uniform vec3 uCuts;              // where the plate's value (x the reference) crosses into the next step
uniform vec3 uFoam;              // W6's foam at night (linear; scaled by the sky's light)
uniform vec2 uWindDir;           // the wind's direction (downwind, world xz): the slicks' windrows
#ifdef WATER_TWO_PASS
uniform sampler2D uState0; uniform sampler2D uState1; uniform sampler2D uState2;   // the sea's state (state.js)
#endif
uniform vec4 uWS[80]; uniform int uNumWS;   // the stage's spots reaching the water, culled on the CPU (index.js), 5 vec4 each
uniform vec4 uDbg2;              // (cost probes: wakes off, ticks off, -, lamp loop off)
${EVENTS_GLSL}

// the reflection along a normal: the scene point D metres along the mirrored ray, as the mirrored camera saw it
vec3 reflAlong(vec3 P, vec3 V, vec3 Nn, float D) {
  vec3 Rk = reflect(-V, Nn); Rk.y = max(Rk.y, 0.002);
  vec4 c = uReflMatrix * vec4(P + Rk * D, 1.0);
  vec2 u = clamp(c.xy / c.w * 0.5 + 0.5, 0.001, 0.999);
  return texture(uReflDash, u).rgb;
}
// the same, the mirror image's broad tones only: its lights are the glitter pass's (the reflection less its lights, as
// lights.js cut them, at the mirror image's own resolution: its dark shapes stay sharp)
vec3 bgAlong(vec3 P, vec3 V, vec3 Nn, float D) {
  vec3 Rk = reflect(-V, Nn); Rk.y = max(Rk.y, 0.002);
  vec4 c = uReflMatrix * vec4(P + Rk * D, 1.0);
  vec2 u = clamp(c.xy / c.w * 0.5 + 0.5, 0.001, 0.999);
  return max(texture(uReflDash, u).rgb - textureLod(uReflEx, u, 0.0).rgb, 0.0);
}
float vmax(vec3 c) { return max(c.r, max(c.g, c.b)); }
// the sky in a direction: at full night the designed palette alone (skyBase would pay for the physical sky's table at weight 0)
// (the physical table's few rows next to the horizon read dark (its ground below): the water's reference, the sky a
// ripple tilts the mirror toward, read it as a dark band at the one distance where the eye's depression plus the
// roughness met it (the pale arc of the director's review); the table is read 3.4 deg up at the lowest)
vec3 skyAt(vec3 v) { return uNight > 0.999 || uSkyMode < 0.5 ? skyPalette(v) : mix(skyLUT(normalize(vec3(v.x, max(v.y, 0.06), v.z))), skyPalette(v), uNight); }

// the spots' gobos (glsl.js GOBO_GLSL, the same patterns: the water compiles without the engine's SPOTS loop)
float spotGoboW(vec3 L, vec3 D, float cosO, float gobo, float rot) {
  if (gobo < 0.5) return 1.0;
  vec3 u = normalize(cross(D, abs(D.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), v = cross(D, u);
  float sinO = sqrt(max(1.0 - cosO * cosO, 1e-6));
  vec2 q = vec2(dot(L, u), dot(L, v)) / sinO;
  float c = cos(rot), sn = sin(rot); q = mat2(c, sn, -sn, c) * q;
  float r = length(q), a = atan(q.y, q.x);
  int g = int(gobo + 0.5);
  if (g == 1) { float aa = mod(a + PI / 6.0, PI / 3.0) - PI / 6.0; vec2 p = vec2(cos(aa), sin(aa)) * r; return max(smoothstep(0.2, 0.15, length(p - vec2(0.62, 0.0))), smoothstep(0.17, 0.12, r)); }
  if (g == 2) return smoothstep(0.16, 0.08, abs(sin(a * 4.0)) * r) * smoothstep(0.05, 0.12, r) + smoothstep(0.1, 0.05, r);
  if (g == 3) return smoothstep(-0.05, 0.25, vnoise(q * 2.6 + 3.7) + 0.4 * vnoise(q * 6.1 - 1.3));
  if (g == 4) return smoothstep(0.1, 0.05, abs(r - 0.72));
  if (g == 5) return smoothstep(0.11, 0.06, abs(fract(q.x * 1.5 + 0.5) - 0.5));
  return 1.0;
}
void smain(inout Surface s, vec3 P, vec3 V) {
  vec2 dpx = dFdx(P.xz), dpy = dFdy(P.xz);
  float fp = max(length(dpx), length(dpy));
  vec4 env = envAt(P.xz);
  vec3 hn = hullAt(P.xz);
#ifdef WATER_MASK
  // (where no module draws the land or her hull: a solo render) the water stops at the shore and her side; a discard
  // costs the whole surface its early depth test, so a complete world draws without it
  if (landAt(P.xz) > 0.5 && env.r <= 0.0) discard;
  if (uMaskHull > 0.5 && hn.x < -0.2) discard;
#endif
  s.N = vec3(0.0, 1.0, 0.0);
#if defined(PASS_COLOR) && (WCOST & 256)
  s.albedo = vec3(0.0); s.emissive = vec3(0.02, 0.04, 0.06); s.spec = 0.0; s.rim = 0.0; s.shadowMul = 0.0; s.env = 0.0;
#elif defined(PASS_COLOR)
  // the sea, its events and the wakes: the state pass's (state.js), at this pixel
#ifdef WATER_TWO_PASS
  ivec2 scr = ivec2(gl_FragCoord.xy);
  vec4 s0 = texelFetch(uState0, scr, 0), s1 = texelFetch(uState1, scr, 0), s2 = texelFetch(uState2, scr, 0);
  vec2 sl = s0.xy; float uvar = s0.z, rvar = s0.w;
  gShape = s1.xy; gShapeH = s1.z; gShapeVar = s1.w; gShapeHVar = s2.x;
  vec4 ev = vec4(0.0, 0.0, 1.0, s2.y);
  float wcusp = s2.w, wcode = s2.z;
  float pileL = max(-wcusp, 0.0); wcusp = max(wcusp, 0.0);   // (state.js: a pile's wake line comes negative)
#else
  // (in one pass: the same as state.js's, here; ?wpass=2 splits them, measured no faster: notes.md)
  float uvar, rvar, efoam, wcusp, wvar;
  vec4 seaS = seaAt(P.xz, dpx, dpy, hn, uvar, rvar);
  vec4 ev = eventsAt(P.xz, uTime, fp, dpx, dpy, efoam);
  vec4 wk = wakesAt(P.xz, fp, wcusp, wvar);
  vec2 sl = seaS.xy * ev.z + ev.xy + wk.xy;
  uvar = uvar * ev.z * ev.z + wvar; rvar *= ev.z * ev.z;
  // (the wakes stay out of the drawn scale's tones: a boat's transverse waves near the eye drew a field of regular
  // rings (the director's review); they show in the mirror's slope, the cusp lines and the churn)
  float wch = wk.w * (0.55 + 0.3 * vnoise(P.xz * 0.28 + uTime * 0.05) + 0.15 * vnoise(P.xz * 0.9 - uTime * 0.1)), wchw = fwidth(wch) + 1e-3;
  float wfoam = max(saturate(efoam) * uLook2.z, smoothstep(0.5 - wchw, 0.5 + wchw, wch) * 0.85);
  float pline, pfoam = pilesAt(P.xz, env.gb, fp, pline);       // (the piles in the ebb: piles.js)
  wfoam = max(wfoam, pfoam); float pileL = pline > wcusp ? pline : 0.0;
  float wcode = gRingLine > 0.004 ? 1.0 + saturate(gRingLine) : wfoam;
#endif
  vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
  float dist = length(P - cameraPosition);
  vec3 fw = normalize(vec3(-V.x, 0.0, -V.z) + 1e-5), sdw = vec3(-fw.z, 0.0, fw.x);   // forward along the water, sideways
  float sgu = sqrt(max(uvar * 0.5, 1e-6)), sgr = sqrt(max(rvar * 0.5, 1e-8));        // unresolved, resolved slope (per axis)
  float cosv = saturate(dot(N, V));
  float F = 0.02 + 0.98 * pow(1.0 - cosv, 5.0);
  bool anime = uLook.x > 0.5;
  // the parallax of the mirrored scene: what a ripple shows lies a few metres off for near things, farther for far ones
  float D = 6.0 + 0.12 * dist;
  // ---- the body: what lies under the surface, absorbed; the murk lit by what reaches it
  vec2 suv = gl_FragCoord.xy / uResolution;
  float zb = texture(uG, suv).z, zw = vViewZ;
  // what lies under the surface (her hull below the waterline, the piles): seen through a metre or two of turbid water,
  // displaced by the surface; beyond ~6 m of water only the murk (no reads)
  float path = 50.0; vec3 bottom = vec3(0.0);
  float thickW = max(zb - zw, 0.0) * length(P - cameraPosition) / max(zw, 1e-3);   // (along the ray, m: the water to what lies behind it)
#if (WCOST & 16)
  if (false) {
#else
  // (nothing behind it in the G-buffer, z 0: the sky beyond the near box's sea bed, where the bay is deep: the murk, never
  // the sky seen through the water: from a height that read as a pale bay round the box, B6's report)
  if (zb > 0.0 && zb - zw < 6.0 / max(0.35 + 0.65 * abs(V.y), 0.1)) {
#endif
    vec2 ruv = suv + N.xz * 0.05 * saturate(max(zb - zw, 0.0));
    if (texture(uG, ruv).z < zw) ruv = suv;
    path = max(texture(uG, ruv).z - zw, 0.0) * (0.35 + 0.65 * abs(V.y));
    bottom = texture(uRefr, ruv).rgb;
  }
  float skyV = skyUnder(env);                                       // (under a deck: the cave it is)
  vec3 E = (uAmbSky * 0.9 + uSunColor * max(uSunDir.y, 0.0)) * skyV;   // the sky's and the key's light into the water
  vec3 glitL = vec3(0.0);
  float sgT = sqrt(max(uvar * 0.5, 2e-4));
  // the lamps: their pools in the water's body; their glitter in the physical frame (drawn, a lamp's reflection is its
  // bulb's in the mirror image: the glitter pass's, lights.js; its own glints here double-counted it)
  for (int i = 0; i < 24; i++) {
#if (WCOST & 8)
    break;
#endif
    if (i >= uNumLights || uDbg.y < 0.5 || uDbg2.w > 0.5) break;
    vec3 lp = uLightPos[i].xyz - P; float dl = length(lp);
    // (a lamp's reflection comes from its own bulb in the mirror image: here only its light, within its reach)
    if (dl > uLightPos[i].w) continue;
    vec3 ld = lp / dl;
    float att = pow(saturate(1.0 - pow(dl / uLightPos[i].w, 4.0)), 2.0) / (1.0 + dl * dl * 1.5);
    vec3 Li = uLightCol[i].rgb * att;
    E += Li * saturate(ld.y) * uLook3.y;
    if (!anime) {
      vec3 Hh = normalize(ld + V);
      float nh = max(dot(N, Hh), 0.05), t2 = (1.0 - nh * nh) / (nh * nh);
      float Dm = exp(-t2 / (2.0 * sgT * sgT)) / (6.2832 * sgT * sgT * nh * nh * nh * nh);
      glitL += Li * Dm * (0.02 + 0.98 * pow(1.0 - saturate(dot(V, Hh)), 5.0)) / (4.0 * max(cosv, 0.05)) * uLook3.z;
    }
  }
  // the stage's spots that reach the water (index.js: the engine's table culled to the cones that meet y = 0 within
  // their range, at most 16, each as the engine packs it): their pools in the water's body (their lenses' reflections:
  // the mirror image's, the glitter pass's)
  for (int i = 0; i < 16; i++) {
#if (WCOST & 8)
    break;
#endif
    if (i >= uNumWS || uDbg.y < 0.5) break;
    vec4 sa = uWS[i * 5], sb = uWS[i * 5 + 1], sc = uWS[i * 5 + 2], se = uWS[i * 5 + 3], sf = uWS[i * 5 + 4];
    vec3 lp = sa.xyz - P; float d2 = dot(lp, lp);
    if (d2 > sa.w * sa.w * 4.0) continue;
    float dl = sqrt(d2); vec3 ld = lp / max(dl, 1e-4);
    float cd = dot(-ld, sb.xyz);
    if (cd < sb.w) continue;
    if (se.z > 0.0 && cd * dl < se.z) continue;
    if (dot(sf.xyz, P) < sf.w - 0.05) continue;
    float cone = smoothstep(sb.w, sc.w, cd) * spotGoboW(-ld, sb.xyz, sb.w, se.x, se.y);
    float att = 100.0 / max(d2, se.z * se.z) * pow(saturate(1.0 - pow(dl / sa.w, 4.0)), 2.0);
    vec3 Li = sc.rgb * att * cone;
    E += Li * saturate(ld.y) * uLook3.x;
    if (!anime) {
      vec3 Hh = normalize(ld + V);
      float nh = max(dot(N, Hh), 0.05), t2 = (1.0 - nh * nh) / (nh * nh);
      float Dm = exp(-t2 / (2.0 * sgT * sgT)) / (6.2832 * sgT * sgT * nh * nh * nh * nh);
      glitL += Li * Dm * (0.02 + 0.98 * pow(1.0 - saturate(dot(V, Hh)), 5.0)) / (4.0 * max(cosv, 0.05)) * uLook3.z;
    }
  }
  // (at night the body as drawn: the sky's horizon hue, a step under it at grazing and darker looking down (W1: the
  // night sea round one hue tied to the sky). Until 2026-10-23 an empty G-buffer behind the water showed the sky dome
  // through it, which is what this look was tuned on; from a height that read pale, so the share falls as the view steepens)
  vec3 murk = max(uBody * E, uSkyHorizon * uBodySky.x * mix(uBodySky.y, 1.0, pow(1.0 - saturate(V.y), 4.0)) * skyV * uNight);
  float tsc = exp(-path * 1.2);
  vec3 under = bottom * exp(-uAbsorb * path) + murk * (1.0 - tsc);
  vec3 col; vec3 foamC = uFoam * clamp(luma(uAmbSky) / 0.048, 0.6, 6.0);
  if (!anime || (WCOST & 4) != 0) {
    // ---- the physical frame: the mirror spread by the roughness along the view, the lamps' glitter
    vec3 refl = vec3(0.0); float wsum = 0.0;
    for (int k = -2; k <= 2; k++) {
      float wt = exp(-0.28 * float(k * k));
      refl += reflAlong(P, V, normalize(N + fw * float(k) * 0.75 * sgu), D) * wt; wsum += wt;
    }
    col = mix(under, refl / wsum, F) + glitL;
  } else {
    // ---- the anime frame (style.md §2): the physical plate posterized against its own smooth reference
    // the reference: the body and the sky it mirrors at the mean surface (smooth: no waves)
    vec3 R0 = reflect(-V, vec3(0.0, 1.0, 0.0)); R0.y = max(R0.y, 0.004);
    // (the roughness lifts it a little, capped: a rough patch (a wake's unresolved waves) turned it to the zenith, a dark
    // reference the plate never had, and the steps read a pale arc there)
    vec3 skyR = skyAt(normalize(R0 + vec3(0.0, min(2.0 * sgu, 0.06), 0.0))) * skyV;
    float graze = pow(1.0 - saturate(V.y), 4.0);
    float m = mix(uPlate.z, uPlate.w, graze);                         // the mirror's share: the body near, the sky far
    vec3 bodyC = under * uPlate.x;
    vec3 ref = mix(bodyC, skyR * uPlate.y, m);
    // the plate: the same, with the scene mirrored at the resolved surface (her hull darkens it; its broad tones only: what
    // its lights add is the glitter pass's, below, where until round 6 the plate's steps and the drawn mirror's lights
    // counted them again)
    vec3 obj = bgAlong(P, V, N, D);
    vec3 plate = mix(bodyC, obj * uPlate.y, m);
    // the drawn waves (13+ px a wavelength): a facet tilted away from the eye mirrors lower, brighter sky; where the
    // drawn waves still tilt the mirror (the open bay, near the eye) they carve the three tones (W1, W6), else the
    // water is a mirror (W7: the lee)
    float sgs = sqrt(max(gShapeVar * 0.5, 1e-8)), shs = sqrt(max(gShapeHVar, 1e-10));
    // (along the view at grazing, the slope is what tilts the mirror; seen from above a wave shows by its form: crests
    // light, troughs dark. The tone reads both, by the view's grazing)
    float graz = smoothstep(0.25, 0.9, 1.0 - V.y);
    // (normalised by the drawn sea's own spread, floored at what a drawing would show: 2 cm of height, 0.03 of slope;
    // in the lee, where the wind sea is a few millimetres, a far wake's centimetre must not flip the tones)
    float x = mix(gShapeH / max(shs, 0.02) * 0.9, dot(-gShape, fw.xz) / max(sgs, 0.03), graz);
    float sea = smoothstep(0.004, 0.02, sgs);
    float v = vmax(plate) / max(vmax(ref), 1e-4);
    v *= mix(1.0, x > 0.84 ? 1.45 : x < 0.0 ? 0.74 : 1.0, sea);     // (the tones' shares 50 / 30 / 20 %, 01 and 66)
    // W8 dark swell shapes: calm patches (the slicks every harbour carries), drifting on the current (two staggered
    // phases of a 20 s cycle: offsets bounded, never t times the field's varying speed)
    vec2 cur = env.gb;
    float cyc = fract(uTime / 20.0), cyc2 = fract(uTime / 20.0 + 0.5);
    // (slicks lie in windrows along the wind, a few metres wide and tens long: 6:1 streaks; seen from afar, W8's ellipses)
    vec2 wd = normalize(uWindDir), wq = vec2(wd.y, -wd.x);
    vec2 pa = P.xz - cur * cyc * 20.0, pb = P.xz - cur * cyc2 * 20.0;
    vec2 sqa = vec2(dot(pa, wd) * 0.022, dot(pa, wq) * 0.13), sqb = vec2(dot(pb, wd) * 0.022, dot(pb, wq) * 0.13);
#if (WCOST & 64)
    float sl0 = 0.0;
#else
    float sl0 = vnoise(sqa + 3.1) + 0.45 * vnoise(sqa * 2.7 + 7.7);
#endif
    float sl1 = vnoise(sqb + 9.4) + 0.45 * vnoise(sqb * 2.7 + 1.3);
    float slick = mix(sl0, sl1, abs(cyc * 2.0 - 1.0));
    float swell = step(0.7, slick) * smoothstep(25.0, 60.0, dist) * uLook2.w;
    v = mix(v, min(v, 0.78), swell);
    // the steps: four flat values round the reference (the darkest for what darker things mirror, and the swell
    // shapes), anti-aliased over a pixel
    float vw = fwidth(v) * 0.6 + 1e-3;
    float stepv = uSteps.x;
    stepv = mix(stepv, uSteps.y, smoothstep(uCuts.x - vw, uCuts.x + vw, v));
    stepv = mix(stepv, uSteps.z, smoothstep(uCuts.y - vw, uCuts.y + vw, v));
    stepv = mix(stepv, uSteps.w, smoothstep(uCuts.z - vw, uCuts.z + vw, v));
    // the colour: the reference's hue (one hue round the sky's, W1), a touch more saturated in the darks
    vec3 base = ref * stepv;
    if (uDbg.w > 4.5 && uDbg.w < 14.5) { s.albedo = vec3(0.0); s.spec = 0.0; s.rim = 0.0; s.shadowMul = 0.0; s.env = 0.0;   // (debug views 5-12: the plate's terms)
      float dw_ = uDbg.w; s.emissive = dw_ < 5.5 ? under : dw_ < 6.5 ? ref : dw_ < 7.5 ? skyR : dw_ < 8.5 ? plate : dw_ < 9.5 ? base : dw_ < 10.5 ? vec3(sea) * 0.2 : dw_ < 11.5 ? vec3(m) * 0.2 : dw_ < 12.5 ? vec3(stepv) * 0.1 : dw_ < 13.5 ? vec3(sgu * 2.0) : dw_ < 14.5 ? vec3(sgr * 2.0) : vec3(R0.y * 2.0); return; }
    // the lights' reflection (B3, round 6): the glitter pass's (lights.js), the expected radiance of every light in the
    // mirror image off this pixel's facets, as the physics places, sizes and weighs it, in the source's own colour, at
    // the named gain (uLightGain, ?wgain=). It replaces W2's dashes, W3's ticks, W4's glints and the drawn mirror's
    // lights, which drew a light's reflection by rules of their own: the director's second cut (2026-10-23) found their
    // intensity and size against the lights they mirrored exaggerated and their flicker at a distance glitchy
    vec3 Lg = texture(uLight, suv).rgb * uLightGain * uSourceK;
    // near the eye, where the waves are resolved, the reflection is broken by them already (the physics: a facet tilted
    // to carry the light, or not); drawn, the break is sharpened into strokes: the light term weighted by its own
    // luminance over its local mean's (the glitter pass's mips, ~2^uStroke.w half-size pixels), normalised by the local
    // mean of its square (the pass's alpha), so the local energy is the physics' exactly: the bright facets brighter, the
    // dim ones dimmer, nothing added. Over the resolved share of the slopes (uStroke.x on); far off, where the facets
    // are unresolved, the reflection stays as continuous and still as the physics has it. (A posterized step at a level
    // over the local mean lost 30% of the light at 57.5, where the near reflection is smooth: measured)
    float rsh = sgr / (sgr + sgu + 1e-5), stk = smoothstep(0.35, 0.6, rsh) * uStroke.x;
    vec4 Lm4 = textureLod(uLight, suv, uStroke.w);
    float m1 = luma(Lm4.rgb), m2 = Lm4.a / 900.0, lp = luma(texture(uLight, suv).rgb);
    Lg *= mix(1.0, min(lp * m1 / max(m2, 1e-12), uStroke.y), stk);
    col = base + Lg;
    if (uDbg.w > 14.5 && uDbg.w < 15.5) { s.emissive = Lg; return; }                       // (debug 15: the lights' reflection alone)
    if (uDbg.w > 19.5) { vec4 cdp = uReflMatrix * vec4(P + R0 * D, 1.0); vec2 ud = clamp(cdp.xy / cdp.w * 0.5 + 0.5, 0.001, 0.999);
      s.emissive = uDbg.w > 20.5 ? textureLod(uReflEx, ud, 0.0).rgb : texture(uReflDash, ud).rgb; return; }   // (20: the true mirror image, as the water samples it; 21: its lights)
    // W6: the wakes' cusp lines and churn as drawn foam (the plate lightened toward the foam's pale)
    float cw = fwidth(wcusp) + 1e-3;
    col = mix(col, foamC, smoothstep(0.45 - cw, 0.45 + cw, wcusp) * 0.9);
    // the piles' wake lines (piles.js, events.js pilesAt): the turbulent strip's streaks, the V, the swirls, drawn as the
    // water roughened, a sixth of the way to foam (uPileLine, ?wpileline=): at full foam every pile in an ebb threw a
    // carpet of white lines, the water off the pier at blue hour scribbled white (the tour's T4, 31-43 s, B9's read;
    // ?wpiles=0 took them all; at a third they still read as white scribble)
    float pw_ = fwidth(pileL) + 1e-3;
    col = mix(col, foamC, smoothstep(0.45 - pw_, 0.45 + pw_, pileL) * uPileLine);
    // W6 crest lines: the drawn waves' crests as contours (height at +1.15 sigma), 1-2 px, the plate lightened
    float hz = gShapeH / shs, hw = fwidth(hz) * 0.8 + 1e-3;
    // (looking straight down every crest's contour made a mesh: drawn only obliquely; far off, where only the longest
    // band is still drawn, one crest's contour ran straight across the frame (a seam in the director's review): only
    // within ~100 m, and broken into lengths a few metres long, as a hand draws crests)
    float crest = (1.0 - smoothstep(0.0, hw, abs(hz - 1.15))) * sea * uLook2.y * smoothstep(0.85, 0.6, V.y)
      * smoothstep(110.0, 50.0, dist) * smoothstep(-0.1, 0.25, vnoise(P.xz * 0.22 + 4.7));
    col = mix(col, ref * uSteps.w * 1.3, saturate(crest));
  }
#if !(WCOST & 32)
  // ---- the froth line (W6, the brief): where anything stands in the water (her plating, the piles, the seawall, the
  // barge, a boat, a sea lion) the depth behind the surface runs to nothing: a pale line a hand wide (at least a
  // pixel and a half), broken by drifting foam, swelling where the drawn waves run high against her
  float pxw = fp * 1.5;
  float slap = saturate(0.5 + gShapeH / max(sqrt(max(gShapeHVar, 1e-10)) * 2.5, 1e-5));
  float fw0 = max(0.08 + 0.22 * slap, pxw);
  float brk = vnoise(P.xz * 1.7 + vec2(uTime * 0.31, -uTime * 0.23)) * 0.5 + vnoise(P.xz * 5.3 - uTime * 0.4) * 0.5;
  float froth = (1.0 - smoothstep(fw0 * 0.6, fw0, thickW)) * smoothstep(-0.35, 0.1, brk) * step(0.001, zb - zw) * uLook2.z;
  col = mix(col, foamC + E * 0.02, saturate(froth) * 0.9);
  // ---- foam: the events' white water
  col = mix(col, foamC + E * 0.02, wcode <= 1.0 ? wcode : 0.0);     // (the events' white water and the wakes' churn; over 1 the code is E7's ring)
  col = mix(col, foamC * 1.6 + E * 0.03, saturate(wcode - 1.0));    // (E7's ring line)
#endif
  col *= 1.0 - 0.5 * saturate(ev.w);
  if (uDbg.w > 0.5 && uDbg.w < 1.5) col = vec3(0.5 + gShapeH * 4.0, saturate(wcode), 0.5 + wcusp);   // (debug: the drawn scale's height, the white water, the cusps)
  if (uDbg.w > 1.5 && uDbg.w < 2.5) col = vec3(0.5 + gShapeH * 10.0);                               // (debug 2: the drawn scale's height)
  if (uDbg.w > 2.5 && uDbg.w < 3.5) col = vec3(0.5 + sl.x * 3.0, 0.5 + sl.y * 3.0, 0.5);          // (debug 3: its slope)
  if (uDbg.w > 3.5) col = vec3(0.5 + gShapeH * 10.0, 0.5 + gShape.x * 3.0, 0.5 + gShape.y * 3.0); // (debug 4: the drawn scale)
  s.albedo = vec3(0.0); s.emissive = col; s.spec = 0.0; s.rim = 0.0; s.shadowMul = 0.0; s.env = 0.0;
  s.N = N;
#endif
}`.replace(/G_/g, '9.81');
