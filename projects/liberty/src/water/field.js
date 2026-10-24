// liberty/src/water/field.js: the bay's surroundings as maps, baked at build (bake.js) and read by the surface's shader
// and by heightAt:
//   obstacles  what blocks the wind and the waves: land (the DEM above +0.25 m), the hull (her waterline), solid works
//              (breakwaters, seawalls: ctx.mods.pier.solids); and decks on piles (Pier 35: P.PIER.inside; others'
//              ctx.mods.pier.decks), which stop the wind but let the waves through, losing them over ~30 m of piles
//   fetch      per wave-direction bin (spectrum.js: 8 bins over +-90 deg of the downwind direction), the open water upwave
//              of each point: a semi-Lagrangian sweep (F(p) = F(p - D d) + D over water, 0 at an obstacle) on the near
//              box (4 m) fed at its edge by the same sweep over the far DEM (100 m). Stored as q = omega_p(F) /
//              omega_p(Fref) per bin (spectrum.js growth), so the shader turns it into each component's amplitude
//   current    the ebb's flow round the berth: a potential flow (div(K grad phi) = 0, K 1 open water, 0.35 under a pile
//              deck, 0 in a solid) with the plan's current at the box's edge, SOR on 8 m cells; v = -K grad phi
//   hull SDF   the signed distance to her waterline (0.5 m cells, negative inside) and its gradient: the reflected waves
//              off her side, the froth line, the wet band, the calm against her
// Every map has an extent and a fallback outside it (rule 10): outside the near box the far fetch, outside the far grid
// the open bay; outside the hull's box no hull.
import { baked } from 'scene3d/bake.js';
import { fetchPeak } from './spectrum.js';
import { pointInPoly } from 'scene3d/util.js';

const T = window.THREE;
export const SOFFIT = 2.65;        // the decks' soffit over the water (B4: the deck less 0.3 m, the show's tide)

// ---- float16 (the DEMs' storage) -> float32
const H2F = (() => {
  const t = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) {
    const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023;
    t[h] = e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15);
  }
  return t;
})();
export async function loadDEM(name) {
  const url = new URL(`../../assets/terrain/${name}.f16`, import.meta.url);
  const buf = await (await fetch(url)).arrayBuffer();
  const u16 = new Uint16Array(buf), n = Math.round(Math.sqrt(u16.length));
  const f = new Float32Array(n * n); for (let i = 0; i < n * n; i++) f[i] = H2F[u16[i]];
  return { u16, f, n };
}
// a DEM sampler (bilinear; rows along +z, columns along +x from -half); null outside
export function demSampler(dem, half, step) {
  const { f, n } = dem;
  return (x, z) => {
    const fx = (x + half) / step, fz = (z + half) / step;
    if (fx < 0 || fz < 0 || fx >= n - 1 || fz >= n - 1) return null;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * n + i;
    return f[o] * (1 - u) * (1 - v) + f[o + 1] * u * (1 - v) + f[o + n] * (1 - u) * v + f[o + n + 1] * u * v;
  };
}

// a Liberty ship's waterline at her museum draft, until the hull module lands (ctx.mods.hull.waterline): from the stem
// at the light forward draft (2.53 m ABL, a little ahead of the forward perpendicular) to the counter just past the aft
// perpendicular (4.72 m ABL), 17.34 m beam, a parallel middle body from 25 m forward to 20 m aft of midships, a fine
// entrance and a full run (the plan's P.SHIP perpendiculars; the shapes estimated from the EC2 lines' character: the
// hull's own waterplane replaces this)
export function fallbackWaterline(SHIP) {
  const B = (SHIP ? SHIP.halfBeam : 17.34 / 2), zs = (SHIP ? SHIP.fpZ : -65.12) - 0.4, za = (SHIP ? SHIP.apZ : 61.68) + 0.9, zf = -25, zr = 20, pts = [];
  const half = z => {
    if (z < zf) { const u = (zf - z) / (zf - zs); return B * Math.pow(Math.max(0, 1 - Math.pow(u, 2.0)), 0.75); }
    if (z > zr) { const u = (z - zr) / (za - zr); return B * Math.pow(Math.max(0, 1 - Math.pow(u, 2.6)), 0.6); }
    return B;
  };
  const N = 60;
  for (let i = 0; i <= N; i++) { const z = zs + (za - zs) * i / N; pts.push([half(z), z]); }
  for (let i = N - 1; i >= 1; i--) { const z = zs + (za - zs) * i / N; pts.push([-half(z), z]); }
  return pts;
}

function sdSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

// ---- the bake: everything the maps need is plain data in, plain data out
export async function bakeField({ P, spec, waterline, solids = [], decks = [], nearDem, farDem }) {
  const NB = P.WORLD.near, H = 4;
  const box = { x0: NB.x0, z0: NB.z0, nx: Math.round((NB.x1 - NB.x0) / H), nz: Math.round((NB.z1 - NB.z0) / H), h: H };
  const inputs = {
    v: 8, box, pier: P.PIER.outline, rot: P.NORTH_ROT, U: spec.U, wp: spec.wp, Fref: spec.Fref, bins: spec.binDirs.map(a => +a.toFixed(6)),
    cur: spec.current.map(v => +v.toFixed(6)), wl: waterline.map(p => p.map(v => +v.toFixed(3))), solids, decks,
    dem: [nearDem.n, farDem.n, Array.from(nearDem.u16.subarray(0, 64)), Array.from(farDem.u16.subarray(500000, 500064))],
  };
  return baked('liberty-water-field', { sources: [import.meta.url, './spectrum.js'], inputs }, () => computeField({ P, spec, waterline, solids, decks, nearDem, farDem, box }));
}

function computeField({ P, spec, waterline, solids, decks, nearDem, farDem, box }) {
  const t0 = performance.now();
  const nearH = demSampler(nearDem, 6000, 12), farH = demSampler(farDem, 50000, 100);
  const hAt = (x, z) => { const a = nearH(x, z); if (a !== null) return a; const b = farH(x, z); return b === null ? -50 : b; };
  const inDeck = (x, z) => P.PIER.inside(x, z) || decks.some(pl => pointInPoly([x, z], pl));
  const wlBox = bounds(waterline);
  const inHull = (x, z) => x > wlBox.x0 && x < wlBox.x1 && z > wlBox.z0 && z < wlBox.z1 && pointInPoly([x, z], waterline);
  const inSolid = (x, z) => solids.some(pl => pointInPoly([x, z], pl));
  // classes: 0 water, 1 deck (piles: waves pass, wind doesn't), 2 solid
  const { nx, nz, h, x0, z0 } = box;
  const cls = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    // 2 x 2 samples a cell: a thin solid (her bow, a breakwater) still blocks
    let s = 0, d = 0;
    for (const [a, b] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const x = x0 + (i + a) * h, z = z0 + (j + b) * h;
      if (inHull(x, z) || inSolid(x, z)) s++;
      else if (inDeck(x, z)) d++;
      else if (hAt(x, z) > 0.25) s++;
    }
    cls[j * nx + i] = s >= 2 ? 2 : (s + d) >= 2 ? 1 : 0;
  }
  // the far grid's classes (100 m: land only)
  const fn = farDem.n, fh = 100, fx0 = -50000, fclass = new Uint8Array(fn * fn);
  for (let k = 0; k < fn * fn; k++) fclass[k] = farDem.f[k] > 0.25 ? 2 : 0;
  const Fcap = spec.Fref * 3;
  const dirs = spec.binDirs.map(a => [Math.cos(a), Math.sin(a)]);
  // the sweep on a grid: F per cell for travel direction d; edge(x, z) gives F upwave of the grid
  const sweep = (c, gx0, gz0, gnx, gnz, gh, d, edge) => {
    const F = new Float32Array(gnx * gnz);
    const [dx, dz] = d, rows = Math.abs(dz) >= Math.abs(dx);
    const decay = D => Math.exp(-D / 30);
    if (rows) {
      const sz = dz > 0 ? 1 : -1, D = gh / Math.abs(dz), off = -dx / Math.abs(dz);       // the upwave point: one row back, off cells across
      for (let jj = 0; jj < gnz; jj++) {
        const j = sz > 0 ? jj : gnz - 1 - jj, jp = j - sz;
        for (let i = 0; i < gnx; i++) {
          const k = j * gnx + i, cl = c[k];
          if (cl === 2) { F[k] = 0; continue; }
          const fi = i + off; let Fp;
          if (jp < 0 || jp >= gnz || fi < 0 || fi > gnx - 1) Fp = edge(gx0 + (fi + 0.5) * gh, gz0 + (jp + 0.5) * gh);
          else { const i0 = Math.floor(fi), u = fi - i0, a = F[jp * gnx + i0], b = i0 + 1 < gnx ? F[jp * gnx + i0 + 1] : a; Fp = a + (b - a) * u; }
          F[k] = Math.min(Fcap, cl === 1 ? Fp * decay(D) : Fp + D);
        }
      }
    } else {
      const sx = dx > 0 ? 1 : -1, D = gh / Math.abs(dx), off = -dz / Math.abs(dx);
      for (let ii = 0; ii < gnx; ii++) {
        const i = sx > 0 ? ii : gnx - 1 - ii, ip = i - sx;
        for (let j = 0; j < gnz; j++) {
          const k = j * gnx + i, cl = c[k];
          if (cl === 2) { F[k] = 0; continue; }
          const fj = j + off; let Fp;
          if (ip < 0 || ip >= gnx || fj < 0 || fj > gnz - 1) Fp = edge(gx0 + (ip + 0.5) * gh, gz0 + (fj + 0.5) * gh);
          else { const j0 = Math.floor(fj), u = fj - j0, a = F[j0 * gnx + ip], b = j0 + 1 < gnz ? F[(j0 + 1) * gnx + ip] : a; Fp = a + (b - a) * u; }
          F[k] = Math.min(Fcap, cl === 1 ? Fp * decay(D) : Fp + D);
        }
      }
    }
    return F;
  };
  const sampleGrid = (F, gx0, gz0, gnx, gnz, gh) => (x, z) => {
    const fx = (x - gx0) / gh - 0.5, fz = (z - gz0) / gh - 0.5;
    if (fx < 0 || fz < 0 || fx > gnx - 1 || fz > gnz - 1) return null;
    const i = Math.min(gnx - 2, Math.floor(fx)), j = Math.min(gnz - 2, Math.floor(fz)), u = fx - i, v = fz - j, o = j * gnx + i;
    return F[o] * (1 - u) * (1 - v) + F[o + 1] * u * (1 - v) + F[o + gnx] * (1 - u) * v + F[o + gnx + 1] * u * v;
  };
  // the far sweeps (the open sea beyond the far grid: a long fetch), then the near ones fed by them
  const qOf = F => Math.max(1, fetchPeak(spec.U, Math.max(F, 1)) / spec.wp);
  const nearF = [], farQ = [];
  const fs = 4, fnS = Math.ceil(fn / fs);           // the far q stored at 400 m (the far field shows only its long waves)
  for (const d of dirs) {
    const Ff = sweep(fclass, fx0, fx0, fn, fn, fh, d, () => Fcap);
    const fS = sampleGrid(Ff, fx0, fx0, fn, fn, fh);
    const Fn = sweep(cls, x0, z0, nx, nz, h, d, (x, z) => { const v = fS(x, z); return v === null ? Fcap : v; });
    nearF.push(Fn);
    const q = new Float32Array(fnS * fnS);
    for (let j = 0; j < fnS; j++) for (let i = 0; i < fnS; i++) { const v = fS(fx0 + (i + 0.5) * fh * fs, fx0 + (j + 0.5) * fh * fs); q[j * fnS + i] = qOf(v === null ? Fcap : v); }
    farQ.push(q);
  }
  // q, packed RGBA per four bins
  const pack = (list, n) => { const a = new Float32Array(n * 4), b = new Float32Array(n * 4); for (let k = 0; k < n; k++) for (let c = 0; c < 4; c++) { a[k * 4 + c] = list[c][k]; b[k * 4 + c] = list[c + 4][k]; } return [a, b]; };
  const nearQ = nearF.map(F => F.map(qOf));
  const [nqA, nqB] = pack(nearQ, nx * nz), [fqA, fqB] = pack(farQ, fnS * fnS);
  // ---- the current: potential flow on 8 m cells
  const ch = 8, cnx = Math.round(nx * h / ch), cnz = Math.round(nz * h / ch);
  const K = new Float32Array(cnx * cnz);
  for (let j = 0; j < cnz; j++) for (let i = 0; i < cnx; i++) {
    // the coarse cell's K: the mean of its four fine cells' (1 water, 0.35 deck, 0 solid)
    let s = 0; for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) { const c = cls[Math.min(nz - 1, j * 2 + b) * nx + Math.min(nx - 1, i * 2 + a)]; s += c === 0 ? 1 : c === 1 ? 0.35 : 0; }
    K[j * cnx + i] = s / 4;
  }
  const [Ux, Uz] = spec.current, phi = new Float32Array(cnx * cnz);
  const cxAt = i => x0 + (i + 0.5) * ch, czAt = j => z0 + (j + 0.5) * ch;
  for (let j = 0; j < cnz; j++) for (let i = 0; i < cnx; i++) phi[j * cnx + i] = -(Ux * cxAt(i) + Uz * czAt(j));
  const Kf = (a, b) => (a > 0 && b > 0 ? 2 * a * b / (a + b) : 0);
  let resid = 0, iters = 0;
  for (let it = 0; it < 4000; it++) {
    resid = 0;
    for (let j = 1; j < cnz - 1; j++) for (let i = 1; i < cnx - 1; i++) {
      const k = j * cnx + i, kc = K[k]; if (kc <= 0) continue;
      const ke = Kf(kc, K[k + 1]), kw = Kf(kc, K[k - 1]), kn = Kf(kc, K[k + cnx]), ks = Kf(kc, K[k - cnx]), sum = ke + kw + kn + ks;
      if (sum <= 0) continue;
      const target = (ke * phi[k + 1] + kw * phi[k - 1] + kn * phi[k + cnx] + ks * phi[k - cnx]) / sum, dlt = target - phi[k];
      phi[k] += 1.9 * dlt; resid = Math.max(resid, Math.abs(dlt));
    }
    iters = it + 1;
    if (resid < 1e-4) break;
  }
  const vel = new Float32Array(cnx * cnz * 2);
  for (let j = 1; j < cnz - 1; j++) for (let i = 1; i < cnx - 1; i++) {
    const k = j * cnx + i, kc = K[k]; if (kc <= 0) continue;
    const fe = -Kf(kc, K[k + 1]) * (phi[k + 1] - phi[k]) / ch, fw = -Kf(kc, K[k - 1]) * (phi[k] - phi[k - 1]) / ch;
    const fN = -Kf(kc, K[k + cnx]) * (phi[k + cnx] - phi[k]) / ch, fS2 = -Kf(kc, K[k - cnx]) * (phi[k] - phi[k - cnx]) / ch;
    vel[k * 2] = (fe + fw) / 2; vel[k * 2 + 1] = (fN + fS2) / 2;
  }
  // under the decks on piles: how far each point lies from the nearest OPEN side of its deck (an edge whose outside is open
  // water; the bulkhead and the shore close theirs), positive inside, negative outside near one (so it interpolates to
  // the edge exactly): the sky a point under there still sees (shade.js, B4's skyUnder: 0.5 (1 - e / sqrt(e^2 + h^2)))
  const deckPolys = [P.PIER.outline, ...decks].filter(d => d && d.length > 2);
  const openEdges = [];
  for (const d of deckPolys) for (let m = 0; m < d.length; m++) {
    const a = d[m], b = d[(m + 1) % d.length], ex = b[0] - a[0], ez = b[1] - a[1], el = Math.hypot(ex, ez) || 1;
    // the outward normal: the side away from the polygon's centroid
    const cx = d.reduce((u, q) => u + q[0], 0) / d.length, cz = d.reduce((u, q) => u + q[1], 0) / d.length;
    let nx2 = ez / el, nz2 = -ex / el; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if ((mx - cx) * nx2 + (mz - cz) * nz2 < 0) { nx2 = -nx2; nz2 = -nz2; }
    let open = 0; for (const f of [0.2, 0.5, 0.8]) { const px = a[0] + ex * f + nx2 * 4, pz = a[1] + ez * f + nz2 * 4; if (hAt(px, pz) <= 0.25 && !inDeck(px, pz)) open++; }
    if (open >= 2) openEdges.push([a, b]);
  }
  const deckE = (x, z) => {
    let inside = false; for (const d of deckPolys) if (pointInPoly([x, z], d)) { inside = true; break; }
    let e = 1e9; for (const [a, b] of openEdges) e = Math.min(e, sdSeg(x, z, a[0], a[1], b[0], b[1]));
    return inside ? Math.min(e, 60) : -Math.min(e, 8);
  };
  // the env map at 4 m: R the deck's open-side distance e (m: > 0 under a deck), G and B the current (m/s), A the solid share
  const env = new Float32Array(nx * nz * 4);
  const vS = (x, z, c) => {
    const fx = (x - x0) / ch - 0.5, fz = (z - z0) / ch - 0.5;
    const i = Math.max(0, Math.min(cnx - 2, Math.floor(fx))), j = Math.max(0, Math.min(cnz - 2, Math.floor(fz))), u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j)), o = (j * cnx + i) * 2 + c;
    return vel[o] * (1 - u) * (1 - v) + vel[o + 2] * u * (1 - v) + vel[o + cnx * 2] * (1 - u) * v + vel[o + cnx * 2 + 2] * u * v;
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + (i + 0.5) * h, z = z0 + (j + 0.5) * h;
    env[k * 4] = deckE(x, z); env[k * 4 + 1] = vS(x, z, 0); env[k * 4 + 2] = vS(x, z, 1); env[k * 4 + 3] = cls[k] === 2 ? 1 : 0;
  }
  // ---- the hull's signed distance (0.5 m), with its outward gradient
  const sb = { x0: Math.floor(wlBox.x0 - 40), z0: Math.floor(wlBox.z0 - 40), h: 0.5 };
  sb.nx = Math.ceil((wlBox.x1 + 40 - sb.x0) / sb.h); sb.nz = Math.ceil((wlBox.z1 + 40 - sb.z0) / sb.h);
  const sdf = new Float32Array(sb.nx * sb.nz * 4), M = waterline.length;
  for (let j = 0; j < sb.nz; j++) for (let i = 0; i < sb.nx; i++) {
    const x = sb.x0 + (i + 0.5) * sb.h, z = sb.z0 + (j + 0.5) * sb.h;
    let best = 1e9, bx = 0, bz = 0;
    for (let m = 0; m < M; m++) {
      const a = waterline[m], b = waterline[(m + 1) % M];
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
      const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bx = px; bz = pz; }
    }
    const inside = pointInPoly([x, z], waterline), s = inside ? -best : best;
    let gx = (x - bx) / Math.max(best, 1e-6), gz = (z - bz) / Math.max(best, 1e-6); if (inside) { gx = -gx; gz = -gz; }
    const k = (j * sb.nx + i) * 4; sdf[k] = s; sdf[k + 1] = gx; sdf[k + 2] = gz; sdf[k + 3] = 0;
  }
  return {
    box, nqA, nqB, env, far: { x0: fx0, h: fh * fs, n: fnS, qA: fqA, qB: fqB }, sdfBox: sb, sdf,
    nearF: nearF.map(F => F),          // (metres, per bin: the board's fetch maps and the measures)
    current: { nx: cnx, nz: cnz, h: ch, vel, iters, resid },
    ms: Math.round(performance.now() - t0),
  };
}
function bounds(pts) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x0, x1, z0, z1 };
}

// ---- textures and JS samplers from the baked data
// atlases: WebGL gives a material 16 texture units and the engine's light takes about 9, so the maps share three.
// tiles: [{ data (Float32 RGBA or Uint16 R), w, h }] side by side -> { tex, rects: [x0, y0, w, h] texels, size }
function atlas(tiles, { half16 = false } = {}) {
  const W = tiles.reduce((a, t) => a + t.w, 0), H = Math.max(...tiles.map(t => t.h)), ch = half16 ? 1 : 4;
  const out = new Uint16Array(W * H * ch), rects = [];
  let x0 = 0;
  for (const t of tiles) {
    for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) for (let c = 0; c < ch; c++) {
      const v = t.data[(j * t.w + i) * ch + c];
      out[(j * W + x0 + i) * ch + c] = half16 ? v : T.DataUtils.toHalfFloat(Math.max(-65000, Math.min(65000, v)));
    }
    rects.push([x0, 0, t.w, t.h]); x0 += t.w;
  }
  const tex = new T.DataTexture(out, W, H, half16 ? T.RedFormat : T.RGBAFormat, T.HalfFloatType);
  tex.minFilter = tex.magFilter = T.LinearFilter; tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping; tex.needsUpdate = true;
  return { tex, rects, size: [W, H] };
}
export function fieldTextures(F, nearDem, farDem, extraEnv = []) {
  const b = F.box, f = F.far, sd = F.sdfBox;
  const qT = atlas([{ data: F.nqA, w: b.nx, h: b.nz }, { data: F.nqB, w: b.nx, h: b.nz }, { data: f.qA, w: f.n, h: f.n }, { data: f.qB, w: f.n, h: f.n }]);
  const eT = atlas([{ data: F.env, w: b.nx, h: b.nz }, { data: F.sdf, w: sd.nx, h: sd.nz }, ...extraEnv]);
  return { qT, eT };
}
export function fieldSamplers(F) {
  const g4 = (arr, gx0, gz0, gnx, gnz, gh) => (x, z, out) => {
    const fx = (x - gx0) / gh - 0.5, fz = (z - gz0) / gh - 0.5;
    if (fx < -0.5 || fz < -0.5 || fx > gnx - 0.5 || fz > gnz - 0.5) return null;
    const i = Math.max(0, Math.min(gnx - 2, Math.floor(fx))), j = Math.max(0, Math.min(gnz - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
    for (let c = 0; c < 4; c++) { const o = (j * gnx + i) * 4 + c; out[c] = arr[o] * (1 - u) * (1 - v) + arr[o + 4] * u * (1 - v) + arr[o + gnx * 4] * (1 - u) * v + arr[o + gnx * 4 + 4] * u * v; }
    return out;
  };
  const b = F.box, f = F.far;
  const nA = g4(F.nqA, b.x0, b.z0, b.nx, b.nz, b.h), nB = g4(F.nqB, b.x0, b.z0, b.nx, b.nz, b.h);
  const fA = g4(f.qA, f.x0, f.x0, f.n, f.n, f.h), fB = g4(f.qB, f.x0, f.x0, f.n, f.n, f.h);
  const envS = g4(F.env, b.x0, b.z0, b.nx, b.nz, b.h);
  const sd = F.sdfBox, sdS = g4(F.sdf, sd.x0, sd.z0, sd.nx, sd.nz, sd.h);
  const a = [0, 0, 0, 0], c = [0, 0, 0, 0];
  return {
    // the bins' q at a point (8 numbers)
    qAt(x, z) {
      if (nA(x, z, a) && nB(x, z, c)) return [...a, ...c];
      if (fA(x, z, a) && fB(x, z, c)) return [...a, ...c];
      return [1, 1, 1, 1, 1, 1, 1, 1];
    },
    env(x, z) { const o = [0, 0, 0, 0]; if (!envS(x, z, o)) return { cover: 0, sky: 1, vx: 0, vz: 0, solid: 0, outside: true };
      const e = o[0], sky = e <= 0 ? 1 : 0.5 * (1 - e / Math.sqrt(e * e + SOFFIT * SOFFIT)); return { deckE: e, sky, cover: 1 - sky, vx: o[1], vz: o[2], solid: o[3] }; },
    hull(x, z) { const o = [0, 0, 0, 0]; return sdS(x, z, o) ? { d: o[0], nx: o[1], nz: o[2] } : null; },
  };
}
