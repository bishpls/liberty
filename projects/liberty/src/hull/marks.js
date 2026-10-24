// liberty/src/hull/marks.js: her painted markings (B1): the name on both bows, the name and home port on the counter,
// the draft marks (Arabic numerals, 6 in high, every foot from 8 to 30 ft at the stem and the stern, both sides), the
// load-line mark amidships, and the bow tub's white front with its pin-up and life ring (ship.md §6, §8 rule 18; photos
// 01, 09, 12, 17). The letters and numerals are drawn once into a canvas atlas; the shell's shader places them in the
// ship's own coordinates (girth below the deck edge along the sheer for the bow name, x across the counter for the stern,
// the stem's rake for the draft marks), so they follow the hull.
import { lin } from 'scene3d/util.js';

const T = window.THREE, FT = 0.3048;
const W = 2048, H = 1024;
// rows of the atlas (canvas px, top down): A the name, B the home port, C digits 0-9 then A, B; D the tub's front panel
export const ROWS = { A: [0, 170], B: [170, 340], C: [340, 500], D: [512, 1024] };

function drawAtlas() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
  const fit = (text, row, size, track) => {
    g.font = `bold ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    let x = 8; const y = (ROWS[row][0] + ROWS[row][1]) / 2;
    for (const ch of text) { g.fillText(ch, x, y); x += g.measureText(ch).width + track; }
    return (x - track + 8) / W;                               // the width used (fraction of the atlas)
  };
  const wA = fit("JEREMIAH O'BRIEN", 'A', 150, 22);
  const wB = fit('SAN FRANCISCO', 'B', 150, 22);
  g.font = 'bold 150px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textAlign = 'center';
  '0123456789AB'.split('').forEach((ch, i) => g.fillText(ch, i * 100 + 50, (ROWS.C[0] + ROWS.C[1]) / 2, 96));
  g.textAlign = 'left';
  // D: the 3"/50 tub's white front (photos 09, 11, 12): a green shamrock with the pin-up on it, a hula girl to its side,
  // the life ring; drawn flat, as a sign painter would, on the white panel (alpha 1 = paint)
  const [d0, d1] = ROWS.D, dh = d1 - d0;
  g.fillStyle = '#ffffff'; g.fillRect(0, d0, W, dh);
  const shamrock = (cx, cy, r, col) => {
    g.fillStyle = col;
    for (const a of [-Math.PI / 2, Math.PI / 6, Math.PI * 5 / 6]) {
      const lx = cx + Math.cos(a) * r * 0.55, ly = cy + Math.sin(a) * r * 0.55;
      g.beginPath(); g.arc(lx + Math.cos(a + Math.PI / 2) * r * 0.22, ly + Math.sin(a + Math.PI / 2) * r * 0.22, r * 0.36, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(lx - Math.cos(a + Math.PI / 2) * r * 0.22, ly - Math.sin(a + Math.PI / 2) * r * 0.22, r * 0.36, 0, Math.PI * 2); g.fill();
    }
    g.fillRect(cx - r * 0.06, cy, r * 0.12, r * 1.05);
  };
  shamrock(820, d0 + dh * 0.46, dh * 0.36, '#2f8a4c');
  // the figure: a pin-up in silhouette on the shamrock (cream skin, dark hair), a simple sign-painter's shape
  g.fillStyle = '#f0d6b8';
  g.beginPath(); g.ellipse(820, d0 + dh * 0.28, 26, 32, 0, 0, Math.PI * 2); g.fill();                  // head
  g.beginPath(); g.moveTo(800, d0 + dh * 0.34); g.quadraticCurveTo(770, d0 + dh * 0.5, 795, d0 + dh * 0.6); g.lineTo(790, d0 + dh * 0.8);
  g.lineTo(812, d0 + dh * 0.8); g.lineTo(822, d0 + dh * 0.62); g.lineTo(834, d0 + dh * 0.8); g.lineTo(856, d0 + dh * 0.8);
  g.lineTo(846, d0 + dh * 0.58); g.quadraticCurveTo(870, d0 + dh * 0.48, 840, d0 + dh * 0.34); g.closePath(); g.fill();
  g.fillStyle = '#3a2418'; g.beginPath(); g.ellipse(818, d0 + dh * 0.25, 30, 22, -0.3, Math.PI, Math.PI * 2.1); g.fill();
  // the hula girl to the left: grass skirt in green-gold, a lei
  g.fillStyle = '#d9a46c'; g.beginPath(); g.ellipse(560, d0 + dh * 0.32, 22, 27, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(546, d0 + dh * 0.37, 28, dh * 0.16);
  g.fillStyle = '#7d9a3a'; g.beginPath(); g.moveTo(530, d0 + dh * 0.52); g.lineTo(590, d0 + dh * 0.52); g.lineTo(600, d0 + dh * 0.72); g.lineTo(520, d0 + dh * 0.72); g.closePath(); g.fill();
  g.fillStyle = '#d9a46c'; g.fillRect(540, d0 + dh * 0.72, 14, dh * 0.12); g.fillRect(566, d0 + dh * 0.72, 14, dh * 0.12);
  g.fillStyle = '#d04a6a'; for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(545 + k * 5, d0 + dh * 0.39 + Math.sin(k) * 3, 6, 0, Math.PI * 2); g.fill(); }
  // the life ring: orange with four white bands
  const rx = 1250, ry = d0 + dh * 0.45, R = dh * 0.2;
  g.lineWidth = R * 0.42; g.strokeStyle = '#e8622a'; g.beginPath(); g.arc(rx, ry, R * 0.79, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#f4f1ea'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(rx, ry, R * 0.79, k * Math.PI / 2 - 0.16, k * Math.PI / 2 + 0.16); g.stroke(); }
  // a line of weathering: rust dribbling from the panel's top edge, the paint chipped at the bottom
  g.fillStyle = 'rgba(138,82,51,0.75)';
  for (let k = 0; k < 9; k++) { const x = 140 + k * 211 + (k * 37) % 50, L = 30 + (k * 53) % 90; g.fillRect(x, d0, 5, L); g.fillRect(x + 1, d0 + L, 3, 18); }
  return { cv, wA, wB };
}

export function markAtlas() {
  const { cv, wA, wB } = drawAtlas();
  const t = new T.CanvasTexture(cv);
  t.colorSpace = T.NoColorSpace; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter;
  t.anisotropy = 8; t.wrapS = t.wrapT = T.ClampToEdgeWrapping; t.flipY = true; t.needsUpdate = true;
  return { tex: t, wA, wB };
}

// the GLSL: white paint masks in ship coordinates. S: the ship point, g: girth below the deck edge (m), side: +1 starboard
export const MARK_GLSL = /* glsl */`
uniform sampler2D uMarks;
uniform vec4 uMkW;      // atlas widths: name, home port; the stem line z = x + y * abl (m)
uniform vec4 uMkBow;    // the bow name: z of its forward end, length, girth to the letters' top, letter height
uniform vec4 uMkStern;  // the counter: half-width of the lines, abl of line 1's centre, line 1 height, line 2's centre
uniform vec4 uMkDraft;  // draft marks: offset aft of the stem line (m), z of the aft column, numeral height, digit width
uniform vec4 uMkLoad;   // the load line: z, abl of the disc centre, disc radius, -
uniform vec2 uCounter[12];   // the stern's profile (abl, z): the post up to the aperture's top, then the counter
float zAftAt(float abl) {
  if (abl <= uCounter[0].x) return uCounter[0].y;
  for (int i = 1; i < 12; i++) if (abl <= uCounter[i].x) { float t = (abl - uCounter[i - 1].x) / max(uCounter[i].x - uCounter[i - 1].x, 1e-4); return mix(uCounter[i - 1].y, uCounter[i].y, t); }
  return uCounter[11].y;
}
// every lookup takes its gradients from the continuous ship coordinates (gS: dFdx / dFdy of (z, abl), taken outside any
// branch), so the mip level is right at a decal's edge and between digits (texture2D in a branch drew a faint box)
vec4 gS;
float atlG(vec2 uv, vec2 dx, vec2 dy) { return textureGrad(uMarks, uv, dx, dy).a; }
// u 0..1 across the atlas, t 0..1 down the row (canvas px rows of 1024, flipped); du, dt: d(u, t)/d(z, abl)
float atl(float u, float row0, float row1, float t, vec2 du, vec2 dt) {
  float y = mix(row0, row1, t) / 1024.0, k = (row1 - row0) / 1024.0;
  vec2 dx = vec2(dot(du, gS.xy), -k * dot(dt, gS.xy)), dy = vec2(dot(du, gS.zw), -k * dot(dt, gS.zw));
  return atlG(vec2(u, 1.0 - y), dx, dy);
}
float digitMask(float digit, float lu, float t, vec2 dlu, vec2 dt) { return atl((digit * 100.0 + 4.0 + lu * 92.0) / 2048.0, 340.0, 500.0, t, dlu * 92.0 / 2048.0, dt); }
// a two-digit numeral centred at zc, its bottom at abl0 (the foot it marks), on the hull side
float numeral(float n, float zz, float abl, float zc, float abl0, float side) {
  float hgt = uMkDraft.z, dw = uMkDraft.w;
  float t = 1.0 - (abl - abl0) / hgt;
  if (t < 0.0 || t > 1.0) return 0.0;
  float u = (zz - (zc - dw)) / (2.0 * dw);
  if (u < 0.0 || u > 1.0) return 0.0;
  if (side > 0.0) u = 1.0 - u;                        // starboard: read from aft to forward (the viewer's left to right)
  float tens = floor(n / 10.0), ones = n - tens * 10.0;
  float idx = floor(u * 2.0), lu = fract(u * 2.0);
  vec2 dlu = vec2((side > 0.0 ? -1.0 : 1.0) / dw, 0.0), dt = vec2(0.0, -1.0 / hgt);
  return digitMask(idx < 0.5 ? tens : ones, lu, t, dlu, dt);
}
float hullMarks(vec3 S, float g, float side, vec3 Nw) {
  float m = 0.0;
  gS = vec4(dFdx(S.z), dFdx(S.y), dFdy(S.z), dFdy(S.y));
  vec4 gZ = gS;
  float uSt = (S.x + uMkStern.x) / (2.0 * uMkStern.x);
  vec2 dux = vec2(dFdx(uSt), dFdy(uSt));                // (taken here, outside any branch)
  vec2 dg = vec2(0.0, -1.0);            // (the girth below the deck edge runs down the side: d g / d abl ~ -1)
  // the bow name, parallel to the sheer (constant girth below the deck edge)
  float tB = (g - uMkBow.z) / uMkBow.w;
  if (tB > -0.05 && tB < 1.05 && S.z > uMkBow.x - 0.2 && S.z < uMkBow.x + uMkBow.y + 0.2) {
    float u = (S.z - uMkBow.x) / uMkBow.y; if (side > 0.0) u = 1.0 - u;
    if (u >= 0.0 && u <= 1.0 && tB >= 0.0 && tB <= 1.0) m = max(m, atl(u * uMkW.x, 0.0, 170.0, tB, vec2((side > 0.0 ? -1.0 : 1.0) * uMkW.x / uMkBow.y, 0.0), dg / uMkBow.w));
  }
  // the counter: the name over the home port, across her stern (seen from astern, starboard on the right)
  if (S.z > 60.0 && Nw.z > 0.2) {
    float u = uSt;
    float t1 = (uMkStern.y + uMkStern.z * 0.5 - S.y) / uMkStern.z;
    float t2 = (uMkStern.w + uMkStern.z * 0.33 - S.y) / (uMkStern.z * 0.66);
    if (u >= 0.0 && u <= 1.0) {
      // (across the counter: u runs with x, which the z/abl gradients don't carry: take its own)
      gS = vec4(dux.x, gZ.y, dux.y, gZ.w);
      if (t1 >= 0.0 && t1 <= 1.0) m = max(m, atl(u * uMkW.x, 0.0, 170.0, t1, vec2(uMkW.x, 0.0), vec2(0.0, -1.0 / uMkStern.z)));
      float u2 = (u - 0.5) * 1.75 + 0.5;
      if (u2 >= 0.0 && u2 <= 1.0 && t2 >= 0.0 && t2 <= 1.0) m = max(m, atl(u2 * uMkW.y, 170.0, 340.0, t2, vec2(1.75 * uMkW.y, 0.0), vec2(0.0, -1.0 / (uMkStern.z * 0.66))));
      gS = gZ;
    }
  }
  // draft marks: every foot from 8 to 30 ft, bottoms on the foot, at the stem (following its rake) and aft
  float ft = 0.3048, k = floor(S.y / ft);
  if (k >= 8.0 && k <= 30.0) {
    float abl0 = k * ft;
    float zStem = uMkW.z + uMkW.w * (abl0 + 0.08);
    if (S.z < zStem + 1.0) m = max(m, numeral(k, S.z, S.y, zStem + uMkDraft.x, abl0, side));
    // aft: on one station just forward of the propeller post, up its section (photos 10/17: the column leans out as the
    // section widens, from 17 ft at the water to 30 ft; a solved camera put them there, not on the counter's curve)
    float zA = uMkDraft.y;
    if (S.z > zA - 0.6 && S.z < zA + 0.6) m = max(m, numeral(k, S.z, S.y, zA, abl0, side));
  }
  // the load-line mark: a disc ring with its bar, A and B either side (American Bureau of Shipping)
  vec2 d = vec2(S.z - uMkLoad.x, S.y - uMkLoad.y);
  if (abs(d.x) < 0.6 && abs(d.y) < 0.4) {
    float r = length(d), R = uMkLoad.z;
    m = max(m, step(R - 0.026, r) * step(r, R));
    m = max(m, step(abs(d.y), 0.013) * step(abs(d.x), 0.229));
    float lu = (abs(d.x) - 0.2) / 0.1, lt = 1.0 - (d.y - 0.02) / 0.115;
    if (lu >= 0.0 && lu <= 1.0 && lt >= 0.0 && lt <= 1.0) {
      float letter = (d.x * (side > 0.0 ? 1.0 : -1.0) > 0.0) ? 10.0 : 11.0;     // A on the viewer's left
      m = max(m, digitMask(letter, lu, lt, vec2(10.0, 0.0), vec2(0.0, -1.0 / 0.115)));
    }
  }
  return m;
}
`;
export function markUniforms(atlas, place) {
  return {
    uMarks: { value: atlas.tex },
    uMkW: { value: new T.Vector4(atlas.wA, atlas.wB, place.stemA, place.stemB) },
    uMkBow: { value: new T.Vector4(...place.bow) },
    uMkStern: { value: new T.Vector4(...place.stern) },
    uMkDraft: { value: new T.Vector4(...place.draft) },
    uMkLoad: { value: new T.Vector4(...place.load) },
    uCounter: { value: place.counter.map(([a, z]) => new T.Vector2(a, z)) },
  };
}
export const LETTER = lin('#ededE8');
