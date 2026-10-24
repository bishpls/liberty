// engine/scene3d/stagelight.js: stage lights for a world that hosts a show (opt-in: host opts.stage, so every other
// world compiles and draws exactly what it did).
//
//   spots   moving lights' cones on every surface: world.stage.spot(spec), shaded in glsl.js LIGHT (#ifdef SPOTS)
//   beams   their shafts in the haze: one cone a spot, the light scattered toward the eye integrated along each view ray
//           (an analytic inverse-square weight per sub-segment, the cone's edge, the gobo, a Henyey-Greenstein phase
//           and the haze's density sampled at each), clipped by the scene's depth and the water (and drawn mirrored in
//           the water's reflection)
//   lasers  thin beams drawn at least a pixel wide, with a coloured glow, as bright as the haze they cross
//   haze    the medium both show in: a density inside a box with a soft edge (rule 10), drifting on the wind
//
//   const S = installStage(world, { spots: 64 });          (host does this for opts.stage, before any module builds)
//   S.spot({ name, state: t => ({ pos, dir, color, intensity, angle, soft, gobo, rot, range, srcR, beam }) })
//     pos [x, y, z] the lens; dir [x, y, z] the axis (normalised here); color linear rgb; intensity: the illuminance on
//     the axis 10 m out (scene units: the sun is ~2.5); angle: the outer half-angle (deg); soft: the inner half-angle
//     as a share of it (0 a hard edge .. 1 all falloff); gobo 0-5 (glsl.js GOBO_GLSL) turned by rot (rad); range (m);
//     srcR the lens's radius (m: the beam's width at the lens; a point source's core); beam: the shaft's share in the
//     haze (0 none); samples: the shaft's steps along a view ray (default 12, 2-16: a soft cone without a gobo needs
//     ~4). An angle of 60 deg or more is a point source (a lamp, a pyro flash: 180 lights every way).
//     halo: the glow round the shaft, as a share of the shaft's own light (0 none, the default): the light the haze
//     scatters again about a beam (forward multiple scattering), a gaussian tube about the axis that widens with the
//     distance from the cone's apex at haloAngle (deg, its 1/e half-width; default 2.5 x angle), cut by the scene in
//     front like the shaft, so the glow hugs the beam and falls off with the distance from it; it fades over the last
//     third of a shaft that lands on nothing. core: the shaft's own share drawn (default 1; 0 with a halo: a soft glow
//     column with no edge, e.g. the haze lit over a stage)
//     surface: false keeps a spot off every surface (its shaft only); by default a cone that lands on no stopper and
//     points above the water is a sky beam and lights nothing but the haze
//     landSlack (m, default 0): surfaces up to this far behind the plane the spot lands on are still lit. A stopper is a
//     low-poly proxy, and its face's plane cuts a wide wash on a curved surface (a hull's side) along the proxy's facets:
//     hard-edged, lobed pools like cut paper. The shaft still ends where it lands
//   S.laser({ name, beams: t => [{ a: [x, y, z], b: [x, y, z], color: [r, g, b], power, core, glow }, ...] })
//     power: the beam's brightness in haze of density 1 (scene units); core and glow: widths in pixels at 1080p;
//     a projector with stop: true has each beam end where it first meets a stopper (a ray each: keep its beams few)
//   S.stopper(mesh)  what a beam ends on: each frame a ray along every beam's axis meets the stoppers (low-poly proxies:
//     a deck's planes, a house's boxes; they need not be drawn) and the shaft is cut at the plane of the surface it lands
//     on, so it ends in its pool instead of running on under the deck (the water's plane cuts every beam in the shader)
//   S.haze = { density (1/m), g, box: [x0, y0, z0, x1, y1, z1], edge (m), noise (0..1), drift: [vx, vz] (m/s), near (m) }
//     near: the shafts fade in over this distance from the eye (0, the default: none); a beam passing a camera close by
//     otherwise lays a wide out-of-focus wash over the frame's edge
//   S.gain = { beams: 1, lasers: 1 }                        (look dials)
//   S.halo = { sat: 0, screen: 0 }   the halos' look: sat k deepens the glow's hue (colour x (colour / its max)^k: anime
//     draws a whiter core in a coloured glow); screen (deg) caps the glow's half-width as the eye sees it, so a beam passing
//     close to the camera keeps a glow that hugs it instead of one that fills the frame (0: none; not a glow with no core)
//   spec.clip: [[nx, ny, nz, w], ...] up to four framing shutters (or barn doors): lit only where dot(n, P) > w, a 4 cm
//     soft edge; they cut its pools and its shaft. S.shutter(lens, a, b, keep) gives the blade that cuts along the line
//     a-b as seen from the lens (a plane through all three), keeping the side 'keep' is on
// Everything is a function of t: the show's schedule drives state(t) and beams(t).
import { COMMON, GOBO_GLSL } from './glsl.js';
import { GLOBAL_DEFINES, LAYER } from './mat.js';

const T = window.THREE;
const DEG = Math.PI / 180;
const q0 = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');

export function installStage(world, { spots = 64, beams = 64, lasers = 1024, tiles = [16, 9], perTile = 48 } = {}) {
  const pipe = world.pipe, U = world.U;
  GLOBAL_DEFINES.SPOTS = spots;
  // the spots' texture: five texels a spot, one row each (glsl.js); below them, the tiles' lists (one texture: a
  // material reading many maps must not lose another unit to the stage: WebGL stops at 16 and fails silently)
  // tiled culling: each frame every live spot's cone is projected to the screen and listed in the tiles it can reach;
  // a fragment loops over its tile's list only (glsl.js LIGHT). ?spottiles=0 loops over every spot (A/Bs)
  const TX = tiles[0], TY = tiles[1], KT = Math.ceil(Math.min(perTile, spots) / 4) * 4;
  if (tiles) GLOBAL_DEFINES.SPOT_TILES = 1;
  const TW = Math.max(9, TX * TY), TROWS = 1 + KT / 4;     // (texels 5-8 of a spot's row: its shutters)
  U.uSpotTileGrid = { value: new T.Vector3(TX, TY, spots) };
  U.uSpotTilesOn = { value: q0.get('spottiles') === '0' ? 0 : 1 };
  const ALL = new Float32Array(TW * (spots + TROWS) * 4);
  const spotData = { set(arr, o) { const i = Math.floor(o / 20), k = o - i * 20; ALL.set(arr, (i * TW) * 4 + k); } };   // (spot i's 20 floats: row i)
  const tileData = ALL.subarray(TW * spots * 4);
  const spotTex = new T.DataTexture(ALL, TW, spots + TROWS, T.RGBAFormat, T.FloatType);
  spotTex.minFilter = spotTex.magFilter = T.NearestFilter; spotTex.needsUpdate = true;
  U.uSpotTex = { value: spotTex }; U.uNumSpots = { value: 0 };
  const S = {
    spots: [], lasers: [], maxSpots: spots,
    haze: { density: 0.02, g: 0.55, box: [-1e4, -50, -1e4, 1e4, 200, 1e4], edge: 10, noise: 0.5, drift: [0.4, 0.1] },
    gain: { beams: +(q0.get('beamgain') || 1), lasers: +(q0.get('lasergain') || 1) },
    halo: { sat: 0, screen: 0 },
    live: { spots: 0, beams: 0, lasers: 0 },
  };
  S.spot = spec => { S.spots.push(Object.assign({ module: world.current }, spec)); return spec; };
  S.laser = spec => { S.lasers.push(Object.assign({ module: world.current }, spec)); return spec; };
  S.stoppers = [];
  S.stopper = mesh => { mesh.updateMatrixWorld(true); S.stoppers.push(mesh); return mesh; };
  S.shutter = (lens, a, b, keep) => {
    const u = [a[0] - lens[0], a[1] - lens[1], a[2] - lens[2]], v = [b[0] - lens[0], b[1] - lens[1], b[2] - lens[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map(x => x / l);
    let w = n[0] * lens[0] + n[1] * lens[1] + n[2] * lens[2];
    if (n[0] * keep[0] + n[1] * keep[1] + n[2] * keep[2] < w) { n = n.map(x => -x); w = -w; }
    return [n[0], n[1], n[2], w];
  };
  const ray = new T.Raycaster(), nm = new T.Matrix3();
  ray.layers.enableAll();                    // (the passes' layers: a scene mesh is on none of three's default)
  // where a ray from the lens along the axis first meets a stopper: the surface's plane [nx, ny, nz, w] (the beam exists
  // where dot(n, p) > w) and the distance; none: the far side of the range
  S.landing = (p, d, range) => {
    if (!S.stoppers.length) return null;
    ray.set(new T.Vector3(p[0], p[1], p[2]), new T.Vector3(d[0], d[1], d[2])); ray.near = 0.05; ray.far = range;
    const hit = ray.intersectObjects(S.stoppers, false)[0];
    if (!hit || !hit.face) return null;
    nm.getNormalMatrix(hit.object.matrixWorld);
    const n = hit.face.normal.clone().applyMatrix3(nm).normalize();
    if (n.x * d[0] + n.y * d[1] + n.z * d[2] > 0) n.negate();            // (the face toward the lens)
    return { n: [n.x, n.y, n.z, n.dot(hit.point)], dist: hit.distance };
  };
  world.stage = S;

  // ---- the beams: a closed unit cone (apex at the origin, axis +z, radius 1 at z = 1), instanced
  const cone = coneGeometry(40);
  const bGeo = new T.InstancedBufferGeometry();
  bGeo.index = cone.index; bGeo.setAttribute('position', cone.attributes.position);
  const bAttr = {};
  for (const k of ['iA', 'iD', 'iC', 'iE', 'iF', 'iS', 'iK0', 'iK1', 'iK2', 'iK3']) { bAttr[k] = new T.InstancedBufferAttribute(new Float32Array(beams * 4), 4); bAttr[k].setUsage(T.DynamicDrawUsage); bGeo.setAttribute(k, bAttr[k]); }
  bGeo.instanceCount = 0;
  const hz = () => ({ uHaze: { value: new T.Vector4() }, uHazeMin: { value: new T.Vector3() }, uHazeMax: { value: new T.Vector3() }, uDrift: { value: new T.Vector2() } });
  const shared = { uTime: U.uTime, uResolution: U.uResolution, uWaterLevel: U.uWaterLevel, uClip: U.uClip, uExposure: U.uExposure };
  const HZ = hz();
  const bMat = new T.ShaderMaterial({
    name: 'stage beams', uniforms: Object.assign({}, shared, HZ, { uG: { value: null }, uGain: { value: 1 }, uNear: { value: 0 }, uHalo: { value: new T.Vector2() } }),
    vertexShader: BEAM_VERT, fragmentShader: COMMON + GOBO_GLSL() + HAZE_GLSL + BEAM_FRAG,
    side: T.BackSide, transparent: true, depthTest: false, depthWrite: false,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor,
  });
  const bMesh = new T.Mesh(bGeo, bMat);
  tagFx(bMesh, bMat, true); bMesh.name = 'stage beams'; bMesh.renderOrder = 200; bMesh.userData.module = world.current || 'stage';
  bMesh.userData.loose = 'light in the haze';
  pipe.add(bMesh);

  // ---- the lasers: a quad a beam, widened in screen space
  const lGeo = new T.InstancedBufferGeometry();
  lGeo.setAttribute('position', new T.Float32BufferAttribute([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0], 3));
  lGeo.setIndex([0, 2, 1, 1, 2, 3]);
  const lAttr = {};
  for (const k of ['iP0', 'iP1', 'iCol']) { lAttr[k] = new T.InstancedBufferAttribute(new Float32Array(lasers * 4), 4); lAttr[k].setUsage(T.DynamicDrawUsage); lGeo.setAttribute(k, lAttr[k]); }
  lGeo.instanceCount = 0;
  const lMat = new T.ShaderMaterial({
    name: 'stage lasers', uniforms: Object.assign({}, shared, HZ, { uGain: { value: 1 } }),
    vertexShader: LASER_VERT, fragmentShader: COMMON + HAZE_GLSL + LASER_FRAG,
    side: T.DoubleSide, transparent: true, depthTest: true, depthWrite: false,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor,
  });
  const lMesh = new T.Mesh(lGeo, lMat);
  tagFx(lMesh, lMat, true); lMesh.name = 'stage lasers'; lMesh.renderOrder = 201; lMesh.userData.module = world.current || 'stage';
  lMesh.userData.loose = 'light in the haze';
  pipe.add(lMesh);
  S.meshes = { beams: bMesh, lasers: lMesh };

  const v = new T.Vector3();
  const reach = [], pv = new T.Vector4(), vp = new T.Matrix4(), counts = new Int32Array(TX * TY);
  S.tileStats = { mean: 0, max: 0, overflow: 0 };
  // a spot's reach on screen: the bounding box of its cone (the apex and an octagon round the base circle, the cone cut
  // where it lands), or of its range's box for a point source; any corner behind the eye: every tile (conservative)
  function binTiles(camera, n) {
    camera.updateMatrixWorld(); vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    counts.fill(0); tileData.fill(0);
    const W = TW;
    let over = 0;
    for (let i = 0; i < n; i++) {
      const r = reach[i];
      let x0 = 1, x1 = -1, y0 = 1, y1 = -1, behind = false;
      const add = (x, y, z) => {
        pv.set(x, y, z, 1).applyMatrix4(vp);
        if (pv.w <= 1e-3) { behind = true; return; }
        const nx = pv.x / pv.w, ny = pv.y / pv.w;
        x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
      };
      if (r.all || r.ang >= 60 * DEG) {
        const R = r.range, c = r.A;
        for (let k = 0; k < 8; k++) add(c[0] + (k & 1 ? R : -R), c[1] + (k & 2 ? R : -R), c[2] + (k & 4 ? R : -R));
      } else {
        // the 8 edge rays of an octagon round the cone (circumscribed), each cut where it meets the landing plane (an
        // oblique deck takes the far edge much further than the axis), else at the range
        const d = r.d, L = r.len, tg = Math.tan(r.ang) / Math.cos(Math.PI / 8) * 1.05, pl = r.plane;
        const ux = Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
        let a = [d[1] * ux[2] - d[2] * ux[1], d[2] * ux[0] - d[0] * ux[2], d[0] * ux[1] - d[1] * ux[0]]; const al = Math.hypot(...a); a = a.map(t => t / al);
        const b = [d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]];
        add(r.A[0], r.A[1], r.A[2]);
        for (let k = 0; k < 8; k++) {
          const t = k / 8 * Math.PI * 2, cx = Math.cos(t) * tg, cy = Math.sin(t) * tg;
          const e = [d[0] + a[0] * cx + b[0] * cy, d[1] + a[1] * cx + b[1] * cy, d[2] + a[2] * cx + b[2] * cy];     // along the axis by 1
          let s = L;
          if (pl) { const den = pl[0] * e[0] + pl[1] * e[1] + pl[2] * e[2]; if (den < -1e-6) s = Math.min(L, (pl[3] - (pl[0] * r.A[0] + pl[1] * r.A[1] + pl[2] * r.A[2])) / den + 0.5); }
          add(r.A[0] + e[0] * s, r.A[1] + e[1] * s, r.A[2] + e[2] * s);
        }
      }
      let tx0 = 0, tx1 = TX - 1, ty0 = 0, ty1 = TY - 1;
      if (!behind) {
        if (x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1) continue;              // wholly off screen
        tx0 = Math.max(0, Math.floor((x0 * 0.5 + 0.5) * TX)); tx1 = Math.min(TX - 1, Math.floor((x1 * 0.5 + 0.5) * TX));
        ty0 = Math.max(0, Math.floor((y0 * 0.5 + 0.5) * TY)); ty1 = Math.min(TY - 1, Math.floor((y1 * 0.5 + 0.5) * TY));
      }
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const t = ty * TX + tx, c = counts[t];
        if (c >= KT) { over++; continue; }
        tileData[((1 + (c >> 2)) * W + t) * 4 + (c & 3)] = i; counts[t] = c + 1;
      }
    }
    let sum = 0, mx = 0;
    for (let t = 0; t < W; t++) { tileData[t * 4] = counts[t]; sum += counts[t]; mx = Math.max(mx, counts[t]); }
    S.tileStats = { mean: +(sum / W).toFixed(1), max: mx, overflow: over };
  }
  // after every module's own frame update (world.late), so a spot whose state a module sets in its update is this frame's
  world.late.push((t, camera) => {
    const hid = world.hidden;
    // the haze
    const H = S.haze, b = H.box;
    HZ.uHaze.value.set(H.density, H.g, H.noise, H.edge);
    HZ.uHazeMin.value.set(b[0], b[1], b[2]); HZ.uHazeMax.value.set(b[3], b[4], b[5]);
    HZ.uDrift.value.set(H.drift[0] * t, H.drift[1] * t);
    bMat.uniforms.uG.value = pipe.RT_G.texture; bMat.uniforms.uNear.value = H.near || 0;
    bMat.uniforms.uHalo.value.set(S.halo.sat || 0, S.halo.screen > 0 ? Math.tan(S.halo.screen * DEG) : 0);
    bMat.uniforms.uGain.value = S.gain.beams; lMat.uniforms.uGain.value = S.gain.lasers;
    // spots: every live one, nearest the camera first when there are more than the shader holds
    const live = [];
    for (const sp of S.spots) {
      if (hid && hid.has(sp.module)) continue;
      const s = sp.state ? sp.state(t) : sp;
      const I = s.intensity ?? 1;
      if (!(I > 1e-4)) continue;
      const p = s.pos, d = s.dir;
      v.set(d[0], d[1], d[2]).normalize();
      live.push({ s, p, d: [v.x, v.y, v.z], I, dc: Math.hypot(p[0] - camera.position.x, p[1] - camera.position.y, p[2] - camera.position.z) });
    }
    if (live.length > spots) live.sort((a, c) => a.dc - c.dc);
    const n = Math.min(spots, live.length);
    let nb = 0, ns = 0;
    for (let li = 0; li < n; li++) {
      const i = ns;                                                           // (its row in the surface list, if it joins it)
      const { s, p, d, I } = live[li], c = s.color || [1, 1, 1];
      const ang = (s.angle ?? 8) * DEG, all = ang >= 179 * DEG;            // (180: every way, no edge)
      const cosO = all ? -1.001 : Math.cos(ang), cosI = all ? -1 : Math.cos(ang * (1 - (s.soft ?? 0.3)));
      const range = s.range ?? 60, o = i * 20;
      // the beam leaves the lens as wide as the lens: its cone's apex sits d0 behind it (a narrow beam is nearly a
      // shaft near the fixture, a wash nearly a point); the intensity is given 10 m out from the lens
      // (a cone of 60 deg or more is a point source: a lamp, a flash; angle 180 lights every way, and draws no shaft)
      const d0 = ang >= 60 * DEG ? 0 : (s.srcR ?? 0.08) / Math.tan(Math.max(ang, 0.2 * DEG)), k = ((10 + d0) / 10) ** 2;
      const A = [p[0] - d[0] * d0, p[1] - d[1] * d0, p[2] - d[2] * d0];
      const clip = s.clip && s.clip.length ? s.clip.slice(0, 4) : null, gid = (s.gobo || 0) + (clip ? 16 * clip.length : 0);
      spotData.set([A[0], A[1], A[2], range + d0, d[0], d[1], d[2], cosO, c[0] * I * k, c[1] * I * k, c[2] * I * k, Math.max(cosI, cosO + 1e-4),
        gid, s.rot || 0, d0 > 0 ? d0 : -(s.srcR ?? 0.08), s.beam ?? 1], o);
      if (clip) clip.forEach((cp, c) => ALL.set(cp, (i * TW + 5 + c) * 4));
      // where it lands (a stopper's plane): nothing past it is lit, and its shaft ends there
      const land = s.stop === false ? null : S.landing(p, d, range);
      const litPlane = land ? (s.landSlack > 0 ? [land.n[0], land.n[1], land.n[2], land.n[3] - s.landSlack] : land.n) : null;
      spotData.set(litPlane || [0, 0, 0, -1e9], o + 16);
      reach[i] = { A, d, ang: Math.min(ang, Math.PI), len: range + d0, plane: litPlane, all, range };
      // a beam that lands on nothing and points above the water lights only the haze (B5: ~30 of the show's ~50 at any
      // time): it leaves the surface list, so no fragment pays for it; its shaft still draws. spec.surface overrides
      const point = all || ang >= 60 * DEG;
      if (s.surface !== undefined ? s.surface : point || land || d[1] < -0.02) ns++;
      // its shaft (a cone as long as its range, or to where the show says it lands)
      const bs = ang >= 60 * DEG ? 0 : s.beam ?? 1;
      if (bs > 0 && nb < beams) {
        const L = Math.min(s.beamLength ?? range, land ? land.dist + 0.5 : range);
        bAttr.iF.array.set(land ? land.n : [0, 0, 0, -1], nb * 4);
        bAttr.iA.array.set([A[0], A[1], A[2], L + d0], nb * 4);
        bAttr.iD.array.set([d[0], d[1], d[2], cosO], nb * 4);
        bAttr.iC.array.set([c[0] * I * k, c[1] * I * k, c[2] * I * k, Math.max(cosI, cosO + 1e-4)], nb * 4);
        bAttr.iE.array.set([gid, s.rot || 0, d0, bs], nb * 4);
        for (let c = 0; c < 4; c++) bAttr['iK' + c].array.set(clip && clip[c] ? clip[c] : [0, 0, 0, -1e9], nb * 4);
        const hs = s.halo > 0 ? s.halo : 0, hAng = Math.min((s.haloAngle ?? 2.5 * (s.angle ?? 8)) * DEG, 40 * DEG);
        bAttr.iS.array.set([Math.max(2, Math.min(16, Math.round(s.samples ?? 12))), hs, hs > 0 ? Math.tan(hAng) : 0, hs > 0 ? s.core ?? 1 : 1], nb * 4);
        nb++;
      }
    }
    U.uNumSpots.value = ns; spotTex.needsUpdate = true;
    if (U.uSpotTilesOn.value > 0.5) binTiles(camera, ns);
    for (const k in bAttr) { bAttr[k].needsUpdate = true; bAttr[k].addUpdateRange(0, nb * 4); }
    bGeo.instanceCount = nb; bMesh.visible = nb > 0;
    // lasers
    let nl = 0;
    const s1080 = pipe.h / 1080;
    for (const L of S.lasers) {
      if (hid && hid.has(L.module)) continue;
      for (const bm of L.beams(t) || []) {
        if (nl >= lasers) break;
        if (L.stop) {
          const dx = bm.b[0] - bm.a[0], dy = bm.b[1] - bm.a[1], dz = bm.b[2] - bm.a[2], len = Math.hypot(dx, dy, dz);
          const hit = len > 0 && S.landing(bm.a, [dx / len, dy / len, dz / len], len);
          if (hit) { const k = hit.dist / len; bm.b = [bm.a[0] + dx * k, bm.a[1] + dy * k, bm.a[2] + dz * k]; bm.landed = true; }
        }
        const c = bm.color || [0, 1, 0], P = bm.power ?? 1;
        lAttr.iP0.array.set([bm.a[0], bm.a[1], bm.a[2], (bm.core ?? 1.6) * s1080], nl * 4);
        lAttr.iP1.array.set([bm.b[0], bm.b[1], bm.b[2], (bm.glow ?? 9) * s1080], nl * 4);
        lAttr.iCol.array.set([c[0] * P, c[1] * P, c[2] * P, bm.haze ?? 1], nl * 4);
        nl++;
      }
    }
    for (const k in lAttr) { lAttr[k].needsUpdate = true; lAttr[k].addUpdateRange(0, nl * 4); }
    lGeo.instanceCount = nl; lMesh.visible = nl > 0;
    S.live.spots = ns; S.live.sky = n - ns; S.live.beams = nb; S.live.lasers = nl;
  });
  return S;
}

// an effect mesh in the transparent pass only (and the water's reflection when refl): its one material serves both
function tagFx(mesh, mat, refl) {
  mesh.userData.mats = { color: mat };
  mesh.layers.disableAll(); mesh.layers.enable(LAYER.TRANS); if (refl) mesh.layers.enable(LAYER.REFLECT);
  mesh.frustumCulled = false;
}

// a closed cone: apex (0, 0, 0), base at z = 1 with radius 1
function coneGeometry(seg) {
  const pos = [0, 0, 0], idx = [];
  for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; pos.push(Math.cos(a), Math.sin(a), 1); }
  pos.push(0, 0, 1);
  const cap = seg + 1;
  for (let i = 0; i < seg; i++) { const a = 1 + i, b = 1 + (i + 1) % seg; idx.push(0, b, a, cap, a, b); }     // (outward faces: the far side is the back)
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}

// the haze's density at a point: a box with a soft edge, broken by a slow drifting noise
const HAZE_GLSL = /* glsl */`
uniform vec4 uHaze;            // density (1/m), phase g, noise share, edge (m)
uniform vec3 uHazeMin, uHazeMax;
uniform vec2 uDrift;           // the haze's drift (m) by now: a constant wind times t (the same everywhere)
float hazeAt(vec3 p) {
  vec3 e = min(p - uHazeMin, uHazeMax - p);
  float inside = saturate(min(e.x, min(e.y, e.z)) / max(uHaze.w, 1e-3));
  if (inside <= 0.0) return 0.0;
  vec3 q = vec3(p.x - uDrift.x, p.y, p.z - uDrift.y);
  float n = 0.6 * vnoise3(q * 0.11) + 0.4 * vnoise3(q * 0.37 + 5.1);
  return uHaze.x * inside * max(0.0, 1.0 + uHaze.z * n);
}
float hgPhase(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
`;

const BEAM_VERT = /* glsl */`
attribute vec4 iA; attribute vec4 iD; attribute vec4 iC; attribute vec4 iE; attribute vec4 iF; attribute vec4 iS;
attribute vec4 iK0; attribute vec4 iK1; attribute vec4 iK2; attribute vec4 iK3;
flat varying vec4 vK0; flat varying vec4 vK1; flat varying vec4 vK2; flat varying vec4 vK3;
varying vec3 vP;
flat varying vec4 vA; flat varying vec4 vD; flat varying vec4 vC; flat varying vec4 vE; flat varying vec4 vF; flat varying float vNS;
flat varying vec3 vH;
void main() {
  vec3 D = normalize(iD.xyz); float cosO = iD.w, tanO = sqrt(max(1.0 - cosO * cosO, 1e-6)) / cosO;
  vec3 u = normalize(cross(D, abs(D.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), v = cross(D, u);
  // (with a halo the drawn cone is the glow's, out to 2.2 of its half-widths: e^-4.8 of its peak)
  float L = iA.w, R = L * (iS.y > 0.0 ? max(tanO, 2.2 * iS.z) : tanO) * 1.03;
  vH = iS.yzw; vK0 = iK0; vK1 = iK1; vK2 = iK2; vK3 = iK3;
  vec3 P = iA.xyz + u * position.x * R + v * position.y * R + D * position.z * L;
  vP = P; vA = iA; vD = vec4(D, cosO); vC = iC; vE = iE; vF = iF; vNS = iS.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}`;

const BEAM_FRAG = /* glsl */`
uniform sampler2D uG; uniform vec2 uResolution; uniform float uWaterLevel; uniform vec4 uClip; uniform float uGain;
uniform float uNear; uniform vec2 uHalo;
varying vec3 vP;
flat varying vec4 vA; flat varying vec4 vD; flat varying vec4 vC; flat varying vec4 vE; flat varying vec4 vF; flat varying float vNS;
flat varying vec3 vH;
flat varying vec4 vK0; flat varying vec4 vK1; flat varying vec4 vK2; flat varying vec4 vK3;
float clipK(vec3 p) {
  return smoothstep(-0.04, 0.04, dot(vK0.xyz, p) - vK0.w) * smoothstep(-0.04, 0.04, dot(vK1.xyz, p) - vK1.w)
       * smoothstep(-0.04, 0.04, dot(vK2.xyz, p) - vK2.w) * smoothstep(-0.04, 0.04, dot(vK3.xyz, p) - vK3.w);
}
float erfA(float x) { float x2 = x * x; return sign(x) * sqrt(1.0 - exp(-x2 * (1.2732 + 0.147 * x2) / (1.0 + 0.147 * x2))); }
bool inCone(vec3 p, vec3 A, vec3 D, float cosO, float L) {
  vec3 q = p - A; float h = dot(q, D);
  return h >= 0.0 && h <= L && h >= length(q) * cosO;
}
void main() {
  vec3 o = cameraPosition, A = vA.xyz, D = vD.xyz; float cosO = vD.w, L = vA.w;
  vec3 dv = vP - o; float tExit = length(dv); vec3 d = dv / max(tExit, 1e-5);
  // where the view ray enters the cone (the camera itself when it stands inside): the side's roots and the cap
  float tIn = 0.0;
  if (!inCone(o, A, D, cosO, L)) {
    tIn = tExit;
    vec3 co = o - A; float dvD = dot(d, D), cv = dot(co, D), c2 = cosO * cosO;
    float qa = dvD * dvD - c2, qb = 2.0 * (dvD * cv - c2 * dot(d, co)), qc = cv * cv - c2 * dot(co, co);
    float disc = qb * qb - 4.0 * qa * qc;
    if (disc >= 0.0 && abs(qa) > 1e-7) {
      float sq = sqrt(disc), r1 = (-qb - sq) / (2.0 * qa), r2 = (-qb + sq) / (2.0 * qa);
      float h1 = cv + r1 * dvD, h2 = cv + r2 * dvD;
      if (r1 > 0.0 && r1 < tIn && h1 >= 0.0 && h1 <= L) tIn = r1;
      if (r2 > 0.0 && r2 < tIn && h2 >= 0.0 && h2 <= L) tIn = r2;
    }
    if (abs(dvD) > 1e-6) {
      float rc = (L - cv) / dvD; vec3 pc = o + d * rc - (A + D * L);
      float R = L * sqrt(max(1.0 - c2, 0.0)) / cosO;
      if (rc > 0.0 && rc < tIn && dot(pc, pc) <= R * R) tIn = rc;
    }
  }
  // with a halo the drawn cone is the glow's, wider than the shaft: the shaft's own exit (its far root or its cap)
  float tOut = tExit;
  if (vH.x > 0.0) {
    tOut = 0.0;
    vec3 co = o - A; float dvD = dot(d, D), cv = dot(co, D), c2 = cosO * cosO;
    float qa = dvD * dvD - c2, qb = 2.0 * (dvD * cv - c2 * dot(d, co)), qc = cv * cv - c2 * dot(co, co);
    float disc = qb * qb - 4.0 * qa * qc;
    if (disc >= 0.0 && abs(qa) > 1e-7) {
      float sq = sqrt(disc), r1 = (-qb - sq) / (2.0 * qa), r2 = (-qb + sq) / (2.0 * qa);
      float h1 = cv + r1 * dvD, h2 = cv + r2 * dvD;
      if (r1 > 0.0 && h1 >= 0.0 && h1 <= L) tOut = max(tOut, r1);
      if (r2 > 0.0 && h2 >= 0.0 && h2 <= L) tOut = max(tOut, r2);
    }
    if (abs(dvD) > 1e-6) {
      float rc = (L - cv) / dvD; vec3 pc = o + d * rc - (A + D * L);
      float R = L * sqrt(max(1.0 - c2, 0.0)) / cosO;
      if (rc > 0.0 && dot(pc, pc) <= R * R) tOut = max(tOut, rc);
    }
  }
  float tEnd = tExit, t0 = 0.0;      // (t0: where the visible stretch of the ray starts, for the halo)
  bool refl = uClip.y > 0.5;          // the water's reflection pass (pipeline: uClip is the water's plane there)
  if (!refl) {
    // the scene in front of the beam (the G-buffer's view depth; the water comes later in the frame: its plane below)
    float vz = texture2D(uG, gl_FragCoord.xy / uResolution).z;
    vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    tEnd = min(tEnd, vz / max(dot(d, fwd), 1e-4));
    if (d.y < 0.0 && o.y > uWaterLevel) tEnd = min(tEnd, (uWaterLevel - o.y) / d.y);
  } else {
    // the mirrored eye sits under the water: only the part of the ray above the surface is reflected
    if (o.y < uWaterLevel) { if (d.y <= 0.0) discard; tIn = max(tIn, (uWaterLevel - o.y) / d.y); t0 = max(t0, (uWaterLevel - o.y) / d.y); }
  }
  // the surface it lands on (a stopper's plane): only the lens's side of it
  bool landed = vF.w > -0.5 || dot(vF.xyz, vF.xyz) > 0.5;
  if (landed) {
    float s0 = dot(vF.xyz, o) - vF.w, sd = dot(vF.xyz, d);
    if (s0 < 0.0) { if (sd <= 0.0) discard; tIn = max(tIn, -s0 / sd); t0 = max(t0, -s0 / sd); }
    else if (sd < 0.0) tEnd = min(tEnd, -s0 / sd);
  }
  float tEndC = min(tEnd, tOut);     // (no halo: tEnd itself)
  bool shaft = tEndC > tIn + 1e-4 && vH.z > 0.0;
  if (!shaft && (vH.x <= 0.0 || tEnd <= t0 + 1e-4)) discard;
  // the light scattered toward the eye: I / r^2 integrated analytically over each sub-segment (r^2 softened by the
  // lens's radius), times the cone's edge, the gobo, the phase and the haze sampled at the sub-segment's weighted middle
  float acc = 0.0;
  if (shaft) {
  vec3 AO = A - o; float tc = dot(AO, d), h2 = max(dot(AO, AO) - tc * tc, 1e-6), h = sqrt(h2);
  float a0 = atan((tIn - tc) / h), a1 = atan((tEndC - tc) / h);
  int NS = int(vNS + 0.5); float fNS = float(NS);
  float j = ign(gl_FragCoord.xy), cosI = vC.w;
  for (int k = 0; k < 16; k++) {
    if (k >= NS) break;
    float fa = mix(a0, a1, float(k) / fNS), fb = mix(a0, a1, float(k + 1) / fNS);
    float w = (fb - fa) / h;
    float tm = tc + h * tan(mix(fa, fb, 0.25 + 0.5 * j));
    vec3 p = o + d * tm, q = p - A; float r = length(q); vec3 lq = q / max(r, 1e-4);
    float cth = dot(lq, D);
    float prof = smoothstep(cosO, cosI, cth) * step(vE.z, dot(q, D));     // (nothing between the apex and the lens)
    if (prof <= 0.0) continue;
    prof *= spotGobo(lq, D, cosO, vE.x < 16.0 ? vE.x : mod(vE.x, 16.0), vE.y);
    if (vE.x >= 16.0) prof *= clipK(p);
    if (uNear > 0.0) prof *= smoothstep(0.3 * uNear, uNear, tm);
    acc += w * prof * hgPhase(dot(lq, -d), uHaze.y) * hazeAt(p);
  }
  if (vH.x > 0.0) acc *= vH.z;
  }
  // the halo: a gaussian tube about the axis (half-width sig = h tan(haloAngle) at h from the apex) holding vH.x of the
  // shaft's light across its section (the shaft's ~ pi tan^2(O) / 2 at any h), scattered evenly (multiply scattered);
  // its integral along the view ray taken at the axis's nearest point, with erf for the stretch the scene leaves visible
  float hacc = 0.0;
  if (vH.x > 0.0 && tEnd > t0 + 1e-4) {
    float b = dot(d, D), s2 = max(1.0 - b * b, 1e-4), sn = max(sqrt(s2), 0.25);   // (down the beam: as if at 14 deg)
    vec3 w0 = o - A; float e = dot(D, w0), dw = dot(d, w0);
    float hA = clamp((e - b * dw) / s2, max(vE.z, 0.05), L);
    vec3 Pa = A + D * hA; float tp = dot(Pa - o, d); vec3 pr = o + d * tp - Pa;
    float sig = max(hA * vH.y, 0.01), c2 = cosO * cosO;
    // (the screen cap: a beam's glow keeps its peak but no more than uHalo.y of the eye's distance in half-width; a glow
    // with no core is a volume of lit haze, not a beam's, and keeps its size)
    float sgc = uHalo.y > 0.0 && vH.z > 0.0 ? clamp(max(tp, 0.1) * uHalo.y, 0.01, sig) : sig;
    float seg = 0.5 * (erfA((tEnd - tp) * sn / sgc) - erfA((t0 - tp) * sn / sgc));
    hacc = vH.x * 0.886 * (1.0 - c2) / c2 * exp(-dot(pr, pr) / (sgc * sgc)) * max(seg, 0.0) * (sgc / sig) / (sig * sn) * 0.0796
      * hazeAt(o + d * clamp(tp, t0, tEnd)) * (uNear > 0.0 ? smoothstep(0.3 * uNear, uNear, clamp(tp, t0, tEnd)) : 1.0)
      * (landed ? 1.0 : smoothstep(L, L - 0.33 * (L - vE.z), hA)) * (vE.x >= 16.0 ? clipK(o + d * clamp(tp, t0, tEnd)) : 1.0);
  }
  vec3 col = vC.rgb * 100.0 * acc * vE.w * uGain;
  if (hacc > 0.0) {
    vec3 ch = vC.rgb; float mx = max(ch.r, max(ch.g, ch.b));
    if (uHalo.x > 0.0) ch *= pow(ch / max(mx, 1e-6), vec3(uHalo.x));
    col += ch * 100.0 * hacc * vE.w * uGain;
  }
  gl_FragColor = vec4(col, 0.0);
}`;

const LASER_VERT = /* glsl */`
attribute vec4 iP0; attribute vec4 iP1; attribute vec4 iCol;
uniform vec2 uResolution;
varying float vAcross; varying vec3 vW; flat varying vec4 vCol; flat varying vec2 vWid; varying float vPx;
void main() {
  vec4 c0 = projectionMatrix * viewMatrix * vec4(iP0.xyz, 1.0), c1 = projectionMatrix * viewMatrix * vec4(iP1.xyz, 1.0);
  vec3 w0 = iP0.xyz, w1 = iP1.xyz;
  // clip the segment to the near side (w > a few mm) so a beam passing the camera still draws
  float eps = 0.02;
  if (c0.w < eps && c1.w < eps) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  if (c0.w < eps) { float k = (eps - c0.w) / (c1.w - c0.w); c0 = mix(c0, c1, k); w0 = mix(w0, w1, k); }
  if (c1.w < eps) { float k = (eps - c1.w) / (c0.w - c1.w); c1 = mix(c1, c0, k); w1 = mix(w1, w0, k); }
  vec2 s0 = c0.xy / c0.w * uResolution * 0.5, s1 = c1.xy / c1.w * uResolution * 0.5;
  vec2 dir = s1 - s0; float len = length(dir); dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float reach = iP1.w * 1.6 + 1.0;         // the glow's reach, in pixels
  vec4 c = mix(c0, c1, position.x);
  c.xy += nrm * position.y * reach / (uResolution * 0.5) * c.w;
  gl_Position = c;
  vAcross = position.y * reach; vW = mix(w0, w1, position.x); vCol = iCol; vWid = vec2(iP0.w, iP1.w);
  vPx = len;
}`;

const LASER_FRAG = /* glsl */`
uniform float uGain;
varying float vAcross; varying vec3 vW; flat varying vec4 vCol; flat varying vec2 vWid; varying float vPx;
void main() {
  float x = abs(vAcross);
  // a core near white and a coloured glow, both as bright as the haze the beam crosses here (none: a faint line)
  float core = exp(-pow(x / max(vWid.x, 0.5), 2.0)), glow = exp(-pow(x / max(vWid.y, 1.0), 2.0));
  float hz = mix(1.0, hazeAt(vW) / max(uHaze.x, 1e-5), vCol.w);
  vec3 c = vCol.rgb;
  vec3 col = (c * glow * 0.35 + mix(c, vec3(max(c.r, max(c.g, c.b))), 0.55) * core) * hz * uGain;
  gl_FragColor = vec4(col, 0.0);
}`;
