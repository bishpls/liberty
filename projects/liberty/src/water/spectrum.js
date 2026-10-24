// liberty/src/water/spectrum.js: the bay's wind sea as a set of plane waves, every one a pure function of t.
//
// The source (research/site.md §4, rule 7; plan.js WATER): a fetch-limited wind chop from the WSW (wind from 245 deg at
// 3.4 m/s), JONSWAP. The plan's open-bay sea state (Hs 0.15 m, Tp 1.9 s) is exactly JONSWAP's at U = 3.4 m/s over a
// fetch of 8.3 km (Hs = 0.0016 U sqrt(F / g), omega_p = 22 (g^2 / (U F))^(1/3)), so that fetch is the reference: a place
// whose upwave fetch is shorter (field.js) carries the fetch-limited spectrum instead (a higher, sharper peak at a
// shorter wavelength, less height), on the same components.
//
// Every component: deep-water dispersion with surface tension, omega^2 = g k (1 + k^2 / km^2) (km = 370 rad/m: under 1 %
// off g k above 10 cm), Doppler-shifted by the ebb (omega_abs = omega + k . U: the pattern rides the current), a
// direction drawn from the Mitsuyasu spreading cos^2s(theta / 2) (s peaks at the spectral peak and falls off either
// side), a random phase. Components are sorted by k ascending (long waves first: the shader stops at the first one too
// fine for its pixel).
import { rng, TAU } from 'scene3d/util.js';

export const G = 9.81, KM = 370;
export const omegaOf = k => Math.sqrt(G * k * (1 + (k / KM) ** 2));
export const cgOf = k => { const w = omegaOf(k); return (G * (1 + 3 * (k / KM) ** 2)) / (2 * w); };   // d omega / dk

// JONSWAP spectral density in omega (m^2 s): alpha, omega_p, gamma
export function jonswap(w, alpha, wp, gamma = 3.3) {
  if (w <= 0) return 0;
  const sig = w <= wp ? 0.07 : 0.09, r = Math.exp(-((w - wp) ** 2) / (2 * sig * sig * wp * wp));
  return alpha * G * G * w ** -5 * Math.exp(-1.25 * (wp / w) ** 4) * gamma ** r;
}
// fetch-limited JONSWAP (Hasselmann et al. 1973): omega_p and alpha from the wind speed U and the fetch F
export const fetchPeak = (U, F) => 22 * Math.cbrt(G * G / (U * Math.max(F, 1)));
export const fetchAlpha = (U, F) => 0.076 * Math.pow(U * U / (Math.max(F, 1) * G), 0.22);
export const fetchHs = (U, F) => 0.0016 * U * Math.sqrt(Math.max(F, 0) / G);
// the fetch that gives a peak period: F = 22^3 g^2 / (U omega_p^3)
export const fetchFor = (U, Tp) => 22 ** 3 * G * G / (U * (TAU / Tp) ** 3);

// Mitsuyasu spreading exponent at omega / omega_p
const spreadS = (r, smax = 12) => (r <= 1 ? smax * r ** 5 : smax * r ** -2.5);
// sample a direction offset (rad) from cos^(2s)(theta / 2) on [-pi, pi] by inverting its CDF numerically
function sampleSpread(s, u) {
  const n = 256, cdf = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const th = -Math.PI + (i + 0.5) / n * TAU; cdf[i + 1] = cdf[i] + Math.pow(Math.cos(th / 2), 2 * s); }
  const tot = cdf[n], target = u * tot;
  let i = 0; while (i < n - 1 && cdf[i + 1] < target) i++;
  const f = (target - cdf[i]) / Math.max(cdf[i + 1] - cdf[i], 1e-12);
  return -Math.PI + (i + f) / n * TAU;
}

// the wave set. dirOf(bearing) -> world [x, z] unit (plan.atBearing). Returns { comps, bands, ... }; each component
// { k, kx, kz, w (intrinsic omega), wa (absolute, Doppler-shifted), a (amplitude, m, at the reference fetch), ph,
//   dir (rad, world atan2(kz, kx)), bin (0..7: its travel direction's bin, field.js), band }
// The components come in ten octave bands (BANDS: k0, k1, count; denser where the energy is at any fetch the bay has:
// the berth's 30 m fetch peaks at 0.15 m, the open bay at 5.6 m). Each band lives on its own periodic tile (surface.js:
// rendered each frame, mipmapped, so the surface is filtered where it is finer than the pixel), so its wavevectors sit
// on the tile's lattice: the tile is 12 pi / k0 across, the band's longest wave at lattice index 6 (directions within
// ~10 deg of the spreading's draw, finer for the shorter ones). Directions by a golden-ratio sequence through the
// spreading's CDF, so a handful of long components can't all lean one way.
export const BANDS = [[0.25, 0.5, 8], [0.5, 1, 14], [1, 2, 16], [2, 4, 16], [4, 8, 16], [8, 16, 16], [16, 32, 14], [32, 64, 12], [64, 128, 8], [128, 300, 8]];
export const QMAX = 25, NQ = 32;
export const BAND_ROT = 2.39996323;       // (the golden angle: each band's lattice turned by it)                                   // the growth tables' range of q (log-spaced)
export function makeSpectrum({ Hs = 0.15, Tp = 1.9, windFrom = 245, windSpeed = 3.4, current = { toward: 282, speed: 0.8 }, dirOf,
  bands = BANDS, seed = 3517, bins = 8 }) {
  const R = rng(seed);
  const U = windSpeed, Fref = fetchFor(U, Tp), wp = TAU / Tp;
  const [wx, wz] = dirOf((windFrom + 180) % 360);           // the waves' mean travel direction (downwind)
  const th0 = Math.atan2(wz, wx);
  const [cx, cz] = dirOf(current.toward), Ux = cx * current.speed, Uz = cz * current.speed;
  const comps = [], B = [];
  let gi = 0;
  bands.forEach(([ka, kb, n], bi) => {
    // the tile: 24 of the band's longest waves across (a period no eye finds), its lattice turned by the golden angle
    // per band (no two bands' grids align)
    const L = 48 * Math.PI / ka, dk = TAU / L, used = new Set(), rot = bi * BAND_ROT, cr = Math.cos(rot), sr = Math.sin(rot);
    const lk0 = Math.log(ka), lk1 = Math.log(kb);
    B.push({ k0: ka, k1: kb, L, rot, comps: [] });
    for (let i = 0; i < n; i++, gi++) {
      const a0 = lk0 + (lk1 - lk0) * i / n, a1 = lk0 + (lk1 - lk0) * (i + 1) / n;
      const kd = Math.exp(a0 + (a1 - a0) * (0.25 + 0.5 * R())), kA = Math.exp(a0), kB = Math.exp(a1);
      const s = spreadS(omegaOf(kd) / wp);
      const u = (0.5 + gi * 0.6180339887) % 1;                  // golden-ratio stratification of the spread's CDF
      const dth = sampleSpread(Math.max(s, 0.5), u);
      // onto the tile's lattice (a free point nearest the drawn wavevector)
      // (the drawn direction in the band's turned frame, onto its lattice, and back)
      const lx = kd * Math.cos(th0 + dth - rot), lz = kd * Math.sin(th0 + dth - rot);
      let m = Math.round(lx / dk), nn = Math.round(lz / dk);
      for (let tries = 0; used.has(m + ',' + nn) && tries < 8; tries++) { if (tries % 2) m += 1; else nn += 1; }
      used.add(m + ',' + nn);
      const klx = m * dk, klz = nn * dk, kx = klx * cr - klz * sr, kz = klx * sr + klz * cr, k = Math.hypot(kx, kz), w = omegaOf(k), dw = omegaOf(kB) - omegaOf(kA);
      const dir = Math.atan2(kz, kx);
      let dq = dir - th0; while (dq > Math.PI) dq -= TAU; while (dq < -Math.PI) dq += TAU;
      comps.push({ k, kx, kz, w, wa: w + kx * Ux + kz * Uz, S: jonswap(omegaOf(kd), 1, wp), dw, ph: R() * TAU, dir, dth: dq, lambda: TAU / k, band: bi, lattice: [m, nn], kl: [klx, klz] });
    }
  });
  // scale: Hs = 4 sqrt(sum a^2 / 2) at the reference fetch
  let m0 = 0; for (const c of comps) m0 += c.S * c.dw;
  const alpha = (Hs / 4) ** 2 / m0;
  for (const c of comps) c.a = Math.sqrt(2 * alpha * c.S * c.dw);
  // each band's energy shared by its components in proportion to the square root of the reference spectrum (its total,
  // so Hs and the band spectrum, unchanged): the reference's own slope gave the longest ~8 times the shortest's energy,
  // and at a short fetch that one wave ruled the drawn sea in stripes; an even share put the peak period up to 40 % off
  // the fetch law (3 km); the square root keeps the longest under 3 times the shortest and Tp within -1..+21 %
  B.forEach((b, bi) => {
    const mine = comps.filter(c => c.band === bi), E = mine.reduce((acc, c) => acc + c.a * c.a, 0);
    const W = mine.map(c => Math.sqrt(c.S * c.dw)), Ws = W.reduce((a, b) => a + b, 0); mine.forEach((c, j) => { c.a = Math.sqrt(E * W[j] / Ws); });
  });
  // the direction bins (field.js marches one fetch per bin): travel directions th0 + (b - 3.5) * 22.5 deg
  const binW = Math.PI / bins;
  for (const c of comps) c.bin = Math.max(0, Math.min(bins - 1, Math.round(c.dth / binW + (bins - 1) / 2)));
  comps.sort((a, b) => a.k - b.k);
  comps.forEach((c, i) => B[c.band].comps.push(i));
  const binDirs = Array.from({ length: bins }, (_, b) => th0 + (b - (bins - 1) / 2) * binW);
  const spec = { comps, bands: B, alpha, U, Fref, wp, Tp, Hs, th0, binDirs, current: [Ux, Uz], windDir: [wx, wz], gamma: 3.3 };
  // per band: its energy's share in each direction bin (the bins' q are averaged by it), its slope and height variances
  // at the reference fetch, and its growth table: the energy-weighted amplitude factor over q (so a band's Hs at any
  // fetch is exactly its components' at that fetch)
  for (const b of B) {
    const E = b.comps.reduce((acc, i) => acc + comps[i].a ** 2, 0) || 1;
    b.w = Array.from({ length: bins }, (_, k) => b.comps.reduce((acc, i) => acc + (comps[i].bin === k ? comps[i].a ** 2 : 0), 0) / E);
    b.slopeVar = b.comps.reduce((acc, i) => acc + 0.5 * comps[i].a ** 2 * comps[i].k ** 2, 0);
    b.hVar = b.comps.reduce((acc, i) => acc + 0.5 * comps[i].a ** 2, 0);
    b.lut = Array.from({ length: NQ }, (_, j) => { const q = Math.exp(j / (NQ - 1) * Math.log(QMAX)); return Math.sqrt(b.comps.reduce((acc, i) => acc + comps[i].a ** 2 * growth(comps[i], q, spec) ** 2, 0) / E); });
  }
  return spec;
}
// a band's gain at the bins' q: q averaged (geometric) with the band's direction weights, then its growth table
export function bandGain(b, qb) {
  let lq = 0; for (let k = 0; k < qb.length; k++) lq += b.w[k] * Math.log(Math.max(qb[k], 1));
  const f = Math.min(1, lq / Math.log(QMAX)) * (NQ - 1), j = Math.min(NQ - 2, Math.floor(f)), u = f - j;
  return b.lut[j] * (1 - u) + b.lut[j + 1] * u;
}

// fetch growth: the fetch-limited JONSWAP spectrum over the reference's at a component's omega, as an amplitude
// factor. field.js stores per bin q = omega_p(F) / omega_p(Fref) (>= 1: a fetch no longer than the reference's).
// S_F / S_ref = q^0.66 (alpha ~ F^-0.22 ~ omega_p^0.66) x q^(PEAK_Q b) x exp(-1.25 omega_pref^4 (q^4 - 1) / omega^4) x
// gamma^(r_F - r_ref), r the peak enhancement's gaussian, b a broad bump round the local peak (exp(-(w/wp_F - 1)^2 /
// 0.18)); amplitude = sqrt(that). The shader computes the same. (JONSWAP's alpha alone leaves Hs 20-35 % under the
// fetch law Hs = 0.0016 U sqrt(F / g) at 30-230 m; raising the whole tail to meet it doubled the mean square slope
// past Cox and Munk's, so the energy the law asks for goes in at the local peak, where the fetch law measures it)
export const PEAK_Q = 0.5;
export function growth(c, q, spec) {
  if (q <= 1) return 1;
  const wp = spec.wp, w = c.w, sig = x => (w <= x ? 0.07 : 0.09);
  const rF = Math.exp(-((w - wp * q) ** 2) / (2 * sig(wp * q) ** 2 * (wp * q) ** 2)), rR = Math.exp(-((w - wp) ** 2) / (2 * sig(wp) ** 2 * wp * wp));
  const lnS = 0.66 * Math.log(q) + PEAK_Q * Math.log(q) * Math.exp(-((w / (wp * q) - 1) ** 2) / 0.18) - 1.25 * (wp / w) ** 4 * (q ** 4 - 1) + Math.log(spec.gamma) * (rF - rR);
  return Math.exp(0.5 * lnS);
}

// the surface: height and slope at (x, z, t) given the bins' q at that point (qAt(x, z) -> array of 8, or null: the
// reference everywhere), using components down to minLambda (m); each band scaled by its gain (as the shader)
export function surfaceAt(spec, x, z, t, { qAt = null, minLambda = 0 } = {}) {
  const qb = qAt ? qAt(x, z) : null;
  let h = 0, sx = 0, sz = 0;
  for (const b of spec.bands) {
    const g = qb ? bandGain(b, qb) : 1;
    if (g < 1e-6) continue;
    for (const i of b.comps) {
      const c = spec.comps[i];
      if (c.lambda < minLambda) continue;
      const a = c.a * g, p = c.kx * x + c.kz * z - c.wa * t + c.ph, cs = Math.cos(p), sn = Math.sin(p);
      h += a * cs; sx -= a * c.kx * sn; sz -= a * c.kz * sn;
    }
  }
  return { h, sx, sz };
}

// ---- measures on the generated field (the numbers build() returns)
// Hs from the field sampled on a grid over time; Tp from a point's time series (DFT); the spectrum's peak direction
// (energy-weighted circular mean); the dispersion check (phase speed against sqrt(g / k)); the Doppler shift; the
// slope variance against Cox and Munk (1954) for the wind speed
export function measureSpectrum(spec, { qAt = null, at = [0, 0], label = 'open bay (reference)' } = {}) {
  const out = { label };
  // Hs: 24 x 24 points 7.3 m apart, 40 times 3.1 s apart
  let s2 = 0, nS = 0, sl2 = 0;
  for (let it = 0; it < 40; it++) for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
    const x = at[0] + (i - 12) * 7.3, z = at[1] + (j - 12) * 7.3, r = surfaceAt(spec, x, z, it * 3.1 + 0.37, { qAt });
    s2 += r.h * r.h; sl2 += r.sx * r.sx + r.sz * r.sz; nS++;
  }
  out.Hs = +(4 * Math.sqrt(s2 / nS)).toFixed(4);
  out.slopeVar = +(sl2 / nS).toFixed(4);
  // Tp: a 409.6 s series at 10 Hz (Hann-windowed), the peak of its periodogram smoothed over 0.05 Hz. Two observers: a
  // drifter riding the current (the waves' own, intrinsic periods: what JONSWAP's Tp means) and a fixed point (the
  // encounter periods: the ebb runs against the wind waves here, so a fixed point sees them Doppler-lengthened)
  const N = 4096, dt = 0.1;
  const tp = drift => {
    const ser = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const t = i * dt, x = at[0] + (drift ? spec.current[0] * t : 0), z = at[1] + (drift ? spec.current[1] * t : 0);
      ser[i] = surfaceAt(spec, x, z, t, { qAt }).h * (0.5 - 0.5 * Math.cos(TAU * i / (N - 1)));
    }
    const psd = [];
    for (let f = 0.05; f <= 5.0; f += 1 / (N * dt)) {
      let re = 0, im = 0; for (let i = 0; i < N; i++) { const a = TAU * f * i * dt; re += ser[i] * Math.cos(a); im -= ser[i] * Math.sin(a); }
      psd.push([f, re * re + im * im]);
    }
    let best = 0, bestF = 1;
    for (let i = 0; i < psd.length; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - 10); j < Math.min(psd.length, i + 11); j++) { s += psd[j][1]; n++; } if (s / n > best) { best = s / n; bestF = psd[i][0]; } }
    return +(1 / bestF).toFixed(3);
  };
  out.Tp = tp(true); out.TpFixed = tp(false);
  return out;
}
export function spectrumFacts(spec) {
  const { comps } = spec;
  // peak direction: the energy-weighted circular mean of the components' directions -> a true bearing
  let cx = 0, cz = 0, E = 0;
  for (const c of comps) { const e = c.a * c.a; cx += e * Math.cos(c.dir); cz += e * Math.sin(c.dir); E += e; }
  const meanDir = Math.atan2(cz, cx);
  // dispersion: phase speed (intrinsic) against sqrt(g / k), worst over components longer than 10 cm; capillary ones apart
  let worstGrav = 0, worstAll = 0;
  for (const c of comps) {
    const cp = c.w / c.k, ideal = Math.sqrt(G / c.k), err = Math.abs(cp / ideal - 1);
    if (c.lambda >= 0.1) worstGrav = Math.max(worstGrav, err); worstAll = Math.max(worstAll, err);
  }
  // the Doppler shift: the pattern's drift = (omega_abs - omega) / k along k equals U . k_hat for every component
  let dop = 0;
  for (const c of comps) { const u = (c.wa - c.w) / c.k, want = (c.kx * spec.current[0] + c.kz * spec.current[1]) / c.k; dop = Math.max(dop, Math.abs(u - want)); }
  // Cox and Munk (1954): mean square slope 0.003 + 0.00512 U (clean), 0.008 + 0.00156 U (slick)
  const cm = 0.003 + 0.00512 * spec.U, cmSlick = 0.008 + 0.00156 * spec.U;
  return {
    n: comps.length, lambdaRange: [+comps[comps.length - 1].lambda.toFixed(3), +comps[0].lambda.toFixed(2)],
    meanDirWorld: +(meanDir * 180 / Math.PI).toFixed(1), windDirWorld: +(spec.th0 * 180 / Math.PI).toFixed(1),
    dispersionWorstGravity: +worstGrav.toExponential(2), dispersionWorstWithCapillary: +worstAll.toFixed(3),
    dopplerErr: +dop.toExponential(2), currentSpeed: +Math.hypot(...spec.current).toFixed(3),
    coxMunk: +cm.toFixed(4), coxMunkSlick: +cmSlick.toFixed(4), Fref_m: Math.round(spec.Fref),
  };
}
