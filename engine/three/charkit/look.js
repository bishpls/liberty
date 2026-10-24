// engine/three/charkit/look.js: charkit's anime look in three.js WebGPU (TSL node materials), read from our own export
// (charkit/gltf.py: glTF 2.0 / VRM 1.0 with the CHARKIT_look extension). Plain script: defines the global CK.
// Needs engine/vendor/three-vrm.js (window.THREE) and, for motion, engine/three/vrm.js (V3).
//
//   const ctx = await V3.renderer({ w, h, backend: 'webgpu' })
//   const ck = await CK.load(ctx, url)          // the VRM (three-vrm: humanoid, expressions, lookAt) with our materials,
//                                               // outline hulls, feature layers and skin holdouts built from the extension
//   scene.add(ck.scene); ck.buildPose()         // the build's A-pose (ck.restPose(): the file's T-pose rest)
//   ck.keys({ eye_blink: 1 }); ck.expressions({ happy: 1 }); ck.update()   // shape keys / VRM expressions, head light
//   const P = CK.pipeline(ctx, { ss: 2 })       // main pass, eyes and brows through the fringe, composite (and bloom)
//   P.render(scene, camera, ck, [x, y, w, h])   // into that canvas region (y from the top)
//
// The look (charkit/shade.py, faceshade.py, hair.py; every number comes from the file):
//   toon3   three tones on half-lambert h = 0.5 + 0.5 N.L against CK.U.light (world), linear steps of +-softness at the
//           two thresholds (Blender's colour ramps), a lit-side rim from Blender's Layer Weight 'Facing' (1 - |N.V|^e),
//           screen-blended; an optional texture multiplied over the result (garments)
//   face    toon3 blended (by _FACE_MASK) with the SDF face: t = atan2(|l.x|, l.z) / pi of the head-space light, the
//           threshold map sampled in the 'face' UV (mirrored for light from her right), a +-softness step, the fringe's
//           shadow, the blush (multiply by its alpha); two tones (lit, shade); the drawn jaw line (ink, off the neck by
//           _INK_W) over the result
//   cast    a toon3's or face's `cast` (charkit.faceshade.cast_maps): the head's and hair's shadows baked per vertex for
//           k light azimuths (_CK_CAST0..3), read at the head-space light's azimuth; the toon's h held at or under
//           `half` in them, the face's SDF shadow their maximum
//   hair    toon3 plus (analytic hair, 'lock' UV) the angel ring (a band at an elevation above the hair centre, on each
//           lock's middle, facing the camera, on the lit side), the root-to-tip gradient and drawn strand lines
//   streaks toon3's `highlight` (the cut hair, charkit.shade.hair_toon): short streaks down the hair about an elevation
//           above the head centre, one per kept column of azimuth (integer hashes of its index keep it and shift it:
//           Jenkins' lookup3 on the index's float bits, Blender's White Noise, in u32: the same bits as EEVEE on every
//           GPU and as charkit.render's toon.wgsl), lit, facing
//   light   the root's light.direction (world), or with light.mode 'camera' a key [deg left of the camera, deg up] that
//           turns with the camera (ck.update(dt, camera)), as charkit.shade.set_view lights the boards
//   lines   the root's lines.mode 'screen': every outline frac x the picture's height at the posed head's distance
//           (ck.headAnchor; times its region's factor), as charkit.shade.set_view widens them per view; else each mesh's
//           build width
//   plate   the eye textures (cubic B-spline filtering and CLIP, like Blender's image nodes); flat: one colour
//   outline an inverted hull per outlined mesh: back faces pushed out along _HULL_NORMAL (or NORMAL) by width x
//           _OUTLINE_WIDTH from Blender's surface. POSITION is that surface at the build width, moved inward by
//           inward(width) = width, or for a thin shell min(width, the outline's maxInward) (charkit.shade.line_inward,
//           Michael's call I); per view the surface moves by inward(build) - inward(view) and the hull sits the rest of
//           the view's width, width - inward(width), outside the original surface
//   through features (eyes, lashes, brows) rendered again with the skin as a depth-only holdout and everything else hidden,
//           laid over the frame at 0.55 x their alpha in sRGB, as charkit.qa.features_through does
// Debug views (CK.U.debug): see CK.DEBUG.

(() => {
  const T = window.THREE, S = T.TSL;
  const LOOK_SRC = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';   // (looklib.wgsl beside it)
  const EXT = 'CHARKIT_look';
  const EXT_OLD = 'OPENADS_charkit_look';   // its name in exports written before 2026-10-06: renamed on load
  const CK = {};
  CK.EXT = EXT;
  CK.DEBUG = ['look', 'normals', 'n.l', 'sdf', 'uv0', 'uv1', 'weights', 'face mask', 'outline width', 'albedo', 'rim', 'depth',
    // (projects/charstudio's: a per-vertex value the page writes (CK.load's `studio` option: _ck_dbg, x the value mapped
    // by CK.U.heatRange, y a flag: 1 folded, 2 collapsed, 3 not measured), head D's shading data (_CK_SHADE's channels) and the
    // outline's hull direction)
    'heat', 'shade x', 'shade y', 'shade z', 'shade w', 'hull normal', 'self-shadow', 'inside', 'ids'];
  // (debug view 20, 'ids': each pixel its material's id, as exact bytes (CK.idColor: the output's sRGB encoding undone,
  // so the picture's bytes are the table's), the outline hulls one id; ck.idTable maps id -> {name, rgb}. A reader
  // attributes pixels by source (the mouth's inside, the eyes, a garment's inside pixels) instead of guessing by colour;
  // a pixel the supersampling blended across an edge matches no entry. The probe board: &ids=1)
  CK.DEBUG_IDS = 20;
  CK.IDS = CK.IDS || new Map();                             // name -> id, the page's (shared materials keep theirs)
  CK.idOf = name => { if (!CK.IDS.has(name)) CK.IDS.set(name, CK.IDS.size + 1); return CK.IDS.get(name); };
  CK.idRGB = id => {                                        // (a hue per id by the golden angle, three value bands:
    const h = (id * 0.6180339887) % 1, v = [0.95, 0.72, 0.5][Math.floor(id / 7) % 3], sat = 0.75;   //  bytes, unique)
    const k = n => (n + h * 6) % 6, f = n => v - v * sat * Math.max(0, Math.min(k(n), 4 - k(n), 1));
    return [f(5), f(3), f(1)].map(x => Math.round(x * 255));
  };
  const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  CK.idColor = id => { const [r, g, b] = CK.idRGB(id); return S.vec3(srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)); };
  CK.LAYER = { main: 0, feature: 1, holdout: 2, shadow: 3, shadowThin: 4 };

  // ------------------------------------------------------------------------------------------------ shared uniforms
  const U = CK.U = {
    light: S.uniform(new T.Vector3(-0.45, 0.70, 0.55).normalize()),   // toward the key light, world (glTF frame)
    headLight: S.uniform(new T.Vector3(-0.45, 0.70, 0.55).normalize()),// the same in the head bone's rest frame
    debug: S.uniform(0),
    bone: S.uniform(0),                                               // joint index for the weights view
    ortho: S.uniform(0),
    camBack: S.uniform(new T.Vector3(0, 0, 1)),                        // toward the camera (orthographic)
    outline: S.uniform(1),                                            // outline width scale (0 hides them)
    lineScreen: S.uniform(0),                                         // screen lines: frac x the visible height (m), 0 off
    headVisH: S.uniform(1),                                           // the visible height (m) at the posed head's distance (line sets)
    lineSS: S.uniform(1),                                             // the main pass's supersampling (CK.pipeline): the line sets' floor in output px
    rim: S.uniform(1), sdf: S.uniform(1), ring: S.uniform(1), cast: S.uniform(1), fringe: S.uniform(1),   // system toggles (1 on)
    time: S.uniform(0),
    heatRange: S.uniform(new T.Vector2(0, 0.25)),                     // the 'heat' view's value at blue and at red
    faceLight: S.uniform(new T.Vector3(0, 0, 1)),                     // head D's face key (root face_light), world
    shadowVP: S.uniform(new T.Matrix4()),                             // the self-shadow map's view-projection (P.render)
    shadowOn: S.uniform(0),                                           // 1 while this render has a self-shadow map
    headFwd: S.uniform(new T.Vector3(0, 0, 1)), headUp: S.uniform(new T.Vector3(0, 1, 0)),   // the head's axes, world
    headCentre: S.uniform(new T.Vector3(0, 1.4, 0)), headL: S.uniform(0.25),            // the posed head centre, its L
    faceLightOn: S.uniform(0),
    pxPerM: S.uniform(0),                                             // picture px per m at clip w 1 (the strands' band limit)
  };

  // ------------------------------------------------------------------------------------------------ small TSL helpers
  const v3 = c => S.vec3(c[0], c[1], c[2]);
  const sat = x => S.clamp(x, 0.0, 1.0);
  const mapRange = (x, a, b, c = 0, d = 1) => S.mix(S.float(c), S.float(d), sat(S.float(x).sub(a).div(b - a)));
  const screen = (a, b, f) => S.vec3(1.0).sub(S.vec3(1.0).sub(f).add(f.mul(S.vec3(1.0).sub(b))).mul(S.vec3(1.0).sub(a)));
  const inside01 = uv => S.step(0.0, uv.x).mul(S.step(uv.x, 1.0)).mul(S.step(0.0, uv.y)).mul(S.step(uv.y, 1.0));
  // (no select()/If for choices: TSL emits them as if/else, and a node shared with the other branch is then declared
  // inside the first branch that builds it, so the other path reads an unset variable. Choices are arithmetic masks.)
  const is = (u, i) => S.float(1.0).sub(S.min(S.abs(u.sub(i)), 1.0));        // 1 where the (integer) uniform u == i

  // cubic B-spline filtering from four bilinear taps (GPU Gems 2, ch. 20), as Blender's 'Cubic' image interpolation
  const bicubic = (tex, uv, size) => {
    const st = uv.mul(size).sub(0.5), i = S.floor(st), f = st.sub(i);
    const f2 = f.mul(f), f3 = f2.mul(f);
    const w0 = S.vec2(1.0).sub(f).pow(3.0).div(6.0);
    const w1 = f3.mul(3.0).sub(f2.mul(6.0)).add(4.0).div(6.0);
    const w2 = f3.mul(-3.0).add(f2.mul(3.0)).add(f.mul(3.0)).add(1.0).div(6.0);
    const w3 = f3.div(6.0);
    const g0 = w0.add(w1), g1 = w2.add(w3);
    const h0 = i.sub(0.5).add(w1.div(g0)).div(size);      // (i - 1 + w1/g0 + 0.5) / size
    const h1 = i.add(1.5).add(w3.div(g1)).div(size);      // (i + 1 + w3/g1 + 0.5) / size
    const t = (x, y) => S.texture(tex, S.vec2(x, y));
    return t(h0.x, h0.y).mul(g0.x.mul(g0.y)).add(t(h1.x, h0.y).mul(g1.x.mul(g0.y)))
      .add(t(h0.x, h1.y).mul(g0.x.mul(g1.y))).add(t(h1.x, h1.y).mul(g1.x.mul(g1.y)));
  };
  const sample = (tex, info, uvNode, cubic) => {
    const size = S.vec2(tex.image.width, tex.image.height);
    let c = cubic ? bicubic(tex, uvNode, size) : S.texture(tex, uvNode);
    if (info && info.wrap === 'clip') c = c.mul(inside01(uvNode));
    return c;
  };
  const uvOf = info => S.uv((info && info.texCoord) || 0);

  // the shading normal, facing the viewer (Blender's Geometry Normal on a two-sided material), in world and view space
  // (world space only: in r186 a material that reads normalView as well as normalWorld gets a zero normalWorld)
  let LIVE_N = null;                                         // (a live mesh's normals while its material builds: CK.live)
  const nWorld = () => (LIVE_N ? LIVE_N() : S.normalWorld.normalize());
  const viewDir = () => S.mix(S.cameraPosition.sub(S.positionWorld).normalize(), U.camBack, U.ortho);
  // Blender's Layer Weight 'Facing' output: 1 - |N.V|^e, e = 2 blend (blend < 0.5) or 0.5 / (1 - blend)
  const facing = blend => {
    const e = blend === 0.5 ? 1.0 : blend < 0.5 ? 2 * blend : 0.5 / (1 - Math.min(blend, 0.99999));
    return S.float(1.0).sub(S.abs(S.dot(nWorld(), viewDir())).pow(e));
  };

  // ------------------------------------------------------------------------------------------------ materials
  // charkit.faceshade.cast_maps / cast_nodes: the head's and hair's shadows baked per vertex for k light azimuths
  // (4 vec4 attributes), read at the head-space light's azimuth (atan2(x, z) in glTF: 0 in front, + to her left),
  // interpolated between the two baked azimuths either side and cut at `at` +- `width` by a smoothstep
  // the self-shadow (CK.pipeline's shadow pass, ck.selfShadow): the head's and hair's depth from the key light, read per
  // pixel: 0 lit .. 1 in their shadow, a 3 x 3 texel PCF with bilinear weights (16 taps: the contour runs between texels,
  // not along them) then cut at half (a toon edge). Replaces the per-vertex bake on the neck: the bake's edge follows its
  // vertices and its rest pose (2026-10-16)
  CK.SHADOW_N = 2048;
  CK.shadowDepth = new T.DepthTexture(CK.SHADOW_N, CK.SHADOW_N);
  CK.shadowDepth.type = T.FloatType;
  // (a second map holds the hair alone: the face's receivers read it, so the head's own geometry never shadows the face
  // (a frown's or an open jaw's folds would: 2026-10-17, ws-body's patch beside the chin); the face's shading is its SDF)
  CK.shadowDepthHair = new T.DepthTexture(CK.SHADOW_N, CK.SHADOW_N);
  CK.shadowDepthHair.type = T.FloatType;
  // (the sampling from the look's shared WGSL, looklib.wgsl's ck_shadow_at / _texel / _cut, which charkit.render's
  // toon.wgsl reads too (the QA's drawing, 2026-10-20: one source; the depth fetch each renderer's own); the TSL below
  // where the library didn't load, or ?sharedshadow=0)
  let shadowFn = null;
  // (one include node for the library: three dedupes a wgslFn's includes by node, so two functions from it in one
  // shader (the hair's strands and its self-shadow) must share it, or the library is pasted twice and fails to compile)
  let libCode = null;
  const lookLib = () => (libCode = libCode || S.code(CK.LOOKLIB));
  CK.SHARED_SHADOW = !(typeof location !== 'undefined' && /[?&]sharedshadow=0(&|$)/.test(location.search));
  function selfShadowNode(depth = CK.shadowDepth) {
    // (the receiver pushed 1.5 mm out along its normal, and the map holds the occluders' back faces: no acne where a
    // surface both casts and receives, as the jaw's underside does)
    const lp = U.shadowVP.mul(S.vec4(S.positionWorld.add(nWorld().mul(0.0015)), 1.0)), p = lp.xyz.div(lp.w);
    if (CK.LOOKLIB && CK.SHARED_SHADOW) {
      if (!shadowFn) shadowFn = S.wgslFn(`fn ck_shadow(t: texture_depth_2d, lp: vec4<f32>) -> f32 {
        let a = ck_shadow_at(lp, ${CK.SHADOW_N}.0);
        var d: array<f32, 16>;
        for (var j = 0; j < 4; j++) {
          for (var i = 0; i < 4; i++) { d[j * 4 + i] = textureLoad(t, ck_shadow_texel(a, i, j, ${CK.SHADOW_N}.0), 0); }
        }
        return ck_shadow_cut(a, d, 0.0008);
      }`, [lookLib()]);
      return shadowFn({ t: S.texture(depth), lp }).mul(U.shadowOn);
    }
    const uv = S.vec2(p.x.mul(0.5).add(0.5), p.y.mul(-0.5).add(0.5));
    const N = CK.SHADOW_N, tx = 1 / N, bias = S.float(0.0008);    // (depth units of the map's 8 head-L range: about 1.6 mm)
    const f = uv.mul(N).sub(0.5), i0 = S.floor(f), fr = f.sub(i0);
    const wx = [S.float(1.0).sub(fr.x), S.float(1.0), S.float(1.0), fr.x], wy = [S.float(1.0).sub(fr.y), S.float(1.0), S.float(1.0), fr.y];
    let lit = S.float(0);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const c = i0.add(S.vec2(i - 1 + 0.5, j - 1 + 0.5)).mul(tx);  // (texel centres)
      lit = lit.add(S.step(p.z.sub(bias), S.texture(depth, c).x).mul(wx[i]).mul(wy[j]));
    }
    const inside = S.step(0.0, uv.x).mul(S.step(uv.x, 1.0)).mul(S.step(0.0, uv.y)).mul(S.step(uv.y, 1.0)).mul(S.step(p.z, 1.0));
    const t = sat(S.float(1.0).sub(lit.div(9)).sub(0.25).div(0.5));
    return t.mul(t).mul(S.float(3.0).sub(t.mul(2.0))).mul(inside).mul(U.shadowOn);
  }

  function castNodes(C) {
    const k = C.k, step = 2 * Math.PI / k;
    const phi = S.atan(U.headLight.x, U.headLight.z);
    const a = C.attributes.map(n => S.attribute(n.toLowerCase(), 'vec4'));
    let acc = S.float(0);
    for (let i = 0; i < k; i++) {
      const d = S.mod(phi.sub(i * step).add(Math.PI), 2 * Math.PI).sub(Math.PI);   // wrapped to [-pi, pi)
      const w = S.max(S.float(1.0).sub(S.abs(d).div(step)), 0.0);
      acc = acc.add(w.mul(a[i >> 2]['xyzw'[i & 3]]));
    }
    const t = sat(acc.sub(C.at - C.width).div(2 * C.width));
    return t.mul(t).mul(S.float(3.0).sub(t.mul(2.0))).mul(U.cast);
  }

  // head D's shading data (charkit.headd.shading; charkit.render's toon.wgsl F_SHADE: shade_of, key_light, lit_value):
  // the _CK_SHADE stream (x the propensity's offset on the half-lambert, y the face light's weight, z the hull's move away
  // from the camera, w the SDF's offset) and body D's small forms (the material's `shadow` texture: its propensity t at
  // uv0 within its tile, a further (2 t - 1) x textureSpan on x) -> a vec4 node, or null for a material without them
  function shadeNodes(L, attrs, tex) {
    const shd = L.shadow || {}, info = shd.texture, T0 = info && tex && tex[info.index];
    if (!(attrs && attrs.shade) && !T0) return null;
    let sh = attrs && attrs.shade ? S.attribute('_ck_shade', 'vec4') : S.vec4(0.0);
    if (T0) {
      const uv = uvOf(info), raw = sample(T0, info, uv, info.filter === 'cubic');
      const t = info.encoding === 'rg16' ? raw.x.mul(65280 / 65535).add(raw.y.mul(255 / 65535)) : raw.x;
      const tile = info.tile || [0, 1];
      const inside = S.step(tile[0], uv.x).mul(S.float(1.0).sub(S.step(tile[1], uv.x))).mul(S.step(0.0, uv.y)).mul(S.step(uv.y, 1.0));
      sh = S.vec4(sh.x.add(t.mul(2.0).sub(1.0).mul(shd.textureSpan ?? 1.0).mul(inside)), sh.y, sh.z, sh.w);
    }
    return sh;
  }
  // the key a vertex shades by: the scene's, or blended toward the face's clamped key by the stream's y (root face_light)
  const keyLight = sh => (CK.LOOKLIB && CK.SHARED_TOON)                 // (looklib's ck_key: one source with toon.wgsl)
    ? toonFn('key', `fn ck_key_(light: vec3<f32>, face_light: vec3<f32>, w: f32) -> vec3<f32> {
      return ck_key(light, face_light, w); }`)({ light: U.light, face_light: U.faceLight, w: sat(sh.y).mul(U.faceLightOn) })
    : S.normalize(S.mix(U.light, U.faceLight, sat(sh.y).mul(U.faceLightOn)));

  // the toon core from the look's shared WGSL (looklib.wgsl's ck_toon_h / _steps / _base, ck_rim_f, ck_screen: the
  // functions charkit.render's toon.wgsl draws with, 2026-10-20: one source); the TSL below where the library didn't
  // load, or ?sharedtoon=0
  CK.SHARED_TOON = !(typeof location !== 'undefined' && /[?&]sharedtoon=0(&|$)/.test(location.search));
  const toonFns = {};
  const toonFn = (name, sig) => (toonFns[name] = toonFns[name] || S.wgslFn(sig, [lookLib()]));
  const ckToonH = a => toonFn('h', `fn ck_toon_h_(nk: f32, offset: f32, cs: f32, half: f32) -> f32 {
    return ck_toon_h(nk, offset, cs, half); }`)(a);
  const ckToonSteps = a => toonFn('steps', `fn ck_toon_steps_(h_lit: f32, h: f32, tone: vec3<f32>) -> vec2<f32> {
    return ck_toon_steps(h_lit, h, tone); }`)(a);
  const ckToonBase = a => toonFn('base', `fn ck_toon_base_(deep: vec3<f32>, shade: vec3<f32>, lit: vec3<f32>, st: vec2<f32>) -> vec3<f32> {
    return ck_toon_base(deep, shade, lit, st); }`)(a);
  const ckRimF = a => toonFn('rim', `fn ck_rim_f_(n: vec3<f32>, vd: vec3<f32>, rim: vec4<f32>, s_lit: f32) -> f32 {
    return ck_rim_f(n, vd, rim, s_lit); }`)(a);
  const ckScreen = a => toonFn('screen', `fn ck_screen_(base: vec3<f32>, color: vec3<f32>, f: f32) -> vec3<f32> {
    return ck_screen(base, color, f); }`)(a);
  const facingExp = blend => blend === 0.5 ? 1.0 : blend < 0.5 ? 2 * blend : 0.5 / (1 - Math.min(blend, 0.99999));
  function toon3Nodes(L, attrs, tex, CU = null) {
    const shd = shadeNodes(L, attrs, tex);
    const key = shd ? keyLight(shd) : U.light;
    let h = S.dot(nWorld(), key).mul(0.5).add(0.5);
    let cast = L.cast && attrs && attrs.cast ? castNodes(L.cast) : null;
    if (cast) {
      // the self-shadow where it's on: off the face, and on the face mask below the mouth wherever its surface turns down
      // or aside in the head's frame (the jaw's underside, behind the jaw); the face above keeps the bake (the hair's
      // shadow on the cheeks, drawn from a lower light: faceshade.cast_maps)
      const n = nWorld();
      const g = CU ? CU.gate : S.vec2(-0.12, -0.26);              // (head L under the eye line: CK.headGate)
      const below = S.smoothstep(g.x, g.y, S.positionWorld.sub(U.headCentre).dot(U.headUp).div(U.headL));
      const down = S.smoothstep(-0.05, -0.35, n.dot(U.headUp));
      const turned = S.max(down, S.float(1.0).sub(S.smoothstep(0.15, 0.45, n.dot(U.headFwd)))).mul(below);
      const fm = attrs.faceMask ? S.attribute('_face_mask', 'float') : null;
      const off = fm ? S.float(1.0).sub(fm.mul(S.float(1.0).sub(turned))) : S.float(1.0);
      // (the face proper, its mask at 1 and turned to the front, takes the hair's shadow alone: a morphed face's own folds
      // (a frown's, an open jaw's) must not shadow it; measured, the map does follow the morphs (a jaw drop changes
      // 120,917 texels). Where the mask fades (under and behind the jaw: head D's underside reads 0.66) or the surface
      // turns down or away (the jaw's underside) the head's shadow too; off the face, both)
      const hairOnly = fm ? S.smoothstep(0.85, 0.98, fm).mul(S.smoothstep(0.2, 0.45, n.dot(U.headFwd))) : null;
      const rt = fm ? S.smoothstep(0.35, 0.65, S.mix(selfShadowNode(), selfShadowNode(CK.shadowDepthHair), hairOnly)) : selfShadowNode();   // (re-cut: a toon edge)
      cast = S.mix(cast, rt, off.mul(U.shadowOn));
    }
    let sLit, sDeep, base, col, rimF = S.float(0);
    if (CK.LOOKLIB && CK.SHARED_TOON) {
      // (the lit step reads the half-lambert with the propensity's offset; the deep step the half-lambert alone; each
      // held under the cast's half in its shadow)
      const nk = S.dot(nWorld(), key), cs = cast || S.float(0.0), half = S.float(L.cast ? L.cast.half : 1.0);
      h = ckToonH({ nk, offset: S.float(0.0), cs, half });
      const hl = shd ? ckToonH({ nk, offset: shd.x, cs, half }) : h;
      const st = ckToonSteps({ h_lit: hl, h, tone: S.vec3(L.threshold, L.deepThreshold, L.softness) });
      sLit = st.x; sDeep = st.y;
      base = ckToonBase({ deep: v3(L.deep), shade: v3(L.shade), lit: v3(L.lit), st });
      col = base;
      if (L.rim && L.rim.amount > 0) {
        rimF = ckRimF({ n: nWorld(), vd: viewDir(), rim: S.vec4(facingExp(L.rim.facing), L.rim.range[0], L.rim.range[1],
          U.rim.mul(L.rim.amount)), s_lit: sLit });
        col = ckScreen({ base, color: v3(L.rim.color), f: rimF });
      }
    } else {
      if (cast) h = h.sub(S.max(h.sub(L.cast.half), 0.0).mul(cast));   // held under the lit step in the shadow
      // (the lit step reads the half-lambert with the propensity's offset; the deep step the half-lambert alone)
      let hl = h;
      if (shd) { hl = S.dot(nWorld(), key).mul(0.5).add(0.5).add(shd.x); if (cast) hl = hl.sub(S.max(hl.sub(L.cast.half), 0.0).mul(cast)); }
      const s = L.softness;
      sLit = sat(hl.sub(L.threshold - s).div(2 * s));
      sDeep = sat(h.sub(L.deepThreshold - s).div(2 * s));
      base = S.mix(S.mix(v3(L.deep), v3(L.shade), sDeep), v3(L.lit), sLit);
      col = base;
      if (L.rim && L.rim.amount > 0) {
        rimF = mapRange(facing(L.rim.facing), L.rim.range[0], L.rim.range[1]).mul(L.rim.amount).mul(sLit).mul(U.rim);
        col = screen(base, v3(L.rim.color), rimF);
      }
    }
    if (L.highlight && L.highlight.kind === 'streaks') col = streakNodes(L.highlight, col, sLit);
    if (L.highlight && L.highlight.kind === 'strands') {
      const f = strandNodes(L.highlight, attrs);
      if (f) {                                               // (toon.wgsl's toon3: each layer mixed in by its amount)
        const g = f.mul(sLit), Hl = L.highlight;
        col = S.mix(col, v3(Hl.sheen.color), sat(g.x.mul(Hl.sheen.amount)));
        col = S.mix(col, v3(Hl.glint.color), sat(g.y.mul(Hl.glint.amount)));
      }
    }
    return { h, sLit, sDeep, col, rimF, cast, shd };
  }

  // the groomed hair's strand highlight (the export's highlight kind 'strands'; charkit.shade.STRANDS) through the look's
  // shared WGSL: engine/three/charkit/looklib.wgsl's strands_core, the function toon.wgsl draws with (CK.LOOKLIB, fetched
  // by CK.load), called through TSL's wgslFn with the material's parameters packed as charkit.render.gpu.material_uniform
  // packs toon.wgsl's st_* words -> (sheen, glint) factors before the lit step; null without the library or the streams
  let strandsFn = null;
  const strandWords = (Hl, curv, env) => {
    const rad = Math.PI / 180, L2 = k => Hl[k];
    const P = {}, strips = k => (L2(k).mode || 'kk') === 'strips';
    for (const k of ['sheen', 'glint']) {
      const Ly = L2(k);
      P[k] = strips(k) ? [Ly.length / 2000, Ly.shift || 0, (Ly.jitter || 0) / 1000, Ly.across]
        : [Math.sin((Ly.width || 0) * rad), Ly.shift || 0, Ly.jitter || 0, Ly.across];
      P[k + '_b'] = [Math.sin(Math.min(Ly.cap ?? 90, 90) * rad), Ly.keep ?? 1, Ly.variation || 0, strips(k) ? 1 : 0];
    }
    const fe = b => b === 0.5 ? 1.0 : b < 0.5 ? 2 * b : 0.5 / (1 - Math.min(b, 0.99999));     // (charkit.render.gpu._facing_exp)
    P.misc = [Hl.along, Hl.blocky ?? 1, Hl.ao ?? 1, fe(Hl.facingBlend ?? 0.5)];
    P.gate = [...(Hl.sv || [0, 1]), ...(Hl.facing || [0.55, 0.25])];
    P.taper = [Hl.sheen.taper || 0, Hl.glint.taper || 0, Math.sin((Hl.sheen.straight || 0) * rad), Math.sin((Hl.glint.straight || 0) * rad)];
    const envl = ['sheen', 'glint'].map(k => (curv && env) ? +(Hl[k].envelope ?? Hl.envelope ?? 0) : 0);
    P.aa = [+(Hl.aa || 0), 0, +(Hl.sheen.straight_fade || 0), +(Hl.glint.straight_fade || 0)];
    P.mean = [+(Hl.sheen.aa_mean ?? 1), +(Hl.glint.aa_mean ?? 1), ...envl];
    P.flags = [curv ? 1 : 0, Math.max(...envl) > 0 ? 1 : 0, 0, 0];
    return P;
  };
  CK.strandWords = strandWords;                              // (for checks against charkit.render.gpu)
  function strandNodes(Hl, attrs) {
    if (!CK.LOOKLIB || !attrs || !attrs.tangent || !attrs.strand) return null;
    if (!strandsFn) strandsFn = S.wgslFn(`fn ck_strands(n: vec3<f32>, vd: vec3<f32>, light: vec3<f32>, mpp: f32, tan: vec4<f32>,
        st: vec4<f32>, cv: vec4<f32>, env: vec2<f32>, sheen: vec4<f32>, glint: vec4<f32>, misc: vec4<f32>, gate: vec4<f32>,
        sheen_b: vec4<f32>, glint_b: vec4<f32>, taper: vec4<f32>, aa: vec4<f32>, mean: vec4<f32>, flags: vec4<f32>) -> vec2<f32> {
      var S: StrandU;
      S.sheen = sheen; S.glint = glint; S.misc = misc; S.gate = gate; S.sheen_b = sheen_b; S.glint_b = glint_b;
      S.taper = taper; S.aa = aa; S.mean = mean; S.flags = flags;
      return strands_core(S, n, vd, light, mpp, tan, st, cv, env);
    }`, [lookLib()]);
    const P = strandWords(Hl, attrs.curv, attrs.env), c4 = a => S.vec4(...a);
    const cv0 = attrs.curv ? S.attribute('_ck_curv', 'vec4') : S.vec4(0.0);
    const cv = S.select(S.frontFacing, cv0, S.vec4(cv0.x.negate(), cv0.y.negate(), cv0.z, cv0.w));   // (as n faces)
    const clip = S.cameraProjectionMatrix.mul(S.cameraViewMatrix).mul(S.vec4(S.positionWorld, 1.0));
    const mpp = S.select(U.pxPerM.greaterThan(0.0), clip.w.div(U.pxPerM.max(1e-9)), S.float(0.0));
    return strandsFn({ n: nWorld(), vd: viewDir(), light: U.light, mpp, tan: S.attribute('tangent', 'vec4'),
      st: S.attribute('_ck_strand', 'vec4'), cv, env: attrs.env ? S.attribute('_ck_env', 'vec2') : S.vec2(0.0),
      sheen: c4(P.sheen), glint: c4(P.glint), misc: c4(P.misc), gate: c4(P.gate), sheen_b: c4(P.sheen_b), glint_b: c4(P.glint_b),
      taper: c4(P.taper), aa: c4(P.aa), mean: c4(P.mean), flags: c4(P.flags) });
  }

  // charkit.shade.streak_hash: Bob Jenkins' lookup3 as Blender's White Noise node computes it (EEVEE's
  // gpu_shader_common_hash.glsl), on u32s: hashUint(bits(w)) is the node's Value, hashUint2(bits(w), bits(1.0)) its
  // Color's green; float(h) / 2^32 as Blender converts them
  const rotU = (x, k) => x.shiftLeft(S.uint(k)).bitOr(x.shiftRight(S.uint(32 - k)));
  const lookup3 = S.Fn(([a0, b0, c0]) => {
    const a = S.uint(a0).toVar(), b = S.uint(b0).toVar(), c = S.uint(c0).toVar();
    c.bitXorAssign(b); c.subAssign(rotU(b, 14));
    a.bitXorAssign(c); a.subAssign(rotU(c, 11));
    b.bitXorAssign(a); b.subAssign(rotU(a, 25));
    c.bitXorAssign(b); c.subAssign(rotU(b, 16));
    a.bitXorAssign(c); a.subAssign(rotU(c, 4));
    b.bitXorAssign(a); b.subAssign(rotU(a, 14));
    c.bitXorAssign(b); c.subAssign(rotU(b, 24));
    return c;
  });
  const H1 = 0xdeadbeef + (1 << 2) + 13, H2 = 0xdeadbeef + (2 << 2) + 13;       // lookup3's seeds for 1 and 2 words
  const hashUint = kx => lookup3(S.uint(H1).add(kx), S.uint(H1), S.uint(H1));
  const hashUint2 = (kx, ky) => lookup3(S.uint(H2).add(kx), S.uint(H2).add(ky), S.uint(H2));
  const hashUnit = h => S.float(h).div(4294967296.0);
  CK.hash = { hashUint, hashUint2, hashUnit };

  // charkit.shade.hair_toon's streaks: the hair cut into `count` columns of azimuth round the head centre; an integer
  // hash of each column's index keeps it and shifts its streak's elevation
  function streakNodes(Hl, col, sLit) {
    const rad = Math.PI / 180;
    if (CK.LOOKLIB && CK.SHARED_TOON) {                         // (looklib's ck_streaks: one source with toon.wgsl)
      const f = toonFn('streaks', `fn ck_streaks_(p: vec3<f32>, n: vec3<f32>, vd: vec3<f32>, a: vec4<f32>, e: vec2<f32>,
        f: vec3<f32>) -> f32 { return ck_streaks(p, n, vd, a, e, f); }`)({ p: S.positionGeometry.sub(v3(Hl.centre)),
        n: nWorld(), vd: viewDir(), a: S.vec4(Hl.count, Hl.keep, Hl.length * rad, Hl.duty),
        e: S.vec2((Hl.elevation - Hl.jitter) * rad, 2 * Hl.jitter * rad),
        f: S.vec3(Hl.facing[0], Hl.facing[1], facingExp(Hl.facingBlend)) });
      return S.mix(col, v3(Hl.color), f.mul(sLit).mul(Hl.amount).mul(U.ring));
    }
    const p = S.positionGeometry.sub(v3(Hl.centre));             // glTF: y up, her front +z, her left +x
    const el = S.atan(p.y, S.length(p.xz));
    const az = S.atan(p.x, p.z);                                  // 0 in front, + to her left (Blender's atan2(x, -y))
    const c = az.add(Math.PI).mul(Hl.count / (2 * Math.PI));
    const bits = S.floatBitsToUint(S.floor(c));                  // the column index's float bits (White Noise's W)
    const keep = S.float(1.0).sub(S.step(Hl.keep, hashUnit(hashUint(bits))));          // hash < keep
    const el0 = S.float((Hl.elevation - Hl.jitter) * rad).add(hashUnit(hashUint2(bits, S.uint(0x3f800000))).mul(2 * Hl.jitter * rad));
    const along = S.float(1.0).sub(S.abs(el.sub(el0)).div(Hl.length / 2 * rad));
    const across = S.float(1.0).sub(S.abs(S.fract(c).sub(0.5)).div(Hl.duty / 2));
    const shape = sat(along.mul(3.0)).mul(sat(across.mul(3.0)));   // each clamped first: outside both is not inside
    const face = mapRange(facing(Hl.facingBlend), Hl.facing[0], Hl.facing[1]);
    return S.mix(col, v3(Hl.color), shape.mul(keep).mul(face).mul(sLit).mul(Hl.amount).mul(U.ring));
  }

  // ---------------------------------------------------------------------------------------------- material channels
  // CK.PARAMS (docs/FORMAT.md "CHARKIT_channels"): the material parameters a channel may drive, each with its rest 0
  // (channel values add across a clip's layers, so every parameter is an offset from the build's look):
  //   face   dread (0..1: the upper face's cool gradient, the drawn "aonuke"), flush (0..1: the face reddened),
  //          blush (added to the baked blush's weight)
  //   eyes   gazeH, gazeV (-1..1, + her left / up: the iris, pupil and highlights moved by the block's gaze amounts),
  //          dilation (added to the pupil's rest, 0..1), irisScale (the iris, pupil and highlights scaled by 1 + v:
  //          -0.67 is the shocked eye's), blankEyes (0..1: iris, pupil and highlights faded out), sparkle (the
  //          highlights scaled by 1 + 0.5 v), highlightFollow (the follow toward the camera scaled by 1 + v)
  //   all    every material and its outline, per character: tint (0..1: recoloured toward the tint colour, each
  //          pixel's luminance kept: a pale-blue shock, a stone grey), flat (0..1: filled with the flat colour: a white
  //          hit flash, a black silhouette in the 3D itself), outline (the line width x 1 + v: -1 hides the lines)
  // A file without CHARKIT_channels.material uses these names as its material channels directly.
  CK.PARAMS = {
    face: { dread: 0, flush: 0, blush: 0 },
    eyes: { gazeH: 0, gazeV: 0, dilation: 0, irisScale: 0, blankEyes: 0, sparkle: 0, highlightFollow: 0 },
    all: { tint: 0, flat: 0, outline: 0 },
  };
  // the face states' looks: a linear multiply colour and a ramp [from, to] in head L from root.head.centre's height
  // (weight 0 at from, 1 at to; to < from runs down). A file's CHARKIT_channels.material.<state>.look overrides them
  // (ck.faceLook); these defaults are ws-body's measurements on the trailer (2026-10-16: dread f541/f497, flush f614)
  CK.DREAD = { color: [0.49, 0.52, 0.70], ramp: [-0.15, 0.25] };
  CK.FLUSH = { color: [1.0, 0.70, 0.82], ramp: [-0.06, -0.30] };
  // the 'all' channels' colours (looks as dread's: CHARKIT_channels.material.tint.look.color, flat's; ck.faceLook) and
  // their uniforms, one set per character (a studio's shared materials share one set: CK.sharedCU)
  CK.TINT = { color: [0.62, 0.70, 1.0] };
  CK.FLAT = { color: [1.0, 1.0, 1.0] };
  // the self-shadow's gate on the face (toon3Nodes): from just under the mouth to toward the chin, in head L from the
  // head centre's height; from the file's root.head mouth and chin when it has them (ws-body's builds, 2026-10-16), the
  // span's 0.59 above the mouth to 0.47 below it (Clawd: mouth -0.198, chin -0.330 -> the -0.12 .. -0.26 tuned on him)
  CK.headGate = H => (H && typeof H.mouth === 'number' && typeof H.chin === 'number' && H.mouth > H.chin
    ? [H.mouth + 0.59 * (H.mouth - H.chin), H.mouth - 0.47 * (H.mouth - H.chin)] : [-0.12, -0.26]);
  CK.charUniforms = () => ({ gate: S.uniform(new T.Vector2(-0.12, -0.26)), tint: S.uniform(0), tintColor: S.uniform(new T.Vector3(...CK.TINT.color)),
    flat: S.uniform(0), flatColor: S.uniform(new T.Vector3(...CK.FLAT.color)), outline: S.uniform(0), lines: {} });
  const lum709 = v => v.dot(S.vec3(0.2126, 0.7152, 0.0722));
  const tinted = (c, CU) => {
    if (!CU) return c;
    const t = S.vec3(lum709(c)).mul(CU.tintColor).div(S.max(lum709(CU.tintColor), 1e-3));
    return S.mix(S.mix(c, t, sat(CU.tint)), CU.flatColor, sat(CU.flat));
  };

  function faceNodes(L, tex, toon, attrs = {}) {
    const F = L.face;
    const uv1 = uvOf(F.sdf);
    const lx = U.headLight.x, lz = U.headLight.z, shared = CK.LOOKLIB && CK.SHARED_TOON;
    const tm = shared ? toonFn('face_t', `fn ck_face_t_(lh: vec3<f32>) -> vec2<f32> { return ck_face_t(lh); }`)({ lh: U.headLight }) : null;
    const t = shared ? tm.x : S.atan(S.abs(lx), lz).div(Math.PI);                 // 0 light from the front .. 1 from behind
    const right = shared ? tm.y : S.float(1.0).sub(S.step(0.0, lx));             // light from her right: mirror the map
    const u = S.mix(uv1.x, S.float(1.0).sub(uv1.x), right);
    const suv = S.vec2(u, uv1.y);
    const st = tex[F.sdf.index];
    const raw = F.sdf.filter === 'cubic' ? bicubic(st, suv, S.vec2(st.image.width, st.image.height)) : S.texture(st, suv);
    let sdf = F.sdf.encoding === 'rg16' ? raw.x.mul(65280 / 65535).add(raw.y.mul(255 / 65535)) : raw.x;
    if (toon.shd) sdf = sdf.add(toon.shd.w);                     // (head D's masks on the SDF's threshold)
    let sh;
    if (shared) {                                                 // (looklib's ck_face_sh: one source with toon.wgsl)
      const fr = F.fringe ? mapRange(sample(tex[F.fringe.index], F.fringe, uvOf(F.fringe), F.fringe.filter === 'cubic').x,
        F.fringeRange[0], F.fringeRange[1]).mul(U.fringe) : S.float(0.0);
      sh = toonFn('face_sh', `fn ck_face_sh_(t: f32, sdf: f32, softness: f32, fringe: f32, cs: f32) -> f32 {
        return ck_face_sh(t, sdf, softness, fringe, cs); }`)({ t, sdf, softness: S.float(F.softness), fringe: fr,
        cs: toon.cast || S.float(0.0) }).mul(U.sdf);
    } else {
      const edge = sat(t.sub(sdf).add(F.softness).div(2 * F.softness));
      sh = edge;
      if (F.fringe) {
        const fr = sample(tex[F.fringe.index], F.fringe, uvOf(F.fringe), F.fringe.filter === 'cubic').x;
        sh = S.max(sh, mapRange(fr, F.fringeRange[0], F.fringeRange[1]).mul(U.fringe));
      }
      if (toon.cast) sh = S.max(sh, toon.cast);                   // the baked cast shadows (castNodes)
      sh = sat(sh).mul(U.sdf);
    }
    let col = S.mix(v3(F.lit), v3(F.shade), sh);
    const P = { dread: S.uniform(0), flush: S.uniform(0), blush: S.uniform(0),     // (CK.PARAMS.face, per material)
      dreadColor: S.uniform(new T.Vector3(...CK.DREAD.color)), dreadRamp: S.uniform(new T.Vector2(...CK.DREAD.ramp)),
      flushColor: S.uniform(new T.Vector3(...CK.FLUSH.color)), flushRamp: S.uniform(new T.Vector2(...CK.FLUSH.ramp)) };
    if (F.blush) {
      const b = sample(tex[F.blush.index], F.blush, uvOf(F.blush), F.blush.filter === 'cubic');
      col = S.mix(col, col.mul(b.xyz), sat(b.w.mul(P.blush.add(1.0))));
    }
    const mask = S.attribute('_face_mask', 'float');
    let out = S.mix(toon.col, col, mask);
    // the channels: each state's multiply over its ramp in head-relative height (dread down from the forehead; the
    // flush on the lower face, the jaw's underside and the throat); a smoothstep written out so a ramp may run down
    // (the flush's own region where the file sends one: _FLUSH_W, faceshade's flush_weight over the face, the jaw's
    // underside and the throat's top; else the ramp within the face mask, which stops at the chin)
    const fw = attrs.flushW ? S.attribute('_flush_w', 'float') : null;
    if (L.head) {
      const y = S.positionGeometry.y.sub(L.head.centre[1]).div(L.head.L);
      const ramp = R => { const t = sat(y.sub(R.x).div(R.y.sub(R.x))); return t.mul(t).mul(S.float(3).sub(t.mul(2))); };
      out = S.mix(out, out.mul(P.flushColor), sat(P.flush).mul(fw || ramp(P.flushRamp).mul(mask)));
      out = S.mix(out, out.mul(P.dreadColor), sat(P.dread).mul(ramp(P.dreadRamp)).mul(mask));
    } else out = S.mix(out, out.mul(P.flushColor), sat(P.flush).mul(fw || mask));
    if (F.ink) {                                                  // faceshade.ink: drawn lines, off the neck (_INK_W)
      const k = sample(tex[F.ink.index], F.ink, uvOf(F.ink), F.ink.filter === 'cubic');
      out = S.mix(out, k.xyz, k.w.mul(S.attribute('_ink_w', 'float')));
    }
    return { col: out, sdf, t, mask, sh, params: P };
  }

  function hairNodes(L, toon, col, hasLock) {
    // a mesh without the 'lock' UV (a bun sharing the hair material) reads (0, 0) there, as Blender's UV Map node does
    const Hh = L.hair, R = Hh.ring, uvl = hasLock ? S.uv(Hh.lock || 1) : S.vec2(0.0, 1.0);
    const across = S.abs(uvl.x), along = S.float(1.0).sub(uvl.y);   // glTF v = 1 - Blender v
    const p = S.positionGeometry.sub(v3(R.centre));
    const el = S.atan(p.y, S.length(p.xz));
    const rad = Math.PI / 180;
    const mid = mapRange(across, R.mid[0], R.mid[1]);
    const lens = S.float(R.width * rad).sub(across.mul(across).mul(R.width * rad)).sub(S.abs(el.sub(R.elevation * rad)));
    const band = sat(lens.div(R.soft * rad));
    const face = mapRange(facing(R.facingBlend), R.facing[0], R.facing[1]);
    const ring = mid.mul(band).mul(face).mul(toon.sLit).mul(R.amount).mul(U.ring);
    let c = S.mix(col, v3(R.color), ring);
    const G = Hh.gradient;
    c = c.mul(mapRange(along, G.range[0], G.range[1], G.root, 1.0));
    const St = Hh.strands;
    const ln = mapRange(S.abs(across.sub(St.offset)), St.width[0], St.width[1], 1.0, 0.0);
    const lf = mapRange(along, St.fade[0], St.fade[1], St.amount, 0.0);
    return S.mix(c, c.mul(v3(St.color)), ln.mul(lf));
  }

  // the weight of the chosen joint, computed per vertex
  const boneWeight = () => {
    const idx = S.vec4(S.attribute('skinIndex', 'uvec4')), w = S.attribute('skinWeight', 'vec4');
    const m = k => w[k].mul(is(idx[k], U.bone));
    return S.varying(m('x').add(m('y')).add(m('z')).add(m('w')));
  };
  const heat = x => S.mix(S.mix(S.vec3(0.05, 0.05, 0.35), S.vec3(0.1, 0.8, 0.3), sat(x.mul(2))), S.vec3(1.0, 0.2, 0.1), sat(x.mul(2).sub(1)));
  // the page's per-vertex value (_ck_dbg.x) on the heat ramp over CK.U.heatRange; a flagged vertex (y: 1 folded, 2
  // collapsed) magenta or white over it; y 3: not measured (the look, faded)
  const studioHeat = look => {
    const d = S.attribute('_ck_dbg', 'vec2');
    const h = heat(sat(d.x.sub(U.heatRange.x).div(U.heatRange.y.sub(U.heatRange.x).max(1e-9))));
    const f1 = S.step(0.5, d.y).mul(S.float(1.0).sub(S.step(1.5, d.y))), f2 = S.step(1.5, d.y).mul(S.float(1.0).sub(S.step(2.5, d.y))), f3 = S.step(2.5, d.y);
    return S.mix(S.mix(S.mix(h, S.vec3(1.0, 0.1, 0.9), f1), S.vec3(1.0), f2), look.mul(0.35).add(0.55), f3);
  };
  // head D's shading data (_CK_SHADE: x the propensity's offset on the half-lambert, y the face light's weight, z the
  // hull's z offset m, w the SDF's offset): x and w diverging round 0 (blue -, red +), y 0..1 on the heat ramp, z in cm
  const shadeView = c => {
    const v = S.attribute('_ck_shade', 'vec4')['xyzw'[c]];
    if (c === 1) return heat(sat(v));
    const k = c === 2 ? v.mul(100) : v.mul(2);
    return S.mix(S.vec3(0.85), S.mix(S.vec3(0.15, 0.35, 1.0), S.vec3(1.0, 0.25, 0.15), S.step(0.0, k)), sat(S.abs(k)));
  };

  // ------------------------------------------------------------------------------------------------ drawn layers
  // drawn-feature layers (docs/FORMAT.md "Layers"; ws-body's face round 2, 2026-10-17): what a morph can't reach crisply,
  // drawn in a material's own pass after its ink. Kinds: 'atlas' (an RGBA state per cell in the material's uv0 / uv1:
  // cells [cols, rows], each covering the whole uv range), 'sdf' with shape 'band' (the teeth in the mouth opening's
  // _MOUTH_UV: u corner to corner, v the upper lip's edge 0 to the lower's 1, -1 off it) or 'stroke' (a polyline of up to
  // 8 points with a width per point, distance in metres through uvScale). Each param is a uniform driven by the material
  // channel layer.<name>.<param> (ck.layerValue: driven, its value; undriven, the layer's default); 'alpha' scales what it
  // draws (default 1 for a band, which stands in for the teeth; 0 for atlases and strokes, which a state turns on); 'hides' names meshes (object names or
  // look-role prefixes) hidden while the layer shows. The band's maths is the face round's harness's (makeBand).
  CK.LAYER_PARAMS = { atlas: { alpha: 0, cell: 0 }, band: { alpha: 1, h: 0.2, h_max: 0.3, h2: 0, span: 0.85, round: 0.35, gap: 0,
    line: 0, outline: 0 }, stroke: { alpha: 0 } };
  CK.layerUniforms = (LY) => {
    const kind = LY.kind === 'sdf' ? LY.shape : LY.kind, P = LY.params || {}, u = {};
    for (const [k, d] of Object.entries(CK.LAYER_PARAMS[kind] || {})) u[k] = S.uniform(typeof P[k] === 'number' ? P[k] : d);
    for (const k of ['color', 'shade', 'line_color', 'ink']) if (Array.isArray(P[k])) u[k] = S.uniform(new T.Vector3(...P[k]));
    if (kind === 'band') {
      u.color = u.color || S.uniform(new T.Vector3(0.96, 0.95, 0.94)); u.shade = u.shade || S.uniform(new T.Vector3(0.82, 0.80, 0.82));
      u.line_color = u.line_color || S.uniform(new T.Vector3(0.55, 0.45, 0.47)); u.ink = u.ink || S.uniform(new T.Vector3(0.20, 0.12, 0.12));
      u.shade_from = S.uniform(typeof P.shade_from === 'number' ? P.shade_from : 0.8);
    }
    if (kind === 'stroke') {
      const pts = P.points || [], w = P.width || [];
      u.n = pts.length; u.pts = []; u.w = [];
      for (let i = 0; i < Math.min(8, pts.length); i++) { u.pts.push(S.uniform(new T.Vector2(...pts[i]))); u.w.push(S.uniform(w[Math.min(i, w.length - 1)] || 0)); }
      u.scale = S.uniform(new T.Vector2(...(P.uvScale || LY.uvScale || [1, 1])));
      u.color = u.color || S.uniform(new T.Vector3(0.55, 0.28, 0.18));
    }
    return u;
  };
  // a layer's drawing over a material's colour -> the new colour (null when the geometry lacks what the layer reads)
  function layerNodes(color, LY, attrs) {
    const u = LY.u, kind = LY.kind === 'sdf' ? LY.shape : LY.kind;
    const uvName = LY.uv === 'uv0' ? 'uv' : (LY.uv || 'uv1');
    if (kind === 'atlas') {
      if (!LY.texture || !(uvName === 'uv' ? attrs.uv0 : attrs.uv1)) return null;
      const [cols, rows] = LY.cells || [1, 1], uv = S.attribute(uvName, 'vec2');
      const c = S.floor(S.max(u.cell, 0.0).add(0.5)), col = S.mod(c, cols), row = S.floor(c.div(cols));
      const tx = S.texture(LY.texture, S.vec2(uv.x.add(col).div(cols), uv.y.add(row).div(rows)));
      return S.mix(color, tx.xyz, sat(tx.w.mul(u.alpha)));
    }
    if (kind === 'band') {
      if (!attrs.mouthUV) return null;
      const muv = S.attribute('_mouth_uv', 'vec2'), uu = muv.x, v = muv.y, valid = S.step(0.0, uu);
      const us = uu.sub(0.5).div(S.max(u.span, 0.01)).add(0.5);
      const a = S.clamp(S.abs(us.mul(2).sub(1)).sub(S.float(1).sub(u.round)).div(S.max(u.round, 0.01)), 0.0, 1.0);
      const e = S.sqrt(S.clamp(S.float(1).sub(a.mul(a)), 0.0, 1.0)).mul(S.step(0.0, us)).mul(S.step(us, 1.0));
      const h = S.min(u.h, u.h_max), top = u.gap, bot = u.gap.add(h.mul(e));
      const inUp = S.step(top, v).mul(S.step(v, bot)).mul(S.step(0.001, h.mul(e)));
      const inLo = S.step(S.float(1).sub(u.h2.mul(e)), v).mul(S.step(0.001, u.h2.mul(e)));
      const inLine = S.step(bot.sub(u.line), v).mul(S.step(v, bot)).mul(inUp);
      const inInk = S.max(S.step(v, u.outline), S.step(S.float(1).sub(u.outline), v)).mul(S.step(0.0001, u.outline));
      const sh = S.clamp(S.abs(us.mul(2).sub(1)).sub(u.shade_from).div(S.max(S.float(1).sub(u.shade_from), 0.01)), 0.0, 1.0);
      let col = S.mix(u.color, u.shade, sh);
      col = S.mix(col, u.shade, inLo);
      col = S.mix(col, u.line_color, inLine);
      col = S.mix(col, u.ink, inInk);
      const cov = S.max(S.max(inUp, inLo), inInk).mul(valid).mul(u.alpha);
      return S.mix(color, col, sat(cov));
    }
    if (kind === 'stroke') {
      if (!(uvName === 'uv' ? attrs.uv0 : attrs.uv1) || u.pts.length < 2) return null;
      const p = S.attribute(uvName, 'vec2').div(u.scale);                    // (metres)
      let sd = S.float(1e3);
      for (let i = 0; i + 1 < u.pts.length; i++) {
        const A = u.pts[i].div(u.scale), B = u.pts[i + 1].div(u.scale), ab = B.sub(A);
        const t = S.clamp(p.sub(A).dot(ab).div(S.max(ab.dot(ab), 1e-12)), 0.0, 1.0);
        const d = p.sub(A.add(ab.mul(t))).length();
        sd = S.min(sd, d.sub(S.mix(u.w[i], u.w[i + 1], t).mul(0.5)));
      }
      const cov = S.clamp(S.float(0.5).sub(sd.div(S.max(S.fwidth(sd), 1e-6))), 0.0, 1.0).mul(u.alpha);
      return S.mix(color, u.color, sat(cov));
    }
    return null;
  }
  // which of a character's layers draw on a material (by look role: the role itself or role.prefix; a layer naming no
  // material draws on the face material)
  CK.layersFor = (layers, L) => (layers || []).filter(LY => {
    const r = L.role || '', m = LY.material;
    return m ? (r === m || r.startsWith(m + '.')) : L.kind === 'face';
  });

  // a surface material from one material's look (L) and its mesh (M); attrs: which custom attributes the geometry has;
  // layers: the drawn-feature layers on it (CK.layersFor)
  // line sets (ws-render, 2026-10-20; ws-body's contract): drawn lines on a surface as isolines of a per-vertex field,
  // a constant stroke on screen from any camera (the mouth's rim lines, mouth-design.md round 6 "For ws-render": the
  // draped ribbon read heavier from below and sat off the opening seen low; the body's form lines, the clavicles and the
  // notch as the design sheet strokes them). A set NAME is the attribute _LINE_<NAME> (vec4: d, the signed distance
  // from its line in L, 0 on it, the stroke's `inner` share on the - side; t, 0..1 end to end; w, the weight; m, 1
  // where the field holds) and its parameters (CK.LINE_SETS, a file's CHARKIT_look.line_sets over them):
  //   width   the stroke's full width in L at the head's scale on screen (Michael, mouth-design #8.2: relative to the
  //           head), at least min_px px (default 1: a far shot keeps the line), at weight 1
  //   taper   [base, a, b]: the width x (base + (1 - base) sin(pi t)^a) x sin(pi t)^b
  //   inner   the share of the width on the - side: a number, or [lo, hi] by inner_by [set, w0, w1] (that set's
  //           weight w0 -> w1: the upper mouth line tucks 0.25 -> 0.6 into the opening as the lower's weight rises)
  //   weight  the set's weight (x each vertex's w), plus keys {key: delta} x the face keys' influences
  //   color   linear [r, g, b], or material: a material's (by role) whose colour it takes
  //   group   the material channel line.<group> (or line.<name>): the width x (1 + v), -1 hides it (as `outline`)
  //   hides   parts hidden while the set draws (the mouth's ribbon); on: false keeps a set off
  // ?lines=none draws none, ?lines=a,b only those sets or groups; the mouth's sets draw by default, the draped ribbon
  // hidden (2026-10-20: Michael's read of the A/B, "the screen line seems to look better than ribbon", its corner spurs
  // fixed; a known item: a short stub on the cavity's far wall seen at three-quarter, ws-render.md); ?screenline=0 the
  // ribbon instead, for A/Bs (=1 forces the line). In the ids view (CK.DEBUG_IDS) a set's pixels
  // (coverage over 1/2) take the id 'line.<name>', so a reader measures the line by class (linefit's up and lo).
  CK.LINE_SETS = {
    mouth_up: { group: 'mouth', width: 0.005, taper: [0.35, 0.6, 0], inner: [0.25, 0.6], inner_by: ['mouth_lo', 0.15, 0.5],
      weight: 1, material: 'mouth_line', hides: ['mouth_line'], on: true },
    mouth_lo: { group: 'mouth', width: 0.005, taper: [0.35, 0.6, 0.5], inner: 0.35, weight: 0.15, material: 'mouth_line',
      hides: ['mouth_line'], on: true },
  };
  CK.LINE_DEFAULT = { width: 0.004, min_px: 1, taper: [0.35, 0.6, 0], inner: 0.5, weight: 1, keys: null, color: null,
    material: null, group: null, hides: [], on: true };
  CK.LINES_Q = (() => {
    if (typeof location === 'undefined') return {};
    const q = new URLSearchParams(location.search);
    return { screen: q.get('screenline'), only: q.has('lines') ? q.get('lines').split(',').filter(Boolean) : null };
  })();
  CK.lineParams = (name, file = null) => Object.assign({}, CK.LINE_DEFAULT, CK.LINE_SETS[name] || {}, (file && file[name]) || {});
  CK.lineOn = (name, P) => {
    const Q = CK.LINES_Q, g = P.group || name;
    if (Q.only) return !Q.only.includes('none') && (Q.only.includes(name) || Q.only.includes(g));
    if (g === 'mouth' && (Q.screen === '0' || Q.screen === '1')) return Q.screen === '1';
    return P.on !== false;
  };
  // one set's uniforms, per character (CU.lines; a shared material's set is the page's)
  CK._lineCU = { lines: {} };
  CK.lineUniforms = (CU, name) => {
    const H = (CU || CK._lineCU).lines = (CU || CK._lineCU).lines || {};
    if (!H[name]) {
      const P = CK.lineParams(name);
      H[name] = { on: S.uniform(0), width: S.uniform(P.width), minPx: S.uniform(P.min_px), taper: S.uniform(new T.Vector3(...P.taper)),
        inner: S.uniform(typeof P.inner === 'number' ? P.inner : P.inner[0]), weight: S.uniform(P.weight),
        color: S.uniform(new T.Vector3(...(P.color || [0.106539, 0.021981, 0.017389]))) };
    }
    return H[name];
  };
  CK.lineSetsOf = g => Object.keys(g.attributes).filter(k => /^_line_./.test(k)).map(k => k.slice(6)).sort();
  // (a set's coverage from the look's shared WGSL, looklib.wgsl's ck_line_cov, the function charkit.render's toon.wgsl
  // draws the QA's lines with (2026-10-20: one source); the TSL below where the library didn't load, or ?sharedlines=0)
  let lineFn = null;
  CK.SHARED_LINES = !(typeof location !== 'undefined' && /[?&]sharedlines=0(&|$)/.test(location.search));
  // -> { color, ids (the ids view's colour: the material's, a set's id where it draws), or null without sets }
  const lineSetNodes = (color, attrs, CU, ckId, LD = null) => {
    if (!attrs.lineSets || !attrs.lineSets.length) return null;
    // (the head's L on screen in the target's pixels, which the derivatives count: CK.pipeline's supersampled main pass;
    // the floor in output pixels, U.lineSS)
    const pxL = S.screenSize.y.div(S.max(U.headVisH, 1e-6)).mul(U.headL);
    let ids = CK.idColor(ckId);
    for (const name of attrs.lineSets) {
      const u = CK.lineUniforms(CU, name), R0 = S.attribute('_line_' + name, 'vec4');
      const slot = LD && attrs.lineKeyed ? attrs.lineKeyed[name] : undefined;     // (keyed: d plus its keys' deltas)
      const R = slot === undefined ? R0 : S.vec4(R0.x.add(slot ? LD.y : LD.x), R0.y, R0.z, R0.w);
      let cov;
      if (CK.LOOKLIB && CK.SHARED_LINES) {
        if (!lineFn) lineFn = S.wgslFn(`fn ck_line(r: vec4<f32>, g: f32, px_l: f32, p: vec4<f32>, taper: vec4<f32>) -> f32 {
          return ck_line_cov(r, g, px_l, p, taper);
        }`, [lookLib()]);
        cov = lineFn({ r: R, g: S.length(S.vec2(S.dFdx(R.x), S.dFdy(R.x))), px_l: pxL,
          p: S.vec4(u.width, u.minPx.mul(U.lineSS), u.inner, u.weight), taper: S.vec4(u.taper, u.on) });
      } else {
        // (sin floored above 0: pow(0, 0) is undefined in WGSL; past the line's ends (t outside 0..1: an open line's
        // field continued along it, so its sign never jumps) nothing draws)
        const sn = S.max(S.sin(sat(R.y).mul(Math.PI)), 1e-6), ends = S.step(0.0, R.y).mul(S.step(R.y, 1.0));
        const prof = u.taper.x.add(S.float(1).sub(u.taper.x).mul(S.pow(sn, u.taper.y))).mul(S.pow(sn, u.taper.z)).mul(ends);
        const w = S.max(pxL.mul(u.width), u.minPx.mul(U.lineSS)).mul(prof).mul(R.z).mul(u.weight).mul(S.step(1e-6, u.width));
        // (the pixel's footprint [px - 1/2, px + 1/2] against the stroke [-w inner, w (1 - inner)]: a box filter, so a
        // stroke thinner than a pixel covers its width's share, and a weight of nothing draws nothing)
        const px = R.x.div(S.max(S.length(S.vec2(S.dFdx(R.x), S.dFdy(R.x))), 1e-9));
        const lo = w.mul(u.inner).negate(), hi = w.mul(S.float(1).sub(u.inner));
        cov = S.max(S.min(px.add(0.5), hi).sub(S.max(px.sub(0.5), lo)), 0.0).min(1.0).mul(sat(R.w)).mul(u.on);
      }
      color = S.mix(color, u.color, cov);
      ids = S.mix(ids, CK.idColor(CK.idOf('line.' + name)), S.step(0.5, cov));
    }
    return { color, ids };
  };
  CK.material = (L, M, tex, attrs, CU = null, layers = null) => {
    const m = new T.MeshBasicNodeMaterial();
    m.side = L.doubleSided ? T.DoubleSide : T.FrontSide;
    m.name = 'ck:' + (L.role || L.kind);
    m.userData.ckIdName = L.role || L.kind || 'material'; m.userData.ckId = CK.idOf(m.userData.ckIdName);
    let color, toon = null, face = null, alpha = null;
    if (L.kind === 'flat') color = v3(L.color);
    else if (L.kind === 'plate') {
      let uvp = uvOf(L.texture), fade = null;
      if (L.eye) {
        // an eye layer (charkit.eyelook; toon.wgsl's eye_uv / eye_off): uv' = centre + (uv - centre) / scale - offset in
        // glTF uv (v down); the highlights' offset moves toward the camera by `follow` along the eye's axes (per pixel)
        const E = L.eye;
        const P = { scale: S.uniform(new T.Vector2(1, 1)), off: S.uniform(new T.Vector2(0, 0)), follow: S.uniform(0),
          axOut: S.uniform(new T.Vector3(...((E.axes && E.axes.out) || [1, 0, 0]))), axUp: S.uniform(new T.Vector3(...((E.axes && E.axes.up) || [0, 1, 0])))
          , fade: S.uniform(1) };
        const c0 = S.vec2(E.centre[0], 1.0 - E.centre[1]);
        let off = P.off;
        if (E.layer === 'highlight') {
          const vd = viewDir();
          off = off.add(S.vec2(vd.dot(P.axOut), vd.dot(P.axUp).negate()).mul(P.follow));
        }
        uvp = c0.add(uvp.sub(c0).div(P.scale)).sub(off);
        fade = P.fade;
        m.userData.eye = { E, P };
      }
      const c = sample(tex[L.texture.index], L.texture, uvp, L.texture.filter === 'cubic');
      color = c.xyz;
      if (L.alpha === 'blend') alpha = fade ? c.w.mul(fade) : c.w;
    } else {
      toon = toon3Nodes(L, attrs, tex, CU);
      color = toon.col;
      if (L.kind === 'face' && L.face) { face = faceNodes(L, tex, toon, attrs); color = face.col; }
      if (L.kind === 'hair' && L.hair) color = hairNodes(L, toon, color, attrs.uv1);
      if (L.texture) color = color.mul(sample(tex[L.texture.index], L.texture, uvOf(L.texture), L.texture.filter === 'cubic').xyz);
    }
    let flushP = null;
    if (attrs.flushW && toon && !face) {                          // (the body's skin: the throat's share of _FLUSH_W)
      flushP = { flush: S.uniform(0), flushColor: S.uniform(new T.Vector3(...CK.FLUSH.color)) };
      color = S.mix(color, color.mul(flushP.flushColor), sat(flushP.flush).mul(S.attribute('_flush_w', 'float')));
    }
    for (const LY of layers || []) { const c = layerNodes(color, LY, attrs); if (c) color = c; }   // (drawn layers, after the ink)
    if (attrs.lineKeyed) m.userData.ckLD = S.varyingProperty('vec2', 'ckLD');   // (the keyed fields' d: the sparse stage's)
    const LS = lineSetNodes(color, attrs, CU, m.userData.ckId, m.userData.ckLD);  // (line sets: the mouth's rim lines, the forms)
    if (LS) color = LS.color;
    color = tinted(color, CU);                                    // (CK.PARAMS.all)
    // debug views
    const dbg = [
      color,
      nWorld().mul(0.5).add(0.5),
      toon ? S.vec3(toon.h).mul(0.8).add(S.vec3(0.2, 0, 0).mul(S.step(0.5 - 0.004, toon.h).mul(S.step(toon.h, 0.5 + 0.004)))) : S.vec3(0.5),
      face ? S.mix(S.vec3(face.sdf), S.vec3(1.0, 0.25, 0.2), S.float(1).sub(face.sh).mul(face.mask).mul(0.35)) : S.vec3(0.3),
      attrs.uv0 ? S.vec3(S.fract(S.uv(0).mul(8)), 0.25) : S.vec3(0.15),
      attrs.uv1 ? S.vec3(S.fract(S.uv(1).mul(8)), 0.25) : S.vec3(0.15),
      heat(boneWeight()),
      attrs.faceMask ? S.vec3(S.attribute('_face_mask', 'float')) : S.vec3(0),
      attrs.outlineW ? heat(S.attribute('_outline_width', 'float')) : S.vec3(M && M.outline ? 1 : 0.1),
      L.kind === 'flat' ? v3(L.color) : L.lit ? v3(L.lit) : color,
      toon ? S.vec3(toon.rimF.mul(4)) : S.vec3(0),
      S.vec3(S.fract(S.cameraPosition.sub(S.positionWorld).length().mul(4))),
      attrs.dbg ? studioHeat(color) : color.mul(0.35).add(0.55),
      ...[0, 1, 2, 3].map(c => attrs.shade ? shadeView(c) : S.vec3(0.12)),
      (attrs.hullN ? S.attribute('_hull_normal', 'vec3') : S.normalLocal).mul(0.5).add(0.5),   // (no normalize: a zero would be NaN, and NaN x 0 isn't 0)
      S.mix(S.vec3(0.85), S.vec3(0.85, 0.1, 0.1), selfShadowNode()),   // 18: the self-shadow alone (red: shadowed)
      // 19: a live-normals candidate's front faces whose shading normal faces away (red: rom_garment_inside's pixels)
      attrs.liveCand ? S.mix(S.vec3(0.8), S.vec3(0.9, 0.1, 0.1), S.step(S.dot(nWorld(), viewDir()), 0.0).mul(S.select(S.frontFacing, S.float(1), S.float(0)))) : S.vec3(0.25),
      LS ? LS.ids : CK.idColor(m.userData.ckId),            // 20: the material's id (CK.DEBUG_IDS), a line set's where it draws
    ];
    let out = dbg[0].mul(is(U.debug, 0));
    for (let i = 1; i < dbg.length; i++) out = out.add(dbg[i].mul(is(U.debug, i)));
    m.colorNode = out;
    if (alpha) {                                              // (debug views opaque; the ids view where it shows: alpha > 1/2)
      m.transparent = true; m.depthWrite = false;
      m.opacityNode = S.mix(S.mix(alpha, S.float(1), S.min(U.debug, 1.0)), S.step(0.5, alpha), is(U.debug, CK.DEBUG_IDS));
    }
    if (M && M.outline && attrs.hullN && attrs.hullT) {       // (posedHull's inputs from the sparse stage, CK._sparseFor: a file with hull targets)
      m.userData.ckDH = S.vec3(0.0).toVar('ckDH'); m.userData.ckNM = S.vec3(0.0).toVar('ckNM');
    } else if (M && M.outline && attrs.hullN && attrs.edit) {  // (the edit layer's alone, CK.editLayer: its hull delta and edited rest normal)
      m.userData.ckEH = S.vec3(0.0).toVar('ckEH'); m.userData.ckEN = S.vec3(0.0).toVar('ckEN');
    }
    if (M && M.outline) m.positionNode = CK.surfacePosition(M, attrs, m);
    m.userData.look = L;
    if (face) m.userData.faceParams = face.params;
    else if (flushP) m.userData.faceParams = flushP;
    return m;
  };

  // an outlined mesh's line width in this view (screen lines, the root's lines.mode 'screen': U.lineScreen x the
  // region's factor, else the build width) and charkit.shade.line_inward: the surface's inward move at a width
  const viewWidth = M => S.mix(S.float(M.outline.width), U.lineScreen.mul(M.outline.regionFactor || 1), S.step(1e-9, U.lineScreen));
  const inwardOf = (M, w) => (M.outline.maxInward ? S.min(S.float(w), M.outline.maxInward) : S.float(w));
  const outlineW = attrs => (attrs.outlineW ? S.attribute('_outline_width', 'float') : S.float(1));
  // how far this view's surface is from POSITION (the build width's), along the hull direction: inward(build) - inward(view)
  const surfaceShift = M => inwardOf(M, M.outline.width).sub(inwardOf(M, viewWidth(M)));

  CK.hullMaterial = (M, attrs, CU = null) => {
    const m = new T.MeshBasicNodeMaterial();
    m.side = T.BackSide;
    m.name = 'ck:outline';
    m.userData.ckIdName = 'outline'; m.userData.ckId = CK.idOf('outline'); m.userData.ckHullMat = true;
    m.colorNode = S.mix(tinted(v3(M.outline.color), CU), CK.idColor(m.userData.ckId), is(U.debug, CK.DEBUG_IDS));
    // the view's surface plus its width: co + (w - inward(w)) along the hull direction (this geometry's normal); the
    // 'outline' channel scales the width by 1 + v
    const scale = CU ? U.outline.mul(S.max(CU.outline.add(1.0), 0.0)) : U.outline;
    let p = S.positionLocal.add(S.normalLocal.mul(outlineW(attrs).mul(surfaceShift(M).add(viewWidth(M).mul(scale)))));
    // (away from the camera along this vertex's view ray, in the model's frame)
    const camL = S.modelWorldMatrixInverse.mul(S.vec4(S.cameraPosition, 1.0)).xyz;
    const back = S.modelWorldMatrixInverse.mul(S.vec4(U.camBack, 0.0)).xyz;
    const away = S.mix(S.normalize(p.sub(camL)), back.negate(), U.ortho);
    // every hull pushed back along its view ray by CK.HULL_Z (m): where a surface folds tighter than the line is wide,
    // the hull extruded off one side stands in front of the other and draws through it (Clawd motion's athletic top
    // under the raised arms: outline px in blobs >= 4 px thick at arms_up 243/234/278 at az 0/35/90 -> 0/0/0 at 2 mm;
    // the rest pose's outline 6,478 -> 6,454 px, Sonnet bare's unchanged; garments 2026-10-18). The silhouettes against
    // the background keep their width; a line against a surface within the offset behind thins. Along the view ray, not
    // in clip depth: the same in perspective and orthographic. (Extruding garments along CK.live's posed normals instead
    // was worse: their rims' welded normals turn against the export's, 5,398 px changed at rest, the wedges unchanged.)
    if (CK.HULL_Z > 0) p = p.add(away.mul(CK.HULL_Z));
    if (attrs.shade) {
      // (head D's hull moved away from the camera along its view ray by the stream's z: HSR's z offset, the face's
      // underside's hull hidden behind the neck; charkit.render's vs_hull)
      const z = S.max(S.attribute('_ck_shade', 'vec4').z, 0.0);
      p = p.add(away.mul(z));
    }
    m.positionNode = p;
    return m;
  };

  // the surface Blender draws in this view: POSITION moved by surfaceShift along the hull direction (NORMAL where the
  // export has no _HULL_NORMAL, the two agreeing there; else the _HULL_NORMAL attribute, posed: posedHull)
  CK.surfacePosition = (M, attrs, m = null) => {
    const dir = attrs.hullN ? posedHull(S.attribute('_hull_normal', 'vec3'), attrs, m) : S.normalLocal;
    return S.positionLocal.add(dir.mul(outlineW(attrs).mul(surfaceShift(M))));
  };
  // the hull direction as the pose and the keys carry it. three morphs and skins NORMAL and TANGENT only, and runs the
  // position node after them, so _HULL_NORMAL itself stays at rest: on a posed lock the surface's shift went along the
  // rest direction, through the lock, behind its own hull, once the view's line passed the build's (groomed hair black
  // from ~2 m in a turn, c3-hair 2026-10-18; the rest pose's boards were right). The direction is turned as the frame
  // turns from rest (the attributes) to now (normalLocal, tangentLocal): with a tangent the frame whole (a rigid lock's
  // turn exactly), else the least turn from the rest normal to the posed one. At rest the turn is the identity.
  // With the material's sparse variables (ckDH, ckNM: a file's _HULL_NORMAL targets), the hull direction is the rest
  // one plus its own keyed deltas, turned by the skin alone (from the morphed normal to the skinned): exact where the
  // file's hull targets are; without them the turn from the rest normal carries the keys too, as before.
  const posedHull = (h, attrs, m = null) => {
    if (CK.REST_HULL) return h;                              // (?resthull=1: the rest direction, as before: A/Bs)
    const V = m && m.userData && m.userData.ckDH ? m.userData : null;
    const Ed = !V && m && m.userData && m.userData.ckEH ? m.userData : null;   // (the edit layer on a mesh without hull targets)
    if (V) h = h.add(V.ckDH);
    else if (Ed) h = h.add(Ed.ckEH);
    const n0 = S.normalize(V ? V.ckNM : Ed ? Ed.ckEN : S.attribute('normal', 'vec3')), n1 = S.normalize(S.normalLocal);
    if (attrs.tangent) {
      const frame = (n, t) => {
        const tp = t.sub(n.mul(S.dot(n, t)));
        const u = tp.div(S.max(S.length(tp), 1e-6));
        return [u, n, S.cross(n, u)];
      };
      const [u0, v0, w0] = frame(n0, S.attribute('tangent', 'vec4').xyz), [u1, v1, w1] = frame(n1, S.tangentLocal);
      return u1.mul(S.dot(h, u0)).add(v1.mul(S.dot(h, v0))).add(w1.mul(S.dot(h, w0)));
    }
    const k = S.cross(n0, n1), c = S.dot(n0, n1);
    const turned = h.mul(c).add(S.cross(k, h)).add(k.mul(S.dot(k, h)).div(S.max(c.add(1.0), 1e-4)));
    return S.select(c.greaterThan(-0.999), turned, h);
  };

  // the skin as a depth-only holdout for the feature pass; at the original surface (charkit.qa.features_through turns
  // the outline SOLIDIFY off on its holdouts), i.e. where the hull is
  CK.holdoutMaterial = (M, attrs) => {
    const m = new T.MeshBasicNodeMaterial({ colorWrite: false });
    m.side = T.DoubleSide; m.name = 'ck:holdout'; m.userData.ckHullMat = true;
    if (M && M.outline) m.positionNode = S.positionLocal.add(S.normalLocal.mul(outlineW(attrs).mul(inwardOf(M, M.outline.width))));
    return m;
  };

  // morph targets that move nothing, dropped from the GPU. glTF gives every primitive of a mesh the same targets, so a
  // garment carries the face's keys as empty accessors, and three expands each target densely per geometry (position
  // and normal): c3-coat's lined export had 2,967 primitive targets, 61% empty, 3.5 GB of the 3.9 GB it asked of the GPU,
  // which ran Metal out of memory (2026-10-16). The influences the VRM's expressions and ck.keyIndex write stay
  // full-length (logical); ck.update packs the kept ones (physical) for the mesh and its hull and holdout.
  const emptyAccessor = (js, i) => {
    if (i === undefined) return true;
    const a = js.accessors[i];
    return a.bufferView === undefined && (!a.sparse || a.sparse.count === 0);
  };
  CK.compactMorphs = (mesh, prim, js) => {
    const g = mesh.geometry, targets = prim.targets || [];
    const mp = g.morphAttributes.position || g.morphAttributes.normal;
    if (!targets.length || !mp || mp.length !== targets.length || !mesh.morphTargetInfluences) return null;
    const keep = [];
    targets.forEach((t, i) => { if (Object.values(t).some(a => !emptyAccessor(js, a))) keep.push(i); });
    if (keep.length === targets.length) return null;
    if (keep.length) for (const k of Object.keys(g.morphAttributes)) g.morphAttributes[k] = keep.map(i => g.morphAttributes[k][i]);
    else g.morphAttributes = {};
    // outside ck.update the mesh shows the packed set, its dictionary and influences matching the geometry (readers such
    // as charstudio's skin.js index morphAttributes by morphTargetDictionary); the full-length ones are cm's
    const logicalDict = mesh.morphTargetDictionary || {}, dict = {};
    for (const [k, i] of Object.entries(logicalDict)) { const j = keep.indexOf(i); if (j >= 0) dict[k] = j; }
    const cm = { keep, total: targets.length, logical: mesh.morphTargetInfluences, logicalDict, physical: new Array(keep.length).fill(0), clones: [] };
    mesh.morphTargetDictionary = dict; mesh.morphTargetInfluences = cm.physical;
    return cm;
  };
  // sparse morphs (2026-10-17): a mesh's morph targets as CSR on the GPU (WebGPU, outside the studio, whose skin.js and
  // ground.js read geometry.morphAttributes): per vertex, the targets that move it with their position and normal deltas,
  // added in the vertex stage before skinning (CK.sparseSetup), in place of three's dense morph texture (a layer per
  // target over every vertex: the face-round build's 1.27 GB against 0.25 GB here) and its loop over every target per
  // vertex. Entries run in target order per vertex, so the sums are three's in the same order (zeros skipped). The
  // influences stay mesh.morphTargetInfluences (packed: CK.packMorphs), copied to the GPU each update (CK.syncSparse).
  CK.sparseMorphs = mesh => {
    const g = mesh.geometry, mp = g.morphAttributes.position, mn = g.morphAttributes.normal;
    const nT = (mp || mn || []).length;
    if (!nT || !g.morphTargetsRelative || !mesh.morphTargetInfluences) return null;
    const flat = a => (a && !a.isInterleavedBufferAttribute && a.itemSize === 3 && a.array instanceof Float32Array) ? a.array : null;
    const P = mp ? mp.map(flat) : null, N = mn ? mn.map(flat) : null;
    if ((P && P.some(x => !x)) || (N && N.some(x => !x))) return null;
    const n = g.attributes.position.count;
    // (primitives of one glTF mesh share their morph attributes: one CSR for them all, an influence buffer each)
    const key = (mp || mn)[0], shared = CK._sparseShared.get(key);
    if (shared && shared.nT === nT && shared.n === n) {
      if (!g.attributes._ck_sp) g.setAttribute('_ck_sp', shared.rangeAttr);
      return CK._sparseFor(shared, true);
    }
    const cnt = new Uint32Array(n);
    const moves = (t, o) => (P && (P[t][o] !== 0 || P[t][o + 1] !== 0 || P[t][o + 2] !== 0)) || (N && (N[t][o] !== 0 || N[t][o + 1] !== 0 || N[t][o + 2] !== 0));
    for (let t = 0; t < nT; t++) for (let v = 0, o = 0; v < n; v++, o += 3) if (moves(t, o)) cnt[v]++;
    const off = new Uint32Array(n + 1);
    for (let v = 0; v < n; v++) off[v + 1] = off[v] + cnt[v];
    const E = off[n];
    if (!E) return null;
    const dp = new Float32Array(E * 4), dn = N ? new Float32Array(E * 4) : null, at = off.slice(0, n);
    for (let t = 0; t < nT; t++) for (let v = 0, o = 0; v < n; v++, o += 3) {
      if (!moves(t, o)) continue;
      const k = at[v]++, q = 4 * k;
      if (P) { dp[q] = P[t][o]; dp[q + 1] = P[t][o + 1]; dp[q + 2] = P[t][o + 2]; }
      dp[q + 3] = t;                                          // (the target's index rides in w: exact below 2^24)
      if (dn) { dn[q] = N[t][o]; dn[q + 1] = N[t][o + 1]; dn[q + 2] = N[t][o + 2]; }
    }
    const range = new Float32Array(2 * n);                    // (each vertex's first entry and count: a vertex attribute)
    for (let v = 0; v < n; v++) { range[2 * v] = off[v]; range[2 * v + 1] = off[v + 1] - off[v]; }
    const rangeAttr = new T.BufferAttribute(range, 2);
    g.setAttribute('_ck_sp', rangeAttr);
    const base = { nT, n, E, hasP: !!P, rangeAttr, range, dp,
      sP: S.storage(new T.StorageBufferAttribute(dp, 4), 'vec4', E).toReadOnly(),
      sN: dn ? S.storage(new T.StorageBufferAttribute(dn, 4), 'vec4', E).toReadOnly() : null,
      bytes: 8 * n + (dn ? 32 : 16) * E, dense: nT * n * ((mp ? 16 : 0) + (mn ? 16 : 0)) };
    CK._sparseShared.set(key, base);
    return CK._sparseFor(base, false);
  };
  CK._sparseShared = new WeakMap();
  // one mesh's view of a CSR: its own influence buffer, and the vertex-stage function reading both
  CK._sparseFor = (base, shared) => {
    const { nT, E, sP, sN, hasP } = base, sH = base.sH || null, sL = base.sL || null, LS = base.lineSlots || null;
    const inf = new T.StorageBufferAttribute(new Float32Array(nT), 1);
    const sW = S.storage(inf, 'float', nT).toReadOnly();
    // the vertex stage for one material (CK.sparseSetup): the surface's adds the shading deltas to NORMAL and, where the
    // file has hull targets, sums them into the material's ckDH and keeps the morphed normal in ckNM (posedHull reads
    // both); the hull's and the holdout's (their NORMAL is _HULL_NORMAL) add the hull deltas, else NORMAL's as before
    const stage = (mat, hull) => S.Fn(() => {
      const U_ = (mat && mat.userData) || {}, dH = !hull && sH ? U_.ckDH : null, nM = !hull ? U_.ckNM : null;
      const LD = !hull && LS ? U_.ckLD : null;                 // (the keyed line fields' d deltas, summed: a varying)
      const nd = hull ? (sH || sN) : sN;
      // (touch them before the loop, as three's morph does with its base: their lazy initialization from the
      // attributes would otherwise land inside the loop, resetting them every entry and never running for an unmoved vertex)
      if (hasP) S.positionLocal.mulAssign(1.0);
      if (nd) S.normalLocal.mulAssign(1.0);
      if (dH) dH.assign(S.vec3(0.0));
      if (LD) LD.assign(S.vec2(0.0));
      const r = S.attribute('_ck_sp', 'vec2'), a0 = S.uint(r.x), a1 = a0.add(S.uint(r.y));
      S.Loop({ start: a0, end: a1, type: 'uint', condition: '<' }, ({ i }) => {
        const d = sP.element(i), w = sW.element(S.uint(d.w)).toVar();
        if (hasP) S.positionLocal.addAssign(d.xyz.mul(w));
        if (nd) S.normalLocal.addAssign(nd.element(i).xyz.mul(w));
        if (dH) dH.addAssign(sH.element(i).xyz.mul(w));
        if (LD) LD.addAssign((sL ? sL.element(i) : S.vec2(sN.element(i).w, sH ? sH.element(i).w : 0.0)).mul(w));
      });
      if (nM) nM.assign(S.normalLocal);
    }, 'void')();                                               // (void: its call joins the vertex stack, as three's morph)
    const fn = () => stage(null, false);
    // (bytes: the CSR counted once, where it was built; every view adds its influences; dense: what three's texture held)
    return { fn, stage, inf, nT, n: base.n, entries: E, shared, base, bytes: (shared ? 0 : base.bytes) + 4 * nT, dense: base.dense };
  };
  // a sparse mesh's CSR for CPU readers (charstudio's skin.js and ground.js): range (2n: each vertex's first entry and
  // count) and entries (4E: delta x, y, z and the target's packed index, as mesh.morphTargetInfluences and
  // morphTargetDictionary number them), in target order per vertex -> null for a dense mesh (read morphAttributes)
  CK.morphCSR = mesh => { const sp = mesh && mesh.userData && mesh.userData.ckSparse; return sp ? { range: sp.base.range, entries: sp.base.dp } : null; };
  if (typeof location !== 'undefined' && /[?&]dense=1(&|$)/.test(location.search)) CK.SPARSE = false;   // (?dense=1: any page's A/B)
  // ------------------------------------------------------------------------------------------------------- the edit layer
  // A cage edit's preview (docs/CAGE_EDIT.md section 6; tool/cage-edit, 2026-10-19; ws-render's contract): per skin mesh,
  // dense per-vertex position, normal and hull-normal offsets (vec4 storage buffers, w unused, the mesh's own frame),
  // added in the vertex stage after the sparse morphs' sum and before skinning, at weight 1: a rest-space delta exactly
  // as a morph target's. The normal offset goes on normalLocal on the surface's stage (and into ckNM, posedHull's morphed
  // rest normal); the hull offset on the hull's and holdout's normal (their NORMAL is _HULL_NORMAL), into ckDH where the
  // file has hull targets, else the edit's own ckEH / ckEN, so the outlines and posedHull follow the edit.
  // CK.load(ctx, url, { edit: true | fn(name, M, L) }) attaches an all-zero layer to the meshes chosen (true: the skin,
  // CK.editable) before their materials are built, so a drag never compiles a pipeline; the page writes rows with
  // CK.editSet (only those rows uploaded: the attributes' update ranges). No layer: no buffer, no shader code (renders
  // bit-identical). ?edit=0: never attached (A/Bs, as ?dense=1). CPU readers: CK.editRows (beside CK.morphCSR).
  CK.EYE_LAYERS = { iris: -0.4, pupil: -0.3, shadow: -0.2, highlight: -0.1 };   // eye plates' renderOrder: their stack, back to front
  CK.EDIT = !(typeof location !== 'undefined' && /[?&]edit=0(&|$)/.test(location.search));
  CK.editable = name => /_skin$/.test(name || '');           // (the skin; its .bare variant is rom's, not drawn)
  CK.editLayer = mesh => {
    const n = mesh.geometry.attributes.position.count;
    const mk = () => new T.StorageBufferAttribute(new Float32Array(4 * n), 4);
    const aP = mk(), aN = mk(), aH = mk();
    const sP = S.storage(aP, 'vec4', n).toReadOnly(), sN = S.storage(aN, 'vec4', n).toReadOnly(), sH = S.storage(aH, 'vec4', n).toReadOnly();
    // the vertex stage for one material (CK.sparseSetup, after the sparse morphs' stage)
    const stage = (mat, hull) => S.Fn(() => {
      const U_ = (mat && mat.userData) || {}, i = S.vertexIndex;
      S.positionLocal.addAssign(sP.element(i).xyz);
      if (hull) { S.normalLocal.addAssign(sH.element(i).xyz); return; }
      S.normalLocal.addAssign(sN.element(i).xyz);
      if (U_.ckDH) { U_.ckDH.addAssign(sH.element(i).xyz); U_.ckNM.assign(S.normalLocal); }
      else if (U_.ckEH) { U_.ckEH.assign(sH.element(i).xyz); U_.ckEN.assign(S.attribute('normal', 'vec3').add(sN.element(i).xyz)); }
    }, 'void')();
    const ed = { n, aP, aN, aH, dp: aP.array, dn: aN.array, dh: aH.array, stage, bytes: 48 * n, writes: 0 };
    mesh.userData.ckEdit = ed;
    return ed;
  };
  // rows of a mesh's layer: rows (vertex ids, any order) and their values (dp, dn, dh: 4 floats a row, or 3, or null
  // to leave that buffer), each contiguous run uploaded as one update range -> the rows written
  CK.editSet = (mesh, rows, dp = null, dn = null, dh = null) => {
    const ed = mesh && mesh.userData && mesh.userData.ckEdit; if (!ed || !rows || !rows.length) return 0;
    const k = rows.length, st = a => (a ? a.length / k : 0);
    const put = (attr, src) => {
      if (!src) return;
      const A = attr.array, w = st(src);
      for (let j = 0; j < k; j++) { const o = 4 * rows[j], q = w * j; A[o] = src[q]; A[o + 1] = src[q + 1]; A[o + 2] = src[q + 2]; }
      CK._editRanges(attr, rows);
    };
    put(ed.aP, dp); put(ed.aN, dn); put(ed.aH, dh);
    ed.writes++;
    return k;
  };
  // (runs closer than CK.EDIT_GAP rows merged into one range: a drag's rows lie scattered over a primitive, and a
  // writeBuffer per run cost the GPU 32 ms a step on the laptop where one per 512-row gap costs a few)
  CK.EDIT_GAP = 512;
  CK._editRanges = (attr, rows) => {
    const r = Int32Array.from(rows).sort();
    let a = r[0], b = r[0];
    for (let j = 1; j <= r.length; j++) {
      if (j < r.length && r[j] <= b + CK.EDIT_GAP) { b = Math.max(b, r[j]); continue; }
      attr.addUpdateRange(4 * a, 4 * (b - a + 1));
      if (j < r.length) a = b = r[j];
    }
    attr.needsUpdate = true;
  };
  CK.editClear = mesh => {
    const ed = mesh && mesh.userData && mesh.userData.ckEdit; if (!ed) return;
    for (const a of [ed.aP, ed.aN, ed.aH]) { a.array.fill(0); a.clearUpdateRanges(); a.needsUpdate = true; }
  };
  // a mesh's layer for CPU readers (charstudio's skin.js and ground.js: added before skinning, as the GPU does) ->
  // { n, dp, dn, dh } (Float32Array 4n each) or null
  CK.editRows = mesh => { const ed = mesh && mesh.userData && mesh.userData.ckEdit; return ed ? { n: ed.n, dp: ed.dp, dn: ed.dn, dh: ed.dh } : null; };
  // ------------------------------------------------------------------------------------------------------------ live normals
  // A garment's shading normals from its posed surface each frame (CK.live; Michael 2026-10-18, "accepting recs" on
  // garments' romnormals #2 with body-model: garments yes, skin and face keep the export's authored normals). Blender
  // shades an outlined object without custom normals with the normals of its surface as the outline leaves it
  // (charkit.render.normals: the surface moved inward by the view's line, Newell's normals weighted by the corner
  // angle, the export's triangles paired back into quads, the object's primitives welded by position), and linear-blend
  // skinning turns the stored ones with the bones, not with the bent cloth: Sonnet's knit showed its inside at arms_up.
  // The candidates: outlined, no _HULL_NORMAL, not flat or plate (charkit.render.normals.needs_recompute). Per frame, on
  // the GPU: (A) each primitive's posed vertices (the sparse morphs, then the skin, as three does them) moved by the
  // view's surface shift along the posed normal into the object's buffer; (B1) per polygon its normal times each corner's
  // angle; (B2) per vertex the sum over its welded vertex's corners, normalised, into the primitive's normal buffer the
  // material reads (nWorld). On by default (?livenormals=0 off): Sonnet's coat at arms_up 4,538 -> 45 front-face pixels
  // whose normal faced away over the body boards' four views, raise_side_90 1,387 -> 42; Clawd's arms_up 206 -> 162.
  // The passes run only when what they read changed (the bones, the keys' influences, the view's surface shift).
  CK.LIVE_NORMALS = !(typeof location !== 'undefined' && /[?&]livenormals=0\b/.test(location.search));   // (?livenormals=0: the export's)
  const copyAttr = (a, k) => {                                 // (any attribute, interleaved too, as a flat Float32Array)
    const n = a.count, o = new Float32Array(n * k);
    for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) o[i * k + c] = a.getComponent ? a.getComponent(i, c) : [a.getX, a.getY, a.getZ, a.getW][c].call(a, i);
    return o;
  };
  CK.liveCapture = (mesh, g, gm, sp, M) => {
    const n = g.attributes.position.count;
    const pos = copyAttr(g.attributes.position, 3), nrm = copyAttr(g.attributes.normal, 3);
    const n4 = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) { n4[4 * i] = nrm[3 * i]; n4[4 * i + 1] = nrm[3 * i + 1]; n4[4 * i + 2] = nrm[3 * i + 2]; }
    const Nattr = new T.StorageBufferAttribute(n4, 4);       // (the rest normals until the first frame's pass)
    const read = S.storage(Nattr, 'vec4', n).toReadOnly();
    // (built in each material's context; flipped on back faces as three's normalView flips the geometry's: the garments'
    // outer faces are drawn double-sided from their back)
    const normal = () => S.modelNormalMatrix.mul(S.varying(read.element(S.vertexIndex).xyz)).normalize().mul(S.faceDirection);
    const skin = mesh.isSkinnedMesh && g.attributes.skinIndex && g.attributes.skinWeight;
    return { mesh, g, gm, n, pos, nrm, M, sp, Nattr, normal,
      si: skin ? Uint32Array.from(copyAttr(g.attributes.skinIndex, 4)) : null, sw: skin ? copyAttr(g.attributes.skinWeight, 4) : null,
      ow: g.attributes._outline_width ? copyAttr(g.attributes._outline_width, 1) : null,
      index: g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i) };
  };
  // the export's triangles paired back into Blender's quads (charkit.render.normals.quads): consecutive triangles sharing
  // an edge (two welded vertices), greedily -> [polygon vertex lists]
  const liveQuads = (tri, weld) => {
    const nt = tri.length / 3, out = [];
    const W = (t, j) => weld[tri[3 * t + j]];
    const pair = t => {                                        // (t and t + 1 share exactly two welded vertices)
      let sh = 0;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (W(t, a) === W(t + 1, b)) sh++;
      let inT = 0;
      for (let a = 0; a < 3; a++) { let f = false; for (let b = 0; b < 3; b++) if (W(t, a) === W(t + 1, b)) f = true; if (f) inT++; }
      return sh === 2 && inT === 2;
    };
    let t = 0;
    while (t < nt) {
      if (t < nt - 1 && pair(t)) {
        let k = 0;
        for (let a = 0; a < 3; a++) { let f = false; for (let b = 0; b < 3; b++) if (W(t, a) === W(t + 1, b)) f = true; if (!f) k = a; }
        let oy = 0;
        for (let b = 0; b < 3; b++) { let f = false; for (let a = 0; a < 3; a++) if (W(t + 1, b) === W(t, a)) f = true; if (!f) oy = b; }
        const x = j => tri[3 * t + ((k + j) % 3)];
        out.push([x(0), x(1), tri[3 * (t + 1) + oy], x(2)]);
        t += 2;
      } else { out.push([tri[3 * t], tri[3 * t + 1], tri[3 * t + 2]]); t += 1; }
    }
    return out;
  };
  CK.liveBuild = caps => {
    const groups = new Map(), skels = new Map(), passes = { A: [], B1: [], B2: [] };
    for (const c of caps) (groups.get(c.gm) || groups.set(c.gm, []).get(c.gm)).push(c);
    const boneNode = sk => {
      if (!skels.has(sk)) {
        const attr = new T.StorageBufferAttribute(new Float32Array(16 * sk.bones.length), 16);
        skels.set(sk, { sk, attr, node: S.storage(attr, 'mat4', sk.bones.length).toReadOnly() });
      }
      return skels.get(sk).node;
    };
    const out = [];
    for (const [gm, prims] of groups) {
      let N = 0;
      const off = prims.map(c => { const o = N; N += c.n; return o; });
      // (the object's vertices welded by their rest position, across its primitives)
      const keyOf = new Map(), weld = new Int32Array(N);
      prims.forEach((c, pi) => { for (let i = 0; i < c.n; i++) {
        const k = c.pos[3 * i] + ',' + c.pos[3 * i + 1] + ',' + c.pos[3 * i + 2];
        let w = keyOf.get(k); if (w === undefined) { w = keyOf.size; keyOf.set(k, w); }
        weld[off[pi] + i] = w;
      } });
      const nw = keyOf.size;
      const tri = new Uint32Array(prims.reduce((s, c) => s + c.index.length, 0));
      let ti = 0;
      prims.forEach((c, pi) => { for (const v of c.index) tri[ti++] = v + off[pi]; });
      const polys = liveQuads(tri, weld), np = polys.length;
      const polyV = new Uint32Array(4 * np), polyC = new Uint32Array(np);
      polys.forEach((P, q) => { polyC[q] = P.length; for (let j = 0; j < 4; j++) polyV[4 * q + j] = P[j % P.length]; });
      const cnt = new Uint32Array(nw + 1);
      polys.forEach(P => P.forEach(v => cnt[weld[v] + 1]++));
      for (let w = 0; w < nw; w++) cnt[w + 1] += cnt[w];
      const corner = new Uint32Array(cnt[nw]), at = cnt.slice(0, nw);
      polys.forEach((P, q) => P.forEach((v, j) => { corner[at[weld[v]]++] = 4 * q + j; }));
      const st = (arr, k, type) => S.storage(new T.StorageBufferAttribute(arr, k), type, arr.length / k);
      const Pbuf = st(new Float32Array(4 * N), 4, 'vec4'), Ebuf = st(new Float32Array(16 * np), 4, 'vec4');
      const sPolyV = st(polyV, 1, 'uint').toReadOnly(), sPolyC = st(polyC, 1, 'uint').toReadOnly();
      const sPtr = st(cnt, 1, 'uint').toReadOnly(), sCorner = st(corner, 1, 'uint').toReadOnly();
      const shift = S.uniform(0.0);                            // (the view's surface shift: inward(build) - inward(view))
      const M = prims[0].M;
      prims.forEach((c, pi) => {
        const n = c.n, o = off[pi];
        // (a vertex's inputs in one buffer, 4 vec4s: position and outline factor, normal, skin weights, skin joints (exact
        // as floats): a stage's storage buffers are capped at 8 by WebGPU's default limits)
        const vin = new Float32Array(16 * n);
        for (let i = 0; i < n; i++) {
          const q = 16 * i;
          vin[q] = c.pos[3 * i]; vin[q + 1] = c.pos[3 * i + 1]; vin[q + 2] = c.pos[3 * i + 2]; vin[q + 3] = c.ow ? c.ow[i] : 1;
          vin[q + 4] = c.nrm[3 * i]; vin[q + 5] = c.nrm[3 * i + 1]; vin[q + 6] = c.nrm[3 * i + 2];
          if (c.si) for (let k = 0; k < 4; k++) { vin[q + 8 + k] = c.sw[4 * i + k]; vin[q + 12 + k] = c.si[4 * i + k]; }
        }
        const sV = st(vin, 4, 'vec4').toReadOnly();
        const bones = c.si ? boneNode(c.mesh.skeleton) : null;
        const bind = c.si ? S.uniform(c.mesh.bindMatrix) : null, bindInv = c.si ? S.uniform(c.mesh.bindMatrixInverse) : null;
        const sp = c.sp;
        const sRange = sp ? st(sp.base.range, 2, 'vec2').toReadOnly() : null;
        const sW = sp ? S.storage(sp.inf, 'float', sp.nT).toReadOnly() : null;
        passes.A.push(S.Fn(() => {
          const i = S.instanceIndex;
          S.If(i.lessThan(S.uint(n)), () => {
            const v0 = sV.element(i.mul(4)), p = v0.xyz.toVar(), nn = sV.element(i.mul(4).add(1)).xyz.toVar();
            if (sp) {
              const r = sRange.element(i), a0 = S.uint(r.x), a1 = a0.add(S.uint(r.y));
              S.Loop({ start: a0, end: a1, type: 'uint', condition: '<' }, ({ i: k }) => {
                const d = sp.base.sP.element(k), w = sW.element(S.uint(d.w)).toVar();
                if (sp.base.hasP) p.addAssign(d.xyz.mul(w));
                if (sp.base.sN) nn.addAssign(sp.base.sN.element(k).xyz.mul(w));
              });
            }
            if (bones) {
              const sw = sV.element(i.mul(4).add(2)), sf = sV.element(i.mul(4).add(3));
              const si = S.uvec4(S.uint(sf.x), S.uint(sf.y), S.uint(sf.z), S.uint(sf.w));
              const B = bones.element(si.x).mul(sw.x).add(bones.element(si.y).mul(sw.y)).add(bones.element(si.z).mul(sw.z)).add(bones.element(si.w).mul(sw.w));
              const Mf = bindInv.mul(B).mul(bind).toVar();
              p.assign(Mf.mul(S.vec4(p, 1.0)).xyz);
              nn.assign(Mf.element(0).xyz.mul(nn.x).add(Mf.element(1).xyz.mul(nn.y)).add(Mf.element(2).xyz.mul(nn.z)));
            }
            const ow = v0.w;
            Pbuf.element(S.uint(o).add(i)).assign(S.vec4(p.add(S.normalize(nn).mul(shift.mul(ow))), 1.0));
          });
        })().compute(n));
      });
      passes.B1.push(S.Fn(() => {
        const q = S.instanceIndex;
        S.If(q.lessThan(S.uint(np)), () => {
          const b = q.mul(4), quad = sPolyC.element(q).equal(S.uint(4));
          const V = [0, 1, 2, 3].map(j => Pbuf.element(sPolyV.element(b.add(j))).xyz.toVar());
          const fn = S.cross(V[0], V[1]).add(S.cross(V[1], V[2])).add(S.select(quad, S.cross(V[2], V[3]).add(S.cross(V[3], V[0])), S.cross(V[2], V[0]))).toVar();
          fn.divAssign(S.max(S.length(fn), 1e-30));
          const ang = (u, v) => S.atan(S.length(S.cross(u, v)), S.dot(u, v));
          const prev0 = S.select(quad, V[3], V[2]), next2 = S.select(quad, V[3], V[0]);
          Ebuf.element(b).assign(S.vec4(fn.mul(ang(V[1].sub(V[0]), prev0.sub(V[0]))), 0.0));
          Ebuf.element(b.add(1)).assign(S.vec4(fn.mul(ang(V[2].sub(V[1]), V[0].sub(V[1]))), 0.0));
          Ebuf.element(b.add(2)).assign(S.vec4(fn.mul(ang(next2.sub(V[2]), V[1].sub(V[2]))), 0.0));
          Ebuf.element(b.add(3)).assign(S.select(quad, S.vec4(fn.mul(ang(V[0].sub(V[3]), V[2].sub(V[3]))), 0.0), S.vec4(0.0)));
        });
      })().compute(np));
      prims.forEach((c, pi) => {
        const n = c.n, o = off[pi];
        const sWeld = st(Uint32Array.from(weld.subarray(o, o + n)), 1, 'uint').toReadOnly();
        const Nw = S.storage(c.Nattr, 'vec4', n);
        passes.B2.push(S.Fn(() => {
          const i = S.instanceIndex;
          S.If(i.lessThan(S.uint(n)), () => {
            const w = sWeld.element(i), acc = S.vec3(0.0).toVar();
            S.Loop({ start: sPtr.element(w), end: sPtr.element(w.add(1)), type: 'uint', condition: '<' }, ({ i: k }) => {
              acc.addAssign(Ebuf.element(sCorner.element(k)).xyz);
            });
            Nw.element(i).assign(S.vec4(acc.div(S.max(S.length(acc), 1e-30)), 0.0));
          });
        })().compute(n));
      });
      out.push({ gm, M, shift, prims: prims.length, vertices: N, welded: nw, polygons: np });
    }
    return { groups: out, caps, skels: [...skels.values()], passes: [...passes.A, ...passes.B1, ...passes.B2] };
  };
  const sameArr = (a, b) => { if (!b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  CK.liveUpdate = (ck, r, scene) => {
    const L = ck.live;
    if (scene) scene.updateMatrixWorld();                   // (the bones' world matrices as the render will see them:
    let changed = !L.done;                                   //  it updates them after)
    for (const s of L.skels) {
      s.sk.update();
      if (!sameArr(s.sk.boneMatrices, s.attr.array)) { s.attr.array.set(s.sk.boneMatrices); s.attr.needsUpdate = true; changed = true; }
    }
    for (const c of L.caps) if (c.sp) {
      const a = c.sp.inf.array;
      if (!sameArr(a, c.infLast)) { c.infLast = Float32Array.from(a); changed = true; }
    }
    const ls = U.lineScreen.value;
    for (const G of L.groups) {                              // (CK.surfacePosition's surfaceShift, in numbers)
      const O = G.M.outline, inward = w => (O.maxInward ? Math.min(w, O.maxInward) : w);
      const view = ls > 1e-9 ? ls * (O.regionFactor || 1) : O.width;
      const v = inward(O.width) - inward(view);
      if (G.shift.value !== v) { G.shift.value = v; changed = true; }
    }
    if (changed) { r.compute(L.passes); L.done = true; L.runs = (L.runs || 0) + 1; }
  };
  CK.syncSparse = mesh => {
    const sp = mesh.userData.ckSparse, src = mesh.morphTargetInfluences, dst = sp.inf.array;
    let changed = false;
    for (let i = 0; i < sp.nT; i++) { const v = src[i] || 0; if (dst[i] !== v) { dst[i] = v; changed = true; } }
    if (changed) sp.inf.needsUpdate = true;
  };
  // every material that draws a sparse mesh (its own, its hull's and holdout's, the shadow pass's depth materials): the
  // morph added before three's own skinning and position node (NodeMaterial.setupPosition's order)
  const baseSetupPosition = T.NodeMaterial.prototype.setupPosition;
  CK.sparseSetup = function (builder) {
    const sp = builder.object && builder.object.userData && builder.object.userData.ckSparse;
    if (sp) sp.stage(this, !!(this.userData && this.userData.ckHullMat));
    const ed = builder.object && builder.object.userData && builder.object.userData.ckEdit;   // (the edit layer: CK.editLayer)
    if (ed) ed.stage(this, !!(this.userData && this.userData.ckHullMat));
    return baseSetupPosition.call(this, builder);
  };
  // (a material three may share its compiled state through (an override material takes the source's position node,
  // and its cache key reads node ids): each sparse mesh's materials get their own position node, an identity)
  CK.sparseMaterial = m => { m.setupPosition = CK.sparseSetup; if (!m.positionNode) m.positionNode = S.positionLocal.add(S.vec3(0.0)); return m; };
  CK.packMorphs = mesh => {
    const cm = mesh.userData.ckMorph;
    for (let j = 0; j < cm.keep.length; j++) cm.physical[j] = cm.logical[cm.keep[j]];
    mesh.morphTargetInfluences = cm.physical;
    for (const c of cm.clones) { c.morphTargetInfluences = cm.physical; c.morphTargetDictionary = mesh.morphTargetDictionary; }
  };
  // the morph targets read from the file straight into the sparse layout (2026-10-17): the export writes them as sparse
  // accessors (only the vertices a key moves), which three's GLTFLoader expands to a full array per target (the face-round
  // build: 114 MB in the file, 1.27 GB expanded) for CK.sparseMorphs to pack back. With the sparse path on, TargetsPlugin
  // moves each primitive's targets aside before the loader reads its meshes, CK.load gives each mesh its influences and
  // dictionary as the loader would, and CK.sparseFromFile builds the same CSR (the same entries in the same order: the
  // targets that move anything, then per vertex those moving it, a position or normal delta not zero) from the
  // accessors' own index and value lists. ?loadertargets=1 keeps the loader's path (A/Bs).
  CK.FILE_TARGETS = !(typeof location !== 'undefined' && /[?&]loadertargets=1\b/.test(location.search));
  class TargetsPlugin {
    constructor(parser) { this.parser = parser; this.name = 'CK_morph_targets'; }
    beforeRoot() {
      const out = {};
      (this.parser.json.meshes || []).forEach((m, gm) => m.primitives.forEach((p, pi) => {
        if (p.targets && p.targets.length) { (out[gm] = out[gm] || {})[pi] = p.targets; delete p.targets; }
      }));
      this.parser.ckTargets = out;
    }
  }
  // an accessor's VEC3 float data -> {idx (its sparse indices, ascending; null: every vertex), val (3 per)}, or null (empty)
  const fileVec3 = (js, body, i) => fileVecN(js, body, i, 3);
  // (one component of a float VEC2-4 accessor -> {idx, val (1 per)}: a keyed line field's d, x of _LINE_<NAME>)
  const fileComp = (js, body, i, c) => {
    if (i === undefined) return null;
    const n = { VEC2: 2, VEC3: 3, VEC4: 4 }[js.accessors[i].type];
    if (!n) throw new Error('look.js: a line target accessor not float VEC2-4 (#' + i + ')');
    const F = fileVecN(js, body, i, n);
    if (!F) return null;
    const m = F.val.length / n, val = new Float32Array(m);
    for (let k = 0; k < m; k++) val[k] = F.val[n * k + c];
    return { idx: F.idx, val };
  };
  const fileVecN = (js, body, i, N) => {
    if (i === undefined) return null;
    const a = js.accessors[i], TY = { 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' }[N];
    if (a.componentType !== 5126 || a.type !== TY) throw new Error('look.js: a morph target accessor not float ' + TY + ' (#' + i + ')');
    const view = (bvI, off, C, len) => {
      const bv = js.bufferViews[bvI], o = (bv.byteOffset || 0) + (off || 0);
      return o % C.BYTES_PER_ELEMENT ? new C(body.slice(o, o + len * C.BYTES_PER_ELEMENT)) : new C(body, o, len);
    };
    let base = null;
    if (a.bufferView !== undefined) {
      const bv = js.bufferViews[a.bufferView];
      if (bv.byteStride && bv.byteStride !== 4 * N) throw new Error('look.js: a strided morph target (#' + i + ')');
      base = view(a.bufferView, a.byteOffset, Float32Array, N * a.count);
    }
    if (a.sparse && a.sparse.count > 0) {
      const sp = a.sparse, C = { 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[sp.indices.componentType];
      const idx = view(sp.indices.bufferView, sp.indices.byteOffset, C, sp.count);
      const val = view(sp.values.bufferView, sp.values.byteOffset, Float32Array, N * sp.count);
      if (!base) return { idx, val };
      const full = base.slice();
      for (let k = 0; k < sp.count; k++) for (let j = 0; j < N; j++) full[N * idx[k] + j] = val[N * k + j];
      return { idx: null, val: full };
    }
    return base ? { idx: null, val: base } : null;
  };
  CK._sparseFile = new Map();
  // a mesh's targets (the file's, TargetsPlugin's) -> { cm (CK.compactMorphs' bookkeeping, or null), sp (CK._sparseFor's
  // view, or null: nothing moves) }; the mesh's influences already set (CK.load)
  CK.sparseFromFile = (mesh, targets, js, body) => {
    const g = mesh.geometry, n = g.attributes.position.count;
    const keep = [];
    targets.forEach((t, i) => { if (Object.values(t).some(a => !emptyAccessor(js, a))) keep.push(i); });
    let cm = null;
    if (keep.length < targets.length) {                       // (as CK.compactMorphs: the packed set outside ck.update)
      const logicalDict = mesh.morphTargetDictionary || {}, dict = {};
      for (const [k, i] of Object.entries(logicalDict)) { const j = keep.indexOf(i); if (j >= 0) dict[k] = j; }
      cm = { keep, total: targets.length, logical: mesh.morphTargetInfluences, logicalDict, physical: new Array(keep.length).fill(0), clones: [] };
      mesh.morphTargetDictionary = dict; mesh.morphTargetInfluences = cm.physical;
    }
    g.morphTargetsRelative = true;
    const nT = keep.length;
    if (!nT) return { cm, sp: null };
    const hasP = keep.some(i => targets[i].POSITION !== undefined), hasN = keep.some(i => targets[i].NORMAL !== undefined);
    // (_HULL_NORMAL targets: the outline's direction's own deltas, beside a skin's shading-normal NORMAL ones (ws-body's
    // skin-normals round, 2026-10-18); a file without them keeps NORMAL as the hull's deltas, as before)
    const hasH = !CK.NO_HULL_TARGETS && keep.some(i => targets[i]._HULL_NORMAL !== undefined);   // (?nohulltargets=1: A/Bs)
    // (keyed line fields, CK.LINE_SETS: a target's _LINE_<NAME> carries the set's d delta in x (the field recomputed on
    // the key's shape, less the rest's: an opened mouth's cavity, its teeth and tongue). Two sets a mesh: they ride the
    // normal and the hull entries' spare w (no memory), or, without those, a vec2 an entry of their own)
    const LN = [...new Set(keep.flatMap(i => Object.keys(targets[i]).filter(k => /^_LINE_./.test(k))))].sort();
    if (LN.length > 2) console.warn('look.js: keyed line fields past two a mesh, dropped:', LN.slice(2).join(', '));
    LN.length = Math.min(LN.length, 2);
    const key = keep.map(i => (targets[i].POSITION ?? -1) + ':' + (targets[i].NORMAL ?? -1) + ':' + (targets[i]._HULL_NORMAL ?? -1)
      + LN.map(k => ':' + (targets[i][k] ?? -1)).join('')).join(',') + '|' + n;
    const shared = CK._sparseFile.get(key);
    if (shared) { g.setAttribute('_ck_sp', shared.rangeAttr); return { cm, sp: CK._sparseFor(shared, true) }; }
    // each target's entries in vertex order: the union of its position and normal lists, kept where either delta isn't
    // zero, merged once into typed arrays (vertex, position slot, normal slot; -1 none)
    const M = keep.map(i => {
      const P = fileVec3(js, body, targets[i].POSITION), N = fileVec3(js, body, targets[i].NORMAL);
      const Hh = fileVec3(js, body, targets[i]._HULL_NORMAL);
      const pn = P ? (P.idx ? P.idx.length : n) : 0, nn = N ? (N.idx ? N.idx.length : n) : 0, hn = Hh ? (Hh.idx ? Hh.idx.length : n) : 0;
      const pi_ = P && P.idx, ni_ = N && N.idx, hi_ = Hh && Hh.idx, pv = P && P.val, nv = N && N.val, hv = Hh && Hh.val;
      const Ls = LN.map(k => fileComp(js, body, targets[i][k], 0)), ln = Ls.map(F => F ? (F.idx ? F.idx.length : n) : 0);
      const tot = pn + nn + hn + ln.reduce((x, y) => x + y, 0);
      const V = new Int32Array(tot), A = new Int32Array(tot), B = new Int32Array(tot), Cc = new Int32Array(tot);
      const D = Ls.map(() => new Int32Array(tot)), lc = Ls.map(() => 0);
      const nz = (x, k) => k >= 0 && (x[3 * k] !== 0 || x[3 * k + 1] !== 0 || x[3 * k + 2] !== 0);
      let a = 0, b = 0, c = 0, m = 0;
      const lv = j => lc[j] < ln[j] ? (Ls[j].idx ? Ls[j].idx[lc[j]] : lc[j]) : 0x7fffffff, anyL = Ls.length > 0;
      while (a < pn || b < nn || c < hn || (anyL && lc.some((x, j) => x < ln[j]))) {
        const va = a < pn ? (pi_ ? pi_[a] : a) : 0x7fffffff, vb = b < nn ? (ni_ ? ni_[b] : b) : 0x7fffffff;
        const vc = c < hn ? (hi_ ? hi_[c] : c) : 0x7fffffff;
        let v = Math.min(va, vb, vc);
        for (let j = 0; j < Ls.length; j++) v = Math.min(v, lv(j));
        const ka = va === v ? a++ : -1, kb = vb === v ? b++ : -1, kc = vc === v ? c++ : -1;
        let line = false;
        for (let j = 0; j < Ls.length; j++) { const kd = lv(j) === v ? lc[j]++ : -1; D[j][m] = kd; if (kd >= 0 && Ls[j].val[kd] !== 0) line = true; }
        if (nz(pv, ka) || nz(nv, kb) || nz(hv, kc) || line) { V[m] = v; A[m] = ka; B[m] = kb; Cc[m] = kc; m++; }
      }
      return { V, A, B, C: Cc, D, m, pv, nv, hv, lval: Ls.map(F => F && F.val) };
    });
    const cnt = new Uint32Array(n);
    for (const t of M) for (let k = 0; k < t.m; k++) cnt[t.V[k]]++;
    const off = new Uint32Array(n + 1);
    for (let v = 0; v < n; v++) off[v + 1] = off[v] + cnt[v];
    const E = off[n];
    if (!E) return { cm, sp: null };
    const dp = new Float32Array(E * 4), dn = hasN ? new Float32Array(E * 4) : null, dh = hasH ? new Float32Array(E * 4) : null;
    const spare = LN.length > 0 && hasN && (LN.length < 2 || hasH), dl = LN.length && !spare ? new Float32Array(E * 2) : null;
    const lw = spare ? [dn, dh] : null;
    const at = off.slice(0, n);
    for (let t = 0; t < nT; t++) {
      const { V, A, B, C: Cc, D, m, pv, nv, hv, lval } = M[t];
      for (let k = 0; k < m; k++) {
        const e = at[V[k]]++, q = 4 * e, ka = A[k], kb = B[k], kc = Cc[k];
        if (dh && kc >= 0) { dh[q] = hv[3 * kc]; dh[q + 1] = hv[3 * kc + 1]; dh[q + 2] = hv[3 * kc + 2]; }
        if (ka >= 0) { dp[q] = pv[3 * ka]; dp[q + 1] = pv[3 * ka + 1]; dp[q + 2] = pv[3 * ka + 2]; }
        dp[q + 3] = t;                                        // (the target's packed index rides in w)
        if (dn && kb >= 0) { dn[q] = nv[3 * kb]; dn[q + 1] = nv[3 * kb + 1]; dn[q + 2] = nv[3 * kb + 2]; }
        for (let j = 0; j < LN.length; j++) {                 // (the line fields' d deltas: the spare w, or their own)
          const kd = D[j][k]; if (kd < 0) continue;
          if (lw) lw[j][q + 3] = lval[j][kd]; else dl[2 * e + j] = lval[j][kd];
        }
      }
    }
    const range = new Float32Array(2 * n);
    for (let v = 0; v < n; v++) { range[2 * v] = off[v]; range[2 * v + 1] = off[v + 1] - off[v]; }
    const rangeAttr = new T.BufferAttribute(range, 2);
    g.setAttribute('_ck_sp', rangeAttr);
    const base = { nT, n, E, hasP, rangeAttr, range, dp,
      sP: S.storage(new T.StorageBufferAttribute(dp, 4), 'vec4', E).toReadOnly(),
      sN: dn ? S.storage(new T.StorageBufferAttribute(dn, 4), 'vec4', E).toReadOnly() : null,
      sH: dh ? S.storage(new T.StorageBufferAttribute(dh, 4), 'vec4', E).toReadOnly() : null,
      sL: dl ? S.storage(new T.StorageBufferAttribute(dl, 2), 'vec2', E).toReadOnly() : null,
      lineSlots: LN.length ? Object.fromEntries(LN.map((k, j) => [k.slice(6).toLowerCase(), j])) : null, lineSpare: spare,
      bytes: 8 * n + (dn ? 32 : 16) * E + (dh ? 16 * E : 0) + (dl ? 8 * E : 0), dense: nT * n * ((hasP ? 16 : 0) + (hasN ? 16 : 0)) };
    CK._sparseFile.set(key, base);
    return { cm, sp: CK._sparseFor(base, false) };
  };

  // ------------------------------------------------------------------------------------------------ the skeleton
  // our skeleton runtime (ROADMAP decision 6; ws-render's loadout B1): the humanoid's normalized rig and the node
  // constraints, read from the file's VRMC_vrm and VRMC_node_constraint, in place of three-vrm's VRMHumanoid and
  // VRMNodeConstraintManager. The formulas are three-vrm 3.5.5's (VRMHumanoidRig, VRMRoll/Aim/RotationConstraint; the
  // VRM 1.0 spec's, as charkit.rigspec's Python evaluator), so a pose plays the same; the objects keep three-vrm's API
  // (getNormalizedBoneNode, getRawBoneNode, resetNormalizedPose, update; constraints.update), so the pages that call
  // vrm.humanoid run on ours once CK.load installs it (CK.OWN_RIG; ?ownrig=0 keeps three-vrm's). CK.rigParity measures
  // the two against each other.
  const VRM_PARENT = (() => {
    const P = { hips: null, spine: 'hips', chest: 'spine', upperChest: 'chest', neck: 'upperChest', head: 'neck', leftEye: 'head',
      rightEye: 'head', jaw: 'head' };
    for (const s of ['left', 'right']) {
      const chain = ([a, ...rest], p) => { P[s + a] = p; let q = s + a; for (const b of rest) { P[s + b] = q; q = s + b; } };
      chain(['UpperLeg', 'LowerLeg', 'Foot', 'Toes'], 'hips'); chain(['Shoulder', 'UpperArm', 'LowerArm', 'Hand'], 'upperChest');
      chain(['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'], s + 'Hand');
      for (const f of ['Index', 'Middle', 'Ring', 'Little']) chain([f + 'Proximal', f + 'Intermediate', f + 'Distal'], s + 'Hand');
    }
    return P;
  })();
  CK.VRM_BONES = Object.keys(VRM_PARENT);                  // (parents before children)
  // gltf (GLTFLoader's result) -> { humanoid, constraints } or null (no VRMC_vrm 1.0 humanoid). Built at load, before
  // anything poses: the rest is the file's.
  CK.Skeleton = (gltf) => {
    const js = gltf.parser.json, V = js.extensions && js.extensions.VRMC_vrm;
    if (!V || !V.humanoid || !V.humanoid.humanBones) return null;
    const nodeOf = new Map();
    gltf.scene.traverse(o => { const a = gltf.parser.associations.get(o); if (a && a.nodes !== undefined && !nodeOf.has(a.nodes)) nodeOf.set(a.nodes, o); });
    const raw = {};                                         // (every bone the file names, as three-vrm keeps them)
    for (const [b, hb] of Object.entries(V.humanoid.humanBones)) { const n = nodeOf.get(hb.node); if (n) raw[b] = n; }
    if (!raw.hips) return null;
    // the normalized rig: a node per humanoid bone at its rest world offset from its nearest humanoid ancestor, rest
    // rotations identity; update() turns each raw bone by its normalized node's rotation re-expressed in the raw parent's
    // rest world frame, and places the hips where the normalized hips are
    gltf.scene.updateMatrixWorld(true);
    const root = new T.Object3D(); root.name = 'CKHumanoidRig';
    const norm = {}, rest = {}, pw = {}, wp = {}, tmp = new T.Vector3();
    for (const b of CK.VRM_BONES) {
      const n = raw[b]; if (!n) continue;
      n.updateWorldMatrix(true, false);
      wp[b] = new T.Vector3().setFromMatrixPosition(n.matrixWorld);
      rest[b] = n.quaternion.clone();
      pw[b] = new T.Quaternion(); if (n.parent) n.parent.matrixWorld.decompose(tmp, pw[b], new T.Vector3());
    }
    for (const b of CK.VRM_BONES) {
      if (!raw[b]) continue;
      let p = VRM_PARENT[b]; while (p && !raw[p]) p = VRM_PARENT[p];
      const o = new T.Object3D(); o.name = 'Normalized_' + raw[b].name;
      (p ? norm[p] : root).add(o);
      o.position.copy(wp[b]); if (p) o.position.sub(wp[p]);
      norm[b] = o;
    }
    gltf.scene.add(root);
    const normRest = Object.fromEntries(Object.entries(norm).map(([b, o]) => [b, o.position.clone()]));
    const rawRest = Object.fromEntries(Object.entries(raw).map(([b, n]) => [b, [n.position.clone(), n.quaternion.clone()]]));
    const qA = new T.Quaternion(), hipsW = new T.Vector3(), M = new T.Matrix4();
    const humanoid = {
      normalizedHumanBonesRoot: root, autoUpdateHumanBones: true,
      rawHumanBones: Object.fromEntries(Object.entries(raw).map(([b, node]) => [b, { node }])),
      normalizedHumanBones: Object.fromEntries(Object.entries(norm).map(([b, node]) => [b, { node }])),
      getRawBoneNode: b => raw[b] || null,
      getNormalizedBoneNode: b => norm[b] || null,
      getBoneNode: b => raw[b] || null,                     // (three-vrm's deprecated name)
      resetNormalizedPose: () => { for (const [b, o] of Object.entries(norm)) { o.position.copy(normRest[b]); o.quaternion.identity(); o.scale.set(1, 1, 1); } },
      resetRawPose: () => { for (const [b, [p, q]] of Object.entries(rawRest)) { raw[b].position.copy(p); raw[b].quaternion.copy(q); } },
      update: () => {
        for (const b of CK.VRM_BONES) {
          const n = raw[b], o = norm[b]; if (!n) continue;
          n.quaternion.copy(o.quaternion).multiply(pw[b]).premultiply(qA.copy(pw[b]).invert()).multiply(rest[b]);
          if (b === 'hips') {
            o.getWorldPosition(hipsW);
            n.parent.updateWorldMatrix(true, false);
            n.position.copy(hipsW.applyMatrix4(M.copy(n.parent.matrixWorld).invert()));
          }
        }
      },
    };
    humanoid.humanBones = humanoid.rawHumanBones;
    // the node constraints (VRMC_node_constraint 1.0): roll, aim, rotation, each slerped from the destination's rest by its
    // weight; run in the file's node order, each after the constraints on its dependencies and their ancestors (three-vrm's
    // VRMNodeConstraintManager), a cycle an error
    const AX = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1], PositiveX: [1, 0, 0], NegativeX: [-1, 0, 0], PositiveY: [0, 1, 0],
      NegativeY: [0, -1, 0], PositiveZ: [0, 0, 1], NegativeZ: [0, 0, -1] };
    const cons = [], byDst = new Map();
    const q1 = new T.Quaternion(), q2 = new T.Quaternion(), q3 = new T.Quaternion(), v1 = new T.Vector3(), v2 = new T.Vector3(), v3 = new T.Vector3();
    (js.nodes || []).forEach((nd, i) => {
      const C = nd.extensions && nd.extensions.VRMC_node_constraint && nd.extensions.VRMC_node_constraint.constraint;
      const dst = nodeOf.get(i); if (!C || !dst) return;
      const kind = C.roll ? 'roll' : C.aim ? 'aim' : C.rotation ? 'rotation' : null; if (!kind) return;
      const c0 = C[kind], src = nodeOf.get(c0.source); if (!src) return;
      const c = { kind, dst, src, weight: c0.weight ?? 1, axis: new T.Vector3(...AX[kind === 'roll' ? (c0.rollAxis || 'X') : (c0.aimAxis || 'PositiveX')] || [1, 0, 0]),
        dstRest: dst.quaternion.clone(), invDstRest: dst.quaternion.clone().invert(), invSrcRest: src.quaternion.clone().invert() };
      c.invSrcRestDstRest = c.invSrcRest.clone().multiply(c.dstRest);
      c.deps = kind === 'aim' && dst.parent ? [src, dst.parent] : [src];
      cons.push(c); if (!byDst.has(dst)) byDst.set(dst, []); byDst.get(dst).push(c);
    });
    const step = c => {
      const d = c.dst;
      if (c.kind === 'rotation') {
        q2.copy(c.dstRest).multiply(q1.copy(c.invSrcRest).multiply(c.src.quaternion));
      } else if (c.kind === 'roll') {
        const delta = q1.copy(c.invDstRest).multiply(c.src.quaternion).multiply(c.invSrcRestDstRest);
        const n1 = v1.copy(c.axis).applyQuaternion(delta);
        q2.setFromUnitVectors(n1, c.axis).premultiply(c.dstRest).multiply(delta);
      } else {
        d.updateWorldMatrix(true, false); c.src.updateWorldMatrix(true, false);
        const pW = q1.identity(), ipW = q3.identity();
        if (d.parent) { d.parent.matrixWorld.decompose(v3, pW, v2); ipW.copy(pW).invert(); }
        const a0 = v1.copy(c.axis).applyQuaternion(c.dstRest).applyQuaternion(pW);
        const a1 = v2.setFromMatrixPosition(c.src.matrixWorld).sub(v3.setFromMatrixPosition(d.matrixWorld)).normalize();
        q2.setFromUnitVectors(a0, a1).premultiply(ipW).multiply(pW).multiply(c.dstRest);
      }
      d.quaternion.copy(c.dstRest).slerp(q2, c.weight);
    };
    const constraints = {
      constraints: new Set(cons),
      update: () => {
        const tried = new Set(), done = new Set();
        const run = c => {
          if (done.has(c)) return;
          if (tried.has(c)) throw new Error('CK.Skeleton: a cycle among the node constraints');
          tried.add(c);
          for (const dep of c.deps) { const chain = []; for (let o = dep; o; o = o.parent) chain.unshift(o); for (const o of chain) for (const dc of byDst.get(o) || []) run(dc); }
          step(c); done.add(c);
        };
        for (const c of cons) run(c);
      },
    };
    return { humanoid, constraints, nodeOf };
  };
  // our spring bones (the loadout's B2): VRMC_springBone 1.0 (springs of joints, sphere / capsule colliders, the extended
  // colliders' inside and plane shapes, a spring's center) read from the file, stepped with three-vrm 3.5.5's formulas
  // (VRMSpringBoneJoint, VRMSpringBoneManager's order: each joint after the joints on its parent and colliders), so a
  // run plays the same. Each joint's state is its bone's rotation and two tail points; snapshot() / restore() copy it,
  // so a clip played in clip time (ck.performClip) jumps back exactly. The bones keep three's matrixAutoUpdate (three-vrm
  // turns it off and writes their matrices itself: a restore had to rebuild them). CK.springParity measures the two.
  // A spring with CHARKIT_springBone_drag {frame: 'head', dragForce} (ws-body's soft masses, charkit.bodyd.softmass.vrm)
  // drags its tails on their velocity relative to the bone's head, not the world's: VRM's drag on a soft spring trails a
  // walking body (a damped bust 7.4 mm back and 10.4 mm out into its limit; relative, 0.3 and 0.6: ws-body's bench). The
  // joints' own dragForce (0.05) is what a runtime without the extension plays.
  CK.Springs = (gltf, nodeOf) => {
    const js = gltf.parser.json, X = js.extensions && js.extensions.VRMC_springBone;
    if (!X || !X.springs) return null;
    const v3 = a => new T.Vector3().fromArray(a || [0, 0, 0]);
    const colliders = (X.colliders || []).map(c => {
      const node = nodeOf.get(c.node); if (!node) return null;
      const ex = c.extensions && c.extensions.VRMC_springBone_extended_collider;
      const S = (ex && ex.specVersion === '1.0' && ex.shape) || c.shape || {};
      const kind = S.sphere ? 'sphere' : S.capsule ? 'capsule' : S.plane ? 'plane' : null; if (!kind) return null;
      const s = S[kind];
      return { node, kind, offset: v3(s.offset), tail: v3(s.tail), normal: v3(s.normal || [0, 0, 1]), radius: s.radius || 0,
        inside: !!(ex && s.inside), matrix: new T.Matrix4() };
    });
    const groups = (X.colliderGroups || []).map(g => (g.colliders || []).map(i => colliders[i]).filter(Boolean));
    const joints = [];
    for (const sp of X.springs) {
      const cg = (sp.colliderGroups || []).map(i => groups[i]).filter(Boolean), center = sp.center != null ? nodeOf.get(sp.center) || null : null;
      const dx = (sp.extensions || {}).CHARKIT_springBone_drag, rel = !!(dx && dx.frame === 'head');
      for (let i = 0; i + 1 < sp.joints.length; i++) {
        const J = sp.joints[i], bone = nodeOf.get(J.node), child = nodeOf.get(sp.joints[i + 1].node) || null;
        if (!bone) continue;
        joints.push({ bone, child, center, colliders: cg.flat(), hitRadius: J.hitRadius ?? 0, stiffness: J.stiffness ?? 1,
          gravityPower: J.gravityPower ?? 0, gravityDir: J.gravityDir ? v3(J.gravityDir) : new T.Vector3(0, -1, 0),
          dragForce: rel ? dx.dragForce : J.dragForce ?? 0.4, relHead: rel, _prevHead: new T.Vector3(), _hasHead: false,
          _currentTail: new T.Vector3(), _prevTail: new T.Vector3(), boneAxis: new T.Vector3(), length: 0,
          initLocal: new T.Matrix4(), initRot: new T.Quaternion(), initChild: new T.Vector3() });
      }
    }
    // the order: each joint after the joints on its bone's ancestors and on its colliders' nodes' ancestors
    const byBone = new Map(); for (const j of joints) { if (!byBone.has(j.bone)) byBone.set(j.bone, []); byBone.get(j.bone).push(j); }
    const order = [], tried = new Set(), done = new Set();
    const visit = j => {
      if (done.has(j) || tried.has(j)) return; tried.add(j);
      const deps = [j.bone.parent, ...j.colliders.map(c => c.node)].filter(Boolean);
      for (const d of deps) { const chain = []; for (let o = d; o; o = o.parent) chain.unshift(o); for (const o of chain) for (const k of byBone.get(o) || []) visit(k); }
      order.push(j); done.add(j);
    };
    for (const j of joints) visit(j);
    const I4 = new T.Matrix4(), A = new T.Vector3(), B = new T.Vector3(), P = new T.Vector3(), N = new T.Vector3(), M = new T.Matrix4(), M3 = new T.Matrix3();
    const parentW = j => j.bone.parent ? j.bone.parent.matrixWorld : I4;
    const centerW = j => j.center ? j.center.matrixWorld : I4;
    const toCenter = j => j.center ? M.copy(j.center.matrixWorld).invert() : I4;
    const colliderMatrix = c => {
      const e = c.node.matrixWorld.elements, o = c.offset; c.matrix.copy(c.node.matrixWorld);
      c.matrix.elements[12] = e[0] * o.x + e[4] * o.y + e[8] * o.z + e[12];
      c.matrix.elements[13] = e[1] * o.x + e[5] * o.y + e[9] * o.z + e[13];
      c.matrix.elements[14] = e[2] * o.x + e[6] * o.y + e[10] * o.z + e[14];
      return c.matrix;
    };
    // a collider's signed distance to a sphere at p (radius r) and its push direction (into dir)
    const collide = (c, m, p, r, dir) => {
      if (c.kind === 'plane') {
        dir.setFromMatrixPosition(m).negate().add(p);
        N.copy(c.normal).applyNormalMatrix(M3.getNormalMatrix(m)).normalize();
        const d = dir.dot(N) - r; dir.copy(N); return d;
      }
      A.setFromMatrixPosition(m);
      if (c.kind === 'capsule') {
        B.subVectors(c.tail, c.offset).applyMatrix4(m).sub(A);
        const L2 = B.lengthSq(); dir.copy(p).sub(A); const dot = B.dot(dir);
        if (dot <= 0) { /* the head's end */ } else if (L2 <= dot) dir.sub(B); else dir.sub(B.multiplyScalar(dot / L2));
      } else dir.subVectors(p, A);
      const len = dir.length(), d = c.inside ? c.radius - r - len : len - r - c.radius;
      if (d < 0) { dir.multiplyScalar(1 / len); if (c.inside) dir.negate(); }
      return d;
    };
    const tail = new T.Vector3(), wpos = new T.Vector3(), axis = new T.Vector3(), push = new T.Vector3();
    const place = j => { j.bone.updateMatrix(); j.bone.matrixWorld.multiplyMatrices(parentW(j), j.bone.matrix); };
    const S = {
      joints: new Set(joints), order, hits: 0,                // (hits: collisions resolved, a count for checks)
      setInitState: () => {
        for (const j of order) {
          j.bone.updateMatrix(); j.bone.updateWorldMatrix(false, false);
          j.initLocal.copy(j.bone.matrix); j.initRot.copy(j.bone.quaternion);
          if (j.child) j.initChild.copy(j.child.position); else j.initChild.copy(j.bone.position).normalize().multiplyScalar(0.07);
          j.bone.localToWorld(j._currentTail.copy(j.initChild)).applyMatrix4(toCenter(j));
          j._prevTail.copy(j._currentTail); j.boneAxis.copy(j.initChild).normalize(); j._hasHead = false;
        }
      },
      reset: () => {
        for (const j of order) {
          j.bone.updateMatrix(); j.bone.updateWorldMatrix(false, false);
          j.bone.quaternion.copy(j.initRot); place(j);
          j.bone.localToWorld(j._currentTail.copy(j.initChild)).applyMatrix4(toCenter(j));
          j._prevTail.copy(j._currentTail); j._hasHead = false;
        }
      },
      // one step of dt seconds; the skeleton's world matrices current
      update: dt => {
        if (!(dt > 0)) return;
        for (const j of order) {
          j.bone.updateMatrix(); j.bone.updateWorldMatrix(false, false);
          wpos.setFromMatrixPosition(j.bone.matrixWorld);
          if (j.child) j.length = wpos.distanceTo(B.setFromMatrixPosition(j.child.matrixWorld));
          else j.length = wpos.distanceTo(B.copy(j.initChild).applyMatrix4(j.bone.matrixWorld));
          axis.copy(j.boneAxis).transformDirection(j.initLocal).transformDirection(parentW(j));
          tail.copy(j._currentTail).add(A.subVectors(j._currentTail, j._prevTail).multiplyScalar(1 - j.dragForce));
          if (j.relHead) {                                    // (the drag relative to the head: its own step kept)
            P.copy(wpos).applyMatrix4(toCenter(j));
            if (j._hasHead) tail.addScaledVector(A.subVectors(P, j._prevHead), j.dragForce);
            j._prevHead.copy(P); j._hasHead = true;
          }
          tail.applyMatrix4(centerW(j)).addScaledVector(axis, j.stiffness * dt).addScaledVector(j.gravityDir, j.gravityPower * dt);
          tail.sub(wpos).normalize().multiplyScalar(j.length).add(wpos);
          for (const c of j.colliders) {
            const d = collide(c, colliderMatrix(c), tail, j.hitRadius, push);
            if (d < 0) { tail.addScaledVector(push, -d).sub(wpos); tail.multiplyScalar(j.length / tail.length()).add(wpos); S.hits++; }
          }
          j._prevTail.copy(j._currentTail); j._currentTail.copy(tail).applyMatrix4(toCenter(j));
          const inv = M.multiplyMatrices(parentW(j), j.initLocal).invert();
          j.bone.quaternion.setFromUnitVectors(j.boneAxis, A.copy(tail).applyMatrix4(inv).normalize()).premultiply(j.initRot);
          place(j);
          // (what hangs under the bone, down to the next joint, follows before that joint reads it)
          const follow = o => { for (const ch of o.children) { if (byBone.has(ch)) continue; ch.updateWorldMatrix(false, false); follow(ch); } };
          follow(j.bone);
        }
      },
      snapshot: () => order.map(j => [j.bone.quaternion.clone(), j._currentTail.clone(), j._prevTail.clone(), j._prevHead.clone(), j._hasHead]),
      restore: s => { order.forEach((j, i) => { j.bone.quaternion.copy(s[i][0]); j._currentTail.copy(s[i][1]); j._prevTail.copy(s[i][2]);
        j._prevHead.copy(s[i][3]); j._hasHead = s[i][4]; }); },
    };
    S.setInitState();
    return S;
  };
  // our expressions and lookAt (VRMC_vrm 1.0's expressions and lookAt), after three-vrm 3.5.5's VRMExpressionManager and
  // VRMLookAtExpressionApplier: a weight per expression (0..1; binary ones count 1 over 0.5), the blink, lookAt and mouth
  // groups scaled by what the others override ('block': off while one shows; 'blend': by its weight), each morph bind
  // adding weight x its own into its node's primitives' influences (cleared first); the material colour and texture
  // transform binds aren't drawn (they target MToon materials: look.js draws its own). The lookAt (charkit exports type
  // 'expression') maps yaw and pitch (deg) through its range maps onto lookLeft / Right / Up / Down.
  const PRESETS = new Set(['happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh', 'blink', 'blinkLeft',
    'blinkRight', 'lookUp', 'lookDown', 'lookLeft', 'lookRight', 'neutral']);
  CK.Expressions = (gltf, nodeOf) => {
    const js = gltf.parser.json, V = js.extensions && js.extensions.VRMC_vrm;
    if (!V) return null;
    const X = V.expressions || {}, list = [], map = {};
    const prims = i => {                                   // (a node's primitives: its mesh's, as three-vrm finds them)
      const nd = (js.nodes || [])[i], node = nodeOf.get(i);
      if (!nd || nd.mesh == null || !node) return [];
      const n = js.meshes[nd.mesh].primitives.length, out = [];
      node.traverse(o => { if (out.length < n && o.isMesh) out.push(o); });
      return out;
    };
    const add = (name, e) => {
      const binds = [];
      for (const b of e.morphTargetBinds || []) {
        if (b.node === undefined || b.index === undefined) continue;
        const P = prims(b.node);
        if (!P.every(m => Array.isArray(m.morphTargetInfluences) && b.index < m.morphTargetInfluences.length)) continue;
        binds.push({ prims: P, index: b.index, weight: b.weight ?? 1 });
      }
      const ex = { expressionName: name, weight: 0, isBinary: !!e.isBinary, overrideBlink: e.overrideBlink || 'none',
        overrideLookAt: e.overrideLookAt || 'none', overrideMouth: e.overrideMouth || 'none', binds };
      list.push(ex); map[name] = ex;
    };
    for (const [name, e] of Object.entries(X.preset || {})) if (PRESETS.has(name)) add(name, e);
    for (const [name, e] of Object.entries(X.custom || {})) if (!PRESETS.has(name)) add(name, e);
    const out = ex => ex.isBinary ? (ex.weight > 0.5 ? 1 : 0) : ex.weight;
    const over = (mode, ex) => mode === 'block' ? (out(ex) > 0 ? 1 : 0) : mode === 'blend' ? out(ex) : 0;
    const E = {
      blinkExpressionNames: ['blink', 'blinkLeft', 'blinkRight'], lookAtExpressionNames: ['lookLeft', 'lookRight', 'lookUp', 'lookDown'],
      mouthExpressionNames: ['aa', 'ee', 'ih', 'oh', 'ou'],
      get expressions() { return list.concat(); }, get expressionMap() { return Object.assign({}, map); },
      getExpression: n => map[n] || null,
      getValue: n => (map[n] ? map[n].weight : null),
      setValue: (n, w) => { if (map[n]) map[n].weight = Math.min(1, Math.max(0, w)); },
      resetValues: () => { for (const ex of list) ex.weight = 0; },
      update: () => {
        let blink = 1, look = 1, mouth = 1;
        for (const ex of list) { blink -= over(ex.overrideBlink, ex); look -= over(ex.overrideLookAt, ex); mouth -= over(ex.overrideMouth, ex); }
        blink = Math.max(0, blink); look = Math.max(0, look); mouth = Math.max(0, mouth);
        for (const ex of list) for (const b of ex.binds) for (const m of b.prims) if (m.morphTargetInfluences && m.morphTargetInfluences[b.index] != null) m.morphTargetInfluences[b.index] = 0;
        for (const ex of list) {
          let k = 1; const n = ex.expressionName;
          if (E.blinkExpressionNames.includes(n)) k *= blink;
          if (E.lookAtExpressionNames.includes(n)) k *= look;
          if (E.mouthExpressionNames.includes(n)) k *= mouth;
          let w = out(ex) * k;
          if (ex.isBinary && w < 1) w = 0;
          for (const b of ex.binds) for (const m of b.prims) if (m.morphTargetInfluences && m.morphTargetInfluences[b.index] != null) m.morphTargetInfluences[b.index] += b.weight * w;
        }
      },
    };
    const LA = V.lookAt || {}, rng = r => ({ inputMaxValue: (r && r.inputMaxValue) ?? 90, outputScale: (r && r.outputScale) ?? 1 });
    const map01 = (r, x) => r.outputScale * Math.min(1, Math.max(0, x / r.inputMaxValue));
    const R = { hOuter: rng(LA.rangeMapHorizontalOuter), vDown: rng(LA.rangeMapVerticalDown), vUp: rng(LA.rangeMapVerticalUp) };
    const lookAt = (LA.type || 'expression') !== 'expression' ? null : {
      autoUpdate: false, offsetFromHeadBone: LA.offsetFromHeadBone || [0, 0, 0], humanoid: null,
      applier: { applyYawPitch: (yaw, pitch) => {
        if (pitch < 0) { E.setValue('lookDown', 0); E.setValue('lookUp', map01(R.vUp, -pitch)); }
        else { E.setValue('lookUp', 0); E.setValue('lookDown', map01(R.vDown, pitch)); }
        if (yaw < 0) { E.setValue('lookLeft', 0); E.setValue('lookRight', map01(R.hOuter, -yaw)); }
        else { E.setValue('lookRight', 0); E.setValue('lookLeft', map01(R.hOuter, yaw)); }
      } },
      update: () => {},
    };
    return { expressionManager: E, lookAt, meta: Object.assign({ metaVersion: '1' }, V.meta || {}) };
  };
  // the expressions against three-vrm's: n rounds of random weights on every expression (a few at a time, as faces mix)
  // through both managers -> the largest difference of any morph influence they write. Needs ?vrmparity=1 (three-vrm
  // parsed beside ours)
  CK.expressionParity = (ck, n = 30, seed = 3) => {
    const S = ck.skeleton; if (!S || !S.vrmExpressions || !S.expressions) return null;
    const A = S.vrmExpressions, B = S.expressions.expressionManager, names = B.expressions.map(e => e.expressionName);
    let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const meshes = ck.meshes.filter(m => m.morphTargetInfluences);
    const snap = () => meshes.map(m => Array.from(m.morphTargetInfluences));
    let maxAbs = 0, nonzero = 0;
    for (let f = 0; f < n; f++) {
      const w = Object.fromEntries(names.filter(() => rnd() < 0.08).map(k => [k, rnd()]));
      for (const M of [A, B]) { M.resetValues(); for (const [k, v] of Object.entries(w)) M.setValue(k, v); }
      for (const m of meshes) m.morphTargetInfluences.fill(0); A.update(); const a = snap();
      for (const m of meshes) m.morphTargetInfluences.fill(0); B.update(); const b = snap();
      a.forEach((x, i) => x.forEach((v, j) => { const d = Math.abs(v - b[i][j]); if (d > maxAbs) maxAbs = d; if (v) nonzero++; }));
    }
    for (const M of [A, B]) M.resetValues();
    return { rounds: n, expressions: names.length, meshes: meshes.length, influencesSet: nonzero, maxAbs };
  };
  CK.OWN_RIG = !/[?&]ownrig=0\b/.test((typeof location !== 'undefined' && location.search) || '');
  CK.VRM_PARITY = /[?&]vrmparity=1\b/.test((typeof location !== 'undefined' && location.search) || '');   // (three-vrm parsed too: the parity checks)
  // the two spring runtimes against each other: n steps of dt under a swinging pose (the head turned up to 60 degrees,
  // the spine bent 25, the hips moved 8 cm, at about 1 Hz), from rest, three-vrm's then ours -> {steps, joints, quat (the
  // largest difference of any bone rotation's component), tail (of any tail point, m), replay (ours restored at step
  // n/2 and stepped again to n: the largest difference from the first run)}. The installed runtime is left reset.
  CK.springParity = (ck, n = 120, dt = 1 / 60) => {
    const S = ck.skeleton; if (!S || !S.springs || !S.vrmSprings) return null;
    const H = ck.vrm.humanoid, vrm = ck.vrm;
    const drive = i => {
      const t = i * dt, ax = (x, y, z, d) => new T.Quaternion().setFromAxisAngle(new T.Vector3(x, y, z).normalize(), d * Math.PI / 180);
      H.resetNormalizedPose();
      const q = { head: ax(0, 1, 0.3, 60 * Math.sin(2 * Math.PI * 1.1 * t)), neck: ax(1, 0, 0, 20 * Math.sin(2 * Math.PI * 0.9 * t)),
        spine: ax(0.3, 0, 1, 25 * Math.sin(2 * Math.PI * 0.7 * t)), chest: ax(0, 1, 0, 20 * Math.sin(2 * Math.PI * 1.3 * t)) };
      for (const [b, r] of Object.entries(q)) { const o = H.getNormalizedBoneNode(b); if (o) o.quaternion.copy(r); }
      H.getNormalizedBoneNode('hips').position.add(new T.Vector3(0.08 * Math.sin(2 * Math.PI * 0.8 * t), 0.03 * Math.sin(2 * Math.PI * 1.6 * t), 0));
      ck.settle();
    };
    const run = (M, from = 0, to = n, keep = null) => {
      if (from === 0) { drive(0); M.reset(); }
      const out = [];
      for (let i = from + 1; i <= to; i++) {
        drive(i); M.update(dt);
        out.push([...M.joints].map(j => [j.bone.quaternion.toArray(), j._currentTail.toArray()]));
        if (keep && i === keep.at) keep.snap = M.snapshot();
      }
      return out;
    };
    const diff = (A, B) => { let q = 0, t = 0; A.forEach((f, i) => f.forEach(([qa, ta], j) => { const [qb, tb] = B[i][j];
      for (let k = 0; k < 4; k++) q = Math.max(q, Math.abs(qa[k] - qb[k])); for (let k = 0; k < 3; k++) t = Math.max(t, Math.abs(ta[k] - tb[k])); })); return [q, t]; };
    const A = run(S.vrmSprings), keep = { at: n >> 1 }; S.springs.hits = 0;
    const B = run(S.springs, 0, n, keep), hits = S.springs.hits;
    const [q, t] = diff(A, B);
    let moved = 0; const J = [...S.springs.joints];       // (the largest turn of any joint from its rest, degrees)
    for (const f of B) f.forEach(([qa], j) => { moved = Math.max(moved, 2 * Math.acos(Math.min(1, Math.abs(new T.Quaternion().fromArray(qa).dot(J[j].initRot)))) * 180 / Math.PI); });
    S.springs.restore(keep.snap); const R = run(S.springs, keep.at, n), [rq, rt] = diff(B.slice(keep.at), R);
    H.resetNormalizedPose(); ck.settle(); S.springs.reset();
    return { steps: n, joints: S.springs.joints.size, quat: q, tail: t, replay: Math.max(rq, rt), moved, hits };
  };
  // the two skeleton runtimes against each other over n random poses (every humanoid bone turned up to `deg` about a
  // random axis, the hips moved up to 10 cm): each node's world matrix after the humanoid and the constraints, three-vrm's
  // and ours -> {frames, nodes, maxAbs (the largest difference of any matrix element), worst (that node)}. The installed
  // runtime is left at its rest pose.
  CK.rigParity = (ck, n = 40, deg = 70, seed = 1) => {
    const S = ck.skeleton; if (!S || !S.vrmHumanoid) return null;
    const vrm = ck.vrm, skip = new Set();
    for (const r of [S.humanoid.normalizedHumanBonesRoot, S.vrmHumanoid.normalizedHumanBonesRoot]) if (r) r.traverse(o => skip.add(o));
    const nodes = []; vrm.scene.traverse(o => { if (!skip.has(o) && !o.isMesh && !o.isLight && !o.isCamera) nodes.push(o); });
    let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const bones = CK.VRM_BONES.filter(b => S.humanoid.getNormalizedBoneNode(b) && S.vrmHumanoid.getNormalizedBoneNode(b));
    let maxAbs = 0, worst = null;
    for (let f = 0; f < n; f++) {
      const pose = bones.map(b => { const ax = new T.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(); return [b, new T.Quaternion().setFromAxisAngle(ax, (rnd() * 2 - 1) * deg * Math.PI / 180)]; });
      const dh = new T.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.2);
      const run = (H, C) => {
        H.resetNormalizedPose();
        for (const [b, q] of pose) H.getNormalizedBoneNode(b).quaternion.copy(q);
        H.getNormalizedBoneNode('hips').position.add(dh);
        H.update(); vrm.scene.updateMatrixWorld(true);
        if (C) { C.update(); vrm.scene.updateMatrixWorld(true); }
        return nodes.map(o => o.matrixWorld.elements.slice());
      };
      const A = run(S.vrmHumanoid, S.vrmConstraints), B = run(S.humanoid, S.constraints);
      for (let i = 0; i < nodes.length; i++) for (let k = 0; k < 16; k++) { const d = Math.abs(A[i][k] - B[i][k]); if (d > maxAbs) { maxAbs = d; worst = nodes[i].name; } }
    }
    vrm.humanoid.resetNormalizedPose(); vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true);
    if (vrm.nodeConstraintManager) { vrm.nodeConstraintManager.update(); vrm.scene.updateMatrixWorld(true); }
    return { frames: n, nodes: nodes.length, bones: bones.length, constraints: S.constraints.constraints.size, maxAbs, worst };
  };

  // ------------------------------------------------------------------------------------------------ loading
  // a stand-in for three-vrm's MToon plugin: the MToon fallbacks are for other viewers; we build our own materials
  const noMToon = parser => ({ name: 'VRMC_materials_mtoon', beforeRoot: async () => {}, afterRoot: async () => {},
    getMaterialType: () => null, extendMaterialParams: async () => {}, loadMesh: i => parser.loadMesh(i) });

  class LookPlugin {
    constructor(parser) { this.parser = parser; this.name = EXT; }
    async afterRoot(gltf) {
      const js = this.parser.json, want = new Set();
      [js, ...(js.materials || []), ...(js.meshes || [])].forEach(o => {
        const x = o.extensions;
        if (x && EXT_OLD in x) { if (!(EXT in x)) x[EXT] = x[EXT_OLD]; delete x[EXT_OLD]; } });
      const walk = o => { if (o && typeof o === 'object') { if ('index' in o && 'texCoord' in o) want.add(o.index); Object.values(o).forEach(walk); } };
      (js.materials || []).forEach(m => walk(m.extensions && m.extensions[EXT]));
      const tex = {};
      for (const i of want) tex[i] = await this.parser.getDependency('texture', i);
      gltf.userData.charkit = { root: (js.extensions || {})[EXT] || {}, tex,
        materials: (js.materials || []).map(m => (m.extensions || {})[EXT] || null),
        meshes: (js.meshes || []).map(m => (m.extensions || {})[EXT] || {}) };
    }
  }

  // a mesh's float streams in one interleaved buffer when it has more than WebGPU's 8 vertex buffers' worth (a pipeline
  // takes one buffer per stream; past 8 it fails and only the outline's hull draws: head D's face and body D's skin
  // came out the outline's brown, charstudio 2026-10-15). Position and the studio's _ck_dbg (rewritten live) stay
  // their own; the values don't change, so the picture doesn't either.
  CK.packAttributes = g => {
    const names = Object.keys(g.attributes);
    if (names.length <= 8) return false;
    const take = names.filter(n => n !== 'position' && n !== '_ck_dbg' && !g.attributes[n].isInterleavedBufferAttribute &&
      g.attributes[n].array instanceof Float32Array && !g.attributes[n].normalized && g.attributes[n].array.length === g.attributes[n].count * g.attributes[n].itemSize);
    if (take.length < 2) return false;
    const n = g.attributes.position.count, offs = {};
    let stride = 0;
    for (const k of take) { offs[k] = stride; stride += g.attributes[k].itemSize; }
    const arr = new Float32Array(n * stride);
    for (const k of take) {
      const a = g.attributes[k], s = a.itemSize, src = a.array, o = offs[k];
      for (let i = 0; i < n; i++) for (let c = 0; c < s; c++) arr[i * stride + o + c] = src[i * s + c];
    }
    const ib = new T.InterleavedBuffer(arr, stride);
    for (const k of take) g.setAttribute(k, new T.InterleavedBufferAttribute(ib, g.attributes[k].itemSize, offs[k], false));
    return true;
  };

  // (share: identical materials, the hull's and the holdout's too, shared across meshes and across loads (a studio's
  // reload of a rebuilt export compiles nothing it compiled before: three keeps a material's node build and pipeline);
  // a material that reads a texture stays the load's own. Off by default: shared materials sort differently among
  // equal depths, and the boards stay as they were)
  CK.shared = CK.shared || new Map();
  const readsTexture = o => { let t = false; const walk = x => { if (t || !x || typeof x !== 'object') return; if ('index' in x && 'texCoord' in x) { t = true; return; } Object.values(x).forEach(walk); }; walk(o); return t; };
  const sharedOr = (key, make) => { let m = CK.shared.get(key); if (!m) { m = make(); m.userData.ckShared = true; CK.shared.set(key, m); } return m; };
  CK.load = async (ctx, url, { onProgress, studio = false, share = false, edit = false } = {}) => {
    const t0 = performance.now(), LMS = {};                  // (ck.loadMs: where the load's time goes, by phase)
    const lap = (k, t) => { LMS[k] = (LMS[k] || 0) + performance.now() - t; };
    const loader = new T.GLTFLoader();
    // (three-vrm parses the file only for ?ownrig=0 or the parity checks, ?vrmparity=1: our runtime reads the rest)
    const viaVRM = !CK.OWN_RIG || CK.VRM_PARITY;
    if (viaVRM) loader.register(parser => new T.VRM.VRMLoaderPlugin(parser, { mtoonMaterialPlugin: noMToon(parser) }));
    // (the morph targets read from the file into the sparse layout, not expanded by the loader: TargetsPlugin; three-vrm's
    // expressions read the loader's morph data, so not beside it)
    const sparseOK0 = CK.SPARSE !== false && !!(ctx.renderer.backend && ctx.renderer.backend.isWebGPUBackend);
    const fileTargets = sparseOK0 && CK.FILE_TARGETS && !viaVRM;
    if (fileTargets) loader.register(parser => new TargetsPlugin(parser));
    loader.register(parser => new LookPlugin(parser));
    let tq = performance.now();
    const gltf = await loader.loadAsync(url, onProgress);
    lap('gltf', tq);
    const fileT = fileTargets ? (gltf.parser.ckTargets || {}) : null;
    if (fileT) {
      const jsT = gltf.parser.json;
      for (const [gm, ps] of Object.entries(fileT)) for (const [pi, t] of Object.entries(ps)) jsT.meshes[gm].primitives[pi].targets = t;
      gltf.scene.traverse(o => {
        const a = o.isMesh && gltf.parser.associations.get(o);
        const t = a && a.meshes !== undefined && fileT[a.meshes] && fileT[a.meshes][a.primitives || 0];
        if (!t) return;
        const md = jsT.meshes[a.meshes], names = (md.extras && md.extras.targetNames) || [];
        o.morphTargetInfluences = t.map((_, i) => (md.weights && md.weights[i]) || 0);
        o.morphTargetDictionary = Object.fromEntries(t.map((_, i) => [names[i] !== undefined ? names[i] : String(i), i]));
      });
    }
    if (CK.LOOKLIB === undefined && /[?&]nostrands=1\b/.test((typeof location !== 'undefined' && location.search) || '')) CK.LOOKLIB = null;   // (?nostrands=1: A/Bs)
    CK.REST_HULL = /[?&]resthull=1\b/.test((typeof location !== 'undefined' && location.search) || '');   // (posedHull's A/B)
    CK.NO_HULL_TARGETS = /[?&]nohulltargets=1\b/.test((typeof location !== 'undefined' && location.search) || '');
    // the hulls' depth offset (CK.hullMaterial), m: ?hullz=X sets it, ?hullz=0 turns it off (A/Bs)
    CK.HULL_Z = (m => (m ? parseFloat(m[1]) : 0.002))(((typeof location !== 'undefined' && location.search) || '').match(/[?&]hullz=([0-9.]+)/));
    // where screen lines and the camera key measure the character from (ck.headAnchor): the posed head ('posed'), or
    // ?headanchor=rest the rest head's centre as before 2026-10-19 (A/Bs; the lines grew 4x by 13 m of a walk)
    CK.HEAD_ANCHOR = /[?&]headanchor=rest/.test((typeof location !== 'undefined' && location.search) || '') ? 'rest' : 'posed';
    if (CK.LOOKLIB === undefined) {                          // (the look's shared WGSL: the strands; once per page)
      try { CK.LOOKLIB = LOOK_SRC ? await (await fetch(new URL('looklib.wgsl', LOOK_SRC))).text() : null; } catch (e) { CK.LOOKLIB = null; }
      if (!CK.LOOKLIB) console.warn('look.js: looklib.wgsl not found beside look.js: the hair draws without its strands');
    }
    const info = gltf.userData.charkit, js = gltf.parser.json, assoc = gltf.parser.associations;
    if (!(js.extensions && js.extensions.VRMC_vrm) || !info) throw new Error(url + ': not a charkit VRM (no VRMC_vrm or ' + EXT + ')');
    // the VRM: three-vrm's when it parsed the file, else ours (scene, humanoid, constraints, springs, expressions, lookAt)
    const vrm = gltf.userData.vrm || { scene: gltf.scene, update(dt = 0) {
      this.humanoid.update(); if (this.lookAt) this.lookAt.update(dt); if (this.expressionManager) this.expressionManager.update();
      this.scene.updateMatrixWorld(true); if (this.nodeConstraintManager) this.nodeConstraintManager.update();
      if (this.springBoneManager) this.springBoneManager.update(dt); } };
    // our skeleton runtime in place of three-vrm's humanoid and constraints (CK.Skeleton; three-vrm's kept for
    // CK.rigParity); the lookAt reads the humanoid too
    const skeleton = CK.Skeleton(gltf);
    if (skeleton) {
      skeleton.vrmHumanoid = vrm.humanoid; skeleton.vrmConstraints = vrm.nodeConstraintManager || null;
      skeleton.springs = CK.Springs(gltf, skeleton.nodeOf); skeleton.vrmSprings = vrm.springBoneManager || null;
      skeleton.expressions = CK.Expressions(gltf, skeleton.nodeOf); skeleton.vrmExpressions = vrm.expressionManager || null;
      if (CK.OWN_RIG) {
        vrm.humanoid = skeleton.humanoid; vrm.nodeConstraintManager = skeleton.constraints;
        if (skeleton.expressions) {
          vrm.expressionManager = skeleton.expressions.expressionManager; vrm.lookAt = skeleton.expressions.lookAt;
          if (vrm.lookAt) vrm.lookAt.humanoid = skeleton.humanoid;
          if (!vrm.meta) vrm.meta = skeleton.expressions.meta;
        }
        if (skeleton.springs) {                             // (three-vrm's joints turned their bones' matrixAutoUpdate off)
          if (skeleton.vrmSprings) for (const j of skeleton.vrmSprings.joints) j.bone.matrixAutoUpdate = true;
          vrm.springBoneManager = skeleton.springs;
        }
        if (vrm.lookAt) { vrm.lookAt.humanoid = skeleton.humanoid; if (vrm.lookAt.applier && 'humanoid' in vrm.lookAt.applier) vrm.lookAt.applier.humanoid = skeleton.humanoid; }
      }
    }
    // texture colour spaces: colour maps sRGB, data maps linear
    const data = new Set();
    for (const L of info.materials) if (L && L.face) for (const k of ['sdf', 'fringe']) if (L.face[k]) data.add(L.face[k].index);
    for (const L of info.materials) if (L && L.shadow && L.shadow.texture) data.add(L.shadow.texture.index);   // (body D's small forms)
    for (const [i, t] of Object.entries(info.tex)) {
      t.colorSpace = data.has(+i) ? T.NoColorSpace : T.SRGBColorSpace;
      t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter;
      t.anisotropy = 8; t.needsUpdate = true;
    }
    const ck = { vrm, gltf, url, skeleton, root: info.root, scene: vrm.scene, parts: {}, meshes: [], hulls: [], holdouts: [], features: [],
      materials: [], keyIndex: {}, bindPose: info.root.bindPose || {}, compacted: [], sparse: [], edited: [],
      morphStats: { targets: 0, kept: 0, sparseBytes: 0, denseBytes: 0 } };
    // (sparse morphs on WebGPU; a sparse mesh's materials are its own even when the load shares the rest (one compiled
    // state per material: its CSR binds there); the studio's CPU readers take CK.morphCSR)
    const sparseOK = CK.SPARSE !== false && !!(ctx.renderer.backend && ctx.renderer.backend.isWebGPUBackend);
    const CU = ck.charUniforms = share ? (CK.sharedCU = CK.sharedCU || CK.charUniforms()) : CK.charUniforms();
    CU.gate.value.set(...CK.headGate(info.root.head));
    // the file's drawn layers (CHARKIT_look.layers: as ck.addLayers takes them, a texture as {index} into the file's images)
    ck.layers = (info.root.layers || []).map(LY => Object.assign({}, LY, { texture: LY.texture && typeof LY.texture.index === 'number' ? info.tex[LY.texture.index] : null })).map(LY => Object.assign(LY, { u: CK.layerUniforms(LY) }));
    const meshes = [], liveCaps = [];
    vrm.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const mesh of meshes) {
      const a = assoc.get(mesh);
      if (!a || a.meshes === undefined) continue;
      const gm = a.meshes, pi = a.primitives || 0;
      const prim = js.meshes[gm].primitives[pi];
      let L = info.materials[prim.material] || { kind: 'flat', color: [0.8, 0.8, 0.8], doubleSided: true };
      if (L.kind === 'face' && info.root.head) L = Object.assign({}, L, { head: info.root.head });   // (dread's ramp)
      // (a primitive's own CHARKIT_look over its mesh's: the lining's outline, charkit/lining.py outline_of)
      const PX = (prim.extensions || {})[EXT];
      const M = PX ? Object.assign({}, info.meshes[gm] || {}, PX) : (info.meshes[gm] || {});
      const name = M.object || js.meshes[gm].name;
      const g = mesh.geometry;
      const ft = fileT && fileT[gm] && fileT[gm][pi];
      let cm = null, sp = null;
      tq = performance.now();
      if (ft) ({ cm, sp } = CK.sparseFromFile(mesh, ft, js, gltf.parser.extensions.KHR_binary_glTF.body));   // (the file's targets)
      else cm = CK.compactMorphs(mesh, prim, js);
      lap(ft ? 'sparse' : 'compact', tq);
      if (prim.targets) { ck.morphStats.targets += prim.targets.length; ck.morphStats.kept += cm ? cm.keep.length : prim.targets.length; }
      if (cm) { mesh.userData.ckMorph = cm; ck.compacted.push(mesh); }
      tq = performance.now();
      if (!ft) sp = sparseOK ? CK.sparseMorphs(mesh) : null;            // (the dense arrays go: three never builds its texture)
      lap('sparse', tq);
      if (sp) { mesh.userData.ckSparse = sp; g.morphAttributes = {}; ck.sparse.push(mesh); ck.morphStats.sparseBytes += sp.bytes; ck.morphStats.denseBytes += sp.dense; }
      // (the edit layer, all zero: CK.editLayer; WebGPU's storage buffers, as the sparse morphs')
      const ed = edit && CK.EDIT && sparseOK && (typeof edit === 'function' ? edit(name, M, L) : CK.editable(name)) ? CK.editLayer(mesh) : null;
      if (ed) ck.edited.push(mesh);
      // (studio: a per-vertex value the page writes, read by the 'heat' view: zeros until it does)
      if (studio && !g.attributes._ck_dbg) g.setAttribute('_ck_dbg', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      // (live normals, CK.live: a garment's shading normals from its posed surface each frame; its arrays taken here,
      // before CK.packAttributes interleaves them)
      const liveCand = !!(M.outline && !g.attributes._hull_normal && L.kind !== 'flat' && L.kind !== 'plate');
      const live = liveCand && CK.LIVE_NORMALS && sparseOK ? CK.liveCapture(mesh, g, gm, sp, M) : null;
      if (live) liveCaps.push(live);
      CK.packAttributes(g);
      const attrs = { uv0: !!g.attributes.uv, uv1: !!g.attributes.uv1, faceMask: !!g.attributes._face_mask, liveCand, live: !!live, hullT: !!(sp && sp.base && sp.base.sH), edit: !!ed,
        outlineW: !!g.attributes._outline_width, hullN: !!g.attributes._hull_normal,
        cast: !!g.attributes._ck_cast0, dbg: !!g.attributes._ck_dbg, shade: !!g.attributes._ck_shade, flushW: !!g.attributes._flush_w,
        mouthUV: !!g.attributes._mouth_uv, lineSets: CK.lineSetsOf(g), lineKeyed: (sp && sp.base && sp.base.lineSlots) || null, tangent: !!g.attributes.tangent, strand: !!g.attributes._ck_strand,
        curv: !!g.attributes._ck_curv, env: !!g.attributes._ck_env };
      if (M.outline) {                                       // the region's screen-line factor (the surface and hull read it)
        const R = info.root.lines;
        M.outline.regionFactor = (R && R.regions && R.regions[M.outline.region]) || 1;
      }
      const shareIt = share && !readsTexture(L) && !sp && !ed;
      const LYs = CK.layersFor(ck.layers, L);
      LIVE_N = live ? live.normal : null;
      mesh.material = shareIt && !LYs.length && !live ? sharedOr('s|' + JSON.stringify([L, M.outline || null, attrs]), () => CK.material(L, M, info.tex, attrs, CU)) : CK.material(L, M, info.tex, attrs, CU, LYs);
      LIVE_N = null;
      mesh.userData.ckBuild = { L, M, attrs };                // (for rebuilds: ck.addLayers)
      // (an eye's layer plates draw in their stack's order, iris to highlight, whatever the view: painted layers on one
      // surface, 0.075 mm apart (charkit.headd.eye layer_gap); sorted by distance, past profile the camera stands behind
      // the outward-turned plates and the iris painted over the pupil and highlights: Clawd at 90 deg the pupil 393 ->
      // 0 px over 2 deg, ws-body's eyes-qa relay. Below 0, so the lashes and other see-through parts still draw after)
      if (L.eye && CK.EYE_LAYERS[L.eye.layer] !== undefined) mesh.renderOrder = CK.EYE_LAYERS[L.eye.layer];
      mesh.frustumCulled = false;
      mesh.userData.ck = { name, look: L, mesh: M, prim: pi, attrs };
      if (sp || ed) CK.sparseMaterial(mesh.material);
      ck.materials.push(mesh.material);
      (ck.parts[name] = ck.parts[name] || { name, meshes: [], hulls: [], holdouts: [], look: M, visible: true }).meshes.push(mesh);
      ck.meshes.push(mesh);
      if (M.feature) { mesh.layers.enable(CK.LAYER.feature); ck.features.push(mesh); }
      // (the self-shadow's occluders: the head, closed, by its back faces; the hair's thin shells by both sides)
      if (L.kind === 'face') mesh.layers.enable(CK.LAYER.shadow);
      else if (L.kind === 'hair' || /^hair/.test(L.role || '')) mesh.layers.enable(CK.LAYER.shadowThin);
      const clone = (geom, mat, layer) => {
        const c = mesh.isSkinnedMesh ? new T.SkinnedMesh(geom, mat) : new T.Mesh(geom, mat);
        if (mesh.isSkinnedMesh) { c.bind(mesh.skeleton, mesh.bindMatrix); c.bindMode = mesh.bindMode; }
        c.position.copy(mesh.position); c.quaternion.copy(mesh.quaternion); c.scale.copy(mesh.scale);
        if (mesh.morphTargetInfluences) { c.morphTargetInfluences = mesh.morphTargetInfluences; c.morphTargetDictionary = mesh.morphTargetDictionary; }
        if (mesh.userData.ckMorph) mesh.userData.ckMorph.clones.push(c);
        if (mesh.userData.ckSparse) { c.userData.ckSparse = mesh.userData.ckSparse; CK.sparseMaterial(mat); }
        if (mesh.userData.ckEdit) { c.userData.ckEdit = mesh.userData.ckEdit; CK.sparseMaterial(mat); }
        c.frustumCulled = false; c.layers.set(layer);
        mesh.parent.add(c);
        return c;
      };
      let hg = g;
      if (M.outline && attrs.hullN) {                        // the hull extrudes along its own normals
        hg = new T.BufferGeometry();
        for (const [k, v] of Object.entries(g.attributes)) hg.setAttribute(k, v);
        hg.setAttribute('normal', g.attributes._hull_normal);
        hg.setIndex(g.index); hg.morphAttributes = g.morphAttributes; hg.morphTargetsRelative = g.morphTargetsRelative;
      }
      if (M.outline) {
        const h = clone(hg, share && !sp && !ed ? sharedOr('h|' + JSON.stringify([M.outline, attrs]), () => CK.hullMaterial(M, attrs, CU)) : CK.hullMaterial(M, attrs, CU), CK.LAYER.main);
        h.userData.ck = { name, hull: true }; h.renderOrder = -1; mesh.userData.ck.hullMesh = h;
        ck.hulls.push(h); ck.parts[name].hulls.push(h);
      }
      if (M.holdout) {
        const h = clone(hg, share && !sp && !ed ? sharedOr('o|' + JSON.stringify([M.outline || null, attrs]), () => CK.holdoutMaterial(M, attrs)) : CK.holdoutMaterial(M, attrs), CK.LAYER.holdout);
        h.userData.ck = { name, holdout: true }; h.renderOrder = -10;   // depth first: it must hide what's behind it
        mesh.userData.ck.holdoutMesh = h;
        ck.holdouts.push(h); ck.parts[name].holdouts.push(h);
      }
      const dictOf = mesh.userData.ckMorph ? mesh.userData.ckMorph.logicalDict : mesh.morphTargetDictionary;   // (keys write the full-length set)
      if (dictOf) for (const [k, i] of Object.entries(dictOf)) (ck.keyIndex[k] = ck.keyIndex[k] || []).push([mesh, i]);
    }
    ck.live = liveCaps.length ? CK.liveBuild(liveCaps) : null;
    ck.idTable = {};                                         // (debug view 20's legend: id -> {name, rgb})
    for (const mt of [...ck.materials, ...ck.hulls.map(h => h.material)]) if (mt && mt.userData.ckId)
      ck.idTable[mt.userData.ckId] = { name: mt.userData.ckIdName, rgb: CK.idRGB(mt.userData.ckId) };
    for (const mesh of ck.meshes) for (const n of (mesh.userData.ck && mesh.userData.ck.attrs.lineSets) || []) {
      const id = CK.idOf('line.' + n); ck.idTable[id] = { name: 'line.' + n, rgb: CK.idRGB(id) };   // (a line set's pixels)
    }
    // the head's rest frame (the head-space light) and the joints (the weights view)
    const H = vrm.humanoid;
    H.resetNormalizedPose(); vrm.scene.updateMatrixWorld(true);
    ck.headNode = H.getRawBoneNode((info.root.head && info.root.head.bone) || 'head');
    ck.headRest = ck.headNode.getWorldQuaternion(new T.Quaternion());
    ck.headRestPos = ck.headNode.getWorldPosition(new T.Vector3());
    ck.selfShadow = true;                                    // (CK.pipeline's self-shadow pass: on by default, Michael 2026-10-16)
    const skinned = meshes.find(m => m.isSkinnedMesh);
    ck.joints = skinned ? skinned.skeleton.bones.map(b => b.name) : [];
    ck.keyNames = Object.keys(ck.keyIndex).sort();
    ck.expressionNames = vrm.expressionManager ? vrm.expressionManager.expressions.map(e => e.expressionName) : [];
    ck.light = new T.Vector3(...((info.root.light && info.root.light.direction) || [-0.45, 0.70, 0.55])).normalize();
    ck.rawKeys = {}; ck.exprs = {}; ck.gaze = null;

    // the metacarpal carriers' runtime drive (Michael's call (a), 2026-10-09; charkit.rigspec Nodes.deform): after the
    // constraints, each carrier re-turned by its weight of its OWN finger's turn against it, about its CMC (the
    // export's constraint, the middle finger's, stays a plain VRM runtime's fallback), so a held ring or little stays
    // put when the middle moves; ck.cups {carrier: [x, y, z, w]} (a bind-frame rotation: charkit.pose.cups) holds one
    const skel = skinned ? skinned.skeleton : null;
    const ibmOf = n => { const i = skel ? skel.bones.findIndex(b => b.name === n) : -1; return i >= 0 ? skel.boneInverses[i] : null; };
    const carriers = Object.entries(info.root.carriers || {}).map(([name, c]) => {
      const m = vrm.scene.getObjectByName(name), d = vrm.scene.getObjectByName(c.drive);
      if (!m || !d || !m.parent || !ibmOf(name) || !ibmOf(c.drive) || !ibmOf(m.parent.name)) return null;
      const h = new T.Vector3().setFromMatrixPosition(ibmOf(name).clone().invert());
      return { m, d, w: c.weight, Im: ibmOf(name), Id: ibmOf(c.drive), Ip: ibmOf(m.parent.name), h };
    }).filter(Boolean);
    ck.cups = {};
    const driveCarriers = () => {
      for (const c of carriers) {
        const Dm = new T.Matrix4().multiplyMatrices(c.m.matrixWorld, c.Im);
        const Dd = new T.Matrix4().multiplyMatrices(c.d.matrixWorld, c.Id);
        const Dp = new T.Matrix4().multiplyMatrices(c.m.parent.matrixWorld, c.Ip);
        const own = new T.Quaternion().setFromRotationMatrix(Dm.clone().invert().multiply(Dd));    // (the finger's own turn)
        const q = ck.cups[c.m.name] ? new T.Quaternion().fromArray(ck.cups[c.m.name]) : own;
        const S = new T.Quaternion().slerp(q, c.w);
        const Mh = new T.Matrix4().makeTranslation(c.h.x, c.h.y, c.h.z).multiply(new T.Matrix4().makeRotationFromQuaternion(S))
          .multiply(new T.Matrix4().makeTranslation(-c.h.x, -c.h.y, -c.h.z));
        const local = c.m.parent.matrixWorld.clone().invert().multiply(Dp.multiply(Mh)).multiply(c.Im.clone().invert());
        const pos = new T.Vector3(), quat = new T.Quaternion(), scl = new T.Vector3();
        local.decompose(pos, quat, scl);
        c.m.quaternion.copy(quat); c.m.updateMatrixWorld(true);
      }
    };
    ck.carriers = carriers.map(c => c.m.name);
    // body D's Scapula nodes (CHARKIT_look root rig.scapula, charkit.bodyd.rig.scapula_table; bodyd-rig round 6): after
    // the constraints (their aim at the elbow, 0.35, is a plain VRM runtime's fallback), each node's local transform is
    // IBM(Shoulder) . M(e, az) . IBM(node)^-1, M the table's motion at the upper arm's elevation e and plane az in the
    // upper chest's frame (charkit.pose.arm_elevation), bilinear in the table, az wrapped where its grid spans the circle
    // (round 7's tables; round 6's stopped at -90 and clamp). A node whose scene parent isn't the rule's is skipped (the
    // local transform assumes it).
    const scapulas = Object.values((info.root.rig || {}).scapula || {}).map(r => {
      const n = vrm.scene.getObjectByName(r.node), a = vrm.scene.getObjectByName(r.arm.bone), th = vrm.scene.getObjectByName(r.thorax);
      if (!n || !a || !th || !ibmOf(r.node) || !ibmOf(r.parent) || !ibmOf(r.arm.bone) || !ibmOf(r.thorax)) return null;
      if (!n.parent || n.parent.name !== r.parent) return null;
      return { r, n, a, th, In: ibmOf(r.node).clone().invert(), Ip: ibmOf(r.parent), Ia: ibmOf(r.arm.bone), It: ibmOf(r.thorax),
               sx: r.side === 'left' ? 1 : -1, h: new T.Vector3(...r.arm.head), t: new T.Vector3(...r.arm.tail) };
    }).filter(Boolean);
    const scapulaMotion = (r, e, az) => {
      const at = (v, g) => {
        v = Math.min(Math.max(v, g[0]), g[g.length - 1]);
        let i = 0;
        while (i < g.length - 2 && g[i + 1] <= v) i++;
        return [i, (v - g[i]) / (g[i + 1] - g[i])];
      };
      const a0 = r.az[0], wrap = r.az[r.az.length - 1] - a0 >= 360 - 1e-6;
      const [i, u] = at(e, r.e), [j, w] = at(wrap ? ((((az - a0) % 360) + 360) % 360) + a0 : az, r.az);
      const q0 = r.q[i][j], q = [0, 0, 0, 0], t = [0, 0, 0];
      for (const [a, b, k] of [[i, j, (1 - u) * (1 - w)], [i + 1, j, u * (1 - w)], [i, j + 1, (1 - u) * w], [i + 1, j + 1, u * w]]) {
        const qa = r.q[a][b], sg = qa[0] * q0[0] + qa[1] * q0[1] + qa[2] * q0[2] + qa[3] * q0[3] >= 0 ? 1 : -1;
        for (let c = 0; c < 4; c++) q[c] += k * sg * qa[c];
        for (let c = 0; c < 3; c++) t[c] += k * r.t[a][b][c];
      }
      return new T.Matrix4().compose(new T.Vector3(...t), new T.Quaternion(...q).normalize(), new T.Vector3(1, 1, 1));
    };
    const driveScapulas = () => {
      const pos = new T.Vector3(), quat = new T.Quaternion(), scl = new T.Vector3();
      for (const s of scapulas) {
        const Da = new T.Matrix4().multiplyMatrices(s.a.matrixWorld, s.Ia), Dt = new T.Matrix4().multiplyMatrices(s.th.matrixWorld, s.It);
        const d = s.t.clone().applyMatrix4(Da).sub(s.h.clone().applyMatrix4(Da))
          .applyMatrix4(new T.Matrix4().extractRotation(Dt).invert()).normalize();
        const e = Math.acos(Math.min(Math.max(-d.y, -1), 1)) * 180 / Math.PI, az = Math.atan2(d.z, s.sx * d.x) * 180 / Math.PI;
        new T.Matrix4().multiplyMatrices(s.Ip, scapulaMotion(s.r, e, az)).multiply(s.In).decompose(pos, quat, scl);
        s.n.position.copy(pos); s.n.quaternion.copy(quat); s.n.updateMatrixWorld(true);
      }
    };
    ck.scapulas = scapulas.map(s => s.n.name);
    ck.scapulaMotion = scapulaMotion;
    const afterConstraints = () => { driveCarriers(); driveScapulas(); };
    ck.afterConstraints = afterConstraints;                // (a caller that poses the raw bones itself settles through it)
    vrm.charkitAfterConstraints = afterConstraints;        // (engine/three/vrm.js's performer settles through it too)
    // the corrective shapes (charkit.correctives; CHARKIT_look 'correctives': each a morph target and its driver, the
    // thenar's, body D's): the driver's quantity (a projected angle, or a cone's distance from a key: correctives.KINDS)
    // of the bone's turn against its parent, ramped and smoothstepped, sets its
    // key's weight every update (charkit.rom evaluates the same; a plain VRM leaves them at 0)
    const driverOf = d => {
      const b = vrm.scene.getObjectByName(d.bone), p = vrm.scene.getObjectByName(d.parent);
      if (!b || !p || !ibmOf(d.bone) || !ibmOf(d.parent)) return null;
      const r = { b, p, Ib: ibmOf(d.bone), Ip: ibmOf(d.parent), v0: new T.Vector3(...d.v0), u: new T.Vector3(...d.u),
               w: new T.Vector3(...d.w), ramp: d.ramp, kind: d.kind || 'projected_angle',
               keys: d.keys ? d.keys.map(k => new T.Vector3(...k)) : null, index: d.index, power: d.power, reach: d.reach };
      // (a key group's clavicle part, charkit.correctives' 'clav' (shoulder-motion): the clavicle's direction against its
      // parent, each key's, its weight in the distance)
      if (d.clav && d.clav.scale) {
        const c = driverOf({ bone: d.clav.bone, parent: d.clav.parent, v0: d.clav.v0, u: d.clav.v0, w: [0, 0, 0], ramp: [1, 0] });
        if (!c) return null;
        r.clav = { ...c, keys: d.clav.keys.map(k => new T.Vector3(...k)), scale: d.clav.scale };
      }
      return r;
    };
    const correctives = (info.root.correctives || []).map(c => {
      const d = c.driver_gltf || c.driver, r = driverOf(d);
      if (!r) return null;
      // (a gate: another driver whose weight multiplies this one's (charkit.correctives' 'gate': body D's shoulder shapes
      // by the clavicle's swing from the key's))
      r.key = c.key; r.gate = d.gate ? driverOf(d.gate) : null;
      return d.gate && !r.gate ? null : r;
    }).filter(Boolean);
    ck.correctiveWeight = c => {
      const x = driverWeight(c);
      return c.gate && x > 0 ? x * driverWeight(c.gate) : x;
    };
    const dirOf = c => {                                   // (the bone's rest vector turned by its turn against its parent)
      const Db = new T.Matrix4().multiplyMatrices(c.b.matrixWorld, c.Ib), Dp = new T.Matrix4().multiplyMatrices(c.p.matrixWorld, c.Ip);
      const rel = new T.Matrix4().extractRotation(Dp.invert().multiply(Db));
      return c.v0.clone().applyMatrix4(rel);
    };
    const angOf = (d, u) => Math.acos(Math.min(Math.max(d.dot(u) / Math.max(d.length() * u.length(), 1e-12), -1), 1)) * 180 / Math.PI;
    const driverWeight = c => {
      const d = dirOf(c);
      const ang = u => angOf(d, u);
      if (c.kind === 'keys') {
        // (a key group's share, charkit.correctives' 'keys': modified Shepard over the group's keys and the rest (v0), the
        // background reach^-power; 1 at its own key, the nearest keys' shapes between and off their path; with a clavicle
        // part each distance sqrt(x^2 + (scale y)^2), y the clavicle's angle from the key's)
        const t = x => Math.pow(c.reach / Math.max(x, 1e-3), c.power);      // (each term times reach^power)
        const dc = c.clav ? dirOf(c.clav) : null;
        const dist = (u, cu) => { const x = ang(u); if (!dc) return x; const y = c.clav.scale * angOf(dc, cu); return Math.sqrt(x * x + y * y); };
        let s = t(dist(c.v0, c.clav ? c.clav.v0 : null)) + 1, mine = 0;
        c.keys.forEach((u, j) => { const tj = t(dist(u, c.clav ? c.clav.keys[j] : null)); s += tj; if (j === c.index) mine = tj; });
        return mine / s;
      }
      // (kind 'cone', body D's shoulder and hip: the angle between the turned rest vector and the key direction u, a
      // swing's distance from the key pose, its ramp falling; 'projected_angle': atan2(d.w, d.u), the thenar's)
      const x = c.kind === 'cone' ? Math.acos(Math.min(Math.max(d.dot(c.u) / Math.max(d.length(), 1e-12), -1), 1)) * 180 / Math.PI
        : Math.atan2(d.dot(c.w), d.dot(c.u)) * 180 / Math.PI, [a, b] = c.ramp;
      const t = b !== a ? Math.min(Math.max((x - a) / (b - a), 0), 1) : (x >= b ? 1 : 0);
      return t * t * (3 - 2 * t);
    };
    ck.correctives = correctives.map(c => c.key);
    ck.correctiveWeights = () => Object.fromEntries(correctives.map(c => [c.key, ck.correctiveWeight(c)]));

    // ---- controls
    // the rig spec's extra nodes (docs/RIG.md: VRMC_node_constraint) follow the humanoid: after every humanoid update
    ck.settle = () => {
      H.update(); vrm.scene.updateMatrixWorld(true);
      if (vrm.nodeConstraintManager) { vrm.nodeConstraintManager.update(); vrm.scene.updateMatrixWorld(true); }
      afterConstraints();
    };
    ck.restPose = () => { H.resetNormalizedPose(); ck.settle(); };
    ck.buildPose = () => {                                   // the pose the build (and Blender) shows: the A-pose bind
      H.resetNormalizedPose();
      for (const [b, q] of Object.entries(ck.bindPose)) { const n = H.getNormalizedBoneNode(b); if (n) n.quaternion.fromArray(q); }
      ck.settle();
    };
    ck.keys = (w = {}) => { ck.rawKeys = { ...w }; };
    ck.expressions = (w = {}) => { ck.exprs = { ...w }; };
    // CHARKIT_channels (docs/FORMAT.md): the face channels' table (the file's, or built from the mouth engine's block by
    // engine/three/charkit/clip.js, which must be loaded for channels); ck.channels({name: v}) drives morph keys through
    // it in ck.update, on top of the expressions and with the raw keys
    ck.channelTable = (js.extensions && js.extensions.CHARKIT_channels) ||
      (info.root.mouth && window.CKClip ? window.CKClip.faceFromMouth(info.root.mouth) : null);
    ck.channelValues = {};
    ck.channels = (v = {}) => { ck.channelValues = { ...v }; };
    // the face states' looks (dread, flush): {color, ramp} into every face material's uniforms; the file's first
    ck.faceLook = (state, look) => {
      if (CU[state + 'Color']) { if (look.color) CU[state + 'Color'].value.set(...look.color); return; }   // (tint, flat)
      for (const mt of ck.materials) { const P = mt.userData.faceParams; if (!P || !P[state + 'Color']) continue;
        if (look.color) P[state + 'Color'].value.set(...look.color); if (look.ramp && P[state + 'Ramp']) P[state + 'Ramp'].value.set(...look.ramp); }
    };
    const CHM = ((js.extensions && js.extensions.CHARKIT_channels) || {}).material || {};
    for (const st of ['dread', 'flush', 'tint', 'flat']) if (CHM[st] && CHM[st].look) ck.faceLook(st, CHM[st].look);
    // named anchors (CHARKIT_channels.anchors: {name: {bone, offset, normal, up}}, the bone's rest frame): FX events'
    // and decals' `anchor: {name}` resolve through them
    ck.anchors = Object.assign({}, ((js.extensions && js.extensions.CHARKIT_channels) || {}).anchors || {});
    ck.anchor = a => (a && a.name && ck.anchors[a.name] ? Object.assign({}, ck.anchors[a.name], a, { name: undefined }) : a);
    // a clip's state (CKClip's evaluator .at(t)): the skeleton (humanoid bones on the normalized rig, other named nodes
    // raw: the scale bones), the hips' position, the face channels, then the constraints; FX and material channels kept
    // for the overlay and the material params (ck.fx, ck.materialValues). Call ck.update(dt, camera) after it. A state's
    // space (the clip's): 'charkit-local' converted first (ck.fromCharkitLocal), 'humanoid' or none (a hand-made state)
    // as it is.
    // a charkit-local state (docs/FORMAT.md "Spaces": the solver's clips, mocap and library motions; motion-solve and
    // ws-render, 2026-10-19) onto the normalized humanoid: each bone's turn L_b, against its parent's from the build's
    // A-pose, becomes n_b = Wp^-1 L_b Wp bind_b (Wp the parent's world rotation in the A-pose: the bind rotations down the
    // chain; the normalized rig's rest frames are world-aligned); every humanoid bone the state leaves out rests at its
    // bind (the A-pose: charkit-local's rest), not the T-pose; the root, the hips' displacement, goes onto the hips'
    // normalized rest position. Bones off the humanoid (raw nodes) aren't converted: counted in ck.spaceSkipped.
    const humanParent = {}, worldA = {};
    for (const b of Object.keys(H.humanBones || {})) {
      const n = H.getNormalizedBoneNode(b); if (!n) continue;
      let p = n.parent, pb = null;
      while (p && !pb) { pb = Object.keys(H.humanBones).find(k => H.getNormalizedBoneNode(k) === p) || null; p = p.parent; }
      humanParent[b] = pb;
    }
    const bindQ = b => (ck.bindPose[b] ? new T.Quaternion().fromArray(ck.bindPose[b]) : new T.Quaternion());
    const WA = b => (worldA[b] || (worldA[b] = (humanParent[b] ? WA(humanParent[b]).clone() : new T.Quaternion()).multiply(bindQ(b))));
    ck.hipsRest = null;                                      // (the normalized hips' rest position, read on first use)
    ck.spaceSkipped = 0;
    ck.fromCharkitLocal = (st) => {
      if (!ck.hipsRest) { H.resetNormalizedPose(); ck.hipsRest = (H.getNormalizedBoneNode('hips') || { position: new T.Vector3() }).position.clone(); }
      const bones = {};
      for (const b of Object.keys(humanParent)) {
        const P = (st.bones || {})[b] || {};
        const Wp = humanParent[b] ? WA(humanParent[b]) : new T.Quaternion();
        const L = P.rotation ? new T.Quaternion(P.rotation[0], P.rotation[1], P.rotation[2], P.rotation[3]) : new T.Quaternion();
        const n = Wp.clone().invert().multiply(L).multiply(Wp).multiply(bindQ(b));
        bones[b] = Object.assign({}, P, { rotation: [n.x, n.y, n.z, n.w] });
      }
      for (const [b, P] of Object.entries(st.bones || {})) if (!(b in humanParent)) { if (P.rotation) ck.spaceSkipped++; bones[b] = P; }
      const r = st.root ? [ck.hipsRest.x + st.root[0], ck.hipsRest.y + st.root[1], ck.hipsRest.z + st.root[2]] : null;
      return Object.assign({}, st, { bones, root: r, space: 'humanoid' });
    };
    ck.applyState = (st) => {
      if (st.space === 'charkit-local') st = ck.fromCharkitLocal(st);
      else if (st.space !== undefined && st.space !== null && st.space !== 'humanoid') throw new Error(`ck.applyState: unknown space ${JSON.stringify(st.space)}`);
      if (window.CKClip && ck.channelTable) st = window.CKClip.expandPoints(st, ck.channelTable);   // (macro: named points)
      H.resetNormalizedPose();
      for (const [b, P] of Object.entries(st.bones || {})) {
        const n = H.getNormalizedBoneNode(b) || vrm.scene.getObjectByName(b);
        if (!n) continue;
        if (P.rotation) n.quaternion.set(P.rotation[0], P.rotation[1], P.rotation[2], P.rotation[3]);
        if (P.scale) n.scale.set(P.scale[0], P.scale[1], P.scale[2]);
      }
      if (st.root) { const h = H.getNormalizedBoneNode('hips'); if (h) h.position.set(st.root[0], st.root[1], st.root[2]); }
      ck.channels(st.face || {});
      ck.materialValues = { ...(st.material || {}) };
      ck.decalValues = { ...(st.decal || {}) };
      ck.fx = st.fx || [];
      ck.preview = st.preview || null;
      ck.settle();
    };
    ck.look = (yaw = 0, pitch = 0) => { ck.gaze = [yaw, pitch]; };
    ck.setVisible = (name, on) => {
      const p = ck.parts[name]; if (!p) return;
      p.visible = on; for (const m of [...p.meshes, ...p.hulls, ...p.holdouts]) m.visible = on;
    };
    // apply the face (expressions, then raw keys on top), and the head-space light
    ck.update = (dt = 0, camera = null) => {
      if (camera) ck.camera = camera;
      const E = vrm.expressionManager;
      for (const m of ck.compacted) m.morphTargetInfluences = m.userData.ckMorph.logical;   // (full-length while written)
      for (const m of ck.meshes) if (m.morphTargetInfluences) m.morphTargetInfluences.fill(0);
      if (E) {
        for (const e of E.expressions) E.setValue(e.expressionName, 0);
        for (const [k, v] of Object.entries(ck.exprs)) E.setValue(k, v);
        if (ck.gaze && (ck.gaze[0] || ck.gaze[1]) && vrm.lookAt) { vrm.lookAt.autoUpdate = false; vrm.lookAt.applier.applyYawPitch(ck.gaze[0], ck.gaze[1]); }
        E.update();
      }
      for (const [k, v] of Object.entries(ck.rawKeys)) for (const [m, i] of ck.keyIndex[k] || []) m.morphTargetInfluences[i] += v;
      if (ck.channelTable && Object.keys(ck.channelValues).length) {
        for (const [k, v] of Object.entries(window.CKClip.channelWeights(ck.channelTable, ck.channelValues)))
          for (const [m, i] of ck.keyIndex[k] || []) m.morphTargetInfluences[i] += v;
      }
      for (const c of correctives) { const w = ck.correctiveWeight(c); for (const [m, i] of ck.keyIndex[c.key] || []) m.morphTargetInfluences[i] = w; }
      ck.updateLines();                                         // (the line sets' weights from the keys' influences, before packing)
      for (const m of ck.compacted) CK.packMorphs(m);
      for (const m of ck.sparse) CK.syncSparse(m);
      vrm.scene.updateMatrixWorld(true);
      ck.updateLight();
      ck.updateMaterials();
      ck.updateDecals();
    };
    ck.camera = null;
    const LT = info.root.light || {}, LN = info.root.lines || {};
    const cameraLight = cam => {                             // charkit.shade.view_light's camera key, in the glTF frame
      const t = ck.headAnchor(), up = new T.Vector3(0, 1, 0);
      const b = cam.getWorldPosition(new T.Vector3()).sub(t); b.y = 0;
      if (b.lengthSq() < 1e-12) b.set(0, 0, 1);
      b.normalize();
      const r = new T.Vector3().crossVectors(up, b);
      const a0 = LT.key[0] * Math.PI / 180, el = LT.key[1] * Math.PI / 180;
      return b.multiplyScalar(Math.cos(a0) * Math.cos(el)).addScaledVector(r, -Math.sin(a0) * Math.cos(el)).addScaledVector(up, Math.sin(el));
    };
    const visibleHeight = cam => {                            // at the head's distance (charkit.qa.render_view's target)
      if (cam.isOrthographicCamera) return (cam.top - cam.bottom) / cam.zoom;
      const d = cam.getWorldPosition(new T.Vector3()).distanceTo(ck.headAnchor());
      return 2 * d * Math.tan(cam.fov * Math.PI / 360) / (cam.zoom || 1);
    };
    // decals (CHARKIT_channels.decal, docs/FORMAT.md): quads riding a bone, shown or played by a channel. A decal is
    // {bone, offset [m, in the bone's frame], normal, up, size [w, h] m, mode 'show' | 'progress' | 'frames', frames?};
    // its texture comes from the file (source.texture, an index into the file's textures) or ck.addDecal's argument.
    // 'show': alpha = v; 'progress': revealed from its top down as v goes 0 -> 1 (a tear streak); 'frames': a strip
    // of `frames` cells across the texture, cell floor(v x frames). Depth-tested (hair covers it), not depth-writing,
    // lifted 1.5 mm off its anchor along the normal.
    ck.decals = {}; ck.decalValues = {};
    // the meshes a decal conforms to, as posed now, in world space and cut to the triangles with a vertex in `box`: three's
    // raycast on a skinned, morphed mesh skins and morphs every vertex of every triangle per ray (a 49 x 25 grid on the
    // body's skin stalled a page load past a minute); here each vertex once, then rays against a few thousand triangles
    const conformTargets = (meshes, box) => meshes.map(m => {
      const g = m.geometry, P = g.attributes.position, n = P.count, W = new Float32Array(n * 3), inside = new Uint8Array(n), v = new T.Vector3();
      for (let i = 0; i < n; i++) {
        m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
        W[3 * i] = v.x; W[3 * i + 1] = v.y; W[3 * i + 2] = v.z; inside[i] = box.containsPoint(v) ? 1 : 0;
      }
      const I = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i), keep = [];
      for (let t = 0; t + 2 < I.length; t += 3) if (inside[I[t]] || inside[I[t + 1]] || inside[I[t + 2]]) keep.push(I[t], I[t + 1], I[t + 2]);
      const cg = new T.BufferGeometry();
      cg.setAttribute('position', new T.BufferAttribute(W, 3)); cg.setIndex(keep);
      return new T.Mesh(cg, new T.MeshBasicMaterial({ side: (m.material && m.material.side) || T.FrontSide }));
    });
    ck.addDecal = (name, D0, texture) => {
      const D = D0.anchor ? Object.assign({}, ck.anchor({ name: D0.anchor }), D0) : D0;   // (a named anchor's bone, offset, normal, up)
      const node = H.getRawBoneNode(D.bone) || vrm.scene.getObjectByName(D.bone);
      if (!node || !texture) return null;
      texture.colorSpace = T.SRGBColorSpace;
      const amount = S.uniform(0), prog = S.uniform(0), cell = S.uniform(0);
      const nCells = Math.max(1, D.frames || 1);
      const uv = S.uv();
      const suv = D.mode === 'frames' ? S.vec2(uv.x.add(cell).div(nCells), uv.y) : uv;
      const tx = S.texture(texture, suv);
      const m = new T.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide });
      m.colorNode = tx.xyz;
      const reveal = D.mode === 'progress' ? S.step(S.float(1.0).sub(prog), uv.y) : S.float(1.0);
      m.opacityNode = tx.w.mul(amount).mul(reveal);
      m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
      // (conformed: 24 rows, and columns by the aspect (at least 3, at most 48): a wide decal's chords cut under a
      // curved skin on a 3-column grid (ws-body's mouth decal drew in strips); 24 x 24 is clean)
      const segY = D.conform === false ? 1 : 24, segX = D.conform === false ? 1 : Math.max(3, Math.min(48, Math.round(24 * D.size[0] / D.size[1])));
      const q = new T.Mesh(new T.PlaneGeometry(D.size[0], D.size[1], segX, segY), m);
      const nrm = new T.Vector3(...(D.normal || [0, 0, 1])).normalize(), up = new T.Vector3(...(D.up || [0, 1, 0]));
      const xa = new T.Vector3().crossVectors(up, nrm).normalize(), ya = new T.Vector3().crossVectors(nrm, xa);
      q.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(xa, ya, nrm));
      // the anchor is the quad's top edge for a streak (it grows down from it), its centre otherwise
      const off = new T.Vector3(...(D.offset || [0, 0, 0])).addScaledVector(nrm, 0.0015);
      if (D.mode === 'progress') off.addScaledVector(ya, -D.size[1] / 2);
      q.position.copy(off); q.frustumCulled = false; q.renderOrder = 5; q.visible = false;
      node.add(q);
      // conformed (default): each vertex cast onto the skin along -normal (from 3 cm out) and lifted 1.5 mm, in the bone's
      // frame: the streak follows the cheek's curve instead of standing off it as a card. The skin is read as posed now
      // (the bone carries it rigidly, so the shape holds as the bone moves). `on` names the parts cast onto (a name or a
      // list; 'prefix*' matches by prefix; default the *_skin part): with the eye's plates in it (on: ['clawd_skin',
      // 'sclera_L', 'iris_L', ...]) a welling tear sits 1.5 mm over the eye's frontmost plate and draws over the eye
      const onParts = D.on ? [].concat(D.on) : [Object.keys(ck.parts).find(n => /_skin$/.test(n)) || ''];
      const skin = D.conform === false ? [] : Object.keys(ck.parts).filter(n => onParts.some(o => o.endsWith('*') ? n.startsWith(o.slice(0, -1)) : n === o))
        .flatMap(n => ck.parts[n].meshes);
      if (skin.length) {
        vrm.scene.updateMatrixWorld(true);
        const pos = q.geometry.attributes.position, rc = new T.Raycaster(), wN = nrm.clone().transformDirection(node.matrixWorld);
        const inv = q.matrixWorld.clone().invert(); let hits = 0;
        const near = new T.Box3().setFromBufferAttribute(pos).applyMatrix4(q.matrixWorld).expandByScalar(0.05);
        const targets = conformTargets(skin, near);
        for (let i = 0; i < pos.count; i++) {
          const w = new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(q.matrixWorld);
          rc.set(w.clone().addScaledVector(wN, 0.03), wN.clone().negate()); rc.far = 0.08;
          const h = rc.intersectObjects(targets, false)[0];
          if (h) { pos.setXYZ(i, ...h.point.addScaledVector(wN, 0.0015).applyMatrix4(inv).toArray()); hits++; }
        }
        pos.needsUpdate = true; q.geometry.computeBoundingSphere();
        q.userData.conformed = hits / pos.count;
      }
      ck.decals[name] = { D, mesh: q, amount, prog, cell, nCells };
      return ck.decals[name];
    };
    const CH = (js.extensions && js.extensions.CHARKIT_channels) || {};
    for (const [name, D] of Object.entries(CH.decal || {})) {
      const t = D.source && D.source.texture !== undefined ? (info.tex[D.source.texture] || null) : null;
      if (t) ck.addDecal(name, D, t);
    }
    ck.updateDecals = () => {
      for (const [name, d] of Object.entries(ck.decals)) {
        const v = +(ck.decalValues[name] || 0);
        d.mesh.visible = v > 1e-4;
        if (d.D.mode === 'progress') { d.prog.value = Math.min(1, Math.max(0, v)); d.amount.value = 1; }
        else if (d.D.mode === 'frames') { d.cell.value = Math.min(d.nCells - 1, Math.floor(v * d.nCells)); d.amount.value = 1; }
        else d.amount.value = Math.min(1, Math.max(0, v));
      }
    };

    // a clip played with the spring bones (CKClip's evaluator E): the springs stepped on a fixed grid of 1/(fps x
    // substeps) in CLIP time from 0 (a hold in the time map freezes the hair with the body, as an anime hit-stop does),
    // so any t gives the same pose whatever order frames are asked in. Snapshots of the springs' state every `every`
    // steps let a jump back resume from the nearest one instead of replaying from 0 (three-vrm's joints: their tails).
    // at(sceneT) -> the clip state (applied: skeleton, springs, channels, materials); ck.update(dt, camera) after it.
    ck.performClip = (E, { fps = 30, substeps = 2, springs = true, every = 15 } = {}) => {
      const SB = springs ? vrm.springBoneManager : null, dt = 1 / (fps * substeps);
      const joints = SB ? [...SB.joints] : [];
      // (our springs (CK.Springs) snapshot and restore themselves; three-vrm's (?ownrig=0) through their private fields, and
      // its bones don't auto-update their local matrix, so a restore rebuilds it)
      const snap = () => SB.snapshot ? SB.snapshot() : joints.map(j => [j.bone.quaternion.clone(), j._currentTail.clone(), j._prevTail.clone()]);
      const restore = S => SB.restore ? SB.restore(S) : joints.forEach((j, i) => { j.bone.quaternion.copy(S[i][0]); j._currentTail.copy(S[i][1]); j._prevTail.copy(S[i][2]); j.bone.updateMatrix(); });
      const snaps = new Map(); let n0 = -1;
      const step = k => { ck.applyState(E.atClip(k * dt)); SB.update(dt); };
      const at = sceneT => {
        const ct = CKClip.timeMap(E.clip.timeMap, +sceneT), st = E.atClip(ct, +sceneT);
        if (SB) {
          const n = Math.max(0, Math.floor(ct / dt + 1e-6));
          if (n0 < 0 || n0 > n) {                            // start, or resume from the nearest snapshot at or before n
            let best = -1; for (const k of snaps.keys()) if (k <= n && k > best) best = k;
            if (best >= 0) { ck.applyState(E.atClip(best * dt)); restore(snaps.get(best)); n0 = best; }
            else { ck.applyState(E.atClip(0)); SB.reset(); n0 = 0; snaps.set(0, snap()); }
          }
          while (n0 < n) { n0++; step(n0); if (n0 % every === 0 && !snaps.has(n0)) snaps.set(n0, snap()); }
        }
        ck.applyState(st);                                   // (applyState leaves the spring nodes: step n's state)
        return st;
      };
      return { at, E, dt };
    };

    // the material channels (CK.PARAMS) into this character's materials' uniforms; the eyes' transform per layer as
    // charkit.eyelook.uv computes it (gaze, dilation, iris scale) plus the highlights' follow, with the eye's axes turned
    // by the head
    ck.materialValues = {};
    const eyeMats = [], faceMats = [];
    ck.refreshMaterials = () => {
      eyeMats.length = 0; faceMats.length = 0;
      for (const mt of ck.materials) { if (mt.userData.eye) eyeMats.push(mt); if (mt.userData.faceParams) faceMats.push(mt); }
    };
    ck.refreshMaterials();
    // drawn layers: a param's value (driven: the channel layer.<name>.<param>; undriven: the layer's default), whether a
    // layer shows (alpha, and a band drawing anything), the meshes its 'hides' names
    ck.layerValue = (LY, k) => { const V = ck.materialValues || {}, key = 'layer.' + LY.name + '.' + k;
      return key in V ? +V[key] : (LY.params && typeof LY.params[k] === 'number' ? LY.params[k] : ((CK.LAYER_PARAMS[LY.kind === 'sdf' ? LY.shape : LY.kind] || {})[k] || 0)); };
    const layerShows = LY => ck.layerValue(LY, 'alpha') > 1e-3 && (LY.shape !== 'band' || ['h', 'h2', 'outline'].some(k => ck.layerValue(LY, k) > 1e-4));
    const hidesMesh = (m, hides) => { const u = m.userData.ck || {}, role = (u.look && u.look.role) || '';
      return hides.some(h => u.name === h || role === h || role.startsWith(h + '.') || role.startsWith(h)); };
    ck.updateLayers = () => {
      if (!ck.layers.length && !(ck.lineHideable || []).length) return;
      for (const LY of ck.layers) for (const [k, un] of Object.entries(LY.u)) if (un && un.isNode && typeof un.value === 'number' && k !== 'n') un.value = ck.layerValue(LY, k);
      const hidden = new Set();
      for (const LY of ck.layers) if (LY.hides && LY.hides.length && layerShows(LY)) for (const m of ck.meshes) if (hidesMesh(m, LY.hides)) hidden.add(m);
      for (const n of ck.lineHides || []) for (const m of ck.lineHideable) if (hidesMesh(m, ck.lineSets[n].hides)) hidden.add(m);
      for (const m of new Set([...(ck.layerHideable || []), ...(ck.lineHideable || [])])) {
        const p = ck.parts[m.userData.ck.name], on = (!p || p.visible) && !hidden.has(m);
        m.visible = on; const u = m.userData.ck; if (u.hullMesh) u.hullMesh.visible = on; if (u.holdoutMesh) u.holdoutMesh.visible = on;
      }
    };
    // layers added at run time (the face round's spec.json before the export carries them): {layers, points, uvScale,
    // decals} and the spec's folder for its textures; the materials they draw on are rebuilt, the points' material
    // values merged; decals ({name: decal, its texture a file in the folder}) added as the file's would be
    ck.addLayers = async (spec, base = '') => {
      const add = [];
      for (const L0 of spec.layers || []) {
        const LY = Object.assign({}, L0, { uvScale: L0.uvScale || spec.uvScale });
        if (LY.kind === 'atlas' && typeof LY.texture === 'string') {
          const tx = await new T.TextureLoader().loadAsync(base + LY.texture);
          tx.flipY = false; tx.colorSpace = T.SRGBColorSpace; tx.needsUpdate = true; LY.texture = tx;
        }
        if (LY.params && LY.shape === 'stroke' && !LY.params.uvScale && LY.uvScale) LY.params = Object.assign({}, LY.params, { uvScale: LY.uvScale });
        LY.u = CK.layerUniforms(LY); add.push(LY);
      }
      ck.layers.push(...add);
      const pts = (ck.channelTable && (ck.channelTable.points = ck.channelTable.points || {})) || null;
      if (pts) for (const [name, P] of Object.entries(spec.points || {})) {
        const cur = pts[name] = pts[name] || { face: {}, material: {} };
        if (!cur.face && !cur.material) { pts[name] = { face: Object.assign({}, cur), material: {} }; }
        pts[name].material = Object.assign({}, pts[name].material || {}, P.material || {});
        if (P.face) pts[name].face = Object.assign({}, pts[name].face || {}, P.face);
      }
      for (const mesh of ck.meshes) {
        const b = mesh.userData.ckBuild; if (!b || !CK.layersFor(add, b.L).length) continue;
        const old = mesh.material;
        mesh.material = CK.material(b.L, b.M, info.tex, b.attrs, CU, CK.layersFor(ck.layers, b.L));
        if (mesh.userData.ckSparse || mesh.userData.ckEdit) CK.sparseMaterial(mesh.material);
        const i = ck.materials.indexOf(old); if (i >= 0) ck.materials[i] = mesh.material; else ck.materials.push(mesh.material);
        if (!old.userData.ckShared) old.dispose();
      }
      ck.refreshMaterials();
      for (const LY of ['dread', 'flush']) if (CHM[LY] && CHM[LY].look) ck.faceLook(LY, CHM[LY].look);   // (the rebuilt face's looks)
      ck.layerHideable = ck.meshes.filter(m => ck.layers.some(LY => LY.hides && hidesMesh(m, LY.hides)));
      const decals = [];
      for (const [name, D] of Object.entries(spec.decals || {})) {
        if (typeof D.texture !== 'string') continue;
        const tx = await new T.TextureLoader().loadAsync(base + D.texture);
        if (ck.addDecal(name, D, tx)) decals.push(name);
      }
      return [...add.map(LY => LY.name), ...decals];
    };
    ck.layerHideable = ck.meshes.filter(m => ck.layers.some(LY => LY.hides && hidesMesh(m, LY.hides)));
    // the line sets (CK.LINE_SETS): each drawn set's parameters (the file's over the defaults), its colour from the
    // material it names; per update its weight (the rest plus its keys' deltas x their influences), its width by the
    // line.<group> channel, inner_by from the other set's weight, and the parts a drawing set hides (updateLayers)
    ck.lineNames = [...new Set(ck.meshes.flatMap(m => (m.userData.ck && m.userData.ck.attrs.lineSets) || []))].sort();
    ck.lineSets = {};
    // (ck.lineReset: every set back to the file's parameters; ck.lineSet(name or group, patch): a page's or a shot's)
    ck.lineReset = () => {
      for (const n of ck.lineNames) {
        const P = ck.lineSets[n] = CK.lineParams(n, info.root.line_sets);
        if (!P.color && P.material) {
          const mt = (js.materials || []).map(x => (x.extensions || {}).CHARKIT_look || {}).find(x => x.role === P.material && x.color);
          if (mt) P.color = mt.color;
        }
        if (P.color) CK.lineUniforms(CU, n).color.value.set(...P.color);
      }
    };
    ck.lineReset();
    ck.lineHideable = ck.meshes.filter(m => ck.lineNames.some(n => (ck.lineSets[n].hides || []).length && hidesMesh(m, ck.lineSets[n].hides)));
    ck.lineHides = [];
    ck.lineInfluence = k => { const e = (ck.keyIndex[k] || [])[0]; return e ? (e[0].morphTargetInfluences[e[1]] || 0) : 0; };
    ck.lineWeight = n => { const P = ck.lineSets[n]; let w = P.weight;
      for (const [k, d] of Object.entries(P.keys || {})) w += d * ck.lineInfluence(k);
      return w; };
    ck.lineSet = (n, patch) => {
      for (const k of ck.lineNames.filter(k => k === n || ck.lineSets[k].group === n)) {
        Object.assign(ck.lineSets[k], patch);
        if (patch.color) CK.lineUniforms(CU, k).color.value.set(...patch.color);
      }
    };
    ck.updateLines = () => {
      if (!ck.lineNames.length) return;
      const V = ck.materialValues || {}, W = {};
      for (const n of ck.lineNames) W[n] = ck.lineWeight(n);
      ck.lineHides = [];
      for (const n of ck.lineNames) {
        const P = ck.lineSets[n], u = CK.lineUniforms(CU, n), g = P.group || n;
        const on = CK.lineOn(n, P), width = P.width * Math.max(0, 1 + (+(V['line.' + g] || 0)));
        u.on.value = on ? 1 : 0; u.width.value = width; u.minPx.value = P.min_px; u.weight.value = W[n];
        u.taper.value.set(...P.taper);
        if (typeof P.inner === 'number') u.inner.value = P.inner;
        else {
          const [by, w0, w1] = P.inner_by || [n, 0, 1], f = Math.min(1, Math.max(0, ((by in W ? W[by] : W[n]) - w0) / Math.max(w1 - w0, 1e-9)));
          u.inner.value = P.inner[0] + (P.inner[1] - P.inner[0]) * f;
        }
        if (on && width > 0 && (P.hides || []).length) ck.lineHides.push(n);
      }
    };
    ck.updateMaterials = () => {
      ck.updateLayers();
      const V = ck.materialValues || {}, g = k => +(V[k] || 0);
      CU.tint.value = g('tint'); CU.flat.value = g('flat'); CU.outline.value = g('outline');
      for (const mt of faceMats) { const P = mt.userData.faceParams; for (const k of ['dread', 'flush', 'blush']) if (P[k]) P[k].value = g(k); }
      if (!eyeMats.length) return;
      const q = ck.headNode.getWorldQuaternion(new T.Quaternion()).multiply(ck.headRest.clone().invert());
      const gh = Math.max(-1, Math.min(1, g('gazeH'))), gv = Math.max(-1, Math.min(1, g('gazeV')));
      for (const mt of eyeMats) {
        const { E, P } = mt.userData.eye, G = E.gaze || { left: 0, right: 0, up: 0, down: 0 };
        const gx = gh * (gh >= 0 ? G.left : G.right), gy = gv * (gv >= 0 ? G.up : G.down);
        const k = E.layer === 'highlight' ? (E.highlight_gaze === undefined ? 1 : E.highlight_gaze) : 1;
        const ox = E.side * gx * k + E.rest[0], oy = gy * k + E.rest[1];
        let sx = 1, sy = 1;
        const D = E.dilation;
        if (D && V.dilation !== undefined) {
          const d = Math.min(1, Math.max(0, D.rest + g('dilation')));
          sx = Math.min(D.dilate[0] ** (d - D.rest), D.clamp[0]); sy = Math.min(D.dilate[1] ** (d - D.rest), D.clamp[1]);
        }
        if (E.layer === 'iris' || E.layer === 'pupil' || E.layer === 'highlight') {
          const s = Math.max(0.05, 1 + g('irisScale')); sx *= s; sy *= s;
        }
        if (E.layer === 'highlight') { const s = Math.max(0.05, 1 + 0.5 * g('sparkle')); sx *= s; sy *= s; }
        P.scale.value.set(sx, sy); P.off.value.set(ox, -oy);
        P.follow.value = E.layer === 'highlight' ? (E.follow || 0) * (1 + g('highlightFollow')) : 0;
        if (E.axes) { P.axOut.value.set(...E.axes.out).applyQuaternion(q); P.axUp.value.set(...E.axes.up).applyQuaternion(q); }
        P.fade.value = (E.layer === 'iris' || E.layer === 'pupil' || E.layer === 'highlight') ? 1 - Math.min(1, Math.max(0, g('blankEyes'))) : 1;
      }
    };
    ck.updateLight = () => {
      if (LT.mode === 'camera' && LT.key && ck.camera) ck.light.copy(cameraLight(ck.camera)).normalize();
      U.lineScreen.value = LN.mode === 'screen' && ck.camera ? LN.frac * visibleHeight(ck.camera) : 0;
      if (ck.camera) U.headVisH.value = visibleHeight(ck.camera);
      U.light.value.copy(ck.light);
      const q = ck.headNode.getWorldQuaternion(new T.Quaternion()).multiply(ck.headRest.clone().invert());
      // (head D's face key: charkit.headd.shading.face_light: the key in the head's frame, its elevation clamped to the
      // root's face_light.elevation, its azimuth kept, turned back to the world)
      const FL = info.root.face_light;
      U.faceLightOn.value = FL ? 1 : 0;
      if (FL) {
        const el = FL.elevation === undefined ? [10, 10] : (typeof FL.elevation === 'number' ? [FL.elevation, FL.elevation] : FL.elevation);
        const Lh = ck.light.clone().normalize().applyQuaternion(q.clone().invert());
        const m = Math.hypot(Lh.x, Lh.z), d = m > 1e-6 ? new T.Vector3(Lh.x / m, 0, Lh.z / m) : new T.Vector3(0, 0, 1);
        const e = Math.min(Math.max(Math.atan2(Lh.y, m), el[0] * Math.PI / 180), el[1] * Math.PI / 180);
        U.faceLight.value.copy(d.multiplyScalar(Math.cos(e)).add(new T.Vector3(0, Math.sin(e), 0)).applyQuaternion(q));
      }
      U.headFwd.value.set(0, 0, 1).applyQuaternion(q); U.headUp.value.set(0, 1, 0).applyQuaternion(q);
      const hd = ck.head();
      U.headCentre.value.copy(ck.headPosed());
      U.headL.value = hd.L;
      U.headLight.value.copy(ck.light).applyQuaternion(q.invert());
    };
    ck.setLight = v => { ck.light.copy(v).normalize(); ck.updateLight(); };
    // the ground (charkit.gltf.ground_of, 2026-10-15): the rig root lifts the character by ground_offset so its lowest
    // rest point stands on y = 0; the root's positions (head.centre, boards, landmarks) are in the build's frame, under it
    ck.ground = info.root.ground_offset || 0;
    ck.head = () => {                                        // the head centre (the file's world: lifted) and head length
      const h = info.root.head || { centre: [0, 1.4, 0], L: 0.25 };
      return { centre: new T.Vector3(h.centre[0], h.centre[1] + ck.ground, h.centre[2]), L: h.L };
    };
    ck.headPosed = () => {                                   // the head centre as posed: carried by the head bone
      const q = ck.headNode.getWorldQuaternion(new T.Quaternion()).multiply(ck.headRest.clone().invert());
      return ck.headNode.getWorldPosition(new T.Vector3()).add(ck.head().centre.sub(ck.headRestPos).applyQuaternion(q));
    };
    // what screen lines and the camera key measure from: the posed head (a following camera on a walk keeps its lines),
    // or with CK.HEAD_ANCHOR 'rest' the rest head (motion's report, 2026-10-19: 4x thicker lines 13 m out)
    ck.headAnchor = () => (CK.HEAD_ANCHOR === 'rest' ? ck.head().centre : ck.headPosed());
    ck.updateLight();
    LMS.total = performance.now() - t0; LMS.rest = LMS.total - (LMS.gltf || 0) - (LMS.compact || 0) - (LMS.sparse || 0);
    ck.loadMs = Object.fromEntries(Object.entries(LMS).map(([k, v]) => [k, Math.round(v)]));
    return ck;
  };

  // ------------------------------------------------------------------------------------------------ the frame pipeline
  // main pass -> RT (MSAA, ss x supersampled); feature pass (layers feature + holdout) -> RT; composite (features over the
  // frame at `through` x alpha in sRGB, as charkit.qa.features_through; then the ss x ss box down to the output) -> canvas
  CK.pipeline = (ctx, { ss = 1, bg = [0.86, 0.86, 0.90], samples = 4, through = null, bloom = 0 } = {}) => {
    const r = ctx.renderer;
    const P = { ss, bg: new T.Color(...bg), through, bloom, bloomThreshold: 0.92, size: [0, 0] };
    const mk = () => new T.RenderTarget(1, 1, { samples, type: T.HalfFloatType, depthBuffer: true });
    const rtMain = mk(), rtFeat = mk();
    const rtB = [0, 1].map(() => new T.RenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false }));
    const uThrough = S.uniform(0.55), uSS = S.uniform(1), uTexel = S.uniform(new T.Vector2(1, 1));
    const uBloom = S.uniform(0), uBloomT = S.uniform(0.92), uBTexel = S.uniform(new T.Vector2(1, 1));
    const quv = S.uv();                                      // QuadMesh uv: (0,0) bottom-left
    const tMain = S.texture(rtMain.texture), tFeat = S.texture(rtFeat.texture);
    // bloom: bright parts of the frame (above a threshold), blurred separably at 1/4 size
    const bright = new T.MeshBasicNodeMaterial();
    bright.colorNode = S.max(S.texture(rtMain.texture, quv).xyz.sub(uBloomT), S.vec3(0)).div(S.float(1).sub(uBloomT).max(0.01));
    const makeBlur = (src, dir) => {
      const m = new T.MeshBasicNodeMaterial(), tx = S.texture(src.texture), w = [0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216];
      let c = tx.sample(quv).xyz.mul(w[0]);
      for (let i = 1; i < 5; i++) {
        const o = S.vec2(dir[0], dir[1]).mul(uBTexel).mul(i * 1.5);
        c = c.add(tx.sample(quv.add(o)).xyz.mul(w[i])).add(tx.sample(quv.sub(o)).xyz.mul(w[i]));
      }
      m.colorNode = c;
      return new T.QuadMesh(m);
    };
    const qBlurH = makeBlur(rtB[0], [1, 0]), qBlurV = makeBlur(rtB[1], [0, 1]);
    const qBright = new T.QuadMesh(bright);
    // the composite: the default writes the frame opaque (as it always has); with coverage (P.render's alpha, the studio's
    // layers) it writes the main pass's and the features' coverage as alpha, unblended
    // premul: for the canvas (V3.renderer's alpha, premultiplied): the colour averaged over the covered taps only, then
    // premultiplied by the coverage, so the frame composites over the page with clean edges (the 2D FX layer's smears
    // and masks)
    const makeComp = (coverage, premul = false) => {
      const comp = new T.MeshBasicNodeMaterial();
      comp.colorNode = S.Fn(() => {
        const A = S.vec3(0).toVar(), B = S.vec4(0).toVar(), Aa = coverage ? S.float(0).toVar() : null;
        // ss x ss box: taps at the hi-res texel centres inside this output pixel
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
          const use = S.float(i).lessThan(uSS).and(S.float(j).lessThan(uSS));
          const off = S.vec2(i + 0.5, j + 0.5).sub(uSS.mul(0.5)).mul(uTexel);
          S.If(use, () => {
            const m = tMain.sample(quv.add(off));
            A.addAssign(premul ? m.xyz.mul(m.w) : m.xyz); B.addAssign(tFeat.sample(quv.add(off)));
            if (coverage) Aa.addAssign(m.w);
          });
        }
        const n = uSS.mul(uSS);
        if (premul) A.divAssign(Aa.max(1e-4)); else A.divAssign(n);
        B.divAssign(n);
        const As = S.sRGBTransferOETF(S.max(A, S.vec3(0)));
        const Bs = S.sRGBTransferOETF(S.max(B.xyz.div(B.w.max(1e-4)), S.vec3(0)));
        const k = sat(B.w).mul(uThrough);
        let out = S.sRGBTransferEOTF(S.mix(As, Bs, k));
        out = out.add(S.texture(rtB[0].texture, quv).xyz.mul(uBloom));
        if (!coverage) return out;
        const cov = sat(S.max(Aa.div(n), B.w));
        if (premul) return S.vec4(out.mul(cov), cov);
        // (the colour where nothing was drawn is the cleared 0: un-premultiplied by the coverage downstream)
        return S.vec4(out, cov);
      })();
      if (coverage) comp.blending = T.NoBlending;
      return comp;
    };
    const comp = makeComp(false);
    const qCompA = new T.QuadMesh(makeComp(true));
    const qCompP = new T.QuadMesh(makeComp(true, true));
    const qComp = new T.QuadMesh(comp);
    const featCam = { persp: new T.PerspectiveCamera(), ortho: new T.OrthographicCamera() };
    // the self-shadow pass (ck.selfShadow): the head's and hair's depth (CK.LAYER.shadow) from the key light into
    // CK.shadowDepth, an orthographic map 2 head L across centred under the posed head centre (the jaw and neck)
    const rtShadow = new T.RenderTarget(CK.SHADOW_N, CK.SHADOW_N, { depthBuffer: true });
    rtShadow.depthTexture = CK.shadowDepth;
    const rtShadowHair = new T.RenderTarget(CK.SHADOW_N, CK.SHADOW_N, { depthBuffer: true });
    rtShadowHair.depthTexture = CK.shadowDepthHair;
    const shCam = new T.OrthographicCamera();
    const depthMat = new T.MeshBasicNodeMaterial({ colorWrite: false }), depthThin = new T.MeshBasicNodeMaterial({ colorWrite: false });
    depthMat.side = T.BackSide; depthThin.side = T.DoubleSide;
    depthMat.setupPosition = depthThin.setupPosition = CK.sparseSetup;   // (sparse meshes morph in the shadow pass too)
    P._shadow = { rtShadow, rtShadowHair, shCam, depthMat, depthThin };   // (for checks: the map's targets and camera)
    const shadowPass = (scene, ck) => {
      const L = ck.head().L;
      const c = ck.headPosed();
      c.y -= 0.45 * L;
      const d = U.light.value.clone().normalize();
      shCam.position.copy(c).addScaledVector(d, 4 * L);
      shCam.up.set(0, 1, 0); if (Math.abs(d.y) > 0.95) shCam.up.set(0, 0, 1);
      shCam.lookAt(c);
      const e = 1.0 * L;
      Object.assign(shCam, { left: -e, right: e, top: e, bottom: -e, near: 0.0, far: 8 * L });
      shCam.updateProjectionMatrix(); shCam.updateMatrixWorld();
      const ov = scene.overrideMaterial, ac = r.autoClear;
      r.setRenderTarget(rtShadow); r.setClearColor(0x000000, 0); r.clear(); r.autoClear = false;
      scene.overrideMaterial = depthMat; shCam.layers.set(CK.LAYER.shadow); r.render(scene, shCam);
      if (CK.shadowHair !== false) { scene.overrideMaterial = depthThin; shCam.layers.set(CK.LAYER.shadowThin); r.render(scene, shCam); }
      r.setRenderTarget(rtShadowHair); r.clear();                 // (the hair alone, for the face's receivers)
      if (CK.shadowHair !== false) r.render(scene, shCam);
      scene.overrideMaterial = ov; r.autoClear = ac;
      U.shadowVP.value.multiplyMatrices(shCam.projectionMatrix, shCam.matrixWorldInverse);
      U.shadowOn.value = 1;
    };

    // opts (projects/charstudio): target, a RenderTarget the composite fills instead of the canvas's region; alpha, the
    // background cleared transparent and the frame's coverage written as alpha (a layer for another composite)
    P.render = (scene, cam, ck, [x, y, w, h] = [0, 0, ctx.w, ctx.h], { target = null, alpha = false } = {}) => {
      // every render is a new frame for three's node system: its skinning recomputes a skeleton's bone matrices once per
      // node-frame id, which only the renderer's requestAnimationFrame loop advances, so renders within one task (a
      // sheet's frames, a smear's sub-frame copies) would all draw the first pose's skin (found 2026-10-16)
      if (r._nodes && r._nodes.nodeFrame) r._nodes.nodeFrame.update();
      const W_ = Math.round(w * P.ss), H_ = Math.round(h * P.ss);
      if (P.size[0] !== W_ || P.size[1] !== H_) {
        rtMain.setSize(W_, H_); rtFeat.setSize(W_, H_);
        for (const b of rtB) b.setSize(Math.max(1, W_ >> 2), Math.max(1, H_ >> 2));
        P.size = [W_, H_];
      }
      U.ortho.value = cam.isOrthographicCamera ? 1 : 0;
      cam.getWorldDirection(U.camBack.value).negate();
      U.pxPerM.value = h * cam.projectionMatrix.elements[5] / 2;       // (toon.wgsl's ViewU.line.z)
      U.lineSS.value = P.ss;                                            // (the line sets' 1 px floor, in output pixels)
      if (ck && ck.updateLight) { ck.camera = cam; ck.updateLight(); }   // the view's light and line widths (the look)
      if (ck) ck.updateLight();
      if (ck && ck.live) CK.liveUpdate(ck, r, scene);
      const bg0 = scene.background; scene.background = null;
      r.setScissorTest(false);
      // (WebGPU only: on WebGPURenderer's WebGL2 backend the map's depth range and origin differ, so the bake stays there)
      if (ck && ck.selfShadow && (U.debug.value === 0 || U.debug.value === 18) && r.backend && r.backend.isWebGPUBackend) shadowPass(scene, ck);
      else U.shadowOn.value = 0;
      r.setRenderTarget(rtMain); r.setClearColor(P.bg, alpha ? 0 : 1); r.clear(); r.render(scene, cam);
      const th = P.through != null ? P.through : ck && ck.root.features ? ck.root.features.through : 0.55;
      r.setRenderTarget(rtFeat); r.setClearColor(0x000000, 0); r.clear();
      if (th > 0 && ck && ck.features.length && U.debug.value === 0) {
        const fc = cam.isOrthographicCamera ? featCam.ortho : featCam.persp;
        fc.copy(cam); fc.layers.set(CK.LAYER.feature); fc.layers.enable(CK.LAYER.holdout);
        r.render(scene, fc);
      }
      uBloom.value = P.bloom;
      if (P.bloom > 0) {
        uBloomT.value = P.bloomThreshold;
        r.setRenderTarget(rtB[0]); qBright.render(r);
        const tw = 1 / rtB[0].width, th_ = 1 / rtB[0].height;
        uBTexel.value.set(tw, th_);
        for (let pass = 0; pass < 3; pass++) {            // H: 0 -> 1, V: 1 -> 0 (the result ends in rtB[0])
          r.setRenderTarget(rtB[1]); qBlurH.render(r);
          r.setRenderTarget(rtB[0]); qBlurV.render(r);
        }
      } else {
        r.setRenderTarget(rtB[0]); r.setClearColor(0x000000, 1); r.clear();
      }
      scene.background = bg0;
      uThrough.value = th; uSS.value = P.ss; uTexel.value.set(1 / W_, 1 / H_);
      if (target) {
        r.setRenderTarget(target); r.setScissorTest(false); (alpha ? qCompA : qComp).render(r); r.setRenderTarget(null);
        return;
      }
      r.setRenderTarget(null);
      const yy = r.isWebGPURenderer ? y : ctx.h - y - h;
      r.setViewport(x, yy, w, h); r.setScissor(x, yy, w, h); r.setScissorTest(true);
      (alpha ? qCompP : qComp).render(r);
      r.setScissorTest(false);
      r.setViewport(0, 0, ctx.w, ctx.h);
    };
    P.dispose = () => { rtMain.dispose(); rtFeat.dispose(); rtB.forEach(b => b.dispose()); };
    return P;
  };

  // cameras in Blender's board terms (charkit.qa.render_view): az degrees round her (+ toward her left), dist and height
  // from the target, lens mm on a 36 mm sensor fitted to the longer side, or orthographic with ortho scale on the longer side
  CK.camera = ({ target, az = 0, dist = 1, height = 0, lens = 50, aspect = 1, ortho = null, near = 0.01, far = 100 }) => {
    const a = az * Math.PI / 180;
    const pos = new T.Vector3(target[0] + Math.sin(a) * dist, target[1] + height, target[2] + Math.cos(a) * dist);
    let cam;
    if (ortho) {
      const hh = aspect >= 1 ? ortho / aspect / 2 : ortho / 2, hw = hh * aspect;
      cam = new T.OrthographicCamera(-hw, hw, hh, -hh, near, far);
    } else {
      const half = Math.atan(18 / lens);
      const vfov = aspect >= 1 ? 2 * Math.atan(Math.tan(half) / aspect) : 2 * half;
      cam = new T.PerspectiveCamera(vfov * 180 / Math.PI, aspect, near, far);
    }
    cam.position.copy(pos); cam.lookAt(new T.Vector3(...target)); cam.updateMatrixWorld(true);
    return cam;
  };

  window.CK = CK;
})();
