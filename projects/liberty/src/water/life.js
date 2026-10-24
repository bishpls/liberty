// liberty/src/water/life.js: what lives and floats on the bay (site.md §4, §6; rule 14): every one a pure function of t.
//   drifters   bull kelp (a float with its blades trailing downstream) and debris (planks, a bottle, packaging), carried
//              by the ebb past her bow and along her port side (site.md §4): each rides a streamline of the baked current
//              (field.js) plus its windage (leeway: 3 % of the wind for debris, 1 % for kelp, a float sitting low),
//              integrated at build from a seed upstream (RK2, 2 s steps), sampled by time, fading in and out at its ends
//   sea lions  a few California sea lions about the marina's breakwater and off her port side (site.md §6: the herd on
//              K-Dock is heard more than seen; a few swim between the piers): each has a home water it wanders on a
//              smooth path, a seeded schedule of surfacings (25-60 s) and dives (60-150 s); at the surface it swims
//              head up; rings where it surfaces and dives (ripple), and its barks for the soundscape
//   gulls      two small rafts of western gulls riding the chop off the pier tip and the breakwater, bobbing, turning
//              into the wind, paddling against the drift
import { rng, TAU, clamp } from 'scene3d/util.js';

const T = window.THREE;
const lin = hex => { const v = parseInt(hex.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255].map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); };

// ---- geometry helpers (merged, non-indexed, with a part id for the shader)
function mergeParts(list) {
  let n = 0; for (const [g] of list) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), part = new Float32Array(n); let o = 0;
  for (const [g0, id] of list) {
    const g = g0.index ? g0.toNonIndexed() : g0, c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); part.fill(id, o, o + c); o += c;
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new T.BufferAttribute(new Float32Array(n * 2), 2)); out.setAttribute('aPart', new T.BufferAttribute(part, 1));
  out.computeBoundingSphere();
  return out;
}
const ell = (c, s, seg = 10) => { const g = new T.SphereGeometry(1, seg, Math.max(5, seg >> 1)); g.scale(...s); g.translate(...c); return g; };
// bull kelp adrift: the float (a bulb ~9 cm) at its head (+x, the way it drifts), its blades trailing behind (-x)
function kelpGeo(seed) {
  const R = rng(seed), parts = [[ell([0, 0.02, 0], [0.09, 0.06, 0.09], 8), 0], [ell([-0.25, 0.01, 0], [0.22, 0.025, 0.03], 6), 0]];
  for (let i = 0; i < 7; i++) {
    const L = R.range(1.4, 3.2), a = R.range(-0.45, 0.45), w = R.range(0.06, 0.12);
    const g = new T.PlaneGeometry(L, w, 6, 1); g.rotateX(-Math.PI / 2);
    // (the blade wanders: a gentle S, tapering)
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k) + L / 2, u = x / L; p.setX(k, -0.3 - x * Math.cos(a)); p.setZ(k, -x * Math.sin(a) + p.getZ(k) * (1 - 0.6 * u) + Math.sin(u * 5 + i) * 0.12 * u); p.setY(k, 0.004); }
    g.computeVertexNormals(); parts.push([g, 1]);
  }
  return mergeParts(parts);
}
function debrisGeo(kind) {
  if (kind === 0) { const g = new T.BoxGeometry(1.3, 0.05, 0.16); g.translate(0, 0.01, 0); return mergeParts([[g, 2]]); }          // a plank
  if (kind === 1) { const g = new T.CylinderGeometry(0.035, 0.035, 0.26, 8); g.rotateZ(Math.PI / 2); g.translate(0, 0.02, 0); return mergeParts([[g, 3]]); }   // a bottle
  const g = new T.BoxGeometry(0.4, 0.02, 0.3); g.translate(0, 0.008, 0); return mergeParts([[g, 4]]);                                // a takeaway box
}
// a California sea lion at the surface: head (+x the snout), neck, the back awash; 1 m from snout to the back's end
function sealionGeo() {
  return mergeParts([
    [ell([0.0, 0.22, 0], [0.13, 0.11, 0.1], 12), 5],          // the head
    [ell([0.13, 0.2, 0], [0.09, 0.05, 0.05], 8), 5],          // the snout
    [ell([-0.12, 0.08, 0], [0.16, 0.16, 0.13], 10), 5],       // the neck
    [ell([-0.6, -0.05, 0], [0.55, 0.12, 0.2], 12), 5],        // the back (awash)
    [ell([0.02, 0.27, 0.07], [0.02, 0.01, 0.01], 4), 6], [ell([0.02, 0.27, -0.07], [0.02, 0.01, 0.01], 4), 6],   // the eyes' gleam
  ]);
}
// a western gull afloat (+x the head), body ~0.6 m, sitting low
// a gull aloft (western gull, 1.4 m across): the body as afloat, the wings out from the shoulders, tipped up by `up`
// (rad: 0.6 the upstroke, -0.15 the downstroke and the glide), the tail fanned
function gullFlyGeo(up) {
  const wing = (sign, k) => {
    const g = ell([0, 0, 0.34 * sign], [0.16, 0.014, 0.34], 8); g.rotateX(-sign * up); g.translate(0.02, 0.1, 0);
    const tip = ell([-0.06, 0, 0.62 * sign], [0.1, 0.012, 0.1], 6); tip.rotateX(-sign * up); tip.translate(0.02, 0.1, 0);
    return [[g, 8], [tip, 9]];
  };
  return mergeParts([
    [ell([0, 0.08, 0], [0.3, 0.09, 0.1], 10), 7], [ell([0.27, 0.13, 0], [0.08, 0.07, 0.065], 8), 7],
    [ell([0.37, 0.12, 0], [0.05, 0.015, 0.015], 4), 10], [ell([-0.3, 0.09, 0], [0.12, 0.012, 0.08], 6), 7],
    ...wing(1), ...wing(-1),
  ]);
}
function gullGeo() {
  return mergeParts([
    [ell([0, 0.06, 0], [0.3, 0.1, 0.12], 10), 7],            // the body (white)
    [ell([-0.04, 0.12, 0], [0.24, 0.05, 0.13], 8), 8],       // the back and folded wings (grey)
    [ell([-0.32, 0.1, 0], [0.12, 0.025, 0.05], 6), 9],       // the wingtips (black)
    [ell([0.26, 0.2, 0], [0.08, 0.075, 0.07], 8), 7],        // the head
    [ell([0.36, 0.19, 0], [0.05, 0.016, 0.016], 4), 10],     // the bill (yellow)
  ]);
}

const LIFE_SURF = /* glsl */`
uniform vec3 uCol[11];
void smain(inout Surface s, vec3 P, vec3 V) {
  int part = int(vPart + 0.5);
  s.albedo = uCol[part]; s.rough = 0.5; s.spec = part == 5 ? 0.35 : part == 3 ? 0.6 : 0.05;
  if (part == 6) { s.emissive = vec3(0.05, 0.06, 0.07); }        // (a sea lion's eye catches what light there is)
}`;

export function buildLife(world, ctx, { F, S, heightAt, ripple, P, loud = [] }) {
  const R = rng(1997), out = { meshes: [], sounds: [], measures: {} };
  const cols = ['#4a3a1c', '#5a4a22', '#7a6a50', '#4f7a63', '#e6e2d8', '#3a2a20', '#0a0a0a', '#f2f2ee', '#8a9098', '#1a1a1a', '#e2b830'].map(lin);
  const mat = name => world.mat({ name, lines: 1, uniforms: { uCol: { value: cols.map(c => new T.Vector3(...c)) } },
    varyings: 'varying float vPart;', vertex: 'attribute float aPart; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vPart = aPart; }', surface: LIFE_SURF });
  const U = P.WATER.wind, [wdx, wdz] = P.atBearing((U.from + 180) % 360, 1);
  // ---- drifters: streamlines of the current from seeds upstream (the ebb runs WNW: seeds east and south-east of her)
  const cur = (x, z) => { const e = S.env(x, z); return e.outside ? [0, 0] : [e.vx, e.vz]; };
  const isOpen = (x, z) => { const e = S.env(x, z); return !e.outside && e.solid < 0.5 && (e.deckE ?? -1) <= 0; };
  const drift = (n, leeway) => {
    const list = [];
    for (let i = 0; i < n; i++) {
      let sx = 0, sz = 0;
      for (let tries = 0; tries < 50; tries++) { sx = R.range(-60, 420); sz = R.range(-480, 60); if (isOpen(sx, sz) && !(sx > -15 && sx < 80 && sz > -150 && sz < 140)) break; }
      const pts = [[sx, sz]]; let x = sx, z = sz;
      for (let k = 0; k < 900; k++) {                  // 2 s steps, 30 minutes at most
        const v1 = cur(x, z), ax = v1[0] + wdx * U.speed * leeway, az = v1[1] + wdz * U.speed * leeway;
        const mx = x + ax, mz = z + az, v2 = cur(mx, mz);
        x += (v2[0] + wdx * U.speed * leeway) * 2; z += (v2[1] + wdz * U.speed * leeway) * 2;
        if (!isOpen(x, z)) break;                        // (aground: against the hull, a pile, the shore: its path ends)
        pts.push([x, z]);
      }
      // a path that grounds (against her hull, a pile, the shore) holds there a while, bobbing, as flotsam collects in
      // the lee; every drifter is then away a while before its next pass (a cycle of 10-25 minutes: no loop to spot)
      const hold = pts.length < 900 ? R.range(90, 300) : 0, away = R.range(120, 600);
      list.push({ pts, hold, cycle: pts.length * 2 + hold + away, phase: R() * 1500, scale: R.range(0.7, 1.3), rot: R.range(-0.3, 0.3) });
    }
    return list;
  };
  const kelp = drift(36, 0.01), debris = drift(24, 0.03);
  const along = (d, t) => {
    const n = d.pts.length; if (n < 4) return null;
    const run = n * 2, live = run + d.hold, u = ((t + d.phase) % d.cycle + d.cycle) % d.cycle;
    if (u > live) return null;                           // (away)
    const f = Math.min(u, run - 0.01) / 2, i = Math.min(n - 2, Math.floor(f)), w = f - i;
    const a = d.pts[i], b = d.pts[i + 1], fade = Math.min(1, u / 20, (live - u) / 20);
    return { x: a[0] + (b[0] - a[0]) * w, z: a[1] + (b[1] - a[1]) * w, hx: b[0] - a[0], hz: b[1] - a[1], fade };
  };
  const kelpGeos = [kelpGeo(11), kelpGeo(23), kelpGeo(37)], debrisGeos = [debrisGeo(0), debrisGeo(1), debrisGeo(2)];
  const mk = (geo, n, name) => { const m = world.mesh(geo, mat(name), { count: n, name, cast: false, frustum: false, loose: 'afloat' }); m.instanceMatrix.setUsage(T.DynamicDrawUsage); out.meshes.push(m); return m; };
  const kelpMeshes = kelpGeos.map((g, j) => mk(g, 12, 'kelp adrift ' + j)), debrisMeshes = debrisGeos.map((g, j) => mk(g, 8, ['plank', 'bottle', 'takeaway box'][j]));
  // ---- sea lions: home waters (off her port side; about the marina's east breakwater; north of the pier tip)
  const homes = [[-70, -40, 45], [-95, 30, 40], [-100, -180, 50], [-150, -250, 60], [-110, -100, 40], [20, -260, 60], [-60, -330, 50]];
  const lions = homes.map(([cx, cz, r], i) => {
    const L = rng(500 + i), segs = []; let t = -L.range(0, 200), up = L() < 0.5;
    while (t < 7200 + 300) { const d = up ? L.range(25, 60) : L.range(60, 150); segs.push({ t0: t, t1: t + d, up }); t += d; up = !up; }
    const w = [L.range(0.004, 0.009), L.range(0.003, 0.008), L.range(0.006, 0.012)], ph = [L() * TAU, L() * TAU, L() * TAU];
    return { cx, cz, r, segs, w, ph, size: L.range(1.6, 2.1) };
  });
  const lionPath = (l, t) => [l.cx + l.r * (0.7 * Math.sin(l.w[0] * TAU * t + l.ph[0]) + 0.3 * Math.sin(l.w[2] * TAU * t + l.ph[2])), l.cz + l.r * (0.7 * Math.cos(l.w[1] * TAU * t + l.ph[1]) + 0.3 * Math.sin(l.w[2] * TAU * t * 1.3 + l.ph[0]))];
  const lionMesh = mk(sealionGeo(), lions.length, 'sea lions swimming');
  for (const [i, l] of lions.entries()) for (const sg of l.segs) {
    if (sg.t0 < 0 || sg.t0 > 7200) continue;
    const [x, z] = lionPath(l, sg.t0);
    ripple({ x, z, t0: sg.t0, a: 0.25, kind: 'splash', size: 0.35, key: `lion${i}@${sg.t0.toFixed(2)}` });
    if (sg.up && hash(i, sg.t0) < 0.45) out.sounds.push({ t: +(sg.t0 + 1.5).toFixed(2), kind: 'sealion_bark', pos: [+x.toFixed(1), 0.3, +z.toFixed(1)], level: 105, note: 'estimated: no source for a bark at 1 m' });
  }
  // ---- gulls afloat: two rafts
  const rafts = [[-35, -200, 5], [-85, -260, 4]], gulls = [];
  rafts.forEach(([cx, cz, n], ri) => { for (let k = 0; k < n; k++) gulls.push({ cx: cx + R.range(-6, 6), cz: cz + R.range(-6, 6), ph: R() * TAU, w: R.range(0.01, 0.03), turn: R.range(-0.4, 0.4) }); });
  const gullMesh = mk(gullGeo(), gulls.length, 'gulls afloat');
  const gullUp = mk(gullFlyGeo(0.6), gulls.length, 'gulls aloft, upstroke'), gullDown = mk(gullFlyGeo(-0.15), gulls.length, 'gulls aloft, downstroke');
  // ---- the gulls' answer to the show (life/startle.js's rule, B7's numbers): each blast heard at 343 m/s at its peak
  // level there (B5's level at 1 m, spherical spreading); a gull flushes with the western gull's dose-response (a
  // logistic on the peak, L50 135 dB, w 4 dB) after a latency of 0.1-0.4 s: a pattering run and climb, a circle over
  // its raft (10 m/s, 30-60 m out, 8-18 m up, higher with each blast it hears aloft), aloft 32-130 s (lognormal round
  // 55 s), then a glide down to a spot near its raft. Shots within 0.6 s are one blast to a bird. Planned here from t 0
  // to the show's end, a pure function of t after
  const ghash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7 + 0.37) * 43758.5453; return x - Math.floor(x); };
  const lognorm = (u1, u2, p10, m, p90) => { const s = Math.log(p90 / m) / 1.2816, z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-9))) * Math.cos(TAU * u2); return clamp(m * Math.exp(s * z), p10 * 0.7, p90 * 1.5); };
  const flush = { flushes: 0, blastsHeard: 0, maxLpk: 0 };
  gulls.forEach((g, gi) => {
    g.spans = [];                                          // { a, b, kind: 'up' (run and climb) | 'air' | 'down', ... }
    const hear = loud.map((e, ei) => {
      const d = Math.hypot(e.pos[0] - g.cx, e.pos[1], e.pos[2] - g.cz), Lpk = e.L1 - 20 * Math.log10(Math.max(d, 1));
      return { t: e.t + d / 343, Lpk, p: 1 / (1 + Math.exp(-(Lpk - 135) / 4)), u: ghash(gi + 1, ei + 0.5) };
    }).sort((a, b) => a.t - b.t);
    for (let i = hear.length - 1; i > 0; i--) if (hear[i].t - hear[i - 1].t < 0.6) { if (hear[i].p > hear[i - 1].p) hear[i - 1] = hear[i]; hear.splice(i, 1); }
    flush.blastsHeard = Math.max(flush.blastsHeard, hear.length);
    let x0 = g.cx, z0 = g.cz, until = -1e9, cur = null, n = 0;
    for (const [hi, h] of hear.entries()) {
      flush.maxLpk = Math.max(flush.maxLpk, h.Lpk);
      if (h.u >= h.p) continue;
      const aloft = lognorm(ghash(gi, hi + 7.1), ghash(gi + 3, hi), 32, 55, 130);
      if (cur && h.t < until) { until = Math.max(until, h.t + aloft); cur.h += 4; continue; }   // (aloft already: higher, longer)
      const ts = h.t + 0.1 + 0.3 * ghash(gi, hi + 2.2);
      const R = 30 + 30 * ghash(gi, hi + 4.4), a0 = TAU * ghash(gi, hi + 5.5), dir = ghash(gi, hi + 6.6) < 0.5 ? 1 : -1;
      cur = { a: ts, x0, z0, R, a0, dir, h: 8 + 10 * ghash(gi, hi + 8.8), c: [g.cx, g.cz] };
      until = ts + 1.6 + aloft; n++; flush.flushes++;
      g.spans.push({ kind: 'up', a: ts, b: ts + 1.6, f: cur });
      g.spans.push({ kind: 'air', a: ts + 1.6, b: () => until, f: cur });
      // (where it comes down: near its raft, a few metres from where it left)
      const nx = g.cx + 8 * (ghash(gi, hi + 9.9) - 0.5), nz = g.cz + 8 * (ghash(gi + 1, hi + 9.9) - 0.5);
      g.spans.push({ kind: 'down', a: () => until, b: () => until + 4, f: cur, to: [nx, nz] });
      ripple({ x: x0, z: z0, t0: ts, a: 0.12, kind: 'splash', size: 0.2 });
      x0 = nx; z0 = nz;
    }
    // (resolve the extended ends now: every span's ends fixed numbers)
    for (const sp of g.spans) { if (typeof sp.a === 'function') sp.a = sp.a(); if (typeof sp.b === 'function') sp.b = sp.b(); }
    for (let i = 0; i < g.spans.length; i++) { const sp = g.spans[i]; if (sp.kind === 'down') { sp.a = Math.max(sp.a, g.spans[i - 1].b); sp.b = sp.a + 4; ripple({ x: sp.to[0], z: sp.to[1], t0: sp.b, a: 0.1, kind: 'splash', size: 0.2 }); } }
    g.homes = [[g.cx, g.cz]].concat(g.spans.filter(sp => sp.kind === 'down').map(sp => sp.to));
    g.n = n;
  });
  // (the rafts' alarm calls as they go: once a raft and a blast)
  for (const [ri] of rafts.entries()) {
    const seen = new Set();
    gulls.filter((g, gi) => gi < 5 ? ri === 0 : ri === 1).forEach(g => g.spans.filter(sp => sp.kind === 'up').forEach(sp => {
      const k = Math.round(sp.a); if (seen.has(k)) return; seen.add(k);
      out.sounds.push({ t: +sp.a.toFixed(2), kind: 'gull_alarm', pos: [+g.cx.toFixed(1), 1, +g.cz.toFixed(1)], level: 92, note: 'the raft flushing at a blast (life species.js level)' });
    }));
  }
  // a gull's pose at t: afloat (home, the last place it came down) or aloft: { x, y, z, yaw, air, flap }
  const gullAt = (g, t) => {
    let home = [g.cx, g.cz];
    for (const sp of g.spans) {
      if (t < sp.a) break;
      if (sp.kind === 'down' && t >= sp.b) { home = sp.to; continue; }
      if (t >= sp.b) continue;
      const f = sp.f, u = (t - sp.a) / (sp.b - sp.a);
      const ang = a => f.a0 + f.dir * 10 * a / f.R;                   // (10 m/s round the circle)
      const ring = a => [f.c[0] + f.R * Math.cos(ang(a)), f.c[1] + f.R * Math.sin(ang(a))];
      if (sp.kind === 'up') {                                         // (patter and climb out toward the ring)
        const [rx, rz] = ring(0), k = u * u;
        return { x: f.x0 + (rx - f.x0) * k * 0.15, z: f.z0 + (rz - f.z0) * k * 0.15, y: 3 * k, yaw: Math.atan2(-(rz - f.z0), rx - f.x0), air: true, flap: true };
      }
      if (sp.kind === 'air') {
        const ta = t - sp.a, [x, z] = ring(ta), [x2, z2] = ring(ta + 0.5), climb = clamp(ta / 6);
        // (from the take-off point onto the ring over its first 6 s; flapping 1.5 s in every 4, else gliding)
        const [rx0, rz0] = ring(0), sx = f.x0 + (rx0 - f.x0) * 0.15, sz = f.z0 + (rz0 - f.z0) * 0.15;
        return { x: sx + (x - sx) * climb, z: sz + (z - sz) * climb, y: 3 + (f.h - 3) * climb, yaw: Math.atan2(-(z2 - z), x2 - x), air: true, flap: climb < 1 || ((ta + f.a0) % 4) < 1.5 };
      }
      // down: from its place on the ring to the water, a glide
      const tA = sp.a - g.spans.find(q => q.kind === 'air' && q.f === f).a, [x, z] = ring(tA), k = u;
      return { x: x + (sp.to[0] - x) * k, z: z + (sp.to[1] - z) * k, y: f.h * (1 - k) * (1 - k * 0.3), yaw: Math.atan2(-(sp.to[1] - z), sp.to[0] - x), air: k < 0.95, flap: k > 0.85 };
    }
    return { x: home[0], z: home[1], home: true };
  };
  // ---- each frame: place them all on the water
  const M = new T.Matrix4(), Q = new T.Quaternion(), Y = new T.Vector3(0, 1, 0), Sv = new T.Vector3(), Pv = new T.Vector3(), E = new T.Euler();
  const place = (mesh, i, x, z, yaw, s, t, sink = 0, pitchK = 1) => {
    const y = heightAt(x, z, t) - sink;
    E.set(0, yaw, 0); Q.setFromEuler(E); Sv.set(s, s, s); Pv.set(x, y, z);
    M.compose(Pv, Q, Sv); mesh.setMatrixAt(i, M);
  };
  const hide = (mesh, i) => { M.makeScale(0, 0, 0); mesh.setMatrixAt(i, M); };
  world.onFrame(t => {
    [[kelp, kelpMeshes, 12], [debris, debrisMeshes, 8]].forEach(([list, meshes, per]) => {
      list.forEach((d, i) => {
        const m = meshes[i % meshes.length], j = Math.floor(i / meshes.length);
        if (j >= per) return;
        const a = along(d, t);
        if (!a || a.fade <= 0) { hide(m, j); return; }
        place(m, j, a.x, a.z, Math.atan2(-a.hz, a.hx) + d.rot, d.scale * a.fade, t);
      });
      meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
    });
    lions.forEach((l, i) => {
      const sg = l.segs.find(s => t >= s.t0 && t < s.t1);
      if (!sg || !sg.up) { hide(lionMesh, i); return; }
      // rising for 2 s, at the surface, sinking for 2 s
      const rise = clamp((t - sg.t0) / 2), sink = clamp((sg.t1 - t) / 2), k = Math.min(rise, sink);
      const [x, z] = lionPath(l, t), [x2, z2] = lionPath(l, t + 1);
      place(lionMesh, i, x, z, Math.atan2(-(z2 - z), x2 - x), l.size * 0.55, t, (1 - k) * 0.5);
    });
    lionMesh.instanceMatrix.needsUpdate = true;
    gulls.forEach((g, i) => {
      const s = gullAt(g, t);
      if (!s.air) {
        const bx = s.home ? s.x : s.x, bz = s.z;
        const x = bx + 1.5 * Math.sin(g.w * TAU * t + g.ph), z = bz + 1.5 * Math.cos(g.w * TAU * t * 0.8 + g.ph);
        place(gullMesh, i, x, z, Math.atan2(wdz, -wdx) + g.turn + 0.3 * Math.sin(t * 0.07 + g.ph), 1, t);
        hide(gullUp, i); hide(gullDown, i); return;
      }
      hide(gullMesh, i);
      // (the wingbeat in two poses, ~2.8 beats a second while it flaps; held out, gliding)
      const up = s.flap && Math.sin(TAU * 2.8 * t + g.ph * 3) > 0;
      E.set(0, s.yaw, 0); Q.setFromEuler(E); Sv.set(1, 1, 1); Pv.set(s.x, heightAt(s.x, s.z, t) + s.y, s.z); M.compose(Pv, Q, Sv);
      (up ? gullUp : gullDown).setMatrixAt(i, M); hide(up ? gullDown : gullUp, i);
    });
    gullMesh.instanceMatrix.needsUpdate = true; gullUp.instanceMatrix.needsUpdate = true; gullDown.instanceMatrix.needsUpdate = true;
  });
  const lens = l => l.pts.length * 2;
  out.measures = {
    kelp: kelp.length, debris: debris.length, sealions: lions.length, gullsAfloat: gulls.length, gullFlushes: flush.flushes, gullBlastsHeard: flush.blastsHeard, gullMaxPeakDb: +flush.maxLpk.toFixed(1),
    driftPathSeconds: { kelp: Math.round(kelp.reduce((a, d) => a + lens(d), 0) / kelp.length), debris: Math.round(debris.reduce((a, d) => a + lens(d), 0) / debris.length) },
    leeway: { kelp: 0.01, debris: 0.03, note: 'leeway as a share of the wind (estimated: drifter studies give 1-4 % for low-windage objects)' },
    barks: out.sounds.length,
  };
  return out;
}
function hash(i, t) { const x = Math.sin(i * 127.1 + t * 311.7) * 43758.5453; return x - Math.floor(x); }
