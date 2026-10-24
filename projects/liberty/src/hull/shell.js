// liberty/src/hull/shell.js: the shell lofted from the form (B1). Rows are waterline-like curves (a fraction u of the
// local depth to the deck at side, so the top row is the sheer line; then the bulwark's rows up to the rail), each from
// the profile's forward edge to its after edge; columns run fore and aft, aligned in the middle body and stretched at
// the ends, so the stem and the stern's profile are the grid's end columns. Built in ship coordinates (x starboard,
// y = abl, z aft); index.js bakes the ship's matrix in.
//   loftShell(F) -> { grid: { rows, P[j][i] = [x, h, z] }, geo (starboard + port shell), inner (the bulwark's inside),
//                     waterlineShip(toWorld) (the outline at the world's y = 0) }
const T = window.THREE;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

// the rows: u (fraction of the deck at side, so the bilge is resolved at the bottom, the counter's knuckle and the
// boot-top in the middle); then the bulwark's tau (fraction of the deck-to-rail height)
const U_ROWS = (() => {
  const h = [0, 0.015, 0.05, 0.11, 0.19, 0.3, 0.44, 0.6, 0.78, 0.98, 1.2, 1.45, 1.75, 2.1, 2.5, 2.9, 3.3, 3.7, 4.1, 4.5, 4.9,
    5.3, 5.6, 5.85, 6.1, 6.35, 6.6, 6.85, 7.1, 7.4, 7.75, 8.15, 8.6, 9.1, 9.6, 10.1, 10.55, 10.95, 11.25, 11.43];
  return h.map(v => v / 11.43);
})();
const TAU_ROWS = [0.25, 0.5, 0.75, 1.0];

// solve z = f(z) for a row's end (the profile edge at the row's own height; the sheer varies slowly, so this converges)
function solveEnd(fz, z0) { let z = z0; for (let k = 0; k < 12; k++) z = fz(z); return z; }

// the columns' z along a row from zF to zA: the middle body on a fixed grid (aligned row to row), the ends stretched
// and denser toward the profile
function columns(zF, zA, nF = 150, nM = 170, nA = 170, zm0 = -40, zm1 = 40) {
  const out = [];
  for (let i = 0; i < nF; i++) { const s = i / nF; out.push(zF + (zm0 - zF) * (0.45 * s + 0.55 * (1 - Math.cos(s * Math.PI / 2)))); }
  for (let i = 0; i < nM; i++) out.push(zm0 + (zm1 - zm0) * i / nM);
  for (let i = 0; i <= nA; i++) { const s = 1 - i / nA; out.push(zA - (zA - zm1) * (0.45 * s + 0.55 * (1 - Math.cos(s * Math.PI / 2)))); }
  return out;
}

export function loftShell(F) {
  const rows = [];
  // the keel row: the centreline at the baseline, from the forefoot to the post (the flat of bottom's inner edge)
  {
    const zF = F.zFwd(0), zA = F.zAft(0);
    rows.push({ kind: 'keel', zs: columns(zF, zA), x: () => 0, h: () => 0 });
  }
  for (const u of U_ROWS) {
    const hz = z => u * F.side(z);
    const zF = solveEnd(z => F.zFwd(hz(z)), F.zFwd(u * 11.43));
    const zA = solveEnd(z => F.zAft(hz(z)), F.zAft(u * 11.43));
    rows.push({ kind: 'shell', u, zs: columns(zF, zA), h: hz, x: z => F.hb(z, hz(z)) });
  }
  for (const tau of TAU_ROWS) {
    const hz = z => F.side(z) + tau * (F.rail(z) - F.side(z));
    const zF = solveEnd(z => F.zFwd(hz(z)), F.zFwd(F.side(-60)));
    const zA = Math.min(F.bulwarkAftZ, solveEnd(z => F.zAft(hz(z)), F.zAft(13)));
    rows.push({ kind: 'bulwark', tau, zs: columns(zF, zA), h: hz, x: z => F.hbRail(z, hz(z)) });
  }
  // the bulwark's rows end at the pipe rail (z 65.0): their columns stop short of the shell's, so the grid is split in
  // two blocks (the shell, rows 0..nShell; the bulwark on top of the last shell row, re-sampled on the bulwark's columns)
  const nShell = 1 + U_ROWS.length;
  const P = rows.map(r => r.zs.map(z => [r.x(z), r.h(z), z]));
  const ncol = P[0].length;
  // the bulwark block: its base row is the sheer line on the bulwark's own columns
  const bw = rows.slice(nShell);
  const baseRow = rows[nShell - 1];
  const PB = [bw[0].zs.map(z => [baseRow.x(z), baseRow.h(z), z]), ...bw.map(r => r.zs.map(z => [r.x(z), r.h(z), z]))];
  // the bulwark's end columns at the bow sit on the stem line: its base row starts where the sheer meets the stem
  for (let j = 0; j < PB.length; j++) PB[j][0][0] = 0;

  // girth below the deck edge (m) down each column of the shell block (uv.y; above the deck: minus the height over it)
  const girth = P.slice(0, nShell).map(r => r.map(() => 0));
  for (let i = 0; i < ncol; i++) {
    let g = 0;
    for (let j = nShell - 2; j >= 0; j--) { const a = P[j][i], b = P[j + 1][i]; g += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); girth[j][i] = g; }
  }
  const shellGeo = gridGeo(P.slice(0, nShell), (j, i) => [P[j][i][2], girth[j][i]]);
  const bulwGeo = gridGeo(PB, (j, i) => [PB[j][i][2], -(PB[j][i][1] - PB[0][i][1])]);
  // the bulwark's inside face: 12 mm in, facing inboard, from the deck to the rail
  const PI = PB.map(r => r.map(([x, h, z]) => [Math.max(0, x - 0.012), h, z]));
  const innerGeo = gridGeo(PI, (j, i) => [PI[j][i][2], PI[j][i][1] - PI[0][i][1]], true);
  return {
    rows, P, PB, nShell, ncol,
    geo: mirror(merge2(shellGeo, bulwGeo)), inner: mirror(innerGeo),
    // the outline where the world's y = 0 cuts the shell: per column, the first crossing going up (starboard, then
    // port back), as world [x, z]
    waterline(toWorld) {
      const st = [];
      for (let i = 0; i < ncol; i++) {
        let prev = null;
        for (let j = 0; j < nShell; j++) {
          const w = toWorld(...P[j][i]);
          if (prev && prev[1] < 0 && w[1] >= 0) { const t = -prev[1] / (w[1] - prev[1]); st.push([prev[0] + (w[0] - prev[0]) * t, prev[2] + (w[2] - prev[2]) * t]); break; }
          prev = w;
        }
      }
      // drop repeats (columns closing on the profile)
      const out = [];
      for (const p of st) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02) out.push(p); }
      const port = out.slice(1, -1).reverse().map(([x, z]) => [-x, z]);
      return out.concat(port);
    },
  };
}

// a grid of points [j][i] -> an indexed geometry with grid normals (outward for the starboard side: rows go up, columns
// aft), uv from uvf(j, i); flip: the inside face
function gridGeo(G, uvf, flip = false) {
  const nr = G.length, nc = G[0].length;
  const pos = new Float32Array(nr * nc * 3), nrm = new Float32Array(nr * nc * 3), uv = new Float32Array(nr * nc * 2);
  const at = (j, i) => G[Math.max(0, Math.min(nr - 1, j))][Math.max(0, Math.min(nc - 1, i))];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) {
    const k = j * nc + i, p = G[j][i];
    pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
    let di = sub(at(j, i + 1), at(j, i - 1)), dj = sub(at(j + 1, i), at(j - 1, i));
    if (Math.hypot(...dj) < 1e-6) dj = sub(at(j + 1, i + 1), at(j - 1, i - 1));
    // n = dj x di (outward for rows up, columns aft, on the starboard side)
    let n = [dj[1] * di[2] - dj[2] * di[1], dj[2] * di[0] - dj[0] * di[2], dj[0] * di[1] - dj[1] * di[0]];
    const l = Math.hypot(...n) || 1; n = n.map(v => v / l * (flip ? -1 : 1));
    nrm[k * 3] = n[0]; nrm[k * 3 + 1] = n[1]; nrm[k * 3 + 2] = n[2];
    const t = uvf(j, i); uv[k * 2] = t[0]; uv[k * 2 + 1] = t[1];
  }
  const idx = [];
  for (let j = 0; j < nr - 1; j++) for (let i = 0; i < nc - 1; i++) {
    const a = j * nc + i, b = (j + 1) * nc + i, c = b + 1, d = a + 1;
    if (!flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function merge2(a, b) {
  const na = a.attributes.position.count, out = new T.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const s = a.attributes[k].itemSize, arr = new Float32Array((na + b.attributes.position.count) * s);
    arr.set(a.attributes[k].array, 0); arr.set(b.attributes[k].array, na * s);
    out.setAttribute(k, new T.BufferAttribute(arr, s));
  }
  const ia = a.index.array, ib = b.index.array, idx = new Uint32Array(ia.length + ib.length);
  idx.set(ia, 0); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + na;
  out.setIndex(new T.BufferAttribute(idx, 1));
  return out;
}
// starboard + its mirror (port): x negated, winding reversed
export function mirror(g) {
  const n = g.attributes.position.count, out = new T.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = g.attributes[k], s = a.itemSize, arr = new Float32Array(n * 2 * s);
    arr.set(a.array, 0);
    for (let i = 0; i < n; i++) for (let c = 0; c < s; c++) arr[(n + i) * s + c] = a.array[i * s + c] * ((k !== 'uv' && c === 0) ? -1 : 1);
    out.setAttribute(k, new T.BufferAttribute(arr, s));
  }
  // aSide: +1 starboard, -1 port (the pier's side gets the fender scuffs)
  const side = new Float32Array(n * 2); side.fill(1, 0, n); side.fill(-1, n);
  out.setAttribute('aSide', new T.BufferAttribute(side, 1));
  const ia = g.index.array, idx = new Uint32Array(ia.length * 2);
  idx.set(ia, 0);
  for (let t = 0; t < ia.length; t += 3) { idx[ia.length + t] = ia[t] + n; idx[ia.length + t + 1] = ia[t + 2] + n; idx[ia.length + t + 2] = ia[t + 1] + n; }
  out.setIndex(new T.BufferAttribute(idx, 1));
  return out;
}
