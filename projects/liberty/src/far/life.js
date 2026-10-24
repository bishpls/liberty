// liberty/src/far/life.js: life at distance (B6), every one a pure function of the scene clock:
//  - aircraft: SFO's arrivals from the north coming down the bay east of the city (est. 2,100 m over Treasure Island,
//    descending south), OAK's arrivals on runway 30's final from the south-east (a 3 deg glide), OAK's departures
//    climbing out north-west over the bay, a high overflight; each with its landing lights (on below ~3,000 m),
//    red and green wingtips, a white tail, the red beacon (~1 Hz) and the white strobes' double flash
//  - the far ferries B3's near traffic doesn't run (SF Bay Ferry: the Ferry Building to Oakland and Alameda under the
//    west span, to Richmond and to Vallejo up the bay): masthead, sidelights, the cabin's rows of windows
//  - ships at anchor (Anchorage 7 south of the Bay Bridge, off Hunters Point: est. from NOAA chart 18650's
//    anchorages): a dark hull, the white anchor lights fore and aft, the deck's working lights
//  - the bay's lights: Yerba Buena Island's (Oc W 4 s), Point Blunt's on Angel Island (Fl G 5 s), Lime Point's under
//    the Gate (Fl W 5 s) (characteristics est.: the USCG Light List vol. VI not fetched)
import { lightSet, LIGHT_COL } from './sprites.js';
import { box, merge } from 'scene3d/geom.js';
import { solidMat } from './structure.js';
import { hash1 } from 'scene3d/util.js';

const T = window.THREE;
// routes: [x, y, z] knots (world m), speed (m/s), headway (s), offset (s), the lights' kind
export const AIR = [
  { name: 'SFO arrival from the north', pts: [[9000, 3600, -30000], [4600, 2600, -9000], [4200, 2100, -1500], [3000, 1500, 8000], [1600, 900, 18000], [1175, 10, 20940]], v: 115, every: 150, off: 20, landing: true },
  { name: 'OAK arrival, runway 30 final', pts: [[33000, 1600, 22000], [25000, 1100, 17500], [17481, 10, 12218]], v: 75, every: 210, off: 90, landing: true },
  { name: 'OAK departure, north-west over the bay', pts: [[15741, 10, 10697], [11000, 700, 6800], [6000, 1500, 2500], [-6000, 2800, -6000], [-20000, 4200, -14000]], v: 95, every: 260, off: 150, landing: true },
  { name: 'high overflight, east to west', pts: [[60000, 10600, -12000], [-60000, 10600, 4000]], v: 235, every: 420, off: 0, landing: false },
];
export const FERRIES = [
  { name: 'Ferry Building - Oakland, Alameda', pts: [[1250, 0, 1450], [2200, 0, 1700], [3600, 0, 1000], [6500, 0, 1800], [9758, 0, 2627], [11258, 0, 2306]], v: 13, every: 900, off: 60 },
  { name: 'Ferry Building - Richmond', pts: [[1250, 0, 1400], [2000, 0, -400], [2300, 0, -3500], [3200, 0, -7000], [4711, 0, -10943]], v: 15, every: 1200, off: 400 },
  { name: 'Ferry Building - Vallejo', pts: [[1250, 0, 1400], [1900, 0, -800], [1600, 0, -5000], [2600, 0, -12000], [6290, 0, -20911]], v: 17, every: 1500, off: 900 },
];
export const SHIPS = [
  { name: 'container ship, Anchorage 7', at: [2900, 3900], hdg: 2.4, L: 294, B: 32 },
  { name: 'bulk carrier, Anchorage 7', at: [3600, 3100], hdg: 2.1, L: 225, B: 32 },
  { name: 'tanker, off Hunters Point', at: [4600, 8200], hdg: 2.6, L: 250, B: 44 },
];

function polyline(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const L = cum[cum.length - 1];
  const at = s => {
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const f = (s - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-6), a = pts[i - 1], b = pts[i];
    return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], d: [(b[0] - a[0]) / (cum[i] - cum[i - 1]), (b[1] - a[1]) / (cum[i] - cum[i - 1]), (b[2] - a[2]) / (cum[i] - cum[i - 1])] };
  };
  return { L, at };
}

export function buildFarLife(world, ctx, { lights }) {
  const L = lights;
  // ---- the bay's lights (fixed, blinking)
  const LT = [
    { at: [3867, 18, 407], c: LIGHT_COL.white, period: 4, duty: 0.75, name: 'Yerba Buena Island light (Oc W 4 s)' },
    { at: [-764, 10, -4976], c: LIGHT_COL.green, period: 5, duty: 0.12, name: 'Point Blunt (Fl G 5 s)' },
    { at: [-6156, 12, -2255], c: LIGHT_COL.white, period: 5, duty: 0.12, name: 'Lime Point (Fl W 5 s)' },
  ];
  for (const l of LT) L.fixed.add(...l.at, l.c, 4.0, { size: 1.0, minPx: 2.0, on: 0, period: l.period, duty: l.duty, phase: hash1(l.at[0] | 0) * l.period });
  // ---- ships at anchor: a hull and a house (dark), the anchor lights and the deck lights
  const G = [];
  for (const s of SHIPS) {
    const [x, z] = s.at, u = [Math.cos(s.hdg), Math.sin(s.hdg)], rot = -s.hdg;
    G.push(box([x, 6, z], [s.L, 14, s.B], { rotY: rot }));
    const ah = [x - u[0] * s.L * 0.38, z - u[1] * s.L * 0.38];
    G.push(box([ah[0], 26, ah[1]], [22, 26, s.B * 0.9], { rotY: rot }));
    if (s.name.startsWith('container')) for (let k = -4; k <= 3; k++) G.push(box([x + u[0] * k * 30, 19, z + u[1] * k * 30], [26, 12, s.B * 0.95], { rotY: rot }));     // (on the deck at 13 m)
    L.fixed.add(x + u[0] * s.L * 0.48, 22, z + u[1] * s.L * 0.48, LIGHT_COL.white, 2.0, { size: 1.0, minPx: 1.6, on: 0.1 });
    L.fixed.add(x - u[0] * s.L * 0.48, 16, z - u[1] * s.L * 0.48, LIGHT_COL.white, 1.8, { size: 1.0, minPx: 1.5, on: 0.1 });
    for (let k = 0; k < 6; k++) { const f = -0.4 + k * 0.16; L.fixed.add(x + u[0] * s.L * f, 15, z + u[1] * s.L * f, LIGHT_COL.sodium, 1.2, { size: 1.0, minPx: 1.3, on: 0.12 }); }
    for (let k = 0; k < 4; k++) L.fixed.add(ah[0] + u[1] * (k - 1.5) * 4, 22 + k * 3.2, ah[1] - u[0] * (k - 1.5) * 4, LIGHT_COL.window, 1.0, { size: 0.7, minPx: 1.2, on: 0.12 });
  }
  world.mesh(merge(G), solidMat(world, 'ships at anchor', '#3a3f45', { night: 0.6 }), { name: 'far life:ships at anchor', cast: false });
  // ---- the moving lights: aircraft and ferries, positions each frame from t
  const set = lightSet(world, 'air and ferries', { moving: true, max: 400 });
  const movers = [];
  for (const r of AIR) {
    const P = polyline(r.pts), n = Math.ceil(P.L / (r.v * r.every)) + 1;
    for (let k = 0; k < n; k++) {
      const base = set.n;
      // landing pair, red left, green right, white tail, red beacon, white strobes (blinking set in the sprites)
      set.add(0, -1e4, 0, LIGHT_COL.head, r.landing ? 7.0 : 0, { size: 2.0, minPx: 2.4, on: 0 });
      set.add(0, -1e4, 0, LIGHT_COL.red, 2.2, { size: 0.8, minPx: 1.4, on: 0 });
      set.add(0, -1e4, 0, LIGHT_COL.green, 2.2, { size: 0.8, minPx: 1.4, on: 0 });
      set.add(0, -1e4, 0, LIGHT_COL.white, 1.6, { size: 0.7, minPx: 1.3, on: 0 });
      set.add(0, -1e4, 0, LIGHT_COL.red, 4.0, { size: 1.0, minPx: 1.8, on: 0, period: 1.1, duty: 0.18, phase: k * 0.37 });
      set.add(0, -1e4, 0, LIGHT_COL.white, 7.0, { size: 1.2, minPx: 2.2, on: 0, period: 1.3, duty: 0.06, phase: k * 0.53 });
      movers.push({ kind: 'air', r, P, k, n, base });
    }
  }
  for (const r of FERRIES) {
    const P = polyline(r.pts), n = Math.ceil(P.L / (r.v * r.every)) + 1;
    for (let k = 0; k < n; k++) {
      const base = set.n;
      set.add(0, -1e4, 0, LIGHT_COL.white, 2.0, { size: 0.8, minPx: 1.5, on: 0.05 });
      set.add(0, -1e4, 0, LIGHT_COL.red, 1.6, { size: 0.7, minPx: 1.3, on: 0.05 });
      set.add(0, -1e4, 0, LIGHT_COL.green, 1.6, { size: 0.7, minPx: 1.3, on: 0.05 });
      for (let w = 0; w < 6; w++) set.add(0, -1e4, 0, w % 3 === 0 ? LIGHT_COL.cool : LIGHT_COL.window, 1.2, { size: 0.7, minPx: 1.2, on: 0.05 });
      movers.push({ kind: 'ferry', r, P, k, n, base });
    }
  }
  set.init();
  const update = t => {
    for (const m of movers) {
      // (slot k of n flies every n x headway: the stream never starts empty, never repeats within a slot's period)
      const per = m.n * m.r.every, s = ((((t - m.r.off - m.k * m.r.every) % per) + per) % per) * m.r.v;
      const on = s >= 0 && s <= m.P.L;
      const nL = m.kind === 'air' ? 6 : 9;
      if (!on) { for (let i = 0; i < nL; i++) set.set(m.base + i, 0, -1e4, 0); continue; }
      const { p, d } = m.P.at(s), h = Math.hypot(d[0], d[2]) || 1, fx = d[0] / h, fz = d[2] / h, lx = fz, lz = -fx;     // forward, left
      if (m.kind === 'air') {
        const span = 18;
        set.set(m.base, p[0] + fx * 12, p[1] - 1, p[2] + fz * 12);
        // (landing lights off above ~3,000 m)
        set.setCol(m.base, ...LIGHT_COL.head.map(c => c * (m.r.landing && p[1] < 3000 ? 7.0 : 0)));
        set.set(m.base + 1, p[0] + lx * span, p[1], p[2] + lz * span);
        set.set(m.base + 2, p[0] - lx * span, p[1], p[2] - lz * span);
        set.set(m.base + 3, p[0] - fx * 20, p[1] + 2, p[2] - fz * 20);
        set.set(m.base + 4, p[0], p[1] + 3, p[2]);
        set.set(m.base + 5, p[0] - fx * 4, p[1] - 2, p[2] - fz * 4);
      } else {
        set.set(m.base, p[0] + fx * 8, 9, p[2] + fz * 8);
        set.set(m.base + 1, p[0] + lx * 5, 5, p[2] + lz * 5);
        set.set(m.base + 2, p[0] - lx * 5, 5, p[2] - lz * 5);
        for (let w = 0; w < 6; w++) { const f = -14 + w * 5.5, side = w % 2 ? 1 : -1; set.set(m.base + 3 + w, p[0] + fx * f + lx * side * 5.2, 3.5 + (w % 3) * 1.6, p[2] + fz * f + lz * side * 5.2); }
      }
    }
    set.commit();
  };
  world.onFrame(t => update(t));
  update(0);
  return { aircraft: movers.filter(m => m.kind === 'air').length, ferries: movers.filter(m => m.kind === 'ferry').length, ships: SHIPS.length, lights: LT.length };
}
