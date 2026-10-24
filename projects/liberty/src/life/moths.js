// liberty/src/life/moths.js: moths in the lamps' pools and the stage's beams at night (MOTH in species.js). Each moth is a
// pure function of t: it orbits its light, stalls and darts (insects at a light turn their backs to it and circle it:
// the dorsal light response, Fabian et al. 2024), its wings a 40 Hz flicker. Drawn as unlit specks at least a pixel and a
// bit wide, as bright as the light they're in (a lamp's colour and gain falling off with distance; a beam's colour and
// its illuminance at that range): in anime, the insects in a light are its glints. The lamps nearest the camera get
// them (the pier's wall packs, promenade, street and wharf lamps; her deck floods); the stage's beams near their lenses.
import { hash1, clamp, smooth, TAU, lin } from 'scene3d/util.js';
import { MOTH, activity } from './species.js';

const T = window.THREE;
const PER_LAMP = 6, LAMPS = 14, PER_BEAM = 7, BEAMS = 12, MAX = PER_LAMP * LAMPS + PER_BEAM * BEAMS;

export function makeMoths(world, ctx, H) {
  const U = world.U;
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const ig = new T.InstancedBufferGeometry();
  ig.index = g.index; ig.setAttribute('position', g.attributes.position);
  const iP = new T.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), iQ = new T.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  iP.setUsage(T.DynamicDrawUsage); iQ.setUsage(T.DynamicDrawUsage); ig.setAttribute('iP', iP); ig.setAttribute('iQ', iQ); ig.instanceCount = 0;
  const mat = new T.ShaderMaterial({
    name: 'life moths', uniforms: { uResolution: U.uResolution },
    vertexShader: `attribute vec4 iP; attribute vec4 iQ; uniform vec2 uResolution; varying vec2 vUv; varying vec3 vC;
      void main() {
        vec3 c = iP.xyz; vec3 vd = normalize(cameraPosition - c), rt = normalize(cross(vec3(0.0, 1.0, 0.0), vd) + vec3(1e-5, 0.0, 0.0)), up = cross(vd, rt);
        float px = 2.0 * length(cameraPosition - c) / max(uResolution.y, 1.0) * 0.55;
        float r = max(iP.w * 0.5, 1.1 * px), k = iP.w * 0.5 / r;
        vC = iQ.rgb * max(k * k, 0.0) * iQ.a; vUv = position.xy;
        gl_Position = projectionMatrix * viewMatrix * vec4(c + (rt * position.x + up * position.y) * r, 1.0);
      }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vC;
      void main() { float a = 1.0 - smoothstep(0.35, 1.0, length(vUv)); gl_FragColor = vec4(vC * a, 0.0); }`,
    transparent: true, depthTest: true, depthWrite: false, side: T.DoubleSide,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor,
  });
  const mesh = world.mesh(ig, { color: mat }, { name: 'life moths', frustum: false, trans: true, cast: false, id: false, gbuf: false, reflect: false, loose: 'moths in flight' });
  // the lamps: the pier's (wall packs, promenade, street, wharf) and her deck's lit floods and lamps
  const M = ctx.mods, lamps = [];
  const col = c => (Array.isArray(c) ? c : lin(c));
  if (M.pier && M.pier.lights) for (const l of M.pier.lights) if (l.pos) lamps.push({ p: l.pos, c: col(l.color || '#ffcf8a'), gain: l.gain ?? 1, kind: l.kind });
  if (M.deck && M.deck.lights) for (const l of M.deck.lights) if (l.pos && l.on !== false) lamps.push({ p: l.pos, c: col(l.color || '#ffcf8a'), gain: 1, kind: l.kind });
  const stageSpots = world.stage ? world.stage.spots.filter(s => s.module === 'stage') : [];
  const stats = { lamps: lamps.length, n: 0, inBeams: 0 };
  const moth = (seed, t, r0) => {
    // an orbit round the light (its plane tilted), stalls and darts; a jitter of a few cm
    const h = k => hash1((seed * 7919 + k * 104729) >>> 0);
    const w = (0.9 + 2.6 * h(1)) * (h(2) < 0.5 ? 1 : -1), ph = h(3) * TAU;
    const dart = Math.pow(Math.max(0, Math.sin(t * (0.4 + 0.5 * h(4)) + ph)), 9);
    const a = w * t + ph + dart * 2.2, r = r0 * (0.55 + 0.45 * h(5)) * (1 + 0.35 * Math.sin(t * (1.3 + h(6)) + ph) + 0.6 * dart);
    const tilt = (h(7) - 0.5) * 1.2;
    const j = [0.03 * Math.sin(t * 23.1 + seed), 0.03 * Math.sin(t * 19.7 + seed * 1.7), 0.03 * Math.sin(t * 27.3 + seed * 2.3)];
    return [Math.cos(a) * r + j[0], Math.sin(a) * r * tilt + 0.25 * Math.sin(t * 0.9 + ph) + j[1], Math.sin(a) * r + j[2]];
  };
  function update(t, camera) {
    const N0 = ctx.SCENE || window.LIBERTY, hour = N0 && N0.hourNow !== undefined ? N0.hourNow : 18;
    const share = activity(MOTH.hours, hour);
    let n = 0;
    if (share > 0.01) {
      const cp = camera.position;
      // the lamps nearest the camera (within 60 m)
      const near = lamps.map((l, i) => [Math.hypot(l.p[0] - cp.x, l.p[1] - cp.y, l.p[2] - cp.z), i]).filter(q => q[0] < 60).sort((a, b) => a[0] - b[0]).slice(0, LAMPS);
      for (const [, li] of near) {
        const l = lamps[li], k = Math.round(PER_LAMP * share);
        for (let m = 0; m < k; m++) {
          const seed = li * 31 + m, o = moth(seed, t, 0.5 + 1.1 * hash1(seed * 13));
          const p = [l.p[0] + o[0], l.p[1] - 0.15 + o[1], l.p[2] + o[2]], d = Math.hypot(o[0], o[1], o[2]);
          const lit = 1.6 * l.gain / (0.25 + d * d), flick = 0.55 + 0.45 * Math.abs(Math.sin(t * 40 * TAU * 0.5 + seed));
          iP.setXYZW(n, p[0], p[1], p[2], 0.035); iQ.setXYZW(n, l.c[0], l.c[1], l.c[2], clamp(lit, 0, 4) * flick); n++;
        }
      }
      // the stage's beams near their lenses (while the show's light is up): moths drifting in the cone 1.5-9 m out
      let nb = 0;
      for (const [si, sp] of stageSpots.entries()) {
        if (nb >= BEAMS) break;
        const s = sp.state ? sp.state(t) : null;
        if (!s || !(s.intensity > 0.05) || !(s.beam > 0) || (s.angle || 0) >= 60) continue;
        const pos = s.pos, dir = s.dir, dl = Math.hypot(...dir) || 1, dv = dir.map(v => v / dl);
        if (Math.hypot(pos[0] - cp.x, pos[1] - cp.y, pos[2] - cp.z) > 70) continue;
        nb++;
        const c = s.color || [1, 1, 1], tanA = Math.tan((s.angle || 10) * Math.PI / 180);
        const ex = Math.abs(dv[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const u1 = [dv[1] * ex[2] - dv[2] * ex[1], dv[2] * ex[0] - dv[0] * ex[2], dv[0] * ex[1] - dv[1] * ex[0]], ul = Math.hypot(...u1);
        const a1 = u1.map(v => v / ul), a2 = [dv[1] * a1[2] - dv[2] * a1[1], dv[2] * a1[0] - dv[0] * a1[2], dv[0] * a1[1] - dv[1] * a1[0]];
        for (let m = 0; m < Math.round(PER_BEAM * share); m++) {
          const seed = 900 + si * 17 + m, h = q => hash1((seed * 131 + q) >>> 0);
          const s0 = 1.5 + 7.5 * h(1) + 0.6 * Math.sin(t * (0.3 + 0.4 * h(2)) + h(3) * TAU);
          const rr = s0 * tanA * 0.8 * Math.sqrt(h(4)), th = h(5) * TAU + t * (0.5 + h(6)) * (h(7) < 0.5 ? 1 : -1);
          const p = [0, 1, 2].map(q => pos[q] + dv[q] * s0 + (a1[q] * Math.cos(th) + a2[q] * Math.sin(th)) * rr);
          const lit = (s.intensity * (10 / s0) ** 2) * 0.35, flick = 0.55 + 0.45 * Math.abs(Math.sin(t * 40 * TAU * 0.5 + seed));
          iP.setXYZW(n, p[0], p[1], p[2], 0.035); iQ.setXYZW(n, c[0], c[1], c[2], clamp(lit, 0, 6) * flick); n++;
          if (n >= MAX) break;
        }
      }
      stats.inBeams = nb;
    }
    ig.instanceCount = n; mesh.visible = n > 0; stats.n = n;
    if (n) { iP.needsUpdate = true; iQ.needsUpdate = true; }
  }
  return { update, stats, mesh };
}
