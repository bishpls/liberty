// liberty/src/ground.js: what you stand on: the pier module's ground (the piers, the wharf, the land), the ship (the hull
// module's topAt once it is built: the highest deck, platform or roof under a point; the plan's weather deck until then).
// heightAt(x, z) -> y. Built first, so it reads the later modules lazily through ctx.
import * as P from './plan.js';

let CTX = null;
export function heightAt(x, z) {
  // the pier module's own ground (the piers' decks, the wharf, the land cut at the traced shore), when it is built
  const pier = CTX && CTX.mods.pier;
  if (pier && pier.groundAt) { const y = pier.groundAt(x, z); if (y !== null && y !== undefined) return y; }
  else if (P.PIER.inside(x, z)) return P.PIER.deck;
  const hull = CTX && CTX.mods.hull;
  if (hull && hull.topAt) { const y = hull.topAt(x, z); if (y !== null && y !== undefined) return y; }
  else if (P.SHIP && P.SHIP.deckAt) { const y = P.SHIP.deckAt(x, z); if (y !== null) return y; }
  return P.WATER.level;
}
export function build(world, ctx) {
  CTX = ctx;
  return { heightAt, measures: { pierDeck: P.PIER.deck } };
}
