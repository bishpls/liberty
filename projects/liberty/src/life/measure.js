// liberty/src/life/measure.js: the life module's numbers against their sources (build() returns them; the board shows
// them) and its boards' loops.
//   species    each preset's span and length against the field guides; the wingbeat used against the sources; the
//              speeds flown (sampled from every flight at 1 Hz, away from take-offs and landings) against the radar
//              airspeeds; the steepest bank; the share of the time beating
//   counts     by species and class, within 300 m of midships; drawn at the reel's blue hour (17.6) and the show (19.1)
//   startle    the response (the blast to the spring: the sound's travel plus the latency), the share flushed per blast
//              by kind, the time aloft and the resettle (the last blast heard to the landing), the displaced, the steps
//              any flying bird spent inside a hot zone or under what's drawn
//   on demand  LIBERTY.life.measure.perches() (every perched bird's feet against the fine rasters), .gpu(cam, hour)
import { frame, placeCamera, blit } from 'scene3d/host.js';
import { BIRDS } from 'scene3d/kit/creature/presets.js';
import { SPECIES, activity, PENNY } from './species.js';
import { KCH, sampleSpans, newState } from './flight.js';
import { LB } from './sim.js';
import { rasterAt, renderTop } from './habitat.js';

const q = a => { const s = a.slice().sort((x, y) => x - y); const at = p => s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) : null; return { n: s.length, p10: at(0.1), median: at(0.5), p90: at(0.9), min: s.length ? +s[0].toFixed(2) : null, max: s.length ? +s[s.length - 1].toFixed(2) : null }; };

export function lifeMeasures(ctx, L) {
  const sim = L.sim, birds = sim.birds, out = {};
  // ---- species
  const speeds = {}, banks = {}, flap = {};
  const take = (sp, spans) => {
    for (const s of spans) {
      if (s.type !== 'fly' || s.dive) continue;
      const k = s.k, n = k.length / KCH;
      for (let i = 0; i < n; i++) {
        const t = k[i * KCH]; if (t < s.t0 + 2.5 || t > s.t1 - 3) continue;
        if (i % 2) continue;
        (speeds[sp] = speeds[sp] || []).push(Math.hypot(k[i * KCH + 4], k[i * KCH + 5], k[i * KCH + 6]));
        (flap[sp] = flap[sp] || [0, 0])[k[i * KCH + 8] > 0.3 ? 0 : 1]++;
      }
    }
  };
  for (const b of birds) { if (b.base) take(b.sp, b.base); for (const e of b.exc) take(b.sp, e.spans); }
  for (const l of sim.lines) (speeds.pelican = speeds.pelican || []).push(l.U);
  for (const b of birds) if (b.soar) { const s = b.soar, per = 2 * (s.z1 - s.z0) + 2 * Math.PI * s.rT; (speeds[b.sp] = speeds[b.sp] || []).push(per / (LB / s.laps)); }
  out.species = {};
  for (const [sp, S] of Object.entries(SPECIES)) {
    const B = BIRDS[S.kit];
    out.species[sp] = {
      name: S.name, span: B.span, L: B.L, mass: S.mass, src_size: S.src.size,
      f: S.f, fTake: S.fTake, pennycuick: +PENNY(S.mass, S.span, S.S).toFixed(2), src_f: S.src.f,
      speed: q(speeds[sp] || []), U: S.U, band: [S.Ulo, S.Uhi], src_U: S.src.U,
      beatShare: flap[sp] ? +(flap[sp][0] / (flap[sp][0] + flap[sp][1])).toFixed(2) : null,
      wingLoading: +(S.mass * 9.81 / S.S).toFixed(0),
    };
  }
  // ---- counts
  const by = {}, cls = {};
  for (const b of birds) { by[b.sp] = (by[b.sp] || 0) + 1; cls[b.cls] = (cls[b.cls] || 0) + 1; }
  const near = {}, st = newState();
  for (const b of birds) { if (b.cls !== 'resident') continue; const s = sampleSpans(b.base, 0, LB, st); if (Math.hypot(s.p[0], s.p[2]) < 300) near[b.sp] = (near[b.sp] || 0) + 1; }
  const drawnAt = h => { const o = {}; for (const b of birds) { const vis = b.cls === 'resident' || b.rank < activity(b.cls === 'soarer' ? [[15.5, 1], [17.3, 1], [17.9, 0.5], [18.3, 0]] : SPECIES[b.sp].hours, h); if (vis) o[b.sp] = (o[b.sp] || 0) + 1; } return o; };
  out.counts = { bySpecies: by, byClass: cls, residentsWithin300m: near, drawnAt: { '17.6 (blue hour, the reel A)': drawnAt(17.6), '19.1 (the show)': drawnAt(19.1) },
    src: 'site.md §6: "tens of gulls near the pier and single digits of pelicans and cormorants" (estimated, no source)' };
  // ---- startle
  const S = L.startle || {};
  if (S.flushes) {
    const byKind = {};
    for (const f of S.flushes) (byKind[f.kind] = byKind[f.kind] || []).push(f);
    const firstOf = {};
    for (const f of S.flushes) if (!firstOf[f.kind] || f.t < firstOf[f.kind]) firstOf[f.kind] = f.t;
    out.startle = {
      response: q(S.flushes.map(f => f.response)), responseFirstWave: q(S.flushes.filter(f => f.t === Math.min(...S.flushes.map(g => g.t))).map(f => f.response)),
      flushesByKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, { flushes: v.length, reach: q(v.map(f => f.dist)), Lpk: q(v.map(f => f.Lpk)) }])),
      aloft: q(S.aloft || []), resettle: q(S.resettle || []), displaced: S.left, altPerch: S.altPerch, unfinished: S.unfinished,
      zoneSteps: S.zoneSteps, clearanceSteps: S.clearSteps, flySteps: S.flySteps, simMs: S.ms, lastLanding: S.TL ? +S.TL.toFixed(1) : null,
      src: 'species.js startle: the flush threshold, the latency, the time aloft (estimated, sources there)',
    };
  }
  out.events = (L.events || []).filter(e => e.kind !== 'gull_lands').slice(0, 60);
  out.sounds = (L.sounds || []).reduce((o, s) => (o[s.kind] = (o[s.kind] || 0) + 1, o), {});
  out.perches = L.H.measures.perches; out.railCapClear = L.H.measures.railCapClear; out.groups = L.H.measures.groups; out.wallNormalWind = L.H.measures.wallNormalWind;
  out.soarLift = soarLift(L);
  out.flightClearance = flightClearance(L);
  out.solidClearance = solidClearance(L, ctx.P);
  // the flights flight.js liftOver moved clear of what they'd have passed through: how many, the most, the biggest
  // ([bird, its flight's start, moved m, of it over m, aside m])
  { const sum = a => { const s = (a || []).slice().sort((x, y) => y[2] - x[2]); return { spans: s.length, most: s.length ? s[0][2] : 0, biggest: s.slice(0, 8) }; };
    out.solidClearance.lifted = { base: sum(L.lifted), excursions: sum(L.startle.lifted) }; }
  out.timing = L.timing;
  out.tris = Object.fromEntries(Object.entries(L.render.tris));
  // ---- on demand: perches touch (the feet on the drawn top beneath them), the cost
  L.measure = {
    perches: (t = 1) => perchContact(L, t),
    // the brief's "resettle after a minute or so": the startle run on a copy of the population with one blast of a kind
    // alone (no zones), the resettle (landing - blast) and the response read directly (~1 s each)
    singleBlast: async (kinds = ['gun5', 'gun20', 'mortar']) => {
      const st = await import('./startle.js'), res = {};
      const q3 = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? [s[Math.floor(s.length * 0.1)], s[s.length >> 1], s[Math.floor(s.length * 0.9)]].map(v => +v.toFixed(1)) : null; };
      for (const kind of kinds) {
        const e = L.H.loud.find(x => x.kind === kind); if (!e) continue;
        const birds = L.sim.birds.map(b => Object.assign({}, b, { exc: [] }));
        const H2 = Object.assign({}, L.H, { loud: [e], zones: [], show: Object.assign({}, L.H.show, { duration: e.t }) });
        const r = st.startle(H2, { birds }, { seed: 777, tMax: e.t + 900 });
        res[kind] = { t: +e.t.toFixed(2), flushed: r.stats.flushes.length, resettle_p10_med_p90: q3(r.stats.resettle), response_p10_med_p90: q3(r.stats.flushes.map(f => f.response)), displaced: r.stats.left };
      }
      return res;
    },
    gpu: (cam, hour = 19.1) => ctx.SCENE.measure.gpu(cam, hour, { modules: ['life'] }),
    // the solid test over the whole bay the lines fly: a 2 m raster of everything drawn (the far view's too, which
    // builds after life), x -1000..1000, z -2300..400; with plan: true its top at 8 m for a board's map
    solids: (plan = false) => {
      const wide = renderTop(ctx0().world, { x0: -1000, x1: 1000, z0: -2300, z1: 400, res: 2, exclude: ['life', 'water', 'stagetest'] });
      const r = solidClearance(L, ctx.P, { wide });
      if (plan) { const st = 4, w = wide.w / st | 0, h = wide.h / st | 0, top = new Array(w * h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let m = -1; for (let jj = 0; jj < st; jj++) for (let ii = 0; ii < st; ii++) m = Math.max(m, wide.top[(j * st + jj) * wide.w + i * st + ii]); top[j * w + i] = +m.toFixed(1); } r.plan = { x0: wide.x0, z0: wide.z0, res: wide.res * st, w, h, top }; }
      return r;
    },
  };
  return out;
}
// every stored flight key (baseline and excursions), away from its take-off and landing (3 s), against what's drawn under
// it (the coarse and ship rasters: y - top > 0.15 m) and, during the show, the hot zones
function flightClearance(L) {
  const H = L.H, o = { keys: 0, under: 0, inZone: 0, worst: [] };
  const look = (b, sp, base) => {
    if (sp.type !== 'fly' || sp.dive) return;
    const k = sp.k, n = k.length / KCH;
    for (let i = 0; i < n; i++) {
      const t = k[i * KCH]; if (t < sp.t0 + 3 || t > sp.t1 - 3) continue;
      const p = [k[i * KCH + 1], k[i * KCH + 2], k[i * KCH + 3]];
      o.keys++;
      const g = p[1] - H.top(p[0], p[2], 0.3);
      if (g < 0.15) { o.under++; if (o.worst.length < 12) o.worst.push({ bird: b.id, t: +t.toFixed(1), p: p.map(v => +v.toFixed(1)), gap: +g.toFixed(2), base }); }
      if (!base && H.zoneAt(p, t)) o.inZone++;
    }
  };
  for (const b of L.sim.birds) { for (const sp of b.base || []) look(b, sp, true); for (const e of b.exc) for (const sp of e.spans) look(b, sp, false); }
  return o;
}
// no bird through a solid: every flying sample (the analytic lines and soarers at 4 Hz over their whole routes, every
// stored flight key of the baseline and the excursions away from its take-off and landing) against (1) what's drawn
// under it: the coarse and ship rasters (and beyond them, given one, a wide raster of the whole bay: L.measure.solids)
// within the bird's half-span, its body 0.3 m over the top; and (2) the keep-outs, which a top-down raster can't see under:
// Pier 35's footprint grown 2 m, from the water to 1.5 m over its deck (the deck's edge, the fenders and the piles
// under it), and her hull's shell (her side, the bird's half-span + 0.5 m out to 1 m in) to 0.5 m over her bulwark's
// cap. A failure lists the
// bird, the time, the place and what it went through. Per line: its samples, failures, the least clearance over the
// drawn top (m), and the least distance from the pier's and the hull's footprints of any sample low enough to meet them
export function solidClearance(L, P, opts = {}) {
  const H = L.H, R = L.render, sims = L.sim.birds, S = P.SHIP, PI = P.PIER, wide = opts.wide || null;
  const deckY = PI.deck;
  const pierD = (x, z) => {         // + outside the pier's deck outline (its tip, sides and the bulkhead's face), - in
    const zb = 125.7 + 0.684 * x, inside = x >= PI.x0 && x <= PI.x1 && z >= PI.z0 && z <= zb;
    if (inside) return -Math.min(x - PI.x0, PI.x1 - x, z - PI.z0, (zb - z) * 0.826);
    const dx = Math.max(PI.x0 - x, 0, x - PI.x1), dz = Math.max(PI.z0 - z, 0, (z - zb) * 0.826);
    return Math.hypot(dx, dz);
  };
  const hullTop = z => { const zs = S.fromWorld(0, 0, z)[2]; return S.toWorld(S.halfBeam, S.sideAbl(zs) + S.bulwark, zs)[1]; };
  const hullD = (x, z) => {         // + outside her deck's outline, - in
    const zs = S.fromWorld(0, 0, z)[2];
    if (zs < S.stemZ) return Math.hypot(Math.max(0, Math.abs(x)), S.stemZ - zs);
    if (zs > S.sternZ) return Math.hypot(Math.max(0, Math.abs(x) - S.halfAt(S.sternZ)), zs - S.sternZ);
    return Math.abs(x) - S.halfAt(zs);
  };
  // (the wide raster, coarser, only where the habitat's own don't reach)
  const C = H.coarse, inC = (x, z) => x >= C.x0 && x <= C.x0 + C.w * C.res && z >= C.z0 && z <= C.z0 + C.h * C.res;
  const topAt = (x, z, r) => wide && !inC(x, z) ? Math.max(rasterAt(wide, x, z, r), 0) : H.top(x, z, r);
  const out = { samples: 0, fails: 0, byClass: {}, perLine: {}, wide: !!wide };
  const test = (b, t, p, rr, half) => {
    out.samples++;
    const c = out.byClass[b.cls] || (out.byClass[b.cls] = { samples: 0, fails: 0, minClear: 1e9 });
    c.samples++;
    const top = topAt(p[0], p[2], Math.max(0.4, rr)), clear = p[1] - top - 0.15;
    let what = clear < 0.3 ? 'what is drawn' : null;
    const pd = p[1] < deckY + 1.5 ? pierD(p[0], p[2]) : 1e9, hd = p[1] < hullTop(p[2]) + 0.5 ? hullD(p[0], p[2]) : 1e9;
    if (pd < 2) what = 'Pier 35 (its footprint grown 2 m, under or at its deck)';
    if (hd < half + 0.5 && hd > -1) what = "her hull's side";
    c.minClear = Math.min(c.minClear, clear);
    if (b.line) {
      const k = 'line ' + b.line.li, pl = out.perLine[k] || (out.perLine[k] = { tPass: L.sim.lines[b.line.li].tPass, samples: 0, fails: 0, minClear: 1e9, minPierD: 1e9, minHullD: 1e9 });
      pl.samples++; pl.minClear = Math.min(pl.minClear, clear); pl.minPierD = Math.min(pl.minPierD, pd); pl.minHullD = Math.min(pl.minHullD, hd); if (what) pl.fails++;
    }
    if (!what) return;
    out.fails++; c.fails++;
    const by = c.birds || (c.birds = {}); by[b.id] = (by[b.id] || 0) + 1;
    if ((c.worst || (c.worst = [])).length < 8) c.worst.push({ bird: b.id, t: +t.toFixed(1), p: p.map(v => +v.toFixed(1)), what, clear: +clear.toFixed(2) });
  };
  for (const b of sims) {
    const half = (b.sp === 'pelican' ? 2.03 : b.sp === 'cormorant' ? 1.2 : b.sp === 'pigeon' ? 0.64 : 1.37) / 2;
    if (b.line) {
      const Ln = L.sim.lines[b.line.li], t1 = Ln.tStart + Ln.dur + 5;
      for (let t = Ln.tStart; t <= t1; t += 0.25) { const q = R.trackAt(b, t); if (q.mode === 'fly' && q.pose !== 'away') test(b, t, q.p.slice(), half, half); }
    } else if (b.soar) {
      for (let t = 0; t < 600; t += 0.5) { const q = R.trackAt(b, t); test(b, t, q.p.slice(), half, half); }
    } else {
      const spans = [...(b.base || []).map(s => [s, true]), ...b.exc.flatMap(e => e.spans.map(s => [s, false]))];
      for (const [sp] of spans) {
        if (sp.type !== 'fly' || sp.dive) continue;
        const k = sp.k, n = k.length / KCH;
        for (let i = 0; i < n; i++) { const t = k[i * KCH]; if (t < sp.t0 + 3 || t > sp.t1 - 3) continue; test(b, t, [k[i * KCH + 1], k[i * KCH + 2], k[i * KCH + 3]], half * 0.5, half); }
      }
    }
  }
  const r2 = v => v > 1e8 ? null : +v.toFixed(2);
  for (const c of Object.values(out.byClass)) c.minClear = r2(c.minClear);
  for (const c of Object.values(out.perLine)) { c.minClear = r2(c.minClear); c.minPierD = r2(c.minPierD); c.minHullD = r2(c.minHullD); }
  out.pass = out.fails === 0;
  return out;
}

// the modelled lift at each soarer's beat against a gull's minimum sink
function soarLift(L) {
  const H = L.H, out = [];
  for (const b of L.sim.birds) {
    if (!b.soar) continue;
    const s = b.soar, zs = [s.z0, (s.z0 + s.z1) / 2, s.z1].map(z => +H.lift(s.x, s.y, z).toFixed(2));
    out.push({ bird: b.id, x: +s.x.toFixed(1), y: +s.y.toFixed(1), z: [s.z0, s.z1], lift: zs });
  }
  return { beats: out, sinkMin: SPECIES.gull.sinkMin, note: 'lift: habitat.lift (estimated from the wind normal to the wall, sheltered by the ship over her length)' };
}
// every perched bird's feet against the drawn surface under them: a 0.4 m tile at 4 mm rendered top down through the
// G-buffer from just above the foot (the near plane 0.35 m up clips an eave or a boom overhead; shader-placed geometry
// is seen as drawn, which a CPU raycast can't: ENVIRONMENT 2c.5); gap = the foot's height over the drawn top within 1.5 cm
// of it (+ floating, - sunk); none = nothing within 1 m below (on demand: a render a foot, ~2-4 s)
function perchContact(L, t) {
  const H = L.H, R = L.render, gaps = [], none = [], world = ctx0().world;
  for (const b of L.sim.birds) {
    const s = R.stateAt(b, t);
    if (s.hidden || s.mode === 'fly' || !s.feet) continue;
    const tr = R.trackAt(b, t);
    if (tr.pose === 'water' || tr.pose === 'under') continue;
    for (const f of s.feet) {
      const top = renderTop(world, { x0: f[0] - 0.2, x1: f[0] + 0.2, z0: f[2] - 0.2, z1: f[2] + 0.2, res: 0.004, include: ['hull', 'deck', 'pier', 'stage'], ymax: f[1] + 0.4, near: 0.05, far: 1.45 });
      const y = rasterAt(top, f[0], f[2], 0.015);
      if (y < -1e8) { none.push(b.id); continue; }
      gaps.push({ bird: b.id, gap: +(f[1] - y).toFixed(3) });
    }
  }
  const g = gaps.map(x => Math.abs(x.gap));
  return { feet: gaps.length + none.length, touching: gaps.filter(x => Math.abs(x.gap) <= 0.02).length, absGap: q(g), over2cm: gaps.filter(x => Math.abs(x.gap) > 0.02).length,
    noSurface: none.length, noSurfaceBirds: [...new Set(none)].slice(0, 10), worst: gaps.sort((a, c) => Math.abs(c.gap) - Math.abs(a.gap)).slice(0, 12) };
}
const ctx0 = () => window.SCENE || window.LIBERTY;

// ---- the boards' loops
//   lifebird~I~HOUR~DIST~AZ~EL      t = scene time; a camera DIST m from bird I (its index), AZ deg round from its heading
//                                   (0 its right side, 90 head on, -90 from behind), EL deg up
//   lifesp~SPECIES~HOUR~DIST~AZ~EL~T   t = the index of that species' bird (each in turn) at scene time T
//   lifeflush~CAM~HOUR              t = seconds after the first 5"/38 shot (scene time = its time + t), from bookmark CAM
export function lifeLoops(LOOPS, ctx) {
  const qs = new URLSearchParams(location.search), name = qs.get('loop') || '';
  const [kind, a, b, c, d, e, f] = name.split('~');
  const lens = (cam, mm) => { const hf = 2 * Math.atan(12 / mm); cam.fov = hf * 180 / Math.PI; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); };
  const shoot = (bird, t, hour, dist, az, el, label) => {
    const N = ctx.SCENE, L = N.life, cam = N.camera;
    const st = JSON.parse(JSON.stringify(L.render.stateAt(bird, t)));
    const yaw = (st.yaw || 0) + az * Math.PI / 180, E = el * Math.PI / 180, P = st.p;
    cam.position.set(P[0] - Math.sin(yaw) * Math.cos(E) * dist, P[1] + Math.sin(E) * dist, P[2] + Math.cos(yaw) * Math.cos(E) * dist);
    cam.up.set(0, 1, 0); cam.lookAt(P[0], P[1], P[2]); lens(cam, 50);
    frame(t, { hour, cam });
    blit(`${label || bird.id} · ${st.mode}${st.hidden ? ' (hidden)' : ''} · t ${t.toFixed(2)} · ${hour} h · [${P.map(v => v.toFixed(1))}]`);
  };
  if (kind === 'lifeshots') {
    // the species board: shots picked from the simulation (each kind perched, flying, in its acts), t = the shot's index
    let shots = null;
    const pick = () => {
      const L = ctx.SCENE.life, B = L.sim.birds, ev = L.events, find = f => B.find(f), H = L.H;
      const res = B.filter(b => b.cls === 'resident');
      const onShip = res.find(b => b.src === 'ship' && /rail starboard/.test(b.id) && b.seed > 0.3 && b.sp === 'gull');
      const ridge = res.find(b => b.src === 'pier' && b.sp === 'gull' && H.perches[b.home].p[1] > 12 && b.seed > 0.3);
      const juv = res.find(b => b.sp === 'gull' && b.seed < 0.3 && b.src === 'ship');
      const heer = res.find(b => b.sp === 'heermann' && b.seed > 0.25);
      const dry = res.find(b => b.sp === 'cormorant' && b.pose === 'dry'), cormS = res.find(b => b.sp === 'cormorant' && b.pose !== 'dry');
      const sill = res.find(b => b.sp === 'pigeon');
      const soar = find(b => b.cls === 'soarer'), vis0 = find(b => b.id === 'gull visitor 0'), lead = find(b => b.id === 'pelican line 0.0'), lead2 = find(b => b.id === 'pelican line 0.3');
      const diver = find(b => b.cls === 'diver'), comm = find(b => b.cls === 'commuter'), flock = B.filter(b => b.cls === 'flock');
      const dives = ev.filter(e => e.kind === 'pelican_dives'), wheels = ev.filter(e => e.kind === 'pigeons_wheel');
      const fl = L.startle.flushes.filter(f => f.t < 372.1 && /rail starboard/.test(B[f.bird].id)).map(f => B[f.bird])[0];
      const S2 = (name, b, t, hour, dist, az, el) => b && ({ name, b, t, hour, dist, az, el });
      shots = [
        S2('western gull on her starboard rail', onShip, 100, 17.6, 2.2, 75, 12), S2('western gull on the shed ridge', ridge, 100, 17.6, 2.6, 60, 18),
        S2("first-winter western gull", juv, 100, 17.6, 2.2, 75, 12), S2("Heermann's gull", heer, 100, 17.6, 2.2, 70, 12),
        S2('gull slope-soaring at the shed wall', soar, 100, 17.6, 4, 30, 10), S2('a visitor landing on her bow rail', vis0, 149.6, 17.6, 4, 60, 10),
        S2('pelican line: the leader', lead, 72, 17.6, 4.5, 40, 8), S2('pelican line: the fourth', lead2, 72, 17.6, 4.5, -60, 15),
        S2('the pelican plunging', diver, dives[0] ? dives[0].t - 0.45 : 67.3, 17.6, 6, 80, 5), S2('the pelican sitting after it', diver, dives[0] ? dives[0].t + 6 : 74, 17.6, 4, 60, 15),
        S2('cormorant drying its wings', dry, 100, 17.6, 2.6, 80, 10), S2('cormorant on a pile', cormS, 100, 17.6, 2.6, 80, 10),
        S2('cormorant commuting low', comm, 140, 17.6, 5, 70, 8), S2('pigeon on a sill', sill, 100, 17.6, 1.4, 70, 10),
        S2('the pigeon flock wheeling', flock[0], wheels[0] ? wheels[0].t + 22 : 70, 17.6, 7, 40, 10), S2('pigeons on the cornice', flock[1], wheels[0] ? wheels[0].t - 6 : 40, 17.6, 1.6, 90, 15),
        S2('a rail gull flushing at the stand-to', fl, 372.7, 19.1, 4, 60, 10), S2('circling after the drop', fl, 410, 19.1, 6, 40, 10),
        S2('gull at mid detail (25 m)', onShip, 100, 17.6, 25, 75, 12), S2('gull at far detail (90 m)', soar, 100, 17.6, 90, 30, 10),
      ].filter(Boolean);
    };
    LOOPS[name] = t => { if (!shots) pick(); const S2 = shots[Math.round(t) % shots.length]; shoot(S2.b, S2.t, S2.hour, S2.dist, S2.az, S2.el, `${S2.name} · ${S2.b.id}`); };
    LOOPS[name].len = 20;
  } else if (kind === 'lifebird') {
    LOOPS[name] = t => { const L = ctx.SCENE.life; shoot(L.sim.birds[+a], t, +(b || 17.6), +(c || 2), +(d || 30), +(e || 12)); };
    LOOPS[name].len = 600;
  } else if (kind === 'lifesp') {
    LOOPS[name] = t => { const L = ctx.SCENE.life, list = L.sim.birds.filter(x => x.sp === a); const bird = list[Math.round(t) % list.length]; shoot(bird, +(f || 40), +(b || 17.6), +(c || 2), +(d || 30), +(e || 12), `${bird.id} (${Math.round(t) % list.length + 1}/${list.length})`); };
    LOOPS[name].len = 200;
  } else if (kind === 'lifeflush') {
    LOOPS[name] = t => {
      const N = ctx.SCENE, show = N.show, g5 = show ? show.events('gun5') : [], t0 = g5.length ? g5[0].t : 375.7;
      placeCamera(N.camera, N.CAMS[a] || N.CAMS.life_flush);
      frame(t0 + t, { hour: +(b || 19.1) });
      const cnt = N.life.render.count();
      blit(`the first 5"/38 at ${t0.toFixed(2)} + ${t.toFixed(2)} s · ${a || 'life_flush'} · ${b || 19.1} h · drawn ${Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    };
    LOOPS[name].len = 600;
  }
}
