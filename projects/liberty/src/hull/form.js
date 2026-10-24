// liberty/src/hull/form.js: the hull's moulded form (B1), in ship coordinates (plan.js SHIP: x starboard, abl metres above
// the baseline, z aft from midships). Everything that shapes the shell reads this one object, so the shell, the decks,
// the waterline and the measures agree:
//   hb(z, h)     the moulded half-breadth at (z, h): 0 on the profile (the centreline plane) and outside it
//   zFwd(h)      the profile's forward edge at height h (the stem, rounding into the keel at the forefoot)
//   zAft(h)      its after edge (the propeller post below the aperture's top, the cruiser stern's counter above)
//   side(z)      the deck at side (the sheer), rail(z) the bulwark's top
// Sources: HAER VA-132 sheet 19 (the lines plan), digitised into lines_data.js (tools: board/hull/notes.md); where the
// digitised table is missing this falls back to a parametric form fitted to research/ship.md's numbers (v0).
import { LINES } from './lines_data.js';

const FT = 0.3048;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// a piecewise-linear table [[x, y], ...] (x ascending)
export const interp = (tab, x) => {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, a] = tab[i - 1], [x1, b] = tab[i]; return a + (b - a) * (x - x0) / (x1 - x0); }
  return tab[tab.length - 1][1];
};
// a monotone cubic (Fritsch-Carlson) through [[x, y], ...]: no overshoot between offsets (a fair section never wiggles)
export function monotone(pts) {
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  if (n < 2) return () => (n ? ys[0] : 0);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(xs[i + 1] - xs[i], 1e-9));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]) * 0;
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0, j = n - 1;
    while (j - i > 1) { const k = (i + j) >> 1; if (xs[k] > x) j = k; else i = k; }
    const h = xs[j] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[j] + (t3 - t2) * h * m[j];
  };
}

export function makeForm(S) {
  const B2 = S.halfBeam, R = 5 * FT;                       // the half-beam; the midship bilge radius 5 ft (sheet 14)
  const side = z => S.sideAbl(z);
  const D = LINES && LINES.ok ? LINES : null;
  const fp = S.fpZ, ap = S.apZ;
  // the stem head: sheet 19 draws it at 51.2 ft ABL, 8.0 ft ahead of the FP (sheet 2: 51.9 ft, 7.1 ft; v0 used those)
  const zHead = D ? D.zHead : S.stemZ, hHead = D ? D.hHead : 51.9 * FT;

  // ---- the profile (sheet 19's sheer plan, digitised; else the v0 numbers in research/ship.md §2)
  const postZ = D ? D.postZ : ap - 7.9 * FT, apTop = D ? D.apertureTop : 18.8 * FT;
  const counterTab = [[apTop, postZ + 0.06], [6.58, 60.46], [6.83, 62.41], [7.44, 63.87], [9.14, 65.58], [13.01, S.sternZ]];
  const keelFwd = D ? D.keelFwd : -62.0;
  function zFwd(h) {
    if (D) return D.zFwd(Math.min(h, hHead));
    const line = hh => zHead + (hHead - hh) * 0.313;       // the raked stem: 17.4 deg from vertical (sheet 19: 13.4 ft in 42.8 ft)
    if (h >= 1.0) return line(h);
    const zl = line(1.0);
    return keelFwd - (keelFwd - zl) * Math.sqrt(Math.max(0, 1 - (1 - h) * (1 - h)));   // the forefoot rounding into the keel
  }
  function zAft(h) {
    if (D) return D.zAft(h);
    if (h <= apTop) return postZ;
    return interp(counterTab, h);
  }
  // the bulwark's top: 1.09 m above the deck at side (sheet 14), rising forward of 27.6 ft aft FP in a straight line to
  // the stem head (sheet 19's bulwark rail: 47.8 ft ABL at 27.6 ft aft FP)
  const zBowRail = fp + 27.6 * FT;
  const rail = z => z < zBowRail ? lerp(hHead, side(zBowRail) + S.bulwark, clamp((z - zHead) / (zBowRail - zHead))) : side(z) + S.bulwark;
  const bulwarkAftZ = (427 - 213.65) * FT;                // the bulwark gives way to a pipe rail round the counter (sheet 2)

  // ---- the half-breadths
  let hbCore;
  if (D) {
    // the digitised waterlines: at each z, a monotone cubic in h through the waterlines that exist there, the flat of
    // bottom at h = 0 and the deck at side at the top
    hbCore = (z, h) => D.hbAt(z, h, side(z));
  } else {
    // v0: a parametric form (the parallel middle body, the entrance and run filled by power curves) fitted to ship.md's
    // numbers; replaced by the digitised lines
    const halfB = h => (h < R ? B2 - R + Math.sqrt(Math.max(0, R * R - (R - h) * (R - h))) : B2);
    hbCore = (z, h) => {
      const sd = side(z), u = clamp(h / 11.4);
      const zF = zFwd(h), zA = zAft(h);
      const zFullF = lerp(-22.45, -33.12, u), zFullA = lerp(8.03, 26.3, u);
      const sF = clamp((z - zF) / (zFullF - zF)), sA = clamp((zA - z) / (zA - zFullA));
      const wF = 1 - Math.pow(1 - sF, lerp(1.9, 2.7, u)), wA = 1 - Math.pow(1 - sA, lerp(2.3, 3.0, u));
      let v = halfB(h) * Math.min(wF, wA);
      const w = smooth(0.55, 1.0, h / sd);
      v = lerp(v, Math.min(S.halfAt(z), B2), w);
      return v;
    };
  }
  // the hull closes on the centreline at the profile (a 0.25 m ramp: the stem bar and the post have width of their own)
  function hb(z, h) {
    const zF = zFwd(h), zA = zAft(h);
    if (z <= zF || z >= zA) return 0;
    const v = hbCore(z, h);
    return Math.max(0, v) * clamp((z - zF) / 0.25) * clamp((zA - z) / 0.25);
  }
  // the bulwark's plating carries on the shell's flare above the deck; at the bow, out to sheet 19's bulwark rail
  function hbRail(z, h) {
    const sd = side(z), top = hb(z, sd), below = hb(z, sd - 0.4);
    const rh = D ? D.railHb(z) : null, rt = rail(z);
    if (rh !== null && rt > sd + 0.05) return lerp(top, Math.max(rh, top), clamp((h - sd) / (rt - sd))) * clamp((z - zFwd(h)) / 0.25);
    // (never past the half-beam: at the shoulders the deck line is fuller than the waterline below it)
    const flare = clamp((top - below) / 0.4, 0, 0.35) * clamp((B2 - top) / 0.6);
    return Math.min(top + Math.max(0, h - sd) * flare, Math.max(B2, top));
  }
  return { S, hb, hbRail, zFwd, zAft, side, rail, keelFwd, postZ, apTop, hHead, zHead, bulwarkAftZ, R, lines: D, digitised: !!D, source: D ? D.source : 'v0 parametric (ship.md numbers)' };
}
