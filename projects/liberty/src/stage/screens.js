// liberty/src/stage/screens.js: the LED wall and its wings (style C5: a flat emissive plane in the section's hue with a
// radial streak burst from its brightest point on the beats, 20-30 lines; trussed wing panels with rows of dot lights,
// dots 1-2 % of the frame's width every ~3 %). Screens don't bloom (C10): their emissive stays under the bloom's
// threshold. Up close the wall resolves into its pixels (S5: ROE CB5, 5.77 mm pitch) and its panels' seams.
import { Geo } from './geo.js';
import { glowMat } from './mats.js';
import { LOOKS, rampLin } from './palette.js';

const T = window.THREE;

// the wall's content: 8 looks (palette.js LOOKS[].wall), each a flat field in the key family with the accent's shapes
const WALL_GLSL = /* glsl */`
// key family (deep, mid), accent (mid, bright), the previous look's key and accent
uniform vec3 uKA; uniform vec3 uKB; uniform vec3 uAA; uniform vec3 uAB; uniform vec3 uPKA; uniform vec3 uPAA;
uniform vec4 uState;                            // beat, phase in the beat, energy, section progress
uniform vec4 uState2;                           // pattern, previous pattern, fade (0 the previous .. 1 this), pulse
uniform vec4 uState3;                           // on (house light before the show), dark (after the blackout), gain, pixel pitch (m)
uniform vec4 uState4;                           // the build's chevrons' phase (cycles: cues.js screenState, integrated over the section)
uniform vec4 uRect;                             // the wall's z0, z1, y0, y1
uniform float uCard; uniform sampler2D uCardTex;  // the standby card (before and after the show) and how much of it shows
float rays(vec2 q, float n, float w) { float a = atan(q.y, q.x) / 6.28318 * n; return smoothstep(w, 0.0, abs(fract(a) - 0.5) - (0.5 - w)); }
vec3 pattern(float id, vec2 p, vec2 q, vec3 KA, vec3 KB, vec3 AA, vec3 AB) {
  float b = uState.x, ph = uState.y, en = uState.z, pr = uState.w, pulse = uState2.w, r = length(q);
  int k = int(id + 0.5);
  if (k == 0) {          // dawn: a horizon, the sun's disc rising through bands
    float sun = smoothstep(0.24, 0.22, length(q - vec2(0.0, -0.55 + 0.6 * pr)));
    float bands = step(0.5, fract(p.y * 6.0 - b * 0.05));
    return mix(KA, mix(KB, AA, smoothstep(0.1, 0.0, p.y)), 0.4 + 0.3 * bands) * 0.85 + AB * sun;
  } else if (k == 1) {   // verse: slow rings drifting out from the centre, outlined
    float rr = fract(r * 2.2 - b * 0.0625);
    return mix(KA, KB, 0.55) + AA * smoothstep(0.06, 0.0, abs(rr - 0.5) - 0.02) * 0.8;
  } else if (k == 2) {   // build: chevrons climbing, faster as it builds (the phase integrated: beat x rate(progress) ran
    // at beat 140 x 0.75 x the progress's own rate, ~7 cycles a second, a flash field: tools/flashcheck.py, the second cut)
    float c = fract((p.y - abs(q.x) * 0.6) * 4.0 - uState4.x);
    return mix(KA, KB, step(0.5, c)) + AB * pulse * 0.25;
  } else if (k == 3) {   // drop: the radial burst on every beat, rings snapping out
    float burst = rays(q, 26.0, 0.12) * (0.35 + 0.65 * pulse) * smoothstep(1.8, 0.1, r);
    float ring = smoothstep(0.05, 0.0, abs(r - ph * 1.6) - 0.02) * (1.0 - ph);
    return mix(KA, KB, 0.45 + 0.35 * pulse) + AB * burst + AA * ring;
  } else if (k == 4) {   // break: deep field, one pale pillar
    return KA * 0.8 + AB * smoothstep(0.09, 0.07, abs(q.x)) * 0.9;
  } else if (k == 5) {   // bridge: scanlines and a slow wave
    float w = sin(q.x * 6.0 + b * 0.4) * 0.15;
    return mix(KA, KB, step(0.5, fract((p.y + w) * 10.0))) * 0.9 + AA * smoothstep(0.02, 0.0, abs(q.y - w));
  } else if (k == 6) {   // final: fire tongues rising under a burst
    float tong = step(fract(q.x * 5.0 + 0.5 * sin(b * 0.9 + q.x * 13.0)), 0.5 + 0.45 * sin(p.y * 9.0 - b * 1.5));
    float burst = rays(q, 22.0, 0.14) * pulse * smoothstep(1.6, 0.2, r);
    return mix(KA, KB, tong * smoothstep(0.9, 0.0, p.y)) + AB * burst + AA * 0.25 * pulse;
  }
  return KA * (1.0 - pr);  // outro: the field cooling to dark
}
vec3 wallAt(vec3 P, out float pix) {
  vec2 p = vec2((P.z - uRect.x) / (uRect.y - uRect.x), (P.y - uRect.z) / (uRect.w - uRect.z));
  vec2 q = (p - 0.5) * vec2((uRect.y - uRect.x) / (uRect.w - uRect.z), 1.0) * 2.0;
  vec3 a = pattern(uState2.y, p, q, uPKA, uPKA, uPAA, uPAA);
  vec3 c = pattern(uState2.x, p, q, uKA, uKB, uAA, uAB);
  c = mix(a, c, uState2.z);
  c *= uState3.x * (1.0 - uState3.y);
  // the standby card: its own image, dim, in place of the show's content
  vec3 card = pow(texture2D(uCardTex, vec2(1.0 - p.x, p.y)).rgb, vec3(2.2)) * 0.55;     // (z runs right to left seen from the pier)
  c = mix(c, card, uCard);
  // the pixels (5.77 mm pitch) and the panels' seams (600 x 1200), shown only where they span enough pixels on screen
  vec2 pp = vec2(P.z, P.y) / uState3.w, fw = fwidth(pp);
  float dots = smoothstep(0.42, 0.3, length(fract(pp) - 0.5));
  float vis = smoothstep(0.5, 0.25, max(fw.x, fw.y));
  vec2 seam = abs(fract(vec2((P.z - uRect.x) / 0.6, (P.y - uRect.z) / 1.2) + 0.5) - 0.5) * vec2(0.6, 1.2);
  float sm = 1.0 - smoothstep(0.0, max(fwidth(P.z), fwidth(P.y)) * 1.5 + 0.002, min(seam.x, seam.y));
  pix = mix(1.0, mix(0.15, 1.0, dots), vis) * (1.0 - 0.6 * sm);
  return c;
}
`;

// the standby card (a canvas, 2:1 as the wall): navy, a ring and a star, her name and her year under a thin gold line
function standbyCard() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#0c1630'); g.addColorStop(1, '#060b18'); c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
  c.strokeStyle = '#c9a24a'; c.lineWidth = 5; c.beginPath(); c.arc(512, 200, 92, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#e9e3d4'; c.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 30 : 74, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(512 + Math.cos(a) * r, 200 + Math.sin(a) * r); }
  c.closePath(); c.fill();
  c.fillStyle = '#c9a24a'; c.fillRect(312, 330, 400, 3);
  c.fillStyle = '#e9e3d4'; c.textAlign = 'center'; c.font = 'bold 54px "Helvetica Neue", Helvetica, Arial, sans-serif'; c.fillText("SS JEREMIAH O'BRIEN", 512, 400);
  c.font = '34px "Helvetica Neue", Helvetica, Arial, sans-serif'; c.fillText('1943', 512, 450);
  const tex = new T.CanvasTexture(cv); tex.colorSpace = T.NoColorSpace;
  return tex;
}
// the same card composed for an IMAG face (portrait, 2:3, as the face): the ring and the star, then her name in two lines
// ('SS JEREMIAH' over "O'BRIEN") and her year, each line sized to sit inside a 10 % margin. (The faces showed the wall's
// card through the wall's mapping, its middle third: 'EREMIAH O'B', cut at both sides; the director, exploring the
// published site, 2026-10-24: 'are the banners like this actually cut off in real life?')
export const CARD_P = { w: 512, h: 768, margin: 0.1 };
export function portraitCard() {
  const W = CARD_P.w, H = CARD_P.h, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0c1630'); g.addColorStop(1, '#060b18'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.32;
  c.strokeStyle = '#c9a24a'; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, W * 0.24, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#e9e3d4'; c.beginPath();
  for (let i = 0; i < 10; i++) { const r = (i % 2 ? 0.065 : 0.16) * W, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  c.closePath(); c.fill();
  c.fillStyle = '#c9a24a'; c.fillRect(W * 0.2, H * 0.6, W * 0.6, 4);
  c.fillStyle = '#e9e3d4'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  // each line at its size, shrunk until it fits the margin (the measure: CARD_P.fit, read back by measure tools)
  const fit = (txt, px, bold) => { let f = px; do { c.font = `${bold ? 'bold ' : ''}${f}px "Helvetica Neue", Helvetica, Arial, sans-serif`; } while (c.measureText(txt).width > W * (1 - 2 * CARD_P.margin) && --f > 8); return { txt, px: f, w: Math.round(c.measureText(txt).width) }; };
  CARD_P.fit = [];
  for (const [txt, px, bold, y] of [['SS JEREMIAH', 64, true, 0.70], ["O'BRIEN", 64, true, 0.79], ['1943', 40, false, 0.87]]) {
    const r = fit(txt, px, bold); c.fillText(txt, W / 2, H * y); CARD_P.fit.push(r);
  }
  const tex = new T.CanvasTexture(cv); tex.colorSpace = T.NoColorSpace;
  return tex;
}

export function buildScreens(world, L, cues, M) {
  const led = L.led;
  const U = {
    uKA: { value: new T.Vector3() }, uKB: { value: new T.Vector3() }, uAA: { value: new T.Vector3() }, uAB: { value: new T.Vector3() },
    uPKA: { value: new T.Vector3() }, uPAA: { value: new T.Vector3() },
    uState: { value: new T.Vector4() }, uState2: { value: new T.Vector4() }, uState3: { value: new T.Vector4(1, 0, 1, led.pitch) }, uState4: { value: new T.Vector4() },
    uRect: { value: new T.Vector4(led.z0, led.z1, led.y0, led.y1) },
    uCard: { value: 0 }, uCardTex: { value: standbyCard() },
  };
  // the screen's gain: C5's V .6-.9 on the frame under C10's no-bloom rule (the bloom's threshold 1.4 at exposure
  // 1.4: an emissive near 1 lands about V .85 after the tone map; measure.js reads it back)
  const GAIN = 0.62;
  const wallMat = glowMat(world, 'led wall', { uniforms: U, glsl: WALL_GLSL,
    body: `float pix; vec3 c = wallAt(P, pix); s.albedo = vec3(0.015); s.emissive = c * pix * ${GAIN.toFixed(3)} * uState3.z;` });
  const face = new Geo();
  // the face: 12 x 3 panels, each its own quad set slightly proud of the frame
  for (let i = 0; i < led.cols; i++) for (let j = 0; j < led.rows; j++) {
    const z0 = led.z0 + i * 0.6, y0 = led.y0 + j * 1.2;
    face.box([led.x + 0.005, y0 + 0.6, z0 + 0.3], [0.01, 1.198, 0.598], 0, 0.5);
  }
  world.mesh(face.geometry(), wallMat, { name: 'led wall face' });
  // the IMAG screens: the same content (until the film's cameras feed them the band), tipped toward the apron. Their
  // pattern is drawn in their own frame: the material maps P onto the wall's rectangle through uImag
  const qv = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
  const imagMat = glowMat(world, 'imag face', { uniforms: Object.assign({}, U, { uImag: { value: Array.from({ length: 2 }, () => new T.Vector4()) },
      uCardP: { value: portraitCard() }, uCardPOn: { value: qv.get('imagcard') === 'v0' ? 0 : 1 } }),
    glsl: WALL_GLSL + 'uniform vec4 uImag[2]; uniform sampler2D uCardP; uniform float uCardPOn;',
    body: `int k = sd < 0.5 ? 0 : 1; vec4 im = uImag[k];
           // the screen's own (z, y) mapped onto the wall's rectangle (its middle third, as an IMAG feed crops: the show's
           // abstract content); the standby card is the face's own, composed for its aspect (portraitCard)
           vec3 Q = vec3(P.x, uRect.z + (P.y - im.y) / im.w * (uRect.w - uRect.z), (uRect.x + uRect.y) / 2.0 + (P.z - im.x) / im.z * (uRect.w - uRect.z) * 0.67);
           float pix; vec3 c = wallAt(Q, pix);
           vec2 fuv = vec2(0.5 - (P.z - im.x) / im.z, (P.y - im.y) / im.w);
           vec3 cardP = pow(texture2D(uCardP, clamp(fuv, 0.0, 1.0)).rgb, vec3(2.2)) * 0.55;
           c = mix(c, cardP, uCard * uCardPOn);
           s.albedo = vec3(0.015); s.emissive = c * pix * ${GAIN.toFixed(3)} * uState3.z;` });
  const iface = new Geo();
  L.imag.forEach((im, k) => {
    const tilt = im.tilt * Math.PI / 180, n = [Math.cos(tilt), Math.sin(tilt), 0], up = [-Math.sin(tilt), Math.cos(tilt), 0];
    const c = [im.x + 0.012 - Math.sin(tilt) * im.h / 2, im.y0 + im.h / 2 + (1 - Math.cos(tilt)) * im.h / 2, im.z];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const pc = [c[0] + up[0] * ((j + 0.5) * 1.2 - im.h / 2), c[1] + up[1] * ((j + 0.5) * 1.2 - im.h / 2), im.z - im.w / 2 + (i + 0.5) * 0.6];
      iface.obox(pc, [0.006, 0.599, 0.299], [n, up, [0, 0, 1]], k);
    }
    imagMat.uniforms.uImag.value[k].set(im.z, im.y0, im.w, im.h);
  });
  world.mesh(iface.geometry(), imagMat, { name: 'imag faces' });
  // the wings' dots: rows along each wing's two leaning ladders and across, every ~0.3 m, a dot 0.07 m
  // the dots ride the ladders' outer front chords, and a batten (a black LED strip) across the wing on the diagonal
  const dots = new Geo(), batten = new Geo(), fx = w => w.x + 0.145 + 0.0254 + 0.002;
  for (const w of L.wings) {
    const n = Math.round((w.y1 - w.y0 - 0.3) / 0.3), at = (z0, f) => z0 + w.side * w.lean * f;
    const yb0 = w.y0 + 0.3, yb1 = w.y1 - 0.4;
    batten.tube([fx(w) - 0.01, yb0, at(w.zIn, (yb0 - w.y0) / (w.y1 - w.y0)) + w.side * 0.145], [fx(w) - 0.01, yb1, at(w.zOut, (yb1 - w.y0) / (w.y1 - w.y0)) - w.side * 0.145], 0.025, 6, 0.5);
    for (let k = 0; k <= n; k++) {
      const f = (0.15 + k * 0.3) / (w.y1 - w.y0), y = w.y0 + (w.y1 - w.y0) * f;
      for (const [z0, o] of [[w.zIn, -0.145], [w.zOut, 0.145]]) dots.disc([fx(w), y, at(z0, f) + w.side * o], [1, 0, 0], 0.035, 8, f);
      const u = k / n, yy = yb0 + (yb1 - yb0) * u, fz = (yy - w.y0) / (w.y1 - w.y0);
      const zz = (at(w.zIn, (yb0 - w.y0) / (w.y1 - w.y0)) + w.side * 0.145) * (1 - u) + (at(w.zOut, (yb1 - w.y0) / (w.y1 - w.y0)) - w.side * 0.145) * u;
      dots.disc([fx(w) + 0.017, yy, zz], [1, 0, 0], 0.03, 8, 1 + fz);
    }
  }
  world.mesh(batten.geometry(), M.black, { name: 'wing battens' });
  const dotMat = glowMat(world, 'wing dots', { uniforms: { uCol: { value: new T.Vector3() }, uCol2: { value: new T.Vector3() }, uChase: { value: new T.Vector4() } },
    body: `float f = fract(sd), row = step(1.0, sd); float ch = step(fract(f * 6.0 - uChase.x), 0.5); vec3 c = mix(uCol, uCol2, row * ch);
           float r = length(uv) / 0.035; s.albedo = vec3(0.02); s.emissive = c * (0.5 + 0.5 * mix(1.0, ch, uChase.y)) * smoothstep(1.0, 0.4, r) * uChase.z;` });
  world.mesh(dots.geometry(), dotMat, { name: 'wing dots' });
  const setV = (u, c, k = 1) => u.value.set(c[0] * k, c[1] * k, c[2] * k);
  world.onFrame(t => {
    const s = cues.screenState(t), lk = s.look, pl = s.prevLook, h = lk.hues, hp = pl.hues;
    setV(U.uKA, rampLin(h[0], 1.4)); setV(U.uKB, rampLin(h[0], 2.6)); setV(U.uAA, rampLin(h[1], 2.8)); setV(U.uAB, rampLin(h[1], 4.0));
    setV(U.uPKA, rampLin(hp[0], 2.0)); setV(U.uPAA, rampLin(hp[1], 3.0));
    U.uState.value.set(s.beat, s.phase, s.energy, s.secU);
    U.uState2.value.set(lk.wall, pl.wall, s.fade, s.pulse);
    U.uState3.value.set(s.on, s.dark, 1, led.pitch); U.uState4.value.set(s.chev, 0, 0, 0); U.uCard.value = s.card;
    // the wings: the accent's dots chasing up on the beat in the high-energy looks
    const du = dotMat.uniforms;
    setV(du.uCol, rampLin(h[1], 3.6), 1.6); setV(du.uCol2, rampLin(h[0], 3.6), 1.6);
    du.uChase.value.set(s.beat * 0.5, s.energy > 0.6 ? 1 : 0, (s.dark ? 0 : 1) * (0.35 + 0.65 * s.energy) * (0.75 + 0.25 * s.pulse), 0);
  });
  return { wallMat, dotMat, gain: GAIN };
}
