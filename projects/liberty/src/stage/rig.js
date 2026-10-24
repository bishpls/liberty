// liberty/src/stage/rig.js: the moving lights as things that move (show.md L1-L2): each fixture a base, a yoke that
// pans about the base's axis and a head that tilts in the yoke, posed every frame from the cue's direction (signed
// tilt keeps the pan within +-90 deg of the fixture's front, so a head never whips round mid-cue); its lens glows in
// the beam's colour (style C10: lamps and beam cores bloom, screens don't). The spots themselves are the engine's
// (world.stage.spot): their lens sits on the head, on the beam's axis. Strobes and blinders: their faces flash and a
// point source lights everything round them for the flash. One state a fixture a frame (cached on t).
import { Geo } from './geo.js';
import { glowMat } from './mats.js';
import { makeCues } from './cues.js';

const T = window.THREE;
const TILT_MAX = 125;                       // deg from the base's axis (L2: 250 deg of tilt)

// a fixture's parts in its own frame: pivot at the origin, the base's axis +y (an upright fixture; a hung one is turned
// over), its front +z; the head's beam along +y at tilt 0, the tilt axis x
function parts(kind) {
  const wash = kind === 'wash', base = new Geo(), yoke = new Geo(), head = new Geo(), lens = new Geo();
  base.box([0, -0.285, 0], [0.42, 0.17, 0.32], 0, 0.3);
  base.box([0, -0.285, 0.165], [0.16, 0.06, 0.012], 0, 0.9);              // its little display
  base.cyl([0, -0.19, 0], [0, 1, 0], 0.07, 0.02, 10, 0.3);                 // the pan bearing
  yoke.box([0, -0.165, 0], [0.42, 0.035, 0.11], 0, 0.4);
  for (const s of [-1, 1]) yoke.box([s * 0.195, -0.06, 0], [0.035, 0.24, 0.11], 0, 0.4);
  if (wash) {
    head.cyl([0, 0.0, 0], [0, 1, 0], 0.17, 0.12, 16, 0.6);
    head.tube([0, 0.12, 0], [0, 0.15, 0], 0.175, 16, 0.6);
    lens.disc([0, 0.151, 0], [0, 1, 0], 0.174, 18, 0.5);
  } else {
    head.cyl([0, 0.02, 0], [0, 1, 0], 0.125, 0.16, 14, 0.6);
    head.tube([0, 0.18, 0], [0, 0.21, 0], [0.125, 0.105], 14, 0.6);
    lens.disc([0, 0.211, 0], [0, 1, 0], 0.104, 16, 0.5);
  }
  for (const s of [-1, 1]) head.cyl([s * 0.165, 0, 0], [1, 0, 0], 0.05, 0.02, 10, 0.6);   // the tilt hubs
  return { base, yoke, head, lens, lensOff: wash ? 0.16 : 0.22 };
}

export function buildRig(world, M, L, ctx) {
  const show = ctx.show, P = ctx.P, S = world.stage;
  const cues = makeCues(show, L, P);
  const fx = L.fixtures;
  // each fixture's mount: its frame (columns X, Y = the base's axis, Z = its front) as a matrix
  for (const f of fx) {
    const Y = f.mount === 'down' ? [0, -1, 0] : [0, 1, 0], Z = f.group === 'pier' ? [-1, 0, 0] : f.group === 'house' ? [0, 0, -1] : [1, 0, 0];
    const X = [Y[1] * Z[2] - Y[2] * Z[1], Y[2] * Z[0] - Y[0] * Z[2], Y[0] * Z[1] - Y[1] * Z[0]];
    f.R = new T.Matrix4().makeBasis(new T.Vector3(...X), new T.Vector3(...Y), new T.Vector3(...Z));
    f.Rt = f.R.clone().transpose();
    f.model = f.kind === 'wash' ? 'wash' : 'beam';
  }
  // the per-frame cache: every fixture's spot state and pose at t
  const cache = { t: NaN, st: [] }, v = new T.Vector3();
  const pose = (f, d) => {
    v.set(d[0], d[1], d[2]).applyMatrix4(f.Rt);
    let tilt = Math.acos(Math.max(-1, Math.min(1, v.y))), pan = Math.atan2(v.x, v.z);
    if (pan > Math.PI / 2) { pan -= Math.PI; tilt = -tilt; } else if (pan < -Math.PI / 2) { pan += Math.PI; tilt = -tilt; }
    const lim = TILT_MAX * Math.PI / 180, clamped = Math.abs(tilt) > lim;
    if (clamped) tilt = Math.sign(tilt) * lim;
    // near the base's axis the pan is ill-defined (the beam barely moves while the yoke would whip round): ease it home
    // inside 6 deg of tilt, as a console's programmer would (the head, and so the beam, stay one)
    const z6 = 6 * Math.PI / 180, at = Math.abs(tilt);
    if (at < z6) { const u = at / z6; pan *= u * u * (3 - 2 * u); }
    return { pan, tilt, clamped };
  };
  const dirOf = (f, p) => { v.set(Math.sin(p.tilt) * Math.sin(p.pan), Math.cos(p.tilt), Math.sin(p.tilt) * Math.cos(p.pan)).applyMatrix4(f.R); return [v.x, v.y, v.z]; };
  const at = t => {
    if (t === cache.t) return cache.st;
    cache.t = t;
    cache.st = fx.map(f => {
      const s = cues.state(f, t);
      if (!s) return null;
      const p = pose(f, s.dir), d = dirOf(f, p), lo = f.model === 'wash' ? 0.16 : 0.22;
      // the beam leaves the lens, which the head carries round the pivot
      return Object.assign(s, { dir: d, pos: [f.pos[0] + d[0] * lo, f.pos[1] + d[1] * lo, f.pos[2] + d[2] * lo], pan: p.pan, tilt: p.tilt, clamped: p.clamped });
    });
    return cache.st;
  };
  // ---- the spots
  for (const f of fx) S.spot({ name: `stage ${f.group} ${f.kind} ${f.i}`, state: t => { const s = at(t)[f.id]; return s && s.intensity > 1e-4 ? s : { intensity: 0, pos: f.pos, dir: [0, 1, 0] }; } });

  // ---- the haze's own glow over the stage (style C7: the stage's volume lifted to V ~.2 in the section's key family,
  // so the beams read as additions and the frame round the stage is never dead black): the light the rig throws about
  // the stage scattered in the haze, which the single-scattered shafts don't draw. A soft gaussian column rising from the
  // stage's floor and leaning a little downstage (stagelight.js's halo with no core: no edge anywhere; its half-width
  // 2.4 m at the floor, ~4.5 m at the grid, dimming as it widens and fading out by ~14 m), so it hugs the stage's front
  // and falls off with the distance from it; on the beat in the high-energy looks; no surface light (shafts only).
  // ?hazeglow= scales it. (The first cut's two wide cones, 52 deg to 34 m, laid a veil over the whole frame and lifted
  // the ship's darks: the director, 2026-10-23, 'interesting but overpowering'; board/stage/notes.md)
  const qg = new URLSearchParams(location.search), CUT1 = qg.get('hazeglow') === 'cut1', HG = CUT1 ? 0 : +(qg.get('hazeglow') ?? 1);
  const GX = +(qg.get('glowx') ?? 4.2), GA = +(qg.get('glowang') ?? 18), GR = +(qg.get('glowrange') ?? 14);
  S.spot({ name: 'haze glow', state: t => {
    const g = cues.hazeGlow(t);
    return { pos: [L.deck.x0 + GX, L.F + 0.1, L.deck.zc], dir: [0.22, 1, 0], color: g.col, intensity: 2.0 * HG * g.I, angle: GA, soft: 1.0,
      range: GR, srcR: 2.4, beam: 1, halo: 1, haloAngle: GA, core: 0, surface: false, stop: false, samples: 2 };
  } });
  // ?hazeglow=cut1: the first cut's glow for A/Bs (two cones from the stage at 52 deg to 34 m, 0.15 of 0.16, 4 samples;
  // the whole first-cut look adds &halo=0&hazenear=0&halosat=0&haloscreen=0&kind=wash.beam:0.35,hull.I:1.25)
  if (CUT1) for (const dz of [-2.6, 2.6]) S.spot({ name: 'haze glow cut1', state: t => {
    const g = cues.hazeGlow(t);
    return { pos: [L.deck.x0 + 5.0, L.F + 0.1, L.deck.zc + dz], dir: [0.18, 1, dz * 0.05], color: g.col, intensity: 0.024 * g.I, angle: 52, soft: 1.0, range: 34, srcR: 2.0, beam: 260, surface: false, stop: false, samples: 4 };
  } });
  // ---- the toners: three LED pars (RGBW, 28 deg; tower-mounted, as a show tones its set) clamped to the towers' inner
  // legs 3.5 m over the deck: the two downstage towers' cross upstage over the floor, the risers and the backline (the
  // drum kit lit from the front, not only a silhouette on the wall), the upstage right tower's back down the middle; the
  // deck, the risers and the towers' legs in the section's colours (the key, the accent, the key). Measured: the floor's
  // L* p50 12 -> 24-31 (the refs' lit stage floors 10-35 in the darker three, 48 mean of five); at 2.4 m and 30 deg the
  // keys player, 3 m from the downstage left par, took ~10 units (the drums 5): 3.5 m and 28 deg keep him at 5.6-7.5
  // (measure.js markLight; board/stage/notes.md). ?toner= ?tonerang= ?tonery= ?tonerlens= for A/Bs; ?toner=0 off
  const TI = +(qg.get('toner') ?? 3.6), TA = +(qg.get('tonerang') ?? 28), TW = L.towers, tz = (t, s) => t.z + s * (t.size / 2 - 0.025);
  const toners = TI > 0 ? [
    { leg: [TW[0].x - TW[0].size / 2 + 0.025, tz(TW[0], 1)], at: [1.6, L.F + 0.6, L.deck.zc + 1.7], fam: 0 },
    { leg: [TW[1].x - TW[1].size / 2 + 0.025, tz(TW[1], -1)], at: [1.6, L.F + 0.6, L.deck.zc - 1.7], fam: 1 },
    { leg: [TW[3].x + TW[3].size / 2 - 0.025, tz(TW[3], -1)], at: [6.4, L.F, L.deck.zc + 0.7], fam: 0 },
  ] : [];
  const tg = new Geo(), tb = new Geo();
  for (const tn of toners) {
    const y = L.F + +(qg.get('tonery') ?? 3.5), leg = [tn.leg[0], y, tn.leg[1]], d0 = [tn.at[0] - leg[0], tn.at[1] - y, tn.at[2] - leg[2]], l0 = Math.hypot(...d0);
    const d = d0.map(v => v / l0), h = Math.hypot(d[0], d[2]), side = [d[0] / h, 0, d[2] / h];
    tn.pos = [leg[0] + side[0] * 0.2, y, leg[2] + side[2] * 0.2]; tn.dir = d;
    // the clamp on the leg, the arm out to the yoke, the can (0.2 m, r 0.1) along the aim, the lens at its front
    tb.tube([leg[0], y - 0.04, leg[2]], [leg[0], y + 0.04, leg[2]], 0.04, 8, 0.3, true);
    tb.tube(leg, [tn.pos[0] - side[0] * 0.06, y, tn.pos[2] - side[2] * 0.06], 0.018, 6, 0.3, true);
    const back = [tn.pos[0] - d[0] * 0.1, y - d[1] * 0.1, tn.pos[2] - d[2] * 0.1], front = [tn.pos[0] + d[0] * 0.1, y + d[1] * 0.1, tn.pos[2] + d[2] * 0.1];
    tb.tube(back, front, 0.1, 12, 0.5, true);
    tn.lens = [front[0] + d[0] * 0.003, front[1] + d[1] * 0.003, front[2] + d[2] * 0.003];
    tg.disc(tn.lens, d, 0.085, 16, 0.5);
  }
  if (toners.length) {
    world.mesh(tb.geometry(), M.black, { name: 'toner bodies' });
    const tMat = glowMat(world, 'toner lenses', { uniforms: { uT0: { value: new T.Vector3() }, uT1: { value: new T.Vector3() }, uT2: { value: new T.Vector3() } },
      body: `vec3 g = vObjP.x < ${((toners[0].lens[0] + toners[2].lens[0]) / 2).toFixed(3)} ? uT2 : vObjP.z < ${((toners[0].lens[2] + toners[1].lens[2]) / 2).toFixed(3)} ? uT0 : uT1;
             s.albedo = vec3(0.02); s.emissive = g;` });
    world.mesh(tg.geometry(), tMat, { name: 'toner lenses' });
    const st = t => toners.map(tn => { const g = cues.toner(t, tn.fam); return { g, I: TI * g.I }; });
    world.onFrame(t => { const v = st(t); v.forEach((x, i) => { const k = +(qg.get('tonerlens') ?? 1.0) * Math.pow(Math.min(1, x.g.I), 0.7); tMat.uniforms['uT' + i].value.set(x.g.col[0] * k, x.g.col[1] * k, x.g.col[2] * k); }); });
    toners.forEach((tn, i) => S.spot({ name: 'stage toner ' + i, state: t => {
      const g = cues.toner(t, tn.fam);
      return { pos: tn.pos, dir: tn.dir, color: g.col, intensity: TI * g.I, angle: TA, soft: 1.0, range: 18, srcR: 0.09, beam: 0 };   // (no shaft: a wide cone's
      // apex sits a few cm behind its lens, and its haze there flared into a bright blob from every side)
    } }));
  }
  // ---- the work lights (the crew's): two LED floods, 4000 K, wide, hung on the front and mid trusses over the stage; on
  // before the show (house to half two bars before the first downbeat, out one bar before) and back up after it
  const wl = [[L.grid.xF - 0.16, L.deck.zc - 1.2], [L.grid.xM + 0.16, L.deck.zc + 1.2]];
  const wg = new Geo(), wf = new Geo();
  for (const [x, z] of wl) { wg.box([x, L.grid.y - 0.14, z], [0.14, 0.24, 0.36], 0, 0.4); wf.box([x + (x > L.grid.xM ? -0.072 : 0.072), L.grid.y - 0.16, z], [0.004, 0.18, 0.3], 0, 0.5); }
  world.mesh(wg.geometry(), M.black, { name: 'work light bodies' });
  const wMat = glowMat(world, 'work light faces', { uniforms: { uOn: { value: 0 } }, body: `s.albedo = vec3(0.1); s.emissive = vec3(1.0, 0.93, 0.82) * 6.0 * uOn;` });
  world.mesh(wf.geometry(), wMat, { name: 'work light faces' });
  for (const [x, z] of wl) S.spot({ name: 'work light', state: t => ({ pos: [x, L.grid.y - 0.2, z], dir: [x > L.grid.xM ? -0.35 : 0.35, -1, 0], color: [1, 0.93, 0.82], intensity: 0.5 * cues.house(t).work, angle: 58, soft: 0.9, range: 20, srcR: 0.15, beam: 0 }) });
  world.onFrame(t => { wMat.uniforms.uOn.value = cues.house(t).work; });
  // ---- the fixtures' meshes: instanced bases, yokes, heads (black) and lenses (glowing in the beam's colour)
  const models = { beam: parts('beam'), wash: parts('wash') };
  const lensMat = glowMat(world, 'stage lens', {
    vertex: /* glsl */`attribute float aSeed; attribute vec3 iGlow; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObjN = N; vObjP = P; vGlow = iGlow; }`,
    varyings: 'varying vec3 vGlow;',
    body: `float r = length(uv) / 0.085; s.emissive = vGlow * (0.55 + 0.45 * smoothstep(0.9, 0.2, r)); s.albedo = vec3(0.02);`,
  });
  const meshes = {}, groups = {};
  for (const mdl of ['beam', 'wash']) {
    const list = fx.filter(f => f.model === mdl);
    if (!list.length) continue;
    groups[mdl] = list;
    const mk = (geo, mat, name) => { const m = world.mesh(geo.geometry(), mat, { count: list.length, name, frustum: false }); m.instanceMatrix.setUsage(T.DynamicDrawUsage); return m; };
    meshes[mdl] = { base: mk(models[mdl].base, M.black, `fixture ${mdl} bases`), yoke: mk(models[mdl].yoke, M.black, `fixture ${mdl} yokes`), head: mk(models[mdl].head, M.blackGloss, `fixture ${mdl} heads`) };
    const lg = models[mdl].lens.geometry();
    const glow = new T.InstancedBufferAttribute(new Float32Array(list.length * 3), 3); glow.setUsage(T.DynamicDrawUsage); lg.setAttribute('iGlow', glow);
    meshes[mdl].lens = mk({ geometry: () => lg }, lensMat, `fixture ${mdl} lenses`); meshes[mdl].glow = glow;
  }
  // the clamps and brackets: static (a half-coupler on the truss for hung and on-top fixtures, a shelf on the towers)
  const mtM = new T.Matrix4(), mY = new T.Matrix4(), mX = new T.Matrix4(), mP = new T.Matrix4();
  const pose4 = (f, pan, tilt, part) => {
    mP.makeTranslation(f.pos[0], f.pos[1], f.pos[2]);
    mtM.copy(mP).multiply(f.R);
    if (part === 'base') return mtM;
    mY.makeRotationY(pan); mtM.multiply(mY);
    if (part === 'yoke') return mtM;
    mX.makeRotationX(tilt); return mtM.multiply(mX);
  };
  world.onFrame(t => {
    const st = at(t);
    for (const [mdl, list] of Object.entries(groups)) {
      const ms = meshes[mdl], g = ms.glow.array;
      list.forEach((f, k) => {
        const s = st[f.id], pan = s ? s.pan : 0, tilt = s ? s.tilt : 0;
        ms.base.setMatrixAt(k, pose4(f, pan, tilt, 'base'));
        ms.yoke.setMatrixAt(k, pose4(f, pan, tilt, 'yoke'));
        const hm = pose4(f, pan, tilt, 'head'); ms.head.setMatrixAt(k, hm); ms.lens.setMatrixAt(k, hm);
        // the lens: the beam's colour at a strength that blooms (a lamp, C10) but no brighter at the brightest cue
        const I = s ? Math.min(1, s.intensity / (cues.KINDS[cues.kindOf(f)].I || 1)) : 0, c = s ? s.color : [0, 0, 0], k2 = 3.2 * Math.pow(I, 0.7);
        g[k * 3] = c[0] * k2; g[k * 3 + 1] = c[1] * k2; g[k * 3 + 2] = c[2] * k2;
      });
      for (const m of [ms.base, ms.yoke, ms.head, ms.lens]) m.instanceMatrix.needsUpdate = true;
      ms.glow.needsUpdate = true;
    }
  });

  // ---- strobes (L4: Martin Atomic 3000-class, 228 white LEDs) and blinders (4-lite DWE): bodies, glowing faces, and a
  // point source each that lights its surroundings for the flash (style E10: a hit is tonal, one frame)
  const sb = new Geo(), sf = new Geo(), bb = new Geo(), bf = new Geo();
  for (const s of L.strobes) {
    const [x, y, z] = s.pos;
    sb.box([x, y, z], [0.24, 0.26, 0.62], 0, 0.4); sb.box([x, y + 0.2, z], [0.05, 0.16, 0.05], 0, 0.4);
    sf.box([x + 0.122, y, z], [0.004, 0.2, 0.56], 0, s.id);                  // its face, toward the pier and down
  }
  for (const b of L.blinders) {
    const [x, y, z] = b.pos;
    bb.box([x, y, z], [0.2, 0.62, 0.62], 0, 0.4); bb.box([x, y + 0.33, z], [0.06, 0.1, 0.06], 0, 0.4);    // its hanging bracket on the chord
    for (const [dy, dz] of [[-0.15, -0.15], [-0.15, 0.15], [0.15, -0.15], [0.15, 0.15]]) bf.disc([x + 0.102, y + dy, z + dz], [1, 0, 0], 0.11, 16, b.id);
  }
  world.mesh(sb.geometry(), M.black, { name: 'strobe bodies' }); world.mesh(bb.geometry(), M.black, { name: 'blinder bodies' });
  const sFace = glowMat(world, 'strobe faces', { uniforms: { uFlash: { value: new T.Vector4() }, uCol: { value: new T.Vector3(1, 0.97, 0.9) } },
    body: `float k = sd < 0.5 ? uFlash.x : sd < 1.5 ? uFlash.y : sd < 2.5 ? uFlash.z : uFlash.w; float cell = step(0.3, length(fract(uv * vec2(28.0, 28.0)) - 0.5));
           s.albedo = vec3(0.08); s.emissive = uCol * k * mix(14.0, 9.0, cell);` });
  const bFace = glowMat(world, 'blinder faces', { uniforms: { uFlash: { value: new T.Vector4() } },
    body: `float k = sd < 0.5 ? uFlash.x : uFlash.y; float r = length(uv) / 0.11; s.albedo = vec3(0.1, 0.08, 0.05); s.emissive = vec3(1.0, 0.62, 0.28) * k * (6.0 + 6.0 * smoothstep(0.7, 0.0, r)) + vec3(0.05, 0.03, 0.01) * smoothstep(0.9, 0.3, r) * k;` });
  world.mesh(sf.geometry(), sFace, { name: 'strobe faces' }); world.mesh(bf.geometry(), bFace, { name: 'blinder faces' });
  const STROBE_I = 0.08, BLINDER_I = 0.05;      // stylised: ~20x an Atomic 3000's 143 lx at 10 m (notes.md: a hit reads as a flash)
  for (const s of L.strobes) S.spot({ name: 'strobe ' + s.id, state: t => { const k = cues.strobe(s.id, t); return { pos: [s.pos[0] + 0.15, s.pos[1], s.pos[2]], dir: [0.5, -0.86, 0], color: [1, 0.97, 0.9], intensity: STROBE_I * k, angle: 75, range: 30, srcR: 0.3 }; } });
  for (const b of L.blinders) S.spot({ name: 'blinder ' + b.id, state: t => { const k = cues.blinder(b.id, t); return { pos: [b.pos[0] + 0.15, b.pos[1], b.pos[2]], dir: [1, -0.3, 0], color: [1, 0.66, 0.36], intensity: BLINDER_I * k, angle: 70, range: 40, srcR: 0.35 }; } });
  world.onFrame(t => {
    const f = sFace.uniforms.uFlash.value; f.set(cues.strobe(0, t), cues.strobe(1, t), cues.strobe(2, t), cues.strobe(3, t));
    bFace.uniforms.uFlash.value.set(cues.blinder(0, t), cues.blinder(1, t), 0, 0);
  });
  return { cues, at, fx, meshes };
}
