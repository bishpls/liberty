// liberty/src/far/index.js: the far view (B6): everything beyond P.WORLD.near (about 1 km round the ship; B4's box) out
// to the 50 km far plane: the land, the islands, the bridges, the skyline, the lights, the air. briefs/far.md;
// board/far/notes.md holds the state.
//   data.js     the grids and rasters (assets/terrain, assets/far: tools/far_data.py)
//   land.js     the terrain outside B4's box, its cover and its night
//   city.js     San Francisco's buildings beyond the box (DataSF footprints, three levels of detail), their windows
//   bridges.js  the Bay Bridge (west span with the Bay Lights, east span), the Golden Gate; structure.js their parts
//   sprites.js  lights seen from afar (never under a pixel); lights.js the fixed lamps, beacons and the traffic
//   citylights.js  every lit street's lamps (OSM roads) and the freeways' traffic
//   landmarks.js   the Transamerica Pyramid, Salesforce Tower and its crown, the Ferry Building's tower, Alcatraz's light
//   measure.js  bearings and elevations from O against site.md §3; what the berth hides (ID renders)
//   life.js     aircraft on the airports' approaches, far ferries, ships at anchor, the bay's navigation lights
import * as P from '../plan.js';
import { frame, placeCamera, blit } from 'scene3d/host.js';
import { loadAll } from './data.js';
import { buildLand, HOLE } from './land.js';
import { buildCity, LOD } from './city.js';
import { makeLights } from './lights.js';
import { buildBridges, BAY, GG } from './bridges.js';
import { buildCityLights } from './citylights.js';
import { buildLandmarks } from './landmarks.js';
import { bearings, visible, classMask } from './measure.js';
import { buildFarLife } from './life.js';

const at = (brg, d, y) => { const [x, z] = P.atBearing(brg, d); return [x, y, z]; };
// bookmarks: the far view from where people stand (the bow, the pier's tip, the water) and from above
export const CAMS = {
  far_bow: { pos: [0, 16.2, -62], at: at(330, 3000, 40), lens: 28, note: 'far: from the bow platform, NNW over the bay: Alcatraz, Angel Island, Marin, Tiburon' },
  far_tip_se: { pos: [70.8, 4.6, -144.0], at: at(125, 3000, 60), lens: 28, note: 'far: from Pier 35\'s tip at eye height, SE: the Bay Bridge, Yerba Buena, Treasure Island' },
  far_tip_w: { pos: [14, 4.6, -144.3], at: at(280, 6400, 80), lens: 35, note: 'far: from Pier 35\'s tip, W: Pier 39, the Golden Gate, the Marin Headlands' },
  far_mast: { pos: [-2, 32, -10], at: at(150, 2500, 60), lens: 24, note: 'far: from the mainmast\'s top, SSE over the shed and the city: downtown, the Bay Bridge' },
  far_water_s: { pos: [-150, 3, -1300], at: [300, 90, 1600], lens: 35, note: 'far: from the water 1.3 km north, S: the waterfront, Telegraph Hill, the skyline' },
  far_high_n: { pos: [-40, 140, 120], at: at(335, 6000, 0), lens: 28, note: 'far: 140 m over the berth, N: the bay to Angel Island and Marin' },
  far_high_e: { pos: [-60, 160, -200], at: at(95, 6000, 0), lens: 28, note: 'far: 160 m up, E: the Bay Bridge, Treasure Island, the East Bay' },
  far_aerial: { pos: [-1800, 1400, -4200], at: [600, 0, 1500], lens: 28, note: 'far: the whole bay from 1.4 km up over Angel Island\'s channel' },
  far_gg: { pos: [-4, 16.2, -62], at: at(280.8, 6420, 120), lens: 85, note: 'far: the Golden Gate from the bow, telephoto (towers 275-286 deg, 6.3-6.6 km)' },
  far_bb: { pos: [70.8, 4.6, -144.0], at: at(118, 2800, 90), lens: 70, note: 'far: the Bay Bridge\'s west span from the pier\'s tip, telephoto' },
  // close looks at the far things (the far view must hold up when a camera goes to it)
  far_alc_close: { pos: [-900, 30, -1750], at: [-1260, 40, -2090], lens: 35, note: 'far: Alcatraz from the water 450 m off, its lighthouse, cellhouse and water tower' },
  far_crown: { pos: [300, 60, -900], at: [738, 300, 2158], lens: 135, note: 'far: Salesforce Tower\'s crown and the Transamerica Pyramid from the bay, long lens' },
  far_bb_close: { pos: [1500, 20, 1000], at: [2210, 110, 1597], lens: 28, note: 'far: under the west span\'s W3 tower from the water: the Bay Lights, the truss, the cables' },
  far_gg_close: { pos: [-5600, 40, -1500], at: [-6210, 120, -1500], lens: 28, note: 'far: the Golden Gate from inside the Gate, its towers floodlit' },
  far_ti: { pos: [2200, 60, -2600], at: [3300, 10, -1700], lens: 35, note: 'far: Treasure Island and Yerba Buena from the north-west' },
  far_cranes: { pos: [4600, 40, 2200], at: [6200, 40, 900], lens: 50, note: 'far: the Port of Oakland\'s cranes and the east span from the water' },
  // the reference photographs' own viewpoints (site.md §9; board/far compares them)
  far_ref21: { pos: [1450, 3, 2250], at: [2600, 60, 1150], lens: 24, note: 'far: photo 21\'s view: the Bay Lights from the Embarcadero by Rincon Park' },
  far_ref24: { pos: [1235, 3, 1405], at: [1050, 45, 1620], lens: 28, note: 'far: photo 24\'s view: the Ferry Building\'s tower from the water, the towers behind' },
  far_ref34: { pos: [-1339, 6, -4232], at: [450, 110, 1700], lens: 105, note: 'far: photo 34\'s view: the skyline from the Angel Island ferry, Alcatraz in front' },
};

export async function build(world, ctx) {
  const t0 = performance.now();
  const D = await loadAll();
  const land = await buildLand(world, ctx, D);
  const inHole = (x, z) => x > HOLE.x0 && x < HOLE.x1 && z > HOLE.z0 && z < HOLE.z1;
  const landAt = (x, z) => (inHole(x, z) ? null : land.heightAt(x, z));     // (null on B4's ground mesh)
  const city = await buildCity(world, ctx, { ground: landAt });
  const osm = await buildCity(world, ctx, { file: 'far/osm_bldg.bin.gz', name: 'far buildings', lod: { d1: 1e9, d2: 2e9, band: 1 }, ground: landAt });
  const lights = makeLights(world);
  const bridges = buildBridges(world, ctx, D, lights);
  // (the landmarks stand on the drawn land: the terrain's own heights, its shore and waterfront rules and Alcatraz's 3 m grid)
  const ground = land.heightAt;
  const marks = await buildLandmarks(world, ctx, { facade: osm.mats[0], lights, towers: city.towers(90), ground });
  // the far land as ground for the assembly check (its shader displaces the terrain, so the check can't read it from
  // triangles): everywhere but B4's ground mesh (HOLE), where the pier module's ground holds
  world.relate('ground', { name: 'far land', heightAt: landAt, why: 'the far terrain (CDLOD, displaced in its shader)' });
  const life = buildFarLife(world, ctx, { lights });
  lights.flush();
  const avoid = [[BAY.rincon, [3700, 40], 45], [BAY.east.W2, BAY.east.end, 55], [GG.S1, GG.N1, 45]];
  const city2 = await buildCityLights(world, ctx, D, { avoid });
  const measures = {
    land: { ms: land.ms, levels: land.levels, textureMB: land.textureMB, hole: HOLE },
    city: { ms: city.ms, loadMs: city.loadMs, buildings: city.counts, lod: LOD, towersAdded: city.added },
    bridges: Object.assign({}, bridges, { bayAxis: undefined }),
    landmarks: marks, osmBuildings: osm.counts, life,
    lights: { fixed: lights.fixed.n, cars: lights.cars, streets: city2 },
    loadMs: Math.round(performance.now() - t0),
  };
  // ?farhide=1: the module built but drawn nowhere (the A side of an A/B against the world without it)
  // (?farhide=REGEX: only the far meshes whose names match: an A/B of one part)
  const fh = new URLSearchParams(location.search).get('farhide');
  if (fh) { const re = fh === '1' ? /./ : new RegExp(fh); world.late.push(() => { for (const m of world.pipe.meshes) if (m.userData.module === 'far' && re.test(m.name || '')) m.visible = false; }); }
  return {
    measures,
    heightAt: land.heightAt,        // the far land's height (the terrain's CPU truth) anywhere in the 100 km grid
    land, city, bridges, lights,
    // on demand (ID renders): LIBERTY.ctx.mods.far.measure.bearings() / .visible()
    measure: { bearings: o => bearings(ctx.LIBERTY || window.LIBERTY, o), visible: o => visible(ctx.LIBERTY || window.LIBERTY, o), mask: (cam, o) => classMask(ctx.LIBERTY || window.LIBERTY, cam, o) },
  };
}

// a slow pan for the stability measures (tools/shimmer.py on its encode): farpan~CAM~HOUR~DEG_PER_S, the bookmark's
// camera turning about its own eye; t is scene time
export function loops(LOOPS, ctx) {
  const name = new URLSearchParams(location.search).get('loop') || '';
  const [kind, cam, hour, dps, mode] = name.split('~');
  if (kind !== 'farpan') return;
  const C = (window.SCENE && window.SCENE.CAMS && window.SCENE.CAMS[cam]) || CAMS[cam]; if (!C) return;
  const rate = +(dps || 2) * Math.PI / 180;
  LOOPS[name] = t => {
    const dx = C.at[0] - C.pos[0], dz = C.at[2] - C.pos[2], a = Math.atan2(dz, dx) + rate * (t - 3), r = Math.hypot(dx, dz);
    placeCamera(window.SCENE.camera, { pos: C.pos, at: [C.pos[0] + Math.cos(a) * r, C.at[1], C.pos[2] + Math.sin(a) * r], lens: C.lens });
    frame(mode === 'frozen' ? 3 : t, { hour: +(hour || 19.1) });       // (frozen: the scene's clock held, only the camera moves: crawl alone)
    blit(`farpan ${cam} · ${(+(dps || 2)).toFixed(1)} deg/s · t ${t.toFixed(2)}`);
  };
  LOOPS[name].len = 6;
}
