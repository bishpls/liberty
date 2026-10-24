// liberty/src/stage/pyro.js: the pyrotechnics and special effects on the show's cues (show.md §4, P1-P10; style.md §6
// E1-E9), each a pure function of t evaluated from its events (no state: a spark's birth, path, life and heat come
// from its slot, its rebirth count and the event's seed):
//   gerbs      'gerb' { dur, line: 'rail' | 'mast' }: fountains to their rated height (P4: 15 ft for an 8 s, 20 ft for a
//              15 s), sparks under drag and gravity, the grey smoke they leave drifting downwind (P9: 5-20 s)
//   sparks     'spark' { dur }: the cold-spark machines on the lip (P6: 3 m, a 0.4 s rise to full height, P10)
//   comets     'comet' { n }: stars to 15 m (P5: 6-18 m) with their trails of sparks and smoke
//   flames     'flame' { n, dur }: propane tongues to 4 m (P1), short bursts a fireball that detaches and rises at
//              3-4 m/s; flat-toned lumps (E1, E2)
//   co2        'co2' { dur }: white columns to 10 m (P7: 8-12 m) that hang 3-5 s
//   mortars    'mortar' { at, n }: a one-frame flash, a white-grey puff 2-3 m that hangs 3-8 s, the shock ring (P8, E7)
//   confetti   'confetti': two cannons, paper to ~16 m, fluttering down for 10-15 s and carried ENE on the wind
// Each effect also gives its sounds (positions, levels: show.md §1.4) and its light (transient spots).
import { DARK } from './cues.js';
const G = 9.81;
const hash = (a, b = 0, c = 0, d = 0) => { let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791) ^ Math.imul(d | 0, 2654435761); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
export { hash };
const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// a particle under linear drag k toward a terminal velocity vt (wind plus gravity's settling): exact
//   p(tau) = p0 + vt tau + (v0 - vt)(1 - e^-k tau) / k        v(tau) = vt + (v0 - vt) e^-k tau
export function ballistic(p0, v0, vt, k, tau, out = [0, 0, 0], vout = null) {
  const e = Math.exp(-k * tau), f = (1 - e) / k;
  for (let i = 0; i < 3; i++) { out[i] = p0[i] + vt[i] * tau + (v0[i] - vt[i]) * f; if (vout) vout[i] = vt[i] + (v0[i] - vt[i]) * e; }
  return out;
}
// the launch speed that tops out at height H under drag k (bisection on the exact apex)
export function launchFor(H, k, vt = -G / k) {
  const apex = v0 => { const ta = Math.log((v0 - vt) / -vt) / k; return vt * ta + (v0 - vt) * (1 - Math.exp(-k * ta)) / k; };
  let lo = 0.1, hi = 400; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (apex(m) < H) lo = m; else hi = m; } return (lo + hi) / 2;
}
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
// a direction within a cone of half-angle a (rad) round d, from two uniforms
function cone(d, a, u1, u2) {
  const ct = 1 - u1 * (1 - Math.cos(a)), st = Math.sqrt(1 - ct * ct), ph = u2 * Math.PI * 2;
  let ux = Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  let s = [d[1] * ux[2] - d[2] * ux[1], d[2] * ux[0] - d[0] * ux[2], d[0] * ux[1] - d[1] * ux[0]]; s = nrm(s);
  const u = [d[1] * s[2] - d[2] * s[1], d[2] * s[0] - d[0] * s[2], d[0] * s[1] - d[1] * s[0]];
  return [d[0] * ct + (s[0] * Math.cos(ph) + u[0] * Math.sin(ph)) * st, d[1] * ct + (s[1] * Math.cos(ph) + u[1] * Math.sin(ph)) * st, d[2] * ct + (s[2] * Math.cos(ph) + u[2] * Math.sin(ph)) * st];
}
export { cone };

// ---- the effects' specifications (show.md's numbers, the choices where they give a range)
// The fountains' density (the director on the second cut at 1:03: 'fire streams are relatively low-quality / detail
// effects work compared to the rest'): a cold-spark machine burns 15-30 g of granules a minute (Procom SPARK ONE 15-20,
// Showven Sparkular 25, UKING 30: datasheets), thousands of sparks a second; the first pass threw 170 a second and read as
// a few sticks. ?pyro=v0 is the first cut's fountains (rates, spread, heat, sizes) for A/Bs
const qp = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
const PV0 = qp.get('pyro') === 'v0', NOSPARKS = qp.get('nosparks') === '1';   // (?nosparks=1: the fountains' cores go with their sparks)
export const SPEC = {
  gerb: { rail: PV0 ? { H: 15 * 0.3048, rate: 110, life: [1.0, 1.7], spread: 7, k: 1.5, w: 0.022, src: 'P4' }
                    : { H: 15 * 0.3048, rate: 650, life: [1.0, 1.8], spread: 9, k: 1.5, w: 0.016, heat: 1.0, cool: 1.3, core: 1.0, src: 'P4: Le Maitre long-duration gerb, burn (s) / height (ft): 8/15' },
          mast: PV0 ? { H: 20 * 0.3048, rate: 120, life: [1.1, 1.9], spread: 9, k: 1.4, w: 0.024, src: 'P4' }
                    : { H: 20 * 0.3048, rate: 700, life: [1.1, 2.0], spread: 10, k: 1.4, w: 0.018, heat: 1.0, cool: 1.3, core: 1.2, src: 'P4: 15/20' }, rise: 0.12, tail: 0.6, smoke: { every: 0.3, life: [6, 11] } },
  spark: PV0 ? { H: 3.0, rate: 170, life: [0.7, 1.3], spread: 4, k: 2.2, w: 0.012, rise: 0.4, src: 'P6' }
             : { H: 3.0, rate: 750, life: [0.8, 1.5], spread: 7, k: 2.2, w: 0.010, rise: 0.4, heat: 1.0, cool: 2.5, core: 0.7, src: 'P6: Sparkular-class cold spark, 1-5 m; P10: 200-500 ms to full height; 15-30 g/min of granules (datasheets)' },
  comet: { H: 15.0, k: 0.32, trail: PV0 ? 70 : 260, life: [0.45, 0.9], src: 'P5: Le Maitre comets 20-60 ft (6-18 m); 50 ft here' },
  flame: { H: 4.0, rate: 42, v0: 7.6, k: 3.6, buoy: 2.2, life: [0.38, 0.52], r0: 0.2, grow: 0.62, src: 'P1: Salamander 4 m one unit; 0.5-1 s bursts a fireball, longer a tongue; buoyant rise 3-4 m/s' },
  co2: { H: 10.0, rate: 26, k: 2.6, life: [2.5, 3.9], src: 'P7: FreezeJet 30-40 ft (9-12 m) column, MagicFX ~8 m; 1-2 s bursts; hangs 3-5 s' },
  mortar: { flash: 1.9 / 24, puff: [0.4, 0.72], life: [4.5, 7.5], src: 'P8: a 1-2 frame flash, a white-grey ball 2-3 m hanging 3-8 s; 7.6 m from an audience' },
  confetti: { n: 1600, H: 12, k: 2.0, fall: 1.6, src: 'show.md 4.2: launch 10-20 m, hang 8-15 s in still air, sheared in wind; tissue paper flutters down at ~1-2 m/s' },
};
// the lead each kind's command runs ahead of its visible effect (P10, P3): the show's event time is when it is seen
export const LEAD = { gerb: 0.2, spark: 0.35, comet: 0.2, flame: 0.1, co2: 0.075, mortar: 0.04, confetti: 0.15 };

// the confetti: each piece's launch velocity (cannon c, piece i)
function confettiV0(c, i) {
  const v0 = launchFor(SPEC.confetti.H, SPEC.confetti.k, -SPEC.confetti.fall), d = cone(nrm(c.dir), 0.32, hash(77, i, 1), hash(77, i, 2)), sp = v0 * (0.55 + 0.45 * hash(77, i, 3));
  return [d[0] * sp, d[1] * sp, d[2] * sp];
}
// where each piece comes down (the ship's decks and houses, the pier, the water), found once along its path: after that
// it lies there, flat, for the rest of the night (the show's litter). What it lands on: the stoppers (what the beams land
// on: the decks, the houses, the shed's roofs; a downward ray on a 0.5 m grid, cached), else the ground's height.
// -> { tl: Float32Array (landing time a piece), xz: Float32Array }: plain data, for the bake cache (index.js)
export function confettiLanding(L, ctx, S, wind) {
  const T = window.THREE, hull = ctx.mods.hull && !ctx.mods.hull.failed ? ctx.mods.hull : null;
  const ray = new T.Raycaster(), cacheTop = new Map(), dn = new T.Vector3(0, -1, 0), o3 = new T.Vector3();
  ray.layers.enableAll();
  const topOf = (x, z) => {
    const key = Math.round(x * 2) + ',' + Math.round(z * 2);
    if (cacheTop.has(key)) return cacheTop.get(key);
    o3.set(Math.round(x * 2) / 2, 80, Math.round(z * 2) / 2); ray.set(o3, dn); ray.far = 120;
    const hit = S.stoppers.length ? ray.intersectObjects(S.stoppers, false)[0] : null;
    const y = hit ? hit.point.y : -1e9; cacheTop.set(key, y); return y;
  };
  const groundAt = (x, z) => { const h = hull && hull.topAt ? hull.topAt(x, z) : null, g = h !== null && h !== undefined ? h : ctx.heightAt ? ctx.heightAt(x, z) : 0; return Math.max(g, topOf(x, z)); };
  const CK = SPEC.confetti.k, vt = [wind[0] * 0.95, -SPEC.confetti.fall, wind[2] * 0.95], n = SPEC.confetti.n * L.confetti.length;
  const tl = new Float32Array(n), xz = new Float32Array(n * 2), p = [0, 0, 0];
  L.confetti.forEach((c, ci) => {
    for (let j = 0; j < SPEC.confetti.n; j++) {
      const i = ci * SPEC.confetti.n + j, vv = confettiV0(c, i);
      let t = 60;
      for (let a = 0.4; a < 60; a += 0.08) { ballistic(c.pos, vv, vt, CK, a, p); if (p[1] <= groundAt(p[0], p[2]) + 0.01) { t = a; break; } }
      tl[i] = t; xz[i * 2] = p[0]; xz[i * 2 + 1] = p[2];
    }
  });
  return { tl, xz };
}
// the wind the effects drift on (P.WATER.wind: from 245 deg at 3.4 m/s), world velocity
export function windOf(P) { const W = P.WATER.wind, wd = P.atBearing(W.from + 180, 1); return [wd[0] * W.speed, 0, wd[1] * W.speed]; }

export function makePyro(world, L, ctx, F0, landing = null) {
  let F = F0;                                 // where the effects draw: the renderers, or a measure's probe
  const show = ctx.show, P = ctx.P, W = P.WATER.wind, wd = P.atBearing(W.from + 180, 1);
  const wind = [wd[0] * W.speed, 0, wd[1] * W.speed];
  const out = { sounds: [], measures: {} };
  const ev = k => show.events(k);
  const p3 = [0, 0, 0], v3 = [0, 0, 0];

  // ---- a fountain of sparks (gerbs, cold sparks): emission at 'rate' per second over [t0, t1], each slot reborn
  function fountain(id, pos, dir, t0, t1, S, t, heatMax = 1, ramp = 0.12, maxH = null) {
    if (t < t0 || t > t1 + S.life[1]) return 0;
    const R = S.rate, N = Math.ceil(R * S.life[1]) + 1, per = N / R, vt = [wind[0] * 0.25, -G / S.k, wind[2] * 0.25];
    const v0 = launchFor(S.H, S.k);
    let n = 0, top = 0;
    for (let j = 0; j < N; j++) {
      const off = (j + hash(id, j, 1)) / R, kk = Math.floor((t - t0 - off) / per);
      if (kk < 0) continue;
      const b = t0 + off + kk * per;
      if (b > t1) continue;
      const life = S.life[0] + (S.life[1] - S.life[0]) * hash(id, j, kk, 2), age = t - b;
      if (age < 0 || age > life) continue;
      // the column grows to full height over the ramp (P10): early sparks leave slower
      const ru = smooth(0, ramp, b - t0), tail = 1 - smooth(t1 - 0.5, t1, b) * 0.4;
      const d = cone(dir, S.spread * Math.PI / 180, hash(id, j, kk, 3), hash(id, j, kk, 4));
      const h5 = hash(id, j, kk, 5), sp = v0 * (0.7 + 0.3 * ru) * tail * (PV0 ? 0.8 + 0.2 * h5 : 0.635 + 0.365 * h5);   // (the fastest at the spec's height)
      ballistic(pos, [d[0] * sp, d[1] * sp, d[2] * sp], vt, S.k, age, p3, v3);
      // (heat cools with age: white-gold at the nozzle, gold, orange, a red ember as it falls; each spark its own size.
      // 'cool' > 1 holds the heat longer: a cold spark stays white-gold to near its end (refs: wedding and gig video))
      const heat = PV0 || !S.cool ? heatMax * (1 - age / life) ** 0.7 : heatMax * (1 - (age / life) ** S.cool);
      F.spark(p3, v3, PV0 ? S.w : S.w * (0.6 + 0.8 * hash(id, j, kk, 6)), heat);
      n++; if (p3[1] - pos[1] > top) top = p3[1] - pos[1];
    }
    // the core: the dense white-gold column at the nozzle (refs: a flowerpot's and a stage gerb's base burns near white;
    // the sparks there are too fast and too close to read apart): a hot point and a soft column over its lowest third
    if (!PV0 && !NOSPARKS && S.core && t >= t0 && t <= t1) {
      const u = smooth(0, ramp, t - t0) * (1 - smooth(t1 - 0.3, t1, t)), H = S.H * S.core, fl = 0.9 + 0.1 * Math.sin(t * 41 + id);
      // (narrow, as the refs' cores are: a line of light a few percent of H across, not a ball)
      F.glow([pos[0] + dir[0] * 0.06, pos[1] + dir[1] * 0.06, pos[2] + dir[2] * 0.06], 0.07 * H, [3.0 * u * fl, 2.6 * u * fl, 1.8 * u * fl]);
      for (let c = 1; c <= 4; c++) { const h = c * 0.075 * H, k = (1 - c * 0.18) * u * fl; F.glow([pos[0] + dir[0] * h, pos[1] + dir[1] * h, pos[2] + dir[2] * h], (0.05 + 0.015 * c) * H, [1.3 * k, 1.05 * k, 0.6 * k]); }
    }
    return top;
  }
  // ---- the smoke a burning gerb leaves: grey lobes rising off the plume and drifting downwind
  function gerbSmoke(id, pos, t0, t1, t, H) {
    const every = SPEC.gerb.smoke.every;
    for (let b = t0 + every * hash(id, 9); b <= Math.min(t, t1); b += every) {
      const k = Math.round((b - t0) / every), life = SPEC.gerb.smoke.life[0] + (SPEC.gerb.smoke.life[1] - SPEC.gerb.smoke.life[0]) * hash(id, k, 7), age = t - b;
      if (age < 0 || age > life) continue;
      // a plume, not a chain: lobes close together, each its own size and its own wander off the wind's line, the tail
      // thinning early (P9: gerbs' pale grey drifts 5-20 s)
      const v0 = [(hash(id, k, 11) - 0.5) * 1.2, 2.2, (hash(id, k, 12) - 0.5) * 1.2], vt = [wind[0] * (0.8 + 0.2 * hash(id, k, 13)), 0.4 + 0.3 * hash(id, k, 14), wind[2] * (0.8 + 0.2 * hash(id, k, 13))];
      ballistic([pos[0], pos[1] + H * 0.8, pos[2]], v0, vt, 0.6, age, p3);
      const r = (0.25 + 1.15 * (1 - Math.exp(-age / 3.0))) * (0.6 + 0.7 * hash(id, k, 10));
      F.smoke(p3, r, 4, hash(id, k, 8), smooth(life * 0.2, life, age), 0);
    }
  }

  // gerbs
  const gerbs = ev('gerb');
  out.measures.gerbs = { events: gerbs.length, spec: { rail: SPEC.gerb.rail.H, mast: SPEC.gerb.mast.H }, src: SPEC.gerb.rail.src };
  const gerbList = e => (e.line === 'mast' ? L.gerbs.mast : L.gerbs.rail);
  // cold sparks
  const sparkEv = ev('spark');
  // comets
  const comets = ev('comet');
  const cometV0 = launchFor(SPEC.comet.H, SPEC.comet.k);
  // flames
  const flames = ev('flame');
  // co2
  const co2 = ev('co2');
  // mortars
  const mortars = ev('mortar');
  const mortarAt = (e, k) => { const list = L.mortars[e.at || 'port'] || L.mortars.port; return list[k % list.length].pos; };
  // confetti
  const conf = ev('confetti');

  // the lights the effects throw (transient spots, point sources: 180 deg), one per effect group. (The denser fountains
  // burn more: their lights up 1.3-2x, measured on the deck at the machines' feet: board/stage/pyro.html)
  const lightState = { gerbF: 0, gerbA: 0, flameF: 0, flameA: 0, spark: 0, mortar: null, mast: 0 };
  const S = world.stage;
  const flameFwd = L.flames.filter(f => f.pos[2] < L.deck.z0), flameAft = L.flames.filter(f => f.pos[2] >= L.deck.z0);
  const cen = list => { const c = [0, 0, 0]; for (const f of list) for (let i = 0; i < 3; i++) c[i] += f.pos[i] / list.length; return c; };
  const railF = L.gerbs.rail.filter(g => g.pos[2] < -30), railA = L.gerbs.rail.filter(g => g.pos[2] >= -30);
  const lights = [
    { name: 'flames fwd', pos: () => { const c = cen(flameFwd); return [c[0], c[1] + 2.0, c[2]]; }, col: [1, 0.5, 0.16], I: () => lightState.flameF * 0.35 },
    { name: 'flames aft', pos: () => { const c = cen(flameAft); return [c[0], c[1] + 2.0, c[2]]; }, col: [1, 0.5, 0.16], I: () => lightState.flameA * 0.35 },
    { name: 'gerbs fwd', pos: () => { const c = cen(railF); return [c[0], c[1] + 2.5, c[2]]; }, col: [1, 0.78, 0.45], I: () => lightState.gerbF * (PV0 ? 0.12 : 0.18) },
    { name: 'gerbs aft', pos: () => { const c = cen(railA); return [c[0], c[1] + 2.5, c[2]]; }, col: [1, 0.78, 0.45], I: () => lightState.gerbA * (PV0 ? 0.12 : 0.18) },
    { name: 'cold sparks', pos: () => [L.lip, L.F + 1.4, L.deck.zc], col: [1, 0.85, 0.6], I: () => lightState.spark * (PV0 ? 0.05 : 0.10) },
    { name: 'mortar', pos: () => (lightState.mortar ? lightState.mortar.p : [0, 0, 0]), col: [1, 0.86, 0.66], I: () => (lightState.mortar ? lightState.mortar.I : 0) },
    { name: 'mast gerbs', pos: () => [0, L.crosstree.fore.y + 2.5, (L.crosstree.fore.z + L.crosstree.main.z) / 2], col: [1, 0.8, 0.5], I: () => lightState.mast * (PV0 ? 0.25 : 0.32) },
  ];
  // the lights' states, a pure function of t (the engine reads spot states before this module's frame update)
  const lc = { t: NaN };
  const lightsAt = t => {
    if (t === lc.t) return; lc.t = t;
    for (const k of Object.keys(lightState)) lightState[k] = k === 'mortar' ? null : 0;
    for (const e of gerbs) { const dur = e.dur || 8; if (t < e.t || t > e.t + dur) continue; const fl = 0.85 + 0.15 * Math.sin(t * 37 + e.i);
      if (e.line === 'mast') lightState.mast = fl; else { lightState.gerbF = fl; lightState.gerbA = fl; } }
    for (const e of sparkEv) if (t >= e.t && t <= e.t + (e.dur || 10)) lightState.spark = smooth(0, SPEC.spark.rise, t - e.t);
    for (const e of flames) {
      const dur = e.dur || 0.5, a = t - e.t; if (a < 0 || a > dur + 0.9) continue;
      const k = Math.min(1, a / 0.08) * (a <= dur ? 1 : Math.exp(-(a - dur) / 0.3));
      const used = L.flames.slice().sort((x, y) => Math.abs(x.pos[2] - L.deck.zc) - Math.abs(y.pos[2] - L.deck.zc)).slice(0, Math.min(e.n || 8, L.flames.length));
      if (used.some(u => u.pos[2] < L.deck.z0)) lightState.flameF = Math.max(lightState.flameF, k);
      if (used.some(u => u.pos[2] >= L.deck.z0)) lightState.flameA = Math.max(lightState.flameA, k);
    }
    for (const e of mortars) { const a = t - e.t; if (a < 0 || a >= SPEC.mortar.flash) continue; const p = mortarAt(e, 0), f = a / SPEC.mortar.flash;
      const I = 1.6 * (1 - f * 0.5); if (!lightState.mortar || I > lightState.mortar.I) lightState.mortar = { p: [p[0], p[1] + 1.2, p[2]], I }; }
  };
  for (const l of lights) S.spot({ name: 'pyro light ' + l.name, state: t => { lightsAt(t); return { pos: l.pos(), dir: [0, 1, 0], color: l.col, intensity: DARK ? 0 : l.I(), angle: 180, range: 40, srcR: 0.6 }; } });

  // ---- the frame: one function a kind (an event at t), so a measure can draw one event alone into a probe
  const K = {};
  K.gerb = (e, t) => {
      const dur = e.dur || 8, S2 = SPEC.gerb[e.line === 'mast' ? 'mast' : 'rail'];
      if (t < e.t || t > e.t + dur + 13) return;
      gerbList(e).forEach((g, k) => {
        const id = e.i * 64 + k;
        const on = t <= e.t + dur ? 1 : 0;
        if (t <= e.t + dur + S2.life[1]) fountain(id, g.pos, nrm(g.dir), e.t, e.t + dur, S2, t, 1, SPEC.gerb.rise);
        gerbSmoke(id, g.pos, e.t, e.t + dur, t, S2.H);
        // the fountain's own little fire at the nozzle (a hot dot that blooms)
        if (on) { F.glow([g.pos[0], g.pos[1] + 0.3, g.pos[2]], 1.4, [0.9, 0.55, 0.2]); }
      });
  };
  // cold sparks: pale (they burn cooler: no white-hot core), no smoke
  K.spark = (e, t) => {
      const dur = e.dur || 10;
      if (t < e.t || t > e.t + dur + 1.5) return;
      L.sparks.forEach((m, k) => fountain(5000 + e.i * 16 + k, m.pos, [0.03, 1, 0], e.t, e.t + dur, SPEC.spark, t, SPEC.spark.heat || 0.78, SPEC.spark.rise));
  };
  // comets: a star rising on drag, burning out near its apex, its trail of sparks and a thin smoke line
  K.comet = (e, t) => {
      const n = Math.min(e.n || L.comets.length, L.comets.length);
      if (t < e.t || t > e.t + 9) return;
      for (let k = 0; k < n; k++) {
        const c = L.comets[k], d = nrm(c.dir), id = 9000 + e.i * 16 + k;
        const vt = [wind[0] * 0.15, -G / SPEC.comet.k, wind[2] * 0.15];
        const tb = Math.log((cometV0 - vt[1]) / -vt[1]) / SPEC.comet.k * 0.97, age = t - e.t;
        const v0 = [d[0] * cometV0, d[1] * cometV0, d[2] * cometV0];
        if (age <= tb) {
          ballistic(c.pos, v0, vt, SPEC.comet.k, age, p3, v3);
          const fade = 1 - smooth(tb * 0.8, tb, age);
          F.fire(p3, 0.22 + 0.06 * Math.sin(age * 60 + k), 0.96 * fade + 0.03, hash(id, Math.floor(age * 24)), 1, 1);
          F.glow(p3, 2.2, [1.4 * fade, 0.8 * fade, 0.3 * fade]);
        }
        // the trail: sparks shed from the star's path, each falling from where it left
        const R = SPEC.comet.trail;
        for (let j = 0; j < Math.min(age, tb) * R; j++) {
          const b = j / R, life = SPEC.comet.life[0] + (SPEC.comet.life[1] - SPEC.comet.life[0]) * hash(id, j, 3), a2 = age - b;
          if (a2 > life) continue;
          ballistic(c.pos, v0, vt, SPEC.comet.k, b, p3, v3);
          const q = [p3[0], p3[1], p3[2]], dv = cone([0, -1, 0], 1.2, hash(id, j, 4), hash(id, j, 5));
          ballistic(q, [dv[0] * 2 + v3[0] * 0.2, dv[1] * 2 + v3[1] * 0.2, dv[2] * 2 + v3[2] * 0.2], [wind[0] * 0.3, -2.5, wind[2] * 0.3], 2.5, a2, p3, v3);
          // (a comet's trail is glitter, dense along the path: 260 a second, each its own size; the first pass shed 70)
          F.spark(p3, v3, PV0 ? 0.018 : 0.01 + 0.014 * hash(id, j, 6), PV0 ? (1 - a2 / life) * 0.9 : 0.95 * (1 - (a2 / life) ** 1.5));
        }
        // the smoke line: small grey lobes left along the path every 0.12 s, widening and eroding over 6 s
        for (let b = 0.05; b < Math.min(age, tb); b += 0.12) {
          const a2 = age - b; if (a2 > 6.5) continue;
          ballistic(c.pos, v0, vt, SPEC.comet.k, b, p3);
          const q = [p3[0] + wind[0] * a2 * 0.8, p3[1] + 0.2 * a2, p3[2] + wind[2] * a2 * 0.8];
          F.smoke(q, 0.16 + 0.35 * (1 - Math.exp(-a2 / 2)), 4, hash(id, Math.round(b * 100), 6), smooth(1.5, 6.5, a2), 0);
        }
      }
  };
  // flames: lumps from the nozzle while the valve is open, decelerating into a buoyant rise, cooling through the ramp
  const FS = SPEC.flame;
  K.flame = (e, t) => {
      const n = Math.min(e.n || 8, L.flames.length), dur = e.dur || 0.5;
      if (t < e.t || t > e.t + dur + FS.life[1] + 1.2) return;
      // which units: the inner ones first (nearest the stage)
      const order = L.flames.slice().sort((a, b) => Math.abs(a.pos[2] - L.deck.zc) - Math.abs(b.pos[2] - L.deck.zc)).slice(0, n);
      order.forEach((u, k) => {
        const id = 20000 + e.i * 16 + u.k, nl = Math.ceil(dur * FS.rate);
        let live = 0;
        for (let j = 0; j < nl; j++) {
          const b = e.t + (j + hash(id, j)) / FS.rate; if (b > e.t + dur) break;
          const life = FS.life[0] + (FS.life[1] - FS.life[0]) * hash(id, j, 2), age = t - b;
          // the last lumps of a short burst live longer: the fireball that detaches and rises
          const detach = j >= nl - 4 ? 1.8 : 1, L2 = life * detach;
          if (age < 0 || age > L2) continue;
          const d = cone([0, 1, 0], 0.08, hash(id, j, 3), hash(id, j, 4)), v0 = [d[0] * FS.v0, d[1] * FS.v0, d[2] * FS.v0];
          ballistic(u.pos, v0, [wind[0] * 0.6, FS.buoy, wind[2] * 0.6], FS.k, age, p3);
          const f = age / L2, r = FS.r0 + FS.grow * Math.sqrt(age) * (0.8 + 0.4 * hash(id, j, 5));
          // (a propane column burns yellow-orange through most of its rise; the red and the sooty brown are its tips as they
          // tear off. The first pass cooled linearly: 40 % of a lump's life red or brown, and from B9's lens, above the
          // unit, the cooled tops hid the hot body: a brown blob)
          const heat = PV0 ? 1.0 - f * 1.05 : 1.0 - 1.05 * f ** 1.7;
          // (and a lump tears away as it cools: it dissolves from f 0.6, mostly gone before it would turn brown; propane
          // burns clean, so its smoke is a wisp off the dying tips, not a grey puff over the flame's body)
          F.fire(p3, r, heat, hash(id, j, 6), PV0 ? (f > 0.75 ? 1 - (f - 0.75) / 0.25 : 1) : 1 - smooth(0.6, 0.95, f), 1);
          if (PV0 ? f > 0.55 : f > 0.8) F.smoke([p3[0], p3[1] + r * 0.6, p3[2]], r * (PV0 ? 0.55 : 0.35), 5, hash(id, j, 7), smooth(PV0 ? 0.55 : 0.8, 1.0, f) * 0.9 + 0.1, 0);
          live++;
        }
        if (live) F.glow([u.pos[0], u.pos[1] + 2.0, u.pos[2]], 5.0, [1.1, 0.42, 0.1]);
      });
  };
  // CO2: white fog jets; the column's lobes slow from the nozzle (drag), spread, settle slightly, and erode in 3-5 s
  K.co2 = (e, t) => {
      const dur = e.dur || 1.0;
      if (t < e.t || t > e.t + dur + SPEC.co2.life[1]) return;
      const v0s = launchFor(SPEC.co2.H - 1.0, SPEC.co2.k, -0.35);    // (the column's top: the lobes' centres 1 m under it)
      L.co2.forEach((c, k) => {
        const id = 30000 + e.i * 16 + k, d0 = nrm(c.dir), nl = Math.ceil(dur * SPEC.co2.rate);
        for (let j = 0; j < nl; j++) {
          const b = e.t + (j + hash(id, j)) / SPEC.co2.rate; if (b > e.t + dur) break;
          const life = SPEC.co2.life[0] + (SPEC.co2.life[1] - SPEC.co2.life[0]) * hash(id, j, 2), age = t - b;
          if (age < 0 || age > life) continue;
          const d = cone(d0, 0.06, hash(id, j, 3), hash(id, j, 4)), sp = v0s * (0.82 + 0.18 * hash(id, j, 5));
          ballistic(c.pos, [d[0] * sp, d[1] * sp, d[2] * sp], [wind[0], -0.35, wind[2]], SPEC.co2.k, age, p3);
          // each lobe its own size and a little off the axis (the jet's turbulent edge), so the column isn't a stack
          const v = 0.65 + 0.7 * hash(id, j, 7), off = 0.35 * (1 - Math.exp(-age / 0.6));
          const r = (0.12 + 0.95 * (1 - Math.exp(-age / 0.9))) * v;
          p3[0] += (hash(id, j, 8) - 0.5) * 2 * off; p3[2] += (hash(id, j, 9) - 0.5) * 2 * off;
          F.smoke(p3, r, 2, hash(id, j, 6), smooth(life * 0.45, life, age), 0);
        }
      });
  };
  // mortars: the flash (two frames, E3/E10), the puff, the shock ring, a few sparks
  K.mortar = (e, t) => {
      if (t < e.t || t > e.t + SPEC.mortar.life[1] + 0.5) return;
      const n = e.n || 1, age = t - e.t;
      for (let k = 0; k < n; k++) {
        const p = mortarAt(e, k), id = 40000 + e.i * 16 + k;
        if (age < SPEC.mortar.flash) {
          const f = age / SPEC.mortar.flash;
          F.fire([p[0], p[1] + 0.9, p[2]], 0.9 + 0.4 * f, 1.0 - 0.3 * f, hash(id, 1), 1, 1.3);
          for (let j = 0; j < 9; j++) { const a = j / 9 * Math.PI * 2 + hash(id, j) * 0.5, rr = 0.7 + 0.5 * f; F.fire([p[0] + Math.cos(a) * rr, p[1] + 0.9 + Math.sin(a) * rr * 0.8 + 0.4, p[2] + Math.sin(a) * rr * 0.5], 0.32, 0.8 - 0.3 * f, hash(id, j, 2), 1, 1.2); }
          F.glow([p[0], p[1] + 1, p[2]], 5, [2.6, 2.0, 1.4]);
        }
        if (age < 3 / 24) { const u = age / (3 / 24); F.ring([p[0], p[1] + 0.9, p[2]], 0.8 + 2.4 * (1 - Math.exp(-u * 2.2)), [1.2, 1.15, 1.0], (1 - u * u) * 0.8); }
        // its sparks: a burst thrown up and out, a few with long burning trails (the first pass threw 14, a sprinkle)
        for (let j = 0; j < (PV0 ? 14 : 70); j++) {
          const life = (PV0 ? 0.35 + 0.35 * hash(id, j, 3) : 0.3 + 0.7 * hash(id, j, 3) ** 2); if (age > life) continue;
          const d = cone([0, 1, 0], 0.9, hash(id, j, 4), hash(id, j, 5)), sp = 9 + (PV0 ? 8 : 11) * hash(id, j, 6);
          ballistic([p[0], p[1] + 0.6, p[2]], [d[0] * sp, d[1] * sp, d[2] * sp], [wind[0] * 0.3, -3, wind[2] * 0.3], 3, age, p3, v3);
          F.spark(p3, v3, PV0 ? 0.02 : 0.012 + 0.016 * hash(id, j, 7), PV0 ? 1 - age / life : (1 - age / life) ** 0.8);
        }
        // the puff: six lobes, a 2-3 m ball, rising a little, drifting downwind, eroding over 4.5-7.5 s
        const life = SPEC.mortar.life[0] + (SPEC.mortar.life[1] - SPEC.mortar.life[0]) * hash(id, 8);
        if (age < life) for (let j = 0; j < 7; j++) {
          const d = cone([0, 1, 0], 1.2, hash(id, j, 10), hash(id, j, 11));
          ballistic([p[0], p[1] + 0.9, p[2]], [d[0] * 2.6, d[1] * 2.6 + 1.5, d[2] * 2.6], [wind[0], 0.35, wind[2]], 4.5, age, p3);
          const r = SPEC.mortar.puff[0] + (SPEC.mortar.puff[1] - SPEC.mortar.puff[0]) * (1 - Math.exp(-age / 0.5)) * (0.75 + 0.4 * hash(id, j, 12));
          F.smoke(p3, r, 1, hash(id, j, 13), smooth(life * 0.4, life, age), age < 0.12 ? 1 - age / 0.12 : 0);
        }
      }
  };
  const EVS = { gerb: gerbs, spark: sparkEv, comet: comets, flame: flames, co2, mortar: mortars };
  out.draw = t => { for (const [k, list] of Object.entries(EVS)) for (const e of list) K[k](e, t); };
  // one event alone into a probe (measure.js): the same code that draws the frame
  out.drawOne = (kind, e, t, probe) => { const keep = F; F = probe; try { K[kind](e, t); } finally { F = keep; } };
  out.events = EVS;
  // confetti: drawn by its own pass (below), on the GPU

  // ---- confetti: paper rectangles 2 x 3 cm (drawn 2.5x: style, a frame's legibility), launched in a cone from each
  // cannon, slowed by drag to a 0.8 m/s flutter and carried on the wind; tumbling at their own rates; lit by the
  // scene's light (they catch the beams)
  const confT = conf.length ? conf[0].t : -1e9;
  {
    const T = window.THREE, n = SPEC.confetti.n * L.confetti.length;
    const geo = new T.PlaneGeometry(0.05, 0.075);
    const ig = new T.InstancedBufferGeometry(); ig.index = geo.index; for (const k of ['position', 'normal', 'uv']) ig.setAttribute(k, geo.attributes[k]);
    ig.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(4), 1));
    const a0 = new Float32Array(n * 4), a1 = new Float32Array(n * 4), a2 = new Float32Array(n * 4);
    const CK = SPEC.confetti.k, fall = SPEC.confetti.fall;
    const land = landing || confettiLanding(L, ctx, S, wind);
    out.confettiLanding = [];
    L.confetti.forEach((c, ci) => {
      for (let j = 0; j < SPEC.confetti.n; j++) {
        const i = ci * SPEC.confetti.n + j, vv = confettiV0(c, i), tl = land.tl[i];
        out.confettiLanding.push([land.xz[i * 2], land.xz[i * 2 + 1], tl]);
        a0.set([c.pos[0], c.pos[1], c.pos[2], hash(77, i, 4) * 0.12], i * 4);                // pos, launch delay
        a1.set([vv[0], vv[1], vv[2], 3 + 9 * hash(77, i, 5)], i * 4);                        // v0, tumble rate
        a2.set([hash(77, i, 6), hash(77, i, 7), hash(77, i, 8), tl], i * 4);                 // its tumble axis and hue, when it lands
      }
    });
    ig.setAttribute('iA', new T.InstancedBufferAttribute(a0, 4)); ig.setAttribute('iB', new T.InstancedBufferAttribute(a1, 4)); ig.setAttribute('iC', new T.InstancedBufferAttribute(a2, 4));
    ig.instanceCount = n;
    const U = { uT0: { value: confT }, uWindV: { value: new T.Vector3(...wind) }, uK: { value: CK }, uFall: { value: fall } };
    const mat = world.mat({
      name: 'confetti', lines: 0, double: true, uniforms: U,
      vertex: /* glsl */`attribute float aSeed; attribute vec4 iA; attribute vec4 iB; attribute vec4 iC;
        uniform float uT0; uniform vec3 uWindV; uniform float uK; uniform float uFall;
        mat3 rotAxis(vec3 a, float th) { a = normalize(a); float c = cos(th), s = sin(th), C = 1.0 - c;
          return mat3(c + a.x*a.x*C, a.y*a.x*C + a.z*s, a.z*a.x*C - a.y*s, a.x*a.y*C - a.z*s, c + a.y*a.y*C, a.z*a.y*C + a.x*s, a.x*a.z*C + a.y*s, a.y*a.z*C - a.x*s, c + a.z*a.z*C); }
        void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
          float age = uTime - uT0 - iA.w;
          vGone = age < 0.0 ? 1.0 : 0.0;
          bool down = age > iC.w;                    // landed: it lies where it came down
          age = clamp(age, 0.0, iC.w);
          // drag toward the paper's flutter speed plus the wind, exact
          vec3 vt = vec3(uWindV.x * 0.95, -uFall, uWindV.z * 0.95);
          float e = exp(-uK * age);
          vec3 c = iA.xyz + vt * age + (iB.xyz - vt) * (1.0 - e) / uK;
          // the flutter: a side-to-side sway on a 0.7-1.3 s period once it has slowed
          float sw = (1.0 - e) * 0.35 * (down ? 0.0 : 1.0);
          c += vec3(sin(age * (5.0 + 4.0 * iC.x) + iC.y * 30.0), 0.0, cos(age * (4.0 + 3.0 * iC.y) + iC.x * 20.0)) * sw;
          mat3 R = rotAxis(vec3(iC.x - 0.5, iC.y - 0.5, iC.z - 0.5) + vec3(0.01), age * iB.w + iC.z * 6.28);
          if (down) R = rotAxis(vec3(0.0, 1.0, 0.0), iC.z * 6.28) * mat3(1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 1.0, 0.0);
          P = c + R * position * 2.5 + (down ? vec3(0.0, 0.012, 0.0) : vec3(0.0)); N = R * vec3(0.0, 0.0, 1.0); uv = position.xy;
          if (vGone > 0.5) P = vec3(0.0, -1e4, 0.0);
          // five colours (the show's confetti: gold, magenta, cyan, white, red)
          float k = floor(iC.z * 5.0);
          vCol = k < 1.0 ? vec3(0.95, 0.72, 0.18) : k < 2.0 ? vec3(0.9, 0.18, 0.62) : k < 3.0 ? vec3(0.18, 0.75, 0.95) : k < 4.0 ? vec3(0.92, 0.9, 0.86) : vec3(0.88, 0.16, 0.14);
          vSeed = aSeed;
        }`,
      varyings: 'varying vec3 vCol; varying float vGone; varying float vSeed;',
      // (metallised paper: a glint when it turns to the eye, E8's sparkle; a little of its own colour, so it reads as paper,
      // not as specks, between the beams)
      surface: `void smain(inout Surface s, vec3 P, vec3 V) { if (vGone > 0.5) discard; s.albedo = vCol * 0.7; s.shadeCol = vCol * 0.3; s.useShade = 1.0; s.spec = 0.4; s.rough = 0.3; s.trans = 0.3;
        float g = pow(abs(dot(normalize(vN), V)), 24.0); s.emissive = vCol * (0.06 + 1.6 * g); }`,
    });
    const m = world.mesh(ig, mat, { name: 'confetti', frustum: false, cast: false });
    m.userData.loose = 'confetti in the air';
    m.visible = conf.length > 0;
  }

  // ---- the sounds: every audible event at its source (show.md §1.4: the levels at 1 m are demo.js's LEVELS)
  const lv = show.levels || {};
  for (const e of gerbs) for (const g of gerbList(e)) out.sounds.push({ t: e.t - LEAD.gerb * 0, kind: 'gerb', pos: g.pos.slice(), level: lv.gerb, dur: e.dur || 8 });
  for (const e of sparkEv) for (const m of L.sparks) out.sounds.push({ t: e.t, kind: 'spark', pos: m.pos.slice(), level: lv.spark, dur: e.dur || 10 });
  for (const e of comets) for (let k = 0; k < Math.min(e.n || 6, L.comets.length); k++) out.sounds.push({ t: e.t, kind: 'comet', pos: L.comets[k].pos.slice(), level: lv.comet, dur: 1.6 });
  for (const e of flames) { const n = Math.min(e.n || 8, L.flames.length); L.flames.slice().sort((a, b) => Math.abs(a.pos[2] - L.deck.zc) - Math.abs(b.pos[2] - L.deck.zc)).slice(0, n).forEach(u => out.sounds.push({ t: e.t, kind: 'flame', pos: u.pos.slice(), level: lv.flame, dur: (e.dur || 0.5) + 0.3 })); }
  for (const e of co2) for (const c of L.co2) out.sounds.push({ t: e.t, kind: 'co2', pos: c.pos.slice(), level: lv.co2, dur: e.dur || 1 });
  for (const e of mortars) for (let k = 0; k < (e.n || 1); k++) out.sounds.push({ t: e.t, kind: 'mortar', pos: mortarAt(e, k).slice(), level: lv.mortar, dur: 0.6 });
  for (const e of conf) for (const c of L.confetti) out.sounds.push({ t: e.t, kind: 'confetti', pos: c.pos.slice(), level: lv.confetti, dur: 0.4 });

  // ---- the blast rings on the water where they belong (B3's ripple, keyed by event: moves the ones it guessed)
  const water = ctx.mods.water && !ctx.mods.water.failed ? ctx.mods.water : null;
  if (water && water.ripple) for (const e of mortars) for (let k = 0; k < (e.n || 1); k++) {
    const p = mortarAt(e, k);
    water.ripple({ x: p[0], z: p[2], t0: e.t, a: e.at === 'port' ? 0.45 : 0.3, kind: 'blast', reach: 60, key: `mortar@${e.t.toFixed(3)}#${e.at || 'port'}${k}` });
  }
  out.mortarAt = mortarAt; out.wind = wind; out.lightsAt = lightsAt; out.lightState = lightState;
  return out;
}
