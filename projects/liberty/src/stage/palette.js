// liberty/src/stage/palette.js: the concert's colour (research/style.md §5, rules C1-C2): 2-3 hue families a section,
// each a 5-step ramp V .22/.42/.68/.89/.99, S .90/.85/.80/.74/.57, the hue drifting 26 deg toward yellow as it
// brightens; a light's core is its hue's V 1.0 form, never photographic white. Linear rgb out (the engine's light).
import { lin } from 'scene3d/util.js';

export const RAMP_V = [0.22, 0.42, 0.68, 0.89, 0.99], RAMP_S = [0.90, 0.85, 0.80, 0.74, 0.57], DRIFT = 26;

export function hsv(h, s, v) {
  h = ((h % 360) + 360) % 360 / 60;
  const c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}
// toward yellow (60 deg) by the shorter way round
const towardYellow = h => { const d = ((60 - h + 540) % 360) - 180; return Math.sign(d) || 1; };
// step k (0 darkest .. 4 brightest, fractional ok) of hue family h -> [h, s, v]
export function rampHSV(h, k) {
  const i = Math.max(0, Math.min(3.999, k)), a = Math.floor(i), f = i - a;
  const s = RAMP_S[a] + (RAMP_S[a + 1] - RAMP_S[a]) * f, v = RAMP_V[a] + (RAMP_V[a + 1] - RAMP_V[a]) * f;
  return [h + towardYellow(h) * DRIFT * (k / 4), s, v];
}
export const rampSRGB = (h, k) => hsv(...rampHSV(h, k));
export const rampLin = (h, k) => lin(rampSRGB(h, k));
// a light's colour: the family's step-3.4 tone (bright, still saturated: C3's beam core then reads as the hue's own
// pale form once the frame's tone map lifts it), normalised to unit luminance so intensity alone sets the brightness
const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const LIGHT_STEP = +(qs.get('lightstep') || 3.4);
export function lightCol(h, k = LIGHT_STEP) {
  const c = rampLin(h, k), Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return c.map(x => x / Math.max(Y, 1e-3));
}
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// the looks: each section's hue families (deg), what each is for, and its LED wall's pattern
//   hues[0] the key family, hues[1] the accent, hues[2] (optional) a third for the peaks; a family's hue is its darkest
//   step's (Uma's gold: 23 deg at V .22 drifting to 49 at V .99, so a gold family is 24, not 40)
export const LOOKS = {
  dawn: { hues: [226, 26], wall: 0, about: 'blue hour into the first light: deep blue with a warm amber accent' },
  verse: { hues: [196, 276], wall: 1, about: 'teal and violet, gobo-cut beams, slow' },
  build: { hues: [24, 322], wall: 2, about: 'gold rising into magenta, the chases speeding up' },
  drop: { hues: [306, 202, 30], wall: 3, about: 'magenta and cyan (the concept frame), gold-white strobes on the beats' },
  break: { hues: [238, 30], wall: 4, about: 'one deep blue, one pale gold pillar' },
  bridge: { hues: [138, 218], wall: 5, about: 'laser green and blue' },
  final: { hues: [4, 24, 306], wall: 6, about: 'fire: red and gold with a magenta edge' },
  outro: { hues: [266, 212], wall: 7, about: 'violet cooling to blue, then out' },
};
