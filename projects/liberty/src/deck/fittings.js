// liberty/src/deck/fittings.js: the small fittings and the flags (B2): the cowl ventilators by place, mushroom vents, the
// ship's bell, lockers, fire stations, life rings, the visitors' benches, the ready-service ammunition boxes by the guns,
// the radar and whips on the flying bridge (non-original, ship.md §9), the jackstaff and the ensign staff with the jack
// and the ensign, and the ship dressed overall for the night: the International Code flags in the US Navy's dressing
// order on lines from the jackstaff over the mastheads to the ensign staff, streaming downwind and fluttering.
//
// Sources: research/ship.md §5 (two big cowls on each mast-house top), §7 (cowls by place: 2 forward of No. 1 with mouths
// at ~53.7 ft ABL, 24 and 30 in cowls round the funnel with mouths at 66-67 ft, 2 large ones at the boat deck's after end
// mouths 61-64 ft, 2 at the house's after corners mouths ~57 ft; ~16-20 in all; the bell at the bow platform's after
// edge; the jackstaff ~10 ft above the stem head with the Suez light's davit; the ensign staff aft), §6 (ready-service
// boxes ~2 x 3 x 2 ft by each tub), §9 (radar and VHF whips, benches, fire hoses); photos ship/25, 27, 28, 29 (the cowls'
// mouths: a big dish facing forward to port, its fellow aft to starboard), 34 (the ensign on its staff at the 5"'s
// platform), 09 (the life rings on the bow tub). The wind: plan.WATER.wind (from 245 deg true, 3.4 m/s).
import * as P from '../plan.js';
import { SH, FT, DEG, zs, deckCL, deckAt, sideAbl, halfAt, tr, rx, ry, rz, mul, along, lath, cyl, boxM, bar, tube, ring, disc, plate, mergeG, catenary } from './ship.js';
import { rng } from 'scene3d/util.js';

const T = window.THREE;
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm3 = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// a cowl ventilator on the deck at base: its mouth (radius Rm) centred H above the base, facing 'face' (horizontal)
export function cowl(base, Rm, H, face) {
  const f = nrm3([face[0], 0, face[2]]), r0 = Rm * 0.6, Rb = Rm * 1.05, up = [0, 1, 0];
  const steel = [], dark = [];
  steel.push(lath([[r0 + 0.08, 0], [r0 + 0.08, 0.22], [r0 + 0.02, 0.24], [r0, 0.24]], 18).applyMatrix4(tr(...base)));         // the coaming
  const yb = Math.max(0.3, H - Rb);
  steel.push(cyl(add3(base, up, 0.2), add3(base, up, yb), r0, r0, { sides: 18, caps: false }));
  // the bend, the throat flaring toward the mouth
  const pts = [];
  for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI / 2; pts.push(add3(add3(base, f, Rb * (1 - Math.cos(a))), up, yb + Rb * Math.sin(a))); }
  const end = pts[pts.length - 1];
  for (let k = 1; k <= 3; k++) pts.push(add3(end, f, 0.06 * k * Rm));
  steel.push(tube(pts, u => r0 + (Rm * 0.93 - r0) * Math.pow(u, 1.6), { sides: 18, caps: false }));
  const mouth = pts[pts.length - 1];
  steel.push(ring(mouth, f, Rm * 0.95, Rm * 0.06, { seg: 22, sides: 6 }));
  dark.push(disc(add3(mouth, f, -0.22 * Rm), f, Rm * 0.9, 18));
  return { steel, dark, mouth };
}
const mushroom = (p, r = 0.16) => lath([[r * 0.8, 0], [r * 0.8, 0.45], [r * 1.9, 0.48], [r * 2.0, 0.55], [r * 1.2, 0.68], [0, 0.7]], 14).applyMatrix4(tr(...p));

// a flag: hoist edge from h0 down along 'hd' (length hl), its fly along 'fd' (length fl); code (mats.js flagMat)
function flagGeo(h0, hd, hl, fd, fl, code, ph, nu = 6, nv = 3) {
  const n = nrm3(cross3(fd, hd)), pos = [], nrm = [], uv = [], idx = [], fl_ = [], ph_ = [], fly = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv, p = add3(add3(h0, hd, v * hl), fd, u * fl);
    pos.push(...p); nrm.push(...n); uv.push(u, v); fl_.push(code); ph_.push(ph); fly.push(...fd);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('aFlag', new T.Float32BufferAttribute(fl_, 1));
  g.setAttribute('aPh', new T.Float32BufferAttribute(ph_, 1)); g.setAttribute('aFly', new T.Float32BufferAttribute(fly, 3));
  g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(ph), 1));
  g.setIndex(idx);
  return g;
}

export function buildFittings(world, M, ctx, B, W, seat, F, rig, guns) {
  const S = SH, out = { cowls: [], flags: 0, measures: {} };
  const R = rng(7331);
  const hk = (ship) => ship;
  // ---- cowls: by place (ship.md §7)
  const addCowl = (base, Rm, H, face, where) => { const c = cowl(base, Rm, H, face); B.add(M.steel, c.steel, 'cowls'); B.add(M.black, c.dark, 'cowls'); out.cowls.push({ where, mouthDia: +(2 * Rm).toFixed(2), mouthAbl: +c.mouth[1].toFixed(2) }); };
  // forward of No. 1 (31-35 ft aft of the FP), mouths at ~53.7 ft ABL, facing forward
  { const z = zs(2.16 + 33 * FT); for (const sx of [-1, 1]) { const x = sx * 1.7, y = deckAt(x, z); addCowl([x, y, z], 0.42, 53.7 * FT - y, [0, 0, -1], 'forward of No. 1'); } }
  // the mast houses' tops: two big cowls each, the port one facing forward, the starboard aft (photos 25, 27); two small on the fore
  for (const name of ['fore', 'main', 'mizzen']) {
    const mm = rig.masts[name], zc = (mm.house.z0 + mm.house.z1) / 2;
    addCowl([-1.95, mm.top, zc + 0.15], 0.62, 2.3, [0, 0, -1], `${name} mast house`);
    addCowl([1.95, mm.top, zc - 0.15], 0.62, 2.3, [0, 0, 1], `${name} mast house`);
    if (name === 'fore') { addCowl([-1.0, mm.top, zc + 0.3], 0.3, 1.5, [0, 0, -1], 'fore mast house (small)'); addCowl([1.0, mm.top, zc + 0.3], 0.3, 1.5, [0, 0, 1], 'fore mast house (small)'); }
  }
  // round the funnel on the top of the house: 24 and 30 in cowls in pairs, mouths at ~66-67 ft ABL
  { const top = S.house.top.abl, fz = S.house.funnel.z;
    for (const sx of [-1, 1]) {
      addCowl([sx * 2.55, top, fz - 2.4], 0.38, 66.5 * FT - top, [0, 0, -1], 'round the funnel (30 in)');
      addCowl([sx * 2.6, top, fz + 2.5], 0.305, 66.0 * FT - top, [sx, 0, 0.6], 'round the funnel (24 in)');
    } }
  // the boat deck's after end (~256-260 ft), mouths ~61-64 ft ABL; the house's after corners on the main deck, through the
  // boat deck's overhang, mouths ~57 ft ABL
  for (const sx of [-1, 1]) {
    addCowl([sx * 3.6, S.house.boat.abl, zs(2.16 + 258 * FT)], 0.55, 62.5 * FT - S.house.boat.abl, [0, 0, -1], 'boat deck, after end');
    const z = zs(2.16 + 272 * FT), x = sx * 4.7;
    addCowl([x, deckAt(x, z), z], 0.42, 57 * FT - deckAt(x, z), [0, 0, 1], 'house after corners');
  }
  // mushroom vents on the after deckhouse's top and beside the hatches
  for (const [x, z] of [[-2.3, 53.6], [2.3, 53.6], [-3.6, 57.8], [3.6, 57.8]]) B.add(M.steel, mushroom([x, S.stern.platform.abl, z]), 'vents');
  for (const k of [1, 3, 4, 5]) { const h = S.hatches[k]; for (const sx of [-1, 1]) { const x = sx * (h.half + 1.0), z = h.z1 - 1.2; B.add(M.steel, mushroom([x, deckAt(x, z), z], 0.12), 'vents'); } }

  // ---- the bell at the bow platform's after edge, on its gallows, with its lanyard
  {
    const bp = seat.get('bell', [0, S.bow.platform.abl, S.bow.bell]);
    const [x, y, z] = [bp[0], bp[1], Math.min(bp[2], S.bow.platform.z1) - 0.3];          // (on the platform, at its after rail)
    B.add(M.steel, mergeG([cyl([x - 0.35, y, z], [x - 0.35, y + 1.45, z], 0.035, 0.035, { sides: 8 }), cyl([x + 0.35, y, z], [x + 0.35, y + 1.45, z], 0.035, 0.035, { sides: 8 }), cyl([x - 0.4, y + 1.45, z], [x + 0.4, y + 1.45, z], 0.04, 0.04, { sides: 8 })]), 'bell');
    B.add(M.brass, lath([[0, 0], [0.21, 0], [0.22, 0.03], [0.19, 0.08], [0.15, 0.3], [0.12, 0.36], [0.03, 0.38], [0.03, 0.44], [0, 0.44]], 22, { hard: false }).applyMatrix4(tr(x, y + 0.98, z)), 'bell');
    const lan = tube([[x, y + 1.0, z], [x + 0.02, y + 0.75, z + 0.02], [x + 0.03, y + 0.55, z + 0.03]], 0.012, { sides: 5 }); lan.setAttribute('aTone', new T.Float32BufferAttribute(new Float32Array(lan.attributes.position.count).fill(4), 1));
    B.add(M.rope, lan, 'bell');
  }

  // ---- lockers and fire stations against the mast houses (paint and rope lockers; a hydrant, its hose on a rack)
  const fireStation = (p, out_) => {
    const o = nrm3(out_), side = nrm3([o[2], 0, -o[0]]);
    const g = [], red = [];
    red.push(cyl(p, add3(p, [0, 1, 0], 0.8), 0.05, 0.05, { sides: 8 }), lath([[0.08, 0], [0.08, 0.12], [0, 0.14]], 10).applyMatrix4(tr(...add3(p, [0, 1, 0], 0.8))));
    red.push(cyl(add3(p, [0, 1, 0], 0.62), add3(add3(p, [0, 1, 0], 0.62), o, 0.18), 0.035, 0.035, { sides: 8 }));
    g.push(boxM(0.7, 0.85, 0.06, mul(along(add3(add3(add3(p, o, -0.005), side, 0.6), [0, 1, 0], 1.05), [0, 1, 0], o))));
    // the hose: flaked on its rack (a coil of canvas hose)
    const coil = []; for (let t = 0; t <= 3 * 20; t++) { const a = t / 20 * Math.PI * 2, r = 0.2 + 0.03 * Math.floor(t / 20); coil.push(add3(add3(add3(add3(p, side, 0.6), [0, 1, 0], 1.05 + Math.sin(a) * r), side, Math.cos(a) * r), o, 0.045 + 0.012 * Math.floor(t / 20))); }
    const hg = tube(coil, 0.028, { sides: 5 }); hg.setAttribute('aTone', new T.Float32BufferAttribute(new Float32Array(hg.attributes.position.count).fill(4), 1));
    B.add(M.steel, g, 'fire'); B.add(M.oxide, red, 'fire'); B.add(M.rope, hg, 'fire');
  };
  for (const name of ['fore', 'main', 'mizzen']) {
    const mm = rig.masts[name];
    const yb = deckAt(-3.11, mm.house.z0);
    B.add(M.steelOld, boxM(0.7, 1.1, 1.2, tr(-3.11 - 0.36, deckAt(-3.5, (mm.house.z0 + mm.house.z1) / 2) + 0.55, (mm.house.z0 + mm.house.z1) / 2)), 'lockers');
    fireStation([3.11 + 0.035, deckAt(3.2, (mm.house.z0 + mm.house.z1) / 2), (mm.house.z0 + mm.house.z1) / 2 - 0.3], [1, 0, 0]);
    void yb;
  }
  fireStation([-4.0, deckAt(-4.0, S.house.main.z0 - 0.05), S.house.main.z0 - 0.035], [0, 0, -1]);
  fireStation([4.0, deckAt(4.0, S.house.main.z1 + 0.05), S.house.main.z1 + 0.035], [0, 0, 1]);

  // ---- life rings on the rails (orange and white): the bow tub's front (photo 09), the mast houses, the bridge wings, the stern
  // hung on a wall on a hook bracket (the wall's plane at 'wall' along its outward normal n): the mast houses' faces and
  // the midship house's front and after faces (B1's walls: the plan's places)
  const lifeRing = (x, y, wall, n) => {
    const c = [x, y, wall + n * 0.085], top = [x, y + 0.31 + 0.065, wall + n * 0.085];
    B.add(M.lifering, ring(c, [0, 0, n], 0.31, 0.065, { seg: 20, sides: 8 }), 'liferings');
    B.add(M.steel, mergeG([bar([x, top[1] - 0.06, wall - n * 0.005], [x, top[1] - 0.06, wall + n * 0.13], 0.05, 0.03), boxM(0.12, 0.16, 0.012, tr(x, top[1] - 0.06, wall + n * 0.005))]), 'liferings');
  };
  for (const name of ['fore', 'main', 'mizzen']) { const mm = rig.masts[name]; lifeRing(-1.3, deckAt(-1.3, mm.house.z0) + 1.5, mm.house.z0, -1); lifeRing(1.3, deckAt(1.3, mm.house.z1) + 1.5, mm.house.z1, 1); }
  for (const sx of [-1, 1]) { lifeRing(sx * 2.4, deckAt(sx * 2.4, S.house.main.z0) + 1.55, S.house.main.z0, -1); lifeRing(sx * 2.4, deckAt(sx * 2.4, S.house.main.z1) + 1.55, S.house.main.z1, 1); }

  // ---- the visitors' benches (photo 28): timber slats on steel legs, beside the after hatches
  for (const k of [4, 5]) { const h = S.hatches[k]; for (const sx of [-1, 1]) { const x = sx * (h.half + 0.75), z = (h.z0 + h.z1) / 2 + (sx > 0 ? 1.5 : -1.5), y = deckAt(x, z); const g = [];
    for (const dz of [-0.8, 0.8]) g.push(boxM(0.06, 0.42, 0.06, tr(x, y + 0.21, z + dz)), boxM(0.45, 0.04, 0.05, tr(x, y + 0.42, z + dz)), boxM(0.04, 0.42, 0.05, tr(x + sx * 0.24, y + 0.63, z + dz)));
    B.add(M.steel, g, 'benches');
    B.add(M.wood, [0, 1, 2, 3].map(k2 => boxM(0.1, 0.03, 1.9, tr(x - 0.17 + k2 * 0.115, y + 0.455, z))).concat([0, 1].map(k2 => boxM(0.03, 0.1, 1.9, tr(x + sx * 0.275, y + 0.6 + k2 * 0.12, z)))), 'benches'); } }

  // ---- ready-service ammunition boxes: two inside each 20 mm tub (against its wall, inboard), lockers on the platforms
  const box3 = (c, a, sz = [0.61, 0.61, 0.91]) => { B.add(M.steel, boxM(sz[0], sz[1], sz[2], mul(tr(c[0], c[1] + sz[1] / 2, c[2]), ry(a))), 'readyboxes'); B.add(M.steelOld, boxM(sz[0] + 0.04, 0.04, sz[2] + 0.04, mul(tr(c[0], c[1] + sz[1] + 0.02, c[2]), ry(a))), 'readyboxes'); };
  for (const g of guns.gun20) {
    // shallow lockers hung on the tub's wall, inboard, clear of the gun's swing (its shoulder rests reach ~0.85 m)
    const [x, y, z] = g.mount, sx = Math.sign(x) || 1;
    for (const da of [-0.62, 0.62]) {
      // (standing on the tub's floor against its wall, whatever the tub's size: B1's tubs are 2.9-3.3 m across)
      const dir = [-sx * Math.cos(da), 0, Math.sin(da)], r = 1.12, c = [x + dir[0] * r, y - 0.005, z + dir[2] * r];
      box3(c, Math.atan2(dir[0], dir[2]), [0.91, 0.6, 0.3]);
    }
  }
  for (const [g, n, r] of [[guns.gun5, 3, 2.9], [guns.gun3, 2, 2.05]]) {
    for (let k = 0; k < n; k++) { const a = (k - (n - 1) / 2) * 0.55 + (g === guns.gun5 ? Math.PI : 0); box3([g.mount[0] + Math.sin(a) * r, g.mount[1], g.mount[2] - Math.cos(a) * r], -a, [0.8, 0.7, 1.4]); }
  }

  // ---- the flying bridge's non-original kit: a radar mast with its scanner, two VHF whips (photos 01, 06)
  { const t = Object.assign({}, S.house.top), TH = seat.hull && seat.hull.houses && seat.hull.houses.find(h => h.name === 'top of house');
    if (TH) { const zz = TH.polyShip.filter(p => Math.abs(p[0]) < 5.8).map(p => p[1]); t.z0 = Math.min(...zz); t.z1 = Math.max(...zz); t.abl = TH.top; t.half = Math.min(...TH.polyShip.filter(p => p[1] > 0).map(p => Math.abs(p[0]))); }
    const x = -2.4, z = t.z0 + 3.2, y = t.abl;
    B.add(M.steel, mergeG([cyl([x, y, z], [x, y + 2.4, z], 0.07, 0.06, { sides: 10 }), boxM(0.5, 0.35, 0.4, tr(x, y + 2.55, z)), cyl([x, y + 2.72, z], [x, y + 2.8, z], 0.06, 0.06, { sides: 8 }), boxM(2.2, 0.12, 0.2, mul(tr(x, y + 2.85, z), ry(0.6)))]), 'radar');
    for (const sx of [-1, 1]) { const wx = sx * Math.min(4.9, (t.half || 5.6) - 0.5), wz = t.z1 - 1.0;
      B.add(M.white, cyl([wx, y - 0.01, wz], [wx, y + 0.25, wz], 0.05, 0.04, { sides: 8 }), 'radar'); B.add(M.white, cyl([wx, y + 0.25, wz], [wx, y + 3.9, wz], 0.02, 0.006, { sides: 6 }), 'radar'); } }

  // ---- the staffs: the jackstaff on the stem head (with the Suez light's davit: sheet 10 item 29) and the ensign staff at
  // the 5"'s platform's after edge (photo 34); the jack and the ensign, streaming downwind
  const [wx, wz] = P.atBearing((P.WATER.wind.from + 180) % 360, 1), wind = nrm3([wx, 0, wz]);
  const jz = S.stemZ + 0.76, jy0 = SH.sideAbl(S.stemZ + 0.8) + 1.5, jy1 = jy0 + 3.05;
  B.add(M.steel, cyl([0, jy0 - 0.4, jz], [0, jy1, jz], 0.05, 0.03, { sides: 10 }), 'staffs');
  B.add(M.steel, tube([[0, jy0 + 0.6, jz], [0, jy0 + 1.3, jz - 0.25], [0, jy0 + 1.55, jz - 0.65], [0, jy0 + 1.45, jz - 0.95]], 0.03, { sides: 6 }), 'staffs');
  B.add(M.lampOff, lath([[0, 0], [0.08, 0], [0.08, 0.16], [0, 0.18]], 10).applyMatrix4(tr(0, jy0 + 1.25, jz - 0.95)), 'staffs');
  B.add(M.steel, lath([[0, 0], [0.05, 0], [0.05, 0.04], [0, 0.08]], 8).applyMatrix4(tr(0, jy1, jz)), 'staffs');
  // (on the platform's port quarter at its rail, photo 34: clear of the 5"/38, which stows trained aft over the CL)
  const ex = -2.5, ez = S.stern.platform.z1 - 1.5, ey0 = S.stern.platform.abl, ey1 = ey0 + 4.2;
  B.add(M.steel, cyl([ex, ey0, ez], [ex, ey1, ez], 0.055, 0.035, { sides: 10 }), 'staffs');
  B.add(M.steel, lath([[0, 0], [0.06, 0], [0.06, 0.05], [0, 0.09]], 8).applyMatrix4(tr(ex, ey1, ez)), 'staffs');
  const flags = [];
  const fl = (g) => { flags.push(g); out.flags++; };
  const streamDir = (droop) => nrm3(add3(wind, [0, -1, 0], droop));
  fl(flagGeo([0, jy1 - 0.08, jz], [0, -1, 0], 0.9, streamDir(0.35), 1.25, 27, 0.13));                   // the jack
  fl(flagGeo([ex, ey1 - 0.08, ez], [0, -1, 0], 1.45, streamDir(0.3), 2.6, 26, 0.71));                    // the ensign
  // halyards for both (made fast at the staffs' feet)
  for (const [x, y0, y1, z, side] of [[0, jy0 + 0.4, jy1, jz, 1], [ex, ey0 + 0.9, ey1, ez, -1]]) W.path([[x + 0.06 * side, y1 - 0.05, z], [x + 0.06 * side, y0, z]], { r: 0.005, tone: 4, ends: [W.fit('truck', lath([[0, 0], [0.07, 0], [0.07, 0.05], [0, 0.09]], 8).applyMatrix4(tr(x, y1 - 0.06, z)), [x, y1, z]), W.fit('staff cleat', cyl([x, y0 - 0.05, z], [x, y0 + 0.05, z], 0.07, 0.07), [x, y0, z])], name: 'staff halyard' });

  // ---- dressed overall: the code flags on lines from the jackstaff over the mastheads to the ensign staff
  const ORDER = 'AB2UJ1KE3GH6IV5FL4DM7PO3RN1ST0CX9WQ8ZY2';
  const code = ch => (ch >= 'A' && ch <= 'Z' ? ch.charCodeAt(0) - 65 : 28 + (+ch));
  const fore = rig.masts.fore, main = rig.masts.main, miz = rig.masts.mizzen;
  const legs = [
    [[0, jy1 - 0.02, jz], fore.poleTop], [fore.poleTop, main.truckTop], [main.truckTop, miz.truckTop], [miz.truckTop, [ex, ey1 - 0.02, ez]],
  ];
  let ci = 0, total = 0;
  const truckFit = p => W.fit('truck', lath([[0, 0], [0.09, 0], [0.09, 0.06], [0, 0.1]], 8).applyMatrix4(tr(p[0], p[1] - 0.08, p[2])), p);
  for (const [a, b] of legs) {
    const rec = W.add(a, b, { r: 0.006, w: 6.0, H: 900, tone: 4, kind: 'dressing line', name: 'dress line', ends: [truckFit(a), truckFit(b)], n: 60 });
    // walk the line and hang a flag every (hoist + gap) along it
    const pts = rec.pts, segL = [], cum = [0];
    for (let i = 1; i < pts.length; i++) { segL.push(Math.hypot(...sub3(pts[i], pts[i - 1]))); cum.push(cum[i - 1] + segL[i - 1]); }
    const at = s => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const u = (s - cum[i - 1]) / segL[i - 1]; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u, pts[i - 1][2] + (pts[i][2] - pts[i - 1][2]) * u]; };
    const Ltot = cum[cum.length - 1];
    for (let s = 1.2; s < Ltot - 1.2;) {
      const c = ORDER[ci % ORDER.length], k = code(c), pen = k >= 28, hl = pen ? 0.6 : 0.75, flen = pen ? 1.35 : 0.95;
      const p0 = at(s), p1 = at(s + hl), t = nrm3(sub3(p1, p0));
      // the fly: down and downwind, square to the line
      let g = add3([0, -0.75, 0], wind, 0.8); const gt = g[0] * t[0] + g[1] * t[1] + g[2] * t[2]; g = nrm3(sub3(g, t.map(v => v * gt)));
      fl(flagGeo(p0, t, hl, g, flen, k, (ci * 0.618) % 1));
      ci++; total++; s += hl + 0.22;
    }
  }
  if (flags.length) B.add(M.flag, flags, 'flags');
  out.measures = { cowls: out.cowls.length, cowlList: out.cowls, flags: out.flags, dressFlags: total, wind: P.WATER.wind, source: 'ship.md §7: ~16-20 cowls' };
  return out;
}
