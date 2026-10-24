// liberty/src/far/citylights.js: the bay's cities at night (B6): a lamp on every lit street (OpenStreetMap's roads,
// ODbL; tools/far_data.py roads: one lamp per 32-48 m by the road's class, only on developed land), coloured by place
// (San Francisco's 3000 K LEDs since 2017, site.md §7; the East Bay's and the freeways' mix of LED and old sodium), and
// the traffic on every freeway and trunk road (cars' heads and tails streaming along, on the GPU: a pure function of
// t). Thinned with distance so a far city stays a carpet of points, not a smear, at a bounded cost.
import { bytes } from './data.js';
import { lightSet, flowSet, LIGHT_COL } from './sprites.js';
import { beam, merge } from 'scene3d/geom.js';
import { solidMat } from './structure.js';
import { hash1 } from 'scene3d/util.js';
import * as P from '../plan.js';

async function loadBin(path) {
  const u8 = await bytes(path);
  const hl = new DataView(u8.buffer, u8.byteOffset, 4).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + hl)));
  const body = u8.subarray(4 + hl), TA = { int16: Int16Array, uint8: Uint8Array, uint16: Uint16Array, int32: Int32Array };
  const o = {};
  for (const [name, dt, off, n] of head.arrays) { const C = TA[dt]; o[name] = new C(body.slice(off, off + n * C.BYTES_PER_ELEMENT).buffer); }
  return { head, o };
}
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// where a place is: San Francisco (the peninsula south and west of the berth), Marin (north of the Gate), the East Bay
const placeOf = (x, z) => (z < -3500 && x < 1500 ? 'marin' : (x < 2600 && z > -2600 ? 'sf' : 'east'));

export async function buildCityLights(world, ctx, D, opts = {}) {
  const t0 = performance.now();
  const [Lp, Fw] = await Promise.all([loadBin('far/lamps.bin.gz'), loadBin('far/freeways.bin.gz')]);
  const ground = (x, z) => D.near.at(x, z) ?? D.mid.at(x, z) ?? D.far.at(x, z) ?? 0;
  // the corridors of the bridges built by hand (their own lamps and traffic): skip OSM's along them
  const avoid = opts.avoid || [];
  const inCorr = (x, z) => avoid.some(([a, b, w]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) < w;
  });
  const NB = P.WORLD.near;
  // ---- the lamps
  // (faded out nearer than 160 m, where a lamp would be resolved: its pole and head are not modelled; from the ship the
  // nearest is 600 m off, outside B4's near box)
  const lamps = lightSet(world, 'street lamps', { tile: 2000, thin: 6500, fade: 160 });
  const H = { 1: 12, 2: 10, 3: 9, 4: 9, 5: 8, 6: 7.5, 7: 10 };
  const { x: X, z: Z, cls, bridge } = Lp.o, q = Lp.head.q;
  let n = 0, skipped = 0;
  for (let i = 0; i < Lp.head.n; i++) {
    const x = X[i] * q, z = Z[i] * q, c = cls[i];
    let g = ground(x, z);
    if (g < 0.5) { if (!bridge[i] || inCorr(x, z)) { skipped++; continue; } g = 22; }
    if (inCorr(x, z)) { skipped++; continue; }
    const h = hash1(i * 2654435 + 17), place = placeOf(x, z), fw = c === 1 || c === 7;
    // colour: SF's warm LEDs (a few old sodium), the East Bay's and the freeways' mix
    const sodium = h < (fw ? 0.55 : place === 'sf' ? 0.12 : place === 'east' ? 0.35 : 0.2);
    const col = sodium ? LIGHT_COL.sodium : (hash1(i * 7 + 3) < (place === 'east' ? 0.4 : 0.15) ? LIGHT_COL.led4000 : LIGHT_COL.led3000);
    const k = (fw ? 1.25 : c <= 4 ? 1.1 : 0.9) * (0.8 + 0.4 * hash1(i * 13 + 5));
    lamps.add(x, g + H[c], z, col, k, { size: 0.9, minPx: c <= 4 || fw ? 1.35 : 1.15, on: 0.12 + 0.12 * hash1(i * 31) });
    n++;
  }
  lamps.flush();
  // ---- the traffic: every freeway and trunk carriageway, cars by its lanes (8 a km a lane at 8 pm on a Saturday:
  // ~1,000 an hour at 60 mph; est.), heads white and tails red 4.5 m behind
  const cars = [], decks = [];
  const meta = Fw.o.meta, d = Fw.o.d, fq = Fw.head.q;
  let k = 0, carN = 0;
  for (let w = 0; w < Fw.head.n; w++) {
    const np = meta[w * 4], oneway = meta[w * 4 + 1], lanes = meta[w * 4 + 2], br = meta[w * 4 + 3];
    const pts = []; let x = 0, z = 0;
    for (let i = 0; i < np; i++, k++) { if (i === 0) { x = d[2 * k]; z = d[2 * k + 1]; } else { x += d[2 * k]; z += d[2 * k + 1]; } pts.push([x * fq, z * fq]); }
    const speed = oneway ? 27 : 18;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 2) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (mx > NB.x0 && mx < NB.x1 && mz > NB.z0 && mz < NB.z1) continue;
      if (inCorr(mx, mz)) continue;
      const ga = ground(a[0], a[1]), gb = ground(b[0], b[1]);
      const ya = ga < 0.5 ? (br ? 22 : null) : ga + 1.0, yb = gb < 0.5 ? (br ? 22 : null) : gb + 1.0;
      if (ya === null || yb === null) continue;
      // the long bridges over the water OSM maps and nobody built by hand (the Richmond-San Rafael, 14 km up the bay):
      // a deck on its piers, under its lamps and its traffic
      if (br && (ga < 0.5 || gb < 0.5)) { decks.push(beam([a[0], ya - 2.0, a[1]], [b[0], yb - 2.0, b[1]], 13, 2.6)); if (i % 3 === 0) decks.push(beam([a[0], -2, a[1]], [a[0], ya - 3.2, a[1]], 3.5, 6)); }
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      for (const dir of oneway ? [1] : [1, -1]) {
        const off = oneway ? 0 : 2.0 + lanes * 0.9;
        const ox = -uz * off * dir, oz = ux * off * dir;
        const A = dir > 0 ? [a[0] + ox, ya, a[1] + oz] : [b[0] + ox, yb, b[1] + oz], B = dir > 0 ? [b[0] + ox, yb, b[1] + oz] : [a[0] + ox, ya, a[1] + oz];
        const m = L / 1000 * 8 * Math.max(1, oneway ? lanes : Math.ceil(lanes / 2));
        const cnt = Math.floor(m) + (hash1(w * 977 + i * 31 + (dir > 0 ? 0 : 7)) < m - Math.floor(m) ? 1 : 0);
        for (let j = 0; j < cnt; j++) {
          const ph = hash1(w * 7919 + i * 131 + j * 17 + (dir > 0 ? 0 : 3)) * L, v = speed * (0.85 + 0.3 * hash1(w + i * 3 + j * 5));
          cars.push({ a: A, b: B, speed: v, phase: ph, c: LIGHT_COL.head.map(c2 => c2 * 1.3), size: 1.4 });
          cars.push({ a: A, b: B, speed: v, phase: ph - 4.5, c: LIGHT_COL.tail.map(c2 => c2 * 0.9), size: 1.1 });
          carN++;
        }
      }
    }
  }
  const flow = flowSet(world, 'freeways', cars, { tile: 3000, thin: 9000 });
  if (decks.length) world.mesh(merge(decks), solidMat(world, 'far bridges', '#6c6f72', { night: 0.5 }), { name: 'far bridges:decks', cast: false });
  return { lamps: n, skipped, cars: carN, bridgeSegments: decks.length, ms: Math.round(performance.now() - t0) };
}
