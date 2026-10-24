// liberty/src/far/bridges.js: the bay's bridges (B6), placed on OpenStreetMap's mapped piers and towers (ODbL, ©
// OpenStreetMap contributors: the positions only) and built to their published dimensions:
//  - the Bay Bridge's west span (1936): two suspension bridges end to end through the central anchorage (pier W4),
//    main spans 2,310 ft (704 m), side spans 1,160 ft (354 m), towers 160 m above the water, the double deck's truss
//    30 ft deep with 220 ft (67 m) under it; the Bay Lights (2013, relit 2026-03-20: white LEDs 30 cm apart on the
//    north-facing suspenders, never-repeating patterns sweeping along and down; site.md §3), the 1986 'necklace' on the
//    main cables, the roadway's lamps, the towers' red beacons, the channel's green and red lights under the spans
//  - its east span (2013): the self-anchored suspension span's single tower (525 ft, 160 m), its 385 m main span, the
//    skyway's twin box girders to Oakland
//  - the Golden Gate (1937): towers 746 ft (227 m), main span 4,200 ft (1,280 m), side spans 1,125 ft (343 m), deck
//    67 m clear, International Orange, floodlit, red beacons on the towers, the roadway's sodium lamps
//  - the Richmond-San Rafael (1956) at 14 km: a line of lamps over the water and its two cantilever humps
// Each deck carries its traffic (cars' heads and tails, a pure function of t).
import * as P from '../plan.js';
import { beam, box, merge } from 'scene3d/geom.js';
import { lin, hash1 } from 'scene3d/util.js';
import { solidMat, lineMat, lineMesh, AIR_GLSL, AIR_U } from './structure.js';
import { lightSet, LIGHT_COL } from './sprites.js';

const T = window.THREE;
const v2 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

// ---- the west span's mapped points (world x, z: OSM ways' centres; tools/far notes)
export const BAY = {
  W1: [1477, 2364], W2: [1723, 2106], W3: [2210, 1597], W4: [2473, 1333], W5: [2734, 1050], W6: [3222, 542], WY: [3481, 274],
  rincon: [1282, 2568],
  towerTop: 160, saddle: 156.5, truss: 9.15, half: 10.05, panel: 9.144,
  // the truss's underside (m above the water) at stations along the axis from W1: the SF approach, W1, the main spans'
  // middles 67 m (220 ft clear), the central anchorage, the YBI anchorage
  deck: [[-700, 22], [-300, 44], [0, 57], [708, 67], [1430, 63], [2166, 67], [2891, 59], [3060, 56]],
  east: { W2: [3800, -54], T1: [3951, -152], E2: [4275, -361], end: [7036, -1068], tower: 160, deckY: 54 },
};
export const GG = { S: [-6199, -968], N: [-6238.5, -2249], S1: [-6187, -627], N1: [-6250, -2594], towerTop: 227.4, saddle: 222, half: 13.7, truss: 7.6, panel: 7.6 };

function smoothProfile(knots) {
  // Catmull-Rom through (s, y) knots, clamped at the ends
  return s => {
    let i = 0; while (i < knots.length - 2 && s > knots[i + 1][0]) i++;
    const k0 = knots[Math.max(0, i - 1)], k1 = knots[i], k2 = knots[i + 1], k3 = knots[Math.min(knots.length - 1, i + 2)];
    const t = Math.max(0, Math.min(1, (s - k1[0]) / (k2[0] - k1[0])));
    const m1 = (k2[1] - k0[1]) / Math.max(k2[0] - k0[0], 1) * (k2[0] - k1[0]), m2 = (k3[1] - k1[1]) / Math.max(k3[0] - k1[0], 1) * (k2[0] - k1[0]);
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * k1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * k2[1] + (t3 - t2) * m2;
  };
}
// a parabola through a and b (stations sa, sb; heights ya, yb) with its lowest at ymin (a main span), or a sag f below
// the chord (a side span)
const mainCable = (sa, ya, sb, yb, ymin) => s => { const m = (sa + sb) / 2, h = (sb - sa) / 2, u = (s - m) / h; return ymin + (Math.max(ya, yb) - ymin) * u * u; };
const sideCable = (sa, ya, sb, yb, f) => s => { const u = (s - sa) / (sb - sa); return ya + (yb - ya) * u - 4 * f * u * (1 - u); };

// the Bay Lights (Leo Villareal; Illuminate 2026): a never-repeating field over (station s, height h, t). Bands that
// travel along the span, falls down the cables, a slow tide of brightness, a sparkle; modes cross-fade every ~37 s
const BAYLIGHTS = /* glsl */`
float bl_h(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float bayLights(float s, float h, float t) {
  float L = 2900.0;
  float m0 = floor(t / 37.0), mf = smoothstep(0.75, 1.0, fract(t / 37.0));
  float a = 0.0;
  for (int k = 0; k < 2; k++) {
    float md = bl_h(m0 + float(k) * 1.0 + 3.1);
    float tk = t;
    float v = mix(30.0, 95.0, bl_h(m0 + float(k) + 7.7)) * (bl_h(m0 + float(k) + 9.3) < 0.5 ? -1.0 : 1.0);
    float w = mix(25.0, 140.0, bl_h(m0 + float(k) + 1.9));
    // travelling bands
    float x = fract((s - v * tk) / (w * 4.0)) * 4.0 - 2.0;
    float band = exp(-x * x * 3.0);
    // falls down each cable (rain)
    float cab = floor(s / 9.144);
    float rate = mix(4.0, 14.0, bl_h(cab * 0.37 + m0));
    float drop = fract((h + rate * tk) / mix(18.0, 50.0, bl_h(cab + m0 * 3.0)) + bl_h(cab * 1.7));
    float rain = smoothstep(0.0, 0.08, drop) * (1.0 - smoothstep(0.08, 0.35, drop));
    // a slow tide along the whole span
    float tide = 0.5 + 0.5 * sin(s / L * 6.2831 * mix(1.0, 3.0, bl_h(m0 + 5.0)) - tk * 0.21);
    float sel = floor(md * 3.0);
    float val = sel < 0.5 ? band : (sel < 1.5 ? rain : tide * tide);
    a += (k == 0 ? 1.0 - mf : mf) * val;
  }
  // the LEDs' sparkle: each 30 cm point flips at 6 Hz, a few points at a time
  float sp = step(0.985, bl_h(floor(h / 0.3) * 13.0 + floor(s / 9.144) * 7.0 + floor(t * 6.0) * 0.1));
  return clamp(0.35 + 0.75 * a + sp * 0.6, 0.0, 1.6);
}`;

export function buildBridges(world, ctx, D, lights) {
  const t0 = performance.now();
  const out = { tris: 0, segs: 0 };
  const heightAt = (x, z) => D.near.at(x, z) ?? D.mid.at(x, z) ?? D.far.at(x, z) ?? -20;
  // ---- materials
  const M = {
    bbSteel: solidMat(world, 'bay bridge steel', '#8d9499', { night: 0.55 }),
    concrete: solidMat(world, 'bridge concrete', '#a7a59e', { night: 0.5 }),
    ggSteel: solidMat(world, 'golden gate steel', '#c0362c', { flood: '#ffb070', floodH: 120, night: 0.8 }),
    sasSteel: solidMat(world, 'sas steel', '#c9cccc', { flood: '#dfe8ff', floodH: 200, night: 0.6 }),
    deck: solidMat(world, 'bridge deck', '#5c5f63', { night: 0.6 }),
    cable: lineMat(world, 'bay bridge cables', '#a4abb0', { minPx: 1.2 }),
    ggCable: lineMat(world, 'golden gate cables', '#b8402f', { minPx: 1.15, night: 0.8 }),
    bayLights: lineMat(world, 'the bay lights', '#9aa1a6', {
      minPx: 2.6, uniforms: { uBayGain: { value: 3.0 } }, night: 0.5, head: BAYLIGHTS, glow: true,
      emit: `float on = smoothstep(0.1, 0.5, uNight);
  if (vLe.x > 0.5 && on > 0.0) {
    float t = uTime + 1000.0;
    float b = bayLights(vLs.x, vLs.y, t);
    // the LEDs themselves where a 30 cm pitch is resolved; their average where it isn't
    float fw = fwidth(vLs.y) / 0.3;
    float dot_ = mix(step(fract(vLs.y / 0.3), 0.45), 0.45, smoothstep(0.3, 0.9, fw));
    // (a line of point lights: its brightness per unit length kept as the line is drawn wider than it is)
    s.emissive += vec3(0.92, 0.95, 1.0) * b * dot_ * uBayGain * 2.4 * on * gProf * clamp(2.2 / max(vLs.w * 0.12, 1.0), 0.35, 1.0);
  }`,
    }),
  };
  // the lights module's sets: the bridges' fixed lamps and beacons
  const L = lights;
  // ======================================================================== the Bay Bridge, west span
  {
    const B = BAY, o = B.W1, ax = [B.WY[0] - o[0], B.WY[1] - o[1]], len = Math.hypot(ax[0], ax[1]);
    const u = [ax[0] / len, ax[1] / len], n = [-u[1], u[0]];          // along the span (SF -> YBI), across (n: to the south)
    const st = p => (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1];
    const at = (s, off = 0) => [o[0] + u[0] * s + n[0] * off, o[1] + u[1] * s + n[1] * off];
    const S = { W1: 0, W2: st(B.W2), W3: st(B.W3), W4: st(B.W4), W5: st(B.W5), W6: st(B.W6), WY: st(B.WY) };
    const bot = smoothProfile(B.deck), top = s => bot(s) + B.truss;
    out.bayStations = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, +v.toFixed(1)]));
    // the cables: bridge 1 W1 -> W2 -> W3 -> W4, bridge 2 W4 -> W5 -> W6 -> WY
    const anchorY = s => top(s) + 4.0;
    const cab = [
      [S.W1, S.W2, sideCable(S.W1, anchorY(S.W1), S.W2, B.saddle, 14)],
      [S.W2, S.W3, mainCable(S.W2, B.saddle, S.W3, B.saddle, top((S.W2 + S.W3) / 2) + 2.2)],
      [S.W3, S.W4, sideCable(S.W3, B.saddle, S.W4, anchorY(S.W4) + 6, 14)],
      [S.W4, S.W5, sideCable(S.W4, anchorY(S.W4) + 6, S.W5, B.saddle, 14)],
      [S.W5, S.W6, mainCable(S.W5, B.saddle, S.W6, B.saddle, top((S.W5 + S.W6) / 2) + 2.2)],
      [S.W6, S.WY, sideCable(S.W6, B.saddle, S.WY, anchorY(S.WY), 14)],
    ];
    const cableY = s => { for (const [a, b, f] of cab) if (s >= a && s <= b) return f(s); return null; };
    // the truss: two faces (north, south) as see-through bands, the decks inside, from the SF approach to the YBI portal
    const sEnd = (() => { for (let s = S.WY; s < S.WY + 600; s += 4) { const [x, z] = at(s); if (heightAt(x, z) > bot(s) + 2) return s; } return S.WY + 300; })();
    out.bayDeckEnd = +sEnd.toFixed(0);
    const trussG = [], deckG = [];
    const s0 = -650;
    for (let s = s0; s < sEnd; s += 18) {
      const s1 = Math.min(s + 18, sEnd);
      for (const side of [-1, 1]) {
        const a = at(s, side * B.half), b = at(s1, side * B.half);
        trussG.push([a[0], bot(s), a[1], b[0], bot(s1), b[1], s, s1, side]);
      }
      // the upper deck (its roadway slab) and the lower deck, as two thin slabs
      for (const [y0, y1] of [[top(s) - 0.6, top(s)], [bot(s) + 1.2, bot(s) + 1.8]]) {
        const yy = (y0 + y1) / 2, yy1 = yy + (top(s1) - top(s));
        const a = at(s), b = at(s1);
        deckG.push(beam([a[0], yy, a[1]], [b[0], yy1, b[1]], B.half * 2 - 0.4, y1 - y0));
      }
    }
    out.tris += buildTruss(world, trussG, B.truss, B.panel, M.bbSteel, 'bay bridge:truss', 1);
    world.mesh(merge(deckG), M.deck, { name: 'bay bridge:decks', cast: false });
    // the towers W2 W3 W5 W6: two legs on a caisson pier, X-braced below the deck, two X panels and a top strut above
    const towerG = [], pierG = [];
    for (const k of ['W2', 'W3', 'W5', 'W6']) {
      const s = S[k], yb = bot(s), yt = top(s), H = B.towerTop;
      const c = at(s);
      pierG.push(box([c[0], 4, c[1]], [26, 14, 52], { rotY: -Math.atan2(u[1], u[0]) }));
      for (const side of [-1, 1]) {
        const p = at(s, side * B.half);
        towerG.push(beam([p[0], 10, p[1]], [p[0], H, p[1]], 6.0, 4.4, { up: [u[0], 0, u[1]] }));
      }
      const leg = (side, y) => { const p = at(s, side * B.half); return [p[0], y, p[1]]; };
      const xpanel = (ya, yb2, w) => { towerG.push(beam(leg(-1, ya), leg(1, yb2), w, w)); towerG.push(beam(leg(1, ya), leg(-1, yb2), w, w)); towerG.push(beam(leg(-1, ya), leg(1, ya), w * 1.2, w * 1.6)); };
      xpanel(12, (12 + yb) / 2, 1.8); xpanel((12 + yb) / 2, yb - 1, 1.8);
      xpanel(yt + 2, (yt + H) / 2, 1.4); xpanel((yt + H) / 2, H - 3, 1.4);
      towerG.push(beam(leg(-1, H - 2), leg(1, H - 2), 3.0, 4.0));
      // the cable saddles' housings
      for (const side of [-1, 1]) { const p = at(s, side * B.half); towerG.push(box([p[0], H + 1.2, p[1]], [7, 2.4, 5.4], { rotY: -Math.atan2(u[1], u[0]) })); }
      // the beacons: two steady reds on the saddles
      for (const side of [-1, 1]) { const p = at(s, side * B.half); L.fixed.add(p[0], H + 3.0, p[1], LIGHT_COL.red, 3.0, { size: 1.2, minPx: 2.2, on: 0 }); }
      // the channel lights under the main spans' piers: green
      L.fixed.add(c[0] - n[0] * 30, 12, c[1] - n[1] * 30, LIGHT_COL.green, 1.6, { size: 0.8, minPx: 1.8, on: 0 });
    }
    world.mesh(merge(towerG), M.bbSteel, { name: 'bay bridge:towers', cast: false });
    // the anchorages: W1 (SF), W4 (the central one, up to the deck and above), WY (Yerba Buena)
    for (const [k, w, d, h] of [['W1', 30, 34, top(S.W1) + 8], ['W4', 52, 34, top(S.W4) + 10], ['WY', 44, 34, top(S.WY) + 8]]) {
      const c = at(S[k]);
      pierG.push(box([c[0], h / 2 - 2, c[1]], [w, h + 4, d], { rotY: -Math.atan2(u[1], u[0]) }));
      pierG.push(box([c[0], h + 3, c[1]], [w * 0.7, 6, d * 0.8], { rotY: -Math.atan2(u[1], u[0]) }));
    }
    // the SF approach's bents down to Rincon Hill
    for (let s = s0 + 40; s < -30; s += 60) { const c = at(s); const g = heightAt(c[0], c[1]); pierG.push(box([c[0], (g + bot(s)) / 2, c[1]], [4, bot(s) - g + 2, B.half * 2], { rotY: -Math.atan2(u[1], u[0]) })); }
    world.mesh(merge(pierG), M.concrete, { name: 'bay bridge:piers and anchorages', cast: false });
    // cables (two planes) and suspenders every 30 ft; the north plane's suspenders are the Bay Lights
    const segs = [], susp = [];
    for (const side of [-1, 1]) {
      for (const [a, b, f] of cab) {
        const N = Math.ceil((b - a) / 9);
        for (let i = 0; i < N; i++) {
          const sa = a + (b - a) * i / N, sb = a + (b - a) * (i + 1) / N;
          const pa = at(sa, side * B.half), pb = at(sb, side * B.half);
          segs.push({ a: [pa[0], f(sa), pa[1]], b: [pb[0], f(sb), pb[1]], w: 0.72 });
        }
        for (let s = Math.ceil(a / B.panel) * B.panel; s < b - 2; s += B.panel) {
          const y = f(s), yt = top(s); if (y - yt < 1.0) continue;
          if ([S.W1, S.W4, S.WY].some(sa => Math.abs(s - sa) < 30)) continue;        // (none inside an anchorage's block)
          const p = at(s, side * B.half);
          susp.push({ a: [p[0], yt, p[1]], b: [p[0], y, p[1]], w: 0.12, s, h0: 0, h1: y - yt, e: [side < 0 ? 1 : 0, 0, 0, 0] });
        }
      }
    }
    lineMesh(world, M.cable, segs.concat(susp.map(g => Object.assign({}, g, { e: [0, 0, 0, 0] }))), 'bay bridge:cables and suspenders');
    lineMesh(world, M.bayLights, susp.filter(g => g.e[0] > 0.5), 'bay bridge:the Bay Lights');
    out.bayLightsCables = susp.filter(g => g.e[0] > 0.5).length; out.segs += segs.length + susp.length;
    // the necklace: white lamps on the main cables, every third suspender; the roadway's lamps both sides every 46 m
    for (const side of [-1, 1]) {
      for (const [a, b, f] of cab) for (let s = a + 27.4; s < b - 5; s += 27.4) { const p = at(s, side * B.half); L.fixed.add(p[0], f(s) + 0.6, p[1], LIGHT_COL.white, 2.2, { size: 0.9, minPx: 1.6 }); }
      for (let s = s0 + 20; s < sEnd - 10; s += 45.7) { const p = at(s, side * (B.half - 1.5)); L.fixed.add(p[0], top(s) + 9.0, p[1], LIGHT_COL.sodium, 1.5, { size: 0.9, minPx: 1.5 }); }
      // the lower deck's lamps showing through the truss
      for (let s = s0 + 30; s < sEnd - 10; s += 36.6) { const p = at(s, side * (B.half - 2.5)); L.fixed.add(p[0], bot(s) + 6.0, p[1], LIGHT_COL.amber, 0.8, { size: 0.7, minPx: 1.3 }); }
    }
    // traffic: the upper deck westbound into the city (5 lanes), the lower deck eastbound (5 lanes)
    const lane = (off, y, dir) => { const pts = []; for (let s = dir > 0 ? s0 : sEnd; dir > 0 ? s <= sEnd : s >= s0; s += 30 * dir) { const p = at(s, off); pts.push([p[0], (y === 'top' ? top(s) + 0.9 : bot(s) + 2.6), p[1]]); } return pts; };
    for (let k = 0; k < 5; k++) {
      L.traffic.lane(lane(-7 + k * 3.5, 'top', -1), { speed: 22, per: 18, seed: 11 + k });
      L.traffic.lane(lane(-7 + k * 3.5, 'bot', 1), { speed: 22, per: 18, seed: 31 + k });
    }
    out.bay = { stations: out.bayStations, top: +top(S.W2).toFixed(1), midClear: +bot((S.W2 + S.W3) / 2).toFixed(1), cableLow: +cableY((S.W2 + S.W3) / 2).toFixed(1), towerTop: B.towerTop };
    out.bayAxis = { o, u, n };
  }
  // ======================================================================== the Bay Bridge, east span
  {
    const E = BAY.east, a = E.W2, b = E.end, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-u[1], u[0]];
    const at = (s, off = 0) => [a[0] + u[0] * s + n[0] * off, a[1] + u[1] * s + n[1] * off];
    const sT = (E.T1[0] - a[0]) * u[0] + (E.T1[1] - a[1]) * u[1], sE2 = (E.E2[0] - a[0]) * u[0] + (E.E2[1] - a[1]) * u[1];
    const deckY = s => s < sE2 ? E.deckY : E.deckY - (E.deckY - 12) * Math.min(1, (s - sE2) / (len - sE2));
    const G = [], P2 = [];
    // the twin box girders (16 m apart), piers every 160 m on the skyway
    for (let s = 0; s < len; s += 40) {
      const s1 = Math.min(s + 40, len);
      for (const off of [-12, 12]) { const p = at(s, off), q = at(s1, off); G.push(beam([p[0], deckY(s) - 2, p[1]], [q[0], deckY(s1) - 2, q[1]], 22, 5.5)); }
    }
    for (let s = sE2; s < len - 50; s += 160) for (const off of [-12, 12]) { const p = at(s, off); P2.push(box([p[0], deckY(s) / 2 - 3, p[1]], [7, deckY(s) + 2, 9], { rotY: -Math.atan2(u[1], u[0]) })); }
    world.mesh(merge(G), M.concrete, { name: 'bay bridge east:girders', cast: false });
    world.mesh(merge(P2), M.concrete, { name: 'bay bridge east:piers', cast: false });
    // the SAS tower: four legs joined by shear links, 160 m; its single cable plane looped over it
    const TG = [], c = at(sT);
    for (const [du, dn] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
      const p = [c[0] + u[0] * du + n[0] * dn, c[1] + u[1] * du + n[1] * dn];
      TG.push(beam([p[0], 0, p[1]], [p[0] * 0.98 + c[0] * 0.02, E.tower, p[1] * 0.98 + c[1] * 0.02], 4.6, 4.6, { up: [u[0], 0, u[1]] }));
    }
    for (let y = 20; y < E.tower - 5; y += 18) TG.push(box([c[0], y, c[1]], [12, 1.2, 12], { rotY: -Math.atan2(u[1], u[0]) }));
    world.mesh(merge(TG), M.sasSteel, { name: 'bay bridge east:SAS tower', cast: false });
    L.fixed.add(c[0], E.tower + 2, c[1], LIGHT_COL.red, 3.0, { size: 1.2, minPx: 2.2, on: 0, period: 1.5, duty: 0.5 });
    const cy = s => s < sT ? mainCable(-sT, E.tower - 4, sT, E.tower - 4, deckY(0) + 8)(s) : mainCable(sT, E.tower - 4, 2 * sE2 - sT, E.tower - 4, deckY(sE2) + 6)(s);
    const segs = [], susp = [];
    for (let s = 0; s < sE2; s += 10) {
      const pa = at(s), pb = at(Math.min(s + 10, sE2));
      segs.push({ a: [pa[0], cy(s), pa[1]], b: [pb[0], cy(Math.min(s + 10, sE2)), pb[1]], w: 0.8 });
      if (Math.abs(s - sT) > 8) for (const off of [-1.5, 1.5]) { const p = at(s, off); susp.push({ a: [p[0], deckY(s), p[1]], b: [p[0], cy(s), p[1]], w: 0.15 }); }
      L.fixed.add(pa[0], cy(s) + 0.5, pa[1], LIGHT_COL.led4000, 1.6, { size: 0.8, minPx: 1.4 });
    }
    lineMesh(world, M.cable, segs.concat(susp), 'bay bridge east:cable');
    for (let s = 20; s < len; s += 40) for (const off of [-12, 12]) { const p = at(s, off + Math.sign(off) * 9); L.fixed.add(p[0], deckY(s) + 7, p[1], LIGHT_COL.led4000, 1.1, { size: 0.8, minPx: 1.3 }); }
    for (let k = 0; k < 5; k++) {
      const ln = (off, dir) => { const pts = []; for (let s = dir > 0 ? 0 : len; dir > 0 ? s <= len : s >= 0; s += 40 * dir) { const p = at(s, off); pts.push([p[0], deckY(s) + 1.0, p[1]]); } return pts; };
      L.traffic.lane(ln(-18 + k * 3.6, -1), { speed: 24, per: 16, seed: 51 + k });
      L.traffic.lane(ln(6 + k * 3.6, 1), { speed: 24, per: 16, seed: 71 + k });
    }
    out.eastSpan = { length: +len.toFixed(0), towerAt: c.map(v => +v.toFixed(0)), sasMain: +(sE2 - sT).toFixed(0) };
  }
  // ======================================================================== the Golden Gate
  {
    const G = GG, a = G.S1, b = G.N1, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-u[1], u[0]];
    const at = (s, off = 0) => [a[0] + u[0] * s + n[0] * off, a[1] + u[1] * s + n[1] * off];
    const st = p => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
    const sS = st(G.S), sN = st(G.N), mid = (sS + sN) / 2;
    // the deck: 67 m clear at mid-span (220 ft), ~63 m at the towers, down to ~60 at the pylons
    const bot = s => s < sS ? 60 + 3 * (s / sS) : (s > sN ? 63 - 3 * (s - sN) / (len - sN) : 63 + 4 * (1 - Math.pow((s - mid) / (mid - sS), 2)));
    const top = s => bot(s) + G.truss;
    const cab = [
      [0, sS, sideCable(0, top(0) + 2, sS, G.saddle, 10)],
      [sS, sN, mainCable(sS, G.saddle, sN, G.saddle, top(mid) + 2.5)],
      [sN, len, sideCable(sN, G.saddle, len, top(len) + 2, 10)],
    ];
    const trussG = [];
    for (let s = -40; s < len + 40; s += 16) for (const side of [-1, 1]) {
      const s1 = s + 16, p = at(s, side * G.half), q = at(s1, side * G.half);
      trussG.push([p[0], bot(s), p[1], q[0], bot(s1), q[1], s, s1, side]);
    }
    out.tris += buildTruss(world, trussG, G.truss, G.panel, M.ggSteel, 'golden gate:truss', 0);
    const deckG = [], towerG = [];
    for (let s = -40; s < len + 40; s += 16) { const p = at(s), q = at(s + 16); deckG.push(beam([p[0], top(s) - 0.4, p[1]], [q[0], top(s + 16) - 0.4, q[1]], G.half * 2, 0.8)); }
    world.mesh(merge(deckG), M.deck, { name: 'golden gate:deck', cast: false });
    for (const s of [sS, sN]) {
      const c = at(s), H = G.towerTop;
      towerG.push(box([c[0], 6, c[1]], [30, 16, 50], { rotY: -Math.atan2(u[1], u[0]) }));
      for (const side of [-1, 1]) {
        const p = at(s, side * G.half);
        // the legs step in as they rise (art deco setbacks): three stages
        for (const [y0, y1, w, d] of [[12, top(s) + 30, 10.0, 16.0], [top(s) + 30, 175, 8.6, 13.0], [175, H, 7.2, 10.4]]) towerG.push(beam([p[0], y0, p[1]], [p[0], y1, p[1]], d, w, { up: [u[0], 0, u[1]] }));
        L.fixed.add(p[0], H + 1.5, p[1], LIGHT_COL.red, 3.2, { size: 1.4, minPx: 2.2, on: 0, period: 2.0, duty: 0.55, phase: side * 0.3 });
        L.fixed.add(p[0] - n[0] * side * 5, 140, p[1] - n[1] * side * 5, LIGHT_COL.red, 1.8, { size: 1.0, minPx: 1.6, on: 0 });
      }
      // the portal struts above the deck (four), deep below the deck one X
      const leg = (side, y) => { const p = at(s, side * G.half); return [p[0], y, p[1]]; };
      for (const y of [top(s) + 28, 150, 190, H - 6]) towerG.push(beam(leg(-1, y), leg(1, y), 5.5, 7.0));
      towerG.push(beam(leg(-1, 14), leg(1, bot(s) - 2), 2.2, 2.2)); towerG.push(beam(leg(1, 14), leg(-1, bot(s) - 2), 2.2, 2.2));
    }
    world.mesh(merge(towerG), M.ggSteel, { name: 'golden gate:towers', cast: false });
    const segs = [];
    for (const side of [-1, 1]) for (const [s0, s1, f] of cab) {
      const N = Math.ceil((s1 - s0) / 12);
      for (let i = 0; i < N; i++) { const sa = s0 + (s1 - s0) * i / N, sb = s0 + (s1 - s0) * (i + 1) / N, pa = at(sa, side * G.half), pb = at(sb, side * G.half); segs.push({ a: [pa[0], f(sa), pa[1]], b: [pb[0], f(sb), pb[1]], w: 0.92 }); }
      for (let s = s0 + 15.2; s < s1 - 3; s += 15.2) { const y = f(s); if (y - top(s) < 1) continue; const p = at(s, side * G.half); segs.push({ a: [p[0], top(s), p[1]], b: [p[0], y, p[1]], w: 0.12 }); }
    }
    lineMesh(world, M.ggCable, segs, 'golden gate:cables');
    // the roadway's lamps (sodium, every 50 m both sides) and the traffic (six lanes)
    for (const side of [-1, 1]) for (let s = 0; s < len; s += 50) { const p = at(s, side * (G.half - 1.2)); L.fixed.add(p[0], top(s) + 8.5, p[1], LIGHT_COL.sodium, 1.6, { size: 1.0, minPx: 1.5 }); }
    for (let k = 0; k < 3; k++) {
      const ln = (off, dir) => { const pts = []; for (let s = dir > 0 ? -300 : len + 300; dir > 0 ? s <= len + 300 : s >= -300; s += 40 * dir) { const p = at(s, off); pts.push([p[0], top(Math.max(-40, Math.min(len + 40, s))) + 0.9, p[1]]); } return pts; };
      L.traffic.lane(ln(-9 + k * 3.2, 1), { speed: 20, per: 12, seed: 91 + k });
      L.traffic.lane(ln(2.6 + k * 3.2, -1), { speed: 20, per: 12, seed: 97 + k });
    }
    out.gg = { mainSpan: +(sN - sS).toFixed(0), sideS: +sS.toFixed(0), sideN: +(len - sN).toFixed(0), towerTop: G.towerTop, midClear: +bot(mid).toFixed(1), cableLow: +cab[1][2](mid).toFixed(1) };
  }
  out.ms = Math.round(performance.now() - t0);
  return out;
}

// a truss's two faces as panels: a band per segment, its members drawn in the shader (chords, verticals at the panel
// pitch, Warren diagonals); see-through where its gaps span pixels, a solid averaged tone where they don't
function buildTruss(world, list, depth, panel, solid, name, glow = 1) {
  const pos = [], uv = [], idx = [], side = [];
  for (const [x0, y0, z0, x1, y1, z1, s0, s1, sd] of list) {
    const k = pos.length / 3;
    pos.push(x0, y0, z0, x1, y1, z1, x1, y1 + depth, z1, x0, y0 + depth, z0);
    uv.push(s0, 0, s1, 0, s1, depth, s0, depth);
    side.push(sd, sd, sd, sd);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new T.Float32BufferAttribute(new Float32Array(pos.length).fill(0), 3)); g.setIndex(idx);
  g.computeVertexNormals();
  const alb = solid.uniforms.uAlb.value;
  const mats = world.mat({
    name: name + ' members', lines: 1, double: true, defines: { SPOTS: 0 }, noFog: true, uniforms: Object.assign({ uAlb: { value: alb }, uFlood: solid.uniforms.uFlood, uNightK: solid.uniforms.uNightK, uPanel: { value: panel }, uDepth: { value: depth }, uTrussGlow: { value: glow } }, AIR_U),
    surface: AIR_GLSL + /* glsl */`
uniform vec3 uAlb; uniform vec4 uFlood; uniform float uNightK, uPanel, uDepth, uTrussGlow;
void smain(inout Surface s, vec3 P, vec3 V) {
  float x = vUv.x / uPanel, y = vUv.y / uDepth;
  float fx = fwidth(x), fy = fwidth(y);
  float mw = 0.07, cw = 0.11;
  float chord = max(1.0 - smoothstep(cw, cw + fy, y), smoothstep(1.0 - cw - fy, 1.0 - cw, y));
  float fr = fract(x), vert = 1.0 - smoothstep(mw, mw + fx, min(fr, 1.0 - fr));
  float dg = abs(fract(x) - (mod(floor(x), 2.0) < 0.5 ? y : 1.0 - y));
  float diag = 1.0 - smoothstep(mw, mw + fx + fy, dg);
  float m = max(chord, max(vert, diag));
  float far = smoothstep(0.08, 0.3, max(fx, fy));
  if (far < 0.5 && m < 0.5) discard;
  s.albedo = uAlb * mix(1.0, uNightK, uNight) * mix(1.0, 0.85, far); s.rough = 0.7;
  // the lower deck's lamps through the truss's gaps: a warm band at night (photo 21)
  s.emissive += vec3(1.0, 0.62, 0.25) * 0.10 * (1.0 - m) * mix(1.0, 0.6, far) * smoothstep(0.2, 0.7, uNight) * step(0.25, y) * step(y, 0.85) * uTrussGlow;
  if (dot(uFlood.rgb, vec3(1.0)) > 0.0) s.emissive += uFlood.rgb * uAlb * smoothstep(0.15, 0.6, uNight) * exp(-max(P.y, 0.0) / uFlood.w) * 0.8;
  farAir(s, P);
}`,
  });
  world.mesh(g, mats, { name, cast: false });
  return idx.length / 3;
}
export { BAYLIGHTS };
