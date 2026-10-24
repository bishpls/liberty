// liberty/src/pier/index.js: Pier 35 and the waterfront (B4): the pier, its shed and its bulkhead building, the
// substructure from the water, the neighbours (Pier 33, Pier 39 and its marina), the Embarcadero, Telegraph Hill and
// Coit Tower, the land inside P.WORLD.near, their night lights, their wear and their roosting birds.
// Sources and method: site.js (the outlines traced on rectified imagery), mats.js (the colours sampled from the
// photos, the anime rules), board/pier/notes.md (decisions, open problems).
import * as P from '../plan.js';
import { pierMats, LAMPS } from './mats.js';
import { P35 } from './site.js';
import { buildPier35, SUB, FEND } from './pier35.js';
import { buildLand } from './land.js';
import { buildCity } from './city.js';
import { embClear } from './near.js';
import { buildTrees, flushTrees } from './trees.js';
import { buildCoit } from './coit.js';
import { buildEmbarcadero } from './embarcadero.js';
import { COIT, P39, P33, P31, MARINA, SHORE, LANDING, P27, P23 } from './site.js';
import { buildBulkhead } from './bulkhead.js';
import { buildPier39 } from './pier39.js';
import { buildNeighbours } from './neighbours.js';
import { buildDress } from './dress.js';
import { buildLife } from './life.js';

const T = window.THREE;

export const CAMS = {
  pier_apron_tip: { pos: [P35.x0 + 3.0, P35.deck + 1.6, -128], at: [P35.x0 + 2.0, P35.deck + 2.0, 0], lens: 24, note: 'the west apron from near the tip, eye height, looking along it to the bulkhead' },
  pier_under: { pos: [P35.x1 + 9, 0.8, -60], at: [P35.x1 - 6, 1.0, -40], lens: 20, note: 'the substructure from the water off the east edge: bents, caps, the growth bands' },
  pier_tip_water: { pos: [30, 1.5, -175], at: [40, 4, -140], lens: 24, note: 'the tip from the water: the end wall, the fenders, the piles' },
  pier_roofs: { pos: [-40, 38, -170], at: [45, 8, -60], lens: 28, note: 'the three gables from high off the tip' },
  pier_city: { pos: [14, 22, 60], at: [45, 55, 700], lens: 35, note: 'from over the apron abaft the ship to the bulkhead, Telegraph Hill and Coit Tower' },
  pier_p39: { pos: [12.5, 4.6, -112], at: [-300, 8, -170], lens: 28, note: 'from the apron ahead of the bow across the marina to Pier 39 and the wheel' },
  pier_overview: { pos: [60, 420, -760], at: [20, 0, 220], lens: 35, note: 'the whole near box from high in the north' },
  pier_promenade: { pos: [-4.5, 4.6, 148.1], at: [210, 5, 295], lens: 24, note: 'the promenade along the bulkheads, 8 m off their face (the Embarcadero beyond it)' },
  pier_pavilion: { pos: [28.4, 4.6, 180.9], at: [42.65, 8.5, 170.7], lens: 22, note: 'Pier 35\'s pavilion from the promenade\'s kerb: the arch, the pediment, PIER 35' },
  pier_bh_back: { pos: [20, 30, 100], at: [45, 8, 160], lens: 28, note: 'the bulkhead and the shed\'s end from above the apron' },
  pier_marina: { pos: [-60, 9, -40], at: [-240, 4, -170], lens: 28, note: 'over the east marina to Pier 39' },
  pier_wheel: { pos: [-470, 6, -150], at: [-577, 22, -40], lens: 28, note: 'the Ferris wheel and K-Dock from the west marina' },
  pier_p33: { pos: [90, 22, -60], at: [200, 6, 120], lens: 28, note: 'Pier 33 and Alcatraz Landing from above the slip' },
  pier_gate: { pos: [14.0, 4.6, 70], at: [16.0, 4.0, 125], lens: 28, note: 'the west apron toward the Navy Gate, the ticket booth and the bulkhead' },
  pier_landing: { pos: [16.5, 4.8, -4], at: [11.5, 3.2, 8], lens: 28, note: 'the gangway landing on the apron and the queue stanchions' },
  pier_ridge: { pos: [30, 18.5, -100], at: [27, 15.4, -60], lens: 35, note: 'gulls on the west gable\'s ridge' },
  pier_frieze: { pos: [33.0, 9.5, 184.5], at: [42.65, 12.2, 170.7], lens: 35, note: 'the pavilion\'s pediment and its cast PIER 35' },
  pier_lines: { pos: [16.5, 5.2, 70], at: [8.0, 7.0, 58], lens: 35, note: 'the stern line and breast: rat guards, chafe gear, turns on the bitts' },
  pier_pilecam: { pos: [P35.x1 + 4.0, 0.9, -100.0], at: [P35.x1 + 0.25, 0.9, -100.0], lens: 40, note: 'a fender pile and the piles behind it face-on at the waterline: the growth bands' },
  pier_wallcam: { pos: [11.4, 7.0, -40.0], at: [18.6, 7.0, -40.0], lens: 20, note: 'the shed\'s west wall face-on from the apron\'s edge (the wear measure)' },
  pier_hill: { pos: [-110, 62, 400], at: [30, 70, 640], lens: 35, note: 'Telegraph Hill\'s houses, bays and roofs from above the Embarcadero' },
  pier_street: { pos: [-155.1, 41.9, 520], at: [-144.0, 52.6, 640], lens: 28, note: 'Grant Avenue climbing Telegraph Hill\'s west slope, eye height' },
  pier_p27: { pos: [330, 40, 180], at: [470, 4, 420], lens: 28, note: 'Piers 29 and 27 and the cruise terminal, the Embarcadero bending round them' },
  pier_westmarina: { pos: [-330, 12, -60], at: [-420, 2, -200], lens: 28, note: 'the west marina, K-Dock\'s sea lions and Pier 41 from Pier 39' },
  pier_wharf: { pos: [-40, 4.55, 86], at: [10, 4.0, 108], lens: 35, note: 'the timber wharf west of the root: blue lamps, the railing, gulls on it' },
  pier_east_apron: { pos: [P35.x1 - 2.0, P35.deck + 1.6, -100], at: [P35.x1 - 2.5, P35.deck + 2, 40], lens: 24, note: 'the east apron, eye height' },
};

function inPoly(px, pz, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
let groundAt = () => null, DECKS = [];
export async function build(world, ctx) {
  const t0 = performance.now();
  const M = pierMats(world);
  const out = {};
  const p35 = buildPier35(world, M, out, ctx.mods && ctx.mods.hull && !ctx.mods.hull.failed ? ctx.mods.hull : null);
  const bh = buildBulkhead(world, M, out);
  const land = await buildLand(world, M, out);
  const city = buildCity(world, M, land.landAt, out, land.SM);
  const coit = buildCoit(world, M, land.landAt, out);
  const trees = buildTrees(world, land.landAt, out, { avoid: [[COIT.at[0], COIT.at[1], 16]], blocked: (x, z) => !!land.SM.inBuilding(x, z) || land.SM.fieldAt(x, z).dB < 0.5 || embClear(x, z) < 1 });
  const treeStats = flushTrees(world, trees, city.streetTrees);
  const emb = buildEmbarcadero(world, M, land.landAt, out);
  const p39 = buildPier39(world, M, out);
  const nbr = buildNeighbours(world, M, out);
  const dress = buildDress(world, M, land.landAt, out);
  const life = buildLife(world, M, p35, land.landAt, out);

  // stoppers: low-poly proxies of the deck, the shed's walls and roofs, so a beam aimed at the pier ends on it
  const prox = (geo) => { const m = new T.Mesh(geo, new T.MeshBasicMaterial()); m.updateMatrixWorld(true); return m; };
  const S = world.stage;
  if (S && S.stopper) {
    const g = new T.BufferGeometry();
    const x0 = P35.x0, x1 = P35.x1, z0 = P35.z0, D = P35.deck, zS = P35.streetZ(x0), zE = P35.streetZ(x1);
    const W = P35.wallW, E = P35.wallE, eY = D + P35.eaveH;
    const pos = [
      x0, D, z0, x1, D, z0, x1, D, zE, x0, D, z0, x1, D, zE, x0, D, zS,                 // the deck
      W, D, z0, W, eY, z0, W, eY, P35.backZ(W), W, D, z0, W, eY, P35.backZ(W), W, D, P35.backZ(W),   // the west wall
      E, D, z0, E, D, P35.backZ(E), E, eY, P35.backZ(E), E, D, z0, E, eY, P35.backZ(E), E, eY, z0,   // the east wall
    ];
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    S.stopper(prox(g));
    for (const gb of p35.shed.gables) {
      const r = new T.BufferGeometry(), y = gb.ridgeY, zb = gb.zEnd, xm = (gb.xa + gb.xb) / 2;
      r.setAttribute('position', new T.Float32BufferAttribute([gb.xa, eY, z0, xm, y, z0, xm, y, zb, gb.xa, eY, z0, xm, y, zb, gb.xa, eY, zb,
        xm, y, z0, gb.xb, eY, z0, gb.xb, eY, zb, xm, y, z0, gb.xb, eY, zb, xm, y, zb], 3));
      r.computeVertexNormals(); S.stopper(prox(r));
    }
  }

  // the wall packs carry their cone and bands (mats.js LAMPS.list); the street and wharf lamps their position and sRGB colour
  // the decks (plan polygons) and the land
  {
    const NEAR = P.WORLD.near, decks = [
      [[P35.x0, P35.z0], [P35.x1, P35.z0], [P35.x1, P35.streetZ(P35.x1)], [P35.x0, P35.streetZ(P35.x0)]],
      [P33.tip[0], P33.tip[1], P33.root[1], P33.root[0]], [P31.tip[0], P31.tip[1], P31.root[1], P31.root[0]], P39.outline, LANDING.deck,
      // the bulkhead wharf: the strip in front of the frontage's street face, 14.5 m deep (bulkhead.js)
      [[2, P35.streetZ(2)], [262, P35.streetZ(262)], [262 - 14.5 * P35.out[0], P35.streetZ(262) - 14.5 * P35.out[1]], [2 - 14.5 * P35.out[0], P35.streetZ(2) - 14.5 * P35.out[1]]],
    ];
    decks.push(P27.deck, P23.deck);           // (appended: the first six keep their order for the water)
    const D = P35.deck;
    DECKS = decks.map(d => d.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]));
    groundAt = (x, z) => {
      if (x < NEAR.x0 || x > NEAR.x1 || z < NEAR.z0 || z > NEAR.z1) return null;
      for (const d of decks) if (inPoly(x, z, d)) return D;
      if (land.landAt.shore(x, z) <= 0) return land.landAt(x, z);
      return null;
    };
  }
  // ---- sounds for the integrator's soundscape (events: { t, kind, pos, level dB SPL at 1 m, note }) over the show:
  // K-Dock's sea lions (300-600 in October, site.md §6: barking all night; heard, not seen, from the berth), the gulls on
  // my roofs and rails calling now and then, the streetcars' gongs as they leave their stops
  const sounds = [];
  {
    const T1 = (ctx.show && ctx.show.duration) || 300, rr = (seed => { let x = seed >>> 0; return () => { x = (x + 0x6D2B79F5) >>> 0; let t = Math.imul(x ^ (x >>> 15), x | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(3939);
    const [[k0, k1], [k2, k3]] = P.WORLD && [[-424, -262], [-392, -212]];
    for (let t = rr() * 0.8; t < T1; t += 0.25 + rr() * 0.6) sounds.push({ t: +t.toFixed(2), kind: 'sealion_bark', pos: [+(k0 + rr() * (k2 - k0)).toFixed(1), 0.9, +(k1 + rr() * (k3 - k1)).toFixed(1)], level: 105, note: 'K-Dock chorus (estimated: no source for a bark at 1 m; ~2 barks/s from 300-600 animals)' });
    const perches = life.perches || [];
    for (let t = 2 + rr() * 6; t < T1 && perches.length; t += 4 + rr() * 9) { const g = perches[Math.floor(rr() * perches.length)]; sounds.push({ t: +t.toFixed(2), kind: 'gull_call', pos: g.map(v => +v.toFixed(1)), level: 90, note: 'a western gull on its roost (estimated)' }); }
    if (emb.life && emb.life.departures) sounds.push(...emb.life.departures(T1));
    sounds.sort((a, b) => a.t - b.t);
  }
  const lights = LAMPS.list().concat(emb.lights, dress.wharfLamps);
  const measures = {
    deck: { y: P35.deck, aboveMLLW: +(P35.deck - P.WATER.mllw).toFixed(2), source: 'site.md rule 2: 3.6-3.85 m MLLW' },
    footprint: { width: +(P35.x1 - P35.x0).toFixed(1), lengthWest: +(P35.backZ(P35.x0) - P35.z0).toFixed(1), lengthEast: +(P35.backZ(P35.x1) - P35.z0).toFixed(1), source: 'site.md: ~61 x 250 m (imagery); traced: 61.2 m, oblique end' },
    shed: p35.shed.gables,
    piles: p35.piles.length, fenderPiles: p35.fenderPiles.length, bollards: p35.bollards.length,
    tris: p35.tri,
    land: { tris: land.tris, ms: +land.ms.toFixed(0) }, city: { buildings: city.buildings, tris: city.tri, ms: +city.ms.toFixed(0), details: city.details, lamps: city.lamps, lots: city.lots, streetTrees: city.streetTrees.length },
    cars: city.cars,              // the parked cars' check (near.js checkCars): faults must be 0
    dress: { gateZ: dress.gateZ, boothZ: dress.boothZ, landing: dress.landing }, life: { gulls: life.gulls, pigeons: life.pigeons, cormorants: life.cormorants },
    bulkhead: { length: bh.L, bays: bh.bays }, neighbours: { pier33: nbr.pier33, pier31: nbr.pier31 }, pier39: { buildings: p39.buildings, boats: p39.boats, masts: p39.masts, sealions: p39.sealions, wheel: p39.wheel }, coit: coit, trees: treeStats, embarcadero: { lamps: emb.lamps, palms: emb.palms, life: emb.life },
    buildMs: +(performance.now() - t0).toFixed(0),
  };
  // the module's triangles, every mesh it drew (instances counted): the budget is 1.0 M
  measures.trisTotal = world.pipe.meshes.filter(m => m.userData.module === world.current).reduce((a, m) => a + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1), 0);
  return {
    measures,
    piles: p35.piles.concat(p35.fenderPiles, bh.piles),
    bollards: p35.lines.map(l => l.bollard).concat(p35.bollards.filter(b => !p35.lines.some(l => l.bollard === b || (l.bollard[2] === b[2] && l.bollard[0] === b[0])))),
    lines: p35.lines,             // the ship's lines: each closed chock's z (ship.md §3) and the bitts ashore that take it
    gangwayLanding: (P.GANGWAY && P.GANGWAY.landing) || [P35.x0 + 1.5, P35.deck, 2.0],
    apron: { x0: P35.x0, x1: P35.wallW, z0: P35.z0, z1: P35.backZ(P35.x0), y: P35.deck },
    lights,
    sounds,
    landAt: land.landAt,          // the land's height inside P.WORLD.near (south of the shore)
    // what you stand on in my part of the world, or null where it isn't mine (the water, the ship): the decks of Piers 35,
    // 33, 31 and 39, the bulkhead wharf and Alcatraz Landing's apron (2.95), the land inside P.WORLD.near (landAt)
    groundAt,
    // the decks' plan polygons (closed, x z; deck at P.PIER.deck): Pier 35, Pier 33, Pier 31, Pier 39, Alcatraz Landing's
    // apron, the bulkhead wharf strip (for the water's shade under them)
    decks: DECKS, deckY: P35.deck,
    // the built plan outlines (world x, z), for the overlay measure against the imagery (board/pier)
    outlines: {
      pier35: [[P35.x0, P35.z0], [P35.x1, P35.z0], [P35.x1, P35.streetZ(P35.x1)], [P35.x0, P35.streetZ(P35.x0)]],
      shedEaves: [[P35.eaveW - 0.45, P35.z0 + P35.tipApron - 0.45], [P35.eaveE + 0.45, P35.z0 + P35.tipApron - 0.45]],
      valleys: P35.valleys.map(v => [[v, P35.z0 + 3], [v, P35.backZ(v) - 3]]),
      bulkheadStreet: [[2, P35.streetZ(2)], [186 * P35.along[0] + 2, P35.streetZ(186 * P35.along[0] + 2)]],
      pier33: [P33.tip[0], P33.tip[1], P33.root[1], P33.root[0]], pier31: [P31.tip[0], P31.tip[1], P31.root[1], P31.root[0]],
      pier39: P39.outline, pier27: P27.deck, pier23: P23.deck, breakwaters: [MARINA.north, MARINA.east], shore: SHORE,
    },
  };
}
