// liberty/src/water/piles.js: the piles that stand in the ebb (ctx.mods.pier.piles: the bents' outer rows at the tip
// and the east edge, the fenders): which are live (in a current worth a wake, under the sky, clear of her side) and
// where the ebb gurgles loudest round them (the soundscape's beds). Their wakes are the engine's (engine/scene3d/flow.js,
// round 8: index.js hands the live ones to bakeObstacleField with the hull's ends and the barge); until round 8 this
// file baked its own pile map for events.js's pilesAt, which drew a dozen bright scratches a pile.
// piles: [x, z, r] (Pier 35's bents and fenders) or [x, 0, z] (the bulkhead's wharf; r 0.25). vAt(x, z) -> { vx, vz, sky }
// (minU 0.25 m/s: slower, a pile's wake is a dimple no drawing shows; minHull 8 m: the lee between her and the pier, whose
// 2.1 m gap the 8 m current grid can't resolve, stays still, as the brief asks)
export function pileWakeMap(piles, vAt, { minU = 0.25, minSky = 0.3, minHull = 8, hullAt = null } = {}) {
  const P = piles.map(p => (p[1] === 0 && Math.abs(p[2]) > 1 ? [p[0], p[2], 0.25] : [p[0], p[1], p[2]]));
  // live: in a current worth a wake, and where the sky still reaches (under the deck the cave hides it)
  const live = [];
  for (const [x, z, r] of P) {
    const e = vAt(x, z), U = Math.hypot(e.vx, e.vz);
    const hd = hullAt ? hullAt(x, z) : null;
    if (U > minU && (e.sky ?? 1) > minSky && !(hd && hd.d < minHull)) live.push([x, z, r, U, e.vx / U, e.vz / U]);
  }
  if (!live.length) return { live: 0, livePiles: [], piles: P.length, loud: [] };
  // where the ebb gurgles loudest round them (the soundscape's beds): the fastest live piles, 10 m apart at least
  const loud = [];
  for (const p of live.slice().sort((a, b) => b[3] - a[3])) if (loud.length < 6 && loud.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > 10)) loud.push(p);
  return { live: live.length, livePiles: live, piles: P.length, loud: loud.map(([x, z, r, U]) => ({ x, z, r, U: +U.toFixed(2) })) };
}
