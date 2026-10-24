// engine/three/charkit/clip.js: charkit clips in the browser (docs/FORMAT.md, schema charkit.clip/0): the same maths as
// charkit/clip.py, line for line, so a clip evaluates alike in Python (the solver, the converters, the checks) and in our
// runtime (charkit/tests/test_clip.py compares the two). Plain script: defines the global CKClip (also under node).
//
//   const clip = await CKClip.load(url)                 // NAME.clip.json (+ its .bin sidecar)
//   const E = await CKClip.evaluator(clip, { character, renderFps })   // async: the solved layer's freshness is a hash
//   const s = E.at(t)                                   // { t, bones: {name: {rotation, scale}}, root, face, material,
//                                                       //   decal, macro, fx: [...], space, preview? }
//
// Quaternions are [x, y, z, w]; vectors plain arrays; the glTF frame (docs/FORMAT.md "Frames and units").

(() => {
  const CKClip = {};
  const SCHEMA = 'charkit.clip/0';
  const CONTACT_DEFAULT = ['hips', ...['left', 'right'].flatMap(s => ['UpperLeg', 'LowerLeg', 'Foot', 'Toes'].map(b => s + b))];
  CKClip.SCHEMA = SCHEMA; CKClip.CONTACT_DEFAULT = CONTACT_DEFAULT;
  // what a clip's bone rotations and root mean (charkit/clip.py SPACES, docs/FORMAT.md "Spaces"): 'charkit-local' (each
  // bone's turn against its parent's from the build's A-pose rest, the root the hips' displacement: the solver, mocap,
  // library motions) or 'humanoid' (the normalized rig's local rotations, the root the hips' position: keyed clips). A
  // clip moving bones or the root must declare one: the evaluator refuses it otherwise, and tags each state with it
  // (look.js ck.applyState converts charkit-local after the layers compose)
  CKClip.SPACES = ['charkit-local', 'humanoid'];
  CKClip.needsSpace = clip => (clip.layers || []).some(L => (L.tracks || []).some(t => t.target.endsWith('.rotation') || t.target === 'root.translation'));
  CKClip.checkSpace = clip => {
    if (CKClip.needsSpace(clip) && !CKClip.SPACES.includes(clip.space))
      throw new Error(`clip ${JSON.stringify(clip.name)}: its bone rotations and root need a declared space ${CKClip.SPACES.join(' | ')}, it has ${JSON.stringify(clip.space)} (docs/FORMAT.md "Spaces")`);
  };

  // ---------------------------------------------------------------------------------------------- quaternions (x, y, z, w)
  const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qinv = q => { const n = Math.max(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3], 1e-300); return [-q[0] / n, -q[1] / n, -q[2] / n, q[3] / n]; };
  const qnorm = q => { const n = Math.max(Math.hypot(q[0], q[1], q[2], q[3]), 1e-300); return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
  const qlog = q0 => {
    let q = qnorm(q0); if (q[3] < 0) q = q.map(x => -x);
    const s = Math.hypot(q[0], q[1], q[2]);
    if (s < 1e-12) return [2 * q[0], 2 * q[1], 2 * q[2]];
    const k = 2 * Math.atan2(s, q[3]) / s; return [q[0] * k, q[1] * k, q[2] * k];
  };
  const qexp = r => {
    const a = Math.hypot(r[0], r[1], r[2]);
    if (a < 1e-12) return qnorm([r[0] / 2, r[1] / 2, r[2] / 2, 1]);
    const s = Math.sin(a / 2) / a; return [r[0] * s, r[1] * s, r[2] * s, Math.cos(a / 2)];
  };
  const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const qslerp = (a0, b0, s) => { const a = qnorm(a0); let b = qnorm(b0); if (dot4(a, b) < 0) b = b.map(x => -x);
    const r = qlog(qmul(qinv(a), b)); return qnorm(qmul(a, qexp([r[0] * s, r[1] * s, r[2] * s]))); };
  Object.assign(CKClip, { qmul, qinv, qnorm, qlog, qexp, qslerp });

  // ---------------------------------------------------------------------------------------------- curves and samples
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const scale = (a, k) => a.map(x => x * k);
  const norm = a => Math.hypot(...a);

  function tangents(t, v, modesIn, modesOut, ease) {             // keykit's (charkit/clip.py _hermite_tangents)
    const n = t.length, dim = v[0].length, zero = () => new Array(dim).fill(0);
    const mIn = v.map(zero), mOut = v.map(zero);
    if (n < 2) return [mIn, mOut];
    const h = [], d = [];
    for (let i = 0; i < n - 1; i++) { h.push(t[i + 1] - t[i]); d.push(scale(sub(v[i + 1], v[i]), 1 / h[i])); }
    for (let i = 0; i < n; i++) {
      for (const [side, modes, dst] of [['in', modesIn, mIn], ['out', modesOut, mOut]]) {
        const mode = modes[i]; let m;
        if (mode === 'flat' || mode === 'step') m = zero();
        else if (mode === 'linear') { const j = Math.min(Math.max(side === 'in' ? i - 1 : i, 0), n - 2); m = d[j].slice(); }
        else if (i === 0 || i === n - 1) m = mode === 'auto' ? zero() : d[i === 0 ? 0 : n - 2].slice();
        else {
          const h0 = h[i - 1], h1 = h[i];
          const cr = add(scale(d[i - 1], h1), scale(d[i], h0)).map(x => x / (h0 + h1));
          if (mode === 'spline') { const held = norm(d[i - 1]) < 1e-9 || norm(d[i]) < 1e-9; m = held ? cr.map(() => 0) : cr; }
          else {
            m = cr.slice(); const a = d[i - 1], b = d[i];
            for (let c = 0; c < dim; c++) {
              if (a[c] * b[c] <= 0) m[c] = 0;
              const lim = 3 * Math.min(Math.abs(a[c]), Math.abs(b[c]));
              m[c] = Math.sign(m[c]) * Math.min(Math.abs(m[c]), lim);
            }
          }
        }
        dst[i] = scale(m, ease[i]);
      }
    }
    return [mIn, mOut];
  }

  class Curve {
    constructor(data, rotation = false) {
      const ks = data.keys;
      this.offset = +(data.offset || 0); this.rotation = rotation;
      this.t = ks.map(k => +k.t);
      this.modesIn = ks.map(k => typeof k.in === 'string' ? k.in : (k.tangent || 'auto'));
      this.modesOut = ks.map(k => typeof k.out === 'string' ? k.out : (k.tangent || 'auto'));
      const ease = ks.map(k => (k.ease === undefined ? 1 : +k.ease));
      if (rotation) {
        const q = ks.map(k => qnorm(k.v));
        for (let i = 1; i < q.length; i++) if (dot4(q[i], q[i - 1]) < 0) q[i] = q[i].map(x => -x);
        this.q = q;
        const r = [[0, 0, 0]];
        for (let i = 1; i < q.length; i++) r.push(add(r[i - 1], qlog(qmul(qinv(q[i - 1]), q[i]))));
        this.v = r; this.scalar = false;
      } else {
        this.scalar = ks.every(k => typeof k.v === 'number');
        this.v = ks.map(k => (typeof k.v === 'number' ? [k.v] : k.v.map(Number)));
      }
      [this.mIn, this.mOut] = tangents(this.t, this.v, this.modesIn, this.modesOut, ease);
      this.first = this.t[0] + this.offset;                    // (a channel track is at rest before this)
    }
    _vec(x) {
      const t = this.t, v = this.v, n = t.length;
      if (n === 1 || x <= t[0]) return [0, v[0]];
      if (x >= t[n - 1]) return [n - 1, v[n - 1]];
      let i = 0; while (i < n - 2 && t[i + 1] <= x) i++;
      if (this.modesOut[i] === 'step') return [i, v[i]];
      const h = t[i + 1] - t[i], s = (x - t[i]) / h;
      const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
      return [i, v[i].map((a, c) => h00 * a + h10 * h * this.mOut[i][c] + h01 * v[i + 1][c] + h11 * h * this.mIn[i + 1][c])];
    }
    at(x0) {
      const [i, r] = this._vec(+x0 - this.offset);
      if (this.rotation) return qnorm(qmul(this.q[i], qexp(sub(r, this.v[i]))));
      return this.scalar ? r[0] : r;
    }
  }

  class Samples {
    constructor(data, rotation = false) {
      this.t0 = +(data.t0 || 0); this.fps = +data.fps; this.rotation = rotation; this.first = this.t0;
      const V = data.values; this.shape = V.shape; this.d = V.data;
      this.scalar = V.shape.length === 1; this.dim = this.scalar ? 1 : V.shape[V.shape.length - 1];
      this.n = V.shape[0];
    }
    row(i) { const k = this.dim; if (this.scalar) return this.d[i]; const o = i * k, r = new Array(k); for (let c = 0; c < k; c++) r[c] = this.d[o + c]; return r; }
    at(x) {
      const n = this.n, f = (+x - this.t0) * this.fps;
      const end = i => { const a = this.row(i); return this.rotation ? qnorm(a) : (this.scalar ? a : a.slice()); };
      if (f <= 0 || n === 1) return end(0);
      if (f >= n - 1) return end(n - 1);
      const i = Math.floor(f), s = f - i, a = this.row(i), b = this.row(i + 1);
      if (this.rotation) return qslerp(a, b, s);
      return this.scalar ? a * (1 - s) + b * s : a.map((x, c) => x * (1 - s) + b[c] * s);
    }
  }
  CKClip.Curve = Curve; CKClip.Samples = Samples;
  const evaluatorOf = (data, rotation) => (data.kind === 'curve' ? new Curve(data, rotation) : new Samples(data, rotation));

  CKClip.timeMap = (tm, t) => {
    if (!tm || !tm.length) return +t;
    const n = tm.length;
    if (t <= tm[0][0]) return tm[0][1] + (t - tm[0][0]);
    if (t >= tm[n - 1][0]) return tm[n - 1][1] + (t - tm[n - 1][0]);
    let i = 0; while (i < n - 2 && tm[i + 1][0] <= t) i++;
    const u = tm[i + 1][0] > tm[i][0] ? (t - tm[i][0]) / (tm[i + 1][0] - tm[i][0]) : 0;
    return tm[i][1] + u * (tm[i + 1][1] - tm[i][1]);
  };
  CKClip.timeMapInverse = (tm, ct) => {                         // the first scene time reaching clip time ct
    if (!tm || !tm.length) return +ct;
    const n = tm.length;
    if (ct <= tm[0][1]) return tm[0][0] + (ct - tm[0][1]);
    for (let i = 0; i < n - 1; i++) {
      if (tm[i][1] === ct) return tm[i][0];
      if (tm[i][1] < ct && ct < tm[i + 1][1]) return tm[i][0] + (ct - tm[i][1]) / (tm[i + 1][1] - tm[i][1]) * (tm[i + 1][0] - tm[i][0]);
    }
    return tm[n - 1][0] + (ct - tm[n - 1][1]);
  };
  CKClip.SCENE_CLOCK = ['impactFrames', 'flash'];
  CKClip.stepped = (t, fps, step) => {
    if (!step) return t;
    const on = Math.trunc(step.on || 1), ph = Math.trunc(step.phase || 0);
    const f = Math.floor(t * fps + 1e-9);
    return (Math.floor((f - ph) / on) * on + ph) / fps;
  };

  // ---------------------------------------------------------------------------------------------- hashes (charkit/clip.py layer_stream)
  const enc = new TextEncoder();
  class Bytes { constructor() { this.parts = []; } raw(u8) { this.parts.push(u8); } str(s) { this.parts.push(enc.encode(s || '')); this.parts.push(new Uint8Array([0])); }
    tag(c) { this.parts.push(enc.encode(c)); } u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); this.parts.push(b); }
    f32(xs) { const a = Array.isArray(xs) || ArrayBuffer.isView(xs) ? xs : [xs]; const b = new Uint8Array(4 * a.length); const dv = new DataView(b.buffer);
      for (let i = 0; i < a.length; i++) dv.setFloat32(4 * i, a[i], true); this.parts.push(b); }
    bytes() { const n = this.parts.reduce((s, p) => s + p.length, 0), o = new Uint8Array(n); let k = 0; for (const p of this.parts) { o.set(p, k); k += p.length; } return o; } }
  const canon = x => (Array.isArray(x) ? '[' + x.map(canon).join(',') + ']'
    : x && typeof x === 'object' ? '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}' : JSON.stringify(x));
  CKClip.layerStream = L => {
    const B = new Bytes();
    for (const t of L.tracks || []) {
      B.tag('T'); B.str(t.target);
      const d = t.data;
      if (d && d.kind === 'curve') {
        B.tag('C'); B.f32(d.offset || 0); B.u32(d.keys.length);
        for (const k of d.keys) {
          const v = typeof k.v === 'number' ? [k.v] : k.v;
          B.f32(k.t); B.u32(v.length); B.f32(v); B.str(k.tangent || 'auto'); B.f32(k.ease === undefined ? 1 : k.ease);
          B.str(typeof k.in === 'string' ? k.in : ''); B.str(typeof k.out === 'string' ? k.out : '');
        }
      } else if (d && d.kind === 'samples') {
        B.tag('S'); B.f32(d.t0 || 0); B.f32(d.fps); B.u32(d.values.shape.length); for (const s of d.values.shape) B.u32(s); B.f32(d.values.data);
      } else { B.tag('X'); B.str(canon(d)); }
      B.tag('M'); B.str(t.mask ? canon(t.mask) : '');
      B.tag('W'); B.f32(t.weight === undefined ? 1 : t.weight); B.tag('E');
    }
    return B.bytes();
  };
  const sha256 = async u8 => [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', u8))].map(b => b.toString(16).padStart(2, '0')).join('');
  CKClip.layerHash = L => sha256(CKClip.layerStream(L));
  CKClip.inputsHash = async (clip, kind) => {
    const hs = []; for (const L of clip.layers) if (L.kind === kind && L.enabled !== false) hs.push(await CKClip.layerHash(L));
    return sha256(enc.encode(hs.join('|')));
  };
  CKClip.solvedState = async clip => {
    const S = clip.layers.filter(L => L.kind === 'solved' && L.enabled !== false);
    if (!S.length) return 'absent';
    const sf = S[S.length - 1].solvedFrom || {};
    return sf.base === await CKClip.inputsHash(clip, 'base') && sf.accent === await CKClip.inputsHash(clip, 'accent') ? 'fresh' : 'stale';
  };

  // ---------------------------------------------------------------------------------------------- files
  CKClip.decode = (js, buffers = []) => {
    const dec = x => {
      if (Array.isArray(x)) return x.map(dec);
      if (x && typeof x === 'object') {
        if (x.dtype === 'f32' && x.shape) {
          const n = x.shape.reduce((a, b) => a * b, 1);
          const data = x.data ? Float32Array.from(x.data) : new Float32Array(buffers[x.buffer].slice(x.byteOffset, x.byteOffset + 4 * n));
          return { shape: x.shape, data };
        }
        const o = {}; for (const [k, v] of Object.entries(x)) if (k !== 'buffers') o[k] = dec(v); return o;
      }
      return x;
    };
    return dec(js);
  };
  CKClip.load = async url => {
    const js = await (await fetch(url)).json();
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    const bufs = [];
    for (const b of js.buffers || []) bufs.push(await (await fetch(base + b.uri)).arrayBuffer());
    return CKClip.decode(js, bufs);
  };

  // ---------------------------------------------------------------------------------------------- evaluation
  CKClip.evaluator = async (clip, { character = null, renderFps = null } = {}) => {
    CKClip.checkSpace(clip);
    const fps = +(clip.fps || 30), solved = await CKClip.solvedState(clip);
    const contact = new Set((character && character.contactChains) || CONTACT_DEFAULT);
    const layers = [], warnings = []; let preview = false;
    for (const L of clip.layers) {
      if (L.enabled === false) continue;
      const kind = L.kind;
      if (solved === 'fresh' && (kind === 'base' || kind === 'accent')) continue;
      if (solved !== 'fresh' && kind === 'solved') continue;
      const tr = [];
      for (const t of L.tracks) {
        const tg = t.target;
        if (tg.startsWith('fx:')) { tr.push([t, null]); continue; }
        if (kind === 'accent') {
          const m = Object.assign({}, L.mask || {}, t.mask || {});
          const bone = tg.startsWith('bone:') ? tg.slice(5, tg.lastIndexOf('.')) : (tg === 'root.translation' ? 'hips' : null);
          if (bone && contact.has(bone) && !m.contact) continue;
          preview = true;
        }
        if (t.holds_fps && renderFps && renderFps < t.holds_fps) warnings.push(`${tg}: its holds are guaranteed at ${t.holds_fps} fps; rendering at ${renderFps} can skip one`);
        tr.push([t, evaluatorOf(t.data, tg.endsWith('.rotation'))]);
      }
      layers.push([L, tr]);
    }
    const ID = [0, 0, 0, 1];
    // atClip(ct, sceneT): the state at clip time ct (scene-clock FX read sceneT, default ct); at(sceneT) maps first
    const atClip = (ct, sceneT = ct) => {
      const t = +ct;
      const bones = {}; let root = null;
      const ch = { face: {}, material: {}, decal: {}, macro: {} }; const fx = [];
      for (const [L, tracks] of layers) {
        const tl = CKClip.stepped(t, fps, L.step), lw = L.weight === undefined ? 1 : +L.weight, kind = L.kind;
        for (const [tr, ev] of tracks) {
          const tg = tr.target, w = lw * (tr.weight === undefined ? 1 : +tr.weight);
          if (!ev) {
            const evs = Array.isArray(tr.data) ? tr.data : (tr.data.events || []);
            for (const e of evs) {
              const scene = (e.clock || (CKClip.SCENE_CLOCK.includes(e.kind) ? 'scene' : 'clip')) === 'scene';
              const local = scene ? +sceneT - CKClip.timeMapInverse(clip.timeMap, e.t) : tl - e.t;
              if (local >= 0 && local < (e.dur || 0)) fx.push(Object.assign({}, e, { id: tg.slice(3), local }));
            }
            continue;
          }
          const v = ev.at(tl);
          if (tg === 'root.translation') root = (root === null || kind === 'base' || kind === 'solved') ? v.map(x => x * w) : root.map((x, i) => x + v[i] * w);
          else if (tg.startsWith('bone:')) {
            const k = tg.lastIndexOf('.'), name = tg.slice(5, k), prop = tg.slice(k + 1);
            const b = bones[name] || (bones[name] = {});
            if (prop === 'rotation') {
              if (kind === 'base' || kind === 'solved') b.rotation = w < 1 ? qslerp(b.rotation || ID, v, w) : v;
              else if (kind === 'accent') b.rotation = qslerp(b.rotation || ID, v, w);
              else b.rotation = qnorm(qmul(b.rotation || ID, qslerp(ID, v, w)));
            } else { const s0 = b.scale || [1, 1, 1]; b.scale = v.map((x, i) => x * w + (1 - w) * s0[i]); }
          } else {
            if (tl < ev.first - 1e-9) continue;                   // (a channel before its first key: at rest, 0)
            const i = tg.indexOf(':'), group = tg.slice(0, i), name = tg.slice(i + 1);
            ch[group][name] = (ch[group][name] || 0) + v * w;
          }
        }
      }
      const out = Object.assign({ t, bones, root }, ch, { fx, space: clip.space === undefined ? null : clip.space });
      if (preview) out.preview = 'additive';
      return out;
    };
    const at = sceneT => atClip(CKClip.timeMap(clip.timeMap, +sceneT), +sceneT);
    return { at, atClip, clip, solved, warnings, preview };
  };

  // ---------------------------------------------------------------------------------------------- CHARKIT_channels (charkit/channels.py)
  // a clip state's macro channels played as the table's named points (CHARKIT_channels.points): each point's face and
  // material values added at the macro's weight (a flat {channel: v} point reads as face channels); macros naming no
  // point stay macros (charkit/channels.py expand_points, the same sums)
  CKClip.expandPoints = (st, table) => {
    const P = (table && table.points) || {}, face = { ...(st.face || {}) }, material = { ...(st.material || {}) }, rest = {};
    for (const [name, w] of Object.entries(st.macro || {})) {
      const p = P[name];
      if (!p) { rest[name] = w; continue; }
      const f = ('face' in p || 'material' in p) ? (p.face || {}) : p;
      for (const [c, v] of Object.entries(f)) face[c] = (face[c] || 0) + w * +v;
      for (const [c, v] of Object.entries(p.material || {})) material[c] = (material[c] || 0) + w * +v;
    }
    return Object.assign({}, st, { face, material, macro: rest });
  };
  const lerpMap = (m, v) => {
    if (v <= m[0][0]) return +m[0][1];
    if (v >= m[m.length - 1][0]) return +m[m.length - 1][1];
    for (let i = 0; i < m.length - 1; i++) {
      const [a, wa] = m[i], [b, wb] = m[i + 1];
      if (a <= v && v <= b) return wa + (wb - wa) * (b > a ? (v - a) / (b - a) : 0);
    }
    return +m[m.length - 1][1];
  };
  CKClip.OPENING = ['jaw', 'lower_down', 'upper_raise', 'tongue', 'tongue_out'];
  CKClip.faceFromMouth = (block, group = 'mouth') => {                 // CHARKIT_look.root.mouth -> the channel table
    const chans = block.channels, keys = block.channel_keys, pts = block.points, end = (k, c) => +pts[k][c];
    const face = {};
    for (const [c, [lo, hi]] of Object.entries(chans)) {
      const ks = [];
      if (c === 'smile') {
        const sp = keys.smile, sn = keys.smile_n, fr = keys.frown;
        ks.push({ key: sp, map: [[0, 0], [end(sp, 'smile'), 1]] });
        if (sn && fr) { const n1 = end(sn, 'smile'), f1 = end(fr, 'smile');
          ks.push({ key: sn, map: [[f1, 0], [n1, 1], [0, 0]] }); ks.push({ key: fr, map: [[f1, 1], [n1, 0]] }); }
      } else {
        const k = keys[c]; ks.push({ key: k, map: [[0, 0], [end(k, c), 1]] });
        if (keys[c + '_n']) { const kn = keys[c + '_n']; ks.push({ key: kn, map: [[end(kn, c), 1], [0, 0]] }); }
      }
      face[`${group}.${c}`] = { keys: ks, range: [+lo, +hi], rest: 0, group };
    }
    const rules = block.closure_overrides ? [{ kind: 'scale', by: `${group}.closure`, op: 'one_minus', keys: CKClip.OPENING.filter(c => keys[c]).map(c => keys[c]) }] : [];
    if (block.tuck_shuts && keys.jaw) rules.push({ kind: 'scale', by: `${group}.tuck`, op: 'one_minus', k: +block.tuck_shuts, keys: [keys.jaw] });
    const points = {};
    for (const [p, vals] of Object.entries(pts)) { const f = {}; for (const [c, v] of Object.entries(vals)) f[`${group}.${c}`] = +v; points[p] = { face: f }; }
    return { face, points, rules };
  };
  CKClip.channelWeights = (table, values) => {                         // face channel values -> morph key weights
    const w = {};
    for (const [name, ch] of Object.entries(table.face)) {
      let v = values[name] === undefined ? (ch.rest || 0) : +values[name];
      const side = name.slice(-2), base = (side === '.L' || side === '.R') ? name.slice(0, -2) : null;
      if (base && !(base in table.face) && values[base] !== undefined) v += +values[base];   // the symmetric driver
      for (const k of ch.keys) w[k.key] = (w[k.key] || 0) + (Array.isArray(k.map) ? lerpMap(k.map, v) : v);
    }
    for (const r of table.rules || []) if (r.kind === 'scale') {
      let s = (Array.isArray(r.by) ? r.by : [r.by]).reduce((a, b) => a + +(values[b] || 0), 0) * (r.k === undefined ? 1 : +r.k);
      if (r.clamp) s = Math.min(1, Math.max(0, s));                   // (the lids' closures: by lists the eye's blinks)
      const f = r.op === 'one_minus' ? 1 - s : s;
      for (const k of r.keys) if (k in w) w[k] *= f;
    }
    for (const k of Object.keys(w)) if (!(w[k] > 1e-6)) delete w[k];
    return w;
  };

  globalThis.CKClip = CKClip;
})();
