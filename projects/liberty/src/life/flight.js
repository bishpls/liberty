// liberty/src/life/flight.js: how a bird flies from one place to another, and its life as a timeline of spans.
//
// A TRACK is spans in time, sorted:
//   still  { type: 'still', t0, t1, at (hips, world), yaw, perch (id or -1), pose: 'stand' | 'dry' | 'water' | 'away' }
//   fly    { type: 'fly', t0, t1, k: Float32Array of keys, KCH floats each: t, x, y, z, vx, vy, vz, phase (wingbeat cycles,
//          unwrapped), amp (0 glide .. 1 full beat), legs (0 tucked .. 1 down), flare (0 .. 1), tail (spread) }
// Between keys the position is Hermite on (p, v), the rest linear; keys come every 0.5 s in cruise and every 0.1 s
// round a take-off and a landing (a gull's turns at 20-40 deg/s move ~15 deg between cruise keys: the Hermite holds it).
// A bird's sample at t: its show excursion (sim.js) where one covers t, else its baseline track (periodic in the loop).
//
// The FLYER flies a point mass at a fixed step (dt 0.1 s, no clock, no randomness but the seeded rng): it steers toward a
// desired velocity within the species' limits (bank <= bankMax: a turn's lateral acceleration <= g tan(bank); climb and
// descent rates; acceleration and braking), and its wings follow the power the path asks for: climbing, accelerating
// or slow flight beat; level or descending cruise glides in the species' rhythm (gulls' bursts of beats and glides,
// pelicans' few beats and long glides, cormorants' continuous beating). Take-offs spring up and out; landings are planned:
// a Hermite from the bird's state to the perch, decelerating, the legs down and the wings flared over the last of it.
import { clamp, lerp, smooth } from 'scene3d/util.js';
import { SPECIES } from './species.js';

export const KCH = 12, G = 9.81;
const K = { t: 0, x: 1, y: 2, z: 3, vx: 4, vy: 5, vz: 6, phase: 7, amp: 8, legs: 9, flare: 10, tail: 11 };
export { K };

// ---- sampling --------------------------------------------------------------------------------------------------------
export function newState() {
  return { mode: 'still', p: [0, 0, 0], v: [0, 0, 0], a: [0, 0, 0], yaw: 0, pitch: 0, bank: 0, phase: 0, amp: 0, legs: 1, flare: 0, tail: 0,
    pose: 'stand', perch: -1, since: 0, until: 0, span: null };
}
const herm = (p0, v0, p1, v1, u, h) => { const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * v0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * v1; };
const hermD = (p0, v0, p1, v1, u, h) => { const u2 = u * u; return ((6 * u2 - 6 * u) * p0 + (3 * u2 - 4 * u + 1) * h * v0 + (-6 * u2 + 6 * u) * p1 + (3 * u2 - 2 * u) * h * v1) / h; };
const hermDD = (p0, v0, p1, v1, u, h) => ((12 * u - 6) * p0 + (6 * u - 4) * h * v0 + (-12 * u + 6) * p1 + (6 * u - 2) * h * v1) / (h * h);

// the span holding t (spans sorted by t0); periodic L: a still span may run past L and wrap to the loop's start
function findSpan(spans, t, L) {
  let lo = 0, hi = spans.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (spans[m].t0 <= t) lo = m; else hi = m - 1; }
  const s = spans[lo];
  if (s.t0 > t) { if (L) { const last = spans[spans.length - 1]; if (last.t1 > L && t < last.t1 - L) return [last, t + L]; } return [s, t]; }
  return [s, t];
}
// a flight kept clear of what it would pass through: every key (but its first and last `ends` s, where it leaves and
// meets its perch or the water) at least `gap` over the drawn top within `r` of it (H.top: the coarse and ship rasters;
// a little over measure.js solidClearance's 0.45 m within 0.4 m, its window too: so only flights that would fail it,
// or nearly, move). Each run of keys in conflict is stepped aside (the smallest step, either hand, up to `side` m, that
// clears the run and a key either side: a mast, a boom's head, a funnel's rim is flown round) when that's less than the
// lift it needs, else lifted over (a roof, a deckhouse). Steps ease in and out at most `slide` m/s, lifts rise at most
// `rise` m/s before and sink at most `sink` m/s after; both fade over the ends, and the keys' speeds take their rates
// (the Hermite sampler reads them); what the easing leaves in conflict is lifted. A flight that clears, or a pinned one
// (a reel's), is left exactly as it was. Returns the most it moved (m); sp.cleared says how
export function liftOver(H, sp, { r = 0.45, gap = 0.55, rise = 3.0, sink = 2.0, slide = 1.5, side = 1.5, ends = 3.0 } = {}) {
  if (sp.type !== 'fly' || sp.dive || sp.pinned) return 0;
  const k = sp.k, n = k.length / KCH, T = i => k[i * KCH];
  const needAt = (i, ox = 0, oz = 0) => H.top(k[i * KCH + 1] + ox, k[i * KCH + 3] + oz, r) + gap - k[i * KCH + 2];
  const nrm = i => { const vx = k[i * KCH + 4], vz = k[i * KCH + 6], l = Math.hypot(vx, vz) || 1; return [-vz / l, vx / l]; };
  const need = new Float32Array(n); let any = false;
  for (let i = 0; i < n; i++) { if (T(i) < sp.t0 + ends || T(i) > sp.t1 - ends) continue; const v = needAt(i); if (v > 0) { need[i] = v; any = true; } }
  if (!any) return 0;
  const up = new Float32Array(n), sl = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    if (!(need[i] > 0)) continue;
    let j = i; while (j + 1 < n && need[j + 1] > 0) j++;
    let lift = 0; for (let q = i; q <= j; q++) lift = Math.max(lift, need[q]);
    let best = null;
    for (let d = 0.25; d <= side + 1e-6 && !best; d += 0.25) for (const sg of [1, -1]) {
      let ok = true; for (let q = Math.max(0, i - 1); q <= Math.min(n - 1, j + 1) && ok; q++) { const [nx, nz] = nrm(q); if (needAt(q, nx * d * sg, nz * d * sg) > 0) ok = false; }
      if (ok) { best = { d, sg }; break; }
    }
    for (let q = i; q <= j; q++) { if (best && best.d < lift) sl[best.sg > 0 ? 0 : 1][q] = best.d; else up[q] = need[q]; }
    i = j;
  }
  const ramp = (A, down, upr) => {
    for (let i = 1; i < n; i++) A[i] = Math.max(A[i], A[i - 1] - down * (T(i) - T(i - 1)));
    for (let i = n - 2; i >= 0; i--) A[i] = Math.max(A[i], A[i + 1] - upr * (T(i + 1) - T(i)));
    for (let i = 0; i < n; i++) A[i] *= smooth(sp.t0, sp.t0 + ends, T(i)) * (1 - smooth(sp.t1 - ends, sp.t1, T(i)));
  };
  ramp(up, sink, rise); ramp(sl[0], slide, slide); ramp(sl[1], slide, slide);
  const lat = sl[0].map((v, i) => v - sl[1][i]), N = Array.from({ length: n }, (_, i) => nrm(i));
  let mostUp = 0, mostSide = 0;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), dt = T(i1) - T(i0), [nx, nz] = N[i];
    k[i * KCH + 1] += nx * lat[i]; k[i * KCH + 3] += nz * lat[i]; k[i * KCH + 2] += up[i];
    if (dt > 0) { const dl = (lat[i1] - lat[i0]) / dt; k[i * KCH + 4] += nx * dl; k[i * KCH + 6] += nz * dl; k[i * KCH + 5] += (up[i1] - up[i0]) / dt; }
    mostUp = Math.max(mostUp, up[i]); mostSide = Math.max(mostSide, Math.abs(lat[i]));
  }
  const more = side > 0 && mostSide > 0 ? liftOver(H, sp, { r, gap, rise, sink, slide, side: 0, ends }) : 0;
  sp.cleared = { over: +(mostUp + more).toFixed(2), aside: +mostSide.toFixed(2) };
  return Math.max(mostUp + more, mostSide);
}
export function sampleSpans(spans, t, L, out = newState()) {
  if (L) t = ((t % L) + L) % L;
  let [s, tt] = findSpan(spans, t, L);
  out.span = s;
  if (s.type === 'fly') {
    const k = s.k, n = k.length / KCH;
    if (tt <= k[0]) tt = k[0];
    if (tt >= k[(n - 1) * KCH]) tt = k[(n - 1) * KCH];
    let lo = 0, hi = n - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (k[m * KCH] <= tt) lo = m; else hi = m - 1; }
    const a = lo * KCH, b = a + KCH, h = Math.max(1e-4, k[b] - k[a]), u = clamp((tt - k[a]) / h);
    for (let c = 0; c < 3; c++) {
      out.p[c] = herm(k[a + 1 + c], k[a + 4 + c], k[b + 1 + c], k[b + 4 + c], u, h);
      out.v[c] = hermD(k[a + 1 + c], k[a + 4 + c], k[b + 1 + c], k[b + 4 + c], u, h);
      out.a[c] = hermDD(k[a + 1 + c], k[a + 4 + c], k[b + 1 + c], k[b + 4 + c], u, h);
    }
    out.phase = lerp(k[a + 7], k[b + 7], u); out.amp = lerp(k[a + 8], k[b + 8], u); out.legs = lerp(k[a + 9], k[b + 9], u);
    out.flare = lerp(k[a + 10], k[b + 10], u); out.tail = lerp(k[a + 11], k[b + 11], u);
    const vh = Math.hypot(out.v[0], out.v[2]);
    out.yaw = vh > 0.05 ? Math.atan2(out.v[2], out.v[0]) : (s.yaw0 ?? 0);
    out.pitch = Math.atan2(out.v[1], Math.max(vh, 0.3));
    // the bank from the lateral acceleration (u^2 k = a_lat): + is the right wing down
    const ax = out.a[0], az = out.a[2], lat = vh > 0.3 ? (out.v[0] * az - out.v[2] * ax) / vh : 0;
    out.bank = Math.atan2(lat, G);
    out.mode = 'fly'; out.since = tt - s.t0; out.until = s.t1 - tt; out.perch = -1; out.pose = 'fly';
    return out;
  }
  out.mode = 'still'; out.pose = s.pose || 'stand'; out.perch = s.perch ?? -1;
  out.p[0] = s.at[0]; out.p[1] = s.at[1]; out.p[2] = s.at[2]; out.v[0] = out.v[1] = out.v[2] = 0; out.a[0] = out.a[1] = out.a[2] = 0;
  out.yaw = s.yaw; out.pitch = 0; out.bank = 0; out.amp = 0; out.legs = 1; out.flare = 0; out.tail = 0; out.phase = 0;
  out.since = tt - s.t0; out.until = s.t1 - tt;
  // a turn on the spot (a settled bird turning to face its way)
  if (s.yaw1 !== undefined) { const dy = ((s.yaw1 - s.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; out.yaw = s.yaw + dy * smooth(s.t0 + 0.4, s.t0 + 1.4, tt); }
  return out;
}

// ---- the flyer -------------------------------------------------------------------------------------------------------
// opts: { sp, R (rng), f (the individual's wingbeat), U (its cruise speed), H (habitat: clearance), dt }
export class Flyer {
  constructor(spKey, R, o = {}) {
    this.spKey = spKey; this.sp = SPECIES[spKey]; this.R = R;
    this.f = o.f || this.sp.f * (0.95 + 0.1 * R()); this.U = o.U || this.sp.U * (0.94 + 0.12 * R());
    this.H = o.H; this.dt = o.dt || 0.1;
    this.p = [0, 0, 0]; this.v = [0, 0, 0]; this.phase = R(); this.amp = 0; this.legs = 0; this.flare = 0; this.tail = 0.3;
    this.burst = 0; this.hold = 0; this.keys = []; this.nextKey = 0; this.dense = 0; this.t = 0; this.flying = false;
    this.stats = { t: 0, dist: 0, flapT: 0, glideT: 0, beats: 0, maxBank: 0 };
  }
  rec(t) { this.keys.push(t, this.p[0], this.p[1], this.p[2], this.v[0], this.v[1], this.v[2], this.phase, this.amp, this.legs, this.flare, this.tail); }
  // begin a flight at t from p with velocity v (a take-off: from rest at a perch)
  begin(t, p, v, { takeoff = false } = {}) {
    this.t = t; this.p = p.slice(); this.v = v.slice(); this.keys = []; this.flying = true; this.takeoff = takeoff ? t : -1;
    this.amp = takeoff ? 1 : this.amp; this.legs = takeoff ? 1 : 0; this.flare = 0; this.dense = takeoff ? t + 1.6 : 0;
    this.rec(t); this.nextKey = t + (takeoff ? 0.1 : 0.5);
  }
  // one step toward the desired velocity vd (world, m/s); o: { climbMax, descMax, accel, brake, glideOK, legs, flare, tail }
  step(vd, o = {}) {
    const dt = this.dt, sp = this.sp, p = this.p, v = this.v;
    const u = Math.hypot(v[0], v[2]), ud = Math.hypot(vd[0], vd[2]);
    // horizontal: turn toward the desired heading at most the bank's rate; speed toward the desired speed
    const tk = this.takeoff >= 0 && this.t - this.takeoff < 1.2;
    const bankMax = (o.bankMax || sp.bankMax) * Math.PI / 180;
    let hdg = Math.atan2(v[2], v[0]); const hdgD = ud > 0.05 ? Math.atan2(vd[2], vd[0]) : hdg;
    let dh = ((hdgD - hdg + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const rate = u > 0.5 ? G * Math.tan(bankMax) / u : 6;           // rad/s
    dh = clamp(dh, -rate * dt, rate * dt);
    hdg += dh;
    const acc = tk ? 7 : (o.accel ?? 2.5), brk = o.brake ?? 3.5;
    // (a bird that must climb over something steepens its climb, slowing to do it: up to 1.6x its climb at 0.65 U)
    const boost = o._boost; o._boost = false;
    const un = clamp(boost ? Math.min(ud, 0.65 * this.U) : ud, u - brk * dt, u + acc * dt);
    // vertical: toward the desired climb, within the species' rates and 3 m/s^2
    const vyd = clamp(vd[1], -(o.descMax ?? sp.descend), o.climbMax ?? (tk ? sp.climb * 1.4 : sp.climb * (boost ? 1.6 : 1)));
    const vy = clamp(vyd, v[1] - 3 * dt * (tk ? 2 : 1), v[1] + 3 * dt * (tk ? 2 : 1));
    const prevU = u;
    v[0] = Math.cos(hdg) * Math.max(un, 0); v[2] = Math.sin(hdg) * Math.max(un, 0); v[1] = vy;
    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    this.t += dt;
    const bank = Math.atan(Math.abs(dh / dt) * un / G);
    this.stats.maxBank = Math.max(this.stats.maxBank, bank);
    this.stats.dist += Math.hypot(v[0], v[1], v[2]) * dt; this.stats.t += dt;
    // the wings: the power the path asks for
    const U = this.U, slow = un < 0.78 * U, climbing = vy > 0.45, accel = (un - prevU) / dt > 0.4;
    let target = 1;
    if (o.flapAll || tk || o.landing) target = 1;
    else if (sp.style === 'flap') target = vy < -0.9 && !slow ? 0 : 1;
    else if (climbing || accel || slow) target = 1;
    else {
      // the rhythm: a burst of beats, then a glide (pelicans: short bursts, long glides)
      if (this.hold > 0) { this.hold -= dt; target = 0; if (this.hold <= 0) this.burst = Math.round(lerp(sp.flapBurst[0], sp.flapBurst[1], this.R())); }
      else if (this.burst <= 0) { this.hold = lerp(sp.glideS[0], sp.glideS[1], this.R()) * (vy < -0.3 ? 1.6 : 1) * (o.glideK || 1); target = 0; }
      else target = 1;
    }
    const fNow = (tk ? sp.fTake : this.f) * (slow && !tk ? 1.06 : 1);
    const prevPh = this.phase;
    if (this.amp > 0.02 || target > 0) this.phase += fNow * dt;
    if (target === 0 && this.amp < 0.05) { const fr = this.phase - Math.floor(this.phase); if (Math.abs(fr - 0.25) > 0.02) this.phase += Math.min(fNow * dt, ((0.25 - fr) % 1 + 1) % 1); }
    this.amp += clamp(target - this.amp, -dt * fNow * 2.0, dt * fNow * 1.6);
    if (Math.floor(this.phase) > Math.floor(prevPh) && this.amp > 0.3) { this.stats.beats++; if (this.burst > 0) this.burst--; }
    if (this.amp > 0.3) this.stats.flapT += dt; else this.stats.glideT += dt;
    this.legs = o.legs !== undefined ? o.legs : (this.takeoff >= 0 ? 1 - smooth(this.takeoff + 0.15, this.takeoff + 0.7, this.t) : 0);
    this.flare = o.flare || 0;
    this.tail = clamp(o.tail ?? (0.2 + Math.abs(dh / dt) * 0.5 + (slow ? 0.35 : 0) + this.flare), 0, 1);
    if (this.t >= this.nextKey - 1e-6) { this.rec(this.t); this.nextKey = this.t + (this.t < this.dense || o.landing ? 0.1 : 0.5); }
  }
  // the flight so far as a span (closing it at the current state)
  span() {
    if (this.keys.length / KCH < 2 || this.keys[this.keys.length - KCH] < this.t - 1e-6) this.rec(this.t);
    const k = new Float32Array(this.keys);
    this.flying = false;
    return { type: 'fly', t0: k[0], t1: k[k.length - KCH], k };
  }
}

// ---- the parts of a flight ---------------------------------------------------------------------------------------------
const norm = v => { const l = Math.hypot(...v) || 1; return v.map(q => q / l); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// a take-off from a perch (hips at p) toward the horizontal direction d: a spring up and out, then beating away
export function takeoff(F, t, p, d) {
  const dn = norm([d[0], 0, d[2]]);
  F.begin(t, p, [dn[0] * 0.8, 1.6, dn[2] * 0.8], { takeoff: true });
}
// steer toward a point (at a speed, arriving or passing), with the habitat's clearance and the hot zones
export function seek(F, target, speed, o = {}) {
  const d = sub(target, F.p), dh = Math.hypot(d[0], d[2]);
  const vd = [d[0] / Math.max(dh, 1e-3) * speed, clamp(d[1] * (o.kh || 0.35), -F.sp.descend, F.sp.climb), d[2] / Math.max(dh, 1e-3) * speed];
  avoid(F, vd, o);
  F.step(vd, o);
  return dh;
}
// circling a centre (c [x, z]) at radius R and height h, in direction dir (+1 counter-clockwise seen from above)
export function circle(F, c, R, h, dir, speed, o = {}) {
  const dx = F.p[0] - c[0], dz = F.p[2] - c[1], r = Math.hypot(dx, dz) || 1e-3;
  const tx = -dz / r * dir, tz = dx / r * dir;                 // the tangent
  const rc = clamp((R - r) * 0.12, -0.7, 0.7);                 // back toward the ring
  const vd = [(tx + dx / r * rc) * speed, clamp((h - F.p[1]) * 0.3, -F.sp.descend * 0.8, F.sp.climb * 0.8), (tz + dz / r * rc) * speed];
  avoid(F, vd, o);
  F.step(vd, o);
}
// the clearance (look ahead: climb over what's drawn beneath the path) and the hot zones (steer out of them)
export function avoid(F, vd, o) {
  const H = F.H; if (!H) return;
  const la = o.lookahead ?? 1.6, q = [F.p[0] + F.v[0] * la, F.p[1] + F.v[1] * la, F.p[2] + F.v[2] * la];
  const clr = o.clear ?? 3.0;
  if (!o.noClear) {
    let need = Math.max(H.top(q[0], q[2], 1.5), H.top(F.p[0], F.p[2], 1.0)) + clr;
    // in transit, above everything within 10 m (H.far), so the climb starts before the wall
    if (o.far !== false && !o.landing && H.topFar) need = Math.max(need, Math.max(H.topFar(F.p[0], F.p[2]), H.topFar(q[0], q[2])) + 1.5);
    if (F.p[1] < need) { vd[1] = Math.max(vd[1], Math.min(F.sp.climb * 1.6, (need - F.p[1]) * 0.9 + 0.5)); if (need - F.p[1] > 1.5) o._boost = true; }
    // a wall ahead it can't climb over in time: turn away from it (down the top's slope)
    const ahead = H.top(q[0], q[2], 1.5);
    if (ahead > F.p[1] + 1.0 && H.topFar) {
      const e = 6, gx = H.topFar(F.p[0] + e, F.p[2]) - H.topFar(F.p[0] - e, F.p[2]), gz = H.topFar(F.p[0], F.p[2] + e) - H.topFar(F.p[0], F.p[2] - e), gl = Math.hypot(gx, gz);
      if (gl > 1e-3) { const k = clamp((ahead - F.p[1]) / 4) * 1.5 * F.U; vd[0] -= gx / gl * k; vd[2] -= gz / gl * k; }
    }
  }
  const Z = o.zones;
  if (Z) for (const z of Z) {
    let dx, dz, dy = 0, r, d;
    if (z.kind === 'column') { dx = F.p[0] - z.c[0]; dz = F.p[2] - z.c[1]; d = Math.hypot(dx, dz); r = z.r; if (F.p[1] > z.y1 + 6 || F.p[1] < z.y0 - 1) continue; }
    else { dx = F.p[0] - z.c[0]; dz = F.p[2] - z.c[1]; dy = F.p[1] - z.y; d = Math.hypot(dx, dz, dy); r = z.r; }
    const m = d - r;
    if (m < 14) {
      const k = clamp((14 - m) / 14) * 1.6 * F.U, n = Math.max(Math.hypot(dx, dz), 1e-3);
      vd[0] += dx / n * k; vd[2] += dz / n * k;
      if (z.kind !== 'column' && dy > -2) vd[1] = Math.max(vd[1], F.sp.climb * clamp((14 - m) / 14));
    }
  }
  // the veto: a wished heading that runs into something it can't climb over in time turns to the nearest clear one
  if (!o.noClear && !o.landing && o.veto !== false) {
    const u = Math.hypot(vd[0], vd[2]);
    if (u > 0.5) {
      const reach = Math.max(8, u * 1.8), rise = F.sp.climb * 1.4 / u;
      const clear = (dx, dz) => { for (let s = 2; s <= reach; s += 2) if (H.top(F.p[0] + dx * s, F.p[2] + dz * s, 0.6) - (F.p[1] + rise * s) > -0.5) return false; return true; };
      const dx0 = vd[0] / u, dz0 = vd[2] / u;
      if (!clear(dx0, dz0)) {
        let done = false;
        for (let k = 1; k <= 12 && !done; k++) for (const sg of [1, -1]) {
          const a = sg * k * Math.PI / 12, c = Math.cos(a), sn = Math.sin(a), dx = dx0 * c - dz0 * sn, dz = dx0 * sn + dz0 * c;
          if (clear(dx, dz)) { vd[0] = dx * u; vd[2] = dz * u; done = true; break; }
        }
        if (!done) { vd[0] *= 0.3; vd[2] *= 0.3; vd[1] = Math.max(vd[1], F.sp.climb * 1.6); o._boost = true; }
      }
    }
  }
  const sep = o.sep;
  if (sep) for (const q2 of sep) { const ex = F.p[0] - q2[0], ey = F.p[1] - q2[1], ez = F.p[2] - q2[2], dd = Math.hypot(ex, ey, ez); if (dd > 1e-3 && dd < 3.5) { const k = (3.5 - dd) / 3.5 * 3; vd[0] += ex / dd * k; vd[1] += ey / dd * k * 0.5; vd[2] += ez / dd * k; } }
}

// reached a point: within r, or within 3r and already past it (heading away): no orbiting a point it can't turn onto
export function arrived(F, target, r) {
  const dx = target[0] - F.p[0], dz = target[2] - F.p[2], dh = Math.hypot(dx, dz);
  return dh < r || (dh < 3 * r && dx * F.v[0] + dz * F.v[2] < 0);
}
// the approach and the landing on P (hips) along heading h: out to a point 30 m back, then toward one 14 m back, landing
// (planned) as soon as the glide in from where it is is clear; t is the flyer's clock. Returns the landing time
export function approachLand(F, H, P, h0, o = {}) {
  const ap = H.approach ? H.approach(P) : null, h = ap ? ap.h : h0;
  const A2 = ap ? ap.A2 : [P[0] - h[0] * 30, Math.max(P[1] + 6, H.top(P[0] - h[0] * 30, P[2] - h[2] * 30, 2) + 4), P[2] - h[2] * 30];
  const A1 = ap ? ap.A1 : [P[0] - h[0] * 14, P[1] + 2.2, P[2] - h[2] * 14];
  const reach = ap ? Math.max(8, ap.d1 * 1.8) : 26;
  F.lastH = h;
  const check = (q, u) => u > 0.82 || q[1] - H.top(q[0], q[2], 0.3) > 0.3;
  const speed = F.U * (o.speedK || 0.85);
  let g = 0;
  while (g++ < 900) { seek(F, A2, speed, o); if (arrived(F, A2, 7)) break; }
  g = 0;
  while (g++ < 900) {
    seek(F, A1, speed * 0.8, Object.assign({}, o, { clear: 1.2, kh: 0.6, far: false }));
    const dx = P[0] - F.p[0], dz = P[2] - F.p[2], d = Math.hypot(dx, dz), u = Math.hypot(F.v[0], F.v[2]);
    if (d < reach && d > 2 && (dx * F.v[0] + dz * F.v[2]) / Math.max(d * u, 1e-3) > 0.6) {
      const snap = { p: F.p.slice(), v: F.v.slice(), t: F.t, n: F.keys.length, amp: F.amp, phase: F.phase, legs: F.legs, flare: F.flare, tail: F.tail };
      const tl = planLanding(F, P, h, check);
      if (tl !== null) return tl;
      Object.assign(F, { p: snap.p, v: snap.v, t: snap.t, amp: snap.amp, phase: snap.phase, legs: snap.legs, flare: snap.flare, tail: snap.tail }); F.keys.length = snap.n;
    }
  }
  return planLanding(F, P, h, null);
}

// a landing, planned: from the flyer's state to the perch (hips at P), arriving along the heading h (unit horizontal) and
// decelerating to rest; the legs come down over the last 1.5 s, the wings flare over the last 0.6 s. Returns the span's
// end time. check(p) -> false when a point of the path is blocked (then the caller tries another heading)
export function planLanding(F, P, h, check) {
  const p0 = F.p.slice(), v0 = F.v.slice(), u0 = Math.hypot(...v0), D = Math.hypot(...sub(P, p0));
  const v1 = [h[0] * 0.25, -0.05, h[2] * 0.25];
  const Tf = clamp(2 * D / (u0 + 0.25), 0.8, 9);
  // the path, sampled for the check
  if (check) for (let i = 1; i < 10; i++) {
    const u = i / 10, q = [0, 1, 2].map(c => herm(p0[c], v0[c], P[c], v1[c], u, Tf));
    if (!check(q, u)) return null;
  }
  const t0 = F.t, n = Math.ceil(Tf / 0.1);
  for (let i = 1; i <= n; i++) {
    const u = i / n, tt = t0 + Tf * u, tl = Tf * (1 - u);
    for (let c = 0; c < 3; c++) { F.p[c] = herm(p0[c], v0[c], P[c], v1[c], u, Tf); F.v[c] = hermD(p0[c], v0[c], P[c], v1[c], u, Tf); }
    F.t = tt;
    // braking beats over the last 0.8 s, gliding in before; the phase runs
    const tgt = tl < 0.8 ? 1 : (F.amp > 0.5 ? 1 : 0);
    F.amp += clamp(tgt - F.amp, -0.1 * F.f * 2, 0.1 * F.f * 1.6);
    if (F.amp > 0.02) F.phase += F.f * 1.05 * (Tf / n);
    F.legs = smooth(1.6, 0.4, tl); F.flare = smooth(0.65, 0.05, tl); F.tail = clamp(0.4 + F.flare * 0.6, 0, 1);
    F.rec(tt);
  }
  F.p = P.slice(); F.v = [0, 0, 0];
  return F.t;
}
