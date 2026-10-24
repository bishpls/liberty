// liberty/src/stage/guns.js: the ship's guns firing their blank salutes (show.md §1, G1-G17; style.md E1-E7) at B2's
// muzzles (ctx.mods.deck.guns.<gun>.muzzle(t) -> { p, d }, .shots: each round's time; B2 owns the recoil, the case,
// the training). Per shot, a pure function of the time since it:
//   5"/38  the flash: a hollow ring of flat-toned fire round the bore's axis, peak 3.5 m across at ~50 ms, gone by
//          ~150 ms (G6, photo 06), a forward tongue, a dark core of unburnt powder (photo 06) that becomes the smoke;
//          the flash's light on everything near for 6-8 frames (E4: a 180 deg spot); the shock front at 343 m/s (G8,
//          E7: a thin line for ~4 frames); burning grains thrown forward; the olive-brown ball (G6-G7: 8-12 m, rolling
//          downwind, coherent at 5 s, gone by 8-15 s); the blast's ring on the water (B3's ripple, moved to the muzzle)
//   3"/50  the same at 60 % (G10)
//   20 mm  each round a small pale star 0.3-0.4 m at the muzzle, one frame (1/24 s, G14, E4: strobing at the gun's
//          450 rpm), a faint grey puff; one light for the burst
import { ballistic, cone, hash } from './pyro.js';
import { DARK } from './cues.js';

const FRAME = 1 / 24;
const qg = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
// the smoke's schedule (the integrator's B4 note: nothing eroded until ~45 % of its 8.5-14 s, so it hung as one smooth
// mass): erosion from 0.6 s on, (a - 0.6) / (life - 0.6) to the 0.45 (scallops by ~1.5 s, ~0.6 at 4 s, gone at its life:
// show.md G6 'coherent at 5 s, gone by 8-15 s', photo 04's torn edges a second in); a blank's ball 0.85 of the photos'
// full charges; each lobe drifts with its own share of the wind and rises at its own rate, so the ball comes apart
const SV0 = qg.get('smoke') === 'v0';
const G20GLOW = +(qg.get('g20glow') ?? 1), G20FIRE = +(qg.get('g20fire') ?? 1);        // (A/B dials: the 20 mm's glow and star)          // (?smoke=v0: the first cut's smoke, for A/Bs)
const SERODE = +(qg.get('smokeerode') ?? 0.6), SEPOW = +(qg.get('smokepow') ?? 0.45), SGROW = SV0 ? 1 : +(qg.get('smokegrow') ?? 0.85);
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

export const GUN = {
  gun5: { scale: 1.0, ring: 1.45, smoke: { n: 18, r: [1.0, 2.3], life: [8.5, 14] }, light: 2.6, level: 'gun5', src: 'G6: flash ring 3-5 m, ~100-150 ms; smoke 8-12 m, 8-15 s' },
  gun3: { scale: 0.6, ring: 0.87, smoke: { n: 12, r: [0.6, 1.4], life: [7, 11] }, light: 1.5, level: 'gun3', src: 'G10: ~60 % of the 5"' },
  gun20: { star: 0.35, puff: [0.18, 0.55], life: 1.6, light: 0.35, level: 'gun20', src: 'G14: a 0.3-0.4 m pale star, one frame at 24 fps; G11: 450 rpm' },
};

export function makeGuns(world, L, ctx, F0, wind) {
  let F = F0;                                 // where the shots draw: the renderers, or a measure's probe
  const deck = ctx.mods.deck && !ctx.mods.deck.failed && ctx.mods.deck.guns ? ctx.mods.deck : null;
  const show = ctx.show, P = ctx.P;
  // the guns: B2's when they have landed, else the plan's mounts trained to port (a salute fires away from the pier)
  const fallback = (kind, i) => {
    const S = P.SHIP, g = kind === 'gun20' ? S.guns.gun20[i] : S.guns[kind];
    const abl = kind === 'gun20' ? (g.floorAbl || S.sideAbl(g.z) + 3.4) + 1.2 : g.boreAbl;
    const m = S.toWorld(g.x, abl, g.z), d = kind === 'gun5' ? nrm([-0.86, 0.42, 0.2]) : kind === 'gun3' ? nrm([-0.86, 0.38, -0.25]) : g.x < 0 ? nrm([-0.7, 0.68, 0.1]) : nrm([0.25, 0.85, -0.45]);
    const len = kind === 'gun5' ? 4.6 : kind === 'gun3' ? 3.4 : 1.6;
    const times = kind === 'gun20' ? show.events('gun20').filter(e => (e.guns || [0]).includes(i)).flatMap(e => Array.from({ length: e.rounds || 5 }, (_, r) => e.t + r * 60 / 450)) : show.events(kind).map(e => e.t);
    return { muzzle: () => ({ p: [m[0] + d[0] * len, m[1] + d[1] * len, m[2] + d[2] * len], d }), shots: times, name: g.name || kind };
  };
  const guns = { gun5: deck ? deck.guns.gun5 : fallback('gun5'), gun3: deck ? deck.guns.gun3 : fallback('gun3'), gun20: Array.from({ length: 8 }, (_, i) => (deck ? deck.guns.gun20[i] : fallback('gun20', i))) };
  // (B2's muzzle(t) is the plan's { p, d }, as an array that also carries .p and .d: read those first)
  const mz = (g, t) => { const m = g.muzzle(t); if (m && m.p && m.d) return { p: m.p.slice(), d: m.d.slice() }; return Array.isArray(m) ? { p: m, d: [-1, 0, 0] } : m; };
  // each shot's muzzle frozen at the instant it fires (the barrel recoils after it)
  const shotsOf = g => (g.shots || []).map(ts => Object.assign({ t: ts }, mz(g, ts)));
  const S5 = shotsOf(guns.gun5), S3 = shotsOf(guns.gun3), S20 = guns.gun20.map(shotsOf);
  const p3 = [0, 0, 0], v3 = [0, 0, 0];
  const lit = { big: null, s20: 0, p20: [0, 0, 0] };
  // the Oerlikons' volleys: the rounds of all guns that fire within 0.3 s of each other, their muzzles' middle
  const VOL = (() => {
    const all = []; S20.forEach(list => list.forEach(sh => all.push(sh))); all.sort((a, b) => a.t - b.t);
    const out = [];
    for (const sh of all) { const v = out[out.length - 1]; if (v && sh.t - v.t1 < 0.3) { v.t1 = sh.t; v.times.push(sh.t); v.ps.push(sh.p); } else out.push({ t0: sh.t, t1: sh.t, times: [sh.t], ps: [sh.p] }); }
    for (const v of out) v.p = [0, 1, 2].map(i => v.ps.reduce((a, p) => a + p[i], 0) / v.ps.length);
    return out;
  })();

  // ---- one big gun's shot at age a (seconds since it fired)
  function bigShot(sh, a, G, id) {
    const s = G.scale, d = sh.d, p = sh.p;
    const [u, v] = basis(d);
    // the flash: frames 0-3 (E3: drawn on ones); the ring grows to its peak by ~50 ms and breaks up by ~150 ms
    if (a < 0.16) {
      const grow = 1 - Math.exp(-a / 0.022), fade = 1 - smooth(0.05, 0.13, a);
      const R = G.ring * grow, c = add(p, mul(d, (0.7 + 1.6 * grow) * s));
      const n = 16;
      for (let k = 0; k < n; k++) {
        const th = k / n * Math.PI * 2 + hash(id, k) * 0.3, rr = R * (0.9 + 0.2 * hash(id, k, 2));
        const q = add(c, add(mul(u, Math.cos(th) * rr), mul(v, Math.sin(th) * rr)));
        F.fire(q, (0.42 + 0.18 * hash(id, k, 3)) * s * (0.7 + 0.5 * grow), 1.0 - 0.62 * smooth(0.03, 0.15, a) - 0.08 * hash(id, k, 4), hash(id, k, 5), fade + 0.05, 1.0);
      }
      // the tongue along the bore
      for (let k = 0; k < 5; k++) F.fire(add(p, mul(d, (0.4 + k * 0.75) * s * (0.6 + grow))), (0.5 - k * 0.06) * s, 1.0 - k * 0.05 - 0.5 * smooth(0.03, 0.12, a), hash(id, k, 7), fade, 1.0);
      // the dark core: unburnt powder in the ring's middle (photo 06)
      if (a > FRAME * 0.5) for (let k = 0; k < 5; k++) F.smoke(add(c, add(mul(u, (hash(id, k, 8) - 0.5) * R * 0.6), mul(v, (hash(id, k, 9) - 0.5) * R * 0.6))), R * 0.42, 3, hash(id, k, 10), 0, 0.15);
      F.glow(c, 7 * s, [2.6 * fade, 1.5 * fade, 0.5 * fade]);
    }
    // burning grains thrown forward in a cone (110; the first pass threw 40: ?pyro=v0)
    for (let k = 0; k < (qg.get('pyro') === 'v0' ? 40 : 110); k++) {
      const life = 0.18 + 0.2 * hash(id, k, 11); if (a > life) continue;
      const dd = cone(d, 0.35, hash(id, k, 12), hash(id, k, 13)), sp = (40 + 50 * hash(id, k, 14)) * s;
      ballistic(p, mul(dd, sp), [wind[0], -2, wind[2]], 4.5, a, p3, v3);
      F.spark(p3, v3, 0.03 * s, 1 - a / life);
    }
    // the shock front: E7's ring line for 4 frames, near the muzzle, out to ~8 m (the 5") and gone (the front itself
    // runs at 343 m/s, G8, and shows only where it disturbs something: the water's ring is B3's, the smoke's push is here)
    if (a < 4 * FRAME) { const u = a / (4 * FRAME); F.ring(add(p, mul(d, 1.2 * s)), (1.2 + 6.8 * (1 - Math.exp(-u * 2.2))) * s, [1.3, 1.22, 1.05], 1 - u * u); }
    // the smoke ball: lobes thrown forward with the blast, braked by drag, then rolling downwind, growing, eroding
    const SM = G.smoke;
    for (let k = 0; k < SM.n; k++) {
      const life = SM.life[0] + (SM.life[1] - SM.life[0]) * hash(id, k, 20);
      if (a > life) continue;
      const dd = cone(d, 0.42, hash(id, k, 21), hash(id, k, 22)), sp = (12 + 10 * hash(id, k, 23)) * s;
      const wk = SV0 ? 1 : 0.55 + 0.9 * hash(id, k, 26), rise = SV0 ? 0.28 : 0.12 + 0.6 * hash(id, k, 27);
      ballistic(add(p, mul(d, 0.8 * s)), mul(dd, sp), [wind[0] * wk, rise, wind[2] * wk], 2.6, a, p3);
      const r = (SM.r[0] + (SM.r[1] - SM.r[0]) * (1 - Math.exp(-a / 1.1))) * (0.7 + 0.45 * hash(id, k, 24)) * (1 + 0.04 * a) * SGROW;
      const heat = a < 0.25 ? 0.6 * (1 - a / 0.25) : 0;
      const ero = SV0 ? smooth(life * 0.45, life, a) : Math.pow(Math.max(0, Math.min(1, (a - SERODE) / (life - SERODE))), SEPOW);
      F.smoke(p3, r * (a < 0.06 ? a / 0.06 : 1), 0, hash(id, k, 25), ero, heat);
    }
  }
  // the lights, a pure function of t (the engine reads spot states before this module's frame update)
  const flashI = (G, a) => G.light * (a < 0.02 ? a / 0.02 : Math.exp(-(a - 0.02) / 0.09)) * (a < 0.33 ? 1 : 0);
  const cache = { t: NaN };
  function lightsAt(t) {
    if (t === cache.t) return lit;
    cache.t = t; lit.big = null; lit.s20 = 0;
    if (DARK) return lit;
    for (const [list, G] of [[S5, GUN.gun5], [S3, GUN.gun3]]) for (const sh of list) {
      const a = t - sh.t; if (a < 0 || a > 0.35) continue;
      const I = flashI(G, a); if (!lit.big || I > lit.big.I) lit.big = { p: add(sh.p, mul(sh.d, 1.5 * G.scale)), I };
    }
    // the Oerlikons: one envelope a volley (WCAG 2.3.1 / BT.1702: a light per round lit the whole tub near-white six times in
    // 0.7 s, B8 and B3 failing tools/flashcheck.py at 6/s and 4/s): up on its first round, held with a ripple a round
    // (under a tenth: under the 0.1 luminance swing that counts as a flash), out over 0.3 s after its last; one flash a volley,
    // the rounds' punch in the muzzles' own stars and the sound
    for (const v of VOL) {
      if (t < v.t0 || t > v.t1 + 0.3) continue;
      const last = v.times.filter(x => x <= t).pop(), rip = 0.92 + 0.08 * Math.exp(-(t - last) / 0.05);
      const env = t <= v.t1 + FRAME ? 1 : Math.exp(-(t - v.t1 - FRAME) / 0.1);
      const I = GUN.gun20.light * 0.7 * env * rip;
      if (I > lit.s20) { lit.s20 = I; lit.p20 = v.p; }
    }
    return lit;
  }

  world.stage.spot({ name: 'gun flash', state: t => { const l = lightsAt(t); return { pos: l.big ? l.big.p : [0, 0, 0], dir: [0, 1, 0], color: [1, 0.62, 0.28], intensity: l.big ? l.big.I : 0, angle: 180, range: 70, srcR: 1.2 }; } });
  world.stage.spot({ name: 'oerlikon flash', state: t => { const l = lightsAt(t); return { pos: l.p20, dir: [0, 1, 0], color: [1, 0.8, 0.5], intensity: l.s20, angle: 180, range: 25, srcR: 0.3 }; } });

  const draw = t => {
    S5.forEach((sh, i) => { const a = t - sh.t; if (a >= 0 && a < GUN.gun5.smoke.life[1]) bigShot(sh, a, GUN.gun5, 50000 + i); });
    S3.forEach((sh, i) => { const a = t - sh.t; if (a >= 0 && a < GUN.gun3.smoke.life[1]) bigShot(sh, a, GUN.gun3, 51000 + i); });
    // the Oerlikons: a star on one frame a round (E4's strobe comes from the rate: 450 rpm is a round every 3.2 frames)
    S20.forEach((list, g) => list.forEach((sh, r) => { const a = t - sh.t; if (a >= 0 && a <= GUN.gun20.life) one20(sh, a, 60000 + g * 1000 + r); }));
    // each gun's burst: one held glow at its muzzle, up on its first round, out over 0.15 s after its last (one flash a
    // burst, its rounds a flicker in the stars)
    for (const b of BURST20) {
      if (t < b.t0 || t > b.t1 + 0.4) continue;
      const env = t <= b.t1 + FRAME ? 1 : Math.exp(-(t - b.t1 - FRAME) / 0.15);
      F.glow(b.p, 1.0 * G20GLOW, [1.0 * env, 0.7 * env, 0.35 * env]);
    }
  };
  const BURST20 = [];
  S20.forEach(list => { for (const sh of list) { const b = BURST20.length && BURST20[BURST20.length - 1]; if (b && b.g === list && sh.t - b.t1 < 0.3) b.t1 = sh.t; else BURST20.push({ g: list, t0: sh.t, t1: sh.t, p: sh.p }); } });
  function one20(sh, a, id) {
      const d = sh.d, p = sh.p, [u, v] = basis(d);
      if (a < FRAME) {
        if (G20FIRE > 0) {
          F.fire(add(p, mul(d, 0.14)), 0.13 * G20FIRE, 0.95, hash(id, 1), 1, 1.2);
          for (let k = 0; k < 5; k++) { const th = k / 5 * Math.PI * 2 + hash(id, 2) * 3; F.fire(add(p, add(mul(d, 0.1), add(mul(u, Math.cos(th) * 0.11), mul(v, Math.sin(th) * 0.11)))), 0.06 * G20FIRE, 0.85, hash(id, k, 3), 1, 1.1); }
        }
        // the round's own glow: small (a 3.2 m glow a round filled a close camera's frame six times a second: B8 at 6/s;
        // 0.48 m still lit 37 % of a window, 0.3 m 26 %); the burst's glow is held through the burst (draw: BURST20)
        if (G20GLOW > 0) F.glow(p, 0.24 * G20GLOW, [2.0, 1.4, 0.7]);
      }
      // the grey puff a round leaves
      const pr = GUN.gun20.puff, r2 = pr[0] + (pr[1] - pr[0]) * (1 - Math.exp(-a / 0.4));
      ballistic(add(p, mul(d, 0.3)), mul(d, 6), [wind[0], 0.2, wind[2]], 4, a, p3);
      F.smoke(p3, r2, 4, hash(id, 4), smooth(0.4, GUN.gun20.life, a), 0);
  }

  // ---- the blast rings on the water, at the muzzle where each shot fired (B3's ripple, keyed as B3 keys them)
  const water = ctx.mods.water && !ctx.mods.water.failed ? ctx.mods.water : null;
  if (water && water.ripple) {
    for (const sh of S5) water.ripple({ x: sh.p[0], z: sh.p[2], t0: sh.t, a: 1.0, kind: 'blast', reach: 160 + sh.p[1], key: 'gun5@' + sh.t.toFixed(3) });
    for (const sh of S3) water.ripple({ x: sh.p[0], z: sh.p[2], t0: sh.t, a: 0.6, kind: 'blast', reach: 90 + sh.p[1], key: 'gun3@' + sh.t.toFixed(3) });
  }
  // ---- the sounds: every round from its muzzle (show.md §1.4 levels at 1 m: the integrator's soundscape spreads them)
  const lv = show.levels || {};
  const sounds = [];
  for (const sh of S5) sounds.push({ t: sh.t, kind: 'gun5', pos: sh.p.slice(), level: lv.gun5, dur: 1.5 });
  for (const sh of S3) sounds.push({ t: sh.t, kind: 'gun3', pos: sh.p.slice(), level: lv.gun3, dur: 1.2 });
  S20.forEach(list => list.forEach(sh => sounds.push({ t: sh.t, kind: 'gun20', pos: sh.p.slice(), level: lv.gun20, dur: 0.12 })));
  const measures = { shots: { gun5: S5.length, gun3: S3.length, gun20: S20.reduce((a, l) => a + l.length, 0) }, fromDeck: !!deck,
    muzzles: { gun5: S5[0] ? S5[0].p.map(v => +v.toFixed(2)) : null, gun3: S3[0] ? S3[0].p.map(v => +v.toFixed(2)) : null } };
  // one shot alone into a probe (measure.js)
  const drawShot = (kind, i, t, probe) => {
    const keep = F; F = probe;
    try {
      if (kind === 'gun20') { const sh = S20[i[0]][i[1]], a = t - sh.t; if (a >= 0) one20(sh, a, 60000 + i[0] * 1000 + i[1]); }
      else { const list = kind === 'gun5' ? S5 : S3, sh = list[i], a = t - sh.t; if (a >= 0) bigShot(sh, a, GUN[kind], (kind === 'gun5' ? 50000 : 51000) + i); }
    } finally { F = keep; }
  };
  return { draw, drawShot, sounds, measures, S5, S3, S20, lightsAt };
}

function basis(d) { let u = Math.abs(d[1]) < 0.95 ? [d[2], 0, -d[0]] : [1, 0, 0]; const l = Math.hypot(...u) || 1; u = u.map(x => x / l); const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]; return [u, v]; }
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
