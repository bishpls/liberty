// liberty/src/deck/machinery.js: the deck machinery (B2): the ten steam cargo winches at the hatch ends, the steam
// windlass under the bow platform with its cables to the hawse pipes and down the chain pipes, the two stockless bower
// anchors housed in their hawses, the warping capstan aft, the double bitts inboard of every closed chock, the chocks'
// castings and the roller fairleads.
//
// Sources: research/ship.md §5 (winches: 10 steam winches, double-geared 7 x 12 in, ~6 x 5 x 4 ft, in pairs at each hatch
// end; their places), §7 (the windlass on the CL at ~19.5 ft aft of the FP under the gun platform, chain pipes forward of
// it, spurling pipes to the locker; the anchors ~6 ft tall x 5 ft across the flukes, crowns housed at ~38-42 ft ABL, the
// hawse opening ~1 ft aft of the FP at ~40 ft ABL; double bitts of ~14 in posts x 2 ft inboard of each closed chock;
// the chocks oval ~2.4 x 1.6 ft), photos ship/25, 27, 29, 30 (the winches: drums wound with wire, warping heads at both
// ends, rust), 09, 12 (the anchors in their hawses). B1's anchors (ctx.mods.hull.anchors) give the seats: winches,
// windlass, bitts, chocks; the shell (B1's mesh) is ray-cast for where an anchor lies against the bow.
import { SH, FT, DEG, zs, deckCL, deckAt, sideAbl, halfAt, tr, rx, ry, rz, mul, along, xf, lath, cyl, boxM, boxAt, bar, tube, ring, disc, plate, mergeG, V3 } from './ship.js';

const T = window.THREE;
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm3 = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// a warping head: a concave spool (the rope's grooves worn bright)
const warpHead = (c, ax, r = 0.2, L = 0.34) => lath([[0, 0], [r * 1.25, 0], [r * 1.2, 0.03], [r * 0.82, L * 0.5], [r * 1.2, L - 0.03], [r * 1.25, L], [0, L]], 18, { hard: false }).applyMatrix4(along(c, ax));

// one steam cargo winch at seat p (deck point), its drum toward the mast house (dz: the way to the hatch)
function winchGeo(p, dz) {
  const [x, y, z] = p, steel = [], old = [], bare = [], black = [];
  const ax = [1, 0, 0];
  // the bed: two side frames (cast, with lightening holes drawn as dark discs), a base plate, cross ties
  steel.push(boxM(1.5, 0.08, 1.35, tr(x, y + 0.04, z)));
  for (const sx of [-0.62, 0.62]) {
    // (mirrored toward the hatch by its outline, not by a negative scale: that would turn its faces inside out)
    const fr = [[-0.62, 0], [0.62, 0], [0.5, 0.62], [0.15, 0.98], [-0.32, 0.98], [-0.62, 0.55]].map(([u, v]) => [u * dz, v]);
    steel.push(plate(dz < 0 ? fr.reverse() : fr, 0.06, mul(tr(x + sx, y + 0.08, z), ry(-Math.PI / 2))));
    black.push(disc([x + sx * 1.055, y + 0.48, z - dz * 0.05], [Math.sign(sx), 0, 0], 0.11, 12));
  }
  // the drum (wire wound on it), its flanges; the shaft through to the warping heads outboard of the frames
  const dc = [x, y + 0.66, z - dz * 0.2];
  old.push(lath([[0, -0.4], [0.42, -0.4], [0.42, -0.34], [0.27, -0.33], [0.27, 0.33], [0.42, 0.34], [0.42, 0.4], [0, 0.4]], 22).applyMatrix4(along(dc, ax)));
  black.push(lath([[0.285, -0.32], [0.285, 0.32]], 22, { hard: false }).applyMatrix4(along(dc, ax)));      // the wire's turns
  steel.push(cyl(add3(dc, ax, -0.95), add3(dc, ax, 0.95), 0.055, 0.055, { sides: 10 }));
  bare.push(warpHead(add3(dc, ax, 0.68), ax), warpHead(add3(dc, ax, -0.68), [-1, 0, 0]));
  // the gearing: the big spur wheel on the drum and its pinion on the crankshaft (photo 30: the double-geared train)
  steel.push(lath([[0.06, -0.035], [0.5, -0.035], [0.5, 0.035], [0.06, 0.035]], 28).applyMatrix4(along(add3(dc, ax, -0.5), ax)));
  const cs = [x, y + 0.48, z + dz * 0.32];
  steel.push(cyl(add3(cs, ax, -0.7), add3(cs, ax, 0.7), 0.045, 0.045, { sides: 8 }), lath([[0.04, -0.05], [0.17, -0.05], [0.17, 0.05], [0.04, 0.05]], 14).applyMatrix4(along(add3(cs, ax, -0.5), ax)));
  // the engine: two steam cylinders (7 in bore, 12 in stroke) toward the hatch, their valve chests, the reversing lever
  for (const sx of [-0.42, 0.42]) {
    const c0 = [x + sx, y + 0.42, z + dz * 0.35], c1 = [x + sx, y + 0.42, z + dz * 0.78];
    steel.push(cyl(c0, c1, 0.13, 0.13, { sides: 14 }), lath([[0, 0], [0.15, 0], [0.15, 0.05], [0, 0.05]], 14).applyMatrix4(along(c1, [0, 0, dz])));
    steel.push(boxM(0.18, 0.2, 0.36, tr(x + sx, y + 0.62, z + dz * 0.56)));
    steel.push(cyl(add3(c0, [0, 0, -dz], 0.02), add3(c0, [0, 0, -dz], 0.32), 0.025, 0.025, { sides: 6 }));
  }
  steel.push(boxM(0.1, 0.1, 0.1, tr(x + 0.1, y + 0.13, z + dz * 0.6)), cyl([x + 0.1, y + 0.15, z + dz * 0.6], [x + 0.25, y + 1.25, z + dz * 0.8], 0.02, 0.018, { sides: 6 }), lath([[0, 0], [0.04, 0], [0.04, 0.08], [0, 0.08]], 6).applyMatrix4(tr(x + 0.25, y + 1.24, z + dz * 0.8)));
  // the steam and exhaust pipes: down into the deck (the steam line runs below, along the house front), with a drain
  steel.push(tube([[x - 0.42, y + 0.7, z + dz * 0.56], [x - 0.42, y + 0.95, z + dz * 0.56], [x - 0.75, y + 0.95, z + dz * 0.56], [x - 0.8, y + 0.95, z + dz * 0.4], [x - 0.8, y + 0.02, z + dz * 0.4]], 0.035, { sides: 8 }));
  steel.push(tube([[x + 0.42, y + 0.7, z + dz * 0.56], [x + 0.42, y + 0.88, z + dz * 0.56], [x + 0.78, y + 0.88, z + dz * 0.6], [x + 0.78, y + 0.02, z + dz * 0.6]], 0.045, { sides: 8 }));
  steel.push(lath([[0.07, 0], [0.07, 0.03], [0.05, 0.03]], 8).applyMatrix4(tr(x - 0.8, y, z + dz * 0.4)), lath([[0.08, 0], [0.08, 0.03], [0.06, 0.03]], 8).applyMatrix4(tr(x + 0.78, y, z + dz * 0.6)));
  steel.push(tube([[x, y + 0.3, z + dz * 0.8], [x, y + 0.06, z + dz * 1.0], [x, y + 0.02, z + dz * 1.15]], 0.012, { sides: 5 }));
  return { steel, old, bare, black, drumTop: [x, dc[1] + 0.3, dc[2]], drumC: dc };
}

// a stockless bower anchor (Hall / Baldt type): the shank with its shackle, the crown, two flukes and their palms.
// Local frame: the shank up +y from the crown at the origin, the flukes spread along x, their faces toward +z (the hull)
function anchorGeo() {
  const g = [];
  g.push(plate([[-0.11, 0], [0.11, 0], [0.085, 1.45], [-0.085, 1.45]], 0.16, tr(0, 0.15, 0)));            // the shank
  g.push(ring([0, 1.75, 0], [1, 0, 0], 0.14, 0.04, { seg: 14, sides: 6 }));                                // the shackle
  g.push(boxM(0.2, 0.18, 0.18, tr(0, 1.52, 0)));
  g.push(boxM(0.62, 0.32, 0.32, tr(0, 0.12, 0)));                                                         // the crown
  for (const sx of [-1, 1]) {
    // a fluke: a tapered plate from the crown up and out, its tripping palm at the root
    g.push(plate([[0, 0], [0.24, 0], [0.18, 0.95], [0.06, 1.05], [0, 0.9]].map(([u, v]) => [u * sx * 1 + sx * 0.25, v * 0.95]), 0.1, mul(tr(0, 0.0, 0.06), rx(-0.22))));
    g.push(boxM(0.14, 0.24, 0.3, mul(tr(sx * 0.33, 0.14, -0.16), rx(0.4))));
  }
  return mergeG(g);
}

export function buildMachinery(world, M, ctx, B, W, seat, F) {
  const S = SH, out = { winches: [], measures: {} };
  const drums = {};
  // ---- the winches: B1's seats (x +-1.35 at each pair's centre) or the plan's pairs
  const toward = { 1: -1, 2: 1, 3: 1, 4: -1, 5: 1 };      // the way from the winch to its hatch
  for (const k of [1, 2, 3, 4, 5]) {
    const [z0, z1] = S.winches[k], zc = (z0 + z1) / 2;
    for (const sx of [-1, 1]) {
      const fallback = [sx * 1.35, deckAt(sx * 1.35, zc), zc];
      const sp = seat.get(`winches.${k}.seats.${sx < 0 ? 0 : 1}`, fallback);
      const wg = winchGeo(sp, toward[k]);
      B.add(M.steel, wg.steel, 'winches'); B.add(M.steelOld, wg.old, 'winches'); B.add(M.bare, wg.bare, 'winches'); B.add(M.black, wg.black, 'winches');
      const fitG = lath([[0, -0.32], [0.3, -0.32], [0.3, 0.32], [0, 0.32]], 10).applyMatrix4(along(wg.drumC, [1, 0, 0]));
      const fid = W.fit('winch drum', fitG, wg.drumTop);
      drums[`${k}${sx}`] = { p: [wg.drumTop[0] + sx * 0.15, wg.drumTop[1] - 0.01, wg.drumTop[2]], fit: fid };
      out.winches.push({ hatch: k, side: sx, at: sp });
    }
  }
  out.drum = (hatch, sx) => drums[`${hatch}${sx}`] || null;

  // ---- the windlass under the bow platform (CL, ~19.5 ft aft of the FP), its cables to the hawses, the chain pipes
  const wl = seat.get('windlass', [0, deckCL(S.bow.windlass), S.bow.windlass]);
  {
    const [x, y, z] = wl, st = [], old = [], bare = [], blk = [];
    st.push(boxM(2.9, 0.12, 1.5, tr(x, y + 0.06, z)));
    for (const sx of [-1.15, -0.05, 1.05]) st.push(plate([[-0.7, 0], [0.7, 0], [0.55, 0.85], [-0.45, 0.95]], 0.07, mul(tr(x + sx, y + 0.12, z), ry(-Math.PI / 2))));
    // the wildcats (gypsies) for the cables, their band brakes and brake wheels; the warping heads outboard
    for (const sx of [-1, 1]) {
      const c = [x + sx * 0.55, y + 0.78, z];
      old.push(lath([[0, -0.2], [0.48, -0.2], [0.48, -0.15], [0.36, -0.1], [0.36, 0.1], [0.48, 0.15], [0.48, 0.2], [0, 0.2]], 20).applyMatrix4(along(c, [1, 0, 0])));
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; old.push(boxM(0.08, 0.14, 0.16, mul(tr(...c), rx(a), tr(0, 0.38, 0)))); }
      st.push(lath([[0.4, -0.06], [0.55, -0.06], [0.55, 0.06], [0.4, 0.06]], 22).applyMatrix4(along(add3(c, [sx * 0.29, 0, 0]), [1, 0, 0])));
      st.push(cyl([x + sx * 0.85, y + 0.12, z + 0.5], [x + sx * 0.85, y + 1.2, z + 0.5], 0.03, 0.03, { sides: 6 }), ring([x + sx * 0.85, y + 1.22, z + 0.5], [0, 1, 0], 0.22, 0.018, { seg: 16, sides: 5 }));
      bare.push(warpHead([x + sx * 1.2, y + 0.78, z], [sx, 0, 0], 0.24, 0.42));
    }
    st.push(cyl([x - 1.5, y + 0.78, z], [x + 1.5, y + 0.78, z], 0.07, 0.07, { sides: 10 }));
    // the engine aft of it: two cylinders and their valve chest, the steam pipe
    for (const sx of [-0.4, 0.4]) st.push(cyl([x + sx, y + 0.55, z + 0.45], [x + sx, y + 0.55, z + 1.2], 0.17, 0.17, { sides: 14 }));
    st.push(boxM(0.5, 0.3, 0.6, tr(x, y + 0.8, z + 0.85)), tube([[x, y + 0.95, z + 0.85], [x, y + 1.7, z + 0.85], [x, y + 1.7, z + 1.6], [x, y + 2.3, z + 1.6]], 0.05, { sides: 8 }));
    B.add(M.steel, st, 'windlass'); B.add(M.steelOld, old, 'windlass'); B.add(M.bare, bare, 'windlass');
    // the spurling pipes' mouths in the bed under the wildcats: the cables go down them to the locker
    for (const sx of [-1, 1]) B.add(M.black, disc([x + sx * 0.55, y + 0.121, z + 0.42], [0, 1, 0], 0.16, 14), 'windlass');
    out.windlass = { at: wl };
    // ---- the anchors housed in B1's hawse pipes (B1 builds the pipes, the hawse plates and the deck ends: decks.js; its
    // form ctx.mods.hull.form gives the opening and the shell's normal there, computed as B1 computes them), the cables
    // from the pipes' deck ends over the wildcats and down the chain pipes
    const F_ = seat.hull && seat.hull.form;
    const hawse = [];
    for (const sx of [-1, 1]) {
      const zH = (1 - 213.65) * FT, hH = 40 * FT;
      let P0, N;
      // B1's exported hawse (outboard point, the shell's normal, the pipe's deck end), else its form, else the plan
      const HA = seat.A && Array.isArray(seat.A.hawse) ? seat.A.hawse.find(h => (h.side === 'starboard') === (sx > 0)) : null;
      const shipPt = v => (v == null ? null : v.ship ? v.ship : Array.isArray(v) ? v : null);
      if (HA && shipPt(HA.outboard)) {
        P0 = shipPt(HA.outboard).slice(); N = nrm3(HA.normal.ship || HA.normal); seat.used[`hawse.${sx > 0 ? 'starboard' : 'port'}`] = 'hull';
      } else if (F_ && F_.hb) {
        const x0 = F_.hb(zH, hH), dxdz = (F_.hb(zH + 0.05, hH) - F_.hb(zH - 0.05, hH)) / 0.1, dxdh = (F_.hb(zH, hH + 0.05) - F_.hb(zH, hH - 0.05)) / 0.1;
        N = nrm3([sx, -dxdh, -dxdz]); if (N[0] * sx < 0) N = N.map(v => -v);
        P0 = [sx * x0, hH, zH];
      } else { P0 = [sx * Math.max(1.0, halfAt(zH) * 0.62), hH, zH]; N = nrm3([sx, 0, -0.35]); }
      const deckEnd = (HA && shipPt(HA.deck)) ? shipPt(HA.deck).slice() : [sx * 1.25, deckAt(sx * 1.25, S.bow.windlass - 1.6) + 0.35, S.bow.windlass - 1.6];
      // the anchor: its shank drawn up the pipe (toward its deck end), the crown out against the plate, flukes on the shell
      const Y = V3(...nrm3(sub3(deckEnd, P0)));
      let Z = V3(...N); Z.addScaledVector(Y, -Z.dot(Y)).normalize();
      const X = Y.clone().cross(Z).normalize();
      const crown = add3(add3(P0, Y.toArray(), -0.62), Z.toArray(), 0.2);
      const m = new T.Matrix4().makeBasis(X, Y, Z).setPosition(...crown);
      B.add(M.steelOld, anchorGeo().applyMatrix4(m), 'anchors');
      hawse.push({ deck: deckEnd, shell: P0, normal: N });
      // the cable: stud links from the pipe's deck end up over the wildcat and down its chain pipe
      const wc = [wl[0] + sx * 0.55, wl[1] + 0.78, wl[2]];
      const path = [add3(deckEnd, [0, -0.1, 0]), add3(deckEnd, [0, 0.12, 0.6]), [wc[0], wc[1] + 0.12, wc[2] - 0.55], [wc[0], wc[1] + 0.46, wc[2]], [wc[0], wc[1] + 0.12, wc[2] + 0.42], [wc[0], wl[1] + 0.05, wc[2] + 0.42]];
      B.add(M.steelOld, chainLinks(path, 0.052), 'chain');
    }
    out.hawse = hawse;
  }

  // ---- the capstan aft: a warping capstan on the CL between No. 5 and the after deckhouse
  {
    const z = (S.hatches[5].z1 + S.stern.deckhouse.z0) / 2, y = deckCL(z);
    B.add(M.steel, lath([[0.55, 0], [0.55, 0.12], [0.45, 0.14], [0.45, 0.2], [0, 0.2]], 22).applyMatrix4(tr(0, y, z)), 'capstan');
    B.add(M.bare, lath([[0, 0.2], [0.4, 0.2], [0.4, 0.26], [0.3, 0.3], [0.27, 0.62], [0.36, 0.8], [0.36, 0.85], [0.0, 0.92]], 22, { hard: false }).applyMatrix4(tr(0, y, z)), 'capstan');
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; B.add(M.black, disc([Math.cos(a) * 0.361, y + 0.83, z + Math.sin(a) * 0.361], [Math.cos(a), 0, Math.sin(a)], 0.03, 8), 'capstan'); }
    out.capstan = [0, y, z];
  }

  // ---- the double bitts (B1's places: inboard of each closed chock) and the chocks' oval castings in the bulwark
  const bitts = (seat.A && seat.A.bitts) || [];
  const chocks = (seat.A && seat.A.chocks) || [];
  out.bitts = []; out.chocks = [];
  const bittPlaces = bitts.length ? bitts.map(b => ({ at: b.at, side: b.side, p: b.ship })) :
    [22, 34, 190, 205, 269, 283, 395, 410].flatMap(ft => [-1, 1].map(sx => { const z = (ft - 213.65) * FT, x = sx * (halfAt(z) - 0.95); return { at: ft, side: sx, p: [x, deckAt(x, z), z] }; }));
  for (const b of bittPlaces) {
    const [x, y, z] = b.p, g = [];
    g.push(boxM(0.62, 0.05, 1.45, tr(x, y + 0.025, z)));
    for (const dz of [-0.4, 0.4]) {
      g.push(lath([[0.2, 0], [0.18, 0.04], [0.18, 0.56], [0.21, 0.6], [0.21, 0.64], [0, 0.66]], 16).applyMatrix4(tr(x, y + 0.04, z + dz)));
      g.push(cyl([x - 0.3, y + 0.5, z + dz], [x + 0.3, y + 0.5, z + dz], 0.035, 0.035, { sides: 6 }));       // the horns (cross pin)
    }
    B.add(M.steelOld, g, 'bitts', { key: 'bitts' });
    out.bitts.push({ at: b.at, side: b.side, p: b.p, posts: [[x, y + 0.04, z - 0.4], [x, y + 0.04, z + 0.4]], fit: W.fit('bitts', mergeG(g.map(q => q.clone())), b.p) });
  }
  const chockPlaces = chocks.length ? chocks.map(c => ({ at: c.at, side: c.side, p: c.ship })) :
    [22, 34, 190, 205, 269, 283, 395, 410].flatMap(ft => [-1, 1].map(sx => { const z = (ft - 213.65) * FT; return { at: ft, side: sx, p: [sx * halfAt(z), sideAbl(z) + 0.6, z] }; }));
  for (const c of chockPlaces) {
    const [x, y, z] = c.p, n = [Math.sign(x), 0, 0];
    // an oval cast ring through the plate, its lips proud on both faces (0.73 x 0.49 m opening: ship.md rule 7)
    const rg = new T.TorusGeometry(0.3, 0.07, 6, 20); rg.scale(1.22, 0.82, 1.0);
    rg.applyMatrix4(mul(tr(x, y, z), ry(Math.PI / 2)));
    const uv = rg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * 0.4);
    B.add(M.steelOld, seed1(rg), 'chocks', { key: 'chocks' });
    out.chocks.push({ at: c.at, side: c.side, p: c.p, n, fit: W.fit('chock', rg.clone(), c.p) });
  }
  // ---- roller fairleads at the bow and the quarters (a pair of vertical rollers on a base, leading the lines to the bitts)
  for (const b of out.bitts.filter(b => b.at < 40 || b.at > 390)) {
    const [x, y, z] = b.p, sx = b.side, xr = x - sx * 0.95, yr = deckAt(xr, z + 1.3);
    const g = [boxM(0.5, 0.06, 0.95, tr(xr, yr + 0.03, z + 1.3))];
    for (const dz of [-0.24, 0.24]) g.push(lath([[0.11, 0], [0.11, 0.38], [0.13, 0.4], [0, 0.42]], 12).applyMatrix4(tr(xr, yr + 0.06, z + 1.3 + dz)));
    B.add(M.steelOld, g, 'bitts');
  }
  // ---- the mooring lines' inboard ends (the lines themselves, chock to the apron, are B4's): from each starboard chock in
  // to its bitts and two figure-eight turns round the posts, the tail flaked on the deck
  let moored = 0;
  for (const c of out.chocks.filter(c => c.side > 0)) {
    const b = out.bitts.find(b => b.side === c.side && b.at === c.at);
    if (!b) continue;
    const [bx, by, bz] = b.p, lead = c.at < 100 ? -1 : c.at > 300 ? 1 : (c.at === 190 ? -1 : c.at === 283 ? 1 : 0);
    const pts = [c.p, [c.p[0] - 0.35, c.p[1] - 0.15, c.p[2]]];
    const turn = (y0, y1, k0 = 0) => { for (let k = k0; k <= 32; k++) { const t = k / 32 * Math.PI * 2 + Math.PI / 2; /* (from the forward post's far side, heading inboard as the lead arrives) */ const yy = y0 + (y1 - y0) * k / 32; pts.push([bx + 0.27 * Math.sin(2 * t), by + yy, bz + 0.64 * Math.sin(t)]); } };
    turn(0.22, 0.3); turn(0.3, 0.42, 1);                // (the second turn carries on from the first: no doubled point)
    const last = pts[pts.length - 1];
    // the tail: off the top turn, down to the deck and flaked in a short run
    pts.push([last[0] - 0.3, by + 0.25, last[2] + 0.2], [bx - 0.75, deckAt(bx - 0.75, bz + 0.5) + 0.04, bz + 0.5], [bx - 0.85, deckAt(bx - 0.85, bz + 1.4) + 0.04, bz + 1.4], [bx - 1.15, deckAt(bx - 1.15, bz + 1.0) + 0.04, bz + 1.0]);
    W.path(pts, { r: 0.038, tone: 4, rope: true, ends: [c.fit, 'deck'], through: [0.3, 0], name: 'mooring line (inboard): led through the chock, turned on the bitts, its tail on the deck' });
    void lead; moored++;
  }
  out.measures = { mooringInboard: moored, winches: out.winches.length, bitts: out.bitts.length, chocks: out.chocks.length, windlass: wl.map(v => +v.toFixed(2)), anchors: out.hawse.map(h => h.shell.map(v => +v.toFixed(2))) };
  return out;
}
const seed1 = g => { if (!g.attributes.aSeed) g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(0.5), 1)); return g; };

// stud-link chain along a path: links of nominal size d (2 1/16 in), alternating 90 deg, a stud across each
export function chainLinks(path, d) {
  const out = [], Lk = d * 6, Wk = d * 3.6;
  const segs = []; let tot = 0;
  for (let i = 1; i < path.length; i++) { const l = Math.hypot(...sub3(path[i], path[i - 1])); segs.push(l); tot += l; }
  const n = Math.floor(tot / (Lk - 2 * d));
  for (let k = 0; k < n; k++) {
    let s = (k + 0.5) * (Lk - 2 * d), i = 0; while (i < segs.length - 1 && s > segs[i]) { s -= segs[i]; i++; }
    const a = path[i], b = path[i + 1], u = Math.min(1, s / segs[i]), p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    const dir = nrm3(sub3(b, a));
    const g = new T.TorusGeometry(Wk / 2 - d / 2, d / 2, 5, 12); g.scale(1, Lk / Wk, 1);
    g.applyMatrix4(mul(along(p, dir), ry(k % 2 ? Math.PI / 2 : 0)));
    const uv = g.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * 0.3, uv.getY(q) * 0.1);
    out.push(seed1(g));
    const st = cyl([-Wk / 2 + d / 2, 0, 0], [Wk / 2 - d / 2, 0, 0], d * 0.3, d * 0.3, { sides: 4 }).applyMatrix4(mul(along(p, dir), ry(k % 2 ? Math.PI / 2 : 0)));
    out.push(st);
  }
  return mergeG(out);
}
