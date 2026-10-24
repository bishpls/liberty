// engine/scene3d/film.js: a reel as shots, camera moves, each a pure function of film time (host.js: opts.film).
//   node engine/render.mjs P --loop=film --frames --workers=4 --clean     (then --encode, 24 fps)
//   node engine/render.mjs P --loop=film --sheet=... / --strip=...      (look at it)
// A shot: { name, dur, hour: number | [[u, hour], ...] (a timelapse, eased) | u => hour, keys: [{ u, pos, at, lens }] with u in 0..1 of
// the shot, ease: 'io' | 'lin' | 'out' }. Positions follow a centripetal Catmull-Rom through the keys, the look-at
// target its own spline, the lens interpolated in log space; time along the shot is eased (minimum jerk by default),
// so a move starts and lands without a bump. 'tScene' offsets the scene's own clock (petals, koi, wind) per shot.
// Camera library options (engine/camera.js, docs/CAMERA.md): timing: 'arc' re-times the path by arc length, so the speed
// never steps at a key (by default the spline advances per key index, and uneven keys step the speed: CAMERA §6);
// handheld: { kind, amp, seed } adds real handheld shake (camera_shake.js) as camera-local rotation, scaled by the lens.
// film.track() bakes every frame's camera for tools/camaudit.py (`track` mode).
// A shot's camera can be a function instead of keys (orbits, cranes, follows on a simulated bird or petal):
//   cam(ts, u, s) -> { pos, at, lens, roll?, focus?, fstop? }   ts = seconds into the shot, u = ts / dur; s.tScene is
//   the scene clock's start. Build it from engine/camera.js (CAM.move, CAM.orbit, CAM.follow...) so it eases.
// More per-shot options:
//   dof: { fstop, focus?, amount? }   depth of field (pipeline post.dof, physical at amount 1); focus in metres, else the
//                                     cam's focus, else the distance to its aim point (a rack: return focus from cam)
//   shake: [{ t, k, decay }]          impact shake (CAM.shake: trauma squared, ~7 Hz at 24 fps), t in shot seconds, as
//                                     camera-local rotation like handheld
//   overlay(X, W, H, ts, u)           drawn over the finished frame (2D canvas): a fade, a card
//   speed                             the scene clock's rate in this shot (0.4: slow motion, as a high-speed camera
//                                     shoots a falling petal); a cam function reads scene time as tScene + ts * speed
//   subjects(ts, s) -> { name: [[x0, y0, z0], [x1, y1, z1]] }   the story's things as world boxes: film.track() carries
//                                     their screen boxes (`subj`) and camaudit's framing check reads them
import '../camera_shake.js';
import '../camera.js';
const T = window.THREE;
const CAM = globalThis.CAM;

const ease = {
  lin: u => u,
  io: u => u * u * u * (u * (u * 6 - 15) + 10),            // minimum-jerk (quintic smoothstep)
  out: u => 1 - Math.pow(1 - u, 3),
  in: u => u * u * u,
  hold: u => u * u * (3 - 2 * u),
};

function catmull(pts, u) {
  // centripetal Catmull-Rom through pts (arrays), u in 0..1 over the whole path, ends clamped
  const n = pts.length;
  if (n === 1) return pts[0].slice();
  if (n === 2) return pts[0].map((v, i) => v + (pts[1][i] - v) * u);
  const seg = Math.min(n - 2, Math.floor(u * (n - 1))), f = u * (n - 1) - seg;
  const p0 = pts[Math.max(0, seg - 1)], p1 = pts[seg], p2 = pts[seg + 1], p3 = pts[Math.min(n - 1, seg + 2)];
  const d = (a, b) => Math.max(1e-4, Math.pow(Math.hypot(...a.map((v, i) => v - b[i])), 0.5));
  const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), t = t1 + (t2 - t1) * f;
  const L = (a, b, ta, tb) => a.map((v, i) => (ta === tb ? v : ((tb - t) * v + (t - ta) * b[i]) / (tb - ta)));
  const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}
// keys at arbitrary u: resample so the spline passes each key at its u (piecewise by key spacing)
function along(keys, field, u) {
  if (keys.length === 1) return keys[0][field].slice();
  let i = 0; while (i + 1 < keys.length - 1 && u > keys[i + 1].u) i++;
  const a = keys[i], b = keys[i + 1], f = Math.min(1, Math.max(0, (u - a.u) / Math.max(1e-6, b.u - a.u)));
  const pts = keys.map(k => k[field]);
  return catmull(pts, (i + f) / (keys.length - 1));
}
const lerpHour = (h, u) => {
  if (typeof h === 'number') return h;
  if (typeof h === 'function') return h(u);            // (a clock that must run straight: a bell's strokes at real speed)
  let i = 0; while (i + 1 < h.length - 1 && u > h[i + 1][0]) i++;
  const [ua, ha] = h[i], [ub, hb] = h[i + 1], f = Math.min(1, Math.max(0, (u - ua) / Math.max(1e-6, ub - ua)));
  return ha + (hb - ha) * ease.hold(f);
};

export function makeFilm(N, { frame, shotsList }) {
  const shots = shotsList;
  let acc = 0;
  for (const s of shots) { s.t0 = acc; acc += s.dur; }
  const len = acc;
  const at = t => { let i = 0; while (i + 1 < shots.length && t >= shots[i + 1].t0) i++; return shots[i]; };
  const camAt = (s, u) => {
    if (s.cam) { const c = s.cam(u * s.dur, u, s); return { pos: c.pos, at: c.at, lens: c.lens || 28, roll: c.roll || s.roll || 0, focus: c.focus, fstop: c.fstop }; }
    // the move happens within the shot's first 'move' fraction (default 0.8) and lands; the rest holds (CRAFT 0.5)
    const mv = s.move === undefined ? 0.8 : s.move;
    const e = (ease[s.ease || 'io'])(mv > 0 ? Math.min(1, u / mv) : 1);     // (move: 0 is a lock: u / 0 at u = 0 was NaN, a blank first frame)
    if (s.timing === 'arc' && s.keys.length > 2) {
      // one eased pass along the path by arc length; position, aim and lens move as one (CAMERA §6)
      if (!s._arc) s._arc = s.keys.map(k => ({ t: k.u, pos: k.pos, at: k.at, lens: k.lens || 28 }));
      const st = CAM.move(s._arc[0].t + e * (s._arc[s._arc.length - 1].t - s._arc[0].t), s._arc, { mode: 'pass', p: 'lin' });
      return { pos: st.pos, at: st.at, lens: st.lens, roll: s.roll || 0 };
    }
    const pos = along(s.keys, 'pos', e), tgt = along(s.keys, 'at', e);
    // lens: log-interpolated between neighbouring keys
    let i = 0; while (i + 1 < s.keys.length - 1 && e > s.keys[i + 1].u) i++;
    const a = s.keys[i], b = s.keys[Math.min(i + 1, s.keys.length - 1)], f = Math.min(1, Math.max(0, (e - a.u) / Math.max(1e-6, b.u - a.u)));
    const lens = Math.exp(Math.log(a.lens || 28) + (Math.log(b.lens || 28) - Math.log(a.lens || 28)) * f);
    return { pos, at: tgt, lens, roll: s.roll || 0 };
  };
  // the camera at film time t, set on a three.js camera: the shot's keys or function, its offset, roll, handheld and
  // impact shake (camera-local rotations only: translation would put the lens in walls, Eiserloh), and the lens.
  // draw() and track() both use it, so the audit reads the camera that was drawn
  const orient = (t, cam) => {
    const s = at(t), u = Math.min(1, Math.max(0, (t - s.t0) / s.dur));
    const c = camAt(s, u);
    // a shot that rides with something moving (s.offset(tScene) -> [x, y, z], e.g. a drifting bubble): keys are where
    // it rests, the offset where it has drifted to
    if (s.offset) {
      const o = s.offset(s.tScene !== undefined ? s.tScene + (t - s.t0) : t);
      c.pos = c.pos.map((v, i) => v + o[i]); c.at = c.at.map((v, i) => v + o[i]);
    }
    cam.position.set(...c.pos);
    const dir = new T.Vector3(...c.at).sub(cam.position).normalize();
    cam.up.set(...(Math.abs(dir.y) > 1 - 1e-6 ? [0, 0, -1] : [0, 1, 0])); cam.lookAt(new T.Vector3(...c.at));
    if (c.roll) cam.rotateZ(c.roll * Math.PI / 180);
    let yaw = 0, pitch = 0, roll = 0;
    if (s.handheld) {
      // faded in and out with the shot
      const h = CAM.handheld(t - s.t0, Object.assign({ lens: c.lens }, s.handheld)), k = CAM.envelope(t, s.t0, s.t0 + s.dur, 0.4, 0.4);
      yaw += h.yaw * k; pitch += h.pitch * k; roll += h.roll * k;
    }
    if (s.shake) {
      // CAM.shake gives px at 1080 lines (1920 wide): back to degrees through this lens
      const o = CAM.shake(t - s.t0, s.shake, s.shakeOpts || {}), dpp = 2 * Math.atan(18 / c.lens) * 180 / Math.PI / 1920;
      yaw += -o.dx * dpp; pitch += o.dy * dpp; roll += o.rot;
    }
    if (yaw || pitch || roll) { cam.rotateY(-yaw * Math.PI / 180); cam.rotateX(pitch * Math.PI / 180); cam.rotateZ(roll * Math.PI / 180); }
    const hfov = 2 * Math.atan(18 / c.lens);
    cam.fov = T.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / cam.aspect)); cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    return { s, u, c };
  };
  const post0 = { dof: N.pipe.post.dof, focus: N.pipe.post.focus, fstop: N.pipe.post.fstop };
  const draw = (t, cam) => {
    const { s, u, c } = orient(t, cam);
    // depth of field: the shot's, else the page's own setting
    const P = N.pipe.post;
    if (s.dof || c.focus !== undefined) {
      const d = s.dof || {};
      P.dof = d.amount !== undefined ? d.amount : 1;
      P.focus = c.focus !== undefined ? c.focus : d.focus !== undefined ? d.focus : Math.hypot(...c.pos.map((v, i) => v - c.at[i]));
      P.fstop = c.fstop !== undefined ? c.fstop : d.fstop || 2.8;
    } else Object.assign(P, post0);
    const hour = lerpHour(s.hour, u);
    if (s.wind !== undefined) N.pipe.U.uWind.value.z = s.wind;
    // the scene's clock (petals, koi, wind); s.speed runs it slower or faster than the film's (0.4: a high-speed camera)
    const ts = s.tScene !== undefined ? s.tScene + (t - s.t0) * (s.speed || 1) : t;
    frame(ts, { hour, cam });
    const tsh = t - s.t0;
    return { shot: s.name, u, hour, lens: c.lens, over: s.overlay ? (X, W, H) => s.overlay(X, W, H, tsh, u) : null };
  };
  // the cut table for tools/edit_audit.py: every shot's move lands at its payoff, then holds
  const auditShots = () => ({ fps: 24, shots: shots.map(s => ({ id: s.name, t0: +s.t0.toFixed(3), len: s.dur, kind: s.kind || 'action',
    payoff: +((s.payoff !== undefined ? s.payoff : (s.move === undefined ? 0.8 : s.move) * s.dur)).toFixed(3), tail: s.tail || 0 })) });
  // what crowds the lens along each shot's path: the share of the frame nearer than `near` m (the G-buffer's view depth),
  // at samples of u. A camera passing through a tree's crown or ending boxed in by pillars shows as a high share; a
  // shot inside something by design (a torii tunnel) does too, so read it against the shot. Render at a small size
  // (?size=192x108): node engine/render.mjs P --query='size=192x108' --loop=film --eval='JSON.stringify(SCENE.film.obstruction())'
  const obstruction = ({ near = 3.0, us = [0.02, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.98] } = {}) => {
    const P = N.pipe, r = P.renderer, W = P.RT_G.width, H = P.RT_G.height, buf = new Float32Array(W * H * 4);
    return shots.map(s => {
      const pct = us.map(u => {
        draw(s.t0 + u * s.dur, N.camera); r.readRenderTargetPixels(P.RT_G, 0, 0, W, H, buf);
        let k = 0; for (let i = 0; i < W * H; i++) { const z = buf[i * 4 + 2]; if (z > 0 && z < near) k++; }
        return +(k / (W * H) * 100).toFixed(1);
      });
      return { shot: s.name, t0: s.t0, near, us, pct, max: Math.max(...pct) };
    });
  };
  // every frame's camera (pos, aim, lens; a shot's first frame marked as a cut), for tools/camaudit.py `track`:
  //   node engine/render.mjs P --loop=film --eval='SCENE.film.track()' > track.json
  // The drawn camera (handheld and shake included): pos, a point along its view at the aim's distance, its roll from
  // level (camaudit's convention: the right vector turned about the view axis), and the subjects' screen boxes.
  // depth: true also renders every frame (draw at the page's size: run it on a small page, ?size=192x108) and records the
  // scene's depth under the frame from the G-buffer: `depth` the median, `depth_near` the 25th percentile (metres; sky
  // left out). camaudit then measures image motion at that depth instead of the aim's distance, so a walk toward a far
  // aim past near trunks reads as the move it is (CAMERA §11: the estimate depends on the depth it locks to).
  const track = (fps = 24, { w = 1920, h = 1080, depth = false } = {}) => {
    const frames = [], cam = new T.PerspectiveCamera(30, w / h, 0.05, 20000), V = new T.Vector3();
    let readDepth = null;
    if (depth) {
      const Pp = N.pipe, r = Pp.renderer, GW = Pp.RT_G.width, GH = Pp.RT_G.height, buf = new Float32Array(GW * GH * 4), zs = new Float32Array(GW * GH);
      readDepth = t => {
        draw(t, N.camera); r.readRenderTargetPixels(Pp.RT_G, 0, 0, GW, GH, buf);
        let n = 0; for (let i = 0; i < GW * GH; i++) { const z = buf[i * 4 + 2]; if (z > 0 && z < 5e4) zs[n++] = z; }
        if (!n) return null;
        const a = zs.subarray(0, n).sort();
        return [a[Math.floor(n * 0.5)], a[Math.floor(n * 0.25)], n / (GW * GH)];
      };
    }
    const anySubj = shots.some(s => s.subjects);
    for (let i = 0, n = Math.round(len * fps); i < n; i++) {
      const t = i / fps, { s, u, c } = orient(t, cam);
      const e = cam.matrixWorld.elements, fwd = [-e[8], -e[9], -e[10]], right = [e[0], e[1], e[2]];
      const d = Math.hypot(...c.pos.map((v, k) => v - c.at[k])) || 1;
      const pos = [cam.position.x, cam.position.y, cam.position.z], aim = pos.map((v, k) => v + fwd[k] * d);
      // level right = fwd x world up; level up = level right x fwd; roll = the right vector's angle toward level up
      let lr = [-fwd[2], 0, fwd[0]]; const ll = Math.hypot(lr[0], lr[2]) || 1; lr = lr.map(v => v / ll);
      const lu = [lr[1] * fwd[2] - lr[2] * fwd[1], lr[2] * fwd[0] - lr[0] * fwd[2], lr[0] * fwd[1] - lr[1] * fwd[0]];
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const roll = Math.atan2(dot(right, lu), dot(right, lr)) * 180 / Math.PI;
      const f = { pos, at: aim, lens: c.lens, roll: +roll.toFixed(4), shot: s.name, cut: i > 0 && Math.round(s.t0 * fps) === i };
      if (readDepth) { const d = readDepth(t); if (d) { f.depth = +d[0].toFixed(3); f.depth_near = +d[1].toFixed(3); f.ground = +d[2].toFixed(3); } }
      if (anySubj) {
        f.subj = {};
        const boxes = s.subjects ? s.subjects(t - s.t0, s) : {};
        for (const [name, [a, b]] of Object.entries(boxes)) {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, front = 0;
          for (let k = 0; k < 8; k++) {
            V.set(k & 1 ? b[0] : a[0], k & 2 ? b[1] : a[1], k & 4 ? b[2] : a[2]).applyMatrix4(cam.matrixWorldInverse);
            if (V.z > -0.05) continue;                       // behind the lens
            front++; V.applyMatrix4(cam.projectionMatrix);
            const x = (V.x + 1) / 2 * w, y = (1 - V.y) / 2 * h;
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          }
          if (front) f.subj[name] = [x0, y0, x1, y1].map(v => +v.toFixed(1));
        }
      }
      frames.push(f);
    }
    return { fps, size: [w, h], frames };
  };
  return { shots, len, at, draw, camAt, orient, auditShots, lerpHour, obstruction, track };
}

