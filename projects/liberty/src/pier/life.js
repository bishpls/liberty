// liberty/src/pier/life.js: the birds that roost on the waterfront (B4), static (birds in flight are a later builder's):
// western gulls in lines along the shed's ridges, on bitts and the breakwater's cap, facing into the WSW wind (site.md
// §6: tens of gulls; they roost facing the wind); rock pigeons on the shed's sills; double-crested cormorants on the
// fender piles' heads, a few with wings spread to dry (photo 28). Each bird stands on drawn geometry: the perches are
// the builders' own numbers (ridge heights, bollard tops, pile heads, sill tops), not bounding boxes (ENVIRONMENT §2c.16).
import { rng } from 'scene3d/util.js';
import * as P from '../plan.js';
import { P35, MARINA, SHORE } from './site.js';
import { merge, box, latheAt } from './geo.js';
import { pierMat } from './mats.js';
import { lin } from 'scene3d/util.js';

const T = window.THREE;

// a perched bird, unit body length along +x (the head at +x), its feet at y 0: body, head, beak, tail, folded wings
function birdGeo(kind) {
  const parts = [];
  const ell = (c, s, seg = 7) => { const g = new T.SphereGeometry(1, seg, Math.max(3, Math.floor(seg / 2))); g.scale(...s); g.translate(...c); return g; };
  if (kind === 'cormorant') {
    parts.push(ell([0, 0.42, 0], [0.32, 0.16, 0.13]));                      // an upright body
    parts.push(ell([0.18, 0.72, 0], [0.06, 0.2, 0.06], 6));                 // the long neck
    parts.push(ell([0.22, 0.9, 0], [0.09, 0.06, 0.06], 6));                 // the head
    parts.push(ell([0.33, 0.89, 0], [0.08, 0.02, 0.02], 4));                // the hooked bill
    parts.push(ell([-0.3, 0.3, 0], [0.16, 0.03, 0.07], 4));                 // the tail
    parts.push(box([0, 0.14, 0.05], [0.03, 0.28, 0.03]), box([0, 0.14, -0.05], [0.03, 0.28, 0.03]));   // the legs
  } else {
    const s = kind === 'pigeon' ? 0.75 : 1;
    parts.push(ell([0, 0.2 * s, 0], [0.32 * s, 0.14 * s, 0.13 * s]));        // the body
    parts.push(ell([0.26 * s, 0.33 * s, 0], [0.09 * s, 0.085 * s, 0.08 * s], 6));
    parts.push(ell([0.37 * s, 0.32 * s, 0], [0.06 * s, 0.018 * s, 0.018 * s], 4));
    parts.push(ell([-0.32 * s, 0.24 * s, 0], [0.14 * s, 0.025 * s, 0.07 * s], 4));
    parts.push(ell([-0.04 * s, 0.27 * s, 0], [0.3 * s, 0.06 * s, 0.135 * s], 6));   // the folded wings (the mantle)
    parts.push(box([0, 0.04 * s, 0], [0.02, 0.08 * s, 0.08]));             // the legs
  }
  const g = merge(parts.map(p => { p.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(p.attributes.position.count).fill(0.5), 1)); return p; }));
  return g;
}

function birdMat(world, kind) {
  // gulls: white with a slate mantle and a yellow bill; pigeons: blue-grey with an iridescent neck; cormorants: black
  const C = { gull: ['#f2f2ee', '#6c757e', '#e8b62a'], pigeon: ['#8b929c', '#6e7682', '#3a3d3a'], cormorant: ['#1d1f1e', '#2a2c2a', '#c8962a'] }[kind];
  return pierMat(world, {
    name: kind, lamps: true,
    uniforms: { uA: { value: new T.Vector3(...lin(C[0])) }, uM: { value: new T.Vector3(...lin(C[1])) }, uB: { value: new T.Vector3(...lin(C[2])) } },
    glsl: 'uniform vec3 uA, uM, uB;',
    // (the mantle: up-facing surfaces of the back; the bill: the thin front piece, by its height band in object terms
    // isn't available here, so the mantle is the up-facing share and the bill's colour is skipped at this size)
    body: 's.albedo = s.N.y > 0.55 ? uM : uA; s.rough = 0.8; s.wrap = 0.2;',
  });
}

export function buildLife(world, M, p35, landAt, out) {
  const r = rng(6101);
  // facing into the wind (from 245 deg true)
  const [wx, wz] = P.atBearing(P.WATER.wind.from, 1), face = Math.atan2(-wz, wx);
  const lists = { gull: [], pigeon: [], cormorant: [] };
  const put = (kind, x, y, z, sc = 1, yaw = face + (r() - 0.5) * 0.9) => lists[kind].push([x, y, z, sc, yaw]);
  // the ridges: clusters of 3-12 gulls every ~30 m, 0.7-1.4 m apart, on the ridge cap (ridgeY + 0.09)
  for (const g of p35.shed.gables) {
    const xm = (g.xa + g.xb) / 2;
    for (let z = P35.z0 + 10 + r() * 20; z < g.zEnd - 6; z += 25 + r() * 25) {
      const n = 3 + Math.floor(r() * 10);
      for (let k = 0; k < n; k++) put('gull', xm + (r() - 0.5) * 0.12, g.ridgeY + 0.09, z + k * (0.7 + r() * 0.7), 0.62);
    }
  }
  // the bitts and bollards: one gull on about a third of them (the top of the bollard's cap)
  // (single bollards only: a pair of bitts has nothing to stand on at its centre)
  for (const [x, y, z] of p35.bollards) if (y < P35.deck + 0.58 && r() < 0.33) put('gull', x, P35.deck + 0.7, z, 0.62);
  // the fender piles' heads: cormorants on a few on the open (east) side and the tip; gulls on others
  for (const [x, z] of p35.fenderPiles) {
    const k = r();
    if (k < 0.05) put('cormorant', x, P35.deck - 0.1, z, 0.85, face + (r() - 0.5) * 1.5);
    else if (k < 0.1) put('gull', x, P35.deck - 0.1, z, 0.62);
  }
  // pigeons on the west wall's clerestory sills (sill top: deck + 5.68), in twos and threes
  const zt = P35.z0 + P35.tipApron;
  for (let b = 0; b * P35.bay < P35.backZ(P35.wallW) - zt - P35.bay; b++) {
    if (r() > 0.35) continue;
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) put('pigeon', P35.wallW - 0.18, P35.deck + 5.68, zt + b * P35.bay + 1.2 + r() * 3.5, 0.42, Math.PI * (r() < 0.5 ? 0.5 : -0.5));
  }
  // the wharf's timber railing west of the root (dress.js: its top rail 0.08 wide, 0.2 deep, centred 1.05 m: its top at 1.15, 0.5 m in from the edge;
  // photo 29: a western gull on a rail): a gull every few metres on about half its length
  const wh = SHORE.filter(p => p[0] >= -56 && p[0] <= 6.1 && p[1] >= 70 && p[1] <= 131);
  for (let i = 0; i < wh.length - 1; i++) {
    const a2 = wh[i], b2 = wh[i + 1], L = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]), u = [(b2[0] - a2[0]) / L, (b2[1] - a2[1]) / L], n = [-u[1], u[0]];
    for (let s2 = 3 + r() * 4; s2 < L - 2; s2 += 2.5 + r() * 6) {
      if (r() < 0.45) continue;
      const x = a2[0] + u[0] * s2 + n[0] * 0.5, z = a2[1] + u[1] * s2 + n[1] * 0.5;
      put('gull', x, landAt(x, z) + 1.15, z, 0.62);
    }
  }
  // the marina's east breakwater cap (y 1.4 + 0.175): a long loose line of gulls
  const [a, b] = MARINA.east;
  for (let t = 0.02; t < 0.98; t += 0.008 + r() * 0.03) put('gull', a[0] + (b[0] - a[0]) * t + (r() - 0.5) * 0.8, 1.575, a[1] + (b[1] - a[1]) * t, 0.62);
  let n = 0, tri = 0;
  for (const kind of Object.keys(lists)) {
    const L = lists[kind]; if (!L.length) continue;
    const g = birdGeo(kind), m = world.mesh(g, birdMat(world, kind), { count: L.length, name: 'life:' + kind + 's', reflect: false });
    L.forEach(([x, y, z, sc, yaw], i) => m.setMatrixAt(i, new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw), new T.Vector3(sc, sc, sc))));
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
    n += L.length; tri += L.length * g.index.count / 3;
  }
  out.life = { gulls: lists.gull.length, pigeons: lists.pigeon.length, cormorants: lists.cormorant.length, tri, perches: lists.gull.map(g => g.slice(0, 3)) };
  return out.life;
}
