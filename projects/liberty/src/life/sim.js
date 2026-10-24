// liberty/src/life/sim.js: who lives at the berth, and their evening as a loop.
//
// Classes (every bird is one of them; `cls` on its record):
//   resident   roosting where it stands all evening (B4's gulls on the ridges, bollards, piles, the wharf's railing and the
//              breakwater, its pigeons on the sills and cormorants on the fender piles, taken over; and mine on the ship's
//              rails, mastheads, yards, boom heads, davits and funnel): drawn at every hour. They flush at the show's
//              blasts (startle.js)
//   visitor    gulls coming and going: perch to perch (free rails, bollards, the promenade's lamps, the water), staying
//              25-120 s; one lands on her bow rail in the pre-show (the reel's A3)
//   soarer     gulls slope-soaring in the updraft off the shed's west wall past her bow and stern, and over her port side
//              abaft the house: beats along the wall, analytic and periodic (life/render.js samples them)
//   line       brown pelicans in lines of 3-8 skimming low over the water in ground effect past her bow at dusk, each
//              copying the bird ahead's beats a beat later (a wave down the line); analytic along their routes, which
//              keep to open water (rising over what they must cross: liftProfile); measure.js solidClearance tests them
//   diver      a brown pelican circling off her port bow and plunge-diving, sitting on the water, running off it
//   commuter   cormorants flying low and straight from the fender piles out to fish (diving, surfacing) and back to dry
//              their wings
//   flock      feral pigeons wheeling over the bulkhead building at sunset, landing on its roof's edge, wheeling again
// The baseline loop is LB seconds and periodic (any scene time, before, during and after the show); the show's
// excursions (startle.js) override it where they run. Active classes are drawn by hour (species.js hours; each bird a
// fixed rank against the share): busy at sunset, settling at dusk, roosting by night.
import { rng, clamp, lerp, smooth, hash1, TAU } from 'scene3d/util.js';
import { BIRDS } from 'scene3d/kit/creature/presets.js';
import { SPECIES } from './species.js';
import { Flyer, takeoff, seek, circle, planLanding, approachLand, arrived, KCH, sampleSpans, newState, liftOver } from './flight.js';
import { VISITOR0_LEG, KEYS } from './pins.js';
// a bird's stable key: the checkpoint's index for the pinned birds (pins.js), else a hash of its id (not its place in the
// population, which shifts as perches come and go)
export function birdKey(id) { if (KEYS[id] !== undefined) return KEYS[id]; let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return 1000 + (h % 100000); }

export const LB = 600, DT = 0.1;
const norm2 = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
const hipsOf = (sp, p, scale) => [p[0], p[1] + BIRDS[SPECIES[sp].kit].standH * scale, p[2]];

// ---- a flight from a perch (or the water) to another perch, as spans: the take-off, a wander, the approach and the
// planned landing (headings tried until one is clear of what's drawn). Returns { span, t1, h } or null
export function flyBetween(H, F, t0, from, to, o = {}) {
  const sp = F.sp, R = F.R, up = H.wind.up;
  // take off the most open way near the caller's wish (outboard, upwind, away from a blast)
  const d0 = H.openDir ? H.openDir(from, o.dir || [up[0], 0, up[2]]) : (o.dir || [up[0], 0, up[2]]);
  takeoff(F, t0, from, d0);
  const zones = o.zones || null;
  // the wander: out to a point over open air, then round to the approach
  const P = to, hs = o.headings || headingsFor(H, P, o.kind);
  let h = hs[0];
  // pick the first approach heading whose straight final glide is clear
  const clearPath = (A, B, n = 12) => { for (let i = 1; i < n; i++) { const u = i / n, x = lerp(A[0], B[0], u), y = lerp(A[1], B[1], u), z = lerp(A[2], B[2], u); if (u < 0.85 && y - H.top(x, z, 0.35) < 0.35) return false; } return true; };
  for (const hh of hs) { const A = [P[0] - hh[0] * 14, P[1] + 2.2, P[2] - hh[2] * 14]; if (clearPath(A, P)) { h = hh; break; } }
  const speed = F.U * (o.speedK || 0.9);
  // climb out first (the take-off's first 1.6 s), along the open way
  while (F.t < t0 + 1.6) seek(F, [from[0] + d0[0] * 20, from[1] + 5, from[2] + d0[2] * 20], speed * 0.8, { zones, clear: 1.2, far: false });
  for (const w of o.via || []) { let g = 0; while (g++ < 3000) { seek(F, w, speed, { zones }); if (arrived(F, w, 7)) break; } }
  const tEnd = approachLand(F, H, P, h, { zones, speedK: o.speedK || 0.9 });
  return { span: F.span(), t1: tEnd, h: F.lastH || h };
}
// approach headings to try: into the wind first, then across it, for a rail the inboard-outboard ones too
function headingsFor(H, P, kind) {
  const up = H.wind.up, a0 = Math.atan2(up[2], up[0]), out = [];
  for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) out.push([Math.cos(a0 + da), 0, Math.sin(a0 + da)]);
  return out;
}

// ---- the populations ------------------------------------------------------------------------------------------------
export function simulate(H, opts = {}) {
  const t0 = performance.now(), R = rng(opts.seed || 20261031), timing = {};
  const lap = k => { timing[k] = Math.round(performance.now() - t0 - Object.values(timing).reduce((a, b) => a + b, 0)); };
  const birds = [], events = [], sounds = [];
  const P = H.P;
  const add = b => { b.i = birds.length; b.key = birdKey(KEYS[b.id] !== undefined ? b.id : (b.keySrc || b.id)); b.rank = hash1(b.key * 7919 + 17); b.seed = b.seed ?? hash1(b.key * 104729 + 3); b.exc = []; birds.push(b); return b; };
  const used = new Set();
  // ---- residents: B4's, where they stand
  for (const tb of H.taken.birds) {
    // B4's lines thinned toward site.md's "tens of gulls" (the ridges keep ~35 %, the breakwater ~50 %): the rest of its
    // birds aren't drawn (their perches stay free)
    const onRidge = tb.sp === 'gull' && tb.p[1] > 10 && tb.p[0] > 15, onBreak = tb.sp === 'gull' && tb.p[0] < -50;
    if ((onRidge && hash1(tb.perch * 7 + 3) > 0.35) || (onBreak && hash1(tb.perch * 11 + 5) > 0.5)) continue;
    let sp = tb.sp;
    if (sp === 'gull' && hash1(tb.perch * 31 + 7) < 0.12) sp = 'heermann';          // (Heermann's among the westerns, autumn)
    const scale = sp === 'gull' || sp === 'heermann' ? 0.95 + 0.1 * hash1(tb.perch * 13) : 0.94 + 0.12 * hash1(tb.perch * 17);
    const pp = H.perches[tb.perch];
    const pose = sp === 'cormorant' && hash1(tb.perch * 5 + 1) < 0.4 ? 'dry' : 'stand';
    used.add(tb.perch);
    add({ id: `${sp} ${tb.from.slice(5)} ${tb.perch}`, keySrc: `${sp}@${pp.p.map(v => Math.round(v * 2) / 2).join(',')}`, sp, cls: 'resident', src: 'pier', home: tb.perch, scale, pose,
      base: [{ type: 'still', t0: 0, t1: LB, at: hipsOf(sp, pp.p, scale), yaw: pp.yaw, perch: tb.perch, pose }] });
  }
  // ---- residents on the ship: loose lines on the rails (clusters, gaps), the mastheads and yards, a boom head or two,
  // the davits, the funnel's rim
  const shipPerch = H.perches.filter(p => p.owner === 'ship');
  const rails = shipPerch.filter(p => p.kind === 'rail').sort((a, b) => (a.side < b.side ? -1 : a.side > b.side ? 1 : a.p[2] - b.p[2]));
  const pickRails = [];
  {
    // clusters along each rail: 2-6 birds 0.8-2.4 m apart, a cluster every 12-30 m; none by the gangway's head
    const gw = P.SHIP.toWorld(P.SHIP.gangway.top.x, 10, P.SHIP.gangway.top.z)[2];
    for (const side of ['port', 'starboard']) {
      const list = rails.filter(p => p.side === side);
      let k = Math.floor(R() * 8);
      while (k < list.length) {
        const n = 2 + Math.floor(R() * 5);
        for (let j = 0; j < n && k < list.length; j++) { const pp = list[k]; if (Math.abs(pp.p[2] - gw) > 5) pickRails.push(pp); k += 1 + (R() < 0.5 ? 1 : 2); }
        k += 12 + Math.floor(R() * 20);
      }
    }
  }
  const tops = shipPerch.filter(p => p.kind === 'mast' || p.kind === 'boom').filter((p, i) => R() < 0.8);
  const davits = shipPerch.filter(p => p.kind === 'davit').filter(() => R() < 0.6);
  const funnel = shipPerch.filter(p => p.kind === 'funnel').filter((p, i) => i % 3 === 0);
  for (const pp of [...pickRails, ...tops, ...davits, ...funnel]) {
    if (used.has(pp.id)) continue;
    used.add(pp.id);
    const sp = R() < 0.15 ? 'heermann' : 'gull', scale = 0.95 + 0.1 * R();
    add({ id: `${sp} ${pp.kind} ${pp.name || pp.side || ''} ${pp.id}`.replace(/\s+/g, ' '), keySrc: `${sp}@${pp.p.map(v => Math.round(v * 2) / 2).join(',')}`, sp, cls: 'resident', src: 'ship', home: pp.id, scale, pose: 'stand',
      base: [{ type: 'still', t0: 0, t1: LB, at: hipsOf(sp, pp.p, scale), yaw: pp.yaw + (R() - 0.5) * 0.8, perch: pp.id, pose: 'stand' }] });
  }
  lap('residents');
  // ---- visitors: gulls hopping between free perches through the loop
  const free = H.perches.filter(p => !used.has(p.id) && !p.taken && (p.kind === 'rail' || p.kind === 'bollard' || p.kind === 'lamp' || p.kind === 'ridge'));
  const bowRail = free.filter(p => p.kind === 'rail' && p.p[2] < -50).sort((a, b) => a.p[2] - b.p[2]);
  const nV = opts.visitors ?? 14;
  for (let v = 0; v < nV; v++) {
    const sp = v % 7 === 3 ? 'heermann' : 'gull', Rv = rng(9100 + v), scale = 0.95 + 0.1 * Rv();
    // the perches: a start, then 3-5 hops (free perches and the water); visitor 0 lands on the bow rail at ~150 s, visitor 1
    // on the other side's bow rail at ~240 s (both inside the reel's pre-show window)
    const pick = prev => { for (let k = 0; k < 20; k++) { if (Rv() < 0.22) return { water: true, p: waterSpot(H, Rv) }; const q = free[Math.floor(Rv() * free.length)]; if (!prev || prev.perch !== q.id) return { perch: q.id, p: q.p }; } return { water: true, p: waterSpot(H, Rv) }; };
    const stops = [pick()];
    const nh = 3 + Math.floor(Rv() * 3);
    for (let i = 0; i < nh; i++) stops.push(pick(stops[stops.length - 1]));
    let forced = null;
    if (v < 2 && bowRail.length) {
      const side = v === 0 ? 'starboard' : 'port', cands = bowRail.filter(p => p.side === side);
      const q = cands[Math.floor(cands.length * (0.25 + 0.3 * Rv()))] || bowRail[0];
      forced = { stop: 2, t: v === 0 ? 150 : 240 };
      stops[2] = { perch: q.id, p: q.p, forced: true };
      // (visitor 0's landing is the reel's A3b: on the rail exactly where it landed at the checkpoint, pins.js)
      if (v === 0) { const st = BIRDS[SPECIES[sp].kit].standH * scale; stops[2].p = [VISITOR0_LEG.to[0], VISITOR0_LEG.to[1] - st, VISITOR0_LEG.to[2]]; }
    }
    const b = add({ id: `${sp} visitor ${v}`, sp, cls: 'visitor', scale, pose: 'stand', base: null });
    b.base = hopLoop(H, b, stops, Rv, forced, events);
    if (v === 0) pinLeg(b, VISITOR0_LEG);
  }
  lap('visitors');
  // ---- soarers: beats along the shed's west wall (north of her bow, south of her stern) and over her port side aft
  const sh = P.PIER.shed;
  const beats = [
    { z0: -140, z1: -82, x: sh.x0 - 6, y: sh.eave + 4.5 }, { z0: -136, z1: -88, x: sh.x0 - 10, y: sh.eave + 7.5 }, { z0: -128, z1: -80, x: sh.x0 - 4, y: sh.eave + 3.2 },
    { z0: 76, z1: 118, x: sh.x0 - 6, y: sh.eave + 4.0 }, { z0: 80, z1: 120, x: sh.x0 - 9, y: sh.eave + 6.5 },
    { z0: 18, z1: 58, x: -13.5, y: 15.5 }, { z0: 22, z1: 60, x: -16, y: 17.5 }, { z0: -142, z1: -96, x: sh.x0 - 8, y: sh.eave + 6.0 },
  ];
  for (const [j, bt] of beats.entries()) {
    const Rs = rng(7300 + j), sp = j === 4 ? 'heermann' : 'gull', S = SPECIES[sp];
    const L = 2 * (bt.z1 - bt.z0) + TAU * 9, laps = Math.max(1, Math.round(LB / (L / S.Usoar)));
    add({ id: `${sp} soaring ${j}`, sp, cls: 'soarer', scale: 0.95 + 0.1 * Rs(), base: null,
      soar: { z0: bt.z0, z1: bt.z1, x: bt.x, y: bt.y, rT: 8 + Rs() * 3, laps, ph: Rs(), dir: Rs() < 0.5 ? 1 : -1, wob: [Rs() * TAU, Rs() * TAU], f: S.f * (0.95 + 0.1 * Rs()) } });
  }
  // ---- pelican lines: routes past her bow (two inside the reel's pre-show window), each a line of 3-8 skimming. Every
  // route keeps to open water: the pier, her hull, the marina's docks and breakwater, Pier 39 and the shore are on
  // the plan (measure.js solidClearance: every bird of every line, 4 Hz, against the drawn tops and the pier's and the
  // hull's keep-outs; L.measure.solids() the same over the whole bay); where a route must cross something the line
  // rises over it (liftProfile). Line 0 is the reels' (A2, T3): its track from t 66 on is pinned, so it is mended
  // around that, not re-laid (B9's tour, 2026-10-24: its pass of the pier tip went through the deck's corner at t
  // 63.8-65.8, and after t ~85 it flew into the basin's shore and on through the city): the corner pass bent 4.5 m
  // clear (gone by s 945: its birds' t 66-68.9), and after s 1090 (t 80.8, past the tour's T3) it turns round in the
  // basin (a dead end: the shore, the marina's docks, whose masts a line can't skim among) and goes back out north
  // between the breakwater and the stage, to the bay. (Line 1, the 205 s line, went under the pier at 1.9 m: re-laid
  // round the pier tip.)
  const routes = [
    { name: 'from the bay past the pier tip and her bow, down her port side, round in the basin and back out by the breakwater', pts: [[520, -900], [260, -470], [60, -200], [-20, -110], [-48, -40], [-130, 60], [-520, 120]], tPass: 72, n: 6,
      mend: { bend: { d: 4.5, s: [840, 905, 918, 945] }, keep: 1090, tail: [[-84, 33], [-100, 32], [-111, 20], [-109, 2], [-96, -6], [-74, -6], [-56, -10], [-50, -24], [-52, -45], [-60, -90], [-72, -150], [-84, -250], [-95, -340], [-130, -460], [-260, -800], [-400, -1100]] } },
    { name: 'from off the head of Pier 39 east, round the pier tip and out', pts: [[-780, -500], [-480, -420], [-250, -375], [-110, -335], [-50, -245], [-15, -185], [30, -168], [90, -175], [150, -192], [400, -240], [900, -150]], tPass: 205, n: 5 },
    { name: 'down the breakwater from the bay, across her bow and out round the pier tip', pts: [[-300, -1100], [-170, -560], [-90, -330], [-62, -230], [-50, -180], [-43, -140], [-25, -125], [-6, -135], [2, -156], [15, -175], [50, -195], [150, -300], [300, -600], [500, -1000]], tPass: 340, n: 4 },
    { name: 'from the east round the pier tip, out toward Alcatraz', pts: [[900, -300], [400, -260], [150, -200], [40, -168], [-30, -185], [-80, -250], [-130, -390], [-300, -750], [-700, -2100]], tPass: 470, n: 7 },
  ];
  const lines = [];
  for (const [ri, rt] of routes.entries()) {
    const Rl = rng(5200 + ri), S = SPECIES.pelican;
    const path0 = smoothPath(rt.pts, 4), path = rt.mend ? mendPath(path0, rt.mend) : path0;
    // the time the leader is nearest her bow: the route's point nearest (0, -67) (a mended route's as first laid: its
    // pin)
    let best = 0, bd = 1e9; for (let i = 0; i < path0.s.length; i++) { const d = Math.hypot(path0.x[i] - 0, path0.z[i] + 67); if (d < bd) { bd = d; best = i; } }
    const U = S.U * (0.95 + 0.1 * Rl()), sPass = path0.s[best], tStart = rt.tPass - sPass / U;
    const Ltot = path.s[path.s.length - 1];
    // the leader's beats: bursts and glides (a pattern over the whole route), the followers copy it a beat later each
    // (drawn over the route as first laid, so a mended line keeps its draws; any further route from a stream of its own)
    const flaps = []; const bt = { tt: 0, ph: 0 };
    const beat = (Rb, until) => { while (bt.tt < until) { const nb = Math.round(lerp(S.flapBurst[0], S.flapBurst[1], Rb())), d = nb / S.f; flaps.push(bt.tt, bt.ph, 1); bt.tt += d; bt.ph += nb; const g = lerp(S.glideS[0], S.glideS[1], Rb()); flaps.push(bt.tt, bt.ph, 0); bt.tt += g; } };
    beat(Rl, path0.s[path0.s.length - 1] / U + 20);
    beat(rng(5300 + ri), Ltot / U + 20);
    const n = rt.n, sp = Array.from({ length: n }, () => lerp(S.spacing[0], S.spacing[1], Rl()));
    const skim = lerp(S.skimH[0], S.skimH[1], Rl()), alt = liftProfile(H, path, skim);
    const line = { route: rt.name, path, U, tStart, tPass: rt.tPass, dur: Ltot / U, flaps: alt ? climbBeats(flaps, alt, path, U, S.f) : new Float32Array(flaps), skim, alt, n };
    lines.push(line);
    let back = 0;
    for (let k = 0; k < n; k++) {
      add({ id: `pelican line ${ri}.${k}`, sp: 'pelican', cls: 'line', scale: 0.94 + 0.12 * Rl(), base: null,
        line: { li: lines.length - 1, back, lag: k * 0.42, side: (k % 2 ? 1 : -1) * (0.3 + 0.9 * Rl()) * (k > 0 ? 1 : 0), dh: (Rl() - 0.5) * 0.3 } });
      back += sp[k];
    }
    events.push({ t: +rt.tPass.toFixed(2), kind: 'pelicans_pass', n, route: rt.name, nearest: +bd.toFixed(1), at: [+path0.x[best].toFixed(1), +(line.skim).toFixed(2), +path0.z[best].toFixed(1)] });
  }
  lap('soarers, lines');
  // ---- the diver: a pelican circling off her port bow, plunging, sitting, running off the water
  {
    const Rd = rng(6600), F = new Flyer('pelican', Rd, { H });
    const b = add({ id: 'pelican diver', sp: 'pelican', cls: 'diver', scale: 1.0, base: null });
    const ev = [];
    b.base = diverLoop(H, F, Rd, ev);
    // the reel's A2 opens on its first plunge: pinned at t 67.8 by turning its loop in time (it is periodic)
    const first = ev.length ? ev[0].t : 67.8, dT = 67.8 - first;
    b.base = rotateLoop(b.base, dT);
    for (const e of ev) { e.t = +((((e.t + dT) % LB) + LB) % LB).toFixed(2); events.push(e); }
  }
  // ---- cormorant commuters: from free fender piles out over the water to fish, and back to dry
  const piles = (H.pierPiles || []).slice(0, 3);
  for (const [ci, pile] of piles.entries()) {
    const Rc = rng(8800 + ci), F = new Flyer('cormorant', Rc, { H });
    const b = add({ id: `cormorant commuter ${ci}`, sp: 'cormorant', cls: 'commuter', scale: 0.95 + 0.1 * Rc(), base: null });
    b.base = commuterLoop(H, F, Rc, pile, b.scale, events);
  }
  lap('diver, commuters');
  // ---- the pigeon flock: wheeling over the bulkhead building, landing on its roof's edge
  const spots = H.ledges || [];
  if (spots.length >= 6) flockLoop(H, birds, add, spots, events);
  lap('flock');
  // every flight kept clear of what's drawn (flight.js liftOver: a flight that clears is untouched; opts.lift false
  // leaves them as flown, to measure what it moves)
  const lifted = []; if (opts.lift !== false) for (const b of birds) for (const sp of b.base || []) { const m = liftOver(H, sp); if (m > 0) lifted.push([b.id, +sp.t0.toFixed(1), +m.toFixed(2), sp.cleared.over, sp.cleared.aside]); }
  lap('lift');
  return { birds, events, sounds, lines, timing, LB, lifted };
}

// a periodic loop turned in time by dT (-LB < dT < LB): every span shifted, then wrapped back into [0, LB) (one straddling
// the loop's end stays last, where the sampler finds it)
export function rotateLoop(spans, dT) {
  const sh = (s, d) => { if (s.type === 'fly') shiftSpan(s, d); else { s.t0 += d; s.t1 += d; } };
  for (const s of spans) {
    sh(s, dT);
    if (s.t1 <= 0 || s.t0 < 0) sh(s, LB);
    else if (s.t0 >= LB) sh(s, -LB);
  }
  return spans.sort((a, b) => a.t0 - b.t0);
}

// a spot on the open water near the berth (the slip off her port side, off the bow, the pier's tip)
function waterSpot(H, R) {
  const c = [[-28, -40], [-35, 30], [-20, -105], [-60, -160], [-45, 90]][Math.floor(R() * 5)];
  return [c[0] + (R() - 0.5) * 24, 0.06, c[1] + (R() - 0.5) * 30];
}

// ---- a visitor's loop: stays and flights round its stops, closed in LB. The baseline's flights don't depend on when they
// start (the hot zones of the show are the excursions'), so each is flown once and shifted into place; the stays absorb
// the rest, and a forced stop's landing is put at its time
export function shiftSpan(sp, dt) { const k = sp.k; for (let i = 0; i < k.length; i += KCH) k[i] += dt; sp.t0 += dt; sp.t1 += dt; return sp; }
function hopLoop(H, b, stops, R, forced, events) {
  const sp = b.sp, n = stops.length;
  const hips = s => (s.water ? [s.p[0], 0.08, s.p[2]] : hipsOf(sp, s.p, b.scale));
  // fly each leg once from t = 0
  const legs = [];
  for (let i = 0; i < n; i++) {
    const a = stops[i], c = stops[(i + 1) % n];
    const F = new Flyer(sp, rng(4100 + b.key * 31 + i), { H });
    const fl = flyBetween(H, F, 0, hips(a), hips(c), { kind: c.water ? 'water' : 'perch', dir: a.water ? H.wind.up : outward(H, a), zones: H.baseZones });
    legs.push({ span: fl.span, d: fl.t1, yawIn: Math.atan2(fl.h[2], fl.h[0]) });
  }
  const D = legs.reduce((q, l) => q + l.d, 0);
  // the stays at stops 1..n-1, and the wrap stay at stop 0 (whatever is left: at least 20 s)
  let st = Array.from({ length: n }, () => lerp(25, 120, R()));
  st[0] = 0;
  const room = LB - D - 20, sum = st.reduce((q, v) => q + v, 0);
  if (sum > room) st = st.map(v => v * room / sum);
  // the first take-off: anywhere in the loop; a forced stop's landing lands at its time
  let a0 = lerp(5, 60, R());
  if (forced) {
    const k = forced.stop;
    a0 = forced.t - legs.slice(0, k).reduce((q, l) => q + l.d, 0) - st.slice(1, k).reduce((q, v) => q + v, 0);
    a0 = ((a0 % LB) + LB) % LB;
  }
  const spans = [];
  let t = a0;
  const dep = [], land = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) t += st[i];
    dep.push(t);
    shiftSpan(legs[i].span, t);
    t += legs[i].d; land.push(t);
  }
  // spans: stop i's stay from its landing to its take-off (stop 0's wraps from the last landing round to the first take-off)
  const yawAt = i => legs[(i - 1 + n) % n].yawIn;
  for (let i = 0; i < n; i++) {
    if (i > 0) spans.push({ type: 'still', t0: land[i - 1], t1: dep[i], at: hips(stops[i]), yaw: yawAt(i), perch: stops[i].perch ?? -1, pose: stops[i].water ? 'water' : 'stand' });
    spans.push(legs[i].span);
  }
  spans.push({ type: 'still', t0: land[n - 1], t1: dep[0] + LB, at: hips(stops[0]), yaw: yawAt(0), perch: stops[0].perch ?? -1, pose: stops[0].water ? 'water' : 'stand' });
  // (the loop runs from the first take-off: spans before it in [0, a0) are the wrap stay, found by the sampler)
  // map every span into [0, LB): if the first take-off is late, the tail of the timeline runs past LB; split it there
  const out = [];
  for (const s2 of spans) {
    if (s2.t0 >= LB) { if (s2.type === 'fly') shiftSpan(s2, -LB); else { s2.t0 -= LB; s2.t1 -= LB; } out.push(s2); }
    else out.push(s2);
  }
  out.sort((x, y) => x.t0 - y.t0);
  // a fly span straddling LB stays where it is (the sampler clamps its keys); make sure the wrap still span is last
  // landings as events
  for (let i = 0; i < n; i++) {
    const s2 = stops[(i + 1) % n], pp = s2.perch !== undefined ? H.perches[s2.perch] : null, tl = ((land[i] % LB) + LB) % LB;
    events.push({ t: +tl.toFixed(2), kind: pp && pp.kind === 'rail' && pp.p[2] < -50 ? 'gull_lands_bow_rail' : 'gull_lands', bird: b.id, where: pp ? `${pp.kind}${pp.side ? ' ' + pp.side : ''}${pp.name ? ' ' + pp.name : ''}` : 'water', at: hips(s2).map(v => +v.toFixed(2)), forced: !!s2.forced });
  }
  return out;
}
// a frozen leg (pins.js) spliced into a loop: the fly span landing at its t1 replaced, the stay before it ending at its
// take-off (the same perch: checked), the stay after it facing the way it landed then
function pinLeg(b, P) {
  const i = b.base.findIndex(s => s.type === 'fly' && Math.abs(s.t1 - P.t1) < 0.05);
  const before = b.base[i - 1], after = b.base[i + 1];
  const near = (a, c) => a && c && Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]) < 0.01;
  if (i < 1 || !before || before.type !== 'still' || !near(before.at, P.from) || !after || !near(after.at, P.to)) { b.pinned = 'failed'; console.warn(`[life] ${b.id}: the pinned leg doesn't fit its loop`); return; }
  b.base[i] = { type: 'fly', t0: P.t0, t1: P.t1, k: new Float32Array(P.k), pinned: true };
  before.t1 = P.t0; after.yaw = P.yawTo; b.pinned = 'leg landing at ' + P.t1.toFixed(2);
}

// the direction to leave a perch by: outboard for a ship's rail, else into the wind
function outward(H, s) {
  const pp = s.perch !== undefined ? H.perches[s.perch] : null;
  if (pp && pp.kind === 'rail') { const sx = pp.p[0] > 0 ? 1 : -1; const u = H.wind.up; return [sx * 0.8 + u[0] * 0.3, 0, u[2] * 0.4]; }
  return H.wind.up;
}

// a smooth path through control points [x, z] (centripetal Catmull-Rom), with its arc length
export function smoothPath(pts, step) {
  const x = [], z = [], s = [];
  const n = pts.length, Pt = i => pts[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = i === 0 ? [2 * Pt(0)[0] - Pt(1)[0], 2 * Pt(0)[1] - Pt(1)[1]] : Pt(i - 1), p1 = Pt(i), p2 = Pt(i + 1), p3 = i + 2 >= n ? [2 * Pt(n - 1)[0] - Pt(n - 2)[0], 2 * Pt(n - 1)[1] - Pt(n - 2)[1]] : Pt(i + 2);
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(2, Math.ceil(L / step));
    for (let k = 0; k < m; k++) {
      const u = k / m, u2 = u * u, u3 = u2 * u;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      x.push(f(p0[0], p1[0], p2[0], p3[0])); z.push(f(p0[1], p1[1], p2[1], p3[1]));
    }
  }
  x.push(Pt(n - 1)[0]); z.push(Pt(n - 1)[1]);
  s.push(0); for (let i = 1; i < x.length; i++) s.push(s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]));
  return { x: new Float32Array(x), z: new Float32Array(z), s: new Float32Array(s) };
}
// a route mended without moving what's pinned on it: bend { d, s: [a, b, c, e] } moves its samples sideways (+ to the
// route's right, as lineAt's sides) by d, eased in over s a-b, held to c, eased out by e, their s kept (so every point
// past e is where it was, at the same time); keep, tail: past s keep the route runs on 12 m straight (its heading
// kept), then through the tail's points
export function mendPath(p, m) {
  const n = p.x.length, x = Array.from(p.x), z = Array.from(p.z), s = Array.from(p.s);
  if (m.bend) {
    const [a, b, c, e] = m.bend.s;
    for (let i = 0; i < n; i++) {
      const o = m.bend.d * smooth(a, b, s[i]) * (1 - smooth(c, e, s[i])); if (!o) continue;
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), dx = p.x[i1] - p.x[i0], dz = p.z[i1] - p.z[i0], dl = Math.hypot(dx, dz) || 1;
      x[i] += -dz / dl * o; z[i] += dx / dl * o;
    }
  }
  if (!m.keep) return { x: new Float32Array(x), z: new Float32Array(z), s: new Float32Array(s) };
  const ik = s.findIndex(v => v >= m.keep), hx = x[ik] - x[ik - 1], hz = z[ik] - z[ik - 1], hl = Math.hypot(hx, hz);
  const tp = smoothPath([[x[ik - 1], z[ik - 1]], [x[ik], z[ik]], [x[ik] + hx / hl * 12, z[ik] + hz / hl * 12], ...m.tail], 4);
  let j = 1; while (j < tp.x.length && !(tp.x[j] === Math.fround(x[ik]) && tp.z[j] === Math.fround(z[ik]))) j++;
  const X = x.slice(0, ik + 1), Z = z.slice(0, ik + 1), Sx = s.slice(0, ik + 1);
  for (let k = j + 1; k < tp.x.length; k++) { X.push(tp.x[k]); Z.push(tp.z[k]); Sx.push(Sx[Sx.length - 1] + Math.hypot(tp.x[k] - X[X.length - 2], tp.z[k] - Z[Z.length - 2])); }
  return { x: new Float32Array(X), z: new Float32Array(Z), s: new Float32Array(Sx) };
}
// the height a line keeps over its skim to clear what's under it: wherever anything is drawn within 3 m of its route
// (its birds' sides and half-spans), its lowest bird 2 m over it; climbing at most 1 in 6 before, gliding down at
// most 1 in 5 after (pelicans rise over a dock or a breakwater on a few beats and glide off it). Null over open water
export function liftProfile(H, path, skim) {
  const n = path.x.length, a = new Float32Array(n), base = skim - 0.2;
  for (let i = 0; i < n; i++) { const t = H.top(path.x[i], path.z[i], 3.0); a[i] = t > 0.05 ? Math.max(0, t + 2.0 - base) : 0; }
  if (!a.some(v => v > 0)) return null;
  for (let i = 1; i < n; i++) a[i] = Math.max(a[i], a[i - 1] - (path.s[i] - path.s[i - 1]) / 5);
  for (let i = n - 2; i >= 0; i--) a[i] = Math.max(a[i], a[i + 1] - (path.s[i + 1] - path.s[i]) / 6);
  return a;
}
// the line's height over its skim at s along its route (0 without a lift), and its climb (m per m)
export function liftAt(L, s) {
  const p = L.path, A = L.alt; if (!A) return [0, 0];
  if (s <= p.s[0]) return [A[0], 0]; const N = p.s.length; if (s >= p.s[N - 1]) return [A[N - 1], 0];
  let lo = 0, hi = N - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (p.s[m] <= s) lo = m; else hi = m - 1; }
  const ds = Math.max(1e-4, p.s[lo + 1] - p.s[lo]);
  return [A[lo] + (A[lo + 1] - A[lo]) * (s - p.s[lo]) / ds, (A[lo + 1] - A[lo]) / ds];
}
// on a climb the line flaps through: a glide over a rising stretch of the route is flown as whole beats instead (the
// pattern after it shifted to follow); glides elsewhere as drawn
function climbBeats(f, alt, path, U, fHz) {
  const L = { path, alt }, out = []; let shift = 0, extra = 0;
  for (let k = 0; k < f.length; k += 3) {
    const t = f[k] + shift, ph = f[k + 1] + extra; let fl = f[k + 2];
    if (fl < 0.5 && k + 3 < f.length) {
      const t1 = f[k + 3] + shift;
      if (liftAt(L, t1 * U)[0] - liftAt(L, t * U)[0] >= 0.3) { const nb = Math.max(1, Math.round((t1 - t) * fHz)); fl = 1; shift += nb / fHz - (t1 - t); extra += nb; }
    }
    if (fl > 0.5 && out.length && out[out.length - 1] > 0.5) continue;      // the beats run on through
    out.push(t, ph, fl);
  }
  return new Float32Array(out);
}

// ---- the diver: circling, the plunge, sitting, running off; closed in LB (the last plunge lands where the first sat)
function diverLoop(H, F, R, events) {
  const c = [-42, -92], spots = [];
  const spans = [];
  let t = 0;
  // start sitting on the water at the first spot
  const spot0 = [c[0] + (R() - 0.5) * 20, 0.12, c[1] + (R() - 0.5) * 20];
  let sit = spot0, sitT0 = 0, k = 0;
  while (true) {
    const tSit = 12 + R() * 14;                       // sitting, swallowing, the bill raised
    const tUp = sitT0 + tSit;
    // run off the water into the wind, climb to circle at 8-14 m
    const u = H.wind.up;
    F.begin(tUp, sit, [u[0] * 1.5, 0.3, u[2] * 1.5], { takeoff: true });
    const h = 8 + R() * 6, dir = R() < 0.5 ? 1 : -1, R0 = 16 + R() * 10;
    const tCirc = 40 + R() * 45;
    while (F.t < tUp + 2.2) F.step([u[0] * 7, 0.6, u[2] * 7], { flapAll: true });
    while (F.t < tUp + tCirc) circle(F, c, R0, h, dir, F.U * 0.8, { zones: H.baseZones });
    // the last plunge returns to the first spot (the loop closes); is there time for another round after this one?
    const last = F.t + 60 > LB - 40;
    const target = last ? spot0 : [c[0] + (R() - 0.5) * 30, 0.12, c[1] + (R() - 0.5) * 30];
    // line up: fly to 10 m short of the target, upwind of it, at the circle's height, then the plunge
    const ux = F.p[0] - target[0], uz = F.p[2] - target[2], dl = Math.hypot(ux, uz) || 1;
    const A = [target[0] + ux / dl * 9, h + 1.5, target[2] + uz / dl * 9];
    let g = 0; while (g++ < 800 && seek(F, A, F.U * 0.75, { zones: H.baseZones, noClear: true }) > 2) { /* lining up */ }
    // the plunge: a steep dive, the wings swept back over its last half, bill first into the water (the bird ends sitting)
    const p0 = F.p.slice(), v0 = F.v.slice(), Td = 1.15, entry = [target[0], -0.25, target[2]];
    const vEnd = [-ux / dl * 4, -10, -uz / dl * 4];
    const n = Math.ceil(Td / 0.1);
    for (let i = 1; i <= n; i++) {
      const uu = i / n, tt = F.t + Td / n;
      for (let cc = 0; cc < 3; cc++) {
        const H0 = (2 * uu ** 3 - 3 * uu ** 2 + 1), H1 = (uu ** 3 - 2 * uu ** 2 + uu) * Td, H2 = (-2 * uu ** 3 + 3 * uu ** 2), H3 = (uu ** 3 - uu ** 2) * Td;
        F.p[cc] = H0 * p0[cc] + H1 * v0[cc] + H2 * entry[cc] + H3 * vEnd[cc];
        F.v[cc] = ((6 * uu ** 2 - 6 * uu) * p0[cc] + (3 * uu ** 2 - 4 * uu + 1) * Td * v0[cc] + (-6 * uu ** 2 + 6 * uu) * entry[cc] + (3 * uu ** 2 - 2 * uu) * Td * vEnd[cc]) / Td;
      }
      F.t = tt; F.amp = Math.max(0, F.amp - 0.25); F.legs = 0; F.flare = 0; F.tail = 0.2; F.dive = uu;
      F.rec(tt);
    }
    const sp = F.span(); sp.dive = true;
    spans.push({ type: 'still', t0: sitT0, t1: tUp, at: sit, yaw: Math.atan2(u[2], u[0]), perch: -1, pose: 'water' });
    spans.push(sp);
    events.push({ t: +sp.t1.toFixed(2), kind: 'pelican_dives', at: entry.map(v => +v.toFixed(1)) });
    spots.push({ t: sp.t1, p: [target[0], target[2]] });
    sit = [target[0], 0.12, target[2]]; sitT0 = sp.t1;
    if (last || ++k > 20) break;
  }
  // the loop: the first sit began at the last plunge (minus LB)
  const first = spans[0];
  spans.shift();
  spans.push({ type: 'still', t0: sitT0, t1: first.t1 + LB, at: spot0, yaw: first.yaw, perch: -1, pose: 'water' });
  spans.ripples = spots;
  return spans;
}

// ---- a cormorant's commute: from its pile out low over the water, sitting, diving and surfacing, back to dry its wings
function commuterLoop(H, F, R, pile, scale, events) {
  const S = SPECIES.cormorant;
  const home = hipsOf('cormorant', pile, scale);
  // out to fish off the pile's open side (Pier 35's fender piles are on its east edge: out over the slip and the bay
  // north-east of it; one on its west edge would go north-west), taking off that way (B9's tour, 2026-10-24: they
  // flew north-west, through the shed)
  const side = pile[0] > (H.P.PIER.x0 + H.P.PIER.x1) / 2 ? 1 : -1;
  const out = [pile[0] + side * (120 + R() * 200), 0.1, pile[2] - 180 - R() * 160];
  const spans = [];
  const tDry0 = 60 + R() * 60;
  // dry on the pile, then out
  let t = tDry0;
  F.begin(t, home, [0.6 * side, 1.0, -0.4], { takeoff: true });
  const lowH = lerp(S.lowH[0], S.lowH[1], R());
  while (F.t < t + 1.4) F.step([6 * side, 1.2, -4]);
  let g = 0; while (g++ < 4000 && seek(F, [out[0], lowH, out[2]], F.U, { noClear: false, clear: 1.2 }) > 18) { /* out */ }
  const tl = planLanding(F, [out[0], 0.1, out[2]], (() => { const u = H.wind.up; return [u[0], 0, u[2]]; })(), null);
  spans.push({ type: 'still', t0: 0, t1: tDry0, at: home, yaw: H.yawUp, perch: -1, pose: 'dry' });
  spans.push(F.span());
  // fishing: sit, dive (hidden 20-40 s), surface 10-25 m away, sit 6-15 s; three dives
  let p = out.slice(), tt = tl;
  const dives = [];
  for (let d = 0; d < 3; d++) {
    const sit = 6 + R() * 10;
    spans.push({ type: 'still', t0: tt, t1: tt + sit, at: [p[0], 0.08, p[2]], yaw: H.yawUp + (R() - 0.5), perch: -1, pose: 'water' });
    tt += sit; dives.push({ t: tt, p: p.slice(), kind: 'dive' });
    const under = 20 + R() * 20, a = R() * TAU, dd = 10 + R() * 15;
    spans.push({ type: 'still', t0: tt, t1: tt + under, at: [p[0], -1.2, p[2]], yaw: a, perch: -1, pose: 'under' });
    tt += under; p = [p[0] + Math.cos(a) * dd, 0, p[2] + Math.sin(a) * dd]; dives.push({ t: tt, p: p.slice(), kind: 'surface' });
  }
  const sit = 5 + R() * 6;
  spans.push({ type: 'still', t0: tt, t1: tt + sit, at: [p[0], 0.08, p[2]], yaw: H.yawUp, perch: -1, pose: 'water' });
  tt += sit;
  // back: the pattering take-off, low over the water, up to the pile
  const F2 = new Flyer('cormorant', R, { H });
  const fl = flyBetween(H, F2, tt, [p[0], 0.08, p[2]], home, { dir: H.wind.up, speedK: 1.0 });
  spans.push(fl.span);
  const tBack = fl.t1;
  // the rest of the loop on the pile, drying (the first span's stay continues it round the wrap)
  spans.push({ type: 'still', t0: tBack, t1: LB, at: home, yaw: Math.atan2(fl.h[2], fl.h[0]), perch: -1, pose: 'dry' });
  spans.dives = dives;
  events.push({ t: +tl.toFixed(2), kind: 'cormorant_out', at: out.map(v => +v.toFixed(1)) });
  return spans;
}

// ---- the pigeon flock: perched on the bulkhead's roof edge, wheeling as one over the building, landing again; closed
function flockLoop(H, birds, add, spots, events) {
  const n = Math.min(22, spots.length), S = SPECIES.pigeon, R = rng(4400);
  const c = H.flockCentre || [40, 118], Rw = 34;
  const members = [];
  for (let i = 0; i < n; i++) members.push(add({ id: `pigeon flock ${i}`, sp: 'pigeon', cls: 'flock', scale: 0.92 + 0.16 * R(), base: [], spot: spots[i] }));
  // the cycle: perched d, all off within 0.8 s, wheel 45-80 s (3-4 laps), land, repeat; three cycles in the loop
  const plan = []; let t = 30 + R() * 30;
  while (t < LB - 150) { const w = 45 + R() * 35; plan.push({ up: t, wheel: w }); t += w + 25 + 60 + R() * 70; }
  const lead = (tt, h0) => {                                   // the flock's leader: a wobbling circle over the building
    const a = tt * S.U * 0.85 / Rw;
    return [c[0] + Math.cos(a) * Rw * (1 + 0.15 * Math.sin(a * 0.37)), h0 + 4 * Math.sin(a * 0.53), c[1] + Math.sin(a) * Rw * (1 + 0.12 * Math.cos(a * 0.29))];
  };
  const states = members.map((m, i) => ({ m, spans: [], F: null, lastT: 0, off: [(R() - 0.5) * 9, (R() - 0.5) * 4, (R() - 0.5) * 9] }));
  for (const cy of plan) {
    const h0 = 22 + R() * 8;
    // off: each from its spot, a fraction of a second apart (the claps), into the circle
    for (const s of states) {
      const hp = hipsOf('pigeon', s.m.spot.p, s.m.scale), tUp = cy.up + R() * 0.8;
      s.spans.push({ type: 'still', t0: s.lastT, t1: tUp, at: hp, yaw: s.m.spot.yaw, perch: -1, pose: 'stand' });
      s.F = new Flyer('pigeon', rng(4500 + s.m.key), { H });
      takeoff(s.F, tUp, hp, [Math.cos(s.m.spot.yaw), 0, Math.sin(s.m.spot.yaw)]);
      s.hp = hp;
    }
    // wheel together: each seeks the leader's point a little ahead plus its own offset, separated from its neighbours
    const tEnd = cy.up + cy.wheel;
    for (let tt = cy.up; tt < tEnd; tt += DT) {
      const pos = states.map(s => s.F.p.slice());
      for (const s of states) {
        if (s.F.t > tt + 1e-6) continue;
        const L = lead(s.F.t + 1.2, h0);
        seek(s.F, [L[0] + s.off[0], L[1] + s.off[1], L[2] + s.off[2]], S.U * 0.95, { zones: H.baseZones, sep: pos.filter(q => q !== s.F.p), kh: 0.5 });
      }
    }
    // home: each lands on its own spot
    for (const s of states) {
      const sp = s.m.spot, yaw = sp.yaw, hd = [Math.cos(yaw), 0, Math.sin(yaw)];
      let g = 0; const A = [s.hp[0] - hd[0] * 10, s.hp[1] + 3, s.hp[2] - hd[2] * 10];
      while (g++ < 900 && seek(s.F, A, S.U * 0.7, { zones: H.baseZones, clear: 0.8, kh: 0.6 }) > 2) { /* to the approach */ }
      planLanding(s.F, s.hp, hd, null);
      s.spans.push(s.F.span()); s.lastT = s.F.t;
    }
    events.push({ t: +cy.up.toFixed(2), kind: 'pigeons_wheel', n: states.length, at: c });
  }
  // the loop closes: the last stay runs round the wrap into the first
  for (const s of states) {
    const first = s.spans[0];
    s.spans.shift();
    s.spans.push({ type: 'still', t0: s.lastT, t1: first.t1 + LB, at: s.hp || hipsOf('pigeon', s.m.spot.p, s.m.scale), yaw: s.m.spot.yaw, perch: -1, pose: 'stand' });
    s.m.base = s.spans;
  }
}
