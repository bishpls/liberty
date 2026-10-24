// liberty/src/stage/layout.js: every placement in the stage's part of the world, derived from the plan (P.STAGE,
// P.SHIP, P.PIER, P.CROWD_ZONE) and research/show.md's gear, so the structure, the rig, the cues, the effects and the
// measures read one set of numbers (ENVIRONMENT rule 3). World metres: bow -z, starboard and the pier +x, y up.
//
// The stage faces the pier (+x): downstage is +x, upstage -x; a performer facing the pier has stage right toward the
// stern (+z) and stage left toward the bow (-z).
const FT = 0.3048, IN = 0.0254;

// the ship's surfaces under the stage: the hull's deckAt once it lands, else the plan's; the No. 2 hatch's cover top
export function shipGround(P, hull) {
  const S = P.SHIP;
  const deckY = (x, z) => {
    const y = hull && hull.deckAt ? hull.deckAt(x, z) : S.deckAt(x, z);
    return y === null || y === undefined ? null : y;
  };
  // a hatch's cover: wooden boards on steel beams under a tarpaulin, 0.91 m coaming above the deck at the centreline,
  // its crown ~5 cm above the coaming's top (ship.md §hatches); returns null outside the coaming
  const HA = hull && hull.anchors && hull.anchors.hatches;
  const hatchTop = (x, z, n = 2) => {
    const h = S.hatches[n], s = S.fromWorld(x, 0, z);
    if (Math.abs(s[0]) > h.half || s[2] < h.z0 || s[2] > h.z1) return null;
    // the coaming's top (the hull's anchors when it has landed), the boards' crown ~5 cm over it at the centreline
    const a = HA && HA[n] ? HA[n].topFwd + (HA[n].topAft - HA[n].topFwd) * (s[2] - HA[n].z0) / (HA[n].z1 - HA[n].z0) : S.deckAbl(0, s[2]) + S.hatches.coaming;
    const abl = a + 0.05 * (1 - (s[0] / h.half) ** 2);
    return S.toWorld(s[0], abl, s[2])[1];
  };
  // what a foot stands on at (x, z): the hatch cover where there is one, else the deck
  const footY = (x, z) => { for (const n of [1, 2, 3]) { const h = hatchTop(x, z, n); if (h !== null) return h; } return deckY(x, z); };
  const topAt = hull && hull.topAt ? (x, z) => hull.topAt(x, z) : null;
  return { deckY, hatchTop, footY, topAt };
}

export function makeLayout(P, G, deck = null) {
  const S = P.SHIP, ST = P.STAGE, F = ST.floor;
  const L = { F, FT, IN, G };          // (G: the ship's surfaces, for the pyro clearances and the measures)
  // her deck's half-breadth at a world z (the plan's line: what a foot, a tote, a sole board must stay inside)
  L.halfAt = z => S.halfAt(S.fromWorld(0, 0, z)[2]);
  // ---- the decks (show.md S2: 4 x 8 ft platforms, 7/8 in ply on an aluminium frame), 9 rows of 4 ft from the lip
  // (36 ft deep) and 4 x 8 ft + a 4 x 4 ft across (36 ft wide), centred on the plan's stage; levelled at the floor
  const mod = 4 * FT, rows = 9, zc = (ST.z0 + ST.z1) / 2, width = 4 * 8 * FT + 4 * FT;
  L.deck = { x1: ST.x1, x0: ST.x1 - rows * mod, z0: zc - width / 2, z1: zc + width / 2, zc, thick: 0.10, mod };
  L.deck.platforms = [];
  for (let r = 0; r < rows; r++) {
    const x1 = L.deck.x1 - r * mod, x0 = x1 - mod;
    // the 4 x 4 at alternate ends, so the joints stagger
    const sizes = r % 2 ? [8, 8, 8, 8, 4] : [4, 8, 8, 8, 8];
    let z = L.deck.z0;
    for (const s of sizes) { L.deck.platforms.push({ x0, x1, z0: z, z1: z + s * FT }); z += s * FT; }
  }
  L.lip = L.deck.x1;
  // ---- risers (S6: drums 8 x 8 ft at 24 in; keys 4 x 8 ft at 16 in), carpeted
  L.risers = {
    drums: { x0: 0.45, x1: 0.45 + 8 * FT, z0: zc - 4 * FT, z1: zc + 4 * FT, h: 24 * IN },
    keys: { x0: 4.15, x1: 4.15 + 4 * FT, z0: L.deck.z0 + 0.35, z1: L.deck.z0 + 0.35 + 8 * FT, h: 16 * IN },
  };
  // ---- the band's marks: feet on the floor (or riser), facing (unit, toward the pier with a turn to centre).
  // The apron crowd's eye (y 4.55) sees only ~1 m behind the lip (sight lines: measure.js), so the front line stands
  // downstage and the drums go up; see board/stage/notes.md for the measured choice.
  const R = L.risers, face = (x, z, tx = 30, tz = zc) => { const d = [tx - x, tz - z], n = Math.hypot(...d); return [d[0] / n, 0, d[1] / n]; };
  // (the plan's frozen marks when it has them: P.STAGE.marks, measured here first; else these)
  L.marks = P.STAGE.marks ? Object.fromEntries(Object.entries(P.STAGE.marks).map(([k, m], i) => [k, { pos: m.pos.slice(), face: m.face.slice(), tape: ['vocal', 'guitar', 'bass', 'keys', 'drums'].indexOf(k) }])) : {
    vocal: { pos: [L.lip - 0.95, F, zc], face: [1, 0, 0], tape: 0 },
    guitar: { pos: [L.lip - 1.35, F, zc - 3.35], face: face(L.lip - 1.35, zc - 3.35), tape: 1 },
    bass: { pos: [L.lip - 1.35, F, zc + 3.35], face: face(L.lip - 1.35, zc + 3.35), tape: 2 },
    keys: { pos: [(R.keys.x0 + R.keys.x1) / 2 - 0.15, F + R.keys.h, (R.keys.z0 + R.keys.z1) / 2], face: face(4, (R.keys.z0 + R.keys.z1) / 2, 30, zc + 2), tape: 3 },
    drums: { pos: [(R.drums.x0 + R.drums.x1) / 2 - 0.35, F + R.drums.h, zc], face: [1, 0, 0], tape: 4 },
  };
  // ---- ground support (show.md S1, S3: towers of 20.5 in box truss, a grid of 12 in box truss): four towers on the
  // ship's deck just outside the decks' corners, off the hatch cover (the upstage pair on the deck between the coaming
  // and the port bulwark), a grid at 17.0 m (6.5 m over the floor; No. 2's booms topped 62 deg pass over it at 21 m)
  const tz0 = L.deck.z0 - 0.45, tz1 = L.deck.z1 + 0.45;
  L.grid = { y: 17.0, size: 12 * IN, xF: ST.x1 - 0.35, xM: 2.55, xB: -3.95, z0: tz0, z1: tz1, cant: 1.55 };
  L.towers = [
    { name: 'DSL', x: L.grid.xF, z: tz0 }, { name: 'DSR', x: L.grid.xF, z: tz1 },
    { name: 'USL', x: L.grid.xB, z: tz0 }, { name: 'USR', x: L.grid.xB, z: tz1 },
  ].map(t => Object.assign(t, { size: 20.5 * IN, base: G.deckY(t.x, t.z), top: L.grid.y + 1.25 }));
  // the grid's trusses: [a, b] along their bottom chords' centre line (y of the truss's centre)
  const gy = L.grid.y + L.grid.size / 2;
  L.trusses = [
    { name: 'front', a: [L.grid.xF, gy, tz0 - L.grid.cant], b: [L.grid.xF, gy, tz1 + L.grid.cant] },
    { name: 'mid', a: [L.grid.xM, gy, tz0], b: [L.grid.xM, gy, tz1] },
    { name: 'back', a: [L.grid.xB, gy, tz0], b: [L.grid.xB, gy, tz1] },
    { name: 'sideL', a: [L.grid.xB, gy, tz0], b: [L.grid.xF, gy, tz0] },
    { name: 'sideR', a: [L.grid.xB, gy, tz1], b: [L.grid.xF, gy, tz1] },
  ];
  // ---- the LED wall (S5: ROE CB5 600 x 1200 panels, 12 wide x 3 high = 7.2 x 3.6 m) flown from the back truss on a
  // header, its face 0.4 m in front of the truss; bottom 1.6 m over the floor (clear of the drummer's head)
  L.led = { x: L.grid.xB + 0.42, z0: zc - 3.6, z1: zc + 3.6, y0: F + 1.6, y1: F + 1.6 + 3.6, cols: 12, rows: 3, pitch: 0.00577 };
  // the wings (style C5: trussed wing panels with rows of dot lights): a leaning parallelogram each side of the wall
  // (flown: their top in the back truss's bottom chords, their foot clear of the floor)
  L.wings = [-1, 1].map(s => ({ side: s, x: L.grid.xB + L.grid.size / 2 + 0.145, zIn: zc + s * 3.75, zOut: zc + s * 5.25, y0: F + 1.1, y1: L.grid.y + 0.02, lean: 0.9 }));
  // ---- IMAG screens (S5: CB5 panels, 4 x 3 = 2.4 x 3.6 m): from the apron the bulwark and the lip hide everything
  // upstage (the sight plane from mid-apron passes the bulwark at y ~8.8), so a production flies screens downstage where
  // the crowd can see them: on their own 12 in towers beside the stage, outboard of the PA, tipped 12 deg down
  L.imag = [-1, 1].map(s => { const z = s < 0 ? L.deck.z0 - 3.5 : L.deck.z1 + 3.75, x = 7.15; return { side: s, x, z, base: G.deckY(x, z), w: 2.4, h: 3.6, y0: 13.4, tilt: 12 }; });
  // ---- the PA (S4: L-Acoustics K2, 1338 x 354 x 400 mm): six a side flown from the front truss's cantilevered ends,
  // aimed down at the apron (the crowd is 6-13 m below and 3-11 m out); subs (KS28) under the lip behind the skirt;
  // front fills on the lip
  L.pa = [-1, 1].map(s => ({ side: s, x: L.grid.xF + 0.05, z: s < 0 ? tz0 - L.grid.cant + 0.75 : tz1 + L.grid.cant - 0.75, top: L.grid.y - 0.25, n: 6 }));
  L.subs = [-3.4, -1.15, 1.15, 3.4].map(dz => ({ x: L.lip - 0.45, z: zc + dz }));
  L.fills = [-4.4, -1.5, 1.5, 4.4].map(dz => ({ x: L.lip - 0.2, z: zc + dz }));
  // ---- the rig (show.md L1-L6: front washes, mid beams + strobes, back beams + blinders, floor beams, tower beams),
  // plus what a production adds on a ship: fixtures on the crosstrees and the house top, washes from the pier's edge on
  // the hull, uplighters on the masts (style C4: the masts as flat-top pillars)
  const fx = [];
  const add = (group, kind, pos, mount, k) => fx.push({ id: fx.length, group, kind, pos, mount, k });
  const zSpan = (n, half) => Array.from({ length: n }, (_, i) => zc + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * half));
  const hang = L.grid.y - 0.39;       // a hung fixture's tilt axis: its base up against the bottom chords (the clamp's place)
  zSpan(4, 4.6).forEach((z, k) => add('front', 'wash', [L.grid.xF, hang, z], 'down', k));
  // beams that reach the sky stand on top of the trusses (a hung head tilts at most ~35 deg above the horizon: L2's
  // 250 deg of tilt is +-125 deg from straight down)
  const onTop = L.grid.y + L.grid.size + 0.36;
  zSpan(8, 5.2).forEach((z, k) => add('mid', 'beam', [L.grid.xM, onTop, z], 'up', k));
  zSpan(6, 4.9).forEach((z, k) => add('back', 'beam', [L.grid.xB, onTop, z], 'up', k));
  // floor beams: upstage on the deck, between the drum riser and the LED wall (backlight, style C6)
  [-4.6, -3.0, -1.35, 1.35, 3.0, 4.6].forEach((dz, k) => add('floor', 'beam', [L.deck.x0 + 0.55, F + 0.36, zc + dz], 'up', k));
  // the downstage towers' outsides, 3 m over the floor, two a tower
  for (const t of L.towers.slice(0, 2)) for (const dy of [2.0, 3.6]) add('tower', 'beam', [t.x + 0.45, F + dy, t.z + (t.z < zc ? -0.4 : 0.4)], 'up', fx.filter(f => f.group === 'tower').length);
  // the masts' crosstrees (ship.md: the foremast's lookout platform ~82 ft ABL; the main's crosstree ~6 m over its
  // mast-house top); two a mast, on the starboard and port arms
  // (B2's masts when they have landed: ctx.mods.deck.masts' crosstree points; the fore's is its T at the cap, 0.3 m
  // deep, the main's a 0.24 m box; else the plan's heights)
  const mastY = (m, abl) => S.toWorld(0, abl, m.z)[1];
  const DM = deck && deck.masts && deck.masts.length ? Object.fromEntries(deck.masts.map(m => [m.name, m])) : null;
  L.masts = DM;
  L.crosstree = DM && DM.fore && DM.main
    ? { fore: { z: DM.fore.crosstree[2], y: DM.fore.crosstree[1], arm: 2.75 }, main: { z: DM.main.crosstree[2], y: DM.main.crosstree[1] + 0.12, arm: 1.7 } }
    : { fore: { z: S.toWorld(0, 12, S.masts.fore.z)[2], y: mastY(S.masts.fore, 82 * FT), arm: 2.75 }, main: { z: S.toWorld(0, 12, S.masts.main.z)[2], y: mastY(S.masts.main, S.masts.main.houseTop + 6.1) + 0.12, arm: 1.7 } };
  // on the crosstree's arms, outboard of the fore's lookout platform (r 0.95) and the main's topmast
  for (const [nm, c] of Object.entries(L.crosstree)) for (const s of [-1, 1]) add('mast', 'beam', [s * (nm === 'fore' ? 1.55 : 1.2), c.y + 0.36, c.z], 'up', fx.filter(f => f.group === 'mast').length);
  // the house top (the flying bridge, 18.7 m ABL): four beams along its forward edge, aimed forward over the stage
  let topY = S.toWorld(0, S.house.top.abl, S.house.top.z0)[1], topZ = S.toWorld(0, S.house.top.abl, S.house.top.z0)[2];
  // (the hull's own top of house: its forward edge, scanned along the centreline)
  if (G.topAt) for (let z = topZ - 2; z < topZ + 6; z += 0.05) { const y = G.topAt(0, z); if (y !== null && y > topY - 0.6) { topZ = z; topY = G.topAt(0, z + 0.6); break; } }
  L.houseTop = { y: topY, z: topZ + 0.6 };
  [-4.2, -1.5, 1.5, 4.2].forEach((x, k) => add('house', 'beam', [x, (G.topAt ? G.topAt(x, topZ + 0.6) : topY) + 0.35, topZ + 0.6], 'up', k));
  // the hull washes: on 4 m wind-up stands at the back of the apron against the shed's wall (the crowd zone's back
  // edge), ~9.5 m from her side, aimed across at the hull: the ship lit in the section's colour (the ship is the set)
  L.pierEdge = { x: P.PIER.x0 + P.PIER.apronW - 0.45, y: P.PIER.deck + 4.0, floor: P.PIER.deck };
  [-62, -50, -38, -26, -14, -2, 10, 22].forEach((z, k) => add('pier', 'wash', [L.pierEdge.x, L.pierEdge.y, z], 'up', k));
  // the masts' uplighters: a narrow spot at each mast's foot on its house top, aimed up the mast (style C4)
  for (const [nm, m] of [['fore', S.masts.fore], ['main', S.masts.main], ['mizzen', S.masts.mizzen]]) {
    const foot = DM && DM[nm] ? DM[nm].foot : S.toWorld(0, m.houseTop, m.z);
    add('uplight', 'uplight', [foot[0] + 0.62, foot[1] + 0.36, foot[2] - 0.3], 'up', ['fore', 'main', 'mizzen'].indexOf(nm));
    fx[fx.length - 1].aimAt = DM && DM[nm] ? (DM[nm].truck || DM[nm].cap) : S.toWorld(0, S.deckAbl(0, m.z) + (m.top || m.above), m.z);
  }
  L.fixtures = fx;
  // strobes (L4: Martin Atomic 3000) on the mid truss between the beams, blinders (4-lite) at the back truss's ends
  const chordF = L.grid.size / 2 * 1.0;      // the front bottom chord's offset from a truss's centre line
  L.strobes = zSpan(4, 4.0).map((z, k) => ({ id: k, pos: [L.grid.xM + chordF, L.grid.y - 0.19, z + 0.65] }));
  L.blinders = [L.grid.z0 + 0.45, L.grid.z1 - 0.45].map((z, k) => ({ id: k, pos: [L.grid.xB + chordF, L.grid.y - 0.35, z] }));
  // ---- lasers (show.md R1-R5): two on the lip's corners, two on the house top, one over the LED wall (its header)
  L.lasers = [
    { name: 'lipL', pos: [L.lip - 0.3, F + 0.09, L.deck.z0 + 0.5] }, { name: 'lipR', pos: [L.lip - 0.3, F + 0.09, L.deck.z1 - 0.5] },
    { name: 'houseP', pos: [-3.0, (G.topAt ? G.topAt(-3.0, topZ + 0.45) : topY) + 0.09, topZ + 0.45] }, { name: 'houseS', pos: [3.0, (G.topAt ? G.topAt(3.0, topZ + 0.45) : topY) + 0.09, topZ + 0.45] },
    { name: 'wall', pos: [L.led.x + 0.04, L.led.y1 + 0.25, zc] },      // (on the LED wall's header bar)
  ];
  // ---- hazers (R8: Look Unique 2.1): upstage on the deck to port, the upwind side (wind from 245 deg: toward +x)
  L.hazers = [{ pos: [-5.6, G.deckY(-5.6, zc - 3), zc - 3] }, { pos: [-5.6, G.deckY(-5.6, zc + 3), zc + 3] }];

  // ---- pyro and special effects (show.md P1-P10)
  const deckAt = (x, z) => G.footY(x, z);
  const halfAt = z => S.halfAt(S.fromWorld(0, 0, z)[2]);
  // gerbs: 'rail' a line on deck stands 1.6 m inboard of the starboard bulwark, bow to stern (skipping the stage and
  // the house); 'mast' two on each of the fore and main crosstrees. Where a spray passed through solid geometry
  // (clearance.js, every build) the unit is nudged the least that clears it: the bow's out from under the forecastle's
  // overhang, No. 1's off the starboard pillbox (its platform over the spray), the stage's aft one out from under the
  // stage-right IMAG face and clear of its goalpost; the main's out along its crosstree past our beams (their sprays
  // lean outboard). (The lip's 'stage' line is gone: no cue ever fired it.)
  const railZ = [-58, -52, -46, -40.5, -18.2, -12.5, 22, 28, 34, 40, 46];
  const railAt = { '-58': [5.0, -56.5], '-46': [7.5, -42.6], '-40.5': [7.5, -40.5], '-18.2': [7.75, -15.0] };
  L.gerbs = {
    rail: railZ.map(z => { const [x, zz] = railAt[z] || [halfAt(z) - 1.6, z]; return { pos: [x, deckAt(x, zz) + 0.45, zz], dir: [0.06, 1, 0] }; }),
    stage: [],
    mast: Object.entries(L.crosstree).flatMap(([nm, c]) => (nm === 'fore' ? [-2.35, 2.35] : [-1.65, 1.65]).map(x => ({ pos: [x, c.y + 0.06, c.z], dir: [Math.sign(x) * 0.16, 1, 0] }))),
  };
  // flame projectors (P1: Le Maitre Salamander): eight on deck along the starboard side, four forward and four aft of
  // the stage, 2.4 m inboard of the bulwark (the apron's crowd 4.5 m+ away below), each nudged the least that keeps its
  // column out of solid geometry (clearance.js), every one on the rail (the integrator: a concert's flames are for the
  // crowd on the apron, and inboard of the goalposts the bulwark hid them): the pair by the stage stood under the IMAG
  // faces, so the forward one steps past the goalpost to the foremast's rail and the aft four close up on the clear
  // rail between No. 3's winch and the boat deck's overhang (2 m apart); No. 1's two stood under the starboard pillbox's
  // platform and step forward of it. The 'n 4' cues fire the nearest two a side (0, 1, 4, 5)
  const flameAt = [[6.75, -40.4], [6.75, -42.4], [6.5, -50.5], [6.25, -53.25], [6.5, -13.2], [6.5, -11.2], [6.5, -9.2], [6.5, -7.2]];
  L.flames = flameAt.map(([x0, z], k) => { const x = x0 === null ? halfAt(z) - 2.4 : x0; return { k, pos: [x, deckAt(x, z) + 0.22, z] }; });
  // comets (P5): three tubes on No. 1's cover and three on No. 3's, a fan
  L.comets = [[-1.4, -49.5], [0, -49.5], [1.4, -49.5], [-1.4, -9.6], [0, -9.6], [1.4, -9.6]].map(([x, z], k) => ({ k, pos: [x, deckAt(x, z) + 0.3, z], dir: [x * 0.07 + 0.08, 1, (k % 3 - 1) * 0.05] }));
  // CO2 jets (P7): the lip's two corners and the two upstage corners (aimed up, a touch out), and one on each mast-house top
  L.co2 = [
    { pos: [L.lip - 0.35, F + 0.2, L.deck.z0 + 1.1], dir: [0.25, 1, -0.12] }, { pos: [L.lip - 0.35, F + 0.2, L.deck.z1 - 1.1], dir: [0.25, 1, 0.12] },
    { pos: [L.deck.x0 + 0.4, F + 0.2, L.deck.z0 + 0.4], dir: [-0.05, 1, -0.15] }, { pos: [L.deck.x0 + 0.4, F + 0.2, L.deck.z1 - 0.4], dir: [-0.05, 1, 0.15] },
    { pos: S.toWorld(2.0, S.masts.fore.houseTop + 0.2, S.masts.fore.z), dir: [0.1, 1, 0] }, { pos: S.toWorld(2.0, S.masts.main.houseTop + 0.2, S.masts.main.z), dir: [0.1, 1, 0] },
  ];
  // cold-spark machines (P6: Sparkular-class fountains) along the lip, between the wedges
  L.sparks = [-4.9, -1.9, 1.9, 4.9].map(dz => ({ pos: [L.lip - 0.18, F + 0.14, zc + dz] }));
  // confetti cannons on the downstage towers, 4 m up, aimed up and out over the pier (the wind carries it ENE)
  L.confetti = L.towers.slice(0, 2).map(t => ({ pos: [t.x + 0.35, F + 4.4, t.z], dir: [0.55, 1, (t.z < zc ? -1 : 1) * 0.12] }));
  // mortars (P8; BRIEF: 'stbd' on No. 1 and No. 3 covers at x ~2.5; 'bow' on the forecastle; 'stern' between No. 5 and
  // the after deckhouse; 'port' on the pyro barge ~20 m off her port side)
  const deckMortar = (x, z) => ({ pos: [x, deckAt(x, z) + 0.12, z] });
  L.barge = { x: -27.5, z: -24.0, L: 18.3, B: 7.3, D: 1.8, freeboard: 0.9, heading: 4 };      // a 60 x 24 ft deck barge
  const bargeDeck = L.barge.freeboard;
  L.mortars = {
    stbd: [[2.5, -51.5], [2.5, -47.5], [2.5, -11.5], [2.5, -8.2]].map(([x, z]) => deckMortar(x, z)),
    bow: [[-1.6, -57.5], [0, -58.3], [1.6, -57.5]].map(([x, z]) => deckMortar(x, z)),
    stern: [[-2.0, 50.6], [0, 51.2], [2.0, 50.6]].map(([x, z]) => deckMortar(x, z)),
    port: [-3, -1, 1, 3].map(dz => ({ pos: [L.barge.x + 1.2, bargeDeck + 0.12, L.barge.z + dz * 1.6] })),
  };
  return L;
}
