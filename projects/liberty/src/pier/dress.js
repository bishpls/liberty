// liberty/src/pier/dress.js: Pier 35's apron dressing and the wharf west of it (B4): the Navy Gate and the museum's
// ticket booth at the west apron's bulkhead end (ssjeremiahobrien.org: "behind the Navy Gate on the north side of
// Pier 35"), the gangway's landing (P.GANGWAY.landing; the deck builder owns the gangway), queue stanchions, life
// rings, the face ladders, standpipes and the shore-power cabinet; on the timber wharf west of the root, the Port's
// blue lamp posts with cream globes, the three-rail timber railing and the pale blue bollards (photo 01). All placed
// outside CROWD_ZONE except what a crowd stands round (the landing at its edge).
import { rng } from 'scene3d/util.js';
import * as P from '../plan.js';
import { P35, SHORE } from './site.js';
import { box, beam, merge, cylinder, latheAt, quads, orient } from './geo.js';
import { LAMPS } from './mats.js';
import { letters } from './bulkhead.js';
import { Bins } from 'scene3d/kit/arch/kit.js';

const T = window.THREE;
const D = P35.deck;

export function buildDress(world, M, landAt, out) {
  const r = rng(3555);
  const X0 = P35.x0, W = P35.wallW;
  const parts = { iron: [], navy: [], white: [], orange: [], red: [], steel: [], glass: [], timber: [], blue: [], cream: [], grey: [], sign: [] };
  // ---- the Navy Gate: two steel posts and an overhead sign beam across the apron at z 118, its two chain-link
  // leaves rolled back against the shed's wall (open for the show)
  const gz = P35.backZ(X0) - 15;
  parts.navy.push(box([X0 + 0.4, D + 1.6, gz], [0.3, 3.2, 0.3]), box([W - 0.4, D + 1.6, gz], [0.3, 3.2, 0.3]));
  parts.navy.push(box([(X0 + W) / 2, D + 3.35, gz], [W - X0, 0.3, 0.25]));
  parts.sign.push(box([(X0 + W) / 2, D + 3.85, gz], [5.2, 0.7, 0.08]));
  for (const k of [0, 1]) {
    const z0 = gz + 0.6 + k * 0.35;
    parts.navy.push(box([W - 0.6 - k * 0.3, D + 1.1, z0 + 2.0], [0.06, 2.2, 4.0]));
  }
  // the ticket booth beside the gate, against the wall: a navy-grey kiosk with a window and a counter
  const bz = gz + 6;
  parts.navy.push(box([W - 1.3, D + 1.3, bz], [2.2, 2.6, 2.6]));
  parts.navy.push(box([W - 1.3, D + 2.7, bz], [2.6, 0.2, 3.0]));
  parts.glass.push(box([W - 2.41, D + 1.6, bz], [0.04, 1.1, 1.8]));
  parts.white.push(box([W - 2.5, D + 1.05, bz], [0.25, 0.06, 1.9]));
  // ---- the gangway's landing (B2's brow ends on the apron in a roller and a toe plate at P.GANGWAY.landing): a steel
  // chequer plate under the foot, 3.0 x 2.4 m, flush (0.02 m), and two short rails each side guiding visitors onto it
  const [gx, , gzl] = (P.GANGWAY && P.GANGWAY.landing) || [X0 + 2.5, D, 6.9];
  parts.steel.push(box([gx + 0.6, D + 0.01, gzl], [3.0, 0.03, 2.4]));
  for (const s of [-1, 1]) {
    parts.white.push(beam([gx - 0.3, D + 1.05, gzl + s * 1.5], [gx + 2.1, D + 1.05, gzl + s * 1.5], 0.05, 0.05));
    for (const dx of [-0.3, 0.9, 2.1]) parts.white.push(box([gx + dx, D + 0.53, gzl + s * 1.5], [0.05, 1.06, 0.05]));
  }
  // queue stanchions: two lines of posts with rope from the landing toward the gate (along the wall side of the apron)
  // (beyond CROWD_ZONE: the queue runs from the gate toward the landing and stops where the crowd's space begins)
  for (let z = Math.max(gzl + 4, P.CROWD_ZONE.z1 + 2); z < gz - 3; z += 2.2) for (const x of [W - 3.4, W - 4.6]) parts.steel.push(latheAt([[0.16, 0], [0.16, 0.04], [0.03, 0.06], [0.03, 0.95], [0.05, 1.0], [0, 1.02]], 8, x, D, z, r()));
  // ---- life rings on posts every ~45 m along both edges, ladders down the face every ~60 m, standpipes
  const ring = (x, z, face) => {
    parts.red.push(box([x, D + 0.75, z], [0.12, 1.5, 0.12]));
    const g = new T.TorusGeometry(0.33, 0.07, 6, 16); g.rotateY(face); g.translate(x + Math.cos(face) * 0.12, D + 1.25, z - Math.sin(face) * 0.12);
    g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(g.attributes.position.count).fill(0.5), 1));
    parts.orange.push(g);
  };
  for (let z = P35.z0 + 20; z < P35.backZ(X0) - 20; z += 45) ring(X0 + 0.5, z + 9, Math.PI / 2);
  for (let z = P35.z0 + 25; z < P35.backZ(P35.x1) - 20; z += 45) ring(P35.x1 - 0.5, z, -Math.PI / 2);
  const ladder = (x, z, side) => {
    for (const dz of [-0.22, 0.22]) parts.iron.push(box([x + side * 0.12, D - 2.0, z + dz], [0.05, 4.4, 0.05]));
    for (let y = D - 3.9; y < D; y += 0.3) parts.iron.push(box([x + side * 0.12, y, z], [0.04, 0.04, 0.44]));
    for (const dz of [-0.22, 0.22]) parts.iron.push(beam([x - side * 0.2, D, z + dz], [x - side * 0.1, D + 1.0, z + dz], 0.05, 0.05), beam([x - side * 0.1, D + 1.0, z + dz], [x + side * 0.1, D + 1.0, z + dz], 0.05, 0.05));
  };
  for (let z = P35.z0 + 32; z < P35.backZ(X0) - 20; z += 60) ladder(X0 - 0.05, z + 4, -1);
  for (let z = P35.z0 + 30; z < P35.backZ(P35.x1) - 20; z += 60) ladder(P35.x1 + 0.05, z, 1);
  for (let z = P35.z0 + 15; z < P35.backZ(W) - 10; z += 61) {
    parts.red.push(latheAt([[0.11, 0], [0.11, 0.6], [0.16, 0.65], [0.12, 0.75], [0, 0.8]], 8, W - 0.35, D, z + 3, r()));
  }
  // the shore-power cabinet abreast the ship's house (her shore cable runs to it)
  parts.grey.push(box([W - 0.6, D + 0.9, 12.0], [0.7, 1.8, 1.6]));
  // ---- the wharf west of the root (photo 01): the Port's blue lamp posts with cream globes along its water edge, the
  // three-rail timber railing, the pale blue bollards with horns
  const wh = SHORE.filter(p => p[0] >= -56 && p[0] <= 6.1 && p[1] >= 70 && p[1] <= 131);
  const wharfLamps = [];
  for (let i = 0; i < wh.length - 1; i++) {
    const a = wh[i], b = wh[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-u[1], u[0]];
    for (let s = 1; s < L; s += 2.4) {
      const x = a[0] + u[0] * s + n[0] * 0.5, z = a[1] + u[1] * s + n[1] * 0.5, y = landAt(x, z);
      parts.timber.push(box([x, y + 0.6, z], [0.14, 1.2, 0.14]));
    }
    for (const h of [0.35, 0.7, 1.05]) parts.timber.push(beam([a[0] + n[0] * 0.5, landAt(a[0], a[1]) + h, a[1] + n[1] * 0.5], [b[0] + n[0] * 0.5, landAt(b[0], b[1]) + h, b[1] + n[1] * 0.5], 0.08, 0.2));
    for (let s = 6; s < L; s += 14) {
      const x = a[0] + u[0] * s + n[0] * 2.0, z = a[1] + u[1] * s + n[1] * 2.0, y = landAt(x, z);
      parts.blue.push(cylinder([x, y, z], [x, y + 4.0, z], 0.06, 8));
      parts.cream.push(latheAt([[0, 0], [0.12, 0], [0.2, 0.15], [0.22, 0.4], [0.17, 0.62], [0.06, 0.7], [0, 0.72]], 10, x, y + 4.0, z, r()));
      wharfLamps.push({ pos: [x, y + 4.35, z], kind: 'wharf lamp', color: '#fff0d8' });
      const bx = x + n[0] * 1.6 + u[0] * 4, bzz = z + n[1] * 1.6 + u[1] * 4;
      parts.blue.push(latheAt([[0.22, 0], [0.2, 0.45], [0.24, 0.5], [0.24, 0.6], [0, 0.62]], 10, bx, y, bzz, r()));
    }
  }
  const mats = {
    iron: M.iron, navy: M.flat('navy grey', '#4b5560'), white: M.flat('rail white', '#e6e6e0'), orange: M.flat('life ring', '#e86a22'),
    red: M.flat('standpipe red', '#b8322a'), steel: M.flat('landing steel', '#7e8486', { spec: 0.3, rough: 0.5 }), glass: M.sash, timber: M.timber,
    blue: M.flat('port blue', '#8fb3d6'), cream: M.flat('lamp globe cream', '#f4e6c4', { emit: 3.2, nightOnly: true, lamps: false, lines: 0 }),
    grey: M.flat('cabinet grey', '#9a9e9a'), sign: M.flat('gate sign', '#1f3a5c'),
  };
  // the signs' letters: NAVY GATE on the gate's beam sign (facing the apron, both faces), TICKETS over the booth's window
  const LB = new Bins(world, 'pier35 signs'), white = M.flat('sign letters', '#f2f0ea', { lamps: true });
  for (const [face, dz] of [[1, 0.05], [-1, -0.05]]) {
    // (u runs along x; seen from the south (face 1) the text reads +x, from the north it reads -x)
    letters('NAVY GATE', (u, v, d) => [(X0 + W) / 2 + face * u, D + 3.62 + v, gz + dz + face * d * 0.0], 0.42, 0, LB, white);
  }
  letters('TICKETS', (u, v, d) => [W - 2.41, D + 2.25 + v, bz + u], 0.26, 0, LB, white);     // (the booth's face at x W - 2.4)
  LB.flush();
  let tri = 0;
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const g = merge(list); tri += g.index.count / 3;
    world.mesh(g, mats[k], { name: 'pier35:' + k });
  }
  out.dress = { gateZ: +gz.toFixed(1), boothZ: +bz.toFixed(1), landing: [gx, D, gzl], tri, wharfLamps };
  return out.dress;
}
