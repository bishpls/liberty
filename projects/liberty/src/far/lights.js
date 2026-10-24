// liberty/src/far/lights.js: the far view's lights (B6): the fixed lamps and beacons other files add (bridges.js,
// landmarks.js), the traffic on the bridges and freeways (cars' heads and tails along lanes, a pure function of t), and
// the moving things of the air (life.js). The city's own carpet of lights is citylights.js.
import { lightSet, LIGHT_COL } from './sprites.js';
import { hash1 } from 'scene3d/util.js';

// a lane: a polyline [[x, y, z], ...] in the direction of travel; cars spawned by a seeded spacing (per km), each its own
// speed; a car is a white pair of heads and, 4 m behind, a red pair of tails
function laneOf(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const L = cum[cum.length - 1];
  const at = (s, o) => {
    s = ((s % L) + L) % L;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const f = (s - cum[lo]) / Math.max(cum[hi] - cum[lo], 1e-6), a = pts[lo], b = pts[hi];
    o[0] = a[0] + (b[0] - a[0]) * f; o[1] = a[1] + (b[1] - a[1]) * f; o[2] = a[2] + (b[2] - a[2]) * f;
    return o;
  };
  return { pts, L, at };
}

export function makeLights(world) {
  const fixed = lightSet(world, 'fixed', { tile: 3000 });
  const lanes = [];
  const traffic = {
    lanes,
    // add a lane: { speed (m/s), per (cars per km per lane), seed }
    lane(pts, { speed = 20, per = 15, seed = 1 } = {}) {
      if (pts.length < 2) return;
      const ln = laneOf(pts), n = Math.max(1, Math.round(ln.L / 1000 * per));
      ln.cars = Array.from({ length: n }, (_, i) => ({ s0: hash1(seed * 7919 + i * 104729) * ln.L, v: speed * (0.85 + 0.3 * hash1(seed * 31 + i * 17)) }));
      lanes.push(ln);
    },
  };
  let moving = null;
  const o = [0, 0, 0], q = [0, 0, 0];
  const out = {
    fixed, traffic,
    flush() {
      fixed.flush();
      const n = lanes.reduce((a, l) => a + l.cars.length, 0);
      moving = lightSet(world, 'traffic', { moving: true, max: n * 2 });
      for (const ln of lanes) for (const c of ln.cars) {
        moving.add(0, -1e4, 0, LIGHT_COL.head, 1.6, { size: 1.6, minPx: 1.4, on: 0.05 });
        moving.add(0, -1e4, 0, LIGHT_COL.tail, 1.0, { size: 1.2, minPx: 1.2, on: 0.05 });
      }
      moving.init();
      out.cars = n;
      world.onFrame(t => out.update(t));
      return out;
    },
    update(t) {
      if (!moving) return;
      let i = 0;
      for (const ln of lanes) for (const c of ln.cars) {
        const s = c.s0 + c.v * t;
        ln.at(s, o); ln.at(s - 4.2, q);
        moving.set(i++, o[0], o[1], o[2]); moving.set(i++, q[0], q[1], q[2]);
      }
      moving.commit(i);
    },
  };
  return out;
}
