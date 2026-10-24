// liberty/src/film.js: the reel (STORYBOARD.md is the plan and its shot table; docs/CAMERA.md the grammar; engine/scene3d/
// film.js the shot machinery). Part A tours the berth at blue hour before the show (scene time in the pre-show, the rig at
// standby); A7 lets night fall; part B runs on the song: every B shot's scene clock is the song's, continuous across the
// cuts (song time = reel time - 11.23 + 0... see SONG below), so the 5"/38 fires on the drop's downbeat 2 s into B4.
//   node engine/render.mjs projects/liberty --loop=film~label --sheet=0,5,10,...      (look at it)
//   node engine/render.mjs projects/liberty --loop=film --eval='LIBERTY.film.track()' > track.json   (tools/camaudit.py)
import * as P from './plan.js';

const CAM = globalThis.CAM;
const show = () => window.LIBERTY.show;
// the song's clock in part B: song time = reel time + SONG_LEAD, scene time = show.start + song time
export const SONG_LEAD = 11.23;
const B = reelT => 300 + reelT + SONG_LEAD;                 // (show.start is 300: src/show/index.js)
const BLUE = 17.55, NIGHT = 19.1;
const mj = u => CAM.P.minjerk(u);

// overlays
const black = (X, W, H, a) => { if (a > 0.002) { X.fillStyle = `rgba(0,0,0,${Math.min(1, a).toFixed(4)})`; X.fillRect(0, 0, W, H); } };
const fadeIn = d => (X, W, H, ts) => black(X, W, H, 1 - mj(Math.min(1, ts / d)));
const fadeOut = (d, dur) => (X, W, H, ts) => black(X, W, H, mj(Math.min(1, Math.max(0, (ts - (dur - d)) / d))));

// world points (the ship's from the plan's ship coordinates)
const S = P.SHIP, W = (x, abl, z) => S.toWorld(x, abl, z);
const GUN5 = W(0, 17.3, S.guns.gun5.z), GUN3 = W(0, 18.0, S.guns.gun3.z), STAGE_C = [2.0, P.STAGE.floor + 1.5, (P.STAGE.z0 + P.STAGE.z1) / 2];
const MAIN = W(0, S.sideAbl(S.masts.main.z) + 9, S.masts.main.z);
const WATERFRONT = [30, 18, 60];
export const SHOTS = [
  // ---- A: the berth at blue hour, before the show
  { name: 'A1 the waterfront from the bay', dur: 8, hour: BLUE, tScene: 30, overlay: fadeIn(1.5),
    keys: [{ u: 0, pos: (([x, z]) => [x, 140, z])(P.atBearing(330, 1700)), at: WATERFRONT, lens: 50 },
           { u: 1, pos: (([x, z]) => [x, 45, z])(P.atBearing(330, 1350)), at: WATERFRONT, lens: 50 }], timing: 'arc' },
  // the pelicans (life.events): one plunge-dives off her port bow at 67.8, a line of six skims down her port side at 72.
  // Low on the water off her bow looking into the afterglow (B7's life_pelicans), where they read as silhouettes: hold on
  // the diver's plunge (ts 1.0); the line's centre passes 10 m off the lens on the right (ts 2.5) and its birds sweep
  // across the frame leftward from its right edge, so the camera picks them up and pans left with them at about half
  // their rate (15 deg over ts 3.4-5.6, 12.8 deg/s at most: 0.32 frames/s), landing with the line left of centre, and
  // holds as they fly on along the waterfront. (The early cut's camera looked east, and the line was dark on dark; the
  // next one swung right to meet the line's centre out of frame and back with it, a 13 deg overshoot the camera audit
  // flagged as a hitch.)
  { name: 'A2 pelicans off her bow', dur: 6.5, hour: BLUE, tScene: 66.8, payoff: 5.6,
    cam: ts => {
      const C = [-12, 1.6, -104], D = [-53, 2.2, -85], dx = D[0] - C[0], dz = D[2] - C[2], r = Math.hypot(dx, dz);
      const a = Math.atan2(dx, dz) + 15 * Math.PI / 180 * mj(Math.min(1, Math.max(0, (ts - 3.4) / 2.2)));
      return { pos: C, at: [C[0] + r * Math.sin(a), D[1], C[2] + r * Math.cos(a)], lens: 50 };
    } },
  // her name on the starboard bow, from the pier's edge near her bow (the gull isn't on the rail yet)
  { name: 'A3 her name', dur: 3.5, hour: BLUE, tScene: 140, move: 0,
    keys: [{ u: 0, pos: [13.6, P.PIER.deck + 1.65, -80], at: [8.0, 9.2, -63.0], lens: 35 }] },
  // a gull lands on her starboard bow rail at 150 (life: forced, [3.31, 12.92, -64.31]): B7's life_bow_rail from over
  // the apron's edge, at 50 mm (at 35 mm the gull was ~60 px)
  { name: 'A3b a gull on her bow rail', dur: 4.5, hour: BLUE, tScene: 148, move: 0, payoff: 2.0,
    keys: [{ u: 0, pos: [14.5, 13.8, -57.5], at: [3.3, 13.0, -64.3], lens: 50 }] },
  { name: 'A4 the apron', dur: 6.5, hour: BLUE + 0.03, tScene: 120,
    keys: [{ u: 0, pos: [P.PIER.x0 + 3.6, P.PIER.deck + 1.65, 38], at: [6, 8.5, -30], lens: 24 }, { u: 1, pos: [P.PIER.x0 + 3.6, P.PIER.deck + 1.65, 22], at: [6, 8.5, -45], lens: 24 }] },
  { name: 'A5 a winch drum', dur: 4, hour: BLUE + 0.04, tScene: 150, move: 0,
    keys: [{ u: 0, pos: [4.0, 11.25, -38.6], at: [1.35, 10.55, -42.57], lens: 50 }] },          // No. 1's starboard winch (hull.anchors.winches[1])
  { name: 'A6 the waiting stage', dur: 7, hour: BLUE + 0.06, tScene: 200,
    keys: [{ u: 0, pos: [1.5, MAIN[1], MAIN[2] - 1.5], at: [1.0, MAIN[1] + 1, MAIN[2] - 40], lens: 28 }, { u: 1, pos: [1.5, MAIN[1], MAIN[2] - 1.5], at: STAGE_C, lens: 28 }] },
  { name: 'A7 night falls', dur: 12, hour: [[0, BLUE + 0.12], [1, NIGHT]], tScene: 240, move: 0,
    keys: [{ u: 0, pos: (([x, z]) => [x, 34, z])(P.atBearing(15, 640)), at: [25, 26, 120], lens: 35 }] },
  // ---- B: the show, on the song (continuous clock)
  { name: 'B1 toward her as the beams wake', dur: 8, hour: NIGHT, tScene: B(47), overlay: null,
    keys: [{ u: 0, pos: [-160, 5, -12], at: STAGE_C, lens: 24 }, { u: 1, pos: [-120, 6, -20], at: STAGE_C, lens: 24 }] },
  { name: 'B2 the stage from the apron', dur: 4, hour: NIGHT, tScene: B(55), move: 0,
    keys: [{ u: 0, pos: [15.5, 12.5, -27.7], at: [3, 12.2, -27.7], lens: 35 }] },                // a camera crane over the apron
  { name: 'B3 the 5-inch trains round', dur: 3.5, hour: NIGHT, tScene: B(59), move: 0.78,
    // the aft port Oerlikon bursts in the foreground (the pre-chorus's 20 mm, 0.25 s in) as the 5"/38 trains behind it;
    // the train lands at 2.73 s, so it holds 0.77 s before the cut to FIRE
    keys: [{ u: 0, pos: [-10.0, 16.0, 55.0], at: [-0.5, 13.9, 61.6], lens: 35 }, { u: 1, pos: [-10.0, 16.0, 55.0], at: [-2.2, 14.1, 61.0], lens: 35 }] },
  { name: 'B4 FIRE', dur: 4, hour: NIGHT, tScene: B(62.5), move: 0, shake: [{ t: 2.0, k: 0.8, decay: 0.6 }], payoff: 2.0,
    keys: [{ u: 0, pos: [6.5, GUN5[1] + 0.4, GUN5[2] + 5.5], at: [GUN5[0] - 5, GUN5[1] + 1.2, GUN5[2] - 1.5], lens: 21 }] },
  { name: 'B5 round the stage from the water', dur: 4.5, hour: NIGHT, tScene: B(66.5), timing: 'arc',
    keys: [{ u: 0, pos: [-62, 6, -62], at: STAGE_C, lens: 24 }, { u: 0.5, pos: [-66, 7, -30], at: STAGE_C, lens: 24 }, { u: 1, pos: [-58, 8, 2], at: STAGE_C, lens: 24 }] },
  { name: 'B6 the 3-inch fires', dur: 3, hour: NIGHT, tScene: B(71.0), move: 0, payoff: 1.0, shake: [{ t: 1.0, k: 0.45, decay: 0.5 }],
    keys: [{ u: 0, pos: [3.2, 16.2, -57.4], at: [-1.6, 16.6, -63.6], lens: 35 }] },              // from its starboard quarter; it fires port bow
  { name: 'B7 the stage', dur: 3, hour: NIGHT, tScene: B(74.0), move: 0,
    keys: [{ u: 0, pos: [P.STAGE.x1 + 0.4, P.STAGE.floor + 1.6, P.STAGE.z1 + 4], at: [2, P.STAGE.floor + 2.2, -29], lens: 35 }] },
  { name: 'B8 the Oerlikons', dur: 4, hour: NIGHT, tScene: B(77.0), move: 0, payoff: 1.56,
    keys: [{ u: 0, pos: (g => [g.x - 4.2, S.toWorld(g.x, g.floorAbl, g.z)[1] + 2.2, S.toWorld(g.x, g.floorAbl, g.z)[2] + 4.5])(S.guns.gun20[3]),
             at: (g => S.toWorld(g.x, g.floorAbl + 1.4, g.z))(S.guns.gun20[3]), lens: 50 }] },
  // (the rise starts 2.9 m off rail flame unit 6's axis, outside its clearance: 2 m across and 8 m up for one or two
  // Salamanders, show.md P1; at MAIN[2] + 6 the lens sat 3.1 m straight above the unit, inside its own flame column)
  { name: 'B9 up the mainmast', dur: 5, hour: NIGHT, tScene: B(81.0),
    keys: [{ u: 0, pos: [6.5, 11.5, MAIN[2] + 8.5], at: [2, 13, MAIN[2] - 8], lens: 28 }, { u: 1, pos: [6.5, 26, MAIN[2] + 8.5], at: [1, 18, MAIN[2] - 14], lens: 28 }] },
  { name: 'B10 the ship on the bay', dur: 14, hour: NIGHT, tScene: B(86.0), move: 0, overlay: fadeOut(3, 14),
    keys: [{ u: 0, pos: (([x, z]) => [x, 22, z])(P.atBearing(300, 900)), at: [0, 14, -10], lens: 85 }] },
];

// the reel's sound plan for tools/soundscape: the song's window in part B, the camera per frame is film.track()
export function extendFilm(film, N) {
  film.song = { start: SHOTS.findIndex(s => s.name.startsWith('B1')), lead: SONG_LEAD };
  // everything projects/liberty/tools/soundscape.py needs, from the page: the camera per frame, each shot's scene clock,
  // every module's sound events (scene time, world position, dB SPL at 1 m), the song and where the PA throws it from
  //   node engine/render.mjs projects/liberty --query='size=320x180' --eval='JSON.stringify(LIBERTY.film.soundPlan())' > plan.json
  film.soundPlan = (fps = 24) => {
    const tr = film.track(fps);
    const events = [];
    for (const [mod, m] of Object.entries(N.ctx.mods)) if (m && Array.isArray(m.sounds)) for (const e of m.sounds) events.push(Object.assign({ mod }, e));
    const sh = N.show;
    return {
      fps, len: film.len, frames: tr.frames.map(f => ({ pos: f.pos.map(v => +v.toFixed(2)), at: f.at.map(v => +v.toFixed(2)), shot: f.shot })),
      shots: film.shots.map(s => ({ name: s.name, t0: s.t0, dur: s.dur, tScene: s.tScene, speed: s.speed || 1 })),
      events, song: { file: sh.audio, start: sh.start },
      // the PA: the K2 hangs either side of the stage's downstage edge, aimed at the apron (+x)
      pa: { pos: [P.STAGE.x1 + 0.5, P.STAGE.floor + 7.0, (P.STAGE.z0 + P.STAGE.z1) / 2], axis: [1, -0.25, 0], level1m: 134.5 },
    };
  };
}
