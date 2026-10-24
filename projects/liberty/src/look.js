// liberty/src/look.js: the world's look (the integrator's): the anime night over the bay, set after the engine's time of
// day each frame (world.onFrame runs after sky.js applyTime), and the style and post dials. Targets: research/style.md
// K1-K5 (the night sky: one saturated hue band, hue 205-218 deg, zenith V 0.15-0.45 S 0.5-0.7, brighter and less
// saturated toward the horizon; the city's glow a desaturated band; stars few and high) and site.md §5-7 (a clear
// night, 87 % of late-October evenings; no moon until 23:31; the city's warm glow to the south).
//
// The night's key light: no moon, so the brightest diffuse light is the city's glow from downtown (bearing ~165 deg)
// low in the sky; dim, warm grey. The sky's glow band follows the key (sky.js skyPalette), so it lies over the city.
import * as P from './plan.js';

const T = window.THREE;
const q = new URLSearchParams(location.search);
const lin = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255].map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the grade by the hour, blended by the night factor (gradeDay off: the night is graded too). Fitted by lookstats
// (projects/niwa/tools/lookstats.py) on 3 cameras x 2 show moments at 19.1 solar against the anime references
// (research/style.md frames: 10 night harbour, 9 concert): night L* 23.5 (refs 23.7), at the drop 28.3 (28.0);
// colourfulness 35.6 / 43.8 (refs 30.1 / 56.4). Day: lit steel was V 0.62-0.66 against style.md S1's 0.40-0.45 (B1)
export const GRADE = {
  day: { exposure: 1.15, saturation: 1.05, contrastLog: 0.2 },
  night: { exposure: 1.25, saturation: 1.35, contrastLog: 0.35 },
  // twilight (the sun 0 to -10 deg): the physical sky is honestly dark there; anime's blue hour is luminous: a lift on
  // the blend, peaking between sunset and nautical dusk
  twilight: { exposure: +(q.get('twexp') ?? 2.8), saturation: 1.1, peak: -4, width: 4.5 },          // fitted: L* 28.5-30, spread 18 (dusk refs 30.1, 17.5)
};
// the night's colours (display sRGB targets; the dials below scale them into the frame's radiance)
export const NIGHT_LOOK = {
  zenith: '#0a1d4a', horizon: '#4f6f90', glow: '#7a7b88', ground: '#3f5878',     // (ground: below the horizon, the haze's colour: the 50 km edge melts into it, B6)
  key: { bearing: 165, elev: 24, col: '#9b938a', k: 0.06 },          // the city's glow as a key: dim, warm grey
  amb: '#2b3f5c', ambG: '#141b26', tint: '#9fb0d8',
  skyGain: 1.0, ambGain: +(q.get('nightamb') ?? 0.8), clouds: 0.0,
  // the night's ground fog: sky.js's ~0.0035/m (a 1 km visibility) against site.md §5's 16 km+ in 98 % of late-October
  // evening hours (it buried Treasure Island and the far shores' lights: B6); the far land layers its own depth
  fogNight: +(q.get('nightfog') ?? 0.06),          // (a clear night: the few clouds at 0.08 drew as dark smudges; the look round decides)
};

export function installLook(N) {
  const U = N.pipe.U, L = NIGHT_LOOK;
  // the style: the toon ramp with designed shade colours and ink lines (anime), sharper highlights
  U.uStyle.value.set(0.35, 0.02, 0.15, 1.0);          // ramp softness, threshold, realism (0 toon .. 1 lambert), shadow saturation
  U.uStyle2.value.set(0.45, 0.65, 0.0, 1.0);          // rim, spec sharpness, shadow lift, outline strength
  Object.assign(N.pipe.post, { lines: 1.0, lineFar: 160, lineColor: 0.42, bloom: 0.12, bloomThreshold: 1.4, exposure: 1.4,
    saturation: 1.1, contrast: 1.0, contrastLog: 0.15, vignette: 0.16, grain: 0.004, rays: 0.0, tonemap: 2, gradeDay: 0 });
  const fixed = new Set((q.get('post') || '').split(',').map(kv => kv.split(':')[0]).filter(Boolean));   // (a ?post= dial wins)
  const SU = N.pipe.sky.material.uniforms;
  const keyDir = (() => { const [x, z] = P.atBearing(L.key.bearing, 1), e = L.key.elev * Math.PI / 180; return new T.Vector3(x * Math.cos(e), Math.sin(e), z * Math.cos(e)).normalize(); })();
  N.world.onFrame(() => {
    const night = U.uNight.value;
    SU.uCloud.value.x = +(q.get('clouds') ?? L.clouds);
    const elev = N.tod ? N.tod.elev : 10, tw = Math.exp(-(((elev - GRADE.twilight.peak) / GRADE.twilight.width) ** 2));
    for (const k of Object.keys(GRADE.day)) if (!fixed.has(k)) N.pipe.post[k] = GRADE.day[k] + (GRADE.night[k] - GRADE.day[k]) * night;
    if (!fixed.has('exposure')) N.pipe.post.exposure *= 1 + (GRADE.twilight.exposure - 1) * tw;
    if (!fixed.has('saturation')) N.pipe.post.saturation *= 1 + (GRADE.twilight.saturation - 1) * tw;
    if (night <= 0) return;
    const mix3 = (u, hex, g = 1) => { const a = u.value, b = lin(hex); u.value.set(a.x + (b[0] * g - a.x) * night, a.y + (b[1] * g - a.y) * night, a.z + (b[2] * g - a.z) * night); };
    mix3(U.uSkyZenith, L.zenith, L.skyGain); mix3(U.uSkyHorizon, L.horizon, L.skyGain); mix3(U.uSkyGlow, L.glow, L.skyGain); mix3(U.uSkyGround, L.ground);
    mix3(U.uAmbSky, L.amb, L.ambGain); mix3(U.uAmbGround, L.ambG, L.ambGain); mix3(U.uShadowTint, L.tint); mix3(U.uFogColor, L.horizon);
    U.uFog.value.x *= 1 + (L.fogNight - 1) * night;
    // no moon tonight (it rises at 23:31): the disc below the horizon; the key is the city's glow. Its direction turns
    // from the set sun's to the city's over the dusk (night 0.3 -> 0.9): the sky's palette glow reads uSunDir, and a
    // swap at night 0.5 jumped the whole sky pink -> blue in one frame at civil dusk (B9's tour time-lapse; dE 4.2
    // looking south against a 0.15 median step)
    // (from the true sun every frame: the engine's own key swaps to the moon at night 0.5, another one-frame jump)
    if (night > 0.3) U.uSunDir.value.copy(U.uTrueSun.value).lerp(keyDir, smooth(0.3, 0.9, night)).normalize();
    if (night > 0.5) {
      U.uMoonDir.value.set(0, -1, 0);
      const k = lin(L.key.col).map(c => c * L.key.k * smooth(0.5, 1.0, night));
      U.uSunColor.value.set(k[0], k[1], k[2]);
    }
  });
}
