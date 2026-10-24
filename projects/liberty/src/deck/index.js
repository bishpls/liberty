// liberty/src/deck/index.js: every fitting on the ship (B2): the guns and their mechanism on the show's cues, the masts,
// booms and rigging, the deck machinery, the hatch covers, the boats and rafts, the ventilators and small fittings, the
// lights, the flags, the gangway and the mooring lines. briefs/deck.md; board/deck/notes.md holds the state.
//   ship.js   the frame (ship coordinates baked through the trim), geometry helpers, catenaries, seats on the hull
//   mats.js   the materials (anime steel, rust, canvas, brass, rope, wires drawn at a minimum pixel width, flags)
//   guns.js   the 5"/38, the 3"/50, the eight Oerlikons: geometry, the schedule, recoil, cases, muzzle(t)
// ctx.mods.deck = { guns: { gun5: { muzzle(t), shots }, gun3, gun20: [...] }, masts, lights, stoppers, measures }
import * as P from '../plan.js';
import { SH, Bins, zs, seats, deckAt as deckAtS, STATS, dropDegenerate } from './ship.js';
import { deckMats } from './mats.js';
import { buildGuns } from './guns.js';
import { Wires } from './wires.js';
import { buildRig } from './rig.js';
import { buildMachinery } from './machinery.js';
import { buildHatches } from './hatches.js';
import { buildBoats } from './boats.js';
import { buildFittings } from './fittings.js';
import { buildLights } from './lights.js';
import { buildGangway } from './gangway.js';
import { merge } from 'scene3d/geom.js';
import { placeCamera, frame, blit, hhmm } from 'scene3d/host.js';
import { rng } from 'scene3d/util.js';

const T = window.THREE;
const W = (x, abl, z) => SH.toWorld(x, abl, z);

export const CAMS = {
  deck_gun5: { pos: W(3.4, 18.1, P.SHIP.guns.gun5.z + 3.6), at: W(-0.4, 17.0, P.SHIP.guns.gun5.z - 0.6), lens: 24, note: 'deck: the 5"/38 on her stern platform, from its starboard quarter' },
  deck_gun3: { pos: W(-2.8, 18.4, P.SHIP.guns.gun3.z + 3.2), at: W(0.2, 17.6, P.SHIP.guns.gun3.z - 1.0), lens: 24, note: 'deck: the 3"/50 on the bow platform' },
  deck_gun20: { pos: W(-3.2, 20.6, zs(61.6) + 2.4), at: W(-5.09, 20.0, zs(61.6)), lens: 28, note: 'deck: an Oerlikon on the top of the house (forward, port)' },
  deck_gun5_side: { pos: W(1.5, 18.6, P.SHIP.guns.gun5.z + 5.2), at: W(-1.2, 16.4, P.SHIP.guns.gun5.z + 0.5), lens: 28, note: 'deck: the 5"/38 from behind its breech (the recoil, the case thrown out)' },
  deck_photo25: { pos: W(0.4, 18.0, zs(8.6)), at: W(0, 19.5, P.SHIP.masts.fore.z), lens: 24, note: 'deck: from the bow platform aft to the foremast (photo ship/25)' },
  deck_photo27: { pos: W(0.3, 15.2, zs(36.0)), at: W(0, 17.5, P.SHIP.masts.main.z), lens: 24, note: 'deck: from No. 2 aft to the mainmast house (photo ship/27; the stage stands here)' },
  deck_broadside: { pos: W(-130, 5.0, -2), at: W(0, 15.5, -2), lens: 40, note: 'deck: her port broadside from the water (photo ship/01)' },
  deck_rig_high: { pos: W(-28, 42, -52), at: W(0, 18, -20), lens: 28, note: 'deck: the rig from high off her port bow' },
  deck_boats: { pos: W(14.5, 17.5, 4.0), at: W(6.5, 15.2, 6.5), lens: 28, note: 'deck: the starboard lifeboats under their davits from outboard (over the pier)' },
  deck_raft: { pos: W(2.0, 14.0, P.SHIP.masts.main.z + 5.5), at: W(7.0, 14.0, P.SHIP.masts.main.z + 1.8), lens: 24, note: 'deck: the main shrouds and a raft on its rack, starboard' },
  deck_dress: { pos: W(-45, 9, -70), at: W(0, 22, -25), lens: 28, note: 'deck: dressed overall, from off her port bow, low' },
  deck_fore_house: { pos: W(-4.5, 15.6, P.SHIP.masts.fore.z - 6.5), at: W(0, 15.0, P.SHIP.masts.fore.z), lens: 28, note: 'deck: the foremast house: winches, cowls, the booms\' heels, the shrouds' },
  deck_bow: { pos: W(-3.5, 18.6, -61.5), at: W(1.5, 15.5, -54), lens: 24, note: 'deck: the bow platform aft: the bell, the cowls, No. 1' },
  deck_gangway: { pos: W(15.5, 8.5, 6.0), at: W(9.5, 11.0, 13.5), lens: 28, note: 'deck: the gangway from the apron' },
  deck_night_hatch: { pos: W(-5.5, 16.5, 22.5), at: W(0, 12.5, 36.0), lens: 28, note: 'deck: No. 4 and the mizzen house under the cargo floods' },
  deck_oerlikon: { pos: W(3.2, 19.6, P.SHIP.guns.gun20[0].z + 3.4), at: W(6.4, 17.6, P.SHIP.guns.gun20[0].z - 0.4), lens: 28, note: 'deck: the forward starboard Oerlikon on its pillbox (fires on the first gun20 cue, bar 38)' },
  deck_flags: { pos: W(-9.5, 24.5, -44), at: W(0, 28.5, -34), lens: 35, note: 'deck: the dressing line from the fore pole to the main truck, close (the flags\' flutter)' },
  deck_stern: { pos: W(-14, 21, 50), at: W(0, 16, 62), lens: 28, note: 'deck: the stern platform and its guns from off her port quarter, high' },
};

export async function build(world, ctx) {
  const t0 = performance.now(), ms = {};
  const lap = (k, t) => { ms[k] = Math.round(performance.now() - t); return performance.now(); };
  const M = deckMats(world);
  const B = new Bins(world, 'deck');
  const seat = seats(ctx);
  const W = new Wires(); W.deckAt = (x, z) => deckAtS(x, z);
  let t = performance.now();
  const G = buildGuns(world, M, ctx, B, seat); t = lap('guns', t);
  const mach = buildMachinery(world, M, ctx, B, W, seat); t = lap('machinery', t);
  const rig = buildRig(world, M, ctx, B, W, seat, mach); t = lap('rig', t);
  const hat = buildHatches(world, M, ctx, B, seat); t = lap('hatches', t);
  const boats = buildBoats(world, M, ctx, B, W, seat, rig.F); t = lap('boats', t);
  const fit = buildFittings(world, M, ctx, B, W, seat, rig.F, rig, G.guns); t = lap('fittings', t);
  const gang = buildGangway(world, M, ctx, B, W, seat); t = lap('gangway', t);
  const lit = buildLights(world, M, ctx, B, W, seat, rig, { gangwayLamp: gang.lamp }); t = lap('lights', t);
  const flushed = B.flush();
  // the joins with B1's body: the chocks' castings in the shell's openings, the bitts on the deck
  const hullM = seat.hull && seat.hull.meshes;
  if (hullM) {
    const byKey = k => flushed.filter(m => m.name.endsWith(':' + k));
    for (const m of byKey('chocks')) if (hullM.shell) world.relate('attach', { name: 'chock castings in the shell', a: m, b: hullM.shell, tol: 0.03 });
    for (const m of byKey('bitts')) if (hullM.deck) world.relate('attach', { name: 'bitts on the deck', a: m, b: hullM.deck, tol: 0.03 });
  }
  // the wires: one draw (drawn at least a few pixels wide), the ropes another
  const SM = P.SHIP.matrix();
  const mg = list => { const g = merge(list).applyMatrix4(SM); STATS.degenerate += dropDegenerate(g); return g; };
  const wireMesh = W.geos.length ? world.mesh(mg(W.geos), M.wire, { name: 'deck:wires' }) : null;
  const ropeMesh = W.ropeGeos.length ? world.mesh(mg(W.ropeGeos), M.rope, { name: 'deck:ropes' }) : null;
  for (const m of [wireMesh, ropeMesh]) if (m) { m.geometry.computeBoundingSphere(); m.geometry.computeBoundingBox(); }
  t = lap('flush', t);
  // stoppers: the masts and the topped booms as coarse proxies, so a beam aimed at the rig lands on it
  const stoppers = [];
  if (world.stage && world.stage.stopper) {
    const sm = new T.MeshBasicMaterial();
    const proxy = (g, name) => { g.applyMatrix4(SM); const m = new T.Mesh(g, sm); m.name = 'deck stopper ' + name; world.stage.stopper(m); stoppers.push(m); };
    for (const mm of Object.values(rig.masts)) {
      const g = new T.CylinderGeometry(mm.r1, mm.r0, (mm.truck || mm.cap + 3) - mm.top, 8); g.translate(0, (mm.top + (mm.truck || mm.cap + 3)) / 2, mm.z); proxy(g, mm.name);
    }
    for (const b of rig.booms) {
      const d = b.dir, L = b.L, g = new T.CylinderGeometry(b.R[1], b.R[1], L, 6);
      g.applyMatrix4(new T.Matrix4().makeBasis(...(() => { const y = new T.Vector3(...d), x = new T.Vector3(0, 1, 0).cross(y); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); x.normalize(); return [x, y, x.clone().cross(y).normalize()]; })()).setPosition(b.heel[0] + d[0] * L / 2, b.heel[1] + d[1] * L / 2, b.heel[2] + d[2] * L / 2));
      proxy(g, 'boom');
    }
  }
  const tris = { ...B.tris, wires: W.tris() };
  const att = W.attached();
  const wireStats = W.list.concat(W.ropes).filter(w => w.cat).map(w => ({ name: w.name, kind: w.kind, H: w.H, w: w.w, span: +w.span.toFixed(2), sag: +w.sag.toFixed(3),
    // (the parabola's sag under a load per horizontal metre w sec(theta): a steep shroud carries more wire per metre of span)
    sagTheory: +(w.span * w.span * w.w * Math.hypot(1, (w.b[1] - w.a[1]) / Math.max(w.span, 1e-6)) / (8 * w.H)).toFixed(3), a: +(w.H / w.w).toFixed(1) }));
  // faces whose winding disagrees with their normals (seen from outside, culled: a see-through wall), over every deck mesh
  let inv = 0, ntri = 0;
  for (const mesh of world.pipe.meshes.filter(q => q.userData.module === 'deck' && q.geometry && q.geometry.index)) {
    const p = mesh.geometry.attributes.position.array, nn = mesh.geometry.attributes.normal.array, ix = mesh.geometry.index.array;
    for (let k = 0; k < ix.length; k += 3) {
      const a = ix[k] * 3, b = ix[k + 1] * 3, c = ix[k + 2] * 3;
      const u = [p[c] - p[b], p[c + 1] - p[b + 1], p[c + 2] - p[b + 2]], v = [p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]];
      const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const s = g[0] * (nn[a] + nn[b] + nn[c]) + g[1] * (nn[a + 1] + nn[b + 1] + nn[c + 1]) + g[2] * (nn[a + 2] + nn[b + 2] + nn[c + 2]);
      if (Math.hypot(...g) > 1e-12) { ntri++; if (s < 0) inv++; }
    }
  }
  const measures = {
    faces: { triangles: ntri, inverted: inv, share: +(inv / Math.max(1, ntri)).toFixed(4), tubeTris: STATS.tubeTris, cornersRounded: STATS.filleted, degenerateDropped: STATS.degenerate, note: 'before 2026-10-24 every tube() face was wound inward (the cowls\' ducts, davits, rails, wires, ropes)' },
    seats: seat.used, guns: G.measures, masts: rig.measures.masts, booms: rig.measures.booms, machinery: mach.measures, hatches: hat.measures, boats: boats.measures, fittings: fit.measures, gangway: gang.measures, lights: lit.measures,
    wires: { count: W.list.length + W.ropes.length, ends: att, catenaries: wireStats },
    // drawn: every deck mesh's triangles as uploaded (instanced meshes by their instances); trisByPart counts the parts as
    // they were gathered (a part merged into a fitting's measure geometry too can count twice there)
    trisByPart: tris, trisTotal: world.pipe.meshes.filter(q => q.userData.module === 'deck' && q.geometry).reduce((a, q) => a + (q.geometry.index ? q.geometry.index.count : q.geometry.attributes.position.count) / 3 * (q.isInstancedMesh ? Math.max(1, q.count) : 1), 0),
    buildMs: Math.round(performance.now() - t0), ms,
  };
  const gunOut = g => ({ muzzle: g.muzzle, shots: g.shots, pose: g.pose, mount: SH.toWorld(...g.mount), name: g.name || g.kind });
  const Wp = p => SH.toWorld(p[0], p[1], p[2]);
  const masts = Object.values(rig.masts).map(m => ({ name: m.name, foot: Wp([0, m.top, m.z]), cap: Wp([0, m.cap, m.z]), truck: m.truck ? Wp([0, m.truck, m.z]) : null,
    crosstree: m.crosstree ? Wp([0, m.crosstree, m.z]) : Wp([0, m.cap, m.z]), lampYard: Wp([0, m.lampYard, m.z]),
    booms: rig.booms.filter(b => b.mast === m.name).map(b => ({ end: b.end, side: b.sx || 0, heel: Wp(b.heel), head: Wp(b.head), stowed: !!b.stowed })) }));
  return {
    measures,
    guns: { gun5: gunOut(G.guns.gun5), gun3: gunOut(G.guns.gun3), gun20: G.guns.gun20.map(gunOut) },
    masts, lights: lit.lights, stoppers, cowls: fit.cowls.map(c => ({ where: c.where, mouth: Wp(c.mouth), base: Wp(c.base), face: c.face })),
  };
}

// deckwander~SEED~HOUR: random views on her decks (the engine's wander spans the whole world; this one stays aboard):
// an eye 1.6 m over a random point of the weather deck, a house top or a platform, looking at a random fitting
export function loops(LOOPS, ctx) {
  const name = new URLSearchParams(location.search).get('loop') || '';
  const [kind, seed, hour] = name.split('~');
  if (kind === 'ventwander') return ventLoop(LOOPS, ctx, name, seed, hour);
  if (kind !== 'deckwander') return;
  const R = rng(+(seed || 1) * 7919 + 13), S = P.SHIP, d = ctx.mods.deck;
  const targets = () => {
    const out = [];
    for (const m of d.masts) { out.push(m.foot, m.crosstree); for (const b of m.booms) out.push(b.head, b.heel); }
    for (const g of [d.guns.gun5, d.guns.gun3, ...d.guns.gun20]) out.push(g.mount);
    for (const l of d.lights) out.push(l.pos);
    return out;
  };
  const views = [];
  for (let i = 0; i < 64; i++) {
    const z = -62 + R() * 124, hb = S.halfAt(z) - 0.6, x = (R() * 2 - 1) * Math.max(0.5, hb);
    const tops = ctx.mods.hull && ctx.mods.hull.topAt ? ctx.mods.hull.topAt : null;
    const w0 = S.toWorld(x, S.deckAbl(x, z) || S.sideAbl(z), z);
    const y = (tops ? tops(w0[0], w0[2]) : null) ?? w0[1];
    const T_ = targets(), t = T_[Math.floor(R() * T_.length)];
    views.push({ pos: [w0[0], y + 1.6, w0[2]], at: t, lens: 20 + Math.round(R() * 30) });
  }
  LOOPS[name] = t => { const v = views[Math.round(t) % views.length]; placeCamera(LIBERTY_N().camera, v); frame(4, { hour: +(hour || 17) }); blit(`deckwander ${seed}#${Math.round(t)} · ${hhmm(+(hour || 17))} · ${v.lens}mm · [${v.pos.map(q => q.toFixed(1))}]`); };
  LOOPS[name].len = views.length;
}
const LIBERTY_N = () => window.SCENE;

// ventwander~SEED~HOUR: close views round every cowl vent (the director's find, 2026-10-24: the bends must seat on their
// trunks): for each cowl, cameras 2-4 m off at a random bearing, from level to well above, looking at its bend
function ventLoop(LOOPS, ctx, name, seed, hour) {
  const R = rng(+(seed || 1) * 104729 + 7), cw = ctx.mods.deck.cowls, views = [];
  for (const c of cw) for (let k = 0; k < 2; k++) {
    const az = R() * Math.PI * 2, el = (-5 + R() * 70) * Math.PI / 180, d = 2.2 + R() * 2.2;
    const at = [(c.base[0] + c.mouth[0]) / 2, c.mouth[1] - 0.3, (c.base[2] + c.mouth[2]) / 2];
    views.push({ pos: [at[0] + Math.cos(az) * Math.cos(el) * d, at[1] + Math.sin(el) * d, at[2] + Math.sin(az) * Math.cos(el) * d], at, lens: 28, where: c.where });
  }
  LOOPS[name] = t => { const v = views[Math.round(t) % views.length]; placeCamera(LIBERTY_N().camera, v); frame(4, { hour: +(hour || 17) }); blit(`ventwander ${seed}#${Math.round(t)} · ${v.where}`); };
  LOOPS[name].len = views.length;
}
