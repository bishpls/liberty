// liberty/src/far/data.js: the far view's data (B6), loaded once a page: the terrain grids (assets/terrain near and far,
// assets/far mid), the land cover (NLCD 2021), the night's light (VIIRS Black Marble), the city's buildings (DataSF).
// Every grid is on the world's frame (plan.js): row-major, rows along +z, columns along +x from -half, metres above the
// show's water. Made by projects/liberty/tools/far_data.py (sources and licences: assets/far/rights.json).

const BASE = new URL('../../assets/', import.meta.url);
const cache = new Map();

// a file under assets/, gunzipped when it ends in .gz (DecompressionStream: the server sends it as octet-stream)
export async function bytes(path) {
  if (cache.has(path)) return cache.get(path);
  const p = (async () => {
    const r = await fetch(new URL(path, BASE));
    if (!r.ok) throw new Error('far: ' + path + ' ' + r.status);
    if (!path.endsWith('.gz')) return new Uint8Array(await r.arrayBuffer());
    const s = r.body.pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  })();
  cache.set(path, p);
  return p;
}
export async function json(path) { return JSON.parse(new TextDecoder().decode(await bytes(path))); }

// float16 -> float32 by a table (65536 entries, built once)
let F16 = null;
function f16table() {
  if (F16) return F16;
  F16 = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) {
    const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    F16[h] = e === 0 ? s * Math.pow(2, -14) * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + f / 1024);
  }
  return F16;
}
export function f16(u8) {
  const T = f16table(), u16 = new Uint16Array(u8.buffer, u8.byteOffset, u8.byteLength >> 1), out = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) out[i] = T[u16[i]];
  return out;
}

// decimetres as int16 byte planes, delta-coded along each row (tools/far_data.py mid) -> metres
export function i16d(u8, n) {
  const N = u8.length >> 1, lo = u8.subarray(0, N), hi = u8.subarray(N), out = new Float32Array(N);
  for (let r = 0; r < n; r++) { let acc = 0; for (let c = 0; c < n; c++) { const k = r * n + c; let v = lo[k] | (hi[k] << 8); if (v > 32767) v -= 65536; acc += v; out[k] = acc * 0.1; } }
  return out;
}

// a height grid as the terrain wants it: { x0, z0, dx, w, h, a }, plus its half extent and a bilinear sampler
export function grid(a, half, step) {
  const n = Math.round(2 * half / step) + 1;
  const g = { x0: -half, z0: -half, dx: step, w: n, h: n, a, half, step };
  g.at = (x, z) => {
    const fx = (x + half) / step, fz = (z + half) / step;
    if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) return null;
    const i = Math.min(Math.floor(fx), n - 2), j = Math.min(Math.floor(fz), n - 2), u = fx - i, v = fz - j, o = j * n + i;
    return (a[o] * (1 - u) + a[o + 1] * u) * (1 - v) + (a[o + n] * (1 - u) + a[o + n + 1] * u) * v;
  };
  return g;
}

// the three terrain grids (coarsest first) and the land cover and night light rasters
export async function loadAll() {
  const [metaT, metaF, nearB, farB, midB, covM, covF, lit, alcB] = await Promise.all([
    json('terrain/meta.json'), json('far/meta.json'), bytes('terrain/near.f16'), bytes('terrain/far.f16'), bytes('far/mid.i16d.gz'),
    bytes('far/cover_mid.u8.gz'), bytes('far/cover_far.u8.gz'), bytes('far/lights.u8.gz'), bytes('far/alcatraz.i16d.gz'),
  ]);
  const far = grid(f16(farB), metaT.far.half, metaT.far.step);
  const mid = grid(i16d(midB, metaF.mid.n), metaF.mid.half, metaF.mid.step);
  const near = grid(f16(nearB), metaT.near.half, metaT.near.step);
  // Alcatraz at 3 m (z15): a grid off the origin
  const A = metaF.alcatraz, alc = grid(i16d(alcB, A.n), A.half, A.step);
  alc.x0 += A.centre[0]; alc.z0 += A.centre[1];
  { const at0 = alc.at; alc.at = (x, z) => at0(x - A.centre[0], z - A.centre[1]); }
  return {
    far, mid, near, alc, meta: { terrain: metaT, far: metaF },
    cover: { mid: { u8: covM, half: metaF.cover_mid.half, step: metaF.cover_mid.step, n: metaF.cover_mid.n }, far: { u8: covF, half: metaF.cover_far.half, step: metaF.cover_far.step, n: metaF.cover_far.n } },
    lights: { u8: lit, half: metaF.lights.half, step: metaF.lights.step, n: metaF.lights.n },
  };
}

// the land cover class (NLCD 2021) at a point: the mid raster inside its extent, the far one beyond
export function coverAt(D, x, z) {
  for (const c of [D.cover.mid, D.cover.far]) {
    const i = Math.round((x + c.half) / c.step), j = Math.round((z + c.half) / c.step);
    if (i >= 0 && j >= 0 && i < c.n && j < c.n) return c.u8[j * c.n + i];
  }
  return 0;
}
