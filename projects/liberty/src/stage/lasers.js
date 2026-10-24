// liberty/src/stage/lasers.js: the laser show (show.md §3, R1-R6; style C3b): five projectors (two on the lip's corners,
// two on the house top, one over the LED wall); looks by section: sheets, fans, chases, a tunnel, liquid sky, beams
// terminated on the masts, a beacon. Colours are what a laser can make: mixes of 638 / 520 / 445 nm (R1), the nearest
// to each section's families. Beams show only in the haze (R5; the engine weighs each by the haze it crosses).
// Which beams are real and which are the film's liberty (R6: SFO is 21 km away, the bay is overflown; a real show
// would terminate or limit them): 'stop' beams end on a surface (the masts, the shed: real); 'sky' beams climb out
// over the bay (fiction, flagged in notes.md).
import { Geo } from './geo.js';
import { glowMat } from './mats.js';
import { LOOKS, hsv } from './palette.js';
import { dirAE, DARK } from './cues.js';
import { lin } from 'scene3d/util.js';

const T = window.THREE;
const DEG = Math.PI / 180;
// a hue as a laser makes it: full saturation from RGB diodes (R1), linear, normalised to its brightest primary
const laserCol = h => { const c = lin(hsv(h, 1, 1)), m = Math.max(...c); return c.map(x => x / m); };

export function buildLasers(world, M, L, ctx, cues) {
  const show = ctx.show, S = world.stage, P = ctx.P, zc = L.deck.zc;
  // the masts as stoppers (B2 builds the masts; these proxies make a terminated beam end on them either way)
  // (B2 registers its masts and booms as stoppers; until it lands, proxies here)
  const SH = P.SHIP, mastStop = [];
  for (const [nm, m] of [['fore', SH.masts.fore], ['main', SH.masts.main], ['mizzen', SH.masts.mizzen]]) {
    const dm = L.masts && L.masts[nm];
    const base = dm ? dm.foot : SH.toWorld(0, m.houseTop, m.z), top = dm ? dm.cap : SH.toWorld(0, SH.deckAbl(0, m.z) + m.above, m.z);
    mastStop.push({ base, top });
    if (dm) continue;
    const g = new T.CylinderGeometry(0.3, 0.42, top[1] - base[1], 8, 1, true); g.translate(base[0], (base[1] + top[1]) / 2, base[2]);
    S.stopper(new T.Mesh(g, new T.MeshBasicMaterial()));
  }
  const P0 = Object.fromEntries(L.lasers.map(p => [p.name, p.pos]));
  const beat = t => show.beatAt(t);
  const fam = (t, k) => { const s = cues.secAt(t), lk = LOOKS[(s && s.look) || 'dawn'] || LOOKS.dawn; return laserCol(lk.hues[k % lk.hues.length]); };
  const out = (a, d, len) => [a[0] + d[0] * len, a[1] + d[1] * len, a[2] + d[2] * len];
  const beamsOf = {
    // a sheet: n beams fanned in a plane through the projector, tipped up out over the pier (above the apron's heads)
    sheet(a, t, { n = 36, az = 0, span = 70, el = 6, wob = 0, col, power = 1.3, len = 90 }) {
      const r = []; for (let i = 0; i < n; i++) { const u = i / (n - 1) - 0.5; r.push({ a, b: out(a, dirAE(az + u * span, el + wob * Math.sin(u * 9 + beat(t) * 1.6)), len), color: col, power, core: 1.0, glow: 6 }); } return r;
    },
    // a fan: fewer beams, gaps between them, spread breathing on the beat
    fan(a, t, { n = 10, az = 0, span = 60, el = 25, col, power = 0.85, len = 120, swing = 12 }) {
      const b = beat(t), sp = span * (0.6 + 0.4 * Math.abs(Math.sin(b * Math.PI / 2))), sw = swing * Math.sin(b * Math.PI / 4);
      const r = []; for (let i = 0; i < n; i++) { const u = i / (n - 1) - 0.5; r.push({ a, b: out(a, dirAE(az + sw + u * sp, el + 4 * Math.sin(u * 3 + b)), len), color: col, power, core: 1.3, glow: 9 }); } return r;
    },
    // a tunnel: a scanned circle seen as a hollow cone (n beams round it), turning
    tunnel(a, t, { n = 24, az = 0, el = 8, half = 9, col, power = 0.8, len = 70 }) {
      const ax = dirAE(az, el), u = norm(cross(ax, [0, 1, 0])), v = cross(u, ax), r = [], sp = beat(t) * 0.25;
      for (let i = 0; i < n; i++) { const th = i / n * Math.PI * 2 + sp, c = Math.cos(th) * Math.tan(half * DEG), s = Math.sin(th) * Math.tan(half * DEG); r.push({ a, b: out(a, norm([ax[0] + u[0] * c + v[0] * s, ax[1] + u[1] * c + v[1] * s, ax[2] + u[2] * c + v[2] * s]), len), color: col, power, core: 1.1, glow: 7 }); }
      return r;
    },
    // a chase: one beam stepping across the fan on each 1/8 note
    chase(a, t, { n = 8, az = 0, span = 80, el = 30, col, power = 1.8, len = 120 }) {
      const k = Math.floor(beat(t) * 2) % n, u = k / (n - 1) - 0.5; return [{ a, b: out(a, dirAE(az + u * span, el), len), color: col, power }];
    },
    // terminated: beams from the house top to points on the masts' crosstrees and the foremast (they end on them)
    toMasts(a, t, { col, power = 1.6 }) {
      const r = []; let k = 0;
      for (const m of mastStop.slice(0, 2)) for (const f of [0.55, 0.75, 0.92]) { const p = [m.base[0], m.base[1] + (m.top[1] - m.base[1]) * f, m.base[2]]; const d = norm([p[0] - a[0], p[1] - a[1], p[2] - a[2]]); r.push({ a, b: out(a, d, 200), color: col, power, k: k++ }); }
      return r;
    },
  };
  // the programme: per look, per projector: [kind, params, 'stop' | 'sky']
  const PROG = {
    dawn: {}, break: {},
    verse: { lipL: ['sheet', { az: 20, span: 60, el: 7, n: 30, power: 0.55 }, 'stop'], lipR: ['sheet', { az: -20, span: 60, el: 7, n: 30, power: 0.55 }, 'stop'] },
    build: { lipL: ['chase', { az: 15, el: 22 }, 'stop'], lipR: ['chase', { az: -15, el: 22 }, 'stop'], houseP: ['chase', { az: -95, el: 18, span: 50 }, 'sky'], houseS: ['chase', { az: -85, el: 18, span: 50 }, 'sky'] },
    drop: { lipL: ['fan', { az: 12, el: 18, span: 70 }, 'stop'], lipR: ['fan', { az: -12, el: 18, span: 70 }, 'stop'], wall: ['tunnel', { az: 0, el: 12, half: 8 }, 'stop'], houseP: ['toMasts', {}, 'stop'], houseS: ['fan', { az: -90, el: 30, span: 50, n: 8, power: 0.6 }, 'sky'] },
    bridge: { wall: ['tunnel', { az: 0, el: 16, half: 11, n: 36 }, 'stop'], houseP: ['sheet', { az: -90, span: 100, el: 4, wob: 3, n: 44, power: 0.6, len: 140 }, 'sky'], houseS: ['sheet', { az: -90, span: 100, el: 9, wob: 3, n: 44, power: 0.6, len: 140 }, 'sky'] },
    final: { lipL: ['fan', { az: 12, el: 24, span: 80, n: 10 }, 'stop'], lipR: ['fan', { az: -12, el: 24, span: 80, n: 10 }, 'stop'], wall: ['tunnel', { az: 0, el: 14, half: 10 }, 'stop'], houseP: ['toMasts', {}, 'stop'], houseS: ['fan', { az: -90, el: 35, span: 70, n: 10, power: 0.6 }, 'sky'] },
    outro: { houseS: ['chase', { az: -90, el: 70, span: 0, n: 1, power: 1.6, len: 400 }, 'sky'] },
  };
  // the family each projector draws in this look: alternate per projector; the final cycles three
  const famOf = (name, lk) => ({ lipL: 0, lipR: 1, wall: lk === 'final' ? 2 : 1, houseP: 1, houseS: 0 })[name] ?? 0;
  // the beams of one projector in one mode at t (what the engine draws; also what the end spots read)
  const beamsAt = (name, mode, t) => {
    const s = cues.secAt(t); if (!s || DARK) return [];
    const pr = (PROG[s.look] || {})[name]; if (!pr || pr[2] !== mode) return [];
    const k = Math.min(1, (t - s.t0) / (show.spb * 0.5)), fade = s.look === 'outro' ? Math.max(0, 1 - (t - s.t0) / (s.t1 - s.t0)) : 1;
    const col = fam(t, famOf(name, s.look));
    const bs = beamsOf[pr[0]](P0[name], t, Object.assign({ col }, pr[1]));
    for (const b of bs) b.power = (b.power ?? 1) * k * fade * (0.7 + 0.3 * show.pulse(t, { attack: 0.01, decay: 0.2 }));
    return bs;
  };
  // the end spots (R5): where a terminated beam lands, a dot of its colour on the surface (the shed's wall, a mast)
  const spotsAt = (t, F) => {
    for (const name of Object.keys(P0)) for (const b of beamsAt(name, 'stop', t)) {
      const d = [b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]], len = Math.hypot(...d);
      const hit = len > 0 && S.landing(b.a, d.map(v => v / len), len);
      if (!hit) continue;
      const q = [b.a[0] + d[0] / len * (hit.dist - 0.04), b.a[1] + d[1] / len * (hit.dist - 0.04), b.a[2] + d[2] / len * (hit.dist - 0.04)];
      const k = 2.2 * b.power;
      F.glow(q, 0.09 + hit.dist * 0.0012, [b.color[0] * k, b.color[1] * k, b.color[2] * k]);
    }
  };
  for (const name of Object.keys(P0)) {
    for (const mode of ['stop', 'sky']) {
      // (a cue's GO: the look starts on its downbeat, the first half beat ramps in)
      S.laser({ name: `laser ${name} ${mode}`, stop: mode === 'stop', beams: t => beamsAt(name, mode, t) });
    }
  }
  // the projectors: black boxes with an aperture glowing while they fire
  const body = new Geo(), ap = new Geo();
  for (const p of L.lasers) {
    const [x, y, z] = p.pos, face = p.name.startsWith('house') ? [0, 0, -1] : [1, 0, 0];
    body.box([x - face[0] * 0.16, y, z - face[2] * 0.16], [face[0] ? 0.32 : 0.36, 0.18, face[0] ? 0.36 : 0.32], 0, 0.4);
    ap.box([x + face[0] * 0.003, y + 0.01, z + face[2] * 0.003], [face[0] ? 0.004 : 0.14, 0.06, face[0] ? 0.14 : 0.004], 0, L.lasers.indexOf(p));
  }
  world.mesh(body.geometry(), M.black, { name: 'laser projectors' });
  const apMat = glowMat(world, 'laser apertures', { uniforms: { uOn: { value: new T.Vector4() }, uOn2: { value: 0 }, uC: { value: new T.Vector3(0.2, 1, 0.3) } },
    body: `float k = sd < 0.5 ? uOn.x : sd < 1.5 ? uOn.y : sd < 2.5 ? uOn.z : sd < 3.5 ? uOn.w : uOn2; s.albedo = vec3(0.02); s.emissive = uC * k * 4.0;` });
  world.mesh(ap.geometry(), apMat, { name: 'laser apertures' });
  world.onFrame(t => {
    const s = cues.secAt(t), pr = s ? PROG[s.look] || {} : {};
    const on = L.lasers.map(p => (pr[p.name] ? 1 : 0));
    apMat.uniforms.uOn.value.set(on[0], on[1], on[2], on[3]); apMat.uniforms.uOn2.value = on[4];
    const c = fam(t, 0); apMat.uniforms.uC.value.set(c[0], c[1], c[2]);
  });
  return { PROG, mastStop, spotsAt };
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
