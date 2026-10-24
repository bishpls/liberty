// liberty/src/pier/trees.js: trees (B4), drawn the way anime draws far foliage: a crown of a few lumpy masses in two
// or three flat greens with a lit top and a dark underside, on a dark trunk (style.md §3's "detail by shape, not
// texture"). Pioneer Park's Monterey cypress and eucalyptus round Coit Tower (photo 12: #1b241e / #454e42 / the lit
// #687e83 tops), the east slope's gardens, the street trees, and the Embarcadero's Canary Island date palms (photo 41).
import { rng, hash2 } from 'scene3d/util.js';
import { pierMat } from './mats.js';
import { PARKS } from './site.js';
import { merge, box, cylinder, latheAt } from './geo.js';
import { lin } from 'scene3d/util.js';

const T = window.THREE;

// one crown: a cluster of displaced icospheres (lumps), unit height, its base at y 0
function crownGeo(seed, lumps = 7, detail = 1) {
  const r = rng(seed), parts = [];
  for (let i = 0; i < lumps; i++) {
    const g = new T.IcosahedronGeometry(1, detail);
    const a = r() * 6.283, d = i === 0 ? 0 : 0.35 + 0.3 * r(), y = 0.45 + (i === 0 ? 0.15 : r() * 0.45);
    const s = i === 0 ? 0.62 : 0.32 + 0.22 * r();
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), yy = p.getY(k), z = p.getZ(k);
      const n = 1 + 0.12 * Math.sin(x * 5 + i) * Math.sin(z * 4 + i * 2);
      p.setXYZ(k, Math.cos(a) * d + x * s * n, y + yy * s * 0.8 * n, Math.sin(a) * d + z * s * n);
    }
    g.computeVertexNormals();
    const ng = g; ng.deleteAttribute("uv");
    const uv = new Float32Array(ng.attributes.position.count * 2); ng.setAttribute('uv', new T.BufferAttribute(uv, 2));
    ng.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(ng.attributes.position.count).fill(0.5), 1));
    parts.push(ng);
  }
  return merge(parts);
}

export function treeMats(world) {
  const foliage = pierMat(world, {
    name: 'foliage', lamps: false, lines: 1,
    uniforms: { uDark: { value: new T.Vector3(...lin('#18241c')) }, uMid: { value: new T.Vector3(...lin('#2f4030')) }, uTop: { value: new T.Vector3(...lin('#56694f')) } },
    glsl: 'uniform vec3 uDark, uMid, uTop;',
    body: /* glsl */`
      // three flat greens by the facing (the top lit by the sky, the underside dark), broken by a leaf-mass noise
      float up = s.N.y + 0.35 * vnoise(P.xz * 1.7 + P.y * 1.3);
      vec3 c = up > 0.45 ? uTop : (up > -0.15 ? uMid : uDark);
      s.albedo = c * (0.9 + 0.2 * fract(sd * 13.7)); s.rough = 0.95; s.wrap = 0.35;
    `,
  });
  const bark = pierMat(world, { name: 'bark', lamps: false, uniforms: { uC: { value: new T.Vector3(...lin('#3a302a')) } }, glsl: 'uniform vec3 uC;', body: 's.albedo = uC; s.rough = 0.9;' });
  const frond = pierMat(world, {
    name: 'palm frond', lamps: false, double: true,
    uniforms: { uA: { value: new T.Vector3(...lin('#4f6a35')) }, uB: { value: new T.Vector3(...lin('#2e4224')) } }, glsl: 'uniform vec3 uA, uB;',
    body: 's.albedo = mix(uB, uA, step(0.0, s.N.y)); s.rough = 0.9; s.wrap = 0.4;',
  });
  return { foliage, bark, frond };
}

function inPoly(px, pz, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}

// trees: the parks filled (cypress and eucalyptus on Telegraph Hill: tall, dense), street trees on the grid's
// sidewalks, the Embarcadero's far sidewalk's row; palms on the Embarcadero's median (photo 07: in front of the
// bulkheads) and its promenade
export function buildTrees(world, landAt, out, { avoid = [], blocked = null } = {}) {
  const TM = treeMats(world);
  const r = rng(4401);
  // two levels: the same lumps as icosahedra of detail 1 (80 faces a lump) near the camera, detail 0 (20) past 420 m
  const crowns = [crownGeo(11, 4), crownGeo(23, 4), crownGeo(37, 3), crownGeo(53, 3)];
  const crownsLo = [crownGeo(11, 4, 0), crownGeo(23, 4, 0), crownGeo(37, 3, 0), crownGeo(53, 3, 0)];
  const trunk = cylinder([0, 0, 0], [0, 1, 0], 0.08, 6);
  const inst = [[], [], [], []];
  const add = (x, z, h, w, kind = 0) => {
    const y = landAt(x, z);
    inst[kind].push([x, y, z, h, w, r() * 6.283]);
  };
  // the parks: a jittered grid, denser and taller on the hill (Monterey cypress 12-20 m: Pioneer Park; est.)
  for (const [name, poly] of Object.entries(PARKS)) {
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const hill = name === 'pioneer' || name === 'eastSlope';
    const step = hill ? 8.2 : 11;          // (Pioneer Park's canopy is closed: crowns 6-11 m across on an 8 m spacing)
    for (let x = Math.min(...xs); x < Math.max(...xs); x += step) for (let z = Math.min(...zs); z < Math.max(...zs); z += step) {
      const px = x + (r() - 0.5) * step * 0.8, pz = z + (r() - 0.5) * step * 0.8;
      if (!inPoly(px, pz, poly)) continue;
      if (avoid.some(([ax, az, ar]) => Math.hypot(px - ax, pz - az) < ar)) continue;
      if (blocked && blocked(px, pz)) continue;                     // (the buildings and the streets: near.js's plan)
      if (!hill && r() < 0.45) continue;                          // the flat parks: lawns with trees round them
      const h = hill ? 11 + r() * 9 : 7 + r() * 5;
      add(px, pz, h, h * (0.55 + 0.25 * r()), Math.floor(r() * 3));
    }
  }
  out.trees = { inst, crowns, crownsLo, trunk, TM };
  return out.trees;
}

// draw the collected trees: instanced crowns per crown shape and per 160 m tile (each tile's bounds cull it from the views
// and passes that don't see it: a view down the apron no longer draws the hill's 1,000 crowns), trunks per tile
export function flushTrees(world, T3, extra = []) {
  const { inst, crowns, crownsLo, trunk, TM } = T3;
  // street trees: [x, y, z, h, w] on the street-tree crown (index 3)
  for (const [x, y, z, h, w] of extra) inst[3].push([x, y, z, h, w, (x * 7.13 + z * 3.7) % 6.283]);
  // one merged mesh per 200 m tile for the crowns and one for the trunks (two draws a tile, each culled by its bounds)
  let n = 0, tri = 0, meshes = 0;
  const TILE = 200, key = (x, z) => Math.floor(x / TILE) + ',' + Math.floor(z / TILE);
  const tiles = new Map();
  inst.forEach((list, k) => {
    for (const [x, y, z, h, w, a] of list) {
      const kk = key(x, z); if (!tiles.has(kk)) tiles.set(kk, { c: [], lo: [], t: [], cx: 0, cz: 0, n: 0 });
      const tl = tiles.get(kk), m4 = new T.Matrix4().compose(new T.Vector3(x, y + h * 0.28, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), a), new T.Vector3(w * 0.55, h * 0.75, w * 0.55));
      tl.c.push(crowns[k].clone().applyMatrix4(m4)); tl.lo.push(crownsLo[k].clone().applyMatrix4(m4)); tl.cx += x; tl.cz += z; tl.n++;
      tl.t.push(trunk.clone().applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y - 0.3, z), new T.Quaternion(), new T.Vector3(2.2 + h * 0.08, h * 0.56, 2.2 + h * 0.08))));
      n++; tri += crowns[k].index.count / 3;
    }
  });
  const lods = [];
  for (const [kk, tl] of tiles) {
    const hi = world.mesh(merge(tl.c), TM.foliage, { name: 'trees:crowns ' + kk, reflect: false });      // (crowns 300+ m inland: their reflection is lost in the chop)
    const lo = world.mesh(merge(tl.lo), TM.foliage, { name: 'trees:crowns lo ' + kk, reflect: false });
    world.mesh(merge(tl.t), TM.bark, { name: 'trees:trunks ' + kk, reflect: false });
    lo.visible = false; lods.push({ hi, lo, c: [tl.cx / tl.n, tl.cz / tl.n] });
    meshes += 3;
  }
  // the level by the camera's distance to the tile's middle (420 m: the berth, 600+ m away, sees the light crowns; the hill's own streets the full ones)
  world.onFrame((t, cam) => {
    if (!cam) return;
    for (const L of lods) { const far = Math.hypot(cam.position.x - L.c[0], cam.position.z - L.c[1]) > 420; L.hi.visible = !far; L.lo.visible = far; }
  });
  return { n, tri, meshes };
}

// a Canary Island date palm (photo 41): a thick straight trunk with the leaf-base pattern, a dense round head of ~40
// arching fronds; 12-15 m in the city's plantings
export function palmGeo(seed) {
  const r = rng(seed), parts = [], frond = [];
  const H = 1;     // unit trunk height; scaled per instance
  parts.push(latheAt([[0.05, 0], [0.045, 0.3], [0.042, 0.85], [0.06, 0.93], [0, 0.95]], 10, 0, 0, 0, 0.5));
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + r() * 0.2, up = 0.55 - 1.2 * (i / n) + (r() - 0.5) * 0.2;      // the upper ones rise, the lower droop
    const L = 0.42 + 0.1 * r(), segs = 5;
    const pts = [];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, el = up - t * t * 1.1;
      pts.push([Math.cos(a) * L * t * Math.cos(Math.max(-1.2, el) * 0.6), 0.93 + L * t * Math.sin(el) * 0.55, Math.sin(a) * L * t * Math.cos(Math.max(-1.2, el) * 0.6)]);
    }
    // a frond: a strip tapering at both ends, flat across
    const pos = [], nrm = [], uv = [], idx = [];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, w = 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05));
      const p = pts[k], sx = -Math.sin(a) * w, sz = Math.cos(a) * w;
      pos.push(p[0] - sx, p[1], p[2] - sz, p[0] + sx, p[1], p[2] + sz);
      nrm.push(0, 1, 0, 0, 1, 0); uv.push(t, 0, t, 1);
      if (k < segs) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(0.5), 1));
    g.setIndex(idx); g.computeVertexNormals();
    frond.push(g);
  }
  return { trunk: merge(parts), fronds: merge(frond) };
}
