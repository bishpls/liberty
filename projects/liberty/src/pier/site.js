// liberty/src/pier/site.js: the waterfront's measured geometry (B4). Every outline here was traced on Esri World
// Imagery (z19 at 0.25 m/px round the berth, z18 at 0.5 m/px over the near box), rectified onto the world's frame
// (plan.js: origin at the ship's measured midship 37.80873 N 122.40687 W, -z = 356.5 deg true) by
// scratchpad/pier/scripts/georef.py; the photos and the imagery are local-only references (never in git).
// Numbers are metres in the world frame (x starboard/east-ish, z aft/south-ish, y up from the show's water).
// Each block names how it was measured: 'traced' = read off a labelled crop at 4-12 px/m (+-1 m), 'fit' = a line fitted
// to tracked edges (sd given), 'photo' = scaled off a photograph (method given), 'est' = estimated (no source).
import * as P from '../plan.js';

const PI = P.PIER;
// ---- Pier 35 (plan.js holds the adopted numbers; they came from these measurements, 2026-10-23)
export const P35 = {
  x0: PI.x0, x1: PI.x1 || 72.0, z0: PI.z0, deck: PI.deck,
  // the shed: walls, eaves, the three unequal gables (valleys fit over 260 m, sd 0.10 m)
  wallW: (PI.shed && PI.shed.x0) || 18.6, wallE: (PI.shed && PI.shed.x1) || 66.7,
  eaveW: 18.2, eaveE: 67.1, valleys: (PI.shed && PI.shed.valleys) || [36.1, 49.4],
  // heights (photo: the wall's door and window courses against Pier 33's in photo 12, the bulkhead wings in photo 07;
  // est. 9-10 m to the eave above the deck); one roof pitch for the three gables (photo 07: ~18 deg, est.)
  eaveH: 9.6, pitch: 18,
  // the bulkhead: its street face and its back (the shed's end) run at 121 deg true, 34.4 deg off our x axis (traced)
  slope: 0.684, streetZ0: 141.5, backZ0: 125.7,
  tipApron: 0.8,                 // the deck in front of the shed's end wall at the tip (z19: the roof's verge sits ~0.3 m inside the deck's edge; with a 0.45 m overhang the wall stands ~0.8 m in)
  bay: 6.1,                      // the shed's wall bays (photo 01: pilasters ~6-7 m apart; 20 ft, est.)
};
P35.streetZ = x => P35.streetZ0 + P35.slope * x;
P35.backZ = x => P35.backZ0 + P35.slope * x;
P35.axisX = (P35.wallW + P35.wallE) / 2;
// the frontage's direction (unit, along +x) and its outward normal (toward the street, SW)
{ const l = Math.hypot(1, P35.slope); P35.along = [1 / l, P35.slope / l]; P35.out = [-P35.slope / l, 1 / l]; }

// ---- the shore: the water's edge of the land (seawalls, wharf faces), west to east along the near box (traced on
// z18 and z19, +-2 m). The land lies south (+z) of it; the piers' decks are their own (not land).
export const SHORE = [
  [-660, -50], [-600, -55], [-540, -58], [-500, -62], [-488, -72], [-470, -80], [-440, -82], [-420, -74], [-410, -58],
  [-402, -40], [-392, -24], [-360, -19], [-320, -16],               // Fisherman's Wharf to Pier 39's root
  [-312, -2], [-300, 8], [-262, 14], [-236, 16],                    // Pier 39's root (its deck stands on piles north of here)
  [-200, 20], [-170, 26], [-140, 34], [-110, 42], [-96, 50],        // the east marina's south shore
  [-60, 68], [-56, 72], [4.3, 98.6], [6, 112], [5, 130], [2, 140],  // the timber wharf west of Pier 35 (traced on z19)
  // the bulkhead buildings' street face: Pier 35's and Pier 33's (joined, photo 07) stand on the piers' decks and the
  // land begins at their face (z = 141.5 + 0.684 x, traced); the Embarcadero follows it
  [2, 142.9], [262, 320.7],
  // east of Pier 31: Pier 29's bulkhead front, then round the lawn at Pier 27's root (Pier 27's plaza is deck), then the
  // street face of Pier 23's and Pier 19's bulkheads (z18 at 5-6 px/m, +-2 m; retraced from the median's palms and the
  // building faces, 2026-10-23 evening)
  [300, 352], [330, 395], [346, 420], [360, 462], [398, 480], [470, 480], [470, 600], [491.5, 639], [568.5, 766],
  [625, 860], [680, 950], [705, 990],
];
// the stretch of SHORE that is the bulkhead's street face (no water there: no seawall, no railing)
export const FRONTAGE = { x0: 2, x1: 262 };
// the Embarcadero's centreline: the middle of its median (the F-line's tracks, the palms south of Pier 31), fit to
// OpenStreetMap's two carriageways (assets/near streets: the midpoints between them every 4 m, binned at 8 m, smoothed,
// simplified at 0.5 m; scratchpad/pier/osm/embfit2.py) and checked on z19/z18 cross-sections (the median centred within
// ~1 m from Pier 35 to the box's south-east end). West of Pier 39's east marina it is OSM's single centreline (The
// Embarcadero, then Jefferson Street past x -500; the paved road sits ~2.5 m bayward of it there). At Pier 35 the median
// is 31.5 m off the bulkhead's street face (36.5 m by Pier 33): the promenade ~17 m to the kerb, the waterside lanes and
// bike lane, the median 9 m with its two tracks 4.4 m apart, two lanes, parking, the far sidewalk. (The first trace,
// 2026-10-23, read the waterside lanes as the median: it ran 12-26 m bayward of the road from Pier 35 to Pier 29 and
// 11 m city-ward at the south-east end; refit 2026-10-24.)
export const EMB = {
  line: [[-700, -0.3], [-655.8, -4.5], [-536.1, -16.0], [-512.7, -16.4], [-474.9, -8.3], [-353.6, 22.9], [-215.3, 52.2],
    [-199.3, 57.0], [-184.3, 63.9], [-142.1, 88.7], [-87.8, 121.7], [-33.2, 156.2], [78.2, 234.4], [148.1, 287.0],
    [172.8, 307.1], [202.0, 335.0], [357.5, 494.7], [379.1, 518.2], [394.4, 537.3], [408.0, 557.9], [483.4, 678.8],
    [700.7, 1031.6]],
  half: 13.5, lanes: [4.5, 11.5], median: 4.5, tracks: 2.2, walk: 5.5,        // the full section (below): kerbs at 13.5, the median's at 4.5; sidewalks 5.5 m, the promenade to the water
  // the cross-section along the road, by the centreline's x (read off z19 cross-sections every ~25 m, 1 m ticks; scratchpad/
  // pier/osm/xprof.py): c the road's middle off the line (+ city-ward), hb and hc its bay and city kerbs from that middle,
  // md the median's half-width (0: none; the F-line's tracks 2.2 m off the middle where there is one). By Pier 39 and west
  // the road is ~13.7 m kerb to kerb with no median (its kerbs at -9.5 and +4.2 off the line, x -433..-95); it widens to the
  // full section by the Kearny junction (x -80..-30); along lot 1 its city kerb is 10 m off the median's middle (the
  // trees' strip, then the lot, x -30..75); from Bay Street on, the full section
  profile: [[-700, -2.65, 6.85, 6.85, 0], [-80, -2.65, 6.85, 6.85, 0], [-30, 0, 13.5, 10, 4.5], [75, 0, 13.5, 10, 4.5], [110, 0, 13.5, 13.5, 4.5], [800, 0, 13.5, 13.5, 4.5]],
};
// the cross-section at a centreline point's x: { c, hb, hc, md, tk (the tracks' offset from c, 0 none), exB (the bay side's
// bike lane inside its kerb), exC (the city side's parking lane) }; widths in metres from the road's middle
export function embProfile(x) {
  const K = EMB.profile; let i = 0; while (i < K.length - 2 && K[i + 1][0] < x) i++;
  const a = K[i], b = K[i + 1], t = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0])));
  const [c, hb, hc, md] = [1, 2, 3, 4].map(k => a[k] + (b[k] - a[k]) * t);
  const ex = (h) => Math.max(0, Math.min(2, h - md - 7.0));
  return { c, hb, hc, md, tk: md > 3.0 ? EMB.tracks : 0, exB: ex(hb), exC: ex(hc) };
}
// the city's buildings, streets and car parks come from data (near.js: DataSF's footprints and OSM, assets/near). The first
// cut traced two car parks and seven buildings here and laid the rest on a 50-vara grid fitted on z18; against OSM's
// centrelines that grid ran 5.4 deg off the real streets, a median 17 m (E-W) and 21.5 m (N-S) out, p90 44 m (2026-10-24)
// parks and gardens (traced on z18, +-5 m): their ground is grass, paths and trees; no lots
export const PARKS = {
  pioneer: [[-28, 600], [-5, 562], [40, 548], [92, 562], [128, 600], [142, 660], [128, 730], [100, 772], [55, 790], [10, 778], [-22, 740], [-36, 680]],   // Coit Tower's summit (Pioneer Park)
  eastSlope: [[128, 600], [175, 590], [235, 620], [262, 680], [248, 740], [200, 760], [142, 730], [142, 660]],                                         // the quarried east face: cliffs, gardens, the Filbert steps
  washington: [[-378, 805], [-289, 805], [-289, 889], [-378, 889]],                                                                                    // Washington Square
  dimaggio: [[-544, 611], [-439, 611], [-439, 705], [-544, 705]],                                                                                       // Joe DiMaggio playground
  levi: [[125, 345], [215, 345], [215, 410], [125, 410]],                                                                                               // Levi's Plaza's lawn
  pier27: [[395, 482], [470, 482], [470, 590], [420, 560]],                                                                                             // the lawn at Pier 27's root
};

// ---- Pier 33 (fit on z19: its west deck edge x = -0.429 z + 214.1 over 195 m, sd 0.38 m; its tip z = 0.428 x - 100.5,
// sd 0.23; the roof's east edge x = -0.424 z + 259.3 plus a 2.8 m east apron, est.): its axis 23.2 deg east of our -z
// (19.7 deg true); the root corners where its edges meet the bulkhead's back line (z = 125.7 + 0.684 x)
export const P33 = {
  tip: [[217.3, -7.5], [258.0, 10.0]],
  root: [[123.9, 210.4], [161.1, 235.9]],
  deck: 2.95, eave: 9.0, westApron: 3.0, eastApron: 2.8,
  monitors: 8,                                   // skylight monitors along the roof's centre (photo 07: ~10; z19: 8)
};
// ---- Pier 31 (fit on z18: the roof's east edge x = -0.742 z + 476.0, sd 0.20; the west deck edge x = -0.735 z + 427.0,
// sd 1.7; the tip z = 0.713 x - 158.2, sd 0.29; a 3.6 m east apron est.): its axis 36.4 deg east of our -z
export const P31 = { tip: [[356.5, 96.0], [391.0, 120.6]], root: [[222.4, 278.6], [256.4, 302.0]], deck: 2.95, eave: 9.0, westApron: 3.0, eastApron: 3.6, monitors: 9 };
// Alcatraz Landing's apron between Pier 33's root and Pier 31's (z19, +-3 m): the queue tents, the big white canopy
// Piers 29 and 27 (z18, +-3 m): one deck from Pier 29's arm (its NW edge along the slip east of Pier 31) to Pier 27's
// pointed tip and its long east berth (x = 556 - 0.18 (z - 196)); the cruise terminal (2014) a long low glass hall
// along the east berth; Pier 23 a finger with its shed, its root building on the Embarcadero
export const P27 = {
  deck: [[495, 158], [516, 150], [556, 196], [483, 600], [470, 600], [470, 480], [398, 480], [360, 462], [346, 420], [330, 395], [318, 372], [341, 324]],
  terminal: [[470, 255], [520, 258], [508, 470], [455, 468]], arm: [[492, 170], [505, 182], [356, 345], [342, 330]],
};
export const P23 = { deck: [[526, 623], [700, 506], [700, 560], [569, 649], [597, 700], [568.5, 766], [491.5, 639]], shed: [[540, 630], [700, 522], [700, 555], [565, 646]], root: [[515, 628], [566, 642], [597, 700], [566, 752], [500, 650]] };
export const LANDING = { deck: [[168, 203], [205, 195], [238, 250], [225, 277], [161, 236]], canopy: [[196, 207], [210, 219]], tents: [[203, 222], [219, 238]] };     // (inside the apron's east edge)

// ---- Pier 39 (traced on z19 at 2-4 px/m, +-2 m): the retail pier and its two-storey timber buildings
export const P39 = {
  // the deck's outline (clockwise from the root's west corner)
  outline: [[-318, -8], [-318, -30], [-317, -80], [-330, -140], [-347, -210], [-376, -268], [-378, -290], [-362, -311],
    [-330, -318], [-293, -319.5], [-270, -312], [-266, -258], [-271, -220], [-270, -150], [-258, -110], [-248, -70],
    [-236, -50], [-212, -50], [-200, -20], [-210, 8], [-236, 16], [-262, 14], [-300, 8]],
  carousel: [-322, -242],                         // its round roof (z19)
  aquarium: [[-236, -55], [-200, 15]],            // the Aquarium of the Bay's blue roofs (z19)
};
// ---- the east marina (Pier 39's): the breakwaters and the dock rows (traced on z19)
export const MARINA = {
  north: [[-276, -326], [-131, -298]],            // the north breakwater
  east: [[-131, -298], [-66, -16]],               // the east breakwater (its south end abreast the ship's midships)
  rows: [                                          // main walkways [z, x west, x east], fingers both sides
    [-300, -268, -148], [-250, -282, -138], [-194, -282, -122], [-140, -276, -108], [-92, -262, -100], [-42, -246, -92],
  ],
  south: [[-232, 18, -82], [-150, 30, -96]],      // the shore's own slips (z, x0, x1)
  finger: 11.0, pitch: 4.6,                        // finger length (m) and slip pitch (est.: 35-40 ft boats)
};
// ---- the west marina, Pier 41 and K-Dock (traced on z18 at 4 px/m)
export const WEST = {
  kdock: [[-424, -262], [-392, -212]],            // the sea lions' floats (z18: the brown floats)
  kdock2: [[-398, -268], [-386, -228]],
  pier41: [[-500, -240], [-488, -232], [-430, -110], [-440, -104]],
  breakwater41: [[-500, -240], [-392, -305]],
  wheel: [-577.5, -40],                            // the Ferris wheel (z18: its disc; 46 m, site.md)
  rows: [[[-358, -186], [-428, -161]], [[-336, -128], [-398, -108]]],     // the west marina's dock rows (z18, +-4 m)
};
// ---- Telegraph Hill
export const COIT = { at: [49.5, 704.0], h: 64.0, r: 5.6 };   // traced: the shaft's foot on z18 (the imagery leans its top 21 m NNE)
