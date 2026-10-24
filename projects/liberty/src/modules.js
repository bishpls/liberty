// liberty/src/modules.js: the world's builders, in build order. Each module exports
//   build(world, ctx)          adds its objects (world.mesh / world.add), lights (world.light, world.stage.spot),
//                              per-frame updates (world.onFrame); returns what later modules read (ctx.mods[name])
//   CAMS (optional)            bookmarks it adds (prefixed with its name)
//   loops(LOOPS, ctx) (opt.)   boards of its own (render.mjs --loop=NAME)
// ctx = { P (plan.js), M (materials palette), show (the show's schedule), heightAt(x, z), ground, mods, LIBERTY }.
// ?solo=hull,deck builds only those (ground always): quick iteration on one part. A module stays optional (built only
// when ?solo names it) until it lands (main.js PENDING).
export const MODULES = [
  ['ground', () => import('./ground.js')],          // integrator: what you stand on (water, pier, decks), the sea bed
  ['hull', () => import('./hull/index.js')],        // B1: the hull, the decks, the houses, the plating, the paint's history
  ['deck', () => import('./deck/index.js')],        // B2: masts, booms, rigging, winches, hatches, boats, vents, the guns
  ['pier', () => import('./pier/index.js')],        // B4: Pier 35, its neighbours, the waterfront, the city, the far view
  ['water', () => import('./water/index.js')],      // B3: the bay's surface (reads hull.waterline, pier.piles, deck.guns), the wakes, the life on it
  ['stage', () => import('./stage/index.js')],      // B5: the stage, the rig, lasers, pyro, the guns' fire and smoke
  ['life', () => import('./life/index.js')],        // B7: the birds in the air and on their perches, and their answer to the show
  ['far', () => import('./far/index.js')],          // B6: the far view: the land beyond the near box, the islands, the bridges, the skyline
  ['stagetest', () => import('./tests/stagetest.js')],   // (the stage lights' probe)
];
