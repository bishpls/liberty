// liberty/src/life/habitat.js: the berth as the birds see it, read from what the other modules built.
//
//   what is solid    height rasters of everything drawn (the hull, the deck, the stage, the pier, the city), rendered top
//                    down through the G-buffer pass: a coarse one (1 m) over the near box for the flights' clearance, fine
//                    ones (4 cm) over the ship and the apron for the perches (after niwa's life_habitat.renderTop)
//   perches          the bulwark's cap (B1's formula: liberty/src/hull/decks.js, snapped and checked clear on the fine
//                    raster), the mastheads, crosstrees and lamp yards, the boom heads, the davits' heads, the funnel's
//                    rim (B2's and B1's anchors, each snapped to the drawn top under it); the pier's bollards and the
//                    promenade's lamps; the water. B4's roosting birds (pier/life.js: ridges, bollards, piles, sills, the
//                    wharf's railing, the breakwater) are taken over where they stand: life draws them, and they flush
//   roost groups     where each perch's birds circle when they're flushed (a centre, a radius, a height band), kept clear
//                    of the stage's column and the near rigging
//   hot zones        the stage's column (the beams' hottest region, the rig, the lasers' fans) while the show runs, and
//                    each effect's volume for its life (the guns' smoke, the mortars', the gerbs on the crosstrees, flames,
//                    CO2): birds keep out of them, and nobody perches in them during the show
//   the show         its loud events (the 5"/38, the 3"/50, the Oerlikons, the mortars: B5's levels at 1 m, at their
//                    sources) for the startle
//   the wind         P.WATER.wind (from 245 deg at 3.4 m/s), and the slope lift it makes over the shed's west wall
import { clamp, rng } from 'scene3d/util.js';
import { LAYER } from 'scene3d/mat.js';

const T = window.THREE;

// ---- a height raster: the scene's own geometry rendered top down through the G-buffer pass (view depth -> height)
export function renderTop(world, { x0, x1, z0, z1, res, include = null, exclude = null, ymax = 400, near = 1, far = null }) {
  const pipe = world.pipe, r = pipe.renderer;
  const w = Math.ceil((x1 - x0) / res), h = Math.ceil((z1 - z0) / res);
  const rt = new T.WebGLRenderTarget(w, h, { type: T.FloatType, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: true });
  const cam = new T.OrthographicCamera(-(x1 - x0) / 2, (x1 - x0) / 2, (z1 - z0) / 2, -(z1 - z0) / 2, near, far ?? ymax + 200);
  cam.position.set((x0 + x1) / 2, ymax, (z0 + z1) / 2); cam.up.set(0, 0, -1); cam.lookAt((x0 + x1) / 2, 0, (z0 + z1) / 2);
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  cam.layers.disableAll(); cam.layers.enable(LAYER.GBUF);
  const hidden = [];
  for (const m of pipe.meshes) {
    const mod = m.userData.module;
    const keep = include ? include.includes(mod) : !(exclude || []).includes(mod);
    if (!keep && m.visible) { m.visible = false; hidden.push(m); }
  }
  const sec = pipe.U.uSectionPlane.value.clone(); pipe.U.uSectionPlane.value.set(0, 0, 0, 1);
  // (screen-space widths: B2's wires are drawn at least 1.6 px wide by uResolution, which under this camera made them tens
  // of metres thick and the raster depend on the canvas's size: held huge here, everything is drawn at its true size)
  const uRes = pipe.U.uResolution.value.clone(); pipe.U.uResolution.value.set(1e7, 1e7);
  pipe._setPass('gbuf');
  r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(true, true, false);
  pipe.fsQuad.material = pipe.mClearG || (pipe._clearG(), pipe.mClearG);
  r.setRenderTarget(rt); r.render(pipe.fsScene, pipe.fsCam);
  r.render(pipe.scene, cam);
  pipe._setPass('color');
  pipe.U.uSectionPlane.value.copy(sec); pipe.U.uResolution.value.copy(uRes);
  for (const m of hidden) m.visible = true;
  const buf = new Float32Array(w * h * 4);
  r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  r.setRenderTarget(null);
  rt.dispose();
  const top = new Float32Array(w * h).fill(-1e9);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const z = buf[(j * w + i) * 4 + 2];
    if (z < 1e5 && z > 0) top[(h - 1 - j) * w + i] = ymax - z;
  }
  return { x0, z0, x1, z1, res, w, h, top };
}
// the raster's value at a point: the max over the cells a footprint of radius rad touches (-1e9 off the raster)
export function rasterAt(R, x, z, rad = 0) {
  if (!R) return -1e9;
  const i0 = Math.floor((x - rad - R.x0) / R.res), i1 = Math.floor((x + rad - R.x0) / R.res);
  const j0 = Math.floor((z - rad - R.z0) / R.res), j1 = Math.floor((z + rad - R.z0) / R.res);
  let m = -1e9;
  for (let j = Math.max(0, j0); j <= Math.min(R.h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(R.w - 1, i1); i++) { const v = R.top[j * R.w + i]; if (v > m) m = v; }
  return m;
}
const inR = (R, x, z) => R && x >= R.x0 && x < R.x1 && z >= R.z0 && z < R.z1;

// ---- B4's roosting birds, taken over: their instance matrices (feet at the origin, the head along +x), then hidden
function takeOver(world) {
  const out = [], M = new T.Matrix4(), P = new T.Vector3(), Q = new T.Quaternion(), S = new T.Vector3(), E = new T.Euler();
  const kinds = { 'life:gulls': 'gull', 'life:pigeons': 'pigeon', 'life:cormorants': 'cormorant' };
  const meshes = [];
  for (const m of world.pipe.meshes) {
    const sp = kinds[m.name];
    if (!sp || m.userData.module !== 'pier' || !m.isInstancedMesh) continue;
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, M); M.decompose(P, Q, S); E.setFromQuaternion(Q, 'YXZ');
      // (three's rotation about y by a turns +x to (cos a, 0, -sin a); the kit's yaw heads (cos, 0, sin): yaw = -a)
      out.push({ sp, p: [P.x, P.y, P.z], yaw: -E.y, scale: S.x, src: 'pier', from: m.name });
    }
    meshes.push(m);
  }
  for (const m of meshes) { m.visible = false; m.userData.takenBy = 'life'; m.userData.loose = 'drawn by life (hidden)'; }
  return { birds: out, meshes };
}

// the stage's column: the beams' hottest region, the rig and the lasers (B5's layout: the stage on No. 2, its towers and
// grid at 17 m, the sky beams fanning from the trusses and crosstrees)
export function stageColumn(P) {
  const S = P.STAGE, cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
  return { c: [cx, cz], r: 24, y0: 6, y1: 75 };
}

export function buildHabitat(world, ctx) {
  const t0 = performance.now(), ms = {};
  const lap = k => { ms[k] = Math.round(performance.now() - t0 - Object.values(ms).reduce((a, b) => a + b, 0)); };
  const P = ctx.P, M = ctx.mods, show = ctx.show;
  const H = { ms, P, show };
  const hull = M.hull && !M.hull.failed ? M.hull : null, deck = M.deck && !M.deck.failed ? M.deck : null, pier = M.pier && !M.pier.failed ? M.pier : null;
  const stage = M.stage && !M.stage.failed ? M.stage : null, water = M.water && !M.water.failed ? M.water : null;
  H.water = water;
  H.waterY = (x, z, t) => (water && water.heightAt ? water.heightAt(x, z, t) : 0);
  // B4's birds first (hidden before the rasters are drawn: they'd stand on the ridges in them)
  const taken = pier ? takeOver(world) : { birds: [], meshes: [] };
  H.taken = taken;
  lap('takeover');
  // ---- rasters
  const solid = ['hull', 'deck', 'pier', 'stage', 'ground'];
  const W = P.WORLD.walk;
  H.coarse = renderTop(world, { x0: W.x0 - 340, x1: W.x1 + 60, z0: W.z0 - 260, z1: W.z1 + 40, res: 1.0, include: solid });
  lap('coarse');
  H.shipR = hull ? renderTop(world, { x0: -11, x1: 11, z0: -70, z1: 70, res: 0.04, include: ['hull', 'deck', 'stage'] }) : null;
  H.apronR = pier ? renderTop(world, { x0: 9.5, x1: 20.5, z0: -146, z1: 136, res: 0.04, include: ['pier', 'hull', 'deck'] }) : null;
  lap('fine');
  // the top of everything at a point (fine where there is one), and the clearance of a body there
  H.top = (x, z, rad = 0) => {
    let v = rasterAt(H.coarse, x, z, rad);
    if (inR(H.shipR, x, z)) v = Math.max(v, rasterAt(H.shipR, x, z, rad));
    return Math.max(v, 0);
  };
  // the top dilated 10 m (a max filter, separable): the floor a bird in transit keeps above (it climbs before it gets
  // to a wall, not at it)
  {
    const R = H.coarse, w = R.w, h = R.h, rr = 10, a = new Float32Array(w * h), b = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let m = -1e9; for (let k = Math.max(0, i - rr); k <= Math.min(w - 1, i + rr); k++) m = Math.max(m, R.top[j * w + k]); a[j * w + i] = m; }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let m = -1e9; for (let k = Math.max(0, j - rr); k <= Math.min(h - 1, j + rr); k++) m = Math.max(m, a[k * w + i]); b[j * w + i] = m; }
    H.far = Object.assign({}, R, { top: b });
  }
  H.topFar = (x, z) => Math.max(rasterAt(H.far, x, z, 0), 0);
  // the most open way out from a point: of 24 headings, the one needing the gentlest climb to clear what's ahead over
  // the next 2-40 m (the steepest (top - y + 1) / distance along it), ties toward the wish
  H.openDir = (p, wish = null, avoidCol = null) => {
    let best = null, bv = 1e9;
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      let m = 0; for (let s = 2; s <= 40; s += 1.5) m = Math.max(m, (H.top(p[0] + dx * s, p[2] + dz * s, 0.6) - p[1] + 1.0) / s);
      // (while the show runs, a way out through the stage's column costs as if it were a steep climb)
      if (avoidCol) for (let s = 6; s <= 36; s += 6) if (Math.hypot(p[0] + dx * s - avoidCol.c[0], p[2] + dz * s - avoidCol.c[1]) < avoidCol.r + 2) { m += 0.6; break; }
      const v = m + (wish ? (1 - (dx * wish[0] + dz * wish[2])) * 0.08 : 0);
      if (v < bv) { bv = v; best = [dx, 0, dz]; }
    }
    return best;
  };
  // an approach to a perch (hips at P): a heading h (into the wind first) and two aim points, A2 (out and up) and A1
  // (a short glide's start), the whole of A2 -> A1 -> P clear of what's drawn; shorter and steeper approaches are tried
  // when the long ones cross something (a sill under the shed's eave is reached over the apron, not over the ship)
  H.approach = (P) => {
    const u = H.wind.up, a0 = Math.atan2(u[2], u[0]);
    const seg = (A, B, skipEnd) => { const n = Math.max(2, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]))); for (let i = 1; i < n; i++) { const s = i / n; if (skipEnd && s > 0.82) break; const x = A[0] + (B[0] - A[0]) * s, y = A[1] + (B[1] - A[1]) * s, z = A[2] + (B[2] - A[2]) * s; if (y - H.top(x, z, 0.4) < 0.4) return false; } return true; };
    for (const [d1, d2, up1, up2] of [[14, 30, 2.2, 6], [9, 20, 2.0, 6], [6, 14, 2.0, 5], [3.5, 10, 4.0, 9]]) {
      for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.0, -2.0, 2.6, -2.6, Math.PI]) {
        const h = [Math.cos(a0 + da), 0, Math.sin(a0 + da)];
        const A1 = [P[0] - h[0] * d1, P[1] + up1, P[2] - h[2] * d1];
        const A2 = [P[0] - h[0] * d2, Math.max(P[1] + up2, H.top(P[0] - h[0] * d2, P[2] - h[2] * d2, 2) + 3), P[2] - h[2] * d2];
        if (A1[1] - H.top(A1[0], A1[2], 0.6) < 0.6) continue;
        if (seg(A1, P, true) && seg(A2, A1, false)) return { h, A1, A2, d1 };
      }
    }
    const h = [Math.cos(a0), 0, Math.sin(a0)];
    return { h, A1: [P[0] - h[0] * 3, P[1] + 5, P[2] - h[2] * 3], A2: [P[0] - h[0] * 8, P[1] + 12, P[2] - h[2] * 8], d1: 3, fallback: true };
  };
  H.fineTop = (x, z, rad = 0) => (inR(H.shipR, x, z) ? rasterAt(H.shipR, x, z, rad) : inR(H.apronR, x, z) ? rasterAt(H.apronR, x, z, rad) : rasterAt(H.coarse, x, z, rad));
  // ---- the wind: from 245 deg true at 3.4 m/s; toward = the direction it blows
  const wt = P.atBearing((P.WATER.wind.from + 180) % 360, 1);
  H.wind = { toward: [wt[0], 0, wt[1]], speed: P.WATER.wind.speed, up: [-wt[0], 0, -wt[1]] };
  // ---- perches
  const perches = H.perches = [];
  const add = (o) => { o.id = perches.length; perches.push(o); return o; };
  const R0 = rng(35035);
  const upwindYaw = Math.atan2(H.wind.up[2], H.wind.up[0]);
  // the bulwark's cap: B1's wall from rail(z) - 0.04 to rail(z) + 0.01, 0.16 wide, centred hbRail(z, rail(z)) + 0.015 out
  const capOk = [];
  if (hull && hull.form) {
    const F = hull.form, S = P.SHIP;
    let zA = -66.5; for (let k = 0; k < 8; k++) zA = F.zFwd(F.rail(zA));
    for (const sx of [-1, 1]) {
      for (let z = zA + 0.6; z <= F.bulwarkAftZ - 0.6; z += 0.8) {
        const xs = sx * (F.hbRail(z, F.rail(z)) + 0.015), w = S.toWorld(xs, F.rail(z) + 0.01, z);
        // the cap is clear when nothing drawn stands over it within a body's footprint, and the top there is the cap's
        const fine = rasterAt(H.shipR, w[0], w[2], 0.12), dy = fine - w[1];
        const clear = Math.abs(dy) < 0.03;
        capOk.push(clear);
        if (!clear) continue;
        // centred across the cap as drawn (B1's wall is extruded inboard of its line): the cells within 1.5 cm of its top
        { let sum = 0, n = 0; for (let dx = -0.24; dx <= 0.24; dx += 0.02) { const v = rasterAt(H.shipR, w[0] + dx, w[2], 0); if (Math.abs(v - fine) < 0.015) { sum += dx; n++; } } if (n) w[0] += sum / n; w[1] = fine; }
        // facing: along the rail, mostly into the wind's along-ship component, some outboard (looking at the water)
        const along = -Math.sign(H.wind.toward[2] || -1);
        add({ kind: 'rail', owner: 'ship', side: sx > 0 ? 'starboard' : 'port', p: [w[0], w[1], w[2]], zs: z, yaw: Math.atan2(along, 0.0001) + sx * 0.35, cap: 1, along: [0, 0, 1] });
      }
    }
  }
  lap('rails');
  // a drawn top near a point: the highest cell within r of it (masts, booms, davits, the funnel's rim), snapped
  const peak = (p, r = 0.45) => {
    if (!inR(H.shipR, p[0], p[2])) return null;
    const R = H.shipR; let best = -1e9, bx = 0, bz = 0;
    for (let z = p[2] - r; z <= p[2] + r; z += R.res) for (let x = p[0] - r; x <= p[0] + r; x += R.res) { const v = rasterAt(R, x, z); if (v > best) { best = v; bx = x; bz = z; } }
    return best > -1e8 ? [bx, best, bz] : null;
  };
  // a footing: the top within a bird's stance is level to 3 cm over +-0.07 m along the yaw
  const level = (p, yaw, half = 0.07) => {
    const dx = Math.cos(yaw) * half, dz = Math.sin(yaw) * half;
    const a = H.fineTop(p[0] + dx, p[2] + dz, 0.01), b = H.fineTop(p[0] - dx, p[2] - dz, 0.01), c = H.fineTop(p[0], p[2], 0.01);
    return Math.abs(a - c) < 0.03 && Math.abs(b - c) < 0.03;
  };
  if (deck && deck.masts) {
    for (const m of deck.masts) {
      for (const k of ['truck', 'cap', 'crosstree', 'lampYard']) {
        const q = m[k]; if (!q) continue;
        const pp = Array.isArray(q) ? q : q.world || q.p; if (!pp) continue;
        const ps = peak(pp, k === 'crosstree' || k === 'lampYard' ? 1.2 : 0.35);
        if (!ps || ps[1] < pp[1] - 1.0) continue;
        for (const yaw of [upwindYaw, upwindYaw + 0.6, upwindYaw - 0.6]) if (level(ps, yaw)) { add({ kind: 'mast', owner: 'ship', name: `${m.name} ${k}`, p: ps, yaw, cap: 1 }); break; }
        // the crosstree's and lamp yard's arms: a perch toward each end
        if (k === 'crosstree' || k === 'lampYard') for (const dx of [-1.4, 1.4]) {
          const pa = peak([pp[0] + dx, pp[1], pp[2]], 0.35);
          if (pa && Math.abs(pa[1] - ps[1]) < 0.6 && level(pa, upwindYaw)) add({ kind: 'mast', owner: 'ship', name: `${m.name} ${k} ${dx > 0 ? 'stbd' : 'port'}`, p: pa, yaw: upwindYaw + (R0() - 0.5) * 0.6, cap: 1 });
        }
      }
      for (const [j, b] of (m.booms || []).entries()) {
        const head = b.head || b[0]; if (!head) continue;
        const ps = peak(head, 0.4);
        if (ps && ps[1] > head[1] - 0.6) {
          const yaw = Math.atan2(head[2] - (b.heel || b[1])[2], head[0] - (b.heel || b[1])[0]);
          if (level(ps, yaw, 0.05)) add({ kind: 'boom', owner: 'ship', name: `${m.name} boom ${j}`, p: ps, yaw, cap: 1 });
        }
      }
    }
  }
  if (hull && hull.anchors) {
    for (const d of hull.anchors.davits || []) for (const s of d.seats || []) {
      // the davit's head: the highest drawn point within 1.6 m outboard of its seat
      const w = s.world, out = w[0] > 0 ? 1 : -1;
      const ps = peak([w[0] + out * 0.6, w[1], w[2]], 1.0);
      // (facing out along the arm, so the feet straddle its crest rather than its length)
      const yawD = out > 0 ? 0 : Math.PI;
      if (ps && ps[1] > w[1] + 1.0 && level(ps, yawD, 0.05)) add({ kind: 'davit', owner: 'ship', p: ps, yaw: yawD + (R0() - 0.5) * 0.3, cap: 1 });
    }
    const f = hull.anchors.funnel;
    if (f && f.centre) {
      const c = f.centre.world, S = P.SHIP, fa = S.house.funnel.fa / 2, ath = S.house.funnel.ath / 2;
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * Math.PI * 2, q = [c[0] + Math.sin(a) * ath, c[1], c[2] + Math.cos(a) * fa];
        const ps = peak(q, 0.18);
        if (ps && Math.abs(ps[1] - c[1]) < 0.9) add({ kind: 'funnel', owner: 'ship', p: ps, yaw: a + Math.PI / 2, cap: 1 });
      }
    }
  }
  lap('ship perches');
  // the pier: bollards (B4's export: their tops) and the promenade's lamps (their heads' tops, on the apron's raster)
  if (pier) {
    for (const b of pier.bollards || []) {
      const top = H.fineTop(b[0], b[2], 0.06);
      if (top > -1e8 && Math.abs(top - b[1]) < 0.8) add({ kind: 'bollard', owner: 'pier', p: [b[0], top, b[2]], yaw: upwindYaw + (R0() - 0.5), cap: 1 });
    }
    for (const l of (pier.lights || []).filter(l => l.kind === 'promenade lamp' || l.kind === 'wharf lamp')) {
      const p = l.pos; if (!p) continue;
      const top = rasterAt(inR(H.apronR, p[0], p[2]) ? H.apronR : H.coarse, p[0], p[2], 0.12);
      if (top > p[1] - 0.2 && top < p[1] + 1.2) add({ kind: 'lamp', owner: 'pier', p: [p[0], top, p[2]], yaw: upwindYaw + (R0() - 0.5), cap: 1 });
    }
  }
  // the shed's three ridges between B4's gulls: free spots on the ridge cap (its height from B4's gulls standing on it)
  if (pier) {
    for (const xr of P.PIER.shed.ridges) {
      const on = taken.birds.filter(b => b.sp === 'gull' && Math.abs(b.p[0] - xr) < 0.3 && b.p[1] > 10);
      if (on.length < 3) continue;
      const ys = on.map(b => b.p[1]).sort((a, b) => a - b), y = ys[ys.length >> 1];
      const zEnd = 125.7 + 0.684 * xr - 6;
      for (let z = P.PIER.z0 + 10; z < zEnd; z += 1.1) {
        if (on.some(b => Math.abs(b.p[2] - z) < 0.8)) continue;
        const top = rasterAt(H.coarse, xr, z, 0.5);
        if (Math.abs(top - y) > 0.6) continue;
        add({ kind: 'ridge', owner: 'pier', p: [xr, y, z], yaw: upwindYaw + (R0() - 0.5) * 0.7, cap: 1 });
      }
    }
  }
  // B4's birds' own perches (they're the residents there): one perch each, where it stands
  for (const b of taken.birds) b.perch = add({ kind: b.from === 'life:pigeons' ? 'sill' : b.sp === 'cormorant' ? 'pile' : 'pier', owner: 'pier', p: b.p.slice(), yaw: b.yaw, cap: 1, taken: true }).id;
  lap('pier perches');
  // ---- roost groups: where each perch's birds circle when flushed
  const col = H.column = stageColumn(P);
  const groups = H.groups = [];
  const groupOf = (p) => {
    // by where it is: the ship fore / amidships / aft, the shed's three thirds, the wharf, the breakwater, the city side
    const [x, , z] = p;
    if (Math.abs(x) < 11 && Math.abs(z) < 70) return z < -45 ? 'ship_bow' : z < 20 ? 'ship_mid' : 'ship_stern';
    if (x >= 11 && x < 75 && z < 140) return z < -60 ? 'shed_n' : z < 40 ? 'shed_mid' : 'shed_s';
    if (x < -50 && z < 0) return 'breakwater';
    if (z >= 60) return 'wharf';
    return 'other';
  };
  const gc = {}, gn = {};
  for (const pp of perches) { const g = groupOf(pp.p); pp.group = g; gc[g] = gc[g] || [0, 0, 0]; gc[g][0] += pp.p[0]; gc[g][1] += pp.p[1]; gc[g][2] += pp.p[2]; gn[g] = (gn[g] || 0) + 1; }
  for (const g of Object.keys(gc)) {
    let c = [gc[g][0] / gn[g], gc[g][2] / gn[g]], top = gc[g][1] / gn[g];
    // circle centres clear of the stage's column: pushed out along the line from it
    const dx = c[0] - col.c[0], dz = c[1] - col.c[1], d = Math.hypot(dx, dz);
    const R = g.startsWith('ship') ? 32 : g === 'breakwater' ? 45 : 38;
    // (a ring may pass the column's edge: birds at night are drawn to the light, and keep only out of its hottest part;
    // the ship's flocks circle high in the lit haze over her, the others over their own roofs)
    const need = col.r + R + 6;
    if (d < need) { const k = need / Math.max(d, 1); c = [col.c[0] + dx * k, col.c[1] + dz * k]; if (d < 1) c = [col.c[0] - need, col.c[1]]; }
    const ship = g.startsWith('ship');
    groups.push({ id: g, c, R, h: ship ? [34, 58] : [Math.max(26, top + 14), Math.max(48, top + 34)], n: gn[g] });
  }
  H.group = id => groups.find(g => g.id === id);
  lap('groups');
  // ---- hot zones during the show: the column (show.start to its end) and each effect's volume for its life
  const zones = H.zones = [];
  const start = show && show.start !== undefined ? show.start : 0, end = show ? show.duration : 0;
  zones.push({ kind: 'column', c: col.c, r: col.r, y0: col.y0, y1: col.y1, t0: start - 30, t1: end + 15 });
  const L = stage ? stage.layout : null;
  const ev = k => (show ? show.events(k) : []);
  const guns = deck && deck.guns ? deck.guns : null;
  const muzzle = (g, t) => { if (!g || !g.muzzle) return null; const m = g.muzzle(t); return m && m.p ? m.p : Array.isArray(m) ? m : null; };
  for (const e of ev('gun5')) { const p = muzzle(guns && guns.gun5, e.t); if (p) zones.push({ kind: 'gun5 smoke', c: [p[0], p[2]], y: p[1], r: 14, t0: e.t - 0.5, t1: e.t + 15 }); }
  for (const e of ev('gun3')) { const p = muzzle(guns && guns.gun3, e.t); if (p) zones.push({ kind: 'gun3 smoke', c: [p[0], p[2]], y: p[1], r: 10, t0: e.t - 0.5, t1: e.t + 12 }); }
  if (L && L.mortars) for (const e of ev('mortar')) for (const m of L.mortars[e.at || 'stbd'] || []) zones.push({ kind: 'mortar', c: [m.pos[0], m.pos[2]], y: m.pos[1] + 2, r: 7, t0: e.t - 0.2, t1: e.t + 8 });
  if (L && L.gerbs) for (const e of ev('gerb')) for (const g of [].concat(L.gerbs[e.line || 'rail'] || [])) { const p = g.pos || g; if (Array.isArray(p)) zones.push({ kind: 'gerb', c: [p[0], p[2]], y: p[1] + 3, r: e.line === 'mast' ? 8 : 5, t0: e.t - 1, t1: e.t + (e.dur || 8) + 2 }); }
  if (L && L.flames) for (const e of ev('flame')) for (const f of L.flames) zones.push({ kind: 'flame', c: [f.pos[0], f.pos[2]], y: f.pos[1] + 2.5, r: 4.5, t0: e.t - 0.3, t1: e.t + (e.dur || 0.6) + 1.5 });
  H.zoneAt = (p, t, pad = 0) => {
    for (const z of zones) {
      if (t < z.t0 || t > z.t1) continue;
      const d = Math.hypot(p[0] - z.c[0], p[2] - z.c[1]);
      if (z.kind === 'column') { if (d < z.r + pad && p[1] > z.y0 - pad && p[1] < z.y1 + pad) return z; }
      else if (Math.hypot(d, p[1] - z.y) < z.r + pad) return z;
    }
    return null;
  };
  // perches inside the column are 'hot' for returning while the show runs (a bird roosting there before the show, B8's
  // gulls on the main yards, flushes at the first blast and won't come back until it's over)
  for (const pp of perches) pp.hot = Math.hypot(pp.p[0] - col.c[0], pp.p[2] - col.c[1]) < col.r + 4 && pp.p[1] > 5;
  // ---- the show's loud events: where, when, how loud at 1 m (B5's levels; the Oerlikons' rounds each)
  const loud = H.loud = [];
  const lv = k => (show && show.levels ? show.levels[k] : null);
  if (show) {
    for (const e of ev('gun5')) { const p = muzzle(guns && guns.gun5, e.t); if (p) loud.push({ t: e.t, kind: 'gun5', pos: p, L1: lv('gun5') || 184.5 }); }
    for (const e of ev('gun3')) { const p = muzzle(guns && guns.gun3, e.t); if (p) loud.push({ t: e.t, kind: 'gun3', pos: p, L1: lv('gun3') || 178.5 }); }
    for (const e of ev('gun20')) for (const gi of e.guns || [0]) { const g = guns && guns.gun20 ? guns.gun20[gi] : null; const p = muzzle(g, e.t); if (p) loud.push({ t: e.t, kind: 'gun20', pos: p, L1: lv('gun20') || 168.5, rounds: e.rounds || 5 }); }
    if (L && L.mortars) for (const e of ev('mortar')) { const ms = L.mortars[e.at || 'stbd'] || []; if (ms.length) { const c = ms.reduce((a, m) => [a[0] + m.pos[0] / ms.length, a[1] + m.pos[1] / ms.length, a[2] + m.pos[2] / ms.length], [0, 0, 0]); loud.push({ t: e.t, kind: 'mortar', pos: c, L1: (lv('mortar') || 174) + 10 * Math.log10(Math.min(ms.length, e.n || ms.length)) }); } }
    loud.sort((a, b) => a.t - b.t);
  }
  // the slope lift over the shed's west wall (soaring): the wind's component normal to the wall, strongest a little upwind
  // of the eave and a wall's height above it (estimated from flow over a bluff step: it separates at the eave)
  const sh = P.PIER.shed, wallN = [-Math.cos(-P.NORTH_ROT * Math.PI / 180), 0, 0];
  const Un = Math.max(0, -(H.wind.toward[0] * wallN[0] + H.wind.toward[2] * wallN[2])) * H.wind.speed;
  const wallLift = (d, hAbove, Hw) => Un * 0.85 * Math.exp(-Math.pow((d - 0.25 * Hw) / (0.9 * Hw), 2)) * Math.exp(-Math.max(0, hAbove) / (1.4 * Hw));
  H.lift = (x, y, z) => {
    let w = 0;
    // the shed's west wall (13 m to its eave); the ship shelters it over her length
    const d = sh.x0 - x, hAbove = y - sh.eave;
    if (d > -2 && hAbove > -1 && z > P.PIER.z0 && z < 130) w = Math.max(w, wallLift(d, hAbove, sh.eave) * (Math.abs(z) < 70 ? 0.25 : 1));
    // her own windward (port) side: the hull and bulwark ~9 m over the water, the midship house to ~19 m
    const hs = Math.abs(z) < 66 ? (z > -12 && z < 18 ? 19 : 9.5) : 0, ds = -P.SHIP.halfBeam - x;
    if (hs > 0 && ds > -1 && y > hs - 1) w = Math.max(w, wallLift(ds, y - hs, hs) * 0.9);
    return w;
  };
  H.Un = Un;
  // the baseline's flights keep out of the stage's column at every hour (the rig stands there, lit at standby)
  H.baseZones = [Object.assign({}, zones[0], { t0: -1e9, t1: 1e9 })];
  H.yawUp = upwindYaw;
  // free fender pile heads on the pier's open east side, north of the shed's middle (cormorants commute from them)
  H.pierPiles = [];
  if (pier && pier.piles) {
    const takenAt = taken.birds.map(b => b.p);
    for (const [x, z, r] of pier.piles) {
      if (Math.abs(x - (P.PIER.x1 + 0.3)) > 1.0 || z > -40 || r > 0.4) continue;
      const top = rasterAt(H.coarse, x, z, 0.3);
      if (top < 2 || top > 4.5 || takenAt.some(q => Math.hypot(q[0] - x, q[2] - z) < 1.5)) continue;
      H.pierPiles.push([x, top, z]);
    }
    H.pierPiles.sort((a, b) => a[2] - b[2]);
    H.pierPiles = H.pierPiles.filter((p, i) => i % 5 === 2);
    // each chosen pile's head as drawn (a 1 m tile at 1 cm, from just above it): the highest cell, and the bird on it
    H.pierPiles = H.pierPiles.slice(0, 3).map(([x, y, z]) => {
      const R = renderTop(world, { x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5, res: 0.01, include: ['pier'], ymax: y + 1.0, near: 0.05, far: 3 });
      let best = -1e9, bx = x, bz = z; for (let j = 0; j < R.h; j++) for (let i = 0; i < R.w; i++) { const v = R.top[j * R.w + i]; if (v > best + 0.005) { best = v; bx = R.x0 + (i + 0.5) * R.res; bz = R.z0 + (j + 0.5) * R.res; } }
      // the centre of the head's top (the cells within 1 cm of the highest)
      let sx = 0, sz = 0, n = 0; for (let j = 0; j < R.h; j++) for (let i = 0; i < R.w; i++) if (R.top[j * R.w + i] > best - 0.01) { sx += R.x0 + (i + 0.5) * R.res; sz += R.z0 + (j + 0.5) * R.res; n++; }
      return n ? [sx / n, best, sz / n] : [bx, best, bz];
    });
  }
  // the bulkhead building's street cornice (its roof's edge over the Embarcadero): where the flock lands; a fine raster there
  if (pier) {
    const bk = renderTop(world, { x0: 8, x1: 80, z0: 135, z1: 200, res: 0.08, include: ['pier'] });
    const zf = x => P.PIER.bulkheadStreet(x);
    const dir = [1, 0.684], dl = Math.hypot(...dir), ux = dir[0] / dl, uz = dir[1] / dl;
    const ledges = [];
    for (let x = 12; x <= 70; x += 0.42 + 0.35 * R0()) {
      const z = zf(x) - 0.3, top = rasterAt(bk, x, z, 0.04), front = rasterAt(bk, x, zf(x) + 1.0, 0.1);
      if (top < 6 || front > top - 3) continue;
      const a = rasterAt(bk, x + ux * 0.12, z + uz * 0.12, 0.02), b = rasterAt(bk, x - ux * 0.12, z - uz * 0.12, 0.02);
      if (Math.abs(a - top) > 0.04 || Math.abs(b - top) > 0.04) continue;
      ledges.push({ p: [x, top, z], yaw: Math.atan2(ux, -uz) });          // facing the street (out over the face)
    }
    H.ledges = ledges;
    H.flockCentre = [42, zf(42) - 8];
  }
  lap('baseline inputs');
  H.measures = { ms, perches: Object.fromEntries([...new Set(perches.map(p => p.kind))].map(k => [k, perches.filter(p => p.kind === k).length])),
    railCapClear: capOk.length ? +(capOk.filter(Boolean).length / capOk.length).toFixed(3) : null, taken: taken.birds.length,
    groups: groups.map(g => ({ id: g.id, n: g.n, c: g.c.map(v => +v.toFixed(1)), R: g.R, h: g.h.map(v => +v.toFixed(1)) })), loud: loud.length, zones: zones.length,
    wallNormalWind: +Un.toFixed(2) };
  return H;
}
