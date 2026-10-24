// liberty/src/far/measure.js: the far view's measures (B6), on ID renders (what a pixel shows, not a raycast: the
// terrain, the lights and the city's levels are placed by their shaders and their per-view LODs, ENVIRONMENT §2c.5):
//  - bearings(): every landmark's bearing and elevation angle from O (midships, on the water) against site.md §3, each
//    from a long lens aimed where the source puts it, the far module alone in the frame (nothing of the berth in front):
//    a mesh's top pixel and its columns' centre; a hill's highest skyline pixel in its bearing window
//  - visible(): what the berth hides (site.md §3, rule 12): each landmark's pixels with the whole world drawn against the
//    far module alone, from the ship's deck, her bow platform, her mast, the pier's tip, and 15-20 m up
import { frame, placeCamera } from 'scene3d/host.js';
import * as P from '../plan.js';

const T = window.THREE;
const DEG = Math.PI / 180;
// site.md §3 (bearing deg true, elevation deg from the water, distance m); kind 'mesh' (tag regex) or 'land' (skyline)
export const TARGETS = [
  // site.md's bearings are rounded to a degree (its elevation angles to 0.1): 'exp' is each one recomputed from the
  // coordinates it names (Wikipedia geotags, ARLHS, OSM's mapped towers, DataSF's footprints), the same arithmetic
  { key: 'alcatraz island', kind: 'land', brg: 325, elev: 0.96, exp: [324.61, 0.947], d: 2450, win: 4, src: 'site.md: 41 m at 2.4 km; centre 37.8267 N 122.4230 W' },
  { key: 'alcatraz lighthouse', kind: 'mesh', re: /alcatraz lighthouse/, brg: 325.5, elev: 1.57, exp: [325.5, 1.6], d: 2370, win: 3, src: 'focal plane 65 m (ARLHS 37.82625 N 122.42217 W); the tower top ~2 m above it' },
  { key: 'angel island', kind: 'land', brg: 340, elev: 2.3, exp: [340.23, 2.124], d: 6456, win: 6, src: 'Mt Livermore 240 m (788.76 ft), 37.8634 N 122.4317 W' },
  { key: 'tamalpais', kind: 'land', brg: 312, elev: 2.2, exp: [311.74, 2.23], d: 20125, win: 4, src: 'East Peak 784 m, 37.9293 N 122.5776 W' },
  { key: 'marin headlands', kind: 'land', brg: 285, elev: 1.9, exp: [282.9, 1.917], d: 8349, win: 3, src: 'Hawk Hill 280 m, 37.8255 N 122.4994 W' },
  { key: 'golden gate S tower', kind: 'mesh', re: /golden gate:towers/, brg: 275, elev: 2.0, exp: [275.4, 2.08], d: 6260, win: 3, src: 'tower 227.4 m (746 ft); OSM-mapped legs' },
  { key: 'golden gate N tower', kind: 'mesh', re: /golden gate:towers/, brg: 286, elev: 2.0, exp: [286.3, 1.96], d: 6630, win: 3, src: 'tower 227.4 m; OSM-mapped legs' },
  { key: 'yerba buena', kind: 'land', brg: 88, elev: 1.6, exp: [88.81, 1.593], d: 3578, win: 4, src: 'summit ~100 m (est.), 37.8094 N 122.3662 W' },
  { key: 'treasure island', kind: 'land', brg: 60, elev: 0.16, exp: [62.61, 0.12], d: 3593, win: 8, src: 'flat 6-10 m, spans 55-68 deg' },
  { key: 'bay bridge W2', kind: 'mesh', re: /bay bridge:towers/, brg: 137.2, elev: 3.4, exp: [137.2, 3.36], d: 2721, win: 2.5, src: 'towers 160 m (526 ft); OSM-mapped' },
  { key: 'bay bridge W3', kind: 'mesh', re: /bay bridge:towers/, brg: 122.4, elev: 3.4, exp: [122.4, 3.36], d: 2727, win: 2.5, src: 'towers 160 m' },
  { key: 'bay bridge W5', kind: 'mesh', re: /bay bridge:towers/, brg: 107.5, elev: 3.4, exp: [107.5, 3.13], d: 2929, win: 2.5, src: 'towers 160 m' },
  { key: 'bay bridge W6', kind: 'mesh', re: /bay bridge:towers/, brg: 96.0, elev: 3.4, exp: [96.0, 2.80], d: 3267, win: 2.5, src: 'towers 160 m' },
  { key: 'berkeley hills', kind: 'land', brg: 62, elev: 1.8, exp: [61.89, 1.779], d: 17237, win: 3, src: 'Grizzly Peak 536 m, 37.8818 N 122.2340 W' },
  { key: 'mt diablo', kind: 'land', brg: 79, elev: 1.5, exp: [79.41, 1.524], d: 44080, win: 3, src: '1,173 m, 37.8816 N 121.9142 W (no curvature, as site.md)' },
  { key: 'salesforce tower', kind: 'mesh', re: /salesforce/, brg: 157, elev: 8.2, exp: [157.4, 8.2], d: 2300, win: 2, src: '326 m; DataSF footprint centre' },
  { key: 'transamerica pyramid', kind: 'mesh', re: /transamerica/, brg: 166.5, elev: 9.6, exp: [166.0, 9.7], d: 1549, win: 2, src: '260 m (853 ft); DataSF footprint centre' },
  { key: 'sutro tower', kind: 'mesh', re: /sutro tower/, brg: 214, elev: 4.4, exp: [214.22, 4.386], d: 7190, win: 2, src: '298 m on a 254 m shoulder (DataSF ground), 37.75523 N 122.45284 W' },
  { key: 'russian hill', kind: 'land', brg: 231, elev: 4.0, exp: [233.53, 3.737], d: 1370, win: 5, src: 'summit ~90 m (DEM), 37.8014 N 122.4194 W' },
];

function camAt(N, pos, brg, elev, lens) {
  const [x, z] = P.atBearing(brg, 1000), c = N.camera;
  const at = [pos[0] + x, pos[1] + Math.tan(elev * DEG) * 1000, pos[2] + z];
  placeCamera(c, { pos, at, lens });
  return c;
}
// the pixels of an ID render as directions -> { bearing, elev } per pixel centre
function dirOf(cam, w, h, px, py) {
  const v = new T.Vector3((px + 0.5) / w * 2 - 1, 1 - (py + 0.5) / h * 2, 0.5).unproject(cam).sub(cam.position).normalize();
  return { bearing: P.bearingOf(v.x, v.z).bearing, elev: Math.asin(v.y) / DEG };
}
function pixelsOf(N, cam, w, h, test) {
  const I = N.measure._ids, buf = I.renderIds(cam, w, h), out = [], cache = new Map();
  for (let i = 0; i < w * h; i++) {
    const id = I.idAt(buf, i); if (!id) continue;
    let ok = cache.get(id); if (ok === undefined) { const r = I.resolve(id); ok = !!(r && test(r.tag)); cache.set(id, ok); }
    if (ok) out.push(((h - 1 - ((i / w) | 0)) * w) + (i % w));         // (GL rows run bottom up: row 0 here is the top)
  }
  return out;
}
const onlyFar = (N, fn) => {
  const hid = [];
  for (const m of N.pipe.meshes) if (m.userData.module !== 'far' && m.visible) { m.visible = false; hid.push(m); }
  try { return fn(); } finally { for (const m of hid) m.visible = true; }
};

export function bearings(N, { eye = 0.5, w = 1600, h = 900, hour = 13, t = 4 } = {}) {
  const res = [];
  for (const g of TARGETS) {
    const lens = Math.min(600, 36 / (2 * Math.tan(g.win * 1.6 * DEG / 2)));
    const cam = camAt(N, [0, eye, 0], g.exp[0], g.exp[1], lens);
    frame(t, { hour, cam });
    // (a hill: only the land near its own distance, so the ridge behind or the shore in front can't stand in for it)
    const nf = [cam.near, cam.far];
    if (g.kind === 'land') { cam.near = g.d * 0.55; cam.far = g.d * 1.5; cam.updateProjectionMatrix(); }
    const test = g.kind === 'land' ? (tag => /^far:far land/.test(tag)) : (tag => g.re.test(tag));
    const px = onlyFar(N, () => pixelsOf(N, cam, w, h, test));
    cam.near = nf[0]; cam.far = nf[1]; cam.updateProjectionMatrix();
    if (!px.length) { res.push({ key: g.key, seen: false, src: g.src }); continue; }
    // the top pixel of each column; the target's top: its highest; a mesh's bearing: the mean of its columns (the top
    // pixel's column for a tower: two towers share a mesh, the window picks one)
    const top = new Map();
    for (const i of px) { const x = i % w, y = (i / w) | 0; if (!top.has(x) || y < top.get(x)) top.set(x, y); }
    let bx = -1, by = 1e9; for (const [x, y] of top) if (y < by) { by = y; bx = x; }
    const peak = dirOf(cam, w, h, bx, by - 0.5);
    let brg = peak.bearing;
    if (g.kind === 'mesh') {
      // the columns within 1.5x the target's own width round its top: the structure's centre line
      const cols = [...top.keys()].filter(x => Math.abs(x - bx) < w * 0.08); brg = dirOf(cam, w, h, cols.reduce((a, b) => a + b, 0) / cols.length, by).bearing;
    }
    const db = ((brg - g.exp[0] + 540) % 360) - 180, de = peak.elev - g.exp[1];
    res.push({ key: g.key, brg: +brg.toFixed(2), elev: +peak.elev.toFixed(3), exp_brg: g.exp[0], exp_elev: g.exp[1], site_brg: g.brg, site_elev: g.elev,
      d_brg: +db.toFixed(2), d_elev: +de.toFixed(3), within: Math.abs(db) <= 0.2 && Math.abs(de) <= 0.2,
      site_within: Math.abs(((brg - g.brg + 540) % 360) - 180) <= 0.6 && Math.abs(peak.elev - g.elev) <= 0.25, src: g.src });
  }
  const seen = res.filter(r => r.brg !== undefined);
  return { eye, results: res, share_within_0_2: +(seen.filter(r => r.within).length / Math.max(1, seen.length)).toFixed(2),
    share_site_rounding: +(seen.filter(r => r.site_within).length / Math.max(1, seen.length)).toFixed(2) };
}

// what the berth hides: each landmark's pixels with the world, over its pixels with the far module alone
export const EYES = {
  deck: { pos: [-7.9, 9.5, 32], note: 'the ship\'s main deck at her port rail by No. 4, eye height (deck ~7.9 m + 1.6, over the bulwark)' },
  bow: { pos: [0, 16.2, -62], note: 'the 3"/50 platform at the bow' },
  mast: { pos: [-2, 32, -10], note: 'the mainmast\'s top' },
  tip: { pos: [70.8, 4.6, -144.0], note: 'Pier 35\'s tip, its east corner, eye height' },
  high: { pos: [-20, 20, -30], note: '20 m up off her port side' },
};
const PARTS = [
  { key: 'bay bridge SF half (towers)', re: /bay bridge:towers/, brg: 117, win: 30, range: [118, 160] },
  { key: 'bay bridge YBI half (towers)', re: /bay bridge:towers/, brg: 117, win: 30, range: [80, 118] },
  { key: 'bay bridge SF half (deck)', re: /bay bridge:(truss|decks)/, brg: 117, win: 30, range: [118, 160] },
  { key: 'bay bridge YBI half (deck)', re: /bay bridge:(truss|decks)/, brg: 117, win: 30, range: [80, 118] },
  { key: 'golden gate (towers)', re: /golden gate:towers/, brg: 280.5, win: 8 },
  { key: 'golden gate (deck, truss)', re: /golden gate:(truss|deck)/, brg: 280.5, win: 8 },
  { key: 'sutro tower', re: /sutro tower/, brg: 214, win: 4, aim: 4 },
  { key: 'alcatraz', re: /alcatraz|^far:far land/, brg: 324, win: 6, aim: 0.8, near: 1800, far: 3200 },
];
export function visible(N, { w = 1280, h = 720, hour = 13, t = 4, eyes = Object.keys(EYES) } = {}) {
  const out = {};
  for (const e of eyes) {
    out[e] = {};
    for (const g of PARTS) {
      const lens = Math.min(400, 36 / (2 * Math.tan(g.win * 1.3 * DEG / 2)));
      const cam = camAt(N, EYES[e].pos, g.brg, g.aim ?? 2.0, lens);
      frame(t, { hour, cam });
      const test = tag => g.re.test(tag);
      // (a range of bearings: only the pixels in it; a near/far: only what lies between, the island not the hills behind)
      const keep = px => !g.range ? px : px.filter(i => { const b = dirOf(cam, w, h, i % w, (i / w) | 0).bearing; return b >= g.range[0] && b < g.range[1]; });
      const nf = [cam.near, cam.far];
      if (g.near) { cam.near = g.near; cam.far = g.far; cam.updateProjectionMatrix(); }
      const all = keep(onlyFar(N, () => pixelsOf(N, cam, w, h, test))).length;
      if (g.near) { cam.near = nf[0]; cam.far = nf[1]; cam.updateProjectionMatrix(); }
      // with the world drawn: the berth's own pixels in front hide what lies behind them (the near plane as drawn)
      const seen = keep(pixelsOf(N, cam, w, h, test)).length;
      out[e][g.key] = all ? +(Math.min(1, seen / all)).toFixed(3) : null;
    }
  }
  return out;
}

// a class mask for the look measures (lookstats on masked pixels): per pixel 0 the sky, 1 the far land, 2 the far
// city (buildings, landmarks), 3 the far lights, 4 the bridges, 5 another module's; as a PNG data URL of the frame's size
export function classMask(N, camName, { hour = 19.1, t = 4, w = 960, h = 540 } = {}) {
  const cam = N.camera; placeCamera(cam, camName); frame(t, { hour, cam });
  const I = N.measure._ids, buf = I.renderIds(cam, w, h), cache = new Map();
  const cls = tag => /^far:far land/.test(tag) ? 1 : /^far:(far city|far buildings|landmark)/.test(tag) ? 2 : /^far:(far lights|far traffic)/.test(tag) ? 3 : /^far:(bay bridge|golden gate|far bridges)/.test(tag) ? 4 : 5;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const id = I.idAt(buf, i); let c = 0;
    if (id) { c = cache.get(id); if (c === undefined) { const r = I.resolve(id); c = r ? cls(r.tag) : 5; cache.set(id, c); } }
    const y = h - 1 - ((i / w) | 0), x = i % w, o = (y * w + x) * 4;
    img.data[o] = c * 40; img.data[o + 1] = c * 40; img.data[o + 2] = c * 40; img.data[o + 3] = 255;
  }
  // the far land by distance band (renders clipped to each band): classes 6 (< 4 km), 7 (4-10), 8 (10-25), 9 (> 25)
  const bands = [[0.5, 4000, 6], [4000, 10000, 7], [10000, 25000, 8], [25000, 60000, 9]], nf = [cam.near, cam.far];
  for (const [n0, f0, c] of bands) {
    cam.near = n0; cam.far = f0; cam.updateProjectionMatrix();
    const b2 = onlyFar(N, () => I.renderIds(cam, w, h)), c2 = new Map();
    for (let i = 0; i < w * h; i++) {
      const id = I.idAt(b2, i); if (!id) continue;
      let ok = c2.get(id); if (ok === undefined) { const r = I.resolve(id); ok = !!(r && /^far:far land/.test(r.tag)); c2.set(id, ok); }
      if (!ok) continue;
      const y = h - 1 - ((i / w) | 0), x = i % w, o = (y * w + x) * 4;
      if (img.data[o] === 40) { img.data[o] = img.data[o + 1] = img.data[o + 2] = c * 25; }
    }
  }
  cam.near = nf[0]; cam.far = nf[1]; cam.updateProjectionMatrix();
  g.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}
