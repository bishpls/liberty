// engine/scene3d/kit/creature/presets.js: species for the kit's bird (bird.js). Proportions in metres, from field-guide
// measurements (wing = the folded wing's length, wrist to tip; tail; bill = culmen; tarsus), spans and masses from the
// sources in niwa's life_species.js (Alerstam et al. 2007, HBW, Bird Research News 2005, Park et al. 2001).
//   body [length, width, height] of the torso alone; head = its radius; neck [length, radius]; neckPose [drawn-in,
//   extended] lengths from the neck's base to the head's centre, neckAngle its default (degrees above the body's axis);
//   bill [length, depth, width, hook]; leg [tibia (the visible part), tarsus, middle toe, radius]
//   wing: primaries, secondaries, tertials; chord (secondary length / wing length); pmax (which primary is longest,
//   0 inner .. 1 outer), pin / pout (the innermost / outermost primary's length as a share of the longest); fanOut (the
//   outermost primary's angle toward the tip, deg); fingers (emarginated primaries) and slot (how deep); pw (primary
//   width / wing length); betaH, betaF, betaM (the spread bones' angles: humerus back, forearm forward, hand back, deg);
//   fh (forearm / humerus)
//   stroke: amp (total, deg), mean (deg), down (the downstroke's share of the cycle), flex (the upstroke's wrist flex,
//   0..1: passerines fold the hand, big soarers barely), sweep (deg fore-aft), lag (the hand's lag, deg), glide (glide
//   dihedral, deg), glideFlex
//   colours: 0-5 the pattern's, 6 legs and feet, 7 bill (sRGB; feather reflectances: black 3-5%, white 70-80%)
const DEG = 1;
export const BIRDS = {
  crow: {
    perch: { pitch: 14, tail: 14 },
    name: 'jungle crow', L: 0.565, span: 1.05, wingLen: 0.35, tailLen: 0.22, tailN: 12, tailW: 0.034, tailRound: 0.35, tailFan: 95,
    body: [0.20, 0.105, 0.11], head: 0.034, neck: [0.035, 0.03], neckPose: [0.032, 0.05], neckAngle: 34, bill: [0.068, 0.03, 0.021, 0.14], eye: 0.0055,
    leg: [0.05, 0.062, 0.045, 0.0045], shoulder: [0.035, 0.046, 0.034], standH: 0.112,
    wing: { primaries: 10, secondaries: 11, tertials: 3, chord: 0.6, pmax: 0.72, pin: 0.45, pout: 0.55, fanOut: -62, fingers: 5, slot: 0.42, pw: 0.11, betaH: -22, betaF: 14, betaM: -6, fh: 1.15 },
    stroke: { amp: 92, mean: 8, down: 0.55, flex: 0.38, sweep: 12, lag: 14, glide: 4, glideFlex: 0.12 },
    pattern: 0, sheen: 1, colors: ['#2a2a30', '#34302e', '#2a2a30', '#2a2a30', '#2a2a30', '#202024', '#262628', '#1e1e20'],
  },
  kite: {
    perch: { pitch: 38, tail: 0 },
    name: 'black kite', L: 0.60, span: 1.52, wingLen: 0.48, tailLen: 0.29, tailN: 12, tailW: 0.045, tailFork: 0.16, tailFan: 75,
    body: [0.24, 0.13, 0.13], head: 0.036, neck: [0.04, 0.034], neckPose: [0.036, 0.055], neckAngle: 28, bill: [0.042, 0.024, 0.016, 0.65], eye: 0.0062,
    leg: [0.06, 0.055, 0.04, 0.006], shoulder: [0.05, 0.055, 0.042], standH: 0.11,
    wing: { primaries: 10, secondaries: 13, tertials: 3, chord: 0.55, pmax: 0.62, pin: 0.5, pout: 0.66, fanOut: -70, fingers: 6, slot: 0.5, pw: 0.09, betaH: -18, betaF: 12, betaM: -4, fh: 1.2 },
    stroke: { amp: 70, mean: 6, down: 0.55, flex: 0.22, sweep: 8, lag: 10, glide: 7, glideFlex: 0.06 },
    pattern: 1, sheen: 0, colors: ['#3a2a1e', '#4c3828', '#86705a', '#241c18', '#b8ac98', '#2e241c', '#c4a848', '#2e2e30'],
  },
  sparrow: {
    perch: { pitch: 24, tail: 8 },
    name: 'tree sparrow', L: 0.14, span: 0.21, wingLen: 0.07, tailLen: 0.055, tailN: 12, tailW: 0.011, tailFork: 0.06, tailFan: 70,
    body: [0.065, 0.042, 0.044], head: 0.0148, neck: [0.008, 0.013], neckPose: [0.013, 0.018], neckAngle: 40, bill: [0.0115, 0.0095, 0.008, 0.1], eye: 0.0028,
    leg: [0.016, 0.017, 0.014, 0.0011], shoulder: [0.011, 0.017, 0.013], standH: 0.029,
    wing: { primaries: 10, secondaries: 6, tertials: 3, chord: 0.62, pmax: 0.65, pin: 0.6, pout: 0.5, fanOut: -55, fingers: 0, slot: 0, pw: 0.13, betaH: -25, betaF: 15, betaM: -10, fh: 1.2 },
    stroke: { amp: 128, mean: 14, down: 0.52, flex: 0.62, sweep: 16, lag: 20, glide: 0, glideFlex: 0.25 },
    pattern: 2, sheen: 0, colors: ['#7b5a3e', '#8c6c4c', '#7a3c22', '#c8c0b0', '#ece8df', '#1c1814', '#a88870', '#1e1c1a'],
  },
  heron: {
    perch: { pitch: 30, tail: -5 },
    name: 'grey heron', L: 0.93, span: 1.73, wingLen: 0.46, tailLen: 0.18, tailN: 12, tailW: 0.042, tailRound: 0.3, tailFan: 80,
    body: [0.30, 0.15, 0.17], head: 0.032, neck: [0.36, 0.026], neckPose: [0.12, 0.38], neckAngle: 72, bill: [0.12, 0.03, 0.017, 0.0], eye: 0.006,
    leg: [0.24, 0.165, 0.10, 0.0085], shoulder: [0.07, 0.068, 0.056], standH: 0.385, foldPlane: -74,
    wing: { primaries: 10, secondaries: 19, tertials: 4, chord: 0.62, pmax: 0.62, pin: 0.55, pout: 0.62, fanOut: -60, fingers: 4, slot: 0.25, pw: 0.1, betaH: -20, betaF: 12, betaM: -6, fh: 1.25 },
    stroke: { amp: 82, mean: -6, down: 0.56, flex: 0.28, sweep: 8, lag: 12, glide: -8, glideFlex: 0.15 },
    pattern: 3, sheen: 0, colors: ['#83868c', '#a6a9ae', '#d4d4d0', '#e6e6e2', '#6e7076', '#1e1e22', '#9e8c52', '#cfa83c'],
  },
  egret: {
    perch: { pitch: 34, tail: -5 },
    name: 'little egret', L: 0.60, span: 0.95, wingLen: 0.27, tailLen: 0.10, tailN: 12, tailW: 0.026, tailRound: 0.3, tailFan: 80,
    body: [0.20, 0.10, 0.11], head: 0.02, neck: [0.24, 0.016], neckPose: [0.08, 0.26], neckAngle: 72, bill: [0.08, 0.016, 0.01, 0.0], eye: 0.004,
    leg: [0.13, 0.10, 0.065, 0.005], shoulder: [0.045, 0.044, 0.036], standH: 0.24, foldPlane: -74,
    wing: { primaries: 10, secondaries: 15, tertials: 4, chord: 0.62, pmax: 0.62, pin: 0.55, pout: 0.6, fanOut: -60, fingers: 3, slot: 0.2, pw: 0.1, betaH: -20, betaF: 12, betaM: -6, fh: 1.25 },
    stroke: { amp: 85, mean: -4, down: 0.55, flex: 0.3, sweep: 8, lag: 12, glide: -6, glideFlex: 0.15 },
    // white plumage (the breeding season's plumes on the back), a black bill and legs, the yellow feet
    pattern: 3, sheen: 0, colors: ['#ecece8', '#f2f2ee', '#f4f4f0', '#f6f6f2', '#e8e8e4', '#e8e8e4', '#1e1e1e', '#1a1a1c'], feet: '#d8c040',
  },
  mejiro: {
    perch: { pitch: 28, tail: 6 },
    name: 'Japanese white-eye', L: 0.115, span: 0.175, wingLen: 0.058, tailLen: 0.042, tailN: 12, tailW: 0.0085, tailFan: 60,
    body: [0.052, 0.034, 0.035], head: 0.0122, neck: [0.006, 0.0105], neckPose: [0.0105, 0.015], neckAngle: 40, bill: [0.0105, 0.0048, 0.0048, 0.15], eye: 0.0029,
    leg: [0.013, 0.016, 0.012, 0.0009], shoulder: [0.009, 0.014, 0.01], standH: 0.025,
    wing: { primaries: 10, secondaries: 6, tertials: 3, chord: 0.62, pmax: 0.62, pin: 0.6, pout: 0.55, fanOut: -55, fingers: 0, slot: 0, pw: 0.13, betaH: -25, betaF: 15, betaM: -10, fh: 1.2 },
    stroke: { amp: 130, mean: 14, down: 0.52, flex: 0.62, sweep: 16, lag: 20, glide: 0, glideFlex: 0.25 },
    pattern: 4, sheen: 0, colors: ['#7a8636', '#86903e', '#c4b23c', '#cecdc0', '#b0a28c', '#464a2c', '#6a6a72', '#2a2a2e'],
  },
  swallow: {
    perch: { pitch: 18, tail: 0 },
    name: 'barn swallow', L: 0.175, span: 0.32, wingLen: 0.122, tailLen: 0.05, tailN: 12, tailW: 0.011, tailFork: 0.3, tailStreamer: 1.15, tailFan: 70,
    body: [0.065, 0.04, 0.038], head: 0.0132, neck: [0.006, 0.011], neckPose: [0.0115, 0.014], neckAngle: 24, bill: [0.0075, 0.0042, 0.0095, 0.1], eye: 0.003,
    leg: [0.009, 0.0105, 0.009, 0.0008], shoulder: [0.014, 0.015, 0.012], standH: 0.017,
    wing: { primaries: 10, secondaries: 6, tertials: 3, chord: 0.38, pmax: 0.94, pin: 0.32, pout: 0.95, fanOut: -76, fingers: 0, slot: 0, pw: 0.1, betaH: -30, betaF: 25, betaM: -18, fh: 1.1 },
    stroke: { amp: 95, mean: 6, down: 0.55, flex: 0.45, sweep: 10, lag: 16, glide: 2, glideFlex: 0.3 },
    pattern: 5, sheen: 1, colors: ['#232a40', '#232a40', '#9a3a24', '#ece2cc', '#ece2cc', '#141418', '#2a2424', '#141414'],
  },
  bulbul: {
    perch: { pitch: 32, tail: 4 },
    name: 'brown-eared bulbul', L: 0.27, span: 0.40, wingLen: 0.126, tailLen: 0.115, tailN: 12, tailW: 0.02, tailRound: 0.1, tailFan: 60,
    body: [0.095, 0.055, 0.058], head: 0.022, neck: [0.012, 0.018], neckPose: [0.02, 0.028], neckAngle: 42, bill: [0.024, 0.0085, 0.007, 0.25], eye: 0.0042,
    leg: [0.024, 0.023, 0.02, 0.0016], shoulder: [0.018, 0.024, 0.02], standH: 0.043,
    wing: { primaries: 10, secondaries: 6, tertials: 3, chord: 0.6, pmax: 0.62, pin: 0.55, pout: 0.55, fanOut: -58, fingers: 0, slot: 0, pw: 0.12, betaH: -24, betaF: 15, betaM: -8, fh: 1.2 },
    stroke: { amp: 115, mean: 12, down: 0.53, flex: 0.55, sweep: 14, lag: 18, glide: 2, glideFlex: 0.2 },
    pattern: 6, sheen: 0, colors: ['#5a5c62', '#4c4e54', '#6e3e2a', '#86888c', '#74767c', '#34343a', '#3a3632', '#1e1e20'],
  },
  // ---- the waterfront's birds (liberty, B7, 2026-10-23). Sizes: Cornell's All About Birds (length, span, mass) and Pyle's
  // Identification Guide to North American Birds II (wing chord, tail, culmen, tarsus); spans and wing areas for the
  // flight model in projects/liberty/src/life/species.js with their sources. Patterns 7-11 (bird.js): a share `juvenile`
  // of each kind draws in its first-winter plumage (the instance's seed below it); pigeons draw the feral morphs by seed.
  // webbed: the front toes joined by webs (gulls, pelicans, cormorants)
  gull: {
    perch: { pitch: 10, tail: 8 },
    // western gull (Larus occidentalis occidentalis, SF's resident): L 56-66 cm, span 130-144 cm, 0.8-1.4 kg; wing chord
    // 380-440 mm, tail 160-185, culmen 50-58 (gonys 20-22 deep), tarsus 62-72 (Pyle); the slate mantle (photo site 29),
    // black wingtips with white mirrors, the yellow bill's red gonys spot, pink legs
    name: 'western gull', L: 0.60, span: 1.37, wingLen: 0.41, tailLen: 0.165, tailN: 12, tailW: 0.04, tailRound: 0.05, tailFan: 70,
    body: [0.25, 0.13, 0.125], head: 0.036, neck: [0.06, 0.035], neckPose: [0.045, 0.085], neckAngle: 30, bill: [0.055, 0.021, 0.014, 0.18], eye: 0.0055,
    leg: [0.07, 0.066, 0.06, 0.0055], shoulder: [0.05, 0.029, 0.035], standH: 0.13, webbed: true, patagiumUp: true, juvenile: 0.3,
    // (the wing, 2026-10-24, as the pelican's: the shoulder inside the body (it stood on top of the back, 3 cm out of
    // it); the hand closed and pointed with two small slots at its tip, as the photos measure (the ten primaries were
    // fanned 78 deg, every pair apart); the layers over a fixed height; the tertials over the humerus; a leading edge)
    wing: { primaries: 10, secondaries: 18, tertials: 6, chord: 0.40, pmax: 0.88, pin: 0.38, pout: 0.94, fanOut: -60, fanKnee: [0.5, -34], fingers: 1, slot: 0.15, pw: 0.16, pwTaper: 0.35,
      stackNorm: true, tertialS: [0.97, 0.12], tertialA: [-26, 7], edge: [0.016, 0.008, 0.004], betaH: -18, betaF: 16, betaM: -10, fh: 1.2 },
    stroke: { amp: 80, mean: 6, down: 0.55, flex: 0.3, sweep: 10, lag: 12, glide: 4, glideFlex: 0.22 },
    pattern: 7, sheen: 0, colors: ['#f2f2ee', '#50575f', '#1b1b1e', '#f4f4f0', '#8a7a68', '#4f4438', '#e2a291', '#e8b52a'],
  },
  heermann: {
    perch: { pitch: 10, tail: 8 },
    // Heermann's gull (Larus heermanni), the autumn visitor from the Gulf of California: L 46-53 cm, span 125-130 cm,
    // 0.37-0.64 kg; wing 340-380 mm (Pyle); dark grey, the head mottled in non-breeding plumage, black tail with a white
    // tip, the red bill tipped black, black legs
    name: "Heermann's gull", L: 0.49, span: 1.27, wingLen: 0.36, tailLen: 0.14, tailN: 12, tailW: 0.034, tailRound: 0.05, tailFan: 70,
    body: [0.2, 0.105, 0.1], head: 0.03, neck: [0.05, 0.028], neckPose: [0.038, 0.07], neckAngle: 30, bill: [0.045, 0.014, 0.011, 0.15], eye: 0.0048,
    leg: [0.055, 0.052, 0.048, 0.0045], shoulder: [0.042, 0.023, 0.028], standH: 0.105, webbed: true, patagiumUp: true, juvenile: 0.25,
    // (the wing, 2026-10-24: as the western gull's)
    wing: { primaries: 10, secondaries: 17, tertials: 6, chord: 0.38, pmax: 0.88, pin: 0.38, pout: 0.94, fanOut: -60, fanKnee: [0.5, -34], fingers: 1, slot: 0.12, pw: 0.16, pwTaper: 0.35,
      stackNorm: true, tertialS: [0.97, 0.12], tertialA: [-26, 7], edge: [0.014, 0.007, 0.0035], betaH: -18, betaF: 16, betaM: -10, fh: 1.2 },
    stroke: { amp: 82, mean: 6, down: 0.55, flex: 0.32, sweep: 10, lag: 12, glide: 4, glideFlex: 0.22 },
    pattern: 11, sheen: 0, colors: ['#6a6d72', '#3a3c40', '#1a1a1c', '#8d8882', '#4a3e34', '#33291f', '#1c1c1c', '#d0402c'],
  },
  pelican: {
    perch: { pitch: 26, tail: 0 },
    // brown pelican (Pelecanus occidentalis californicus): L 100-137 cm, span ~200 cm, 2-5 kg (californicus the largest,
    // ~3.5 kg); culmen 280-350 mm; 30-odd secondaries on a long arm; the adult's white head and neck after breeding, silver
    // upperparts, dark belly, black primaries, the grey bill's orange hook; the first-year bird brown with a white belly
    // (photo site 26)
    name: 'brown pelican', L: 1.2, span: 2.03, wingLen: 0.52, tailLen: 0.14, tailN: 20, tailW: 0.034, tailRound: 0.25, tailFan: 80,
    body: [0.42, 0.24, 0.22], head: 0.052, neck: [0.36, 0.05], neckPose: [0.14, 0.42], neckAngle: 62, bill: [0.31, 0.05, 0.055, 0.1], eye: 0.0068,
    leg: [0.08, 0.08, 0.11, 0.009], shoulder: [0.1, 0.06, 0.06], standH: 0.2, webbed: true, patagiumUp: true, juvenile: 0.35, pouch: 1,
    // (the wing, 2026-10-24, the director: 'ragged / disconnected from some angles': the shoulder inside the body (it
    // stood 3 cm above its back); the primaries' inner five closed and the outer five broad fingers (gap / width ~0.5 at
    // their tips, as the photos measure: they were ten sticks fanned 72 deg); the 28 secondaries' layers spread over
    // 6 mm (they stacked 6.5 cm, over their own coverts); the tertials over the whole humerus, meeting the inner
    // secondaries at the elbow (a wedge was open there); a leading edge 4.4 cm thick at the shoulder tapering to 1 cm,
    // so edge-on it reads as a wing, not a hairline)
    wing: { primaries: 10, secondaries: 28, tertials: 7, chord: 0.55, pmax: 0.7, pin: 0.45, pout: 0.75, fanOut: -50, fanKnee: [0.5556, -22], fingers: 5, slot: 0.25, pw: 0.16, pwTaper: 0.3,
      stackNorm: true, tertialS: [0.97, 0.12], tertialA: [-17, 10], edge: [0.022, 0.011, 0.005], betaH: -15, betaF: 10, betaM: -8, fh: 1.35 },
    stroke: { amp: 70, mean: 0, down: 0.55, flex: 0.2, sweep: 8, lag: 10, glide: -2, glideFlex: 0.12 },
    pattern: 8, sheen: 0, colors: ['#9a958c', '#4a433d', '#ece6d2', '#1c1b1a', '#6a6058', '#e6e0d4', '#2e2e2c', '#8f8b84'],
  },
  cormorant: {
    perch: { pitch: 55, tail: -22 },
    // double-crested cormorant (Nannopterum auritum): L 70-90 cm, span 114-123 cm, 1.2-2.5 kg; wing 290-340 mm, the
    // stiff 14-feather tail (it props the upright bird), the hooked bill; black with bronze scaled upperparts and the
    // orange throat (photo site 28); the young brown with a pale breast; legs set far back
    name: 'double-crested cormorant', L: 0.8, span: 1.2, wingLen: 0.31, tailLen: 0.15, tailN: 14, tailW: 0.022, tailRound: 0.3, tailFan: 60,
    body: [0.33, 0.14, 0.14], head: 0.034, neck: [0.2, 0.028], neckPose: [0.1, 0.22], neckAngle: 55, bill: [0.065, 0.016, 0.012, 0.4], eye: 0.005,
    leg: [0.06, 0.065, 0.085, 0.006], shoulder: [0.07, 0.032, 0.037], standH: 0.13, webbed: true, patagiumUp: true, juvenile: 0.3,
    // (the wing, 2026-10-24, as the pelican's: the shoulder inside the body; the inner primaries closed and three broad
    // fingers, as the photos measure (all ten were fanned 68 deg); the layers, the tertials, a leading edge)
    wing: { primaries: 10, secondaries: 18, tertials: 5, chord: 0.6, pmax: 0.7, pin: 0.5, pout: 0.7, fanOut: -52, fanKnee: [0.5556, -24], fingers: 4, slot: 0.2, pw: 0.17, pwTaper: 0.3,
      stackNorm: true, tertialS: [0.97, 0.12], tertialA: [-26, 5], edge: [0.014, 0.007, 0.0035], betaH: -20, betaF: 14, betaM: -6, fh: 1.2 },
    stroke: { amp: 85, mean: 4, down: 0.55, flex: 0.25, sweep: 10, lag: 12, glide: 2, glideFlex: 0.1 },
    pattern: 9, sheen: 1, colors: ['#1d1c1a', '#4a4434', '#e3982c', '#b9a585', '#5a4c3a', '#121212', '#1a1a1a', '#3a3832'],
  },
  pigeon: {
    perch: { pitch: 12, tail: 6 },
    // rock pigeon (Columba livia, feral): L 29-37 cm, span 50-67 cm, 265-380 g; wing 210-235 mm (Pyle); blue-grey with
    // two black wing bars, the iridescent neck, the white rump and the tail's dark band, red legs, the white cere; feral
    // morphs by seed (blue-bar, checker, dark, red, white)
    name: 'rock pigeon', L: 0.32, span: 0.64, wingLen: 0.22, tailLen: 0.12, tailN: 12, tailW: 0.026, tailRound: 0.15, tailFan: 90,
    body: [0.13, 0.085, 0.085], head: 0.022, neck: [0.03, 0.022], neckPose: [0.03, 0.045], neckAngle: 45, bill: [0.018, 0.006, 0.006, 0.12], eye: 0.0045,
    leg: [0.03, 0.03, 0.035, 0.0035], shoulder: [0.03, 0.019, 0.022], standH: 0.055, patagiumUp: true,
    // (the wing, 2026-10-24, as the gulls': the shoulder inside the body; the hand closed and pointed (all ten were
    // fanned 72 deg); the layers, the tertials, a leading edge)
    wing: { primaries: 10, secondaries: 12, tertials: 4, chord: 0.55, pmax: 0.8, pin: 0.5, pout: 0.85, fanOut: -60, fanKnee: [0.5, -34], fingers: 0, slot: 0, pw: 0.17, pwTaper: 0.35,
      stackNorm: true, tertialS: [0.97, 0.12], tertialA: [-29, 3], edge: [0.011, 0.005, 0.0025], betaH: -22, betaF: 15, betaM: -10, fh: 1.15 },
    stroke: { amp: 110, mean: 10, down: 0.55, flex: 0.45, sweep: 14, lag: 16, glide: 15, glideFlex: 0.2 },
    pattern: 10, sheen: 0, colors: ['#8a929e', '#6a727e', '#a4abb5', '#26262a', '#c4c8cc', '#4c5058', '#b04a44', '#2a2828'],
  },
};
void DEG;
