// liberty/src/water/boats.js: the night's traffic (site.md §4: "at night traffic is sparser: late harbour cruises, a
// ferry, a few sailboats under power with red/green/white nav lights"). Every boat is a pure function of t:
//   voyages    each boat makes voyages on a seeded schedule over the hour (rng: never a loop one can spot), each a curved
//              track (a cubic Bezier) from beyond the near world to beyond it again, at its service speed; between
//              voyages it is away (off the map)
//   the boat   a low hull with its deckhouse and lit windows; nav lights per COLREGs rule 21 (sidelights red to port and
//              green to starboard over 112.5 deg from ahead, the masthead light white over 225 deg forward, the stern
//              light white over 135 deg aft), each lit only inside its arc as seen from the eye (the shader)
//   the wake   the track behind the boat (its last ~10 minutes, sampled every 30 m) for the water's shader: a Kelvin wedge
//              (19.47 deg each side), transverse waves of wavelength 2 pi U^2 / g, the divergent system along the cusps,
//              the propeller's foam strip; heights from the boat's size and speed
//   sounds     where and when each wake reaches her side (the wedge's edge sweeping her waterline): a slap for the
//              soundscape
import { rng, TAU, clamp } from 'scene3d/util.js';
import { G } from './spectrum.js';

const T = window.THREE;
const KT = 1 / Math.tan(19.47 * Math.PI / 180);           // (cot of the Kelvin half-angle)

// the fleet (site.md §4; speeds from the operators' service speeds; sizes from the vessel classes). every: the gap
// between its voyages (s); the bay is never empty (measured: boats within 1.5 km over the hour)
export const FLEET = [
  { name: 'bay cruise', kind: 'cruise', L: 32, B: 9, H: 6.5, speed: 5.0, decks: 2, hull: '#e8e8e2', house: '#f2f2ee', windows: '#ffd9a0', every: [20, 150], wakeH: 0.35 },
  { name: 'ferry', kind: 'ferry', L: 40, B: 11, H: 7.5, speed: 11.0, decks: 2, hull: '#d8dde2', house: '#eef1f4', windows: '#e8f0ff', every: [30, 300], wakeH: 0.45 },
  { name: 'sloop under power', kind: 'sail', L: 10.5, B: 3.5, H: 1.6, mast: 14, speed: 2.6, decks: 0, hull: '#f4f2ea', house: '#ece8dc', windows: '#ffcf8a', every: [60, 500], wakeH: 0.1 },
  { name: 'crab boat', kind: 'work', L: 13, B: 4.6, H: 3.2, speed: 3.6, decks: 1, hull: '#3c5b78', house: '#e6e2d6', windows: '#fff0c8', every: [90, 600], wakeH: 0.15 },
  { name: 'dinner cruise', kind: 'cruise', L: 38, B: 10, H: 7.5, speed: 4.2, decks: 3, hull: '#1d2a3c', house: '#f0ece2', windows: '#ffc878', every: [120, 700], wakeH: 0.35 },
  { name: 'tug', kind: 'work', L: 30, B: 10, H: 6, speed: 4.5, decks: 2, hull: '#7a2a24', house: '#e8e2d2', windows: '#fff2d0', every: [200, 900], wakeH: 0.3 },
];

// the lanes (world frame, metres: x starboard/east-ish, z aft/south-ish): waypoints over water, clear of the berth
// (x -60..120, z -230..200), Pier 39's marina and Alcatraz; a voyage takes a lane either way, its waypoints jittered
const LANES = {
  cruise: [
    [[-560, -430], [-250, -420], [150, -390], [520, -560], [950, -1150], [1350, -2300]],       // out of Pier 39/41, east of Alcatraz
    [[-560, -430], [-350, -520], [-300, -1000], [-700, -1500], [-1900, -1700], [-2600, -2400]], // out to the Gate side of Alcatraz
    [[1600, -600], [700, -420], [200, -360], [-350, -420], [-560, -440]],                       // back in along the waterfront
  ],
  ferry: [
    [[1500, 700], [1150, -150], [550, -700], [-400, -1150], [-1800, -1500], [-3300, -2700]],     // the Ferry Building to Sausalito
    [[1500, 700], [1300, -300], [900, -1100], [200, -2300], [-500, -3700]],                      // to Tiburon, east of Angel Island
  ],
  sail: [
    [[-220, -390], [-60, -520], [250, -950], [550, -1900]],
    [[-220, -390], [-450, -700], [-700, -1250], [-600, -2000]],
  ],
  work: [
    [[-1600, -430], [-700, -520], [120, -420], [700, -330], [1500, -60], [2400, 150]],          // along the waterfront
    [[2600, -500], [1400, -1300], [300, -2000], [-900, -2800]],                                  // far out, across
  ],
};
const catmull = (pts, n) => {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const u = k / n, u2 = u * u, u3 = u2 * u;
      out.push([0, 1].map(c => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
};

// the voyages: for each boat over [0, horizon] s, seeded; each { t0, t1, v, pts (arc-length table: [x, z, s]), len }.
// isWater(x, z): the track must stay on it (a lane jittered onto land is drawn again; a failure counts in the measures)
export const CYCLE = 7200;             // (the schedule's length: two hours, then it comes round again: no loop anyone sees)
export function makeVoyages(P, { horizon = CYCLE + 900, seed = 2026, isWater = null } = {}) {
  const R = rng(seed), stats = { voyages: 0, redraws: 0, pointsOffWater: 0 };
  const fleet = FLEET.map(b => {
    const out = [], ln = LANES[b.kind];
    let t = -R.range(0, 600);                            // (under way at t = 0, mostly)
    let li = Math.floor(R() * ln.length);
    while (t < horizon) {
      let lane = ln[li % ln.length]; li += 1 + Math.floor(R() * 2);
      if (R() < 0.5) lane = lane.slice().reverse();
      let pts = null, bad = 0;
      for (let tries = 0; tries < 12; tries++) {
        const way = lane.map((w, i) => (i === 0 || i === lane.length - 1 ? w : [w[0] + R.range(-60, 60), w[1] + R.range(-60, 60)]));
        const sm = catmull(way, 24);
        bad = isWater ? sm.filter(([x, z]) => !isWater(x, z)).length : 0;
        pts = sm; if (!bad) break; stats.redraws++;
      }
      stats.pointsOffWater += bad;
      let sacc = 0;
      const tab = pts.map((p, i) => { if (i) sacc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); return [p[0], p[1], sacc]; });
      const v = b.speed * R.range(0.85, 1.1), dur = sacc / v;
      out.push({ t0: t, t1: t + dur, v, pts: tab, len: sacc });
      stats.voyages++;
      t += dur + R.range(b.every[0], b.every[1]);
    }
    return out;
  });
  // the bay never empty: when no boat is under way within 1.5 km of her, the voyage that next comes in range is moved
  // earlier (alone: its boat keeps 15 s at least after its previous voyage), gap after gap through the hour
  const inRange = vy => { let a = null, b = null; for (const p of vy.pts) if (Math.hypot(p[0], p[1]) < 1500) { const tt = vy.t0 + p[2] / vy.v; if (a === null) a = tt; b = tt; } return a === null ? null : [a, b]; };
  let from = 0;
  for (let pass = 0; pass < 400 && from < horizon; pass++) {
    const win = []; fleet.forEach((voy, bi) => voy.forEach((vy, vi) => { const r = inRange(vy); if (r) win.push([r[0], r[1], bi, vi]); }));
    win.sort((u, w) => u[0] - w[0]);
    let cover = from, gap = null;
    for (const w of win) { if (w[1] < from) continue; if (w[0] > cover + 1) { gap = [cover, w[0]]; break; } cover = Math.max(cover, w[1]); }
    if (!gap) break;
    let moved = false;
    for (const w of win.filter(x => x[0] >= gap[1] - 1e-6).slice(0, 8)) {
      const voy = fleet[w[2]], vi = w[3], need = w[0] - gap[0] + 5;
      const lim = vi > 0 ? voy[vi].t0 - voy[vi - 1].t1 - 15 : need;
      const d = Math.min(need, lim);
      if (d <= 1) continue;
      voy[vi].t0 -= d; voy[vi].t1 -= d; stats.gapFills = (stats.gapFills || 0) + 1; moved = true; break;
    }
    if (!moved) { stats.gapsLeft = (stats.gapsLeft || 0) + 1; from = gap[1]; }
  }
  fleet.stats = stats;
  return fleet;
}
// where along a voyage at arc length s: [x, z, hx, hz]
function along(vy, s) {
  const p = vy.pts; if (s <= 0) s = 0; if (s >= vy.len) s = vy.len;
  let lo = 0, hi = p.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m][2] <= s) lo = m; else hi = m; }
  const a = p[lo], b = p[hi], u = (s - a[2]) / Math.max(b[2] - a[2], 1e-6), hx = b[0] - a[0], hz = b[1] - a[1], hl = Math.hypot(hx, hz) || 1;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, hx / hl, hz / hl];
}
// a boat at t: { on, x, z, hx, hz, v, vy, s } (off between voyages)
export function boatAt(voy, t) {
  t = ((t % CYCLE) + CYCLE) % CYCLE;
  // under way on a voyage; else the last one ended within ten minutes (its wake may linger)
  let last = null;
  for (const vy of voy) {
    if (t >= vy.t0 && t <= vy.t1) { const s = (t - vy.t0) * vy.v, [x, z, hx, hz] = along(vy, s); return { on: true, x, z, hx, hz, v: vy.v, vy, s }; }
    if (t > vy.t1 && t <= vy.t1 + 600 && (!last || vy.t1 > last.t1)) last = vy;
  }
  return last ? { on: false, vy: last, s: (t - last.t0) * last.v } : { on: false };
}

// ---- the boats' meshes: a hull, its houses, windows and nav lights in one geometry, with a part attribute the shader
// reads (0 hull, 1 house, 2 window, 3 red sidelight, 4 green, 5 masthead, 6 stern light, 7 mast)
function boatGeometry(b) {
  const parts = [], L = b.L, B = b.B;
  const push = (g, part) => { const n = g.attributes.position.count; g.setAttribute('aPart', new T.Float32BufferAttribute(new Array(n).fill(part), 1)); parts.push(g.index ? g.toNonIndexed() : g); };
  // the hull: a plan shape (fine bow, square stern) extruded from 1 m under the water to its freeboard
  const fb = b.kind === 'sail' ? 1.0 : b.kind === 'work' ? 1.4 : 2.2;
  const sh = new T.Shape(); const N = 14;
  for (let i = 0; i <= N; i++) { const u = i / N, z = -L / 2 + L * u, w = B / 2 * (u < 0.35 ? Math.sin(u / 0.35 * Math.PI / 2) ** 0.8 : 1 - 0.08 * ((u - 0.35) / 0.65) ** 2); i === 0 ? sh.moveTo(0.05, z) : sh.lineTo(w, z); }
  for (let i = N; i >= 0; i--) { const u = i / N, z = -L / 2 + L * u, w = B / 2 * (u < 0.35 ? Math.sin(u / 0.35 * Math.PI / 2) ** 0.8 : 1 - 0.08 * ((u - 0.35) / 0.65) ** 2); sh.lineTo(-Math.max(w, 0.05), z); }
  const hull = new T.ExtrudeGeometry(sh, { depth: fb + 1.0, bevelEnabled: false, curveSegments: 1 });
  hull.rotateX(Math.PI / 2); hull.translate(0, fb, 0);          // (the shape's y is the boat's z: bow toward -z)
  push(hull, 0);
  // the houses: decks of cabins, each a box with a band of windows
  let y = fb;
  for (let d = 0; d < b.decks; d++) {
    const hl = L * (d === 0 ? 0.62 : 0.42), hw = B * (d === 0 ? 0.86 : 0.7), hh = 2.3, z0 = -L * 0.05 + d * L * 0.05;
    const hb = new T.BoxGeometry(hw, hh, hl); hb.translate(0, y + hh / 2, z0); push(hb, 1);
    const wb = new T.BoxGeometry(hw + 0.04, hh * 0.38, hl * 0.92); wb.translate(0, y + hh * 0.58, z0); push(wb, 2);
    y += hh;
  }
  if (b.kind === 'sail') {
    const hb = new T.BoxGeometry(B * 0.5, 0.7, L * 0.3); hb.translate(0, fb + 0.35, L * 0.05); push(hb, 1);
    const wb = new T.BoxGeometry(B * 0.52, 0.18, L * 0.26); wb.translate(0, fb + 0.45, L * 0.05); push(wb, 2);
    const m = new T.CylinderGeometry(0.06, 0.09, b.mast, 6); m.translate(0, fb + b.mast / 2, -L * 0.08); push(m, 7);
    y = fb + b.mast;
  }
  if (b.kind === 'work') { const m = new T.CylinderGeometry(0.08, 0.1, 5, 6); m.translate(0, y + 2.5, -L * 0.2); push(m, 7); y += 5; }
  // nav lights: little lamps, lit by arc in the shader
  const lamp = (x, yy, z, part, r = 0.16) => { const s = new T.SphereGeometry(r, 8, 6); s.translate(x, yy, z); push(s, part); };
  const sideY = b.kind === 'sail' ? fb + 0.3 : fb + 2.4, sideZ = -L * (b.kind === 'sail' ? 0.42 : 0.18);
  lamp(-B / 2 * 0.95, sideY, sideZ, 3); lamp(B / 2 * 0.95, sideY, sideZ, 4);
  lamp(0, b.kind === 'sail' ? fb + b.mast * 0.55 : y + 0.6, b.kind === 'sail' ? -L * 0.08 + 0.12 : -L * 0.2, 5, 0.2);
  lamp(0, fb + 0.6, L / 2 - 0.1, 6);
  // merge
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), part = new Float32Array(n); let o = 0;
  for (const g of parts) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); part.set(g.attributes.aPart.array, o); o += c; }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new T.BufferAttribute(new Float32Array(n * 2), 2)); out.setAttribute('aPart', new T.BufferAttribute(part, 1));
  out.computeBoundingSphere();
  return out;
}
const lin = hex => { const v = parseInt(hex.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255].map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); };

// build the fleet: meshes moved each frame, the wake uniforms filled, the sounds listed
export function buildBoats(world, ctx, { voyages, heightAt, U, NWAKE, NSEG }) {
  const meshes = [], P = ctx.P;
  FLEET.forEach((b, i) => {
    const geo = boatGeometry(b);
    const mats = world.mat({ name: 'boat ' + b.name, lines: 1,
      uniforms: { uHull: { value: new T.Vector3(...lin(b.hull)) }, uHouse: { value: new T.Vector3(...lin(b.house)) }, uWin: { value: new T.Vector3(...lin(b.windows)) } },
      varyings: 'varying float vPart; varying vec3 vLocal; varying vec3 vEye;',
      // (the eye in the boat's own frame, for the nav lights' arcs: modelMatrix exists in the vertex stage only)
      vertex: 'attribute float aPart; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { mat4 iM = inverse(modelMatrix); vPart = aPart; vLocal = (iM * vec4(P, 1.0)).xyz; vEye = (iM * vec4(cameraPosition, 1.0)).xyz; }',
      surface: /* glsl */`
uniform vec3 uHull; uniform vec3 uHouse; uniform vec3 uWin;
void smain(inout Surface s, vec3 P, vec3 V) {
  int part = int(vPart + 0.5);
  // the eye's bearing from the boat, in its own frame (bow -z): the nav lights' arcs (COLREGs rule 21)
  vec3 eye = vEye;
  float ang = degrees(atan(eye.x, -eye.z));          // 0 dead ahead, + to starboard
  s.albedo = part == 0 ? uHull * mix(0.55, 1.0, step(0.3, vLocal.y)) : part == 7 ? vec3(0.5) : uHouse;
  if (part == 0 && vLocal.y < 0.35) s.albedo = vec3(0.08, 0.1, 0.12);      // (the boot-top)
  s.rough = 0.6; s.spec = 0.15;
  if (part == 2) { s.albedo = vec3(0.05); s.emissive = uWin * 2.2 * (0.75 + 0.25 * step(0.5, fract(vLocal.z * 0.9 + 0.2))); }
  float lit = 0.0; vec3 lc = vec3(0.0);
  if (part == 3) { lit = step(ang, 0.0) * step(-112.5, ang); lc = vec3(1.0, 0.06, 0.04); }
  if (part == 4) { lit = step(0.0, ang) * step(ang, 112.5); lc = vec3(0.05, 1.0, 0.3); }
  if (part == 5) { lit = step(abs(ang), 112.5); lc = vec3(1.0, 0.95, 0.85); }
  if (part == 6) { lit = step(112.5, abs(ang)); lc = vec3(1.0, 0.95, 0.85); }
  if (part >= 3 && part <= 6) { s.albedo = vec3(0.1); s.emissive = lc * (0.15 + 5.0 * lit); }
}` });
    const m = world.mesh(geo, mats, { name: 'boat ' + b.name, cast: false, loose: 'afloat: it rides the water' });
    m.userData.posAt = t => { const a = boatAt(voyages[i], t); return a.on ? [a.x, 0, a.z] : [0, -100, 0]; };
    meshes.push(m);
  });
  // the minor lights the water draws as ticks (W3): each boat's nav lights and lit windows, as the water's uniform
  const minor = Array.from({ length: 16 }, () => new T.Vector4()), minorC = Array.from({ length: 16 }, () => new T.Vector4());
  U.uMinor = { value: minor }; U.uMinorC = { value: minorC }; U.uNumMinor = { value: 0 };
  const wkA = U.uWkA.value, wkB = U.uWkB.value, tr = U.uWkTrack.value;
  const update = t => {
    let nm = 0, nw = 0;
    FLEET.forEach((b, i) => {
      const a = boatAt(voyages[i], t), m = meshes[i];
      if (a.on) {
        const y = heightAt(a.x, a.z, t) * 0.6;
        m.visible = true; m.position.set(a.x, y, a.z); m.rotation.set(0, Math.atan2(-a.hx, -a.hz), 0);
        // (the nav lights and windows for the water's ticks: their world places)
        const c = Math.cos(m.rotation.y), sn = Math.sin(m.rotation.y), wp = (lx, ly, lz) => [a.x + lx * c + lz * sn, y + ly, a.z - lx * sn + lz * c];
        const side = b.kind === 'sail' ? 1.3 : 3.6, sz = -b.L * (b.kind === 'sail' ? 0.42 : 0.18);
        for (const [p, col] of [[wp(-b.B / 2, side, sz), [1, 0.06, 0.04]], [wp(b.B / 2, side, sz), [0.05, 1, 0.3]], [wp(0, b.H, -b.L * 0.2), [1, 0.95, 0.85]], [wp(0, 2.6, 0), lin(b.windows)]]) {
          if (nm < 16) { minor[nm].set(p[0], p[1], p[2], 1); minorC[nm].set(col[0], col[1], col[2], 0); nm++; }
        }
      } else m.visible = false;
      // the wake: the track from the boat back ~10 minutes (or from where it ended), NSEG samples
      if (a.vy && nw < NWAKE) {
        const vy = a.vy, sNow = Math.min(a.s, vy.len), age0 = a.on ? 0 : (a.s - vy.len) / vy.v;
        if (age0 < 600) {
          const [bx, bz, hx, hz] = along(vy, sNow);
          wkA[nw].set(bx, bz, hx, hz); wkB[nw].set(vy.v, b.L, b.B, b.wakeH * (a.on ? 1 : Math.exp(-age0 / 200)));
          for (let k = 0; k < NSEG; k++) {
            const back = k * k * 1.5;                       // (denser near the boat: 0, 1.5, 6, 13 ... 794 m: past ~600 m a wake fades out)
            const [x, z] = along(vy, sNow - back);
            tr[nw * NSEG + k].set(x, z, Math.min(back, sNow), age0 + Math.min(back, sNow) / vy.v);
          }
          nw++;
        }
      }
    });
    U.uNumMinor.value = nm; U.uNumWk.value = nw;
  };
  world.onFrame(t => update(t));
  // the wakes' arrival at her side: the wedge's edge reaching her waterline (sampled along her port side)
  const sounds = [];
  voyages.forEach((voy, i) => {
    const b = FLEET[i];
    for (const vy of voy) {
      for (let k = 0; k < vy.pts.length; k += 2) {
        const [x, z, s] = vy.pts[k];
        // the closest approach of the track to midships, then the time the cusp line reaches her side there
        const d = Math.hypot(x, z) - 9;
        if (d > 600) continue;
        const tPass = vy.t0 + s / vy.v, tHit = tPass + d * KT / vy.v;
        const prev = sounds.length && sounds[sounds.length - 1];
        if (prev && prev.boat === b.name && Math.abs(prev.t - tHit) < 30) continue;
        sounds.push({ t: +tHit.toFixed(2), kind: 'wake_slap', pos: [-9, 0, clamp(z, -60, 60)], level: 70 + 20 * Math.log10(b.wakeH / 0.1), boat: b.name, dist_m: Math.round(d) });
      }
    }
  });
  return { meshes, sounds, update };
}
