// liberty/src/life/index.js: the birds of the waterfront in the air and on their perches, their evening, and their answer
// to the show (B7; briefs/life.md). Files: species.js (who, their numbers and sources), habitat.js (the berth as they see
// it: rasters of what's drawn, perches, roost groups, hot zones, the show's blasts, the wind's lift), flight.js (tracks
// and the flyer), sim.js (the populations and their baseline loop), startle.js (the show's excursions), render.js (the
// kit's birds drawn), moths.js (moths in the lamps and the beams), measure.js (the measures and the boards' loops).
// Board: projects/liberty/board/life/ (index.html, notes.md).
//
// What later modules read: ctx.mods.life = { sounds: [{ t, kind, pos, level, note }], events: [{ t, kind, ... }] (the
// reel's moments: pelicans passing her bow, a gull landing on her bow rail, the flushes), measures, birdAt(id, t), ... }
import { baked } from 'scene3d/bake.js';
import { rng, hash1 } from 'scene3d/util.js';
import { buildHabitat } from './habitat.js';
import { simulate, LB } from './sim.js';
import { startle } from './startle.js';
import { makeRender } from './render.js';
import { makeMoths } from './moths.js';
import { SPECIES } from './species.js';
import { lifeMeasures, lifeLoops } from './measure.js';

export const CAMS = {
  life_bow_rail: { pos: [14.5, 13.8, -57.5], at: [3.3, 13.0, -64.3], lens: 35, note: "her forecastle's starboard rail from over the apron's edge, where a gull lands in the pre-show (t 150)" },
  life_pelicans: { pos: [-12, 1.6, -104], at: [-60, 2.6, -62], lens: 35, note: 'low on the water off her bow, looking west into the afterglow: the plunge (t 67.8), the line passing her bow (t 72) as silhouettes' },
  life_shed_soar: { pos: [13.5, 4.6, -146], at: [11, 19, -112], lens: 28, note: "the gulls slope-soaring along the shed's west wall past her bow" },
  life_ridge: { pos: [21.0, 18.5, -136.0], at: [27.2, 15.4, -118.0], lens: 35, note: "the shed's ridges' gulls and her rails from over her port bow (they flush at t 372: the Oerlikons' stand-to)" },
  life_mainmast: { pos: [-9, 15, -4], at: [0, 20, -17], lens: 35, note: "the mainmast's yards and crosstree, where gulls roost until the first blast" },
  life_piles: { pos: [86, 5, -120], at: [72.3, 3, -100], lens: 35, note: "cormorants on the pier's east fender piles, drying their wings" },
  life_pigeons: { pos: [30, 6, 185], at: [40, 12, 150], lens: 28, note: "the pigeons on the bulkhead building's street cornice, and their flock wheeling at sunset" },
  life_moths: { pos: [14.6, 7.4, -133.8], at: [18.0, 8.0, -137.6], lens: 40, note: "a wall pack on the shed's west wall at night: the moths in its light" },
  life_beams: { pos: [-7.5, 12.2, -40.0], at: [1.0, 19.0, -30.0], lens: 28, note: "under the rig from her port deck at night: moths in the beams near their lenses" },
  life_apron_aft: { pos: [16.2, 4.6, -4.0], at: [6.0, 22.0, 60.0], lens: 24, note: "a person on the apron looking aft and up at her stern, the 5\"/38 and the shed's south ridge: the flush at t 372-376" },
  life_flush: { pos: [-95, 18, -150], at: [10, 32, -60], lens: 24, note: "the berth from off her port bow, low: the flocks circling after the first blasts (t 372-460)" },
};

export async function build(world, ctx) {
  const t0 = performance.now();
  const H = buildHabitat(world, ctx);
  const show = ctx.show;
  // the simulation's inputs (the bake's key): the perches, groups, zones, the show's loud events and their times (the
  // integrator: re-run when they move), a fingerprint of the coarse raster, the code
  const fp = (() => { let h = 0; const R = H.coarse; for (let i = 0; i < R.top.length; i += 97) h = (Math.imul(h, 31) + Math.round(R.top[i] * 10)) | 0; return h; })();
  const r2 = v => Math.round(v * 100) / 100;
  const inputs = {
    LB, perches: H.perches.map(p => [p.kind, ...p.p.map(r2), r2(p.yaw), p.hot ? 1 : 0]), groups: H.groups.map(g => [g.id, ...g.c.map(r2), g.R, ...g.h.map(r2)]),
    loud: H.loud.map(e => [e.kind, r2(e.t), ...e.pos.map(r2), r2(e.L1), e.rounds || 0]), zones: H.zones.map(z => [z.kind, r2(z.t0), r2(z.t1), ...z.c.map(r2), r2(z.y ?? 0), r2(z.r)]),
    ledges: (H.ledges || []).map(l => [...l.p.map(r2), r2(l.yaw)]), piles: (H.pierPiles || []).map(p => p.map(r2)), taken: H.taken.birds.length, fp,
    showStart: show ? show.start ?? 0 : 0, showDur: show ? r2(show.duration) : 0, wind: H.wind.toward.map(r2),
  };
  const res = await baked('liberty-life', { sources: [import.meta.url, './sim.js', './startle.js', './flight.js', './species.js', './habitat.js', '../../../../engine/scene3d/kit/creature/presets.js', './pins.js'], inputs }, () => {
    const sim = simulate(H, { seed: 20261031 });
    const st = startle(H, sim, { seed: 777 });
    return { birds: sim.birds, events: sim.events, lines: sim.lines, timing: sim.timing, LB: sim.LB, lifted: sim.lifted, startle: st.stats, startleSounds: st.sounds, TL: st.TL };
  });
  const sim = { birds: res.birds, events: res.events, lines: res.lines, LB: res.LB };
  const R = makeRender(world, ctx, sim, H);
  world.onFrame((t, camera) => R.update(t, camera || ctx.SCENE.camera));
  // moths: in the lamps' pools and the stage's beams at night
  const moths = makeMoths(world, ctx, H);
  world.onFrame((t, camera) => moths.update(t, camera || ctx.SCENE.camera));
  // ---- the water's rings: the pelican's plunges and take-offs, the cormorants' dives and surfacings, landings on it
  const water = H.water;
  if (water && water.ripple) {
    const TMAX = 1800;
    for (const b of sim.birds) {
      const spans = b.base || [];
      for (let k = 0; k * LB < TMAX; k++) for (const s of spans) {
        if (s.type !== 'still' || (s.pose !== 'water' && s.pose !== 'under')) continue;
        const t = s.t0 + k * LB; if (t < 0 || t > TMAX) continue;
        const big = b.sp === 'pelican' && s.pose === 'water';
        water.ripple({ x: s.at[0], z: s.at[2], t0: t, a: big ? 0.9 : 0.35, kind: 'splash', size: big ? 0.6 : 0.25 });
      }
    }
  }
  // ---- sounds: the flushes (startle.js), calls from the ship's roosting gulls and the visitors, the flock's claps, the
  // pelican's plunges (B4's roosts call already: pier.sounds)
  const sounds = res.startleSounds.slice();
  const Rs = rng(5151), T1 = Math.max(res.TL || 0, show ? show.duration + 300 : 900);
  const callers = sim.birds.filter(b => (b.cls === 'resident' && b.src === 'ship') || b.cls === 'visitor' || b.cls === 'soarer');
  for (let t = 1 + Rs() * 5; t < T1 && callers.length; t += 3 + Rs() * 9) {
    const b = callers[Math.floor(Rs() * callers.length)], st = R.trackAt(b, t), S = SPECIES[b.sp];
    if (st.pose === 'away') continue;
    sounds.push({ t: +t.toFixed(2), kind: S.calls.kind, pos: st.p.map(v => +v.toFixed(1)), level: S.calls.level, note: `a ${S.name} (${b.cls}) calling (estimated level)`, bird: b.id });
  }
  for (const e of sim.events) {
    for (let k = 0; k * LB < T1; k++) {
      const t = e.t + k * LB;
      if (e.kind === 'pigeons_wheel') sounds.push({ t: +t.toFixed(2), kind: 'pigeon_clap', pos: [e.at[0], 11, e.at[1]], level: +(SPECIES.pigeon.calls.wingsLevel + 10 * Math.log10(e.n)).toFixed(1), n: e.n, note: 'the flock off the cornice, wings clapped (estimated)' });
      if (e.kind === 'pelican_dives') sounds.push({ t: +t.toFixed(2), kind: 'pelican_splash', pos: e.at, level: 88, note: 'a brown pelican plunging (estimated)' });
    }
  }
  sounds.sort((a, b) => a.t - b.t);
  // ---- events for the reel (the pre-show's moments and the flushes), in scene time
  const events = sim.events.slice();
  for (const f of summariseFlushes(res.startle.flushes)) events.push(f);
  events.sort((a, b) => a.t - b.t);
  const out = { sounds, events, H, sim, render: R, moths, LB, TL: res.TL, startle: res.startle, timing: res.timing, lifted: res.lifted, buildMs: 0 };
  out.birdAt = (id, t) => { const b = sim.birds.find(x => x.id === id || x.i === id); return b ? R.stateAt(b, t) : null; };
  out.measures = lifeMeasures(ctx, out);
  out.measures.buildMs = Math.round(performance.now() - t0);
  out.measures.habitatMs = H.ms;
  ctx.SCENE.life = out;
  return out;
}
// the flushes by blast: when, how many, how far the wave rolled (the sound's 343 m/s)
function summariseFlushes(F) {
  const by = new Map();
  for (const f of F) { const k = `${f.kind}@${f.t}`; if (!by.has(k)) by.set(k, []); by.get(k).push(f); }
  const out = [];
  for (const [k, L] of by) {
    const r = L.map(f => f.response).sort((a, b) => a - b);
    out.push({ t: +L[0].t.toFixed(3), kind: 'flush', by: L[0].kind, n: L.length, first: r[0], last: r[r.length - 1], reach: Math.max(...L.map(f => f.dist)) });
  }
  return out;
}

export function loops(LOOPS, ctx) { lifeLoops(LOOPS, ctx); }
