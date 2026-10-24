// liberty/src/life/startle.js: the birds' answer to the show. Every loud event (the 5"/38, the 3"/50, the Oerlikons'
// bursts, the mortars: habitat.loud) reaches each bird at the speed of sound (343 m/s: the flush rolls outward from the
// gun) at its peak level there (spherical spreading from B5's level at 1 m). A roosting bird flushes with the species'
// dose-response (species.js startle: L50, w), after its latency: an alert still, then the spring off the perch. Flushed
// birds circle over their roost group (habitat groups: a centre clear of the stage's column, a radius, a height band),
// higher with every blast; each blast may displace a share of them (cumulative: they leave over the water and come back
// after the show). After the last blast they've heard and its aloft time, they come back: home, or while the show runs
// and home is hot (in the stage's column), a free perch nearby until it's over. Everything flies through the hot zones'
// avoidance (the column, the smoke, the mortars, the gerbs, the flames) and keeps clear of what's drawn.
// The result is excursions: { a, b, spans } on each bird that override its baseline over [a, b).
import { rng, clamp, lerp, hash1 } from 'scene3d/util.js';
import { BIRDS } from 'scene3d/kit/creature/presets.js';
import { SPECIES, flushP } from './species.js';
import { Flyer, takeoff, seek, circle, planLanding, arrived, sampleSpans, newState, liftOver } from './flight.js';
import { LB, DT } from './sim.js';

const C_SOUND = 343;
const lognorm = (R, p) => { const [p10, m, p90] = p, s = Math.log(p90 / m) / 1.2816, z = Math.sqrt(-2 * Math.log(Math.max(R(), 1e-9))) * Math.cos(2 * Math.PI * R()); return clamp(m * Math.exp(s * z), p10 * 0.7, p90 * 1.5); };

export function startle(H, sim, opts = {}) {
  const t0w = performance.now();
  const loud = H.loud, show = H.show;
  const stats = { flushes: [], events: [], aloft: [], resettle: [], left: 0, zoneSteps: 0, clearSteps: 0, flySteps: 0, altPerch: 0, unfinished: 0 };
  const sounds = [];
  if (!loud.length) return { stats, sounds, TL: 0 };
  const showEnd = (show ? show.duration : loud[loud.length - 1].t) + 15;
  const tStart = loud[0].t - 1, tMax = opts.tMax || showEnd + 900;
  const R = rng(opts.seed || 777);
  const pr = H.perches;
  const reserved = new Set(sim.birds.filter(b => b.cls === 'resident').map(b => b.home));
  // the participants: every resident, every visitor; per bird its hearing of each event
  const P = [];
  for (const b of sim.birds) {
    if (b.cls !== 'resident' && b.cls !== 'visitor') continue;
    const S = SPECIES[b.sp];
    if (!S.startle) continue;
    const st = newState();
    const hear = [];
    for (const [ei, e] of loud.entries()) {
      sampleSpans(b.base, e.t, LB, st);
      const d = Math.hypot(st.p[0] - e.pos[0], st.p[1] - e.pos[1], st.p[2] - e.pos[2]);
      const Lpk = e.L1 - 20 * Math.log10(Math.max(d, 1)) + (e.rounds >= 4 ? 3 : 0);
      hear.push({ ei, t: e.t + d / C_SOUND, Lpk, p: flushP(b.sp, Lpk), u: hash1((b.key * 7349 + ei * 911) >>> 0) });
    }
    hear.sort((a, c) => a.t - c.t);
    // shots on one beat (an Oerlikon burst's guns, the 5"/38 with the mortars on the drop) are one blast to a bird: the
    // loudest of those within 0.6 s of each other
    for (let i = hear.length - 1; i > 0; i--) if (hear[i].t - hear[i - 1].t < 0.6) { if (hear[i].p > hear[i - 1].p) hear[i - 1] = hear[i]; hear.splice(i, 1); }
    const g = b.home >= 0 && b.home !== undefined ? H.group(pr[b.home].group) : null;
    P.push({ b, S, hear, hi: 0, mode: 'base', spans: [], F: null, g, a: null, tRes: 0, leaveP: 0, h: 0, Rb: 0, dir: 1, target: null, landing: null, nBlasts: 0, R: rng(3000 + b.key) });
  }
  // the zones in time
  const zs = H.zones.slice().sort((a, b) => a.t0 - b.t0);
  let zi = 0; const live = [];
  const grid = new Map(), key = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
  const begin = (q, t) => { if (q.a === null) q.a = t; };
  // where to circle: the roost group's ring, or for the ones without a group (visitors) the nearest group's
  const ringOf = (q, p) => {
    let g = q.g;
    if (!g) { let bd = 1e9; for (const gg of H.groups) { const d = Math.hypot(gg.c[0] - p[0], gg.c[1] - p[2]); if (d < bd) { bd = d; g = gg; } } }
    if (q.b.sp === 'pigeon') return { c: [Math.max(52, g.c[0]), g.c[1]], R: 22 + q.R() * 8, h: [24, 34] };
    if (q.b.sp === 'cormorant') { const d = H.openDir(p) || [0, 0, -1]; return { c: [p[0] + d[0] * 80, p[2] + d[2] * 80], R: 50 + q.R() * 20, h: [6, 14] }; }
    return { c: g.c, R: g.R * (0.75 + 0.6 * q.R()), h: g.h };
  };
  const startFlight = (q, t, from, dir) => {
    q.F = new Flyer(q.b.sp, q.R, { H }); takeoff(q.F, t, from, dir);
    const ring = ringOf(q, from);
    q.ring = ring; q.h = lerp(ring.h[0], ring.h[1], q.R()); q.dir = q.R() < 0.5 ? 1 : -1;
    // first the climb-out: along the open way until it's above everything within 10 m, then its ring
    q.mode = 'climbout'; q.after = 'circle'; q.climbDir = dir; q.climbFrom = from.slice(); q.flightT0 = t;
  };
  const hipsAt = (sp, p, scale) => [p[0], p[1] + BIRDS[SPECIES[sp].kit].standH * scale, p[2]];
  // a free perch near a point, cold, of the bird's own kind (ship rails and tops for the ship's, ridges and rails else)
  const altPerch = (q, near) => {
    let best = null, bd = 1e9;
    for (const pp of pr) {
      if (reserved.has(pp.id) || pp.hot || pp.kind === 'funnel') continue;
      if (q.b.sp === 'pigeon' || q.b.sp === 'cormorant') continue;
      if (!(pp.kind === 'rail' || pp.kind === 'ridge' || pp.kind === 'bollard' || pp.kind === 'mast')) continue;
      const d = Math.hypot(pp.p[0] - near[0], pp.p[2] - near[2]);
      if (d < bd) { bd = d; best = pp; }
    }
    if (best) reserved.add(best.id);
    return best;
  };
  // the landing: approach from downwind of the perch at a clear heading, then the planned glide in
  const landOn = (q, hips, perchId, onDone) => { q.mode = 'return'; q.target = { hips, perch: perchId, onDone, stage: 0 }; };
  // the loop
  let lastBlast = -1e9;
  const nextLoud = () => { for (const e of loud) if (e.t > tNow) return e.t; return 1e9; };
  let tNow = tStart;
  let busy = P.length;
  for (let step = 0; tNow < tMax && busy > 0; step++, tNow += DT) {
    const t = tNow;
    while (zi < zs.length && zs[zi].t0 <= t) live.push(zs[zi++]);
    for (let i = live.length - 1; i >= 0; i--) if (live[i].t1 < t) live.splice(i, 1);
    for (const e of loud) if (e.t <= t && e.t > t - DT) lastBlast = e.t;
    grid.clear();
    for (const q of P) if (q.F && q.F.flying) { const k = key(q.F.p[0], q.F.p[2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(q.F.p); }
    busy = 0;
    for (const q of P) {
      if (q.mode === 'done') continue;
      busy++;
      // the blasts it hears now
      while (q.hi < q.hear.length && q.hear[q.hi].t <= t) {
        const h = q.hear[q.hi++];
        const e = loud[h.ei];
        if (q.mode === 'base' || q.mode === 'perched') {
          if (h.u < h.p) {
            if (q.mode === 'perched') q.spans.push({ type: 'still', t0: q.perchedT0, t1: h.t, at: q.perchedAt, yaw: q.perchedYaw, perch: q.perchedId, pose: 'stand' });
            // flushed: an alert still from the moment it hears it to the spring off
            const lat = lerp(q.S.startle.latency[0], q.S.startle.latency[1], q.R());
            q.flushAt = h.t + lat; q.heardAt = h.t; q.alertFrom = q.mode;
            stats.flushes.push({ bird: q.b.i, sp: q.b.sp, ev: h.ei, kind: e.kind, t: e.t, dist: +((h.t - e.t) * C_SOUND).toFixed(1), Lpk: +h.Lpk.toFixed(1), response: +(q.flushAt - e.t).toFixed(3) });
            q.mode = 'alert'; begin(q, h.t);
            q.tRes = h.t + lognorm(q.R, q.S.startle.aloft); q.nBlasts = 1; q.lastHeard = h.t;
          }
        } else if (q.mode === 'circle' || q.mode === 'return' || q.mode === 'alert' || q.mode === 'climbout') {
          if (h.p > 0.05) {
            q.tRes = Math.max(q.tRes, h.t + lognorm(q.R, q.S.startle.aloft)); q.nBlasts++; q.lastHeard = h.t;
            q.h = Math.min(q.h + 6, 85);
            if (q.mode === 'return' && q.target && q.target.stage < 2) { q.mode = 'circle'; if (q.target.perch >= 0 && q.target.perch !== q.b.home) reserved.delete(q.target.perch); q.target = null; }
            if (q.R() < q.S.startle.leave * h.p && q.mode === 'circle') q.mode = 'leave';
          }
        } else if (q.mode === 'away') {
          q.tRet = Math.max(q.tRet, showEnd + lerp(q.S.startle.returnAfter[0], q.S.startle.returnAfter[1], q.R()));
        }
      }
      // the spring off
      if (q.mode === 'alert' && t >= q.flushAt) {
        const st = sampleSpans(q.b.base, q.heardAt, LB, newState());
        const from = q.alertFrom === 'perched' && q.perchedAt ? q.perchedAt : st.p.slice();
        if (q.alertFrom === 'base' && st.mode === 'fly') {
          // a visitor caught in the air: it veers off and away
          q.F = new Flyer(q.b.sp, q.R, { H }); q.F.begin(t, st.p, st.v); q.a = t;
          q.ring = ringOf(q, st.p); q.h = Math.max(st.p[1] + 10, q.ring.h[1]); q.dir = 1; q.mode = q.b.cls === 'visitor' ? 'leave' : 'circle';
        } else {
          q.spans.push({ type: 'still', t0: q.heardAt, t1: t, at: from, yaw: q.alertFrom === 'perched' ? q.perchedYaw : st.yaw, perch: q.alertFrom === 'perched' ? q.perchedId : st.perch, pose: st.pose === 'water' ? 'water' : 'alert' });
          // off: away from the blast, outboard, into the wind (a mix)
          const e = loud[q.hear[q.hi - 1].ei], ax = from[0] - e.pos[0], az = from[2] - e.pos[2], al = Math.hypot(ax, az) || 1, u = H.wind.up;
          const pp = pr[q.alertFrom === 'perched' ? q.perchedId : (q.b.home ?? st.perch)];
          const ob = pp && pp.kind === 'rail' ? [Math.sign(pp.p[0]), 0] : [0, 0];
          const wish = [ax / al * 0.5 + u[0] * 0.5 + ob[0] * 0.8, 0, az / al * 0.5 + u[2] * 0.5 + ob[1] * 0.8];
          const colLive = live.find(z => z.kind === 'column');
          startFlight(q, t, from, H.openDir(from, wish, colLive && Math.hypot(from[0] - colLive.c[0], from[2] - colLive.c[1]) > colLive.r ? colLive : null));
          if (q.b.cls === 'visitor') q.after = 'leave';
          if (q.alertFrom === 'perched' && q.perchedId !== q.b.home) reserved.delete(q.perchedId);
        }
        q.wasHome = q.alertFrom === 'base';
        q.flightT0 = t;
        continue;
      }
      if (!q.F || !q.F.flying) {
        // perched away from home (an alt perch) or away out of sight: waiting
        if (q.mode === 'perched' && q.altWait && t > showEnd + q.altWait) {
          const home = pr[q.b.home];
          q.spans.push({ type: 'still', t0: q.perchedT0, t1: t, at: q.perchedAt, yaw: q.perchedYaw, perch: q.perchedId, pose: 'stand' });
          startFlight(q, t, q.perchedAt, H.wind.up); q.altWait = 0; reserved.delete(q.perchedId);
          landOn(q, hipsAt(q.b.sp, home.p, q.b.scale), q.b.home);
        }
        if (q.mode === 'away' && t >= q.tRet) {
          q.spans.push({ type: 'still', t0: q.awayT0, t1: t, at: q.awayAt, yaw: 0, perch: -1, pose: 'away' });
          q.F = new Flyer(q.b.sp, q.R, { H }); q.F.begin(t, q.awayAt, q.awayV);
          q.mode = 'circle'; q.tRes = t + 25 + q.R() * 30;
        }
        continue;
      }
      if (q.F.t > t + 1e-6) continue;                 // (in a planned landing: busy until it ends)
      // the neighbours for separation
      const sep = [];
      const cx = Math.floor(q.F.p[0] / 4), cz = Math.floor(q.F.p[2] / 4);
      for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) { const L = grid.get(`${cx + gx},${cz + gz}`); if (L) for (const pp of L) if (pp !== q.F.p) sep.push(pp); }
      const o = { zones: live, sep };
      if (q.mode === 'climbout') {
        const d = q.climbDir, c = q.climbFrom, k = Math.max(20, (q.F.t - q.flightT0) * 12 + 20);
        // (leaving: the take-off's open way, only as high as what's along it needs (a cormorant out along the gap between
        // her hull and the pier stays low), not pushed by the stage's column, which shoved birds roosting beside it into
        // walls)
        if (q.lineTop === undefined) { let m = 0; for (let s2 = 2; s2 <= 30; s2 += 1.5) m = Math.max(m, H.top(c[0] + d[0] * s2, c[2] + d[2] * s2, 1.0)); q.lineTop = m + (q.b.sp === 'cormorant' ? 1.5 : 4); }
        seek(q.F, [c[0] + d[0] * k, q.lineTop, c[2] + d[2] * k], q.F.U * 0.8, Object.assign({}, o, { kh: 1, far: false, zones: live.filter(z => z.kind !== 'column') }));
        const gone = Math.hypot(q.F.p[0] - c[0], q.F.p[2] - c[2]);
        if ((gone > 25 && q.F.p[1] > q.lineTop - 1) || q.F.t - q.flightT0 > 15) { q.mode = q.after; q.lineTop = undefined; }
      } else if (q.mode === 'circle') {
        circle(q.F, q.ring.c, q.ring.R, q.h, q.dir, q.F.U * 0.85, o);
        if (t > q.tRes && t - lastBlast > 25 && nextLoud() - t > 20) {
          // home if it's cold now, else (during the show) a free perch nearby until it's over
          const home = q.b.home >= 0 && q.b.home !== undefined ? pr[q.b.home] : null;
          if (q.b.cls === 'visitor') { q.mode = 'rejoin'; }
          else if (home && (!home.hot || t > showEnd)) landOn(q, hipsAt(q.b.sp, home.p, q.b.scale), q.b.home);
          else { const alt = altPerch(q, home ? home.p : q.F.p); if (alt) { stats.altPerch++; landOn(q, hipsAt(q.b.sp, alt.p, q.b.scale), alt.id); } else q.tRes = t + 30; }
        }
      } else if (q.mode === 'leave') {
        // away over the water, out of the near world's sight (~450 m), then gone until after the show
        if (!q.far) { const a = q.R() * 1.6 - 0.8 + Math.atan2(-1, -0.4); q.far = [Math.cos(a) * 460 + q.F.p[0] * 0.2, 30 + q.R() * 30, Math.sin(a) * 460 + q.F.p[2] * 0.2]; stats.left++; }
        const d = seek(q.F, q.far, q.F.U, o);
        if (d < 25) {
          q.spans.push(q.F.span()); q.awayAt = q.F.p.slice(); q.awayV = q.F.v.slice(); q.awayT0 = q.F.t; q.mode = 'away';
          q.tRet = showEnd + lerp(q.S.startle.returnAfter[0], q.S.startle.returnAfter[1], q.R()); q.far = null;
          continue;
        }
      } else if (q.mode === 'rejoin') {
        // a visitor: back to its baseline at its next stay long enough to land in
        const st = newState();
        let w = null;
        for (let tt = t + 25; tt < t + LB; tt += 2) { sampleSpans(q.b.base, tt, LB, st); if (st.mode === 'still' && st.until > 30) { w = { t: tt, at: st.p.slice(), perch: st.perch, yaw: st.yaw, until: tt + st.until }; break; } }
        if (!w) { q.mode = 'circle'; q.tRes = t + 30; continue; }
        landOn(q, w.at, w.perch); q.rejoin = w;
        continue;
      } else if (q.mode === 'return') {
        const T = q.target, P0 = T.hips, u = H.wind.up;
        if (!T.h) { const ap = H.approach(P0); T.h = ap.h; T.A1 = ap.A1; T.A2 = ap.A2; T.reach = Math.max(8, ap.d1 * 1.8); }
        if (T.stage === 0) { seek(q.F, T.A2, q.F.U * 0.85, o); if (arrived(q.F, T.A2, 7)) { T.stage = 1; T.n = 0; } }
        else if (T.stage === 1) {
          seek(q.F, T.A1, q.F.U * 0.7, Object.assign({}, o, { clear: 1.2, kh: 0.6, far: false }));
          T.n++;
          const dx = P0[0] - q.F.p[0], dz = P0[2] - q.F.p[2], dd = Math.hypot(dx, dz), uu = Math.hypot(q.F.v[0], q.F.v[2]);
          let tl = null;
          if (dd < T.reach && dd > 2 && (dx * q.F.v[0] + dz * q.F.v[2]) / Math.max(dd * uu, 1e-3) > 0.6) {
            const snap = { p: q.F.p.slice(), v: q.F.v.slice(), t: q.F.t, n: q.F.keys.length, amp: q.F.amp, phase: q.F.phase, legs: q.F.legs, flare: q.F.flare, tail: q.F.tail };
            const check = (qq, u2) => u2 > 0.82 || qq[1] - H.top(qq[0], qq[2], 0.3) > 0.3;
            tl = planLanding(q.F, P0, T.h, check);
            if (tl === null) { Object.assign(q.F, { p: snap.p, v: snap.v, t: snap.t, amp: snap.amp, phase: snap.phase, legs: snap.legs, flare: snap.flare, tail: snap.tail }); q.F.keys.length = snap.n; }
          }
          if (tl === null && T.n > 900) tl = planLanding(q.F, P0, T.h, null);
          if (tl !== null) {
            q.spans.push(q.F.span());
            stats.aloft.push(+(tl - q.flightT0).toFixed(1));
            if (!q.rejoin && !(q.awayT0 > 0)) stats.resettle.push(+(tl - q.lastHeard).toFixed(1));
            const yaw = Math.atan2(T.h[2], T.h[0]);
            if (q.rejoin) {
              const tEnd = Math.min(Math.max(tl + 1.5, q.rejoin.t + 0.5), q.rejoin.until - 1);
              q.spans.push({ type: 'still', t0: tl, t1: tEnd, at: P0, yaw, yaw1: q.rejoin.yaw, perch: T.perch, pose: 'stand' });
              q.b.exc.push({ a: q.a, b: tEnd, spans: q.spans }); q.mode = 'done'; continue;
            }
            if (T.perch === q.b.home) {
              const home = pr[q.b.home], base = q.b.base[0];
              q.spans.push({ type: 'still', t0: tl, t1: tl + 1.6, at: P0, yaw, yaw1: base.yaw, perch: T.perch, pose: q.b.pose === 'dry' ? 'stand' : 'stand' });
              // (home: back on its baseline after the settle; a later blast starts a new excursion)
              q.b.exc.push({ a: q.a, b: tl + 1.6, spans: q.spans });
              q.spans = []; q.a = null; q.F = null; q.mode = 'base'; q.target = null; q.perchedAt = null;
              continue;
            }
            // an alt perch: wait there (a blast may flush it again) until the show is over
            q.mode = 'perched'; q.perchedAt = P0; q.perchedId = T.perch; q.perchedT0 = tl; q.perchedYaw = yaw; q.altWait = 20 + q.R() * 120; q.F = null;
            continue;
          }
        }
      }
      // the measures: inside a hot zone, or below what's drawn (away from its perch's take-off and landing)
      if (q.F && q.F.flying) {
        stats.flySteps++;
        const zAt = H.zoneAt(q.F.p, t), zz = q.F.t - q.flightT0 < 3.0 ? null : zAt;
        // (a bird already inside a zone when it appears, a blast's smoke round a bird near the gun, is caught, not entering)
        // (and a bird that roosted inside the stage's column, leaving it, isn't entering it: only once it has been out of
        // every zone does a step inside one count)
        if (!zAt) q.zoneOut = true;
        if (zz && (t - zz.t0 < 1.5 || !q.zoneOut)) { stats.zoneCaught = (stats.zoneCaught || 0) + 1; }
        else if (zz) { stats.zoneSteps++; if ((stats.zoneSamples = stats.zoneSamples || []).length < 40) stats.zoneSamples.push({ t: +t.toFixed(1), bird: q.b.id, mode: q.mode, p: q.F.p.map(v => +v.toFixed(1)), zone: zz.kind }); }
        const near = q.F.t - q.flightT0 < 3.0;
        const top = H.top(q.F.p[0], q.F.p[2], 0.3);
        if (!near && q.F.p[1] - top < 0.15) { stats.clearSteps++; const ck = `${q.mode}|${q.b.sp}|${pr[q.b.home] ? pr[q.b.home].kind : 'visitor'}`; (stats.clearBy = stats.clearBy || {})[ck] = (stats.clearBy[ck] || 0) + 1; if ((stats.clearSamples = stats.clearSamples || []).length < 40) stats.clearSamples.push({ t: +t.toFixed(1), bird: q.b.id, mode: q.mode, p: q.F.p.map(v => +v.toFixed(1)), top: +top.toFixed(1) }); }
      }
    }
  }
  // the perched-at-alt still spans that were left open (a bird still at an alt perch when the time ran out: shouldn't be)
  for (const q of P) if (q.mode !== 'done' && q.mode !== 'base') stats.unfinished++;
  // every excursion's flight kept clear of what's drawn (flight.js liftOver: one that clears is untouched; opts.lift
  // false leaves them as flown)
  stats.lifted = []; if (opts.lift !== false) for (const b of sim.birds) for (const e of b.exc) for (const sp of e.spans) { const m = liftOver(H, sp); if (m > 0) stats.lifted.push([b.id, +sp.t0.toFixed(1), +m.toFixed(2), sp.cleared.over, sp.cleared.aside]); }
  // the excursions' extent, the response times
  let TL = 0; for (const b of sim.birds) for (const e of b.exc) TL = Math.max(TL, e.b);
  // ---- sounds: per roost group per blast a flock's take-off (wings) with the alarm calls after it; pigeons clap
  const byGE = new Map();
  for (const f of stats.flushes) { const b = sim.birds[f.bird], g = b.home >= 0 && b.home !== undefined ? pr[b.home].group : 'visitors'; const k = `${g}|${f.ev}|${b.sp === 'pigeon' ? 'p' : b.sp === 'cormorant' ? 'c' : 'g'}`; if (!byGE.has(k)) byGE.set(k, []); byGE.get(k).push(f); }
  for (const [k, L] of byGE) {
    const b0 = sim.birds[L[0].bird], S = SPECIES[b0.sp];
    const t = Math.min(...L.map(f => f.t + f.response)), pos = [0, 0, 0];
    for (const f of L) { const p = sampleSpans(sim.birds[f.bird].base, f.t, LB, newState()).p; pos[0] += p[0] / L.length; pos[1] += p[1] / L.length; pos[2] += p[2] / L.length; }
    if (S.calls && S.calls.wings) sounds.push({ t: +t.toFixed(2), kind: b0.sp === 'pigeon' ? 'pigeon_clap' : 'flock_flush', pos: pos.map(v => +v.toFixed(1)), level: +(S.calls.wingsLevel + 10 * Math.log10(L.length)).toFixed(1), n: L.length, note: `${L.length} ${S.name}s off the ${k.split('|')[0]} roost (level: one bird's take-off, estimated, + 10 log n)` });
    if (S.calls && S.calls.alarm) for (const f of L) if (hash1(sim.birds[f.bird].key * 37 + f.ev) < 0.4) {
      const p = sampleSpans(sim.birds[f.bird].base, f.t, LB, newState()).p;
      sounds.push({ t: +(f.t + f.response + 0.2 + 3.5 * hash1(sim.birds[f.bird].key * 53 + f.ev)).toFixed(2), kind: S.calls.alarm, pos: p.map(v => +v.toFixed(1)), level: S.calls.alarmLevel, note: 'an alarm call as it flushes (estimated level)' });
    }
  }
  sounds.sort((a, b) => a.t - b.t);
  stats.ms = Math.round(performance.now() - t0w);
  stats.TL = TL;
  return { stats, sounds, TL };
}
