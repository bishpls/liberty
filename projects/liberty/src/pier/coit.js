// liberty/src/pier/coit.js: Coit Tower (1933, Arthur Brown Jr.): unpainted reinforced concrete, a fluted shaft 210 ft
// (64 m) on Telegraph Hill's summit (site.md §2: 87 m hill, top 151 m above the water). Its shaft is 37 ft (11.3 m)
// across (est. from photo 12: 64 m tall to ~5.7 widths); the observation level near the top opens in eight tall
// arches with balconies, a band of small arched windows above, a crown of arched openings (photos 12, 18). At night
// it's floodlit from its foot in a colour the city chooses (photo 18: orange; 19: cool white-violet): here Halloween's
// orange by default, a dial in the sandbox (world.control 'Coit colour').
import { latheAt, box, merge, cylinder } from './geo.js';
import { pierMat } from './mats.js';
import { COIT } from './site.js';
import { lin } from 'scene3d/util.js';

const T = window.THREE;
export const FLOOD = {
  orange: '#ff7a1c', white: '#f4ecdf', violet: '#9f8cff', red: '#ff3b3b', green: '#3dff8a', blue: '#4f8bff',
};

export function buildCoit(world, M, landAt, out) {
  const [cx, cz] = COIT.at, y0 = landAt(cx, cz), H = COIT.h, R = COIT.r;
  const col = new T.Vector3(...lin(FLOOD.orange));
  const mat = pierMat(world, {
    name: 'coit tower', lamps: false,
    uniforms: { uA: { value: new T.Vector3(...lin('#d9d5cc')) }, uFlood: { value: col }, uBase: { value: new T.Vector3(cx, y0, cz) }, uH: { value: H } },
    glsl: 'uniform vec3 uA, uFlood, uBase; uniform float uH;',
    body: /* glsl */`
      // concrete, two flat tones by the flutes' facing; the formwork's lifts every 1.5 m as faint lines
      vec3 c = uA * (0.9 + 0.1 * step(0.0, vnoise(P.xz * 3.0 + P.y * 0.2)));
      float h = P.y - uBase.y;
      c *= 1.0 - 0.06 * lines1(h, 1.52, 0.03);
      // the observation level's arches and the windows above, drawn on the top drum (h 46-60 m): uv.x is metres round
      float ang = atan(P.z - uBase.z, P.x - uBase.x);
      float open = 0.0;
      if (h > 45.5 && h < 61.0) {
        // eight tall arches 46.5-53 m: width 2.6 m, a round head
        float a8 = (fract(ang / 6.2831853 * 8.0 + 0.5) - 0.5) * 6.2831853 / 8.0 * ${R.toFixed(2)};   // metres from the arch's axis
        float y1 = h - 46.5;
        float arch = step(abs(a8), 1.3) * step(0.0, y1) * step(y1, 5.2) + step(length(vec2(a8, y1 - 5.2)), 1.3) * step(5.2, y1);
        // three small arched windows per bay at 55-57 m
        float a24 = (fract(ang / 6.2831853 * 24.0 + 0.5) - 0.5) * 6.2831853 / 24.0 * ${R.toFixed(2)};
        float y2 = h - 55.0;
        float win = step(abs(a24), 0.35) * step(0.0, y2) * step(y2, 1.3) + step(length(vec2(a24, y2 - 1.3)), 0.35) * step(1.3, y2);
        // the crown's openings 58.5-60.5 m
        float y3 = h - 58.6;
        float crown = step(abs(a8), 0.9) * step(0.0, y3) * step(y3, 1.0) + step(length(vec2(a8, y3 - 1.0)), 0.9) * step(1.0, y3);
        open = clamp(arch + win + crown, 0.0, 1.0);
      }
      c = mix(c, vec3(0.08, 0.08, 0.09), open);
      s.albedo = c; s.rough = 0.9;
      // the floodlights: from its foot, so the shaft is brightest low and fades up; the flutes facing a light take more
      float night = smoothstep(0.15, 0.6, uNight);
      float up = mix(1.0, 0.55, smoothstep(0.0, uH, h));
      float face = 0.75 + 0.25 * max(0.0, dot(normalize(vec3(s.N.x, 0.0, s.N.z)), normalize(vec3(P.x - uBase.x, 0.0, P.z - uBase.z))));
      s.emissive += uFlood * night * up * face * 0.55 * (1.0 - open);
      // the arches lit from inside, warm white (photo 18)
      s.emissive += vec3(1.0, 0.92, 0.8) * open * night * 1.4;
    `,
  });
  // the shaft: a fluted round (16 flutes) from the base's roof to the drum, the drum, the crown
  const prof = [[R * 1.04, 0], [R * 1.04, 0.6], [R, 0.8], [R * 0.985, 44.5], [R * 1.06, 45.0], [R * 1.06, 45.6], [R * 1.0, 45.8], [R * 1.0, 57.6], [R * 1.07, 58.0], [R * 1.07, 58.4], [R * 0.95, 58.5], [R * 0.95, 61.0], [R * 1.0, 61.2], [R * 1.0, 61.6], [R * 0.6, 61.8], [R * 0.6, H - 1.2], [0, H - 1.2]];
  const shaft = latheAt(prof, 64, cx, y0 + 6.0, cz, 0.4);
  // flutes: pull the vertices of the shaft's middle in by a cosine of the angle, between 1 m and 44 m
  { const p = shaft.attributes.position, n = shaft.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) - cx, z = p.getZ(i) - cz, y = p.getY(i) - y0 - 6.0, a = Math.atan2(z, x), rr = Math.hypot(x, z);
      if (y > 0.9 && y < 44.4 && rr > 0.1) {
        const k = 1 - 0.035 * (0.5 + 0.5 * Math.cos(a * 16));
        p.setX(i, cx + x * k); p.setZ(i, cz + z * k);
        const tilt = 0.4 * Math.sin(a * 16);
        n.setXYZ(i, Math.cos(a + tilt * 0.25), 0, Math.sin(a + tilt * 0.25));
      }
    } }
  // the base: the lobby (the murals' rooms), a terrace, the steps
  const base = merge([box([cx, y0 + 3.0, cz], [18, 6.0, 18], { seed: 0.4 }), box([cx, y0 + 0.4, cz + 4], [30, 0.8, 32], { seed: 0.4 }), box([cx, y0 + 6.3, cz], [18.6, 0.6, 18.6], { seed: 0.4 })]);
  world.mesh(merge([shaft, base]), mat, { name: 'coit:tower' });
  // the floodlight: the city's spot on the tower's foot is the tower's own (its emissive); the colour is a dial
  const names = Object.keys(FLOOD);
  let k = 0;
  world.control({ name: 'Coit colour', min: 0, max: names.length - 1, step: 1, get: () => k, set: v => { k = Math.round(v); mat.uniforms.uFlood.value.set(...lin(FLOOD[names[k]])); } });
  out.coit = { at: [cx, y0, cz], top: +(y0 + H).toFixed(1), base: +y0.toFixed(1), tri: 0 };
  return out.coit;
}
