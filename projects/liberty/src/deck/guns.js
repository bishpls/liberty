// liberty/src/deck/guns.js: her guns as she carries them today (B2): the 5"/38 on the stern platform, the 3"/50 on the
// bow platform, eight 20 mm Oerlikons in their tubs; their mechanism on the show's cues (the fire, flash and smoke are
// B5's, read from muzzle(t)).
//
// Sources: research/show.md §1 and rules G1-G14 (NavWeaps: the 5"/38 Mk 12 on a Mk 30-type open mount: gun 5.683 m
// overall, trunnion 58.0 in above the loading platform, recoil 15 in (0.38 m), a semi-fixed brass case 127 x 679 mm
// thrown out on counter-recoil; the 3"/50 Mk 22 on the Mk 21 pedestal: 4.055 m, recoil 12 in (0.305 m), its fixed case
// 76 x 584 mm; the Oerlikon Mk 4: gun 2.21 m, barrel 1.40 m, 60-round drum, 450 rpm, no barrel travel, the case down
// the chute), research/ship.md §6 (where she carries them: P.SHIP.guns), photos ship/34-36 (the 5"/38's carriage,
// band and muzzle ring; the Oerlikon's shield, drum and ring sight), show refs 09 (cases on the deck).
//
// The motion is a pure function of t from the show's one schedule (ctx.show): each gun trains and elevates to its firing
// pose a couple of bars before its first cue (a crew would: hand-trained, at a hand's rate), holds through the cluster
// of cues, fires on each, and returns to its stowed pose when the cluster is done. The 5"/38 and 3"/50 recoil out fast and
// return slower (G3); their cases are simulated on a fixed step from the shot (rigid bodies: a tapered brass tube
// bouncing and rolling on the platform, the deck's trim and all), sampled, and lie where they came to rest from then on.
// The Oerlikons shudder per round (450 rpm, 133 ms) and drop each case down the chute into the bag.
//
// muzzle(t) -> { p: [x, y, z], d: [x, y, z] } (world; d unit along the bore): the plan's convention (B3, B5 read it)
import { SH, FT, DEG, zs, deckAt, sideAbl, Bins, partMesh, setMatrix, SHIPM, tr, rx, ry, rz, mul, along, xf, lath, cyl, boxM, boxAt, bar,
  tube, ring, disc, plate, mergeG, mjerk, clamp, V3 } from './ship.js';

const T = window.THREE;
const G = 9.81;

// ---- the guns' kinds: dimensions (m) and motion (deg/s, s)
export const KINDS = {
  gun5: { name: '5"/38', trunnion: 1.40, breech: 1.30, length: 5.683, bore: 0.127, recoil: 0.38, out: 0.09, ret: 0.45, eject: 0.5,
    case: { r0: 0.0705, r1: 0.0635, len: 0.679, mass: 5.58, ev: 4.2 }, train: 6, elev: 4, lead: 2, hold: 3,
    stow: { train: 180, elev: 3 }, fire: { train: -80, elev: 25 } },
  gun3: { name: '3"/50', trunnion: 1.76, breech: 0.90, length: 4.055, bore: 0.0762, recoil: 0.305, out: 0.07, ret: 0.35, eject: 0.38,
    case: { r0: 0.0445, r1: 0.0385, len: 0.584, mass: 2.0, ev: 3.6 }, train: 10, elev: 6, lead: 2, hold: 3,
    stow: { train: 0, elev: 3 }, fire: { train: -35, elev: 18 } },
  gun20: { name: '20 mm Oerlikon', trunnion: 1.35, length: 2.21, barrel: 1.40, bore: 0.020, rpm: 450, train: 40, elev: 30, lead: 1, hold: 2,
    case: { r0: 0.0145, r1: 0.0115, len: 0.110 } },
};
const RPM20 = 60 / KINDS.gun20.rpm;
const wrap = a => ((a + 540) % 360) - 180;

// ---- the schedule: shots -> stations (when on its firing pose) -> pose(t) = { train, elev } (deg)
function makeStations(shots, K, stow, fire, bar, sweep = 0) {
  const st = [];
  const gap = 12 * bar;                                        // cues closer than this keep the crew on station
  for (const t of shots) { const s = st[st.length - 1]; if (s && t - s.last < gap) s.last = t; else st.push({ first: t, last: t }); }
  const dur = (a, b) => 1.7 * Math.max(Math.abs(wrap(b.train - a.train)) / K.train, Math.abs(b.elev - a.elev) / K.elev, 0.6);
  for (let i = 0; i < st.length; i++) {
    const s = st[i], F = Object.assign({}, fire);
    s.F = F; s.dOut = dur(stow, F); s.dIn = dur(F, stow);
    s.t0 = s.first - K.lead * bar - s.dOut;  s.t1 = s.first - K.lead * bar;
    s.t2 = s.last + K.hold * bar; s.t3 = s.t2 + s.dIn;
  }
  // stations whose moves would overlap merge (the crew stays on)
  for (let i = st.length - 1; i > 0; i--) if (st[i].t0 < st[i - 1].t3) { st[i - 1].last = st[i].last; st[i - 1].t2 = st[i].t2; st[i - 1].t3 = st[i].t3; st.splice(i, 1); }
  const lerpP = (a, b, u) => ({ train: a.train + wrap(b.train - a.train) * u, elev: a.elev + (b.elev - a.elev) * u });
  return {
    list: st,
    pose(t) {
      for (const s of st) {
        if (t < s.t0) break;
        if (t < s.t1) return lerpP(stow, s.F, mjerk((t - s.t0) / s.dOut));
        if (t <= s.t2) {
          if (!sweep) return s.F;
          // the Oerlikon's gunner leans through the burst: a slow sweep of a few degrees, centred on the bearing
          const u = clamp((t - s.t1) / Math.max(s.t2 - s.t1, 1e-3));
          return { train: s.F.train + sweep * Math.sin(u * Math.PI * 3), elev: s.F.elev + 0.4 * sweep * Math.sin(u * Math.PI * 5 + 1) };
        }
        if (t < s.t3) return lerpP(s.F, stow, mjerk((t - s.t2) / s.dIn));
      }
      return stow;
    },
  };
}
// the recoil of a gun that slides (5"/38, 3"/50): out in K.out with a constant deceleration, a short pause, back in
// K.ret eased (the recuperator's buffer); 0..1 of the stroke
export function recoilCurve(dt, K) {
  if (dt < 0) return 0;
  if (dt < K.out) { const u = dt / K.out; return 1 - (1 - u) * (1 - u); }
  const h = 0.04;
  if (dt < K.out + h) return 1;
  const u = (dt - K.out - h) / K.ret;
  if (u >= 1) return 0;
  return 1 - mjerk(u);
}

// ---- the brass case: a rigid tapered tube (contact points round both rims) bounced and rolled on a flat platform on a
// fixed step; returns samples at 120 Hz { t, p, q } in the ship frame and the facts (first bounce, rest)
function simCase({ p0, v0, w0, q0, floorY, C, bounds, r0, r1, len, mass, t0, dur = 5 }) {
  const dt = 1 / 960, nOut = 8;                 // 960 Hz steps, a sample every 8 (120 Hz)
  const g = [0, -G * Math.cos(SH.trim), G * Math.sin(SH.trim)];      // gravity in the ship frame: she is trimmed by the stern
  const p = new T.Vector3(...p0), v = new T.Vector3(...v0), w = new T.Vector3(...w0), q = q0.clone();
  const com = len * 0.42;                      // the base is heavier (the rim and the primer): the centre of mass nearer it
  const Ia = mass * (r0 * r0), Ip = mass * (r0 * r0 / 2 + len * len / 12);
  const local = [];
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; local.push(new T.Vector3(Math.cos(a) * r0, -com, Math.sin(a) * r0), new T.Vector3(Math.cos(a) * r1, len - com, Math.sin(a) * r1)); }
  const out = { samples: [], bounce: 0, firstHit: null, rest: null, restT: null };
  const ax = new T.Vector3(), ra = new T.Vector3(), vp = new T.Vector3(), tmp = new T.Vector3(), n = new T.Vector3(0, 1, 0), tng = new T.Vector3();
  const invI = (vec, a) => { const d = a.dot(vec); return tmp.copy(vec).multiplyScalar(1 / Ip).addScaledVector(a, d * (1 / Ia - 1 / Ip)); };
  let quiet = 0, peak = -1e9, landed = false;
  const steps = Math.round(dur / dt);
  for (let i = 0; i <= steps; i++) {
    if (i % nOut === 0) out.samples.push({ t: t0 + i * dt, p: p.toArray(), q: q.toArray() });
    if (out.rest) continue;
    v.x += g[0] * dt; v.y += g[1] * dt; v.z += g[2] * dt;
    p.addScaledVector(v, dt);
    // orientation
    const wl = w.length();
    if (wl > 1e-9) { const dq = new T.Quaternion().setFromAxisAngle(tmp.copy(w).multiplyScalar(1 / wl), wl * dt); q.premultiply(dq).normalize(); }
    ax.set(0, 1, 0).applyQuaternion(q);
    // contacts with the floor
    let deepest = 0, touching = false;
    for (const lp of local) {
      ra.copy(lp).applyQuaternion(q);
      const y = p.y + ra.y - floorY;
      if (y >= 0) continue;
      touching = true; deepest = Math.min(deepest, y);
      vp.copy(w).cross(ra).add(v);
      const vn = vp.dot(n);
      if (vn >= 0) continue;
      const e = Math.abs(vn) > 0.6 ? 0.32 : 0.0;   // brass on painted steel; no micro-bounces
      const rn = ra.clone().cross(n), k = 1 / mass + n.dot(invI(rn, ax).clone().cross(ra));
      const j = -(1 + e) * vn / k;
      v.addScaledVector(n, j / mass); w.add(invI(rn.multiplyScalar(j), ax).clone());
      // friction: Coulomb, clamped
      vp.copy(w).cross(ra).add(v); tng.copy(vp).addScaledVector(n, -vp.dot(n));
      const vt = tng.length();
      if (vt > 1e-6) {
        tng.multiplyScalar(1 / vt);
        const rt = ra.clone().cross(tng), kt = 1 / mass + tng.dot(invI(rt, ax).clone().cross(ra));
        const jt = Math.min(vt / kt, 0.38 * j);
        v.addScaledVector(tng, -jt / mass); w.add(invI(rt.multiplyScalar(-jt), ax).clone());
      }
      if (!out.firstHit) out.firstHit = { t: t0 + i * dt, p: p.toArray() };
    }
    if (deepest < 0) p.y -= deepest;
    if (touching) {
      // rolling resistance on the non-skid paint (a constant drag, 0.03 g: more than her 1 deg trim's 0.017 g, so a case
      // comes to rest instead of rolling aft for ever) and the deck's grip on its spin
      const hs = Math.hypot(v.x, v.z), dv = 0.03 * G * dt;
      if (hs > dv) { v.x -= v.x / hs * dv; v.z -= v.z / hs * dv; } else { v.x = 0; v.z = 0; }
      w.multiplyScalar(Math.exp(-1.5 * dt));
      landed = true;
    }
    if (landed && !touching) peak = Math.max(peak, p.y - floorY - r0);
    // the platform's toe plate (a coaming at its rail): the case comes to rest against it
    const dx = p.x - C[0], dz = p.z - C[1], rr = Math.hypot(dx, dz);
    if (rr > bounds) { const nx = dx / rr, nz = dz / rr, vr = v.x * nx + v.z * nz; if (vr > 0) { v.x -= 1.25 * vr * nx; v.z -= 1.25 * vr * nz; w.multiplyScalar(0.6); } p.x = C[0] + nx * bounds; p.z = C[1] + nz * bounds; }
    const ke = 0.5 * mass * (v.x * v.x + v.z * v.z + (touching ? 0 : v.y * v.y)) + 0.5 * Ip * w.lengthSq();     // (a resting case's step of gravity isn't motion)
    quiet = touching && ke < 4e-4 ? quiet + dt : 0;
    if (quiet > 0.25) { out.rest = p.toArray(); out.restT = t0 + i * dt; out.restQ = q.toArray(); }
  }
  if (!out.rest) { out.rest = p.toArray(); out.restT = t0 + dur; out.restQ = q.toArray(); }
  out.bounce = Math.max(0, peak);
  return out;
}
// a sampled case at t: position and quaternion (ship frame), or null before it is thrown
function caseAt(sim, t) {
  const S = sim.samples; if (t < S[0].t) return null;
  if (t >= S[S.length - 1].t || (sim.restT !== null && t >= sim.restT)) return { p: sim.rest, q: sim.restQ };
  const f = (t - S[0].t) * 120, i = Math.floor(f), u = f - i, a = S[i], b = S[Math.min(S.length - 1, i + 1)];
  const qa = new T.Quaternion(...a.q), qb = new T.Quaternion(...b.q);
  return { p: [a.p[0] + (b.p[0] - a.p[0]) * u, a.p[1] + (b.p[1] - a.p[1]) * u, a.p[2] + (b.p[2] - a.p[2]) * u], q: qa.slerp(qb, u).toArray() };
}

// ---- geometry, each in its own frame: base (fixed: mount frame), carriage (trains), cradle (elevates: origin at the
// trunnion), barrel (recoils: the cradle's frame at zero recoil). Bore along local -z, x to starboard when trained ahead.
const PI = Math.PI;
const sideY = (x, poly, t) => plate(poly, t, mul(tr(x, 0, 0), ry(-PI / 2)));      // a plate in the y-z plane: poly in (z, y)

function geo5() {
  const K = KINDS.gun5, h = K.trunnion;
  const base = [
    lath([[0, 0], [1.08, 0], [1.08, 0.05], [0.98, 0.05], [0.98, 0.26], [1.02, 0.26], [1.02, 0.3], [0, 0.3]], 40, { seed: 0.21 }),
  ];
  for (let i = 0; i < 28; i++) { const a = i / 28 * PI * 2; base.push(cyl([Math.cos(a) * 1.035, 0.05, Math.sin(a) * 1.035], [Math.cos(a) * 1.035, 0.085, Math.sin(a) * 1.035], 0.022, 0.022, { sides: 6 })); }
  const car = [];
  // the loading platform: checker plate on the carriage, round at the back, cut square at the front for the slide
  const plat = [];
  for (let i = 0; i <= 24; i++) { const a = 0.22 * PI + i / 24 * 1.56 * PI; plat.push([Math.sin(a) * 1.55, -Math.cos(a) * 1.55]); }   // (open at the front: the slide)
  car.push(plate(plat.map(([x, z]) => [x, z]), 0.09, mul(tr(0, 0.33, 0), rx(PI / 2)), 0.3));
  // the two side frames (stands) carrying the trunnions, braced
  const frame = [[0.95, 0.37], [-0.85, 0.37], [-0.5, 1.0], [-0.2, h + 0.18], [0.25, h + 0.2], [0.55, h - 0.1], [0.9, 0.75]];
  car.push(sideY(-0.47, frame, 0.11), sideY(0.47, frame, 0.11));
  car.push(boxM(0.84, 0.12, 0.5, tr(0, 0.43, 0.55)), boxM(0.84, 0.1, 0.35, tr(0, 0.8, 0.62)));        // the frames' ties
  car.push(cyl([-0.6, h, 0], [-0.42, h, 0], 0.17, 0.17, { sides: 16 }), cyl([0.42, h, 0], [0.6, h, 0], 0.17, 0.17, { sides: 16 }));   // trunnion bosses
  // the elevating arc's toothed sector (on the left frame, photo 34) and the pinion's gearbox
  const arc = []; for (let i = 0; i <= 14; i++) { const a = -0.15 * PI + i / 14 * 0.65 * PI; arc.push([Math.sin(a) * 0.95 - 0.0, h - Math.cos(a) * 0.95]); }
  car.push(sideY(-0.548, arc.concat(arc.slice().reverse().map(([z, y]) => [z * 0.84, h - (h - y) * 0.84])), 0.05));
  for (let i = 0; i < 26; i++) { const a = -0.15 * PI + i / 25 * 0.65 * PI; car.push(boxM(0.05, 0.035, 0.03, mul(tr(-0.548, h - Math.cos(a) * 0.962, Math.sin(a) * 0.962), rx(-a)))); }
  // the pointer's (port) and trainer's (starboard) stations: gearboxes, handwheels, telescopes, seats
  for (const sx of [-1, 1]) {
    const x = sx * 0.88;
    car.push(boxM(0.32, 0.95, 0.4, tr(x, 0.83, 0.05)));                                   // the gearbox pedestal
    car.push(boxM(0.36, 0.22, 0.44, tr(x, 1.36, 0.05)));
    car.push(cyl([x - sx * 0.02, 1.18, -0.2], [x + sx * 0.14, 1.18, -0.2], 0.05, 0.05, { sides: 10 }));
    car.push(ring([x + sx * 0.17, 1.18, -0.2], [1, 0, 0], 0.17, 0.016, { seg: 20, sides: 6 }));  // handwheel
    for (let k = 0; k < 4; k++) { const a = k * PI / 2; car.push(cyl([x + sx * 0.17, 1.18, -0.2], [x + sx * 0.17, 1.18 + Math.cos(a) * 0.16, -0.2 + Math.sin(a) * 0.16], 0.008, 0.008, { sides: 4 })); }
    car.push(cyl([x, 1.62, 0.25], [x, 1.62, -0.42], 0.055, 0.05, { sides: 12 }), cyl([x, 1.48, 0.0], [x, 1.58, 0.0], 0.03));      // sight telescope on its bracket
    car.push(cyl([x, 1.62, 0.25], [x, 1.62, 0.34], 0.035, 0.04, { sides: 10 }));                                                   // the eyepiece's hood
    car.push(cyl([x + sx * 0.1, 0.36, 0.55], [x + sx * 0.1, 0.78, 0.55], 0.03), boxM(0.3, 0.06, 0.26, tr(x + sx * 0.1, 0.8, 0.55)));  // the seat
    car.push(boxM(0.5, 0.14, 0.42, tr(x + sx * 0.02, 0.43, 0.1)));                                                                 // the footrest
  }
  // the fuze setter and the hand rails round the back of the loading platform (photo 34)
  car.push(boxM(0.36, 0.5, 0.3, tr(0.7, 0.62, 0.95)), cyl([0.7, 0.87, 0.95], [0.7, 0.98, 0.95], 0.1, 0.1, { sides: 14 }));
  const rail = (y) => { const pts = []; for (let i = 0; i <= 20; i++) { const a = -0.33 * PI + i / 20 * 0.66 * PI; pts.push([Math.sin(a) * 1.45, y, Math.cos(a) * 1.45]); } return tube(pts, 0.022, { sides: 6 }); };
  car.push(rail(1.25), rail(0.85));
  for (let i = 0; i <= 4; i++) { const a = -0.33 * PI + i / 4 * 0.66 * PI; car.push(cyl([Math.sin(a) * 1.45, 0.37, Math.cos(a) * 1.45], [Math.sin(a) * 1.45, 1.25, Math.cos(a) * 1.45], 0.022, 0.022, { sides: 6 })); }
  // the cradle (slide): the sleeve round the barrel, the recoil cylinders under it, the breech housing behind
  const cra = [
    boxM(0.56, 0.5, 1.75, tr(0, 0, -0.27), 0.4),
    boxM(0.66, 0.66, 1.0, tr(0, 0.06, 0.86), 0.45),                                        // the breech housing
    boxM(0.3, 0.14, 0.8, tr(0, -0.06, 1.75)),                                              // the loading tray
    cyl([-0.15, -0.31, -1.05], [-0.15, -0.31, 0.45], 0.075, 0.075, { sides: 12 }), cyl([0.15, -0.31, -1.05], [0.15, -0.31, 0.45], 0.075, 0.075, { sides: 12 }),
    cyl([0, 0.33, -0.95], [0, 0.33, 0.3], 0.085, 0.085, { sides: 12 }),                     // the counter-recoil spring housing
    boxM(0.08, 0.3, 0.25, tr(0.36, 0.1, 0.8)),                                             // the breech's operating lever housing
    cyl([0.36, -0.03, 0.88], [0.62, -0.25, 1.1], 0.02, 0.02, { sides: 6 }),               // the hand lever
    cyl([-0.42, 0, 0], [0.42, 0, 0], 0.12, 0.12, { sides: 14 }),                           // the trunnion axle
  ];
  const craBlack = [boxM(0.668, 0.3, 0.7, tr(0, 0.02, 0.92))];                            // the breech block's dark band (photo 34)
  // the barrel: a chase tapering to the muzzle's swell, the bore open at the face; its black band and red ring
  const L = K.length, b = K.breech;
  const brl = [xf(lath([[0, 0], [0.205, 0], [0.205, 0.32], [0.175, 0.36], [0.165, 2.4], [0.148, 3.2], [0.104, 5.42], [0.112, 5.46], [0.112, L - 0.07], [0.112, L], [0.064, L], [0.064, L - 0.5]], 20, { seed: 0.6 }), along([0, 0, b], [0, 0, -1]))];
  const brlBlack = [xf(lath([[0, 2.43], [0.168, 2.43], [0.150, 3.35], [0, 3.35]], 20), along([0, 0, b], [0, 0, -1]))];
  const brlRed = [xf(lath([[0.064, L - 0.075], [0.1145, L - 0.075], [0.1145, L + 0.002], [0.064, L + 0.002]], 20), along([0, 0, b], [0, 0, -1]))];
  return { base, car, cra, craBlack, brl, brlBlack, brlRed };
}

function geo3() {
  const K = KINDS.gun3, h = K.trunnion;
  const base = [lath([[0, 0], [0.58, 0], [0.58, 0.05], [0.44, 0.05], [0.3, 0.9], [0.34, 0.93], [0.34, 1.0], [0, 1.0]], 28, { seed: 0.3 })];
  for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; base.push(cyl([Math.cos(a) * 0.54, 0.05, Math.sin(a) * 0.54], [Math.cos(a) * 0.54, 0.08, Math.sin(a) * 0.54], 0.02, 0.02, { sides: 6 })); }
  const car = [lath([[0, 1.0], [0.38, 1.0], [0.38, 1.1], [0, 1.1]], 24)];
  const arm = [[0.32, 1.06], [-0.32, 1.06], [-0.14, h + 0.12], [0.14, h + 0.12]];
  car.push(sideY(-0.27, arm, 0.07), sideY(0.27, arm, 0.07));
  car.push(cyl([-0.36, h, 0], [-0.23, h, 0], 0.1, 0.1, { sides: 12 }), cyl([0.23, h, 0], [0.36, h, 0], 0.1, 0.1, { sides: 12 }));
  for (const sx of [-1, 1]) {
    const x = sx * 0.55;
    car.push(bar([sx * 0.3, 1.1, 0.1], [x, 1.35, 0.1], 0.06, 0.06), boxM(0.16, 0.3, 0.2, tr(x, 1.45, 0.1)));
    car.push(ring([x + sx * 0.12, 1.42, 0.02], [1, 0, 0], 0.13, 0.012, { seg: 16, sides: 5 }), cyl([x, 1.42, 0.02], [x + sx * 0.12, 1.42, 0.02], 0.03));
    for (let k = 0; k < 3; k++) { const a = k * 2.094; car.push(cyl([x + sx * 0.12, 1.42, 0.02], [x + sx * 0.12, 1.42 + Math.cos(a) * 0.125, 0.02 + Math.sin(a) * 0.125], 0.008, 0.008, { sides: 4 })); }
    // the shoulder rest (a curved pad on an arm) and the sight
    car.push(bar([x, 1.55, 0.1], [x, 1.55, 0.6], 0.04, 0.04), boxM(0.1, 0.22, 0.06, mul(tr(x, 1.48, 0.58), rx(0.25))));
    car.push(cyl([x - sx * 0.05, 1.9, 0.3], [x - sx * 0.05, 1.9, -0.25], 0.04, 0.035, { sides: 10 }), bar([x, 1.6, 0.1], [x - sx * 0.05, 1.86, 0.05], 0.03, 0.03));
  }
  const cra = [
    boxM(0.32, 0.3, 1.45, tr(0, 0, -0.18), 0.4),
    cyl([0, 0.23, -0.82], [0, 0.23, 0.5], 0.07, 0.07, { sides: 12 }),
    cyl([0, -0.2, -0.7], [0, -0.2, 0.42], 0.06, 0.06, { sides: 12 }),
    boxM(0.36, 0.38, 0.45, tr(0, 0, 0.72)),                                                // the breech mechanism
    cyl([0.19, 0.05, 0.75], [0.42, -0.15, 0.95], 0.016, 0.016, { sides: 6 }),              // the operating handle
    cyl([-0.27, 0, 0], [0.27, 0, 0], 0.075, 0.075, { sides: 12 }),
  ];
  const L = K.length, b = K.breech;
  const brl = [xf(lath([[0, 0], [0.14, 0], [0.14, 0.5], [0.12, 0.55], [0.115, 1.75], [0.084, 3.88], [0.09, 3.92], [0.09, L - 0.05], [0.09, L], [0.039, L], [0.039, L - 0.4]], 18, { seed: 0.62 }), along([0, 0, b], [0, 0, -1]))];
  const brlRed = [xf(lath([[0.039, L - 0.05], [0.0915, L - 0.05], [0.0915, L + 0.002], [0.039, L + 0.002]], 18), along([0, 0, b], [0, 0, -1]))];
  return { base, car, cra, brl, brlRed };
}

function geo20() {
  const K = KINDS.gun20, h = K.trunnion;
  const base = [lath([[0, 0], [0.3, 0], [0.3, 0.035], [0.13, 0.06], [0.1, 0.86], [0.125, 0.88], [0, 0.88]], 18, { seed: 0.4 })];
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; base.push(cyl([Math.cos(a) * 0.26, 0.035, Math.sin(a) * 0.26], [Math.cos(a) * 0.26, 0.06, Math.sin(a) * 0.26], 0.016, 0.016, { sides: 6 })); }
  // the carriage: the head on the column, the cradle's yoke, the shield (trains with the gun, doesn't elevate)
  const car = [lath([[0, 0.88], [0.14, 0.88], [0.14, 1.06], [0.09, 1.1], [0, 1.1]], 16)];
  const yoke = [[0.14, 1.04], [-0.14, 1.04], [-0.07, h + 0.06], [0.07, h + 0.06]];
  car.push(sideY(-0.13, yoke, 0.03), sideY(0.13, yoke, 0.03));
  // the shield: a lower plate and an upper one leaning back, a slot for the gun to elevate through (photo 36)
  const sw = 0.62;
  const lower = [[-sw, 0.0], [sw, 0.0], [sw, 0.5], [0.11, 0.5], [0.11, 0.38], [-0.11, 0.38], [-0.11, 0.5], [-sw, 0.5]];
  car.push(plate(lower, 0.012, tr(0, 0.82, -0.42), 0.55));
  const upper = [[-sw, 0.0], [-0.11, 0.0], [-0.11, 0.42], [0.11, 0.42], [0.11, 0.0], [sw, 0.0], [sw * 0.92, 0.4], [-sw * 0.92, 0.4]];
  car.push(plate([[-sw, 0], [-0.11, 0], [-0.11, 0.4], [-sw * 0.92, 0.4]], 0.012, mul(tr(0, 1.32, -0.42), rx(-0.38)), 0.55));
  car.push(plate([[0.11, 0], [sw, 0], [sw * 0.92, 0.4], [0.11, 0.4]], 0.012, mul(tr(0, 1.32, -0.42), rx(-0.38)), 0.55));
  car.push(bar([-0.13, 1.08, 0.0], [-0.35, 1.0, -0.41], 0.03, 0.03), bar([0.13, 1.08, 0.0], [0.35, 1.0, -0.41], 0.03, 0.03));     // the shield's struts
  void upper;
  // the gun (elevates): the breech casing, the recoil spring casing round the barrel's root, the barrel, the flash hider,
  // the 60-round drum on top, the shoulder rests and grips behind, the ring sight, the canvas case bag below
  const cra = [
    boxM(0.12, 0.16, 0.74, tr(0, 0.0, 0.32), 0.4),
    cyl([0, 0, -0.05], [0, 0, -0.46], 0.056, 0.05, { sides: 12 }),
    lath([[0, -0.08], [0.19, -0.08], [0.19, 0.08], [0.06, 0.1], [0, 0.1]], 22, { phase: 0.1 }).translate(0, 0.155, 0.22),
    cyl([-0.06, 0, 0], [0.06, 0, 0], 0.03, 0.03, { sides: 8 }),
  ];
  for (const sx of [-1, 1]) {
    cra.push(bar([sx * 0.05, -0.02, 0.55], [sx * 0.2, -0.12, 0.78], 0.025, 0.025));
    cra.push(boxM(0.09, 0.2, 0.05, mul(tr(sx * 0.21, -0.12, 0.8), ry(sx * 0.3))));        // the shoulder rests
    cra.push(cyl([sx * 0.148, -0.08, 0.7], [sx * 0.16, -0.3, 0.68], 0.018, 0.018, { sides: 6 }));       // the grips
  }
  cra.push(ring([0, 0.2, -0.55], [0, 0, 1], 0.11, 0.006, { seg: 20, sides: 4 }), cyl([0, 0.02, -0.55], [0, 0.095, -0.55], 0.008, 0.008, { sides: 4 }), bar([0, 0.02, -0.5], [0, 0.02, -0.6], 0.014, 0.012));
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; cra.push(cyl([0, 0.2, -0.55], [Math.cos(a) * 0.11, 0.2 + Math.sin(a) * 0.11, -0.55], 0.003, 0.003, { sides: 3 })); }
  cra.push(cyl([0, 0.0, -1.02], [0, 0.07, -1.02], 0.005, 0.005, { sides: 4 }));          // the foresight (on the barrel's band)
  const bag = [boxM(0.15, 0.32, 0.22, tr(0, -0.27, 0.24))];
  const brl = [cyl([0, 0, -0.06], [0, 0, -1.40], 0.03, 0.022, { sides: 10 }), lath([[0.022, 0], [0.028, 0], [0.046, 0.11], [0.04, 0.11], [0.02, 0.06]], 12).applyMatrix4(along([0, 0, -1.40], [0, 0, -1]))];
  return { base, car, cra, bag, brl };
}

// ---- the build
export function buildGuns(world, M, ctx, B, seat) {
  const P = ctx.P, show = ctx.show, bar = 4 * 60 / (show ? show.bpm : 128);
  const shotsOf = kind => (show ? show.events(kind).map(e => e.t) : []);
  const guns = {}, meshes = [], cams = {}, measures = {};
  const qY = new T.Quaternion();
  const SM = SHIPM();

  // the moving chain of one gun at t: carriage (trains), cradle (elevates), barrel (recoils) in the world
  const chain = (g, t) => {
    const ps = g.pose(t), th = ps.train * DEG, el = ps.elev * DEG;
    const sh = g.shake ? g.shake(t) : null;
    const carM = mul(SM, tr(...g.mount), ry(-th + (sh ? sh.yaw : 0)));
    const craM = mul(carM, tr(0, g.K.trunnion, 0), rx(el + (sh ? sh.pitch : 0)));
    const rec = g.recoil ? g.recoil(t) : (sh ? sh.back : 0);
    const brlM = mul(craM, tr(0, 0, rec));
    return { carM, craM, brlM, ps };
  };
  const muzzleOf = (g, Lz) => t => {
    const { brlM, craM } = chain(g, t);
    const p = new T.Vector3(0, 0, Lz).applyMatrix4(brlM), d = new T.Vector3(0, 0, -1).transformDirection(craM);
    const o = [p.x, p.y, p.z]; o.p = [p.x, p.y, p.z]; o.d = [d.x, d.y, d.z];
    return o;
  };

  // --- the 5"/38 and the 3"/50: one recipe
  const big = (kind, mountZ, floorAbl, gx, bounds) => {
    const K = KINDS[kind], gg = kind === 'gun5' ? geo5() : geo3();
    const mount = [gx, floorAbl, mountZ];
    const shots = shotsOf(kind);
    const st = makeStations(shots, K, K.stow, K.fire, bar);
    const g = { kind, K, mount, shots, pose: st.pose, stations: st.list };
    g.recoil = t => { let r = 0; for (let i = shots.length - 1; i >= 0; i--) { const dt = t - shots[i]; if (dt < 0) continue; if (dt > 1.5) break; r = Math.max(r, recoilCurve(dt, K)); } return r * K.recoil; };
    // fixed base, baked with the ship
    B.add(M.gunSteel, gg.base.map(x => xf(x.clone(), tr(...mount))), kind);
    const car = partMesh(world, gg.car, M.gunSteel, `deck:${kind} carriage`);
    const cra = partMesh(world, gg.cra, M.gunSteel, `deck:${kind} cradle`);
    const parts = [[car, 'carM'], [cra, 'craM']];
    if (gg.craBlack) parts.push([partMesh(world, gg.craBlack, M.gunBlack, `deck:${kind} breech band`), 'craM']);
    parts.push([partMesh(world, gg.brl, M.gunSteel, `deck:${kind} barrel`), 'brlM']);
    if (gg.brlBlack) parts.push([partMesh(world, gg.brlBlack, M.gunBlack, `deck:${kind} barrel band`), 'brlM']);
    if (gg.brlRed) parts.push([partMesh(world, gg.brlRed, M.oxide, `deck:${kind} muzzle ring`), 'brlM']);
    const muzzleZ = K.breech - K.length;
    g.muzzle = muzzleOf(g, muzzleZ);
    g.parts = parts;
    // the cases: thrown from the breech as the breech opens on counter-recoil
    const C = K.case, cases = [];
    for (let i = 0; i < shots.length; i++) {
      const te = shots[i] + K.eject;
      const { craM } = chain(g, te);
      const loc = mul(new T.Matrix4().copy(SM).invert(), craM);                  // the cradle in the ship frame
      const p0 = new T.Vector3(0, 0, K.breech - C.len * 0.42).applyMatrix4(loc);
      const back = new T.Vector3(0, 0, 1).transformDirection(loc);
      const r = (k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
      const v0 = back.clone().multiplyScalar(C.ev * (0.9 + 0.2 * r(1))).add(new T.Vector3((r(2) - 0.5) * 0.6, -0.3, 0));
      const side = new T.Vector3(1, 0, 0).transformDirection(loc);
      const w0 = side.clone().multiplyScalar((r(3) - 0.5) * 9).add(back.clone().multiplyScalar((r(4) - 0.5) * 4));
      const q0 = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), back.clone().negate());
      cases.push(simCase({ p0: p0.toArray(), v0: v0.toArray(), w0: w0.toArray(), q0, floorY: floorAbl, C: [mount[0], mount[2]], bounds, r0: C.r0, r1: C.r1, len: C.len, mass: C.mass, t0: te }));
    }
    g.cases = cases;
    if (cases.length) {
      const cg = lath([[0, 0], [C.r0, 0], [C.r0, 0.012], [C.r0 * 0.94, 0.016], [C.r1 * 1.01, C.len * 0.88], [C.r1, C.len], [C.r1 * 0.9, C.len], [C.r1 * 0.9, C.len * 0.7]], 14, { seed: 0.7 });
      cg.translate(0, -C.len * 0.42, 0);
      const im = world.mesh(cg, M.brass, { count: cases.length, name: `deck:${kind} cases` });
      im.frustumCulled = false; im.userData.loose = 'a spent case (simulated)';
      g.caseMesh = im;
    }
    // where the stroke and the cases are measured
    const firstShot = shots[0];
    const curve = []; for (let k = 0; k <= 40; k++) { const dt = k * 0.0175; curve.push([+dt.toFixed(4), +(recoilCurve(dt, K) * K.recoil).toFixed(4)]); }
    measures[kind] = {
      gun: K.name, length: K.length, lengthSource: kind === 'gun5' ? '223.8 in = 5.683 m (NavWeaps)' : '159.7 in = 4.055 m (NavWeaps)',
      trunnionAbovePlatform: K.trunnion, trunnionSource: kind === 'gun5' ? '58.0 in = 1.47 m above the loading platform (NavWeaps); sheet 2 bore axis 56.6 ft ABL = 1.40 m over the gun deck (used)' : 'bore axis 59 ft ABL (ship.md §6) = 1.76 m over the platform',
      boreAbl: +(floorAbl + K.trunnion).toFixed(2),
      recoil: { stroke: K.recoil, outS: K.out, returnS: K.ret + 0.04, source: kind === 'gun5' ? 'G2: 15 in (0.38 m); G3: out ~0.1 s, return 0.3-0.5 s' : 'G9: 12 in (0.305 m)', curve },
      shots: shots.length, stations: st.list.map(s => ({ from: +s.t0.toFixed(2), onStation: +s.t1.toFixed(2), first: +s.first.toFixed(2), last: +s.last.toFixed(2), stowed: +s.t3.toFixed(2) })),
      cases: cases.map(c => ({ thrown: +c.samples[0].t.toFixed(2), firstBounce: c.firstHit ? +c.firstHit.t.toFixed(2) : null, bounceH: +c.bounce.toFixed(3),
        restAt: c.rest.map(v => +v.toFixed(2)), restFromMount: +Math.hypot(c.rest[0] - mount[0], c.rest[2] - mount[2]).toFixed(2), restS: +(c.restT - c.samples[0].t).toFixed(2) })),
    };
    return g;
  };

  const S = P.SHIP;
  const r5 = seat.get('gun5.ring', [0, S.stern.platform.abl, S.guns.gun5.z]), r3 = seat.get('gun3.ring', [0, S.bow.platform.abl, S.guns.gun3.z]);
  guns.gun5 = big('gun5', r5[2], r5[1], r5[0], 3.2);
  guns.gun3 = big('gun3', r3[2], r3[1], r3[0], 2.25);

  // --- the Oerlikons
  const K20 = KINDS.gun20, g20 = geo20();
  const ev20 = show ? show.events('gun20') : [];
  guns.gun20 = S.guns.gun20.map((spec, i) => {
    const plan = [spec.x, spec.floorAbl !== null && spec.floorAbl !== undefined ? spec.floorAbl : deckAt(spec.x, spec.z) + 3.35, spec.z];
    const mount = seat.get(`gun20.${spec.name}.ring`, plan), floor = mount[1];
    const port = spec.x < 0;
    // the rounds: every gun20 cue naming this gun, its rounds at 450 rpm from the cue
    const rounds = [], cues = [];
    for (const e of ev20) if ((e.guns || [0]).includes(i)) { cues.push(e.t); for (let r = 0; r < (e.rounds || 5); r++) rounds.push(e.t + r * RPM20); }
    // the stowed pose (pointing up, outboard: photo ship/28) and the firing pose: the port guns out over the water, the
    // starboard guns (the pier and its crowd that way) ahead and high
    const stow = { train: port ? -90 : 90, elev: 78 };
    const fire = port ? { train: -85 + (i % 3) * 6, elev: 42 + (i % 2) * 6 } : { train: 18 + (i % 3) * 5, elev: 58 + (i % 2) * 5 };
    const st = makeStations(cues.length ? cues.map((t, k) => t) : [], K20, stow, fire, bar, 3.5);
    // the burst's last round keeps the station until it's fired
    for (const s of st.list) { const lastRound = rounds.filter(r => r >= s.first - 1e-6 && r <= s.last + 2).pop(); if (lastRound !== undefined) { s.t2 = Math.max(s.t2, lastRound + K20.hold * bar); s.t3 = s.t2 + s.dIn; } }
    const g = { kind: 'gun20', name: spec.name, K: K20, mount, shots: rounds, pose: st.pose, stations: st.list };
    // the shudder: each round kicks the gun on its springs (no barrel travel: the whole gun shakes)
    g.shake = t => {
      let pitch = 0, yaw = 0, back = 0;
      for (let k = rounds.length - 1; k >= 0; k--) {
        const dt = t - rounds[k]; if (dt < 0) continue; if (dt > 0.12) break;
        const e = Math.exp(-dt / 0.03) * Math.sin(dt * 2 * Math.PI * 22 + 0.4);
        const hk = Math.sin(k * 7.13 + i) * 0.5;
        pitch += 0.45 * DEG * e; yaw += 0.25 * DEG * e * hk; back += 0.008 * Math.exp(-dt / 0.025);
      }
      return { pitch, yaw, back };
    };
    B.add(M.gunSteel, g20.base.map(x => xf(x.clone(), tr(...mount))), 'gun20');
    const car = partMesh(world, g20.car, M.gunSteel, `deck:gun20 ${spec.name} carriage`);
    const cra = partMesh(world, g20.cra, M.gunSteel, `deck:gun20 ${spec.name} gun`);
    const brl = partMesh(world, g20.brl, M.gunSteel, `deck:gun20 ${spec.name} barrel`);
    const bag = partMesh(world, g20.bag, M.cover, `deck:gun20 ${spec.name} case bag`);
    g.parts = [[car, 'carM'], [cra, 'craM'], [brl, 'brlM'], [bag, 'craM']];
    g.muzzle = muzzleOf(g, -1.51);
    g.floor = floor;
    // the cases down the chute: each falls from the port into the bag in ~0.2 s
    const cg = lath([[0, 0], [K20.case.r0, 0], [K20.case.r0, 0.006], [K20.case.r1, K20.case.len], [0, K20.case.len]], 8, { seed: 0.7 });
    cg.rotateX(PI / 2);
    const im = world.mesh(cg, M.brass, { count: 4, name: `deck:gun20 ${spec.name} falling cases` });
    im.frustumCulled = false; im.count = 0; im.userData.loose = 'a case falling into the bag';
    g.caseMesh = im;
    return g;
  });
  measures.gun20 = {
    gun: K20.name, length: K20.length, barrel: K20.barrel, source: 'NavWeaps: gun 87 in (2.21 m), barrel 55.1 in (1.40 m), 450 rpm', rpm: K20.rpm,
    built: { length: +(0.70 + 1.51).toFixed(2), barrel: +(1.40 - 0.06 + 0.11).toFixed(2) },
    guns: guns.gun20.map(g => ({ name: g.name, floorAbl: +g.floor.toFixed(2), trunnionAbl: +(g.floor + K20.trunnion).toFixed(2), rounds: g.shots.length,
      stations: g.stations.map(s => ({ from: +s.t0.toFixed(2), first: +s.first.toFixed(2), stowed: +s.t3.toFixed(2) })) })),
  };

  // --- each frame: every moving part from the one schedule
  const mtmp = new T.Matrix4(), q = new T.Quaternion(), pv = new T.Vector3(), one = new T.Vector3(1, 1, 1);
  const all = [guns.gun5, guns.gun3, ...guns.gun20];
  world.onFrame(t => {
    for (const g of all) {
      const ch = chain(g, t);
      for (const [mesh, key] of g.parts) setMatrix(mesh, ch[key]);
      if (g.kind !== 'gun20' && g.caseMesh) {
        let n = 0;
        for (const c of g.cases) {
          const s = caseAt(c, t);
          if (!s) continue;
          mtmp.compose(pv.set(...s.p), q.set(...s.q), one).premultiply(SM);
          g.caseMesh.setMatrixAt(n++, mtmp);
        }
        g.caseMesh.count = n; g.caseMesh.instanceMatrix.needsUpdate = true;
      } else if (g.caseMesh) {
        let n = 0;
        for (let k = g.shots.length - 1; k >= 0 && n < 4; k--) {
          const dt = t - g.shots[k] - 0.03; if (dt < 0) continue; if (dt > 0.22) break;
          // from the port under the breech, out and down into the bag
          const y = -0.09 - 0.5 * G * dt * dt - 0.4 * dt, z = 0.22 + 0.15 * dt;
          mtmp.makeRotationX(dt * 40).setPosition(0.0, y, z).premultiply(ch.craM);
          g.caseMesh.setMatrixAt(n++, mtmp);
        }
        g.caseMesh.count = n; g.caseMesh.instanceMatrix.needsUpdate = true;
      }
    }
  });
  for (const g of all) for (const [mesh] of g.parts) mesh.userData.posAt = () => { const w = SH.toWorld(...g.mount); return w; };

  // bookmarks: each gun close (world points from the ship frame)
  const camAt = (g, off, look, lens = 28) => { const a = SH.toWorld(g.mount[0] + off[0], g.mount[1] + off[1], g.mount[2] + off[2]), b = SH.toWorld(g.mount[0] + look[0], g.mount[1] + look[1], g.mount[2] + look[2]); return { pos: a, at: b, lens }; };
  cams.deck_gun5 = Object.assign(camAt(guns.gun5, [3.2, 2.2, 3.4], [-0.5, 1.2, -0.5], 24), { note: 'deck: the 5"/38 on her stern platform, from its starboard quarter' });
  cams.deck_gun3 = Object.assign(camAt(guns.gun3, [-2.6, 2.0, 3.0], [0.2, 1.4, -1.0], 24), { note: 'deck: the 3"/50 on the bow platform' });
  cams.deck_gun20 = Object.assign(camAt(guns.gun20[3], [1.8, 1.6, 2.2], [0, 1.2, 0], 28), { note: 'deck: an Oerlikon on the top of the house (forward, port)' });
  return { guns, all, measures, cams, chain };
}
