// liberty/src/pier/pier39.js: Pier 39 and its marinas (B4): the retail pier (1978) in its weathered-timber "seaport"
// style (photo 15: two-storey shingled and board-sided buildings along a central walkway, upper decks, shop windows,
// signs and string lights at night), the carousel, the Aquarium of the Bay's blue roofs, the east marina's six dock
// rows behind the long concrete breakwater (photo 02: vertical panels between piles, a cap, ~2 m above the water), the
// west marina, K-Dock and its sea lions (photos 16, 17; site.md §6: 300-600 in October, heard more than seen), Pier 41's
// trestle and breakwater, and the Ferris wheel (46 m, site.md; photo 35: an LED ring). Outlines traced on z19/z18
// (site.js). This is the stage's backdrop seen from the apron across the ship.
import { Bins } from 'scene3d/kit/arch/kit.js';
import { rng } from 'scene3d/util.js';
import { P39, MARINA, WEST } from './site.js';
import { pierMat } from './mats.js';
import { box, beam, merge, cylinder, latheAt, flatPoly, polySides, quads, orient } from './geo.js';
import { lin } from 'scene3d/util.js';

const T = window.THREE;
const DECK = 2.95;
const FLOAT = { loose: 'floating docks ride the tide' };

export function p39Mats(world, M) {
  const C = hex => new T.Vector3(...lin(hex));
  const siding = pierMat(world, {
    name: 'pier39 siding', lamps: false,
    uniforms: { uA: { value: C('#8b8073') }, uB: { value: C('#6f665c') }, uT: { value: C('#e2ddd2') }, uW: { value: C('#ffc879') }, uS: { value: C('#f05a3c') }, uS2: { value: C('#3cc8f0') } },
    glsl: 'uniform vec3 uA, uB, uT, uW, uS, uS2;',
    body: /* glsl */`
      if (s.N.y > 0.6) { s.albedo = vec3(0.24, 0.25, 0.27); s.rough = 0.9; return; }
      float h = uv.y, u = uv.x, b = sd;
      // weathered boards (vertical in some buildings, shingles in others: flat-edged courses)
      vec3 c = mix(uB, uA, step(0.5, hash11(b * 9.0)));
      float shing = step(0.5, hash11(b * 23.0));
      c *= 1.0 - 0.12 * mix(lines1(u, 0.15, 0.012), lines1(h, 0.2, 0.012), shing);
      // ground storey: shop fronts (glazing between posts) with a trim band; upper storey: windows in pairs
      float g = step(0.4, h) * step(h, 3.4);
      float bay = 4.2, fx = fract(u / bay);
      float shop = g * step(0.12, fx) * step(fx, 0.88);
      float up = step(4.9, h) * step(h, 6.6) * (step(0.18, fx) * step(fx, 0.42) + step(0.58, fx) * step(fx, 0.82));
      float win = max(shop, up);
      c = mix(c, uT, (1.0 - step(0.06, abs(h - 3.7))) * 0.9);                  // the trim band between the storeys
      c = mix(c, vec3(0.14, 0.17, 0.19), win);
      s.albedo = c; s.rough = 0.85; s.spec = 0.3 * win;
      // night: the shops lit warm, most of them; the upper windows less; signs above the shop fronts (neon, two hues)
      float n = smoothstep(0.1, 0.6, uNight);
      vec2 id = vec2(floor(u / bay), floor(h / 3.0));
      s.emissive += uW * shop * step(hash12(id + b * 7.0), 0.82) * n * 1.4;
      s.emissive += uW * up * step(hash12(id + b * 3.0), 0.35) * n * 1.0;
      float sign = step(3.75, h) * step(h, 4.55) * step(0.25, fx) * step(fx, 0.75) * step(hash12(id + b), 0.45);
      s.emissive += mix(uS, uS2, step(0.5, hash12(id + 9.0 + b))) * sign * n * 2.2;
    `,
  });
  const roof = M.flat('pier39 roof', '#41454c', { lamps: false });
  const plank = pierMat(world, {
    name: 'pier39 deck', lamps: false, uniforms: { uA: { value: C('#8a7e70') }, uB: { value: C('#6d6358') } }, glsl: 'uniform vec3 uA, uB;',
    body: 'vec3 c = mix(uB, uA, step(0.0, vnoise(vec2(P.x * 0.4, P.z * 4.0)))); c *= 1.0 - 0.25 * lines1(P.z, 0.15, 0.012); s.albedo = c; s.rough = 0.9;',
  });
  const hull = pierMat(world, {
    name: 'boat hulls', lamps: false, uniforms: { uA: { value: C('#ecebe6') }, uB: { value: C('#2c3a4a') } }, glsl: 'uniform vec3 uA, uB;',
    body: /* glsl */`
      vec3 c = uA;
      // a coloured stripe on some (navy, green, red), the boot-top dark at the waterline
      float bh = hash12(floor(P.xz / 4.6));
      float stripe = step(0.6, bh) * (1.0 - step(0.08, abs(P.y - 0.62)));
      c = mix(c, uB * (0.7 + fract(bh * 3.0)), stripe);
      c = mix(c, vec3(0.15), 1.0 - step(0.12, P.y));
      s.albedo = c; s.rough = 0.4; s.spec = 0.4;
      // cabin windows lit on a few at night (liveaboards)
      float n = smoothstep(0.2, 0.7, uNight);
      // the cabin's windows: small rectangles in a row (0.5 m on a 0.8 m pitch), lit on one boat in six (a liveaboard)
      float wrow = step(1.5, P.y) * step(P.y, 1.78) * step(abs(s.N.y), 0.3) * step(0.38, fract((P.x + P.z) * 1.25));
      s.albedo = mix(s.albedo, vec3(0.08, 0.1, 0.12), wrow);
      s.emissive += vec3(1.0, 0.75, 0.42) * wrow * step(0.83, hash12(floor(P.xz / 4.6) + 0.37)) * n * 1.3;
    `,
  });
  const concrete = M.flat('breakwater concrete', '#9c9a92', { lamps: false });
  return { siding, roof, plank, hull, concrete };
}

function inPoly(px, pz, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
// a box rotated about y by 'a' (radians), centred at c
function rbox(c, s, a, seed = 0.5) { const g = box([0, 0, 0], s, { seed }); g.rotateY(a); g.translate(c[0], c[1], c[2]); return g; }
// a gable roof over a rectangle (centre, length along its axis, width, eave height, rise), its axis at angle a
function gable(c, L, W, eave, rise, a, seed) {
  const hw = W / 2 + 0.4, hl = L / 2 + 0.4;
  const P = (u, v, y) => [c[0] + Math.cos(a) * u + Math.sin(a) * v, y, c[2] - Math.sin(a) * u + Math.cos(a) * v];
  const q = [
    orient([P(-hl, -hw, eave), P(hl, -hw, eave), P(hl, 0, eave + rise), P(-hl, 0, eave + rise)], [[0, 0], [L, 0], [L, hw], [0, hw]], [0, 1, 0]),
    orient([P(-hl, hw, eave), P(hl, hw, eave), P(hl, 0, eave + rise), P(-hl, 0, eave + rise)], [[0, 0], [L, 0], [L, hw], [0, hw]], [0, 1, 0]),
    orient([P(-L / 2, -W / 2, eave), P(-L / 2, W / 2, eave), P(-L / 2, 0, eave + rise), P(-L / 2, 0, eave + rise)], [[0, 0], [W, 0], [W / 2, rise], [W / 2, rise]], [-Math.cos(a), 0, Math.sin(a)]),
    orient([P(L / 2, -W / 2, eave), P(L / 2, W / 2, eave), P(L / 2, 0, eave + rise), P(L / 2, 0, eave + rise)], [[0, 0], [W, 0], [W / 2, rise], [W / 2, rise]], [Math.cos(a), 0, -Math.sin(a)]),
  ];
  return quads(q, seed);
}

export function buildPier39(world, M, out) {
  const r = rng(3901);
  const PM = p39Mats(world, M);
  const B = new Bins(world, 'pier39');
  // ---- the deck on piles
  const ol = P39.outline;
  B.add(PM.plank, flatPoly(ol, DECK, { seed: 0.3 }), 'deck');
  B.add(M.pile, flatPoly(ol, DECK - 0.35, { down: true, seed: 0.3 }), 'deck');
  B.add(M.pile, polySides(ol, DECK - 1.0, DECK, 0.3), 'deck');
  // piles under it, a 4 m grid inside the outline
  const xs = ol.map(p => p[0]), zs = ol.map(p => p[1]);
  const piles = [];
  for (let x = Math.min(...xs) + 1; x < Math.max(...xs); x += 4.2) for (let z = Math.min(...zs) + 1; z < Math.max(...zs); z += 4.2) if (inPoly(x, z, ol)) piles.push([x, z]);
  const pg = cylinder([0, -6, 0], [0, DECK - 0.35, 0], 0.22, 8);
  const pm = world.mesh(pg, M.pile, { count: piles.length, name: 'pier39:piles' });
  piles.forEach(([x, z], i) => pm.setMatrixAt(i, new T.Matrix4().makeTranslation(x, 0, z))); pm.instanceMatrix.needsUpdate = true; pm.computeBoundingSphere();
  // the perimeter railing
  for (let i = 0; i < ol.length; i++) {
    const a = ol[i], b = ol[(i + 1) % ol.length];
    B.add(M.timber, beam([a[0], DECK + 1.05, a[1]], [b[0], DECK + 1.05, b[1]], 0.12, 0.08, { seed: r() }), 'railing');
  }

  // ---- the buildings: two rows along the pier's walkway (axis from the root to the head), gabled two-storey blocks
  const A = [-262, -10], Bp = [-318, -262];
  const ax = [Bp[0] - A[0], Bp[1] - A[1]], AL = Math.hypot(...ax), au = [ax[0] / AL, ax[1] / AL], an = [-au[1], au[0]];
  const ang = Math.atan2(-au[1], au[0]);
  let nb = 0;
  for (const side of [-1, 1]) {
    let t = 6;
    while (t < AL - 6) {
      const L = 10 + r() * 14;
      // the widest block (16 m down to 7) whose four corners stand on the deck, 5 m off the walkway's axis
      let placed = false;
      for (let Wd = 16; Wd >= 7 && !placed; Wd -= 1.5) {
        const off = 5 + Wd / 2;
        const cx = A[0] + au[0] * (t + L / 2) + an[0] * side * off, cz = A[1] + au[1] * (t + L / 2) + an[1] * side * off;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [cx + au[0] * i * L / 2 + an[0] * j * Wd / 2, cz + au[1] * i * L / 2 + an[1] * j * Wd / 2]);
        if (!corners.every(([x, z]) => inPoly(x, z, ol))) continue;
        placed = true;
        const st = r() < 0.75 ? 2 : 1, eave = DECK + st * 3.6 + 0.4, seed = r();
        const g = rbox([cx, (DECK + eave) / 2, cz], [L, eave - DECK, Wd], ang, seed);
        { const uvA = g.attributes.uv, pA = g.attributes.position; for (let i = 0; i < uvA.count; i++) uvA.setY(i, pA.getY(i) - DECK); }
        B.add(PM.siding, g, 'buildings');
        // the roof: a gable along or across the block; a cupola on some
        const along = r() < 0.6;
        B.add(PM.roof, gable([cx, 0, cz], along ? L : Wd, along ? Wd : L, eave, (along ? Wd : L) * 0.32, along ? ang : ang + Math.PI / 2, seed), 'roofs');
        const rise = (along ? Wd : L) * 0.32;
        if (r() < 0.2) B.add(PM.siding, rbox([cx, eave + rise + 0.9, cz], [3.2, 2.6, 3.2], ang, seed), 'cupolas');
        // an upper-level deck on the walkway side
        if (st === 2 && r() < 0.5) B.add(PM.plank, rbox([cx - an[0] * side * (Wd / 2 + 1.2), DECK + 3.9, cz - an[1] * side * (Wd / 2 + 1.2)], [L, 0.2, 2.4], ang, seed), 'balconies');
        nb++;
      }
      t += L + (placed ? 1.0 + r() * 2.5 : 2.0);
    }
  }
  // the head: a big restaurant block on the plaza and the carousel (a round two-storey drum with a conical roof)
  B.add(PM.siding, rbox([-318, DECK + 4.6, -300], [30, 9.2, 16], ang, 0.4), 'buildings');
  B.add(PM.roof, gable([-318, 0, -300], 30, 16, DECK + 9.2, 5, ang, 0.4), 'roofs');
  const [kx, kz] = P39.carousel;
  B.add(PM.siding, latheAt([[9.5, 0], [9.5, 7.0], [10.5, 7.2], [0.6, 12.0], [0, 12.2]], 24, kx, DECK, kz, 0.6), 'carousel');
  // the aquarium (blue roofs)
  const [[qa, qb], [qc, qd]] = P39.aquarium;
  B.add(PM.siding, box([(qa + qc) / 2, DECK + 5, (qb + qd) / 2], [qc - qa, 10, qd - qb], { seed: 0.9 }), 'aquarium');
  B.add(M.flat('aquarium roof', '#3d5ea8', { lamps: false }), box([(qa + qc) / 2, DECK + 10.2, (qb + qd) / 2], [qc - qa + 0.6, 0.4, qd - qb + 0.6]), 'aquarium');
  // string lights along the walkway (emissive bulbs every 1.2 m on a slack line), lamp posts every 18 m
  const bulbs = [], wires = [], posts = [];
  const span = 14;
  for (const sd of [-1, 1]) {
    const at = (t, y) => [A[0] + au[0] * t + an[0] * sd * 5.0, y, A[1] + au[1] * t + an[1] * sd * 5.0];
    for (let t0 = 10; t0 + span < AL - 6; t0 += span) {
      posts.push(cylinder(at(t0, DECK), at(t0, DECK + 6.4), 0.08, 6));
      const n = 12, sagAt = u => DECK + 6.2 - 0.6 * Math.sin(Math.PI * u);
      for (let k = 0; k < n; k++) {
        const u0 = k / n, u1 = (k + 1) / n;
        wires.push(beam(at(t0 + u0 * span, sagAt(u0)), at(t0 + u1 * span, sagAt(u1)), 0.02, 0.02));
        const uc = (k + 0.5) / n; const p = at(t0 + uc * span, sagAt(uc) - 0.06);
        bulbs.push(box(p, [0.12, 0.12, 0.12]));
      }
    }
  }
  B.add(M.iron, merge(posts.concat(wires)), 'string light posts');
  world.mesh(merge(bulbs), M.flat('string lights', '#ffe0a0', { lamps: false, emit: 4.0, nightOnly: true, lines: 0 }), { name: 'pier39:string lights' });

  // ---- the east marina: the breakwaters (photo 02), the dock rows with their fingers, the boats
  const bw = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    B.add(PM.concrete, beam([a[0], 1.4, a[1]], [b[0], 1.4, b[1]], 1.6, 0.35), 'breakwaters');            // the cap
    B.add(M.pile, beam([a[0], -0.6, a[1]], [b[0], -0.6, b[1]], 1.0, 3.6), 'breakwaters');                // the wall (growth bands by height)
    for (let s = 0; s < L; s += 3.0) B.add(M.pile, box([a[0] + u[0] * s, -0.4, a[1] + u[1] * s], [0.6, 3.8, 0.6]), 'breakwaters');   // the piles' ribs
  };
  bw(...MARINA.north); bw(...MARINA.east);
  const fingers = [], boats = [];
  const slip = (x, z, dirz) => { if (r() < 0.78) boats.push([x, z + dirz * MARINA.finger * 0.5, dirz, r()]); };
  for (const [z, xa, xb] of MARINA.rows) {
    B.add(PM.plank, box([(xa + xb) / 2, 0.45, z], [xb - xa, 0.35, 2.4]), 'docks', FLOAT);
    for (let x = xa + 2; x < xb - 1; x += MARINA.pitch * 2) {
      for (const dz of [-1, 1]) {
        fingers.push(box([x, 0.42, z + dz * (1.2 + MARINA.finger / 2)], [1.0, 0.3, MARINA.finger]));
        slip(x - MARINA.pitch * 0.5, z + dz * 1.2, dz); slip(x + MARINA.pitch * 0.5, z + dz * 1.2, dz);
      }
    }
  }
  B.add(PM.plank, merge(fingers.splice(0)), 'docks', FLOAT);
  // the west marina's rows (z18: two oblique rows off Pier 39's west side, fingers both sides) and K-Dock's floats
  for (const [a, b] of WEST.rows) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-u[1], u[0]], yaw = Math.atan2(-u[1], u[0]);
    B.add(PM.plank, beam([a[0], 0.45, a[1]], [b[0], 0.45, b[1]], 2.4, 0.35), 'docks', FLOAT);
    for (let t = 2; t < L - 1; t += MARINA.pitch * 2) {
      for (const sg of [-1, 1]) {
        const fx = a[0] + u[0] * t + n[0] * sg * (1.2 + MARINA.finger / 2), fz = a[1] + u[1] * t + n[1] * sg * (1.2 + MARINA.finger / 2);
        fingers.push(beam([fx - n[0] * sg * MARINA.finger / 2, 0.42, fz - n[1] * sg * MARINA.finger / 2], [fx + n[0] * sg * MARINA.finger / 2, 0.42, fz + n[1] * sg * MARINA.finger / 2], 1.0, 0.3));
        for (const dt of [-0.5, 0.5]) if (r() < 0.75) {
          const bx = a[0] + u[0] * (t + dt * MARINA.pitch) + n[0] * sg * (1.2 + MARINA.finger * 0.5), bz = a[1] + u[1] * (t + dt * MARINA.pitch) + n[1] * sg * (1.2 + MARINA.finger * 0.5);
          boats.push([bx, bz, 0, r(), yaw + (sg > 0 ? -Math.PI / 2 : Math.PI / 2) + Math.PI / 2 * 0 , n, sg]);
        }
      }
    }
  }
  B.add(PM.plank, merge(fingers.splice(0)), 'docks', FLOAT);
  const [[k0, k1], [k2, k3]] = WEST.kdock;
  for (let x = k0; x < k2; x += 6.5) for (let z = k1; z < k3; z += 6.5) {
    B.add(PM.plank, box([x + 3, 0.35, z + 3], [5.8, 0.4, 5.8]), 'kdock', FLOAT);
  }
  const lions = [];
  for (let i = 0; i < 140; i++) {
    // (on a float: a 5.8 m float on a 6.5 m pitch)
    const fx = k0 + 6.5 * Math.floor(r() * Math.floor((k2 - k0) / 6.5)), fz = k1 + 6.5 * Math.floor(r() * Math.floor((k3 - k1) / 6.5));
    const x = fx + 0.9 + r() * 4.2, z = fz + 0.9 + r() * 4.2;
    const L = 1.6 + r() * 0.6, a = r() * 6.28;
    const g = new T.SphereGeometry(0.5, 8, 5); g.scale(L, 0.45, 0.62); g.rotateY(a); g.translate(x, 0.75, z);
    g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(g.attributes.position.count).fill(r()), 1));
    lions.push(g);
  }
  const lionMesh = world.mesh(merge(lions), M.flat('sea lions', '#5b4130', { lamps: false }), { name: 'pier39:sea lions' });
  world.relate('loose', { mesh: lionMesh, why: 'on K-Dock\'s floats, which float' });
  // Pier 41's trestle and its breakwater
  B.add(PM.plank, beam([-500, DECK, -240], [-436, DECK, -110], 7, 0.5), 'pier41');
  for (let s = 0; s < 1; s += 0.03) B.add(M.pile, box([-500 + 64 * s, -1, -240 + 130 * s], [0.5, 7.5, 0.5]), 'pier41');
  B.add(PM.concrete, beam([-500, 1.4, -240], [-392, 1.4, -305], 1.6, 0.35), 'pier41');
  B.add(M.pile, beam([-500, -0.6, -240], [-392, -0.6, -305], 1.0, 3.6), 'pier41');

  // ---- the boats: hulls (a tapered lathe laid flat), cabins, masts on the sailboats (60 %)
  // a hull: the plan (a pointed bow, a transom) extruded from below the waterline to the deck, a cabin on it; unit
  // length along +x, unit beam, unit freeboard (scaled per boat)
  const hullG = (() => {
    const plan = [[0, -0.42], [0.62, -0.5], [0.86, -0.36], [1.0, 0], [0.86, 0.36], [0.62, 0.5], [0, 0.42]];
    const deck = flatPoly(plan, 0.55, { seed: 0.5 });
    const sides = polySides(plan, -0.35, 0.55, 0.5);
    const cab = box([0.48, 0.78, 0], [0.34, 0.46, 0.6], { seed: 0.5 });
    return merge([deck, sides, cab]);
  })();
  const mastG = cylinder([0, 0, 0], [0, 1, 0], 0.5, 5);
  const hm = world.mesh(hullG, PM.hull, { count: boats.length, name: 'marina:hulls', loose: 'boats float' });
  const nm = boats.filter(b => b[3] < 0.6).length, nl = boats.filter(b => b[3] < 0.6 && (b[3] * 97.3) % 1 < 0.22).length;
  const mm = world.mesh(mastG, M.flat('masts', '#d8d8d4', { lamps: false, lines: 0 }), { count: nm, name: 'marina:masts', loose: 'on the boats' });
  const am = world.mesh(new T.SphereGeometry(0.12, 6, 4), M.flat('anchor lights', '#fffbe8', { lamps: false, emit: 8.0, nightOnly: true, lines: 0 }), { count: nl, name: 'marina:anchor lights', loose: 'on the masts' });
  // the boats ride the marina's small chop (behind the breakwaters: a heave of +-3 cm, a roll of +-1 deg on a 3-4 s
  // period, each boat its own phase; the masts swing with the roll, the classic marina tick): a pure function of t
  const B4 = [];
  boats.forEach(([x, z, dz, k, yaw, nn, sg]) => {
    const len = 8 + k * 7, beamW = len * 0.32, sail = k < 0.6;
    // (the hull's bow is its local +x: along the finger, bow out toward the open end)
    const heading = nn ? Math.atan2(-nn[1] * sg, nn[0] * sg) : (dz > 0 ? -Math.PI / 2 : Math.PI / 2);
    const cx = nn ? x - nn[0] * sg * len / 2 : x, cz = nn ? z - nn[1] * sg * len / 2 : z - dz * len / 2;
    B4.push({ cx, cz, heading, len, beamW, sail, mx: x, mz: nn ? z : z - dz * len * 0.1, h: len * 1.35, lit: sail && (k * 97.3) % 1 < 0.22,
      ph: (x * 0.37 + z * 0.73) % 6.283, w1: 2 * Math.PI / (2.6 + 0.9 * ((k * 13.1) % 1)), w2: 2 * Math.PI / (3.2 + 1.0 * ((k * 7.7) % 1)) });
  });
  const yUp = new T.Vector3(0, 1, 0), qBoat = new T.Quaternion(), qRoll = new T.Quaternion(), bAxis = new T.Vector3(), mBoat = new T.Matrix4(), pBoat = new T.Vector3(), sBoat = new T.Vector3(), uBoat = new T.Vector3();
  const place = t => {
    let im = 0, il = 0;
    B4.forEach((b, i) => {
      const heave = 0.03 * Math.sin(b.w1 * t + b.ph), roll = 0.017 * Math.sin(b.w2 * t + b.ph * 1.7);
      bAxis.set(Math.cos(b.heading), 0, -Math.sin(b.heading));                         // the boat's long axis
      qRoll.setFromAxisAngle(bAxis, roll); qBoat.setFromAxisAngle(yUp, b.heading).premultiply(qRoll);
      hm.setMatrixAt(i, mBoat.compose(pBoat.set(b.cx, heave, b.cz), qBoat, sBoat.set(b.len, b.sail ? 1.6 : 2.4, b.beamW)));
      if (b.sail) {
        mm.setMatrixAt(im++, mBoat.compose(pBoat.set(b.mx, 0.8 + heave, b.mz), qRoll, sBoat.set(0.14, b.h, 0.14)));
        if (b.lit) { uBoat.set(0, b.h, 0).applyQuaternion(qRoll); am.setMatrixAt(il++, mBoat.makeTranslation(b.mx + uBoat.x, 0.8 + heave + uBoat.y, b.mz + uBoat.z)); }
      }
    });
    hm.instanceMatrix.needsUpdate = true; mm.instanceMatrix.needsUpdate = true; am.instanceMatrix.needsUpdate = true;
  };
  place(0);
  [hm, mm, am].forEach(m => m.computeBoundingSphere());      // (the bounds hold: a few cm of motion)
  world.onFrame(t => place(t));

  // ---- the Ferris wheel (46 m: site.md; photo 35): rim, spokes, gondolas, A-frame legs; an LED ring with a chase at
  // night; it turns once in 12 minutes
  const wheel = buildWheel(world, M, r);
  const meshes = B.flush();
  out.pier39 = { buildings: nb, boats: boats.length, masts: nm, piles: piles.length, sealions: lions.length, tri: B.tris, wheel, meshes };
  return out.pier39;
}

function buildWheel(world, M, r) {
  const [wx, wz] = WEST.wheel, R = 21.0, hub = DECK + 1.0 + R + 2.0;
  const yaw = Math.atan2(-(-235 + 40), -(-405 + 577.5));       // its face toward K-Dock (photo 17 sees it face-on from there)
  const g = new T.Group(); g.position.set(wx, hub, wz); g.rotation.y = yaw;
  world.add(g);
  const mat = M.flat('wheel steel', '#e8e6e2', { lamps: false });
  const parts = [];
  // the rim: two rings of 48 segments, 1.2 m apart (its depth)
  for (const zz of [-0.6, 0.6]) for (let i = 0; i < 48; i++) {
    const a0 = i / 48 * Math.PI * 2, a1 = (i + 1) / 48 * Math.PI * 2;
    parts.push(beam([R * Math.cos(a0), R * Math.sin(a0), zz], [R * Math.cos(a1), R * Math.sin(a1), zz], 0.3, 0.3));
  }
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; parts.push(beam([0, 0, (i % 2 ? 0.6 : -0.6)], [R * Math.cos(a), R * Math.sin(a), (i % 2 ? -0.6 : 0.6)], 0.08, 0.08)); }
  parts.push(cylinder([0, 0, -1.2], [0, 0, 1.2], 1.1, 16));
  const rim = new T.Mesh(merge(parts)); world.add(rim, { mats: mat });
  rim.userData.loose = 'the wheel turns on its hub'; g.add(rim);
  // the gondolas (36) hang level as it turns
  const gond = world.mesh(box([0, -1.2, 0], [2.0, 2.4, 2.2]), M.flat('gondolas', '#cfd4d8', { lamps: false }), { count: 36, name: 'pier39:gondolas', frustum: false, loose: 'hung from the turning rim (itself loose on its hub)' });
  g.add(gond);
  // the legs: two A-frames to the deck
  const legs = new T.Mesh(merge([beam([-9, -hub + DECK, -4], [0, 0, -1.5], 0.7, 0.7), beam([9, -hub + DECK, -4], [0, 0, -1.5], 0.7, 0.7), beam([-9, -hub + DECK, 4], [0, 0, 1.5], 0.7, 0.7), beam([9, -hub + DECK, 4], [0, 0, 1.5], 0.7, 0.7)]));
  world.add(legs, { mats: mat }); g.add(legs);
  // the LED ring: a ring of quads just outside the rim, coloured by a chase pattern in its shader
  const ringMat = world.mat({
    name: 'wheel LEDs', lines: 0, uniforms: {},
    varyings: 'varying float vA;', vertex: 'attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vA = uv.x; }',
    surface: /* glsl */`void smain(inout Surface s, vec3 P, vec3 V) {
      float n = smoothstep(0.15, 0.6, uNight);
      float k = fract(vA * 6.0 - uTime * 0.05);
      vec3 c = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + vA * 2.0 + uTime * 0.02));
      s.albedo = vec3(0.6); s.emissive = mix(vec3(0.9), c, 0.8) * (0.6 + 0.4 * step(0.5, k)) * n * 6.0;
    }`,
  });
  const rp = [], ruv = [], ri = [];
  // the LED band: 0.6 m round the rim's outer edge, on both faces (photo 35: the ring reads as a bright hoop at night)
  for (const zz of [-0.72, 0.72]) {
    const base = rp.length / 3;
    for (let i = 0; i <= 192; i++) {
      const a = i / 192 * Math.PI * 2;
      for (const rr of [R - 0.05, R + 0.55]) { rp.push(rr * Math.cos(a), rr * Math.sin(a), zz); ruv.push(i / 192, 0); }
      if (i < 192) { const b = base + i * 2; ri.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
  }
  const rg = new T.BufferGeometry(); rg.setAttribute('position', new T.Float32BufferAttribute(rp, 3)); rg.setAttribute('uv', new T.Float32BufferAttribute(ruv, 2));
  rg.setAttribute('normal', new T.Float32BufferAttribute(new Float32Array(rp.length).map((_, i) => (i % 3 === 2 ? (rp[i] < 0 ? -1 : 1) : 0)), 3));
  rg.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(rp.length / 3).fill(0.5), 1)); rg.setIndex(ri);
  const ring = new T.Mesh(rg); world.add(ring, { mats: ringMat, cast: false }); ring.material.side = T.DoubleSide; rim.add(ring);
  ring.userData.loose = 'the LED band on the turning rim (itself loose on its hub)';
  const PERIOD = 720;
  // the gondolas hang from their pivots on the rim, level as it turns (placed at build too, so a measure before the
  // first frame finds them on the rim)
  const turn = t => {
    const a = (t / PERIOD) * Math.PI * 2;
    rim.rotation.z = -a;
    for (let i = 0; i < 36; i++) { const b = i / 36 * Math.PI * 2 - a; gond.setMatrixAt(i, new T.Matrix4().makeTranslation(R * Math.cos(b), R * Math.sin(b), 0)); }
    gond.instanceMatrix.needsUpdate = true;
  };
  turn(0); gond.computeBoundingSphere();
  world.onFrame(turn);
  return { at: [wx, wz], hub: +hub.toFixed(1), R };
}
