// liberty/src/far/sprites.js: point lights seen from afar (B6): street lamps, windows' sparks, beacons, the bridges'
// necklaces, cars and aircraft. Each is a camera-facing dot drawn at least minPx pixels across (a light never drops
// under a pixel and flickers out on a pan: style.md K3, point emitters), its world size where it is near, emissive only
// (the engine's air fogs it with distance; bloom takes the bright ones), in the water's reflection too (the water module
// draws its dashes from the reflection). A light may blink (period, duty, phase: a pure function of the scene clock)
// and comes on with the night (its uNight threshold). Groups are tiled so every pass culls them; a group whose lights
// move (cars, aircraft) sets its positions each frame from a function of t.
import { lin } from 'scene3d/util.js';

const T = window.THREE;

const VERT = /* glsl */`
attribute vec4 aPos; attribute vec4 aCol; attribute vec4 aBlink;
uniform float uSpriteGain, uSpriteOn, uMirrorPx, uMirrorFar;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  vec3 c = aPos.xyz;
  float d = max(distance(c, cameraPosition), 0.1);
  // metres per pixel at this distance (perspective: 2 d tan(fov/2) / H; orthographic: the frustum's height / H)
  float mpp = projectionMatrix[3][3] > 0.5 ? 2.0 / (projectionMatrix[1][1] * uResolution.y) : 2.0 * d / (projectionMatrix[1][1] * uResolution.y);
  float sizeM = max(aCol.w, aBlink.w * mpp), eK = 1.0;
  // in a mirror's pass (the water's reflection: uClip set) the far lights stay as the frame draws them by default
  // (uMirrorFar 1: the city's reflections as the director passed them on review2, its named anime gain, many times its
  // true light). Under 1 (?wfar=, B3, the integrator's round 4: a reflection never outweighs its source) a light is drawn
  // at least its minimum in the mirror's own texels (uMirrorPx: the frame's pixels a texel; uResolution is the frame's
  // there) and carries between its true light (0) and the frame's radiance (1)
  if (uMirrorPx > 0.0 && uClip.y > 0.5 && uMirrorFar < 1.0) { sizeM = max(aCol.w, aBlink.w * mpp * uMirrorPx); eK = mix((aCol.w / sizeM) * (aCol.w / sizeM), 1.0, uMirrorFar); }
  vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  P = c + (R * uv.x + U * uv.y) * sizeM * 0.5;
  // on with the night, blinking by its schedule; energy kept when a near light shrinks to its minimum (dimmer, not smaller)
  float on = smoothstep(aPos.w, aPos.w + 0.15, uNight) * uSpriteOn;
#if NEARFADE > 0
  // (a set whose poles nobody models, the street lamps: out where it would be resolved as a floating disc)
  on *= smoothstep(0.5 * float(NEARFADE), float(NEARFADE), d);
#endif
  if (aBlink.x > 0.0) on *= step(fract((uTime + aBlink.z) / aBlink.x), aBlink.y);
  vSp = vec4(aCol.rgb * on * uSpriteGain * eK, 0.0);
  vSq = uv;
  if (on <= 0.0) P = c + vec3(0.0, -1e4, 0.0);
}`;
const FRAG = /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  if (dot(vSq, vSq) > 1.0) discard;
  s.albedo = vec3(0.0); s.emissive = vSp.rgb; s.rough = 1.0; s.rim = 0.0;
}`;

let MATS = null;
const FADED = new Map();
function mats(world, fade = 0) {
  if (!MATS) {
    const U = { uSpriteGain: { value: 1 }, uSpriteOn: { value: 1 }, uMirrorPx: world.U.uMirrorPx || (world.U.uMirrorPx = { value: 0 }), uMirrorFar: world.U.uMirrorFar || (world.U.uMirrorFar = { value: 1 }) };
    MATS = world.mat({ name: 'far lights', lines: 0, defines: { SPOTS: 0, NEARFADE: 0 }, varyings: 'varying vec4 vSp; varying vec2 vSq;', uniforms: U, vertex: VERT, surface: FRAG });
    MATS.U = U;
  }
  if (!fade) return MATS;
  // a variant that fades its lights out nearer than fade metres (the same uniforms)
  if (!FADED.has(fade)) FADED.set(fade, world.mat({ name: 'far lights (near fade ' + fade + ' m)', lines: 0, defines: { SPOTS: 0, NEARFADE: Math.round(fade) }, varyings: 'varying vec4 vSp; varying vec2 vSq;', uniforms: MATS.U, vertex: VERT, surface: FRAG }));
  return FADED.get(fade);
}

const hashI = i => { let n = (i * 2654435761) >>> 0; n ^= n >>> 15; n = Math.imul(n, 0x2c1b3c6d) >>> 0; n ^= n >>> 12; return n >>> 0; };
const QUAD = (() => {
  const g = new T.InstancedBufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(12), 3));
  g.setAttribute('uv', new T.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
})();

// a set of lights: add() them, then flush() into tiled instanced meshes (static), or make it moving: { moving: true,
// max } and set positions each frame with set(i, x, y, z) and commit()
export function lightSet(world, name, { tile = 2000, moving = false, max = 0, reflect = true, thin = 0, fade = 0 } = {}) {
  const M = mats(world, fade);
  const pos = [], col = [], blink = [];
  const S = {
    name, n: 0, meshes: [],
    // x y z; c: [r, g, b] linear; k: intensity; o: { size (m), minPx, period (s), duty, phase (s), on (uNight) }
    add(x, y, z, c, k = 1, o = {}) {
      pos.push(x, y, z, o.on ?? 0.15); col.push(c[0] * k, c[1] * k, c[2] * k, o.size ?? 0.8); blink.push(o.period || 0, o.duty ?? 0.5, o.phase || 0, o.minPx ?? 1.6);
      return S.n++;
    },
    flush() {
      if (moving) return S;
      const groups = new Map();
      for (let i = 0; i < S.n; i++) { const k = Math.floor(pos[i * 4] / tile) + ',' + Math.floor(pos[i * 4 + 2] / tile); let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(i); }
      for (const ids of groups.values()) {
        // (thinned sets: each tile's lights in a seeded random order, so a prefix is an even sample of them)
        if (thin) ids.sort((a, b) => hashI(a) - hashI(b));
        S.meshes.push(make(ids));
      }
      if (thin) world.onFrame((t, cam) => {
        if (!cam) return;
        const e = cam.position;
        for (const m of S.meshes) {
          const c = m.boundingSphere.center, d = Math.max(1, Math.hypot(c.x - e.x, c.z - e.z) - m.boundingSphere.radius * 0.7);
          m.count = Math.max(1, Math.ceil(m.userData.n * Math.min(1, thin / d)));
        }
      });
      return S;
    },
  };
  const make = (ids, cap = ids.length) => {
    const g = QUAD.clone();
    const P = new Float32Array(cap * 4), C = new Float32Array(cap * 4), B = new Float32Array(cap * 4);
    ids.forEach((i, j) => { for (let k = 0; k < 4; k++) { P[j * 4 + k] = pos[i * 4 + k]; C[j * 4 + k] = col[i * 4 + k]; B[j * 4 + k] = blink[i * 4 + k]; } });
    g.setAttribute('aPos', new T.InstancedBufferAttribute(P, 4)); g.setAttribute('aCol', new T.InstancedBufferAttribute(C, 4)); g.setAttribute('aBlink', new T.InstancedBufferAttribute(B, 4));
    const m = world.mesh(g, M, { count: cap, name: 'far lights:' + name, cast: false, reflect });
    m.userData.loose = 'a light';
    // bounds from the lights (the quad's own geometry is at the origin)
    const box = new T.Box3();
    for (let j = 0; j < ids.length; j++) box.expandByPoint(new T.Vector3(P[j * 4], P[j * 4 + 1], P[j * 4 + 2]));
    m.boundingSphere = box.isEmpty() ? new T.Sphere(new T.Vector3(), 1e6) : box.getBoundingSphere(new T.Sphere());
    m.boundingSphere.radius += 50; m.count = ids.length; m.userData.n = ids.length;
    return m;
  };
  if (moving) {
    // one mesh, its positions rewritten each frame (cars, aircraft): bounds = the whole world
    S.init = () => { const m = make([...Array(S.n).keys()], Math.max(S.n, max)); m.boundingSphere = new T.Sphere(new T.Vector3(), 1e6); S.meshes.push(m); S.P = m.geometry.attributes.aPos; S.C = m.geometry.attributes.aCol; return S; };
    S.set = (i, x, y, z) => { const a = S.P.array; a[i * 4] = x; a[i * 4 + 1] = y; a[i * 4 + 2] = z; };
    S.setCol = (i, r, g, b) => { const a = S.C.array; a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; };
    S.commit = (n = S.n) => { S.meshes[0].count = n; S.P.needsUpdate = true; S.C.needsUpdate = true; };
  }
  return S;
}

export const LIGHT_COL = {
  sodium: lin('#ffb15a'), led3000: lin('#ffd8a8'), led4000: lin('#fff0dc'), white: [1, 1, 1], red: lin('#ff2a1a'), green: lin('#3dff7a'),
  amber: lin('#ffae3a'), window: lin('#ffc46e'), cool: lin('#d6e4ff'), head: lin('#fff6e8'), tail: lin('#ff3020'),
};
export function spriteUniforms() { return MATS && MATS.U; }

// traffic on the GPU: each car-light runs along one segment (a, b) at its speed from its phase, wrapping at b to a (on a
// polyline of short segments a car leaving one is another entering the next: from afar, a steady stream). A pure
// function of the scene clock; nothing per frame on the CPU
const FLOW_VERT = /* glsl */`
attribute vec4 aA; attribute vec4 aB; attribute vec4 aCol;
uniform float uSpriteGain, uFlowOn, uMirrorPx, uMirrorFar;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  float L = max(distance(aA.xyz, aB.xyz), 0.1);
  float f = fract((aB.w + aA.w * uTime) / L);
  vec3 c = mix(aA.xyz, aB.xyz, f);
  float d = max(distance(c, cameraPosition), 0.1);
  float mpp = projectionMatrix[3][3] > 0.5 ? 2.0 / (projectionMatrix[1][1] * uResolution.y) : 2.0 * d / (projectionMatrix[1][1] * uResolution.y);
  float sizeM = max(aCol.w, 1.25 * mpp), eK = 1.0;
  if (uMirrorPx > 0.0 && uClip.y > 0.5 && uMirrorFar < 1.0) { sizeM = max(aCol.w, 1.25 * mpp * uMirrorPx); eK = mix((aCol.w / sizeM) * (aCol.w / sizeM), 1.0, uMirrorFar); }   // (as the lights')
  vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  P = c + (R * uv.x + U * uv.y) * sizeM * 0.5;
  float on = smoothstep(0.02, 0.2, uNight) * uFlowOn;
  vSp = vec4(aCol.rgb * on * uSpriteGain * eK, 0.0); vSq = uv;
  if (on <= 0.0) P = c + vec3(0.0, -1e4, 0.0);
}`;
let FMATS = null;
// cars: [{ a: [x, y, z], b: [x, y, z], speed, phase, c: [r, g, b] (linear x intensity), size }]; tiled, thinned by distance
export function flowSet(world, name, cars, { tile = 3000, thin = 0 } = {}) {
  if (!FMATS) { FMATS = world.mat({ name: 'far traffic', lines: 0, defines: { SPOTS: 0 }, varyings: 'varying vec4 vSp; varying vec2 vSq;', uniforms: { uSpriteGain: MATS ? MATS.U.uSpriteGain : { value: 1 }, uFlowOn: { value: 1 }, uMirrorPx: world.U.uMirrorPx || (world.U.uMirrorPx = { value: 0 }), uMirrorFar: world.U.uMirrorFar || (world.U.uMirrorFar = { value: 1 }) }, vertex: FLOW_VERT, surface: FRAG }); }
  const groups = new Map();
  cars.forEach((c, i) => { const k = Math.floor(c.a[0] / tile) + ',' + Math.floor(c.a[2] / tile); let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(i); });
  const meshes = [];
  for (const ids of groups.values()) {
    if (thin) ids.sort((a, b) => hashI(a) - hashI(b));
    const n = ids.length, A = new Float32Array(n * 4), B = new Float32Array(n * 4), C = new Float32Array(n * 4), box = new T.Box3();
    ids.forEach((i, j) => { const c = cars[i]; A.set([...c.a, c.speed], j * 4); B.set([...c.b, c.phase], j * 4); C.set([...c.c, c.size || 1.5], j * 4); box.expandByPoint(new T.Vector3(...c.a)); box.expandByPoint(new T.Vector3(...c.b)); });
    const g = QUAD.clone();
    g.setAttribute('aA', new T.InstancedBufferAttribute(A, 4)); g.setAttribute('aB', new T.InstancedBufferAttribute(B, 4)); g.setAttribute('aCol', new T.InstancedBufferAttribute(C, 4));
    const m = world.mesh(g, FMATS, { count: n, name: 'far traffic:' + name, cast: false });
    m.boundingSphere = box.getBoundingSphere(new T.Sphere()); m.boundingSphere.radius += 30; m.userData.n = n; m.userData.loose = 'a car\'s light';
    meshes.push(m);
  }
  if (thin) world.onFrame((t, cam) => {
    if (!cam) return;
    const e = cam.position;
    for (const m of meshes) { const c = m.boundingSphere.center, d = Math.max(1, Math.hypot(c.x - e.x, c.z - e.z) - m.boundingSphere.radius * 0.7); m.count = Math.max(1, Math.ceil(m.userData.n * Math.min(1, thin / d))); }
  });
  return { meshes, n: cars.length };
}
