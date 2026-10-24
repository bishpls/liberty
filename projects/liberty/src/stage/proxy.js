// liberty/src/stage/proxy.js: a stand-in ship from the plan's numbers (P.SHIP), drawn only under ?stageproxy=1 while
// the hull and deck modules haven't landed, so the stage can be looked at in place. Never part of the world: the
// hull (B1) and the deck (B2) are the ship. Low-poly: the hull's sides from the sheer and half-breadths, the deck with
// its camber, the bulwark, the hatches, mast houses and masts, the midship house's tiers, the funnel, the platforms.
import { box, lathe, merge, seedAttr } from 'scene3d/geom.js';
import { smat } from './mats.js';

const T = window.THREE;

export function buildProxy(world, P) {
  const S = P.SHIP, W = (x, abl, z) => S.toWorld(x, abl, z);
  const grey = smat(world, { name: 'proxy steel', uniforms: { uA: { value: new T.Vector3(0.19, 0.22, 0.24) } }, body: `toon(s, uA); s.rough = 0.7;` });
  const deckM = smat(world, { name: 'proxy deck', uniforms: { uA: { value: new T.Vector3(0.36, 0.38, 0.40) } }, body: `toon(s, uA); s.rough = 0.8;` });
  const tarp = smat(world, { name: 'proxy tarp', uniforms: { uA: { value: new T.Vector3(0.05, 0.16, 0.13) } }, body: `toon(s, uA); s.rough = 0.9;` });
  // the hull: the deck edge at the sheer, down to the waterline's datum (y -0.3 at each station), plus the deck surface
  const zs = []; for (let z = S.stemZ + 0.3; z <= S.sternZ - 0.3; z += 1.5) zs.push(z);
  const pos = [], idx = [], dpos = [], didx = [];
  const NX = 9;
  zs.forEach((z, i) => {
    const hb = Math.max(S.halfAt(z), 0.15), top = S.sideAbl(z);
    for (const s of [-1, 1]) {
      const a = W(s * hb, top + S.bulwark, z), b = W(s * hb, top, z), c = W(s * hb * 0.92, S.wlAbl(z) - 0.4, z);
      pos.push(...a, ...b, ...c);
    }
    for (let k = 0; k < NX; k++) { const x = (k / (NX - 1) - 0.5) * 2 * hb, a = S.deckAbl(x, z); dpos.push(...W(x, a === null ? top : a, z)); }
    if (i) {
      const o = (i - 1) * 6, n = i * 6;
      for (let s = 0; s < 2; s++) for (let r = 0; r < 2; r++) { const a = o + s * 3 + r, b = n + s * 3 + r; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      const od = (i - 1) * NX, nd = i * NX;
      for (let k = 0; k < NX - 1; k++) didx.push(od + k, od + k + 1, nd + k, nd + k, od + k + 1, nd + k + 1);
    }
  });
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); seedAttr(g, 0.5);
  const gm = new T.BufferGeometry(); gm.setAttribute('position', new T.Float32BufferAttribute(dpos, 3)); gm.setIndex(didx); gm.computeVertexNormals();
  gm.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(dpos.length / 3 * 2), 2)); seedAttr(gm, 0.5);
  const greyD = smat(world, { name: 'proxy hull', double: true, uniforms: { uA: { value: new T.Vector3(0.19, 0.22, 0.24) } }, body: `toon(s, uA); s.rough = 0.7;` });
  world.mesh(g, greyD, { name: 'proxy hull' });
  world.mesh(gm, deckM, { name: 'proxy deck' });
  // boxes placed in ship coordinates (centre x, abl of the bottom, z0..z1, width, height), turned by the trim
  const parts = [], tarps = [];
  const sbox = (x, abl0, z0, z1, w, h, list = parts) => { const c = W(x, abl0 + h / 2, (z0 + z1) / 2); const b = box(c, [w, h, z1 - z0]); list.push(rotTrim(b, c, S.trim)); };
  for (const n of [1, 2, 3, 4, 5]) {
    const h = S.hatches[n], zc = (h.z0 + h.z1) / 2, d0 = S.deckAbl(0, zc);
    sbox(0, d0 - 0.2, h.z0, h.z1, h.half * 2, S.hatches.coaming + 0.2);
    sbox(0, d0 + S.hatches.coaming, h.z0 + 0.05, h.z1 - 0.05, h.half * 2 - 0.1, 0.06, tarps);
  }
  for (const m of [S.masts.fore, S.masts.main, S.masts.mizzen]) {
    const d0 = S.deckAbl(0, m.z);
    sbox(0, d0 - 0.2, m.house[0], m.house[1], S.masts.houseHalf * 2, m.houseTop - d0 + 0.2);
    const top = d0 + (m.top || m.above), c = W(0, (d0 + top) / 2, m.z);
    parts.push(rotTrim(lathe([[0.42, -(top - d0) / 2], [0.38, 0], [0.22, (top - d0) / 2]], 10).translate(c[0], c[1], c[2]), c, S.trim));
  }
  const Hs = S.house, d0h = S.deckAbl(0, (Hs.main.z0 + Hs.main.z1) / 2);
  sbox(0, d0h - 0.2, Hs.main.z0, Hs.main.z1, Hs.main.half * 2, Hs.boat.abl - d0h + 0.2);
  sbox(0, Hs.boat.abl - 0.1, Hs.boat.z0, Hs.boat.z1, S.beam - 0.4, 0.2);
  sbox(0, Hs.boat.abl, Hs.boat.house[0], Hs.boat.house[1], Hs.boat.houseHalf * 2, Hs.bridge.abl - Hs.boat.abl);
  sbox(0, Hs.bridge.abl - 0.1, Hs.bridge.z0, Hs.bridge.z1, Hs.bridge.half * 2, 0.2);
  sbox(0, Hs.bridge.abl, Hs.top.z0, Hs.top.z1, Hs.top.half * 2, Hs.top.abl - Hs.bridge.abl);
  { const f = Hs.funnel, c = W(0, (Hs.top.abl + f.cap) / 2, f.z); parts.push(rotTrim(lathe([[1.5, -(f.cap - Hs.top.abl) / 2], [1.5, (f.cap - Hs.top.abl) / 2]], 16).translate(c[0], c[1], c[2]), c, S.trim)); }
  { const b = S.bow.platform; sbox(0, b.abl - 0.3, b.z0, b.z1, 7.5, 0.3); const st = S.stern.deckhouse; sbox(0, S.deckAbl(0, st.z0) - 0.2, st.z0, st.z1, 9, st.wall + 0.2); const sp = S.stern.platform; sbox(0, sp.abl - 0.3, sp.z0, sp.z1, sp.width, 0.3); }
  const pm = world.mesh(merge(parts), grey, { name: 'proxy works' });
  world.mesh(merge(tarps), tarp, { name: 'proxy tarps' });
  // stoppers for the beams: the deck and the boxes
  if (world.stage) { world.stage.stopper(new T.Mesh(gm, new T.MeshBasicMaterial())); world.stage.stopper(new T.Mesh(pm.geometry, new T.MeshBasicMaterial())); }
  return { deckAt: null };
}

function rotTrim(g, c, trim) {
  g.translate(-c[0], -c[1], -c[2]); g.rotateX(trim); g.translate(c[0], c[1], c[2]);
  return g;
}
