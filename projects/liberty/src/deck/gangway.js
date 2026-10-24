// liberty/src/deck/gangway.js: the visitors' gangway (B2): a brow from a landing on her starboard bulwark abreast the house's
// after end (P.SHIP.gangway.top; B1's anchors.gangway) down to the pier's west apron (P.GANGWAY.landing), with its inboard
// steps to the deck, handrails on stanchions, cleated treads, a roller and toe plate on the apron, a safety net slung
// under it, and its lamp. Sources: ship.md §7 (an accommodation ladder / gangway to the pier on the pier side, photos
// ship/04, 16), plan.js (the places).
import * as P from '../plan.js';
import { SH, deckAt, tr, ry, mul, along, lath, cyl, boxM, bar, tube, mergeG } from './ship.js';

const T = window.THREE;
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm3 = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function buildGangway(world, M, ctx, B, W, seat) {
  const S = SH;
  const top = seat.get('gangway.top', [S.gangway.top.x, S.sideAbl(S.gangway.top.z) + S.bulwark, S.gangway.top.z]);
  const dk = seat.get('gangway.deck', [S.gangway.top.x - 0.8, deckAt(S.gangway.top.x - 0.8, S.gangway.top.z), S.gangway.top.z]);
  const Lw = P.GANGWAY.landing, land = SH.fromWorld(Lw[0], Lw[1], Lw[2]);
  // the head's landing: a platform on the bulwark's cap, its steps down inboard to the deck
  const ph = [top[0] + 0.15, top[1] + 0.06, top[2]];
  B.add(M.steel, boxM(0.9, 0.06, 1.0, tr(...ph)), 'gangway');
  for (const dz of [-0.45, 0.45]) B.add(M.steel, cyl([ph[0] + 0.4, top[1] - 1.0, ph[2] + dz], [ph[0] + 0.4, ph[1], ph[2] + dz], 0.035, 0.035, { sides: 6 }), 'gangway');
  const nSteps = 4, run = 0.95;
  for (let k = 1; k <= nSteps; k++) { const u = k / (nSteps + 1), x = ph[0] - 0.45 - run * u, y = ph[1] + (dk[1] - ph[1]) * u; B.add(M.bare, boxM(0.22, 0.04, 0.8, tr(x, y, ph[2])), 'gangway'); }
  for (const dz of [-0.42, 0.42]) {
    B.add(M.steel, bar([ph[0] - 0.45, ph[1], ph[2] + dz], [ph[0] - 0.45 - run * 1.1, dk[1], ph[2] + dz], 0.05, 0.15, 0.5, [0, 0, 1]), 'gangway');
    B.add(M.steel, tube([[ph[0] - 0.45 - run, dk[1] + 0.95, ph[2] + dz], [ph[0] - 0.4, ph[1] + 1.0, ph[2] + dz], [ph[0] + 0.4, ph[1] + 1.0, ph[2] + dz]], 0.022, { sides: 6 }), 'gangway');
    B.add(M.steel, cyl([ph[0] - 0.45 - run, dk[1], ph[2] + dz], [ph[0] - 0.45 - run, dk[1] + 0.95, ph[2] + dz], 0.02, 0.02, { sides: 5 }), 'gangway');
  }
  // the brow: from the platform's outboard edge down to the apron
  const a = [ph[0] + 0.45, ph[1] + 0.02, ph[2]], b = [land[0], land[1] + 0.12, land[2]];
  const d = nrm3(sub3(b, a)), L = Math.hypot(...sub3(b, a));
  const side = nrm3(cross3(d, [0, 1, 0])), up = nrm3(cross3(side, d));
  const hw = 0.42;
  const strG = [], stringers = [];
  for (const s of [-1, 1]) {
    const o = side.map(v => v * s * hw);
    const sg = bar(add3(a, o), add3(b, o), 0.22, 0.05, 0.5, side); stringers.push(sg); strG.push(sg);         // the stringers
    const rail = [add3(add3(a, o), up, 1.0), add3(add3(b, o), up, 1.0)];
    strG.push(cyl(...rail, 0.024, 0.024, { sides: 8 }), cyl(add3(rail[0], up, -0.5), add3(rail[1], up, -0.5), 0.016, 0.016, { sides: 6 }));
    for (let u = 0; u <= L + 1e-6; u += L / Math.round(L / 1.1)) { const p = add3(add3(a, d, u), o); strG.push(cyl(p, add3(p, [0, 1, 0], 1.0 / Math.max(0.5, up[1])), 0.02, 0.02, { sides: 6 })); }
  }
  B.add(M.steel, strG, 'gangway');
  // the treads: cleats square across the brow every 0.33 m along it, level (the brow is ~35 deg)
  for (let u = 0.2; u < L - 0.1; u += 0.33) B.add(M.bare, boxM(0.06, 0.035, 2 * hw - 0.06, mul(tr(...add3(add3(a, d, u), [0, 1, 0], 0.06)), ry(Math.atan2(side[0], side[2])))), 'gangway');
  // the foot: a roller on the apron and a hinged toe plate
  const rf = add3(b, [0, -0.08, 0]);
  B.add(M.black, cyl(add3(rf, side, -hw), add3(rf, side, hw), 0.1, 0.1, { sides: 14 }), 'gangway');
  B.add(M.steel, boxM(0.95, 0.025, 0.7, mul(tr(...add3(add3(rf, d, 0.45), [0, -0.06, 0])), ry(Math.atan2(side[0], side[2])))), 'gangway');
  // the safety net slung under it: a diamond mesh of light line between the stringers' feet
  const s0 = side.map(v => -v * hw), s1 = side.map(v => v * hw), drop = 0.45;
  const netFit = W.fit('gangway stringers', mergeG(stringers.map(g => g.clone())), a);
  const n = Math.round(L / 0.45);
  for (let k = 0; k < n; k++) {
    const u0 = (k / n) * L, u1 = ((k + 1) / n) * L;
    for (const [p0, p1] of [[s0, s1], [s1, s0]]) {
      const A0 = add3(add3(a, d, u0), p0, 1), A1 = add3(add3(a, d, u1), p1, 1), mid = add3(add3(A0, A1, 0), [0, 0, 0]);
      const m = add3(lerp(A0, A1, 0.5), [0, -drop * Math.sin(Math.PI * (u0 + u1) / (2 * L)) - 0.05, 0]);
      void mid;
      W.path([add3(A0, up, -0.1), m, add3(A1, up, -0.1)], { r: 0.005, tone: 4, ends: [netFit, netFit], name: 'gangway net', rope: false });
    }
  }
  const lamp = add3(ph, [-0.3, 2.3, 0.6]);
  B.add(M.steel, cyl([ph[0] - 0.3, ph[1], ph[2] + 0.6], add3(lamp, [0, 0.4, 0]), 0.03, 0.03, { sides: 6 }), 'gangway');
  return { top: a, foot: b, lamp, measures: { length: +L.toFixed(2), slopeDeg: +(Math.asin(-d[1]) * 180 / Math.PI).toFixed(1), width: 2 * hw, landing: Lw, source: 'plan.js SHIP.gangway / GANGWAY.landing' } };
}
const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
