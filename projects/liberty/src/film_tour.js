// liberty/src/film_tour.js: the tour reel, the world and its show's effects toured by the camera (STORYBOARD_TOUR.md is
// the plan and its shot table; docs/CAMERA.md the grammar; engine/scene3d/film.js the shot machinery). The director,
// 2026-10-24: "showcase the world, the effects, various interesting camera angles of locations and camerawork moving
// through the world ... more tech demo meets world tour than early concert demo reel", then "no music for the demo
// reel. Show off the effects, but we don't need to time them". So nothing here is cut to the song:
//   part 1, the world at blue hour before the show (scene time < 300: the rig at standby), each shot at the scene time
//     its life gives it (the pelicans' pass, a gull landing on her port bow rail) and the dusk deepening shot by shot,
//     ending in a time-lapse into night;
//   part 2, the show's effects at night, each shot at the scene time that shows its effect best, ordered for the tour's
//     build of intensity (the beams waking, the stage's sparks and lasers, the drop's flames across No. 1, the
//     Oerlikons, the 5"/38, the mast gerbs, the finale with the pyro barge's mortars); the scene times happen to run
//     forward;
//   part 3, out, in the finale's own take: the pull away to the ship on the bay with the Bay Bridge behind her, the
//     show's last shot and its blackout.
// main.js plays this film by default (?film=demo plays the concert reel, film.js). Every move lands and holds (CRAFT
// §0.5); a shot's payoff is where its move lands or its event pays off (tools/edit_audit.py checks the hold after it).
//   node engine/render.mjs projects/liberty --loop=film~label --sheet=...                         (look at it)
//   node engine/render.mjs projects/liberty --loop=film --eval='JSON.stringify(LIBERTY.film.track())'   (tools/camaudit.py)
import * as P from './plan.js';

const CAM = globalThis.CAM;
const q = new URLSearchParams(location.search);
const mods = () => window.LIBERTY.ctx.mods;
const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]);
const cl = (u, a = 0, b = 1) => Math.max(a, Math.min(b, u));
const mj = u => CAM.P.minjerk(cl(u));

// ---- the hours: blue hour deepening across part 1 (17.50-17.70 solar, 18:23-18:35 PDT), the time-lapse from just after
// civil dusk (17.775) to the show's night (19.1 solar, 20:00 PDT)
const NIGHT = 19.1;

// ---- overlays (drawn over the finished frame)
const black = (X, W, H, a) => { if (a > 0.002) { X.fillStyle = `rgba(0,0,0,${Math.min(1, a).toFixed(4)})`; X.fillRect(0, 0, W, H); } };
const fadeIn = d => (X, W, H, ts) => black(X, W, H, 1 - mj(ts / d));
const fadeOut = (d, dur) => (X, W, H, ts) => black(X, W, H, mj((ts - (dur - d)) / d));

// ---- camera helpers
// keyed moves in shot seconds (CAM.move: minimum jerk between two keys; 'pass' one eased pass through more)
const keyed = (keys, opts = {}) => ts => CAM.move(ts, keys, opts);
// a still subject's world box for the framing check (camaudit): centre and half sizes
const box = (name, c, h) => () => ({ [name]: [sub(c, h), add(c, h)] });
// world points
const bear = (deg, m, y) => { const [x, z] = P.atBearing(deg, m); return [x, y, z]; };

// the pelican line that passes her port bow at scene 72 (life: 'pelicans_pass'), found by where its birds are then
let LINE = null;
const pelicanLine = () => {
  if (LINE) return LINE;
  const L = mods().life, ev = L.events.find(e => e.kind === 'pelicans_pass' && Math.abs(e.t - 72) < 1);
  const ids = L.sim.birds.filter(b => b.sp === 'pelican' && b.cls === 'line').map(b => b.i)
    .filter(i => { const p = L.birdAt(i, ev.t).p; return Math.hypot(p[0] - ev.at[0], p[2] - ev.at[2]) < 25; });
  return (LINE = { ids, at: t => { const ps = ids.map(i => L.birdAt(i, t).p); return [0, 1, 2].map(k => ps.reduce((a, p) => a + p[k], 0) / ps.length); } });
};

// ---- scouting (?scout=<base64url JSON [{ name, pos, at, lens, hour, t }]>): each view becomes a 1 s lock at its own hour and
// scene time, so candidate framings render as one contact sheet (--loop=film~label --sheet=0.001,1.001,...: a frame at
// a view's start is at exactly its scene time)
const scout = q.get('scout') ? JSON.parse(atob(q.get('scout').replace(/-/g, '+').replace(/_/g, '/'))) : null;

const TOUR = [
  // ============================================================== 1. the world at blue hour, before the show
  // T1. From the water north of Alcatraz the camera trucks east along the ferry lane: the island slides off the city and
  // uncovers Telegraph Hill, Coit Tower and the waterfront where she lies; the Bay Bridge's lights to the left.
  { name: 'T1 the bay', dur: 10.0, hour: 17.50, tScene: 30, payoff: 8.5, kind: 'reveal', overlay: fadeIn(2.0),
    cam: keyed([{ t: 0, pos: bear(326.5, 3600, 28), at: [80, 26, 80], lens: 85 }, { t: 8.5, pos: bear(332.5, 3600, 28), at: [80, 26, 80], lens: 85 }]) },
  // T2. Down to the berth: a drone descends from 190 m over the water off the pier's tip toward her port bow quarter:
  // the ship alongside Pier 35, the marina, Telegraph Hill and the skyline behind
  { name: 'T2 down to the berth', dur: 11.0, hour: 17.52, tScene: 40, payoff: 9.5,
    cam: keyed([{ t: 0, pos: bear(330, 760, 190), at: [5, 0, 0], lens: 35 }, { t: 9.5, pos: bear(322, 235, 20), at: [10, 9, 5], lens: 35 }]) },
  // T3. The pelicans (life: six skim past her bow at 72 and on down her port side to the breakwater): a camera boat
  // runs with them, between them and the ship, so they cross the afterglow and Pier 39 as silhouettes; then it eases to
  // a stop and lets them fly on out of the frame.
  { name: 'T3 pelicans', dur: 10.0, hour: 17.55, tScene: 69.5, payoff: 8.6,
    cam: ts => {
      const T0 = 69.5, A = 5.6, D = 3.0;                        // ride with them to ts A, then slow to a stop over D
      // the camera's own clock along their track: real time, then easing to a halt (the integral of 1 - minjerk), so it
      // stops and the birds fly on out of the frame
      let tau = T0; const n = 48, h = ts / n; for (let i = 0; i < n; i++) { const x = (i + 0.5) * h; tau += h * (x < A ? 1 : 1 - mj((x - A) / D)); }
      const line = pelicanLine(), c = CAM.follow(tau, line.at, { t0: T0 - 3, tau: 0.5, lead: 1.0 });
      return { pos: add(c, [8.5, 1.5, -2.5]), at: add(c, [-1.0, 0.4, 3.5]), lens: 28 };
    },
    subjects: ts => { const c = pelicanLine().at(69.5 + ts); return { pelicans: [sub(c, [6, 0.6, 9]), add(c, [6, 1.4, 9])] }; } },
  // T4. Up her side: from low on the water off her port bow the camera rises up the plating, past her name, over the
  // bulwark, and lands on her rail as a gull lands there (life: 'gull visitor 1' at scene 240), the foredeck beyond
  { name: 'T4 up her side', dur: 12.5, hour: 17.58, tScene: 229.0, payoff: 11.0, kind: 'reveal',
    cam: keyed([{ t: 0, pos: [-19.5, 1.8, -50.5], at: [-7.5, 5.0, -58.5], lens: 35 }, { t: 10.2, pos: [-14.5, 15.2, -48.0], at: [-4.0, 12.2, -55.5], lens: 40 }]),
    subjects: box('gull', [-6.85, 12.2, -55.53], [0.4, 0.3, 0.4]) },
  // T5. The apron: from near the pier's tip, a walk aft along the apron at a visitor's pace, the shed's wall-packs on
  // the left, her bow and her side on the right, the city's lights at the end of it
  { name: 'T5 the apron', dur: 9.0, hour: 17.62, tScene: 110, payoff: 7.5,
    cam: keyed([{ t: 0, pos: [13.9, 4.65, -122], at: [9.6, 7.6, 0], lens: 24 }, { t: 7.5, pos: [13.9, 4.65, -104], at: [9.0, 8.4, 0], lens: 24 }], { p: CAM.P.scurve(0.35, 0.4) }) },
  // T6. The gap: low over the water in the 2 m between her hull and the pier's fender piles, a slow glide forward over
  // a pneumatic fender toward the light at the end of it, the open bay and Angel Island (9 m in 9 s: the walls
  // stream past 1-2 m away, so the glide is a boat's drift, not a drone's dash: camaudit's depth mode read 0.82 fl/s at
  // 23.5 m in 8.5 s, 0.47 at 12.5 m and 0.337 at 9 m, over the 0.33 judder limit)
  { name: 'T6 the gap', dur: 10.0, hour: 17.66, tScene: 120, payoff: 9.0,
    cam: keyed([{ t: 0, pos: [9.8, 2.3, -17.0], at: [9.6, 2.4, -110], lens: 24 }, { t: 9.0, pos: [9.75, 2.3, -26.0], at: [9.2, 2.2, -140], lens: 24 }], { p: CAM.P.scurve(0.4, 0.45) }) },
  // T7. The waiting stage, straight down from 26 m over No. 2 hatch, locked: the stage at standby in plan, its card on
  // the LED wall, the drum riser, the deep-blue floor wash, the truss grid, the apron's edge
  { name: 'T7 the waiting stage', dur: 6.0, hour: 17.70, tScene: 255, move: 0, payoff: 1.0, kind: 'reveal',
    keys: [{ u: 0, pos: [2.6, 26, -27.7], at: [2.6, 0, -27.7], lens: 28 }],
    subjects: box('stage', [2.2, P.STAGE.floor, -27.7], [5.9, 0.5, 6.0]) },
  // T8. Night falls, a time-lapse from over the shed's roof, west across her decks to Pier 39, the Golden Gate and Marin:
  // the last of the dusk goes, her dressing lights and the city come up. (It starts just after civil dusk, 17.775: the
  // sky steps from the afterglow's pink to blue in one frame between 17.762 and 17.766 solar, reported to the integrator.)
  { name: 'T8 night falls', dur: 10.0, hour: [[0, 17.775], [1, NIGHT]], tScene: 262, move: 0, payoff: 9.0, kind: 'reveal',
    keys: [{ u: 0, pos: [42, 25, -32], at: [-60, 7, -46], lens: 28 }] },

  // ============================================================== 2. the show's effects at night
  // T9. The rig wakes: an orbit from the water off her port bow, the ship dark at the house's blackout, then the
  // beams rise into the night (the show's intro at scene 300.73)
  { name: 'T9 the rig wakes', dur: 9.5, hour: NIGHT, tScene: 297.0, payoff: 8.0,
    cam: ts => CAM.orbit(ts, { t0: 0, t1: 8.0, center: [2, 12.5, -27.7], radius: 76, a0: -150, a1: -102, height: -7.5, lens: 28, aimY: 2.5 }) },
  // T10. The stage: a crane rises from a crowd's eye on the apron (her side and the lip's cold sparks overhead) to the
  // stage's height: the LED wall, the drums, the fountains, the beams and lasers of the build (sparks from 368.23; the
  // cut comes before the drop's CO2 at 375.26)
  { name: 'T10 the stage', dur: 7.5, hour: NIGHT, tScene: 366.9, payoff: 5.5, kind: 'reveal',
    cam: keyed([{ t: 0, pos: [15.6, 4.6, -27.7], at: [4.0, 13.6, -27.7], lens: 24 }, { t: 5.5, pos: [17.4, 12.6, -27.7], at: [3.0, 13.5, -27.7], lens: 26 }]),
    subjects: box('stage', [2.2, P.STAGE.floor + 2.4, -27.7], [5.9, 2.4, 6.0]) },
  // T11. The drop across No. 1: the camera tracks aft along her port walkway, looking across the hatch at the starboard
  // rail as the drop lights it: the flame projectors in front of the shed's wall (375.73, all eight; 376.66 the four
  // nearest the stage), the rail gerbs (8 s), the deck mortars on No. 1's cover (7.6 m clearance kept: show.md P8)
  { name: 'T11 the drop', dur: 8.0, hour: NIGHT, tScene: 374.4, payoff: 6.5,
    cam: keyed([{ t: 0, pos: [-5.6, 12.5, -47.0], at: [6.3, 13.4, -43.5], lens: 28 }, { t: 6.5, pos: [-5.6, 12.5, -41.5], at: [6.3, 13.6, -39.0], lens: 28 }], { p: CAM.P.scurve(0.35, 0.45) }),
    subjects: () => ({ flames: [[5.6, 9.8, -41.2], [7.0, 14.5, -35.8]] }) },          // (the two units seen past the pillbox)
  // T12. The Oerlikons: on her house, the after port 20 mm fires its eight rounds up over her port side (gun20 guns 4-7
  // at 404.79-405.72), the smoke trailing off downwind; the rig goes to the break's blue pillars (405.73)
  { name: 'T12 the Oerlikons', dur: 5.0, hour: NIGHT, tScene: 403.8, move: 0, payoff: 1.92,
    keys: [{ u: 0, pos: [-1.9, 17.9, 13.4], at: [-5.2, 17.3, 8.6], lens: 35 }],
    subjects: box('oerlikon', [-4.8, 17.2, 9.2], [0.8, 1.0, 0.8]) },
  // T13. FIRE: the 5"/38 on her stern platform from low on the water off her port quarter (it fires west; the camera
  // stands 54 deg off its bore, 42 m from the muzzle): the flash ring, the burning grains, the smoke rolling downwind
  { name: 'T13 the 5-inch fires', dur: 7.0, hour: NIGHT, tScene: 478.6, move: 0, payoff: 2.13, kind: 'reveal', shake: [{ t: 2.28, k: 0.3, decay: 0.5 }],
    keys: [{ u: 0, pos: [-40, 3.0, 78], at: [-4, 13.0, 61], lens: 45 }],
    subjects: box('gun5', [0, 14.0, 62.5], [2.5, 1.6, 3.5]) },
  // T14. Up the mainmast: a crane rises beside it to its crosstree as the gerbs there pour their sparks down through the
  // final's beams and lasers (from 525.73 for 15 s; 40 mm, so the fountains read against the lasers; 11 m from them)
  { name: 'T14 up the mainmast', dur: 7.0, hour: NIGHT, tScene: 526.0, payoff: 5.8,
    cam: keyed([{ t: 0, pos: [-8.0, 12.6, -8.5], at: [0, 15.5, -16.9], lens: 40 }, { t: 5.8, pos: [-8.0, 19.5, -8.5], at: [0, 18.6, -16.9], lens: 40 }]),
    subjects: box('mast gerbs', [0, 18.5, -16.9], [1.2, 1.6, 0.4]) },
  // T15. The finale and out, one take: from the water off her port bow, high enough to see the whole ship, as she
  // fires everything (538.85: the 5"/38 and the 3"/50, the bow and stern mortars, all eight flame projectors for 1.2 s,
  // the mast gerbs still pouring; 539.79 the Oerlikons; 540.26 and 540.49 the pyro barge's mortars in the foreground)
  // and the rig goes to the outro's violet pillars (540.73); then the camera draws back and up along the same line as
  // the lens lengthens, the Bay Bridge rising behind her, and holds: the show's last 5-inch shot and its blackout
  // (553.85), the dark ship on the bay. (The camera stands 49 deg off the 5"/38's bore at 144 m and 61 off the 3"/50's: 21 mm holds both guns' flashes.)
  { name: 'T15 the finale, and out', dur: 21.0, hour: NIGHT, tScene: 537.0, payoff: 16.85, kind: 'reveal', overlay: fadeOut(2.5, 21.0),
    cam: keyed([{ t: 0, pos: [-88, 17, -56], at: [-3, 12, -4], lens: 21 }, { t: 4.6, pos: [-88, 17, -56], at: [-3, 12, -4], lens: 21 },
      { t: 15.1, pos: bear(301, 720, 55), at: [0, 14, -6], lens: 80 }], { p: CAM.P.scurve(0.3, 0.5) }),
    subjects: box('ship', [0, 8, 0], [9, 8, 67]) },
];

export const SHOTS = scout
  ? scout.map((v, i) => ({ name: v.name || 'scout ' + i, dur: 1, hour: v.hour, tScene: v.t, move: 0, keys: [{ u: 0, pos: v.pos, at: v.at, lens: v.lens }] }))
  : TOUR;

// the tour's sound plan (after the director's picture lock: the world's ambience and the effects' own sounds, levels
// compressed in distance, beds crossfaded at cuts; no music): the camera per frame, each shot's scene clock, every
// module's sound events
export function extendFilm(film, N) {
  film.song = null;
  //   node engine/render.mjs projects/liberty --query='size=320x180' --eval='JSON.stringify(LIBERTY.film.soundPlan())' > plan.json
  film.soundPlan = (fps = 24) => {
    const tr = film.track(fps);
    const events = [];
    for (const [mod, m] of Object.entries(N.ctx.mods)) if (m && Array.isArray(m.sounds)) for (const e of m.sounds) events.push(Object.assign({ mod }, e));
    return {
      fps, len: film.len, frames: tr.frames.map(f => ({ pos: f.pos.map(v => +v.toFixed(2)), at: f.at.map(v => +v.toFixed(2)), shot: f.shot })),
      shots: film.shots.map(s => ({ name: s.name, t0: s.t0, dur: s.dur, tScene: s.tScene, speed: s.speed || 1 })),
      events, song: null,
    };
  };
}
