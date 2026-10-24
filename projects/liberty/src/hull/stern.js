// liberty/src/hull/stern.js: the stern frame, the rudder and the screw (B1). Ship coordinates. Sources: HAER sheet 19
// (the profile: the propeller post ~7.9 ft forward of the AP, the aperture to ~18.8 ft ABL, the sole piece), sheets 2/3
// (shaft centre ~9.5-10 ft ABL), ship.md §1 (one four-blade screw, 18 ft 6 in), §2 (a single plate rudder on a stern
// frame with a sole piece, its stock on the AP); photo 40 (her stern in dry dock at night). Mostly under the turbid bay;
// the screw's top blade and the rudder's head show above the museum waterline aft (4.72 m ABL at the AP).
import { box, merge } from 'scene3d/geom.js';
import { slab, tube } from './parts.js';

const FT = 0.3048;

export function buildStern(F) {
  const S = F.S, ap = S.apZ, post = F.postZ, top = F.apTop;
  const frame = [], bronze = [];
  // the propeller post: a forged bar, ~0.3 m wide, from the sole piece to the aperture's top
  frame.push(slab([[-0.16, post - 0.15], [0.16, post - 0.15], [0.12, post + 0.2], [-0.12, post + 0.2]], 0.0, top + 0.1));
  // the sole piece: from the post's foot aft to the rudder's heel
  frame.push(slab([[-0.2, post - 0.1], [0.2, post - 0.1], [0.16, ap + 0.55], [-0.16, ap + 0.55]], 0.0, 0.38));
  // the rudder post on the AP up to the counter (the stern frame's after arm)
  const counterAt = z => { let h = top; for (let k = 0; k < 40; k++) { const hh = top + k * 0.1; if (F.zAft(hh) > z) { h = hh; break; } } return h; };
  const yTop = counterAt(ap) + 0.15;
  frame.push(tube([[0, 0.3, ap], [0, yTop, ap]], 0.19, { n: 10 }));
  // the rudder: a single plate on the post's pintles, streamlined section, 3.1 m chord, from the sole piece to just
  // under the counter; its head carries the stock up through the counter
  const sec = [];
  const chord = 3.1, tmax = 0.34;
  for (let k = 0; k <= 12; k++) { const s = k / 12, th = tmax / 2 * (1.0 * Math.sqrt(Math.max(s, 0.0)) * (1 - s) * 2.2 + 0.04); sec.push([th, ap + 0.2 + s * chord]); }
  const rpoly = sec.concat(sec.slice().reverse().map(([x, z]) => [-x, z]));
  const rTop = counterAt(ap + chord * 0.6) - 0.12;
  frame.push(slab(rpoly, 0.45, rTop));
  // the hinge pintles' bosses on the post (four)
  for (let k = 0; k < 4; k++) frame.push(box([0, 0.9 + k * (rTop - 1.2) / 3, ap + 0.12], [0.42, 0.22, 0.34]));
  // the screw: four blades, 5.64 m across (18 ft 6 in), its hub on the shaft at ~9.75 ft ABL just aft of the post;
  // stopped with its blades at 45 degrees (an X), so one tip just breaks the water aft
  const R = 18.5 * FT / 2, hc = 9.75 * FT, zc = post + 0.75, pitch = 5.4;
  bronze.push(tube([[0, hc, post + 0.1], [0, hc, zc + 0.35]], 0.42, { n: 14 }));
  bronze.push(tube([[0, hc, zc + 0.35], [0, hc, zc + 0.75]], 0.3, { n: 14 }));
  for (let b = 0; b < 4; b++) bronze.push(blade(R, hc, zc, Math.PI / 4 + b * Math.PI / 2, pitch));
  // the bilge keels (ship.md §2, sheet 14): flat bars at the turn of the bilge, ~1/3 of the length amidships, set
  // square to the shell on the bilge's 45-degree diagonal (under the turbid bay; built anyway)
  const bk = [];
  for (const sx of [-1, 1]) {
    const pts = [];
    for (let z = -21; z <= 21.01; z += 1.5) {
      // the bilge's diagonal point: where the section crosses the line from (B/2 - r, r) at 45 degrees
      let h = 0.53, x = F.hb(z, h);
      pts.push([sx * (x - 0.02), h, z, sx]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, h0, z0] = pts[i], [x1, h1, z1] = pts[i + 1], d = 0.38 / Math.SQRT2;
      const pos = [x0, h0, z0, x1, h1, z1, x1 + sx * d, h1 - d, z1, x0 + sx * d, h0 - d, z0];
      bk.push(quadGeo(pos), quadGeo([pos[0], pos[1], pos[2], pos[9], pos[10], pos[11], pos[6], pos[7], pos[8], pos[3], pos[4], pos[5]]));
    }
  }
  frame.push(...bk);
  return { frame: merge(frame), bronze: merge(bronze), screw: { centre: [0, hc, zc], radius: R } };
}

// one blade: a twisted plate in the disc, root at 0.18 R, an elliptical outline skewed back, its chord set at the
// helix angle atan(P / (2 pi r))
function blade(R, hc, zc, ang, pitch) {
  const T = window.THREE;
  const nr = 12, nk = 8, pos = [], nrm = [], uv = [], idx = [];
  const rad = [Math.sin(ang), Math.cos(ang)];                // the blade's radial direction in the x-y (abl) plane
  const tan = [Math.cos(ang), -Math.sin(ang)];
  const pts = [];
  for (let i = 0; i <= nr; i++) {
    const s = i / nr, r = R * (0.18 + 0.82 * s);
    const chord = R * 0.62 * Math.sqrt(Math.max(0, 1 - Math.pow((s - 0.35) / 0.68, 2))) + 0.05;
    const phi = Math.atan2(pitch, 2 * Math.PI * r), skew = 0.25 * s * s * R * 0.4;
    const row = [];
    for (let k = 0; k <= nk; k++) {
      const c = (k / nk - 0.5) * chord + skew;
      const thick = 0.07 * (1 - 0.8 * s) * Math.sqrt(Math.max(0, 1 - Math.pow(2 * k / nk - 1, 2)));
      const x = rad[0] * r + tan[0] * c * Math.cos(phi), y = hc + rad[1] * r + tan[1] * c * Math.cos(phi), z = zc + c * Math.sin(phi);
      row.push([x, y, z, thick]);
    }
    pts.push(row);
  }
  // the blade's two faces offset along its normal
  const N = (i, k) => {
    const a = pts[Math.min(nr, i + 1)][k], b = pts[Math.max(0, i - 1)][k], c = pts[i][Math.min(nk, k + 1)], d = pts[i][Math.max(0, k - 1)];
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1;
    return n.map(q => q / l);
  };
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= nr; i++) for (let k = 0; k <= nk; k++) {
      const p = pts[i][k], n = N(i, k);
      pos.push(p[0] + n[0] * p[3] * side, p[1] + n[1] * p[3] * side, p[2] + n[2] * p[3] * side);
      nrm.push(n[0] * side, n[1] * side, n[2] * side); uv.push(i / nr * R, k / nk);
    }
    for (let i = 0; i < nr; i++) for (let k = 0; k < nk; k++) {
      const a = base + i * (nk + 1) + k, b = a + nk + 1;
      if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(0.5), 1));
  g.setIndex(idx);
  return g;
}

function quadGeo(p) {
  const T = window.THREE, g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  g.setAttribute('aSeed', new T.Float32BufferAttribute([0.5, 0.5, 0.5, 0.5], 1));
  return g;
}
