// liberty/src/hull/index.js: the SS Jeremiah O'Brien's body (B1): the hull lofted from the lines plan, its plating and
// paint's history, the decks, the houses, the platforms and tubs, the stern frame, rudder and screw. Built in ship
// coordinates (plan.js SHIP) and baked into the world with SHIP.matrix() (she floats trimmed 0.99 deg by the stern), so
// measures, raycasts and the water's waterline see the world.
//   ctx.mods.hull = { waterline: [[x, z], ...] (world, closed: the shell at y = 0), deckAt(x, z) (the weather deck's
//                     world height under a world point, null off the ship), topAt(x, z) (the highest deck, platform or
//                     roof under it), houses: [{ name, poly (world [x, z]), top (world y), walkable }], anchors (world
//                     points: masts, winches, davits, guns, the gangway, bitts and chocks, hatches), stoppers, measures }
// Sources and decisions: board/hull/notes.md.
import { makeForm } from './form.js';
import { loftShell } from './shell.js';
import { buildDecks } from './decks.js';
import { buildStern } from './stern.js';
import { hullMats, setLamps, setChocks, setFreeingSkip, NLAMP } from './mats.js';
import { merge } from 'scene3d/geom.js';
import { pointInPoly } from 'scene3d/util.js';
import * as P from '../plan.js';

const T = window.THREE;
const FT = 0.3048;

// bookmarks: eye heights on her decks computed in ship coordinates (1.65 m above the deck under the eye)
const SH = P.SHIP, eye = (x, z, over = null) => SH.toWorld(x, (over ?? SH.deckAbl(x, z)) + 1.65, z), at = (x, abl, z) => SH.toWorld(x, abl, z);
export const CAMS = {
  hull_broadside: { pos: [-150, 5.0, 10], at: [0, 6.5, 2], lens: 50, note: "her port side from the water (photo 01's view)" },
  hull_p01: { pos: [-423.62, 16.36, -502.47], at: [-293.21, 16.73, -350.84], lens: 230.8, note: "photo 01's camera (port bow quarter, 2012), solved from 7 ship points (6.6 px mean on 2560 px): the overlay measure" },
  hull_p10: { pos: [-10.63, 7.5, 80.22], at: [12.07, 9.69, -17.15], lens: 34.0, note: "site photo 10's camera (her port quarter, the pier beyond), solved from 6 points (24 px mean on 1920 px): the stern's overlay" },
  hull_bow: { pos: [-22, 1.6, -92], at: [0, 7.0, -62], lens: 30, note: 'the bow from the water, port bow, low' },
  hull_name: { pos: [-26, 7.5, -64], at: [0, 11.6, -56], lens: 40, note: "the port bow's name, anchor hawse and draft marks (photo 12)" },
  hull_counter: { pos: [-6, 9.0, 92], at: [0, 10.5, 66], lens: 35, note: 'the counter: her name and home port, the stern draft marks, the rudder head' },
  hull_stern: { pos: [-18, 1.5, 88], at: [0, 6.0, 64], lens: 30, note: 'the counter, rudder and name from the water' },
  hull_pierside: { pos: [10.4, 3.2, -30], at: [7.0, 5.5, 20], lens: 24, note: 'down the starboard side from the apron edge (fender scuffs, the gap)' },
  hull_deck: { pos: eye(-2.0, -55.5), at: at(0, 13.0, -10), lens: 24, note: 'the foredeck from the bow, eye height: coamings, mast houses, the house front' },
  hull_house: { pos: eye(5.0, -14.5), at: at(0, 16.0, 0), lens: 22, note: 'the house front from No. 3 hatch (photo 29)' },
  hull_boatdeck: { pos: eye(-6.2, 19.0, SH.house.boat.abl), at: at(-2.0, 15.2, -4), lens: 22, note: 'the boat deck looking forward' },
  hull_chock: { pos: eye(4.6, -10.5), at: at(8.6, SH.sideAbl(-7.2) + 0.55, -7.2), lens: 35, note: 'a closed chock through the starboard bulwark abreast No. 3 (190 ft aft FP), from the deck' },
  // close views (the board's and the assembly's): every structure at arm's length
  hull_cl_coaming: { pos: eye(5.2, 31.6), at: at(3.3, SH.deckAbl(3.3, 28.6) + 0.6, 27.6), lens: 28, note: 'No. 4 hatch coaming: flat-bar top, stiffener, brackets' },
  hull_cl_masthouse: { pos: eye(-6.2, -20.5), at: at(0, 13.6, -17.3), lens: 26, note: 'the mainmast house from No. 2' },
  hull_cl_bulwark: { pos: eye(5.6, 24), at: at(8.6, SH.sideAbl(36) + 0.6, 36), lens: 30, note: "along the bulwark's inside: stays, freeing ports, the cap" },
  hull_cl_passage: { pos: eye(7.0, -5.0), at: at(7.0, 13.2, 12), lens: 22, note: "the side passage under the boat deck (photo 38)" },
  hull_cl_bowplat: { pos: eye(1.0, -57.0, SH.bow.platform.abl), at: at(0, 16.4, -62.5), lens: 24, note: "on the bow platform: the 3\"/50's tub and its art" },
  hull_cl_gunplat: { pos: eye(-1.5, 55.6, 15.85), at: at(0, 16.2, 64), lens: 24, note: "on the after platform: the horseshoe and its rail" },
  hull_cl_rudder: { pos: [-7, 0.6, 71], at: [0, 2.5, 62], lens: 24, note: 'the rudder, the post and the screw from the water astern' },
  hull_cl_top: { pos: eye(3.2, 7.0, 18.68), at: at(0, 19.4, -6.5), lens: 24, note: 'the top of house: the funnel, the tubs on the wing roots' },
  hull_apron_up: { pos: [11.4, 4.6, -36], at: [8.5, 7.0, -20], lens: 24, note: "photo 16's view: up her starboard side from the apron (rivets, seams, the discharges, scuffs)" },
  hull_cl_port: { pos: [-0.6, 12.6, -8.2], at: [-1.3, 12.4, -5.7], lens: 35, note: 'a porthole and its deadlight on the boat-deck house front' },
  hull_aft: { pos: eye(-5.6, 29), at: at(0, 14.5, 62), lens: 24, note: 'the after deck to the gun platform' },
};

export async function build(world, ctx) {
  const t0 = performance.now();
  const S = P.SHIP;
  const F = makeForm(S);
  const shell = loftShell(F);
  const place = {};
  const D = buildDecks(F, place);
  const ST = buildStern(F);
  // where her markings go (marks.js): the bow name's caps 0.61 m (2 ft) high, their top 0.75 m below the deck edge, from
  // 7.6 m aft of the stem head (photo 01, 12); the counter's two lines 0.41 m; the draft numerals 6 in at the stem's rake
  // and just forward of the post; the load-line disc (12 in) at 8.46 m ABL, 208 ft aft of the FP (ship.md §8)
  const L = F.lines, row = cap => cap / (108 / 170);
  Object.assign(place, {
    stemA: L ? (L.data.stem.a - 213.65) * FT : -62.784, stemB: L ? L.data.stem.b : -0.3077,
    bow: [F.zHead + 7.6, 0, 0.75 - (31 / 170) * row(0.61), row(0.61)],
    stern: [3.0, F.side(66) - 0.95, row(0.45), F.side(66) - 1.6],          // (photo 10: caps ~0.45 m, their top ~0.7 m under the deck edge)
    draft: [0.28, F.postZ - 0.4, 0.1524 * 160 / 108, 0.095],
    counter: (() => { const out = []; for (let k = 0; k < 12; k++) { const a = F.apTop + (13.0 - F.apTop) * Math.pow(k / 11, 0.8); out.push([k === 0 ? F.apTop : a, F.zAft(a)]); } return out; })(),
    load: [(208 - 213.65) * FT, 8.46, 0.1524],
    // overboard discharges (photo 16): the engine room's and the galley's, both sides, ~1.6-3 m above the waterline
    disch: [[-2.0, 6.2, 1], [3.5, 5.6, 1], [9.0, 6.8, 1], [-30.0, 7.4, 1], [-1.0, 6.0, -1], [5.5, 5.4, -1], [12.0, 6.6, -1], [30.0, 7.6, -1]],
    hatches: [1, 2, 3, 4, 5].map(k => { const h = S.hatches[k]; return [h.half, (h.z0 + h.z1) / 2, (h.z1 - h.z0) / 2]; }),
    tubLen: 0.76 * Math.PI * S.bow.tub.dia / 2, tubH: S.bow.tub.rim - S.bow.platform.abl + 0.02,
  });
  const M = hullMats(world, place);
  { const u = M.shell.uniforms; const wA = u.uMkW.value.x; u.uMkBow.value.y = wA * 2048 / 170 * row(0.61); }
  const MX = S.matrix();
  // ship coordinates -> world, keeping the ship point (aShip) for the paint's rules
  const bake = g => {
    const p = g.attributes.position;
    g.setAttribute('aShip', new T.BufferAttribute(new Float32Array(p.array), 3));
    if (!g.attributes.aSeed) g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(p.count).fill(0.5), 1));
    g.applyMatrix4(MX); g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  };
  const meshes = {};
  const add = (name, geo, mat, flags = {}) => { const m = world.mesh(bake(geo), mat, Object.assign({ name }, flags)); meshes[name] = m; return m; };
  add('shell', shell.geo, M.shell);
  add('bulwark inside', shell.inner, M.bulwarkIn);
  add('deck', merge(D.G.deck), M.deck);
  if (D.G.hdeck.length) add('house decks', merge(D.G.hdeck), M.hdeck);
  add('structure', merge(D.G.steel), M.steel);
  if (D.G.door.length) add('doors', merge(D.G.door), M.door);
  if (D.G.white.length) add('bow tub front', merge(D.G.white), M.white);
  if (D.G.boot.length) add('funnel hood', merge(D.G.boot), M.boot);
  if (D.G.glass.length) add('house glass', merge(D.G.glass), M.glass);
  if (D.G.armour.length) add('plastic armour', merge(D.G.armour), M.armour);
  add('stern frame', ST.frame, M.underwater);
  add('screw', ST.bronze, M.bronze);

  // ---- what the others read
  const toW = (x, abl, z) => S.toWorld(x, abl, z);
  const shipOf = (x, z, abl) => { let zs = z; for (let k = 0; k < 3; k++) zs = (z - abl * Math.sin(S.trim)) / Math.cos(S.trim); return zs; };
  // the weather deck under a world point: iterate the ship's z (the deck's abl changes it through the trim)
  function deckAt(x, z) {
    let zs = z, abl = 12;
    for (let k = 0; k < 4; k++) {
      zs = (z - abl * Math.sin(S.trim)) / Math.cos(S.trim);
      if (zs < S.stemZ - 1 || zs > S.sternZ + 0.5) return null;
      const hb = D.hbTop(zs);
      if (Math.abs(x) > hb) return null;
      abl = D.deckAbl(x, zs);
    }
    return toW(x, abl, zs)[1];
  }
  const housesW = D.houses.map(h => ({ name: h.name, top: h.top, walkable: !!h.walkable, polyShip: h.poly, poly: h.poly.map(([x, z]) => { const w = toW(x, h.top, z); return [w[0], w[2]]; }), topY: toW(0, h.top, h.poly.reduce((a, p) => a + p[1], 0) / h.poly.length)[1] }));
  function topAt(x, z) {
    let y = deckAt(x, z);
    if (y === null) return null;
    for (const h of housesW) if (pointInPoly([x, z], h.poly)) y = Math.max(y, h.topY);
    return y;
  }
  const waterline = shell.waterline(toW);
  // anchors, world: { ship: [x, abl, z], world: [x, y, z] }
  const A = D.anchors, pt = p => ({ ship: p, world: toW(...p) });
  const anchors = {
    masts: Object.fromEntries(Object.entries(A.masts).map(([k, m]) => [k, { step: pt(m.step), deck: pt(m.deck), house: m.house, houseTop: m.houseTop }])),
    hatches: Object.fromEntries(Object.entries(A.hatches).map(([k, h]) => [k, { corners: h.corners.map(pt), topFwd: h.topFwd, topAft: h.topAft, half: h.half, z0: h.z0, z1: h.z1 }])),
    winches: Object.fromEntries(Object.entries(S.winches).map(([k, [z0, z1]]) => { const z = (z0 + z1) / 2; return [k, { z0, z1, seats: [-1.35, 1.35].map(x => pt([x, D.deckAbl(x, z), z])) }]; })),
    davits: S.house.lifeboats.flatMap(([z0, z1], i) => [-1, 1].map(sx => ({ boat: i, side: sx > 0 ? 'starboard' : 'port', seats: [z0 - 0.4, z1 + 0.4].map(z => pt([sx * (D.hbTop(z) - 0.35), S.house.boat.abl, z])) }))),
    gun5: { ring: pt(A.gun5.ring), boreAbl: A.gun5.boreAbl }, gun3: { ring: pt(A.gun3.ring), boreAbl: A.gun3.boreAbl },
    gun20: Object.fromEntries(Object.entries(A.gun20).map(([k, g]) => [k, { ring: pt(g.ring), rim: g.rim }])),
    funnel: { centre: pt(A.funnel.centre), whistle: pt(A.funnel.whistle), rim: A.funnel.rim, cap: A.funnel.cap },
    bell: pt(A.bell), windlass: pt(A.windlass),
    gangway: (() => { const g = S.gangway.top; return { top: pt([g.x, F.rail(g.z), g.z]), deck: pt([g.x - 0.8, D.deckAbl(g.x - 0.8, g.z), g.z]) }; })(),
    // closed chocks through the bulwark and the double bitts inboard of each (sheet 2: bow, abreast No. 3, the house's
    // after end, the quarters)
    chocks: [], bitts: [],
  };
  for (const ftAft of [22, 34, 190, 205, 269, 283, 395, 410]) {
    const z = (ftAft - 213.65) * FT;
    for (const sx of [-1, 1]) {
      const xo = F.hbRail(z, F.side(z) + 0.6);
      anchors.chocks.push({ at: ftAft, side: sx, ...pt([sx * xo, F.side(z) + 0.6, z]) });
      const xb = sx * (D.hbTop(z) - 0.95);
      anchors.bitts.push({ at: ftAft, side: sx, ...pt([xb, D.deckAbl(xb, z), z]) });
    }
  }

  // ---- the closed chocks' oval openings through the bulwark (2.4 x 1.6 ft: ship.md §3), cut in the shell's and the
  // bulwark's shaders; B2's castings sit in them (anchors.chocks)
  setChocks(anchors.chocks.filter(c => c.side > 0).map(c => ({ z: c.ship[2], abl: c.ship[1], hz: 2.4 * FT / 2, hh: 1.6 * FT / 2 })));
  setFreeingSkip(anchors.chocks.filter(c => c.side > 0).map(c => c.ship[2]).concat([S.gangway.top.z]));
  // ---- the pier's lamps on her side (the integrator's request): once the pier has built, its lamps within ~40 m of the
  // hull are lit in the hull's shaders (not world.light). The adapter reads B4's lights list as it stands (pos, kind,
  // side, colour) and any axis / angle / power B4 adds
  let lampsSet = false;
  // (only the wall packs: wallPack is their model; the street and wharf lamps are 40 m and more away)
  const adaptLamp = l => {
    const wall = /wall pack/.test(l.kind || ''), face = l.face || l.side;
    if (!wall) return null;
    return { pos: l.pos || l.p, color: l.color || l.col || '#ffb46b', axis: l.axis || l.dir || [face === 'east' ? 0.57 : -0.57, -0.82, 0],
      outer: l.outer ?? l.angle ?? 80, inner: l.inner ?? 55, power: l.gain ?? l.power ?? 0.99, night: l.night };
  };
  const hullDist = p => { const dx = Math.max(0, Math.abs(p[0]) - 9), dz = Math.max(0, Math.abs(p[2]) - 67.5); return Math.hypot(dx, dz); };
  world.onFrame(() => {
    if (lampsSet) return;
    const pier = ctx.mods.pier;
    if (!pier || pier.failed || !Array.isArray(pier.lights)) { if (Object.keys(ctx.mods).length > 3) lampsSet = true; return; }
    // the packs whose 17 m window (wallPack) reaches her: within 17 m of the hull's box (the west face's, 9.4 m off her
    // side; 13-14 of them along her length), nearest first
    const near = pier.lights.map(adaptLamp).filter(l => l && l.pos && hullDist(l.pos) < 17).sort((a, b) => hullDist(a.pos) - hullDist(b.pos) || Math.abs(a.pos[2]) - Math.abs(b.pos[2])).slice(0, NLAMP);
    setLamps(near); lampsSet = true; lampCount = near.length;
  });
  let lampCount = 0;

  // ---- stoppers: low-poly proxies a beam lands on (the deck, the hull's sides, the houses, the hatch tops)
  const stoppers = [];
  if (world.stage && world.stage.stopper) {
    const sm = new T.MeshBasicMaterial({ side: T.DoubleSide });
    const proxy = (geo, name) => { const m = new T.Mesh(bake(geo), sm); m.name = 'hull stopper ' + name; world.stage.stopper(m); stoppers.push(m); };
    // the deck: a coarse cambered grid; the shell: a coarse loft
    const dg = [], sg = [];
    const zs = []; for (let z = S.stemZ + 1.5; z < S.sternZ; z += 3) zs.push(z);
    const grid = (rows, nc) => { const g = new T.BufferGeometry(), pos = [], idx = []; rows.forEach(r => r.forEach(p => pos.push(...p))); for (let i = 0; i < rows.length - 1; i++) for (let k = 0; k < nc - 1; k++) { const a = i * nc + k; idx.push(a, a + 1, a + nc + 1, a, a + nc + 1, a + nc); } g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g; };
    proxy(grid(zs.map(z => [-1, -0.5, 0, 0.5, 1].map(q => { const x = q * D.hbTop(z); return [x, D.deckAbl(x, z), z]; })), 5), 'deck');
    proxy(grid(zs.map(z => [0, 2, 4, 6, 8, 10].map(h => [F.hb(z, Math.min(h, F.side(z))) + 0.01, Math.min(h, F.side(z)), z]).concat([[F.hbRail(z, F.rail(z)), F.rail(z), z]])), 7), 'starboard side');
    proxy(grid(zs.map(z => [0, 2, 4, 6, 8, 10].map(h => [-F.hb(z, Math.min(h, F.side(z))) - 0.01, Math.min(h, F.side(z)), z]).concat([[-F.hbRail(z, F.rail(z)), F.rail(z), z]])), 7), 'port side');
    for (const h of D.houses) {
      const xs = h.poly.map(p => p[0]), zz = h.poly.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zz), z1 = Math.max(...zz), yb = D.deckAbl(0, (z0 + z1) / 2) - 0.5;
      const g = new T.BoxGeometry(x1 - x0, h.top - yb, z1 - z0); g.translate((x0 + x1) / 2, (h.top + yb) / 2, (z0 + z1) / 2);
      proxy(g, h.name);
    }
    for (const b of D.stopperBoxes) { const g = new T.BufferGeometry(); const pos = b.poly.flatMap(([x, z]) => [x, b.y, z]); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex([0, 1, 2, 0, 2, 3].slice(0, b.poly.length === 4 ? 6 : 0).concat(b.poly.length > 4 ? b.poly.slice(1, -1).flatMap((_, i) => [0, i + 1, i + 2]) : [])); proxy(g, 'top'); }
  }

  // ---- relations: the structures stand on the deck; the deck on the shell (the assembly check's close-ups)
  world.relate('attach', { name: 'deck on shell', a: meshes.deck, b: meshes.shell, tol: 0.02 });
  world.relate('attach', { name: 'structure on deck', a: meshes.structure, b: meshes.deck, tol: 0.05 });

  // ---- measures (against the schedule of dimensions and ship.md §1-4)
  const pos = meshes.shell.geometry.attributes.aShip.array;
  let zmin = Infinity, zmax = -Infinity, xmax = 0, hmax = 0;
  for (let i = 0; i < pos.length; i += 3) { zmin = Math.min(zmin, pos[i + 2]); zmax = Math.max(zmax, pos[i + 2]); xmax = Math.max(xmax, pos[i]); hmax = Math.max(hmax, pos[i + 1]); }
  let tris = 0; for (const m of Object.values(meshes)) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  let wlA = 0, wlMaxX = 0, wlZ0 = Infinity, wlZ1 = -Infinity;
  for (let i = 0; i < waterline.length; i++) { const p = waterline[i], q = waterline[(i + 1) % waterline.length]; wlA += p[0] * q[1] - q[0] * p[1]; wlMaxX = Math.max(wlMaxX, Math.abs(p[0])); wlZ0 = Math.min(wlZ0, p[1]); wlZ1 = Math.max(wlZ1, p[1]); }
  const measures = {
    form: F.source,
    LOA: { built: +(zmax - zmin).toFixed(3), schedule: 134.57 },
    beam: { built: +(2 * xmax).toFixed(3), schedule: 17.34 },
    depthAmidships: { built: +F.side(0).toFixed(3), schedule: 11.38 },
    sheerFwd: { built: +(F.side(S.fpZ) - F.side(0)).toFixed(3), schedule: 2.74 },
    sheerAft: { built: +(F.side(S.sternZ - 0.4) - F.side(0)).toFixed(3), schedule: 1.62 },
    stemHead: { built: +hmax.toFixed(3), schedule: 15.82 },
    waterline: { points: waterline.length, area: +Math.abs(wlA / 2).toFixed(1), halfBeam: +wlMaxX.toFixed(3), length: +(wlZ1 - wlZ0).toFixed(2), draftFwdAbl: +S.wlAbl(S.fpZ).toFixed(3), draftAftAbl: +S.wlAbl(S.apZ).toFixed(3) },
    triangles: Math.round(tris),
    buildMs: Math.round(performance.now() - t0),
  };
  return { waterline, deckAt, topAt, houses: housesW, anchors, stoppers, form: F, measures, meshes, lamps: () => lampCount };
}
