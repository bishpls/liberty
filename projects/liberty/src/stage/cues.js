// liberty/src/stage/cues.js: the lighting programme, a pure function of the show's clock (ctx.show: its sections, their
// looks and energies, the beat). Each section's look (palette.js LOOKS: 2-3 hue families, style C1-C2) sets each
// group's pattern from the show designer's vocabulary (show.md §2.3, L6): fans, sweeps, ballyhoo, chases, circles,
// waves, crosses, pillars, beat flashes; transitions between sections run over a beat (colours) and two (positions).
// Fixture speeds are real ones (L2: Sharpy pan 220 deg/s, tilt 192 deg/s): ballyhoo moves take a beat and stay within
// +-25 deg of their home, so a move peaks under the limit (measure.js reads every fixture's pan and tilt speed over the
// show). Strobe and Oerlikon-style flashes last at least 1/24 s, so every flash lands in exactly one frame at 24 fps.
import { LOOKS, lightCol, mixc } from './palette.js';

const DEG = Math.PI / 180;
const hash = (a, b = 0, c = 0) => { let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const sm = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const dirAE = (az, el) => [Math.cos(el * DEG) * Math.cos(az * DEG), Math.sin(el * DEG), Math.cos(el * DEG) * Math.sin(az * DEG)];
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
// a great-circle blend of two directions
export function slerp(a, b, u) {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), w = Math.acos(d);
  if (w < 1e-4) return b;
  const s = Math.sin(w), ka = Math.sin((1 - u) * w) / s, kb = Math.sin(u * w) / s;
  return nrm([a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]);
}

// the kinds' optics (show.md L1-L2, §2.2) and their intensity (the illuminance on the axis 10 m out; the sun ~2.5):
// a Sharpy's 59,760 lx at 20 m is ~6 there, a MegaPointe's 137,500 lx at 20 m ~14; washes are far dimmer per area.
// halo: the glow hugging each shaft (stagelight.js; ×HALO below). The front washes' shafts at 0.15 (0.35 until the haze
// round: from a camera at the lip, under the front truss, their wide teal shafts lay a veil over the frame's edge) and
// the hull washes at 1.9 (1.25, then 2.5: the colour the first cut's haze veil gave the frame now comes from lit surfaces,
// the hull in the section's colours from the pier, colourfulness at the drop 57.5 -> 63.0, refs 65.4; at 2.5 the pools'
// middles clipped flat, 8-11 % of a pool, so 1.9: 60.7; board/stage/notes.md, washes.html)
const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
// The hull washes (the tour's cameras, 2026-10-24: 'flat, hard-edged cyan and pink blobs ... like cut paper'): the hull's
// stopper is a low-poly proxy, and the plane of the face each wash lands on cut its pool along the proxy's facets (the
// hull's own surface lies up to 2.3 m behind that plane inside a cone: board/stage/washes.html), so the pool is lit to
// 2.5 m behind it (landSlack). WV0 (?washes=v0): the first cut's washes, for A/Bs
const WV0 = qs.get('washes') === 'v0';
export const KINDS = {
  beam: { angle: 1.9, soft: 0.85, srcR: 0.065, range: 140, I: 6.0, halo: 1.0 },
  big: { angle: 1.1, soft: 0.8, srcR: 0.09, range: 400, I: 13.0, halo: 1.0 },
  wash: { angle: 13, soft: 0.65, srcR: 0.16, range: 40, I: 0.9, beam: 0.15 },
  hull: WV0 ? { angle: 31, soft: 1.0, srcR: 0.16, range: 40, I: 2.5, beam: 0.04 } : { angle: 31, soft: 1.0, srcR: 0.16, range: 40, I: 1.9, beam: 0.04, landSlack: 2.5 },
  uplight: { angle: 2.6, soft: 0.5, srcR: 0.12, range: 16, I: 2.4 },
};
// ?kind=hull.I:1.25,wash.beam:0.35 (look dials for A/Bs: a kind's property set)
for (const kv of (qs.get('kind') || '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'), [kind, prop] = k.split('.'); if (KINDS[kind]) KINDS[kind][prop] = +v; }

// the shafts' share in the haze (stagelight.js's 'beam'): physically a Sharpy's shaft seen side-on in heavy haze is
// ~1/150 of the pool it throws (show.md 2.1 with sigma 0.03/m, g 0.62); anime draws thin beams at V .8-.95 (style C3),
// so the shaft is lifted by this stylisation (measured on frames: board/stage/notes.md); with the haze's g at 0.5 (index.js)
// a beam aimed at the eye flares ~2x less than at 0.62 while a side view keeps its level (C1: no photographic white)
export const BEAM_SHARE = +(qs.get('beamshare') || 50);
// the glow round each shaft (stagelight.js's halo: a share of the shaft's light, its 1/e half-width HALO_ANG x the beam's
// angle: 3.4 deg for a Sharpy); ?halo= scales the kinds' halo, ?haloang= the width (the haze round's sweep: 2.5 lifted the
// air a metre outside a beam's edge more than it lit the beam, 1.6-2.0 keep it hugging; board/stage/notes.md)
export const HALO = +(qs.get('halo') ?? 1), HALO_ANG = +(qs.get('haloang') || 1.8);
// ?stagedark=1: every stage light, screen and effect off (a measure's reference frame: the stage's own light by difference)
export const DARK = qs.get('stagedark') === '1';

export function makeCues(show, L, P) {
  const zc = L.deck.zc, secs = show.sections, spb = show.spb;
  const fx = L.fixtures;
  const byGroup = {};
  for (const f of fx) (byGroup[f.group] || (byGroup[f.group] = [])).push(f);
  for (const g of Object.values(byGroup)) g.forEach((f, i) => { f.i = i; f.n = g.length; f.u = g.length > 1 ? i / (g.length - 1) - 0.5 : 0; });
  const hits = show.events('hit');
  const blackout = hits.find(h => h.name === 'blackout');
  const look = s => LOOKS[(s && s.look) || 'dawn'] || LOOKS.dawn;
  const secAt = t => secs.find(s => t >= s.t0 && t < s.t1) || null;
  const secIdx = s => secs.indexOf(s);
  // the house's dimmer: up to the first downbeat over two bars (walk-in light before), out after the blackout
  const master = t => 1;

  // ---- direction patterns: (f, t, s) -> dir. 'home' faces downstage (+x) for the stage's fixtures, -x on the pier
  const beatOf = t => show.beatAt(t);
  const pat = {
    // a fan: spread across z by the fixture's place, at an elevation; breathing open and closed every two bars
    fan(f, t, p) { const b = beatOf(t), br = p.breathe ? 0.5 + 0.5 * Math.sin(b / 8 * Math.PI * 2) : 1; return dirAE(p.az + f.u * p.spread * (p.open ?? 0.4 + 0.6 * br), p.el); },
    // a sweep: all parallel, the elevation running floor to sky over 'bars' and back
    sweep(f, t, p) { const b = beatOf(t) / 4 / p.bars, w = 0.5 - 0.5 * Math.cos(b * Math.PI * 2); return dirAE(p.az + f.u * (p.spread || 0), p.el0 + (p.el1 - p.el0) * w); },
    // ballyhoo: a new seeded target each 'every' beats round the home, moved over the whole step (fixture speed)
    bally(f, t, p) {
      const e = p.every || 1, b = beatOf(t) / e, k = Math.floor(b), u = sm(b - k);
      const tg = j => dirAE(p.az + f.u * (p.spread || 0) + (hash(f.id, j, 7) - 0.5) * 2 * p.daz, p.el + (hash(f.id, j, 11) - 0.5) * 2 * p.del);
      return slerp(tg(k - 1), tg(k), u);
    },
    // a circle: each beam traces a cone round its home, phased along the truss
    circle(f, t, p) { const b = beatOf(t), a = (b / p.beats + f.u * p.phase) * Math.PI * 2; return dirAE(p.az + f.u * (p.spread || 0) + Math.cos(a) * p.r, p.el + Math.sin(a) * p.r); },
    // a wave: elevation rippling along the truss
    wave(f, t, p) { const b = beatOf(t); return dirAE(p.az + f.u * p.spread, p.el + p.amp * Math.sin((b / p.beats + f.u * p.phase) * Math.PI * 2)); },
    // a cross: pairs aimed at mirrored points, the beams crossing over the stage's centre line
    cross(f, t, p) { const b = beatOf(t), w = 0.5 + 0.5 * Math.sin(b / p.beats * Math.PI * 2); const tz = zc - f.u * p.reach * (0.6 + 0.4 * w); return nrm([p.dx, p.h, tz - f.pos[2]]); },
    // a pillar: straight up (style C4's flat-top pillars)
    pillar(f, t, p) { return dirAE(p.az || 0, 89.5 - Math.abs(f.u) * (p.lean || 0)); },
    // aimed at a world point (washes on the band, the hull, the masts)
    aim(f, t, p) { const q = p.at(f, t); return nrm([q[0] - f.pos[0], q[1] - f.pos[1], q[2] - f.pos[2]]); },
  };

  // ---- the programme: per look, per group: { pat, params, hue (fixture -> family index), I (level 0..1), gobo, mode }
  const band = [L.marks.vocal.pos, L.marks.guitar.pos, L.marks.bass.pos, L.marks.keys.pos];
  const onBand = (f, t) => { const m = band[f.i % band.length]; return [m[0], m[1] + 0.3, m[2]]; };
  const hullAt = (f, t) => [8.6, 4.6 + 1.2 * (f.i % 2), f.pos[2] + (f.i % 2 ? 2.5 : -2.5)];
  const mastAt = (f, t) => { const S = P.SHIP, m = [S.masts.fore, S.masts.main, S.masts.fore, S.masts.main, S.masts.mizzen, S.masts.mizzen][f.i % 6]; const w = S.toWorld(0, m.houseTop + 7, m.z); return w; };
  const alt = (f, t) => f.i % 2;                                        // alternate families along a truss
  const altBar = (f, t) => (f.i + Math.floor(beatOf(t) / 4)) % 2;        // ... swapping every bar
  const PROG = {
    dawn: {
      mid: { pat: 'sweep', p: { az: 0, el0: -28, el1: 65, bars: 8, spread: 40 }, hue: alt, I: 0.45, gobo: 3 },
      back: { pat: 'fan', p: { az: 0, el: 62, spread: 70, breathe: true }, hue: () => 0, I: 0.5 },
      floor: { pat: 'pillar', p: { lean: 18 }, hue: () => 1, I: 0.35 },
      tower: { pat: 'fan', p: { az: 0, el: 30, spread: 60 }, hue: () => 0, I: 0.3 },
      mast: { pat: 'circle', p: { az: 0, el: 74, r: 8, beats: 32, phase: 1 }, hue: () => 0, I: 0.6 },
      house: { pat: 'fan', p: { az: -90, el: 58, spread: 50, breathe: true }, hue: () => 0, I: 0.4 },
      front: { pat: 'aim', p: { at: onBand }, hue: () => 1, I: 0.35 },
      pier: { pat: 'aim', p: { at: (f, t) => hullAt(f, t) }, hue: () => 0, I: 0.7 },
      uplight: { pat: 'aim', p: { at: f => f.aimAt }, hue: () => 1, I: 0.5 },
    },
    verse: {
      mid: { pat: 'fan', p: { az: 0, el: 48, spread: 80, breathe: true }, hue: alt, I: 0.6, gobo: g => 1 + g.i % 3, rot: 0.6 },
      back: { pat: 'wave', p: { az: 0, el: 60, spread: 60, amp: 14, beats: 8, phase: 1.2 }, hue: () => 1, I: 0.55 },
      floor: { pat: 'fan', p: { az: 0, el: 70, spread: 50 }, hue: () => 0, I: 0.4 },
      tower: { pat: 'sweep', p: { az: 0, el0: 10, el1: 50, bars: 4, spread: 40 }, hue: () => 1, I: 0.4 },
      mast: { pat: 'circle', p: { az: 0, el: 70, r: 12, beats: 16, phase: 1 }, hue: alt, I: 0.7 },
      house: { pat: 'sweep', p: { az: -90, el0: 30, el1: 75, bars: 8, spread: 40 }, hue: () => 1, I: 0.5 },
      front: { pat: 'aim', p: { at: onBand }, hue: () => 0, I: 0.4 },
      pier: { pat: 'aim', p: { at: (f, t) => hullAt(f, t) }, hue: f => f.i % 2, I: 0.75 },
      uplight: { pat: 'aim', p: { at: f => f.aimAt }, hue: () => 1, I: 0.6 },
    },
    build: {
      mid: { pat: 'wave', p: { az: 0, el: 40, spread: 50, amp: 22, beats: 4, phase: 1.5 }, hue: () => 0, I: 0.8, chase: 'build' },
      back: { pat: 'sweep', p: { az: 0, el0: 15, el1: 85, bars: 2, spread: 50 }, hue: () => 1, I: 0.7 },
      floor: { pat: 'fan', p: { az: 0, el: 68, spread: 60, breathe: true }, hue: () => 0, I: 0.6, chase: 'build' },
      tower: { pat: 'wave', p: { az: 0, el: 35, spread: 40, amp: 18, beats: 2, phase: 1 }, hue: () => 1, I: 0.6 },
      mast: { pat: 'sweep', p: { az: 0, el0: 50, el1: 88, bars: 2, spread: 10 }, hue: () => 0, I: 0.8 },
      house: { pat: 'fan', p: { az: -90, el: 45, spread: 60, breathe: true }, hue: () => 1, I: 0.7 },
      front: { pat: 'aim', p: { at: onBand }, hue: () => 0, I: 0.45 },
      pier: { pat: 'aim', p: { at: (f, t) => hullAt(f, t) }, hue: () => 0, I: 0.85, bump: true },
      uplight: { pat: 'aim', p: { at: f => f.aimAt }, hue: () => 1, I: 0.8 },
    },
    drop: {
      mid: { pat: 'bally', p: { az: 0, el: 45, spread: 60, daz: 25, del: 20, every: 1 }, hue: altBar, I: 1.0 },
      back: { pat: 'fan', p: { az: 0, el: 55, spread: 90, breathe: true }, hue: f => 1 - f.i % 2, I: 1.0 },
      floor: { pat: 'bally', p: { az: 0, el: 66, spread: 50, daz: 18, del: 14, every: 2 }, hue: alt, I: 0.9 },
      tower: { pat: 'sweep', p: { az: 0, el0: 5, el1: 60, bars: 1, spread: 50 }, hue: () => 1, I: 0.9 },
      mast: { pat: 'cross', p: { dx: 24, h: 60, reach: 60, beats: 8 }, hue: alt, I: 1.0 },
      house: { pat: 'bally', p: { az: -90, el: 45, spread: 60, daz: 22, del: 16, every: 2 }, hue: altBar, I: 0.9 },
      front: { pat: 'aim', p: { at: onBand }, hue: () => 1, I: 0.5 },
      pier: { pat: 'aim', p: { at: (f, t) => hullAt(f, t) }, hue: f => f.i % 2, I: 1.0, bump: true },
      uplight: { pat: 'aim', p: { at: f => f.aimAt }, hue: () => 0, I: 1.0, bump: true },
    },
    break: {
      mid: { pat: 'pillar', p: { lean: 6 }, hue: f => (f.i === 3 ? 1 : 0), I: 0.45 },
      back: { pat: 'pillar', p: { lean: 10 }, hue: () => 0, I: 0.4 },
      floor: { pat: 'pillar', p: { lean: 4 }, hue: () => 0, I: 0.3 },
      tower: { pat: 'fan', p: { az: 0, el: 80, spread: 10 }, hue: () => 0, I: 0.0 },
      mast: { pat: 'pillar', p: {}, hue: () => 1, I: 0.6 },
      house: { pat: 'fan', p: { az: -90, el: 80, spread: 20 }, hue: () => 0, I: 0.0 },
      front: { pat: 'aim', p: { at: onBand }, hue: () => 1, I: 0.25 },
      pier: { pat: 'aim', p: { at: (f, t) => hullAt(f, t) }, hue: () => 0, I: 0.5 },
      uplight: { pat: 'aim', p: { at: f => f.aimAt }, hue: () => 1, I: 0.7 },
    },
    bridge: {
      mid: { pat: 'circle', p: { az: 0, el: 55, spread: 60, r: 14, beats: 8, phase: 2 }, hue: alt, I: 0.6 },
      back: { pat: 'circle', p: { az: 0, el: 65, spread: 70, r: 10, beats: 8, phase: -2 }, hue: () => 1, I: 0.55 },
      floor: { pat: 'fan', p: { az: 0, el: 75, spread: 40, breathe: true }, hue: () => 0, I: 0.5 },
      tower: { pat: 'fan', p: { az: 0, el: 25, spread: 30 }, hue: () => 1, I: 0.4 },
      mast: { pat: 'circle', p: { az: 0, el: 76, r: 10, beats: 16, phase: 1 }, hue: () => 0, I: 0.7 },
      house: { pat: 'wave', p: { az: -90, el: 50, spread: 50, amp: 15, beats: 8, phase: 1 }, hue: () => 1, I: 0.5 },
      front: { pat: 'aim', p: { at: onBand }, hue: () => 0, I: 0.35 },
      pier: { pat: 'aim', p: { at: (f, t) => hullAt(f, t) }, hue: f => f.i % 2, I: 0.7 },
      uplight: { pat: 'aim', p: { at: f => f.aimAt }, hue: () => 0, I: 0.7 },
    },
    final: {
      mid: { pat: 'cross', p: { dx: 26, h: 34, reach: 26, beats: 4 }, hue: f => f.i % 3, I: 1.0 },
      back: { pat: 'bally', p: { az: 0, el: 60, spread: 80, daz: 20, del: 15, every: 1 }, hue: f => (f.i + 1) % 3, I: 1.0 },
      floor: { pat: 'fan', p: { az: 0, el: 64, spread: 70, breathe: true }, hue: alt, I: 1.0 },
      tower: { pat: 'bally', p: { az: 0, el: 30, spread: 50, daz: 20, del: 15, every: 1 }, hue: () => 1, I: 1.0 },
      mast: { pat: 'circle', p: { az: 0, el: 70, r: 15, beats: 4, phase: 1 }, hue: () => 1, I: 1.0 },
      house: { pat: 'cross', p: { dx: -60, h: 50, reach: 40, beats: 8 }, hue: f => f.i % 3, I: 1.0 },
      front: { pat: 'aim', p: { at: onBand }, hue: () => 1, I: 0.55 },
      pier: { pat: 'aim', p: { at: (f, t) => hullAt(f, t) }, hue: f => f.i % 3, I: 1.0, bump: true },
      uplight: { pat: 'aim', p: { at: f => f.aimAt }, hue: () => 1, I: 1.0, bump: true },
    },
    outro: {
      mid: { pat: 'fan', p: { az: 0, el: 80, spread: 30 }, hue: alt, I: 0.4, fade: true },
      back: { pat: 'pillar', p: { lean: 12 }, hue: () => 0, I: 0.4, fade: true },
      floor: { pat: 'pillar', p: { lean: 8 }, hue: () => 1, I: 0.3, fade: true },
      tower: { pat: 'fan', p: { az: 0, el: 60, spread: 20 }, hue: () => 0, I: 0.0 },
      mast: { pat: 'pillar', p: {}, hue: () => 0, I: 0.5, fade: true },
      house: { pat: 'fan', p: { az: -90, el: 70, spread: 30 }, hue: () => 1, I: 0.3, fade: true },
      front: { pat: 'aim', p: { at: onBand }, hue: () => 1, I: 0.3, fade: true },
      pier: { pat: 'aim', p: { at: (f, t) => hullAt(f, t) }, hue: () => 0, I: 0.5, fade: true },
      uplight: { pat: 'aim', p: { at: f => f.aimAt }, hue: () => 1, I: 0.5, fade: true },
    },
  };
  // the pier's washes face the ship (-x): their patterns' azimuths are turned round
  const homeTurn = f => (f.group === 'pier' ? 180 : 0);
  const kindOf = f => (f.group === 'mast' || f.group === 'house' ? 'big' : f.group === 'pier' ? 'hull' : f.kind);

  // one fixture's programme state in one section at t: { dir, hue family, level, gobo, rot }
  function inSection(f, s, t) {
    const lk = (s && s.look) || 'dawn', pr = (PROG[lk] || PROG.dawn)[f.group];
    if (!pr) return null;
    const p = homeTurn(f) && pr.p.az !== undefined ? Object.assign({}, pr.p, { az: pr.p.az + 180 }) : pr.p;
    const dir = pat[pr.pat](f, t, p);
    let I = pr.I;
    // a section's own shape: builds ramp up, outros fade, drops bump on the beat where asked
    const u = s ? clamp((t - s.t0) / (s.t1 - s.t0)) : 0;
    if (lk === 'build') I *= 0.55 + 0.45 * u;
    if (pr.fade) I *= 1 - 0.7 * u;
    if (pr.bump) I *= 0.7 + 0.3 * show.pulse(t, { attack: 0.01, decay: 0.18 });
    // chases: one at a time along the truss at a step that speeds up through the build (1/4 -> 1/16 notes)
    if (pr.chase === 'build') {
      const step = u < 0.5 ? 1 : u < 0.8 ? 0.5 : 0.25, k = Math.floor(beatOf(t) / step), on = (k % f.n) === f.i;
      I *= on ? 1 : 0.18;
    }
    const gobo = typeof pr.gobo === 'function' ? pr.gobo(f) : pr.gobo || 0;
    return { dir, fam: pr.hue(f, t), I, gobo, rot: pr.rot ? beatOf(t) * pr.rot * (f.i % 2 ? 1 : -1) : 0 };
  }
  // the fixture's spot state at t (stagelight.js's spec)
  function state(f, t) {
    if (DARK) return null;
    const s = secAt(t), K = KINDS[kindOf(f)];
    // before the show and after it: only the standby looks (no beams moving)
    if (!s) {
      const h = house(t), sb = h.phase === 'show' ? null : standby(f, t, K, h);
      if (!sb) return null;
      const pr = (PROG.dawn || {})[f.group], dir = sb.dir || (pr && pr.pat === 'aim' ? pat.aim(f, t, pr.p) : [0, 1, 0]);
      return { pos: f.lens || f.pos, dir, color: sb.col, intensity: K.I * sb.I, angle: f.group === 'front' ? 16 : K.angle, soft: K.soft, gobo: 0, rot: 0, range: K.range, srcR: K.srcR, beam: (K.beam ?? 1) * BEAM_SHARE * 0.3, landSlack: K.landSlack, stop: K.stop === 0 ? false : undefined };
    }
    const lkS = look(s);
    let a = inSection(f, s, t);
    if (!a) return null;
    let col = lightCol(lkS.hues[a.fam % lkS.hues.length]);
    // the transition from the previous section: positions over two beats, colour over half a beat (a cue's GO)
    const prev = s ? secs[secIdx(s) - 1] : null;
    if (prev && t - s.t0 < 2 * spb) {
      const b = inSection(f, prev, t);
      if (b) {
        const up = sm((t - s.t0) / (2 * spb)), uc = sm((t - s.t0) / (0.5 * spb)), lkP = look(prev);
        a = Object.assign({}, a, { dir: slerp(b.dir, a.dir, up), I: b.I + (a.I - b.I) * uc });
        col = mixc(lightCol(lkP.hues[b.fam % lkP.hues.length]), col, uc);
      }
    }
    // the intro comes up over two beats on the first downbeat (the GO); the energy scales it all a little
    const pre = s === secs[0] ? sm((t - s.t0) / (2 * spb)) : 1, en = 0.75 + 0.25 * (s.energy ?? 0.5);
    // 'hit' accents: every beam to its family's brightest for a beat
    const hit = show.recent('hit', t, spb);
    let I = a.I * pre * en * master(t);
    if (hit.length && hit[hit.length - 1].name !== 'blackout') I = Math.max(I, 1.0 * Math.exp(-(t - hit[hit.length - 1].t) / (0.6 * spb)));
    if (blackout && t >= blackout.t) I = t - blackout.t < 1 / 24 ? 1.0 : 0;
    return {
      pos: f.lens || f.pos, dir: a.dir, color: col, intensity: K.I * I, angle: f.group === 'front' ? 11 : K.angle, soft: K.soft,
      gobo: a.gobo, rot: a.rot, range: K.range, srcR: K.srcR, beam: (K.beam ?? 1) * BEAM_SHARE, landSlack: K.landSlack, stop: K.stop === 0 ? false : undefined,
      halo: (K.halo || 0) * HALO, haloAngle: (f.group === 'front' ? 11 : K.angle) * HALO_ANG,
    };
  }

  // ---- the house (the integrator's pre-show, 2026-10-23): before the first downbeat the rig is at standby (work lights,
  // the hull washed warm white, deep-blue standby on the floor, the screens on their card, a thin residual haze); two bars
  // before it the house goes to half and the hazers start; one bar before it everything goes out; on it the intro comes
  // up (over two beats); six seconds after the last section's end the house comes back up
  const T0 = secs.length ? secs[0].t0 : 0, TEND = secs.length ? secs[secs.length - 1].t1 : 1e9, BAR = 4 * spb;
  function house(t) {
    if (t >= TEND + 6) { const k = sm((t - TEND - 6) / 1.5); return { phase: 'after', work: k, standby: k, hull: k * 0.6, card: k, haze: 0 }; }
    if (t >= T0) return { phase: 'show', work: 0, standby: 0, hull: 0, card: 0, haze: 1 };
    if (t >= T0 - BAR) return { phase: 'out', work: 0, standby: 0, hull: 0, card: 0, haze: sm((t - (T0 - 2 * BAR)) / (16 + 2 * BAR)) };
    if (t >= T0 - 2 * BAR) { const k = 1 - 0.5 * sm((t - (T0 - 2 * BAR)) / 0.6); return { phase: 'half', work: k, standby: k, hull: k, card: k, haze: sm((t - (T0 - 2 * BAR)) / (16 + 2 * BAR)) }; }
    return { phase: 'standby', work: 1, standby: 1, hull: 1, card: 1, haze: 0 };
  }
  // the standby state of the fixtures that have one: deep-blue washes on the floor, the hull and the masts warm white.
  // The hull's at a façade-lighting level, a glow on her side at dusk (0.55 of the show's wash until the tour's cameras:
  // a white ellipse on her bow, her plating flat white from the gap; board/stage/washes.html). ?hullsb= dials it
  const HULL_SB = WV0 ? 0.55 : +(qs.get('hullsb') ?? 0.12);
  const WARM = [1, 0.78, 0.55];
  function standby(f, t, K, h) {
    if (f.group === 'front' && h.standby > 0) return { dir: nrm([L.marks.vocal.pos[0] - 1.5 - f.pos[0], L.F - f.pos[1], -(f.pos[2] - L.deck.zc) * 0.4]), col: lightCol(226, 2.0), I: 0.3 * h.standby };
    if (f.group === 'pier' && h.hull > 0) return { dir: null, col: WARM, I: HULL_SB * h.hull };
    if (f.group === 'uplight' && h.hull > 0) return { dir: null, col: WARM, I: 0.4 * h.hull };
    return null;
  }
  // ---- strobes and blinders: flash windows of at least 1/24 s on the programme's beats
  const FLASH = 1 / 24;
  function strobe(k, t) {
    const s = secAt(t); if (!s || DARK) return 0;
    if (blackout && t >= blackout.t) return t - blackout.t < FLASH ? 1 : 0;
    const lk = s.look, b = beatOf(t), u = (t - s.t0) / (s.t1 - s.t0);
    const win = (step, off = 0) => { const k2 = Math.floor((b - off) / step), tb = show.beatTime(k2 * step + off); return t - tb < FLASH ? k2 : null; };
    if (lk === 'drop' || lk === 'final') {
      const bar = Math.floor(b / 4) - s.bar, last = bar === s.bars - 1;
      if (last) { const w = win(0.25); return w !== null ? 1 : 0; }                   // a 1/16 roll into the next
      if (bar < 8) { const w = win(1); return w !== null ? 1 : 0; }                    // every beat
      const w = win(1, 0.5); return w !== null && (w + k) % 2 === 0 ? 1 : 0;          // pairs on the off-beats
    }
    if (lk === 'build' && u > 0.75) { const w = win(u > 0.9 ? 0.25 : 0.5); return w !== null && (w % 4) === k ? 1 : 0; }
    return 0;
  }
  function blinder(k, t) {
    if (DARK) return 0;
    const h = show.recent('hit', t, 1.2).filter(e => e.name === 'blinders');
    if (!h.length) return 0;
    const dt = t - h[h.length - 1].t;
    // a tungsten cell: up in ~60 ms with a small overshoot, a 300 ms tail (show.md §2.2)
    return dt < 0.06 ? dt / 0.06 * 1.1 : 1.1 * Math.exp(-(dt - 0.06) / 0.3);
  }
  // the section's two colours for the screens (the LED wall, the wings): the key family's tones, the accent's
  function screenState(t) {
    const s = secAt(t), lk = look(s), b = beatOf(t);
    const prev = s ? secs[secIdx(s) - 1] : null;
    const u = s && prev ? sm((t - s.t0) / (0.5 * spb)) : 1;
    // the build's chevrons: their phase integrated over the section's beats, 0.2 cycles a beat rising to 0.6 at its end
    // (<= 1.3 Hz a pixel at 128 BPM: under WCAG 2.3.1's three flashes a second with margin); a fade from a build keeps its
    // last phase moving at 0.6
    const chevOf = (sec, beat) => { const bs = Math.max(0, beat - 4 * sec.bar), N = 4 * sec.bars; return Math.min(bs, N) * 0.2 + Math.min(bs, N) ** 2 * 0.2 / N + Math.max(0, bs - N) * 0.6; };
    const chev = s && look(s).wall === 2 ? chevOf(s, b) : prev && look(prev).wall === 2 ? chevOf(prev, b) : 0;
    return {
      chev, look: lk, prevLook: prev ? look(prev) : lk, fade: u, beat: b, bar: Math.floor(b / 4), phase: b - Math.floor(b), energy: s ? s.energy : 0.15,
      secU: s ? (t - s.t0) / (s.t1 - s.t0) : 0, pulse: show.pulse(t, { attack: 0.005, decay: 0.16 }), on: s ? (s === secs[0] ? sm((t - s.t0) / (2 * spb)) : 1) : 0, card: s ? 0 : house(t).card,
      dark: DARK || (blackout && t >= blackout.t + FLASH) ? 1 : 0,
    };
  }
  // the haze's glow (rig.js): the section's key family, saturated (step 2.4), at the section's energy, bumped on the beat
  // in the high-energy looks; off before the show, out after the blackout
  function hazeGlow(t) {
    const s = secAt(t); if (!s || DARK || (blackout && t >= blackout.t)) return { I: 0, col: [0, 0, 0] };
    const lk = look(s), prev = secs[secIdx(s) - 1], u = prev ? sm((t - s.t0) / (0.5 * spb)) : 1;
    const c1 = lightCol(lk.hues[0], 2.4), c0 = prev ? lightCol(look(prev).hues[0], 2.4) : c1;
    const e = s.energy ?? 0.5, hi = e > 0.8;
    return { I: (0.35 + 0.65 * e) * (hi ? 0.8 + 0.2 * show.pulse(t, { attack: 0.01, decay: 0.25 }) : 1), col: mixc(c0, c1, u) };
  }
  // the toners (rig.js): LED pars on the towers lighting the deck, the risers and the towers' legs, each in one of the
  // section's families (fam 0 the key, 1 the accent; saturated, step 2.6), at the section's energy, up on the GO with the
  // rig, a fade of half a beat between sections; off before the show and after the blackout
  function toner(t, fam) {
    const s = secAt(t); if (!s || DARK || (blackout && t >= blackout.t)) return { I: 0, col: [0, 0, 0] };
    const lk = look(s), prev = secs[secIdx(s) - 1], u = prev ? sm((t - s.t0) / (0.5 * spb)) : 1;
    const hue = l => l.hues[fam % l.hues.length], c1 = lightCol(hue(lk), 2.6), c0 = prev ? lightCol(hue(look(prev)), 2.6) : c1;
    const pre = s === secs[0] ? sm((t - s.t0) / (2 * spb)) : 1;
    return { I: (0.55 + 0.45 * (s.energy ?? 0.5)) * pre, col: mixc(c0, c1, u) };
  }
  // ---- the front of house (foh.js). The follow spots' operators: who each picks up, when, and how wide. The demo song has
  // no vocal stem, so the vocal sings from the first verse to the end of the first drop and from the second verse to the
  // outro; the intro and the break are the band's. FS1 rides the vocal: head and shoulders in the verses and the bridge,
  // half body in the builds and the outro, full body in the drops and the final. FS2 takes the features: the guitar in the
  // break, the guitar then the bass in the drops (a pick-up at the halfway), swapping every four bars in the final. A
  // pick-up fades in over 0.35 s on its downbeat; an iris change opens over a beat; a release fades over the last two
  // beats (0.25 s before a swap); the spot pre-aims in the dark; out before the show and at the blackout.
  // follow(t, i) -> { on 0..1, who, d (the spot's diameter at the mark, m) } or null
  const FS_D = { verse: 1.0, pre: 1.5, drop: 2.3, bridge: 1.0, final: 2.3, outro: 1.5 }, FBAR = 4 * spb;
  const fsSegs = [[], []];
  for (const s of secs) {
    const k = s.name.replace(/\d+$/, '');
    if (FS_D[k]) fsSegs[0].push({ t0: s.t0, t1: s.t1, who: 'vocal', d: FS_D[k] });
    if (k === 'drop') { const h = s.t0 + 8 * FBAR; fsSegs[1].push({ t0: s.t0, t1: h, who: 'guitar', d: 2.0 }, { t0: h, t1: s.t1, who: 'bass', d: 2.0 }); }
    if (k === 'break') fsSegs[1].push({ t0: s.t0, t1: s.t1, who: 'guitar', d: 1.6 });
    if (k === 'final') for (let b = 0; s.t0 + b * FBAR < s.t1 - 1e-6; b += 4) fsSegs[1].push({ t0: s.t0 + b * FBAR, t1: Math.min(s.t1, s.t0 + (b + 4) * FBAR), who: (b / 4) % 2 ? 'bass' : 'guitar', d: 2.0 });
  }
  // runs: touching segments on one performer are one pick-up (their iris changes); a run ends in a release or a swap
  const fsRuns = fsSegs.map(L => {
    const runs = [];
    for (const g of L) {
      const r = runs[runs.length - 1];
      if (r && r.who === g.who && Math.abs(r.t1 - g.t0) < 1e-6) { r.t1 = g.t1; r.segs.push(g); } else runs.push({ who: g.who, t0: g.t0, t1: g.t1, segs: [g] });
    }
    runs.forEach((r, i) => { const n = runs[i + 1]; r.swap = !!(n && Math.abs(n.t0 - r.t1) < 1e-6); });
    return runs;
  });
  function follow(t, i) {
    if (DARK || (blackout && t >= blackout.t)) return null;
    const runs = fsRuns[i]; if (!runs.length) return null;
    let k = runs.findIndex(r => t < r.t1); if (k < 0) k = runs.length - 1;
    const r = runs[k];
    if (t < r.t0 || t >= r.t1) return { on: 0, who: r.who, d: r.segs[0].d };          // (dark: pre-aimed at the next)
    const up = sm((t - r.t0) / 0.35), down = r.swap ? sm((r.t1 - t) / 0.25) : sm((r.t1 - t) / (2 * spb));
    let j = r.segs.findIndex(g => t < g.t1); if (j < 0) j = r.segs.length - 1;
    const g = r.segs[j], gp = r.segs[j - 1], d = gp ? gp.d + (g.d - gp.d) * sm((t - g.t0) / spb) : g.d;
    const pre = secs.length && t - secs[0].t0 < 2 * spb ? sm((t - secs[0].t0) / (2 * spb)) : 1;
    return { on: Math.min(up, down) * pre, who: r.who, d };
  }
  // the front washes (foh.js): the downstage line's light for faces, steady through the show: a warm white with a
  // quarter of the section's key in it (a pale tint of the key itself went olive on the dark gear in the gold looks),
  // a little up with the energy; up on the GO, off before the show and at the blackout
  function frontWash(t) {
    const s = secAt(t); if (!s || DARK || (blackout && t >= blackout.t)) return { I: 0, col: [0, 0, 0] };
    const lk = look(s), prev = secs[secIdx(s) - 1], u = prev ? sm((t - s.t0) / (0.5 * spb)) : 1;
    const W = [1.0, 0.96, 0.92], tint = h => mixc(W, lightCol(h), 0.25);
    const c1 = tint(lk.hues[0]), c0 = prev ? tint(look(prev).hues[0]) : c1;
    const pre = s === secs[0] ? sm((t - s.t0) / (2 * spb)) : 1;
    return { I: (0.85 + 0.15 * (s.energy ?? 0.5)) * pre, col: mixc(c0, c1, u) };
  }
  return { state, strobe, blinder, screenState, secAt, PROG, KINDS, kindOf, BEAM_SHARE, hazeGlow, toner, follow, frontWash, fsRuns, house, T0, TEND };
}
