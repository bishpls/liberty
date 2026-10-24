// liberty/src/stage/fx.js: the renderers every effect draws through (style.md §6). Each frame the effects (pyro.js,
// guns.js) evaluate their particles as pure functions of t and push them here; end() uploads the live ones.
//   sparks  streaks along their velocity (one frame's travel, E9: 2-5 px dots and 10-40 px streaks), a white-yellow
//           core cooling to orange, additive, blooming (C10)
//   fire    flat-toned lumps (E1: 4-6 tones in one hue ramp, white-hot core -> yellow -> orange -> red -> brown, the hue
//           falling as the saturation rises; E2: scalloped edges, a lighter inner shape on the hot side), cut out, so
//           they read as painted shapes; a soft glow under them for the bloom
//   smoke   lobes in the scene's light (the toon ramp's cel split on each puff, E2; the ink's outline, E5), eroding
//           away by a noise threshold as they age (they break into smaller lobes rather than fading)
//   rings   a blast's shock front (E7): a thin bright line where the expanding sphere's edge is seen
import { smat } from './mats.js';

const T = window.THREE;

// the fire ramp (E1; the 50/51 frames' yellow-orange family): heat 1 -> 0
export const FIRE_GLSL = /* glsl */`
vec3 fireTone(float h) {
  // five flat steps; the brightest blooms
  if (h > 0.86) return vec3(4.2, 3.9, 3.2);          // white-hot core (50 deg, .10, 1.0)
  if (h > 0.66) return vec3(3.1, 2.15, 0.62);        // yellow (48 deg, .55, 1.0)
  if (h > 0.44) return vec3(2.2, 0.92, 0.2);         // orange (32 deg, .78, .98)
  if (h > 0.22) return vec3(1.05, 0.26, 0.06);       // red-orange (16 deg, .85, .88)
  return vec3(0.22, 0.07, 0.03);                     // brown-red shade (8 deg, .70, .45)
}
// a smooth value noise (bilinear with a smoothstep fade: rounded contours at any scale, no cells)
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y); }`;

function quadGeo() {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setAttribute('normal', new T.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new T.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
  g.setAttribute('aSeed', new T.Float32BufferAttribute([0, 0, 0, 0], 1));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
// ---- the show's light in the smoke. A lobe is opaque (the cel smoke's bold shape and ink), so the light a beam or a
// laser scatters inside it is drawn on it: along the eye's chord through the lobe's sphere, the cone's light at four
// points (inverse square from its apex, its soft edge, cut where it lands) or the laser's core and glow by the chord's
// distance from its line, each times a Henyey-Greenstein phase (g 0.35, smoke's forward lobe), times sigma (1/m); the
// sum's luminance in flat cel bands, each 'ratio' brighter (a staircase from t1), its colour kept. Which beams and
// lasers cross which lobe: installScatter (the CPU, after the stage's own frame update), up to four a lobe, in a
// 5-texel-a-row table (a beam: apex+len, axis+cosO, colour+cosI, landing plane, halo share+tan; a laser: a, marker 2,
// colour, b)
const SCAT_GLSL = /* glsl */`
float scatHG(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
float segDist(vec3 p0, vec3 p1, vec3 q0, vec3 q1, out float sOut) {
  vec3 d1 = p1 - p0, d2 = q1 - q0, r = p0 - q0;
  float a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), s = 0.0, t = 0.0;
  if (a < 1e-8) t = clamp(f / max(e, 1e-8), 0.0, 1.0);
  else {
    float c = dot(d1, r);
    if (e < 1e-8) s = clamp(-c / a, 0.0, 1.0);
    else {
      float b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-8 ? clamp((b * f - c * e) / den, 0.0, 1.0) : 0.0;
      t = (b * s + f) / e;
      if (t < 0.0) { t = 0.0; s = clamp(-c / a, 0.0, 1.0); } else if (t > 1.0) { t = 1.0; s = clamp((b - c) / a, 0.0, 1.0); }
    }
  }
  sOut = s;
  return length(p0 + d1 * s - q0 - d2 * t);
}
vec4 smokeScatter(vec3 P, vec3 V, vec4 C, vec4 Ls, float nz) {
  vec3 rd = -V, oc = P - C.xyz; float R = C.w;
  float b = dot(oc, rd), cc = dot(oc, oc) - R * R, disc = b * b - cc;
  float t1 = disc > 0.0 ? clamp(-b + sqrt(disc), 0.05 * R, 2.0 * R) : 0.3 * R;
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    float id = k == 0 ? Ls.x : k == 1 ? Ls.y : k == 2 ? Ls.z : Ls.w;
    if (id < 0.0) break;
    int row = int(id + 0.5);
    vec4 ta = texelFetch(uSmokeL, ivec2(0, row), 0), td = texelFetch(uSmokeL, ivec2(1, row), 0);
    vec4 tc = texelFetch(uSmokeL, ivec2(2, row), 0), tf = texelFetch(uSmokeL, ivec2(3, row), 0), th = texelFetch(uSmokeL, ivec2(4, row), 0);
    if (td.w > 1.5) {
      // a laser: its core and glow on the cloud by the eye's chord's distance from its line
      float su; float dd = segDist(P, P + rd * t1, ta.xyz, tf.xyz, su);
      vec3 ld = normalize(tf.xyz - ta.xyz);
      float ph = 0.5 * (scatHG(dot(ld, V), uScat.y) + scatHG(-dot(ld, V), uScat.y)) * 12.566;
      // (attenuated by the smoke in front of where it passes: the depth along the chord of its closest approach)
      float sx = su * t1;
      acc += tc.rgb * uScatW.w * (exp(-pow(dd / uScatW.x, 2.0)) + 0.3 * exp(-pow(dd / (uScatW.x * 4.0), 2.0))) * ph * exp(-uScat.x * 0.5 * sx);
    } else {
      // a beam: single scattering along the chord in four slabs, each the light at its middle times its own share
      // (1 - e^-sigma ds) and what the slabs in front of it let through (e^-sigma s): a thick cloud lit by a beam reads
      // as a matte surface would, a narrow beam crossing it as a band at the depth it crosses
      float ds = t1 * 0.25, sh = 1.0 - exp(-uScat.x * ds);
      for (int j = 0; j < 4; j++) {
        float sj = ds * (float(j) + 0.5);
        vec3 q = P + rd * sj, w = q - ta.xyz; float dl = length(w); vec3 wd = w / max(dl, 1e-4);
        float cone = smoothstep(td.w, tc.w, dot(wd, td.xyz));
        // (and its halo: the light the haze scatters again round the shaft, the engine's gaussian tube that widens
        // with the distance at the halo's angle: smoke near a beam takes its colour, softer)
        float ta2 = dot(w, td.xyz), rp = length(w - td.xyz * ta2), hr = max(ta2, 0.0) * th.y + 0.05;
        cone = max(cone, th.x * 0.5 * exp(-(rp * rp) / (hr * hr))) * step(dl, ta.w) * step(tf.w - 0.05, dot(tf.xyz, q));
        acc += tc.rgb * cone * 100.0 / max(dl * dl, 0.25) * scatHG(dot(wd, V), uScat.y) * 12.566 * sh * exp(-uScat.x * (sj - 0.5 * ds)) * uScatW.z;
      }
    }
  }
  // flat cel bands: the luminance on a staircase of steps 'ratio' apart from t1 (anti-aliased at each step), its colour kept
  vec3 sc = acc * (0.85 + 0.3 * nz);
  float l = dot(sc, vec3(0.2126, 0.7152, 0.0722));
  float x = log(max(l, 1e-6) / uScat.z) / log(uScat.w), fw = max(fwidth(x), 1e-4), kk = floor(x), f = x - kk;
  float on = smoothstep(-fw, 0.0, x), lq = uScat.z * pow(uScat.w, max(kk, 0.0) + smoothstep(1.0 - fw, 1.0, f) * step(0.0, kk));
  return vec4(sc / max(l, 1e-6) * lq, on);
}`;
function installScatter(world, pool, SC) {
  const S = world.stage;
  if (!SC.on || !S || !S.meshes) return;
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const rowOf = new Map();
  SC.stats = { lobes: 0, lit: 0, rows: 0, ms: 0 };
  world.late.push(() => {
    const t0 = performance.now(), n = pool.n, P = pool.A.iP.array, E = pool.A.iS.array, IL = pool.A.iL.array, D = SC.data;
    const bg = S.meshes.beams.geometry, nb = S.meshes.beams.visible ? bg.instanceCount : 0, BA = bg.attributes;
    const lg = S.meshes.lasers.geometry, nl = S.meshes.lasers.visible ? lg.instanceCount : 0, LA = lg.attributes;
    const iA = BA.iA.array, iD = BA.iD.array, iC = BA.iC.array, iF = BA.iF.array, iSs = BA.iS.array, p0 = LA.iP0.array, p1 = LA.iP1.array, lc = LA.iCol.array;
    rowOf.clear(); let rows = 0, lit = 0;
    const row = key => { let r = rowOf.get(key); if (r !== undefined) return r; if (rows >= SC.rows) return -1; r = rows++; rowOf.set(key, r); return r; };
    // the beams' and lasers' hits on a sphere: [score, key] for those that cross it
    const hits = (cx, cy, cz, R, onlyB, onlyL) => {
      const out = [];
      for (const j of onlyB || range(nb)) {
        const o = j * 4, ax = iA[o], ay = iA[o + 1], az = iA[o + 2], len = iA[o + 3], dx = iD[o], dy = iD[o + 1], dz = iD[o + 2], co = iD[o + 3];
        const wx = cx - ax, wy = cy - ay, wz = cz - az, t = wx * dx + wy * dy + wz * dz;
        if (!(t >= -R && t <= len + R)) continue;                  // (a NaN in a beam's data fails here too)
        const px = wx - t * dx, py = wy - t * dy, pz = wz - t * dz, perp = Math.hypot(px, py, pz), tanO = Math.sqrt(Math.max(1 - co * co, 1e-6)) / Math.max(co, 1e-3);
        const tanH = iSs[o + 1] > 0 ? 2.0 * iSs[o + 2] : 0;                // (out to two of its halo's half-widths)
        if (perp > Math.max(t, 0) * Math.max(tanO, tanH) + R / Math.max(co, 0.05)) continue;
        if (iF[o] * cx + iF[o + 1] * cy + iF[o + 2] * cz - iF[o + 3] < -R) continue;
        out.push([lum(iC[o], iC[o + 1], iC[o + 2]) * 100 / Math.max(t * t, 1), j]);
      }
      for (const k of onlyL || range(nl)) {
        const o = k * 4, ax = p0[o], ay = p0[o + 1], az = p0[o + 2], ex = p1[o] - ax, ey = p1[o + 1] - ay, ez = p1[o + 2] - az;
        const ee = ex * ex + ey * ey + ez * ez, u = ee > 0 ? Math.min(1, Math.max(0, ((cx - ax) * ex + (cy - ay) * ey + (cz - az) * ez) / ee)) : 0;
        const d = Math.hypot(ax + ex * u - cx, ay + ey * u - cy, az + ez * u - cz);
        if (!(d <= R + SC.wg * 2)) continue;                         // (a laser with a NaN end, the outro's beacon: skipped)
        out.push([lum(lc[o], lc[o + 1], lc[o + 2]) * 10, ~k]);
      }
      return out;
    };
    // the clouds: consecutive lobes within 5 m of the running one's centre (a gun's ball, a mortar's puff)
    let i = 0;
    while (i < n) {
      let cx = P[i * 4], cy = P[i * 4 + 1], cz = P[i * 4 + 2], R = P[i * 4 + 3], j = i + 1;
      while (j < n && Math.hypot(P[j * 4] - cx, P[j * 4 + 1] - cy, P[j * 4 + 2] - cz) < 5) j++;
      let mx = -1e9; for (let q = i; q < j; q++) mx = Math.max(mx, Math.hypot(P[q * 4] - cx, P[q * 4 + 1] - cy, P[q * 4 + 2] - cz) + P[q * 4 + 3] * 1.1);
      const cand = hits(cx, cy, cz, mx), cb = cand.filter(h => h[1] >= 0).map(h => h[1]), cl = cand.filter(h => h[1] < 0).map(h => ~h[1]);
      for (let q = i; q < j; q++) {
        let list = cand.length ? hits(P[q * 4], P[q * 4 + 1], P[q * 4 + 2], P[q * 4 + 3] * 1.08 * (1 - 0.45 * E[q * 4 + 2]), cb, cl) : [];
        list.sort((a, b) => b[0] - a[0]);
        const ids = [-1, -1, -1, -1];
        for (let m = 0; m < Math.min(4, list.length); m++) {
          const key = list[m][1], r = row(key); if (r < 0) break; ids[m] = r;
          const o = r * 20;
          if (key >= 0) { const b = key * 4; D.set([iA[b], iA[b + 1], iA[b + 2], iA[b + 3], iD[b], iD[b + 1], iD[b + 2], iD[b + 3], iC[b], iC[b + 1], iC[b + 2], iC[b + 3], iF[b], iF[b + 1], iF[b + 2], iF[b + 3], iSs[b + 1], iSs[b + 2], 0, 0], o); }
          else { const b = ~key * 4; D.set([p0[b], p0[b + 1], p0[b + 2], 0, 0, 0, 0, 2, lc[b], lc[b + 1], lc[b + 2], 0, p1[b], p1[b + 1], p1[b + 2], 0, 0, 0, 0, 0], o); }
        }
        if (ids[0] >= 0) lit++;
        IL.set(ids, q * 4);
      }
      i = j;
    }
    pool.A.iL.needsUpdate = true; pool.A.iL.clearUpdateRanges && pool.A.iL.clearUpdateRanges(); pool.A.iL.addUpdateRange(0, Math.max(1, n) * 4);
    if (rows) SC.tex.needsUpdate = true;
    SC.stats = { lobes: n, lit, rows, ms: +(performance.now() - t0).toFixed(3) };
  });
}
const range = n => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = i; return a; };
// a unit sphere, fine enough for a lobe's puffs (its vertex shader pushes it out to them): an icosphere welded
// (detail d: 20 (d + 1)^2 triangles; ?smokeform=v0 the first cut's coarse one)
function lobeGeo(detail = 2) {
  let g = new T.IcosahedronGeometry(1, detail);
  if (detail > 2) {
    // (weld: the polyhedron comes unindexed, three vertices a triangle)
    const p = g.attributes.position.array, map = new Map(), pos = [], idx = [];
    for (let i = 0; i < p.length / 3; i++) {
      const k = `${Math.round(p[i * 3] * 1e5)},${Math.round(p[i * 3 + 1] * 1e5)},${Math.round(p[i * 3 + 2] * 1e5)}`;
      let j = map.get(k); if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); }
      idx.push(j);
    }
    g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  }
  const n = g.attributes.position.count;
  g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(n), 1));
  return g;
}
// The smoke's form (the director, 2026-10-24: "the quality / detail of the smoke clouds themselves"; "more cartoony"):
// billows on billows, the anime pyro and smoke standard (refs: style 30, 45, 46, 56, 58, 59; board/stage/smoke3.html).
// A lobe is a core with medium puffs on it and small puffs on those: the surface along each direction from its centre
// is the farthest puff that direction meets (a union of spheres, so its outline is scalloped and its creases sharp, and
// the ink draws in the creases), and each point takes its own puff's normal, so every puff has its own lit and shade
// cels. 24 sets of puffs, each lobe one of them turned by its seed: no two alike.
// As a lobe ages its small puffs shrink and its downwind side draws out into a tail; the erosion's noise is streaked
// along the wind, so the edges go to wisps.
export const PUFF = { variants: 24, med: 6, small: 9, k: 0.035 };
// the sets of puffs: [{ P: [[x, y, z, r], ...] (medium first), core }], each scaled so its mean reach is 0.92 (its
// puffs' crowns reach ~1.1: the lobe keeps about the size the effect gave it)
export function puffSets() {
  let st = 20241024; const rnd = () => { st = (st * 16807) % 2147483647; return st / 2147483647; };
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const out = [];
  for (let v = 0; v < PUFF.variants; v++) {
    const P = [];
    for (let i = 0; i < PUFF.med; i++) {
      // round the core on a jittered spiral, more and bigger on top (a billow builds upward)
      const y = 1 - 2 * (i + 0.5 + 0.5 * (rnd() - 0.5)) / PUFF.med, ry = Math.sqrt(Math.max(0, 1 - y * y)), ph = i * 2.39996 + rnd() * 1.2;
      const d = nrm([ry * Math.cos(ph), y + 0.25, ry * Math.sin(ph)]), R = (0.34 + 0.2 * rnd()) * (1 + 0.15 * Math.max(0, d[1])), dist = 0.42 + 0.16 * rnd();
      P.push([d[0] * dist, d[1] * dist, d[2] * dist, R]);
    }
    for (let i = 0; i < PUFF.small; i++) {
      const m = P[Math.floor(rnd() * PUFF.med)], md = nrm(m);
      const d = nrm([md[0] + (rnd() - 0.5) * 1.7, md[1] + (rnd() - 0.5) * 1.7 + 0.25, md[2] + (rnd() - 0.5) * 1.7]);
      const R = 0.15 + 0.11 * rnd(), off = m[3] - 0.3 * R;
      P.push([m[0] + d[0] * off, m[1] + d[1] * off, m[2] + d[2] * off, R]);
    }
    const c0 = 0.6; let sum = 0;
    for (let k = 0; k < 400; k++) { const y = 1 - 2 * (k + 0.5) / 400, ry = Math.sqrt(1 - y * y), ph = k * 2.39996; sum += shapeAt(P, c0, [ry * Math.cos(ph), y, ry * Math.sin(ph)], 0)[0]; }
    const sc = 0.92 * 400 / sum;
    out.push({ P: P.map(p => p.map(q => q * sc)), core: c0 * sc });
  }
  return out;
}
// the surface along a unit direction o: the soft union (log-sum-exp over PUFF.k) of the core and the puffs, its
// normal the same blend of theirs; age 0..1 shrinks the small puffs by half and swells the medium a little
function shapeAt(P, core, o, age) {
  const k = PUFF.k, hits = [];
  let tmax = core;
  P.forEach((p, i) => {
    const R = p[3] * (i >= PUFF.med ? 1 - 0.5 * age : 1 + 0.06 * age), b = o[0] * p[0] + o[1] * p[1] + o[2] * p[2], d = R * R - (p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - b * b);
    if (d > 0) { const t = b + Math.sqrt(d); hits.push([t, p]); tmax = Math.max(tmax, t); }
  });
  let S = Math.exp((core - tmax) / k), n = [o[0] * S, o[1] * S, o[2] * S];
  for (const [t, p] of hits) {
    const w = Math.exp((t - tmax) / k), q = [o[0] * t - p[0], o[1] * t - p[1], o[2] * t - p[2]], l = Math.hypot(q[0], q[1], q[2]) || 1;
    S += w; n[0] += w * q[0] / l; n[1] += w * q[1] / l; n[2] += w * q[2] / l;
  }
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [tmax + k * Math.log(S), n[0] / l, n[1] / l, n[2] / l];
}
// a mesh's shapes: for each set, at age 0 and 1, every vertex's reach and normal (rows 2v and 2v + 1; the vertex
// shader reads its own by gl_VertexID, so a lobe costs a lookup, not a loop over its puffs). The normal leans
// toward the medium puffs' own (SHADE_MED): the cels follow the big masses, the small puffs scallop the outline
// (the refs' interiors are a few bold shapes, not a crescent on every bump)
const SHADE_MED = 0.6;
function shapeTex(geo, sets) {
  const pos = geo.attributes.position.array, nv = pos.length / 3, data = new Float32Array(nv * sets.length * 2 * 4);
  sets.forEach((st, v) => {
    for (let a = 0; a < 2; a++) for (let i = 0; i < nv; i++) {
      const o = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], l = Math.hypot(o[0], o[1], o[2]) || 1;
      const u = [o[0] / l, o[1] / l, o[2] / l], all = shapeAt(st.P, st.core, u, a), med = shapeAt(st.P.slice(0, PUFF.med), st.core, u, a);
      const n = [0, 1, 2].map(j => (1 - SHADE_MED) * all[j + 1] + SHADE_MED * med[j + 1]), nl = Math.hypot(...n) || 1;
      data.set([all[0], n[0] / nl, n[1] / nl, n[2] / nl], ((v * 2 + a) * nv + i) * 4);
    }
  });
  const tex = new T.DataTexture(data, nv, sets.length * 2, T.RGBAFormat, T.FloatType); tex.needsUpdate = true;
  tex.minFilter = tex.magFilter = T.NearestFilter;
  return tex;
}
function pool(world, geo, mat, max, attrs, name, flags) {
  const ig = new T.InstancedBufferGeometry();
  ig.index = geo.index; for (const k of Object.keys(geo.attributes)) ig.setAttribute(k, geo.attributes[k]);
  const A = {};
  for (const [k, n] of Object.entries(attrs)) { A[k] = new T.InstancedBufferAttribute(new Float32Array(max * n), n); A[k].setUsage(T.DynamicDrawUsage); ig.setAttribute(k, A[k]); }
  ig.instanceCount = 0;
  const m = world.mesh(ig, mat, Object.assign({ name, frustum: false }, flags));
  m.userData.loose = 'an effect: fire, sparks or smoke';
  return { m, ig, A, max, n: 0 };
}

// an unlit effect material (the transparent pass and the water's reflection only): the emissive effects skip the scene's
// lighting entirely (as the engine's own beams and lasers do); in the reflection pass uClip is the water's plane
function fxMat(world, { name, vertex, fragment, blending = T.AdditiveBlending, depthWrite = false, uniforms = {} }) {
  const U = world.U;
  const mat = new T.ShaderMaterial({
    name, uniforms: Object.assign({ uResolution: U.uResolution, uClip: U.uClip }, uniforms),
    vertexShader: `attribute vec4 iP; attribute vec4 iQ; uniform vec2 uResolution; varying vec2 vUv; varying vec4 vQ; varying vec3 vW;
      ${vertex}`,
    fragmentShader: `uniform vec4 uClip; varying vec2 vUv; varying vec4 vQ; varying vec3 vW;
      ${FIRE_GLSL}
      ${fragment}`,
    transparent: true, depthTest: true, depthWrite, side: T.DoubleSide,
  });
  // additive as the engine's beams add: one-one on colour, the alpha left alone (three's AdditiveBlending scales by alpha)
  if (blending === T.AdditiveBlending) Object.assign(mat, { blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor });
  else mat.blending = blending;
  return { color: mat };
}
// the camera-facing frame of a point (vertex shader)
const BILL = `vec3 vd = normalize(cameraPosition - c), rt = normalize(cross(vec3(0.0, 1.0, 0.0), vd) + vec3(1e-5, 0.0, 0.0)), up = cross(vd, rt);`;
const CLIP = `if (dot(vW, uClip.xyz) + uClip.w < 0.0) discard;`;

export function makeFx(world) {
  const qs0 = new URLSearchParams(location.search);
  const NOFIRE = qs0.get('nofire') === '1';     // (?nofire=1: no fire lumps: a measure's reference frame)
  const NOSPARKS = qs0.get('nosparks') === '1'; // (?nosparks=1: no sparks: the reference a spark measure subtracts)
  const MAX = { spark: 20000, fire: 2500, smoke: 2400, ring: 32, glow: 800 };   // (the show's peaks: 15,190 sparks at the drop, 99 glows)
  // a spark's streak is its travel over the shutter (180 degrees at 24 fps: 1/48 s), the same segment in every sub-frame:
  // each sub-frame draws it back and ahead of the spark by its own place in the shutter (host.js's sub-frame tf), so the
  // finals (?spp=8, a sum of display values) and the live page (spp 1) carry one streak, the camera's. (The first pass drew
  // a whole frame's travel behind each sub-frame's spark: about three shutters' worth at spp 8, its ends faded.) ?pyro=v0
  const SHUT_T = (qs0.has('shutter') ? +qs0.get('shutter') : 0.5) / +(qs0.get('fps') || 24), PV0 = qs0.get('pyro') === 'v0';
  const uStreak = { value: new T.Vector2(PV0 ? 0.042 : SHUT_T / 2, PV0 ? 0 : SHUT_T / 2) };
  // ---- sparks: a quad stretched along v over the shutter's travel (above); width a few cm, held >= 1.2 px
  const sparkMat = fxMat(world, { name: 'fx sparks', uniforms: { uStreak },
    vertex: `uniform vec2 uStreak;
      void main() {
        vec3 c = iP.xyz, v = iQ.xyz; float w = iP.w;
        vec3 vd = normalize(cameraPosition - c);
        float L = length(v); vec3 ax = L > 1e-4 ? v / L : vec3(0.0, 1.0, 0.0);
        vec3 side = normalize(cross(ax, vd) + vec3(1e-5));
        // (the pixel's true size from the camera's projection: a long lens far off makes it small)
        vec4 vp = viewMatrix * vec4(c, 1.0);
        float px = 2.0 * max(-vp.z, 0.01) / (max(uResolution.y, 1.0) * projectionMatrix[1][1]);
        float ww = max(w, 1.2 * px);
        vec3 tail = -ax * (L * uStreak.x + ww * 2.0), head = ax * (L * uStreak.y + ww * 0.5);
        vec3 P = c + side * position.x * ww + tail * (0.5 - 0.5 * position.y) + head * (0.5 + 0.5 * position.y);
        vUv = position.xy; vQ = vec4(iQ.w, w / ww, 0.0, 0.0); vW = P;
        gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
      }`,
    fragment: `void main() {
        ${CLIP}
        float h = vQ.x, along = vUv.y * 0.5 + 0.5, across = 1.0 - smoothstep(0.35, 1.0, abs(vUv.x));
        vec3 core = mix(vec3(2.6, 1.55, 0.45), vec3(4.0, 3.6, 2.6), smoothstep(0.55, 0.95, h));   // E9: (52, .65, 1.0) core, (21 deg) tail
        vec3 tailc = mix(vec3(0.9, 0.22, 0.04), vec3(2.2, 0.9, 0.2), h);
        vec3 c = mix(tailc, core, smoothstep(0.2, 0.9, along)) * across * (0.25 + 0.75 * along) * max(pow(vQ.y, 1.2), 0.06);
        gl_FragColor = vec4(c * smoothstep(0.0, 0.15, h), 0.0);
      }` });
  const sparks = pool(world, quadGeo(), sparkMat, MAX.spark, { iP: 4, iQ: 4 }, 'fx sparks', { trans: true, cast: false, id: false, gbuf: false });

  // ---- fire lumps: camera-facing discs, scalloped, flat tones by heat, cut out (written to depth: painted shapes)
  const fireMat = fxMat(world, { name: 'fx fire', blending: T.NormalBlending, depthWrite: true,
    vertex: `void main() {
        vec3 c = iP.xyz; float r = iP.w; ${BILL}
        vec3 P = c + (rt * position.x + up * position.y) * r * 1.25 + vd * r * 0.3;
        vUv = position.xy * 1.25; vQ = iQ; vW = P;
        gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
      }`,
    fragment: `void main() {
        ${CLIP}
        float heat = vQ.x, sd2 = vQ.y, a = vQ.z, lit = vQ.w;
        vec2 q = vUv; float r = length(q), th = atan(q.y, q.x);
        float bumps = 5.0 + floor(fract(sd2 * 7.3) * 4.0);
        float edge = 0.86 + 0.1 * sin(th * bumps + sd2 * 40.0) + 0.05 * sin(th * (bumps * 2.0 + 1.0) - sd2 * 17.0);
        if (r > edge) discard;
        float inner = step(length(q - vec2(0.12 * sin(sd2 * 9.0), -0.22)), edge * 0.62);
        float h = clamp(heat + inner * 0.2 - smoothstep(edge - 0.12, edge, r) * 0.12, 0.0, 1.0);
        // the lump burns out from its rim inward through rounded scallops: a smooth value noise in the lump's own frame
        // (scaled with it, so the same shapes at any distance) against its alpha. (A 6 x 6 cell hash here broke an old
        // lump into 30-50 px squares from 3 m: the integrator's frame scan, B9's flame; board/stage/fire.html)
        float n = 0.65 * vn2(q * 2.6 + sd2 * 31.0) + 0.35 * vn2(q * 5.3 - sd2 * 17.0);
        if (0.8 * n + 0.45 * (1.0 - r / edge) < 1.05 * (1.0 - a)) discard;
        gl_FragColor = vec4(fireTone(h) * lit, 1.0);
      }` });
  const fire = pool(world, quadGeo(), fireMat, MAX.fire, { iP: 4, iQ: 4 }, 'fx fire', { trans: true, cast: false, id: false, gbuf: false });
  // a soft glow under the fire and the flashes (additive): what lights the haze round a flame
  const glowMat = fxMat(world, { name: 'fx glow',
    vertex: `void main() {
        vec3 c = iP.xyz; float r = iP.w; ${BILL}
        vec3 P = c + (rt * position.x + up * position.y) * r;
        vUv = position.xy; vQ = iQ; vW = P;
        gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
      }`,
    fragment: `void main() {
        ${CLIP}
        float r = length(vUv); float g = max(exp(-r * r * 5.5) - 0.0041, 0.0);
        gl_FragColor = vec4(vQ.rgb * g, 0.0);
      }` });
  const glow = pool(world, quadGeo(), glowMat, MAX.glow, { iP: 4, iQ: 4 }, 'fx glow', { trans: true, cast: false, id: false, gbuf: false });

  // ---- smoke lobes: opaque, in the scene's light and ink, eroded by a noise threshold as they age
  const qf = new URLSearchParams(location.search), T0 = qf.get('smoketone'), SFILL = +(qf.get('smokefill') ?? 1);
  // the night's light on smoke (the integrator's note on B4 FIRE, 2026-10-23: unlit after the flash, the 5"/38's ball went
  // one flat dark tone, darker than the sky behind it: a hole; measured, no lamp or spot reaches it 10 m over her stern).
  // Smoke scatters the light round it: at night it takes the sky behind it a little lifted (its shade cel, violet-leaning,
  // E5) and on the side toward the lamps below (the decks, the shore) a warm lit cel; refs (night firings, MOD 45153013/4,
  // 45166047/85): smoke p50 L* +20..+38 over the sky beside it, its interior p90 - p10 31-54. ?smokenight=shade,warm
  const SN = (qf.get('smokenight') || '0.7,0.85').split(',').map(Number), V0 = qf.get('smoke') === 'v0';   // (?smoke=v0: the first cut's smoke, for A/Bs)
  // the show's light scattered in the smoke (the director, 2026-10-24: 'how lasers and such look in fog / smoke'): the
  // beams and lasers that cross a lobe light it along the eye's chord through it (?smokescat=0 off; ?smoke=v0 off)
  const qn = (k, d) => (qf.has(k) ? +qf.get(k) : d);
  const SCAT = { on: V0 || qf.get('smokescat') === '0' ? 0 : 1, sig: qn('scatsig', 2.0), g: qn('scatg', 0.35), t1: qn('scatt1', 0.03), ratio: qn('scatratio', 2.5),
    wc: qn('scatwc', 0.07), lift: qn('scatlift', 0.8), alb: qn('scatalb', 1.0), lasGain: qn('scatlas', 0.6), wg: 0.3, rows: 256 };
  SCAT.data = new Float32Array(5 * SCAT.rows * 4);
  SCAT.tex = new T.DataTexture(SCAT.data, 5, SCAT.rows, T.RGBAFormat, T.FloatType); SCAT.tex.needsUpdate = true;
  SCAT.uOn = { value: SCAT.on * (qf.get('scatdbg') === '1' ? 2 : 1) };     // (a measure turns it off and on: F.scat.uOn)
  // the lobes' puffs (puffSets, shapeTex; ?smokeform=v0: the first cut's lumpy spheres); the wind the tails draw out on (F.setWind)
  const FORM0 = V0 || qf.get('smokeform') === 'v0', SETS = puffSets(), SWIND = { value: new T.Vector4(1, 0, 0, qn('smoketail', 0.55)) };
  const smokeMat = (lod, shape) => smat(world, {
    name: 'fx smoke', lines: 1,
    vertex: /* glsl */`attribute float aSeed; attribute vec4 iP; attribute vec4 iS; attribute vec4 iL;
      uniform sampler2D uShape; uniform vec4 uPuffN; uniform vec4 uSmokeWind;
      // a turn from the lobe's seed (any heading, tipped up to ~35 deg): which way its puffs face
      mat3 seedTurn(float sd) {
        float a = fract(sd * 7.13) * 6.2831853, b = (fract(sd * 13.71) - 0.5) * 1.2, c = (fract(sd * 29.37) - 0.5) * 1.2;
        float ca = cos(a), sa = sin(a), cb = cos(b), sb = sin(b), cc = cos(c), sc = sin(c);
        mat3 Ry = mat3(ca, 0.0, -sa, 0.0, 1.0, 0.0, sa, 0.0, ca), Rx = mat3(1.0, 0.0, 0.0, 0.0, cb, sb, 0.0, -sb, cb), Rz = mat3(cc, sc, 0.0, -sc, cc, 0.0, 0.0, 0.0, 1.0);
        return Ry * Rx * Rz;
      }
      uniform vec2 uLod;
      void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
        vec3 o = position; float r = iP.w, age = iS.z;
        // its level of detail: one pool drawn three times, each mesh the lobes whose radius on screen is in its band
        // (uLod, px); a lobe outside it collapses to a point (no triangles left to draw)
        float vz = max(-(viewMatrix * vec4(iP.xyz, 1.0)).z, 0.05), rpx = r * projectionMatrix[1][1] * uResolution.y * 0.5 / vz;
        if (uClip.w != 1.0 || dot(uClip.xyz, uClip.xyz) > 0.0) rpx = 0.0;     // (the water's reflection: the coarse sphere)
        if (rpx < uLod.x || rpx >= uLod.y) { P = iP.xyz; N = vec3(0.0, 1.0, 0.0); vL = iL; vC = vec4(iP.xyz, 0.0); vSeed = aSeed; vObjN = N; vObjP = o; vS = iS; return; }
        vL = iL; vC = vec4(iP.xyz, r * 1.08 * (1.0 - 0.45 * age));
        // (?smokeform=v0: the first cut's lumpy lobe, the sphere pushed out by a few big bumps its seed turns)
        float bmp = 0.12 * sin(o.x * 3.1 + iS.y * 20.0) * sin(o.y * 2.7 + iS.y * 13.0) * sin(o.z * 2.9 - iS.y * 7.0);
        vec3 q = o * (1.0 + bmp), nq = normalize(o);
        if (uPuffN.w > 0.0) {
          // its set's shape at this vertex, young and old, mixed by its age (shapeTex), turned by its seed
          mat3 R = seedTurn(iS.y);
          int v = int(floor(fract(iS.y * 3.17 + 0.37) * uPuffN.x));
          vec4 A = texelFetch(uShape, ivec2(gl_VertexID, v * 2), 0), B = texelFetch(uShape, ivec2(gl_VertexID, v * 2 + 1), 0);
          vec3 ql = o * mix(A.x, B.x, age), nl = normalize(mix(A.yzw, B.yzw, age));
          q = R * ql; nq = R * nl;
          // its tail: the downwind side drawn out as it ages
          vec3 wd = uSmokeWind.xyz; float down = max(dot(normalize(q), wd), 0.0);
          q += wd * age * uSmokeWind.w * down * down;
        }
        P = iP.xyz + q * r * (1.0 - 0.45 * age);
        N = nq; uv = o.xy; vSeed = aSeed; vObjN = nq; vObjP = q; vS = iS;
      }`,
    varyings: 'varying vec4 vS; flat varying vec4 vL; flat varying vec4 vC;',
    uniforms: { uTones: { value: [
      T0 ? new T.Vector3(...T0.split(',').map(Number)) : V0 ? new T.Vector3(0.115, 0.098, 0.062) : new T.Vector3(0.21, 0.175, 0.11),    // 0 the guns' blanks: olive-tan (G7; a blank's reduced charge smokes paler, show.md)
      new T.Vector3(0.42, 0.42, 0.44),       // 1 flash powder (the mortars): white-grey
      new T.Vector3(0.62, 0.66, 0.70),       // 2 CO2 fog: pale, cool
      new T.Vector3(0.030, 0.024, 0.018),    // 3 unburnt powder, the flash's dark core
      new T.Vector3(0.30, 0.30, 0.31),       // 4 the gerbs' grey
      new T.Vector3(0.16, 0.15, 0.14),       // 5 propane's thin dark wisp
    ] }, uSkyFill: { value: new T.Vector3(0.030, 0.031, 0.052).multiplyScalar(SFILL) },
      uSmokeNight: { value: new T.Vector2(SN[0], SN[1]) }, uSmokeV0: { value: V0 ? 1 : 0 }, uSmokeLit: { value: new T.Vector3(0.3, -1.0, 0.15).normalize() },
      uSmokeL: { value: SCAT.tex }, uScat: { value: new T.Vector4(SCAT.sig, SCAT.g, SCAT.t1, SCAT.ratio) }, uScatW: { value: new T.Vector4(SCAT.wc, SCAT.lift, SCAT.alb, SCAT.lasGain) }, uScatOn: SCAT.uOn,
      uShape: { value: shape }, uPuffN: { value: new T.Vector4(PUFF.variants, 0, 0, FORM0 ? -1 : 1) }, uSmokeWind: SWIND, uLod: { value: new T.Vector2(lod[0], lod[1]) } },
    glsl: 'uniform vec3 uTones[6]; uniform vec3 uSkyFill; uniform vec2 uSmokeNight; uniform vec3 uSmokeLit; uniform float uSmokeV0; uniform sampler2D uSmokeL; uniform vec4 uScat; uniform vec4 uScatW; uniform float uScatOn; uniform vec4 uPuffN; uniform vec4 uSmokeWind; uniform vec2 uLod;' + SCAT_GLSL,
    body: `int k = int(vS.x + 0.5); vec3 c = uTones[0];
      for (int i = 0; i < 6; i++) if (i == k) c = uTones[i];
      // erosion: the lobe breaks into big scallops as it ages (vS.z 0 whole .. 1 gone); vnoise3 is -1..1
      // (streaked along the wind as it ages, so its edges go to wisps: the noise stretched downwind)
      vec3 eP = vObjP; if (uPuffN.w > 0.0) { vec3 wd = uSmokeWind.xyz; eP -= wd * dot(eP, wd) * 0.6 * vS.z; }
      float n = 0.5 + 0.5 * (vnoise3(eP * 1.15 + vS.y * 17.0) * 0.8 + vnoise3(eP * 2.9 - vS.y * 9.0) * 0.2);
      // (the lobe's rim as the eye sees it goes first: scalloped edges, not holes punched through its middle)
      float rimE = (1.0 - abs(dot(vObjN, V))) * (1.0 - uSmokeV0);
      if (n - 0.3 * rimE * vS.z < vS.z * 1.1 - 0.05) discard;
      // the hot glow from inside a fresh blast (vS.w: heat), then the scene's light
      toon(s, c); s.shadeCol = c * vec3(0.55, 0.52, 0.72);       // E1/E5: a violet-leaning shade at night
      s.rough = 1.0; s.rim = 0.4;
      // the night's light on it: the sky behind it (as the eye sees it) lifted and leaning violet, the shade cel; toward
      // the lamps below a warm lit cel, its edge broken by the erosion's noise (two cels and the ink: E2, E5). The flash's
      // dark core (tone 3) keeps the old fill; by day the scene's light does it all
      vec3 vd = -V; vec3 skyB = skyBase(normalize(vec3(vd.x, max(vd.y, 0.03), vd.z)));
      float nk = smoothstep(0.0, 0.6, uNight) * (k == 3 ? 0.0 : 1.0) * (1.0 - uSmokeV0);
      // (the cels split on a light from above and to one side as the eye sees it, the toon convention: whatever the
      // camera, both cels show; the key at night is near the camera's back in some shots, which left one cel in view)
      vec3 Lv = normalize(vec3(0.0, 0.75, 0.0) + 0.45 * normalize(cross(vec3(0.0, 1.0, 0.0), V) + vec3(1e-4)) + 0.25 * V);
      // (each puff its own clean crescent: the terminator barely broken by the noise when the puffs carry the form)
      float lit = smoothstep(-0.07, 0.07, dot(vObjN, Lv) + 0.05 + (uPuffN.w > 0.0 ? 0.15 : 0.5) * (n - 0.5));
      vec3 skyG = mix(skyB, vec3(dot(skyB, vec3(0.2126, 0.7152, 0.0722))), 0.45);       // (the sky's light, half greyed)
      vec3 shadeT = skyG * uSmokeNight.x * vec3(0.98, 0.9, 1.1), litT = shadeT + c * vec3(1.0, 0.86, 0.68) * uSmokeNight.y;
      s.emissive = mix(uSkyFill * (0.6 + 2.5 * dot(c, vec3(0.2126, 0.7152, 0.0722))) * (0.6 + 0.4 * saturate(vObjN.y)), mix(shadeT, litT, lit), nk)
        + vec3(2.4, 1.0, 0.25) * vS.w * (0.6 + 0.4 * n);
      // the show's light in it: the beams and lasers that cross this lobe, scattered along the eye's chord through it,
      // in flat cel bands of their own colours (smokeScatter, SCAT_GLSL)
      // (a cel band laid over the smoke where the light reaches: the light's own hue, as bright as the cloud's tone and
      // brighter by the light's step; the scene's own light under it eased, so the band reads as the light's colour)
      if (uScatOn > 0.5 && vL.x >= 0.0) {
        vec4 sb = smokeScatter(P, V, vC, vL, n);
        float baseL = dot(s.emissive, vec3(0.2126, 0.7152, 0.0722)) + 0.5 * dot(c, vec3(0.2126, 0.7152, 0.0722)) * uSmokeNight.y;
        vec3 hue = sb.rgb / max(dot(sb.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
        // (the band keeps the puffs' two cels: its shade side 0.42 of its lit side, so a lit cloud still reads as billows,
        // not one flat ball of the light's colour; ?smokeform=v0 the first cut's flat band)
        float cel = uPuffN.w > 0.0 ? mix(0.42, 1.0, lit) : 1.0;
        s.emissive = mix(s.emissive, (sb.rgb + hue * baseL * uScatW.y) * cel, sb.a);
        s.albedo *= 1.0 - 0.75 * sb.a; s.shadeCol *= 1.0 - 0.75 * sb.a;
        if (uScatOn > 1.5) s.emissive = vec3(1.0, 0.0, 1.0) * (1.0 - sb.a) + sb.rgb * 10.0;
      } else if (uScatOn > 1.5) s.emissive = vec3(0.0, 0.05, 0.0);`,
  });
  // three levels of detail sharing one pool's instances (the light-in-smoke reads the pool): a lobe 60 px or more in
  // radius on screen the fine sphere, 20-60 px a middling one, under 20 px a coarse one (?smokelod=lo,hi; ?smokedetail=
  // fine,mid,coarse). One fine sphere for every lobe cost 8 ms a frame at the drop's 484 lobes (1080p).
  const LODPX = (qf.get('smokelod') || '20,60').split(',').map(Number), DET = FORM0 ? [2, 2, 2] : (qf.get('smokedetail') || '11,6,3').split(',').map(Number);
  const g0 = lobeGeo(DET[0]);
  const smoke = pool(world, g0, smokeMat(FORM0 ? [0, 1e9] : [LODPX[1], 1e9], FORM0 ? null : shapeTex(g0, SETS)), MAX.smoke, { iP: 4, iS: 4, iL: 4 }, 'fx smoke', { cast: false, id: true });
  smoke.lods = FORM0 ? [] : [[DET[1], [LODPX[0], LODPX[1]]], [DET[2], [0, LODPX[0]]]].map(([d, band]) => {
    const g = lobeGeo(d), ig = new T.InstancedBufferGeometry();
    ig.index = g.index; for (const k of Object.keys(g.attributes)) ig.setAttribute(k, g.attributes[k]);
    for (const [k, a] of Object.entries(smoke.A)) ig.setAttribute(k, a);
    ig.instanceCount = 0;
    const m = world.mesh(ig, smokeMat(band, shapeTex(g, SETS)), { name: 'fx smoke', frustum: false, cast: false, id: true });
    m.userData.loose = 'an effect: fire, sparks or smoke';
    return { m, ig };
  });
  installScatter(world, smoke, SCAT);

  // ---- shock rings (E7): a camera-facing ring line 6-10 px wide with radial hairlines, near the muzzle for 3-5 frames
  // (the front itself is invisible; anime draws its ring small and quick); width in pixels, so it reads at any distance
  const ringMat = fxMat(world, { name: 'fx rings',
    vertex: `void main() {
        vec3 c = iP.xyz; float r = iP.w; ${BILL}
        vec3 P = c + (rt * position.x + up * position.y) * r * 1.5;
        vUv = position.xy * 1.5; vQ = iQ; vW = P;
        gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
      }`,
    fragment: `void main() {
        ${CLIP}
        float r = length(vUv), fw = max(fwidth(r), 1e-4), a = atan(vUv.y, vUv.x);
        float line = 1.0 - smoothstep(3.5 * fw, 4.5 * fw, abs(r - 1.0));
        float k = floor((a / 6.28318 + 0.5) * 14.0), fa = fract((a / 6.28318 + 0.5) * 14.0) - 0.5;
        float hl = 1.12 + 0.25 * fract(sin(k * 12.9898 + vQ.a * 7.0) * 43758.5453);
        float hair = (1.0 - smoothstep(0.8 * fw, 1.7 * fw, abs(fa) * 6.28318 / 14.0 * r)) * step(1.06, r) * step(r, hl);
        gl_FragColor = vec4(vQ.rgb * max(line, hair * 0.8) * vQ.a, 0.0);
      }` });
  const rings = pool(world, quadGeo(), ringMat, MAX.ring, { iP: 4, iQ: 4 }, 'fx rings', { trans: true, cast: false, id: false, gbuf: false });

  const all = { sparks, fire, glow, smoke, rings };
  const F = {
    pools: all, MAX, stats: { sparks: 0, fire: 0, smoke: 0, rings: 0, glow: 0, peak: { sparks: 0, fire: 0, smoke: 0, rings: 0, glow: 0 } },
    begin() {
      for (const p of Object.values(all)) p.n = 0;
      const sub = !PV0 && typeof window !== 'undefined' && window.SCENE && window.SCENE._sub;
      if (sub) uStreak.value.set((sub.tf + 0.5) * SHUT_T, (0.5 - sub.tf) * SHUT_T); else if (!PV0) uStreak.value.set(SHUT_T / 2, SHUT_T / 2);
    },
    spark(p, v, w, heat) { if (NOSPARKS) return; const s = sparks; if (s.n >= s.max) return; const i = s.n++; s.A.iP.array.set([p[0], p[1], p[2], w], i * 4); s.A.iQ.array.set([v[0], v[1], v[2], heat], i * 4); },
    fire(p, r, heat, seed, a = 1, lit = 1) { if (NOFIRE) return; const s = fire; if (s.n >= s.max) return; const i = s.n++; s.A.iP.array.set([p[0], p[1], p[2], r], i * 4); s.A.iQ.array.set([heat, seed, a, lit], i * 4); },
    glow(p, r, c) { const s = glow; if (s.n >= s.max) return; const i = s.n++; s.A.iP.array.set([p[0], p[1], p[2], r], i * 4); s.A.iQ.array.set([c[0], c[1], c[2], 1], i * 4); },
    smoke(p, r, tone, seed, erosion, heat = 0) { const s = smoke; if (s.n >= s.max) return; const i = s.n++; s.A.iP.array.set([p[0], p[1], p[2], r], i * 4); s.A.iS.array.set([tone, seed, erosion, heat], i * 4); },
    ring(p, r, c, a) { const s = rings; if (s.n >= s.max) return; const i = s.n++; s.A.iP.array.set([p[0], p[1], p[2], r], i * 4); s.A.iQ.array.set([c[0], c[1], c[2], a], i * 4); },
    end() {
      for (const [k, p] of Object.entries(all)) {
        for (const a of Object.values(p.A)) { a.needsUpdate = true; a.clearUpdateRanges && a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, p.n) * a.itemSize); }
        p.ig.instanceCount = p.n; p.m.visible = p.n > 0;
        for (const l of p.lods || []) { l.ig.instanceCount = p.n; l.m.visible = p.n > 0; }
        F.stats[k] = p.n; if (p.n > F.stats.peak[k]) F.stats.peak[k] = p.n;
      }
    },
  };
  F.scat = SCAT;
  // the wind the smoke's tails draw out on (index.js: pyro's wind): its direction in the horizontal
  F.setWind = w => { const l = Math.hypot(w[0], w[2]) || 1; SWIND.value.set(w[0] / l, 0, w[2] / l, SWIND.value.w); };
  return F;
}
