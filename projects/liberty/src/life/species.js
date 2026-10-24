// liberty/src/life/species.js: who flies here on the last evening of October (site.md §6), and the numbers each is measured
// against. Every value has its source in `src`; the flight model (flight.js, sim.js) reads only from here, so the measures
// compare the simulation with these same rows. Geometry (proportions, plumage) is the kit's preset (engine/scene3d/kit/
// creature/presets.js: gull, heermann, pelican, cormorant, pigeon).
//
// Units: metres, seconds, Hz, kg, m/s.
//   L, span, mass, S       body length, wingspan, mass, wing area (S for the wing loading and Pennycuick's formula)
//   f                      wingbeat frequency in cruising flight; fTake at take-off
//   U, Ulo, Uhi            cruising airspeed and the band the simulation may use; Usoar the slow soaring speed
//   style                  'flapglide' (bursts of beats, glides), 'flap' (continuous), 'skim' (pelicans: a few beats, a long
//                          glide in ground effect)
//   glide                  best glide ratio; sinkMin the minimum sink rate (m/s)
//   bankMax                the steepest bank the sim allows (deg); climb, descend: the steepest the path may take (m/s)
//   hours                  the share of the 'active' birds about at a local solar hour (piecewise linear): the evening's arc
//                          (busy at sunset 17.32, settling by civil dusk 17.77 and nautical dusk 18.28, roosting by night);
//                          roosting birds (residents) are there at every hour
//   startle                the flush: L50 (dB peak at the bird for half of them to flush), w (logistic width), latency
//                          (s, after the sound arrives), aloft (median s after the last blast before resettling), leave (the
//                          share displaced per blast heard aloft: ~1.2 % a blast, about a quarter over a show's ~25),
//                          returnAfter (s after the show's last blast)
//   calls                  { kind, level (dB SPL at 1 m) }
export const PENNY = (m, b, S, rho = 1.21) => Math.pow(m, 3 / 8) * Math.sqrt(9.81) * Math.pow(b, -23 / 24) * Math.pow(S, -1 / 3) * Math.pow(rho, -3 / 8);

const STARTLE_SRC = 'flush threshold estimated: half of them flush at ~135 dB peak at the bird (an impulse; ~105-115 dB(A) Fmax), above the 85-95 dB(A) at which unhabituated crested terns flee aircraft (Brown 1990, Environ Int 16:587), raised for harbour gulls habituated to the city (ferry horns, traffic); latency: a startled bird is off within ~0.1-0.4 s of hearing it (estimated: the acoustic startle and a crouch-and-spring take-off); aloft: "they resettle after a minute or so" (briefs/life.md), longer and higher with every blast, a share displaced with each (cumulative disturbance: black-headed gulls stayed aloft and displaced at New Year fireworks, roosts down 17-62 % the next days, Moser 2026 EcoEvoRxiv 11591)';

export const SPECIES = {
  gull: {
    name: 'western gull', latin: 'Larus occidentalis occidentalis', kit: 'gull',
    L: 0.60, span: 1.37, mass: 1.0, S: 0.20, f: 2.8, fTake: 3.6, U: 11.0, Ulo: 8.0, Uhi: 14.0, Usoar: 8.5,
    style: 'flapglide', flapBurst: [3, 8], glideS: [1.5, 5], glide: 11, sinkMin: 0.7, bankMax: 45, climb: 2.5, descend: 2.2,
    hours: [[15.5, 1], [17.3, 1], [17.8, 0.75], [18.3, 0.3], [18.8, 0.1], [21, 0.08]],
    startle: { L50: 135, w: 4, latency: [0.12, 0.45], aloft: [32, 55, 130], leave: 0.012, returnAfter: [120, 380] },
    calls: { kind: 'gull_call', level: 90, alarm: 'gull_alarm', alarmLevel: 92, wings: 'gull_takeoff', wingsLevel: 72 },
    src: {
      size: 'Cornell All About Birds: L 56-66 cm, span 130-144 cm, 0.8-1.4 kg; S est. 0.20 m2 (herring gull 1.14 kg, 1.34 m, 0.197 m2: Alerstam et al. 2007 PLoS Biol 5:e197, Protocol S1)',
      f: 'herring gull 2.5 +- 0.33 flaps/s (range 1.8-3.3, n 83: Condor 50:148, 1948, timed by hand); Pennycuick 1996 formula 3.7 Hz for these dimensions (it over-predicts corvids ~30 %, niwa): 2.8 Hz used',
      U: 'radar airspeeds: herring gull 12.8 +- 1.8 m/s, lesser black-backed 13.1, great black-backed 13.7 (Alerstam 2007 S1): commuting flight; local flights over the berth slower, 8-14 m/s (estimated)',
      soar: 'slope soaring in the updraft off the shed\'s windward (west) wall: the WSW wind\'s 3.2 m/s normal component (P.WATER.wind) against a gull\'s ~0.7 m/s minimum sink (estimated from a glide ratio ~11 at ~8.5 m/s)',
      hours: 'gulls feed by day and roost at night; at a lit urban waterfront some keep flying after dark (estimated)',
    },
  },
  heermann: {
    name: "Heermann's gull", latin: 'Larus heermanni', kit: 'heermann',
    L: 0.49, span: 1.27, mass: 0.5, S: 0.15, f: 3.1, fTake: 4.0, U: 10.5, Ulo: 8.0, Uhi: 13.0, Usoar: 8.0,
    style: 'flapglide', flapBurst: [4, 9], glideS: [1, 3.5], glide: 11, sinkMin: 0.6, bankMax: 45, climb: 2.5, descend: 2.2,
    hours: [[15.5, 1], [17.3, 1], [17.8, 0.75], [18.3, 0.3], [18.8, 0.1], [21, 0.08]],
    startle: { L50: 135, w: 4, latency: [0.1, 0.4], aloft: [32, 55, 130], leave: 0.015, returnAfter: [120, 380] },
    calls: { kind: 'gull_call', level: 86, alarm: 'gull_alarm', alarmLevel: 88, wings: 'gull_takeoff', wingsLevel: 68 },
    src: {
      size: "Cornell: L 46-53 cm, span 125-130 cm, 0.37-0.64 kg; post-breeding visitors to the bay in autumn (site.md §6)",
      f: 'Pennycuick formula 3.4 Hz, scaled like the western gull\'s (~0.85): 3.1 Hz (estimated)',
      U: 'between the common gull (13.4) and the black-headed gull (11.9, Alerstam 2007 S1); local flight 8-13 m/s (estimated)',
    },
  },
  pelican: {
    name: 'brown pelican', latin: 'Pelecanus occidentalis californicus', kit: 'pelican',
    L: 1.2, span: 2.03, mass: 3.5, S: 0.50, f: 2.4, fTake: 2.9, U: 11.0, Ulo: 9.0, Uhi: 13.5,
    style: 'skim', flapBurst: [3, 7], glideS: [3, 9], glide: 12, sinkMin: 0.7, bankMax: 30, climb: 2.0, descend: 2.5,
    skimH: [0.4, 1.4], lineN: [3, 8], spacing: [2.5, 4.5],
    hours: [[16.0, 1], [17.55, 1], [17.95, 0.45], [18.25, 0]],
    startle: null,
    calls: null,
    src: {
      size: 'Cornell: L 100-137 cm, span ~200 cm, 2-5 kg (californicus the heaviest, ~3.5 kg); S est. 0.50 m2',
      f: 'brown pelican (P. o. thagus) 2.3-2.5 flaps/s (Coker 1919, tabled in Condor 50:148, 1948); Pennycuick formula 3.0 Hz',
      skim: 'lines low over the water in ground effect, a few beats and a long glide: gliding induced-drag savings of ~49 % in ground effect, wingtips about a third of a metre over the water (Hainsworth 1988, J Exp Biol 135:431; the height as quoted in a review)',
      U: 'estimated 9-13 m/s skimming (the great white pelican cruises at 15.6, Bruderer & Boldt 2001 in Alerstam 2007 S1, at 2.4x the mass)',
      dive: 'plunge-dives from ~6-12 m (estimated), the wings swept back, entering bill first; it sits, swallows, and takes off running on the water',
      hours: 'lines fly to their night roosts (the breakwaters, Alcatraz) at dusk; none fly after dark (site.md §6; estimated)',
    },
  },
  cormorant: {
    name: 'double-crested cormorant', latin: 'Nannopterum auritum', kit: 'cormorant',
    L: 0.8, span: 1.2, mass: 1.7, S: 0.19, f: 4.3, fTake: 5.2, U: 14.0, Ulo: 11.0, Uhi: 17.0,
    style: 'flap', glide: 6, sinkMin: 1.2, bankMax: 35, climb: 1.6, descend: 2.0, lowH: [1.5, 4.5],
    hours: [[16.0, 1], [17.4, 0.8], [17.9, 0.2], [18.2, 0]],
    startle: { L50: 132, w: 4, latency: [0.15, 0.5], aloft: [120, 200, 400], leave: 0.04, returnAfter: [200, 450] },
    calls: { kind: 'cormorant_grunt', level: 70 },
    src: {
      size: 'Cornell: L 70-90 cm, span 114-123 cm, 1.2-2.5 kg; S est. 0.19 m2 (great cormorant 2.23 kg, 1.40 m, 0.224 m2: Alerstam 2007 S1)',
      f: 'Pennycuick formula 5.2 Hz; scaled like the gull (~0.82): 4.3 Hz (estimated); continuous flapping, little gliding (high wing loading ~88 N/m2)',
      U: 'great cormorant 15.2 +- 3.0 m/s (Alerstam 2007 S1); the smaller double-crested ~14 (estimated); flies low and straight over the water',
      dry: 'stands with its wings spread to dry on piles and docks (site.md §6, photo site 28)',
    },
  },
  pigeon: {
    name: 'rock pigeon', latin: 'Columba livia (feral)', kit: 'pigeon',
    L: 0.32, span: 0.64, mass: 0.33, S: 0.065, f: 5.6, fTake: 7.5, U: 13.0, Ulo: 9.0, Uhi: 17.0,
    style: 'flapglide', flapBurst: [6, 14], glideS: [0.4, 1.5], glide: 5, sinkMin: 1.4, bankMax: 55, climb: 3.0, descend: 3.0,
    hours: [[16.0, 0.5], [17.1, 1], [17.55, 0.8], [17.85, 0.1], [18.05, 0]],
    startle: { L50: 130, w: 4, latency: [0.1, 0.35], aloft: [30, 55, 110], leave: 0.01, returnAfter: [90, 240] },
    calls: { kind: 'pigeon_coo', level: 70, wings: 'pigeon_clap', wingsLevel: 80 },
    src: {
      size: 'Cornell: L 29-37 cm, span 50-67 cm, 265-380 g; S est. 0.065 m2 (stock dove 0.295 kg, 0.75 m, 0.053 m2: Alerstam 2007 S1)',
      f: 'homing pigeons 6.6 Hz near the release site, 5.3 near the loft; "known to be approximately 5 Hz" (PMC12899695, 2026); take-off faster, with the wings clapped over the back (estimated 7-8 Hz)',
      U: 'stock dove 15.8 +- 2.0, wood pigeon 16.3 +- 2.3 m/s (Alerstam 2007 S1); a flock wheeling over its roof 9-17 m/s (estimated)',
      flock: 'feral flocks wheel over their building at dusk before settling for the night (site.md §6: on the shed\'s ledges and eaves; estimated)',
    },
  },
};

// the moths in the lamps and the beams (moths.js)
export const MOTH = {
  name: 'moths (noctuids and geometrids)', span: [0.025, 0.045], f: 40, U: [0.5, 2.5], orbit: [0.4, 1.8],
  hours: [[17.9, 0], [18.4, 0.6], [18.9, 1], [23, 1]],
  src: {
    behaviour: 'insects at artificial light turn their backs to it (the dorsal light response): they orbit, stall and invert rather than fly into it (Fabian et al. 2024, Nat Commun 15:689)',
    f: 'noctuid moths 30-50 Hz (estimated)', season: 'late October evenings 15-17 C on the waterfront (site.md §5): moths still fly',
  },
};

// the activity share at an hour (piecewise linear on the rows; 0 outside)
export function activity(rows, h) {
  if (!rows || !rows.length) return 1;
  if (h <= rows[0][0]) return rows[0][1];
  for (let i = 0; i + 1 < rows.length; i++) {
    const [h0, a0] = rows[i], [h1, a1] = rows[i + 1];
    if (h <= h1) return a0 + (a1 - a0) * (h - h0) / (h1 - h0);
  }
  return rows[rows.length - 1][1];
}
// the share of a species flushing at a received peak level (dB)
export function flushP(sp, Lpk) { const s = SPECIES[sp].startle; if (!s) return 0; return 1 / (1 + Math.exp(-(Lpk - s.L50) / s.w)); }
