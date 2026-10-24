// engine/studio.js: the timeline and the page API the renderer drives.
//
//   shots([[t0, fn], [t1, fn], ...])     fn(t, lt, dur) paints the WHOLE frame into the inks (pure function of t).
//                                        It may return an object; PROJECT.overlay(t, ret, shot) runs after it (lyrics).
//   LOOPS.name = t => {...}; LOOPS.name.len = 4      standalone loops / test boards (?loop=name, --loop=name)
// Page API used by engine/render.mjs: window.ready, renderAt(t, mime, q), renderSheet(ts, cols, w, crop), frameInfo(t).

const SHOTS = [];
const LOOPS = {};
function shots(list) { SHOTS.push(...list); SHOTS.sort((a, b) => a[0] - b[0]); }
function shotAt(t) {
  let i = 0; while (i + 1 < SHOTS.length && t >= SHOTS[i + 1][0]) i++;
  const t0 = SHOTS[i][0], t1 = i + 1 < SHOTS.length ? SHOTS[i + 1][0] : DUR;
  return { i, fn: SHOTS[i][1], t0, t1, name: SHOTS[i][1].name };
}
function sectionAt(t) { for (const s of C.sections || []) if (t >= s.t0 && t < s.t1) return s.name; return ''; }

// Plain mode (PROJECT.plain): no riso press. Shots draw straight into X, a Canvas2D on the output canvas.
let X = null;
function plainSetup() {
  const out = document.getElementById('out'); out.width = W; out.height = H;
  X = out.getContext('2d'); window.OUTC = out;
}
function drawFrame(t) {
  NOW = t;
  if (window.PROJECT && PROJECT.plain) {
    X.setTransform(1, 0, 0, 1, 0, 0); X.globalAlpha = 1; X.globalCompositeOperation = 'source-over'; X.filter = 'none';
    X.fillStyle = '#000'; X.fillRect(0, 0, W, H);
    let ret;
    if (window.LOOP) ret = window.LOOP(t);
    else if (SHOTS.length) { const s = shotAt(t); X.save(); ret = s.fn(t, t - s.t0, s.t1 - s.t0) || {}; X.restore(); if (PROJECT.overlay) { X.save(); PROJECT.overlay(t, ret, s); X.restore(); } }
    return;
  }
  risoClear();
  let ret, printOpts = {};
  if (window.LOOP) ret = window.LOOP(t);
  else if (SHOTS.length) {
    const s = shotAt(t);
    ret = s.fn(t, t - s.t0, s.t1 - s.t0) || {};
    resetT();
    if (window.PROJECT && PROJECT.overlay) PROJECT.overlay(t, ret, s);
  }
  resetT();
  if (ret && ret.print) printOpts = ret.print;
  risoPrint(t, printOpts);
}

const outCanvas = () => (window.PROJECT && PROJECT.plain ? window.OUTC : RISO.out);
// window.PREFRAME(t), if a film defines one (engine/plate.js does), is awaited before each rendered frame: async assets such as
// image-sequence plates are loaded for t first, so headless renders never draw a missing frame.
const preframe = t => (window.PREFRAME ? window.PREFRAME(t) : null);
window.renderAt = async (t, mime = 'image/jpeg', q = .95) => { await preframe(t); drawFrame(t); return outCanvas().toDataURL(mime, q); };
// The 2D camera track for tools/camaudit.py (`track` mode, exact): each frame is drawn and its first cam() call kept
// (no call = the locked frame); a new shot in the timeline is a cut. docs/CAMERA.md §8.
//   node engine/render.mjs P --eval='camTrack()' > track.json     (or camTrack(t0, t1) for a stretch)
window.camTrack = async (t0 = 0, t1 = DUR, fps = FPS) => {
  const frames = [];
  let prev = null;
  for (let i = 0, n = Math.round((t1 - t0) * fps); i < n; i++) {
    const t = t0 + i / fps;
    window.__CAM = [];
    await preframe(t); drawFrame(t);
    const c = window.__CAM[0] || [W / 2, H / 2, 1, 0];
    const shot = window.LOOP ? (window.LOOP.shotAt ? window.LOOP.shotAt(t) : 0) : (SHOTS.length ? shotAt(t).i : 0);
    const fr = { x: c[0], y: c[1], zoom: c[2], rot: c[3], calls: window.__CAM.length, shot, cut: prev !== null && shot !== prev };
    // a film can name its story's things (window.SUBJECTS(t) -> { name: [x0, y0, x1, y1] } in world units): their screen
    // boxes, for camaudit's framing checks (in frame, clipped at an edge, covered, where the eye is at a cut)
    if (window.SUBJECTS) {
      const S = window.SUBJECTS(t), cs = Math.cos(c[3]), sn = Math.sin(c[3]), P = (x, y) => [W / 2 + c[2] * (cs * (x - c[0]) - sn * (y - c[1])), H / 2 + c[2] * (sn * (x - c[0]) + cs * (y - c[1]))];
      fr.subj = {};
      for (const [k, b] of Object.entries(S)) {
        const q = [P(b[0], b[1]), P(b[2], b[1]), P(b[0], b[3]), P(b[2], b[3])];
        fr.subj[k] = [Math.min(...q.map(p => p[0])), Math.min(...q.map(p => p[1])), Math.max(...q.map(p => p[0])), Math.max(...q.map(p => p[1]))].map(v => Math.round(v));
      }
    }
    frames.push(fr);
    prev = shot;
  }
  window.__CAM = null;
  return { kind: '2d', fps, size: [W, H], t0, frames };
};
window.frameInfo = t => ({ t, bar: barPos(t), beat: beatPos(t), section: sectionAt(t), shot: SHOTS.length ? shotAt(t).name : '' });
window.renderSheet = async (ts, cols = 4, w = 480, crop = null) => {
  const [cx, cy, cw, ch] = crop || [0, 0, W, H];
  const h = Math.round(w * ch / cw), rows = Math.ceil(ts.length / cols);
  const S = document.createElement('canvas'); S.width = cols * w; S.height = rows * (h + 18);
  const x = S.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, S.width, S.height);
  const ms = [];
  for (const [i, t] of ts.entries()) {
    await preframe(t); const t0 = performance.now(); drawFrame(t); ms.push(Math.round(performance.now() - t0));
    const X0 = (i % cols) * w, Y = Math.floor(i / cols) * (h + 18);
    x.drawImage(outCanvas(), cx, cy, cw, ch, X0, Y + 18, w, h);
    const fi = frameInfo(t);
    x.fillStyle = '#ffe14d'; x.font = '12px ui-monospace, monospace';
    x.fillText(`${t.toFixed(2)}s  f${Math.round(t * FPS)}  bar ${fi.bar.toFixed(2)}  ${fi.shot}`, X0 + 4, Y + 13);
  }
  return { url: S.toDataURL('image/jpeg', .88), ms };
};

// interactive studio: scrub, play with audio (studio.html without ?render)
async function studioUI() {
  if (location.search.includes('render')) return;
  const q = new URLSearchParams(location.search);
  if (q.get('loop') && LOOPS[q.get('loop')]) window.LOOP = LOOPS[q.get('loop')];
  const len = window.LOOP ? window.LOOP.len : DUR;
  const bar = document.createElement('div'); bar.className = 'bar';
  bar.innerHTML = `<button id="pl">play</button><input id="sc" type="range" min="0" max="${len}" step="${1 / FPS}" value="${q.get('t') || 0}"><span id="tt"></span>`;
  document.body.appendChild(bar);
  const sc = bar.querySelector('#sc'), tt = bar.querySelector('#tt'), pl = bar.querySelector('#pl');
  const au = window.PROJECT && PROJECT.audio && !window.LOOP ? new Audio(PROJECT.audio) : null;
  const show = t => { drawFrame(t); const f = frameInfo(t); tt.textContent = `${t.toFixed(2)}s  bar ${f.bar.toFixed(2)}  ${f.section} · ${f.shot}`; };
  sc.oninput = () => { if (au) au.currentTime = +sc.value; show(+sc.value); };
  let playing = false, start = 0, from = 0;
  pl.onclick = () => { playing = !playing; pl.textContent = playing ? 'pause' : 'play'; from = +sc.value; start = performance.now(); if (au) { au.currentTime = from; playing ? au.play() : au.pause(); } if (playing) loop(); };
  const loop = () => { if (!playing) return; const t = au ? au.currentTime : from + (performance.now() - start) / 1000; sc.value = t % len; show(t % len); requestAnimationFrame(loop); };
  show(+sc.value);
}
