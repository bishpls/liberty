// liberty/src/hull/decks.js: the weather deck and every structure that is part of the ship's body (B1): the hatch
// coamings, the mast houses, the midship house's tiers and the funnel, the bow gun platform and its tub, the after
// deckhouse and the 5"/38's horseshoe platform, the 20 mm tubs and the forward pillboxes, the bulwark's cap and stays,
// the open rails. Ship coordinates (x starboard, y = abl, z aft); positions from plan.js SHIP (research/ship.md §5-6,
// HAER sheets 2, 4, 5, 14). Returns geometry lists by material plus the anchors the deck builder (B2) reads.
import { box, merge } from 'scene3d/geom.js';
import { wall, slab, arcPath, rail, tube, door } from './parts.js';
import { buildHouses } from './house.js';

const FT = 0.3048;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

export function buildDecks(F, place = {}) {
  const S = F.S;
  const G = { deck: [], hdeck: [], steel: [], door: [], white: [], boot: [], glass: [], armour: [] };          // geometry lists by material
  const anchors = {}, houses = [], stopperBoxes = [];
  const hbTop = z => F.hb(z, F.side(z));
  // the weather deck's height (abl) at (x, z): the sheer at the side, the camber's two flats with a 3 m level flat
  const deckAbl = (x, z) => {
    const hb = hbTop(z), ax = Math.abs(x), run = Math.max(hb - S.camberFlat / 2, 0.01);
    return F.side(z) + S.camber * clamp((hb - Math.min(ax, hb)) / run);
  };
  const deckFoot = (x, z) => deckAbl(x, z) - 0.04;                 // walls sink 4 cm into the deck (no seam of light)

  // ---- the weather deck: z from where the sheer meets the stem to the stern; x through the camber's breaks
  {
    let z0 = F.zFwd(F.side(-66)); for (let k = 0; k < 8; k++) z0 = F.zFwd(F.side(z0));
    const z1 = S.sternZ - 0.02;
    const zs = []; const n = 340;
    for (let i = 0; i <= n; i++) { const s = i / n; zs.push(z0 + (z1 - z0) * (s - 0.04 * Math.sin(s * Math.PI * 2))); }
    const qs = [-1, -0.92, -0.8, -0.62, -0.42, -0.22, -0.001, 0, 0.001, 0.22, 0.42, 0.62, 0.8, 0.92, 1];
    const pos = [], nrm = [], uv = [], idx = [];
    const nc = qs.length;
    for (const z of zs) {
      const hb = Math.max(hbTop(z), 0.001), flat = Math.min(S.camberFlat / 2, hb * 0.5);
      for (const q of qs) {
        // the camber's breaks at +-1.5 m land on samples: q in [-0.001, 0.001] maps to the flat's edges
        let x;
        if (Math.abs(q) <= 0.001) x = Math.sign(q) * flat * (q === 0 ? 0 : 1);
        else x = Math.sign(q) * (flat + (hb - flat) * (Math.abs(q) - 0.001) / 0.999);
        if (q === -0.001) x = -flat; if (q === 0.001) x = flat; if (q === 0) x = 0;
        pos.push(x, deckAbl(x, z), z); nrm.push(0, 1, 0); uv.push(z, hb - Math.abs(x));
      }
    }
    for (let i = 0; i < zs.length - 1; i++) for (let k = 0; k < nc - 1; k++) {
      const a = i * nc + k, b = a + 1, c = (i + 1) * nc + k + 1, d = (i + 1) * nc + k;
      idx.push(a, b, c, a, c, d);
    }
    const g = new window.THREE.BufferGeometry();
    g.setAttribute('position', new window.THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new window.THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new window.THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    // (winding: a = (i, k), b = (i, k+1) across, d = (i+1, k) aft: (b - a) x (d - a) = +x cross +z = -y; flip)
    const ix = g.index.array; for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
    g.computeVertexNormals();
    G.deck.push(g);
  }

  // ---- the hatch coamings (CL, 0.91 m above the deck at the CL, sheet 14; extents sheet 5): a flat-bar top edge, a
  // horizontal stiffener round the outside, vertical brackets every ~1.5 m
  anchors.hatches = {};
  for (const k of [1, 2, 3, 4, 5]) {
    const h = S.hatches[k], hx = h.half, top = z => deckAbl(0, z) + S.hatches.coaming;
    const loop = [[-hx, h.z0], [hx, h.z0], [hx, h.z1], [-hx, h.z1]];
    G.steel.push(wall(loop, deckFoot, (x, z) => top(z), 0.03, { closed: true, seed: 0.1 * k }));
    // the top flat bar (a lip outward) and the stiffener halfway down
    G.steel.push(wall(loop.map(([x, z]) => [x * (1 + 0.05 / hx), z + Math.sign(z - (h.z0 + h.z1) / 2) * 0.05]), (x, z) => top(z) - 0.06, (x, z) => top(z) + 0.005, 0.08, { closed: true }));
    G.steel.push(wall(loop.map(([x, z]) => [x * (1 + 0.1 / hx), z + Math.sign(z - (h.z0 + h.z1) / 2) * 0.1]), (x, z) => top(z) - 0.5, (x, z) => top(z) - 0.42, 0.1, { closed: true }));
    for (let zb = h.z0 + 0.7; zb < h.z1 - 0.3; zb += 1.5) for (const sx of [-1, 1]) G.steel.push(box([sx * (hx + 0.06), deckAbl(hx, zb) + 0.22, zb], [0.12, 0.5, 0.012]));
    anchors.hatches[k] = { z0: h.z0, z1: h.z1, half: hx, topFwd: top(h.z0), topAft: top(h.z1), corners: loop.map(([x, z]) => [x, top(z), z]) };
    stopperBoxes.push({ poly: loop, y: top((h.z0 + h.z1) / 2) });
  }

  // ---- the mast houses (1.8 x 6.2 m; tops 49.8 / 47.3 ft ABL: sheet 2), each with a door on its after face
  anchors.masts = {};
  for (const [name, m] of Object.entries(S.masts)) {
    if (!m || !m.house) continue;
    const [z0, z1] = m.house, hx = S.masts.houseHalf, top = m.houseTop;
    const loop = [[-hx, z0], [hx, z0], [hx, z1], [-hx, z1]];
    G.steel.push(wall(loop, deckFoot, () => top - 0.012, 0.012, { closed: true, seed: 0.3 }));
    G.hdeck.push(slab([[-hx - 0.04, z0 - 0.04], [hx + 0.04, z0 - 0.04], [hx + 0.04, z1 + 0.04], [-hx - 0.04, z1 + 0.04]], top - 0.03, top));
    G.steel.push(rail([[-hx + 0.05, z0 + 0.05], [hx - 0.05, z0 + 0.05], [hx - 0.05, z1 - 0.05], [-hx + 0.05, z1 - 0.05]], () => top, { closed: true, height: 0.9, courses: 2, every: 1.4 }));
    // a door on each face toward the hatches (the lamp room and deck gear lockers: ship.md §5), a rung ladder up its side
    G.door.push(door([1.4, deckAbl(1.4, z1) - 0.0, z1 + 0.002], [0, 1], { h: 1.45, sill: 0.25 }));
    G.door.push(door([-1.4, deckAbl(1.4, z0), z0 - 0.002], [0, -1], { h: 1.45, sill: 0.25 }));
    // (the rung ladder stands on the deck, held off the wall by brackets at its foot and head)
    for (const sx of [-1, 1]) for (const zz of [z0 + 0.35, z0 + 0.75]) {
      G.steel.push(tube([[sx * (hx + 0.16), deckAbl(hx, zz) - 0.03, zz], [sx * (hx + 0.16), top + 0.95, zz]], 0.02, { n: 5 }));
      for (const y of [deckAbl(hx, zz) + 0.4, top - 0.2]) G.steel.push(box([sx * (hx + 0.085), y, zz], [0.17, 0.03, 0.03]));
    }
    for (const sx of [-1, 1]) for (let y = deckAbl(hx, z0) + 0.35; y < top + 0.9; y += 0.3) G.steel.push(tube([[sx * (hx + 0.16), y, z0 + 0.35], [sx * (hx + 0.16), y, z0 + 0.75]], 0.012, { n: 4 }));
    anchors.masts[name] = { step: [0, top, m.z], deck: [0, deckAbl(0, m.z), m.z], houseTop: top, house: { z0, z1, half: hx } };
    houses.push({ name: 'mast house ' + name, poly: loop, top });
  }

  // ---- the bow gun platform (53.2 ft ABL over 3.38-9.66 m from the stem) and the 3"/50's tub (5.1 m, rim 57.2 ft ABL,
  // a flattened white front with the pin-ups: ship.md §6); its rail on the open after part; pillars to the deck
  {
    const p = S.bow.platform, pts = [];
    for (let z = p.z0; z <= p.z1 + 1e-6; z += (p.z1 - p.z0) / 12) pts.push([Math.max(0.3, F.hbRail(z, p.abl) + 0.02), z]);
    const poly = pts.concat(pts.slice().reverse().map(([x, z]) => [-x, z]));
    G.hdeck.push(slab(poly, p.abl - 0.2, p.abl, { seed: 0.15 }));
    houses.push({ name: 'bow platform', poly, top: p.abl, walkable: true });
    const tb = S.bow.tub, r = tb.dia / 2, zc = S.bow.gun3;
    // the tub: a flattened front chord, round sides, open aft (the after 110 degrees)
    const a0 = Math.PI * (35 / 180), a1 = Math.PI * (325 / 180);       // around the front (0 = aft)
    const arc = arcPath(0, zc, r, a1, a0 + Math.PI * 2 - Math.PI * 2, 30).filter(([x, z]) => z > zc - r * 0.86 || false);
    const path = arcPath(0, zc, r, Math.PI * 0.62, Math.PI * 1.38, 26).map(([x, z]) => [x, Math.max(z, zc - r * 0.86)]);
    G.white.push(wall(path.slice().reverse(), () => p.abl - 0.02, () => tb.rim, 0.012, { seed: 0.2 }));
    G.steel.push(wall(arcPath(0, zc, r, Math.PI * 0.32, Math.PI * 0.62, 8).reverse(), () => p.abl - 0.02, () => tb.rim, 0.012));
    G.steel.push(wall(arcPath(0, zc, r, Math.PI * 1.38, Math.PI * 1.68, 8).reverse(), () => p.abl - 0.02, () => tb.rim, 0.012));
    G.steel.push(rail([[-pts[pts.length - 1][0] + 0.05, p.z1 - 0.05], [pts[pts.length - 1][0] - 0.05, p.z1 - 0.05]], () => p.abl, { height: 1.0, courses: 3 }));
    for (const sx of [-1, 1]) G.steel.push(rail(pts.slice(6).map(([x, z]) => [sx * (x - 0.05), z]), () => p.abl, { height: 1.0, courses: 3 }));
    for (const [x, z] of [[-1.2, p.z1 - 0.3], [1.2, p.z1 - 0.3], [0, p.z1 - 0.3]]) G.steel.push(tube([[x, deckAbl(x, z) - 0.03, z], [x, p.abl - 0.2, z]], 0.09, { n: 8 }));
    anchors.gun3 = { ring: [0, p.abl, S.guns.gun3.z], boreAbl: S.guns.gun3.boreAbl };
    anchors.bell = [0, p.abl, S.bow.bell];
    anchors.windlass = [0, deckAbl(0, S.bow.windlass), S.bow.windlass];
    stopperBoxes.push({ poly, y: p.abl });
  }

  // ---- the hawse pipes (ship.md §7: the openings ~1 ft aft of the FP at ~40 ft ABL, hawse plates round them, the bower
  // anchors housed in them: the anchors are B2's) and their deck ends by the windlass (the chain's way down)
  anchors.hawse = [];
  {
    const zH = (1 - 213.65) * FT, hH = 40 * FT;
    for (const sx of [-1, 1]) {
      // the hull's local frame at the opening: its outward normal from the form's finite differences
      const x0 = F.hb(zH, hH), dxdz = (F.hb(zH + 0.05, hH) - F.hb(zH - 0.05, hH)) / 0.1, dxdh = (F.hb(zH, hH + 0.05) - F.hb(zH, hH - 0.05)) / 0.1;
      const N = norm3([sx, -dxdh, -dxdz]), tz = norm3(cross3([0, 1, 0], N)), up = norm3(cross3(N, tz));
      const P0 = [sx * x0, hH, zH];
      const at = (a, b, w) => [P0[0] + tz[0] * a + up[0] * b + N[0] * w, P0[1] + tz[1] * a + up[1] * b + N[1] * w, P0[2] + tz[2] * a + up[2] * b + N[2] * w];
      // the hawse plate: an oval ring 1.15 x 0.9 m, 6 cm proud; the opening a dark oval 0.75 x 0.55 m
      const ringG = (ra, rb, wa, wb, n = 28) => {
        const pos = [], nrm = [], uv = [], idx = [];
        for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2, c = Math.cos(a), si = Math.sin(a); for (const [r, w] of [[ra, wa], [rb, wb]]) { pos.push(...at(c * r[0], si * r[1], w)); nrm.push(...N); uv.push(c * r[0], si * r[1]); } }
        for (let k = 0; k < n; k++) { const a = k * 2, b = a + 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
        const g = new window.THREE.BufferGeometry(); g.setAttribute('position', new window.THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new window.THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new window.THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
        g.setAttribute('aSeed', new window.THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(0.5), 1)); return g;
      };
      G.steel.push(ringG([0.40, 0.30], [0.58, 0.45], 0.06, 0.03));
      G.steel.push(ringG([0.38, 0.28], [0.40, 0.30], 0.0, 0.06));
      G.boot.push(ringG([0.0, 0.0], [0.385, 0.285], 0.012, 0.012));
      // the deck end: a round pipe head by the windlass, the chain's way in
      const dz = S.bow.windlass - 1.6, dx = sx * 1.25, dy = deckAbl(dx, dz);
      G.steel.push(tube([[dx, dy - 0.05, dz], [dx, dy + 0.35, dz]], 0.32, { n: 16 }));
      G.boot.push(slab(arcPath(dx, dz, 0.27, 0, Math.PI * 2, 16).slice(0, -1), dy + 0.3, dy + 0.34, { bottom: false }));
      anchors.hawse.push({ side: sx > 0 ? 'starboard' : 'port', outboard: at(0, 0, 0.02), normal: N, deck: [dx, dy + 0.35, dz] });
    }
    place.hawse = [zH, hH];
  }

  // ---- the midship house, the funnel, the after house and the house's 20 mm tubs (house.js, sheet 4)
  anchors.gun20 = {};
  buildHouses(G, { F, deckAbl, hbTop }, anchors, houses, stopperBoxes);

  // ---- the 20 mm tubs: circular, ~2.9 m across, walls 1.1 m (sheets 2, 4); on the house top, on the after platform's
  // forward corners, and on the two raised pillboxes forward (tan plastic armour: ship.md §6)
  for (const g of S.guns.gun20) {
    if (!g.pillbox) continue;                       // (the house's and the after house's tubs: house.js)
    const r = 1.45;
    let floor = g.floorAbl;
    if (g.pillbox) {
      // the pillbox: a steel box at the deck edge, its top ~3.4 m above the deck, the tub on it
      const [z0, z1] = g.pillbox, sx = Math.sign(g.x), xo = hbTop((z0 + z1) / 2) - 0.08, xi = xo - 2.9;
      const lp = sx > 0 ? [[xi, z0], [xo, z0], [xo, z1], [xi, z1]] : [[-xo, z0], [-xi, z0], [-xi, z1], [-xo, z1]];
      const topY = deckAbl(xi, (z0 + z1) / 2) + 3.4;
      G.armour.push(wall(lp, deckFoot, () => topY - 0.15, 0.012, { closed: true, seed: 0.45 }));
      G.hdeck.push(slab(lp, topY - 0.15, topY));
      floor = topY;
      g._x = sx * (xo - 1.45);
      houses.push({ name: 'pillbox ' + g.name, poly: lp, top: topY });
    }
    const x = g._x ?? g.x, z = g.z, base = floor;
    G.steel.push(wall(arcPath(x, z, r, 0, Math.PI * 2, 28).reverse(), () => base - 0.05, () => base + 1.1, 0.012, { closed: false, seed: 0.55 }));
    G.steel.push(slab(arcPath(x, z, r, 0, Math.PI * 2, 28).slice(0, -1), base - 0.08, base, { bottom: true }));
    anchors.gun20[g.name] = { ring: [x, base, z], rim: base + 1.1 };
  }

  // ---- the bulwark's cap rail (a 6 x 3.5 in bulb angle: sheet 14) and its stays inside every ~1.6 m, the pipe rail round
  // the counter abaft 427 ft (sheet 2)
  {
    for (const sx of [-1, 1]) {
      const cap = [];
      let z0 = -66.5; for (let k = 0; k < 8; k++) z0 = F.zFwd(F.rail(z0));
      for (let z = z0; z <= F.bulwarkAftZ + 1e-6; z += 0.5) cap.push([sx * (F.hbRail(z, F.rail(z)) - 0.06), z]);
      const path = sx > 0 ? cap : cap.slice().reverse();
      G.steel.push(wall(path.map(([x, z]) => [x + sx * 0.075, z]), (x, z) => F.rail(z) - 0.04, (x, z) => F.rail(z) + 0.01, 0.16, { seed: 0.65 }));
      for (let z = -52; z < F.bulwarkAftZ - 0.5; z += 1.6) {
        const xo = F.hbRail(z, F.side(z)) - 0.012, y0 = deckAbl(xo, z), y1 = F.rail(z) - 0.05;
        // a triangular plate stay: from the cap down to the deck, 0.45 m in at its foot
        const pts = [[xo, y1], [xo, y0], [xo - 0.45, y0], [xo - 0.08, y1]];
        const g = slabYZ(pts.map(([x, y]) => [sx * x, y]), z, 0.012);
        G.steel.push(g);
      }
      // the counter's rail: three courses on stanchions from the bulwark's end round the stern
      const cr = [];
      for (let z = F.bulwarkAftZ; z <= S.sternZ - 0.05; z += 0.25) cr.push([Math.max(0.02, hbTop(z) - 0.12), z]);
      const loop = cr.map(([x, z]) => [sx * x, z]);
      G.steel.push(rail(sx > 0 ? loop : loop.slice().reverse(), (x, z) => deckAbl(x, z), { height: 1.05, courses: 3, every: 1.2 }));
    }
  }
  return { G, anchors, houses, deckAbl, hbTop, stopperBoxes };
}

const norm3 = v => { const l = Math.hypot(...v) || 1; return v.map(q => q / l); };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// a flat plate in the x-y plane at z (a bulwark stay): its outline [[x, y], ...], th thick along z
function slabYZ(pts, z, th) {
  const T = window.THREE;
  const shape = new T.Shape(pts.map(([x, y]) => new T.Vector2(x, y)));
  const g = new T.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false });
  g.translate(0, 0, z - th / 2);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) + p.getZ(i), p.getY(i));
  const n = p.count; g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(n).fill(0.5), 1));
  return g;
}
