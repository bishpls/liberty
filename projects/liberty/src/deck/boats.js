// liberty/src/deck/boats.js: the boats and rafts (B2): four double-ended lifeboats in their chocks on the boat deck under
// their radial davits, with canvas covers on ridge poles, falls rove through the davit heads' blocks and gripes over the
// covers; four life rafts on inclined racks against the main and mizzen shrouds (HAER: "four additional life rafts
// rested on the second and third mast"), ready to slide overboard.
//
// Sources: research/ship.md §7 (4 boats ~24 x 8 ft, Welin 24.0 x 8.0 x 3.58 ft; light grey to white with a darker
// gunwale band; davits ~12.5 ft high with goose-neck heads ~59 ft ABL; rafts ~10-12 x 6 x 2 ft on racks at 55-65 deg,
// grey with rust along the rack edges: photos 31, 33), B1's davit seats (anchors.davits), photos ship/01, 04 (the boats
// and davits at Pier 35).
import { SH, FT, DEG, deckCL, deckAt, sideAbl, halfAt, tr, rx, ry, rz, mul, along, lath, cyl, boxM, bar, tube, ring, plate, mergeG } from './ship.js';
import { gridSurf } from 'scene3d/kit/arch/kit.js';

const T = window.THREE;
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm3 = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// the boat's form: u along (-1 bow .. 1 stern: double-ended, so symmetric), the gunwale's half-breadth and sheer, the keel
const BOAT = { L: 24.0 * FT, B: 8.0 * FT, D: 3.58 * FT };
const hbG = u => (BOAT.B / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.4)), 0.55);
const sheer = u => 0.22 * Math.pow(Math.abs(u), 2.6);
const keel = u => -BOAT.D + 0.32 * Math.pow(Math.abs(u), 3.2);

function boatGeo(c, M) {
  const [cx, cy, cz] = c, nu = 28, nv = 14;
  // the hull: from the port gunwale round the bilge and keel to the starboard gunwale
  const hull = gridSurf(nu, nv, (i, j) => {
    const u = -1 + 2 * i / nu, v = -1 + 2 * j / nv, th = Math.abs(v) * Math.PI / 2;
    const hb = Math.max(hbG(u), 0.02), y0 = keel(u), y1 = sheer(u);
    const x = Math.sign(v) * hb * Math.pow(Math.sin(th), 0.7), y = y0 + (y1 - y0) * (1 - Math.pow(Math.cos(th), 1.6));
    return [cx + x, cy + y, cz + u * BOAT.L / 2];
  }, { uvAt: (i, j) => [i / nu * BOAT.L, j / nv * 3.0], seed: 0.6, flip: true });
  // the gunwale's rubbing strake (the darker band) and the stem posts
  const gun = [];
  for (const sx of [-1, 1]) {
    const pts = []; for (let i = 0; i <= nu; i++) { const u = -1 + 2 * i / nu; pts.push([cx + sx * (hbG(u) + 0.02), cy + sheer(u) - 0.05, cz + u * BOAT.L / 2]); }
    gun.push(tube(pts, 0.05, { sides: 6 }));
  }
  for (const s of [-1, 1]) gun.push(bar([cx, cy + keel(s * 0.98) - 0.02, cz + s * BOAT.L / 2 * 0.985], [cx, cy + sheer(s) + 0.12, cz + s * BOAT.L / 2 * 1.005], 0.07, 0.07));
  // the cover: canvas over a ridge pole, its edges lashed under the gunwale; a little sag between the boat's thwarts
  const cover = gridSurf(nu, 10, (i, j) => {
    const u = -0.97 + 1.94 * i / nu, v = -1 + 2 * j / 10, hb = hbG(u) + 0.04;
    const ridge = 0.32 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 6)), 0.5);
    const sag = 0.03 * Math.sin(Math.PI * Math.abs(v)) * (0.5 + 0.5 * Math.cos(u * Math.PI * 5));
    return [cx + v * hb, cy + sheer(u) + 0.02 + ridge * (1 - Math.pow(Math.abs(v), 1.4)) - sag, cz + u * BOAT.L / 2];
  }, { uvAt: (i, j) => [i / nu * BOAT.L, j / 10 * 2.8], seed: 0.4 });
  return { hull, gun, cover };
}

export function buildBoats(world, M, ctx, B, W, seat, F) {
  const S = SH, out = { boats: [], rafts: [], measures: {} };
  const davits = (seat.A && seat.A.davits) || S.house.lifeboats.flatMap(([z0, z1], i) => [-1, 1].map(sx => ({ boat: i, side: sx > 0 ? 'starboard' : 'port', seats: [z0 - 0.4, z1 + 0.4].map(z => ({ ship: [sx * (halfAt(z) - 0.35), S.house.boat.abl, z] })) })));
  seat.used.davits = seat.A && seat.A.davits ? 'hull' : 'plan';
  const ROPE = { r: 0.012, tone: 3, rope: true };
  for (const d of davits) {
    const sx = d.side === 'starboard' ? 1 : -1;
    const [sa, sb] = d.seats.map(s => s.ship || s);
    const zc = (sa[2] + sb[2]) / 2, deckY = sa[1];
    // the boat: centred between its davits, ~1.1 m inboard of their seats, on two chocks
    const bx = sx * (Math.abs(sa[0]) - 1.15), by = deckY + 0.42 + BOAT.D;
    const bg = boatGeo([bx, by, zc], M);
    B.add(M.boat, bg.hull, 'boats'); B.add(M.black, bg.gun, 'boats'); B.add(M.cover, bg.cover, 'boats');
    for (const u of [-0.5, 0.5]) {
      const z = zc + u * BOAT.L / 2, yk = by + keel(u);
      B.add(M.wood, mergeG([boxM(1.5, 0.12, 0.25, tr(bx, deckY + 0.06, z)), plate([[-0.75, 0], [0.75, 0], [0.75, 0.1], [hbG(u) * 0.55, yk - deckY - 0.12 + 0.35], [-hbG(u) * 0.55, yk - deckY - 0.12 + 0.35], [-0.75, 0.1]], 0.18, tr(bx, deckY + 0.12, z))]), 'boats');
    }
    // the davits: round columns curving over the boat's ends (heads ~59 ft ABL), the falls' blocks under their heads
    const headY = Math.max(18.0, deckY + 3.6);
    for (const [s, sgn] of [[sa, -1], [sb, 1]]) {
      const zh = zc + sgn * (BOAT.L / 2 - 0.55);
      const hx = bx, base = [s[0], deckY, s[2]];
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        if (t < 0.55) pts.push([base[0], deckY + 0.1 + (headY - 0.75 - deckY) * (t / 0.55), base[2]]);
        else { const a = (t - 0.55) / 0.45 * Math.PI / 2; const rx_ = hx - base[0], rz_ = zh - base[2]; pts.push([base[0] + rx_ * (1 - Math.cos(a)), headY - 0.75 + 0.75 * Math.sin(a) - 0.12 * Math.pow(Math.sin(a), 6), base[2] + rz_ * (1 - Math.cos(a))]); }
      }
      const dv = tube(pts, (u) => 0.1 - 0.035 * u, { sides: 12, seed: 0.33 });
      B.add(M.steel, dv, 'davits');
      B.add(M.steelOld, lath([[0.2, 0], [0.2, 0.06], [0.13, 0.1], [0.12, 0.35], [0, 0.35]], 14).applyMatrix4(tr(base[0], deckY, base[2])), 'davits');
      const headP = pts[pts.length - 1];
      const fit = W.fit('davit head', dv, headP);
      // the falls: a double block under the head, its fellow on the boat's hook; four parts of manila
      const top = F.block(add3(headP, [0, -0.05, 0]), [0, -1, 0], 0.32);
      const hookY = by + sheer(sgn * 0.85) + 0.45;
      const low = F.block([hx, hookY + 0.42, zh], [0, -1, 0], 0.3);
      for (const k of [-1, -0.33, 0.33, 1]) W.path([add3(top.sheave, [0, 0, k * 0.05]), add3(low.sheave, [0, 0, k * 0.05])], Object.assign({}, ROPE, { ends: [top.fit, low.fit], name: 'boat fall' }));
      void fit;
    }
    // the gripes: two wire straps over the cover, from padeyes inboard of the boat to the deck at its outboard side
    for (const u of [-0.32, 0.32]) {
      const z = zc + u * BOAT.L / 2, hb = hbG(u), yr = by + sheer(u) + 0.36;
      const pin = F.padeye([bx - sx * (hb + 0.45), deckY, z], [0, 1, 0]), pout = F.padeye([bx + sx * (hb + 0.35), deckY, z], [0, 1, 0]);
      const pts = [pin.eye, [bx - sx * (hb + 0.08), by + sheer(u) + 0.02, z], [bx - sx * hb * 0.5, yr - 0.08, z], [bx, yr, z], [bx + sx * hb * 0.5, yr - 0.08, z], [bx + sx * (hb + 0.08), by + sheer(u) + 0.02, z], pout.eye];
      W.path(pts, { r: 0.008, tone: 1, ends: [pin.fit, pout.fit], name: 'gripe' });
    }
    out.boats.push({ boat: d.boat, side: d.side, centre: [bx, by, zc], length: BOAT.L, beam: BOAT.B, depth: BOAT.D });
  }

  // ---- the rafts on their racks against the main and mizzen shrouds, between the abreast and the after shroud
  for (const name of ['main', 'mizzen']) {
    const m = S.masts[name];
    for (const sx of [-1, 1]) {
      const z = m.z + 1.82, xo = sx * (halfAt(z) - 0.35), yd = deckAt(xo, z);
      // the shrouds' slope (eye at the masthead, padeye at the deck edge) sets the rack's incline (~57 deg: rule 55-65)
      const capY = deckCL(m.z) + m.above - 0.35, rise = capY - yd - 0.6, run = Math.abs(xo) - 0.35;
      const ang = Math.atan2(rise, run);
      const up = nrm3([-sx * Math.cos(ang), Math.sin(ang), 0]), nUp = [sx * Math.sin(ang), Math.cos(ang), 0];
      // the rack's plane: parallel to the shrouds', 0.75 m inboard of them; the raft lies on it, under the shrouds,
      // its foot 1.2 m over the deck (clear of the bulwark), sliding out over the side when the release lets go
      const off = -0.75, s0 = (1.2 - off * nUp[1]) / up[1];
      const rail = s1 => add3(add3([xo, yd, z], up, s1), nUp, off);
      const inn = nUp, foot = add3(rail(s0), nUp, -0.3);
      const L = 3.3, Wd = 1.8, Th = 0.55;
      const base = add3(rail(s0), nUp, 0.05 + Th / 2);
      const c = add3(base, up, L / 2);
      const Xb = new T.Vector3(...up), Yb = new T.Vector3(...inn), Zb = Xb.clone().cross(Yb).normalize();      // (right-handed on both sides)
      const basis = new T.Matrix4().makeBasis(Xb, Yb, Zb).setPosition(...c);
      // the raft: a box with rounded edges drawn by its frame, slatted ends, grab lines round it
      B.add(M.steelOld, boxM(L, Th, Wd, basis), 'rafts');
      B.add(M.steelOld, [-1, 1].map(e => boxM(0.08, Th + 0.04, Wd + 0.04, mul(basis, tr(e * (L / 2 - 0.04), 0, 0)))), 'rafts');
      const gl = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2; gl.push(add3(add3(c, up, Math.cos(a) * (L / 2 + 0.05)), [0, 0, 1], Math.sin(a) * (Wd / 2 + 0.05))); }
      const glg = tube(gl.map(p => add3(p, inn, Th / 2 - 0.05)), 0.012, { sides: 5, closed: true }); glg.setAttribute('aTone', new T.Float32BufferAttribute(new Float32Array(glg.attributes.position.count).fill(3), 1));
      B.add(M.rope, glg, 'rafts');
      // the rack: two inclined rails under the raft, legs to the deck, the stop at the foot, a release at the head
      for (const dz of [-0.6, 0.6]) {
        const r0 = add3(add3(foot, inn, 0.3), [0, 0, dz]), r1 = add3(r0, up, L + 0.2);
        B.add(M.steelOld, bar(r0, r1, 0.1, 0.06, 0.5, [0, 0, 1]), 'rafts');
        const legTop = add3(r0, up, L * 0.62);
        B.add(M.steelOld, [cyl([legTop[0], deckAt(legTop[0], legTop[2]) - 0.02, legTop[2]], legTop, 0.04, 0.04, { sides: 6 }), cyl([r0[0], deckAt(r0[0], r0[2]) - 0.02, r0[2]], r0, 0.04, 0.04, { sides: 6 })], 'rafts');
      }
      B.add(M.steelOld, bar(add3(add3(foot, inn, 0.3), [0, 0, -0.75]), add3(add3(foot, inn, 0.3), [0, 0, 0.75]), 0.1, 0.12, 0.5, [0, 0, 1]), 'rafts');
      const rel = add3(add3(c, up, L / 2), inn, Th / 2 - 0.08);
      const pe = F.eye(rel, up, 0.035, 0.06);
      // the release's wire (a pelican hook) to the nearest point of the aft shroud above it, clamped round the shroud
      const shroud = W.list.find(w => w.name === `${name} shroud ${sx > 0 ? 'S' : 'P'}0.6`);
      let sh = add3(add3(rel, up, 0.5), nUp, 0.3);
      if (shroud) { let best = Infinity; for (const p of shroud.pts) { const d = Math.hypot(...sub3(p, pe.eye)); if (d < best && p[1] > pe.eye[1]) { best = d; sh = p; } } }
      const clamp = cyl(add3(sh, [0, -0.04, 0]), add3(sh, [0, 0.04, 0]), 0.026, 0.026, { sides: 6 });
      B.add(M.steelOld, clamp, 'rafts');
      W.path([pe.eye, sh], { r: 0.006, tone: 1, ends: [pe.fit, W.fit('shroud clamp', clamp, sh)], name: 'raft release' });
      out.rafts.push({ mast: name, side: sx, angle: +(ang / DEG).toFixed(1), centre: c.map(v => +v.toFixed(2)) });
    }
  }
  out.measures = {
    boats: { count: out.boats.length, length: +BOAT.L.toFixed(2), beam: +BOAT.B.toFixed(2), depth: +BOAT.D.toFixed(2), source: 'ship.md §7: 24 x 8 ft (Welin 24.0 x 8.0 x 3.58 ft)', davitHeads: '>= 18.0 m ABL (59 ft)' },
    rafts: out.rafts.map(r => ({ mast: r.mast, side: r.side, angle: r.angle, source: 'racks 55-65 deg (ship.md §7)' })),
  };
  return out;
}
