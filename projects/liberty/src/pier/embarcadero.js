// liberty/src/pier/embarcadero.js: the Embarcadero's furniture and life (B4), laid along the shore at the cross-section
// measured at Pier 35 on z19 (land.js): the promenade's lamps (photo 06: green-teal double-arm poles with white globes),
// the far sidewalk's 3000 K street lights (site.md §7), the F-line's catenary (poles each side of the median, span
// wires, a contact wire over each track), the median's Canary Island date palms (photos 07, 41), the historic
// streetcars running the F-line (site.md §6: "the F-line streetcars and the Embarcadero traffic, a bright and busy
// foreground at the shore end"), and the evening's traffic. Everything moving is a pure function of t.
import { rng } from 'scene3d/util.js';
import { SHORE, FRONTAGE, EMB, embProfile } from './site.js';
import { pierMat } from './mats.js';
import { box, merge, cylinder, latheAt, beam } from './geo.js';
import { palmGeo } from './trees.js';
import { lin } from 'scene3d/util.js';
import { SHORE_Y, LAMP_SPACING, LAMP_PROM, LAMP_STREET } from './land.js';

const T = window.THREE;

// the path along the shore at a distance d inland: [x, z] and the along/inland unit vectors at arc length s
export function shorePath(x0 = -560, x1 = 680, line = EMB.line) {
  // (clipped to the near box's land: past z 995 there is no ground under the street)
  const zMax = 995, pts = [];
  const raw = line.filter(p => p[0] >= x0 - 60 && p[0] <= x1 + 60);
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (p[1] <= zMax) { pts.push(p); continue; }
    const q = raw[i - 1]; if (q && q[1] < zMax) { const u = (zMax - q[1]) / (p[1] - q[1]); pts.push([q[0] + (p[0] - q[0]) * u, zMax]); }
    break;
  }
  const segs = []; let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 0.01) continue;
    segs.push({ a, b, l, s0: L, t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }); L += l;
  }
  const at = (s, d) => {
    s = Math.max(0, Math.min(L - 1e-3, s));
    let g = segs[0]; for (const q of segs) { if (q.s0 <= s) g = q; else break; }
    const u = (s - g.s0) / g.l, x = g.a[0] + (g.b[0] - g.a[0]) * u, z = g.a[1] + (g.b[1] - g.a[1]) * u;
    // the normal toward the city (the right of the west-to-east run)
    const nx = -g.t[1], nz = g.t[0];
    return { x: x + nx * d, z: z + nz * d, t: g.t, n: [nx, nz] };
  };
  return { L, at, segs };
}

export function buildEmbarcadero(world, M, landAt, out) {
  const r = rng(5101);
  const path = shorePath();
  const mats = {
    pole: M.flat('lamp pole green', '#3e5c57', { spec: 0.25, rough: 0.5 }),
    steel: M.flat('pole grey', '#6d7275', { spec: 0.2, rough: 0.5 }),
    globe: M.flat('globe', '#fff1dc', { lamps: false, emit: 5.0, nightOnly: true, lines: 0 }),
    head: M.flat('street light head', '#ffd7a0', { lamps: false, emit: 4.0, nightOnly: true, lines: 0 }),
    wire: M.flat('wire', '#2a2c2e', { lines: 0 }),
  };
  const P = { poles: [], globes: [], heads: [], wires: [], palmsT: [], palmsF: [] };
  const lights = [];
  const yAt = (x, z) => landAt(x, z);
  // the cross-section at arc length s (site.js embProfile: the road's middle off the line, its kerbs, its median)
  const prof = s => embProfile(path.at(s, 0).x);
  // promenade lamps every 30 m, 3 m beyond the bay kerb; street lights on the city sidewalk 1.5 m behind the kerb, their
  // heads 0.7 m over the road (land.js draws their pools at the same offsets)
  for (let s = LAMP_PROM.s; s < path.L; s += LAMP_SPACING) {
    const pr = prof(s), q = path.at(s, pr.c - pr.hb - 3.0), y = yAt(q.x, q.z);
    P.poles.push(cylinder([q.x, y, q.z], [q.x, y + 5.6, q.z], 0.09, 8));
    P.poles.push(latheAt([[0.22, 0], [0.2, 0.25], [0.12, 0.4], [0, 0.42]], 8, q.x, y, q.z));
    for (const sg of [-1, 1]) {
      const ax = q.x + q.t[0] * 0.75 * sg, az = q.z + q.t[1] * 0.75 * sg;
      P.poles.push(beam([q.x, y + 5.0, q.z], [ax, y + 5.2, az], 0.06, 0.06));
      P.globes.push(latheAt([[0, 0], [0.16, 0.05], [0.22, 0.22], [0.16, 0.4], [0.05, 0.46], [0, 0.47]], 10, ax, y + 4.75, az));
    }
    lights.push({ pos: [q.x, y + 5.0, q.z], kind: 'promenade lamp', color: '#fff1dc' });
  }
  for (let s = LAMP_STREET.s; s < path.L; s += LAMP_SPACING) {
    const pr = prof(s), q = path.at(s, pr.c + pr.hc + 1.5), y = yAt(q.x, q.z);
    P.poles.push(cylinder([q.x, y, q.z], [q.x, y + 8.8, q.z], 0.1, 8));
    const hx = q.x - q.n[0] * 2.2, hz = q.z - q.n[1] * 2.2;
    P.poles.push(beam([q.x, y + 8.7, q.z], [hx, y + 8.9, hz], 0.08, 0.08));
    P.heads.push(box([hx, y + 8.82, hz], [0.55, 0.12, 0.3]));
    lights.push({ pos: [hx, y + 8.7, hz], kind: 'street light', color: '#ffc98a' });
  }
  // the F-line's catenary: poles at 15.6 m and 23.4 m every 32 m, a span wire between them at 6.6 m, a contact wire over
  // each track (17.3 and 21.7 m) at 5.6 m, a messenger above it
  // (only where the road has its median and tracks: none by Pier 39)
  const wireY = 5.6;
  let prev = null;
  for (let s = 0; s < path.L; s += 32) {
    const pr = prof(s);
    if (!pr.tk || pr.md < 3.5) { prev = null; continue; }
    const pw = pr.md - 0.6, a = path.at(s, pr.c - pw), b = path.at(s, pr.c + pw), ya = yAt(a.x, a.z), yb = yAt(b.x, b.z);
    P.poles.push(cylinder([a.x, ya, a.z], [a.x, ya + 7.2, a.z], 0.12, 8), cylinder([b.x, yb, b.z], [b.x, yb + 7.2, b.z], 0.12, 8));
    P.wires.push(beam([a.x, ya + 6.6, a.z], [b.x, yb + 6.6, b.z], 0.03, 0.03));
    const offs = [-pr.tk, pr.tk], tracks = offs.map(o => path.at(s, pr.c + o));
    if (prev) tracks.forEach((t, k) => P.wires.push(beam([prev[k].x, prev[k].y + wireY, prev[k].z], [t.x, yAt(t.x, t.z) + wireY, t.z], 0.025, 0.025)));
    // the hangers: each contact wire hung from the span wire over its track (the assembly check found the contact wires
    // hanging free, 1 m under the span)
    tracks.forEach((t, k) => { const y = ya + (yb - ya) * (offs[k] + pw) / (2 * pw); P.wires.push(beam([t.x, yAt(t.x, t.z) + wireY - 0.02, t.z], [t.x, y + 6.62, t.z], 0.015, 0.015)); });
    prev = tracks.map(t => ({ x: t.x, z: t.z, y: yAt(t.x, t.z) }));
  }
  // palms (photos 07, 41): in the median between the tracks from Pier 33's frontage south (z19/z18 cross-sections: a crown
  // every ~17 m from x 115 to the box's south-east end; none on the promenade in front of Piers 35-31, none in Pier 35's
  // stretch of the median), and on the city side along Pier 39's stretch
  const palm = palmGeo(77);
  const palms = [];
  for (let s = 0; s < path.L; s += 17) {
    const q0 = path.at(s, 0);
    const west = q0.x > -330 && q0.x < -60, median = q0.x >= 115;
    if (!west && !median) continue;
    const sp = s + 8.5 + (median ? 0 : (r() - 0.5) * 3);
    if (median && Math.abs(sp - Math.round(sp / 32) * 32) < 2.5) continue;           // (clear of the catenary's span wires, every 32 m)
    const pr = prof(sp), q = path.at(sp, median ? pr.c : pr.c + pr.hc + 2.5);
    if (west && r() < 0.5) continue;
    palms.push([q.x, yAt(q.x, q.z), q.z, 10 + r() * 5, r() * 6.283]);
  }
  const TMp = mats;
  const trunkM = world.mesh(palm.trunk, M.flat('palm trunk', '#6b5a48', { lines: 1 }), { count: palms.length, name: 'embarcadero:palm trunks' });
  const frondM = world.mesh(palm.fronds, M.flat('palm fronds', '#456034', { double: true, lines: 1 }), { count: palms.length, name: 'embarcadero:palm fronds' });
  palms.forEach(([x, y, z, h, a], i) => {
    const m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), a), new T.Vector3(h, h, h));
    trunkM.setMatrixAt(i, m); frondM.setMatrixAt(i, m);
  });
  [trunkM, frondM].forEach(m => { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); });
  world.mesh(merge(P.poles), mats.pole, { name: 'embarcadero:poles' });
  world.mesh(merge(P.globes), mats.globe, { name: 'embarcadero:globes' });
  world.mesh(merge(P.heads), mats.head, { name: 'embarcadero:light heads' });
  world.mesh(merge(P.wires), mats.wire, { name: 'embarcadero:wires' });

  // ---- life: the streetcars and the traffic, as functions of t along the path
  const life = buildTraffic(world, M, path, landAt, r, prof);
  out.embarcadero = { L: +path.L.toFixed(0), lamps: lights.length, palms: palms.length, lights, life };
  return out.embarcadero;
}

// the F-line's historic streetcars (PCC cars: 14.2 m x 2.74 m, 3.2 m tall, in the liveries of the cities that ran
// them) one each way, and the evening's traffic: cars at 9-13 m/s in two lanes each way with headlights and tail lights
function buildTraffic(world, M, path, landAt, r, prof) {
  const LIV = ['#e9a23b', '#2f6f4e', '#c43d2f', '#e6d9b8', '#3a5d8f'];
  const carBody = merge([box([0, 1.75, 0], [14.2, 2.4, 2.74]), box([0, 3.1, 0], [12.6, 0.4, 2.4]), box([-4.6, 0.3, 0], [2.4, 0.6, 2.2]), box([4.6, 0.3, 0], [2.4, 0.6, 2.2])]);
  const bodyMat = pierMat(world, {
    name: 'streetcar', lamps: false, uniforms: { uL: { value: new T.Vector3(...lin(LIV[0])) }, uW: { value: new T.Vector3(...lin('#ffe2a8')) } },
    glsl: 'uniform vec3 uL, uW;',
    body: /* glsl */`
      // the livery below the windows, cream above, a band of lit windows (1.6-2.6 m up) along each side
      vec3 o = P - vec3(0.0);
      float h = vUv.y;
      vec3 c = mix(uL, vec3(0.9, 0.86, 0.76), step(2.7, h));
      float win = step(1.55, h) * step(h, 2.55) * step(abs(s.N.y), 0.3) * step(0.18, fract(vUv.x / 1.15)) * step(fract(vUv.x / 1.15), 0.92);
      c = mix(c, vec3(0.12, 0.14, 0.16), win);
      s.albedo = c; s.rough = 0.5; s.spec = 0.3;
      s.emissive += uW * win * (0.35 + 0.65 * smoothstep(0.1, 0.6, uNight)) * 1.2;
    `,
  });
  const cars = [];
  const N_TRAM = 2, N_CAR = 28;
  const tram = world.mesh(carBody, bodyMat, { count: N_TRAM, name: 'embarcadero:streetcars', frustum: false });
  // cars: a body and a cabin; their lights are a separate emissive instanced mesh
  const wheel = (x, z) => { const g = cylinder([x, 0.32, z - 0.11], [x, 0.32, z + 0.11], 0.32, 10); return g; };
  const carGeo = merge([box([0, 0.66, 0], [4.5, 0.7, 1.8]), box([-0.2, 1.3, 0], [2.4, 0.6, 1.6]), wheel(1.4, 0.82), wheel(1.4, -0.82), wheel(-1.4, 0.82), wheel(-1.4, -0.82)]);
  const carMat = pierMat(world, {
    name: 'cars', lamps: false, uniforms: {}, glsl: '',
    body: 's.albedo = vec3(0.12 + 0.6 * fract(sd * 7.0), 0.12 + 0.5 * fract(sd * 11.0), 0.13 + 0.55 * fract(sd * 3.0)) * 0.7; s.rough = 0.35; s.spec = 0.6;',
  });
  const carM = world.mesh(carGeo, carMat, { count: N_CAR, name: 'embarcadero:cars', frustum: false });
  const lightGeo = merge([box([2.27, 0.68, 0.6], [0.06, 0.16, 0.3]), box([2.27, 0.68, -0.6], [0.06, 0.16, 0.3])]);
  const tailGeo = merge([box([-2.27, 0.75, 0.65], [0.06, 0.14, 0.28]), box([-2.27, 0.75, -0.65], [0.06, 0.14, 0.28])]);
  const head = world.mesh(lightGeo, M.flat('headlights', '#fff6e0', { lamps: false, emit: 7.0, lines: 0 }), { count: N_CAR + N_TRAM, name: 'embarcadero:headlights', frustum: false });
  const tail = world.mesh(tailGeo, M.flat('tail lights', '#ff2a1a', { lamps: false, emit: 4.0, lines: 0 }), { count: N_CAR + N_TRAM, name: 'embarcadero:tail lights', frustum: false });
  // the cars keep to their lane as the road changes its section: inner (a quarter of the way out) or outer (three
  // quarters) of their side's lanes, from the median's kerb (or the middle) to the bike lane or the parking lane
  const laneAt = (side, k, s) => { const pr = prof(s), h = side > 0 ? pr.hc - pr.exC : pr.hb - pr.exB; return pr.c + side * (pr.md + (h - pr.md) * k); };
  // (one speed a lane and the cars spread evenly along it, so no car ever runs through another)
  const LANES = [[1, 0.25], [1, 0.75], [-1, 0.25], [-1, 0.75]].map(([dir, k]) => ({ dir, k, v: 9 + 4 * r(), n: 0 }));
  for (let i = 0; i < N_CAR; i++) LANES[i % 4].n++;
  for (const ln of LANES) for (let j = 0; j < ln.n; j++)
    cars.push({ dir: ln.dir, lane: s => laneAt(ln.dir > 0 ? 1 : -1, ln.k, s), v: ln.v, s0: (j + 0.6 * r()) * path.L / ln.n, seed: r() });
  // the streetcars run where the tracks are (the median's stretch), there and back round the ends
  let sA = null, sB = 0; for (let s = 0; s < path.L; s += 4) { const pr = prof(s); if (pr.tk) { if (sA === null) sA = s; sB = s; } }
  if (sA === null) { sA = 0; sB = path.L; }
  const trams = [{ dir: 1, lane: s => prof(s).c + prof(s).tk, v: 6.5, s0: 0.2 * (sB - sA) }, { dir: -1, lane: s => prof(s).c - prof(s).tk, v: 6.5, s0: 0.7 * (sB - sA) }];
  const TRAM_LIGHTS = new T.Matrix4().makeScale(3.13, 1.3, 1.5);
  const M4 = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3(), S1 = new T.Vector3(1, 1, 1), Y = new T.Vector3(0, 1, 0);
  const place = (mesh, i, v, lane, dir, s0, t, a0 = 0, len = path.L) => {
    // around and around: run the path's length (or the tracks'), a pure function of t (the length wraps out of sight past
    // the box's ends)
    let s = (s0 + dir * v * t) % len; if (s < 0) s += len; s += a0;
    const q = path.at(s, lane(s)), y = landAt(q.x, q.z);
    const a = Math.atan2(-(q.t[1] * dir), q.t[0] * dir);
    Q.setFromAxisAngle(Y, a); V.set(q.x, y - 0.04, q.z); M4.compose(V, Q, S1);      // (4 cm into the road: the 8 m ground mesh interpolates the path's height)
    mesh.setMatrixAt(i, M4); return M4;
  };
  world.onFrame(t => {
    cars.forEach((c, i) => { const m = place(carM, i, c.v, c.lane, c.dir, c.s0, t); head.setMatrixAt(i, m); tail.setMatrixAt(i, m); });
    // the streetcars stop at their platforms: a dwell of 25 s every ~400 m (a sawtooth on the arc length)
    trams.forEach((c, i) => {
      const cycle = 400 / c.v + 25, k = Math.floor(t / cycle), u = t - k * cycle;
      const tt = k * (400 / c.v) + Math.min(u, 400 / c.v);
      place(tram, i, c.v, c.lane, c.dir, c.s0, tt, sA, sB - sA);
      // (the car's lamp pair stretched onto the streetcar's ends: 14.2 m long against the car's 4.5)
      const ML = M4.clone().multiply(TRAM_LIGHTS); head.setMatrixAt(N_CAR + i, ML); tail.setMatrixAt(N_CAR + i, ML);
    });
    for (const m of [carM, tram, head, tail]) m.instanceMatrix.needsUpdate = true;
  });
  carM.userData.posAt = (t, i) => { const c = cars[i || 0]; let s = (c.s0 + c.dir * c.v * t) % path.L; if (s < 0) s += path.L; const q = path.at(s, c.lane(s)); return [q.x, landAt(q.x, q.z) + 1, q.z]; };
  // the streetcars' gong as each pulls away from a stop (a dwell ends every 400 m): one event per departure, where it is
  const departures = (T1) => {
    const ev = [];
    trams.forEach((c, i) => {
      const cycle = 400 / c.v + 25;
      for (let k = 0; k * cycle < T1; k++) {
        const t = k * cycle + 25 - 0.01, tt = (k + 1) * (400 / c.v);          // (the dwell's end; the position it reached)
        let s = (c.s0 + c.dir * c.v * tt) % (sB - sA); if (s < 0) s += sB - sA; s += sA;
        const q = path.at(s, c.lane(s)); ev.push({ t: +t.toFixed(2), kind: 'streetcar_gong', pos: [+q.x.toFixed(1), +(landAt(q.x, q.z) + 3).toFixed(1), +q.z.toFixed(1)], level: 98, note: 'estimated: a PCC car\'s foot gong at 1 m' });
      }
    });
    return ev;
  };
  return { cars: N_CAR, streetcars: N_TRAM, departures };
}
