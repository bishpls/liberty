// liberty/src/stage/index.js: the concert (B5): the stage on No. 2 hatch, its rig, the lights, lasers, pyro and special
// effects, and the ship's guns' fire and smoke, every effect on the show's one schedule (ctx.show). briefs/stage.md;
// board/stage/notes.md holds the state and the decisions.
//   layout.js     every placement (from the plan)        structure.js  decks, towers, grid, PA, backline, barge
//   mats.js       the materials                          proxy.js      a stand-in ship (?stageproxy=1, before the hull lands)
// ctx.mods.stage = { marks, sounds, lights, measures, ... }
import { makeLayout, shipGround } from './layout.js';
import { stageMats } from './mats.js';
import { buildStructure } from './structure.js';
import { buildProxy } from './proxy.js';
import { buildRig } from './rig.js';
import { buildFOH } from './foh.js';
import { buildScreens } from './screens.js';
import { buildLasers } from './lasers.js';
import { makeFx } from './fx.js';
import { makePyro, confettiLanding, windOf } from './pyro.js';
import { baked } from 'scene3d/bake.js';
import { makeGuns } from './guns.js';
import { makeStageMeasures } from './measure.js';
import { buildDress } from './dress.js';
import { DARK } from './cues.js';

const T = window.THREE;
const q = new URLSearchParams(location.search);

export const CAMS = {
  stage_apron: { pos: [15.5, 4.55, -27.7], at: [4, 12.5, -27.7], lens: 24, note: 'stage: from the apron\'s middle at eye height, square to the stage' },
  stage_deck: { pos: [6.8, 11.2, -42.5], at: [3.0, 12.5, -27.7], lens: 24, note: 'stage: from the foredeck by the foremast house, the stage and its rig in three-quarter' },
  stage_water: { pos: [-62, 3.5, -2], at: [0, 13, -27], lens: 28, note: 'stage: from the water off her port side, the barge, the back of the rig' },
  stage_band: { pos: [8.6, 12.0, -27.7], at: [-2, 13.2, -27.7], lens: 20, note: 'stage: from the lip, the band\'s view upstage: the wall, the drums, the grid' },
  stage_top: { pos: [2, 60, -27.7], at: [2, 0, -27.69], lens: 28, note: 'stage: plan from above' },
  stage_port: { pos: [-125, 16, -70], at: [0, 13, -8], lens: 28, note: 'stage: the whole ship from the water off her port bow: the guns fire this way, the barge, the rig' },
  stage_gun5: { pos: [-9, 15.5, 42], at: [-6, 14, 70], lens: 24, note: 'stage: the 5"/38 from her port quarter deck, the flash and the smoke' },
  stage_roof: { pos: [34, 26, -66], at: [2, 13, -26], lens: 28, note: 'stage: from the shed\'s roof north of the stage, the ship as the set' },
  // the effects, each where it reads (the board's strips)
  stage_fx_gun5: { pos: [-42, 13, 92], at: [-5, 15, 60], lens: 35, note: 'stage: the 5"/38 firing to port, from off her port quarter' },
  stage_fx_gun3: { pos: [-38, 14, -92], at: [-3, 16.5, -63], lens: 35, note: 'stage: the 3"/50 firing to port, from off her port bow' },
  stage_fx_gun20: { pos: [-30, 19, 10], at: [-5, 17.5, -3], lens: 35, note: 'stage: the house-top Oerlikons, from off her port side' },
  stage_fx_barge: { pos: [-58, 6, -6], at: [-27, 2.5, -24], lens: 35, note: 'stage: the pyro barge and its mortars, from the water' },
  stage_fx_rail: { pos: [34, 21, -92], at: [5, 11, -38], lens: 28, note: 'stage: over the shed\'s north end, along her starboard side forward of the stage: flames, rail gerbs, the deck mortars on No. 1' },
  stage_front: { pos: [17.6, 12.2, -27.7], at: [3, 12.6, -27.7], lens: 24, note: 'stage: a crane over the apron at the stage\'s height: the floor, the band\'s marks, the lip\'s cold sparks, the strobes' },
  stage_fx_comet: { pos: [14.5, 4.6, -12], at: [2, 22, -30], lens: 24, note: 'stage: comets and CO2 over the stage, from the apron' },
  stage_fx_mast: { pos: [-62, 18, -18], at: [0, 22, -28], lens: 35, note: 'stage: the mast gerbs on the crosstrees, from off her port side' },
  stage_pier: { pos: [17.0, 4.55, -12.5], at: [6.0, 13.0, -29.5], lens: 28, note: 'stage: from the apron in the crowd, toward the stage: the follow spots crossing from the FOH tower' },
  stage_foh: { pos: [11.6, 4.2, -16.5], at: [16.6, 9.5, -32.0], lens: 24, note: 'stage: the FOH tower at the back of the apron, against the shed\'s wall' },
  stage_foh_tower: { pos: [11.8, 17.8, -25.0], at: [16.6, 15.4, -32.0], lens: 35, note: 'stage: the FOH tower\'s platform close: the follow spots, the washes under its edge, the scrim, the ties' },
  stage_fohop: { pos: [15.2, 17.0, -31.4], at: [7.25, 12.0, -27.7], lens: 35, note: 'stage: over the follow-spot operators\' shoulders, the stage at ~10 m' },
};

// the stage's own random views (render.mjs --loop=stagewander~SEED~HOUR, t = the view's index): round the stage, on her
// deck at eye height, on the apron, low on the water, high, and close to the rig and the gear, each at a random moment of
// the show (so its effects vary): the 'good from any camera' test of this part of the world
export async function loops(LOOPS, ctx) {
  const name = q.get('loop') || '';
  if (!name.startsWith('stagewander')) return;
  const { frame, placeCamera, blit } = await import('scene3d/host.js');
  const { rng } = await import('scene3d/util.js');
  const [, seed = '1', hr = '19.1'] = name.split('~');
  const L = ctx.mods.stage.layout, P = ctx.P, zc = L.deck.zc, kinds = ['deck', 'apron', 'water', 'high', 'close'];
  const view = i => {
    const cu = ctx.mods.stage.rig.cues, r = rng(+seed * 1009 + i * 31), k = kinds[i % kinds.length], t = cu.T0 - 20 + r() * (cu.TEND - cu.T0 + 30);
    const ga = (x, z) => (ctx.heightAt ? ctx.heightAt(x, z) : 0);
    let pos, at;
    if (k === 'deck') { const x = r.range(-7.5, 7.5), z = r.range(-58, -6); pos = [x, ga(x, z) + 1.6, z]; at = [r.range(-2, 8), r.range(11, 18), zc + r.range(-6, 6)]; }
    else if (k === 'apron') { const x = r.range(11.2, 18.2), z = r.range(-70, 20); pos = [x, P.PIER.deck + 1.6, z]; at = [r.range(-2, 8), r.range(11, 22), zc + r.range(-10, 10)]; }
    else if (k === 'water') { const a = r.range(Math.PI * 0.55, Math.PI * 1.45), d = r.range(30, 160); pos = [Math.cos(a) * d - 9, r.range(0.8, 4), zc + Math.sin(a) * d]; at = [0, r.range(10, 20), zc + r.range(-25, 25)]; }
    else if (k === 'high') { const a = r.range(0, Math.PI * 2), d = r.range(25, 110); pos = [Math.cos(a) * d, r.range(25, 70), zc + Math.sin(a) * d]; at = [r.range(-4, 8), r.range(9, 15), zc + r.range(-8, 8)]; }
    else { const f = L.fixtures[Math.floor(r() * L.fixtures.length)], q3 = r.onSphere(); const d = r.range(1.5, 5); pos = [f.pos[0] + q3[0] * d, Math.max(f.pos[1] + q3[1] * d, ga(f.pos[0], f.pos[2]) + 0.5), f.pos[2] + q3[2] * d]; at = f.pos; }
    // (not under the stage's decks: a close camera there sees only the skirt's back)
    const D = L.deck; if (pos[0] > D.x0 - 0.3 && pos[0] < D.x1 + 0.3 && pos[2] > D.z0 - 0.3 && pos[2] < D.z1 + 0.3 && pos[1] < L.F + 0.3) pos[1] = L.F + 1.6;
    return { cam: { pos, at, lens: k === 'close' ? 20 : r.range(20, 40) }, t, k };
  };
  LOOPS[name] = i => { const v = view(Math.round(i)); placeCamera(ctx.SCENE.camera, v.cam); frame(v.t, { hour: +hr }); blit(`${v.k} · t ${v.t.toFixed(1)} · [${v.cam.pos.map(x => x.toFixed(0)).join(', ')}]`); };
  LOOPS[name].len = 20;
}

export async function build(world, ctx) {
  const t0 = performance.now();
  const P = ctx.P, show = ctx.show;
  const hull = ctx.mods.hull && !ctx.mods.hull.failed && ctx.mods.hull.deckAt ? ctx.mods.hull : null;
  let proxy = null;
  if (!hull && q.get('stageproxy') === '1') proxy = buildProxy(world, P);
  const G = shipGround(P, hull);
  const deck = ctx.mods.deck && !ctx.mods.deck.failed ? ctx.mods.deck : null;
  const L = makeLayout(P, G, deck);
  const M = stageMats(world);
  const st = buildStructure(world, M, L, P, G);
  if (world.stage) for (const m of st.stoppers) { m.updateMatrixWorld(true); world.stage.stopper(m); }
  // the haze (show.md R8; style C7: only where the beams are): two hazers upstage on the port deck, upwind; the wind
  // (WSW 3.4 m/s, toward +x and a little -z) carries it over the starboard side to the pier and forward along her
  const W = P.WATER.wind, wd = P.atBearing(W.from + 180, 1);
  // near: shafts fade in over 3 m from the eye (a beam passing a camera close by laid an out-of-focus wash over the
  // frame's edge); the halos (the glow round each beam, cues.js) a deeper hue than their cores and at most 1.5 deg wide as
  // the eye sees them, so a beam passing close keeps a glow that hugs it (the director, 2026-10-23: the first cut's glow
  // 'interesting but overpowering'). ?hazenear= ?halosat= ?haloscreen= for A/Bs
  const qh = new URLSearchParams(location.search);
  world.stage.haze = { density: 0.030, g: 0.30, box: [-14, 8.5, -72, 34, 58, 4], edge: 9, noise: 0.55, drift: [wd[0] * W.speed * 0.5, wd[1] * W.speed * 0.5],
    near: +(qh.get('hazenear') ?? 3) };
  world.stage.halo = { sat: +(qh.get('halosat') ?? 1), screen: +(qh.get('haloscreen') ?? 1.5) };
  const rig = buildRig(world, M, L, ctx);
  const foh = new URLSearchParams(location.search).get('foh') === '0' ? null : buildFOH(world, M, L, ctx, rig.cues);   // (?foh=0: none, for A/Bs)
  const screens = buildScreens(world, L, rig.cues, M);
  const lasers = buildLasers(world, M, L, ctx, rig.cues);
  // the effects: one set of renderers, every effect evaluated from its cue each frame
  const F = makeFx(world);
  // the confetti's landing (raycasts on the stoppers: the bake cache keeps it, keyed on the stoppers' boxes, the wind,
  // the cannons and the code)
  const stopKey = world.stage.stoppers.map(m => { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; m.updateMatrixWorld(true);
    const e = m.matrixWorld.elements; return [m.geometry.attributes.position.count, ...b.min.toArray(), ...b.max.toArray(), e[12], e[13], e[14]].map(v => Math.round(v * 100)); });
  const landing = await baked('liberty-stage-confetti', { sources: [import.meta.url, './pyro.js', './layout.js'],
    inputs: { stops: stopKey, wind: windOf(P), cannons: L.confetti, hullTop: !!(hull && hull.topAt) } }, () => confettiLanding(L, ctx, world.stage, windOf(P)));
  const pyro = makePyro(world, L, ctx, F, landing);
  const guns = makeGuns(world, L, ctx, F, pyro.wind);
  world.onFrame(t => { F.begin(); if (!DARK) { pyro.draw(t); guns.draw(t); lasers.spotsAt(t, F); } F.end(); });
  // the haze: a thin residue before the show; the hazers start with the house to half and fill it over the intro
  world.onFrame(t => { world.stage.haze.density = 0.010 + 0.020 * rig.cues.house(t).haze; });
  const sounds = pyro.sounds.concat(guns.sounds).sort((a, b) => a.t - b.t);
  const dress = buildDress(world, M, L, ctx);

  const marks = {};
  for (const [k, m] of Object.entries(L.marks)) marks[k] = { pos: m.pos.map(v => +v.toFixed(3)), face: m.face.map(v => +v.toFixed(3)) };
  const measures = {
    deck: { x: [+L.deck.x0.toFixed(2), L.deck.x1], z: [+L.deck.z0.toFixed(2), +L.deck.z1.toFixed(2)], floor: L.F, platforms: st.counts.platforms,
      legs: { n: st.legs.length, min: Math.min(...st.legs), max: Math.max(...st.legs) }, source: 'show.md S2: 4 x 8 ft platforms, legs 28-48 in (0.71-1.22 m) or scaffold' },
    stairs: st.stairs, towers: st.towers, grid: st.grid, pa: st.pa, barge: st.barge, cases: st.cases, cables: st.cables, extinguishers: st.extinguishers,
    tris: { structure: st.tris, byMaterial: st.counts },
    buildMs: +(performance.now() - t0).toFixed(0), proxy: !!proxy,
  };
  measures.guns = guns.measures;
  measures.dress = dress;
  measures.sounds = { n: sounds.length, byKind: sounds.reduce((o, s) => (o[s.kind] = (o[s.kind] || 0) + 1, o), {}) };
  const mod = { marks, layout: L, measures, sounds, lights: L.fixtures.map(f => ({ group: f.group, kind: f.kind, pos: f.pos })), fx: F, rig, pyro, guns, foh };
  mod.measure = makeStageMeasures(ctx.SCENE, mod);
  return mod;
}
