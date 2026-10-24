// liberty/src/water/events.js: the events on the water (rings: splashes, the guns' blast rings) and the boats' Kelvin
// wakes, as GLSL for the sea's state pass (state.js): moved out of shade.js so the shading's program carries none of it.
import { NRIP, NWAKE, NSEG } from './surface.js';
import { FLOW_GLSL } from 'scene3d/flow.js';

export const EVENTS_GLSL = /* glsl */`
// events: rings and wakes -> slope (xy), the chop's calm factor (z: 1 none .. 0 flattened), a darkening (w)
float gRingLine = 0.0;            // (eventsAt's: E7's shock-ring line and hairlines)
vec4 eventsAt(vec2 p, float t, float fp, vec2 dpx, vec2 dpy, out float foam) {
  vec4 o = vec4(0.0, 0.0, 1.0, 0.0); foam = 0.0; gRingLine = 0.0;
  for (int i = 0; i < ${NRIP}; i++) {
    if (i >= uNumRip) break;
    vec4 r = uRip[i], rb = uRipB[i];
    float age = t - r.z; if (age < 0.0) continue;
    vec2 d = p - r.xy; float dist = length(d) + 1e-3; vec2 dir = d / dist;
    int kind = int(rb.x + 0.5);
    // (only a ring that has reached this point: a blast's sphere at 343 m/s within its reach; a splash's train, its
    // longest waves leading at their group speed, within ~3 + 1.6 age m)
    if (kind == 1 ? (dist > min(343.0 * age + 30.0, rb.y * 1.3)) : (dist > 3.0 + 1.6 * age)) continue;
    if (kind == 1) {
      // a gun's blast: the overpressure front runs out at 343 m/s; where it passes it flattens the chop and darkens the
      // water (a ring of calm), the band widening and fading in under a second
      if (age > 1.2) continue;
      float front = sqrt(max(0.0, pow(343.0 * age, 2.0) - rb.z * rb.z)), w = 1.5 + 18.0 * age;   // (the sphere from the muzzle, rb.z up, meets the water)
      float band = exp(-pow((dist - front) / w, 2.0)) * r.w * exp(-age * 2.5) * smoothstep(rb.y * 1.2, rb.y * 0.2, dist);
      o.z *= 1.0 - 0.85 * band; o.w += 0.8 * band;
      // E7 (style.md): the ring drawn as a line 6-10 px wide at 1280 with radial hairlines (3-5 px, 80-200 px long),
      // for its first 3-5 frames
      if (age < 0.21 && front > 0.0) {
        float lw = 3.5 * (abs(dot(dir, dpx)) + abs(dot(dir, dpy))) + 0.02;   // (~7 px across, whatever the distance)
        float life = smoothstep(0.21, 0.12, age) * r.w * smoothstep(rb.y * 1.2, rb.y * 0.4, dist);
        float ring = exp(-pow((dist - front) / lw, 2.0));
        float ang = atan(d.y, d.x), hid = floor(ang * 9.549 + 0.5);                // (60 hairlines round the ring)
        float hl = smoothstep(0.35, 0.0, abs(fract(ang * 9.549 + 0.5) - 0.5) * 6.2832 * dist / max(fp * 2.0, 0.05))
          * step(0.45, hash11(hid + floor(r.z * 7.0))) * smoothstep(front - 25.0 - 30.0 * hash11(hid * 1.7), front - 2.0, dist) * step(dist, front);
        gRingLine = max(gRingLine, max(ring, hl * 0.8) * life);
      }
      // the spray it lifts under the muzzle: a disc of white water, fading
      float core = exp(-pow(dist / (1.0 + 4.0 * age), 2.0)) * r.w * exp(-age * 3.0);
      foam += core;
    } else {
      // a splash: the Cauchy-Poisson ring train (deep water, gravity): phase g t^2 / 4r, the local wavenumber
      // g t^2 / 4 r^2 (long waves lead, short ones trail); faded where finer than the pixel
      if (age > 12.0) continue;
      float k = G_ * age * age / (4.0 * dist * dist);
      float lam = 6.2832 / max(k, 1e-3);
      float fade = 1.0 - smoothstep(0.12, 0.4, fp / lam);
      float env = r.w * exp(-age * 0.35) / (1.0 + dist * 0.6) * exp(-0.25 * pow(k * max(rb.y, 0.05), 2.0));     // (a source of size rb.y makes no waves much shorter than itself)
      float ph = G_ * age * age / (4.0 * dist);
      o.xy += dir * k * sin(ph) * env * 0.02 * fade;
      foam += exp(-pow(dist / (0.25 + 0.6 * age), 2.0)) * r.w * exp(-age * 1.5) * 0.8;
    }
  }
  return o;
}


// the boats' Kelvin wakes (boats.js): in each track's own frame (x behind the boat along its track, y across it) the
// two wave systems by stationary phase: at r = |y| / x the wave angle th solves 2 r tan^2 th - tan th + r = 0 (the
// transverse root and the divergent one), each with k = g / (U^2 cos^2 th) and phase k (x cos th + |y| sin th); the
// wedge ends at r = 1 / (2 sqrt 2) (19.47 deg) where the two meet (the cusps). -> slope (xy), height (z), foam (w);
// cusp (the cusp lines, for W6's white lines)
vec4 wakesAt(vec2 p, float fp, out float cusp, out float wvar) {
  vec4 o = vec4(0.0); cusp = 0.0; wvar = 0.0;
  for (int i = 0; i < ${NWAKE}; i++) {
    if (i >= uNumWk || uDbg2.x > 0.5) break;
    vec4 bx = uWkBox[i];
    if (p.x < bx.x || p.x > bx.z || p.y < bx.y || p.y > bx.w) continue;
    vec4 A = uWkA[i], B = uWkB[i];
    // (only behind the boat, within the wake's reach and a loose cone round its wake: no track search elsewhere)
    vec2 rel = p - A.xy; float rl = length(rel);
    if (rl > 820.0 || (rl > 60.0 && dot(rel, -A.zw) < 0.35 * rl)) continue;
    // the nearest point on the track: its distance back from the boat, the side, the age there. Coarse first (every
    // fourth sample), then the segments either side of the coarse winner
    int kb = 0; float bc = 1e18;
    for (int k = 0; k < ${NSEG}; k += 4) { vec2 d0 = p - uWkTrack[i * ${NSEG} + k].xy; float dd = dot(d0, d0); if (dd < bc) { bc = dd; kb = k; } }
    float best = 1e9, sb = 0.0, yb = 0.0, ag = 0.0; vec2 tb = A.zw;
    for (int k2 = 0; k2 < 8; k2++) {
      int k = clamp(kb - 4, 0, ${NSEG - 2}) + k2; if (k > ${NSEG - 2}) break;
      vec4 a = uWkTrack[i * ${NSEG} + k], b = uWkTrack[i * ${NSEG} + k + 1];
      vec2 d = b.xy - a.xy; float l2 = dot(d, d); if (l2 < 1e-4) continue;
      float u = clamp(dot(p - a.xy, d) / l2, 0.0, 1.0);
      vec2 q = a.xy + d * u; float dd = distance(p, q);
      if (dd < best) { best = dd; sb = mix(a.z, b.z, u); ag = mix(a.w, b.w, u); tb = normalize(-d); yb = (d.x * (p.y - a.y) - d.y * (p.x - a.x)) / sqrt(l2); }
    }
    float x = sb, y = abs(yb), U = B.x, L = B.y, Bm = B.z;
    // ahead of the stern (beside the boat): only the hull's own collar (the contact froth)
    if (x < 0.5 * L) continue;
    float r = y / x, edge = 0.3536;
    float wedge = 1.0 - smoothstep(edge * 0.92, edge * 1.04, r);
    if (wedge <= 0.0) continue;
    float kt = 9.81 / (U * U), amp = B.w * sqrt(L / max(x, L)) * exp(-ag / 160.0) * smoothstep(800.0, 400.0, x);
    float rr = min(r, edge * 0.999), disc = sqrt(max(1.0 - 8.0 * rr * rr, 0.0));
    vec2 dirT = tb, dirN = vec2(-tb.y, tb.x) * sign(yb);         // (behind along the track; out to this side)
    for (int br = 0; br < 2; br++) {
      float tn = br == 0 ? (1.0 - disc) / (4.0 * max(rr, 1e-4)) : (1.0 + disc) / (4.0 * max(rr, 1e-4));
      if (br == 0 && rr < 1e-3) tn = 0.0;
      float th = atan(tn), c = cos(th), sn = sin(th), k = kt / (c * c);
      float lam = 6.2832 / k, fade = 1.0 - smoothstep(0.12, 0.4, fp / lam);
      // the transverse system weakens toward the cusp, the divergent one is strongest along it (Airy: a cusp's height)
      float a = amp * (br == 0 ? 0.55 * (1.0 - 0.6 * rr / edge) : 0.45 + 0.9 * exp(-pow((r - edge) / 0.025, 2.0))) * wedge;
      // (a wave's steepness a k held under 0.2, as the sea holds it (steeper breaks): unclamped near the cusp it reached
      // 1, and its unresolved part, a k^2 / 2 of variance, tilted the far water's reference sky to the zenith: a dark band
      // in the reference and a pale arc in the steps across the whole wake, the director's review)
      a = min(a, 0.2 / k);
      float ph = k * (x * c + y * sn);
      vec2 kv = k * (dirT * c + dirN * sn);
      o.xy -= a * fade * sin(ph) * kv; o.z += a * fade * cos(ph);
      wvar += (1.0 - fade) * 0.5 * a * a * k * k;
    }
    // (the cusp drawn as a white line only a few boat lengths back, where it breaks white: drawn the whole 800 m it ran
    // straight across the bay, a seam in the director's review; the waves themselves go on in the slope)
    cusp = max(cusp, exp(-pow((r - edge * 0.97) / (0.012 + fp / max(x, 1.0)), 2.0)) * wedge * smoothstep(1.0, 0.0, ag / 300.0) * smoothstep(L * 0.5, L * 1.5, x) * exp(-x / (4.0 * L)));
    // the propeller's churn: a foam strip as wide as the boat, spreading, fading over ~2 minutes
    float sw = Bm * 0.5 * (1.0 + 0.03 * x);
    o.w = max(o.w, (1.0 - smoothstep(sw * 0.7, sw, y)) * exp(-ag / 90.0) * smoothstep(L * 0.4, L * 0.8, x));
  }
  return o;
}

// the piles', the hull's and the barge's wakes in the ebb: the engine's flowWake (engine/scene3d/flow.js FLOW_GLSL,
// appended below): current past obstacles at their Reynolds and Froude numbers. (Until round 8 the piles drew their own
// here: three foam streaks 10 m long, the V's lines and the swirls' arcs, a dozen bright scratches a pile: the
// integrator's tour T4 at 39 s)
`.replace(/G_/g, '9.81') + FLOW_GLSL;
