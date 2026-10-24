// liberty/src/deck/lights.js: her lights (B2): the cargo floods under the masts' yards lighting the hatches, the anchor
// lights, the navigation lights' lanterns (range lights on the fore and main crosstrees, side lights in their screens at
// the bridge wings' ends, the stern light at the taffrail), the not-under-command lights and the Morse light on the main,
// the yardarm blinkers, the signal searchlights on the bridge wings, the gangway's lamp.
//
// Sources: research/ship.md §7 (sheet 10's legend: range lights 24, side lights, stern light 1, anchor light 2, the NUC
// lights 17-18, the Morse light), rule 19 (the masts carry floodlight fittings under the crosstrees: photos 25, 27).
// What is lit tonight: she is moored, so her navigation lights are dark (their coloured lenses read by day and catch the
// show's light); the anchor lights burn white fore and aft, as a museum ship's do at her berth; the cargo floods light
// the working hatches (No. 1, 3, 4, 5: the stage's No. 2 is the show's, its floods off); the gangway is lit. Floods and
// lamps are world.light point lights (the 24 nearest) or emissive (plan: B2's spot budget is 12 and isn't spent here).
import { SH, deckAt, deckCL, tr, ry, mul, along, lath, cyl, boxM, bar, disc, mergeG } from './ship.js';
import { lin } from 'scene3d/util.js';

const T = window.THREE;
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm3 = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function buildLights(world, M, ctx, B, W, seat, rig, extra = {}) {
  const S = SH, out = { lights: [], measures: {} };
  const on = (t) => { const n = world.U.uNight ? world.U.uNight.value : 1; return Math.min(1, Math.max(0, (n - 0.25) / 0.3)); };
  const toW = p => SH.toWorld(p[0], p[1], p[2]);
  const record = (kind, p, color, lit, extraInfo = {}) => out.lights.push(Object.assign({ kind, pos: toW(p).map(v => +v.toFixed(2)), color, on: lit }, extraInfo));
  // a flood: a drum housing on a bracket, its lens toward the aim
  const flood = (p, aim, lit, hang) => {
    const d = nrm3(sub3(aim, p));
    B.add(M.black, cyl(add3(p, d, -0.2), add3(p, d, 0.1), 0.17, 0.2, { sides: 14 }), 'lamps');
    B.add(lit ? M.lampWarm : M.lampOff, disc(add3(p, d, 0.105), d, 0.18, 14), 'lamps');
    B.add(M.steel, mergeG([bar(p, hang, 0.04, 0.04), cyl(add3(p, [-0.05, 0, 0], 1), add3(p, [0.05, 0, 0], 1), 0.03, 0.03, { sides: 6 })]), 'lamps');
  };
  // a lantern: an all-round lens in a brass-capped housing (anchor, stern, range, NUC, Morse)
  const lantern = (p, lit, mat) => {
    B.add(M.black, mergeG([lath([[0, 0], [0.13, 0], [0.13, 0.04], [0.09, 0.05]], 12).applyMatrix4(tr(...p)), lath([[0.09, 0.33], [0.14, 0.34], [0.12, 0.42], [0.04, 0.46], [0, 0.48]], 12).applyMatrix4(tr(...p))]), 'lamps');
    B.add(lit ? mat : M.lampOff, lath([[0.1, 0.05], [0.115, 0.12], [0.115, 0.26], [0.1, 0.33]], 14, { hard: false }).applyMatrix4(tr(...p)), 'lamps');
  };

  // ---- the cargo floods: under each mast's yard, two each way
  const pools = {};
  for (const mm of Object.values(rig.masts)) for (const l of mm.lamps) {
    const hang = [l.p[0] * 0.9, mm.lampYard - 0.05, mm.z];
    flood(l.p, l.aim, l.on, hang);
    record('cargo flood', l.p, '#ffcf8a', l.on, { hatch: l.hatch, aim: toW(l.aim).map(v => +v.toFixed(2)) });
    if (l.on) (pools[l.hatch] || (pools[l.hatch] = [])).push(l);
  }
  // one point light a hatch: between its lamps and their pool, so the pool sits on the tarp and the house face is lit too
  const warm = lin('#ffcf8a');
  for (const [h, ls] of Object.entries(pools)) {
    const p = ls.reduce((a, l) => add3(a, l.p, 1 / ls.length), [0, 0, 0]), a = ls.reduce((s, l) => add3(s, l.aim, 1 / ls.length), [0, 0, 0]);
    const lp = add3(p, sub3(a, p), 0.45);
    world.light({ pos: toW(lp), color: warm, intensity: 22, radius: 16, on: on });
  }
  // ---- the anchor lights (white, all round): forward on the jackstaff's arm, aft at the ensign staff (item 2)
  const fore = rig.masts.fore, main = rig.masts.main;
  const aFwd = [0, S.sideAbl(S.stemZ + 0.8) + 1.5 + 2.2, S.stemZ + 0.76 - 0.12], aAft = [-2.5 + 0.2, S.stern.platform.abl + 2.6, S.stern.platform.z1 - 1.5];                // (on the ensign staff: item 2)
  for (const [p, n] of [[aFwd, 'anchor light (forward)'], [aAft, 'anchor light (aft)']]) {
    lantern(p, true, M.lampWhite);
    B.add(M.steel, bar(add3(p, [0, 0.02, 0]), add3(p, n.includes("forward") ? [0, 0.02, 0.12] : [-0.2, 0.02, 0]), 0.03, 0.03), 'lamps');
    world.light({ pos: toW(add3(p, [0, 0.2, 0])), color: lin('#f2f0e6'), intensity: 3, radius: 7, on: on });
    record(n, add3(p, [0, 0.2, 0]), '#f2f0e6', true);
  }
  // ---- navigation lights (dark tonight): range lights on the fore and main crosstrees, side lights in their screens at the
  // bridge wings' ends, the stern light at the taffrail; the NUC lights and the Morse light on the main; blinkers on the fore
  if (fore.rangeLight) { lantern(fore.rangeLight, false); record('range light (fore)', fore.rangeLight, '#f2f0e6', false); }
  if (main.rangeLight) { lantern(main.rangeLight, false); record('range light (main)', main.rangeLight, '#f2f0e6', false); }
  if (main.nuc) for (const p of main.nuc) { lantern(p, false); B.add(M.steel, bar(add3(p, [0, 0.47, 0]), add3(p, [-0.72, 0.47, 0]), 0.03, 0.03), 'lamps'); record('not under command', p, '#ff3a26', false); }
  if (main.morse) { lantern(main.morse, false); record('Morse light', main.morse, '#f2f0e6', false); }
  if (fore.blinkers) for (const p of fore.blinkers) { lantern(p, false); record('yardarm blinker', p, '#f2f0e6', false); }
  const br = Object.assign({}, S.house.bridge);
  // the wings' ends from B1's bridge deck outline (the widest part of its plan), else the plan's wings
  const BD = seat.hull && seat.hull.houses && seat.hull.houses.find(h => h.name === 'bridge deck');
  let wing = { x: 8.3, z0: br.wings ? br.wings[0] : br.z0, z1: br.wings ? br.wings[1] : br.z0 + 3 };
  if (BD) { const xm = Math.max(...BD.polyShip.map(p => Math.abs(p[0]))), zz = BD.polyShip.filter(p => Math.abs(p[0]) > xm - 0.05).map(p => p[1]); wing = { x: xm, z0: Math.min(...zz), z1: Math.max(...zz) }; br.abl = BD.top; }
  for (const sx of [-1, 1]) {
    // the side light in its screen: a box open forward and outboard, the lens inside (red to port, green to starboard)
    // (B1's anchors.sideLights give the screens' places on the wings when it exports them)
    const SL = seat.A && seat.A.sideLights, sl = SL && (Array.isArray(SL) ? SL.find(q => (q.side === 'starboard' || q.side > 0) === (sx > 0)) : SL[sx > 0 ? 'starboard' : 'port']);
    const slp = sl && (sl.ship || (Array.isArray(sl) ? sl : sl.p && (sl.p.ship || sl.p)));
    const p = slp && slp.length === 3 ? [slp[0], slp[1] + 0.3, slp[2]] : [sx * (wing.x - 0.3), br.abl + 1.15, (wing.z0 + wing.z1) / 2 - 0.3];
    if (slp) seat.used[`sideLights.${sx > 0 ? 'starboard' : 'port'}`] = 'hull';
    B.add(M.black, mergeG([boxM(0.04, 0.55, 1.0, tr(p[0] - sx * 0.22, p[1], p[2] + 0.2)), boxM(0.45, 0.04, 1.0, tr(p[0] - sx * 0.02, p[1] + 0.28, p[2] + 0.2)), boxM(0.45, 0.04, 1.0, tr(p[0] - sx * 0.02, p[1] - 0.28, p[2] + 0.2))]), 'lamps');
    B.add(M.steel, cyl([p[0] - sx * 0.02, br.abl, p[2] + 0.4], [p[0] - sx * 0.02, p[1] - 0.29, p[2] + 0.4], 0.035, 0.035, { sides: 6 }), 'lamps');
    lantern(add3(p, [0, -0.262, 0]), false);
    B.add(sx < 0 ? M.lampRed : M.lampGreen, lath([[0.1, 0.05], [0.116, 0.12], [0.116, 0.26], [0.1, 0.33]], 14, { hard: false }).applyMatrix4(tr(...add3(p, [0, -0.265, 0]))), 'lamps');
    record(sx < 0 ? 'port side light' : 'starboard side light', p, sx < 0 ? '#ff3a26' : '#2bff7a', false);
    // the signal searchlight on its pedestal at the wing's end (12 in)
    const q = [sx * (wing.x - 1.0), br.abl, (wing.z0 + wing.z1) / 2];
    B.add(M.steel, mergeG([cyl(q, add3(q, [0, 0.95, 0]), 0.06, 0.05, { sides: 10 }), bar(add3(q, [-0.24, 0.97, 0]), add3(q, [0.24, 0.97, 0]), 0.05, 0.05), bar(add3(q, [-0.22, 0.97, 0]), add3(q, [-0.22, 1.25, 0]), 0.04, 0.04), bar(add3(q, [0.22, 0.97, 0]), add3(q, [0.22, 1.25, 0]), 0.04, 0.04)]), 'lamps');
    B.add(M.black, cyl(add3(q, [0, 1.25, 0.2]), add3(q, [0, 1.25, -0.3]), 0.2, 0.2, { sides: 16 }), 'lamps');
    B.add(M.lampOff, disc(add3(q, [0, 1.25, -0.305]), [0, 0, -1], 0.18, 16), 'lamps');
    record('signal searchlight', add3(q, [0, 1.25, -0.3]), '#f2f0e6', false);
  }
  { const z = S.sternZ - 2.2, y0 = deckAt(0, z), p = [0, y0 + 1.05, z]; lantern(p, false); B.add(M.steel, cyl([0, y0, z], [0, y0 + 1.06, z], 0.04, 0.04, { sides: 8 }), 'lamps'); record('stern light', p, '#f2f0e6', false); }
  // ---- the gangway's lamp (on), at its head (gangway.js passes its place)
  if (extra.gangwayLamp) {
    const p = extra.gangwayLamp;
    flood(p, add3(p, [0.6, -1, 0.4]), true, add3(p, [0, 0.4, 0]));
    world.light({ pos: toW(add3(p, [0.4, -0.8, 0.2])), color: warm, intensity: 6, radius: 9, on: on });
    record('gangway lamp', p, '#ffcf8a', true);
  }
  out.measures = { lamps: out.lights.length, lit: out.lights.filter(l => l.on).length, pointLights: Object.keys(pools).length + 2 + (extra.gangwayLamp ? 1 : 0), spots: 0, budget: 'spots 12 (unused), point lights from the 24 nearest' };
  return out;
}
