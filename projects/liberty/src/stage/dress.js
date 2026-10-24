// liberty/src/stage/dress.js: the ship dressed for the night, sparingly (she is a memorial; the show is in her honour):
//   festoons  warm bulbs (2700 K) on their own lines from the jackstaff over the mastheads to the ensign staff, 0.4 m
//             under B2's dressing lines of code flags (a ship 'dressed with lights' carries both), a bulb every 0.6 m;
//             drawn as points of light at least 2 px across (style K3: lamps are crisp points that bloom a little)
//   banner    on the stage's skirt, the one band of the stage the apron sees whole (between the lip and the bulwark's
//             cap): white capitals on black, her name and her year
import { Geo } from './geo.js';
import { smat } from './mats.js';

const T = window.THREE;

export function buildDress(world, M, L, ctx) {
  const P = ctx.P, S = P.SHIP, deck = ctx.mods.deck && !ctx.mods.deck.failed ? ctx.mods.deck : null;
  const out = { bulbs: 0, legs: [] };
  // ---- the festoon's anchors (ship coordinates, as B2's dressing lines: deck/fittings.js), 0.4 m under each
  const DM = deck && deck.masts ? Object.fromEntries(deck.masts.map(m => [m.name, m])) : null;
  const ship = w => S.fromWorld(w[0], w[1], w[2]);
  const jz = S.stemZ + 0.76, jy1 = S.sideAbl(S.stemZ + 0.8) + 1.5 + 3.05;
  const foreTop = DM && DM.fore ? (c => [0, c[1] + 3.86, c[2]])(ship(DM.fore.cap)) : [0, S.deckAbl(0, S.masts.fore.z) + S.masts.fore.above + 3.86, S.masts.fore.z];
  const truckTop = (nm, m) => (DM && DM[nm] && DM[nm].truck ? (c => [0, c[1] + 0.14, c[2]])(ship(DM[nm].truck)) : [0, S.deckAbl(0, m.z) + m.top + 0.14, m.z]);
  const anchorsShip = [[0, jy1, jz], foreTop, truckTop('main', S.masts.main), truckTop('mizzen', S.masts.mizzen), [-2.5, S.stern.platform.abl + 4.2, S.stern.platform.z1 - 1.5]];
  const anchors = anchorsShip.map(a => S.toWorld(a[0], a[1] - 0.4, a[2]));
  // ---- the lines: a catenary each (parabola, sag 2.5 % of the span), a bulb every 0.6 m
  const wire = new Geo(), bulbs = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1], span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), sag = 0.025 * span;
    const at = u => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - 4 * sag * u * (1 - u), a[2] + (b[2] - a[2]) * u];
    const n = Math.max(8, Math.round(span / 1.5));
    for (let k = 0; k < n; k++) wire.tube(at(k / n), at((k + 1) / n), 0.005, 4, 0.5);
    const nb = Math.floor(span / 0.6);
    for (let k = 1; k < nb; k++) { const p = at(k / nb); bulbs.push([p[0], p[1] - 0.06, p[2]]); }
    out.legs.push({ span: +span.toFixed(1), sag: +sag.toFixed(2), bulbs: nb - 1 });
  }
  out.bulbs = bulbs.length;
  world.mesh(wire.geometry(), M.cable, { name: 'festoon wire', cast: false });
  // the bulbs: points of warm light, an unlit additive sprite each, at least 2 px across
  const g = new T.InstancedBufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  const at = new T.InstancedBufferAttribute(new Float32Array(bulbs.flat()), 3); g.setAttribute('iB', at); g.instanceCount = bulbs.length;
  const U = world.U, bulbMat = new T.ShaderMaterial({
    name: 'festoon bulbs', uniforms: { uResolution: U.uResolution, uClip: U.uClip, uOn: { value: 1 }, uMirrorPx: U.uMirrorPx || (U.uMirrorPx = { value: 0 }) },      // (the ship's dressing, not the show: on in ?stagedark too; uMirrorPx: the water's, below)
    // a bulb is at least 2 px across (a point of light never vanishes between pixels), the pixel's true size taken from
    // the camera's own projection (a long lens far off makes it small). It stays a bright point (style K3) until it starts
    // to overlap its neighbours on screen (0.6 m apart): then each carries only its share, so the string's line keeps the
    // brightness of one bulb instead of summing to a white band; once truly sub-pixel it fades gently (^0.4) with distance
    // In a mirror's pass (the water's reflection, the stage floor's: uClip set) the bulb carries its true light instead
    // (B3, the integrator's round 4: a reflection never outweighs its source): drawn at least 2 texels of the mirror's
    // smaller target across (uMirrorPx: the frame's pixels a texel; uResolution is the frame's there) so it never falls
    // between texels, at its true energy (r0^2 of the drawn r^2), where the frame's 2-px point carried many times its own
    // light into the water's strokes. uMirrorPx 0 (?wcov=0): as the frame draws it
    vertexShader: `attribute vec3 iB; uniform vec2 uResolution; uniform vec4 uClip; uniform float uMirrorPx; varying vec2 vUv; varying vec3 vW; varying float vK;
      void main() {
        vec3 vd = normalize(cameraPosition - iB), rt = normalize(cross(vec3(0.0, 1.0, 0.0), vd) + vec3(1e-5, 0.0, 0.0)), up = cross(vd, rt);
        vec4 vp = viewMatrix * vec4(iB, 1.0);
        float px = 2.0 * max(-vp.z, 0.01) / (max(uResolution.y, 1.0) * projectionMatrix[1][1]);
        float r0 = 0.05, r = max(r0, px);
        vK = min(1.0, 0.6 / (2.0 * r)) * clamp(pow(r0 / r, 0.4), 0.35, 1.0);
        if (uMirrorPx > 0.0 && uClip.y > 0.5) { r = max(r0, 2.0 * px * uMirrorPx); vK = (r0 / r) * (r0 / r); }
        vec3 P = iB + (rt * position.x + up * position.y) * r * 2.0;
        vUv = position.xy * 2.0; vW = P; gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
      }`,
    fragmentShader: `uniform vec4 uClip; uniform float uOn; varying vec2 vUv; varying vec3 vW; varying float vK;
      void main() { if (dot(vW, uClip.xyz) + uClip.w < 0.0) discard; float r = length(vUv);
        float core = 1.0 - smoothstep(0.42, 0.55, r), halo = exp(-r * r * 2.2) * 0.35;
        gl_FragColor = vec4(vec3(2.3, 1.45, 0.62) * (core + halo) * uOn * vK, 0.0); }`,
    transparent: true, depthWrite: false,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor,
  });
  const bm = world.mesh(g, { color: bulbMat }, { name: 'festoon bulbs', trans: true, cast: false, id: false, gbuf: false, frustum: false });
  bm.userData.loose = 'festoon bulbs on their wire';
  // ---- the banner on the skirt: the band between the lip and the bulwark's cap, the width of the stage less its stairs
  const D = L.deck, y1 = L.F - 0.12, y0 = Math.max(P.STAGE.bulwarkCap + 0.06, y1 - 0.5), z0 = D.z0 + 0.6, z1 = D.z1 - 0.6;
  const cv = document.createElement('canvas'); cv.width = 4096; cv.height = Math.round(4096 * (y1 - y0) / (z1 - z0));
  const c2 = cv.getContext('2d');
  c2.fillStyle = '#121216'; c2.fillRect(0, 0, cv.width, cv.height);
  c2.fillStyle = '#c9a24a'; c2.fillRect(0, cv.height * 0.08, cv.width, cv.height * 0.035); c2.fillRect(0, cv.height * 0.885, cv.width, cv.height * 0.035);
  c2.fillStyle = '#ece8dd'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.font = `bold ${Math.round(cv.height * 0.56)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  c2.fillText("SS JEREMIAH O'BRIEN  ★  1943", cv.width / 2, cv.height * 0.52);
  const tex = new T.CanvasTexture(cv); tex.colorSpace = T.NoColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  const banMat = smat(world, { name: 'stage banner', uniforms: { uTex: { value: tex } },
    body: `vec3 c = texture2D(uTex, vec2(uv.x, uv.y)).rgb; c = pow(c, vec3(2.2)); toon(s, c); s.rough = 0.85;` });
  const bg = new T.PlaneGeometry(z1 - z0, y1 - y0); bg.rotateY(Math.PI / 2); bg.translate(D.x1 + 0.024, (y0 + y1) / 2, (z0 + z1) / 2);
  bg.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(bg.attributes.position.count), 1));
  world.mesh(bg, banMat, { name: 'stage banner' });
  out.banner = { text: "SS JEREMIAH O'BRIEN ★ 1943", w: +(z1 - z0).toFixed(2), h: +(y1 - y0).toFixed(2) };
  return out;
}
