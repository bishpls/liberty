// engine/scene3d/kit/creature/bird.js: an articulated bird, built from feathers on a skeleton and posed on the GPU.
//
// The anatomy (any species from a preset, birds_presets.js):
//   body     a loft from the tail base to the breast; the neck a tube on a Bezier from the body to the head (a heron's S
//            or a sparrow's stub); the head a loft with its bill (upper and lower mandibles: the gape opens) and eyes
//   wings    a skeleton per side, shoulder - elbow - wrist - hand tip, and its feathers: primaries on the hand (fingered
//            where the species' are emarginated), secondaries on the forearm, tertials on the humerus, greater and
//            median coverts and primary coverts layered over them, the alula, a patagium skin from the shoulder to the
//            wrist. Folding swings the bones back along the flank and the feathers round with them (secondaries toward
//            the elbow, primaries toward the tip), stacked by their layer, so a perched bird's folded wing is the same
//            feathers as a flying bird's spread one
//   tail     a fan of feathers (round, square, forked, streamers), spread and pitched
//   legs     tibia and tarsus by two-bone IK from the hip to a foot the caller places in the world (a perch, the ground,
//            tucked or trailing in flight), toes splayed or curled
// Everything is one geometry of feather-space coordinates; the vertex shader builds the skeleton from the instance's
// pose (a row of a float texture: BIRD_ROW below) and places each vertex. Three levels of detail share the shader.
//
// The pose, per instance (texels of row i; all angles in radians; the frame: x forward, y up, z right, origin at the hips):
//   0 position xyz (world), scale          1 orientation quaternion xyzw (body -> world)
//   2 right wing: elevation, sweep, fold (0 spread .. 1 folded), pronation
//   3 left wing: the same (mirrored: positive elevation raises either tip)
//   4 hand elevation right, left, feather bend (the downstroke's load), tail spread (0..1)
//   5 tail pitch, tail twist, head yaw, head pitch
//   6 neck extension (0 drawn in .. 1 out), gape, head roll, crouch
//   7 right foot (world xyz), toe curl      8 left foot (world xyz), toe curl
//   9 sheen phase, variant seed, fade (0..1), neck angle (radians above the body's forward axis)
import { clamp, lerp, lin } from '../../util.js';

const T = window.THREE;
export const BIRD_TEX_W = 10;

// ---- geometry ----------------------------------------------------------------------------------------------------
// the torso's profile along its length (s 0 the tail base .. 1 the breast): fuller toward the front, where the neck
// leaves it (the shader's BODY_PROF is the same function: a folded wing is laid on this surface)
export const bodyProf = s => Math.pow(Math.max(Math.sin(Math.PI * (0.05 + 0.9 * s)), 0), 0.5) * (1 - 0.18 * (1 - s) * (1 - s));
// parts (aPart): 0 body, 1 neck, 2 head, 3 upper bill, 4 lower bill, 5 eye, 6 tail feather, 7 wing feather, 8 patagium,
// 9 leg (tibia, tarsus), 10 toe, 11 web, 12 the wing's leading edge (opt-in)
// LOD: 0 near (every feather), 1 mid (feathers grouped into a few blades), 2 far (a body and two panels a wing)
export function birdGeometry(B, lod = 0) {
  const pos = [], nrm = [], uv = [], aP = [], aA = [], aB = [], aC = [], idx = [];
  const push = (p, n, u, part, A, Bv, C) => { pos.push(...p); nrm.push(...n); uv.push(...u); aP.push(part); aA.push(...A); aB.push(...Bv); aC.push(...C); return pos.length / 3 - 1; };
  let flip = false;
  const grid = (nu, nv, f, closedV = false) => {
    // f(i, j) pushes a vertex; quads between
    const base = pos.length / 3, cols = nv + 1;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) f(i, j);
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = base + i * cols + j, b = a + cols, c = b + 1, d = a + 1;
      if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    }
  };
  const Z = [0, 0, 0, 0];
  // body: rings along x from the tail base (s 0) to the breast (s 1); ellipse half-axes (rz, ry up, ry down), centre y
  const bl = B.body[0], bw = B.body[1] / 2, bh = B.body[2] / 2, x0 = -bl * 0.55;
  const ringsB = [10, 6, 4][lod], sidesB = [14, 8, 5][lod];
  grid(ringsB, sidesB, (i, j) => {
    const s = i / ringsB, a = j / sidesB * Math.PI * 2;
    const prof = bodyProf(s);
    const rz = bw * prof * (1 - 0.25 * (1 - s) * (1 - s)), ryU = bh * prof * (0.86 + 0.1 * s), ryD = bh * prof * (1.06 + 0.12 * Math.sin(Math.PI * s));
    const c = Math.cos(a), sn = Math.sin(a);
    const yc = bh * 0.06 * (s - 0.5);
    const y = yc + (sn > 0 ? ryU : ryD) * sn, z = rz * c, x = x0 + bl * s;
    const n = [0, sn / (sn > 0 ? ryU : ryD), c / Math.max(rz, 1e-4)], nl = Math.hypot(...n);
    push([x, y, z], n.map(v => v / nl), [s, j / sidesB], 0, Z, Z, Z);
  });
  // neck: rings along the Bezier (s 0 at the body, 1 at the head): the shader places them
  const ringsN = [Math.max(6, Math.round(B.neck[0] / 0.022)), Math.max(3, Math.round(B.neck[0] / 0.06)), 1][lod], sidesN = [12, 6, 4][lod];
  grid(ringsN, sidesN, (i, j) => { const s = i / ringsN, a = j / sidesN * Math.PI * 2; push([0, 0, 0], [0, Math.sin(a), Math.cos(a)], [s, j / sidesN], 1, [s, a, 0, 0], Z, Z); });
  // head: a loft in the head's frame (centre at the origin, bill to +x)
  const hr = B.head, ringsH = [9, 5, 3][lod], sidesH = [12, 7, 5][lod];
  grid(ringsH, sidesH, (i, j) => {
    const s = i / ringsH, a = j / sidesH * Math.PI * 2;
    const x = -hr * 1.05 + 2.0 * hr * s, prof = Math.sqrt(Math.max(0, 1 - Math.pow((s - 0.48) / 0.52, 2)));
    const r = hr * Math.max(prof, 0.04) * (s > 0.8 ? 1 - (s - 0.8) * 1.2 : 1);
    const c = Math.cos(a), sn = Math.sin(a);
    const y = r * sn * (sn > 0 ? 1.0 : 0.92) + hr * 0.04, z = r * c * 0.9;
    push([x, y, z], [x / hr * 0.6, sn, c], [s, j / sidesH], 2, Z, Z, Z);
  });
  // bill: upper and lower mandibles, a tapered half-cone each, in the head's frame from the bill base
  const bL = B.bill[0], bD = B.bill[1], bW = B.bill[2] || bD * 0.8, hook = B.bill[3] || 0;
  const ringsBl = [6, 3, 1][lod], sidesBl = [6, 4, 2][lod];
  for (const [part, up] of [[3, 1], [4, -1]]) {
    grid(ringsBl, sidesBl, (i, j) => {
      const s = i / ringsBl, a = (j / sidesBl) * Math.PI;           // a half round: 0 .. pi across the top (or the bottom)
      const taper = Math.pow(Math.max(0, 1 - Math.pow(s, 1.5)), 0.8), ry = bD * 0.5 * taper * (up > 0 ? 1.0 : 0.72 * (1 + (B.pouch || 0) * 1.6 * Math.sin(Math.PI * Math.min(1, s * 1.08)))), rz = bW * 0.5 * taper;
      const x = bL * s, droop = hook * bL * s * s * s * (up > 0 ? 1 : 0.5) + (up > 0 ? 0 : 0.0);
      const arch = up > 0 ? bD * 0.22 * Math.sin(Math.PI * Math.min(1, s * 0.8)) : 0;
      const y = up * Math.sin(a) * ry - droop + arch * Math.sin(a) + (up > 0 ? 0 : -0.002 * bD / 0.01), z = Math.cos(a) * rz;
      push([x, y, z], [0, up * Math.sin(a), Math.cos(a)], [s, j / sidesBl], part, Z, Z, Z);
    });
  }
  // eyes: small spheres at +-z on the head
  if (lod < 2) {
    const er = B.eye, segs = lod === 0 ? 8 : 4;
    for (const sd of [1, -1]) grid(segs, segs, (i, j) => {
      const th = i / segs * Math.PI, ph = j / segs * Math.PI * 2;
      const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      push(n.map(v => v * er), n, [i / segs, j / segs], 5, [sd, 0, 0, 0], Z, Z);
    });
  }
  // tail feathers
  const nT = [B.tailN, Math.min(5, B.tailN), 1][lod];
  for (let k = 0; k < nT; k++) {
    const ix = nT === 1 ? 0 : k / (nT - 1) * 2 - 1;
    const wFeather = lod === 2 ? B.tailW * B.tailN * 0.42 : lod === 1 ? B.tailW * B.tailN / nT * 0.75 : B.tailW;
    const nr = [5, 3, 2][lod], nc = 2;
    grid(nr, nc, (i, j) => { const r = i / nr, c = j / nc * 2 - 1; push([0, 0, 0], [0, 1, 0], [r, c], 6, [ix, k / Math.max(1, nT - 1), 0, 0], [r, c, wFeather, 0], Z); });
  }
  // wing feathers: [group, s along the bone, feather index (0..1 in its row), row, length, width, alpha spread, alpha folded, layer]
  // groups: 0 humerus, 1 forearm, 2 hand. rows: 0 flight feathers (remiges), 1 greater coverts, 2 median coverts,
  // 3 primary coverts, 4 alula, 5 marginal (lesser) coverts
  const W = { feathers: wingLayout(B, lod) };
  for (const sd of [1, -1]) {
    flip = sd < 0;                                         // (the left wing is the right mirrored: keep its faces' winding)
    for (const f of W.feathers) {
      const nr = f.nr, nc = f.nc;
      grid(nr, nc, (i, j) => {
        const r = i / nr, c = j / nc * 2 - 1;
        push([0, 0, 0], [0, 1, 0], [r, c], 7, [sd, f.group, f.s, f.row], [r, c, f.len, f.w], [f.aS, f.aF, f.layer, f.emarg + 10 * f.idx]);
      });
    }
    // the patagium: from the leading edge (v 0) to the bones (v 1), shoulder (u 0) to wrist (u 1)
    const nu = [6, 3, 2][lod], nv = [2, 1, 1][lod];
    // (its quads were wound facing down, so a double-sided material shades the top as a back face; B.patagiumUp winds
    // them up: opt-in, so the worlds already using the kit draw as before)
    if (B.patagiumUp) flip = sd > 0;
    grid(nu, nv, (i, j) => { push([0, 0, 0], [0, 1, 0], [i / nu, j / nv], 8, [sd, i / nu, j / nv, 0], Z, Z); });
    // (opt-in, B.wing.edge [r shoulder, r wrist, r hand tip] m: the wing's leading edge as a tube, the arm's muscle and
    // the patagium's rolled edge, so a wing seen edge-on is a tapering bar joined to the body, not a hairline; shoulder
    // (u 0) to wrist (u 1) to the hand's tip (u 2))
    if (B.wing && B.wing.edge) {
      const ne = [10, 5, 2][lod], na = [6, 4, 3][lod];
      flip = sd < 0;
      grid(ne, na, (i, j) => { push([0, 0, 0], [0, 1, 0], [i / ne, j / na], 12, [sd, 2 * i / ne, j / na * Math.PI * 2, 0], Z, Z); });
    }
  }
  flip = false;
  // legs: tibia (segment 0) and tarsus (1) as tubes, toes (2: front three and the hallux)
  if (lod < 2) {
    const sidesL = lod === 0 ? 5 : 3;
    for (const sd of [1, -1]) {
      for (const seg of [0, 1]) grid(3, sidesL, (i, j) => { const a = j / sidesL * Math.PI * 2; push([0, 0, 0], [0, Math.sin(a), Math.cos(a)], [i / 3, j / sidesL], 9, [sd, seg, i / 3, a], Z, Z); });
      for (let toe = 0; toe < 4; toe++) grid(3, 2, (i, j) => { const a = j / 2 * Math.PI * 2; push([0, 0, 0], [0, Math.sin(a), Math.cos(a)], [i / 3, j / 2], 10, [sd, toe, i / 3, a], Z, Z); });
      // (webbed feet: the skin between toes 0-1 and 1-2, from the foot to near the tips; the shader lays it on the toes)
      if (B.webbed) for (const pair of [0, 1]) for (const face of [1, -1]) { flip = face < 0; grid(3, 1, (i, j) => { push([0, 0, 0], [0, face, 0], [i / 3, j], 11, [sd, pair, i / 3 * 0.92, j], Z, Z); }); }
      flip = false;
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aPart', new T.Float32BufferAttribute(aP, 1));
  g.setAttribute('aA', new T.Float32BufferAttribute(aA, 4));
  g.setAttribute('aB', new T.Float32BufferAttribute(aB, 4));
  g.setAttribute('aC', new T.Float32BufferAttribute(aC, 4));
  g.setIndex(idx);
  const r = Math.max(B.span, B.L) * 0.75;
  g.boundingSphere = new T.Sphere(new T.Vector3(), r);
  g.boundingBox = new T.Box3(new T.Vector3(-r, -r, -r), new T.Vector3(r, r, r));
  g.userData.tris = idx.length / 3;
  g.userData.feathers = W.feathers.length * 2;
  return g;
}

// the wing's feathers, from the preset: lengths along each row, their spread and folded angles, their layers
export function boneLengths(B) {
  const D = Math.PI / 180, w = B.wing, b = B.span / 2 - B.shoulder[2], Lw = B.wingLen;
  const arm = Math.max(0.05 * b, b - Lw * 0.93);
  const hum = arm / (Math.cos(w.betaH * D) + w.fh * Math.cos(w.betaF * D));
  return { hum, fore: hum * w.fh, hand: Lw * 0.26, arm, b };
}
export function wingLayout(B, lod = 0) {
  const w = B.wing, out = [], bones = boneLengths(B);
  const np = w.primaries, ns = w.secondaries, nt = w.tertials || 3;
  const Lw = B.wingLen;                                    // wrist to the longest primary's tip (the folded wing's length)
  const chord = w.chord * Lw;                              // the secondaries' length
  const DEG = Math.PI / 180;
  if (lod === 2) {
    // two panels: the arm (forearm, secondaries' area) and the hand
    out.push({ group: 1, s: 0.5, row: 0, idx: 0, len: chord * 0.95, w: 0.5, aS: 0, aF: 90 * DEG, layer: 0, emarg: 0, nr: 1, nc: 1, panel: 1 });
    out.push({ group: 2, s: 0.25, row: 0, idx: 0, len: Lw * 0.82, w: chord * 0.62, aS: -38 * DEG, aF: -90 * DEG, layer: 0, emarg: 0, nr: 1, nc: 1 });
    return out;
  }
  const P = [];
  // (opt-in, a preset's wing fields; without them every wing is laid out as before:
  //   fanKnee [u, deg]   the primaries' spread: lerp(6, deg) over the inner ones (u < the knee), so they lie closed, and
  //                      lerp(deg, fanOut) over the outer, the fingers (else lerp(6, fanOut) by u^0.9: every one fanned)
  //   pwTaper            the primaries' width lost toward the outer (default 0.25)
  //   stackNorm          each row's layers spread over a fixed height (a fraction of the wing's length) instead of a
  //                      step a feather: a row of many (a pelican's 28 secondaries) otherwise stacks centimetres high, its
  //                      inner feathers over their own coverts
  //   tertialS, tertialA the tertials' places on the humerus [nearest the elbow, nearest the shoulder] (default [0.85,
  //                      0.45]) and their spread angles there (deg, default [14, 30]): the whole humerus covered, and the
  //                      elbow closed where they meet the inner secondaries)
  // (stackNorm: a row's layers rise k / n of h wing lengths at its k-th feather)
  const SN = !!w.stackNorm, sn = (k, n, h) => k * h * Lw / Math.max(1, n);
  // primaries: P1 (inner) .. Pn (outer). The longest at w.pmax (0..1 along the row); the tip's shape follows
  for (let i = 0; i < np; i++) {
    const u = np === 1 ? 1 : i / (np - 1);
    const d = (u - w.pmax), shape = d < 0 ? 1 - Math.pow(-d / w.pmax, 1.6) * (1 - w.pin) : 1 - Math.pow(d / Math.max(1 - w.pmax, 0.05), 1.5) * (1 - w.pout);
    const len = Lw * 0.86 * shape;
    // spread angle: inner primaries point back like the secondaries, outer ones fan toward the tip
    const fk = w.fanKnee;
    const aS = (fk ? (u < fk[0] ? lerp(6, fk[1], u / fk[0]) : lerp(fk[1], w.fanOut, (u - fk[0]) / Math.max(1 - fk[0], 1e-3))) : lerp(6, w.fanOut, Math.pow(u, 0.9))) * DEG;
    const emarg = (np - 1 - i) < w.fingers ? w.slot * (1 - (np - 1 - i) / Math.max(1, w.fingers) * 0.35) : 0;
    P.push({ group: 2, s: lerp(0.02, 0.92, u), row: 0, idx: u, len, w: Lw * w.pw * (1 - (w.pwTaper ?? 0.25) * u), aS, aF: -86 * DEG + u * 3 * DEG, layer: SN ? -sn(i + 1, np, 0.012) : -0.0016 * (i + 1) * (Lw / 0.3), emarg });
  }
  const S = [];
  for (let i = 0; i < ns; i++) {
    const u = ns === 1 ? 0 : i / (ns - 1);                  // S1 at the wrist (u 0) .. Sn at the elbow
    // each secondary ~1.7x as wide as its spacing on the forearm: they overlap like shingles
    S.push({ group: 1, s: lerp(0.98, 0.04, u), row: 0, idx: u, len: chord * (1 - 0.08 * u) * (1 + 0.04 * Math.sin(u * 3)), w: Math.max(bones.fore * 0.94 / Math.max(1, ns - 1) * 1.7, chord * 0.12), aS: lerp(-4, 8, u) * DEG, aF: (88 - 6 * u) * DEG, layer: SN ? sn(i + 1, ns, 0.012) : 0.0013 * (i + 1) * (Lw / 0.3), emarg: 0 });
  }
  const Tt = [], tS = w.tertialS || [0.85, 0.45], tA = w.tertialA || [14, 30];
  for (let i = 0; i < nt; i++) {
    const u = nt === 1 ? 0 : i / (nt - 1);
    Tt.push({ group: 0, s: lerp(tS[0], tS[1], u), row: 0, idx: u, len: chord * lerp(0.92, 0.6, u), w: chord * 0.32, aS: lerp(tA[0], tA[1], u) * DEG, aF: -95 * DEG, layer: SN ? 0.012 * Lw + sn(i + 2, nt + 1, 0.006) : 0.0013 * (ns + i + 2) * (Lw / 0.3), emarg: 0 });
  }
  if (lod === 1) {
    // grouped blades: three primaries' worth, two secondaries', one tertial
    const grp = (list, n, extra) => {
      const o = [];
      for (let k = 0; k < n; k++) {
        const a = Math.floor(k * list.length / n), b = Math.max(a + 1, Math.floor((k + 1) * list.length / n));
        const sub = list.slice(a, b), m = sub[Math.floor(sub.length / 2)];
        o.push(Object.assign({}, m, { w: m.w * sub.length * 0.62, len: Math.max(...sub.map(x => x.len)), nr: 2, nc: 1, emarg: 0 }, extra));
      }
      return o;
    };
    out.push(...grp(P, 3), ...grp(S, 2), ...grp(Tt, 1));
    out.push({ group: 1, s: 0.5, row: 1, idx: 0.5, len: chord * 0.5, w: chord * 1.3, aS: 0, aF: 88 * DEG, layer: 0.03 * Lw, emarg: 0, nr: 1, nc: 1 });
    return out;
  }
  for (const f of [...P, ...S, ...Tt]) out.push(Object.assign({ nr: f.group === 2 ? 5 : 3, nc: f.group === 2 ? 2 : 1 }, f));
  // coverts: greater (over the secondaries and the primaries' bases), median, marginal; primary coverts; alula
  const cov = (row, frac, wFrac, layer0, list) => list.forEach((f, i) => out.push(Object.assign({}, f, {
    row, len: f.len * frac, w: f.w * wFrac, layer: layer0 + (SN ? sn(i, list.length, 0.008) : 0.0009 * i * (Lw / 0.3)), emarg: 0, nr: 2, nc: 1,
    aS: f.aS * 0.85, aF: f.aF })));
  cov(1, 0.48, 1.05, 0.016 * Lw, S);
  cov(2, 0.27, 1.0, 0.03 * Lw, S.filter((_, i) => i % 2 === 0));
  cov(3, 0.36, 1.0, 0.012 * Lw, P.slice(0, Math.max(1, np - 2)));
  cov(5, 0.16, 1.4, 0.04 * Lw, S.filter((_, i) => i % 3 === 0));
  out.push({ group: 2, s: 0.04, row: 4, idx: 0, len: Lw * 0.22, w: Lw * 0.05, aS: -62 * DEG, aF: -88 * DEG, layer: 0.035 * Lw, emarg: 0, nr: 2, nc: 1 });
  return out;
}

// ---- the shader ---------------------------------------------------------------------------------------------------
export const BIRD_VARY = /* glsl */`
flat varying float vPart; varying vec4 vF; varying vec3 vRest; flat varying float vBirdI; varying vec4 vF2; varying vec3 vUpN;
flat varying float vSeed, vFold;
`;

export const BIRD_VERT = /* glsl */`
uniform highp sampler2D uBirds;
uniform vec4 uB0;   // body length, width, height, head radius
uniform vec4 uB1;   // neck length, neck radius, bill length, eye radius
uniform vec4 uB2;   // wing: humerus, forearm, hand, wrist-to-tip
uniform vec4 uB3;   // shoulder x, y, z, chord
uniform vec4 uB4;   // tail: base x, base y, length, fan (rad at full spread)
uniform vec4 uB5;   // tail shape: fork depth, streamer, width, round
uniform vec4 uB6;   // legs: tibia, tarsus, toe, hip z
uniform vec4 uB7;   // neck: drawn-in length, extended length, (unused), (unused)
uniform vec4 uB8;   // spread angles: humerus, forearm, hand; fold-plane angle
uniform vec4 uB9;   // folded angles: humerus, forearm, hand; leg radius
uniform vec4 uB10;  // the leading edge's radii (opt-in, B.wing.edge): shoulder, wrist, the hand's tip
attribute float aPart; attribute vec4 aA; attribute vec4 aB; attribute vec4 aC;
vec4 bt(int k) { return texelFetch(uBirds, ivec2(k, gl_InstanceID), 0); }
// the torso's surface: its half-width at (x, y) in the body frame (0 outside it); bodyProf in bird.js
float bodyHalfZ(float x, float y) {
  float bl = uB0.x, bw = uB0.y * 0.5, bh = uB0.z * 0.5;
  float s = clamp((x + 0.55 * bl) / bl, 0.0, 1.0);
  float prof = pow(max(sin(3.14159265 * (0.05 + 0.9 * s)), 0.0), 0.5) * (1.0 - 0.18 * (1.0 - s) * (1.0 - s));
  float rz = bw * prof * (1.0 - 0.25 * (1.0 - s) * (1.0 - s));
  float yc = bh * 0.06 * (s - 0.5), dy = y - yc;
  float ry = dy > 0.0 ? bh * prof * (0.86 + 0.1 * s) : bh * prof * (1.06 + 0.12 * sin(3.14159265 * s));
  float q = dy / max(ry, 1e-5);
  return abs(q) < 1.0 ? rz * sqrt(1.0 - q * q) : 0.0;
}
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec3 rotAxis(vec3 v, vec3 a, float ang) { float c = cos(ang), s = sin(ang); return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c); }
vec3 dirIn(vec3 fwd, vec3 outv, float b) { return fwd * sin(b) + outv * cos(b); }
// the head's frame in the body: centre and rotation (yaw about y, pitch about z, roll about x)
vec3 neckBase() { return vec3(uB0.x * 0.38, uB0.z * 0.18, 0.0); }
void headFrame(vec4 p5, vec4 p6, vec4 p9, out vec3 Hc, out mat3 Rh) {
  float ext = p6.x, a = p9.w;
  Hc = neckBase() + vec3(cos(a), sin(a), 0.0) * mix(uB7.x, uB7.y, ext);
  float cy = cos(p5.z), sy = sin(p5.z), cp = cos(p5.w), sp = sin(p5.w), cr = cos(p6.z), sr = sin(p6.z);
  mat3 Ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 Rz = mat3(cp, sp, 0.0, -sp, cp, 0.0, 0.0, 0.0, 1.0);
  mat3 Rx = mat3(1.0, 0.0, 0.0, 0.0, cr, sr, 0.0, -sr, cr);
  Rh = Ry * Rz * Rx;
}
// a wing's skeleton (right wing frame): shoulder S, elbow E, wrist W, hand tip M; the arm's plane (fwd, out, nrm) and the hand's
void wingFrame(vec4 wp, float handEl, out vec3 S, out vec3 E, out vec3 W, out vec3 M, out vec3 fwd, out vec3 outv, out vec3 nrm, out vec3 hfwd, out vec3 hout, out vec3 hnrm) {
  float el = wp.x, sw = wp.y, k = wp.z, pr = wp.w;
  S = uB3.xyz;
  // sweep about y, then elevation about x (tip up for positive), folding tips the plane down along the flank
  float e = mix(el, uB8.w, k);
  fwd = vec3(cos(sw), 0.0, -sin(sw)); outv = vec3(sin(sw), 0.0, cos(sw)); nrm = vec3(0.0, 1.0, 0.0);
  float ce = cos(-e), se = sin(-e);
  mat3 Rx = mat3(1.0, 0.0, 0.0, 0.0, ce, se, 0.0, -se, ce);
  fwd = Rx * fwd; outv = Rx * outv; nrm = Rx * nrm;
  float bh = mix(uB8.x, uB9.x, k), bf = mix(uB8.y, uB9.y, k), bm = mix(uB8.z, uB9.z, k);
  E = S + dirIn(fwd, outv, bh) * uB2.x;
  W = E + dirIn(fwd, outv, bf) * uB2.y;
  // the hand: its own elevation about the forearm, and the pronation (the feathers' pitch)
  vec3 fa = normalize(W - E);
  hfwd = rotAxis(fwd, fa, handEl); hout = rotAxis(outv, fa, handEl); hnrm = rotAxis(nrm, fa, handEl);
  M = W + dirIn(hfwd, hout, bm) * uB2.z;
  vec3 ha = normalize(M - W);
  hfwd = rotAxis(hfwd, ha, pr); hout = rotAxis(hout, ha, pr); hnrm = rotAxis(hnrm, ha, pr);
}
void ikLeg(vec3 H, vec3 F, float a, float b, vec3 bend, out vec3 K) {
  vec3 d = F - H; float L = length(d); vec3 u = d / max(L, 1e-5);
  L = clamp(L, abs(a - b) + 1e-4, a + b - 1e-4);
  float x = (a * a - b * b + L * L) / (2.0 * L), h = sqrt(max(a * a - x * x, 0.0));
  vec3 side = normalize(bend - u * dot(bend, u));
  K = H + u * x + side * h;
}
void objVertex(inout vec3 p, inout vec3 n, inout vec2 uv) {
  vec4 p0 = bt(0);
  // a collapsed instance (scale 0: this bird is drawn at another level of detail, or not at all) skips the skeleton
  if (p0.w == 0.0) { p = vec3(0.0, -1e5, 0.0); n = vec3(0.0, 1.0, 0.0); vPart = 0.0; vF = vec4(0.0); vF2 = vec4(0.0); vRest = vec3(0.0); vBirdI = 0.0; vUpN = vec3(0.0, 1.0, 0.0); vSeed = 0.0; vFold = 0.0; return; }
  vec4 q = bt(1), p4 = bt(4), p5 = bt(5), p6 = bt(6), p9 = bt(9);
  int part = int(aPart + 0.5);
  vPart = aPart; vF = vec4(uv, aA.y, aA.w); vF2 = aC; vRest = p; vBirdI = float(gl_InstanceID); vUpN = vec3(0.0, 1.0, 0.0);
  vSeed = p9.y; vFold = bt(2).z;
  vec3 P = p, Nn = n;
  bool world = false;            // legs and toes are placed in the world already
  if (part == 0) {
    // the body breathes a little and crouches
    P.y -= p6.w * 0.25 * uB0.z * smoothstep(0.0, -uB0.z, P.y);
  } else if (part == 1) {
    // the neck: a Bezier from the body's front to the back of the head
    vec3 Hc; mat3 Rh; headFrame(p5, p6, p9, Hc, Rh);
    vec3 N0 = neckBase(), T0 = normalize(vec3(0.75, 0.66, 0.0));
    vec3 Hb = Hc + Rh * vec3(-uB0.w * 0.75, -uB0.w * 0.12, 0.0), T1 = Rh * normalize(vec3(0.85, -0.25, 0.0));
    float L = max(length(Hb - N0), 1e-4) * mix(0.42, 0.62, 1.0 - p6.x);
    float s = aA.x; float is = 1.0 - s;
    vec3 C1 = N0 + T0 * L, C2 = Hb - T1 * L;
    vec3 C = is * is * is * N0 + 3.0 * is * is * s * C1 + 3.0 * is * s * s * C2 + s * s * s * Hb;
    vec3 D = normalize(3.0 * is * is * (C1 - N0) + 6.0 * is * s * (C2 - C1) + 3.0 * s * s * (Hb - C2));
    vec3 Sd = normalize(vec3(0.0, 0.0, 1.0) - D * D.z); vec3 Up = cross(Sd, D);
    float r0 = max(bodyHalfZ(N0.x, N0.y + 1e-4), uB1.y), r = mix(r0 * 1.02, max(uB0.w * 0.92, uB1.y), smoothstep(0.0, 1.0, s));
    float a = aA.y;
    P = C + (Up * sin(a) * 1.05 + Sd * cos(a) * 0.92) * r;
    Nn = normalize(Up * sin(a) + Sd * cos(a));
  } else if (part >= 2 && part <= 5) {
    vec3 Hc; mat3 Rh; headFrame(p5, p6, p9, Hc, Rh);
    vec3 lp = p;
    if (part == 3 || part == 4) {
      // the bill from its base at the head's front; the lower mandible drops by the gape
      vec3 base = vec3(uB0.w * 0.82, -uB0.w * 0.05, 0.0);
      if (part == 4) { float g = p6.y; lp = vec3(lp.x * cos(g) + lp.y * sin(g), -lp.x * sin(g) + lp.y * cos(g), lp.z); Nn = vec3(Nn.x * cos(g) + Nn.y * sin(g), -Nn.x * sin(g) + Nn.y * cos(g), Nn.z); }
      lp += base;
    } else if (part == 5) {
      lp += vec3(uB0.w * 0.38, uB0.w * 0.2, aA.x * uB0.w * 0.78);
    }
    P = Hc + Rh * lp; Nn = Rh * Nn;
  } else if (part == 6) {
    // the tail: a fan from its base; outer feathers longer for a fork, a streamer on the outermost pair
    float spread = p4.w, pitch = p5.x, twist = p5.y;
    float ix = aA.x, ax = abs(ix);
    float fan = ix * mix(0.025, 1.0, spread) * uB4.w * 0.5;
    float len = uB4.z * (1.0 + uB5.x * ax * ax - uB5.w * ax * ax * 0.25 + uB5.y * smoothstep(0.85, 1.0, ax));
    vec3 base = vec3(uB4.x, uB4.y, 0.0);
    vec3 D = vec3(-cos(fan), 0.0, sin(fan));
    vec3 C = vec3(sin(fan), 0.0, cos(fan));
    // pitch the fan about z, twist about x
    float cp = cos(pitch), sp = sin(pitch), ct = cos(twist), st = sin(twist);
    D = vec3(D.x * cp - D.y * sp, D.x * sp + D.y * cp, D.z); C = vec3(C.x * cp - C.y * sp, C.x * sp + C.y * cp, C.z);
    D = vec3(D.x, D.y * ct - D.z * st, D.y * st + D.z * ct); C = vec3(C.x, C.y * ct - C.z * st, C.y * st + C.z * ct);
    vec3 Nt = normalize(cross(D, C));
    float r = aB.x, c = aB.y, wid = aB.z * (0.55 + 0.45 * sin(3.14159 * min(r * 1.15, 1.0))) * (1.0 - 0.6 * smoothstep(0.86, 1.0, ax) * uB5.y / max(uB5.y, 1e-3) * step(0.001, uB5.y) * smoothstep(0.3, 1.0, r));
    float layer = (1.0 - ax) * uB4.z * 0.012;
    P = base + D * r * len + C * c * wid * 0.5 + Nt * (layer + 0.02 * len * r * r * (1.0 - spread));
    Nn = Nt;
    vF.z = len;
  } else if (part == 7 || part == 8 || part == 12) {
    float sd = aA.x;
    vec4 wp = sd > 0.0 ? bt(2) : bt(3);
    float handEl = sd > 0.0 ? p4.x : p4.y;
    vec3 S, E, W, M, fwd, outv, nrm, hfwd, hout, hnrm;
    wingFrame(wp, handEl, S, E, W, M, fwd, outv, nrm, hfwd, hout, hnrm);
    float k = wp.z;
    vec3 upN = nrm;
    if (part == 12) {
      // the leading edge: a tube along the patagium's edge (shoulder to wrist), then along the hand (wrist to tip), its
      // front on the edge; gone as the wing folds
      float u = aA.y, a = aA.z;
      vec3 C, ax1, ax2; float rad;
      if (u <= 1.0) { C = mix(S, W, u) + fwd * sin(3.14159 * u) * uB3.w * 0.08 * (1.0 - k); ax1 = fwd; ax2 = nrm; rad = mix(uB10.x, uB10.y, smoothstep(0.0, 1.0, u)); }
      else { float v = u - 1.0; C = mix(W, M, v); ax1 = hfwd; ax2 = hnrm; upN = hnrm; rad = mix(uB10.y, uB10.z, v); }
      rad *= 1.0 - k;
      C -= ax1 * rad * 0.9;
      P = C + (ax1 * cos(a) + ax2 * sin(a) * 0.8) * rad;
      Nn = normalize(ax1 * cos(a) + ax2 * sin(a) * 1.25);
    } else if (part == 8) {
      // patagium: leading edge (S..W straight, bulged forward) to the bone line (S..E..W)
      float u = aA.y, v = aA.z;
      float lse = length(E - S), lew = length(W - E), ue = lse / max(lse + lew, 1e-5);
      vec3 BL = u < ue ? mix(S, E, u / max(ue, 1e-5)) : mix(E, W, (u - ue) / max(1.0 - ue, 1e-5));
      vec3 LE = mix(S, W, u) + fwd * sin(3.14159 * u) * uB3.w * 0.08 * (1.0 - k);
      P = mix(LE, BL, v) + nrm * 0.004 * uB2.w;
      { float zb = bodyHalfZ(P.x, P.y); P.z = mix(P.z, zb > 0.0 ? zb * 1.01 : uB3.z * 0.6, k * smoothstep(-0.2, 0.15, P.y / max(uB0.z, 1e-4))); }
      Nn = nrm;
    } else {
      int grp = int(aA.y + 0.5); float s = aA.z;
      vec3 b0 = grp == 0 ? S : grp == 1 ? E : W, b1 = grp == 0 ? E : grp == 1 ? W : M;
      vec3 pf = grp == 2 ? hfwd : fwd, pn = grp == 2 ? hnrm : nrm;
      vec3 bd = normalize(b1 - b0);
      vec3 back = normalize(cross(bd, pn));
      float al = mix(aC.x, aC.y, k);
      vec3 D = back * cos(al) - bd * sin(al);
      // coverts sit forward of the flight feathers' bases, toward the leading edge
      float row = aA.w;
      vec3 B = mix(b0, b1, s) - back * (row > 0.5 ? uB3.w * (row > 1.5 ? 0.06 : 0.03) : -uB3.w * 0.02);
      vec3 Cv = cross(pn, D);
      float r = aB.x, c = aB.y, len = aB.z, wid = aB.w;
      float hw = wid * 0.5 * (0.62 + 0.38 * sin(3.14159 * min(r * 1.2, 1.0)));
      // the downstroke bends the feathers up (the load), more at the tips; a folded feather lies flat
      float bend = p4.z * (1.0 - k) * (grp == 2 ? 1.0 : 0.45);
      P = B + D * r * len + Cv * c * hw + pn * (aC.z * (1.0 - 0.7 * k) + bend * r * r * len * 0.18 + 0.06 * hw * (1.0 - c * c) * (1.0 - 0.6 * k));
      // folded, the wing follows the body: tips toward the midline over the tail, the whole a little into the flank
      // folded, the wing is a shell on the torso: each point laid on the surface beneath it (by its layer), and past the
      // torso (over the tail, over the back) drawn in to the midline where the two wings' tips cross; its lower edge
      // tucks under the flank feathers (left inside the torso)
      {
        float zb = bodyHalfZ(P.x, P.y), lay = max(aC.z, 0.0) * 0.35 + uB2.w * 0.004;
        float zt = zb > 0.0 ? zb * 1.02 + lay : max(uB5.z * 0.35, uB3.z * 0.18) + lay;
        float up = smoothstep(-0.2, 0.15, P.y / max(uB0.z, 1e-4));
        P.z = mix(P.z, zt, k * up);
      }
      Nn = normalize(pn - D * bend * r * 0.36 - Cv * c * 0.12);
      vF.z = len;
    }
    if (sd < 0.0) { P.z = -P.z; Nn.z = -Nn.z; upN.z = -upN.z; }
    vUpN = qrot(q, part == 12 ? upN : part == 8 ? Nn : normalize(Nn));
  } else if (part >= 9 && part <= 11) {
    // legs in the world: hip (body) -> knee/ankle by IK -> the foot the caller placed; toes from the foot
    float sd = aA.x;
    vec3 hip = vec3(0.0, -uB0.z * 0.28, sd * uB6.w);
    vec3 Hw = p0.xyz + qrot(q, hip * p0.w);
    vec4 foot = sd > 0.0 ? bt(7) : bt(8);
    vec3 F = foot.xyz;
    vec3 fwdW = qrot(q, vec3(1.0, 0.0, 0.0)); vec3 fh = normalize(vec3(fwdW.x, 0.0, fwdW.z) + vec3(1e-4, 0.0, 0.0));
    vec3 K; ikLeg(Hw, F, uB6.x * p0.w, uB6.y * p0.w, -fh, K);       // the 'knee' we see is the ankle: it bends back
    float rad = uB9.w * p0.w;
    if (part == 9) {
      int seg = int(aA.y + 0.5); float t = aA.z, a = aA.w;
      vec3 A0 = seg == 0 ? Hw : K, A1 = seg == 0 ? K : F;
      vec3 D = normalize(A1 - A0 + vec3(0.0, 1e-5, 0.0));
      vec3 Sd = normalize(cross(D, fh) + vec3(0.0, 0.0, 1e-5)); vec3 Up = cross(Sd, D);
      float r = rad * (seg == 0 ? 1.8 - 0.6 * t : 1.0 - 0.15 * t);
      P = mix(A0, A1, t) + (Up * sin(a) + Sd * cos(a)) * r;
      Nn = normalize(Up * sin(a) + Sd * cos(a));
    } else if (part == 11) {
      int pr = int(aA.y + 0.5); float t = aA.z, w = aA.w, curl = foot.w;
      vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fh));
      vec3 Pw[2];
      for (int k = 0; k < 2; k++) {
        int toe = pr + k;
        float ang = (float(toe) - 1.0) * 0.42;
        vec3 D0 = normalize(fh * cos(ang) + side * sin(ang) * sd);
        float tl = uB6.z * p0.w * (toe == 1 ? 1.0 : 0.78);
        Pw[k] = F + D0 * tl * t * (1.0 - curl * 0.5) - vec3(0.0, 1.0, 0.0) * (curl * tl * 0.35 * t * t + rad * 0.25);
      }
      // the web's free edge is a little notched between the toes' tips
      P = mix(Pw[0], Pw[1], w) - vec3(0.0, 1.0, 0.0) * 0.0 + (normalize(Pw[0] + Pw[1] - 2.0 * F) * -0.18 * uB6.z * p0.w * t * t * sin(3.14159 * w));
      Nn = vec3(0.0, n.y, 0.0);
    } else {
      int toe = int(aA.y + 0.5); float t = aA.z, a = aA.w, curl = foot.w;
      float ang = toe == 3 ? 3.14159 : (float(toe) - 1.0) * 0.42;
      vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fh));
      vec3 D0 = normalize(fh * cos(ang) + side * sin(ang) * sd);
      float tl = uB6.z * p0.w * (toe == 3 ? 0.6 : (toe == 1 ? 1.0 : 0.78));
      // curled: toes wrap down and back (a grip on a twig, or clenched in flight)
      float cang = curl * 2.2 * t;
      vec3 D = normalize(D0 * cos(cang) - vec3(0.0, 1.0, 0.0) * sin(cang));
      vec3 Sd = normalize(cross(D, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 0.0, 1e-5)); vec3 Up = cross(Sd, D);
      P = F + D0 * tl * t * (1.0 - curl * 0.5) - vec3(0.0, 1.0, 0.0) * curl * tl * 0.35 * t * t + (Up * sin(a) + Sd * cos(a)) * rad * 0.7 * (1.0 - 0.5 * t);
      Nn = normalize(Up * sin(a) + Sd * cos(a));
    }
    world = true;
  }
  if (world) {
    // back into the object frame the instance transform will undo (the mesh's own transform is the identity)
    p = P; n = Nn;
    vF2.w = aC.w; vRest = p;
    return;
  }
  p = p0.xyz + qrot(q, P * p0.w * (1.0 - 0.0 * p9.z));
  n = qrot(q, Nn);
}
`;

// the pose texture: n instances x BIRD_TEX_W texels
export function poseTexture(n) {
  const data = new Float32Array(BIRD_TEX_W * Math.max(1, n) * 4);
  const tex = new T.DataTexture(data, BIRD_TEX_W, Math.max(1, n), T.RGBAFormat, T.FloatType);
  tex.minFilter = T.NearestFilter; tex.magFilter = T.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  return { tex, data };
}

// the preset's skeleton numbers as uniforms
export function birdUniforms(B) {
  const D = Math.PI / 180, w = B.wing;
  const Lw = B.wingLen, { hum, fore, hand, arm, b } = boneLengths(B);
  const v4 = (...a) => ({ value: new T.Vector4(...a) });
  return {
    uB0: v4(B.body[0], B.body[1], B.body[2], B.head),
    uB1: v4(B.neck[0], B.neck[1], B.bill[0], B.eye),
    uB2: v4(hum, fore, hand, Lw),
    uB3: v4(B.shoulder[0], B.shoulder[1], B.shoulder[2], w.chord * Lw),
    uB4: v4(-B.body[0] * 0.5, B.body[2] * 0.12, B.tailLen, (B.tailFan || 100) * D),
    uB5: v4(B.tailFork || 0, B.tailStreamer || 0, B.tailW, B.tailRound || 0),
    uB6: v4(B.leg[0], B.leg[1], B.leg[2], B.body[1] * 0.22),
    uB7: v4(B.neckPose[0], B.neckPose[1], 0, 0),
    uB8: v4(w.betaH * D, w.betaF * D, w.betaM * D, (B.foldPlane || -78) * D),
    uB9: v4(-82 * D, 80 * D, -88 * D, B.leg[3]),
    uB10: v4(...(w.edge || [0, 0, 0]), 0),
    _arm: { hum, fore, hand, arm, b },
  };
}

// ---- shading ------------------------------------------------------------------------------------------------------
// one material per species: its palette (uC0..uC7, linear) and its pattern (uPat: which regions take which colour)
export const BIRD_SURF = /* glsl */`
uniform vec3 uC0, uC1, uC2, uC3, uC4, uC5, uC6, uC7;
uniform int uPat;
uniform vec4 uB0b;     // body length, width, height, head radius (the same as uB0, for the fragment stage)
uniform float uSheen;  // iridescence (crows, swallows)
uniform float uPartDebug;   // ?birdparts=1: each part its own colour
uniform float uJuv;        // the share of first-winter birds (the instance's seed below it; patterns 7-11)
uniform vec4 uFill, uFillPos;  // a world's bounced light from below (rgb, strength) round a point (xyz, falloff m): 0 off
float gJuv = 0.0, gMorph = 0.0;   // this fragment's bird: juvenile (0 | 1), its seed (the feral pigeons' morphs)
// the feral pigeon's morph by seed: 0 blue-bar, 1 checker, 2 dark, 3 red, 4 white (city flocks: ~half blue-bar)
int pigeonMorph() { return gMorph < 0.45 ? 0 : gMorph < 0.7 ? 1 : gMorph < 0.85 ? 2 : gMorph < 0.93 ? 3 : 4; }
vec3 pigeonTint(vec3 c) {
  int m = pigeonMorph();
  if (m == 2) return c * vec3(0.5, 0.5, 0.52);
  if (m == 3) return mix(c, vec3(0.3, 0.13, 0.08), 0.7);
  if (m == 4) return mix(c, vec3(0.82, 0.81, 0.78), 0.85);
  return c;
}
// feather vanes: barbs at ~45 degrees to the rachis, a rachis line, the edge lighter or darker
float vane(vec2 q, float len, float pix) {
  float r = q.x, c = q.y;
  float barb = sin((r * len * 900.0 + abs(c) * len * 350.0));
  float fine = smoothstep(0.0008, 0.0002, pix);
  return 1.0 + 0.06 * barb * fine;
}
vec3 bodyCol(vec3 lp, out float iri) {
  // lp: the body's rest frame (x forward, y up); regions per pattern
  iri = 0.0;
  float bl = uB0b.x, bh = uB0b.z;
  float up = smoothstep(-0.25 * bh, 0.35 * bh, lp.y), fr = lp.x / bl;
  if (uPat == 0) { iri = 1.0; return mix(uC0, uC1, 0.15 * up); }                                        // crow
  if (uPat == 1) {                                                                                         // kite
    vec3 c = mix(uC1, uC0, up); return mix(c, uC2, 0.25 * smoothstep(0.1, 0.4, fr) * (1.0 - up)); }
  if (uPat == 2) {                                                                                         // tree sparrow
    vec3 back = uC1, under = uC3; return mix(under, back, up); }
  if (uPat == 3) { float bel = smoothstep(-0.05 * bh, -0.4 * bh, lp.y) * smoothstep(-0.2 * bl, 0.3 * bl, lp.x); return mix(uC0, uC2, bel); }   // heron: grey, paler beneath
  if (uPat == 4) { return mix(uC2, uC0, up); }                                                              // white-eye: olive above, pale below
  if (uPat == 5) { iri = up; return mix(uC3, uC0, smoothstep(-0.1 * bh, 0.25 * bh, lp.y)); }               // swallow
  if (uPat == 6) { return mix(uC3, uC0, up * 0.8); }                                                        // bulbul
  float mantle = smoothstep(0.55, 0.85, up) * smoothstep(0.3, -0.1, fr);
  // (the flank a folded wing covers, by the bird's fold: the kit lays the folded wing high on the body, a narrow shell,
  // where a gull's folded wing covers the flank from the shoulder back; flying, the sides are the body's own)
  float cover = vFold * smoothstep(-0.36 * bh, -0.2 * bh, lp.y) * smoothstep(0.3, 0.12, fr) * smoothstep(-0.6, -0.42, fr);
  if (uPat == 7) {                                                                                          // western gull
    vec3 j = mix(uC4 * 1.25, uC4, up);
    return mix(mix(uC0, uC1, max(mantle, cover)), mix(j, uC5, 0.5 * cover), gJuv);
  }
  if (uPat == 11) {                                                                                         // Heermann's gull
    vec3 c = mix(uC0 * 1.12, uC0, up); c = mix(c, uC1, max(mantle, cover));
    return mix(c, mix(uC5 * 1.2, uC5, up), gJuv);
  }
  if (uPat == 8) {                                                                                          // brown pelican
    float fore = smoothstep(0.25, 0.45, fr) * smoothstep(-0.1, 0.4, up);
    vec3 c = mix(uC1, uC0, up); c = mix(c, uC2, fore);
    vec3 j = mix(uC5, uC4, smoothstep(0.1, 0.6, up)); j = mix(j, uC4, fore);
    return mix(c, j, gJuv);
  }
  if (uPat == 9) {                                                                                          // cormorant
    iri = 1.0 - gJuv;
    vec3 c = mix(uC0, uC1, mantle * 0.85);
    vec3 j = mix(uC3, uC4, max(up, smoothstep(0.0, -0.4, fr) * 0.7));
    return mix(c, j, gJuv);
  }
  if (uPat == 10) {                                                                                         // rock pigeon
    float rump = smoothstep(-0.2, -0.38, fr) * smoothstep(0.45, 0.75, up);
    vec3 c = mix(uC0 * 1.06, uC0, up); c = mix(c, uC4, rump * (pigeonMorph() == 0 ? 1.0 : 0.6));
    return pigeonTint(c);
  }
  return uC0;
}
vec3 headCol(vec3 lp, float hr, out float iri) {
  iri = 0.0;
  float yy = lp.y / hr, xx = lp.x / hr, zz = abs(lp.z) / hr;
  if (uPat == 0) { iri = 1.0; return uC0; }
  if (uPat == 1) return mix(uC2, uC1, smoothstep(-0.3, 0.6, yy) * 0.4 + 0.2);
  if (uPat == 2) {
    // chestnut cap, white cheeks with the black ear spot, black bib and lores
    vec3 c = uC3;
    float cap = smoothstep(0.25, 0.45, yy);
    float cheek = smoothstep(0.75, 0.5, length(vec2(xx + 0.05, yy + 0.05)));
    float spot = smoothstep(0.24, 0.16, length(vec2(xx + 0.18, yy + 0.02))) * step(0.5, zz);
    float bib = smoothstep(-0.3, -0.5, yy) * smoothstep(-0.3, 0.3, xx);
    float lore = smoothstep(0.2, 0.05, abs(yy - 0.05)) * smoothstep(0.35, 0.6, xx) * step(0.4, zz);
    c = mix(c, uC4, cheek * step(0.35, zz));
    c = mix(c, uC2, cap);
    c = mix(c, uC5, max(max(spot, bib), lore));
    return c;
  }
  if (uPat == 3) {
    // white head, a black stripe from the eye back into the crest
    vec3 c = uC3;
    float stripe = smoothstep(0.2, 0.05, abs(yy - 0.25 - 0.15 * (-xx))) * smoothstep(0.3, -0.2, xx) * step(0.3, zz);
    return mix(c, uC5, stripe);
  }
  if (uPat == 4) {
    // olive head, yellow throat, the white eye-ring (drawn at the eye)
    return mix(uC1, uC2, smoothstep(-0.2, 0.2, yy));
  }
  if (uPat == 5) {
    // glossy blue-black cap and back of the head; brick-red forehead and throat
    float red = max(smoothstep(-0.05, -0.35, yy) * smoothstep(-0.4, 0.2, xx), smoothstep(0.62, 0.8, xx) * smoothstep(-0.2, 0.2, yy));
    iri = 1.0 - red;
    return mix(uC0, uC2, red);
  }
  if (uPat == 6) {
    // grey with the chestnut ear patch
    float ear = smoothstep(0.42, 0.26, length(vec2(xx + 0.2, yy + 0.05))) * step(0.4, zz);
    return mix(uC0, uC2, ear);
  }
  if (uPat == 7) return mix(uC0, mix(uC4 * 1.3, uC4 * 1.05, smoothstep(-0.2, 0.6, yy)), gJuv);
  if (uPat == 11) {
    // non-breeding: a grey-brown hood mottled pale on the face
    vec3 c = mix(uC3 * 1.25, uC3, smoothstep(-0.3, 0.5, yy) * smoothstep(0.6, -0.2, xx));
    return mix(c, uC5 * 1.1, gJuv);
  }
  if (uPat == 8) {
    vec3 c = mix(uC2, vec3(0.86, 0.78, 0.5), 0.45 * smoothstep(0.35, 0.8, yy));      // the crown washed yellow
    return mix(c, uC4 * 1.05, gJuv);
  }
  if (uPat == 9) {
    // the bare orange skin at the bill's base and the throat pouch
    float skin = max(smoothstep(0.45, 0.65, xx) * smoothstep(0.2, -0.05, yy), smoothstep(-0.25, -0.5, yy) * smoothstep(-0.1, 0.4, xx));
    vec3 c = mix(uC0, uC2, skin);
    vec3 j = mix(uC4, uC3, smoothstep(0.0, -0.5, yy)); j = mix(j, uC2 * 0.8, skin * 0.6);
    return mix(c, j, gJuv);
  }
  if (uPat == 10) return pigeonTint(uC1);
  return uC0;
}
vec3 wingCol(float row, float grp, float idx, vec2 fq, bool under, out float iri) {
  iri = 0.0;
  float r = fq.x, c = fq.y;
  if (uPat == 0) { iri = 1.0; return uC0; }
  if (uPat == 1) {
    // brown; the primaries darker with a pale window at their bases beneath (a black kite's under-wing)
    vec3 c0 = mix(uC1, uC0, 0.3);
    if (row < 0.5 && grp > 1.5) { c0 = uC3; if (under) c0 = mix(c0, uC4, smoothstep(0.45, 0.2, r) * 0.85); }
    if (row > 0.5) c0 = mix(uC1, uC2, 0.25 * step(1.5, row));
    return c0 * (0.9 + 0.2 * smoothstep(0.6, 1.0, r));
  }
  if (uPat == 2) {
    // brown wing, black-centred feathers with buff edges; two white bars on the median and greater coverts' tips
    vec3 cen = mix(uC5, uC1, 0.3), edge = uC1;
    vec3 c0 = mix(cen, edge, smoothstep(0.35, 0.8, abs(c)));
    if (row > 0.5 && row < 2.5) c0 = mix(c0, uC4, smoothstep(0.78, 0.92, r));
    if (row > 4.5) c0 = uC2;
    return c0;
  }
  if (uPat == 3) {
    // grey coverts, black flight feathers
    if (row < 0.5 && grp > 0.5) return mix(uC5, uC0, step(1.5 - grp, 0.0) * 0.0 + (grp < 1.5 ? 0.35 : 0.0));
    return uC0 * (row > 4.5 ? 0.85 : 1.0);
  }
  if (uPat == 4) return mix(uC0, uC5, row < 0.5 ? 0.55 : 0.1);
  if (uPat == 5) { iri = 1.0; return uC0 * (row < 0.5 ? 0.9 : 1.0); }
  if (uPat == 6) return mix(uC1, uC5, row < 0.5 ? 0.6 : 0.15);
  float ix = min(vF2.w / 10.0, 1.0);                     // the feather's place in its row (0 inner .. 1 outer), unwrapped
  // (the bone group isn't in the fragment: vF.z carries the feather's length there; a primary's folded angle is about -86
  // deg, a secondary's +82..88, a tertial's -95)
  bool prim = vF2.y < 0.0 && vF2.y > -1.62;
  if (uPat == 7 || uPat == 11) {
    // gulls: grey (Heermann's dark) coverts, the flight feathers' white trailing edge; the outer primaries black with white
    // tips and the mirrors on the outer two (western); white coverts and dark-grey flight feathers beneath
    vec3 grey = uPat == 7 ? uC1 : uC1, blk = uC2, wht = uPat == 7 ? uC3 : vec3(0.9);
    vec3 c0;
    if (row < 0.5) {
      if (prim) {
        float black = uPat == 7 ? smoothstep(0.38, 0.52, ix) * smoothstep(0.2, 0.5, r) : 1.0;
        c0 = mix(grey, blk, black);
        float apical = smoothstep(0.92, 0.98, r) * (uPat == 7 ? 1.0 : 0.0);
        float mirror = uPat == 7 ? (ix > 0.95 ? 1.0 : ix > 0.85 ? 0.55 : 0.0) * smoothstep(0.07, 0.03, abs(r - 0.8)) * smoothstep(0.75, 0.4, abs(c)) : 0.0;
        c0 = mix(c0, wht, max(apical, mirror));
      } else c0 = mix(uPat == 7 ? grey : blk, wht, smoothstep(0.8, 0.92, r));
      if (under) c0 = mix(c0, uPat == 7 ? vec3(0.3, 0.31, 0.33) : uC2, 0.55 * step(r, 0.9));
    } else c0 = under && uPat == 7 ? uC0 : grey;
    vec3 jc = row < 0.5 ? uC5 : mix(uC4, uC5, 0.35);
    jc = mix(jc, uC4 * 1.45, smoothstep(0.75, 0.95, max(abs(c), r)) * step(0.5, row));
    return mix(c0, jc, gJuv);
  }
  if (uPat == 8) {
    // pelican: black primaries, dark secondaries, silver coverts with darker shafts; beneath, dark with a pale bar
    vec3 c0 = row < 0.5 ? (prim ? uC3 : mix(uC3, uC1, 0.45)) : mix(uC0, uC0 * 0.72, smoothstep(0.12, 0.0, abs(c)));
    if (under) c0 = row < 0.5 ? mix(c0, uC1, 0.4) : mix(uC1, uC0, 0.55);
    vec3 jc = row < 0.5 ? mix(uC3, uC4, 0.3) : mix(uC4, uC4 * 1.5, smoothstep(0.7, 0.95, max(abs(c), r)));
    return mix(c0, jc, gJuv);
  }
  if (uPat == 9) {
    // cormorant: black flight feathers; bronze coverts edged black (scaled)
    iri = 1.0 - gJuv;
    vec3 c0 = row < 0.5 ? uC0 : mix(uC1, uC5, max(smoothstep(0.55, 0.92, abs(c)), smoothstep(0.82, 0.97, r)));
    vec3 jc = row < 0.5 ? uC4 * 0.75 : mix(uC4, uC3 * 0.85, smoothstep(0.7, 0.95, max(abs(c), r)));
    return mix(c0, jc, gJuv);
  }
  if (uPat == 10) {
    // pigeon: pale grey coverts and the two black bars (the greater coverts' tips, the inner flight feathers' middles);
    // dark primaries; the underwing whitish. Checkers: dark-centred coverts
    vec3 c0 = uC2;
    int m = pigeonMorph();
    if (row > 0.5 && m == 1) c0 = mix(c0, uC3 * 1.3, 0.6 * smoothstep(0.55, 0.15, abs(c)) * smoothstep(0.2, 0.5, r));
    if (row > 0.5 && row < 1.5 && m < 2) c0 = mix(c0, uC3, smoothstep(0.7, 0.8, r));
    if (row < 0.5) c0 = prim ? mix(uC2, uC5, smoothstep(0.1, 0.4, r)) : mix(uC2 * 0.92, uC3, (m < 2 ? 1.0 : 0.0) * smoothstep(0.08, 0.02, abs(r - 0.62)));
    if (under) c0 = mix(vec3(0.78, 0.79, 0.8), c0, row < 0.5 && prim ? 0.6 : 0.15);
    return pigeonTint(c0);
  }
  return uC0;
}
void smain(inout Surface s, vec3 P, vec3 V) {
  int part = int(vPart + 0.5);
  float pix = length(fwidth(P));
  float iri = 0.0;
  vec3 alb = uC0;
  gJuv = (uJuv > 0.0 && vSeed < uJuv) ? 1.0 : 0.0; gMorph = vSeed;
  s.rough = 0.95; s.spec = 0.03; s.rim = 0.12; s.wrap = 0.12;
  if (part == 0 || part == 1) {
    vec3 lp = vRest;
    if (part == 1) lp = vec3(uB0b.x * 0.45, uB0b.z * 0.25, 0.0);
    alb = bodyCol(lp, iri);
    if (part == 1) { float hr = uB0b.w; vec3 hp = vec3(-hr * 0.9, vF.x < 0.5 ? -hr * 0.6 : 0.0, sin(vF.y * 6.283) * hr); float i2; vec3 hc = headCol(hp, hr, i2); alb = mix(alb, hc, smoothstep(0.3, 0.9, vF.x)); }
    // contour feathers: overlapping scallops, their tips a little lighter (only where a pixel is smaller than a feather)
    // (feather-sized cells: ~1/14 of the torso along it, 1/9 round it; on a long neck, faint and soft)
    vec2 fq = part == 1 ? vec2(vF.x * 7.0, vF.y * 7.0) : vec2(vF.x * 14.0, vF.y * 9.0);
    vec3 wo = worley(fq);
    float scal = smoothstep(0.0, 0.5, wo.y - wo.x);
    float show = smoothstep(uB0b.x * 0.06, uB0b.x * 0.012, pix) * (part == 1 ? 0.35 : 1.0);
    alb *= 1.0 + (0.22 * scal - 0.11 + 0.08 * (wo.z - 0.5)) * show;
    if (uPat >= 7 && gJuv > 0.5) alb *= 1.0 + 0.3 * (scal - 0.5) * show;          // a first-winter bird's scaly mottling
    if (part == 1 && uPat == 10) {
      // the pigeon's neck: green to purple with the angle it is seen at
      float f = pow(1.0 - abs(dot(normalize(s.N), V)), 1.2);
      alb = mix(alb, pigeonTint(mix(vec3(0.16, 0.36, 0.22), vec3(0.36, 0.17, 0.36), f)), smoothstep(0.1, 0.45, vF.x) * (pigeonMorph() == 4 ? 0.1 : 0.75));
    }
    vec3 tg = cross(s.N, vec3(0.0, 1.0, 0.0)); tg = tg / max(length(tg), 1e-4);
    s.N = normalize(s.N + tg * (scal - 0.5) * 0.12 * show);
  } else if (part == 2) {
    alb = headCol(vRest, uB0b.w, iri);
  } else if (part == 3 || part == 4) {
    alb = uC7; s.spec = 0.25; s.rough = 0.45;
    if (uPat == 3) alb = mix(uC7, uC7 * 0.7, vF.x);
    if (uPat == 7) {
      // yellow, the red gonys spot on the lower mandible; a first-winter bird's bill black, paler at the base
      if (part == 4) alb = mix(alb, vec3(0.62, 0.08, 0.05), smoothstep(0.05, 0.0, abs(vF.x - 0.78) - 0.06));
      alb = mix(alb, mix(vec3(0.05), vec3(0.3, 0.26, 0.24), smoothstep(0.4, 0.0, vF.x)), gJuv);
    }
    if (uPat == 11) alb = mix(mix(uC7, vec3(0.03), smoothstep(0.78, 0.84, vF.x)), mix(vec3(0.55, 0.3, 0.28), vec3(0.04), smoothstep(0.6, 0.7, vF.x)), gJuv);
    if (uPat == 8) {
      alb = part == 4 ? mix(vec3(0.24, 0.2, 0.16), uC7 * 0.8, smoothstep(0.85, 1.0, vF.x)) : mix(uC7, vec3(0.62, 0.25, 0.12), smoothstep(0.9, 0.98, vF.x));
      if (gJuv > 0.5) alb = part == 4 ? vec3(0.3, 0.28, 0.25) : uC7 * 0.9;
    }
    if (uPat == 9) alb = part == 4 ? mix(vec3(0.62, 0.48, 0.2), uC7, smoothstep(0.3, 0.8, vF.x)) : uC7;
    if (uPat == 10 && part == 3) alb = mix(vec3(0.82, 0.81, 0.77), uC7, smoothstep(0.28, 0.38, vF.x));      // the cere
  } else if (part == 5) {
    // the eye: dark iris, a pupil, a wet highlight from the sun; white-eyes get their ring
    float ring = (uPat == 4) ? smoothstep(0.45, 0.6, abs(vF.x - 0.5) * 2.0) : 0.0;
    alb = mix(vec3(0.02, 0.015, 0.012), uPat == 3 ? vec3(0.55, 0.45, 0.08) : vec3(0.05, 0.03, 0.02), smoothstep(0.25, 0.4, abs(vF.x - 0.5) * 2.0) * (uPat == 3 ? 1.0 : 0.3));
    alb = mix(alb, vec3(0.85), ring);
    if (uPat >= 7) {
      // the eye seen side on: pupil, iris (gulls pale-eyed as adults, cormorants green, pigeons orange), the orbital ring
      float th = vF.x * 3.14159, ph = vF.y * 6.28318, nz = abs(sin(th) * sin(ph)), d = acos(clamp(nz, 0.0, 1.0));
      vec3 iris = uPat == 7 ? mix(vec3(0.82, 0.72, 0.38), vec3(0.08, 0.06, 0.05), gJuv) : uPat == 9 ? vec3(0.12, 0.42, 0.26) : uPat == 10 ? vec3(0.78, 0.32, 0.08) : uPat == 8 ? vec3(0.72, 0.72, 0.62) : vec3(0.1, 0.08, 0.06);
      vec3 orb = uPat == 7 ? vec3(0.85, 0.35, 0.15) : uPat == 11 ? vec3(0.7, 0.15, 0.1) : uPat == 10 ? vec3(0.75, 0.55, 0.5) : iris * 0.6;
      alb = d < 0.32 ? vec3(0.01) : d < 0.7 ? iris : d < 0.85 ? orb : alb;
    }
    s.spec = 0.6; s.rough = 0.06;
  } else if (part == 6) {
    float ix = abs(vF.z);
    vec2 fq = vec2(vF.x, vF.y);
    alb = uPat == 1 ? mix(uC1, uC3, 0.4) : uPat == 2 ? mix(uC1, uC5, 0.45) : uPat == 3 ? uC4 : uPat == 4 ? uC5 : uPat == 5 ? uC0 : uPat == 6 ? uC5 : uC0;
    if (uPat == 5) { iri = 1.0; float spot = smoothstep(0.18, 0.1, length(vec2((fq.x - 0.62) * 2.5, fq.y * 0.8))); alb = mix(alb, vec3(0.8), spot * step(0.2, abs(vF2.x))); }
    if (uPat == 1) alb *= 0.9 + 0.2 * step(0.5, fract(fq.x * 7.0));                    // the kite's faint bars
    if (uPat == 7) alb = mix(uC0, mix(uC5, uC4 * 1.4, smoothstep(0.85, 0.97, fq.x)), gJuv);      // white; a first-winter's dark band
    if (uPat == 11) alb = mix(mix(uC2, vec3(0.88), smoothstep(0.88, 0.95, fq.x)), uC5, gJuv);       // black, a white tip
    if (uPat == 8) alb = mix(mix(uC0, uC1, 0.5), uC4, gJuv);
    if (uPat == 9) { iri = 1.0 - gJuv; alb = mix(uC0, uC4 * 0.8, gJuv); }
    if (uPat == 10) alb = pigeonTint(mix(uC0, uC3, smoothstep(0.74, 0.8, fq.x)));
    // the feather's outline: a rounded tip
    float tipR = 1.0 - smoothstep(0.82, 1.0, fq.x) * (1.0 - sqrt(max(0.0, 1.0 - fq.y * fq.y)));
    if (fq.x > 0.82 && abs(fq.y) > sqrt(max(0.0, 1.0 - pow((fq.x - 0.82) / 0.18, 2.0)))) discard;
    alb *= vane(fq, vF.z, pix) * tipR;
    alb *= 0.92 + 0.08 * smoothstep(0.08, 0.0, abs(fq.y));
  } else if (part == 7 || part == 8 || part == 12) {
    bool under = dot(vUpN, V) < 0.0;
    if (part == 7) {
      vec2 fq = vec2(vF.x, vF.y);
      float row = vF.w, grp = vF.z;
      alb = wingCol(row, grp, fract(vF2.w / 10.0), fq, under, iri);
      // the outline: a rounded tip; emarginated outer primaries narrow toward the tip (the fingers)
      float em = fract(vF2.w);
      float halfW = 1.0 - em * smoothstep(0.45, 0.62, fq.x) * step(0.0, fq.y) * 0.75 - em * smoothstep(0.55, 0.7, fq.x) * step(fq.y, 0.0) * 0.35;
      float tip = fq.x > 0.86 ? sqrt(max(0.0, 1.0 - pow((fq.x - 0.86) / 0.14, 2.0))) : 1.0;
      if (abs(fq.y) > min(halfW, tip)) discard;
      alb *= vane(fq, vF.z, pix);
      alb *= 0.9 + 0.1 * smoothstep(0.06, 0.0, abs(fq.y));                                // the rachis
      alb *= under ? 0.82 : 1.0;
    } else alb = wingCol(5.0, 0.0, 0.0, vec2(0.5, 0.0), under, iri);
    s.trans = 0.25;                                                                         // light through the vanes
  } else if (part >= 9 && part <= 11) {
    alb = uC6;
    s.spec = 0.1; s.rough = 0.6;
  }
  // iridescence: a blue-violet sheen on black feathers toward grazing view (crows' purple gloss, swallows' steel blue)
  if (iri > 0.0 && uSheen > 0.0) {
    float f = pow(1.0 - abs(dot(normalize(s.N), V)), 2.0);
    vec3 sh = uPat == 9 ? mix(vec3(0.006, 0.016, 0.008), vec3(0.012, 0.014, 0.004), f) : mix(vec3(0.010, 0.006, 0.026), vec3(0.004, 0.012, 0.03), f);   // (cormorants: a green-bronze gloss)
    s.emissive += sh * iri * uSheen * max(dot(s.N, uSunDir), 0.0) * uSunColor * (0.3 + f);
    s.spec = 0.06; s.rough = 0.8;
  }
  s.albedo = alb;
  // a fill from below (opt-in: a concert's stage light bounced off its decks onto the birds over it), falling off with
  // the distance from its source, strongest on the down-facing surfaces
  if (uFill.w > 0.0) { float kf = uFill.w * exp(-length(P - uFillPos.xyz) / max(uFillPos.w, 1.0)); s.emissive += uFill.rgb * alb * kf * (0.3 + 0.7 * clamp(0.5 - 0.5 * s.N.y, 0.0, 1.0)); }
  if (uPartDebug > 0.5) { float h = vPart / 11.0; s.albedo = 0.6 * clamp(abs(fract(h + vec3(0.0, 0.33, 0.67)) * 6.0 - 3.0) - 1.0, 0.0, 1.0) + 0.1; s.emissive = vec3(0.0); }
}
`;

export function birdMaterial(world, B, tex) {
  const C = (B.colors || []).map(c => new T.Color(...lin(c)));
  while (C.length < 8) C.push(new T.Color(0.3, 0.3, 0.3));
  const U = birdUniforms(B);
  const dbg = typeof location !== 'undefined' && new URLSearchParams(location.search).get('birdparts') === '1' ? 1 : 0;
  const uniforms = { uBirds: { value: tex }, uPat: { value: B.pattern || 0 }, uSheen: { value: B.sheen || 0 }, uB0b: { value: U.uB0.value }, uPartDebug: { value: dbg }, uJuv: { value: B.juvenile || 0 }, uFill: { value: new T.Vector4(0, 0, 0, 0) }, uFillPos: { value: new T.Vector4(0, 0, 0, 1) } };
  for (const k of Object.keys(U)) if (k[0] === 'u') uniforms[k] = U[k];
  C.forEach((c, i) => { uniforms['uC' + i] = { value: c }; });
  const m = world.mat({ name: 'bird ' + (B.name || ''), lines: 0, double: true, uniforms, varyings: BIRD_VARY, object: BIRD_VERT, surface: BIRD_SURF });
  m.color.alphaToCoverage = false;
  return m;
}

// ---- poses (CPU) -------------------------------------------------------------------------------------------------
// write one instance's pose into the texture rows. pose: { p, q, scale, wingR: [el, sw, fold, pron], wingL, handR,
// handL, bend, tailSpread, tailPitch, tailTwist, headYaw, headPitch, neck, gape, headRoll, crouch, footR: [x,y,z,curl],
// footL, sheen, seed, fade }
export function writePose(data, i, P) {
  const o = i * BIRD_TEX_W * 4;
  const set = (k, a, b, c, d) => { const j = o + k * 4; data[j] = a; data[j + 1] = b; data[j + 2] = c; data[j + 3] = d; };
  set(0, P.p[0], P.p[1], P.p[2], P.scale || 1);
  set(1, P.q[0], P.q[1], P.q[2], P.q[3]);
  set(2, ...P.wingR); set(3, ...P.wingL);
  set(4, P.handR || 0, P.handL || 0, P.bend || 0, P.tailSpread || 0);
  set(5, P.tailPitch || 0, P.tailTwist || 0, P.headYaw || 0, P.headPitch || 0);
  set(6, P.neck || 0, P.gape || 0, P.headRoll || 0, P.crouch || 0);
  set(7, ...P.footR); set(8, ...P.footL);
  set(9, P.sheen || 0, P.seed || 0, P.fade === undefined ? 1 : P.fade, P.neckAngle !== undefined ? P.neckAngle : 0.6);
}
