// engine/camera.js: the camera library (docs/CAMERA.md). Shared by the 2D films (riso/pop `cam(x, y, zoom, rot)`) and
// the 3D ones (scene3d film.js: { pos, at, lens, roll }). Every call is a pure function of time, so any frame renders
// alone. Load as a classic script after core.js (2D: `CAM` is a global) or `import '../camera.js'` from a module
// (it sets globalThis.CAM). Self-contained: it uses nothing from core.js.
//
//   profiles     CAM.P.minjerk, sine, scurve(a, d), settle(over), out, in, lin     u 0..1 -> 0..1
//   timing       CAM.minDur(travel_fw, fps, profile)    the shortest move that stays under the judder limit
//   framing      CAM.frame2D({ size, subject, look, anchor, view })    -> { x, y, zoom }   (shot sizes: CAM.SIZES)
//                CAM.place3D({ size, subject, azimuth, elevation, lens, aspect })  -> { pos, at, lens }
//   moves        CAM.move(t, keys, opts)   keys [{ t, ...state }]: stops at each key, or one eased pass through all
//   layers       CAM.handheld(t, { kind, amp, seed, lens })  CAM.shake(t, hits)  CAM.envelope  -> offsets to add
//   follow       CAM.follow(t, target, { t0, tau, lead, dead })   a damped operator who anticipates
//   3D moves     CAM.orbit, CAM.crane, CAM.dollyZoom, CAM.rack
//   apply        CAM.apply2D(state, offsets)  calls cam();  CAM.track2D(fn, t0, t1, fps) for tools/camaudit.py
(function (G) {
  'use strict';
  const TAU = Math.PI * 2;
  const cl = (u, a = 0, b = 1) => (u < a ? a : u > b ? b : u);
  const lerp = (a, b, u) => a + (b - a) * u;
  const isArr = Array.isArray;
  const mix = (a, b, u) => (isArr(a) ? a.map((v, i) => lerp(v, b[i], u)) : lerp(a, b, u));

  // ------------------------------------------------------------------ motion profiles
  // Each maps u in 0..1 to progress 0..1 with zero velocity at both ends (unless named otherwise). `peak` is the
  // peak speed as a multiple of the mean (travel / duration): what the judder limit is checked against.
  const qs = x => x * x * x * (x * (x * 6 - 15) + 10);                 // quintic smoothstep
  const qsInt = x => x * x * x * x * (x * (x - 3) + 2.5);              // its integral, 0.5 at x = 1
  const P = {
    lin: Object.assign(u => cl(u), { peak: 1 }),
    // minimum jerk (Flash & Hogan 1985): the default. Smooth start and landing; peak speed 1.875x the mean.
    minjerk: Object.assign(u => qs(cl(u)), { peak: 1.875 }),
    sine: Object.assign(u => 0.5 - 0.5 * Math.cos(Math.PI * cl(u)), { peak: Math.PI / 2 }),
    // starts at speed (a move carried in across a cut) and lands softly
    out: Object.assign(u => { u = cl(u); return 1 - (1 - u) ** 3; }, { peak: 3 }),
    // starts softly and leaves at speed (a move carried out across a cut, or into a whip)
    in: Object.assign(u => cl(u) ** 3, { peak: 3 }),
  };
  // heavier cushioning (Williams's coin chart: the first third of the time covers about an eighth of the way): the
  // 7th-order smoothstep, still continuous in acceleration and jerk; peak speed 2.19x the mean, 17% done at u = 1/3.
  P.cushion = Object.assign(u => { u = cl(u); return u * u * u * u * (35 + u * (-84 + u * (70 - 20 * u))); }, { peak: 2.1875 });
  // The operator's move: accelerate over share `a` of the time, cruise, decelerate over share `d` (velocity ramps are
  // quintic, so acceleration is continuous). A longer `d` than `a` lands softer than it starts.
  P.scurve = (a = 0.3, d = 0.4) => {
    a = cl(a, 1e-3, 1); d = cl(d, 1e-3, 1 - a);
    const vm = 1 / (1 - (a + d) / 2);
    const f = u => {
      u = cl(u);
      if (u < a) return vm * a * qsInt(u / a);
      if (u <= 1 - d) return vm * (a / 2 + (u - a));
      const x = (u - (1 - d)) / d;
      return 1 - vm * d * (0.5 - x + qsInt(x));
    };
    f.peak = vm;
    return f;
  };
  // Lands past the mark by `over` (a share of the travel) and settles back, as a crane or jib arm does when it stops:
  // a minimum-jerk move to 1 + over in the first `a` of the time, then a minimum-jerk return. Both legs start and end at
  // rest, so the turn is smooth. `over` 0.02-0.05 reads as weight; more reads as a bounce.
  P.settle = (over = 0.03, a = 0.75) => {
    const f = u => { u = cl(u); return u < a ? (1 + over) * qs(u / a) : 1 + over - over * qs((u - a) / (1 - a)); };
    f.peak = 1.875 * (1 + over) / a;
    return f;
  };
  const prof = p => (typeof p === 'function' ? p : (P[p] || P.minjerk));

  // ------------------------------------------------------------------ speed limits (docs/CAMERA.md §6)
  // Image speed in frame lengths per second above which a move may strobe (our renders have no motion blur). A best
  // guess, logged as a gap (docs/CAMERA.md §13): RED's rule is 1/7 at 24 fps with a 180-degree shutter in cinema;
  // camlab's pans at 1/10 to 1/3, unblurred, read fine to Michael (2026-10-19), so 1/3 at 24 fps, scaled up to 2x with fps.
  const judder = (fps = 24) => (1 / 3) * Math.min(2, fps / 24);
  // The shortest duration for a move of `travel` frame widths whose peak speed stays under the judder limit.
  const minDur = (travel, fps = 24, p = 'minjerk') => Math.abs(travel) * prof(p).peak / judder(fps);

  // ------------------------------------------------------------------ shot sizes and framing
  // Where the frame's bottom edge cuts the subject, by landmark, and the share of frame height above the head
  // (headroom). Landmarks are heights from the feet as a share of body height; a character can pass its own (a chibi's
  // head is a third of it). Sizes after Salt's scale (docs/research/source-notes/2026-10-19-camera-grammar.md).
  const HUMAN = { top: 1.0, eye: 0.935, chin: 0.87, chest: 0.72, waist: 0.6, thigh: 0.42, knee: 0.28, foot: 0.0 };
  const SIZES = {
    ECU: { cut: 'eyeband', head: -0.4 },   // eyes only: the frame spans brow to under the eyes
    BCU: { cut: 'chin', head: -0.06 },     // forehead to chin (the top of the head cropped)
    CU: { cut: 'collar', head: 0.04 },     // head and shoulders
    MCU: { cut: 'chest', head: 0.07 },     // chest up
    MS: { cut: 'waist', head: 0.08 },      // waist up
    COWBOY: { cut: 'thigh', head: 0.08 },  // mid-thigh up
    MLS: { cut: 'knee', head: 0.08 },      // knees up
    FS: { cut: 'foot', head: 0.1, foot: 0.06 },   // head to toe, a margin kept
    LS: { body: 0.4 },                     // the figure 40% of frame height
    VLS: { body: 0.15 },
    ELS: { body: 0.05 },                   // a figure in a landscape
  };
  const ORDER = ['ECU', 'BCU', 'CU', 'MCU', 'MS', 'COWBOY', 'MLS', 'FS', 'LS', 'VLS', 'ELS'];
  // The vertical span (in body heights, from the feet) a size shows: [bottom, top]. `L` = landmarks.
  function span(size, L = HUMAN) {
    const s = SIZES[size]; if (!s) throw new Error('CAM: unknown size ' + size);
    const lm = Object.assign({}, HUMAN, L);
    const head = lm.top - lm.chin;
    if (s.body) { const h = 1 / s.body, mid = 0.5; return [mid - h / 2, mid + h / 2]; }
    let bottom;
    if (s.cut === 'eyeband') bottom = lm.eye - head * 0.22;
    else if (s.cut === 'collar') bottom = lm.chin - head * 0.9;
    else if (s.cut === 'foot') bottom = lm.foot;
    else bottom = lm[s.cut];
    if (s.cut === 'eyeband') { const top = lm.eye + head * 0.22; return [bottom, top]; }
    // headroom is a share of the frame: top = head top + head * H  where  (top - bottom) * head = headroom
    const visible = lm.top - bottom;
    const frameH = s.head >= 0 ? visible / (1 - s.head - (s.foot || 0)) : visible + s.head * head * -1 * -1;
    const top = s.head >= 0 ? lm.top + frameH * s.head : lm.top + s.head * head;
    return [bottom - (s.foot || 0) * frameH, top];
  }
  // 2D framing. subject: { x, y: feet in world px, h: body height in world px, L?: landmarks, up?: -1 for y-down
  // canvases (the default) }. look: -1 left / +1 right / 0 frontal: the subject sits on the third behind its look,
  // leaving the look room ahead. view: { w, h } of the canvas. Returns cam(x, y, zoom)'s arguments.
  function frame2D({ size = 'MS', subject, look = 0, anchor = 'thirds', view = { w: 1920, h: 1080 }, nudge = [0, 0] }) {
    const [b, t] = span(size, subject.L);
    const hb = subject.h, up = subject.up || -1;
    const yb = subject.y + up * b * hb, yt = subject.y + up * t * hb;
    const spanPx = Math.abs(yt - yb);
    const zoom = view.h / spanPx;
    const yc = (yb + yt) / 2;
    const thirds = anchor === 'thirds' && look !== 0 ? (view.w / 6) / zoom * Math.sign(look) : 0;
    return { x: subject.x + thirds + nudge[0] / zoom, y: yc + nudge[1] / zoom, zoom };
  }
  // 3D framing on one subject (a toric-space shortcut, Lino & Christie 2015, for one target). subject: { pos: feet
  // [x, y, z], height, facing: yaw in degrees (0 = +z), L? }. azimuth: degrees around the subject from its facing
  // (0 = frontal, 45 = three-quarter, 90 = profile), elevation: degrees the camera looks down (+) or up (-) at the
  // eyes, lens: focal length in mm on a 36 mm-wide sensor. Returns { pos, at, lens }.
  function place3D({ size = 'MS', subject, azimuth = 30, elevation = 0, lens = 50, aspect = 16 / 9, look = 0 }) {
    const [b, t] = span(size, subject.L);
    const H = subject.height;
    const hf = 2 * Math.atan(18 / lens), vf = 2 * Math.atan(Math.tan(hf / 2) / aspect);
    const frameH = (t - b) * H;
    const dist = frameH / 2 / Math.tan(vf / 2);
    const yaw = ((subject.facing || 0) + azimuth) * Math.PI / 180, el = elevation * Math.PI / 180;
    const cy = subject.pos[1] + (b + t) / 2 * H;
    const at = [subject.pos[0], cy, subject.pos[2]];
    const pos = [at[0] + Math.sin(yaw) * Math.cos(el) * dist, at[1] + Math.sin(el) * dist, at[2] + Math.cos(yaw) * Math.cos(el) * dist];
    if (look) {               // shift the aim so the subject sits on a third, its look room ahead
      const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
      const off = Math.tan(hf / 2) * dist / 3 * -Math.sign(look);
      for (let i = 0; i < 3; i++) at[i] += right[i] * off;
    }
    return { pos, at, lens };
  }
  // shot-size steps between two codes (the cut rules in docs/CAMERA.md §7 count these)
  const sizeSteps = (a, b) => ORDER.indexOf(b) - ORDER.indexOf(a);

  // ------------------------------------------------------------------ moves
  // State channels: 2D { x, y, zoom, rot } or 3D { pos: [3], at: [3], lens, roll }; zoom and lens interpolate in log
  // space (a zoom reads as even only in log). keys: [{ t, ...state, p?: profile into this key }].
  // opts.mode 'stops' (default): each segment eases from rest to rest (the camera lands on every key);
  // 'pass': one eased pass through all keys along a centripetal Catmull-Rom path, re-timed by arc length so the
  // speed never sags or jumps at a key (what made the hitches in film.js's reel; docs/CAMERA.md §6). In 'pass' mode
  // only the first and last keys' times count, plus opts.p for the whole pass.
  const LOGK = { zoom: 1, lens: 1 };
  function chan(state) { return Object.keys(state).filter(k => k !== 't' && k !== 'p'); }
  function lerpState(a, b, u) {
    const o = {};
    for (const k of chan(b)) {
      if (!(k in a)) { o[k] = b[k]; continue; }
      o[k] = LOGK[k] ? Math.exp(lerp(Math.log(a[k]), Math.log(b[k]), u)) : mix(a[k], b[k], u);
    }
    return o;
  }
  function vec(state, keysOrder) {        // a state as one flat vector (log for zoom and lens), for the path
    const v = [];
    for (const k of keysOrder) { const x = state[k]; if (isArr(x)) v.push(...x); else v.push(LOGK[k] ? Math.log(x) : x); }
    return v;
  }
  function unvec(v, proto, keysOrder) {
    const o = {}; let i = 0;
    for (const k of keysOrder) { const x = proto[k]; if (isArr(x)) { o[k] = v.slice(i, i + x.length); i += x.length; } else { o[k] = LOGK[k] ? Math.exp(v[i]) : v[i]; i++; } }
    return o;
  }
  function catmull(pts, s) {             // centripetal Catmull-Rom; s in 0..n-1 (segment index + fraction)
    const n = pts.length;
    if (n === 1) return pts[0].slice();
    const seg = Math.min(n - 2, Math.max(0, Math.floor(s))), f = cl(s - seg);
    const p0 = pts[Math.max(0, seg - 1)], p1 = pts[seg], p2 = pts[seg + 1], p3 = pts[Math.min(n - 1, seg + 2)];
    const d = (a, b) => Math.max(1e-6, Math.pow(Math.hypot(...a.map((v, i) => v - b[i])), 0.5));
    const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), t = t1 + (t2 - t1) * f;
    const L = (a, b, ta, tb) => a.map((v, i) => (ta === tb ? v : ((tb - t) * v + (t - ta) * b[i]) / (tb - ta)));
    const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
    return L(L(A1, A2, 0, t2), L(A2, A3, t1, t3), t1, t2);
  }
  const PASS_CACHE = new WeakMap();
  function passTable(keys, weights) {
    let c = PASS_CACHE.get(keys);
    if (c) return c;
    const order = chan(keys[0]);
    const pts = keys.map(k => vec(k, order));
    // arc length in a weighted space (weights per flat dimension: how much each channel moves the picture)
    const N = 400 * (keys.length - 1), acc = new Float64Array(N + 1);
    let prev = catmull(pts, 0);
    for (let i = 1; i <= N; i++) {
      const p = catmull(pts, i / N * (keys.length - 1));
      let d2 = 0; for (let j = 0; j < p.length; j++) d2 += ((p[j] - prev[j]) * (weights ? weights[j] : 1)) ** 2;
      acc[i] = acc[i - 1] + Math.sqrt(d2); prev = p;
    }
    c = { order, pts, acc, N };
    PASS_CACHE.set(keys, c);
    return c;
  }
  function move(t, keys, opts = {}) {
    if (t <= keys[0].t) return lerpState(keys[0], keys[0], 0);
    const last = keys[keys.length - 1];
    if (t >= last.t) return lerpState(last, last, 0);
    if (opts.mode === 'pass' && keys.length > 2) {
      const c = passTable(keys, opts.weights);
      const u = prof(opts.p)((t - keys[0].t) / (last.t - keys[0].t));
      const target = u * c.acc[c.N];
      let lo = 0, hi = c.N;                                   // invert arc length
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.acc[m] < target) lo = m; else hi = m; }
      const r = (target - c.acc[lo]) / Math.max(1e-12, c.acc[hi] - c.acc[lo]);
      const s = (lo + r) / c.N * (keys.length - 1);
      return unvec(catmull(c.pts, s), keys[0], c.order);
    }
    let i = 1; while (keys[i].t <= t) i++;
    const a = keys[i - 1], b = keys[i];
    return lerpState(a, b, prof(b.p || opts.p)((t - a.t) / (b.t - a.t)));
  }

  // ------------------------------------------------------------------ deterministic noise
  function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return n - Math.floor(n); }
  // smooth value noise (quintic), -1..1, unit frequency
  function vnoise(x, seed = 0) { const i = Math.floor(x), f = x - i; return lerp(hash(i + seed * 101.3), hash(i + 1 + seed * 101.3), qs(f)) * 2 - 1; }
  // band-limited noise: octaves from f0 up, amplitude falling as 1/f^slope (operator sway is mostly low-frequency)
  function band(t, f0, octaves, slope, seed) {
    let s = 0, a = 1, f = f0, norm = 0;
    for (let o = 0; o < octaves; o++) { s += a * vnoise(t * f, seed + o * 7.7); norm += a * a; a *= Math.pow(2, -slope); f *= 2.03; }
    return s / Math.sqrt(norm) / 0.58;                    // ~unit RMS (value noise's RMS is about 0.58)
  }

  // ------------------------------------------------------------------ handheld and shake layers
  // Layers return offsets to add to a state: dx, dy in px at 1080 lines, rot in degrees, zoom as a log factor (2D), and
  // yaw/pitch/roll in degrees plus loc in metres (3D). Handheld plays real camera shake: Camera Shakify's curves, solved
  // from handheld footage (CC0; engine/camera_shake.js, load it first). Presets (docs/CAMERA.md §6):
  //   zeek 0.06-0.1 deg sd (a breathing tripod operator)   closeup, wedding 0.13-0.35 (calm handheld)
  //   walk 0.3-0.8 with a 1.5-2.5 Hz step band             investigation 1.3-2.3 (searching)   run 1.3-2.2, 14-22 deg/s
  //   car (road buzz)   rumble (a machine)   steadicam (synthetic: a 0.1-0.5 Hz float with a gait bob, no shake)
  // The image amplitude follows the lens: deg x (frame width / hfov). 2D films pass lens (default 50 mm-equivalent).
  // amp scales it, seed offsets where in the curve it starts (so two shots don't shake alike), and the curve loops
  // with an equal-power crossfade. Never under a locked hold the film didn't choose (CRAFT §14).
  const LOOPS = {};
  function loopCurve(name, ch) {
    const key = name + ':' + ch;
    if (LOOPS[key]) return LOOPS[key];
    const P0 = G.CAM_SHAKE && G.CAM_SHAKE.presets[name];
    const c = !P0 ? null : ch.startsWith('loc') ? (P0.loc_mm || [])[+ch[3]] : P0[ch];
    if (!c) return null;
    const N = c.length, F = Math.min(24, Math.floor(N / 4)), L = N - F, out = new Float32Array(L);
    for (let i = 0; i < L; i++) {
      if (i < F) { const w = i / F, a = Math.sqrt(w), b = Math.sqrt(1 - w); out[i] = (c[i] * a + c[L + i] * b) / Math.max(1e-6, Math.hypot(a, b)); }
      else out[i] = c[i];
    }
    return (LOOPS[key] = out);
  }
  function sampleCurve(arr, t, fps = 24) {
    const L = arr.length, x = ((t * fps) % L + L) % L, i = Math.floor(x), f = x - i;
    const p0 = arr[(i - 1 + L) % L], p1 = arr[i], p2 = arr[(i + 1) % L], p3 = arr[(i + 2) % L];
    return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));   // Catmull-Rom
  }
  const hfovDeg = lens => 2 * Math.atan(18 / lens) * 180 / Math.PI;
  function handheld(t, { kind = 'wedding', amp = 1, seed = 0, lens = 50, w = 1920 } = {}) {
    const none = { dx: 0, dy: 0, rot: 0, zoom: 0, yaw: 0, pitch: 0, roll: 0, loc: [0, 0, 0] };
    if (!amp || kind === 'locked') return none;
    let yaw, pitch, roll, loc = [0, 0, 0];
    if (kind === 'steadicam') {
      yaw = band(t, 0.12, 3, 1.2, seed) * 0.12; pitch = band(t, 0.1, 3, 1.2, seed + 3) * 0.08 + Math.sin(TAU * 1.8 * t + seed) * 0.03;
      roll = band(t, 0.08, 2, 1.2, seed + 5) * 0.05;
    } else {
      const ts = t + seed * 3.7;
      const c = ch => { const a = loopCurve(kind, ch); return a ? sampleCurve(a, ts) : 0; };
      yaw = c('pan'); pitch = c('tilt'); roll = c('roll');
      loc = [0, 1, 2].map(i => { const a = loopCurve(kind, 'loc' + i); return a ? sampleCurve(a, ts) / 1000 : 0; });
    }
    yaw *= amp; pitch *= amp; roll *= amp; loc = loc.map(v => v * amp);
    const k = 1920 / hfovDeg(lens);                       // px at 1080 lines (1920 wide) per degree of pan or tilt
    return { dx: -yaw * k, dy: pitch * k, rot: roll, zoom: 0, yaw, pitch, roll, loc };
  }
  // A blend envelope (0..1): fades a layer in over `fin` s from t0 and out over `fout` s to t1 (Unreal's blend in/out).
  const envelope = (t, t0, t1, fin = 0.5, fout = 0.5) => Math.min(qs(cl((t - t0) / Math.max(1e-6, fin))), qs(cl((t1 - t) / Math.max(1e-6, fout))));
  // Impact shake (Eiserloh's trauma): hits [{ t, k: 0..1, decay: s }]; trauma sums the hits' linear decays, and the
  // amplitude goes as trauma squared, so a small hit barely moves and a big one rattles. Smooth noise at ~7 Hz at 24 fps
  // (under Nyquist: a 30 Hz shake aliases into random jitter), scaled up with frame rate to at most 15 Hz.
  function shake(t, hits, { px = 26, rot = 2.5, hz, fps = 24, seed = 9 } = {}) {
    hz = hz || Math.min(15, 7 * fps / 24);
    let tr = 0;
    for (const h of hits) { if (t >= h.t) tr += (h.k || 0.6) * Math.max(0, 1 - (t - h.t) / (h.decay || 0.45)); }
    tr = Math.min(1, tr);
    if (tr < 1e-3) return { dx: 0, dy: 0, rot: 0, zoom: 0 };
    const a = tr * tr;
    return { dx: vnoise(t * hz, seed) * px * a, dy: vnoise(t * hz, seed + 1) * px * a, rot: vnoise(t * hz, seed + 2) * rot * a, zoom: 0 };
  }
  // A zoom pulse (a "kick" on a beat): up in `rise` s, back down with a minimum-jerk release over `fall` s.
  function kick(t, times, { amt = 0.04, rise = 0.05, fall = 0.45 } = {}) {
    let z = 0;
    for (const t0 of times) {
      const x = t - t0;
      if (x < 0 || x > rise + fall) continue;
      z += amt * (x < rise ? qs(x / rise) : 1 - qs((x - rise) / fall));
    }
    return z;
  }

  // ------------------------------------------------------------------ follow: a damped operator who anticipates
  // target(t) -> [x, y] or [x, y, z] (world units). The camera aims at where the target will be `lead` s ahead,
  // smoothed by a critically damped response (time constant tau; it reaches 90% of a step in about 3.9 tau). `dead`:
  // a dead zone (world units, per axis or a number) the target can wander in before the camera moves; with a dead
  // zone the operator is simulated from t0 (deterministic, recomputed per call). Before t0 the camera rests on the
  // target, so a shot opens framed.
  function follow(t, target, { t0 = 0, tau = 0.35, lead = 0.25, dead = 0, dt = 1 / 120 } = {}) {
    const aim = s => target(Math.max(t0, s) + lead);
    if (!dead) {
      // the response as a convolution with h(s) = s / tau^2 exp(-s / tau), truncated at 8 tau
      const span = 8 * tau, n = 96;
      let acc = null, wsum = 0;
      for (let i = 0; i <= n; i++) {
        const s = span * i / n, w = s / (tau * tau) * Math.exp(-s / tau) * (i === 0 || i === n ? 0.5 : 1);
        const p = aim(t - s);
        if (!acc) acc = p.map(() => 0);
        for (let j = 0; j < p.length; j++) acc[j] += w * p[j];
        wsum += w;
      }
      return acc.map(v => v / wsum);
    }
    const dz = isArr(dead) ? dead : null;
    let x = aim(t0).slice(), v = x.map(() => 0);
    const w = 1 / tau;
    for (let s = t0; s < t; s += dt) {
      const h = Math.min(dt, t - s), g = aim(s + h);
      for (let j = 0; j < x.length; j++) {
        const zone = dz ? dz[j] || 0 : dead;
        const e = g[j] - x[j], pull = Math.abs(e) <= zone ? 0 : e - Math.sign(e) * zone;
        const acc = w * w * pull - 2 * w * v[j];
        v[j] += acc * h; x[j] += v[j] * h;
      }
    }
    return x;
  }

  // ------------------------------------------------------------------ 3D moves (states for film.js)
  // An orbit around `center` at `radius`, from azimuth a0 to a1 (degrees, 0 = +z), at a height, eased.
  function orbit(t, { t0, t1, center, radius, a0, a1, height = 0, lens = 35, p = 'minjerk', aimY = 0 }) {
    const u = prof(p)((t - t0) / (t1 - t0)), a = lerp(a0, a1, u) * Math.PI / 180;
    return { pos: [center[0] + Math.sin(a) * radius, center[1] + height, center[2] + Math.cos(a) * radius],
      at: [center[0], center[1] + aimY, center[2]], lens };
  }
  // A crane: the camera rises (or falls) by dy while its aim follows by aimShare of that (0 = keeps looking at the
  // same point: a tilt-down reveal; 1 = rises level).
  function crane(t, { t0, t1, from, dy, aimShare = 0.3, p = 'minjerk' }) {
    const u = prof(p)((t - t0) / (t1 - t0));
    return { pos: [from.pos[0], from.pos[1] + dy * u, from.pos[2]], at: [from.at[0], from.at[1] + dy * aimShare * u, from.at[2]], lens: from.lens };
  }
  // A dolly zoom: the camera travels along its line of sight while the lens changes so the subject at `at` keeps its
  // size (distance * tan(fov / 2) constant); the background swells or flattens.
  function dollyZoom(t, { t0, t1, from, lens1, p = 'minjerk' }) {
    const u = prof(p)((t - t0) / (t1 - t0));
    const lens = Math.exp(lerp(Math.log(from.lens), Math.log(lens1), u));
    const d0 = Math.hypot(...from.pos.map((v, i) => v - from.at[i]));
    const d = d0 * lens / from.lens;                           // tan(hfov/2) = 18 / lens, so d ~ lens
    const dir = from.pos.map((v, i) => (v - from.at[i]) / d0);
    return { pos: from.at.map((v, i) => v + dir[i] * d), at: from.at.slice(), lens };
  }
  // A rack focus between two distances (metres), over `dur` s from t0: focus pulls are fast in the middle and settle.
  const rack = (t, { t0, dur = 0.8, from, to }) => Math.exp(lerp(Math.log(from), Math.log(to), qs(cl((t - t0) / dur))));

  // ------------------------------------------------------------------ applying and exporting
  // 2D: apply a state plus offsets (handheld, shake: px at 1080 lines) through the film's cam(); call inside save().
  // the canvas size: core.js's W and H are script-scope consts (not on window), so read them by name when present
  const dims = () => [typeof W !== 'undefined' ? W : (G.W || 1920), typeof H !== 'undefined' ? H : (G.H || 1080)];
  function apply2D(s, ...offs) {
    let x = s.x, y = s.y, z = s.zoom || 1, r = s.rot || 0;
    const [w, h] = dims(), k = Math.min(w, h) / 1080;
    for (const o of offs) {
      if (!o) continue;
      x += (o.dx || 0) * k / z; y += (o.dy || 0) * k / z; r += (o.rot || 0) * Math.PI / 180; z *= Math.exp(o.zoom || 0);
    }
    G.cam(x, y, z, r);
  }
  // A per-frame camera track for tools/camaudit.py (`track` mode): fn(t) -> 2D state (+ optional offsets merged in).
  // Mark cuts by returning { cut: true } on a shot's first frame, or pass `cuts` (times).
  function track2D(fn, t0, t1, fps = 24, { w = dims()[0], h = dims()[1], cuts = [] } = {}) {
    const frames = [];
    const cutF = new Set(cuts.map(c => Math.round((c - t0) * fps)));
    for (let i = 0; i <= Math.round((t1 - t0) * fps); i++) {
      const t = t0 + i / fps, s = fn(t);
      frames.push({ x: s.x, y: s.y, zoom: s.zoom || 1, rot: s.rot || 0, cut: !!s.cut || cutF.has(i), shot: s.shot });
    }
    return { kind: '2d', fps, size: [w, h], frames };
  }

  G.CAM = { P, prof, judder, minDur, HUMAN, SIZES, ORDER, span, sizeSteps, frame2D, place3D, move, handheld, envelope, shake,
    kick, follow, orbit, crane, dollyZoom, rack, apply2D, track2D, noise: { vnoise, band } };
})(typeof window !== 'undefined' ? window : globalThis);
