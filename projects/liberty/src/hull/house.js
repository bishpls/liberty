// liberty/src/hull/house.js: the midship house and the after deckhouse (B1), every tier from HAER sheet 4's plans (B the
// boat deck, C the bridge deck, D the top of house, A the after house top; 25 px per ft on the 400 dpi master) and sheet
// 2's heights (ship.md §5), dressed from photos 01, 17, 29, 30, 38: portholes on every tier (0.37 m clear), the dogged
// watertight doors, the wheelhouse front's square windows, the inclined ladders between decks, the boat deck's deep
// fascia arched between its brackets over the side passages, the wing roots carrying the forward 20 mm tubs, the after
// house's raft-stowage sides and the 5"/38's horseshoe. Ship coordinates; z from ft aft of the FP.
import { box, merge } from 'scene3d/geom.js';
import { wall, slab, arcPath, rail, tube, porthole, windowRect, door, ladder } from './parts.js';

const FT = 0.3048;
export const zft = ft => (ft - 213.65) * FT;          // ft aft of the FP -> ship z (m)

// the tiers (sheet 4 measured; heights from sheet 2)
export const HOUSE = {
  front: 194.1,
  main: { aft: 269.8, half: 18.3 },                             // the main-deck house (ship.md §5: 23.1 m x 11.2 m)
  boat: { fwd: 192.5, aft: 270.5, abl: 14.05, house: [194.1, 241.1], half: 18.6 },   // plan B: the boat-deck house 47 ft
  bridge: { fwd: 194.1, aft: 242.1, abl: 16.37, half: 18.6, wing: [194.1, 199.2], wingHalf: 28.9, house: [194.1, 234.3] },
  top: { abl: 18.68, aft: 234.3, half: 18.4, root: [194.1, 201.5], rootHalf: 28.8 },       // plan D, its wing roots to the beam
  tubsFwd: { ft: 194.3, x: 18.0 * FT, dia: 10.8 * FT },                                   // plan D: on the front line, +-18 ft
  tubsAft: { ft: 242.6, x: 4.5, floor: 62 * FT },                                         // (ship.md §6, plan.js)
  lifeboats: [[206.4, 232.1], [238.8, 264.1]],                                           // plan B
};
// the after house (plan A): the gun platform's outline (ft aft of its front, half-breadth ft), its front at 386 ft
export const AFT = {
  front: 386.0, abl: 15.85,
  outline: [[0, 24.0], [7.2, 22.6], [13.0, 15.0], [13.0, 11.6], [27.0, 12.0], [33.0, 10.4], [37.4, 5.8], [39.0, 0]],
  tubs: { at: 5.6, x: 11.8, dia: 10.8 },                       // the two 20 mm tubs at the forward corners
  gun: 27.4,                                                    // the 5"/38's centre, ft aft of the front
  house: { len: 31.0, half: 15.5 },                            // the deckhouse under it (sheet 2: ~387-417 ft, walls 8 ft)
};

// G: geometry lists by material (steel, deck, glass, rims), ctx: { F, deckAbl, hbTop }
export function buildHouses(G, { F, deckAbl, hbTop }, anchors, houses, stopperBoxes) {
  const S = F.S, H = HOUSE;
  const foot = (x, z) => deckAbl(x, z) - 0.04;
  const port = (o, n, seed) => { const p = porthole(o, n, { seed }); G.steel.push(p.rim); G.glass.push(p.glass); };
  let seedN = 0; const sd = () => ((seedN++ * 0.618034) % 1);
  // ---- the main-deck house
  const z0 = zft(H.front), zm1 = zft(H.main.aft), hx = H.main.half * FT, boatUnder = H.boat.abl - 0.25;
  G.steel.push(wall([[-hx, z0], [hx, z0], [hx, zm1], [-hx, zm1]], foot, () => boatUnder, 0.012, { closed: true, seed: 0.4 }));
  houses.push({ name: 'main-deck house', poly: [[-hx, z0], [hx, z0], [hx, zm1], [-hx, zm1]], top: H.boat.abl });
  // portholes along both sides at 44 ft ABL, ~9 ft apart (sheet 2); doors to the side passages
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const ft = 199 + k * 8.6, z = zft(ft);
      if (Math.abs(ft - 214) < 1.5 || Math.abs(ft - 252) < 1.5) continue;            // (where the doors are)
      port([sx * (hx + 0.002), 44 * FT, z], [sx, 0], sd());
    }
    for (const ft of [214, 252]) G.door.push(door([sx * (hx + 0.002), foot(sx * hx, zft(ft)) + 0.04, zft(ft)], [sx, 0], { hinge: sx }));
  }
  // the front: a door starboard of the centre (photo 29), portholes; the after face: two doors, portholes
  G.door.push(door([1.5, foot(1.5, z0) + 0.04, z0 - 0.002], [0, -1], { hinge: -1 }));
  for (const x of [-4.2, -1.0, 3.6]) port([x, 44 * FT, z0 - 0.002], [0, -1], sd());
  for (const x of [-2.4, 2.4]) G.door.push(door([x, foot(x, zm1) + 0.04, zm1 + 0.002], [0, 1], { hinge: Math.sign(x) }));
  for (const x of [-4.4, 0, 4.4]) port([x, 44 * FT, zm1 + 0.002], [0, 1], sd());

  // ---- the boat deck: full width over the side passages, a deep fascia arched between brackets (photos 01, 38)
  const b0 = zft(H.boat.fwd), b1 = zft(H.boat.aft), ba = H.boat.abl;
  const edge = []; for (let z = b0; z <= b1 + 1e-6; z += (b1 - b0) / 30) edge.push([hbTop(z) - 0.03, z]);
  const bpoly = edge.concat(edge.slice().reverse().map(([x, z]) => [-x, z]));
  G.hdeck.push(slab(bpoly, ba - 0.14, ba, { seed: 0.2 }));
  houses.push({ name: 'boat deck', poly: bpoly, top: ba, walkable: true });
  const bay = 3.05, nb = Math.round((b1 - b0) / bay);
  for (const sx of [-1, 1]) {
    const e = edge.map(([x, z]) => [sx * x, z]); if (sx < 0) e.reverse();
    // the fascia's lower edge: deep at each bracket, a shallow arch between (a quarter-ellipse each side)
    const lowAt = (x, z) => { const u = ((z - b0) / ((b1 - b0) / nb)) % 1, a = Math.abs(u - 0.5) * 2; return ba - 0.32 - 0.55 * Math.pow(a, 3.2); };
    G.steel.push(wall(e, lowAt, () => ba + 0.04, 0.012, { seed: 0.5 }));
    G.steel.push(rail(e.map(([x, z]) => [x - sx * 0.05, z]), () => ba, { height: 1.0, courses: 3, every: 1.55 }));
    for (let k = 0; k <= nb; k++) {
      const z = b0 + (b1 - b0) * k / nb, xo = hbTop(z) - 0.25;
      // the stanchion from the bulwark's cap to the deck's edge (photo 38), and a knee plate under the deck
      G.steel.push(tube([[sx * xo, deckAbl(xo, z) - 0.03, z], [sx * xo, ba - 0.14, z]], 0.07, { n: 8 }));
    }
  }
  // the beams under the boat deck over the side passages: a flanged beam every frame (30 in), from the house to the edge
  for (const sx of [-1, 1]) for (let z = b0 + 0.4; z < b1 - 0.2; z += 0.762) {
    const xi = sx * hx, xo = sx * (hbTop(z) - 0.08), cx = (xi + xo) / 2, L = Math.abs(xo - xi);
    G.steel.push(box([cx, ba - 0.14 - 0.11, z], [L, 0.22, 0.012]), box([cx, ba - 0.14 - 0.215, z], [L, 0.012, 0.09]));
  }
  // the boat-deck house (plan B): 47 ft, portholes at 51.5 ft ABL, doors at its corners
  const bh0 = zft(H.boat.house[0]), bh1 = zft(H.boat.house[1]), bhx = H.boat.half * FT, bridgeUnder = H.bridge.abl - 0.2;
  G.steel.push(wall([[-bhx, bh0], [bhx, bh0], [bhx, bh1], [-bhx, bh1]], () => ba - 0.02, () => bridgeUnder, 0.012, { closed: true, seed: 0.6 }));
  houses.push({ name: 'boat-deck house', poly: [[-bhx, bh0], [bhx, bh0], [bhx, bh1], [-bhx, bh1]], top: H.bridge.abl });
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 5; k++) { const ft = 201 + k * 8.4; if (Math.abs(ft - 234.6) < 2) continue; port([sx * (bhx + 0.002), 51.5 * FT, zft(ft)], [sx, 0], sd()); }
    G.door.push(door([sx * (bhx + 0.002), ba, zft(197.5)], [sx, 0], { hinge: sx }));
    G.door.push(door([sx * (bhx + 0.002), ba, zft(236.5)], [sx, 0], { hinge: -sx }));
  }
  for (const x of [-3.8, -1.3, 1.3, 3.8]) port([x, 51.5 * FT, bh0 - 0.002], [0, -1], sd());
  for (const x of [-3.0, 3.0]) port([x, 51.5 * FT, bh1 + 0.002], [0, 1], sd());
  G.door.push(door([0, ba, bh1 + 0.002], [0, 1]));
  // the engine-room skylight and the fiddley on the open after boat deck (plan B: 235-435 px, the casing's top)
  const sk0 = zft(244), sk1 = zft(262), skx = 2.0;
  G.steel.push(wall([[-skx, sk0], [skx, sk0], [skx, sk1], [-skx, sk1]], () => ba - 0.02, () => ba + 1.0, 0.03, { closed: true }));
  for (const sx of [-1, 1]) G.steel.push(slab([[0, sk0], [sx * (skx + 0.05), sk0], [sx * (skx + 0.05), sk1], [0, sk1]], x => ba + 1.0 + 0.45 * (1 - Math.abs(x) / skx), x => ba + 1.04 + 0.45 * (1 - Math.abs(x) / skx), { bottom: false }));
  // the skylight's glazed lights along its pitched sides (glass that glows at night: the engine room under it)
  // (each pane lies on the pitched roof, 6 mm above it: x 0.4-1.6 m out, the roof y = ba + 1.04 + 0.45 (1 - |x| / 1.95))
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const z = sk0 + 1.3 + k * (sk1 - sk0 - 2.6) / 2, roofY = x => ba + 1.04 + 0.45 * (1 - Math.abs(x) / skx) + 0.006;
    G.glass.push(slab([[sx * 0.4, z - 0.8], [sx * 1.6, z - 0.8], [sx * 1.6, z + 0.8], [sx * 0.4, z + 0.8]], x => roofY(x) - 0.004, x => roofY(x), { bottom: false, edges: false }));
  }
  houses.push({ name: 'skylight', poly: [[-skx, sk0], [skx, sk0], [skx, sk1], [-skx, sk1]], top: ba + 1.5 });
  // the boat deck's lockers (plan B): the potato locker to port of the skylight's after end, the life-jacket box to
  // starboard by the deck's after edge; steel boxes with hinged lids, louvred
  for (const [x, f0, f1, w, hgt, name] of [[-4.6, 250.8, 258.4, 1.25, 1.1, 'potato locker'], [0.55, 259.8, 262.7, 1.0, 0.85, 'life-jacket box']]) {
    const z0 = zft(f0), z1 = zft(f1), zc = (z0 + z1) / 2;
    G.steel.push(box([x, ba + hgt / 2 - 0.01, zc], [w, hgt, z1 - z0]), box([x, ba + hgt + 0.02, zc], [w + 0.06, 0.04, z1 - z0 + 0.06]));
    for (let k = 0; k < 4; k++) G.steel.push(box([x + Math.sign(x || 1) * (w / 2 + 0.005), ba + 0.3 + k * 0.12, zc], [0.012, 0.03, (z1 - z0) * 0.6]));
    houses.push({ name, poly: [[x - w / 2, z0], [x + w / 2, z0], [x + w / 2, z1], [x - w / 2, z1]], top: ba + hgt });
  }
  // ladders: main deck -> boat deck at the house front (photo 29, to port of the centre) and at the boat deck's after
  // corners (plan B); boat deck -> bridge deck at the boat-deck house's after corners and up to the wings forward
  G.steel.push(ladder([-3.4, deckAbl(-3.4, z0 - 2.7), z0 - 2.7], [-3.4, ba, b0 - 0.05], 0.75));
  for (const sx of [-1, 1]) {
    G.steel.push(ladder([sx * 5.0, deckAbl(5.0, b1 + 2.6), b1 + 2.6], [sx * 5.0, ba, b1 - 0.05], 0.7));
    G.steel.push(ladder([sx * (bhx + 0.9), ba, bh1 + 2.6], [sx * (bhx + 0.9), H.bridge.abl, zft(H.bridge.aft) - 0.05], 0.65));
    G.steel.push(ladder([sx * (bhx + 0.75), ba, zft(203)], [sx * (bhx + 0.75), H.bridge.abl, zft(H.bridge.wing[1]) + 0.05], 0.6));
  }

  // ---- the bridge deck (plan C): the boat-deck house's roof, the wings to the beam at the front, open aft
  const r = H.bridge, rz0 = zft(r.fwd), rz1 = zft(r.aft), rhx = r.half * FT + 0.25, wz1 = zft(r.wing[1]), whx = r.wingHalf * FT;
  const rpoly = [[-whx, rz0], [whx, rz0], [whx, wz1], [rhx, wz1], [rhx, rz1], [-rhx, rz1], [-rhx, wz1], [-whx, wz1]];
  G.hdeck.push(slab(rpoly, r.abl - 0.16, r.abl, { seed: 0.3 }));
  houses.push({ name: 'bridge deck', poly: rpoly, top: r.abl, walkable: true });
  for (const sx of [-1, 1]) {
    const side = [[sx * (whx - 0.05), rz0 + 0.05], [sx * (whx - 0.05), wz1 - 0.05], [sx * (rhx - 0.05), wz1 - 0.05], [sx * (rhx - 0.05), rz1 - 0.05], [sx * 1.4, rz1 - 0.05]];
    G.steel.push(rail(sx > 0 ? side : side, () => r.abl, { height: 1.05, courses: 3, every: 1.5 }));
    // the wings' fronts: splinter shields faced with plastic armour (ship.md §5; photos 05, 06)
    const shield = sx > 0 ? [[rhx, rz0 - 0.02], [whx, rz0 - 0.02]] : [[-whx, rz0 - 0.02], [-rhx, rz0 - 0.02]];
    G.armour.push(wall(shield, () => r.abl - 0.05, () => r.abl + 1.3, 0.14, { seed: 0.7 }));
    G.armour.push(wall(sx > 0 ? [[whx + 0.02, rz0], [whx + 0.02, wz1]] : [[-whx - 0.02, wz1], [-whx - 0.02, rz0]], () => r.abl - 0.05, () => r.abl + 1.3, 0.14));
    // the side light's screened box at the wing's end (red to port, green to starboard: B2 lights them)
    G.steel.push(box([sx * (whx - 0.25), r.abl + 1.45, rz0 + 1.1], [0.12, 0.5, 0.75]));
  }
  anchors.sideLights = [-1, 1].map(sx => ({ side: sx > 0 ? 'starboard' : 'port', pos: [sx * (whx - 0.18), r.abl + 1.45, rz0 + 1.1] }));
  // the bridge house: the wheelhouse forward (its front a row of square windows: photos 29, 30), chart room, the
  // master's cabin and the radio room, portholes at 58.5 ft ABL
  const uz1 = zft(r.house[1]), uhx = r.half * FT, topUnder = H.top.abl - 0.18;
  G.steel.push(wall([[-uhx, rz0], [uhx, rz0], [uhx, uz1], [-uhx, uz1]], () => r.abl - 0.02, () => topUnder, 0.012, { closed: true, seed: 0.8 }));
  houses.push({ name: 'bridge house', poly: [[-uhx, rz0], [uhx, rz0], [uhx, uz1], [-uhx, uz1]], top: H.top.abl });
  for (let k = 0; k < 9; k++) { const x = (k - 4) * 1.12; const w = windowRect([x, r.abl + 1.45, rz0 - 0.002], [0, -1], 0.5, 0.55, { seed: sd() }); G.steel.push(w.frame); G.glass.push(w.glass); }
  for (const sx of [-1, 1]) {
    G.door.push(door([sx * (uhx + 0.002), r.abl, zft(198.3)], [sx, 0], { hinge: sx }));
    for (let k = 0; k < 4; k++) port([sx * (uhx + 0.002), 58.5 * FT, zft(206 + k * 7.6)], [sx, 0], sd());
  }
  G.door.push(door([0, r.abl, uz1 + 0.002], [0, 1]));
  for (const x of [-3.4, 3.4]) port([x, 58.5 * FT, uz1 + 0.002], [0, 1], sd());

  // ---- the top of house (plan D): the flying bridge, its wing roots carrying the forward tubs to the beam
  const t = H.top, tz1 = zft(t.aft), thx = t.half * FT, rr0 = zft(t.root[0]) - 0.15, rr1 = zft(t.root[1]), rrh = t.rootHalf * FT;
  const tpoly = [[-rrh, rr0], [rrh, rr0], [rrh - 0.1, rr0 + 1.0], [21.2 * FT, rr1 - 0.3], [thx, rr1], [thx, tz1], [-thx, tz1], [-thx, rr1], [-21.2 * FT, rr1 - 0.3], [-rrh + 0.1, rr0 + 1.0]];
  G.hdeck.push(slab(tpoly, t.abl - 0.18, t.abl, { seed: 0.4 }));
  G.steel.push(rail(tpoly.slice(2).concat([tpoly[0], tpoly[1]]).map(([x, z]) => [x * 0.985, z + (z < rr0 + 0.5 ? 0.06 : 0)]), () => t.abl, { closed: true, height: 1.0, courses: 3, every: 1.5 }));
  houses.push({ name: 'top of house', poly: tpoly, top: t.abl, walkable: true });
  // the compass platform (27) and the ladder down at the after end
  G.hdeck.push(slab([[-1.4, zft(196)], [1.4, zft(196)], [1.4, zft(203)], [-1.4, zft(203)]], t.abl, t.abl + 0.45));
  G.steel.push(rail([[-1.35, zft(196) + 0.05], [1.35, zft(196) + 0.05], [1.35, zft(203) - 0.05], [-1.35, zft(203) - 0.05]], () => t.abl + 0.45, { closed: true, height: 0.9, courses: 2, every: 1.2 }));
  G.steel.push(ladder([0, r.abl, tz1 + 1.4], [0, t.abl, tz1 - 0.05], 0.5));
  anchors.compass = [0, t.abl + 0.45, zft(199.5)];
  // ---- the funnel: an upright oval casing from the top of house to the rim, a flared black rain hood
  const f = S.house.funnel, fa = f.fa / 2, fb = f.ath / 2, ring = [];
  for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; ring.push([fb * Math.sin(a), f.z + fa * Math.cos(a)]); }
  G.steel.push(wall(ring.slice().reverse(), () => t.abl - 0.05, () => f.rim, 0.012, { closed: true, seed: 0.9 }));
  const hood = ring.map(([x, z]) => [x * 1.14, f.z + (z - f.z) * 1.12]);
  G.boot.push(wall(hood.slice().reverse(), () => f.rim - 0.15, () => f.cap - 0.12, 0.02, { closed: true }));
  G.boot.push(slab(ring.map(([x, z]) => [x * 1.16, f.z + (z - f.z) * 1.14]), f.cap - 0.14, f.cap - 0.1, { bottom: true }));      // (the hood's top plate: a lid over the inner stack)
  G.boot.push(slab(ring.map(([x, z]) => [x * 0.55, f.z + (z - f.z) * 0.55]), f.rim - 0.3, f.cap + 0.05));          // the inner stack's mouth
  for (let k = 0; k < 4; k++) G.boot.push(box([0, f.rim + 0.2, f.z + (k - 1.5) * 0.7], [f.ath * 1.1, 0.06, 0.05]));        // the hood's stays
  // the steam pipe up its after face, the whistle on its forward face (B2 may dress it; ship.md §5)
  G.steel.push(tube([[0.2, t.abl - 0.02, f.z + fa + 0.06], [0.2, f.cap + 0.5, f.z + fa + 0.06]], 0.07, { n: 8 }));
  G.steel.push(tube([[0, f.rim - 2.2, f.z - fa - 0.05], [0, f.rim - 1.2, f.z - fa - 0.05]], 0.06, { n: 8 }));
  anchors.funnel = { centre: [0, f.rim, f.z], rim: f.rim, cap: f.cap, fa: f.fa, ath: f.ath, whistle: [0, f.rim - 1.2, f.z - fa - 0.05], smoke: [0, f.cap, f.z] };
  houses.push({ name: 'funnel', poly: ring, top: f.cap });

  // ---- the 20 mm tubs on the house: the forward pair on the wing roots, the after pair on raised platforms
  const tub = (x, z, base, dia, name, pedestal = null) => {
    const R = dia / 2;
    G.steel.push(wall(arcPath(x, z, R, 0, Math.PI * 2, 32).reverse(), () => base - 0.05, () => base + 1.1, 0.012, { seed: 0.55 }));
    G.steel.push(wall(arcPath(x, z, R + 0.025, 0, Math.PI * 2, 32).reverse(), () => base + 1.04, () => base + 1.12, 0.045));     // the rim's bead (lapping the wall's top)
    G.hdeck.push(slab(arcPath(x, z, R, 0, Math.PI * 2, 32).slice(0, -1), base - 0.08, base));
    if (pedestal) { G.steel.push(wall(arcPath(x, z, R * 0.92, 0, Math.PI * 2, 24).reverse(), () => pedestal - 0.04, () => base - 0.06, 0.012, { closed: true })); }
    anchors.gun20[name] = { ring: [x, base, z], rim: base + 1.1, dia };
  };
  anchors.gun20 = anchors.gun20 || {};
  for (const sx of [-1, 1]) tub(sx * H.tubsFwd.x, zft(H.tubsFwd.ft), t.abl + 0.06, H.tubsFwd.dia, sx > 0 ? 'house_fwd_stbd' : 'house_fwd_port');
  for (const sx of [-1, 1]) {
    const x = sx * H.tubsAft.x, z = zft(H.tubsAft.ft);
    tub(x, z, H.tubsAft.floor, 2.9, sx > 0 ? 'house_aft_stbd' : 'house_aft_port', r.abl);
    houses.push({ name: 'after tub ' + sx, poly: arcPath(x, z, 1.45, 0, Math.PI * 2, 12).slice(0, -1), top: H.tubsAft.floor });
  }
  stopperBoxes.push({ poly: tpoly.slice(0, 4), y: t.abl });

  // ---- the after house (plan A) and the 5"/38's horseshoe platform
  const A = AFT, af = zft(A.front), az = ftp => af + ftp * FT;
  const outline = A.outline.map(([fp, h]) => [h * FT, az(fp)]);
  const plat = outline.concat(outline.slice(0, -1).reverse().map(([x, z]) => [-x, z]));
  // (the outline's forward points carry the full width: clip them inside the hull's side + 0.3 m: the raft stowage overhangs a little)
  const platC = plat.map(([x, z]) => [Math.sign(x) * Math.min(Math.abs(x), hbTop(Math.min(z, S.sternZ - 0.3)) + 0.3), z]);
  G.hdeck.push(slab(platC, A.abl - 0.22, A.abl, { seed: 0.35 }));
  // its deep side plate: the platform reads as a drum ~1.5 m deep over the deckhouse (photos 10, 17: the band under the
  // rail is about 1.6x the rail's height), with a flange at its foot
  G.steel.push(wall(orient(platC), () => A.abl - 1.5, () => A.abl + 0.02, 0.012, { closed: true, seed: 0.36 }));
  G.steel.push(wall(orient(platC).map(([x, z]) => [x * 1.006, z + (z > af + 6 ? 0.03 : 0)]), () => A.abl - 1.56, () => A.abl - 1.48, 0.07, { closed: true }));
  G.hdeck.push(slab(platC.map(([x, z]) => [x * 0.995, z]), A.abl - 1.52, A.abl - 1.5, { bottom: true }));
  houses.push({ name: 'gun platform', poly: platC, top: A.abl, walkable: true });
  stopperBoxes.push({ poly: platC, y: A.abl });
  // the deckhouse under it: a rounded oblong, 31 ft x 31 ft, its aft end round, portholes, a door forward
  const dh = [], dz0 = af + 0.4, dz1 = af + A.house.len * FT, dhx = A.house.half * FT;
  for (let k = 0; k <= 16; k++) { const a = Math.PI / 2 - k / 16 * Math.PI; dh.push([dhx * Math.sin(a), dz1 - dhx + dhx * Math.cos(a)]); }   // starboard -> aft -> port
  const dpolyOrdered = [[-dhx, dz0], [dhx, dz0], ...dh];
  G.steel.push(wall(orient(dpolyOrdered), foot, () => A.abl - 0.22, 0.012, { closed: true, seed: 0.25 }));
  houses.push({ name: 'after deckhouse', poly: dpolyOrdered, top: A.abl });
  for (const sx of [-1, 1]) for (const fp of [7, 14]) port([sx * (dhx + 0.002), deckAbl(dhx, az(fp)) + 1.95, az(fp)], [sx, 0], sd());
  G.door.push(door([0, foot(0, dz0) + 0.04, dz0 - 0.002], [0, -1]));
  for (const x of [-2.8, 2.8]) port([x, deckAbl(x, dz0) + 1.95, dz0 - 0.002], [0, -1], sd());
  // its rail round the horseshoe and the sides; stanchions under the overhang; ladders up from the deck at its front
  const railPath = platC.slice(2, platC.length - 2).map(([x, z]) => [x * 0.97, z - 0.04]);
  G.steel.push(rail(railPath, () => A.abl, { height: 1.0, courses: 3, every: 1.4 }));
  for (const sx of [-1, 1]) {
    G.steel.push(ladder([sx * 2.0, deckAbl(2.0, af - 2.4), af - 2.4], [sx * 2.0, A.abl, af - 0.05], 0.6));
    for (const fp of [33.0, 36.5]) { const z = az(fp), x = sx * Math.min(8 * FT, hbTop(Math.min(z, S.sternZ - 0.5)) - 0.3); G.steel.push(tube([[x, deckAbl(x, Math.min(z, S.sternZ - 0.4)) - 0.03, Math.min(z, S.sternZ - 0.4)], [x, A.abl - 0.22, z]], 0.09, { n: 8 })); }
  }
  anchors.gun5 = { ring: [0, A.abl, az(A.gun)], boreAbl: S.guns.gun5.boreAbl };
  // its two 20 mm tubs (plan A: at 5.6 ft aft of the front, +-11.8 ft; 10.8 ft across), on bases to 55.1 ft ABL
  for (const sx of [-1, 1]) tub(sx * A.tubs.x * FT, az(A.tubs.at), 55.1 * FT, A.tubs.dia * FT, sx > 0 ? 'aft_stbd' : 'aft_port', A.abl);
  return { platC, dpoly: dpolyOrdered };
}
// a closed plan polygon wound so wall() faces outward (positive area in x, z)
function orient(poly) { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a >= 0 ? poly : poly.slice().reverse(); }
