// liberty/src/stage/structure.js: what the show stands on and hangs from (show.md §5 S1-S7): the decks on adjustable
// legs (and scaffold where the drop to the deck is long) over No. 2's cover and the deck beside it, levelled though
// she is trimmed, every foot on a timber pad (nothing drilled into a heritage ship: S7); the risers, the stairs and the
// skirts; four ground-support towers with their base frames, outriggers, ballast totes, sleeve blocks and hoists; the
// grid of 12 in box truss; the PA (K2 hangs aimed at the apron, subs under the lip, front fills, wedges, side fills);
// the LED wall's header and panels' backs; the backline (drums, amps, keys, stands); the crew's corner upstage on the
// port deck (cases, the monitor desk, racks, the distro, hazers, extinguishers by every flame); the cables; the pyro
// barge off her port side. Static: what moves (the heads, the effects) is the rig's and the effects' files.
import { Geo, V, boxTruss, frame } from './geo.js';
import { rng } from 'scene3d/util.js';

const T = window.THREE;

export function buildStructure(world, M, L, P, G0) {
  // every foot set 1.5 cm into what it stands on (the hull's triangles against its analytic deck: a contact, never a hover)
  const G = Object.assign({}, G0, { footY: (x, z) => G0.footY(x, z) - 0.015, deckY: (x, z) => G0.deckY(x, z) - 0.015 });
  const g = {
    truss: new Geo(), scaff: new Geo(), black: new Geo(), gloss: new Geo(), grille: new Geo(), deck: new Geo(), carpet: new Geo(),
    timber: new Geo(), tote: new Geo(), galv: new Geo(), cable: new Geo(), ramp: new Geo(), case: new Geo(), drum: new Geo(),
    chrome: new Geo(), bronze: new Geo(), head: new Geo(), barge: new Geo(), tube: new Geo(),
  };
  const R = rng(3511), F = L.F, D = L.deck, out = { counts: {}, legs: [], stoppers: [] };
  const pad = (x, z, y, s = 0.3) => g.timber.box([x, y + 0.02, z], [s, 0.04, s], 0, R());

  // ---- the decks: each platform a 0.10 m frame + ply, four legs (inset 50 mm) to the cover or the deck, a pad each;
  // a leg longer than 1.25 m stands in a scaffold bay (standards, ledgers at 1 m, a diagonal) instead
  for (const pl of D.platforms) {
    g.deck.box([(pl.x0 + pl.x1) / 2, F - 0.011, (pl.z0 + pl.z1) / 2], [pl.x1 - pl.x0 - 0.004, 0.022, pl.z1 - pl.z0 - 0.004], 0, R());
    g.black.box([(pl.x0 + pl.x1) / 2, F - 0.061, (pl.z0 + pl.z1) / 2], [pl.x1 - pl.x0 - 0.01, 0.078, pl.z1 - pl.z0 - 0.01], 0, R());
    const legs = [[pl.x0 + 0.05, pl.z0 + 0.05], [pl.x1 - 0.05, pl.z0 + 0.05], [pl.x0 + 0.05, pl.z1 - 0.05], [pl.x1 - 0.05, pl.z1 - 0.05]];
    for (const [x, z] of legs) {
      const y0 = G.footY(x, z) + 0.04, y1 = F - 0.1, len = y1 - y0;
      out.legs.push(+len.toFixed(3));
      pad(x, z, y0 - 0.04);
      if (len <= 1.25) g.scaff.bar([x, y0, z], [x, y1, z], 0.04, 0.04, R());
      else {
        // a scaffold standard with its base jack (a threaded stem in the plate) and a ledger tying it to its neighbour
        g.galv.tube([x, y0, z], [x, y0 + 0.3, z], 0.019, 6, R());
        g.scaff.tube([x, y0 + 0.3, z], [x, y1, z], 0.024, 8, R());
        const xi = x < (pl.x0 + pl.x1) / 2 ? pl.x1 - 0.05 : pl.x0 + 0.05;
        for (let yy = y0 + 0.35; yy < y1 - 0.2; yy += 1.0) g.scaff.tube([x, yy, z], [xi, yy, z], 0.024, 8, R());
        if (z === pl.z0 + 0.05) g.scaff.tube([x, y0 + 0.35, z], [x, Math.min(y1 - 0.05, y0 + 1.6), pl.z1 - 0.05], 0.024, 8, R());
      }
    }
  }
  out.counts.platforms = D.platforms.length;
  // the deck's stopper (beams end on the floor) and the floor's spike marks and lip line in its material
  out.stoppers.push(planeQuad([D.x0, F, D.z0], [D.x1, F, D.z0], [D.x1, F, D.z1], [D.x0, F, D.z1]));
  const mk = M.deck.uniforms;
  mk.uMod.value.set(D.mod, 8 * L.FT, D.x1, D.z0);
  Object.values(L.marks).forEach((m, i) => mk.uMarks.value[i].set(m.pos[0], m.pos[1], m.pos[2], m.tape));
  mk.uLip.value = D.x1 - 0.1;
  // ---- the risers: carpeted 8 x 8 (drums) and 4 x 8 (keys), black skirts, legs hidden behind them
  for (const r of Object.values(L.risers)) {
    g.carpet.box([(r.x0 + r.x1) / 2, F + r.h - 0.01, (r.z0 + r.z1) / 2], [r.x1 - r.x0, 0.02, r.z1 - r.z0], 0, R());
    pleats(g.black, [[r.x1, F + r.h - 0.02, r.z0], [r.x1, F + r.h - 0.02, r.z1]], r.h - 0.02, 0.025, 0.09);
    pleats(g.black, [[r.x0, F + r.h - 0.02, r.z0], [r.x1, F + r.h - 0.02, r.z0]], r.h - 0.02, 0.025, 0.09);
    pleats(g.black, [[r.x0, F + r.h - 0.02, r.z1], [r.x1, F + r.h - 0.02, r.z1]], r.h - 0.02, 0.025, 0.09);
    pleats(g.black, [[r.x0, F + r.h - 0.02, r.z0], [r.x0, F + r.h - 0.02, r.z1]], r.h - 0.02, 0.025, 0.09);
    out.stoppers.push(planeQuad([r.x0, F + r.h, r.z0], [r.x1, F + r.h, r.z0], [r.x1, F + r.h, r.z1], [r.x0, F + r.h, r.z1]));
  }
  // ---- the skirts: black serge, box-pleated, from the deck's edge to the ship's deck (the lip; the two ends but the
  // stairs' openings; the upstage side)
  const skirtTo = (x, z) => G.footY(x, z) + 0.02;
  const skirt = (a, b) => { const n = Math.ceil(V.len(V.sub(b, a)) / 0.6); for (let i = 0; i < n; i++) { const p0 = lerp3(a, b, i / n), p1 = lerp3(a, b, (i + 1) / n); const hgt = F - 0.1 - Math.max(skirtTo(p0[0], p0[2]), skirtTo(p1[0], p1[2])); pleats(g.black, [p0, p1], hgt, 0.03, 0.12); } };
  skirt([D.x1 + 0.02, F - 0.1, D.z0], [D.x1 + 0.02, F - 0.1, D.z1]);
  skirt([D.x0 - 0.02, F - 0.1, D.z0], [D.x0 - 0.02, F - 0.1, D.z1]);
  skirt([D.x0, F - 0.1, D.z0 - 0.02], [4.4, F - 0.1, D.z0 - 0.02]); skirt([6.05, F - 0.1, D.z0 - 0.02], [D.x1, F - 0.1, D.z0 - 0.02]);
  skirt([D.x0, F - 0.1, D.z1 + 0.02], [4.4, F - 0.1, D.z1 + 0.02]); skirt([6.05, F - 0.1, D.z1 + 0.02], [D.x1, F - 0.1, D.z1 + 0.02]);
  // ---- the stairs (aluminium stringers, treads with yellow nosing, handrails), stage left down to the bow and stage
  // right down aft, outboard of No. 2's coaming
  out.stairs = [];
  for (const dir of [-1, 1]) {
    const z0 = dir < 0 ? D.z0 : D.z1, xa = 4.5, xb = 5.95, foot = G.deckY((xa + xb) / 2, z0 + dir * 2.0);
    const rise = F - foot, n = Math.max(2, Math.round(rise / 0.18)), rr = rise / n, run = 0.28;
    for (let i = 1; i < n; i++) {
      const y = F - i * rr, z = z0 + dir * (i - 0.5) * run;
      g.timber.box([(xa + xb) / 2, y - 0.02, z], [xb - xa - 0.1, 0.04, run], 0, R());
      g.ramp.box([(xa + xb) / 2, y - 0.0, z + dir * (run / 2 - 0.03)], [xb - xa - 0.12, 0.012, 0.05], 0, 0.5);
    }
    const zEnd = z0 + dir * (n - 0.5) * run;
    for (const x of [xa + 0.03, xb - 0.03]) {
      g.scaff.bar([x, F - 0.05, z0], [x, foot + 0.02, zEnd + dir * 0.15], 0.05, 0.22, R());
      // the handrail on posts
      g.scaff.tube([x, F + 1.0, z0 + dir * 0.05], [x, foot + 1.0, zEnd + dir * 0.15], 0.021, 8, R());
      g.scaff.tube([x, F, z0 + dir * 0.05], [x, F + 1.0, z0 + dir * 0.05], 0.021, 8, R());
      g.scaff.tube([x, foot, zEnd + dir * 0.15], [x, foot + 1.0, zEnd + dir * 0.15], 0.021, 8, R());
      pad(x, zEnd + dir * 0.15, foot - 0.04, 0.25);
    }
    out.stairs.push({ side: dir < 0 ? 'SL' : 'SR', risers: n, rise: +rr.toFixed(3), run, foot: +foot.toFixed(2) });
  }
  // ---- ground support: the towers (20.5 in truss) on base frames with outriggers and jacks on sole boards, a sleeve
  // block at the grid, a top section with its chain hoist; two IBC water totes (1 t each) as ballast by each base
  // the ground support's footprints on the deck (bases, sole boards, totes: [x0, z0, x1, z1]): a foot is drawn in until its
  // board is clear of the others (the IMAG goalposts stand 1.3-1.7 m from the downstage towers)
  const feet = [];
  const clear = (x, z, hx, hz) => !feet.some(f => x + hx > f[0] - 0.03 && x - hx < f[2] + 0.03 && z + hz > f[1] - 0.03 && z - hz < f[3] + 0.03);
  const reserve = (x, z, hx, hz) => feet.push([x - hx, z - hz, x + hx, z + hz]);
  // the IMAG goalposts' geometry (built below): towers beside each screen, as far back as its frame's top edge
  // (the pyro on the deck and the stage's towers first: a goalpost's tower steps out from the screen until it is clear)
  for (const p of [...L.flames, ...L.gerbs.rail, ...L.sparks, ...L.co2]) reserve(p.pos[0], p.pos[2], 0.3, 0.3);
  for (const t of L.towers) reserve(t.x, t.z, 0.375, 0.375);
  const rigs = new Map();
  const imagRig = im => {
    if (rigs.has(im)) return rigs.get(im);
    const tilt = im.tilt * Math.PI / 180, ct = Math.cos(tilt), st = Math.sin(tilt);
    const c = [im.x - 0.04 - st * im.h / 2, im.y0 + im.h / 2 + (1 - ct) * im.h / 2, im.z];
    const topE = [c[0] - st * im.h / 2, c[1] + ct * im.h / 2], foot = [c[0] + st * im.h / 2, c[1] - ct * im.h / 2], tx = topE[0] - 0.05;
    const zs = [-1, 1].map(sg => { let d = im.w / 2 + 0.45; while (d < im.w / 2 + 1.5 && !clear(tx, im.z + sg * d, 0.3, 0.3)) d += 0.05; return im.z + sg * d; });
    const r = { ct, st, c, topE, foot, tx, head: topE[1] + 1.15, zs }; rigs.set(im, r); return r;
  };
  for (const im of L.imag) { const r = imagRig(im); for (const tz of r.zs) { reserve(r.tx, tz, 0.3, 0.3); reserve(r.tx - 1.55, tz, 0.5, 0.6); } }
  out.towers = [];
  for (const t of L.towers) {
    const y0 = t.base + 0.16, y1 = t.top, h = t.size / 2;
    boxTruss(g.truss, [t.x, y0, t.z], [t.x, y1, t.z], { size: t.size, chord: 0.0254, diag: 0.0127, sec: 2.0, up: [0, 0, 1], seed: R() });
    // the base: a steel frame with four outriggers to jacks on sole boards
    g.black.box([t.x, t.base + 0.09, t.z], [0.75, 0.14, 0.75], 0, R()); reserve(t.x, t.z, 0.375, 0.375);
    for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      // (an outrigger's sole board stays on her deck: the downstage towers stand 0.85 m inside her side, and at full
      // reach their outboard feet fell past it to the water, the tour's 'blue needles on plates' in the gap; such a
      // foot is drawn in along its diagonal until the whole board is on the deck)
      let s = 0.95;
      const onDeck = (x, z) => Math.abs(x) <= L.halfAt(z) - 0.3 && G.footY(x, z) > t.base - 0.3;
      while (s > 0.4 && !(onDeck(t.x + ax * (s + 0.25), t.z + az * (s + 0.25)) && clear(t.x + ax * s, t.z + az * s, 0.225, 0.225))) s -= 0.05;
      const ex = t.x + ax * s, ez = t.z + az * s, ey = G.footY(ex, ez); reserve(ex, ez, 0.225, 0.225);
      g.galv.bar([t.x + ax * 0.3, t.base + 0.12, t.z + az * 0.3], [ex, ey + 0.16, ez], 0.06, 0.06, R());
      g.galv.tube([ex, ey + 0.04, ez], [ex, ey + 0.2, ez], 0.02, 6, R());
      g.timber.box([ex, ey + 0.02, ez], [0.45, 0.04, 0.45], 0, R());
    }
    // the sleeve block round the tower at the grid's level, and its corner block for the trusses
    g.black.box([t.x, L.grid.y + L.grid.size / 2, t.z], [t.size + 0.16, 0.42, t.size + 0.16], 0, R());
    // the top: a hoist hanging from the top section's head block, its chain down to the sleeve block
    g.black.box([t.x, y1 + 0.08, t.z], [t.size + 0.06, 0.16, t.size + 0.06], 0, R());
    g.gloss.box([t.x + h * 0.5, y1 - 0.32, t.z], [0.26, 0.36, 0.22], 0, R());
    g.cable.tube([t.x + h * 0.5, y1 - 0.5, t.z], [t.x + h * 0.5, L.grid.y + L.grid.size + 0.2, t.z], 0.006, 4, 0.5);
    // the ballast: two IBC totes outboard of the base (along z away from the stage)
    const sz = t.z < L.deck.zc ? -1 : 1;
    // (the pair kept 0.35 m inside her side: the downstage towers' outboard tote overhung it by 0.27 m, on nothing; where
    // the pair doesn't fit across, it stands in line along her side instead, clear of the IMAG goalposts inboard of it)
    const tz = t.z + sz * 1.75, xMax = L.halfAt(tz) - 0.35 - 0.5;
    if (t.x + 0.65 <= xMax) for (const k of [0, 1]) { tote(g, R, t.x + (k ? 0.65 : -0.65), tz, G); reserve(t.x + (k ? 0.65 : -0.65), tz, 0.5, 0.6); }
    else for (const k of [0, 1]) { tote(g, R, Math.min(t.x, xMax), tz + sz * k * 1.25, G); reserve(Math.min(t.x, xMax), tz + sz * k * 1.25, 0.5, 0.6); }
    out.towers.push({ name: t.name, x: t.x, z: t.z, base: +t.base.toFixed(2), height: +(y1 - y0).toFixed(2) });
  }
  // ---- the IMAG screens on goalposts (ground support beside the stage): two 12 in towers flanking each screen, a header
  // truss across their heads, and the screen's frame hung under it on two chain hoists, tipped down at the apron (a
  // kicker at its foot). (The first cut stood one tower at the screen's own z, 0.55 m behind its foot: the tipped face
  // leans back past it, so the truss ran down the middle of the picture, in front of its upper half; the director's
  // screenshot, 2026-10-24.) Nothing stands between a screen and the apron
  out.imag = [];
  for (const im of L.imag) {
    // the frame: a black back (the face is screens.js's); the goalpost: towers at the screen's sides, as far back as its
    // frame's top edge (beside the picture from any seat in front)
    const { ct, st, c, topE, foot, tx, head, zs } = imagRig(im);
    g.black.obox(c, [0.045, im.h / 2, im.w / 2 + 0.03], [[ct, st, 0], [-st, ct, 0], [0, 0, 1]], R());
    for (const tz of zs) {
      const y0 = G.deckY(tx, tz) + 0.12;
      boxTruss(g.truss, [tx, y0, tz], [tx, head, tz], { size: 0.29, sec: 2.0, up: [0, 0, 1], seed: R() });
      g.black.box([tx, y0 - 0.05, tz], [0.6, 0.12, 0.6], 0, R());
      g.black.box([tx, head + 0.2, tz], [0.4, 0.12, 0.4], 0, R());                    // (the head block)
      for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        let s2 = 0.8; while (s2 > 0.35 && !clear(tx + ax * s2, tz + az * s2, 0.2, 0.2)) s2 -= 0.05;
        const ex = tx + ax * s2, ez = tz + az * s2, ey = G.footY(ex, ez); reserve(ex, ez, 0.2, 0.2);
        g.galv.bar([tx + ax * 0.25, y0 - 0.02, tz + az * 0.25], [ex, ey + 0.14, ez], 0.05, 0.05, R()); g.timber.box([ex, ey + 0.02, ez], [0.4, 0.04, 0.4], 0, R());
      }
      tote(g, R, tx - 1.55, tz, G);                       // (its ballast, behind it, clear of its outriggers)
    }
    // the header: a 12 in truss across the towers' heads; two chain hoists under it, their chains to the frame's top
    // corners; a kicker from the frame's foot back to the deck holds the tip (12 deg)
    boxTruss(g.truss, [tx, head, zs[0]], [tx, head, zs[1]], { size: 0.29, sec: 2.0, up: [1, 0, 0], seed: R() });
    for (const dz of [-im.w / 2 + 0.25, im.w / 2 - 0.25]) {
      const hz = im.z + dz;
      g.gloss.box([tx, head - 0.35, hz], [0.26, 0.36, 0.22], 0, R());
      g.cable.tube([tx, head - 0.53, hz], [topE[0], topE[1] + 0.02, hz], 0.007, 4, 0.5);
    }
    for (const dz of [-im.w / 2 + 0.2, im.w / 2 - 0.2]) g.galv.tube([foot[0] - 0.06, foot[1] + 0.05, im.z + dz], [tx - 0.6, G.deckY(tx - 0.6, im.z + dz) + 0.05, im.z + dz], 0.025, 6, R());
    out.imag.push({ side: im.side < 0 ? 'SL' : 'SR', at: [im.x, im.z], bottom: im.y0, top: +(im.y0 + im.h).toFixed(2), towers: zs.map(z => +z.toFixed(2)), towerX: +tx.toFixed(2), head: +head.toFixed(2) });
  }
  // ---- the grid: 12 in box truss; corner blocks where trusses meet
  let gridTris = 0;
  for (const tr of L.trusses) gridTris += boxTruss(g.truss, tr.a, tr.b, { size: L.grid.size, chord: 0.0254, diag: 0.0127, sec: 3.0, seed: R() });
  const gy = L.grid.y + L.grid.size / 2;
  for (const z of [L.grid.z0, L.grid.z1]) g.black.box([L.grid.xM, gy, z], [0.36, 0.36, 0.36], 0, R());
  out.grid = { y: L.grid.y, trusses: L.trusses.map(t => ({ name: t.name, length: +V.len(V.sub(t.b, t.a)).toFixed(2) })), tris: gridTris };
  // ---- the PA: K2 hangs (S4: 1338 x 354 x 400 mm, splays 0.25-10 deg) aimed at the apron: the top box at its far edge,
  // the bottom at its near edge, the splays between from those two depressions (measure.js checks the coverage)
  out.pa = [];
  for (const pa of L.pa) {
    const top = [pa.x + 0.2, pa.top - 0.045, pa.z];
    // the aims: far edge of the apron (the shed's wall) at ear height 1.6 m, near edge 0.8 m in
    const ear = P.PIER.deck + 1.6, far = [P.PIER.x0 + P.PIER.apronW, ear], near = [P.PIER.x0 + 0.8, ear];
    const dep = (p, q) => Math.atan2(p[1] - q[1], q[0] - p[0]);
    const th0 = dep([top[0], top[1]], far), th1 = dep([top[0], top[1] - pa.n * 0.354], near);
    const H = 0.354, Dp = 0.4, W2 = 1.338 / 2, aims = [];
    let Fp = [top[0], top[1]];
    g.black.box([pa.x + 0.05, pa.top, pa.z], [0.62, 0.1, 1.42], 0, R());                         // the bumper
    g.gloss.box([pa.x + 0.05, L.grid.y - 0.15, pa.z], [0.24, 0.26, 0.24], 0, R());                   // its hoist, under the front truss
    g.cable.tube([pa.x + 0.05, L.grid.y - 0.27, pa.z], [pa.x + 0.05, pa.top + 0.04, pa.z], 0.008, 5, 0.5);   // its chain
    for (let k = 0; k < pa.n; k++) {
      const th = th0 + (th1 - th0) * (k / (pa.n - 1)) ** 1.35;
      aims.push(+(th * 180 / Math.PI).toFixed(1));
      const n = [Math.cos(th), -Math.sin(th), 0], up = [Math.sin(th), Math.cos(th), 0], bk = V.mul(n, -1);
      const c = [Fp[0] - up[0] * H / 2 + bk[0] * Dp / 2, Fp[1] - up[1] * H / 2 + bk[1] * Dp / 2, pa.z];
      g.black.obox(c, [Dp / 2 - 0.01, H / 2 - 0.004, W2], [V.mul(n, -1), up, [0, 0, 1]], R());
      g.grille.obox(V.add(c, V.mul(n, Dp / 2 - 0.004)), [0.006, H / 2 - 0.02, W2 - 0.03], [n, up, [0, 0, 1]], R());
      Fp = [Fp[0] - up[0] * H, Fp[1] - up[1] * H];
    }
    out.pa.push({ side: pa.side < 0 ? 'SL' : 'SR', boxes: pa.n, aimsDeg: aims, splaysDeg: aims.slice(1).map((a, i) => +(a - aims[i]).toFixed(1)) });
  }
  // subs under the lip (KS28: 1344 x 550 x 700) on the deck, behind the skirt; front fills on the lip; side fills
  for (const s of L.subs) { const y = G.footY(s.x, s.z); speaker(g, [s.x - 0.35, y, s.z], [0.7, 0.55, 1.344], [-1, 0, 0], R); }
  for (const f of L.fills) speaker(g, [f.x - 0.13, F, f.z], [0.26, 0.38, 0.25], [1, -0.35, 0], R, 0.5);
  for (const z of [D.z0 + 0.5, D.z1 - 0.5]) { speaker(g, [D.x1 - 1.9, F, z], [0.6, 0.55, 0.7], [0, 0, z < D.zc ? 1 : -1], R); speaker(g, [D.x1 - 1.9, F + 0.545, z], [0.45, 0.7, 0.42], [0, 0, z < D.zc ? 1 : -1], R); }
  // ---- wedges (X15: 0.6 deep, 0.48 wide), each in front of its mark, faced up at the player
  const wedgeFor = m => { const f = m.face, x = m.pos[0] + f[0] * 0.95, z = m.pos[2] + f[2] * 0.95; wedge(g, [x, m.pos[1], z], [-f[0], 0, -f[2]], R); };
  for (const k of ['vocal', 'guitar', 'bass']) wedgeFor(L.marks[k]);
  wedge(g, [L.marks.vocal.pos[0] + 0.85, F, L.marks.vocal.pos[2] - 0.6], [-0.9, 0, 0.44], R);
  // ---- the LED wall: its header bar (flown on four hoists from the back truss) and the panels' backs (the face is
  // screens.js's emissive)
  const led = L.led;
  g.black.box([led.x - 0.12, led.y1 + 0.08, (led.z0 + led.z1) / 2], [0.12, 0.16, led.z1 - led.z0 + 0.2], 0, R());
  const cf = L.grid.size / 2;
  for (let i = 0; i < 4; i++) { const z = led.z0 + 0.6 + i * (led.z1 - led.z0 - 1.2) / 3, hx = L.grid.xB + cf; g.gloss.box([hx, L.grid.y - 0.17, z], [0.22, 0.3, 0.22], 0, R()); g.cable.tube([hx, L.grid.y - 0.3, z], [led.x - 0.12, led.y1 + 0.14, z], 0.006, 4, 0.5); }
  g.black.box([led.x - 0.04, (led.y0 + led.y1) / 2, (led.z0 + led.z1) / 2], [0.08, led.y1 - led.y0, led.z1 - led.z0], 0, R());
  out.stoppers.push(planeQuad([led.x, led.y0, led.z0], [led.x, led.y0, led.z1], [led.x, led.y1, led.z1], [led.x, led.y1, led.z0]));
  // the wings' frames: a ladder of 12 in truss leaning out from the wall's sides (their dots are screens.js's)
  for (const w of L.wings) {
    const a = [w.x, w.y0, w.zIn], b = [w.x, w.y1, w.zIn + w.side * w.lean], a2 = [w.x, w.y0, w.zOut], b2 = [w.x, w.y1, w.zOut + w.side * w.lean];
    boxTruss(g.truss, a, b, { size: 0.29, sec: 3.0, up: [1, 0, 0], seed: R() });
    boxTruss(g.truss, a2, b2, { size: 0.29, sec: 3.0, up: [1, 0, 0], seed: R() });
    for (const y of [w.y0 + 0.2, w.y1 - 0.2]) { const f = (y - w.y0) / (w.y1 - w.y0); g.truss.tube([w.x, y, w.zIn + w.side * w.lean * f], [w.x, y, w.zOut + w.side * w.lean * f], 0.0254, 8, R()); }
  }
  // ---- the tower fixtures' shelves (a plate on an arm clamped to the tower's chord) and the hull washes' wind-up stands
  //      on the apron (tripod legs, a telescopic mast, a T-bar under the fixture)
  for (const f of L.fixtures) {
    if (f.group === 'tower') { const yb = f.pos[1] - 0.385; g.galv.box([f.pos[0] - 0.08, yb, f.pos[2]], [0.62, 0.03, 0.36], 0, R()); }
    if (f.group === 'pier') {
      // (they stand on the pier's apron, its deck: the ship's footY there is the water, and the stands' tripods stood
      // 2.95 m down under the apron; one leg points away from the shed's wall, the other two splay along it, clear of it)
      const [x, y, z] = f.pos, y0 = L.pierEdge.floor, yt = y - 0.372;
      g.galv.tube([x, y0 + 0.15, z], [x, yt, z], 0.03, 8, R()); g.galv.tube([x, y0 + 1.0, z], [x, y0 + 1.25, z], 0.045, 8, R());
      for (let k = 0; k < 3; k++) { const a = k * 2.094 + Math.PI; g.galv.tube([x + Math.cos(a) * 0.04, y0 + 1.05, z + Math.sin(a) * 0.04], [x + Math.cos(a) * 0.75, y0, z + Math.sin(a) * 0.75], 0.018, 6, R()); }
      g.galv.box([x, yt - 0.012, z], [0.5, 0.03, 0.06], 0, R());
    }
  }
  // ---- the backline
  backline(g, L, R);
  // ---- the crew's corner, upstage on the port deck: cases, the monitor desk, racks, the distro, hazers, a ladder
  crew(g, L, G, R, out);
  // ---- extinguishers by every flame unit and gerb group (a pyro show's rule), red with a black hose
  out.extinguishers = 0;
  // (1.7 m inboard: outside the flame's drawn column and its metre of air, clearance.js)
  for (const f of L.flames) { extinguisher(g, [f.pos[0] - 1.7, G.footY(f.pos[0] - 1.7, f.pos[2]), f.pos[2]], R); out.extinguishers++; }
  // ---- the cables: the multicore from the stage box to the monitor world; each mark's line to the stage box;
  // the feeders from the distro to the towers; ramps where they cross the stairs' feet
  cables(g, L, G, R, out);
  // ---- the pyro barge
  barge(g, L, R, out);

  // the meshes, one a material
  const mats = { truss: M.truss, scaff: M.scaffold, black: M.black, gloss: M.blackGloss, grille: M.grille, deck: M.deck, carpet: M.carpet, timber: M.timber,
    tote: M.tote, galv: M.galv, cable: M.cable, ramp: M.ramp, case: M.case, drum: M.drum, chrome: M.chrome, bronze: M.bronze, head: M.drumhead, barge: M.barge, tube: M.tube };
  out.meshes = {}; let tris = 0;
  for (const [k, gg] of Object.entries(g)) {
    if (!gg.count) continue;
    const m = world.mesh(gg.geometry(), mats[k], { name: 'stage ' + k });
    out.meshes[k] = m; tris += gg.tris; out.counts[k] = gg.tris;
  }
  out.tris = tris;
  return out;
}

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function planeQuad(a, b, c, d) {
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)); g.computeVertexNormals();
  return new T.Mesh(g, new T.MeshBasicMaterial({ side: T.DoubleSide }));
}
// box-pleated fabric hanging from the top line a -> b, height h, pleat depth d, pleat pitch p
function pleats(G, [a, b], h, d, p) {
  const L = V.len(V.sub(b, a)); if (L < 1e-3 || h < 0.02) return;
  const dir = V.norm(V.sub(b, a)), side = V.norm(V.cross(dir, [0, 1, 0])), n = Math.max(1, Math.round(L / p));
  const base = G.count;
  for (let i = 0; i <= n * 2; i++) {
    const f = i / (n * 2), off = (i % 2 ? d : 0), p0 = V.add(lerp3(a, b, f), V.mul(side, off));
    const nn = V.norm(V.add(side, V.mul(dir, i % 2 ? 0.6 : -0.6)));
    G.vert(p0, nn, f * L, 0, 0.5); G.vert(V.add(p0, [0, -h, 0]), nn, f * L, h, 0.5);
  }
  for (let i = 0; i < n * 2; i++) { const o = base + i * 2; G.tri(o, o + 1, o + 2); G.tri(o + 1, o + 3, o + 2); G.tri(o, o + 2, o + 1); G.tri(o + 1, o + 2, o + 3); }
}
// a speaker box standing at p (its bottom centre), size [depth, height, width], front facing f
function speaker(G, p, [d, h, w], f, R, tilt = 0) {
  const fn = V.norm(f), up = V.norm(V.sub([0, 1, 0], V.mul(fn, V.dot([0, 1, 0], fn)))), sd = V.norm(V.cross(fn, up));
  const c = V.add(p, V.mul(up, h / 2));
  G.black.obox(c, [d / 2, h / 2, w / 2], [fn, up, sd], R());
  G.grille.obox(V.add(c, V.mul(fn, d / 2 + 0.003)), [0.004, h / 2 - 0.025, w / 2 - 0.025], [fn, up, sd], R());
}
function wedge(G, p, f, R) {
  // a wedge monitor: a low box tipped back 35 deg toward the player
  const fn = V.norm(f), sd = V.norm(V.cross(fn, [0, 1, 0])), a = 35 * Math.PI / 180;
  const fr = V.norm(V.add(V.mul(fn, Math.cos(a)), [0, Math.sin(a), 0])), up = V.norm(V.cross(sd, fr));
  const c = V.add(p, [0, 0.165, 0]);
  G.black.obox(c, [0.16, 0.2, 0.24], [fr, up, sd], R());
  G.grille.obox(V.add(c, V.mul(fr, 0.163)), [0.004, 0.17, 0.21], [fr, up, sd], R());
}
function tote(G, R, x, z, Gr) {
  const y = Gr.footY(x, z);
  G.timber.box([x, y + 0.07, z], [1.0, 0.14, 1.2], 0, R());
  G.tote.box([x, y + 0.6, z], [0.92, 0.92, 1.12], 0, R());
  // the galvanised cage: verticals and three bands
  for (const [dx, dz] of [[-0.48, -0.58], [0.48, -0.58], [-0.48, 0.58], [0.48, 0.58]]) G.galv.tube([x + dx, y + 0.14, z + dz], [x + dx, y + 1.12, z + dz], 0.012, 5, 0.5);
  for (const yy of [0.45, 0.8, 1.1]) for (const [a, b] of [[[-0.48, -0.58], [0.48, -0.58]], [[0.48, -0.58], [0.48, 0.58]], [[0.48, 0.58], [-0.48, 0.58]], [[-0.48, 0.58], [-0.48, -0.58]]])
    G.galv.tube([x + a[0], y + yy, z + a[1]], [x + b[0], y + yy, z + b[1]], 0.01, 4, 0.5);
  G.black.cyl([x, y + 1.075, z], [0, 1, 0], 0.15, 0.03, 10, 0.3);
}
function extinguisher(G, p, R) {
  const r = rng(Math.round(p[2] * 100));
  G.case.box([p[0], p[1] + 0.02, p[2]], [0.3, 0.04, 0.3], 0, 0.5);
  G.drum.cyl([p[0], p[1] + 0.335, p[2]], [0, 1, 0], 0.085, 0.3, 12, r());       // (the drum shell's red)
  G.black.tube([p[0], p[1] + 0.7, p[2]], [p[0] + 0.05, p[1] + 0.78, p[2]], 0.02, 6, 0.5);
  G.cable.tube([p[0] + 0.05, p[1] + 0.72, p[2]], [p[0] + 0.1, p[1] + 0.35, p[2] + 0.04], 0.008, 5, 0.5);
}

// ---- the backline: a five-piece's kit, amps and keys, stands, pedalboards
function backline(g, L, R) {
  const F = L.F, m = L.marks;
  // the drum kit on its riser: the throne at the mark, the kit in front (+x)
  const d = m.drums.pos, y = d[1], x0 = d[0], z0 = d[2];
  const shell = (c, ax, r, hl) => { g.drum.tube(V.add(c, V.mul(ax, -hl)), V.add(c, V.mul(ax, hl)), r, 18, R()); g.head.disc(V.add(c, V.mul(ax, hl)), ax, r, 18, 0.5); g.head.disc(V.add(c, V.mul(ax, -hl)), V.mul(ax, -1), r, 18, 0.5); g.chrome.tube(V.add(c, V.mul(ax, hl - 0.012)), V.add(c, V.mul(ax, hl + 0.004)), r + 0.008, 18, 0.5); g.chrome.tube(V.add(c, V.mul(ax, -hl - 0.004)), V.add(c, V.mul(ax, -hl + 0.012)), r + 0.008, 18, 0.5); };
  const stand = (base, top) => { g.chrome.tube(base, top, 0.011, 6, 0.5); for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.4; g.chrome.tube(V.add(base, [0, 0.25, 0]), [base[0] + Math.cos(a) * 0.32, base[1], base[2] + Math.sin(a) * 0.32], 0.008, 5, 0.5); } };
  const cym = (c0, r, tilt = 0.12) => { const n = V.norm([tilt, 1, 0.05]), c = V.sub(c0, V.mul(n, r * 0.06 - 0.004)); const [u, v] = frame(n); const G2 = g.bronze; const base = G2.count; G2.vert(V.add(c, V.mul(n, r * 0.06)), n, 0, 0, 0.5); for (let k = 0; k <= 20; k++) { const a = k / 20 * Math.PI * 2, q = V.add(c, V.add(V.mul(u, Math.cos(a) * r), V.mul(v, Math.sin(a) * r))); G2.vert(q, n, Math.cos(a) * r, Math.sin(a) * r, 0.5); } for (let k = 0; k < 20; k++) { G2.tri(base, base + 1 + k, base + 2 + k); G2.tri(base, base + 2 + k, base + 1 + k); } };
  // throne
  g.black.cyl([x0, y + 0.52, z0], [0, 1, 0], 0.19, 0.05, 14, R()); stand([x0, y, z0], [x0, y + 0.47, z0]);
  shell([x0 + 0.85, y + 0.275, z0], [1, 0, 0], 0.28, 0.23);                // kick 22 x 18
  g.black.disc([x0 + 1.085, y + 0.29, z0], [1, 0, 0], 0.07, 12, 0.5);       // its port hole
  shell([x0 + 0.5, y + 0.62, z0 - 0.32], [0.1, 1, 0], 0.178, 0.07);         // snare 14 x 5.5
  stand([x0 + 0.5, y, z0 - 0.32], [x0 + 0.5, y + 0.55, z0 - 0.32]);
  shell([x0 + 0.78, y + 0.82, z0 - 0.15], V.norm([-0.5, 1, 0]), 0.153, 0.11);   // rack tom 12
  g.chrome.tube([x0 + 0.82, y + 0.54, z0 - 0.05], [x0 + 0.79, y + 0.76, z0 - 0.14], 0.012, 6, 0.5);           // its arm from the kick's mount
  shell([x0 + 0.42, y + 0.5, z0 + 0.45], [0, 1, 0], 0.203, 0.2);            // floor tom 16
  for (const a of [0.6, 2.6, 4.6]) g.chrome.tube([x0 + 0.42 + Math.cos(a) * 0.22, y + 0.45, z0 + 0.45 + Math.sin(a) * 0.22], [x0 + 0.42 + Math.cos(a) * 0.26, y, z0 + 0.45 + Math.sin(a) * 0.26], 0.008, 5, 0.5);
  // hi-hat (stage left of the snare), crashes, ride
  stand([x0 + 0.42, y, z0 - 0.62], [x0 + 0.42, y + 0.95, z0 - 0.62]); cym([x0 + 0.42, y + 0.9, z0 - 0.62], 0.178, 0.0); cym([x0 + 0.42, y + 0.93, z0 - 0.62], 0.178, 0.0);
  stand([x0 + 0.95, y, z0 - 0.6], [x0 + 0.95, y + 1.25, z0 - 0.55]); cym([x0 + 0.95, y + 1.255, z0 - 0.55], 0.23, -0.25);
  stand([x0 + 0.95, y, z0 + 0.62], [x0 + 0.95, y + 1.32, z0 + 0.55]); cym([x0 + 0.95, y + 1.325, z0 + 0.55], 0.24, -0.25);
  stand([x0 + 0.62, y, z0 + 0.88], [x0 + 0.62, y + 1.05, z0 + 0.82]); cym([x0 + 0.62, y + 1.055, z0 + 0.82], 0.27, -0.12);
  // drum mics: short boom stands at the kick and overheads
  stand([x0 + 1.35, y, z0 - 0.35], [x0 + 1.35, y + 0.45, z0 - 0.35]); g.black.tube([x0 + 1.35, y + 0.45, z0 - 0.35], [x0 + 1.12, y + 0.35, z0 - 0.08], 0.008, 5, 0.5);
  // guitar: a half stack (4x12 + head) behind the mark; bass: an 8x10 + head
  const gp = m.guitar.pos, bp = m.bass.pos;
  const cab = (x, z, w, h, d2) => { g.black.box([x, F + h / 2, z], [d2, h, w], 0, R()); g.grille.box([x + d2 / 2 + 0.003, F + h / 2, z], [0.006, h - 0.06, w - 0.06], 0, R()); };
  cab(gp[0] - 2.3, gp[2] + 0.2, 0.76, 0.76, 0.36); g.black.box([gp[0] - 2.3, F + 0.76 + 0.13, gp[2] + 0.2], [0.24, 0.26, 0.71], 0, R()); g.chrome.box([gp[0] - 2.17, F + 0.76 + 0.13, gp[2] + 0.2], [0.01, 0.06, 0.6], 0, 0.5);
  cab(gp[0] - 2.3, gp[2] - 0.65, 0.76, 0.76, 0.36);
  cab(bp[0] - 2.3, bp[2] - 0.2, 0.61, 1.24, 0.45); g.black.box([bp[0] - 2.3, F + 1.24 + 0.1, bp[2] - 0.2], [0.3, 0.2, 0.6], 0, R());
  // pedalboards
  g.case.box([gp[0] + 0.45, F + 0.04, gp[2]], [0.32, 0.08, 0.62], 0, R()); g.case.box([bp[0] + 0.45, F + 0.04, bp[2]], [0.3, 0.08, 0.5], 0, R());
  // keys: a two-tier stand, two boards
  const kp = m.keys.pos, kf = m.keys.face, ks = V.norm(V.cross(kf, [0, 1, 0]));
  for (const s of [-1, 1]) { const b = V.add(kp, V.add(V.mul(kf, 0.55), V.mul(ks, s * 0.5))); g.black.tube(b, V.add(b, [0, 1.06, 0]), 0.016, 6, 0.5); g.black.tube(V.add(b, V.mul(kf, 0.25)), V.add(b, V.mul(kf, -0.25)), 0.014, 6, 0.5); }
  g.black.obox(V.add(kp, V.add(V.mul(kf, 0.6), [0, 0.86, 0])), [0.17, 0.06, 0.62], [kf, [0, 1, 0], ks], R());
  g.head.obox(V.add(kp, V.add(V.mul(kf, 0.52), [0, 0.925, 0])), [0.07, 0.008, 0.58], [kf, [0, 1, 0], ks], 0.5);
  g.black.obox(V.add(kp, V.add(V.mul(kf, 0.68), [0, 1.08, 0])), [0.15, 0.05, 0.5], [kf, [0, 1, 0], ks], R());
  // mic stands: the vocal's straight stand, the guitar and bass on booms
  const micStand = (p, f, boom) => { g.black.disc([p[0], p[1] + 0.012, p[2]], [0, 1, 0], 0.14, 14, 0.5); g.black.cyl([p[0], p[1] + 0.006, p[2]], [0, 1, 0], 0.14, 0.006, 14, 0.5);
    const top = [p[0], p[1] + (boom ? 1.15 : 1.5), p[2]]; g.black.tube([p[0], p[1], p[2]], top, 0.011, 6, 0.5);
    const mic = boom ? V.add(top, V.add(V.mul(f, -0.45), [0, 0.38, 0])) : top; if (boom) g.black.tube(top, mic, 0.009, 6, 0.5);
    g.black.tube(mic, V.add(mic, V.add(V.mul(f, -0.16), [0, 0.02, 0])), 0.018, 8, 0.5); g.chrome.cyl(V.add(mic, V.mul(f, -0.19)), V.norm(V.mul(f, -1)), 0.026, 0.035, 10, 0.5); };
  micStand(V.add(m.vocal.pos, V.mul(m.vocal.face, 0.32)), m.vocal.face, false);
  micStand(V.add(gp, V.mul(m.guitar.face, 0.6)), m.guitar.face, true);
  micStand(V.add(bp, V.mul(m.bass.face, 0.6)), m.bass.face, true);
  micStand(V.add(kp, V.add(V.mul(kf, 0.45), V.mul(ks, -0.65))), kf, true);
  // a stage box (the multicore's head) by the drum riser, a guitar stand and a towel on the lip
  g.case.box([L.risers.drums.x0 - 0.35, F + 0.18, L.risers.drums.z1 + 0.5], [0.4, 0.36, 0.5], 0, R());
  for (const s of [-1, 1]) g.black.tube([gp[0] - 1.3, F, gp[2] + s * 0.12 - 0.9], [gp[0] - 1.3, F + 0.6, gp[2] - 0.9], 0.01, 5, 0.5);
}

// ---- the crew's corner: cases, the monitor desk, racks, the distro, hazers, a ladder, chairs
function crew(g, L, G, R, out) {
  const zc = L.deck.zc, cases = [];
  const at = (x, z) => G.footY(x, z);
  const rc = (x, z, w, h, d, rot = 0) => { const y = at(x, z); g.case.box([x, y + 0.06 + h / 2, z], [w, h, d], rot, R()); for (const [dx, dz] of [[-w / 2 + 0.08, -d / 2 + 0.08], [w / 2 - 0.08, d / 2 - 0.08]]) g.black.cyl([x + Math.cos(rot) * dx + Math.sin(rot) * dz, y + 0.04, z - Math.sin(rot) * dx + Math.cos(rot) * dz], [0, 1, 0], 0.045, 0.035, 8, 0.5); cases.push([x, z]); return y + 0.06 + h; };
  // the monitor world: the desk on two cases, a rack beside
  const deskTop = rc(-5.3, zc - 1.2, 1.25, 0.72, 0.7);
  g.black.obox([-5.3, deskTop + 0.08, zc - 1.2], [0.33, 0.06, 0.6], [V.norm([1, 0.35, 0]), V.norm([-0.35, 1, 0]), [0, 0, 1]], R());
  rc(-5.4, zc + 0.1, 0.6, 1.25, 0.65); rc(-6.25, zc - 2.6, 1.2, 0.9, 0.75, 0.2); rc(-6.3, zc + 1.6, 0.8, 0.7, 0.6, -0.15);
  rc(-4.75, zc + 3.6, 1.1, 0.95, 0.65, 0.1); rc(-6.0, zc + 3.9, 0.6, 1.1, 0.6); rc(-4.75, zc - 4.6, 1.0, 0.85, 0.6, -0.08);
  // the distro (power): a cabinet on wheels with the feeders out of it
  rc(-7.1, zc - 0.6, 0.55, 1.0, 0.55);
  // the hazers on their cases, fans facing downstage (+x)
  for (const h of L.hazers) { const y = at(h.pos[0], h.pos[2]); g.black.box([h.pos[0], y + 0.185, h.pos[2]], [0.62, 0.38, 0.42], 0, R()); g.grille.disc([h.pos[0] + 0.311, y + 0.21, h.pos[2]], [1, 0, 0], 0.13, 14, 0.5); g.tote.box([h.pos[0] - 0.42, y + 0.165, h.pos[2] + 0.1], [0.2, 0.34, 0.2], 0, R()); }
  // folding chairs, an A-frame ladder against the back truss's tower, a cooler
  for (const [x, z, a] of [[-6.6, zc - 1.1, 0.4], [-4.6, zc + 1.4, -0.9]]) { const y = at(x, z); g.black.box([x, y + 0.45, z], [0.42, 0.03, 0.42], a, R()); g.black.box([x - Math.cos(a) * 0.2, y + 0.675, z + Math.sin(a) * 0.2], [0.03, 0.42, 0.42], a, R());
    const ca = Math.cos(a), sa = Math.sin(a);
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { const rx = dx * ca + dz * sa, rz = -dx * sa + dz * ca; g.galv.tube([x + rx, y, z + rz], [x + rx, y + 0.45, z + rz], 0.01, 4, 0.5); } }
  { const x = -4.6, z = L.grid.z0 + 1.2, y = at(x, z); g.galv.tube([x, y, z - 0.35], [x + 0.15, y + 2.4, z], 0.02, 6, 0.5); g.galv.tube([x, y, z + 0.35], [x + 0.15, y + 2.4, z], 0.02, 6, 0.5); g.galv.tube([x + 0.6, y, z - 0.3], [x + 0.15, y + 2.4, z], 0.02, 6, 0.5); g.galv.tube([x + 0.6, y, z + 0.3], [x + 0.15, y + 2.4, z], 0.02, 6, 0.5); for (let k = 1; k < 7; k++) { const f = k / 7; g.galv.tube([x + 0.15 * f, y + 2.4 * f, z - 0.35 * (1 - f)], [x + 0.15 * f, y + 2.4 * f, z + 0.35 * (1 - f)], 0.012, 4, 0.5); } }
  { const x = -6.9, z = zc + 2.7, y = at(x, z); g.drum.box([x, y + 0.2, z], [0.4, 0.4, 0.62], 0.3, 0.3); g.head.box([x, y + 0.41, z], [0.42, 0.03, 0.64], 0.3, 0.5); }
  out.cases = cases.length;
}

// ---- cables (sagging only where they hang; on the floor they wander a little)
function cables(g, L, G, R, out) {
  const F = L.F, sb = [L.risers.drums.x0 - 0.35, F, L.risers.drums.z1 + 0.5];
  let n = 0;
  const floorRun = (a, b, r, wob = 0.08) => {
    const pts = [], k = Math.max(3, Math.ceil(V.len(V.sub(b, a)) / 0.35));
    for (let i = 0; i <= k; i++) { const f = i / k, p = lerp3(a, b, f), w = Math.sin(f * Math.PI) * wob * Math.sin(f * 9.0 + a[0] * 3.0); pts.push([p[0] + w * 0.6, p[1] + r, p[2] + w]); }
    for (let i = 0; i < pts.length - 1; i++) g.cable.tube(pts[i], pts[i + 1], r, 5, 0.5);
    n++;
  };
  for (const k of ['vocal', 'guitar', 'bass', 'keys']) { const m = L.marks[k]; floorRun([m.pos[0] + 0.3, F, m.pos[2] + 0.15], [sb[0] + 0.2, F, sb[2]], 0.009); }
  for (const f of L.fills) floorRun([f.x - 0.2, F, f.z], [f.x - 1.6, F, L.deck.zc + (f.z - L.deck.zc) * 0.4], 0.008, 0.05);
  // the multicore: from the stage box upstage across the deck's edge and down to the monitor desk
  const mc = [[sb[0], F + 0.02, sb[2]], [L.deck.x0 + 0.1, F + 0.02, sb[2] + 0.3], [L.deck.x0 - 0.15, F - 0.4, sb[2] + 0.4], [-4.6, G.footY(-4.6, sb[2] + 0.4) + 0.03, sb[2] + 0.2], [-5.0, G.footY(-5.0, L.deck.zc - 1.2) + 0.03, L.deck.zc - 1.0]];
  for (let i = 0; i < mc.length - 1; i++) g.cable.tube(mc[i], mc[i + 1], 0.022, 7, 0.5);
  // feeders: the distro to each tower base along the deck, five singles taped as one bundle
  for (const t of L.towers) {
    const a = [-7.1, 0, L.deck.zc - 0.6], b = [t.x - 0.4 * Math.sign(t.x), 0, t.z];
    const k = 12; let prev = null;
    for (let i = 0; i <= k; i++) { const f = i / k, x = a[0] + (b[0] - a[0]) * f, z = a[2] + (b[2] - a[2]) * f + Math.sin(f * 6.0 + t.z) * 0.12; const y = G.footY(x, z) + 0.03; const p = [x, y, z]; if (prev) g.cable.tube(prev, p, 0.028, 6, 0.5); prev = p; }
    n++;
  }
  out.cables = n;
}

// ---- the pyro barge: a 60 x 24 ft steel deck barge with raked ends, its mortar racks (timber frames of HDPE tubes),
// a rail of stanchions and chain, bollards, a 10 ft box for the crew, two anchor lines; its all-round anchor light
function barge(g, L, R, out) {
  const B = L.barge, cy = B.freeboard, hl = B.L / 2, hb = B.B / 2, rake = 2.4;
  const toW = (x, y, z) => [B.x + x, y, B.z + z];                   // (its heading is the ship's, plus a few degrees: below)
  const hd = B.heading * Math.PI / 180, ch = Math.cos(hd), sh = Math.sin(hd);
  const W = (x, y, z) => [B.x + x * ch + z * sh, y, B.z - x * sh + z * ch];
  // the hull: deck plane, sides, raked bow and stern (a prism along z with sloped end plates)
  const bot = -(B.D - B.freeboard);
  const sec = [[-hb, cy], [hb, cy], [hb, bot], [-hb, bot]];
  const G2 = g.barge;
  const quad = (a, b, c, d, n) => { const base = G2.count; for (const p of [a, b, c, d]) G2.vert(p, n, p[0], p[1], 0.5); G2.tri(base, base + 1, base + 2); G2.tri(base, base + 2, base + 3); };
  const zA = -hl, zB = hl, zA2 = -hl + rake, zB2 = hl - rake;
  // deck
  quad(W(-hb, cy, zA), W(-hb, cy, zB), W(hb, cy, zB), W(hb, cy, zA), [0, 1, 0]);
  // sides (vertical between the rakes' feet, full height at the deck edge)
  for (const s of [-1, 1]) {
    const n = [s * ch, 0, -s * sh];
    const a = W(s * hb, cy, zA), b = W(s * hb, cy, zB), c = W(s * hb, bot, zB2), d = W(s * hb, bot, zA2);
    if (s > 0) quad(a, b, c, d, n); else quad(b, a, d, c, n);
  }
  // the rakes and bottom
  quad(W(-hb, cy, zA), W(hb, cy, zA), W(hb, bot, zA2), W(-hb, bot, zA2), [0, -0.5, -1]);
  quad(W(hb, cy, zB), W(-hb, cy, zB), W(-hb, bot, zB2), W(hb, bot, zB2), [0, -0.5, 1]);
  quad(W(-hb, bot, zA2), W(hb, bot, zA2), W(hb, bot, zB2), W(-hb, bot, zB2), [0, -1, 0]);
  // a rubbing strake round the deck edge
  for (const s of [-1, 1]) g.black.bar(W(s * (hb + 0.05), cy - 0.12, zA + 0.2), W(s * (hb + 0.05), cy - 0.12, zB - 0.2), 0.12, 0.16, 0.4);
  // stanchions and a chain rail on three sides (the mortars' side toward the ship open for the racks' loading)
  for (let z = zA + 0.6; z <= zB - 0.5; z += 1.8) { g.galv.tube(W(-hb + 0.1, cy, z), W(-hb + 0.1, cy + 1.0, z), 0.02, 6, 0.5); }
  g.cable.tube(W(-hb + 0.1, cy + 0.95, zA + 0.6), W(-hb + 0.1, cy + 0.95, zB - 0.5), 0.008, 4, 0.5);
  for (const z of [zA + 1.0, zB - 1.0]) for (const s of [-1, 1]) g.black.cyl(W(s * (hb - 0.45), cy + 0.25, z), [0, 1, 0], 0.13, 0.25, 10, 0.5);
  // the crew's box (a 10 ft container) at the far end, its door, a light over it
  const cz = zB - 2.2;
  g.case.box(W(-0.8, cy + 1.3, cz), [2.44, 2.6, 2.99], -hd, R());
  // the mortar racks: L.mortars.port's places, each a timber frame of 2 x 5 tubes
  for (const m of L.mortars.port) {
    const x = m.pos[0], z = m.pos[2];
    g.timber.box([x, cy + 0.04, z], [1.3, 0.08, 0.7], -hd, R());
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) { const px = x - 0.5 + i * 0.25, pz = z - 0.15 + j * 0.3; g.tube.cyl([px, cy + 0.32, pz], [0, 1, 0], 0.055, 0.24, 10, 0.5); }
    g.timber.box([x, cy + 0.42, z], [1.3, 0.06, 0.42], -hd, R());      // the rack's top board, bored for the tubes
  }
  // anchor lines: from the barge's corners, down into the water at 3:1 scope (the bay is ~11 m deep here)
  for (const [x, z] of [[-hb, zA + 0.5], [-hb, zB - 0.5]]) { const a = W(x, cy + 0.3, z), b = W(x - 6.0, -0.02, z + Math.sign(z) * 4.0); g.cable.tube(a, b, 0.012, 5, 0.5); }
  out.barge = { L: B.L, B: B.B, deck: cy, at: [B.x, B.z], heading: B.heading, footprint: [W(-hb, 0, zA), W(hb, 0, zA), W(hb, 0, zB), W(-hb, 0, zB)].map(p => [+p[0].toFixed(2), +p[2].toFixed(2)]) };
}
