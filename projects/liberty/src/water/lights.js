// liberty/src/water/lights.js: the lights' reflection (B3, round 6): the glitter the sea's own facets make of every light
// in the planar reflection, computed as the physics has it and drawn from that (shade.js). Rendered just before the water
// draws (index.js: the mesh's onBeforeRender, after the state pass), in four passes:
//   floor    the reflection's broad tones: each 4 x 4 block's least, then a 3 x 3 least and most of those (a grey opening
//            ~12 texels wide at a quarter of the reflection's size): what is narrower and brighter is a light
//   lights   the reflection less its broad tones (never below 0: a texel never darker than its floor), mipmapped and
//            anisotropic, its own depth (linear, the mirror camera's view z; 6e4 where it holds none) in alpha
//   glitter  at half the frame's size, per water pixel the expected radiance of its facets' reflection of those lights:
//            the facets' slopes (the resolved slope, Gaussian sigma_u each way: the state pass) integrated along the view
//            in M taps, each reading the lights through a footprint as wide across as one sigma of slope across throws
//            the reflected ray and as tall as the taps' spacing (the hardware's anisotropic filter); at each tap Fresnel
//            at its facet, the visible-normal weight (v.n) / (n_y Ew) (Ew = E[(v.n)+ / n_y], closed form) and Smith's
//            shadowing toward the light (Beckmann, Walter's fit); the light seen from the water point itself at the
//            mirror image's own depth there (the parallax: the ship's and the shed's lights are near)
// What it is measured against: the exact single scatter, per source tile, per water pixel (B3's ref.py, calibrated on
// synthetic single lights against the textbook glitter path; board/water/notes.md, round 6).
const T = window.THREE;

const FS_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FS_VERT3 = 'out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export function makeLightPasses(pipe, q) {
  const hrt = (o = {}) => new T.WebGLRenderTarget(4, 4, Object.assign({ type: T.HalfFloatType, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter }, o));
  const minRT = hrt({ minFilter: T.NearestFilter, magFilter: T.NearestFilter }), eroRT = hrt({ minFilter: T.NearestFilter, magFilter: T.NearestFilter }), floorRT = hrt();
  const exRT = hrt({ generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter });
  const glitRT = hrt({ generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter });   // (its mips: the local mean the near water's strokes are drawn against, shade.js)
  const mk = (frag, uniforms, glsl3) => new T.ShaderMaterial({ uniforms, vertexShader: glsl3 ? FS_VERT3 : FS_VERT, fragmentShader: frag, depthTest: false, depthWrite: false, glslVersion: glsl3 ? T.GLSL3 : null });
  // the floor: a block's least (4 x 4 texels of the reflection), then 3 x 3 least, then 3 x 3 most
  const minMat = mk(`uniform sampler2D tSrc; uniform vec2 uSrc; varying vec2 vUv;
    void main() {
      vec2 b = floor(gl_FragCoord.xy) * 4.0; vec3 m = vec3(1e9);
      for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) m = min(m, texture2D(tSrc, (min(b + vec2(float(i), float(j)), uSrc - 1.0) + 0.5) / uSrc).rgb);
      gl_FragColor = vec4(m, 1.0);
    }`, { tSrc: { value: null }, uSrc: { value: new T.Vector2() } });
  const m3Mat = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uMax; varying vec2 vUv;
    void main() {
      vec3 m = texture2D(tSrc, vUv).rgb;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec3 c = texture2D(tSrc, vUv + vec2(float(i), float(j)) * uTexel).rgb; m = uMax > 0.5 ? max(m, c) : min(m, c); }
      gl_FragColor = vec4(m, 1.0);
    }`, { tSrc: { value: null }, uTexel: { value: new T.Vector2() }, uMax: { value: 0 } });
  const exMat = mk(`uniform sampler2D tSrc; uniform sampler2D tFloor; uniform sampler2D tDepth; uniform float uUseDepth; uniform vec2 uNF; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tSrc, vUv).rgb, f = min(texture2D(tFloor, vUv).rgb, c);
      float zb = uUseDepth < 0.5 ? 1.0 : texture2D(tDepth, vUv).r;
      float d = zb >= 0.9999999 ? 1e4 : uNF.x * uNF.y / max(uNF.y - zb * (uNF.y - uNF.x), 1e-6);
      // (a: its luminance times its depth over 1e4 m (beyond, far: the sky, the sprites, which write none), so the mips
      // hold the lights' luminance-weighted depth round any place at any scale; over 1e4 m it overflowed a half float)
      gl_FragColor = vec4(c - f, dot(c - f, vec3(0.2126, 0.7152, 0.0722)) * min(d, 1e4) * 1e-4);
    }`, { tSrc: { value: null }, tFloor: { value: floorRT.texture }, tDepth: { value: null }, uUseDepth: { value: 0 }, uNF: { value: new T.Vector2(0.05, 9000) } });
  // the glitter (GLSL 3: texelFetch of the state, textureGrad of the lights)
  const M = Math.max(4, Math.min(24, +(q.get('wgm') || 10)));
  const gatMat = mk(`precision highp float;
    #define M ${M}
    #define GAT_FILTER ${q.get('wgf') === '0' ? 0 : 1}
    uniform sampler2D uState0; uniform sampler2D tEx;
    uniform mat4 uCamPInv; uniform mat4 uCamWorld; uniform mat4 uReflMatrix;
    uniform vec3 uCamPos; uniform vec3 uRcPos; uniform vec3 uRcFwd; uniform float uWL; uniform vec2 uFull; uniform vec4 uGat; uniform vec3 uGat2; uniform float uSlopeK;
    in vec2 vUv; layout(location = 0) out highp vec4 oC;
    float Phi(float z) {        // (the normal cdf: Abramowitz & Stegun 7.1.26, |error| < 1.5e-7)
      float x = abs(z) * 0.70710678, t = 1.0 / (1.0 + 0.3275911 * x);
      float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
      return 0.5 * (1.0 + sign(z) * y);
    }
    vec2 proj(vec3 X) { vec4 c = uReflMatrix * vec4(X, 1.0); return c.xy / c.w * 0.5 + 0.5; }
    // the lights' depth (m) round uv at a mip level: the luminance-weighted mean (exMat's alpha); none: far
    float zL(vec2 uv, float lod, float zNone) { vec4 e = textureLod(tEx, clamp(uv, 0.0, 1.0), lod); float l = dot(e.rgb, vec3(0.2126, 0.7152, 0.0722)); return l > 1e-7 ? 1e4 * e.a / l : zNone; }
    // the distance along R from the water point to the mirror camera's view depth z
    float tOf(float z, vec3 R, float pr) { return z >= 9e3 ? 1e5 : max((z - pr) / max(dot(R, uRcFwd), 1e-3), 0.3); }
    void main() {
      ivec2 qq = min(ivec2(gl_FragCoord.xy) * 2 + ivec2(0, 1), ivec2(uFull) - 1);   // (the block's top-left pixel)
      vec4 s0 = texelFetch(uState0, qq, 0);
      if (s0.z <= 0.0) { oC = vec4(0.0); return; }                                  // (no water here: the state pass's clear)
      // the view ray through the 2 x 2 block's centre, and the water point on the mean surface
      vec2 ndc = (vec2(ivec2(gl_FragCoord.xy) * 2) + 1.0) / uFull * 2.0 - 1.0;
      vec4 vp = uCamPInv * vec4(ndc, 0.5, 1.0);
      vec3 dv = normalize(mat3(uCamWorld) * (vp.xyz / vp.w));
      if (dv.y > -1e-5) { oC = vec4(0.0); return; }
      vec3 V = -dv, P = uCamPos + dv * (uWL - uCamPos.y) / dv.y;
      // (the unresolved slopes' spread as the mirror reads it: the sea state's, x uSlopeK (?wslope=), fitted to photographs
      // of the waterfront at night (round 7: 0.03-0.11 per axis, median 0.06, against the sea state's 0.11-0.12))
      vec2 sl = s0.xy; float sg = sqrt(max(s0.z * 0.5, 4e-6)) * uSlopeK;
      vec3 Nr = normalize(vec3(-sl.x, 1.0, -sl.y));
      // Ew: (v.n) / n_y = v_y - s.v_xz for the facet slope s ~ N(sl, sg^2): a Gaussian, its positive part's mean
      float mu = V.y - dot(sl, V.xz), ss = max(sg * length(V.xz), 1e-6), z = mu / ss;
      float Ew = max(mu * Phi(z) + ss * 0.39894228 * exp(-0.5 * z * z), 1e-6);
      // the parallax: where each tap's ray meets the lights. A tilted facet's ray sees other things than the flat mirror's
      // (taking the flat mirror's depth for every tap read the shed's windows for rays bound for the sky: 1.5x the light,
      // 6x at the far shore), so each tap finds its own: the lights' depth round the flat mirror point at a coarse level,
      // then twice at finer levels round where that puts the tap (coarse to fine: a near light's parallax is many texels)
      vec2 uP = proj(P);
      // (first, a light round the flat mirror point itself, finely: a light at the water's edge seen from afar (the
      // marina, the shore, a boat from the aerial) mirrors right under itself, from water a few metres off it, where
      // only its own depth to the metre finds it (from the coarse start the A1 marina's reflections came out at 0.12 of
      // the exact single scatter's, spread up the bay); else coarse to fine from the coarse level)
      float pr = dot(P - uRcPos, uRcFwd), zf = zL(uP, uGat2.x, 1e4);
      bool fine = zf < 9e3 && uGat2.x >= 0.0;                                     // (?wgat2=-1,..: the coarse start alone)
      float z0 = fine ? zf : zL(uP, uGat.w, 1e4), l1 = fine ? uGat2.y : uGat.w - 2.0, l2 = fine ? uGat2.z : uGat.w - 4.0;
      vec2 fw = normalize(-V.xz + 1e-7), sd = vec2(-fw.y, fw.x);
      // the taps: uniform in the along-view slope over +-uGat.x sigma, Gaussian weights; their reflections' places
      float span = uGat.x, dg = 2.0 * span / float(M - 1);
      vec2 uvs[M]; vec3 Rs[M], Ns[M]; float ts[M];
      for (int k = 0; k < M; k++) {
        vec2 s = sl + sg * (-span + dg * float(k)) * fw;
        vec3 n = normalize(vec3(-s.x, 1.0, -s.y)), R = reflect(-V, n);
        // (where a finer level finds no light round the place, the depth found so far stands: reverting to far there
        // put a near light's glitter where a far one's would be, its rays aimed at it from the mirror camera)
        float z = z0, t = tOf(z, R, pr);
        z = zL(proj(P + R * t), l1, z); t = tOf(z, R, pr);
        z = zL(proj(P + R * t), l2, z); t = tOf(z, R, pr);
        Ns[k] = n; Rs[k] = R; ts[k] = t; uvs[k] = proj(P + R * t);
      }
      vec3 acc = vec3(0.0); float wsum = 0.0;
      for (int k = 0; k < M; k++) {
        float g = -span + dg * float(k), w = exp(-0.5 * g * g);
        wsum += w;
        vec3 R = Rs[k], n = Ns[k];
        float nv = dot(n, V);
        if (R.y <= 0.0 || nv <= 0.0) continue;                                      // (into the water, or a back face)
        vec2 uv = uvs[k];
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;         // (beyond what the mirror saw)
        int k0 = max(k - 1, 0), k1 = min(k + 1, M - 1);
        vec2 da = (uvs[k1] - uvs[k0]) / float(k1 - k0);                             // (the taps' spacing: the footprint's height)
        vec2 s2 = sl + sg * (g * fw + sd);
        vec2 db = proj(P + reflect(-V, normalize(vec3(-s2.x, 1.0, -s2.y))) * ts[k]) - uv;   // (one sigma across)
#if GAT_FILTER
        vec3 L = textureGrad(tEx, uv, db * uGat.y, da * uGat.z).rgb;
#else
        vec3 L = textureLod(tEx, uv, 0.0).rgb;                                       // (?wgf=0: unfiltered, a check)
#endif
        float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
        float c = clamp(dot(R, Nr), 1e-4, 1.0), a = c / sqrt(max(1.0 - c * c, 1e-8)) / (1.41421356 * sg);
        float G1 = a < 1.6 ? (3.535 * a + 2.181 * a * a) / (1.0 + 2.276 * a + 2.577 * a * a) : 1.0;
        acc += w * F * nv / (n.y * Ew) * G1 * L;
      }
      // (a: its luminance squared, x 900 (half-float range: 1e-3 to 8 kept): the mips' local mean of it is what the near
      // water's strokes are normalised by, shade.js)
      vec3 Lo = acc / wsum; float lo = dot(Lo, vec3(0.2126, 0.7152, 0.0722));
      oC = vec4(Lo, min(900.0 * lo * lo, 6e4));
    }`, { uState0: { value: null }, tEx: { value: exRT.texture }, uCamPInv: { value: new T.Matrix4() }, uCamWorld: { value: new T.Matrix4() }, uReflMatrix: pipe.U.uReflMatrix || (pipe.U.uReflMatrix = { value: new T.Matrix4() }),
    uCamPos: { value: new T.Vector3() }, uRcPos: { value: new T.Vector3() }, uRcFwd: { value: new T.Vector3() }, uWL: { value: 0 }, uFull: { value: new T.Vector2() },
    // (the taps' span in sigmas; the footprint across as a multiple of one sigma's throw; along, of the taps' spacing;
    // the coarsest mip level the lights' depth is read at. Across: the hardware's anisotropic footprint is about twice
    // its gradient wide at the level it picks, so 1, not a box's sqrt(12): at 9.0 the light's energy 0.97 of the exact
    // single scatter and its columns' profile r 0.94, where 3.46 drew 1.31x and r 0.79, a wash of light)
    uGat: { value: new T.Vector4(...(q.get('wgat') || '2.7,1,1,6').split(',').map(Number)) },
    uGat2: { value: new T.Vector3(...(q.get('wgat2') || '1,1,0').split(',').map(Number)) },   // (the fine start's mip levels: where it looks round the flat mirror point, then its two refinements)
    uSlopeK: { value: +(q.get('wslope') || 0.5) } }, true);   // (the unresolved slopes' spread the mirror reads, x this: fitted to photographs, round 7)
  const fsCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsGeo = new T.PlaneGeometry(2, 2);
  const quad = m => { const sc = new T.Scene(), qd = new T.Mesh(fsGeo, m); qd.frustumCulled = false; sc.add(qd); return sc; };
  const minS = quad(minMat), m3S = quad(m3Mat), exS = quad(exMat), gatS = quad(gatMat);
  const fwd = new T.Vector3();
  return {
    exRT, glitRT, floorRT, gatMat, exMat,
    // (renderer: inside the water's own draw; state: the state pass's target 0 at the frame's size)
    render(renderer, camera, stateTex, stateRT) {
      const src = pipe.RT_REFL, rw = src.width, rh = src.height, qw = Math.ceil(rw / 4), qh = Math.ceil(rh / 4);
      const fw = stateRT.width, fh = stateRT.height, gw = Math.ceil(fw / 2), gh = Math.ceil(fh / 2);
      if (minRT.width !== qw || minRT.height !== qh) { minRT.setSize(qw, qh); eroRT.setSize(qw, qh); floorRT.setSize(qw, qh); }
      if (exRT.width !== rw || exRT.height !== rh) { exRT.setSize(rw, rh); exRT.texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy()); exRT.texture.needsUpdate = true; }
      if (glitRT.width !== gw || glitRT.height !== gh) glitRT.setSize(gw, gh);
      const prev = renderer.getRenderTarget();
      minMat.uniforms.tSrc.value = src.texture; minMat.uniforms.uSrc.value.set(rw, rh);
      renderer.setRenderTarget(minRT); renderer.render(minS, fsCam);
      m3Mat.uniforms.tSrc.value = minRT.texture; m3Mat.uniforms.uTexel.value.set(1 / qw, 1 / qh); m3Mat.uniforms.uMax.value = 0;
      renderer.setRenderTarget(eroRT); renderer.render(m3S, fsCam);
      m3Mat.uniforms.tSrc.value = eroRT.texture; m3Mat.uniforms.uMax.value = 1;
      renderer.setRenderTarget(floorRT); renderer.render(m3S, fsCam);
      exMat.uniforms.tSrc.value = src.texture; exMat.uniforms.tDepth.value = src.depthTexture || null; exMat.uniforms.uUseDepth.value = src.depthTexture ? 1 : 0;
      if (pipe.reflCam) exMat.uniforms.uNF.value.set(pipe.reflCam.near, pipe.reflCam.far);
      renderer.setRenderTarget(exRT); renderer.render(exS, fsCam);
      const G = gatMat.uniforms;
      G.uState0.value = stateTex; G.uFull.value.set(fw, fh);
      G.uCamPInv.value.copy(camera.projectionMatrixInverse); G.uCamWorld.value.copy(camera.matrixWorld);
      G.uCamPos.value.setFromMatrixPosition(camera.matrixWorld); G.uWL.value = pipe.U.uWaterLevel.value;
      if (pipe.reflCam) { G.uRcPos.value.copy(pipe.reflCam.position); G.uRcFwd.value.copy(pipe.reflCam.getWorldDirection(fwd)); }
      renderer.setRenderTarget(glitRT); renderer.render(gatS, fsCam);
      renderer.setRenderTarget(prev);
    },
  };
}
