// liberty/src/water/index.js: the bay (B3): its surface from under the pier to the horizon, the physics under it, the
// anime way it is drawn, what touches it and what lives on it. briefs/water.md; board/water/notes.md holds the state.
//   spectrum.js  the wind sea: JONSWAP components on the dispersion relation, Doppler-shifted by the ebb (pure in t)
//   field.js     the maps baked at build: obstacles, the fetch per direction (the local sea state), the current's flow
//                round the berth, the hull's distance field
//   surface.js   the polar grid round the eye and the wave GLSL; shade.js the colour (physics, then the anime treatment)
// ctx.mods.water = { ripple, level, heightAt, slopeAt, seaState, current, sounds, measures, ... }
import { makeSpectrum, spectrumFacts, measureSpectrum, surfaceAt, fetchHs, fetchPeak, NQ } from './spectrum.js';
import { bakeField, fieldTextures, fieldSamplers, loadDEM, demSampler, fallbackWaterline } from './field.js';
import { polarGrid, waveUniforms, lutTile, VERTEX_GLSL, TILE_VERT, TILE_FRAG, TILE, NRIP, NWAKE, NSEG } from './surface.js';
import { SHADE_GLSL } from './shade.js';
import { lin } from 'scene3d/util.js';
import { makeVoyages, buildBoats } from './boats.js';
import { buildLife } from './life.js';
import { makeStatePass } from './state.js';
import { makeLightPasses } from './lights.js';
import { pileWakeMap } from './piles.js';
import { bakeObstacleField, flowUniforms, flowPhysics, FLOW_SOURCES } from 'scene3d/flow.js';
import { placeCamera, frame } from 'scene3d/host.js';

const T = window.THREE;
const q = new URLSearchParams(location.search);
export const CAMS = {
  water_lee: { pos: [-14, 2.2, 30], at: [-4, 1.0, -30], lens: 28, note: 'water: along her port side at the waterline, looking forward (the lee, the froth line, her side reflecting the chop)' },
  water_tip: { pos: [-30, 6, -170], at: [60, 0, -320], lens: 24, note: 'water: off the pier tip, the open bay chop' },
  water_gap: { pos: [9.7, 4.6, -62], at: [9.7, 0.0, -34], lens: 24, note: 'water: down the 2.1 m gap between her starboard side and the pier (the lee: still water, her side and the fenders mirrored)' },
  water_low: { pos: [-60, 0.8, -40], at: [0, 2, 10], lens: 35, note: 'water: a boat camera 0.8 m over the water, the ship beyond' },
  water_rail: { pos: [-8.0, 11.2, -50], at: [-45, 0, -62], lens: 35, note: 'water: a person at her port rail by No. 1 hatch, eye height, looking down at the water off her side (a sea lion t 40-90 s)' },
  water_lion: { pos: [-30, 2.6, -8], at: [-50, 0, -36], lens: 35, note: 'water: off her port side at the water, a sea lion surfacing (t 30-90 s) and the kelp drifting past the bow' },
  water_traffic: { pos: [36, 5.5, -150], at: [60, 0, -372], lens: 35, note: 'water: from the pier tip, the dinner cruise passing at ~370 m (t 90-115 s), her Kelvin wake' },
  water_blast: { pos: [-75, 26, 125], at: [0, 0, 45], lens: 24, note: 'water: off her port quarter, high: the 5"/38 blast ring running out over the water (its first shot at 375.73 s, read from the show)' },
  water_piles_top: { pos: [6, 30, -150], at: [6, 0, -149.9], lens: 35, note: 'water: straight down on the NW corner of the tip (x 11, z -144): the wakes of the piles trailing west on the ebb' },
  water_piles: { pos: [-6, 2.2, -127], at: [8, 0, -146], lens: 35, note: 'water: off the pier tip, low, across the ebb: the piles in the current, their wakes, the V and the eddies' },
  water_gulls: { pos: [-8, 3.0, -168], at: [-42, 4, -205], lens: 35, note: 'water: the gulls rafting off the pier tip, flushing at the first 5-inch shot (375.73 s; heard ~1 s later)' },
  water_wake_top: { pos: [-40, 70, -260], at: [70, 0, -380], lens: 28, note: 'water: above the dinner cruise at t ~100 s: the wedge of the wake and its cusps' },
};

export async function build(world, ctx) {
  const t0 = performance.now();
  const P = ctx.P, W = P.WATER, pipe = world.pipe;
  const dirOf = b => P.atBearing(b, 1);
  const spec = makeSpectrum({ Hs: W.chop.Hs, Tp: W.chop.Tp, windFrom: W.wind.from, windSpeed: W.wind.speed, current: W.current, dirOf });
  // the surroundings: the hull's waterline (the hull module, else the fallback), the pier's solids and decks
  const hull = ctx.mods.hull && !ctx.mods.hull.failed ? ctx.mods.hull : null, pier = ctx.mods.pier && !ctx.mods.pier.failed ? ctx.mods.pier : null;
  const waterline = hull && hull.waterline && hull.waterline.length > 8 ? hull.waterline : fallbackWaterline(P.SHIP);
  // the pier module's works: its breakwaters are walls (solid: a strip 3 m wide), Pier 39 and Piers 33 and 31 stand on
  // piles (decks: the wind stops, the waves pass under losing themselves)
  const strip = ([a, b], w) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2; return [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]]; };
  const ol = pier && pier.outlines;
  const solids = ((pier && pier.solids) || []).concat(ol && ol.breakwaters ? ol.breakwaters.map(seg => strip(seg, 3)) : []);
  const decks = (pier && pier.decks) ? pier.decks.filter(x => x && x.length > 2) : (ol ? [ol.pier39, ol.pier33, ol.pier31].filter(x => x && x.length > 2) : []);
  const [nearDem, farDem] = await Promise.all([loadDEM('near'), loadDEM('far')]);
  const tf = performance.now();
  const F = await bakeField({ P, spec, waterline, solids, decks, nearDem, farDem });
  const field_ms = Math.round(performance.now() - tf);
  const TX = fieldTextures(F, nearDem, farDem, [lutTile(spec, NQ)]), S = fieldSamplers(F);
  // the piles in the ebb (piles.js): only those in a current and under the sky; their wakes are flow.js's, below
  const tPW = performance.now();
  const PW = pier && pier.piles ? pileWakeMap(pier.piles, (x, z) => S.env(x, z), { hullAt: (x, z) => S.hull(x, z) }) : { live: 0, piles: 0, tex: null };
  PW.ms = Math.round(performance.now() - tPW);
  // the current past obstacles (engine/scene3d/flow.js, round 8): the live piles (in an ebb over 0.25 m/s, under the sky,
  // 8 m clear of her side: piles.js) and the pyro barge once the stage module has placed it (the first frame: it builds
  // after the water). Her two ends only with ?wflowhull=1: the ebb crosses her broadside there (-x against her length
  // along z), which a disc can't draw (a 10 m disc's crescent ran along her side as a bright line, tour 50 s)
  const curAt = (x, z) => { const e = S.env(x, z); return e && (e.sky ?? 1) > 0.3 ? [e.vx, e.vz] : null; };
  const obstacles = (PW.livePiles || []).map(([x, z, r]) => ({ x, z, d: 2 * r, kind: 'pile' }));
  if (hull && waterline.length > 8 && q.get('wflowhull') === '1') {
    const zs = waterline.map(p => p[1]), zmin = Math.min(...zs), zmax = Math.max(...zs);
    for (const [zEnd, sgn] of [[zmin, 1], [zmax, -1]]) {
      const zi = zEnd + sgn * 10, xs = waterline.filter(p => Math.abs(p[1] - zi) < 1.5).map(p => p[0]);
      const end = waterline.reduce((a, p) => (Math.abs(p[1] - zEnd) < Math.abs(a[1] - zEnd) ? p : a));
      if (xs.length >= 2) obstacles.push({ x: end[0], z: end[1] + sgn * 0.25 * (Math.max(...xs) - Math.min(...xs)), d: Math.max(...xs) - Math.min(...xs), kind: 'hull end' });
    }
  }
  // (?wflowtest=x,z,d: a test cylinder of diameter d at (x, z), for the model's calibration against the literature)
  if (q.get('wflowtest')) { const [x, z, d] = q.get('wflowtest').split(',').map(Number); obstacles.push({ x, z, d, kind: 'test' }); }
  const wantFlow = q.get('wpiles') !== '0' && q.get('wflow') !== '0';
  let flowField = wantFlow ? bakeObstacleField({ obstacles, currentAt: curAt }) : null, flowBarge = false;

  // ---- the surface
  const grid = polarGrid({ r0: 0.3, rFine: +(q.get('wrfine') || 300), rMax: P.WORLD.far, seg: 192 });
  const rip = Array.from({ length: NRIP }, () => new T.Vector4()), ripB = Array.from({ length: NRIP }, () => new T.Vector4());
  const wkA = Array.from({ length: NWAKE }, () => new T.Vector4()), wkB = Array.from({ length: NWAKE }, () => new T.Vector4());
  const wkTrack = Array.from({ length: NWAKE * NSEG }, () => new T.Vector4());
  const nb = F.box, sb = F.sdfBox;
  const LOOK = {
    body: lin ? lin('#0c3a33') : [0.006, 0.042, 0.033],
    absorb: [1.6, 0.9, 1.1],
  };
  // the bands' tiles: one layer a band, rendered each frame at the frame's time, mipmapped (the surface is filtered where it
  // is finer than the pixel, and the mips' mean square slope is the roughness: LEAN mapping)
  const NBND = spec.bands.length;
  const tiles = new T.WebGLArrayRenderTarget(TILE, TILE, NBND, { type: T.HalfFloatType, depthBuffer: false });
  Object.assign(tiles.texture, { minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter, wrapS: T.RepeatWrapping, wrapT: T.RepeatWrapping, generateMipmaps: true, anisotropy: +(q.get('waniso') || 2) });
  const tileMat = new T.ShaderMaterial({ uniforms: { uC: { value: Array.from({ length: 16 }, () => new T.Vector4()) }, uN: { value: 0 }, uL: { value: 1 } },
    vertexShader: TILE_VERT, fragmentShader: TILE_FRAG, depthTest: false, depthWrite: false });
  const tScene = new T.Scene(), tCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), tQuad = new T.Mesh(new T.PlaneGeometry(2, 2), tileMat);
  tQuad.frustumCulled = false; tScene.add(tQuad);
  const renderTiles = t => {
    const r = pipe.renderer, prev = r.getRenderTarget();
    spec.bands.forEach((b, layer) => {
      const C = tileMat.uniforms.uC.value;
      b.comps.forEach((ci, j) => { const c = spec.comps[ci]; let ph = (c.ph - c.wa * t) % (2 * Math.PI); C[j].set(c.kl[0], c.kl[1], c.a, ph); });   // (the tile in the band's turned frame)
      tileMat.uniforms.uN.value = b.comps.length; tileMat.uniforms.uL.value = b.L;
      r.setRenderTarget(tiles, layer); r.render(tScene, tCam);
    });
    r.setRenderTarget(prev);
  };
  const U = Object.assign(waveUniforms(spec), { uTiles: { value: tiles.texture },
    uGrid: { value: new T.Vector4(grid.r0, grid.ratio, grid.seg, +(q.get('wdisp') ?? 160)) },
    uNearBox: { value: new T.Vector4(nb.x0, nb.z0, nb.x0 + nb.nx * nb.h, nb.z0 + nb.nz * nb.h) },
    uFarBox: { value: new T.Vector4(F.far.x0, F.far.x0, F.far.n * F.far.h, 0) },
    uSdfBox: { value: new T.Vector4(sb.x0, sb.z0, sb.x0 + sb.nx * sb.h, sb.z0 + sb.nz * sb.h) },
    uQTex: { value: TX.qT.tex }, uQR: { value: TX.qT.rects.map(r => new T.Vector4(...r)) }, uQSize: { value: new T.Vector2(...TX.qT.size) },
    uEnvTex: { value: TX.eT.tex }, uER: { value: TX.eT.rects.map(r => new T.Vector4(...r)) }, uESize: { value: new T.Vector2(...TX.eT.size) },
    uMaskNear: { value: pier ? 0 : 1 }, uMaskFar: { value: 1 }, uMaskHull: { value: hull ? 0 : 1 },
    uRip: { value: rip }, uRipB: { value: ripB }, uNumRip: { value: 0 },
    uWkA: { value: wkA }, uWkB: { value: wkB }, uNumWk: { value: 0 }, uWkTrack: { value: wkTrack }, uWkBox: { value: Array.from({ length: NWAKE }, () => new T.Vector4()) },
    uMinor: { value: Array.from({ length: 16 }, () => new T.Vector4()) }, uMinorC: { value: Array.from({ length: 16 }, () => new T.Vector4()) }, uNumMinor: { value: 0 },
    uHullRefl: { value: new T.Vector4(0.85, 2.0, 1, 0) },
    uDbg: { value: new T.Vector4(64, 1, 0, +(q.get('wdbg') || 0)) },
    uWS: { value: Array.from({ length: 80 }, () => new T.Vector4()) }, uNumWS: { value: 0 }, uDbg2: { value: new T.Vector4(...(q.get('wdbg2') || '0,0,0,0').split(',').map(Number)) },
    uRefr: { value: pipe.RT_REFR.texture }, uG: { value: pipe.RT_G.texture },
    uReflMatrix: pipe.U.uReflMatrix || (pipe.U.uReflMatrix = { value: new T.Matrix4() }),
    uBody: { value: new T.Vector3(...LOOK.body) }, uAbsorb: { value: new T.Vector3(...LOOK.absorb) },
    // the look's dials (shade.js): anime on (x), dash bands per e-fold of distance (y), the dash threshold (z), the plate's
    // grazing mirror (w); glint threshold, crest lines, foam, swell shapes; spot pools, lamp pools, glitter, tone spread
    uLook: { value: new T.Vector4(+(q.get('wanime') ?? 1), 9, 2.5, 0.2) },
    uLook2: { value: new T.Vector4(1, 1, 1, 1) },
    uLook3: { value: new T.Vector4(1, 1, 1, 0.3) },
    uPlate: { value: new T.Vector4(...(q.get('wplate') || '0.7,0.5,0.12,0.55').split(',').map(Number)) },
    uSteps: { value: new T.Vector4(...(q.get('wsteps') || '0.3,0.55,1.0,1.9').split(',').map(Number)) }, uCuts: { value: new T.Vector3(0.58, 0.86, 1.22) }, uWindDir: { value: new T.Vector2(...spec.windDir) }, uFoam: { value: new T.Vector3(0.16, 0.24, 0.34) },
    uBodySky: { value: new T.Vector4(...(q.get('wbodysky') || '0.5,0.35').split(',').map(Number), 0, 0) },   // (the drawn night body: shade.js murk)
  });
  // the lights' reflection (lights.js): the glitter the sea's facets make of every light in the planar reflection, as the
  // physics has it (B3's round 6, the integrator's: a drawing of the physical reference, not a different answer)
  const LP = makeLightPasses(pipe, q);
  // (the reflection's depth, for the lights' parallax: the engine's own float depth texture on its reflection target,
  // opt-in, from the first frame (pipeline.js setReflDepth, 475e7391e); ?wocc=0 off: every light far)
  if (pipe.setReflDepth) pipe.setReflDepth(q.get('wocc') !== '0');
  // (the light sprites' true energy in the mirror's pass (B5's festoon, B6's far lights): uMirrorPx, the frame's pixels a
  // texel of the reflection's target; 0 (?wcov=0) leaves them as the frame draws them: a 2-px point many times its light)
  const mirrorPx = () => (window.__wMirrorPx != null ? window.__wMirrorPx : q.get('wcov') === '0' ? 0 : 1 / (pipe.reflScale || 0.5));   // (window.__wMirrorPx: a measurement's override)
  (world.U.uMirrorPx || (world.U.uMirrorPx = { value: 0 })).value = mirrorPx();
  // (uMirrorFar: the far city's sprites in the mirror at their true light too (0; far/sprites.js). 1, their direct view's
  // light (a 2-px point many times its own) was the anime gain the director passed on review2 and reversed on the second
  // cut (2026-10-23): part of what threw the city's dashes. ?wfar=1 brings it back)
  (world.U.uMirrorFar || (world.U.uMirrorFar = { value: 0 })).value = +(q.get('wfar') ?? 0);
  U.uReflDash = { value: pipe.RT_REFL.texture }; U.uReflEx = { value: LP.exRT.texture }; U.uLight = { value: LP.glitRT.texture };
  U.uPileTone = { value: +(q.get('wpiletone') ?? 0.45) };   // (the obstacles' wake marks: how far a mark moves the plate's value, x(1 +- this): shade.js)
  flowUniforms(flowField, U);
  // (the lights' reflection's named gain over the physics, shade.js: 1.25, the glitter pass's measured shortfall against
  // the exact single scatter, per visible reflection 0.54-1.12 over round 6's 13 frames (median 0.75): its parallax search
  // half-misses lights a few metres off the water seen from afar. At 1.25 every frame's median lies in 0.67-1.40)
  U.uLightGain = { value: +(q.get('wgain') || 1.25) };
  // (the drawn lights' energy as the reflection sees it, x uSourceK (?wsource=): a lamp or a lit window is drawn at a
  // display-limited radiance (a 2-px dot near white), where every photograph's lights clip far below their true light.
  // Fitted (round 7) so the reflections relate to their sources as in photographs of the waterfront at night: the
  // streaks' brightest tenth 0.29-0.64 of the lit sources' brightness over the sky (median 0.5), with the slopes' spread
  // fitted alongside (lights.js uSlopeK))
  U.uSourceK = { value: +(q.get('wsource') || 2.4) };
  U.uStroke = { value: new T.Vector4(...(q.get('wstroke') || '1,8,0,3').split(',').map(Number)) };   // (the near water's strokes: on, the most a pixel's light is raised, -, the local mean's mip level: shade.js)
  // (SPOTS 0: the engine's light loops none of the stage's spots for a surface with no albedo; the water culls its own.
  // SELF_SHADED: the water computes all its own light: an engine with that opt-in skips shade() for it, ~1 ms at 1080p)
  // the sea's state, the first pass (state.js): the waves, the events and the wakes into three targets the shading reads
  // (two passes: 0.2-0.3 ms under one at 1080p without W4's glints, 0.5-0.7 ms with them (the one program's registers,
  // not its arithmetic, set the cost); ?wpass=1 draws it in one, the same picture within half-float rounding: notes.md)
  const twoPass = q.get('wpass') !== '1', state = twoPass ? makeStatePass(pipe, U, grid.geo) : null;
  if (state) { U.uState0 = { value: state.textures[0] }; U.uState1 = { value: state.textures[1] }; U.uState2 = { value: state.textures[2] }; }
  const mats = world.mat({ name: 'water', lines: 0, uniforms: U, noFog: q.get('wnofog') === '1', defines: Object.assign({ SPOTS: 0, WCOST: +(q.get('wcost') || 0) }, q.get('wself') === '0' ? {} : { SELF_SHADED: 1 }, q.get('wmask') === '0' ? {} : { WATER_MASK: 1 }, q.get('wlod0') ? { WDBG_LOD0: 1 } : {}, twoPass ? { WATER_TWO_PASS: 1 } : {}), vertex: VERTEX_GLSL, varyings: 'varying float vRing;', surface: SHADE_GLSL });
  const mesh = world.mesh(grid.geo, mats, { cast: false, gbuf: false, reflect: false, trans: true, gbufAfter: true, name: 'water' });
  // its bounds follow the eye (the grid is placed under it in the vertex shader): a bounded reader lets the pipeline
  // scissor the reflection to where water can show and cull what can't reach it (pipeline.js _reflRegion)
  grid.geo.boundingBox = new T.Box3(); grid.geo.boundingSphere = new T.Sphere(new T.Vector3(), P.WORLD.far * 1.5);
  const fitBounds = cam => { const c = cam.position, R = P.WORLD.far; grid.geo.boundingBox.min.set(c.x - R, -1.5, c.z - R); grid.geo.boundingBox.max.set(c.x + R, 1.5, c.z + R); grid.geo.boundingSphere.center.set(c.x, 0, c.z); };
  mesh.renderOrder = 10;
  mesh.userData.readsReflection = true;
  mesh.userData.wLights = { LP, state, U };     // (for in-page checks: B3's probes)
  mesh.onBeforeRender = (renderer, scene, camera, geometry, material) => {
    if (material !== mats.color) return;
    if (state) state.render(renderer, camera);
    world.U.uMirrorPx.value = mirrorPx();
    U.uReflDash.value = pipe.RT_REFL.texture;
    // (the barge joins the obstacles once the stage module has placed it: its width across the current, at its middle)
    if (wantFlow && !flowBarge && ctx.mods.stage && !ctx.mods.stage.failed) {
      flowBarge = true; const bg = ctx.mods.stage.barge || (ctx.mods.stage.measures || {}).barge;   // (the stage's measures carry it: { at, footprint })
      if (bg && bg.footprint && q.get('wflowbarge') !== '0') {
        const c = curAt(bg.at[0], bg.at[1]);
        if (c) { const u = Math.hypot(c[0], c[1]) || 1, nx = -c[1] / u, nz = c[0] / u, w = bg.footprint.map(([x, z]) => x * nx + z * nz);
          obstacles.push({ x: bg.at[0], z: bg.at[1], d: Math.max(...w) - Math.min(...w), kind: 'barge' });
          const old = flowField; flowField = bakeObstacleField({ obstacles, currentAt: curAt }); flowUniforms(flowField, U);
          if (old && old.tex) { old.tex.dispose(); old.dir.dispose(); } }
      }
    }
    U.uLight.value = LP.glitRT.texture;
    if (q.get('wlights') === '0' || !state) return;
    LP.render(renderer, camera, state.textures[0], state.rt);
    // (window.__wRefLight: a measurement's override, B3's review boards: the frame with the lights' reflection replaced by
    // the exact single scatter computed off-line, a texture at the glitter pass's size, its strokes off. The passes still
    // run: the plate takes the mirror image less its lights from them)
    if (window.__wRefLight) { U.uLight.value = window.__wRefLight; U.uStroke.value.x = 0; U.uLightGain.value = 1; }   // (the exact needs no calibration gain)
  };

  // ---- events: ripple() for anyone; the show's guns and mortars on their own (one schedule)
  const RIPPLES = [];
  const kinds = { splash: 0, blast: 1 };
  const ripple = ({ x, z, y = 0, t0, a = 1, kind = 'splash', size = 0.3, reach = 120, key = null }) => {
    // a second call for the same event (the stage builder's blast for a shot the water already drew) moves it there
    if (key) { const o = RIPPLES.find(r => r.key === key); if (o) { Object.assign(o, { x, z }); return o; } }
    const r = { x, z, y, t0, a, kind: kinds[kind] ?? 0, size, reach, key };
    RIPPLES.push(r); RIPPLES.sort((u, v) => u.t0 - v.t0);
    return r;
  };
  const show = ctx.show, deck = ctx.mods.deck && !ctx.mods.deck.failed ? ctx.mods.deck : null;
  // the guns: every round's time and its muzzle then (the deck module's: muzzle(t) -> { p, d }), else the show's events at
  // the plan's places (the 5"/38 on her stern, the 3"/50 on her bow, the Oerlikons along her sides). Each blast's ring is
  // centred under the muzzle; it reaches the water when the sphere from the muzzle does (its height in the ring's maths)
  const P_GUN = { gun5: [0, 11, 60], gun3: [0, 12, -62] };
  const blasts = (kind, a, reach) => {
    const g = deck && deck.guns && deck.guns[kind];
    const list = Array.isArray(g) ? g : g ? [g] : [];
    if (list.length && list.some(x => x.shots && x.shots.length)) {
      list.forEach((gg, gi) => (gg.shots || []).forEach(t => { const m = gg.muzzle(t), p = m.p || m; ripple({ x: p[0], z: p[2], y: p[1], t0: t, a, kind: 'blast', reach, key: kind === 'gun20' ? `${kind}#${gi}@${t.toFixed(3)}` : `${kind}@${t.toFixed(3)}` }); }));   // (B5's stage keys the big guns' rings gun5@t, gun3@t: one ring a shot)
      return 'deck';
    }
    if (!show) return 'none';
    for (const e of show.events(kind)) {
      if (kind === 'gun20') {
        for (let r = 0; r < (e.rounds || 5); r++) for (const gi of e.guns || [0]) ripple({ x: gi % 2 ? 8 : -8, z: -30 + (gi >> 1) * 20, y: 9, t0: e.t + r * 0.133, a, kind: 'blast', reach, key: `${kind}#${gi}@${(e.t + r * 0.133).toFixed(3)}` });
      } else { const [x, y, z] = P_GUN[kind]; ripple({ x, z, y, t0: e.t, a, kind: 'blast', reach, key: `${kind}@${e.t.toFixed(3)}` }); }
    }
    return 'show';
  };
  const gunSource = { gun5: blasts('gun5', 1.0, 170), gun3: blasts('gun3', 0.6, 100), gun20: blasts('gun20', 0.2, 30) };
  // the mortars (BRIEF): 'port' from the pyro barge ~20 m off her port side (a burst a few metres up, its debris falling
  // in), 'stbd' on No. 1 and No. 3 hatch covers, 'bow' and 'stern' on her platforms: their blast reaches the water
  if (show) for (const e of show.events('mortar')) {
    const at = e.at || 'port', n = e.n || 1;
    for (let k = 0; k < n; k++) {
      const x = at === 'port' ? -29 + (k - (n - 1) / 2) * 1.5 : at === 'stbd' ? 2.5 : 0;
      const z = at === 'bow' ? -58 : at === 'stern' ? 58 : at === 'stbd' ? (k % 2 ? -10 : -45) : -20 + (k - (n - 1) / 2) * 3;
      const y = at === 'port' ? 2 : 10;
      ripple({ x, z, y, t0: e.t, a: 0.45, kind: 'blast', reach: 60, key: `mortar@${e.t.toFixed(3)}#${at}${k}` });
      if (at === 'port') for (let j = 0; j < 5; j++) ripple({ x: x + Math.sin(j * 2.4 + k) * 3, z: z + Math.cos(j * 2.4 + k) * 3, t0: e.t + 0.7 + j * 0.06, a: 0.35, kind: 'splash', size: 0.15 });
    }
  }
  const stats = { ripplesLive: 0 };
  // the stage's spots that can touch the water: the engine's table (stagelight.js: five texels a spot) culled to the cones
  // that meet y = 0 within their range (a point source or a flash: within its range of the water), the nearest 16
  const wsCull = (cam) => {
    const st = pipe.U.uSpotTex, n = pipe.U.uNumSpots ? pipe.U.uNumSpots.value : 0;
    if (!st || !n) { U.uNumWS.value = 0; return; }
    const d = st.value.image.data, keep = [];
    for (let i = 0; i < n; i++) {
      const o = i * 20, py = d[o + 1], range = d[o + 3], dy = d[o + 5], cosO = d[o + 7];
      if (py <= 0 || range <= 0) continue;
      let reach;
      if (cosO <= 0.5) reach = py;                                     // (a point source: straight down)
      else { const th = Math.acos(Math.min(1, cosO)), al = Math.asin(Math.max(-1, Math.min(1, -dy))), low = al + th; if (low <= 0) continue; reach = py / Math.sin(Math.min(low, Math.PI / 2)); }
      if (reach > range * 2) continue;
      keep.push([Math.hypot(d[o] - cam.position.x, d[o + 2] - cam.position.z), o]);
    }
    keep.sort((a, b) => a[0] - b[0]);
    const m = Math.min(16, keep.length);
    for (let k = 0; k < m; k++) { const o = keep[k][1]; for (let j = 0; j < 5; j++) U.uWS.value[k * 5 + j].set(d[o + j * 4], d[o + j * 4 + 1], d[o + j * 4 + 2], d[o + j * 4 + 3]); }
    U.uNumWS.value = m; stats.spotsOnWater = m; stats.spotsLive = n;
  };
  world.onFrame((t, cam) => {
    // (the far land is built after the water: once it is, its terrain bounds the bay and the far mask stands down)
    if (U.uMaskFar.value > 0 && ctx.mods.far && !ctx.mods.far.failed) U.uMaskFar.value = 0;
    renderTiles(t);
    if (cam) fitBounds(cam);
    if (cam) wsCull(cam);
    U.uRefr.value = pipe.RT_REFR.texture; U.uG.value = pipe.RT_G.texture;
    const live = [], cx = cam ? cam.position.x : 0, cz = cam ? cam.position.z : 0;
    for (const r of RIPPLES) {
      const age = t - r.t0, life = r.kind === 1 ? 1.2 : 12;
      if (age < 0 || age > life) continue;
      live.push([Math.hypot(r.x - cx, r.z - cz) / Math.max(r.a, 0.05), r]);
    }
    if (live.length > NRIP) live.sort((a, b) => a[0] - b[0]);
    const n = Math.min(NRIP, live.length);
    for (let i = 0; i < n; i++) { const r = live[i][1]; rip[i].set(r.x, r.z, r.t0, r.a); ripB[i].set(r.kind, r.kind === 1 ? r.reach : r.size, r.y || 0, 0); }
    U.uNumRip.value = n; stats.ripplesLive = live.length;
  });

  // ---- what others read
  const heightAt = (x, z, t = 0) => surfaceAt(spec, x, z, t, { qAt: S.qAt, minLambda: 0.25 }).h;
  const slopeAt = (x, z, t = 0) => { const r = surfaceAt(spec, x, z, t, { qAt: S.qAt, minLambda: 0.25 }); return [r.sx, r.sz]; };
  const seaState = (x, z) => {
    const qv = S.qAt(x, z), qm = Math.exp(qv.reduce((a, v) => a + Math.log(Math.max(v, 1)), 0) / 8);
    return { q: qv, Hs: null, qMean: qm };
  };
  // ---- the traffic (boats.js): voyages over the hour, the meshes, their wakes and ticks, the wakes' slaps on her side
  // (a boat's track stays on the water: the DEMs, the near box's solids and decks, clear of the berth)
  const nearH = demSampler(nearDem, 6000, 12), farH = demSampler(farDem, 50000, 100);
  const isWater = (x, z) => {
    if (x > -60 && x < 120 && z > -230 && z < 200) return false;
    const e = S.env(x, z); if (!e.outside && (e.solid > 0.2 || e.cover > 0.2)) return false;
    const h = nearH(x, z) ?? farH(x, z) ?? -50; return h < -2.0;
  };
  const voyages = makeVoyages(P, { isWater });
  const fleet = q.get('wboats') === '0' ? { meshes: [], sounds: [] } : buildBoats(world, ctx, { voyages, heightAt, U, NWAKE, NSEG });
  // (each wake's bounding box for the shader: its track and the wedge's spread)
  world.onFrame((t, cam) => {
    const cam0 = cam ? cam.position : null;
    // (the boats' lights the water ticks: those within 1.5 km of the eye, nearest first)
    if (cam0) {
      const M = U.uMinor.value, C = U.uMinorC.value, n = U.uNumMinor.value, keep = [];
      for (let k = 0; k < n; k++) { const d = Math.hypot(M[k].x - cam0.x, M[k].z - cam0.z); if (d < 1500) keep.push([d, M[k].clone(), C[k].clone()]); }
      keep.sort((a, b) => a[0] - b[0]); keep.forEach(([, m, c], k) => { M[k].copy(m); C[k].copy(c); }); U.uNumMinor.value = keep.length;
    }
    for (let i = 0; i < U.uNumWk.value; i++) {
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (let k = 0; k < NSEG; k++) { const v = wkTrack[i * NSEG + k]; const w = 0.36 * Math.min(v.z, 800) + 8; x0 = Math.min(x0, v.x - w); x1 = Math.max(x1, v.x + w); z0 = Math.min(z0, v.y - w); z1 = Math.max(z1, v.y + w); }
      // (a wake whose boat is beyond 2.5 km of the eye is not drawn: an empty box)
      const a = U.uWkA.value[i]; if (cam0 && Math.hypot(a.x - cam0.x, a.y - cam0.z) > 2500) { x0 = 1; x1 = 0; }
      U.uWkBox.value[i].set(x0, z0, x1, z1);
    }
  });
  // ---- the life on the water (life.js): kelp and debris on the ebb, sea lions surfacing, gulls afloat
  // (the show's loud events for the gulls afloat, from the blasts' own rings: where the sound starts (the muzzle, the
  // mortar) and its level at 1 m, B5's (show.levels) else life's defaults; life/startle.js's rule in life.js)
  const L1d = { gun5: 184.5, gun3: 178.5, gun20: 168.5, mortar: 174 };
  const loud = RIPPLES.filter(r => r.kind === 1 && r.key).map(r => { const k = r.key.split(/[@#]/)[0]; return { t: r.t0, pos: [r.x, r.y || 0, r.z], L1: (show && show.levels && show.levels[k]) || L1d[k] || 170 }; });
  const life = q.get('wlife') === '0' ? { meshes: [], sounds: [], measures: {} } : buildLife(world, ctx, { F, S, heightAt, ripple, P, loud });
  // ---- measures: the field against the sources at named places
  const places = {
    open_bay_north: [-150, -850], off_the_tip: [10, -250], port_side: [-20, 0], port_bow: [-15, -60],
    lee_gap: [9.7, 0], under_pier: [40, 0], off_pier_east: [100, -40],
  };
  const measures = { spectrum: spectrumFacts(spec), field_ms, bake: F.ms, current_solve: { iters: F.current.iters, resid: +F.current.resid.toExponential(2) } };
  measures.reference = measureSpectrum(spec, { at: [0, 0] });
  measures.places = {};
  for (const [name, [x, z]] of Object.entries(places)) {
    const e = S.env(x, z), qv = S.qAt(x, z);
    const fetchDown = F.nearF[3] ? sampleF(F, 3, x, z) : null, fetchDown2 = F.nearF[4] ? sampleF(F, 4, x, z) : null;
    const m = q.get('wmeasure') === '0' ? {} : measureSpectrum(spec, { qAt: () => qv, at: [x, z], label: name });
    measures.places[name] = { Hs: m.Hs, Tp: m.Tp, TpFixed: m.TpFixed, slopeVar: m.slopeVar, fetchDownwind_m: fetchDown !== null ? Math.round((fetchDown + fetchDown2) / 2) : null,
      current: [+e.vx.toFixed(3), +e.vz.toFixed(3)], speed: +Math.hypot(e.vx, e.vz).toFixed(3), skyUnderDeck: +(e.sky ?? 1).toFixed(3) };
  }
  measures.fetchLaw = { note: 'JONSWAP fetch law at the plan wind: Hs = 0.0016 U sqrt(F/g), Tp = 2 pi / (22 (g^2 / U F)^(1/3))', berth230m: { Hs: +fetchHs(spec.U, 230).toFixed(4), Tp: +(2 * Math.PI / fetchPeak(spec.U, 230)).toFixed(3) } };
  measures.grid = { tris: grid.tris, rings: grid.rings, seg: grid.seg };
  measures.flow = () => ({ obstacles: flowField ? flowField.live.length : 0, texels: flowField && flowField.texels, h: flowField && flowField.h,
    kinds: flowField ? flowField.live.reduce((a, o) => { const k = o.kind || 'pile'; (a[k] = a[k] || { n: 0, d: [], U: [] }).n++; a[k].d.push(+o.d.toFixed(2)); a[k].U.push(+o.U.toFixed(2)); return a; }, {}) : {},
    live: flowField ? flowField.live.map(o => [o.x, o.z, o.d, o.U, o.ux, o.uz, o.kind]) : [],
    physics: (U, d) => flowPhysics(U, d), sources: FLOW_SOURCES });
  measures.piles = { piles: PW.piles, inCurrent: PW.live, livePiles: (PW.livePiles || []).map(p => p.slice(0, 6).map(v => +v.toFixed(3))), ms: PW.ms, note: 'piles in an ebb over 0.25 m/s, under the sky (> 0.3) and over 8 m from her side; their wakes are flow.js\'s (measures.flow): ripple marks in the plate\'s tones (the bow hump, the V, the near wake\'s Karman eddies at Strouhal 0.2), foam at the face only above a diameter Froude number of 0.8' };
  // the mooring lines (the pier's catenaries, chock to bitts): how near the water they come; they never reach it
  if (pier && pier.lines) measures.moorings = pier.lines.map(L => ({ z: L.z, span: L.span ?? null, lowest_m: L.chock && L.bollard ? +Math.min(L.chock[1], L.bollard[1]).toFixed(2) : null }));
  measures.life = life.measures;
  // the traffic: voyages, redraws, track points off the water (0 wanted); boats under way within 1.5 km of her over the hour
  { let mn = 99, sum = 0, n = 0, empty = 0;
    for (let t = 0; t < 3600; t += 5) { let c = 0; for (const voy of voyages) for (const vy of voy) if (t >= vy.t0 && t <= vy.t1) { const s0 = (t - vy.t0) * vy.v, k = vy.pts.findIndex(p => p[2] >= s0); const p = vy.pts[Math.max(0, k)]; if (Math.hypot(p[0], p[1]) < 1500) c++; } mn = Math.min(mn, c); sum += c; n++; if (!c) empty++; }
    measures.traffic = Object.assign({}, voyages.stats, { within1500m: { min: mn, mean: +(sum / n).toFixed(2), emptyShare: +(empty / n).toFixed(3) }, wakeSlaps: fleet.sounds.length }); }
  measures.build_ms = Math.round(performance.now() - t0);
  if (q.get('wtest') === '1') testFixture(world, ctx, waterline);
  return {
    // (beds: the steady sources the soundscape loops, levels estimated at 1 m: no measured source for a pile's gurgle or
    // her side's lap in a 2 cm chop; a pile's rises 20 log10 with the current)
    beds: (PW.loud || []).map(p => ({ kind: 'pile_gurgle', pos: [+p.x.toFixed(1), 0, +p.z.toFixed(1)], level: +(52 + 20 * Math.log10(p.U / 0.5)).toFixed(1), current: p.U, note: 'estimated' }))
      .concat([-60, -20, 20, 60].map(z => ({ kind: 'hull_lap', pos: [-9, 0, z], level: 50, note: 'estimated: her port side in the lee chop (Hs ~2 cm)' }))),
    ripple, level: () => P.WATER.level, heightAt, slopeAt, seaState, current: (x, z) => { const e = S.env(x, z); return [e.vx, e.vz]; },
    hullDist: (x, z) => S.hull(x, z), spec, field: F, samplers: S, mesh, mats, U, stats, sounds: fleet.sounds.concat(life.sounds).sort((a, b) => a.t - b.t), measures, waterline, voyages, boats: fleet.meshes, life: life.meshes,
  };
}
function sampleF(F, b, x, z) {
  const B = F.box, fx = (x - B.x0) / B.h - 0.5, fz = (z - B.z0) / B.h - 0.5;
  const i = Math.max(0, Math.min(B.nx - 1, Math.round(fx))), j = Math.max(0, Math.min(B.nz - 1, Math.round(fz)));
  return F.nearF[b][j * B.nx + i];
}

// ?wtest=1: lights and a hull proxy to look at the water by, until the others' modules land (never in the film)
function testFixture(world, ctx, waterline) {
  const P = ctx.P;
  const mat = (name, rgb, emis = [0, 0, 0]) => world.mat({ name, uniforms: { uC: { value: new T.Vector3(...rgb) }, uE: { value: new T.Vector3(...emis) } },
    surface: `uniform vec3 uC; uniform vec3 uE; void smain(inout Surface s, vec3 P, vec3 V) { s.albedo = uC; s.emissive = uE; }` });
  const hasHull = ctx.mods.hull && ctx.mods.hull.waterline;
  if (!hasHull && q.get('whull') !== '0') {
    // her hull as a prism on the waterline, 9 m of freeboard
    const shape = new T.Shape(waterline.map(([x, z]) => new T.Vector2(x, -z)));
    const g = new T.ExtrudeGeometry(shape, { depth: 9.5, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, -1.5, 0);
    world.mesh(g, mat('wtest hull', [0.16, 0.17, 0.18]), { name: 'wtest hull' });
  }
  const post = mat('wtest post', [0.2, 0.2, 0.2]);
  const bulb = mat('wtest bulb', [0, 0, 0], [6, 4.6, 2.6]);
  for (let z = -130; z <= 120 && q.get('wposts') !== '0'; z += 20) {
    const x = P.PIER.x0 + 0.6, y = P.PIER.deck;
    const g = new T.BoxGeometry(0.15, 4, 0.15); g.translate(x, y + 2, z); world.mesh(g, post, { name: 'wtest post' });
    const s2 = new T.SphereGeometry(0.22, 12, 8); s2.translate(x, y + 4.1, z); world.mesh(s2, bulb, { name: 'wtest bulb', cast: false });
    world.light({ pos: [x, y + 4.1, z], color: [1, 0.78, 0.45], intensity: 3.0, radius: 30 });
  }
  if (world.stage && q.get('wspots') !== '0') {
    const cols = [[1, 0.15, 0.7], [0.2, 0.9, 1], [0.6, 0.3, 1]];
    for (let i = 0; i < 3; i++) world.stage.spot({ name: 'wtest spot ' + i, state: t => ({ pos: [0, 18, -20 + i * 15], dir: [-0.8 + 0.25 * Math.sin(t * 0.4 + i), -0.6, 0.2 * Math.cos(t * 0.3 + i * 2)], color: cols[i], intensity: 8, angle: 7, soft: 0.4, range: 80, srcR: 0.1, beam: 1 }) });
    world.stage.haze = { density: 0.02, g: 0.6, box: [-60, 0, -80, 40, 40, 80], edge: 8, noise: 0.5, drift: [0.4, 0.1] };
  }
}

// boards of its own: wmask~CAM~HOUR (t scene time): the water's pixels white, else black (an ID render), so the look's
// numbers are taken on the water alone (board/water: kmeans.py)
export function loops(LOOPS, ctx) {
  const name = q.get('loop') || '';
  const [kind, cam, hour, deg, secs] = name.split('~');
  // wpan~CAM~HOUR~DEG~SECS (t scene time): the bookmark turned DEG about its eye over SECS (0: still): the shimmer clips
  if (kind === 'wpan') {
    LOOPS[name] = t => {
      const N = ctx.SCENE, c = N.CAMS[cam], a = (+deg || 0) * Math.PI / 180 * Math.min(1, t / (+secs || 10));
      const dx = c.at[0] - c.pos[0], dz = c.at[2] - c.pos[2], ca = Math.cos(a), sa = Math.sin(a);
      placeCamera(N.camera, Object.assign({}, c, { at: [c.pos[0] + dx * ca - dz * sa, c.at[1], c.pos[2] + dx * sa + dz * ca] }));
      frame(t, { hour: +(hour || N.hour) });
      X.imageSmoothingEnabled = true; X.drawImage(N.pipe.canvas, 0, 0, W, H);
    };
    LOOPS[name].len = +secs || 10;
    return;
  }
  if (kind !== 'wmask' && kind !== 'wmaskfilm') return;
  // (wmaskfilm: the reel's camera and hour at t, through N.film.draw: the water's pixels in a shot of the reel)
  LOOPS[name] = t => {
    const N = ctx.SCENE, ids = N.measure._ids;
    if (kind === 'wmaskfilm') N.film.draw(t, N.camera); else { placeCamera(N.camera, cam); frame(t, { hour: +(hour || N.hour) }); }
    ids.ensureIds();
    const wm = ctx.mods.water.mesh, id0 = wm.userData.objId, w = N.pipe.w, h = N.pipe.h, buf = ids.renderIds(N.camera, w, h);
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (h - 1 - y) * w + x, o = (y * w + x) * 4, id = (buf[i * 4] << 16) | (buf[i * 4 + 1] << 8) | buf[i * 4 + 2], v = id === id0 ? 255 : 0;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
    }
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(img, 0, 0);
    X.imageSmoothingEnabled = false; X.drawImage(c, 0, 0, W, H);
  };
  LOOPS[name].len = kind === 'wmaskfilm' ? 600 : 20;
}
