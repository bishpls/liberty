// liberty/src/deck/hatches.js: the hatch covers on B1's coamings (B2): wooden boards on steel beams under a green
// tarpaulin, lapped over the coaming and held down by steel battens wedged into cleats along the coaming's sides, with
// transverse locking bars set up by turnbuckles across the top (research/ship.md §5 "Hatches", rule 8; photos ship/27,
// 28: the tarps, the battens, the wedges, the bars and their turnbuckles, planks and rope coils left on top). The tarp
// crowns over the boards (~7 cm), sags a little between the beams (every ~5 ft), wrinkles, and folds at the corners.
// No. 2 carries the stage (B5 builds on it): covered and flat, its bars taken off. No. 1 and No. 3 carry the deck
// mortars (B5, P.STAGE's notes): covered, bars on, nothing else on top.
import { SH, deckCL, deckAt, tr, ry, rx, mul, along, lath, cyl, boxM, bar, tube, mergeG } from './ship.js';
import { fbm2, vnoise2, rng } from 'scene3d/util.js';
import { gridSurf } from 'scene3d/kit/arch/kit.js';

const T = window.THREE;

export function buildHatches(world, M, ctx, B, seat) {
  const S = SH, out = { covers: [], measures: {} };
  for (const k of [1, 2, 3, 4, 5]) {
    const A = seat.pick(`hatches.${k}`), h = S.hatches[k];
    seat.used[`hatches.${k}`] = A ? 'hull' : 'plan';
    const z0 = A ? A.z0 : h.z0, z1 = A ? A.z1 : h.z1, half = A ? A.half : h.half;
    const top = z => deckCL(z) + S.hatches.coaming;
    const R = rng(1000 + k);
    const ox = half + 0.06, zo0 = z0 - 0.06, zo1 = z1 + 0.06;          // the tarp's edge: outside the coaming's lip
    const crown = 0.07, beam = 1.524;
    const flat = k === 2;
    // the top: crowned across, a sag between the beams, wrinkles; rolled over the lip at its edges
    const yTop = (x, z) => {
      const ax = Math.min(1, Math.abs(x) / half);
      let y = top(z) + 0.065 + crown * (1 - ax * ax);
      if (!flat) {
        const zb = ((z - z0) % beam) / beam;
        y -= 0.012 * Math.sin(Math.PI * zb) ** 2;
        y += 0.007 * fbm2(x * 1.3 + k * 7, z * 0.9, 3) + 0.004 * vnoise2(x * 4.1, z * 3.3);
      }
      return y;
    };
    const roll = (e) => -0.06 * (1 - Math.cos(Math.min(1, Math.max(0, e)) * Math.PI / 2));     // the edge rolling over the lip
    const nx = 28, nz = Math.max(8, Math.round((zo1 - zo0) / 0.3));
    const topG = gridSurf(nx, nz, (i, j) => {
      const x = -ox + 2 * ox * i / nx, z = zo0 + (zo1 - zo0) * j / nz;
      const ex = (Math.abs(x) - (half - 0.08)) / 0.14, ez = Math.max((z0 + 0.08 - z) / 0.14, (z - (z1 - 0.08)) / 0.14);
      return [x, yTop(Math.max(-half, Math.min(half, x)), Math.max(z0, Math.min(z1, z))) + roll(ex) + roll(ez), z];
    }, { uvAt: (i, j) => [2 * ox * i / nx, (zo1 - zo0) * j / nz], seed: 0.1 * k, flip: true });
    B.add(M.tarp, topG, 'hatches');
    // the skirts: down the coaming's sides outside the lip, pinched in under the battens, the hem flaring a little
    const yB = z => top(z) - 0.29;                                          // the batten's height
    const skirtSide = (sx) => gridSurf(4, nz, (i, j) => {
      const z = zo0 + (zo1 - zo0) * j / nz, t = i / 4, yT = yTop(sx * half, Math.max(z0, Math.min(z1, z))) - 0.06;
      const y = yT - t * 0.44, pinch = Math.exp(-(((y - yB(z)) / 0.05) ** 2));
      const x = sx * (ox + 0.012 - 0.02 * pinch + (t > 0.75 ? (t - 0.75) * 0.12 : 0) + 0.006 * vnoise2(z * 2.3, sx * 5 + k));
      return [x, y, z];
    }, { uvAt: (i, j) => [(zo1 - zo0) * j / nz, i * 0.11], flip: sx > 0, seed: 0.1 * k + 0.02 });
    const skirtEnd = (sz) => gridSurf(nx, 4, (i, j) => {
      const x = -ox + 2 * ox * i / nx, t = j / 4, ze = sz < 0 ? z0 : z1, yT = yTop(Math.max(-half, Math.min(half, x)), ze) - 0.06;
      const y = yT - t * 0.44, pinch = Math.exp(-(((y - yB(ze)) / 0.05) ** 2));
      return [x, y, (sz < 0 ? zo0 : zo1) + sz * (0.012 - 0.02 * pinch + (t > 0.75 ? (t - 0.75) * 0.12 : 0))];
    }, { uvAt: (i, j) => [2 * ox * i / nx, j * 0.11], flip: sz > 0, seed: 0.1 * k + 0.04 });
    B.add(M.tarp, [skirtSide(-1), skirtSide(1), skirtEnd(-1), skirtEnd(1)], 'hatches');
    // the corners' folds: the spare cloth folded flat against the end skirt (a triangle of doubled canvas)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const ze = sz < 0 ? zo0 : zo1, yT = top(sz < 0 ? z0 : z1) + 0.0;
      const tri = new T.BufferGeometry();
      const a = [sx * ox, yT, ze + sz * 0.02], b = [sx * (ox - 0.42), yT - 0.02, ze + sz * 0.03], c = [sx * ox, yT - 0.4, ze + sz * 0.035];
      const pos = sz * sx > 0 ? [...a, ...c, ...b] : [...a, ...b, ...c];
      tri.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); tri.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 0.4, 0, 0, 0.4], 2));
      tri.computeVertexNormals(); tri.setAttribute('aSeed', new T.Float32BufferAttribute([0.3, 0.3, 0.3], 1));
      B.add(M.tarp, tri, 'hatches');
    }
    // the battens (flat bars) round all four sides at the cleats, the cleats every ~0.75 m with their wedges
    const bt = [];
    for (const sx of [-1, 1]) {
      const pts = []; for (let j = 0; j <= 12; j++) { const z = z0 + 0.15 + (z1 - z0 - 0.3) * j / 12; pts.push([sx * (ox + 0.006), yB(z), z]); }
      for (let j = 0; j < 12; j++) bt.push(bar(pts[j], pts[j + 1], 0.075, 0.012, 0.5, [sx, 0, 0]));
      for (let z = z0 + 0.35; z < z1 - 0.2; z += 0.75) {
        B.add(M.steelOld, boxM(0.14, 0.14, 0.09, tr(sx * (half + 0.085), yB(z) - 0.03, z)), 'hatches');
        B.add(M.wood, boxM(0.04, 0.05, 0.2, mul(tr(sx * (ox + 0.03), yB(z) + 0.0, z + 0.05), rx(0.1))), 'hatches');
      }
    }
    for (const sz of [-1, 1]) {
      const ze = sz < 0 ? z0 - 0.066 : z1 + 0.066;
      bt.push(bar([-ox + 0.1, yB(ze), ze], [ox - 0.1, yB(ze), ze], 0.075, 0.012, 0.5, [0, 0, sz]));
      for (let x = -half + 0.4; x < half - 0.2; x += 0.75) {
        B.add(M.steelOld, boxM(0.09, 0.14, 0.14, tr(x, yB(ze) - 0.03, (sz < 0 ? z0 : z1) + sz * 0.085)), 'hatches');
        B.add(M.wood, boxM(0.2, 0.05, 0.04, tr(x + 0.05, yB(ze), ze + sz * 0.03)), 'hatches');
      }
    }
    B.add(M.white, bt, 'hatches');
    // the locking bars across the top, in two halves joined by a turnbuckle, their ends hooked to eyes on the coaming
    let bars = 0;
    if (!flat) {
      const nb = Math.max(3, Math.round((z1 - z0) / 1.9));
      for (let b = 0; b < nb; b++) {
        const z = z0 + (z1 - z0) * (b + 0.5) / nb, pts = [];
        for (let i = 0; i <= 14; i++) { const x = -ox + 2 * ox * i / 14; pts.push([x, yTop(Math.max(-half, Math.min(half, x)), z) + roll((Math.abs(x) - (half - 0.08)) / 0.14) + 0.012, z]); }
        pts.unshift([-ox - 0.02, yB(z) + 0.05, z]); pts.push([ox + 0.02, yB(z) + 0.05, z]);
        const g = [];
        for (let i = 0; i < pts.length - 1; i++) if (i !== 7 && i !== 8) g.push(bar(pts[i], pts[i + 1], 0.014, 0.07, 0.6, [0, 0, 1]));
        const mid = pts[8];
        g.push(cyl([pts[7][0] - 0.02, mid[1] + 0.025, z], [pts[9][0] + 0.02, mid[1] + 0.025, z], 0.022, 0.022, { sides: 6 }), cyl([mid[0] - 0.12, mid[1] + 0.025, z], [mid[0] + 0.12, mid[1] + 0.025, z], 0.034, 0.034, { sides: 6 }));
        B.add(M.steelOld, g, 'hatches');
        bars++;
      }
      // what's left on top: planks, a coil of rope (photos 27, 28) on the after hatches (No. 1 and 3 carry the mortars)
      if (k >= 4) {
        for (let p = 0; p < 3; p++) {
          const x = -1.6 + R() * 3.2, z = z0 + 1.5 + R() * (z1 - z0 - 3), a = (R() - 0.5) * 0.25, L = 2.2 + R() * 1.6;
          B.add(M.wood, boxM(0.2, 0.05, L, mul(tr(x, yTop(x, z) + 0.022, z), ry(a))), 'clutter');
        }
        const cx = (R() - 0.5) * 2.2, cz = z0 + 1.2 + R() * 2, turns = [];
        for (let t = 0; t <= 5 * 24; t++) { const a = t / 24 * Math.PI * 2, r = 0.32 + 0.025 * Math.floor(t / 24) + 0.01 * Math.sin(a * 3); turns.push([cx + Math.cos(a) * r, yTop(cx, cz) + 0.04 + 0.012 * Math.sin(t * 0.7), cz + Math.sin(a) * r]); }
        const coil = tube(turns, 0.024, { sides: 6 });
        coil.setAttribute('aTone', new T.Float32BufferAttribute(new Float32Array(coil.attributes.position.count).fill(3), 1));
        B.add(M.rope, coil, 'clutter');
      }
    }
    out.covers.push({ hatch: k, z0, z1, half, top: [top(z0), top(z1)], tarpTop: +(yTop(0, (z0 + z1) / 2)).toFixed(3), lockingBars: bars, stage: flat });
  }
  out.measures = { covers: out.covers.map(c => ({ hatch: c.hatch, length: +(c.z1 - c.z0).toFixed(2), width: +(2 * c.half).toFixed(2), lockingBars: c.lockingBars, crown: 0.07, stage: c.stage })) };
  return out;
}
