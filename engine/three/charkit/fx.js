// engine/three/charkit/fx.js: the 2D FX layer over a look.js frame (docs/FORMAT.md "FX tracks"; ROADMAP "Acting to the
// ZZZ bar", step 3): a clip's FX events (CKClip's state.fx) drawn on the page's Canvas2D after the character is
// composited, anchored to bones projected through the frame's camera. Plain script: defines the global CKFX. Drawn in
// pop.js's register (ink outlines, flat fills, no gradients), self-contained (a ctx in, no globals).
//
//   CKFX.drawBack(ctx, ck, camera, region, state.fx, { fps })                       // before the character
//   CKFX.draw(ctx, ck, camera, region, state.fx, { fps, charCanvas, charRegion })   // after the character is drawn
//   CKFX.project(ck, camera, region, { bone, offset })    // -> [x, y] in canvas px (offset in the bone's frame, m)
//
// The kinds (params, all optional):
//   emote        glyph ('!' | '?' | 'anger' | 'drop'), pop (s: the pop-in's length), scale (x the head's screen size),
//                color: a bubble that pops in with an overshoot and holds, at a head-side anchor
//   sweat        size, slide (px per s): a drop beside the head that slides down
//   speedLines   n, inner (x the region's half-diagonal), color, seed, anchor or the region's centre: radial focus lines,
//                re-seeded on twos (held drawings)
//   impactFrames pattern [{card: 'invert' | 'flash' | 'silhouette' | 'black', hold: frames, color?, bg?}]: whole-frame
//                graphic cards, each held `hold` frames at fps (the trailer's 2s and 3s); 'silhouette' needs charCanvas
//                (the frame's character layer, alpha = coverage)
//   flash        color, peak: a white flash decaying over dur
//   projectile   from ([x, y] in region fractions), size (x the head's screen size), color, spin (turns over dur): a drawn
//                brick flying from `from` to the anchor over dur (eased in), with a white speed trail behind it
//   burst        size (x the head), color, smoke: an impact starburst popping at the anchor, with a black smoke puff
// Smears that re-render the character (multiples) are the caller's (they need the renderer): CKFX.multiples gives the
// sub-frame times, alphas and the parts to draw (params.parts: name substrings, e.g. ['hair']; null: the whole
// character) for an active smear event; CKFX.showOnly(ck, parts) limits a render to those parts.
(() => {
  const CKFX = {};
  const INK = '#1B1418', TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const backOut = k => { const s = 1.70158; k -= 1; return k * k * ((s + 1) * k + s) + 1; };   // overshoot then settle

  // a bone's point (offset in its frame, m) -> canvas px in the region [x, y, w, h] (y from the top)
  CKFX.project = (ck, camera, region, anchor0 = {}) => {
    const T = window.THREE, H = ck.vrm.humanoid, anchor = ck.anchor ? ck.anchor(anchor0) : anchor0;   // ({name}: a named anchor)
    const node = (anchor.bone && (H.getRawBoneNode(anchor.bone) || ck.vrm.scene.getObjectByName(anchor.bone))) || H.getRawBoneNode('head');
    node.updateWorldMatrix(true, false);
    const p = new T.Vector3(...(anchor.offset || [0, 0, 0])).applyMatrix4(node.matrixWorld);
    const c = p.clone().project(camera);
    const [x, y, w, h] = region;
    return [x + (c.x * 0.5 + 0.5) * w, y + (1 - (c.y * 0.5 + 0.5)) * h, c.z];
  };
  // the head's height on screen (px): emotes and sweat scale with it
  const headPx = (ck, camera, region) => {
    const hd = ck.head(), T = window.THREE;
    const a = new T.Vector3(hd.centre.x, hd.centre.y - hd.L / 2, hd.centre.z).project(camera);
    const b = new T.Vector3(hd.centre.x, hd.centre.y + hd.L / 2, hd.centre.z).project(camera);
    return Math.abs(a.y - b.y) * 0.5 * region[3];
  };

  const poly = (ctx, pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  const starPts = (cx, cy, r, ri, n, rot = -Math.PI / 2) => Array.from({ length: n * 2 }, (_, i) => {
    const a = rot + i / (n * 2) * TAU, rr = i % 2 ? ri : r; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
  const shape = (ctx, pts, fill, lw) => { poly(ctx, pts); ctx.fillStyle = fill; ctx.fill(); if (lw) { ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); } };

  function emote(ctx, e, p, hp) {
    const P = e.params || {}, k = clamp(e.local / (P.pop || 0.12)), s = (P.scale || 0.55) * hp * backOut(k);
    if (s <= 0.5) return;
    const lw = Math.max(2, s * 0.06), [x, y] = p;
    ctx.save();
    shape(ctx, starPts(x, y, s * 0.62, s * 0.40, 11, -Math.PI / 2 + 0.2), P.color || '#F2A23A', lw);       // the burst
    shape(ctx, starPts(x, y, s * 0.42, s * 0.30, 9, 0.1), '#E8552E', 0);
    ctx.fillStyle = '#FFFDF7'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
    const g = P.glyph || '!';
    if (g === '!') {                                                     // the bar and the dot
      const bw = s * 0.13;
      poly(ctx, [[x - bw, y - s * 0.30], [x + bw, y - s * 0.30], [x + bw * 0.6, y + s * 0.08], [x - bw * 0.6, y + s * 0.08]]); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y + s * 0.20, bw * 0.85, 0, TAU); ctx.fill(); ctx.stroke();
    } else {
      ctx.font = `900 ${Math.round(s * 0.6)}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const txt = g === 'anger' ? '💢' : g === 'drop' ? '💧' : g;
      ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y);
    }
    ctx.restore();
  }

  function sweat(ctx, e, p, hp) {
    const P = e.params || {}, s = (P.size || 0.18) * hp, [x, y0] = p, y = y0 + (P.slide || 0.25 * hp) * e.local;
    const a = clamp(1 - (e.local - (e.dur || 1) * 0.7) / ((e.dur || 1) * 0.3));
    ctx.save(); ctx.globalAlpha = a;
    const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24 * TAU, r = s * 0.5;
      pts.push([x + Math.sin(t) * r * (0.65 + 0.35 * Math.cos(t)), y + (-Math.cos(t)) * r * 0.9 - (Math.cos(t) > 0 ? s * 0.35 * Math.cos(t) ** 3 : 0)]); }
    shape(ctx, pts, '#BFE9FF', Math.max(1.5, s * 0.08));
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(x - s * 0.12, y + s * 0.05, s * 0.07, s * 0.12, -0.4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function speedLines(ctx, e, region, centre, fps) {
    const P = e.params || {}, [rx, ry, rw, rh] = region, n = P.n || 70, R = Math.hypot(rw, rh) / 2;
    const held = Math.floor(e.local * fps / 2);                         // re-drawn on twos
    const seed = (P.seed || 1) * 1000 + held, rin = (P.inner || 0.42) * R;
    ctx.save(); ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
    ctx.fillStyle = P.color || 'rgba(255,255,255,0.85)';
    for (let i = 0; i < n; i++) {
      const a = (i + hash(seed + i) * 0.8) / n * TAU, w = (0.004 + 0.012 * hash(seed + i * 7)) * TAU, r0 = rin * (0.85 + 0.45 * hash(seed + i * 13));
      const [cx, cy] = centre;
      poly(ctx, [[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a - w) * R * 1.5, cy + Math.sin(a - w) * R * 1.5],
        [cx + Math.cos(a + w) * R * 1.5, cy + Math.sin(a + w) * R * 1.5]]);
      ctx.fill();
    }
    ctx.restore();
  }

  // which card of an impactFrames pattern shows at local time (frames counted at fps), or null after the pattern
  CKFX.cardAt = (pattern, local, fps) => { const r = CKFX.cardInfo(pattern, local, fps); return r && r.card; };
  // the card showing and how many frames into its hold (0 on its first frame)
  CKFX.cardInfo = (pattern, local, fps) => {
    let f = Math.floor(local * fps + 1e-6);
    for (const c of pattern) { if (f < (c.hold || 1)) return { card: c, into: f }; f -= c.hold || 1; }
    return null;
  };
  function impact(ctx, e, region, o) {
    const c = CKFX.cardAt((e.params || {}).pattern || [], e.local, o.fps);
    if (!c) return;
    const [x, y, w, h] = region;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (c.card === 'invert') { ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h); }
    else if (c.card === 'flash') { ctx.fillStyle = c.color || '#ffffff'; ctx.globalAlpha = c.alpha === undefined ? 0.92 : c.alpha; ctx.fillRect(x, y, w, h); }
    else if (c.card === 'black') { ctx.fillStyle = c.color || '#0b0b0b'; ctx.fillRect(x, y, w, h); }
    else if (c.card === 'silhouette' && o.charCanvas) {
      ctx.fillStyle = c.bg || '#F4ECDD'; ctx.fillRect(x, y, w, h);
      const tmp = CKFX._tmp || (CKFX._tmp = document.createElement('canvas'));
      tmp.width = w; tmp.height = h; const t = tmp.getContext('2d');
      const [cx, cy, cw, ch] = o.charRegion || region;
      t.clearRect(0, 0, w, h); t.drawImage(o.charCanvas, cx, cy, cw, ch, 0, 0, w, h);
      t.globalCompositeOperation = 'source-in'; t.fillStyle = c.color || '#C8102E'; t.fillRect(0, 0, w, h); t.globalCompositeOperation = 'source-over';
      ctx.drawImage(tmp, x, y);
    }
    ctx.restore();
  }

  function projectile(ctx, e, region, p, hp) {
    const P = e.params || {}, k = clamp(e.local / (e.dur || 0.3)), u = k * k;           // accelerating in
    const [rx, ry, rw, rh] = region, f = P.from || [1.1, 0.25];
    const x0 = rx + f[0] * rw, y0 = ry + f[1] * rh, x = x0 + (p[0] - x0) * u, y = y0 + (p[1] - y0) * u;
    const s = (P.size || 0.45) * hp, ang = (P.spin === undefined ? 0.6 : P.spin) * TAU * k + Math.atan2(p[1] - y0, p[0] - x0);
    ctx.save();
    const dx = x - x0, dy = y - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, tl = Math.min(L, s * 3.2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';                                   // the trail: a tapered streak behind it
    poly(ctx, [[x + nx * s * 0.32, y + ny * s * 0.32], [x - dx / L * tl, y - dy / L * tl], [x - nx * s * 0.32, y - ny * s * 0.32]]); ctx.fill();
    ctx.translate(x, y); ctx.rotate(ang);
    const w = s, h = s * 0.55, lw = Math.max(2, s * 0.06);
    shape(ctx, [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], P.color || '#8A5A34', lw);
    shape(ctx, [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, -h / 2 + h * 0.28], [-w / 2, -h / 2 + h * 0.28]], '#B07A4C', 0);
    ctx.restore();
  }

  function burst(ctx, e, p, hp) {
    const P = e.params || {}, k = clamp(e.local / 0.08), s = (P.size || 0.9) * hp * (0.6 + 0.5 * backOut(k));
    const fade = clamp(1 - (e.local - (e.dur || 0.3) * 0.6) / ((e.dur || 0.3) * 0.4));
    const [x, y] = p, lw = Math.max(2, s * 0.035);
    ctx.save(); ctx.globalAlpha = fade;
    if (P.smoke !== false) {                                                   // the smoke puff behind, drifting up
      const r = s * 0.28, d = e.local * hp * 0.6;
      [[-0.35, 0.1], [0.05, -0.05], [0.38, 0.12], [0.0, 0.3]].forEach(([ox, oy], i) => {
        ctx.beginPath(); ctx.arc(x + ox * s * 0.7, y + oy * s * 0.6 - d, r * (0.8 + 0.25 * hash(i + 3)), 0, TAU);
        ctx.fillStyle = '#1B1418'; ctx.fill();
      });
    }
    shape(ctx, starPts(x, y, s * 0.55, s * 0.2, 8, -Math.PI / 2 + 0.3), P.color || '#FFD23F', lw);
    shape(ctx, starPts(x, y, s * 0.28, s * 0.12, 8, 0.1), '#FFF6C9', 0);
    ctx.restore();
  }

  function flash(ctx, e, region) {
    const P = e.params || {}, k = (P.peak === undefined ? 1 : P.peak) * clamp(1 - e.local / (e.dur || 0.2));
    if (k <= 0) return;
    ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = P.color || '#ffffff'; ctx.fillRect(...region); ctx.restore();
  }

  // smears by re-rendering: an active 'smear' event with mode 'multiples' -> [{dt, alpha}] (the caller renders the
  // character at t - dt with that alpha, behind the frame); count copies over `length` s, fading
  CKFX.multiples = (fx) => {
    const out = [];
    for (const e of fx || []) {
      if (e.kind !== 'smear' || ((e.params || {}).mode || 'multiples') !== 'multiples') continue;
      const P = e.params || {}, n = P.count || 3, L = P.length || 0.06;
      for (let i = 1; i <= n; i++) out.push({ dt: L * i / n, alpha: (P.alpha || 0.55) * (1 - (i - 1) / n), parts: P.parts || null });
    }
    return out;
  };

  // an event's layer: 'back' (behind the character: speed lines by default) or 'front' (params.layer overrides)
  CKFX.layerOf = e => (e.params && e.params.layer) || (e.kind === 'speedLines' ? 'back' : 'front');
  CKFX.drawBack = (ctx, ck, camera, region, fx, o = {}) => CKFX.draw(ctx, ck, camera, region, fx, Object.assign({}, o, { layer: 'back' }));
  // show only the parts whose names contain one of `parts` (meshes, hulls, holdouts); returns a function restoring all
  CKFX.showOnly = (ck, parts) => {
    if (!parts || !parts.length) return () => {};
    const was = [];
    for (const [name, P] of Object.entries(ck.parts)) {
      const on = parts.some(s => name.toLowerCase().includes(String(s).toLowerCase()));
      for (const m of [...P.meshes, ...P.hulls, ...P.holdouts]) { was.push([m, m.visible]); m.visible = on && m.visible; }
    }
    return () => was.forEach(([m, v]) => { m.visible = v; });
  };
  CKFX.draw = (ctx, ck, camera, region, fx, o = {}) => {
    const opt = Object.assign({ fps: 24, layer: 'front' }, o), hp = headPx(ck, camera, region);
    const order = { impactFrames: 3, flash: 2 };                          // full-frame cards last
    // held drawings: params.step holds an event's own animation on 2s / 3s; while an impact card holds, every other event
    // holds with it (its time at the card's first frame), so the card's frames repeat exactly (the trailer's held cards)
    let into = 0;
    for (const e of fx || []) if (e.kind === 'impactFrames') { const ci = CKFX.cardInfo((e.params || {}).pattern || [], e.local, opt.fps); if (ci) into = Math.max(into, ci.into); }
    const evs = (fx || []).filter(e => CKFX.layerOf(e) === opt.layer).sort((a, b) => (order[a.kind] || 0) - (order[b.kind] || 0))
      .map(e => {
        let local = e.local;
        if (e.params && e.params.step > 1) local = Math.floor(local * opt.fps / e.params.step + 1e-6) * e.params.step / opt.fps;
        if (into && e.kind !== 'impactFrames') local = Math.max(0, local - into / opt.fps);
        return local === e.local ? e : Object.assign({}, e, { local });
      });
    const drawn = [];
    for (const e of evs) {
      const anchor = e.anchor || {};
      if (e.kind === 'emote') { const p = CKFX.project(ck, camera, region, Object.assign({ bone: 'head', offset: [0.14, 0.16, 0] }, anchor)); emote(ctx, e, p, hp); drawn.push([e.kind, p]); }
      else if (e.kind === 'sweat') { const p = CKFX.project(ck, camera, region, Object.assign({ bone: 'head', offset: [-0.11, 0.08, 0.06] }, anchor)); sweat(ctx, e, p, hp); drawn.push([e.kind, p]); }
      else if (e.kind === 'speedLines') {
        const p = e.anchor ? CKFX.project(ck, camera, region, anchor) : [region[0] + region[2] / 2, region[1] + region[3] / 2];
        speedLines(ctx, e, region, p, opt.fps); drawn.push([e.kind, p]);
      } else if (e.kind === 'projectile') { const p = CKFX.project(ck, camera, region, Object.assign({ bone: 'head', offset: [0, 0.05, 0.08] }, anchor)); projectile(ctx, e, region, p, hp); drawn.push([e.kind, p]); }
      else if (e.kind === 'burst') { const p = CKFX.project(ck, camera, region, Object.assign({ bone: 'head', offset: [0, 0.06, 0.1] }, anchor)); burst(ctx, e, p, hp); drawn.push([e.kind, p]); }
      else if (e.kind === 'impactFrames') { impact(ctx, e, region, opt); drawn.push([e.kind, null]); }
      else if (e.kind === 'flash') { flash(ctx, e, region); drawn.push([e.kind, null]); }
    }
    return drawn;
  };

  // the smear rule, measured (ROADMAP "Acting to the ZZZ bar": a part travelling more than half its width in one frame
  // carries a smear or blur): per frame from t0 to t1 at fps, each tracked point's screen travel since the previous
  // frame over its screen width at its depth. Points: every spring chain's tip (its last joint's tail; width 2 x its
  // hit radius, at least 3 cm; part = the chain's first bone's name), the hands and feet (8 / 10 cm), the head
  // (0.8 L). A flagged frame is covered when a smear event is active with no parts filter, or one matching the
  // point's part. perf: ck.performClip's (springs stepped). -> {frames: [{t, flags: [{point, part, ratio, covered}]}],
  // summary: {needed, covered, uncovered, worst}}
  // widths: a point kind's drawn width (m): hair locks and bow tails are far wider than their springs' collision radii
  // (1.2 cm / 0.3 cm on Clawd), which would flag every sway; cuts: scene times where the shot changes (a pair of frames
  // across one isn't motion)
  CKFX.SMEAR_WIDTHS = { hair: 0.07, bow: 0.04, chain: 0.05 };
  CKFX.smearAudit = (ck, perf, camera, region, { t0 = 0, t1 = 1, fps = 24, threshold = 0.5, cuts = [], widths = CKFX.SMEAR_WIDTHS } = {}) => {
    const T = window.THREE, H = ck.vrm.humanoid, SB = ck.vrm.springBoneManager;
    const springs = SB ? [...(SB.springs || [])] : [];
    const chains = [];
    if (SB) {
      const byFirst = new Map();
      for (const j of SB.joints) {                                     // group joints into chains by parent links
        const parent = j.bone.parent; let root = j;
        for (const k of SB.joints) if (k.bone === parent) { root = null; break; }
        if (root) byFirst.set(j, [j]);
      }
      for (const [first, list] of byFirst) {
        let cur = first;
        for (;;) { const nxt = [...SB.joints].find(k => k.bone.parent === cur.bone); if (!nxt) break; list.push(nxt); cur = nxt; }
        const tip = list[list.length - 1];
        const kind = /hair/i.test(first.bone.name) ? 'hair' : /bow/i.test(first.bone.name) ? 'bow' : 'chain';
        chains.push({ point: 'chain:' + first.bone.name, part: first.bone.name, tip, w: Math.max(widths[kind] || 0.05, 2 * ((tip.settings && tip.settings.hitRadius) || 0)) });
      }
    }
    const bones = [['leftHand', 0.08], ['rightHand', 0.08], ['leftFoot', 0.10], ['rightFoot', 0.10], ['head', 0.8 * ck.head().L]];
    const proj = p => { const c = p.clone().project(camera); return [region[0] + (c.x * 0.5 + 0.5) * region[2], region[1] + (1 - (c.y * 0.5 + 0.5)) * region[3]]; };
    const widthPx = (p, w) => { const d = camera.position.distanceTo(p), f = region[3] / (2 * Math.tan((camera.fov || 50) * Math.PI / 360) * d); return w * f; };
    const read = () => {
      const out = [];
      for (const c of chains) out.push({ point: c.point, part: c.part, p: c.tip._currentTail.clone(), w: c.w });
      for (const [b, w] of bones) { const n = H.getRawBoneNode(b); if (n) out.push({ point: b, part: b, p: n.getWorldPosition(new T.Vector3()), w }); }
      return out;
    };
    const frames = []; let prev = null, needed = 0, covered = 0, worst = 0;
    for (let f = Math.round(t0 * fps); f <= Math.round(t1 * fps); f++) {
      const t = f / fps, st = perf.at(t); ck.vrm.scene.updateMatrixWorld(true);
      const cur = read(), flags = [];
      const acrossCut = cuts.some(c => c > t - 1 / fps + 1e-6 && c <= t + 1e-6);
      if (prev && !acrossCut) cur.forEach((q, i) => {
        const a = proj(prev[i].p), b = proj(q.p), travel = Math.hypot(b[0] - a[0], b[1] - a[1]), wpx = widthPx(q.p, q.w);
        const ratio = travel / Math.max(wpx, 1e-6); worst = Math.max(worst, ratio);
        if (ratio > threshold) {
          const parts = CKFX.smearParts(q.point, q.part);
          const cov = (st.fx || []).some(e => e.kind === 'smear' && (!(e.params && e.params.parts) ||
            e.params.parts.some(s => (parts || [q.part]).some(p => p.toLowerCase().includes(String(s).toLowerCase())))));
          flags.push({ point: q.point, part: q.part, ratio: +ratio.toFixed(2), covered: cov }); needed++; if (cov) covered++;
        }
      });
      frames.push({ t: +t.toFixed(4), flags }); prev = cur;
    }
    return { fps, threshold, points: (prev || []).map(q => q.point), frames, summary: { needed, covered, uncovered: needed - covered, worst: +worst.toFixed(2) } };
  };

  // the audit's uncovered frames -> smear events (the rule writing the smears): per group of points (hair chains ->
  // parts ['hair'], a hand -> its arm's meshes are not separable yet, so the whole character), consecutive flagged
  // frames merged into one event (gaps up to `gap` frames bridged), multiples whose span is about one frame's travel
  // the meshes a point's smear copies draw: hair chains the hair, bow tails the bow, a hand its side's sleeve, cuff and
  // wrist band (the skin is one mesh, so a bare arm can't ghost alone); null: no part-limited smear for it
  CKFX.smearParts = (point, part) => {
    if (/hair/i.test(part)) return ['hair'];
    if (/bow/i.test(part)) return ['bow'];
    const m = /^(left|right)Hand$/.exec(point);
    if (m) { const S = m[1] === 'left' ? 'L' : 'R'; return [`sleeve_${S}`, `cuff_${S}`, `wrist_${S}`]; }
    return null;
  };
  CKFX.smearEvents = (audit, { gap = 1, count = 3, alpha = 0.45, bodyMin = 1.0 } = {}) => {
    const fps = audit.fps, groups = new Map();
    for (const fr of audit.frames) for (const g of fr.flags) {
      if (g.covered) continue;
      const parts = CKFX.smearParts(g.point, g.part);
      if (!parts || (!g.point.startsWith('chain:') && g.ratio < bodyMin)) continue;   // limbs smear only when strong
      const key = parts.join(',');
      (groups.get(key) || groups.set(key, []).get(key)).push([Math.round(fr.t * fps), g.ratio]);
    }
    const out = [];
    for (const [key, list] of groups) {
      const fs = [...new Set(list.map(x => x[0]))].sort((a, b) => a - b);
      let a = fs[0], b = fs[0];
      const flush = () => {
        const peak = Math.max(...list.filter(x => x[0] >= a && x[0] <= b).map(x => x[1]));
        out.push({ t: +((a - 1) / fps).toFixed(4), dur: +((b - a + 2) / fps).toFixed(4), kind: 'smear', space: 'character',
          params: { mode: 'multiples', parts: key.split(','), count, alpha,
            length: +(Math.min(2, Math.max(0.6, peak)) / fps).toFixed(4) }, auto: { rule: 'travel > 0.5 width', peak } });
      };
      for (const f of fs.slice(1)) { if (f - b <= gap + 1) b = f; else { flush(); a = b = f; } }
      flush();
    }
    return out;
  };

  globalThis.CKFX = CKFX;
})();
