// liberty/src/water/piles.js: the piles that stand in the ebb (ctx.mods.pier.piles: the bents' outer rows at the tip
// and the east edge, the fenders), each with its wake as the water draws it (events.js pilesAt): foam caught against
// its upstream face, a turbulent strip spreading behind it (~0.06 m a metre: a cylinder's near wake), the V of
// capillary-gravity ripples at the half-angle asin(c_min / U) (c_min 0.23 m/s, the slowest a ripple runs: 17 deg at
// 0.8 m/s) and the Karman street's eddies (Strouhal 0.2: one shed every 10 r / U s from alternate sides, carried off at
// ~0.85 U). The map: for each 0.5 m texel round the live piles, the pile whose wake covers it nearest upstream, as
// (x, z, r, U); the shader takes s (along the current) and n (across) at its own point, so the wake has no texels.
const T = window.THREE;

// piles: [x, z, r] (Pier 35's bents and fenders) or [x, 0, z] (the bulkhead's wharf; r 0.25). vAt(x, z) -> { vx, vz, sky }
// (minU 0.25 m/s: slower, a pile's wake is a dimple no drawing shows; minHull 8 m: the lee between her and the pier, whose
// 2.1 m gap the 8 m current grid can't resolve, stays still, as the brief asks)
export function pileWakeMap(piles, vAt, { h = 0.5, reach = 12, minU = 0.25, minSky = 0.3, minHull = 8, hullAt = null } = {}) {
  const P = piles.map(p => (p[1] === 0 && Math.abs(p[2]) > 1 ? [p[0], p[2], 0.25] : [p[0], p[1], p[2]]));
  // live: in a current worth a wake, and where the sky still reaches (under the deck the cave hides it)
  const live = [];
  for (const [x, z, r] of P) {
    const e = vAt(x, z), U = Math.hypot(e.vx, e.vz);
    const hd = hullAt ? hullAt(x, z) : null;
    if (U > minU && (e.sky ?? 1) > minSky && !(hd && hd.d < minHull)) live.push([x, z, r, U, e.vx / U, e.vz / U]);
  }
  if (!live.length) return { live: 0, piles: P.length, tex: null, box: [0, 0, 1, 1] };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of live) { x0 = Math.min(x0, x - reach); x1 = Math.max(x1, x + reach); z0 = Math.min(z0, z - reach); z1 = Math.max(z1, z + reach); }
  const nx = Math.ceil((x1 - x0) / h), nz = Math.ceil((z1 - z0) / h), data = new Float32Array(nx * nz * 4);
  const cell = 4, hash = new Map(), key = (i, j) => i * 100003 + j;
  live.forEach((p, k) => { const kk = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell)); if (!hash.has(kk)) hash.set(kk, []); hash.get(kk).push(k); });
  const R = Math.ceil(reach / cell);
  let covered = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + (i + 0.5) * h, z = z0 + (j + 0.5) * h;
    let best = null, bs = Infinity;
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (const k of hash.get(key(ci + a, cj + b)) || []) {
      const [px, pz, r, U, ux, uz] = live[k], dx = x - px, dz = z - pz, s = dx * ux + dz * uz, n = -dx * uz + dz * ux;
      // (its wake and the foam against its face, with a texel's margin)
      if (s < -r - 0.8 || s > reach || Math.abs(n) > r + 0.1 * Math.max(s, 0) + 0.8) continue;
      if (s < bs) { bs = s; best = k; }
    }
    if (best === null) continue;
    const [px, pz, r, U] = live[best], o = (j * nx + i) * 4;
    data[o] = px; data[o + 1] = pz; data[o + 2] = r; data[o + 3] = U; covered++;
  }
  const tex = new T.DataTexture(data, nx, nz, T.RGBAFormat, T.FloatType);
  tex.minFilter = tex.magFilter = T.NearestFilter; tex.needsUpdate = true;
  // where the ebb gurgles loudest round them (the soundscape's beds): the fastest live piles, 10 m apart at least
  const loud = [];
  for (const p of live.slice().sort((a, b) => b[3] - a[3])) if (loud.length < 6 && loud.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > 10)) loud.push(p);
  return { live: live.length, piles: P.length, covered, tex, box: [x0, z0, nx * h, nz * h], texels: [nx, nz], loud: loud.map(([x, z, r, U]) => ({ x, z, r, U: +U.toFixed(2) })) };
}
