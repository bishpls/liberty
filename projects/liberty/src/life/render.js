// liberty/src/life/render.js: the birds drawn on the kit's creature/bird (engine/scene3d/kit/creature/bird.js), each
// species three instanced meshes (near, mid, far detail). Each frame a bird is posed into the level its wingspan on screen
// asks for; the levels are compacted (only the birds drawn at a level are instances of it: a collapsed instance still
// costs its vertices, ENVIRONMENT §2c.10). Near and mid birds cast shadows and show in the water's reflection.
//
// The pose comes from the bird's track (flight.js sampleSpans: its show excursion where one runs, else its baseline loop)
// or its analytic flight (the soarers' beats, the pelicans' lines), through its species' habits:
//   in flight   the track's wingbeat phase, amplitude, legs, flare and tail; the body pitched with the path and nose-up as
//               it slows; the head held level; a pelican's neck folded back with its head on its shoulders, a cormorant's
//               stretched out; the plunge: wings swept back, neck out, bill first
//   perched     the species' posture; the head in saccades between held looks; breathing; now and then a call (a gull's
//               long call: head down, then thrown up, bill open), preening, a wing stretch; landing (the wings closing
//               over 0.35 s) and take-off (a crouch, the wings opening); alert (neck up, crouched, as it hears a blast)
//   drying      a cormorant upright with its wings held out half open (photo site 28's species)
//   water       sitting on the surface, riding the water's own height (B3's heightAt); hidden under it while diving
import { BIRDS } from 'scene3d/kit/creature/presets.js';
import { birdGeometry, birdMaterial, poseTexture, writePose, BIRD_TEX_W } from 'scene3d/kit/creature/bird.js';
import { birdPose, qrot, quatYPR } from 'scene3d/kit/creature/pose.js';
import { hash1, clamp, smooth, lerp, TAU } from 'scene3d/util.js';
import { SPECIES, activity } from './species.js';
import { sampleSpans, newState, K, KCH } from './flight.js';
import { LB, liftAt } from './sim.js';

const T = window.THREE;
const D = Math.PI / 180;
const q0 = new URLSearchParams(location.search);

// postures on a perch: body pitch (rad, nose up), neck extension and angle (deg above the body's axis), head pitch added
const POSTURE = {
  gull: { pitch: 0.14, neck: 0.45, angle: 32, head: 0.0 },
  heermann: { pitch: 0.14, neck: 0.45, angle: 32, head: 0.0 },
  pelican: { pitch: 0.38, neck: 0.12, angle: 72, head: -0.95 },
  cormorant: { pitch: 0.95, neck: 0.5, angle: 38, head: 0.15 },
  pigeon: { pitch: 0.22, neck: 0.4, angle: 48, head: 0.0 },
};
const SACC = { gull: 1.4, heermann: 1.1, pelican: 3.0, cormorant: 2.2, pigeon: 0.7 };
// soarers' and pelican lines' hours (the soarers ride the evening's lift only while there's light to see it by)
const SOAR_HOURS = [[15.5, 1], [17.3, 1], [17.9, 0.5], [18.3, 0]];

export function makeRender(world, ctx, sim, H) {
  const out = { groups: {}, meshes: [], tris: {}, stats: { drawn: {}, lod: [0, 0, 0], hidden: 0, tris: 0 } };
  const bySp = {};
  for (const b of sim.birds) (bySp[b.sp] = bySp[b.sp] || []).push(b);
  for (const [sp, birds] of Object.entries(bySp)) {
    const B = BIRDS[SPECIES[sp].kit];
    const lods = [0, 1, 2].map(lod => {
      const { tex, data } = poseTexture(birds.length);
      const geo = birdGeometry(B, lod);
      const mats = birdMaterial(world, B, tex);
      // (ink: the mid and far levels drawn with the world's outline, so a bird a few pixels across reads against the sky,
      // style.md rule 6: 2-3 px on a silhouette against the sky; the near level's feathers keep the kit's none)
      if (lod > 0 && mats.uniforms && mats.uniforms.uLineGroup) mats.uniforms.uLineGroup.value = q0.get('birdlines') === '0' ? 0 : 1;
      const mesh = world.mesh(geo, mats, { count: birds.length, cast: lod < 2, reflect: lod < 2, frustum: false, loose: 'flying and perched birds (posed on the GPU; perches measured by life.measure)' });
      mesh.name = `life ${sp} lod${lod}`;
      mesh.count = 0;
      mesh.userData.slot = new Int32Array(birds.length);
      out.meshes.push(mesh); out.tris[mesh.name] = geo.userData.tris;
      return { mesh, tex, data, tris: geo.userData.tris, n: 0 };
    });
    out.groups[sp] = { birds, lods, B, S: SPECIES[sp] };
    birds.forEach((b, k) => { b._gi = k; });
    for (const l of lods) {
      l.mesh.userData.posAt = (t, i) => { const b = birds[l.mesh.userData.slot[i ?? 0]] || birds[0]; return stateAt(b, t).p.slice(); };
      l.mesh.userData.sizeOf = () => [B.L, B.L * 0.4, B.span];
    }
  }
  // ---- a bird's track state at t
  const ts = newState();
  function trackAt(b, t) {
    for (const e of b.exc) if (t >= e.a && t < e.b) return sampleSpans(e.spans, t, 0, ts);
    if (b.soar) return soarAt(b, t, ts);
    if (b.line) return lineAt(b, t, ts);
    return sampleSpans(b.base, t, LB, ts);
  }
  // the soarers' beats: a racetrack along the wall (straights at the wall's two offsets, half-circle turns out over the
  // water), laps a whole number per loop, the height breathing with the lift; gliding, a few beats at the beat's ends
  function soarAt(b, t, o) {
    const s = b.soar, Lz = s.z1 - s.z0, rT = s.rT, per = 2 * Lz + TAU * rT, Tl = LB / s.laps;
    let u = (((t / Tl + s.ph) % 1) + 1) % 1, d = u * per;
    const wob = Math.sin(TAU * t / LB * 3 + s.wob[0]) * 1.2;
    let x, z, hx, hz;
    if (d < Lz) { x = s.x; z = s.z0 + d; hx = 0; hz = 1; }
    else if (d < Lz + Math.PI * rT) { const a = (d - Lz) / rT; x = s.x - rT + Math.cos(a) * rT; z = s.z1 + Math.sin(a) * rT; hx = -Math.sin(a); hz = Math.cos(a); }
    else if (d < 2 * Lz + Math.PI * rT) { const dd = d - Lz - Math.PI * rT; x = s.x - 2 * rT; z = s.z1 - dd; hx = 0; hz = -1; }
    else { const a = (d - 2 * Lz - Math.PI * rT) / rT + Math.PI; x = s.x - rT + Math.cos(a) * rT; z = s.z0 + Math.sin(a) * rT; hx = -Math.sin(a); hz = Math.cos(a); }
    if (s.dir < 0) { z = s.z0 + s.z1 - z; hz = -hz; }
    const U = per / Tl, y = s.y + 1.2 * Math.sin(TAU * u * 2 + s.wob[1]) + wob * 0.4;
    o.mode = 'fly'; o.pose = 'fly'; o.p[0] = x + wob; o.p[1] = y; o.p[2] = z; o.v[0] = hx * U; o.v[1] = 0; o.v[2] = hz * U;
    o.yaw = Math.atan2(o.v[2], o.v[0]); o.pitch = 0; o.since = 99; o.until = 99;
    const turning = d >= Lz && d < Lz + Math.PI * rT || d >= 2 * Lz + Math.PI * rT;
    o.bank = turning ? Math.atan(U * U / rT / 9.81) * s.dir * -1 : 0;
    // a few beats leaving each turn (the lift is weakest out there), gliding the straights
    const beat = turning ? 0 : smooth(0.0, 0.03, (d % (Lz + Math.PI * rT)) / per) * (1 - smooth(0.06, 0.1, (d % (Lz + Math.PI * rT)) / per));
    o.amp = beat; o.phase = t * s.f; o.legs = 0; o.flare = 0; o.tail = turning ? 0.55 : 0.25;
    return o;
  }
  // a pelican in a line: the route's point the line's leader has reached, less the bird's place back along it; the
  // leader's beats copied a beat later by each bird behind
  function lineAt(b, t, o) {
    const L = sim.lines[b.line.li], path = L.path, Ltot = path.s[path.s.length - 1];
    const tt = ((((t - L.tStart) % LB) + LB) % LB);
    let s = tt * L.U - b.line.back;
    o.mode = 'fly'; o.pose = 'fly';
    if (s < 0 || s > Ltot) { o.pose = 'away'; o.mode = 'still'; return o; }
    let lo = 0, hi = path.s.length - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (path.s[m] <= s) lo = m; else hi = m - 1; }
    const w = (s - path.s[lo]) / Math.max(1e-4, path.s[lo + 1] - path.s[lo]);
    const x = lerp(path.x[lo], path.x[lo + 1], w), z = lerp(path.z[lo], path.z[lo + 1], w);
    const dx = path.x[lo + 1] - path.x[lo], dz = path.z[lo + 1] - path.z[lo], dl = Math.hypot(dx, dz) || 1;
    const nx = -dz / dl, nz = dx / dl;
    // the curvature for the bank (the next segment's turn)
    const j = Math.min(lo + 1, path.s.length - 2), ex = path.x[j + 1] - path.x[j], ez = path.z[j + 1] - path.z[j], el = Math.hypot(ex, ez) || 1;
    const turn = Math.atan2(dx * ez - dz * ex, dx * ex + dz * ez) / Math.max(el, 1e-3);
    const ts2 = tt - b.line.lag, f = L.flaps;
    let k = 0; while (k + 3 < f.length && f[k + 3] <= ts2) k += 3;
    const flapping = f[k + 2] > 0.5, ph = flapping ? f[k + 1] + (ts2 - f[k]) * SPECIES.pelican.f : f[k + 1];
    const into = ts2 - f[k];
    const amp = flapping ? smooth(0, 0.25, into) : 1 - smooth(0, 0.35, into);
    const y = L.skim + 0.35 + b.line.dh + 0.25 * Math.sin(t * 0.7 + b.key) - (flapping ? 0 : 0.15 * smooth(0, 4, into));
    // (where its route crosses something, the line's lift over its skim: sim.js liftProfile)
    const [lift, climb] = liftAt(L, s);
    o.p[0] = x + nx * b.line.side; o.p[1] = Math.max(0.45, y) + lift; o.p[2] = z + nz * b.line.side;
    o.v[0] = dx / dl * L.U; o.v[1] = climb * L.U; o.v[2] = dz / dl * L.U;
    o.yaw = Math.atan2(dz, dx); o.pitch = Math.atan(climb); o.bank = -Math.atan(L.U * L.U * turn / 9.81);
    o.amp = amp; o.phase = ph; o.legs = 0; o.flare = 0; o.tail = 0.2; o.since = 99; o.until = 99;
    return o;
  }
  // ---- a bird's pose state (the kit's birdPose input) at t
  const st = {};
  const sacc = (b, t, every, amp) => {
    const w = every, j = Math.floor(t / w), u = t / w - j;
    const h = (jj, c) => hash1((b.key * 131 + jj * 7 + c * 104729) >>> 0) * 2 - 1;
    const e = smooth(0, 0.07 / w * 1.5, u);
    return [amp[0] * (h(j - 1, 1) + (h(j, 1) - h(j - 1, 1)) * e), amp[1] * (h(j - 1, 2) + (h(j, 2) - h(j - 1, 2)) * e)];
  };
  function stateAt(b, t) {
    const sp = b.sp, B = BIRDS[SPECIES[sp].kit], S = SPECIES[sp];
    const q = trackAt(b, t);
    for (const k in st) delete st[k];
    st.seed = b.seed; st.scale = b.scale || 1;
    st.p = q.p.slice();
    if (q.pose === 'away' || q.pose === 'under') { st.hidden = true; return st; }
    if (q.mode === 'fly') {
      const v = q.v, u = Math.hypot(v[0], v[1], v[2]), speed = u / S.U;
      st.mode = 'fly'; st.yaw = q.yaw;
      st.pitch = q.pitch * 0.7 + clamp(0.9 - speed, 0, 0.6) * 0.35 + q.flare * 0.65;
      st.bank = -q.bank;
      st.phase = q.phase; st.amp = q.amp; st.fold = 0; st.flare = q.flare; st.legs = q.legs; st.speed = speed;
      st.tail = clamp(q.tail, 0, 1);
      st.headPitch = -st.pitch * 0.8; st.headYaw = clamp(q.bank, -0.5, 0.5) * 0.3;
      if (sp === 'pelican') {
        // the neck folded back, the head on the shoulders, the bill held forward and a little down
        st.neck = 0.0 + 0.4 * q.flare; st.neckAngle = 1.1 - 0.5 * q.flare; st.headPitch = -st.pitch - 0.45;
        if (q.span && q.span.dive) {
          const k = clamp(q.since / Math.max(0.1, q.since + q.until));
          st.fold = smooth(0.35, 0.85, k) * 0.85; st.amp = 0; st.neck = smooth(0.2, 0.7, k); st.neckAngle = 0.1; st.headPitch = 0;
          st.pitch = q.pitch; st.tail = 0.1;
        }
      } else if (sp === 'cormorant') { st.neck = 1.0; st.neckAngle = 0.12; st.headPitch = -st.pitch + 0.08; }
      else { st.neck = 0.3; }
      if (q.since < 0.12) st.crouch = 1 - q.since / 0.12;
      return st;
    }
    // perched, alert, drying, on the water
    const pst = POSTURE[sp];
    st.mode = 'stand'; st.yaw = q.yaw;
    // (the phase too: the kit's wingAngles reads it even at amp 0, and NaN there took every perched bird's wings away)
    st.pitch = pst.pitch; st.neck = pst.neck; st.neckAngle = pst.angle * D; st.amp = 0; st.phase = 0.25; st.speed = 0; st.fold = 1; st.tail = 0.05; st.tailPitch = (B.perch.tail || 0) * D;
    const ld = q.since, to = q.until;
    const nextFly = q.span && q.span.t1 - q.span.t0 > 0 && to < 0.25;
    if (ld < 0.35) { const k = ld / 0.35; st.fold = smooth(0, 1, k); st.tail = 0.6 * (1 - k); st.pitch += 0.25 * Math.sin(Math.PI * k); st.crouch = 0.6 * Math.sin(Math.PI * k); }
    if (to < 0.2) { const k = 1 - to / 0.2; st.crouch = Math.max(st.crouch || 0, k); st.fold = Math.min(st.fold, 1 - 0.75 * k); st.pitch -= 0.3 * k; st.tail = Math.max(st.tail, 0.5 * k); }
    void nextFly;
    const [hy, hp] = sacc(b, t, SACC[sp] * (0.7 + 0.6 * b.seed), [1.0, 0.3]);
    st.headYaw = hy * 0.8; st.headPitch = hp * 0.5 - st.pitch * 0.85 + pst.head;
    st.crouch = (st.crouch || 0) + 0.05 * Math.sin(t * TAU / (sp === 'pigeon' ? 0.9 : 2.6) + b.key);
    if (q.pose === 'alert') {
      // it heard the blast: the neck up, the head still, crouched to spring
      const k = smooth(0, 0.12, ld);
      st.neck = lerp(st.neck, 0.95, k); st.headYaw *= 1 - k; st.headPitch = lerp(st.headPitch, -st.pitch * 0.85 + 0.1, k); st.crouch = Math.max(st.crouch, 0.5 * k);
    } else if (q.pose === 'dry' || (b.pose === 'dry' && q.pose === 'stand' && b.cls === 'resident')) {
      // wings held out half open, the hands drooping, upright, facing into the wind; a slow flap now and then
      const fl = Math.max(0, Math.sin(t * TAU / 23 + b.key * 2.3)) ** 12;
      st.pitch = 1.15; st.tailPitch = -0.45; st.neck = 0.55; st.headPitch = -st.pitch * 0.9 + 0.15;
      st.wingR = [0.1 + 0.4 * fl, 0.32 + 0.1 * fl, 0.24 - 0.15 * fl, 0.0]; st.wingL = st.wingR;
    } else if (q.pose === 'water') {
      st.pitch = sp === 'cormorant' ? 0.15 : 0.05; st.neck = sp === 'pelican' ? 0.35 : 0.5;
      if (sp === 'cormorant') st.headPitch = -st.pitch + 0.3;
      const wy = H.waterY(q.p[0], q.p[2], t), sink = sp === 'cormorant' ? 0.1 : sp === 'pelican' ? 0.02 : 0.04;
      st.p[1] = wy + B.body[2] * 0.15 * st.scale - sink;
    } else {
      // acts: a call now and then (gulls: the long call), preening, a wing stretch
      const per = sp === 'pigeon' ? 31 : 47, k = (t + b.seed * per * 7) / per, j = Math.floor(k), u = k - j, pick = hash1((b.key * 977 + j) >>> 0);
      const dur = 2.6 / per;
      if (u < dur) {
        const a = u / dur, s2 = Math.sin(Math.PI * a);
        if (pick < 0.25 && (sp === 'gull' || sp === 'heermann')) {
          // the long call: the head bowed, then thrown up with the bill open
          const down = smooth(0, 0.3, a) * (1 - smooth(0.3, 0.45, a)), up = smooth(0.35, 0.5, a) * (1 - smooth(0.85, 1, a));
          st.headPitch += -0.7 * down + 1.0 * up; st.neck += 0.4 * up; st.gape = 0.5 * up; st.pitch += 0.15 * up;
        } else if (pick < 0.5) {
          st.headYaw = s2 * 2.4 * (pick < 0.37 ? 1 : -1); st.headPitch = -0.7 * s2; st.wingR = [-1.3 + 0.2 * s2, 0.1 * s2, 1 - 0.15 * s2, 0];
        } else if (pick < 0.6) {
          // a wing stretch: both raised over the back
          st.fold = 1 - 0.8 * s2; st.wingR = [0.9 * s2, -0.2 * s2, 1 - 0.85 * s2, 0]; st.wingL = st.wingR;
        }
      }
    }
    // the feet under the hips (on the perch: the hips stand standH above it)
    const sh = B.standH * st.scale, y0 = st.p[1] - sh;
    const right = [-Math.sin(q.yaw), 0, Math.cos(q.yaw)], hz = B.body[1] * 0.22 * st.scale;
    if (q.pose === 'water') {
      const fy = st.p[1] - B.body[2] * 0.4 * st.scale;
      st.feet = [[st.p[0] + right[0] * hz, fy, st.p[2] + right[2] * hz, 0.2], [st.p[0] - right[0] * hz, fy, st.p[2] - right[2] * hz, 0.2]];
    } else st.feet = [[st.p[0] + right[0] * hz, y0, st.p[2] + right[2] * hz, 0.1], [st.p[0] - right[0] * hz, y0, st.p[2] - right[2] * hz, 0.1]];
    return st;
  }
  out.stateAt = stateAt; out.trackAt = trackAt;
  // ---- each frame
  const posed = {};
  const fr = new T.Frustum(), pm = new T.Matrix4(), sph = new T.Sphere();
  function visibleShare(b, hour) {
    if (b.cls === 'resident') return true;
    const rows = b.cls === 'soarer' ? SOAR_HOURS : SPECIES[b.sp].hours;
    return b.rank < activity(rows, hour);
  }
  function update(t, camera) {
    const N0 = ctx.SCENE || window.LIBERTY, hour = N0 && N0.hourNow !== undefined ? N0.hourNow : 18;
    camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
    const Hpx = window.SCENE ? window.SCENE.pipe.h : 1080, fpx = (Hpx / 2) / Math.tan((camera.fov || 50) * D / 2);
    const S = out.stats; S.lod = [0, 0, 0]; S.hidden = 0; S.tris = 0; S.hour = hour;
    for (const [sp, g] of Object.entries(out.groups)) {
      S.drawn[sp] = 0;
      for (const l of g.lods) l.n = 0;
      for (const b of g.birds) {
        let lod = -1, s = null;
        if (visibleShare(b, hour)) {
          s = stateAt(b, t);
          if (!s.hidden) {
            sph.center.set(s.p[0], s.p[1], s.p[2]); sph.radius = g.B.span * 0.6 * (s.scale || 1);
            if (fr.intersectsSphere(sph)) {
              const d = Math.max(0.05, camera.position.distanceTo(sph.center)), px = g.B.span * fpx / d;
              lod = px > 70 ? 0 : px > 9 ? 1 : px > 0.6 ? 2 : -1;
            }
          }
        }
        b._lod = lod;
        if (lod < 0) { S.hidden++; continue; }
        const l = g.lods[lod];
        writePose(l.data, l.n, birdPose(g.B, s, posed));
        l.mesh.userData.slot[l.n] = b._gi;
        l.n++; S.lod[lod]++; S.drawn[sp]++; S.tris += l.tris;
      }
      for (const l of g.lods) { l.mesh.count = l.n; l.mesh.visible = l.n > 0; if (l.n) l.tex.needsUpdate = true; }
    }
  }
  // the stage's light bounced onto the birds over it: the live stage spots' colours (a sample of them) weighted by their
  // intensity, with the show's energy, from the stage's centre falling off over 40 m (?birdfill=0 off)
  const stageSpots = world.stage ? world.stage.spots.filter(sp => sp.module === 'stage') : [];
  const S0 = ctx.P.STAGE, fillPos = [(S0.x0 + S0.x1) / 2, S0.floor + 4, (S0.z0 + S0.z1) / 2];
  const fillOn = q0.get('birdfill') !== '0';
  function fill(t) {
    const c = [0, 0, 0]; let w = 0;
    if (fillOn && stageSpots.length && ctx.show) {
      const step = Math.max(1, Math.floor(stageSpots.length / 12));
      for (let i = 0; i < stageSpots.length; i += step) {
        const s2 = stageSpots[i].state ? stageSpots[i].state(t) : null;
        if (!s2 || !(s2.intensity > 0) || !s2.color) continue;
        const k = Math.min(s2.intensity, 20); c[0] += s2.color[0] * k; c[1] += s2.color[1] * k; c[2] += s2.color[2] * k; w += k;
      }
    }
    const e = ctx.show ? ctx.show.at(t).energy : 0, strength = w > 0 ? 0.3 * Math.min(1, w / 30) * (0.4 + 0.6 * e) : 0;
    const col = w > 0 ? c.map(v => v / w) : [0, 0, 0];
    for (const g of Object.values(out.groups)) for (const l of g.lods) {
      const u = l.mesh.material.uniforms || (l.mesh.userData.mats && l.mesh.userData.mats.uniforms);
      if (!u || !u.uFill) continue;
      u.uFill.value.set(col[0], col[1], col[2], strength); u.uFillPos.value.set(fillPos[0], fillPos[1], fillPos[2], 30);
    }
    out.stats.fill = +strength.toFixed(3);
  }
  out.update = (t, camera) => { fill(t); update(t, camera); };
  out.count = () => Object.assign({}, out.stats.drawn);
  return out;
}
