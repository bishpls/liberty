// liberty/src/deck/rig.js: the masts, the booms and the rigging (B2).
//
// Sources: research/ship.md §5 (masts, booms, winches) and §7 (aerials, lights); HAER VA-132 sheet 10 (the rigging
// profile: the booms in both their positions, the 5-ton booms 55'-0" (item 3) and the mainmast's 47'-0" (item 19), the
// 30-ton boom 51'-0" (23) and the 15-ton 51'-0" stowed upright, the housing topmast of 10" standard pipe (the label at
// the mizzen), the crosstree's fitting at 82'-0" above the baseline (27), the aerials 7, 8, 21 with their insulators
// (4) and lead-ins (14, 15), the not-under-command lights and balls (17, 18), the range light (24), the Morse light, the
// signal and flag halyards (9), the topping lifts to the lower mastheads); the JWB capacity plan's mast heights (fore
// 40'-3", main 42'-11" / 62'-11" with the topmast, mizzen 42'-2" / 62'-2"); photos ship/01, 09, 25, 27, 31 and site/01
// (the O'Brien's booms topped at mixed angles, one pair to each side of each hatch; the cargo lamps under the crosstrees;
// the ladders; the T-shaped fore crosstree with the topping-lift blocks at its ends; the crow's nest).
//
// Every wire is a catenary under its stated tension (wires.js); every end made fast to a fitting (a turnbuckle on a
// padeye, a band's eye, a block, an insulator, a winch drum, a cleat). The No. 2 booms (the stage's) are topped to
// P.SHIP.booms.no2Topping, their hooks hove up to the heads and their guys led forward, clear of the stage.
import { SH, FT, DEG, zs, deckCL, deckAt, sideAbl, halfAt, tr, rx, ry, rz, mul, along, xf, lath, cyl, boxM, boxAt, bar, tube, ring, disc, plate, mergeG, V3 } from './ship.js';

const T = window.THREE;
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = a => Math.hypot(a[0], a[1], a[2]);
const nrm3 = a => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];

// wire sizes (radius m), weights (N/m: 6x19 wire ~0.0035 d^2 kg/m, d mm) and tensions (horizontal N)
export const WIRE = {
  shroud: { r: 0.0111, w: 16.6, H: 15000, tone: 0, kind: 'shroud (7/8 in)' },
  stay: { r: 0.0127, w: 21.5, H: 14000, tone: 0, kind: 'stay (1 in)' },
  backstay: { r: 0.0111, w: 16.6, H: 9000, tone: 0, kind: 'backstay (7/8 in)' },
  lift: { r: 0.0095, w: 12.4, H: 20000, tone: 1, kind: 'topping lift (3/4 in)' },
  liftFall: { r: 0.0095, w: 12.4, H: 3000, tone: 1, kind: 'topping lift fall' },
  runner: { r: 0.008, w: 8.8, H: 6000, tone: 1, kind: 'cargo runner (5/8 in)' },
  guy: { r: 0.0095, w: 12.4, H: 2500, tone: 1, kind: 'guy pendant (3/4 in)' },
  schooner: { r: 0.0095, w: 12.4, H: 3500, tone: 1, kind: 'schooner guy (3/4 in)' },
  tackle: { r: 0.012, w: 3.9, H: 1500, tone: 3, kind: 'guy tackle (3 in manila)', rope: true },
  aerial: { r: 0.0087, w: 11.8, H: 2200, tone: 2, kind: 'transmitting aerial (11/16 in copper)' },
  aerial2: { r: 0.0056, w: 4.9, H: 1500, tone: 2, kind: 'auxiliary / emergency aerial (7/16 in)' },
  leadin: { r: 0.0056, w: 4.9, H: 300, tone: 2, kind: 'aerial lead-in' },
  halyard: { r: 0.0048, w: 1.0, H: 250, tone: 4, kind: 'signal halyard (3/8 in)', rope: false },
};

export function buildRig(world, M, ctx, B, W, seat, mach) {
  const S = SH, out = { masts: {}, booms: [], lamps: [], measures: {}, lights: [] };
  const fits = W;
  // ---- fittings (ship frame), each registered so its wire ends can be checked
  const F = {
    // a padeye on a surface at p (its up n), the eye turned along dir: -> { fit, eye }
    padeye(p, dir, up = [0, 1, 0]) {
      const d = nrm3(dir), side = nrm3([d[2], 0, -d[0]]);
      const eye = add3(p, up, 0.07);
      const g = mergeG([boxM(0.14, 0.02, 0.1, mul(tr(...add3(p, up, 0.01)), along([0, 0, 0], up))),
        ring(eye, len3(side) > 0.1 ? side : [1, 0, 0], 0.035, 0.011, { seg: 10, sides: 4 })]);
      B.add(M.steelOld, g, 'fittings');
      return { fit: fits.fit('padeye', g, p), eye: add3(eye, up, 0.035) };
    },
    // a turnbuckle (bottle screw) from its foot eye at p along dir, length L: -> { fit, top }
    turnbuckle(p, dir, L = 0.5) {
      const d = nrm3(dir), top = add3(p, d, L);
      const g = mergeG([cyl(add3(p, d, 0.08), add3(p, d, L - 0.08), 0.022, 0.022, { sides: 6 }), cyl(add3(p, d, L * 0.3), add3(p, d, L * 0.7), 0.034, 0.034, { sides: 6 }),
        cyl(p, add3(p, d, 0.1), 0.014, 0.014, { sides: 4 }), cyl(add3(p, d, L - 0.1), top, 0.014, 0.014, { sides: 4 })]);
      B.add(M.steelOld, g, 'fittings');
      return { fit: fits.fit('turnbuckle', g, top), top };
    },
    // a block: its shell hung from 'head' (where it is shackled) along dir (the way the load pulls) -> { fit, sheave, head }
    block(head, dir, size = 0.32, mat = M.steelOld) {
      const d = nrm3(dir), c = add3(head, d, size * 0.6);
      const sd = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : nrm3([d[2], 0, -d[0]]);           // the sheave's pin runs across
      const m = along(c, d, sd);
      const g = mergeG([boxM(size * 0.62, size, size * 0.3, mul(m, rx(0))), lath([[0, -size * 0.31], [size * 0.3, -size * 0.31], [size * 0.3, size * 0.31], [0, size * 0.31]], 12).applyMatrix4(along(c, sd)),
        cyl(add3(c, sd, -size * 0.22), add3(c, sd, size * 0.22), 0.03, 0.03, { sides: 6 }),
        ring(add3(head, d, size * 0.04), len3([d[2], 0, -d[0]]) > 0.1 ? nrm3([d[2], 0, -d[0]]) : [1, 0, 0], 0.045, 0.012, { seg: 10, sides: 4 }),
        cyl(add3(head, d, size * 0.06), add3(head, d, size * 0.22), 0.02, 0.02, { sides: 5 })]);
      B.add(mat, g, 'blocks');
      return { fit: fits.fit('block', g, c), sheave: c, head, shell: g };
    },
    // a band round a spar of radius r at height y on axis point p (eyes left to the caller)
    band(p, r, axis = [0, 1, 0]) {
      const g = lath([[r - 0.01, -0.05], [r + 0.025, -0.05], [r + 0.025, 0.05], [r - 0.01, 0.05]], 16).applyMatrix4(along(p, axis));
      B.add(M.steelOld, g, 'fittings');
      return { fit: fits.fit('band', g, p), g };
    },
    // an eye plate standing off a spar at p, pointing out along 'out' -> { fit, eye }
    eye(p, out, r = 0.04, stand = 0.08) {
      const o = nrm3(out), e = add3(p, o, stand + 0.01);
      const side = Math.abs(o[1]) > 0.9 ? [1, 0, 0] : nrm3([o[2], 0, -o[0]]);
      const g = mergeG([bar(p, add3(p, o, stand), 0.05, 0.02), ring(e, side, r, 0.012, { seg: 10, sides: 4 })]);
      B.add(M.steelOld, g, 'fittings');
      return { fit: fits.fit('eye', g, e), eye: add3(e, o, r * 0.6) };
    },
    // a porcelain strain insulator (the aerials' ends: item 4) from a along dir, ribbed -> { fit, far }
    insulator(a, dir, L = 0.32) {
      const d = nrm3(dir), far = add3(a, d, L);
      const pr = [[0, 0], [0.02, 0]]; for (let k = 0; k < 6; k++) pr.push([0.04, 0.05 + k * 0.042], [0.024, 0.07 + k * 0.042]); pr.push([0.02, L], [0, L]);
      const g = lath(pr, 10).applyMatrix4(along(a, d));
      B.add(M.white, g, 'fittings');
      return { fit: fits.fit('insulator', g, far), far, near: a };
    },
    // a cleat (two horns on a base) at p on a vertical face facing 'out', for a fall to be made fast
    cleat(p, out) {
      const o = nrm3(out), m = along(p, [0, 1, 0], o);
      const g = mergeG([boxM(0.06, 0.24, 0.06, mul(m, tr(0, 0, 0.03))), boxM(0.05, 0.36, 0.05, mul(m, tr(0, 0, 0.08)))]);
      B.add(M.steelOld, g, 'fittings');
      return { fit: fits.fit('cleat', g, add3(p, o, 0.08)), at: add3(p, o, 0.1) };
    },
  };
  out.F = F;
  const wire = (a, b, spec, ends, name, extra = {}) => W.add(a, b, Object.assign({}, spec, { ends, name }, extra));

  // ---- the masts
  const deckSide = (sx, z) => [sx * (halfAt(z) - 0.32), deckAt(sx * (halfAt(z) - 0.32), z), z];      // a padeye's place inside the bulwark
  const chain = (sx, z, top, name, spec = WIRE.shroud) => {
    // a shroud from 'top' (an eye at the masthead) down to a turnbuckle on a padeye at the deck edge
    const foot = deckSide(sx, z), tp = top.eyePt || top;
    const pe = F.padeye(foot, sub3(tp, foot));
    const tb = F.turnbuckle(pe.eye, sub3(tp, pe.eye), 0.55);
    return wire(tb.top, tp, spec, [tb.fit, top.fit], name);
  };
  const masts = {};
  for (const name of ['fore', 'main', 'mizzen']) {
    const m = S.masts[name], z = m.z;
    const A = seat.pick(`masts.${name}`);
    const top = A && A.houseTop !== undefined ? A.houseTop : m.houseTop;
    const house = A && A.house ? A.house : { z0: m.house[0], z1: m.house[1], half: S.masts.houseHalf };
    seat.used[`masts.${name}`] = A ? 'hull' : 'plan';
    const dk = deckCL(z), cap = dk + m.above, truck = m.top ? dk + m.top : null;
    const r0 = 0.40, r1 = 0.31;
    const mm = { name, z, top, house, deck: dk, cap, truck, r0, r1, lamps: [] };
    masts[name] = mm;
    // the lower mast: a tapered tube from the house top to its cap, banded, a ladder up its forward face on stand-offs
    B.add(M.steel, cyl([0, top - 0.05, z], [0, cap, z], r0, r1, { sides: 24, seed: 0.3 }), 'masts');
    const rAt = y => r0 + (r1 - r0) * (y - top) / (cap - top);
    for (let y = top + 1.4; y < cap - 0.6; y += 2.6) B.add(M.steelOld, lath([[rAt(y) - 0.01, -0.04], [rAt(y) + 0.015, -0.04], [rAt(y) + 0.015, 0.04], [rAt(y) - 0.01, 0.04]], 24).applyMatrix4(tr(0, y, z)), 'masts');
    const ladTop = name === 'fore' ? cap - 0.3 : top + 6.1 - 0.2, lz = z - 0.0;
    for (const sx of [-0.2, 0.2]) B.add(M.steel, cyl([sx, top - 0.01, lz - rAt(top) - 0.18], [sx, ladTop, lz - rAt(ladTop) - 0.18], 0.012, 0.012, { sides: 5 }), 'ladders');
    for (let y = top + 0.4; y < ladTop; y += 0.32) B.add(M.steel, cyl([-0.2, y, lz - rAt(y) - 0.18], [0.2, y, lz - rAt(y) - 0.18], 0.01, 0.01, { sides: 4 }), 'ladders');
    for (let y = top + 0.6; y < ladTop; y += 1.8) for (const sx of [-0.2, 0.2]) B.add(M.steel, bar([sx, y, lz - rAt(y) + 0.02], [sx, y, lz - rAt(y) - 0.18], 0.03, 0.012), 'ladders');
    // the masthead: a band with the shrouds' eyes (three a side: forward, abreast, aft)
    const mhY = cap - 0.35, mh = F.band([0, mhY, z], rAt(mhY));
    mm.shroudEyes = [];
    for (const sx of [-1, 1]) for (const dz of [-0.6, 0, 0.6]) {
      const ph = dz * 0.6, rr = rAt(mhY) + 0.02;
      const base = [sx * Math.cos(ph) * rr, mhY, z + Math.sin(ph) * rr];
      const e = F.eye(base, [sx * Math.cos(ph), -0.1, Math.sin(ph)]);
      mm.shroudEyes.push({ sx, dz, ...e });
    }
    if (name === 'fore') {
      // the T crosstree (photo ship/25): a box beam athwartships at the cap with knees under it, the topping-lift blocks at
      // its ends; the crow's nest on top (82-88 ft ABL, a cap to 89.5 ft: ship.md §5); a pole above for the halyards
      const y = cap, hx = 2.75;
      B.add(M.steel, boxM(hx * 2, 0.3, 0.32, tr(0, y - 0.15, z)), 'masts');
      for (const sx of [-1, 1]) B.add(M.steel, bar([sx * 0.3, y - 1.6, z], [sx * hx * 0.85, y - 0.3, z], 0.12, 0.12), 'masts');
      // the lookout platform and the barrel (a closed lookout ~4 ft across), its rail and door; the cap
      B.add(M.steel, cyl([0, y, z], [0, y + 0.06, z], 0.95, 0.95, { sides: 24 }), 'masts');
      B.add(M.steel, cyl([0, y + 0.06, z], [0, y + 1.75, z], 0.66, 0.66, { sides: 24, caps: false }), 'masts');
      B.add(M.steel, lath([[0.66, 0], [0.7, 0], [0.7, 0.05], [0.0, 0.32]], 24).applyMatrix4(tr(0, y + 1.75, z)), 'masts');
      B.add(M.black, boxM(0.5, 0.9, 0.02, mul(tr(0, y + 0.7, z + 0.665))), 'masts');                       // the door (aft)
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; B.add(M.steel, cyl([Math.cos(a) * 0.92, y + 0.06, z + Math.sin(a) * 0.92], [Math.cos(a) * 0.92, y + 1.0, z + Math.sin(a) * 0.92], 0.015, 0.015, { sides: 4 }), 'masts'); }
      B.add(M.steel, tube(Array.from({ length: 33 }, (_, k) => { const a = k / 32 * Math.PI * 2; return [Math.cos(a) * 0.92, y + 1.0, z + Math.sin(a) * 0.92]; }), 0.018, { sides: 5, closed: true }), 'masts');
      B.add(M.steel, cyl([0, y + 2.05, z], [0, y + 3.8, z], 0.075, 0.05, { sides: 10 }), 'masts');                // the pole
      B.add(M.steel, lath([[0, 0], [0.09, 0], [0.09, 0.08], [0, 0.1]], 10).applyMatrix4(tr(0, y + 3.8, z)), 'masts');
      mm.poleTop = [0, y + 3.86, z];
      mm.crowsNest = [y + 0.06, y + 2.07];
      // the topping-lift blocks under the T's ends: one facing forward (No. 1's booms), one aft (No. 2's)
      mm.liftBlocks = {};
      for (const sx of [-1, 1]) for (const end of ['fwd', 'aft']) {
        const head = [sx * (hx - 0.18), y - 0.3, z + (end === 'fwd' ? -0.12 : 0.12)];
        mm.liftBlocks[`${end}${sx}`] = { head };
      }
      // the yardarm blinkers at the T's ends and the range light on its forward face; the cargo lamps' yard below
      mm.lampYard = cap - 3.6;
      B.add(M.steel, boxM(3.2, 0.14, 0.14, tr(0, mm.lampYard, z)), 'masts');
      mm.rangeLight = [0, y + 0.25, z - 0.75];
      mm.blinkers = [[-hx + 0.12, y - 0.005, z], [hx - 0.12, y - 0.005, z]];
      mm.headEye = F.eye([0, y + 0.2, z - 0.36], [0, 0.2, -1]);      // the forestay's eye
      mm.headEyeAft = F.eye([0, y - 0.6, z + 0.36], [0, 0.1, 1]);     // the triatic's
    } else {
      // main and mizzen: the crosstree ~20 ft above the house top (ship.md §5) with the cargo lamps under it; the lower
      // masthead's outriggers carrying the topping-lift blocks; the housing topmast (10 in pipe) up to the truck
      const yc = top + 6.1, hx = 1.7;
      B.add(M.steel, boxM(hx * 2, 0.24, 0.26, tr(0, yc, z)), 'masts');
      for (const sx of [-1, 1]) B.add(M.steel, bar([sx * 0.3, yc - 1.1, z], [sx * hx * 0.8, yc - 0.12, z], 0.09, 0.09), 'masts');
      mm.crosstree = yc; mm.lampYard = yc - 0.15;
      // the outriggers at the masthead: the topping lifts' blocks hang from their ends (the drawing's lifts meet the
      // lower mastheads)
      const yo = cap - 0.15;
      B.add(M.steel, boxM(2.1, 0.18, 0.2, tr(0, yo, z)), 'masts');
      B.add(M.steel, lath([[0, 0], [r1 + 0.05, 0], [r1 + 0.05, 0.12], [0.16, 0.16], [0, 0.16]], 20).applyMatrix4(tr(0, cap, z)), 'masts');
      mm.liftBlocks = {};
      for (const sx of [-1, 1]) for (const end of ['fwd', 'aft']) mm.liftBlocks[`${end}${sx}`] = { head: [sx * 0.95, yo - 0.08, z + (end === 'fwd' ? -0.1 : 0.1)] };
      // the topmast (10 in standard pipe, 0.273 m) from inside the lower mast's cap to the truck; its cap, its light
      B.add(M.steel, cyl([0, cap + 0.1, z], [0, truck, z], 0.137, 0.11, { sides: 14 }), 'masts');
      B.add(M.steel, lath([[0, 0], [0.16, 0], [0.16, 0.1], [0, 0.14]], 12).applyMatrix4(tr(0, truck, z)), 'masts');
      for (let y = cap + 1.5; y < truck - 0.5; y += 2.2) B.add(M.steelOld, lath([[0.11, -0.03], [0.14, -0.03], [0.14, 0.03], [0.11, 0.03]], 14).applyMatrix4(tr(0, y, z)), 'masts');
      mm.truckTop = [0, truck + 0.14, z];
      mm.topEyeFwd = F.eye([0, truck - 0.35, z - 0.1], [0, 0.15, -1], 0.03);
      mm.topEyeAft = F.eye([0, truck - 0.35, z + 0.1], [0, 0.15, 1], 0.03);
      mm.topEyes = [-1, 1].map(sx => F.eye([sx * 0.1, truck - 0.6, z], [sx, 0.1, 0.2], 0.03));
      mm.headEye = F.eye([0, cap - 0.6, z - rAt(cap - 0.6)], [0, 0.1, -1]);
      mm.headEyeAft = F.eye([0, cap - 0.6, z + rAt(cap - 0.6)], [0, 0.1, 1]);
      if (name === 'main') {
        // the range light on the crosstree (24), the not-under-command lights on a short yard (17, 18), the Morse light at
        // the truck, the signal yard (9) with its halyards to the flag bag on the bridge (11)
        mm.rangeLight = [0, yc + 0.3, z - 0.32];
        B.add(M.steel, boxM(1.6, 0.1, 0.1, tr(0, yc + 2.6, z + 0.3)), 'masts');
        mm.nuc = [[0.7, yc + 2.0, z + 0.3], [0.7, yc + 1.0, z + 0.3]];
        mm.morse = [0, truck + 0.13, z];
        const ys = yc + 1.6;
        B.add(M.steel, bar([-2.6, ys, z - 0.2], [2.6, ys, z - 0.2], 0.09, 0.09), 'masts');                 // the signal yard
        mm.signalYard = { y: ys, z: z - 0.2, half: 2.6 };
      }
    }
    // the lamps under the yard: two floods each way, aimed down at the hatches either side (photos 25, 27)
    const hatchFwd = { fore: 1, main: 2, mizzen: 4 }[name], hatchAft = { fore: 2, main: 3, mizzen: 5 }[name];
    for (const [end, hatch] of [['fwd', hatchFwd], ['aft', hatchAft]]) for (const sx of [-1, 1]) {
      const p = [sx * (name === 'fore' ? 1.3 : 1.2), mm.lampYard - 0.22, z + (end === 'fwd' ? -0.22 : 0.22)];
      const h = S.hatches[hatch], aim = [sx * 1.0, deckCL((h.z0 + h.z1) / 2) + 0.9, (h.z0 + h.z1) / 2];
      mm.lamps.push({ p, aim, hatch, mast: name, on: hatch !== 2 });
    }
    // the shrouds: three a side to padeyes at the deck edge, a little forward, abreast and aft of the mast (sheet 10)
    for (const e of mm.shroudEyes) {
      const zf = z + e.dz * 3.4 + 0.8;
      chain(e.sx, zf, { fit: e.fit, eyePt: e.eye }, `${name} shroud ${e.sx > 0 ? 'S' : 'P'}${e.dz}`);
    }
    out.masts[name] = mm;
  }

  // ---- the stays: the forestay to the bow platform, the triatic between the mastheads, the topmast stays, backstays
  const fore = masts.fore, main = masts.main, miz = masts.mizzen;
  {
    const bp = S.bow.platform, zf = bp.z0 + 0.5, pe = F.padeye([0, bp.abl, zf], [0, 1, 1.2]);
    const tb = F.turnbuckle(pe.eye, sub3(fore.headEye.eye, pe.eye), 0.6);
    wire(tb.top, fore.headEye.eye, WIRE.stay, [tb.fit, fore.headEye.fit], 'forestay');
    wire(fore.headEyeAft.eye, main.headEye.eye, WIRE.stay, [fore.headEyeAft.fit, main.headEye.fit], 'triatic fore-main');
    wire(main.topEyeFwd.eye, fore.poleTop ? [0, fore.crowsNest[1] + 0.25, fore.z + 0.05] : fore.headEye.eye, WIRE.stay, [main.topEyeFwd.fit, null], 'main topmast stay');
    // (the topmast stay ends on the crow's nest's cap: register that cap as its fitting)
    const capG = lath([[0, 0], [0.12, 0], [0.12, 0.08], [0, 0.08]], 8).applyMatrix4(tr(0, fore.crowsNest[1] + 0.2, fore.z + 0.05));
    B.add(M.steelOld, capG, 'fittings'); W.list[W.list.length - 1].ends[1] = W.fit('eye', capG, [0, fore.crowsNest[1] + 0.25, fore.z]);
    wire(main.headEyeAft.eye, miz.headEye.eye, WIRE.stay, [main.headEyeAft.fit, miz.headEye.fit], 'triatic main-mizzen');
    wire(miz.topEyeFwd.eye, main.topEyeAft.eye, WIRE.stay, [miz.topEyeFwd.fit, main.topEyeAft.fit], 'topmast triatic');
    // the topmasts' backstays (the upper backstay bridle): down to the deck edge abaft each mast
    for (const [mm, dz] of [[main, 6.5], [miz, 8.0]]) for (const e of mm.topEyes) {
      const sx = Math.sign(e.eye[0]);
      chain(sx, mm.z + dz, { fit: e.fit, eyePt: e.eye }, `${mm.name} topmast backstay ${sx > 0 ? 'S' : 'P'}`, WIRE.backstay);
    }
  }

  // ---- the booms (ship.md §5, sheet 10; the O'Brien's angles from the photos; No. 2's for the show from the plan)
  const no2 = (S.booms && S.booms.no2Topping) || 62;
  const BOOMS = [
    { mast: 'fore', end: 'fwd', sx: 1, L: 55 * FT, swl: '5 t', elev: 39, slew: 33, hatch: 1, src: 'sheet 10 item 3: 55\'-0" 5 ton; photo 01 (2012) solved on its camera: 39 deg, swung 33 deg out to starboard', photo: 1.7 },
    { mast: 'fore', end: 'fwd', sx: -1, L: 55 * FT, swl: '5 t', elev: 49, slew: 19, hatch: 1, src: 'item 3; photo 01 solved: 49 deg, 19 deg out', photo: 0.4 },
    { mast: 'fore', end: 'aft', sx: 1, L: 55 * FT, swl: '5 t', elev: no2, slew: 8, hatch: 2, src: 'item 3; topped to P.SHIP.booms.no2Topping for the stage', stage: true },
    { mast: 'fore', end: 'aft', sx: -1, L: 55 * FT, swl: '5 t', elev: no2, slew: 8, hatch: 2, src: 'item 3; topped for the stage', stage: true },
    { mast: 'fore', end: 'aft', heavy: true, L: 51 * FT, swl: '30 t (HAER) / 50 t (JWB)', stowed: true, src: 'item 23: 30 ton boom 51\'-0", stowed upright' },
    { mast: 'main', end: 'aft', sx: 1, L: 47 * FT, swl: '5 t', elev: 45, slew: 15, hatch: 3, src: 'item 19: 5 ton boom 47\'-0"; photo 01: ~45 deg', photo: 45 },
    { mast: 'main', end: 'aft', sx: -1, L: 47 * FT, swl: '5 t', elev: 60, slew: 12, hatch: 3, src: 'item 19; (hidden in photo 01: estimated)' },
    { mast: 'mizzen', end: 'fwd', sx: 1, L: 55 * FT, swl: '5 t', elev: 28, slew: 20, hatch: 4, src: 'item 3; photo 01 solved: 28 deg swung 69 deg out over the pier (1.2 px); swung back to 20 deg tonight, clear of the apron where the crowd stands', photo: 1.2 },
    { mast: 'mizzen', end: 'fwd', sx: -1, L: 55 * FT, swl: '5 t', elev: 27, slew: 3, hatch: 4, src: 'item 3; photo 01 solved: 27 deg, 3 deg out', photo: 3.0 },
    { mast: 'mizzen', end: 'aft', sx: 1, L: 55 * FT, swl: '5 t', elev: 3.5, slew: 2, hatch: 5, rest: true, src: 'item 3; lowered to its rest (sheet 10 draws both positions; not topped in photo 01)' },
    { mast: 'mizzen', end: 'aft', sx: -1, L: 55 * FT, swl: '5 t', elev: 42, slew: 4, hatch: 5, src: 'item 3; photo 01 solved: 42 deg, 4 deg out (2.3 px)', photo: 2.3 },
    { mast: 'mizzen', end: 'fwd', heavy: true, L: 51 * FT, swl: '15 t (HAER) / 30 t (JWB)', stowed: true, src: 'sheet 10: 15 ton boom 51\'-0" in stowed position' },
  ];
  const pairs = {};
  for (const bm of BOOMS) {
    const mm = masts[bm.mast], dz = bm.end === 'fwd' ? -1 : 1, face = bm.end === 'fwd' ? mm.house.z0 : mm.house.z1;
    let heel, dir;
    if (bm.stowed) {
      // the heavy-lift boom stands on a heel pedestal on the deck at the house's face, upright, lashed to the mast
      heel = [0, deckCL(face + dz * 0.5) + 0.5, face + dz * 0.5];
      dir = nrm3([0, 1, -dz * 0.012]);
      B.add(M.steelOld, cyl([0, deckCL(face + dz * 0.5), heel[2]], [0, heel[1] - 0.05, heel[2]], 0.32, 0.26, { sides: 14 }), 'booms');
    } else {
      heel = [bm.sx * (mm.house.half - 0.55), mm.top + 0.16, face + dz * 0.3];
      const e = bm.elev * DEG, s = bm.slew * DEG;
      dir = [bm.sx * Math.cos(e) * Math.sin(s), Math.sin(e), dz * Math.cos(e) * Math.cos(s)];
    }
    const head = add3(heel, dir, bm.L);
    const R = bm.heavy ? [0.2, 0.25, 0.17] : [0.13, 0.168, 0.11];
    // the boom: a cigar of steel tube, thickest at mid-length; the gooseneck's fork at its heel, the head band
    B.add(bm.heavy ? M.steelOld : M.steel, lath([[0, 0], [R[0], 0], [R[1], bm.L * 0.45], [R[2], bm.L], [0, bm.L]], 16, { hard: true, seed: 0.35 }).applyMatrix4(along(heel, dir)), 'booms');
    B.add(M.steelOld, cyl(add3(heel, dir, -0.05), add3(heel, dir, 0.45), R[0] + 0.03, R[0] + 0.02, { sides: 14 }), 'booms');
    B.add(M.steelOld, cyl(add3(head, dir, -0.55), add3(head, dir, -0.25), R[2] + 0.03, R[2] + 0.03, { sides: 14 }), 'booms');
    if (!bm.stowed) {
      // the gooseneck: a bracket off the house's face, its vertical pin and the swivel
      const bk = [heel[0], heel[1], face + dz * 0.04];
      B.add(M.steelOld, mergeG([boxM(0.36, 0.42, 0.08, tr(bk[0], heel[1] - 0.12, bk[2])), bar(bk, heel, 0.16, 0.12), cyl([heel[0], heel[1] - 0.2, heel[2]], [heel[0], heel[1] + 0.2, heel[2]], 0.05, 0.05, { sides: 8 })]), 'booms');
    } else {
      // the stowage bracket (item 5) from the mast round the boom near the crosstree / masthead
      const yb = Math.min(mm.cap - 1.4, heel[1] + bm.L - 1.2), pb = add3(heel, dir, yb - heel[1]);
      B.add(M.steelOld, mergeG([bar([0, yb, mm.z + dz * (mm.r1 + 0.02)], [pb[0], yb, pb[2] - dz * 0.22], 0.14, 0.08), ring([pb[0], yb, pb[2]], [0, 1, 0], 0.27, 0.03, { seg: 16, sides: 5 })]), 'booms');
    }
    const headEye = F.eye(add3(head, dir, -0.4), [0, 1, 0], 0.045, R[2] + 0.06);
    const rec = Object.assign({}, bm, { heel, head, dir, headEye, R });
    out.booms.push(rec);
    if (!bm.heavy) (pairs[`${bm.mast}${bm.end}`] || (pairs[`${bm.mast}${bm.end}`] = [])).push(rec);
    if (bm.stowed) {
      // its purchase blocks lashed at the head (a heavy multi-sheave pair)
      F.block(add3(head, dir, -0.7), [0, -1, 0], 0.55, M.steelOld);
      F.block(add3(add3(head, dir, -0.7), [0, 0, -dz], 0.32), [0, -1, 0], 0.48, M.steelOld);
      continue;
    }
    // the topping lift: from the head's eye up to its block at the masthead (or the T's end), the fall down the mast to a
    // cleat on the house top
    const lb = mm.liftBlocks[`${bm.end}${bm.sx}`];
    const blk = F.block(lb.head, nrm3(sub3(headEye.eye, lb.head)), 0.3);
    wire(headEye.eye, blk.sheave, WIRE.lift, [headEye.fit, blk.fit], `${bm.mast} ${bm.end} ${bm.sx > 0 ? 'S' : 'P'} topping lift`);
    const cl = F.cleat([bm.sx * 0.38, mm.top + 1.2, mm.z], [bm.sx, 0, 0]);
    wire(blk.sheave, cl.at, WIRE.liftFall, [blk.fit, cl.fit], `${bm.mast} ${bm.end} ${bm.sx > 0 ? 'S' : 'P'} lift fall`, { n: 6 });
    // the cargo runner: from its winch's drum to the heel's lead block, under the boom to the head block, down to the hook
    const hb = F.block(add3(head, dir, -0.3), [0, -1, 0], 0.34);
    const lead = F.block([heel[0], mm.top - 0.55, face + dz * 0.12], nrm3([0, -0.4, dz]), 0.28);
    const drum = mach && mach.drum ? mach.drum(bm.hatch, bm.sx) : null;
    if (drum) wire(drum.p, lead.sheave, WIRE.runner, [drum.fit, lead.fit], `${bm.mast} ${bm.end} ${bm.sx > 0 ? 'S' : 'P'} runner (winch)`, { n: 6 });
    wire(lead.sheave, hb.sheave, WIRE.runner, [lead.fit, hb.fit], `${bm.mast} ${bm.end} ${bm.sx > 0 ? 'S' : 'P'} runner`, { H: 30000 });
    // the hook: hove up to the head on the stage's booms and the lowered one; hanging elsewhere, a few metres over the hatch
    const hang = bm.stage || bm.rest ? 0.7 : Math.max(1.5, hb.sheave[1] - (deckCL(hb.sheave[2]) + 0.91 + 4.2 + (bm.sx > 0 ? 0 : 1.6)));
    const hookTop = add3(hb.sheave, [0, -hang, 0]);
    const hook = hookGeo(hookTop);
    B.add(M.steelOld, hook.steel, 'hooks'); B.add(M.black, hook.ball, 'hooks');
    const hf = W.fit('hook', hook.steel, hookTop);
    W.path([hb.sheave, hookTop], Object.assign({}, WIRE.runner, { ends: [hb.fit, hf], name: `${bm.mast} ${bm.end} ${bm.sx > 0 ? 'S' : 'P'} runner fall` }));
    rec.hook = hookTop;
    // the outboard guy: a wire pendant from the head to a manila tackle on a padeye at the deck edge (No. 2's led forward,
    // clear of the stage)
    const zg = bm.stage ? mm.house.z1 + 1.6 : head[2] + dz * (bm.rest ? 0.5 : 2.5);
    const foot = deckSide(bm.sx, zg);
    const pe = F.padeye(foot, sub3(head, foot));
    const gd = nrm3(sub3(headEye.eye, pe.eye));
    const b1 = F.block(pe.eye, gd, 0.26), b2top = add3(pe.eye, gd, 1.5), b2 = F.block(b2top, gd.map(v => -v), 0.26);
    wire(headEye.eye, b2top, WIRE.guy, [headEye.fit, b2.fit], `${bm.mast} ${bm.end} ${bm.sx > 0 ? 'S' : 'P'} guy pendant`, bm.rest ? { H: 600 } : {});
    const sideV = nrm3([gd[2], 0, -gd[0]]);
    for (const k of [-1, 0, 1]) W.path([add3(b1.sheave, sideV, k * 0.05), add3(add3(b2.sheave, sideV, k * 0.05), gd, -0.02)], Object.assign({}, WIRE.tackle, { ends: [b1.fit, b2.fit], name: `guy tackle part ${k}` }));
    if (bm.rest) {
      // the boom's rest (crutch): a post at the hatch's far end with a cradle the boom lies in
      const hz = S.hatches[bm.hatch], zr = bm.end === 'aft' ? hz.z1 + 0.5 : hz.z0 - 0.5;
      const u = (zr - heel[2]) / dir[2], pb = add3(heel, dir, u), y0 = deckAt(pb[0], zr);
      // the boom's radius where it lies in the cradle (the cigar's taper), so it bears on the cradle
      const ru = u < 0.45 * bm.L ? R[0] + (R[1] - R[0]) * u / (0.45 * bm.L) : R[1] + (R[2] - R[1]) * (u - 0.45 * bm.L) / (0.55 * bm.L);
      const yc = pb[1] - ru / Math.cos(Math.asin(Math.min(0.99, Math.abs(dir[1])))) - 0.003;
      B.add(M.steelOld, mergeG([cyl([pb[0], y0 - 0.01, zr], [pb[0], yc - 0.05, zr], 0.09, 0.08, { sides: 10 }), boxM(0.5, 0.06, 0.16, tr(pb[0], yc - 0.03, zr)),
        bar([pb[0] - ru - 0.03, yc - 0.06, zr], [pb[0] - ru - 0.03, pb[1] + 0.1, zr], 0.05, 0.12), bar([pb[0] + ru + 0.03, yc - 0.06, zr], [pb[0] + ru + 0.03, pb[1] + 0.1, zr], 0.05, 0.12),
        lath([[0.35, 0], [0.35, 0.05], [0, 0.05]], 12).applyMatrix4(tr(pb[0], y0 - 0.01, zr))]), 'booms');
      rec.restAt = pb;
    }
  }
  // the schooner guys: a wire span between the heads of each topped pair (union purchase)
  for (const [k, pr] of Object.entries(pairs)) {
    const up = pr.filter(b => !b.rest);
    if (up.length === 2) wire(up[0].headEye.eye, up[1].headEye.eye, WIRE.schooner, [up[0].headEye.fit, up[1].headEye.fit], `${k} schooner guy`);
  }

  // ---- the aerials (sheet 10 items 7, 8, 21): the transmitting aerial to starboard and the auxiliary to port between the
  // main and mizzen topmasts, the emergency aerial from the main topmast to the foremast; insulators at both ends; the
  // lead-ins down to the radio room on the top of the house
  {
    const ends = (mm, sx, toward) => {
      const e = F.eye([sx * 0.13, mm.truck - 0.9, mm.z], [sx * 0.4, 0, Math.sign(toward)], 0.03);
      const ins = F.insulator(e.eye, [sx * 0.2, -0.05, Math.sign(toward)], 0.32);
      W.path([e.eye, ins.near], { r: 0.004, tone: 1, ends: [e.fit, ins.fit], name: 'aerial strop' });
      return ins;
    };
    for (const [sx, spec, name] of [[1, WIRE.aerial, 'transmitting aerial (S)'], [-1, WIRE.aerial2, 'auxiliary aerial (P)']]) {
      const a = ends(main, sx, 1), b = ends(miz, sx, -1);
      const rec = wire(a.far, b.far, spec, [a.fit, b.fit], name);
      // the lead-in from a third of the way along down to the house top (items 14, 15)
      const p = rec.pts[Math.round(rec.pts.length * 0.28)], top = S.house.top;
      const dn = [sx * 3.2, top.abl + 0.05, Math.min(top.z1 - 1.2, p[2])];
      const pe = F.padeye(dn, sub3(p, dn));
      const ins = F.insulator(pe.eye, sub3(p, pe.eye), 0.3);
      W.path([ins.far, p], Object.assign({}, WIRE.leadin, { ends: [ins.fit, null], name: name + ' lead-in' }));
      // (its upper end is clamped onto the aerial: the clamp is its fitting)
      const clamp = cyl(add3(p, [0, -0.04, 0]), add3(p, [0, 0.04, 0]), 0.02, 0.02, { sides: 6 }); B.add(M.steelOld, clamp, 'fittings');
      W.list[W.list.length - 1].ends[1] = W.fit('clamp', clamp, p);
    }
    const a = ends(main, -1, -1), b = { far: null };
    const fe = F.eye([-0.35, fore.cap + 1.5, fore.z + 0.5], [-0.4, 0, 1], 0.03);
    const ins = F.insulator(fe.eye, nrm3(sub3(a.far, fe.eye)), 0.3);
    W.path([fe.eye, ins.near], { r: 0.004, tone: 1, ends: [fe.fit, ins.fit], name: 'aerial strop' });
    wire(a.far, ins.far, WIRE.aerial2, [a.fit, ins.fit], 'emergency aerial (P, main-fore)');
    void b;
  }

  // ---- the signal halyards (item 9): from the signal yard's ends down to the flag bag on the bridge (item 11)
  if (main.signalYard) {
    const sy = main.signalYard, br = S.house.bridge;
    for (const sx of [-1, 1]) for (const k of [0, 1]) {
      const p = [sx * (sy.half - 0.15 - k * 0.35), sy.y - 0.05, sy.z];
      const blk = F.block(p, [0, -1, 0], 0.12);
      const foot = [sx * (3.0 + k * 0.4), br.abl + 1.0, br.z0 + 1.0];
      const cl = F.cleat([foot[0], br.abl + 0.9, br.z0 + 0.6], [0, 0, 1]);
      W.add(blk.sheave, cl.at, Object.assign({}, WIRE.halyard, { ends: [blk.fit, cl.fit], name: `signal halyard ${sx > 0 ? 'S' : 'P'}${k}` }));
    }
  }

  out.masts = masts;
  out.measures = {
    masts: Object.fromEntries(Object.entries(masts).map(([k, m]) => [k, {
      lowerAboveDeck: +(m.cap - m.deck).toFixed(2), withTopmast: m.truck ? +(m.truck - m.deck).toFixed(2) : null,
      source: { fore: 'JWB: 40\'-3 5/16" = 12.28 m fixed; HAER sheet 10: 82\'-0" ABL fitting', main: 'JWB: 42\'-11 3/16" = 13.08 m; 62\'-11 3/16" = 19.18 m with topmast', mizzen: 'JWB: 42\'-2 7/16" = 12.86 m; 62\'-2 7/16" = 18.96 m' }[k],
      capAbl: +m.cap.toFixed(2), truckAbl: m.truck ? +m.truck.toFixed(2) : null, houseTop: +m.top.toFixed(2),
    }])),
    booms: out.booms.map(b => ({ mast: b.mast, end: b.end, side: b.sx ? (b.sx > 0 ? 'S' : 'P') : 'CL', length: +len3(sub3(b.head, b.heel)).toFixed(2), lengthFt: +(len3(sub3(b.head, b.heel)) / FT).toFixed(1), swl: b.swl,
      elevation: b.stowed ? 'stowed upright' : b.elev, photoFitPx: b.photo ?? null, slew: b.slew ?? null, headAbl: +b.head[1].toFixed(2), source: b.src })),
  };
  return out;
}

// a cargo hook with its swivel and a headache ball (the weight that keeps an empty runner hanging), hung from 'top'
function hookGeo(top) {
  const [x, y, z] = top;
  const hook = [[x, y - 0.8, z], [x, y - 0.95, z]];
  for (let k = 1; k <= 10; k++) { const a = Math.PI + k / 10 * 1.3 * Math.PI; hook.push([x + 0.09 + Math.cos(a) * 0.09, y - 0.95 + Math.sin(a) * 0.09, z]); }
  const steel = mergeG([cyl([x, y + 0.02, z], [x, y - 0.31, z], 0.035, 0.035, { sides: 8 }), lath([[0, 0], [0.06, 0], [0.06, 0.1], [0, 0.13]], 10).applyMatrix4(tr(x, y - 0.81, z)),
    tube(hook, 0.024, { sides: 5 })]);
  const ball = lath([[0, 0], [0.12, 0.04], [0.17, 0.2], [0.12, 0.36], [0, 0.4]], 14, { hard: false }).applyMatrix4(tr(x, y - 0.7, z));
  return { steel, ball };
}
