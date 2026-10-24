// liberty/src/stage/clearance.js: the pyro's visual collisions, checked on every build: no flame column or gerb spray
// visibly passing through solid geometry (a deck or platform overhead, a screen, a fixture, the hull, a goalpost).
// The director, 2026-10-24: "keep eight as a stylized liberty, we don't need to hew that closely to physical safety
// constraints"; what still applies is what reads wrong on screen. (The regulatory distances, the Salamander manual's
// 2 m x 8 m and the gerbs' fallout, are in board/stage/notes.md for reference, not checked here.)
//
// Each kind's drawn volume was measured from pyro.js's own draw (drawOne into a probe over the show's biggest events,
// every fire lump and spark streak, by unit; board/stage/make_pyroclear.py): per 0.5 m of height over the nozzle, the
// box holding the middle 80 % of the particles in x and in z (their size included), as offsets from the nozzle. The
// wind (from 245 deg, 3.4 m/s) leans every column toward +x and -z; the mast gerbs lean outboard too (their side's box).
// ENV_KEY names pyro.js's SPEC it was measured on (re-measure when it changes).
export const ENV_KEY = 'flame H4 v7.6 k3.6 buoy2.2 | gerb rail 15ft k1.5 spread9 | mast 20ft k1.4 spread10 | wind 245/3.4';
//   [h0, x0, x1, z0, z1]: the band [h0, h0 + 0.5] over the nozzle
export const ENV = {
  flame: [[0, -0.38, 0.39, -0.39, 0.38], [0.5, -0.46, 0.55, -0.52, 0.49], [1, -0.5, 0.74, -0.66, 0.56], [1.5, -0.47, 0.98, -0.81, 0.61],
    [2, -0.38, 1.24, -0.95, 0.61], [2.5, -0.21, 1.69, -1.18, 0.59], [3, 0.04, 2.0, -1.28, 0.51]],
  rail: [[0, -0.03, 1.4, -0.62, 0.11], [0.5, -0.04, 1.4, -0.64, 0.18], [1, -0.04, 1.39, -0.66, 0.25], [1.5, -0.04, 1.34, -0.65, 0.31], [2, -0.04, 1.21, -0.6, 0.38],
    [2.5, -0.05, 1.21, -0.62, 0.43], [3, -0.06, 1.26, -0.68, 0.5], [3.5, -0.07, 1.3, -0.75, 0.54], [4, -0.09, 1.3, -0.8, 0.59], [4.5, -0.23, 0.85, -0.63, 0.33]],
  mastP: [[0, -0.8, 0.02, -0.7, 0.09], [0.5, -0.94, 0.03, -0.74, 0.18], [1, -1.11, 0.04, -0.81, 0.28], [1.5, -1.22, 0.05, -0.87, 0.37], [2, -1.32, 0.05, -0.89, 0.45],
    [2.5, -1.35, 0.04, -0.86, 0.51], [3, -1.37, 0.04, -0.82, 0.58], [3.5, -1.53, 0.05, -0.88, 0.65], [4, -1.68, 0.05, -0.95, 0.72], [4.5, -1.81, 0.04, -1.03, 0.8],
    [5, -1.9, 0.04, -1.08, 0.88], [5.5, -1.74, 0.14, -1.1, 0.91], [6, -0.48, 0.38, -0.8, 0.23]],
  mastS: [[0, -0.02, 2.47, -0.72, 0.16], [0.5, 0.02, 2.48, -0.74, 0.21], [1, 0.07, 2.53, -0.82, 0.32], [1.5, 0.12, 2.54, -0.89, 0.4], [2, 0.19, 2.51, -0.9, 0.47],
    [2.5, 0.28, 2.4, -0.86, 0.54], [3, 0.34, 2.29, -0.82, 0.59], [3.5, 0.39, 2.4, -0.9, 0.66], [4, 0.45, 2.48, -0.96, 0.73], [4.5, 0.49, 2.53, -1.02, 0.81],
    [5, 0.5, 2.58, -1.08, 0.88], [5.5, 0.52, 2.33, -1.15, 0.91], [6, 0.24, 1.17, -0.64, 0.57]],
};
// What counts as passing through:
//   'ours'  the stage's own gear (screens, goalposts, towers, the PA, the deck): any of it inside the fire, or within GAP
//           of it (no unit under or against a flown screen or its rig), and the rig's fixtures (from L.fixtures: their
//           vertex shader places them) inside it
//   'solid' the ship's and the pier's geometry: when it fills COVER of a band's box seen along any axis (a deck or a
//           platform over the column, a house's wall, the hull's side, a winch in the flame); a spar, a lamp yard or a
//           stanchion crossing a spray is glancing, listed
//   'thin'  wires, ropes, cables, the festoon's wire: lines pass in front of or behind the fire, listed
// and a gerb's sparks fall back round its feet: in its first FEET only our gear counts (her bulwark and bitts are what
// they land on)
const FEET = 1.0, GAP = 1.0, COVER = 0.2, NG = 12;
const CLASS = [
  ['ignore', /^(water|ground|life|far):|^stage:(fx |confetti$|stage beams$|stage lasers$)/],
  ['thin', /wires|ropes?$|rope$|stage cable$|festoon wire$|mooring line|chafe gear/],
  ['ours', /^stage:/],
  ['solid', /./],
];
export const classOf = tag => CLASS.find(([, re]) => re.test(tag))[0];

// the units and each one's drawn volume (the lip's 'stage' gerbs are gone: no cue fired them)
export function effectUnits(L) {
  const u = [];
  L.flames.forEach((f, k) => u.push({ name: 'flame ' + k, kind: 'flame', p: f.pos, env: ENV.flame }));
  L.gerbs.rail.forEach((g, k) => u.push({ name: 'rail gerb ' + k, kind: 'gerb', p: g.pos, env: ENV.rail }));
  L.gerbs.mast.forEach((g, k) => u.push({ name: 'mast gerb ' + k, kind: 'gerb', p: g.pos, env: (g.dir && g.dir[0] < 0) ? ENV.mastP : ENV.mastS }));
  return u;
}
const SHADER_PLACED = /^stage:fixture (beam|wash) /;
export function fixtureBoxes(L) {
  return (L.fixtures || []).map(f => ({ tag: `stage:fixture ${f.group} ${f.kind}`, min: [f.pos[0] - 0.3, f.pos[1] - 0.45, f.pos[2] - 0.3], max: [f.pos[0] + 0.3, f.pos[1] + 0.45, f.pos[2] + 0.3] }));
}

// a triangle (flat [x,y,z]*3) clipped to a box: the polygon's points
function clipBox(P, min, max) {
  let poly = [[P[0], P[1], P[2]], [P[3], P[4], P[5]], [P[6], P[7], P[8]]];
  for (let ax = 0; ax < 3; ax++) for (const [lim, sg] of [[min[ax], 1], [max[ax], -1]]) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], da = (a[ax] - lim) * sg, db = (b[ax] - lim) * sg;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
    }
    poly = out; if (!poly.length) return poly;
  }
  return poly;
}
// mark a grid's cell centres inside a convex polygon projected on axes (i, j) of the box
function rasterize(grid, poly, min, max, i, j) {
  if (poly.length < 3) return;
  const w = (max[i] - min[i]) / NG, h = (max[j] - min[j]) / NG;
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const q of poly) { a0 = Math.min(a0, q[i]); a1 = Math.max(a1, q[i]); b0 = Math.min(b0, q[j]); b1 = Math.max(b1, q[j]); }
  let area = 0; for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; area += p[i] * q[j] - q[i] * p[j]; }
  if (Math.abs(area) < 1e-9) return;
  const sg = Math.sign(area);
  for (let cb = Math.max(0, Math.floor((b0 - min[j]) / h)); cb <= Math.min(NG - 1, Math.floor((b1 - min[j]) / h)); cb++)
    for (let ca = Math.max(0, Math.floor((a0 - min[i]) / w)); ca <= Math.min(NG - 1, Math.floor((a1 - min[i]) / w)); ca++) {
      const x = min[i] + (ca + 0.5) * w, y = min[j] + (cb + 0.5) * h;
      let inside = true;
      for (let k = 0; k < poly.length && inside; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; if (sg * ((q[i] - p[i]) * (y - p[j]) - (q[j] - p[j]) * (x - p[i])) < 0) inside = false; }
      if (inside) grid[cb * NG + ca] = 1;
    }
}

// the check: { units: [{ name, kind, pos, ok, hits, glancing, thin }], collisions, ms }
export function effectCollisions(world, L, { units = effectUnits(L), meshes = world.pipe.meshes, boxes = fixtureBoxes(L) } = {}) {
  const t0 = performance.now(), TH = window.THREE, m4 = new TH.Matrix4(), mi = new TH.Matrix4();
  const U = units.map(u => {
    const bx = u.env.map(([h, x0, x1, z0, z1]) => ({ h, min: [u.p[0] + x0, u.p[1] + h, u.p[2] + z0], max: [u.p[0] + x1, u.p[1] + h + 0.5, u.p[2] + z1] }));
    const min = [0, 1, 2].map(i => Math.min(...bx.map(b => b.min[i])) - (i === 1 ? 0 : GAP)), max = [0, 1, 2].map(i => Math.max(...bx.map(b => b.max[i])) + (i === 1 ? 0 : GAP));
    return { ...u, bx, min, max, rec: new Map() };
  });
  const gmin = [0, 1, 2].map(i => Math.min(...U.map(u => u.min[i]))), gmax = [0, 1, 2].map(i => Math.max(...U.map(u => u.max[i])));
  const over = (lo, hi, a, b) => !(hi[0] < a[0] || lo[0] > b[0] || hi[1] < a[1] || lo[1] > b[1] || hi[2] < a[2] || lo[2] > b[2]);
  const tagOf = m => (m.userData.module || '?') + ':' + (m.name || ((Array.isArray(m.material) ? m.material[0] : m.material) || {}).name || '').replace(':id', '');
  // per unit, band and tag: three occupancy grids (seen down y, along z, along x)
  const rec = (u, bi, tag, cls) => { const k = bi + '|' + tag; let r = u.rec.get(k); if (!r) u.rec.set(k, r = { tag, cls, band: u.bx[bi].h, g: [new Uint8Array(NG * NG), new Uint8Array(NG * NG), new Uint8Array(NG * NG)] }); return r; };
  const P = new Array(9);
  let tris = 0;
  for (const m of meshes) {
    const g = m.geometry; if (!g || !g.attributes || !g.attributes.position) continue;
    if (!(m.userData.mats && m.userData.mats.id)) continue;
    const tag = tagOf(m), cls = classOf(tag); if (cls === 'ignore' || (m.isInstancedMesh && SHADER_PLACED.test(tag))) continue;
    m.updateMatrixWorld(true); if (!g.boundingBox) g.computeBoundingBox();
    const pos = g.attributes.position, idx = g.index ? g.index.array : null, nt = idx ? idx.length / 3 : pos.count / 3;
    for (let k = 0; k < (m.isInstancedMesh ? m.count : 1); k++) {
      if (m.isInstancedMesh) { m.getMatrixAt(k, mi); m4.multiplyMatrices(m.matrixWorld, mi); } else m4.copy(m.matrixWorld);
      const bb = g.boundingBox.clone().applyMatrix4(m4), blo = bb.min.toArray(), bhi = bb.max.toArray();
      if (!over(blo, bhi, gmin, gmax)) continue;
      const cand = U.filter(u => over(blo, bhi, u.min, u.max)); if (!cand.length) continue;
      const e = m4.elements;
      for (let t = 0; t < nt; t++) {
        for (let c = 0; c < 3; c++) {
          const i = idx ? idx[t * 3 + c] : t * 3 + c, x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          P[c * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[c * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[c * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
        tris++;
        const lo = [Math.min(P[0], P[3], P[6]), Math.min(P[1], P[4], P[7]), Math.min(P[2], P[5], P[8])], hi = [Math.max(P[0], P[3], P[6]), Math.max(P[1], P[4], P[7]), Math.max(P[2], P[5], P[8])];
        for (const u of cand) {
          if (!over(lo, hi, u.min, u.max)) continue;
          u.bx.forEach((b, bi) => {
            if (u.kind === 'gerb' && b.h < FEET && cls !== 'ours') return;
            const gp = cls === 'ours' ? GAP : 0, mn = [b.min[0] - gp, b.min[1], b.min[2] - gp], mx = [b.max[0] + gp, b.max[1], b.max[2] + gp];
            if (!over(lo, hi, mn, mx)) return;
            const poly = clipBox(P, mn, mx); if (poly.length < 3) return;
            const r = rec(u, bi, tag, cls);
            if (cls !== 'ours') { rasterize(r.g[0], poly, mn, mx, 0, 2); rasterize(r.g[1], poly, mn, mx, 0, 1); rasterize(r.g[2], poly, mn, mx, 2, 1); }
          });
        }
      }
    }
  }
  for (const ob of boxes) for (const u of U) u.bx.forEach((b, bi) => { if (over(ob.min, ob.max, b.min, b.max)) rec(u, bi, ob.tag, 'ours'); });
  const out = { envKey: ENV_KEY, rule: { FEET, GAP, COVER }, units: [], collisions: 0, tris };
  for (const u of U) {
    const hits = [], glancing = [], thin = [];
    for (const r of u.rec.values()) {
      const cov = Math.max(...r.g.map(gr => gr.reduce((a, v) => a + v, 0) / (NG * NG)));
      const s = `${r.tag} @${r.band} m` + (r.cls === 'ours' ? '' : ` (${Math.round(cov * 100)} %)`);
      if (r.cls === 'ours' || (r.cls === 'solid' && cov >= COVER)) hits.push(s); else if (r.cls === 'solid') glancing.push(s); else thin.push(s);
    }
    out.units.push({ name: u.name, kind: u.kind, pos: u.p.map(q => +q.toFixed(2)), ok: !hits.length, hits, glancing, thin });
    if (hits.length) out.collisions++;
  }
  out.ms = +(performance.now() - t0).toFixed(1);
  return out;
}
