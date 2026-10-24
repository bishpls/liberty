// liberty/src/plan.js: the site plan. Every placement in the world reads from here, so the builders, the measures and
// the cameras agree on one set of numbers. Sources: research/site.md (the berth, the pier, the far view, the water,
// the hour) and research/ship.md (the ship, from HAER VA-132's drawings of her sister Arthur M. Huddell).
//
// Frame: metres, y up, y = 0 the water's surface at the show's tide. The ship's frame is the world's: origin amidships
// (half her length overall) on the centreline, bow toward -z, starboard +x (Pier 35's side), port -x (open water
// toward Pier 39). Her heading is 356.5 deg true (B4 on the rectified Esri z19 imagery, 2026-10-23: the shed's roof
// valleys tracked over 240 m, sd 0.10 m; site.md's 355 took a point in the ship's clutter), so true north lies 3.5 deg
// to starboard of the bow: SITE.northRot = -3.5 (main.js) and atBearing below.
// Hours: the engine's sun runs on local solar time; solar = PDT - 0.887 h on 31 October 2026 (the equation of time,
// +16.4 min, less the longitude's 9.6 min west of 120 W).

export const FT = 0.3048, IN = 0.0254;
const DEG = Math.PI / 180;
export const HEADING = 356.5, NORTH_ROT = -3.5;          // the bow's true bearing; the world's rotation (deg)

// ---- the night: Saturday 31 October 2026 (site.md §5)
export const NIGHT = {
  date: '2026-10-31', lat: 37.8087, decl: -14.3,                 // declination at 01:00 UT 1 Nov
  pdtMinusSolar: 0.887,
  sunsetPDT: 18.2, civilDuskPDT: 18.65, nauticalDuskPDT: 19.17, astroDuskPDT: 19.68, moonrisePDT: 23.52,
  showPeakPDT: 20.0,
};
export const solar = pdt => pdt - NIGHT.pdtMinusSolar;
export const pdt = sol => sol + NIGHT.pdtMinusSolar;

// ---- the water (site.md §4): the tide falls through the show; the world holds it at 19:30 PDT (+0.75 m MLLW)
export const WATER = {
  level: 0, mllw: -0.75, mhhw: -0.75 + 1.78,
  tideAtShowPDT: 19.5,
  // the ebb runs toward 282 deg true at up to 0.95 m/s (1.85 kt) at 20:00 PDT (NOAA SFB1205); a calm WSW evening breeze
  current: { toward: 282, speed: 0.8 }, wind: { from: 245, speed: 3.4 },
  chop: { Hs: 0.15, Tp: 1.9 },                                    // fetch-limited (JONSWAP): Hs 0.1-0.3 m, Tp 1.5-2.5 s
  colour: { down: '#22493c', grazingDay: '#4a6f90', night: '#091b19' },
};

// a true bearing (deg) and a distance (m) from midships -> world [x, z]
export function atBearing(deg, m) {
  const t = deg * DEG, r = NORTH_ROT * DEG, E = Math.sin(t), N = Math.cos(t);
  return [m * (E * Math.cos(r) - N * Math.sin(r)), -m * (E * Math.sin(r) + N * Math.cos(r))];
}
// world [x, z] -> { bearing (deg true), dist (m) } from midships
export function bearingOf(x, z) {
  const r = NORTH_ROT * DEG, E = x * Math.cos(r) - z * Math.sin(r), N = -(x * Math.sin(r) + z * Math.cos(r));   // (inverse of the rotation above)
  return { bearing: ((Math.atan2(E, N) / DEG) + 360) % 360, dist: Math.hypot(x, z) };
}

// ---- Pier 35 (site.md §1-2, rules 1-2, 8-9; B4's measurements on the rectified z19 imagery, 2026-10-23)
// The pier runs along the ship's starboard side, 2.1 m off her hull (fenders and camels), its tip 144.5 m ahead of
// midships; the bulkhead building at the shore end is oblique (the Embarcadero frontage runs 121/301 deg true): its
// water-side face crosses the pier from (10.8, 133.1) on the west edge to (72.0, 174.9) on the east edge, its street face
// ~16 m further south-west. So the west apron runs ~66 m past the stern before the bulkhead. (B4's numbers, re-measured
// with the imagery registered to the ship's midship.)
export const PIER = {
  x0: 10.8, x1: 72.0,                      // the west edge (imagery: 10.8-11.0 m off the centreline) to the east edge
  z0: -144.5,                              // the tip
  deck: 3.7 + -0.75,                       // 3.7 m above MLLW (the Port's flood profile)
  bulkheadFace: [[10.8, 133.1], [72.0, 174.9]],     // its water-side face, the shed's end (z = 125.7 + 0.684 x)
  bulkheadStreet: (x) => 141.5 + 0.684 * x,          // its street face's z at x
  apronW: 7.8,                             // the open west apron: the edge to the shed's west wall (7.4 clear under the eave)
  shed: { x0: 18.6, x1: 66.7, eaveX: [18.2, 67.1], valleys: [36.1, 49.4], ridges: [27.2, 42.9, 58.2], gables: [17.9, 13.3, 17.7],
    roofZ0: -146, eave: 13.0, roofCol: '#4d535c' },  // three gables of unequal width, the full length to the tip
  bulkhead: { wings: 8.0, pavilion: 10.5, pediment: 12.0, flagpole: 17.0, arch: 10.5, archAt: [42.65, 170.7], col: '#cccac3' },
  eastApronW: 5.3,
  bents: 3.5,                              // pile bents every ~3.5 m (estimated: no Port data)
};
// the pier's deck outline (plan view, clockwise from the tip's west corner): the bulkhead's face closes it
PIER.outline = [[PIER.x0, PIER.z0], [PIER.x1, PIER.z0], [PIER.x1, PIER.bulkheadFace[1][1]], [PIER.x0, PIER.bulkheadFace[0][1]]];
PIER.inside = (x, z) => x >= PIER.x0 && x <= PIER.x1 && z >= PIER.z0 && z <= 125.7 + 0.684 * x;
// the crowd a later film might add stands on the apron, facing the stage across the rail: keep it clear
export const CROWD_ZONE = { x0: PIER.x0, x1: PIER.x0 + PIER.apronW, z0: -60, z1: 40, deck: PIER.deck };
// the gangway (the deck builder's) lands on the apron here until the ship's numbers place it
export const GANGWAY = { landing: [PIER.x0 + 1.5, PIER.deck, 2.0] };

// ---- the neighbours (site.md §2, rule 10): placed by bearing; their outlines are the site builder's, from imagery
export const NEIGHBOURS = {
  pier33Tip: atBearing(84, 220), pier39Core: atBearing(295, 340), pier39KDock: atBearing(290, 700),
  coit: { at: atBearing(172, 700), top: 151, tower: 64 },
};

// ---- the far view (site.md §3, rule 11): bearing (deg true), distance (m), height (m above the water)
export const FAR = {
  alcatraz: { brg: 325, d: 2400, h: 41, light: { h: 65, period: 5.0 } },
  angelIsland: { brg: 340, d: 6050, h: 240, span: [328, 352] },
  tiburon: { brg: 329, d: 8400, h: 150 },
  sausalito: { brg: 309, d: 8900, h: 60 },
  tamalpais: { brg: 312, d: 20100, h: 786 },
  richmondBridge: { brg: 350, d: 14200, h: 56 },
  goldenGate: { brgS: 275, brgN: 286, d: 6420, towers: 227, deck: 67 },
  marinHeadlands: { brg: 285, d: 8400, h: 280 },
  yerbaBuena: { brg: 88, d: 3600, h: 100 },
  treasureIsland: { brg: 60, d: 3600, h: 8, span: [55, 68] },
  bayBridgeWest: { sfEnd: { brg: 147, d: 2800 }, ybiEnd: { brg: 90, d: 3350 }, towers: 160, deck: 67, lights: true },
  berkeleyHills: { brg: 62, d: 17000, h: 536 },
  diablo: { brg: 79, d: 44000, h: 1173 },
  salesforce: { brg: 157, d: 2300, h: 326 },
  transamerica: { brg: 166.5, d: 1500, h: 260 },
  russianHill: { brg: 231, d: 1400, h: 100 },
};
for (const v of Object.values(FAR)) if (v.brg !== undefined) v.at = atBearing(v.brg, v.d);

// the world's extent: what is walkable and seen up close, and the far land's reach (the far plane is 50 km: Diablo)
export const WORLD = {
  walk: { x0: -120, x1: 240, z0: -260, z1: 160 },
  near: { x0: -600, x1: 700, z0: -900, z1: 1000 },            // modelled in full: the piers, the marina, the Embarcadero, Telegraph Hill
  far: 50000,
};

// ---- the ship (research/ship.md: HAER VA-132's drawings of her sister Arthur M. Huddell, the USMC plans, photos)
// Ship coordinates: x starboard (m from the centreline), abl (m above the baseline: the keel's underside), z aft (m from
// midships = half her length overall, 67.29 m from the stem head). Builders model in ship coordinates and place with
// SHIP.toWorld / SHIP.matrix: she floats trimmed 7.2 ft by the stern (the museum's waterline, ship.md §4: 8.3 ft ABL at
// the forward perpendicular, 15.5 ft at the aft one), so her keel slopes 0.99 deg and her masts lean that much aft.
const FTM = 0.3048, STEM = 67.29;
const zs = mFromStem => mFromStem - STEM;                              // m from the stem -> z (aft +)
export const SHIP = {
  LOA: 134.57, LBP: 126.80, beam: 17.34, halfBeam: 8.67, depth: 11.38,
  stemZ: -67.28, fpZ: zs(2.16), apZ: zs(128.96), sternZ: 67.28,
  // the museum waterline: its height above the baseline at z (y = 0 there)
  wl0: 3.655, wlSlope: (4.72 - 2.53) / 126.80,                          // 3.655 m ABL at midships, +0.01727 m per m aft
  camber: 0.356, camberFlat: 3.00,                                      // two straight flats with a 3 m level flat on the centreline
  bulwark: 1.09,                                                         // above the deck at side amidships (sweeps up at the bow)
  // the deck at side (m ABL) by z: sheet 19 digitised (ship.md §2)
  sheer: [[2.16, 14.11], [5.82, 13.84], [9.78, 13.53], [14.36, 13.20], [20.45, 12.80], [26.55, 12.47], [32.64, 12.16], [41.79, 11.83],
    [47.88, 11.67], [53.98, 11.55], [63.12, 11.43], [67.70, 11.43], [72.27, 11.46], [81.41, 11.49], [90.56, 11.61], [99.70, 11.80],
    [108.84, 12.04], [117.99, 12.28], [125.61, 12.59], [129.57, 12.77], [134.14, 13.01]].map(([m, h]) => [zs(m), h]),
  // the deck's half-breadth at the deck (m): the bow and stern tables (ft aft FP -> half-breadth ft), full between
  deckHalf: [[0, 0], [2.16 + 12 * FTM, 17.1], [2.16 + 23 * FTM, 21.3], [2.16 + 32 * FTM, 23.0], [2.16 + 43 * FTM, 24.9], [2.16 + 57 * FTM, 26.9],
    [2.16 + 75 * FTM, 28.3], [2.16 + 95 * FTM, 28.45], [2.16 + 335 * FTM, 28.0], [2.16 + 350 * FTM, 27.2], [2.16 + 362 * FTM, 26.1],
    [2.16 + 375 * FTM, 24.6], [2.16 + 385 * FTM, 22.9], [2.16 + 395 * FTM, 20.6], [2.16 + 402 * FTM, 18.5], [2.16 + 410 * FTM, 15.6],
    [2.16 + 415 * FTM, 13.4], [2.16 + 420 * FTM, 10.9], [2.16 + 425 * FTM, 7.9], [2.16 + 430 * FTM, 4.6], [2.16 + 433 * FTM, 3.0], [134.57, 0]]
    .map(([m, hb]) => [zs(m), Math.min(hb, 28.45) * FTM]),
};
const interp = (tab, z) => { if (z <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (z <= tab[i][0]) { const [z0, a] = tab[i - 1], [z1, b] = tab[i]; return a + (b - a) * (z - z0) / (z1 - z0); } return tab[tab.length - 1][1]; };
SHIP.wlAbl = z => SHIP.wl0 + SHIP.wlSlope * z;
SHIP.trim = Math.atan(SHIP.wlSlope);                                     // rad, bow up
// ship coordinates -> world: a rotation about x by the trim, then down by the midship waterline's height
SHIP.toWorld = (x, abl, z) => { const c = Math.cos(SHIP.trim), s = Math.sin(SHIP.trim); return [x, abl * c - z * s - SHIP.wl0, abl * s + z * c]; };
SHIP.fromWorld = (x, y, z) => { const c = Math.cos(SHIP.trim), s = Math.sin(SHIP.trim), Y = y + SHIP.wl0; return [x, Y * c + z * s, -Y * s + z * c]; };
SHIP.matrix = () => new window.THREE.Matrix4().makeRotationX(SHIP.trim).premultiply(new window.THREE.Matrix4().makeTranslation(0, -SHIP.wl0, 0));
SHIP.sideAbl = z => interp(SHIP.sheer, z);                               // the deck at side, m ABL
SHIP.halfAt = z => interp(SHIP.deckHalf, z);                             // the deck's half-breadth, m
// the weather deck's height (m ABL) at (x, z): the sheer at the side plus the camber's two flats
SHIP.deckAbl = (x, z) => { const hb = SHIP.halfAt(z), ax = Math.abs(x); if (ax > hb) return null; const run = Math.max(hb - SHIP.camberFlat / 2, 0.01);
  return SHIP.sideAbl(z) + SHIP.camber * Math.min(1, (hb - ax) / run); };
// the deck's world height under a world point (null off the ship): ground.js's heightAt reads it (the houses, hatches and
// platforms stand above it: the hull module's deckAt replaces this once it lands)
SHIP.deckAt = (x, z) => { const s = SHIP.fromWorld(x, 0, z), a = SHIP.deckAbl(s[0], s[2]); return a === null ? null : SHIP.toWorld(s[0], a, s[2])[1]; };

// the layout fore to aft (ship.md §5-7; z in ship coordinates, aft +; heights m ABL)
SHIP.hatches = {                                                          // the coamings' outside extents; 0.91 m high above the deck at the centreline
  1: { z0: zs(12.68), z1: zs(23.35), half: 3.30 }, 2: { z0: zs(33.07), z1: zs(44.23), half: 3.30 }, 3: { z0: zs(54.44), z1: zs(60.93), half: 3.30 },
  4: { z0: zs(84.89), z1: zs(95.92), half: 3.30 }, 5: { z0: zs(104.67), z1: zs(115.67), half: 3.30 }, coaming: 0.91,
};
SHIP.masts = {                                                            // centre z; height above the deck; with the topmast
  fore: { z: zs(28.01), above: 12.28, house: [zs(27.10), zs(28.93)], houseTop: 49.8 * FTM, crowsNest: [82 * FTM, 89.5 * FTM] },
  main: { z: zs(50.02), above: 13.08, top: 19.18, house: [zs(49.13), zs(50.93)], houseTop: 47.3 * FTM },
  mizzen: { z: zs(100.28), above: 12.86, top: 18.96, house: [zs(99.30), zs(101.25)], houseTop: 47.3 * FTM },
  houseHalf: 3.11,                                                        // mast houses ~1.8 m x 6.2 m
};
SHIP.winches = { 1: [zs(23.56), zs(25.42)], 2: [zs(31.18), zs(33.07)], 3: [zs(52.46), zs(54.25)], 4: [zs(96.10), zs(98.02)], 5: [zs(102.66), zs(104.49)] };
SHIP.house = {                                                            // the midship house
  main: { z0: zs(61.33), z1: zs(84.40), half: 5.58 },
  boat: { z0: zs(60.4), z1: zs(86.6), abl: 14.05, house: [zs(61.33), zs(75.65)], houseHalf: 5.67 },     // the boat deck runs to the ship's side; its house 194.1-241.1 ft (sheet 4 plan B, B1)
  bridge: { z0: zs(59.8), z1: zs(76.2), abl: 16.37, half: 5.58, wings: [zs(61.32), zs(62.88)] },           // wings 194.1-199.2 ft (sheet 4, B1)
  top: { z0: zs(60.1), z1: zs(74.7), abl: 18.68, half: 5.70 },
  funnel: { z: zs(68.2), fa: 3.44, ath: 2.87, rim: 24.23, cap: 24.87 },
  lifeboats: [[zs(65.0), zs(72.8)], [zs(75.77), zs(82.63)]],
};
SHIP.bow = { platform: { z0: zs(3.38), z1: zs(9.66), abl: 16.22 }, tub: { z0: zs(3.38), z1: zs(8.20), dia: 5.1, rim: 57.2 * FTM }, gun3: zs(6.28), windlass: zs(8.11), bell: zs(10.7) };
SHIP.stern = { deckhouse: { z0: zs(120.1), z1: zs(129.3), wall: 8 * FTM }, platform: { z0: zs(125.88), z1: zs(132.62), abl: 15.85, width: 7.0 }, gun5: zs(128.53),
  tubs20: { z: 54.24, x: 3.60, dia: 3.29, floor: 55.1 * FTM, rim: 58.8 * FTM } };                       // sheet 4 plan A (B1): 391.6 ft aft FP, +-11.8 ft
SHIP.guns = {
  gun5: { z: zs(128.53), x: 0, boreAbl: 56.6 * FTM, trainsAft: true, length: 5.68 },
  gun3: { z: zs(6.28), x: 0, boreAbl: 59 * FTM, length: 4.06 },
  // eight Oerlikons: two on raised pillboxes forward (staggered: starboard by No.1, port by No.2; ship.md §6 asks to
  // confirm the sides from the photos), four on the top of the house, two at the after platform's forward corners
  gun20: [
    { name: 'fwd_stbd', x: 7.2, z: zs(20.3), floorAbl: null, pillbox: [zs(17.4), zs(23.2)] },
    { name: 'fwd_port', x: -7.2, z: zs(34.3), floorAbl: null, pillbox: [zs(31.1), zs(37.5)] },
    { name: 'house_fwd_stbd', x: 5.49, z: -5.90, dia: 3.29, floorAbl: 62 * FTM }, { name: 'house_fwd_port', x: -5.49, z: -5.90, dia: 3.29, floorAbl: 62 * FTM },   // sheet 4 plan D (B1)
    { name: 'house_aft_stbd', x: 4.5, z: zs(74.2), floorAbl: 62 * FTM }, { name: 'house_aft_port', x: -4.5, z: zs(74.2), floorAbl: 62 * FTM },
    { name: 'aft_stbd', x: 3.60, z: 54.24, dia: 3.29, floorAbl: 55.1 * FTM }, { name: 'aft_port', x: -3.60, z: 54.24, dia: 3.29, floorAbl: 55.1 * FTM },   // sheet 4 plan A (B1)
  ],
};
// the booms for the show: No. 2's two 5-ton booms (the foremast's aft pair) topped to 62 deg so they clear the stage's
// light bridge (B5: at 45 deg they pass y 16.7 over the stage's forward edge, inside its trim at ~17.5); the rest as
// the photos show them (B2)
SHIP.booms = { no2Topping: 62 };
// one convention for a gun's muzzle (B2 exports it, B3 and B5 read it): muzzle(t) -> { p: [x, y, z], d: [x, y, z] }
// (world; d unit, along the bore)
// the gangway (the deck builder's): from the starboard side abreast the house's after end down to the apron
SHIP.gangway = { top: { x: 8.4, z: zs(80.5) } };
GANGWAY.landing = [PIER.x0 + 2.5, PIER.deck, SHIP.toWorld(8.4, SHIP.sideAbl(zs(80.5)), zs(80.5))[2] - 6.5];

// ---- the stage (B5): on No. 2 hatch, facing the pier (+x). The ship's deck stands ~5.8 m above the pier's and her
// bulwark 1.09 m above that, so a crowd on the 7.8 m apron looks steeply up: the stage sits off-centre to starboard,
// its downstage edge at the bulwark's inside face and its floor above the bulwark's cap, levelled on adjustable legs
// (she is trimmed 1 deg by the stern; the stage is not)
export let STAGE = null;
{
  const z0 = zs(33.4), z1 = zs(45.3), zc = (z0 + z1) / 2;                 // between No. 2's forward winches and the mainmast house's clearance
  const capY = SHIP.toWorld(SHIP.halfBeam, SHIP.sideAbl(zc) + SHIP.bulwark, zc)[1];
  SHIP.stageZ = [z0, z1];
  STAGE = { x0: -3.6, x1: 8.2, z0: SHIP.toWorld(0, 12, z0)[2], z1: SHIP.toWorld(0, 12, z1)[2], floor: +(capY + 0.70).toFixed(2), facing: [1, 0, 0],
    hatch: 2, bulwarkCap: +capY.toFixed(2) };
  // the band's marks (B5, measured): feet on the floor or a riser (world), facing the pier with a turn to centre. From the
  // apron (15 seats, eye 1.6 m) a seat sees on average 0.30 of the vocalist (best 0.60), 0.20 of guitar and bass, none
  // of keys or drums: her side and the stage's lip hide them, so two IMAG screens stand beside the stage (0.81 / 0.85)
  STAGE.marks = {
    vocal: { pos: [7.25, 10.53, -27.729], face: [1, 0, 0] },
    guitar: { pos: [6.85, 10.53, -31.079], face: [0.99, 0, 0.143] },
    bass: { pos: [6.85, 10.53, -24.379], face: [0.99, 0, -0.143] },
    keys: { pos: [4.61, 10.936, -31.646], face: [0.975, 0, 0.222] },      // on a 16 in riser
    drums: { pos: [1.319, 11.14, -27.729], face: [1, 0, 0] },              // the throne, on the 24 in 8 x 8 ft riser
  };
}
