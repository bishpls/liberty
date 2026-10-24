// liberty/src/main.js: the SS Jeremiah O'Brien at Pier 35 as a concert stage, on the shared engine (engine/scene3d/host.js
// builds it and serves the loops and the sandbox). Stage lights, beams and lasers: engine/scene3d/stagelight.js; the
// show's one schedule: src/show (ctx.show).
//   render (engine/render.mjs --loop=...): boards and stills, a pure function of t (host.js lists the loop kinds)
//   sandbox (--serve, no ?render): fly the berth, change the hour, play the show
import { host, N } from 'scene3d/host.js';
import { SITE } from 'scene3d/sky.js';
import * as P from './plan.js';
import { MODULES } from './modules.js';
import { CAMS } from './cameras.js';
import { loadShow } from './show/index.js';
import { installLook } from './look.js';
import * as REEL from './film.js';
// the film: the tour (film_tour.js, the world and its effects, no music) by default; ?film=demo the concert reel (film.js)
const FILM = new URLSearchParams(location.search).get('film') === 'demo' ? REEL : await import('./film_tour.js');

export const LIBERTY = N;
// San Francisco on 31 October 2026 (plan.NIGHT); the ship's bow (-z) points 356.5 deg true (plan.HEADING)
SITE.lat = P.NIGHT.lat; SITE.decl = P.NIGHT.decl; SITE.northRot = P.NORTH_ROT;

// modules built only when ?solo names them, until each lands
const PENDING = ['stagetest'];          // (landed: hull, pier, water, deck, stage: first passes, 2026-10-23; life: B7's 9a6af75c5; far: B6's 55c43806c)
const show = await loadShow();

host({
  name: 'LIBERTY', modules: MODULES, cams: CAMS, ctx: { P, show }, always: ['ground'], required: ['ground'],
  optional: PENDING, wander: { bounds: P.WORLD.walk },
  // stage lights' budget: the stage 64 (with its transient flashes), the ship 12, the pier 12; lamps are world.light
  stage: { spots: 96, beams: 72 }, sky: 'physical', atmosphere: { turbidity: 12, alt: 20, below: 'horizon' }, far: P.WORLD.far,
  // the sandbox opens at the show's night (the reel's NIGHT, 19:59 PDT) from the water off her port side (CAMS.hall),
  // 6 s before the beams wake (scene 352: the show starts at 300), so a visitor sees the build, the beams and the drop
  hour: 19.1, t0: 352, tMax: 570,                       // (570: the show's song ends at scene ~566)
  assembly: { exclude: ['water', 'stagetest'], weak: [] },
  // the tour plays the page's assets/mix.wav (its own mix, made after picture lock); the concert reel its cut's mix
  film: { shots: FILM.SHOTS, extend: FILM.extendFilm, audio: FILM === REEL ? 'board/reel2/mix.wav' : undefined },
  setup(N) {
    N.P = P; N.show = show;
    N.pipe.U.uWaterLevel.value = P.WATER.level;
    installLook(N);
  },
});
