// liberty/src/stage/foh.js: the front of house (the integrator's call, 2026-10-23: the downstage three had no front
// light, the front truss hanging over the lip lights them from straight above). A scaffold follow-spot tower at the back
// of the apron, against the shed's wall between two hull-wash stands, tied to the wall under the eave: 2.5 x 2.5 m,
// 12 m to its platform (six 2 m lifts on base jacks and sole boards, a ladder in two flights with a landing, scrim round
// the platform's rails, crowd barriers round its foot). On it two follow spots (long-throw, on tripods at the front rail)
// and two front washes hung under the platform's front edge. From the platform to the vocal's mark: ~10 m at a rake of
// ~24 deg (a follow spot's classic 20-30). The spots' operators are cues.js follow(): the vocal's entrances, iris, releases.
// The film sets who they follow with mod.foh.follow.target = (i, who, t) => [x, y, z] (null: the mark).
import { Geo } from './geo.js';
import { glowMat } from './mats.js';

const T = window.THREE;
const DEG = Math.PI / 180;
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// the tower's place: its back 0.7 m off the shed's wall (clear of the eave's 0.4 m overhang), centred between the hull
// washes' stands at z -38 and -26, out of the crowd's front rows (the rail side of the apron)
export function fohLayout(P, L) {
  const wall = P.PIER.x0 + P.PIER.apronW, x1 = wall - 0.7, x0 = x1 - 2.5, zc = L.deck.zc - 4.3;
  return { wall, x0, x1, z0: zc - 1.25, z1: zc + 1.25, zc, y0: P.PIER.deck, deck: P.PIER.deck + 12.05 };
}

export function buildFOH(world, M, L, ctx, cues) {
  const P = ctx.P, S = world.stage, F = fohLayout(P, L), q = new URLSearchParams(location.search);
  const { x0, x1, z0, z1, zc, y0, deck: yp } = F;
  const g = { scaff: new Geo(), galv: new Geo(), timber: new Geo(), black: new Geo(), barrier: new Geo() };
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  // ---- the scaffold: standards on base jacks and sole boards, ledgers every 2 m, a diagonal a face a lift
  for (const [x, z] of corners) {
    g.timber.box([x, y0 + 0.02, z], [0.25, 0.04, 0.5], 0, 0.3);
    g.galv.box([x, y0 + 0.045, z], [0.15, 0.01, 0.15], 0, 0.4);
    g.galv.tube([x, y0 + 0.04, z], [x, y0 + 0.36, z], 0.019, 6, 0.4);
    g.scaff.tube([x, y0 + 0.3, z], [x, yp + 1.0, z], 0.024, 8, 0.5);
  }
  const lifts = [];
  for (let y = y0 + 0.35; y < yp - 0.5; y += 2.0) lifts.push(y);
  lifts.push(yp - 0.05);
  for (const y of lifts) for (let i = 0; i < 4; i++) { const a = corners[i], b = corners[(i + 1) % 4]; g.scaff.tube([a[0], y, a[1]], [b[0], y, b[1]], 0.024, 8, 0.5); }
  for (let k = 0; k < lifts.length - 1; k++) for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4], up = (k + i) % 2;
    g.scaff.tube([a[0], lifts[k + up], a[1]], [b[0], lifts[k + 1 - up], b[1]], 0.024, 8, 0.6);
  }
  // ---- the platform: transoms, boards, toe boards, guard and mid rails; black scrim on the rails (it hides the
  // operators' light and their legs); a landing half way for the ladder's two flights
  for (const x of [x0 + 0.6, x0 + 1.25, x0 + 1.9]) g.scaff.tube([x, yp - 0.05, z0], [x, yp - 0.05, z1], 0.024, 8, 0.5);
  g.timber.box([(x0 + x1) / 2, yp + 0.0, zc], [x1 - x0 + 0.05, 0.05, z1 - z0 + 0.05], 0, 0.6);
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    g.scaff.tube([a[0], yp + 1.0, a[1]], [b[0], yp + 1.0, b[1]], 0.024, 8, 0.5);
    g.scaff.tube([a[0], yp + 0.5, a[1]], [b[0], yp + 0.5, b[1]], 0.024, 8, 0.5);
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], along = Math.abs(b[0] - a[0]) > 0.1, Lg = along ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
    g.timber.box([m[0], yp + 0.1, m[1]], along ? [Lg, 0.15, 0.03] : [0.03, 0.15, Lg], 0, 0.4);
    // the scrim: hung on the guard rail's outside (2 cm out), from the rail to the toe board
    const o = i === 0 ? [0, -0.035] : i === 1 ? [0.035, 0] : i === 2 ? [0, 0.035] : [-0.035, 0];
    g.black.box([m[0] + o[0], yp + 0.58, m[1] + o[1]], along ? [Lg, 0.84, 0.01] : [0.01, 0.84, Lg], 0, 0.3);
  }
  const yl = lifts[3];                                                            // (the landing: the fourth lift, ~6.4 m up)
  g.timber.box([x1 - 0.6, yl + 0.05, zc], [1.15, 0.05, z1 - z0 - 0.05], 0, 0.6);
  g.scaff.tube([x1 - 1.2, yl, z0], [x1 - 1.2, yl, z1], 0.024, 8, 0.5);
  // the ladder: two flights inside the back face, staggered across it, rungs every 0.3 m
  for (const [ya, yb, zz] of [[y0, yl + 0.08, zc - 0.55], [yl + 0.08, yp + 0.03, zc + 0.55]]) {
    const xr = x1 - 0.3;
    for (const dz of [-0.22, 0.22]) g.galv.tube([xr, ya, zz + dz], [xr - 0.08, yb + 1.0, zz + dz], 0.022, 6, 0.4);
    for (let y = ya + 0.3; y < yb; y += 0.3) { const u = (y - ya) / (yb + 1.0 - ya); g.galv.tube([xr - 0.08 * u, y, zz - 0.22], [xr - 0.08 * u, y, zz + 0.22], 0.014, 5, 0.4); }
    // its foot on the deck or the landing, its head tied to the ledger above
    g.galv.tube([xr - 0.08, yb + 1.0, zz - 0.22], [x1, Math.min(yb + 1.0, yp + 1.0), zz - 0.22], 0.012, 4, 0.4);
  }
  // ---- the ties: two lifts tied back to the shed's wall (a 12 m tower on a 2.5 m base must be tied), wall plates
  for (const y of [lifts[2], lifts[4]]) for (const z of [z0 + 0.3, z1 - 0.3]) {
    g.scaff.tube([x1, y, z], [F.wall - 0.01, y, z], 0.024, 8, 0.5);
    g.galv.box([F.wall - 0.012, y, z], [0.02, 0.24, 0.24], 0, 0.4);
  }
  // ---- the crowd barriers round its foot (bike-rack panels, 2.2 m, galvanised; the wall side open for the crew)
  const bx0 = x0 - 1.0, bz0 = z0 - 1.0, bz1 = z1 + 1.0;
  const panel = (a, b) => {
    const yb = y0 + 0.12, yt = y0 + 1.1, d = [b[0] - a[0], 0, b[1] - a[1]], Lp = Math.hypot(d[0], d[2]), u = [d[0] / Lp, 0, d[2] / Lp];
    g.barrier.tube([a[0], yb, a[1]], [b[0], yb, b[1]], 0.02, 6, 0.4); g.barrier.tube([a[0], yt, a[1]], [b[0], yt, b[1]], 0.02, 6, 0.4);
    for (let s = 0; s <= Lp + 1e-6; s += Lp / 14) g.barrier.tube([a[0] + u[0] * s, yb, a[1] + u[2] * s], [a[0] + u[0] * s, yt, a[1] + u[2] * s], 0.008, 4, 0.4);
    for (const s of [0.05, Lp - 0.05]) {                                         // its two feet, splayed across
      const p = [a[0] + u[0] * s, a[1] + u[2] * s];
      g.barrier.tube([p[0] - u[2] * 0.3, y0 + 0.01, p[1] + u[0] * 0.3], [p[0], yb, p[1]], 0.015, 5, 0.4);
      g.barrier.tube([p[0] + u[2] * 0.3, y0 + 0.01, p[1] - u[0] * 0.3], [p[0], yb, p[1]], 0.015, 5, 0.4);
    }
  };
  const run = (a, b) => { const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.2)); for (let k = 0; k < n; k++) panel([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n]); };
  run([x1 + 0.3, bz0], [bx0, bz0]); run([bx0, bz0], [bx0, bz1]); run([bx0, bz1], [x1 + 0.3, bz1]);
  // ---- the follow spots: tripods at the front rail, 1.2 m apart; the body (1.1 m, a long-throw follow spot) pans and
  // tilts on its yoke round a pivot 1.35 m over the platform; the lens is 0.62 m ahead of the pivot
  const fs = [-0.6, 0.6].map(dz => ({ pivot: [x0 + 0.62, yp + 1.35, zc + dz] }));
  for (const f of fs) {
    const [x, y, z] = f.pivot;
    for (let k = 0; k < 3; k++) { const a = k * 2 * Math.PI / 3 + 0.4; g.black.tube([x + Math.cos(a) * 0.42, yp + 0.03, z + Math.sin(a) * 0.42], [x, y - 0.42, z], 0.018, 5, 0.3); }
    g.black.tube([x, y - 0.45, z], [x, y - 0.18, z], 0.035, 8, 0.3);
  }
  // the moving parts: yokes (pan) and bodies with their lenses (pan and tilt), instanced
  const yokeG = new Geo(), bodyG = new Geo(), lensG = new Geo();
  yokeG.tube([0, -0.18, 0], [0, -0.1, 0], 0.05, 8, 0.3);
  for (const s of [-1, 1]) { yokeG.box([s * 0.2, 0.0, 0], [0.025, 0.22, 0.06], 0, 0.3); yokeG.box([s * 0.1, -0.1, 0], [0.22, 0.025, 0.06], 0, 0.3); }
  bodyG.tube([0, 0, -0.42], [0, 0, 0.42], 0.16, 14, 0.4, true);                  // the lamp house and the optical tube
  bodyG.tube([0, 0, 0.42], [0, 0, 0.6], 0.13, 14, 0.4, true);                    // the front lens barrel
  bodyG.tube([0, 0.17, -0.3], [0, 0.17, 0.3], 0.012, 5, 0.3);                    // the sight on top
  for (const s of [-1, 1]) bodyG.tube([s * 0.06, -0.05, -0.42], [s * 0.1, -0.12, -0.62], 0.012, 5, 0.3);   // the rear handles
  for (const s of [-1, 1]) bodyG.tube([s * 0.165, 0, 0], [s * 0.19, 0, 0], 0.03, 8, 0.3);                // the trunnions
  lensG.disc([0, 0, 0.604], [0, 0, 1], 0.115, 18, 0.5);
  const inst = (geo, mat, name, attrs) => {
    const gg = geo.geometry(); for (const [k, a] of Object.entries(attrs || {})) gg.setAttribute(k, a);
    const m = world.mesh(gg, mat, { count: fs.length, name, frustum: false }); m.instanceMatrix.setUsage(T.DynamicDrawUsage); return m;
  };
  const glow = new T.InstancedBufferAttribute(new Float32Array(fs.length * 3), 3); glow.setUsage(T.DynamicDrawUsage);
  const lensMat = glowMat(world, 'foh lens', {
    vertex: /* glsl */`attribute float aSeed; attribute vec3 iGlow; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObjN = N; vObjP = P; vGlow = iGlow; }`,
    varyings: 'varying vec3 vGlow;',
    body: `float r = length(vObjP.xy) / 0.115; s.emissive = vGlow * (0.55 + 0.45 * smoothstep(0.9, 0.2, r)); s.albedo = vec3(0.02);`,
  });
  const yokes = inst(yokeG, M.black, 'foh follow-spot yokes'), bodies = inst(bodyG, M.blackGloss, 'foh follow-spot bodies'), lenses = inst(lensG, lensMat, 'foh follow-spot lenses', { iGlow: glow });

  // ---- the front washes: hung on a pipe under the platform's front edge, each over a half of the downstage line
  const fwPipe = [x0 - 0.12, yp - 0.35];
  g.scaff.tube([fwPipe[0], fwPipe[1], z0], [fwPipe[0], fwPipe[1], z1], 0.024, 8, 0.5);
  for (const z of [z0 + 0.4, z1 - 0.4]) g.scaff.tube([x0, yp - 0.05, z], [fwPipe[0], fwPipe[1], z], 0.02, 6, 0.5);
  // (each aimed 0.15 of the way from its side's mark toward the vocal's and 1.2 m downstage of it at 0.9 m, so the keys,
  // upstage of the guitar on the tower's line, take its edge, not its middle; the vocal takes both edges and the follow
  // spot makes her the brightest; the bass's side is the farther and the more oblique from the tower: its wash 1.6x.
  // markLight's balance, front light at 1.5 m (verse / drop): vocal 9.0 / 10.4, guitar 5.9 / 8.8 (the second spot), bass
  // 5.5 / 7.5, keys 6.6 / 8.6, drums 4.9 / 6.7)
  const mk = L.marks, FWA = +(q.get('fwaim') ?? 0.15), FWANG = +(q.get('fwang') ?? 18), FWBASS = +(q.get('fwbass') ?? 1.8), FWDX = +(q.get('fwdx') ?? 1.2), FWH = +(q.get('fwh') ?? 0.9), FWR = +(q.get('fwrange') ?? 20);
  const fw = [['guitar', 1], ['bass', FWBASS]].map(([side, gain], i) => {
    const a = mk[side].pos, b = mk.vocal.pos, at = [a[0] + (b[0] - a[0]) * FWA + FWDX, a[1] + FWH, a[2] + (b[2] - a[2]) * FWA];
    const hang = [fwPipe[0], fwPipe[1] - 0.12, zc + (i ? 0.45 : -0.45)], d = nrm([at[0] - hang[0], at[1] - hang[1], at[2] - hang[2]]);
    g.black.tube([hang[0], fwPipe[1], hang[2]], [hang[0], hang[1] + 0.06, hang[2]], 0.02, 6, 0.3);       // the clamp's stem
    const back = [hang[0] - d[0] * 0.14, hang[1] - d[1] * 0.14, hang[2] - d[2] * 0.14], front = [hang[0] + d[0] * 0.14, hang[1] + d[1] * 0.14, hang[2] + d[2] * 0.14];
    g.black.tube(back, front, 0.17, 14, 0.4, true);
    return { pos: [front[0] + d[0] * 0.005, front[1] + d[1] * 0.005, front[2] + d[2] * 0.005], dir: d, at, gain };
  });
  // their framing shutters (an LD shutters a wash off the set: the integrator, 2026-10-23, the downstage right tower's leg
  // washed pale and flat at 1:16): a blade along each downstage tower's silhouette as the lens sees it (the vertical
  // through whichever of its legs, 10 cm out, leaves all four on the dark side) and one along the stage's lip (3 cm under
  // the floor: the floor is lit to its edge; the skirt, the rail and the hull under it are not). The blades fan out past
  // the towers, so the throw ends by 20 m (the spot's range window: 0.85 at the guitar's 10.5 m, 0.72 at the bass's 12.5,
  // 0.04 at 19 m): past the stage's right edge the house took the wash over the floor's heads at ~19 m. The washes up
  // 5.5 -> 6.2 and the bass side's 1.6 -> 1.8 for the window: the marks' light as before
  const TWR = L.towers, keep = [L.deck.x1 - 2, L.F + 1, L.deck.zc], SHUT = q.get('shutters') !== '0';
  const blade = (lens, t) => {
    const h = t.size / 2 + 0.1, legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [t.x + sx * h, t.z + sz * h]);
    for (const [x, z] of legs) {
      const c = S.shutter(lens, [x, L.F - 0.5, z], [x, L.grid.y, z], keep);
      if (legs.every(([x2, z2]) => c[0] * x2 + c[2] * z2 + c[1] * L.F - c[3] <= 1e-6)) return c;
    }
    return null;
  };
  for (const w of fw) {
    if (!SHUT) break;
    w.clip = [blade(w.pos, TWR[0]), blade(w.pos, TWR[1]),
      S.shutter(w.pos, [L.deck.x1, L.F - 0.03, L.deck.z0 - 4], [L.deck.x1, L.F - 0.03, L.deck.z1 + 4], keep)].filter(Boolean);
  }
  const fwLens = new Geo();
  for (const w of fw) fwLens.disc(w.pos, w.dir, 0.15, 18, 0.5);
  const fwMat = glowMat(world, 'foh wash lenses', { uniforms: { uC: { value: new T.Vector3() } }, body: `s.albedo = vec3(0.02); s.emissive = uC;` });
  world.mesh(fwLens.geometry(), fwMat, { name: 'foh wash lenses' });
  const mats = { scaff: M.scaffold, galv: M.galv, timber: M.timber, black: M.black, barrier: M.galv };
  for (const [k, gg] of Object.entries(g)) if (gg.tris) world.mesh(gg.geometry(), mats[k], { name: 'foh ' + k });

  // ---- the follow spots' light: where each aims (the film's target, else the mark at a height for the iris: the head
  // for head and shoulders, the middle for full body), a hand-held tremor of a few cm, the iris's angle from its throw
  const follow = { target: null };
  // (the shafts: a follow spot's cone carries ~12x a Sharpy's light at full body, so its share is ~1/4 of the kind's and
  // its shaft reads about as bright as a Sharpy's, wider; no halo and 6 samples (a soft cone with no gobo), and the washes
  // draw none: from a camera beside the tower their cones fill the frame, and at 1080p from stage_front the halo and the
  // washes' shafts cost ~5 ms for a fill no one saw)
  const FSI = +(q.get('follow') ?? 11.0), FWI = +(q.get('frontwash') ?? 6.2), FSB = +(q.get('followbeam') ?? 0.12), FS2G = +(q.get('follow2') ?? 0.45), FS_COL = [1.0, 0.95, 0.88];
  const aimAt = (i, st, t) => {
    const ov = follow.target && follow.target(i, st.who, t);
    if (ov) return ov;
    const m = mk[st.who].pos, h = Math.min(1.45, Math.max(0.95, 1.75 - 0.33 * st.d));
    return [m[0] + 0.02 * Math.sin(t * 1.3 + i * 2), m[1] + h + 0.025 * Math.sin(t * 0.9 + i), m[2] + 0.035 * Math.sin(t * 0.7 + i * 3)];
  };
  const fsAt = (i, t) => {
    const st = cues.follow(t, i), f = fs[i];
    if (!st) return { st: null, dir: nrm([-1, -0.35, 0]), lens: f.pivot };
    const tg = aimAt(i, st, t), dv = [tg[0] - f.pivot[0], tg[1] - f.pivot[1], tg[2] - f.pivot[2]], r = Math.hypot(...dv), dir = dv.map(v => v / r);
    return { st, dir, r, lens: [f.pivot[0] + dir[0] * 0.62, f.pivot[1] + dir[1] * 0.62, f.pivot[2] + dir[2] * 0.62] };
  };
  fs.forEach((f, i) => S.spot({ name: 'stage foh follow ' + i, state: t => {
    const a = fsAt(i, t); if (!a.st || a.st.on <= 1e-4) return { intensity: 0, pos: a.lens, dir: a.dir };
    const ang = Math.atan(a.st.d / 2 / Math.max(a.r - 0.62, 1)) / DEG;
    return { pos: a.lens, dir: a.dir, color: FS_COL, intensity: FSI * (i ? FS2G : 1) * a.st.on, angle: ang, soft: 0.3, range: 30, srcR: 0.11,
      beam: FSB * cues.BEAM_SHARE, samples: 6 };
  } }));
  fw.forEach((w, i) => S.spot({ name: 'stage foh wash ' + i, state: t => {
    const c = cues.frontWash(t);
    return { pos: w.pos, dir: w.dir, color: c.col, intensity: FWI * w.gain * c.I, angle: FWANG, soft: 0.8, range: FWR, srcR: 0.15, beam: 0, clip: w.clip };
  } }));
  // the moving parts and the lenses each frame
  const mP = new T.Matrix4(), mR = new T.Matrix4(), mY = new T.Matrix4();
  world.onFrame(t => {
    const ga = glow.array;
    fs.forEach((f, i) => {
      const a = fsAt(i, t), d = a.dir, pan = Math.atan2(d[0], d[2]);
      mP.makeTranslation(...f.pivot); mY.makeRotationY(pan); yokes.setMatrixAt(i, mP.clone().multiply(mY));
      const Z = new T.Vector3(...d), X = new T.Vector3(0, 1, 0).cross(Z).normalize(), Y = Z.clone().cross(X);
      mR.makeBasis(X, Y, Z); const bm = mP.clone().multiply(mR); bodies.setMatrixAt(i, bm); lenses.setMatrixAt(i, bm);
      const on = a.st ? a.st.on * (i ? FS2G : 1) : 0, k = 2.2 * Math.pow(on, 0.7);
      ga[i * 3] = FS_COL[0] * k; ga[i * 3 + 1] = FS_COL[1] * k; ga[i * 3 + 2] = FS_COL[2] * k;
    });
    for (const m of [yokes, bodies, lenses]) m.instanceMatrix.needsUpdate = true;
    glow.needsUpdate = true;
    const c = cues.frontWash(t), k = 1.6 * Math.pow(Math.min(1, c.I), 0.7); fwMat.uniforms.uC.value.set(c.col[0] * k, c.col[1] * k, c.col[2] * k);
  });
  return { layout: F, follow, followSpots: fs, washes: fw };
}
