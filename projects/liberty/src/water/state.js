// liberty/src/water/state.js: the sea's state, the first of the water's two passes. Rendered just before the water
// draws (index.js: the mesh's onBeforeRender), on the same mesh with the same placement and displacement, into three
// half-float targets at the frame's size; the surface's own shading (shade.js) reads them at its pixel. Splitting the
// work halves each program: one large program's register pressure, not any one part, had set the water's cost (B3's
// cost round: every part removed saved 0.4-2.2 ms, more together than the whole).
//   target 0  the slope (x, z) with the events and wakes, the unresolved and the resolved slope variance
//   target 1  the drawn scale (13+ px a wavelength): its slope (x, z), its height, its slope variance (wakes included)
//   target 2  its height variance, the blasts' darkening, the white water (0..1: the events' foam and the wakes'
//             churn; above 1: E7's ring line), the wakes' cusp lines
import { COMMON } from 'scene3d/glsl.js';
import { SURFACE_GLSL, VERTEX_GLSL } from './surface.js';
import { EVENTS_GLSL } from './events.js';

const T = window.THREE;

const STATE_VERT = /* glsl */`
uniform float uTime;
out float vRing; out vec3 vP;   // (vRing: the vertex hook writes it; unused here)
${VERTEX_GLSL}
invariant gl_Position;    // (the water's own draw must cover the same pixels: mat.js's VERT, the same arithmetic)
void main() {
  vec3 P = (modelMatrix * vec4(position, 1.0)).xyz, Nn = normal; vec2 u = uv;
  worldVertex(P, Nn, u);
  vP = P;
  vec4 vp = viewMatrix * vec4(P, 1.0);
  gl_Position = projectionMatrix * vp;
}`;

const STATE_FRAG = /* glsl */`
uniform float uTime;
uniform vec4 uLook2;
uniform vec4 uDbg2;
${COMMON}
${SURFACE_GLSL}
${EVENTS_GLSL}
in vec3 vP;
layout(location = 0) out highp vec4 oS0;
layout(location = 1) out highp vec4 oS1;
layout(location = 2) out highp vec4 oS2;
void main() {
  vec3 P = vP;
  vec2 dpx = dFdx(P.xz), dpy = dFdy(P.xz);
  float fp = max(length(dpx), length(dpy));
  vec3 hn = hullAt(P.xz);
  float uvar, rvar, efoam, wcusp, wvar;
  vec4 sea = seaAt(P.xz, dpx, dpy, hn, uvar, rvar);
  vec4 ev = eventsAt(P.xz, uTime, fp, dpx, dpy, efoam);
  vec4 wk = wakesAt(P.xz, fp, wcusp, wvar);
  vec2 sl = sea.xy * ev.z + ev.xy + wk.xy;
  uvar = uvar * ev.z * ev.z + wvar; rvar *= ev.z * ev.z;
  // (the wakes stay out of the drawn scale's tones: a boat's transverse waves near the eye drew a field of regular
  // rings (the director's review); they show in the mirror's slope, the cusp lines and the churn)
  // the churn: the wakes' foam strip broken into patches (W6)
  float ch = wk.w * (0.55 + 0.3 * vnoise(P.xz * 0.28 + uTime * 0.05) + 0.15 * vnoise(P.xz * 0.9 - uTime * 0.1)), chw = fwidth(ch) + 1e-3;
  float foam = max(saturate(efoam) * uLook2.z, smoothstep(0.5 - chw, 0.5 + chw, ch) * 0.85);
  float pline, pfoam = pilesAt(P.xz, envAt(P.xz).gb, fp, pline);   // (the piles in the ebb: piles.js)
  foam = max(foam, pfoam); if (pline > wcusp) wcusp = -pline;   // (a pile's wake line: negative, drawn lighter than foam, shade.js)
  float code = gRingLine > 0.004 ? 1.0 + saturate(gRingLine) : foam;
  oS0 = vec4(sl, uvar, rvar);
  oS1 = vec4(gShape, gShapeH, gShapeVar);
  oS2 = vec4(gShapeHVar, ev.w, code, wcusp);
}`;

// the pass: its targets, its material (sharing the surface's uniforms), its render from inside the water's own draw
export function makeStatePass(pipe, U, geo) {
  const rt = new T.WebGLRenderTarget(4, 4, { count: 3, type: T.HalfFloatType, depthBuffer: false, minFilter: T.NearestFilter, magFilter: T.NearestFilter });
  const mat = new T.ShaderMaterial({ glslVersion: T.GLSL3, uniforms: Object.assign({ uTime: pipe.U.uTime }, U), defines: { WCOST: 0 }, vertexShader: STATE_VERT, fragmentShader: STATE_FRAG, depthTest: false, depthWrite: false });
  const scene = new T.Scene(), mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.layers.enableAll(); scene.add(mesh);
  const clear = new T.Color(0, 0, 0);
  return {
    rt, textures: rt.textures,
    // (at the size of the target the water is about to draw into: the frame, or a mirror's smaller one; the shading reads
    // its own pixel with texelFetch, so the two passes agree at any size)
    render(renderer, camera) {
      const prev = renderer.getRenderTarget(), db = prev ? null : renderer.getDrawingBufferSize(new T.Vector2());
      const w = prev ? prev.width : db.x, h = prev ? prev.height : db.y;
      if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
      const pc = renderer.getClearColor(new T.Color()), pa = renderer.getClearAlpha();
      renderer.setRenderTarget(rt); renderer.setClearColor(clear, 0); renderer.clear(true, false, false);
      renderer.render(scene, camera);
      renderer.setClearColor(pc, pa); renderer.setRenderTarget(prev);
    },
  };
}
