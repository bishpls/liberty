// liberty/src/stage/measure.js: the stage's numbers against their sources, on demand (no build or frame cost):
//   LIBERTY.ctx.mods.stage.measure.effects()     every effect's height, visible start, duration, lead and smoke's hang,
//                                                 measured from its own drawn particles over t (one event alone into a
//                                                 probe, at 24 fps), beside show.md's numbers
//   .confetti()     the paper's apex, hang time and where it comes down (the apron, the water, the ship)
//   .sightlines()   how much of each mark (a performer-sized box) and of the IMAG screens each apron seat sees
//   .spots()        the live spot count over the whole show at 24 fps (the budget: 64 of the engine's 96)
//   .speeds()       every fixture's pan and tilt speed over the show against the Sharpy's (L2: 220 / 192 deg/s)
//   .gpu(cam)       the stage's GPU cost at the page's size (its meshes hidden in interleaved pairs; its lights off)
//   .markLight()    the light on a performer at each mark, per section (vertical, facing their way; the best way; from above)
//   .all()          the CPU ones in one object
import { SPEC, LEAD } from './pyro.js';
import { GUN } from './guns.js';

const FPS = 24;
const r2 = x => +x.toFixed(2);

// a probe with the renderers' API: what one event draws in one frame, as numbers
function probe(baseOf) {
  const P = { lit: 0, nSmoke: 0, top: -1e9, smokeTop: -1e9, fires: [], lobes: [], erosions: [] };
  const up = (y, p) => y - baseOf(p);
  P.spark = (p, v, w, heat) => { if (heat > 0.15) { P.lit++; P.top = Math.max(P.top, up(p[1], p)); } };
  P.fire = (p, r, heat, seed, a = 1) => { if (a > 0.12) { P.lit++; P.top = Math.max(P.top, up(p[1] + r, p)); P.fires.push([p[0], p[1], p[2], r]); } };
  P.glow = () => {};
  P.ring = () => {};
  P.smoke = (p, r, tone, seed, erosion) => { if (erosion < 0.98) { P.nSmoke++; const rr = r * (1 - 0.45 * erosion); P.smokeTop = Math.max(P.smokeTop, up(p[1] + rr, p)); P.lobes.push([p[0], p[1], p[2], rr]); P.erosions.push(erosion); } };
  return P;
}
// the diameter of a set of spheres (their joint extent, its largest axis)
function spread(list) {
  if (!list.length) return 0;
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const [x, y, z, r] of list) { lo[0] = Math.min(lo[0], x - r); lo[1] = Math.min(lo[1], y - r); lo[2] = Math.min(lo[2], z - r); hi[0] = Math.max(hi[0], x + r); hi[1] = Math.max(hi[1], y + r); hi[2] = Math.max(hi[2], z + r); }
  return Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
}

export function makeStageMeasures(N, mod) {
  const L = mod.layout, pyro = mod.pyro, guns = mod.guns, show = N.ctx.show;
  const nearestBase = list => p => { let best = 1e9, y = 0; for (const e of list) { const d = (e.pos[0] - p[0]) ** 2 + (e.pos[2] - p[2]) ** 2; if (d < best) { best = d; y = e.pos[1]; } } return y; };
  // one event, frame by frame from 0.25 s before its time
  const run = (draw, baseOf, from, to) => {
    const frames = [];
    for (let k = Math.round(from * FPS); k <= Math.round(to * FPS); k++) { const pr = probe(baseOf); draw(k / FPS, pr); frames.push({ k, t: k / FPS, ...pr }); }
    return frames;
  };
  const summary = (frames, t0, lead) => {
    const lit = frames.filter(f => f.lit > 0), sm = frames.filter(f => f.nSmoke > 0);
    const first = lit.length ? lit[0].t - t0 : null, last = lit.length ? lit[lit.length - 1].t - t0 : null;
    return { visibleFrom_s: first === null ? null : r2(first), visibleFrames: lit.length, lit_s: lit.length ? r2(last - first + 1 / FPS) : 0,
      height_m: lit.length ? r2(Math.max(...lit.map(f => f.top))) : null, smokeHang_s: sm.length ? r2(sm[sm.length - 1].t - t0) : null,
      smokeTop_m: sm.length ? r2(Math.max(...sm.map(f => f.smokeTop))) : null, command_s: r2(-lead) };
  };

  const effects = () => {
    const out = {};
    const E = pyro.events;
    const one = (kind, e, list, window, extra = {}) => {
      const fr = run((t, pr) => pyro.drawOne(kind, e, t, pr), nearestBase(list), e.t - 0.25, e.t + window);
      return Object.assign(summary(fr, e.t, LEAD[kind]), extra);
    };
    const gr = E.gerb.find(e => e.line !== 'mast'), gm = E.gerb.find(e => e.line === 'mast');
    if (gr) out.gerbRail = one('gerb', gr, L.gerbs.rail, (gr.dur || 8) + 14, { source: { height_m: r2(SPEC.gerb.rail.H), burn_s: gr.dur, ref: SPEC.gerb.rail.src } });
    if (gm) out.gerbMast = one('gerb', gm, L.gerbs.mast, (gm.dur || 15) + 14, { source: { height_m: r2(SPEC.gerb.mast.H), burn_s: gm.dur, ref: SPEC.gerb.mast.src } });
    const sp = E.spark[0]; if (sp) out.coldSpark = one('spark', sp, L.sparks, (sp.dur || 10) + 2, { source: { height_m: [1, 5], rise_s: [0.2, 0.5], ref: SPEC.spark.src } });
    const cm = E.comet[0]; if (cm) out.comet = one('comet', cm, L.comets, 9, { source: { height_m: [6, 18], ref: SPEC.comet.src } });
    for (const d of [...new Set(E.flame.map(e => e.dur))]) { const e = E.flame.find(f => f.dur === d); out['flame_' + d] = one('flame', e, L.flames, d + 3, { source: { height_m: 4, burst_s: d, ref: SPEC.flame.src } }); }
    for (const d of [...new Set(E.co2.map(e => e.dur))]) { const e = E.co2.find(f => f.dur === d); out['co2_' + d] = one('co2', e, L.co2, d + 6, { source: { height_m: [8, 12], hang_s: [3, 5], ref: SPEC.co2.src } }); }
    for (const at of ['stbd', 'port', 'bow', 'stern']) {
      const e = E.mortar.find(m => (m.at || 'port') === at); if (!e) continue;
      const fr = run((t, pr) => pyro.drawOne('mortar', e, t, pr), nearestBase(L.mortars[at]), e.t - 0.25, e.t + 9);
      const s = summary(fr, e.t, LEAD.mortar), fl = fr.filter(f => f.fires.length);
      // the puff's size at 1 s (one tube: the first's lobes)
      const at1 = fr.find(f => Math.abs(f.t - e.t - 1) < 0.5 / FPS);
      s.flashFrames = fl.length; s.puff_m = at1 ? r2(spread(at1.lobes.slice(0, 7))) : null;
      s.source = { flashFrames: [1, 2], puff_m: [2, 3], hang_s: [3, 8], ref: SPEC.mortar.src };
      out['mortar_' + at] = s;
    }
    // the guns: the flash's frames and ring, the ball's size at 1 s and 5 s, how long it hangs
    for (const kind of ['gun5', 'gun3']) {
      const list = kind === 'gun5' ? guns.S5 : guns.S3; if (!list.length) continue;
      const sh = list[0];
      const fr = run((t, pr) => guns.drawShot(kind, 0, t, pr), () => sh.p[1], sh.t - 0.1, sh.t + 16);
      const fl = fr.filter(f => f.fires.length);
      // the ring's diameter: the fire lumps' spread across the bore (their distance from the axis), at its peak
      const across = f => { let m = 0; for (const [x, y, z, r] of f.fires) { const q = [x - sh.p[0], y - sh.p[1], z - sh.p[2]], a = q[0] * sh.d[0] + q[1] * sh.d[1] + q[2] * sh.d[2]; const pe = Math.hypot(q[0] - a * sh.d[0], q[1] - a * sh.d[1], q[2] - a * sh.d[2]) + r; m = Math.max(m, pe); } return 2 * m; };
      const at = s => fr.find(f => Math.abs(f.t - sh.t - s) < 0.5 / FPS);
      const sm = fr.filter(f => f.nSmoke > 0);
      out[kind] = { flashFrames: fl.length, flash_ms: Math.round(fl.length / FPS * 1000), ringPeak_m: r2(Math.max(0, ...fl.map(across))),
        ball1s_m: at(1) ? r2(spread(at(1).lobes)) : null, ball5s_m: at(5) ? r2(spread(at(5).lobes)) : null, smokeHang_s: sm.length ? r2(sm[sm.length - 1].t - sh.t) : null,
        source: kind === 'gun5' ? { flash_ms: [100, 150], ringPeak_m: [3, 5], ball_m: [8, 12], hang_s: [8, 15], ref: GUN.gun5.src } : { scale: '60 % of the 5"', ref: GUN.gun3.src } };
    }
    const g20 = guns.S20.findIndex(l => l.length);
    if (g20 >= 0) {
      const sh = guns.S20[g20][0];
      const fr = run((t, pr) => guns.drawShot('gun20', [g20, 0], t, pr), () => sh.p[1], sh.t - 0.1, sh.t + 2);
      const fl = fr.filter(f => f.fires.length);
      out.gun20 = { flashFrames: fl.length, star_m: fl.length ? r2(Math.max(...fl.map(f => spread(f.fires)))) : null, roundsEvery_s: r2(60 / 450), source: { star_m: [0.3, 0.4], flashFrames: 1, ref: GUN.gun20.src } };
    }
    return out;
  };

  // the confetti: where each piece came down (pyro.js finds it at build, along the same path its shader draws)
  const confetti = () => {
    const land = pyro.confettiLanding; if (!land || !land.length) return null;
    const P = N.ctx.P, CZ = P.CROWD_ZONE, o = { crowdZone: 0, apronElse: 0, shedRoof: 0, pierElse: 0, ship: 0, water: 0, air: 0 };
    const hs = [];
    for (const [x, z, tl] of land) {
      if (tl >= 60) { o.air++; continue; }
      hs.push(tl);
      if (P.SHIP.deckAt(x, z) !== null) o.ship++;
      else if (P.PIER.inside(x, z)) { if (x >= CZ.x0 && x <= CZ.x1 && z >= CZ.z0 && z <= CZ.z1) o.crowdZone++; else if (x <= P.PIER.x0 + P.PIER.apronW) o.apronElse++; else if (x >= P.PIER.shed.x0 && x <= P.PIER.shed.x1) o.shedRoof++; else o.pierElse++; }
      else o.water++;
    }
    hs.sort((a, b) => a - b);
    const sh = k => r2(k / land.length);
    return { pieces: land.length, hang_s: [r2(hs[Math.floor(hs.length * 0.1)]), r2(hs[Math.floor(hs.length * 0.5)]), r2(hs[Math.floor(hs.length * 0.9)])],
      share: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, sh(v)])), source: { apex_m: [10, 20], hang_s: [8, 15], ref: SPEC.confetti.src } };
  };

  // the apron's seats (the crowd zone, eye 1.6 m over the pier's deck) against each mark and the IMAG screens
  const sightlines = (hour = 19.1, t = 4) => {
    const P = N.ctx.P, CZ = P.CROWD_ZONE, eye = CZ.deck + 1.6, seats = [];
    for (const x of [CZ.x0 + 0.6, (CZ.x0 + CZ.x1) / 2, CZ.x1 - 0.5]) for (const z of [-46, -36.5, L.deck.zc, -19, -9]) seats.push({ name: `x${x.toFixed(1)} z${z.toFixed(1)}`, eye: [x, eye, z] });
    const out = { seats: seats.length, marks: {}, imag: {} };
    for (const [k, m] of Object.entries(L.marks)) {
      const r = N.measure.sightlines(seats, m.pos, [0.6, 1.7, 0.6], hour, t);
      const v = r.map(s => s.visible ?? 0);
      out.marks[k] = { mean: r2(v.reduce((a, b) => a + b, 0) / v.length), best: r2(Math.max(...v)), worst: r2(Math.min(...v)), seatsSeeingHalf: v.filter(x => x >= 0.5).length, blockers: r.flatMap(s => s.blockers.map(b => b[0])).slice(0, 4) };
    }
    for (const im of L.imag) {
      const r = N.measure.sightlines(seats, [im.x, im.y0, im.z], [0.15, im.h, im.w], hour, t);
      const v = r.map(s => s.visible ?? 0);
      out.imag[im.side < 0 ? 'SL' : 'SR'] = { mean: r2(v.reduce((a, b) => a + b, 0) / v.length), worst: r2(Math.min(...v)), seatsSeeingHalf: v.filter(x => x >= 0.5).length };
    }
    return out;
  };

  // the live spots over the show (this module's), at 24 fps
  const spots = () => {
    const S = N.stage, mine = S.spots.filter(s => s.module === 'stage'), dur = show.duration;
    let max = 0, at = 0; const hist = [];
    for (let k = 0; k < dur * FPS; k++) {
      const t = k / FPS; let n = 0;
      for (const s of mine) { const st = s.state ? s.state(t) : s; if ((st.intensity ?? 1) > 1e-4) n++; }
      hist.push(n); if (n > max) { max = n; at = t; }
    }
    const sorted = hist.slice().sort((a, b) => a - b);
    return { registered: mine.length, max, atT: r2(at), p95: sorted[Math.floor(sorted.length * 0.95)], median: sorted[Math.floor(sorted.length / 2)], budget: 68, engine: S.maxSpots };
  };

  // the fixtures' pan and tilt speeds over the show (deg/s), against the Sharpy's (L2)
  const speeds = () => {
    const rig = mod.rig, dur = show.duration, n = rig.fx.length;
    const prev = new Array(n).fill(null), maxP = new Array(n).fill(0), maxT = new Array(n).fill(0), maxB = new Array(n).fill(0), clamps = new Array(n).fill(0);
    let over = 0, flips = 0, frames = 0;
    for (let k = 0; k < dur * FPS; k++) {
      const st = rig.at(k / FPS);
      for (let i = 0; i < n; i++) {
        const s = st[i]; if (!s) continue;
        if (s.clamped) clamps[i]++;
        const p = prev[i];
        if (p && s.intensity > 1e-4 && p.on) {
          let dp = Math.abs(s.pan - p.pan) * 180 / Math.PI * FPS; const dt = Math.abs(s.tilt - p.tilt) * 180 / Math.PI * FPS;
          const db = Math.acos(Math.max(-1, Math.min(1, s.dir[0] * p.dir[0] + s.dir[1] * p.dir[1] + s.dir[2] * p.dir[2]))) * 180 / Math.PI * FPS;
          maxB[i] = Math.max(maxB[i], db);
          if (dp > 180 * FPS * 0.9) { flips++; dp = 0; }
          maxP[i] = Math.max(maxP[i], dp); maxT[i] = Math.max(maxT[i], dt);
          if (dp > 220 || dt > 192) over++;
          frames++;
        }
        prev[i] = { pan: s.pan, tilt: s.tilt, dir: s.dir, on: s.intensity > 1e-4 };
      }
    }
    const byGroup = {};
    rig.fx.forEach((f, i) => { const g = byGroup[f.group] || (byGroup[f.group] = { pan: 0, tilt: 0, beam: 0, clampFrames: 0 }); g.pan = Math.max(g.pan, r2(maxP[i])); g.tilt = Math.max(g.tilt, r2(maxT[i])); g.beam = Math.max(g.beam, r2(maxB[i])); g.clampFrames += clamps[i]; });
    return { limit: { pan: 220, tilt: 192, ref: 'L2: Sharpy, pan 540 deg in 2.45 s, tilt 250 deg in 1.30 s' }, byGroup, framesOver: over, framesOverShare: r2(over / Math.max(frames, 1)), flips };
  };

  // the GPU: the stage's meshes hidden in interleaved pairs, and its lights (spots, beams, lasers) off
  const gpu = async (cam = 'stage_roof', hour = 19.1, t = 75.1) => N.measure.gpu(cam, hour, { n: 5, t, modules: ['stage'],
    pairs: { stageLights: [() => { N.world.hidden = new Set(['stage']); }, () => { N.world.hidden = null; }] } });

  // the light on a performer at each mark: the illuminance at 1.5 m over the mark (scene units: the sun ~2.5 on a surface
  // square to it) on a vertical plane facing the mark's way (their front), the best of 16 horizontal directions, and on a
  // plane facing up; luminance of the light's colour. The shader's own model (glsl.js LIGHT: inverse square from the
  // cone's apex, its soft edge, windowed to the range, nothing past where a beam lands; no shadows, gobos left out).
  // Means over each section (8 samples), and the floor's middle (the stage's centre line, 2 m in from the lip) the same
  const markLight = (n = 8, h = 1.5) => {
    const S = N.stage, DEG = Math.PI / 180, mine = S.spots.filter(sp => sp.module === 'stage');
    const pts = Object.assign({}, ...Object.entries(L.marks).map(([k, m]) => ({ [k]: { p: [m.pos[0], m.pos[1] + h, m.pos[2]], f: m.face } })),
      { floor: { p: [L.deck.x1 - 2, L.F + 0.02, L.deck.zc], f: [0, 1, 0], up: true } });
    const at = (t, P) => {
      const front = [0, 0, 0], dirs = Array.from({ length: 16 }, (_, i) => [Math.cos(i * Math.PI / 8), 0, Math.sin(i * Math.PI / 8)]), best = dirs.map(() => 0); let up = 0;
      for (const sp of mine) {
        const st = sp.state ? sp.state(t) : sp, I = st.intensity ?? 1; if (!(I > 1e-4)) continue;
        const ang = (st.angle ?? 8) * DEG, all = ang >= 179 * DEG, d = norm(st.dir), c = st.color || [1, 1, 1];
        const d0 = ang >= 60 * DEG ? 0 : (st.srcR ?? 0.08) / Math.tan(Math.max(ang, 0.2 * DEG)), k = ((10 + d0) / 10) ** 2, range = (st.range ?? 60) + d0;
        const A = [st.pos[0] - d[0] * d0, st.pos[1] - d[1] * d0, st.pos[2] - d[2] * d0], q = [A[0] - P.p[0], A[1] - P.p[1], A[2] - P.p[2]];
        const d2 = q[0] * q[0] + q[1] * q[1] + q[2] * q[2], dl = Math.sqrt(d2); if (dl > range) continue;
        const ld = [q[0] / dl, q[1] / dl, q[2] / dl], cd = -(ld[0] * d[0] + ld[1] * d[1] + ld[2] * d[2]);
        const cosO = all ? -1.001 : Math.cos(ang), cosI = all ? -1 : Math.cos(ang * (1 - (st.soft ?? 0.3))); if (cd < cosO) continue;
        if (d0 > 0 && cd * dl < d0) continue;
        const land = st.stop === false ? null : S.landing(st.pos, d, st.range ?? 60);
        if (land && land.n[0] * P.p[0] + land.n[1] * P.p[1] + land.n[2] * P.p[2] < land.n[3] - 0.05) continue;
        const e0 = Math.min(1, Math.max(0, (cd - cosO) / Math.max(Math.max(cosI, cosO + 1e-4) - cosO, 1e-6))), cone = e0 * e0 * (3 - 2 * e0);
        const win = Math.max(0, 1 - (dl / range) ** 4) ** 2, Y = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) * I * k;
        const E = Y * 100 / Math.max(d2, d0 * d0) * win * cone;
        const ff = Math.max(0, ld[0] * P.f[0] + ld[1] * P.f[1] + ld[2] * P.f[2]); front[0] += E * ff;
        dirs.forEach((v, i) => { best[i] += E * Math.max(0, ld[0] * v[0] + ld[2] * v[2]); });
        up += E * Math.max(0, ld[1]);
      }
      return { front: front[0], best: Math.max(...best), up };
    };
    const out = {};
    for (const sec of show.sections) {
      const row = {};
      for (const [k, P] of Object.entries(pts)) {
        let f = 0, b = 0, u = 0;
        for (let i = 0; i < n; i++) { const t = sec.t0 + (sec.t1 - sec.t0) * (i + 0.5) / n, r = at(t, P); f += r.front; b += r.best; u += r.up; }
        row[k] = P.up ? { up: r2(u / n) } : { front: r2(f / n), best: r2(b / n), up: r2(u / n) };
      }
      out[sec.name] = row;
    }
    return out;
  };

  // a gun's smoke over its life, every 0.25 s after the shot: the lobes left, the cloud's extent (its largest axis), the
  // lobes' mean erosion (0 whole .. 1 gone), the volume left (sum of the lobes' r^3 kept by the erosion's threshold, a
  // proxy for density), the height of its middle over the muzzle
  const smokeSeries = (kind = 'gun5', step = 0.25, to = 14) => {
    const list = kind === 'gun5' ? guns.S5 : guns.S3; if (!list.length) return null;
    const sh = list[0], out = [];
    for (let a = 0; a <= to + 1e-6; a += step) {
      const pr = probe(() => sh.p[1]); guns.drawShot(kind, 0, sh.t + a, pr);
      const L = pr.lobes, e = pr.erosions, vol = L.reduce((v, l, i) => v + l[3] ** 3 * Math.max(0, 1 - e[i]), 0);
      out.push({ a: r2(a), lobes: L.length, extent_m: r2(spread(L)), erosion: L.length ? r2(e.reduce((x, y) => x + y, 0) / e.length) : null, volume: r2(vol),
        mid_m: L.length ? r2(L.reduce((v, l) => v + l[1], 0) / L.length - sh.p[1]) : null });
    }
    return out;
  };
  const all = () => ({ effects: effects(), confetti: confetti(), spots: spots(), speeds: speeds() });
  return { effects, confetti, sightlines, spots, speeds, gpu, markLight, smokeSeries, all };
}

function launch(H, k) { const G = 9.81, vt = -G / k, apex = v0 => { const ta = Math.log((v0 - vt) / -vt) / k; return vt * ta + (v0 - vt) * (1 - Math.exp(-k * ta)) / k; }; let lo = 0.1, hi = 400; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (apex(m) < H) lo = m; else hi = m; } return (lo + hi) / 2; }
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cone(d, a, u1, u2) {
  const ct = 1 - u1 * (1 - Math.cos(a)), st = Math.sqrt(1 - ct * ct), ph = u2 * Math.PI * 2;
  const ux = Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  let s = [d[1] * ux[2] - d[2] * ux[1], d[2] * ux[0] - d[0] * ux[2], d[0] * ux[1] - d[1] * ux[0]]; s = norm(s);
  const u = [d[1] * s[2] - d[2] * s[1], d[2] * s[0] - d[0] * s[2], d[0] * s[1] - d[1] * s[0]];
  return [d[0] * ct + (s[0] * Math.cos(ph) + u[0] * Math.sin(ph)) * st, d[1] * ct + (s[1] * Math.cos(ph) + u[1] * Math.sin(ph)) * st, d[2] * ct + (s[2] * Math.cos(ph) + u[2] * Math.sin(ph)) * st];
}
